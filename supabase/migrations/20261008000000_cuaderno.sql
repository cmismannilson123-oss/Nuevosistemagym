-- ============================================================
-- CUADERNO DE CAJA (panel del personal)
-- Una sola consulta devuelve los movimientos de un rango de fechas (hora
-- de Lima), ya ordenados. Así el cuaderno carga por mes, rápido aunque el
-- internet sea lento, y no depende del límite de 1000 filas por consulta.
--
-- Inscripciones: se usa el monto que se registró en caja el día de la
-- inscripción (lo que realmente se pagó ese día). Antes se calculaba con el
-- precio actual del socio, que cambia al renovar, y el monto antiguo
-- aparecía modificado. Si un socio no tiene esa fila (socios anteriores al
-- 14/08/2026, cuando empezó la caja en la nube), se calcula como antes.
-- Solo para el personal (tabla staff).
-- ============================================================
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
        on h.dni = s.dni and h.dni <> '' and h.concepto = 'Inscripción inicial'
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
  )
  select * from inscripciones
  union all
  select * from movimientos
  order by 1 desc;
end;
$$;
revoke all on function public.cuaderno_caja(date, date) from public, anon;
grant execute on function public.cuaderno_caja(date, date) to authenticated;

-- Búsquedas por fecha y por socio en la caja
create index if not exists historial_caja_fecha_idx on public.historial_caja (fecha_movimiento desc);
create index if not exists historial_caja_dni_idx on public.historial_caja (dni);

-- Identificador que pone el celular a cada movimiento. Si se corta el
-- internet, el movimiento queda en cola y se reintenta; con este id el
-- reintento nunca lo duplica.
alter table public.historial_caja add column if not exists cliente_id uuid;
create unique index if not exists historial_caja_cliente_id_key on public.historial_caja (cliente_id);
