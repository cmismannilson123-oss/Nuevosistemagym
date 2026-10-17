-- ============================================================
-- TIENDA: PRODUCTOS, VENTAS, FIADOS Y PAGOS
--
-- Reglas de bloqueo por deuda de la TIENDA (independientes de la membresía):
--   · Venta fiada de hasta S/ 10.99  -> bloquea desde el día siguiente a la venta.
--   · Venta fiada mayor a S/ 10.99   -> bloquea desde la fecha límite que elija
--                                       el personal. Sin fecha límite, no bloquea.
--   · Pagar una deuda de tienda no libera una deuda de membresía, y viceversa.
--
-- La deuda de membresía NO cambia: sigue bloqueando después de 7 días.
--
-- Cada venta fiada guarda su fecha de vencimiento al crearse, así un abono
-- parcial no cambia cuándo vence. Todas las escrituras se hacen con funciones
-- que exigen personal del gym y calculan los precios desde la base.
-- ============================================================

-- Umbral único de la regla (cambiarlo aquí cambia todo el sistema)
create or replace function public._umbral_tienda()
returns numeric
language sql
immutable
set search_path = ''
as $$ select 10.99::numeric $$;

-- ---------- Tablas ----------

create table if not exists public.productos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (length(btrim(nombre)) between 2 and 80),
  categoria   text not null default 'Otros'
              check (categoria in ('Bebidas', 'Suplementos', 'Accesorios', 'Otros')),
  precio      numeric(10,2) not null check (precio > 0 and precio < 10000),
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

create table if not exists public.ventas (
  id                uuid primary key default gen_random_uuid(),
  dni               text,
  nombre_socio      text,
  total             numeric(10,2) not null check (total > 0),
  saldo             numeric(10,2) not null default 0 check (saldo >= 0),
  metodo            text not null check (metodo in ('efectivo', 'yape_plin', 'fiado')),
  estado            text not null default 'pagada' check (estado in ('pagada', 'pendiente', 'anulada')),
  fecha             date not null,
  fecha_vencimiento date,
  creado_en         timestamptz not null default now(),
  constraint ventas_fiado_con_socio check (metodo <> 'fiado' or dni is not null),
  constraint ventas_fiado_saldo check (
    (metodo = 'fiado' and saldo <= total and (estado <> 'pagada' or saldo = 0))
    or (metodo <> 'fiado' and saldo = 0)
  )
);

create index if not exists ventas_dni_pendientes on public.ventas (dni) where metodo = 'fiado' and estado = 'pendiente';

create table if not exists public.venta_items (
  id          bigint generated always as identity primary key,
  venta_id    uuid not null references public.ventas (id) on delete cascade,
  producto_id uuid references public.productos (id) on delete set null,
  nombre      text not null,
  precio_unit numeric(10,2) not null check (precio_unit > 0),
  cantidad    integer not null check (cantidad between 1 and 50),
  subtotal    numeric(10,2) not null check (subtotal > 0)
);

create table if not exists public.pagos_tienda (
  id        bigint generated always as identity primary key,
  venta_id  uuid not null references public.ventas (id),
  monto     numeric(10,2) not null check (monto > 0),
  metodo    text not null check (metodo in ('efectivo', 'yape_plin')),
  creado_en timestamptz not null default now()
);

-- ---------- Permisos: solo personal del gym ----------

alter table public.productos     enable row level security;
alter table public.ventas        enable row level security;
alter table public.venta_items   enable row level security;
alter table public.pagos_tienda  enable row level security;

revoke all on public.productos, public.ventas, public.venta_items, public.pagos_tienda from anon, authenticated;
grant select on public.productos, public.ventas, public.venta_items, public.pagos_tienda to authenticated;
grant insert, update on public.productos to authenticated;

create policy "Staff ve productos" on public.productos for select to authenticated
  using ((select public.es_staff()));
create policy "Staff crea productos" on public.productos for insert to authenticated
  with check ((select public.es_staff()));
create policy "Staff edita productos" on public.productos for update to authenticated
  using ((select public.es_staff())) with check ((select public.es_staff()));
create policy "Staff ve ventas" on public.ventas for select to authenticated
  using ((select public.es_staff()));
create policy "Staff ve items de venta" on public.venta_items for select to authenticated
  using ((select public.es_staff()));
create policy "Staff ve pagos de tienda" on public.pagos_tienda for select to authenticated
  using ((select public.es_staff()));

-- ---------- Deudas de tienda y regla de bloqueo ----------

