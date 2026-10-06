-- ============================================================
-- SEGURIDAD: login real (Supabase Auth) + reglas RLS
-- ============================================================
-- Antes: socios, historial_caja e historial_asistencia tenían una regla
-- "Acceso total (temporal)" que dejaba a CUALQUIERA con la clave pública
-- leer, modificar y borrar todo. Las funciones admin_* se protegían con
-- una clave ("gym123") que estaba escrita dentro de gym.html.
--
-- Ahora:
--   * Solo los usuarios de Supabase Auth que estén en la tabla public.staff
--     pueden leer/escribir socios, caja y asistencia, y usar las funciones
--     admin_*.
--   * La pantalla pública del QR solo puede usar funciones puntuales:
--       consultar_socio_qr(telefono, dni)      -> datos mínimos de UN socio
--       registrar_asistencia_qr(telefono, dni) -> marca asistencia
--       registrar_prospecto_qr(...)            -> pre-inscripción (ya existía)
--       premio_activo_qr()                     -> promoción vigente (ya existía)
--   * Los avisos de ingreso a ntfy los manda la base de datos (canal secreto).
--
-- IMPORTANTE: aplicar esta migración junto con la nueva versión de gym.html
-- (la versión vieja deja de funcionar en cuanto se aplica).
-- ============================================================

begin;

-- ---------- 1. Lista de personal autorizado ----------
create table if not exists public.staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nombre     text,
  created_at timestamptz not null default now()
);
alter table public.staff enable row level security;
-- Sin reglas: nadie la lee ni la modifica desde la app. Se administra
-- desde el panel de Supabase (SQL editor).

create or replace function public.es_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = (select auth.uid()));
$$;
revoke all on function public.es_staff() from public, anon;
grant execute on function public.es_staff() to authenticated;

-- ---------- 2. Cerrar las tablas ----------
drop policy if exists "Acceso total socios (temporal)" on public.socios;
drop policy if exists "Acceso total historial_caja (temporal)" on public.historial_caja;
drop policy if exists "Acceso total historial_asistencia (temporal)" on public.historial_asistencia;

alter table public.socios enable row level security;
alter table public.historial_caja enable row level security;
alter table public.historial_asistencia enable row level security;

create policy "Staff gestiona socios" on public.socios
  for all to authenticated
  using ((select public.es_staff())) with check ((select public.es_staff()));

create policy "Staff gestiona caja" on public.historial_caja
  for all to authenticated
  using ((select public.es_staff())) with check ((select public.es_staff()));

create policy "Staff gestiona asistencia" on public.historial_asistencia
  for all to authenticated
  using ((select public.es_staff())) with check ((select public.es_staff()));

-- ---------- 3. Pantalla pública del QR: teléfono + DNI ----------
-- Antes bastaba un número de teléfono para ver nombre, DNI y deuda de un socio
-- (y bastaba un DNI para marcarle asistencia a otro). Ahora se piden los dos
-- datos, y tras 8 intentos fallidos con un mismo teléfono se bloquea 15 minutos.

create table if not exists public.qr_intentos (
  id         bigint generated always as identity primary key,
  telefono   text not null,
  created_at timestamptz not null default now()
);
create index if not exists qr_intentos_tel_fecha on public.qr_intentos (telefono, created_at);
alter table public.qr_intentos enable row level security;
-- Sin reglas: solo la usan las funciones de abajo.

-- Busca al socio con ese teléfono Y ese DNI. Devuelve:
--   {"bloqueado": true}  si hubo demasiados intentos fallidos
--   null                 si no coincide
--   el socio (datos mínimos) si coincide
create or replace function public._socio_qr(p_telefono text, p_dni text)
returns public.socios
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tel text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_dni text := regexp_replace(coalesce(p_dni, ''), '\D', '', 'g');
  v public.socios;
begin
  if v_tel !~ '^[0-9]{6,15}$' or v_dni !~ '^[0-9]{6,12}$' then
    return null;
  end if;
  select * into v from public.socios where telefono = v_tel and dni = v_dni;
  if not found then
    insert into public.qr_intentos (telefono) values (v_tel);
    delete from public.qr_intentos where created_at < now() - interval '1 day';
    perform pg_sleep(0.5);
    return null;
  end if;
  return v;
