-- Quitar la función de fotos de la portada (ya no la usa la web desde la v187).
-- Se borran sus funciones, sus ajustes guardados y su carpeta de almacenamiento.
-- Las definiciones originales siguen en 20261103000000_fondo_portada.sql y
-- 20261104000000_fondo_fotos.sql por si alguna vez se quiere recuperar.
--
-- APLICADA en producción el 2026-11-04 (desde el SQL Editor de Supabase).
-- La carpeta fondo-portada y sus 49 fotos se borraron desde Storage el mismo día.

-- 1) Funciones de lectura y escritura de fotos
drop function if exists public.admin_set_fondo_fotos(jsonb);
drop function if exists public.admin_set_fondo_portada(text);
drop function if exists public.fondo_fotos_lista();
drop function if exists public.fondo_portada_url();

-- 2) Ajustes guardados de las fotos
delete from public.admin_config where clave in ('fondo_fotos', 'fondo_portada_url');

-- 3) Permisos de la carpeta de fotos (la carpeta y sus archivos se borran aparte,
--    desde el almacenamiento, porque Supabase no deja borrar archivos por SQL)
drop policy if exists "fondo portada lectura" on storage.objects;
drop policy if exists "fondo portada subir personal" on storage.objects;
drop policy if exists "fondo portada borrar personal" on storage.objects;