-- Deudas pendientes de un socio, con la marca de si bloquean hoy
create or replace function public._deudas_tienda_socio(p_dni text)
returns table (
  venta_id uuid, fecha date, total numeric, saldo numeric,
  fecha_vencimiento date, bloquea boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.fecha, v.total, v.saldo, v.fecha_vencimiento,
         (v.fecha_vencimiento is not null
          and (now() at time zone 'America/Lima')::date >= v.fecha_vencimiento) as bloquea
  from public.ventas v
  where v.dni = p_dni
    and v.metodo = 'fiado'
    and v.estado = 'pendiente'
    and v.saldo > 0
  order by v.fecha, v.creado_en;
$$;
revoke all on function public._deudas_tienda_socio(text) from public, anon, authenticated;

-- Detalle de las deudas que bloquean (para mostrar al socio y al personal)
create or replace function public._resumen_bloqueo_tienda(p_dni text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'venta_id', d.venta_id,
           'fecha', d.fecha,
           'total', d.total,
           'saldo', d.saldo,
           'vence', d.fecha_vencimiento,
           'articulos', (select string_agg(i.cantidad || ' × ' || i.nombre, ', ' order by i.id)
                           from public.venta_items i where i.venta_id = d.venta_id)
         ) order by d.fecha), '[]'::jsonb)
  from public._deudas_tienda_socio(p_dni) d
  where d.bloquea;
$$;
revoke all on function public._resumen_bloqueo_tienda(text) from public, anon, authenticated;

-- Respaldo: ninguna asistencia se guarda si el socio tiene deuda de tienda que bloquea
create or replace function public._bloqueo_tienda_asistencia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public._deudas_tienda_socio(new.dni) d where d.bloquea) then
    raise exception 'BLOQUEADO_TIENDA' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists tr_bloqueo_tienda on public.historial_asistencia;
create trigger tr_bloqueo_tienda
  before insert on public.historial_asistencia
  for each row execute function public._bloqueo_tienda_asistencia();

-- ---------- Funciones del personal ----------

-- Registra una venta. Los precios se leen de la base, nunca de la página.
-- Efectivo / Yape-Plin: queda pagada y entra a la caja del día.
-- Fiado: exige socio; vence al día siguiente si el total es <= S/ 10.99,
--        o en p_fecha_limite si es mayor (sin fecha, no bloquea).
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

