-- Revisión de seguridad y rendimiento (asesor de Supabase)
-- Índice para buscar los celulares de un usuario (clave foránea sin índice)
create index if not exists fcm_tokens_user_id_idx on public.fcm_tokens (user_id);
-- Funciones de disparador: solo las usa la base de datos, no deben llamarse por la API
revoke execute on function public._caja_sin_duplicados() from public, anon, authenticated;
revoke execute on function public._notificar_intento() from public, anon, authenticated;
