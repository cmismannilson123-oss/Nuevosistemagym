begin;
create table if not exists public.staff (
user_id    uuid primary key references auth.users(id) on delete cascade,
nombre     text,
created_at timestamptz not null default now()
);
alter table public.staff enable row level security;
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
create table if not exists public.qr_intentos (
id         bigint generated always as identity primary key,
telefono   text not null,
created_at timestamptz not null default now()
);
create index if not exists qr_intentos_tel_fecha on public.qr_intentos (telefono, created_at);
alter table public.qr_intentos enable row level security;
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
revoke all on function public.registrar_asistencia_publica(text) from public, anon, authenticated;
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
alter function public._premio_defecto() set search_path = '';
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
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
return new;
end;
$$;
revoke all on function public._notificar_asistencia() from public, anon, authenticated;
drop trigger if exists tr_notificar_asistencia on public.historial_asistencia;
create trigger tr_notificar_asistencia
after insert on public.historial_asistencia
for each row execute function public._notificar_asistencia();
insert into public.staff (user_id, nombre) select id, 'Administrador' from auth.users where lower(email) = 'fitnessgym21@gmail.com' on conflict (user_id) do nothing;
select set_config('prueba.tel', telefono, true), set_config('prueba.dni', dni, true), set_config('prueba.total', (select count(*) from public.socios)::text, true) from public.socios where telefono ~ '^[0-9]{6,15}$' and dni ~ '^[0-9]{6,12}$' limit 1;
set local role anon;
do $$ begin
if (select count(*) from public.socios) + (select count(*) from public.historial_caja) + (select count(*) from public.historial_asistencia) <> 0 then raise exception 'FALLO 1: el publico todavia ve datos'; end if;
if (public.consultar_socio_qr(current_setting('prueba.tel'), current_setting('prueba.dni')) ->> 'nombre') is null then raise exception 'FALLO 2: consulta QR con datos correctos'; end if;
if public.consultar_socio_qr(current_setting('prueba.tel'), '11111111') is not null then raise exception 'FALLO 3: consulta QR con DNI malo'; end if;
begin perform public.registrar_asistencia_publica('1'); raise exception 'FALLO 4: funcion vieja sigue publica'; exception when insufficient_privilege then null; end;
begin perform public.listar_prospectos_qr(); raise exception 'FALLO 5: prospectos publicos'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$ begin if (select count(*) from public.socios) <> 0 then raise exception 'FALLO 6: usuario sin permiso ve socios'; end if; end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ed41f1ce-fdc4-4536-802e-6c5c85950d58","role":"authenticated"}', true);
do $$ begin
if not public.es_staff() then raise exception 'FALLO 7: fitnessgym21 no quedo como administrador'; end if;
if (select count(*) from public.socios) <> current_setting('prueba.total')::bigint then raise exception 'FALLO 8: el administrador no ve todos los socios'; end if;
perform count(*) from public.admin_listar_premios_qr();
perform count(*) from public.listar_prospectos_qr();
end $$;
reset role;
delete from public.qr_intentos;
commit;
select 'TODO LISTO' as estado, (select valor from public.admin_config where clave = 'ntfy_topic') as canal_ntfy_nuevo, (select count(*) from public.socios) as socios;