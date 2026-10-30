-- Revisión de seguridad y rendimiento (avisos de Supabase, 30-oct-2026).
--
-- 1) Las funciones de disparador (trigger) no deben poder llamarse por la API.
--    Un trigger se ejecuta sin revisar EXECUTE en cada disparo; EXECUTE solo
--    hace falta para crearlo, así que quitarlo no rompe las reglas.
-- 2) Índices para claves foráneas sin índice (consultas de ventas y productos).
--
-- Las funciones del QR público que anon sí debe llamar NO se tocan.

revoke all on function public._guardia_registros() from public, anon, authenticated;
revoke all on function public._guardia_socios() from public, anon, authenticated;
revoke all on function public._bloqueo_tienda_asistencia() from public, anon, authenticated;

create index if not exists pagos_tienda_venta_id_idx on public.pagos_tienda (venta_id);
create index if not exists productos_categoria_idx on public.productos (categoria);
create index if not exists venta_items_producto_id_idx on public.venta_items (producto_id);
create index if not exists venta_items_venta_id_idx on public.venta_items (venta_id);