end;
$$;
revoke all on function public._socio_qr(text, text) from public, anon, authenticated;

create or replace function public._qr_bloqueado(p_telefono text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) >= 8 from public.qr_intentos
   where telefono = regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g')
     and created_at > now() - interval '15 minutes';
$$;
revoke all on function public._qr_bloqueado(text) from public, anon, authenticated;

create or replace function public.consultar_socio_qr(p_telefono text, p_dni text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v public.socios;
begin
  if public._qr_bloqueado(p_telefono) then
    return jsonb_build_object('bloqueado', true);
  end if;
  v := public._socio_qr(p_telefono, p_dni);
  if v.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'nombre', v.nombre, 'tipo_memb', v.tipo_memb,
    'dias_restantes', v.dias_restantes, 'dias_totales', v.dias_totales,
    'fecha_fin', v.fecha_fin, 'inicio', v.inicio,
    'deuda', v.deuda, 'fecha_deuda', v.fecha_deuda);
end;
$$;
revoke all on function public.consultar_socio_qr(text, text) from public;
grant execute on function public.consultar_socio_qr(text, text) to anon, authenticated;

create or replace function public.registrar_asistencia_qr(p_telefono text, p_dni text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v public.socios;
begin
  if public._qr_bloqueado(p_telefono) then
    return jsonb_build_object('ok', false, 'motivo', 'BLOQUEADO');
  end if;
  v := public._socio_qr(p_telefono, p_dni);
  if v.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'NO_ENCONTRADO');
  end if;
  return public.registrar_asistencia_publica(v.dni);
end;
$$;
revoke all on function public.registrar_asistencia_qr(text, text) from public;
grant execute on function public.registrar_asistencia_qr(text, text) to anon, authenticated;

-- La función vieja (solo DNI) ya no se puede llamar desde afuera; la usa
-- registrar_asistencia_qr por dentro.
revoke all on function public.registrar_asistencia_publica(text) from public, anon, authenticated;

-- ---------- 4. Funciones de administración: sesión de staff en vez de clave ----------
drop function if exists public.admin_eliminar_premio_qr(text, bigint);
drop function if exists public.admin_guardar_premio_qr(text, bigint, text, text, text, timestamptz, timestamptz, boolean);
drop function if exists public.admin_listar_premios_qr(text);
drop function if exists public.borrar_prospecto_qr(text, text);
drop function if exists public.listar_prospectos_qr(text);
drop function if exists public._clave_admin_ok(text);

