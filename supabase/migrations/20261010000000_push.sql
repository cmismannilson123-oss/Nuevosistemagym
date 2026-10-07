-- ============================================================
-- NOTIFICACIONES PROPIAS (Web Push), sin depender de ntfy
--
-- * push_suscripciones: los celulares del personal que activaron los avisos.
-- * Al guardarse una asistencia, la base de datos llama a la Edge Function
--   "cy-push" (supabase/functions/cy-push), que arma el mensaje con el
--   estado del socio y lo envía a esos celulares.
-- * Las llaves VAPID y el secreto entre la base y la función se guardan en
--   admin_config (sin acceso desde la página). Se cargan aparte, NO en este
--   archivo:
--     insert into public.admin_config (clave, valor) values
--       ('vapid_publica', '...'), ('vapid_privada', '...'), ('push_secreto', '...');
-- * ntfy sigue funcionando en paralelo mientras se prueba; se apaga borrando
--   la clave 'ntfy_topic' de admin_config.
-- ============================================================

create table if not exists public.push_suscripciones (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid(),
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  dispositivo text,
  creado_en   timestamptz not null default now()
);
alter table public.push_suscripciones enable row level security;
create policy "Staff gestiona sus avisos" on public.push_suscripciones
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.es_staff()))
  with check (user_id = (select auth.uid()) and (select public.es_staff()));

-- Llama a la Edge Function (sin esperar respuesta: no frena el registro)
create or replace function public._enviar_push(p_evento jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_secreto text;
begin
  select valor into v_secreto from public.admin_config where clave = 'push_secreto';
  if v_secreto is null then return; end if;
  perform net.http_post(
    url := 'https://ygbiqnbygjbrmwyttkku.supabase.co/functions/v1/cy-push',
    body := p_evento,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cy-secreto', v_secreto),
    timeout_milliseconds := 8000);
exception when others then
  null;
end;
$$;
revoke all on function public._enviar_push(jsonb) from public, anon, authenticated;

-- Aviso de cada ingreso: push propio + ntfy (mientras exista ntfy_topic)
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
  perform public._enviar_push(jsonb_build_object(
    'tipo', 'ingreso', 'dni', new.dni, 'nombre', new.nombre, 'metodo', coalesce(new.metodo, 'Manual')));

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

-- Botón "Probar" del panel: manda un aviso de prueba a los celulares del personal
create or replace function public.probar_push()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_staff() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  perform public._enviar_push(jsonb_build_object('tipo', 'prueba', 'user_id', auth.uid()));
end;
$$;
revoke all on function public.probar_push() from public, anon;
grant execute on function public.probar_push() to authenticated;
