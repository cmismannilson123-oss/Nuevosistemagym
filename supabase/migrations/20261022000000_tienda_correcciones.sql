-- ============================================================
-- TIENDA: CORRECCIONES DE REVISIÓN
--  · guardar_producto ya no pisa el stock de un producto que ya lo controla.
--  · registrar_venta bloquea los productos antes de leer precios y stock.
-- ============================================================

create or replace function public.guardar_producto(
  p_id uuid, p_nombre text, p_categoria text, p_precio numeric, p_stock integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_id uuid;
begin
  if not public.es_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;
  if length(v_nombre) < 2 or length(v_nombre) > 80 then
    raise exception 'El nombre del producto debe tener entre 2 y 80 letras';
  end if;
  if not exists (select 1 from public.categorias_producto c where c.nombre = p_categoria) then
    raise exception 'Elija una categoría válida';
  end if;
  if p_precio is null or p_precio <= 0 or p_precio >= 10000 then
    raise exception 'El precio debe ser mayor a S/ 0 y menor a S/ 10,000';
  end if;
  if p_stock is not null and (p_stock < 0 or p_stock > 100000) then
    raise exception 'El stock debe estar entre 0 y 100,000';
  end if;

  if p_id is null then
    insert into public.productos (nombre, categoria, precio, stock)
    values (v_nombre, p_categoria, p_precio, p_stock)
    returning id into v_id;
  else
    -- El stock de un producto que ya lo controla solo cambia con reponer_stock (así no se pisa una venta reciente).
    -- Si el producto no controlaba stock y ahora sí, se fija la cantidad inicial. Si se desactiva, vuelve a "sin control".
    update public.productos
       set nombre = v_nombre,
           categoria = p_categoria,
           precio = p_precio,
           stock = case when p_stock is null then null
                        when stock is null then p_stock
                        else stock end
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Producto no encontrado'; end if;
  end if;
  return v_id;
end;
$$;
revoke all on function public.guardar_producto(uuid, text, text, numeric, integer) from public, anon;
grant execute on function public.guardar_producto(uuid, text, text, numeric, integer) to authenticated;

create or replace function public.registrar_venta(
  p_items jsonb, p_metodo text, p_dni text default null, p_fecha_limite date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
begin
  if not public.es_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;
  if p_metodo not in ('efectivo', 'yape_plin', 'fiado') then raise exception 'Método de pago no válido'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'La venta no tiene artículos'; end if;

  v_lineas := jsonb_array_length(p_items);
  if v_lineas < 1 or v_lineas > 30 then raise exception 'La venta debe tener entre 1 y 30 líneas'; end if;

  -- Primero se bloquean los productos; así el precio y el stock que se leen ya no cambian durante la venta
  perform 1 from public.productos p
   where p.id in (select x.producto_id from jsonb_to_recordset(p_items) as x(producto_id uuid, cantidad integer))
   for update;

  select count(*), coalesce(sum(p.precio * x.cantidad), 0)
    into v_validas, v_total
  from jsonb_to_recordset(p_items) as x(producto_id uuid, cantidad integer)
  join public.productos p on p.id = x.producto_id and p.activo
  where x.cantidad between 1 and 50;

  if v_validas <> v_lineas then raise exception 'Hay artículos inexistentes, inactivos o con cantidad no válida'; end if;

  -- Bloquea los productos mientras se vende, para que dos ventas no descuenten el mismo stock

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

  return jsonb_build_object('id', v_id, 'total', v_total, 'metodo', p_metodo, 'vence', v_vence);
end;
$$;
revoke all on function public.registrar_venta(jsonb, text, text, date) from public, anon;
grant execute on function public.registrar_venta(jsonb, text, text, date) to authenticated;
