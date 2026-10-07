-- ============================================================
-- CAJA: cobros duplicados
-- 1. Respaldo en la base: si llega el MISMO cobro (mismo socio, concepto y
--    monto) menos de 60 segundos después de otro, no se guarda. Así varios
--    toques seguidos o dos celulares a la vez no duplican el dinero.
--    (El panel además pregunta antes de registrar una renovación que parece
--    repetida en los últimos 10 minutos.)
-- 2. "anulado": marca un movimiento como anulado sin borrarlo. El cuaderno
--    no lo suma. Se puede revertir: update ... set anulado = false.
-- ============================================================
alter table public.historial_caja add column if not exists anulado boolean not null default false;

create or replace function public._caja_sin_duplicados()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.monto_ingreso, 0) > 0 and coalesce(new.dni, '') <> '' and exists (
       select 1 from public.historial_caja h
        where h.dni = new.dni and h.concepto = new.concepto
          and h.monto_ingreso = new.monto_ingreso and not h.anulado
          and h.fecha_movimiento > coalesce(new.fecha_movimiento, now()) - interval '60 seconds'
          and h.fecha_movimiento <= coalesce(new.fecha_movimiento, now()) + interval '60 seconds') then
    return null;   -- mismo cobro repetido: se ignora
  end if;
  return new;
end;
$$;
create trigger tr_caja_sin_duplicados before insert on public.historial_caja
  for each row execute function public._caja_sin_duplicados();

-- El cuaderno no suma los movimientos anulados
create or replace function public.cuaderno_caja(p_desde date, p_hasta date)
returns table(
  fecha timestamptz, dni text, nombre text, plan text, concepto text,
  monto numeric, deuda numeric, inicia date
)
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
  with
  rango as (
    select (p_desde::timestamp at time zone 'America/Lima') as ini,
           ((p_hasta + 1)::timestamp at time zone 'America/Lima') as fin
  ),
  -- Fila de inscripción en caja que corresponde a cada socio (la más cercana
  -- a su fecha de creación; si se borró y se volvió a registrar, cuenta una)
  ins as (
    select distinct on (s.id)
           s.id as socio_id, h.fecha_movimiento, h.monto_ingreso, h.deuda_visual
      from public.socios s
      join public.historial_caja h
        on h.dni = s.dni and h.dni <> '' and h.concepto = 'Inscripción inicial' and not h.anulado
     order by s.id, abs(extract(epoch from h.fecha_movimiento - s.created_at))
  ),
  socios_rango as (
    select s.*, i.socio_id is not null as tiene_fila,
           i.fecha_movimiento as f_caja, i.monto_ingreso as m_caja, i.deuda_visual as d_caja
      from public.socios s
      left join ins i on i.socio_id = s.id, rango r
     where coalesce(i.fecha_movimiento, s.created_at) >= r.ini
       and coalesce(i.fecha_movimiento, s.created_at) <  r.fin
  ),
  inscripciones as (
    select coalesce(sr.f_caja, sr.created_at),
           sr.dni, sr.nombre, sr.tipo_memb, 'Inscripción inicial'::text,
           case when sr.tiene_fila then coalesce(sr.m_caja, 0)
                else greatest(coalesce(sr.precio, 0) - leg.deuda_al_momento, 0) end,
           case when sr.tiene_fila then coalesce(sr.d_caja, 0)
                else leg.deuda_al_momento end,
           case when sr.inicio ~ '^\d{4}-\d{2}-\d{2}'
                 and left(sr.inicio, 10)::date >
                     (coalesce(sr.f_caja, sr.created_at) at time zone 'America/Lima')::date
                then left(sr.inicio, 10)::date end
      from socios_rango sr
      -- Cálculo anterior (socios sin fila de inscripción en caja): deuda de hoy
      -- más lo que abonó después, sin pasar del precio
      cross join lateral (
        select least(greatest(
                 coalesce(nullif(regexp_replace(coalesce(sr.deuda, ''), '[^0-9.]', '', 'g'), '')::numeric, 0)
                 + coalesce((select sum(h.monto_ingreso) from public.historial_caja h
                              where h.dni = sr.dni
                                and not h.anulado
                                and (h.concepto like '%Canceló%' or h.concepto like '%Abono%')), 0),
                 0), coalesce(sr.precio, 0)) as deuda_al_momento
      ) leg
  ),
  movimientos as (
    select h.fecha_movimiento, h.dni, h.nombre, h.tipo_memb, h.concepto,
           h.monto_ingreso, coalesce(h.deuda_visual, 0), null::date
      from public.historial_caja h, rango r
     where h.fecha_movimiento >= r.ini and h.fecha_movimiento < r.fin
       and h.concepto <> 'Inscripción inicial'
       and coalesce(h.monto_ingreso, 0) > 0
       and not h.anulado
  )
  select * from inscripciones
  union all
  select * from movimientos
  order by 1 desc;
end;
$$;
revoke all on function public.cuaderno_caja(date, date) from public, anon;
grant execute on function public.cuaderno_caja(date, date) to authenticated;
