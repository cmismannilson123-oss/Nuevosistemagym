-- ============================================================
-- TOKENS FCM DE LA APP ANDROID DEL ADMINISTRADOR
-- La app nativa (APK) registra su token de Firebase aquí. cy-push envía los
-- avisos de ingreso y de intentos a estos celulares con prioridad alta, así
-- llegan con la pantalla apagada y la app nativa los lee en voz alta.
-- ============================================================
create table if not exists public.fcm_tokens (
  token      text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  dispositivo text,
  actualizado timestamptz not null default now()
);
alter table public.fcm_tokens enable row level security;
create policy "Staff gestiona sus tokens FCM" on public.fcm_tokens
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.es_staff()))
  with check (user_id = (select auth.uid()) and (select public.es_staff()));

-- Guarda (o renueva) el token del celular que está usando el panel
create or replace function public.guardar_fcm_token(p_token text, p_dispositivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_staff() or coalesce(length(p_token), 0) < 20 then
    raise exception 'no autorizado' using errcode = '42501';
  end if;
  insert into public.fcm_tokens (token, user_id, dispositivo, actualizado)
  values (p_token, auth.uid(), left(coalesce(p_dispositivo, ''), 160), now())
  on conflict (token) do update set user_id = excluded.user_id, actualizado = now();
end;
$$;
revoke all on function public.guardar_fcm_token(text, text) from public;
grant execute on function public.guardar_fcm_token(text, text) to authenticated;
