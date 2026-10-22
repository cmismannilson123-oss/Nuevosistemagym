-- ============================================================
-- ROLES DEL PERSONAL: ADMINISTRADOR (dueño) Y RECEPCIÓN
--
-- Administrador: todo, incluido productos, precios, categorías, cuentas del personal,
--                cierre de sesión de dispositivos y cambio de contraseña.
-- Recepción:     registrar ingresos, socios nuevos, renovaciones, ventas, cobros de
--                deudas (tienda y membresía), reponer stock y ver la caja del día.
--                No edita ni elimina socios, no toca productos ni precios, no borra
--                asistencias ni la caja, y el cuaderno solo muestra el día de hoy.
-- ============================================================

-- ---------- Rol en la tabla de personal ----------

alter table public.staff add column if not exists rol text not null default 'recepcion';
alter table public.staff add constraint staff_rol_valido check (rol in ('admin', 'recepcion'));
-- Hoy la única cuenta del personal es la del dueño
update public.staff set rol = 'admin';

-- La tabla de personal nunca se lee ni se escribe directo desde la página
alter table public.staff enable row level security;
revoke all on public.staff from anon, authenticated;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff s where s.user_id = (select auth.uid()) and s.rol = 'admin');
$$;
revoke all on function public.es_admin() from public, anon;
grant execute on function public.es_admin() to authenticated;

-- Rol de la cuenta que está usando el panel ('admin', 'recepcion' o 'ninguno')
create or replace function public.mi_rol()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.rol from public.staff s where s.user_id = (select auth.uid())), 'ninguno');
$$;
revoke all on function public.mi_rol() from public, anon;
grant execute on function public.mi_rol() to authenticated;

-- ---------- Productos: solo el administrador los crea, edita o desactiva ----------

revoke insert, update on public.productos from authenticated;

alter policy "Staff crea productos" on public.productos to authenticated
  with check ((select public.es_admin()));
alter policy "Staff edita productos" on public.productos to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

-- ---------- Socios: recepción no cambia nombre, DNI ni teléfono, y no borra ----------
-- (Inscribir, renovar, cobrar y marcar asistencia siguen funcionando.)

create or replace function public._guardia_socios()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Sin sesión de usuario (editor SQL, procesos internos) no se aplican estas reglas
  if (select auth.uid()) is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if not public.es_admin() then
      raise exception 'Solo el administrador puede eliminar socios' using errcode = '42501';
    end if;
    return old;
  end if;
  if not public.es_admin() and (
       new.dni is distinct from old.dni
    or new.nombre is distinct from old.nombre
    or new.telefono is distinct from old.telefono) then
    raise exception 'Solo el administrador puede cambiar el nombre, DNI o teléfono del socio' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger tr_guardia_socios
  before update or delete on public.socios
  for each row execute function public._guardia_socios();

-- ---------- Caja y asistencias: solo el administrador borra o cambia registros ya guardados ----------

create or replace function public._guardia_registros()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if not public.es_admin() then
    raise exception 'Solo el administrador puede modificar o borrar registros guardados' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger tr_guardia_caja
  before update or delete on public.historial_caja
  for each row execute function public._guardia_registros();

create trigger tr_guardia_asistencia
  before delete on public.historial_asistencia
  for each row execute function public._guardia_registros();

-- ---------- Funciones que solo puede usar el administrador ----------

-- Solo el administrador
create or replace function public.crear_categoria(p_nombre text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_nombre, ''));
begin
  if not public.es_admin() then raise exception 'No autorizado' using errcode = '42501'; end if;
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

-- Solo el administrador
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
  if not public.es_admin() then raise exception 'No autorizado' using errcode = '42501'; end if;
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

-- Solo el administrador
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
  if not public.es_admin() then raise exception 'No autorizado' using errcode = '42501'; end if;
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

-- Solo el administrador
create or replace function public.activar_producto(p_id uuid, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then raise exception 'No autorizado' using errcode = '42501'; end if;
  update public.productos set activo = p_activo where id = p_id;
  if not found then raise exception 'Producto no encontrado'; end if;
end;
$$;
revoke all on function public.activar_producto(uuid, boolean) from public, anon;
grant execute on function public.activar_producto(uuid, boolean) to authenticated;

-- ---------- Cuaderno de caja: recepción solo ve el día de hoy ----------

-- Cuaderno de caja: recepción solo recibe los movimientos de hoy
create or replace function public.cuaderno_caja(p_desde date, p_hasta date)
returns table(fecha timestamp with time zone, dni text, nombre text, plan text, concepto text, monto numeric, deuda numeric, inicia date)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.es_staff() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not public.es_admin() then
    p_desde := (now() at time zone 'America/Lima')::date;
    p_hasta := p_desde;
  end if;

  return query
  with
  rango as (
    select (p_desde::timestamp at time zone 'America/Lima') as ini,
           ((p_hasta + 1)::timestamp at time zone 'America/Lima') as fin
  ),
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
$function$;
revoke all on function public.cuaderno_caja(date, date) from public, anon;
grant execute on function public.cuaderno_caja(date, date) to authenticated;

-- ---------- Ajustes del administrador: cuentas del personal ----------

create or replace function public.listar_personal()
returns table (user_id uuid, email text, nombre text, rol text, creado timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then raise exception 'No autorizado' using errcode = '42501'; end if;
  return query
    select s.user_id, u.email::text, s.nombre, s.rol, s.created_at
      from public.staff s
      join auth.users u on u.id = s.user_id
     order by s.rol, u.email;
end;
$$;
revoke all on function public.listar_personal() from public, anon;
grant execute on function public.listar_personal() to authenticated;

-- Cierra la sesión de la cuenta en todos sus dispositivos (solo cuentas de recepción)
create or replace function public.cerrar_sesiones_personal(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then raise exception 'No autorizado' using errcode = '42501'; end if;
  if not exists (select 1 from public.staff s where s.user_id = p_user and s.rol = 'recepcion') then
    raise exception 'Solo se puede cerrar la sesión de una cuenta de recepción';
  end if;
  delete from auth.sessions where user_id = p_user;
  delete from auth.refresh_tokens where user_id = p_user::text;
end;
$$;
revoke all on function public.cerrar_sesiones_personal(uuid) from public, anon;
grant execute on function public.cerrar_sesiones_personal(uuid) to authenticated;

-- Cambia la contraseña de una cuenta de recepción y cierra sus sesiones abiertas
create or replace function public.cambiar_clave_personal(p_user uuid, p_clave text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then raise exception 'No autorizado' using errcode = '42501'; end if;
  if not exists (select 1 from public.staff s where s.user_id = p_user and s.rol = 'recepcion') then
    raise exception 'Solo se puede cambiar la contraseña de una cuenta de recepción';
  end if;
  if p_clave is null or length(p_clave) < 8 or length(p_clave) > 72 then
    raise exception 'La contraseña debe tener entre 8 y 72 caracteres';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_clave, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_user;
  delete from auth.sessions where user_id = p_user;
  delete from auth.refresh_tokens where user_id = p_user::text;
end;
$$;
revoke all on function public.cambiar_clave_personal(uuid, text) from public, anon;
grant execute on function public.cambiar_clave_personal(uuid, text) to authenticated;