-- Abono o cancelación de una venta fiada (p_monto = saldo para cancelarla)
create or replace function public.registrar_pago_tienda(p_venta_id uuid, p_monto numeric, p_metodo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.ventas;
  v_nuevo numeric(10,2);
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

  insert into public.historial_caja (dni, nombre, concepto, monto_ingreso, deuda_visual, fecha_movimiento, anulado)
  values (v.dni, v.nombre_socio,
          case when v_nuevo = 0 then 'Tienda: canceló deuda' else 'Tienda: abono a deuda' end,
          p_monto, v_nuevo, now(), false);

  return jsonb_build_object('saldo', v_nuevo, 'estado', case when v_nuevo = 0 then 'pagada' else 'pendiente' end);
end;
$$;
revoke all on function public.registrar_pago_tienda(uuid, numeric, text) from public, anon;
grant execute on function public.registrar_pago_tienda(uuid, numeric, text) to authenticated;

-- Fecha límite de una deuda mayor a S/ 10.99 (null = sin fecha, no bloquea)
create or replace function public.fijar_fecha_limite_tienda(p_venta_id uuid, p_fecha date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.ventas;
begin
  if not public.es_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;
  select * into v from public.ventas where id = p_venta_id for update;
  if not found then raise exception 'Venta no encontrada'; end if;
  if v.metodo <> 'fiado' or v.estado <> 'pendiente' or v.saldo <= 0 then
    raise exception 'Esta venta no tiene saldo pendiente';
  end if;
  if v.total <= public._umbral_tienda() then
    raise exception 'Las deudas de hasta S/ 10.99 vencen al día siguiente y no admiten otra fecha';
  end if;
  if p_fecha is not null and p_fecha <= (now() at time zone 'America/Lima')::date then
    raise exception 'La fecha límite debe ser posterior a hoy';
  end if;
  update public.ventas set fecha_vencimiento = p_fecha where id = v.id;
end;
$$;
revoke all on function public.fijar_fecha_limite_tienda(uuid, date) from public, anon;
grant execute on function public.fijar_fecha_limite_tienda(uuid, date) to authenticated;

-- Abono o cancelación de la deuda de MEMBRESÍA (nunca agrega deuda)
create or replace function public.abonar_deuda_membresia(p_dni text, p_monto numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.socios;
  v_deuda numeric(10,2);
  v_nuevo numeric(10,2);
begin
  if not public.es_staff() then raise exception 'No autorizado' using errcode = '42501'; end if;

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

  return jsonb_build_object('deuda', v_nuevo);
end;
$$;
revoke all on function public.abonar_deuda_membresia(text, numeric) from public, anon;
grant execute on function public.abonar_deuda_membresia(text, numeric) to authenticated;

-- ---------- Entrada: el QR informa el bloqueo de tienda ----------

-- Marcar asistencia: si hay deuda de tienda que bloquea, se rechaza y se detalla
create or replace function public.registrar_asistencia_publica(p_dni text)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_socio socios%rowtype;
  v_ahora_lima timestamp := now() AT TIME ZONE 'America/Lima';
  v_hoy text := to_char(v_ahora_lima, 'YYYY-MM-DD');
  v_es_interdiario boolean;
  v_nuevos_dias int;
  v_dias_deuda int;
begin
  select * into v_socio from socios where dni = p_dni limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'NO_ENCONTRADO');
  end if;

  if exists (select 1 from public._deudas_tienda_socio(p_dni) d where d.bloquea) then
    return jsonb_build_object('ok', false, 'motivo', 'BLOQUEADO_TIENDA', 'nombre', v_socio.nombre,
                              'deudas', public._resumen_bloqueo_tienda(p_dni));
  end if;

  v_es_interdiario := position('interdiario' in lower(coalesce(v_socio.tipo_memb,''))) > 0;

  if v_es_interdiario and coalesce(v_socio.dias_restantes,0) <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'AGOTADO', 'nombre', v_socio.nombre);
  end if;

  if v_socio.fecha_fin is null or v_socio.fecha_fin < v_hoy then
    return jsonb_build_object('ok', false, 'motivo', 'VENCIDO', 'nombre', v_socio.nombre);
  end if;

  if coalesce(nullif(v_socio.deuda,'')::numeric, 0) > 0 and v_socio.fecha_deuda is not null then
    v_dias_deuda := v_ahora_lima::date - v_socio.fecha_deuda;
    if v_dias_deuda > 7 then
      return jsonb_build_object('ok', false, 'motivo', 'DEUDA', 'nombre', v_socio.nombre, 'deuda', v_socio.deuda);
    end if;
  end if;

  if v_es_interdiario and coalesce(v_socio.dias_totales,0) > 15 then
    update socios set dias_totales = 15, dias_restantes = least(v_socio.dias_restantes,15) where dni = p_dni;
    v_socio.dias_totales := 15;
    v_socio.dias_restantes := least(v_socio.dias_restantes, 15);
  end if;

  v_nuevos_dias := greatest(0, coalesce(v_socio.dias_restantes,0) - 1);

  begin
    insert into historial_asistencia (nombre, dni, hora, fecha, metodo)
    values (v_socio.nombre, v_socio.dni, to_char(v_ahora_lima,'HH24:MI:SS'), v_hoy, 'QR');
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'motivo', 'YA_REGISTRADO', 'nombre', v_socio.nombre);
  end;

  update socios set dias_restantes = v_nuevos_dias where dni = p_dni;

  return jsonb_build_object(
    'ok', true, 'nombre', v_socio.nombre, 'dias_restantes', v_nuevos_dias,
    'dias_totales', v_socio.dias_totales, 'fecha_fin', v_socio.fecha_fin, 'inicio', v_socio.inicio
  );
end;
$$;
revoke all on function public.registrar_asistencia_publica(text) from public, anon, authenticated;

-- Verificación del QR: si el socio está bloqueado por tienda, lo informa con el detalle
create or replace function public.verificar_socio_qr(p_telefono text, p_dni text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tel text := public._qr_norm_tel(p_telefono);
  v_dni text := public._qr_norm_dni(p_dni);
  v public.socios;
begin
  if v_tel !~ '^[0-9]{6,15}$' or v_dni !~ '^[0-9]{5,12}$' then
    return jsonb_build_object('ok', false, 'motivo', 'DATOS_INVALIDOS');
  end if;
  if public._qr_bloqueado(v_tel) or (
       select count(*) >= 8 from public.qr_intentos
        where telefono = 'dni:' || v_dni and created_at > now() - interval '15 minutes') then
    return jsonb_build_object('ok', false, 'motivo', 'BLOQUEADO', 'bloqueado', true);
  end if;

  v := public._socio_qr(v_tel, v_dni);
  if v.id is not null then
    return jsonb_build_object(
      'ok', true,
      'nombre', v.nombre, 'tipo_memb', v.tipo_memb,
      'dias_restantes', v.dias_restantes, 'dias_totales', v.dias_totales,
      'fecha_fin', v.fecha_fin, 'inicio', v.inicio,
      'deuda', v.deuda, 'fecha_deuda', v.fecha_deuda,
      'cupones', public._cupones_estado(v),
      'tienda_bloqueada', exists (select 1 from public._deudas_tienda_socio(v.dni) d where d.bloquea),
      'deudas_tienda', public._resumen_bloqueo_tienda(v.dni));
  end if;

  return jsonb_build_object('ok', false, 'motivo', 'NO_REGISTRADO');
end;
$$;
revoke all on function public.verificar_socio_qr(text, text) from public;
grant execute on function public.verificar_socio_qr(text, text) to anon, authenticated;
