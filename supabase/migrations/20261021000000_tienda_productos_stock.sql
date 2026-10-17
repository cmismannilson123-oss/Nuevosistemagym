-- ============================================================
-- TIENDA: CATEGORÍAS PROPIAS, PRODUCTOS EDITABLES Y STOCK OPCIONAL
--
--  · Las categorías las crea y elimina el personal. Una categoría no se puede
--    eliminar mientras tenga productos (ni activos ni desactivados).
--  · Los productos se desactivan en vez de borrarse: las ventas conservan su historial.
--  · Stock opcional por producto: si está vacío, el producto no tiene límite de venta.
--    Si tiene número, cada venta lo descuenta y no permite vender más de lo que hay.
-- ============================================================

-- ---------- Categorías ----------

create table if not exists public.categorias_producto (
  nombre     text primary key check (length(btrim(nombre)) between 2 and 40),
  creado_en  timestamptz not null default now()
);

insert into public.categorias_producto (nombre)
values ('Bebidas'), ('Suplementos'), ('Accesorios'), ('Otros')
on conflict (nombre) do nothing;

alter table public.categorias_producto enable row level security;
revoke all on public.categorias_producto from anon, authenticated;
grant select on public.categorias_producto to authenticated;
drop policy if exists "Staff ve categorias" on public.categorias_producto;
create policy "Staff ve categorias" on public.categorias_producto for select to authenticated
  using ((select public.es_staff()));

-- Los productos ya no están limitados a 4 categorías fijas: apuntan a la tabla
alter table public.productos drop constraint if exists productos_categoria_check;
alter table public.productos drop constraint if exists productos_categoria_fk;
alter table public.productos add constraint productos_categoria_fk
  foreign key (categoria) references public.categorias_producto (nombre)
  on update cascade on delete restrict;

-- ---------- Stock opcional ----------

alter table public.productos add column if not exists stock integer;
alter table public.productos drop constraint if exists productos_stock_valido;
alter table public.productos add constraint productos_stock_valido
  check (stock is null or stock >= 0);

-- ---------- Funciones del personal ----------

create or replace function public.crear_categoria(p_nombre text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_nombre, ''));
begin
  if not public.es_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;
  if length(v) < 2 or length(v) > 40 then
    raise exception 'El nombre de la categoría debe tener entre 2 y 40 letras';
  end if;
  if exists (select 1 from public.categorias_producto c where lower(c.nombre) = lower(v)) then
    raise exception 'Ya existe una categoría con ese nombre';
  end if;
  insert into public.categorias_producto (nombre) values (v);
  return v;
end;
$$;
revoke all on function public.crear_categoria(text) from public, anon;
grant execute on function public.crear_categoria(text) to authenticated;

create or replace function public.eliminar_categoria(p_nombre text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activos integer;
  v_desactivados integer;
begin
  if not public.es_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;
  if p_nombre = 'Otros' then raise exception 'La categoría Otros no se puede eliminar'; end if;

  select count(*) filter (where p.activo), count(*) filter (where not p.activo)
    into v_activos, v_desactivados
    from public.productos p where p.categoria = p_nombre;
  if v_activos > 0 then
    raise exception 'Esta categoría tiene % producto(s) a la venta. Muévalos a otra categoría antes de eliminarla', v_activos;
  end if;

  -- Los productos desactivados (sin venta) pasan a "Otros" para que no queden huérfanos
  if v_desactivados > 0 then
    insert into public.categorias_producto (nombre) values ('Otros') on conflict (nombre) do nothing;
    update public.productos set categoria = 'Otros' where categoria = p_nombre;
  end if;

  delete from public.categorias_producto c where c.nombre = p_nombre;
  if not found then raise exception 'Categoría no encontrada'; end if;
end;
$$;
revoke all on function public.eliminar_categoria(text) from public, anon;
grant execute on function public.eliminar_categoria(text) to authenticated;

-- Crea o edita un producto. p_stock vacío = sin control de stock.
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
    update public.productos
       set nombre = v_nombre, categoria = p_categoria, precio = p_precio, stock = p_stock
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Producto no encontrado'; end if;
  end if;
  return v_id;
end;
$$;
revoke all on function public.guardar_producto(uuid, text, text, numeric, integer) from public, anon;
grant execute on function public.guardar_producto(uuid, text, text, numeric, integer) to authenticated;

-- Activa o desactiva un producto (no se borra: conserva el historial de ventas)
create or replace function public.activar_producto(p_id uuid, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;
  update public.productos set activo = p_activo where id = p_id;
  if not found then raise exception 'Producto no encontrado'; end if;
end;
$$;
revoke all on function public.activar_producto(uuid, boolean) from public, anon;
grant execute on function public.activar_producto(uuid, boolean) to authenticated;

-- Suma unidades al stock de un producto que controla stock
create or replace function public.reponer_stock(p_id uuid, p_cantidad integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stock integer;
begin
  if not public.es_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 100000 then
    raise exception 'La cantidad a reponer debe estar entre 1 y 100,000';
  end if;
  select stock into v_stock from public.productos where id = p_id for update;
  if not found then raise exception 'Producto no encontrado'; end if;
  if v_stock is null then raise exception 'Este producto no controla stock. Actívelo al editarlo'; end if;
  update public.productos set stock = stock + p_cantidad where id = p_id returning stock into v_stock;
  return v_stock;
end;
$$;
revoke all on function public.reponer_stock(uuid, integer) from public, anon;
grant execute on function public.reponer_stock(uuid, integer) to authenticated;

-- Venta: igual que antes, más control y descuento de stock (si el producto lo controla)
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

  select count(*), coalesce(sum(p.precio * x.cantidad), 0)
    into v_validas, v_total
  from jsonb_to_recordset(p_items) as x(producto_id uuid, cantidad integer)
  join public.productos p on p.id = x.producto_id and p.activo
  where x.cantidad between 1 and 50;

  if v_validas <> v_lineas then raise exception 'Hay artículos inexistentes, inactivos o con cantidad no válida'; end if;

  -- Bloquea los productos mientras se vende, para que dos ventas no descuenten el mismo stock
  perform 1 from public.productos p
   where p.id in (select x.producto_id from jsonb_to_recordset(p_items) as x(producto_id uuid, cantidad integer))
   for update;

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
