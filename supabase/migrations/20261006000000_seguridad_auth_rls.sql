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
--       consultar_socio_qr(telefono)       -> datos mínimos de UN socio
--       registrar_asistencia_publica(dni)  -> marca asistencia (ya existía)
--       registrar_prospecto_qr(...)        -> pre-inscripción (ya existía)
--       premio_activo_qr()                 -> promoción vigente (ya existía)
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

-- ---------- 3. Consulta pública del QR (reemplaza el select directo a socios) ----------
-- Devuelve solo lo que la pantalla del socio necesita, y solo si el teléfono
-- corresponde a exactamente un socio (igual que el .single() que usaba la app).
create or replace function public.consultar_socio_qr(p_telefono text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tel text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_cant int;
  v jsonb;
begin
  if v_tel !~ '^[0-9]{6,15}$' then
    return null;
  end if;

  select count(*) into v_cant from public.socios where telefono = v_tel;
  if v_cant <> 1 then
    return null;
  end if;

  select jsonb_build_object(
           'dni', s.dni, 'nombre', s.nombre, 'tipo_memb', s.tipo_memb,
           'dias_restantes', s.dias_restantes, 'dias_totales', s.dias_totales,
           'fecha_fin', s.fecha_fin, 'inicio', s.inicio,
           'deuda', s.deuda, 'fecha_deuda', s.fecha_deuda)
    into v
    from public.socios s
   where s.telefono = v_tel;
  return v;
end;
$$;
revoke all on function public.consultar_socio_qr(text) from public;
grant execute on function public.consultar_socio_qr(text) to anon, authenticated;

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

commit;
