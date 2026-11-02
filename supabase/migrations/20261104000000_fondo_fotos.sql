-- Varias fotos de fondo (máximo 8) para la portada y la pantalla de galería.
-- La lista se guarda como un solo texto JSON en admin_config (clave 'fondo_fotos').
-- Cada foto tiene dos tamaños: g = grande (1600 px), t = miniatura (640 px).

-- Lectura pública: la portada pide la lista
create or replace function public.fondo_fotos_lista()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select valor::jsonb from public.admin_config where clave = 'fondo_fotos'), '[]'::jsonb);
$$;
revoke all on function public.fondo_fotos_lista() from public;
grant execute on function public.fondo_fotos_lista() to anon, authenticated;

-- Escritura: solo personal. Lista vacía = quitar todas (vuelve la foto por defecto)
create or replace function public.admin_set_fondo_fotos(p_fotos jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  f jsonb;
begin
  if not public.es_staff() then
    raise exception 'solo el personal puede cambiar las fotos' using errcode = '42501';
  end if;
  if jsonb_typeof(p_fotos) <> 'array' then
    raise exception 'lista de fotos no válida';
  end if;
  if jsonb_array_length(p_fotos) > 8 then
    raise exception 'máximo 8 fotos';
  end if;
  for f in select * from jsonb_array_elements(p_fotos) loop
    if coalesce(f->>'g', '') !~ '^https://.+/storage/v1/object/public/fondo-portada/'
       or coalesce(f->>'t', '') !~ '^https://.+/storage/v1/object/public/fondo-portada/' then
      raise exception 'foto no válida';
    end if;
  end loop;
  if jsonb_array_length(p_fotos) = 0 then
    delete from public.admin_config where clave = 'fondo_fotos';
  else
    insert into public.admin_config (clave, valor) values ('fondo_fotos', p_fotos::text)
    on conflict (clave) do update set valor = excluded.valor;
  end if;
end;
$$;
revoke all on function public.admin_set_fondo_fotos(jsonb) from public, anon;
grant execute on function public.admin_set_fondo_fotos(jsonb) to authenticated;
