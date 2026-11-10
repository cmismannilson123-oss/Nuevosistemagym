-- ============================================================
-- ASISTENTE DE FITNESS (IA) PARA LOS SOCIOS
-- * La función cy-asistente (Edge Function) llama a esta función antes de
--   hablar con la IA. Aquí se decide si el socio puede usar el asistente:
--     1. Se verifica teléfono + DNI con el mismo control del QR (incluye el
--        bloqueo por intentos fallidos).
--     2. Se cuenta el uso del día: límite por socio y límite total del
--        gimnasio, para no agotar el cupo gratuito de la IA ni abusar.
-- * Solo la usa el servidor (service_role). La página NO puede llamarla.
-- * No se guarda el texto de las conversaciones, solo cuántos mensajes
--   envió cada socio por día.
-- ============================================================
create table if not exists public.asistente_uso (
  dni  text    not null,
  dia  date    not null,
  n    integer not null default 0,
  primary key (dni, dia)
);
alter table public.asistente_uso enable row level security;
-- Sin políticas: nadie lee ni escribe desde la página; solo la función de abajo.

create or replace function public.asistente_permitir(
  p_telefono text,
  p_dni text,
  p_limite_socio integer default 25,
  p_limite_global integer default 400
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.socios;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_global integer;
  v_n integer;
begin
  if public._qr_bloqueado(p_telefono) then
    return jsonb_build_object('ok', false, 'motivo', 'bloqueado');
  end if;

  v := public._socio_qr(p_telefono, p_dni);
  if v.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'no_socio');
  end if;

  select coalesce(sum(n), 0) into v_global from public.asistente_uso where dia = v_hoy;
  if v_global >= p_limite_global then
    return jsonb_build_object('ok', false, 'motivo', 'global');
  end if;

  -- Suma 1 al contador del día solo si todavía no llegó al límite
  insert into public.asistente_uso (dni, dia, n) values (v.dni, v_hoy, 1)
  on conflict (dni, dia) do update set n = public.asistente_uso.n + 1
    where public.asistente_uso.n < p_limite_socio
  returning n into v_n;

  if v_n is null then
    return jsonb_build_object('ok', false, 'motivo', 'limite');
  end if;

  delete from public.asistente_uso where dia < v_hoy - 35;
  return jsonb_build_object('ok', true, 'nombre', v.nombre, 'restantes', p_limite_socio - v_n);
end;
$$;

revoke all on function public.asistente_permitir(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.asistente_permitir(text, text, integer, integer) to service_role;
