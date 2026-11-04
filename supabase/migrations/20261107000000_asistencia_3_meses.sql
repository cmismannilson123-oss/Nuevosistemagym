-- Historial de asistencia: se guardan los últimos 3 meses (antes eran 2).
-- La limpieza corre todos los días a las 03:00 (UTC) y usa la fecha de Lima.
-- Solo compara fechas con formato AAAA-MM-DD, que es el que guarda la app.
--
-- APLICADA en producción el 2026-11-04 (desde el SQL Editor de Supabase).

select cron.schedule(
  'limpiar-historial-asistencia',
  '0 3 * * *',
  $$ delete from public.historial_asistencia
     where fecha ~ '^\d{4}-\d{2}-\d{2}$'
       and fecha < to_char((now() at time zone 'America/Lima')::date - interval '3 months', 'YYYY-MM-DD') $$
);

-- Limpieza única: 89 registros de junio y julio de 2026 guardados por una versión
-- antigua con fecha en otro formato (ej. 22/6/2026). Por ese formato la limpieza
-- diaria nunca los borraba. Todos tienen más de 3 meses.
delete from public.historial_asistencia
where fecha ~ '^\d{1,2}/\d{1,2}/2026$'
  and id <= 1508;
