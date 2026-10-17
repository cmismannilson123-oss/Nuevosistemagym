-- Los pagos de fiados de tienda se guardan con el nombre del producto en el concepto,
-- así el cuaderno de caja muestra "Pago de fiado: Proteína 1 kg" en vez de "Membresía".
-- El concepto no usa "Abono" ni "Canceló", para que no se cuente como deuda de membresía.
create or replace function public.registrar_pago_tienda(p_venta_id uuid, p_monto numeric, p_metodo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.ventas;
  v_nuevo numeric(10,2);
  v_productos text;
begin
  if not public.es_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;
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

  return jsonb_build_object('saldo', v_nuevo, 'estado', case when v_nuevo = 0 then 'pagada' else 'pendiente' end);
end;
$$;
revoke all on function public.registrar_pago_tienda(uuid, numeric, text) from public, anon;
grant execute on function public.registrar_pago_tienda(uuid, numeric, text) to authenticated;
