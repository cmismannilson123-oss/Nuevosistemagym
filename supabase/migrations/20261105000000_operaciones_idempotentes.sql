-- Evita cobros y ventas duplicados cuando se pierde la respuesta de la red.
-- Cada intento de venta/pago/abono lleva una clave; si la clave ya se procesó,
-- la función devuelve el resultado guardado y no vuelve a cobrar ni a vender.

create table if not exists public.operaciones_idempotentes (
  clave text primary key,
  resultado jsonb not null,
  creado_en timestamptz not null default now()
);
alter table public.operaciones_idempotentes enable row level security;
revoke all on public.operaciones_idempotentes from anon, authenticated;

-- 1) Venta
drop function if exists public.registrar_venta(jsonb, text, text, date);
create or replace function public.registrar_venta(p_items jsonb, p_metodo text, p_dni text default null, p_fecha_limite date default null, p_clave text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_dni text := nullif(regexp_replace(coalesce(p_dni, ''), '\D', '', 'g'), '');
  v_socio_nombre text;
  v_lineas integer;
  v_validas integer;
  v_total numeric(10,2);
  v_saldo numeric(10,2);
  v_estado text;
  v_vence date;
  v_id uuid;
  v_nombres text;
  v_sin_stock text;
  v_previo jsonb;
  v_res jsonb;
begin
  if not public.es_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;
  if p_clave is not null then
    perform pg_advisory_xact_lock(hashtext('venta:' || p_clave));
    select resultado into v_previo from public.operaciones_idempotentes where clave = 'venta:' || p_clave;
    if found then return v_previo; end if;
  end if;
  if p_metodo not in ('efectivo', 'yape_plin', 'fiado') then raise exception 'Método de pago no válido'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'La venta no tiene artículos'; end if;

  v_lineas := jsonb_array_length(p_items);
  if v_lineas < 1 or v_lineas > 30 then raise exception 'La venta debe tener entre 1 y 30 líneas'; end if;

  perform 1 from public.productos p
   where p.id in (select x.producto_id from jsonb_to_recordset(p_items) as x(producto_id uuid, cantidad integer))
   for update;

  select count(*), coalesce(sum(p.precio * x.cantidad), 0)
    into v_validas, v_total
  from jsonb_to_recordset(p_items) as x(producto_id uuid, cantidad integer)
  join public.productos p on p.id = x.producto_id and p.activo
  where x.cantidad between 1 and 50;

  if v_validas <> v_lineas then raise exception 'Hay artículos inexistentes, inactivos o con cantidad no válida'; end if;

  select p.nombre into v_sin_stock
    from (select x.producto_id, sum(x.cantidad) as total
            from jsonb_to_recordset(p_items) as x(producto_id uuid, cantidad integer)
           group by x.producto_id) pedido
    join public.productos p on p.id = pedido.producto_id
   where p.stock is not null and p.stock < pedido.total
   limit 1;
  if v_sin_stock is not null then
    raise exception 'Sin stock suficiente de %', v_sin_stock;
  end if;

  if v_dni is not null then
    select s.nombre into v_socio_nombre from public.socios s where s.dni = v_dni limit 1;
    if not found then raise exception 'Socio no encontrado'; end if;
  end if;

  if p_metodo = 'fiado' then
    if v_dni is null then raise exception 'Para fiar hay que indicar el socio'; end if;
    v_saldo := v_total;
    v_estado := 'pendiente';
    if v_total <= public._umbral_tienda() then
      v_vence := v_hoy + 1;
    else
      if p_fecha_limite is not null and p_fecha_limite <= v_hoy then
        raise exception 'La fecha límite debe ser posterior a hoy';
      end if;
      v_vence := p_fecha_limite;
    end if;
  else
    v_saldo := 0;
    v_estado := 'pagada';
    v_vence := null;
  end if;

  insert into public.ventas (dni, nombre_socio, total, saldo, metodo, estado, fecha, fecha_vencimiento)
  values (v_dni, v_socio_nombre, v_total, v_saldo, p_metodo, v_estado, v_hoy, v_vence)
  returning id into v_id;

  insert into public.venta_items (venta_id, producto_id, nombre, precio_unit, cantidad, subtotal)
  select v_id, p.id, p.nombre, p.precio, x.cantidad, p.precio * x.cantidad
  from jsonb_to_recordset(p_items) as x(producto_id uuid, cantidad integer)
  join public.productos p on p.id = x.producto_id;

  update public.productos p
     set stock = p.stock - pedido.total
    from (select x.producto_id, sum(x.cantidad) as total
            from jsonb_to_recordset(p_items) as x(producto_id uuid, cantidad integer)
           group by x.producto_id) pedido
   where p.id = pedido.producto_id and p.stock is not null;

  if v_estado = 'pagada' then
    select string_agg(i.cantidad || ' × ' || i.nombre, ', ' order by i.id)
      into v_nombres from public.venta_items i where i.venta_id = v_id;
    insert into public.historial_caja (dni, nombre, concepto, monto_ingreso, deuda_visual, fecha_movimiento, anulado)
    values (v_dni, v_socio_nombre, 'Tienda: ' || v_nombres, v_total, 0, now(), false);
  end if;

  v_res := jsonb_build_object('id', v_id, 'total', v_total, 'metodo', p_metodo, 'vence', v_vence);
  if p_clave is not null then
    insert into public.operaciones_idempotentes (clave, resultado) values ('venta:' || p_clave, v_res);
  end if;
  return v_res;
end;
$function$;
revoke all on function public.registrar_venta(jsonb, text, text, date, text) from public, anon;
grant execute on function public.registrar_venta(jsonb, text, text, date, text) to authenticated;

-- 2) Pago de fiado de tienda
drop function if exists public.registrar_pago_tienda(uuid, numeric, text);
create or replace function public.registrar_pago_tienda(p_venta_id uuid, p_monto numeric, p_metodo text, p_clave text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v public.ventas;
  v_nuevo numeric(10,2);
  v_productos text;
  v_previo jsonb;
  v_res jsonb;
begin
  if not public.es_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;
  if p_clave is not null then
    perform pg_advisory_xact_lock(hashtext('pago:' || p_clave));
    select resultado into v_previo from public.operaciones_idempotentes where clave = 'pago:' || p_clave;
    if found then return v_previo; end if;
  end if;
  if p_metodo not in ('efectivo', 'yape_plin') then raise exception 'Método de pago no válido'; end if;

  select * into v from public.ventas where id = p_venta_id for update;
  if not found then raise exception 'Venta no encontrada'; end if;
  if v.metodo <> 'fiado' or v.estado <> 'pendiente' or v.saldo <= 0 then
    raise exception 'Esta venta no tiene saldo pendiente';
  end if;
  if p_monto is null or p_monto <= 0 or p_monto > v.saldo then
    raise exception 'El monto debe estar entre S/ 0.01 y S/ %', v.saldo;
  end if;

  v_nuevo := v.saldo - p_monto;
  update public.ventas
     set saldo = v_nuevo,
         estado = case when v_nuevo = 0 then 'pagada' else 'pendiente' end
   where id = v.id;

  insert into public.pagos_tienda (venta_id, monto, metodo) values (v.id, p_monto, p_metodo);

  select string_agg(i.nombre, ', ' order by i.id) into v_productos
    from public.venta_items i where i.venta_id = v.id;

  insert into public.historial_caja (dni, nombre, concepto, monto_ingreso, deuda_visual, fecha_movimiento, anulado)
  values (v.dni, v.nombre_socio,
          'Tienda · ' || case when v_nuevo = 0 then 'Fiado pagado: ' else 'Pago de fiado: ' end
            || coalesce(v_productos, 'Producto'),
          p_monto, v_nuevo, now(), false);

  v_res := jsonb_build_object('saldo', v_nuevo, 'estado', case when v_nuevo = 0 then 'pagada' else 'pendiente' end);
  if p_clave is not null then
    insert into public.operaciones_idempotentes (clave, resultado) values ('pago:' || p_clave, v_res);
  end if;
  return v_res;
end;
$function$;
revoke all on function public.registrar_pago_tienda(uuid, numeric, text, text) from public, anon;
grant execute on function public.registrar_pago_tienda(uuid, numeric, text, text) to authenticated;

-- 3) Abono a deuda de membresía
drop function if exists public.abonar_deuda_membresia(text, numeric);
create or replace function public.abonar_deuda_membresia(p_dni text, p_monto numeric, p_clave text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  s public.socios;
  v_deuda numeric(10,2);
  v_nuevo numeric(10,2);
  v_previo jsonb;
  v_res jsonb;
begin
  if not public.es_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;
  if p_clave is not null then
    perform pg_advisory_xact_lock(hashtext('abono:' || p_clave));
    select resultado into v_previo from public.operaciones_idempotentes where clave = 'abono:' || p_clave;
    if found then return v_previo; end if;
  end if;

  select * into s from public.socios where dni = p_dni for update;
  if not found then raise exception 'Socio no encontrado'; end if;

  v_deuda := coalesce(nullif(regexp_replace(coalesce(s.deuda, ''), '[^0-9.]', '', 'g'), '')::numeric, 0);
  if v_deuda <= 0 then raise exception 'Este socio no tiene deuda de membresía'; end if;
  if p_monto is null or p_monto <= 0 or p_monto > v_deuda then
    raise exception 'El monto debe estar entre S/ 0.01 y S/ %', v_deuda;
  end if;

  v_nuevo := v_deuda - p_monto;
  update public.socios
     set deuda = v_nuevo::text,
         fecha_deuda = case when v_nuevo > 0 then s.fecha_deuda else null end
   where dni = p_dni;

  insert into public.historial_caja (dni, nombre, tipo_memb, concepto, monto_ingreso, deuda_visual, fecha_movimiento, anulado)
  values (s.dni, s.nombre, s.tipo_memb,
          case when v_nuevo = 0 then 'Membresía: canceló deuda' else 'Membresía: abono a deuda' end,
          p_monto, v_nuevo, now(), false);

  v_res := jsonb_build_object('deuda', v_nuevo);
  if p_clave is not null then
    insert into public.operaciones_idempotentes (clave, resultado) values ('abono:' || p_clave, v_res);
  end if;
  return v_res;
end;
$function$;
revoke all on function public.abonar_deuda_membresia(text, numeric, text) from public, anon;
grant execute on function public.abonar_deuda_membresia(text, numeric, text) to authenticated;
