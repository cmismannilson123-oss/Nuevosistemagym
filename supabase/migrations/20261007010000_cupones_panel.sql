-- ============================================================
-- PANEL DEL PERSONAL: cupones usados
-- Lista de cupones usados entre dos fechas (hora de Lima), con el nombre
-- y el plan del socio. Solo para el personal (tabla staff).
-- ============================================================
create or replace function public.listar_cupones_usados(p_desde date, p_hasta date)
returns table(id bigint, dni text, nombre text, plan text, tipo text, usado_en timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_staff() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return query
    select c.id, c.dni, s.nombre, s.tipo_memb, c.tipo, c.usado_en
      from public.cupones_uso c
      left join public.socios s on s.dni = c.dni
     where (c.usado_en at time zone 'America/Lima')::date between p_desde and p_hasta
     order by c.usado_en desc;
end;
$$;
revoke all on function public.listar_cupones_usados(date, date) from public, anon;
grant execute on function public.listar_cupones_usados(date, date) to authenticated;

-- Avisos en vivo al panel cuando un socio usa un cupón
alter publication supabase_realtime add table public.cupones_uso;
