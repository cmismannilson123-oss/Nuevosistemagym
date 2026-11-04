-- Cola de avisos (push_pendientes): se guardan los últimos 7 días.
-- El reintento automático solo usa avisos de las últimas 3 horas y la app Android
-- evita duplicados con el número de cada aviso (nunca se reutiliza), así que lo
-- más viejo ya no sirve. La limpieza corre todos los días a las 03:10 (UTC).
--
-- APLICADA en producción el 2026-11-04 (desde el SQL Editor de Supabase).
-- Se borraron unos 1.000 avisos antiguos; quedaron 339.

select cron.schedule(
  'limpiar-push-pendientes',
  '10 3 * * *',
  $$ delete from public.push_pendientes where creado_en < now() - interval '7 days' $$
);

delete from public.push_pendientes where creado_en < now() - interval '7 days';
