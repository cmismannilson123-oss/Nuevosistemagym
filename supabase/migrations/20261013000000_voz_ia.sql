-- ============================================================
-- VOZ NATURAL (IA) GRATIS con Google Gemini TTS
-- * Bucket privado "voz": cada audio se genera una vez y se reutiliza.
-- * Tarea nocturna: con el cupo gratuito que sobra del día (antes de que
--   Google lo reinicie, ~2 a. m. de Lima), prepara las bienvenidas de los
--   socios que más vienen. Corre de 10:15 p. m. a 1:45 a. m. (hora de Lima).
-- La clave se configura como secreto de Edge Functions: GEMINI_API_KEY.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voz', 'voz', false, 4194304, array['audio/wav', 'audio/mpeg'])
on conflict (id) do update set allowed_mime_types = excluded.allowed_mime_types, file_size_limit = excluded.file_size_limit;

create or replace function public._precalentar_voz()
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
    url := 'https://ygbiqnbygjbrmwyttkku.supabase.co/functions/v1/cy-voz',
    body := jsonb_build_object('maximo', 4),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cy-secreto', v_secreto),
    timeout_milliseconds := 150000);
end;
$$;
revoke all on function public._precalentar_voz() from public, anon, authenticated;

select cron.schedule('cy-voz-precalentar', '15,45 3-6 * * *', 'select public._precalentar_voz()');

-- Ajuste: el cupo gratis de Google es de pocas frases nuevas al día y se
-- renueva ~2 a. m. (Lima). Se reparte así: 6 frases recién renovado el cupo
-- (primero avisos y anuncios fijos, luego bienvenidas de los socios más
-- frecuentes) y lo que sobre del día se usa por la noche.
create or replace function public._precalentar_voz(p_maximo int default 4)
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
    url := 'https://ygbiqnbygjbrmwyttkku.supabase.co/functions/v1/cy-voz',
    body := jsonb_build_object('maximo', p_maximo),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cy-secreto', v_secreto),
    timeout_milliseconds := 150000);
end;
$$;
revoke all on function public._precalentar_voz(int) from public, anon, authenticated;
select cron.unschedule('cy-voz-precalentar');
select cron.schedule('cy-voz-madrugada', '20,50 7 * * *', 'select public._precalentar_voz(2)');
select cron.schedule('cy-voz-madrugada-2', '20 8 * * *', 'select public._precalentar_voz(2)');
select cron.schedule('cy-voz-sobrante', '15,45 3-6 * * *', 'select public._precalentar_voz(4)');
