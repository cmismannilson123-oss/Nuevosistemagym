-- Fondo de la pantalla del socio (portada del QR), configurable desde el panel.
-- Lectura pública de la imagen; subir, cambiar o quitar solo el personal.

-- 1) Bucket público para las imágenes de fondo
insert into storage.buckets (id, name, public)
values ('fondo-portada', 'fondo-portada', true)
on conflict (id) do nothing;

-- 2) Permisos del almacenamiento: todos leen, solo el personal sube o borra
drop policy if exists "fondo portada lectura" on storage.objects;
create policy "fondo portada lectura" on storage.objects
  for select using (bucket_id = 'fondo-portada');

drop policy if exists "fondo portada subir personal" on storage.objects;
create policy "fondo portada subir personal" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fondo-portada' and public.es_staff());

drop policy if exists "fondo portada borrar personal" on storage.objects;
create policy "fondo portada borrar personal" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fondo-portada' and public.es_staff());

-- 3) Lectura: la portada pide la dirección actual (sin exponer admin_config)
create or replace function public.fondo_portada_url()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select valor from public.admin_config where clave = 'fondo_portada_url';
$$;
revoke all on function public.fondo_portada_url() from public;
grant execute on function public.fondo_portada_url() to anon, authenticated;

-- 4) Escritura: solo personal. p_url null = volver a la foto por defecto
create or replace function public.admin_set_fondo_portada(p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_staff() then
    raise exception 'solo el personal puede cambiar el fondo' using errcode = '42501';
  end if;
  if p_url is null then
    delete from public.admin_config where clave = 'fondo_portada_url';
  else
    insert into public.admin_config (clave, valor) values ('fondo_portada_url', p_url)
    on conflict (clave) do update set valor = excluded.valor;
  end if;
end;
$$;
revoke all on function public.admin_set_fondo_portada(text) from public, anon;
grant execute on function public.admin_set_fondo_portada(text) to authenticated;
