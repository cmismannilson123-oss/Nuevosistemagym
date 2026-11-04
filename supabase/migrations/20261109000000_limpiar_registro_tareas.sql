-- Registro de ejecuciones de las tareas programadas (cron.job_run_details):
-- se guardan los últimos 7 días. El reintento de avisos corre cada minuto y
-- generaba ~1.450 filas por día sin límite. La app no usa este registro; solo
-- sirve para revisar si una tarea falló. Limpieza diaria a las 03:20 (UTC).
--
-- APLICADA en producción el 2026-11-04 (desde el SQL Editor de Supabase).
-- Se borraron unos 26.500 registros antiguos; quedaron 10.164.

select cron.schedule(
  'limpiar-registro-tareas',
  '20 3 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '7 days' $$
);

delete from cron.job_run_details where end_time < now() - interval '7 days';