create function public.admin_eliminar_premio_qr(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;
  delete from public.premios_qr where id = p_id;
end;
$$;

create function public.admin_guardar_premio_qr(
  p_id bigint, p_titulo text, p_descripcion text, p_estilo text,
  p_inicio timestamptz, p_fin timestamptz, p_activo boolean)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_id bigint;
begin
  if not public.es_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;
  if p_id is null then
    insert into public.premios_qr (titulo, descripcion, estilo, inicio, fin, activo)
    values (btrim(p_titulo), nullif(btrim(coalesce(p_descripcion,'')),''), coalesce(p_estilo,'fuego'),
            coalesce(p_inicio, now()), p_fin, coalesce(p_activo, true))
    returning id into v_id;
  else
    update public.premios_qr
       set titulo = btrim(p_titulo),
           descripcion = nullif(btrim(coalesce(p_descripcion,'')),''),
           estilo = coalesce(p_estilo, estilo),
           inicio = coalesce(p_inicio, inicio),
           fin = p_fin,
           activo = coalesce(p_activo, activo)
     where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create function public.admin_listar_premios_qr()
returns table(id bigint, titulo text, descripcion text, estilo text, inicio timestamptz, fin timestamptz,
              activo boolean, ganados integer, created_at timestamptz, estado text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;
  return query
    select p.id, p.titulo, p.descripcion, p.estilo, p.inicio, p.fin, p.activo, p.ganados, p.created_at,
           case when not p.activo then 'pausado'
                when now() >= p.fin then 'vencido'
                when now() < p.inicio then 'programado'
                else 'activo' end
      from public.premios_qr p
     order by p.created_at desc;
end;
$$;

create function public.borrar_prospecto_qr(p_dni text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;
  delete from public.prospectos_qr where dni = p_dni;
end;
$$;

create function public.listar_prospectos_qr()
returns table(id bigint, dni text, nombre text, whatsapp text, premio text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;
  return query
    select p.id, p.dni, p.nombre, p.whatsapp, p.premio, p.created_at
      from public.prospectos_qr p
     order by p.created_at desc;
end;
$$;

revoke all on function public.admin_eliminar_premio_qr(bigint) from public, anon;
revoke all on function public.admin_guardar_premio_qr(bigint, text, text, text, timestamptz, timestamptz, boolean) from public, anon;
revoke all on function public.admin_listar_premios_qr() from public, anon;
revoke all on function public.borrar_prospecto_qr(text) from public, anon;
revoke all on function public.listar_prospectos_qr() from public, anon;
grant execute on function public.admin_eliminar_premio_qr(bigint) to authenticated;
grant execute on function public.admin_guardar_premio_qr(bigint, text, text, text, timestamptz, timestamptz, boolean) to authenticated;
grant execute on function public.admin_listar_premios_qr() to authenticated;
grant execute on function public.borrar_prospecto_qr(text) to authenticated;
grant execute on function public.listar_prospectos_qr() to authenticated;

-- ---------- 5. Avisos menores del linter de Supabase ----------
alter function public._premio_defecto() set search_path = '';
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- ---------- 6. Avisos al celular (ntfy) desde el servidor ----------
-- Antes el nombre del canal de ntfy estaba escrito en gym.html, así que
-- cualquiera podía suscribirse y ver quién entra al gimnasio. Ahora el canal
-- es aleatorio, se guarda en admin_config (que nadie puede leer desde la app)
-- y el aviso lo manda la base de datos cada vez que se registra una asistencia.
create extension if not exists pg_net;

insert into public.admin_config (clave, valor)
values ('ntfy_topic', 'cy-gym-' || replace(gen_random_uuid()::text, '-', ''))
on conflict (clave) do nothing;

create or replace function public._notificar_asistencia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_topic text;
  s record;
  v_fecha text := '^(\d{4})-(\d{2})-(\d{2})$';
begin
  select valor into v_topic from public.admin_config where clave = 'ntfy_topic';
  if v_topic is null then
    return new;
  end if;

  select tipo_memb, inicio, fecha_fin, dias_restantes into s
    from public.socios where dni = new.dni limit 1;

  -- La asistencia se guarda ANTES de descontar el día, por eso "- 1".
  perform net.http_post(
    url := 'https://ntfy.sh/',
    body := jsonb_build_object(
      'topic', v_topic,
      'title', '🏋️ C&Y Fitness Gym',
      'priority', 4,
      'tags', jsonb_build_array('dumbbell'),
      'message', format(E'Ingreso registrado (%s): %s.\nPlan: %s.\nInicio: %s | Vence: %s.\nRestan: %s asistencias.',
        coalesce(new.metodo, 'Manual'), new.nombre, coalesce(s.tipo_memb, '-'),
        coalesce(regexp_replace(s.inicio, v_fecha, '\3/\2/\1'), '--/--/----'),
        coalesce(regexp_replace(s.fecha_fin, v_fecha, '\3/\2/\1'), '--/--/----'),
        greatest(0, coalesce(s.dias_restantes, 0) - 1))
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  -- Un problema con el aviso nunca debe impedir registrar la asistencia
  return new;
end;
$$;
revoke all on function public._notificar_asistencia() from public, anon, authenticated;

drop trigger if exists tr_notificar_asistencia on public.historial_asistencia;
create trigger tr_notificar_asistencia
  after insert on public.historial_asistencia
  for each row execute function public._notificar_asistencia();

commit;
