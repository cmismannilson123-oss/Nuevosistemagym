-- ============================================================
-- QR DEL SOCIO: avisos claros cuando el número o el DNI no coinciden
--
-- 1. Comparación tolerante: se comparan solo los dígitos, sin el +51 del
--    inicio y sin ceros a la izquierda del DNI. Así un socio con sus datos
--    bien escritos siempre entra, aunque en el sistema se hayan guardado con
--    espacios, guiones o con +51.
-- 2. verificar_socio_qr: además de los datos del socio, dice qué falló:
--      TELEFONO_NO_COINCIDE  el DNI está inscrito, pero con otro celular
--      DNI_NO_COINCIDE       el celular está inscrito, pero con otro DNI
--      NO_REGISTRADO         ni el celular ni el DNI están inscritos
--    Nunca devuelve el nombre ni datos del otro socio. Los intentos fallidos
--    se cuentan por celular y por DNI (8 en 15 minutos -> espera).
-- consultar_socio_qr sigue igual para las versiones anteriores de la página.
-- ============================================================

create or replace function public._qr_norm_tel(p text)
returns text language sql immutable set search_path = '' as $$
  select case when d ~ '^51[0-9]{9}$' then substr(d, 3) else d end
    from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;

create or replace function public._qr_norm_dni(p text)
returns text language sql immutable set search_path = '' as $$
  select ltrim(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '0');
$$;
-- Deben poder usarlas todos: los índices de abajo las llaman al guardar o
-- editar un socio desde el panel (sin este permiso, registrar fallaba).
grant execute on function public._qr_norm_tel(text) to anon, authenticated;
grant execute on function public._qr_norm_dni(text) to anon, authenticated;

-- Búsqueda rápida por los valores normalizados
create index if not exists socios_tel_norm_idx on public.socios (public._qr_norm_tel(telefono));
create index if not exists socios_dni_norm_idx on public.socios (public._qr_norm_dni(dni));

create or replace function public._socio_qr(p_telefono text, p_dni text)
returns public.socios
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
    return null;
  end if;
  select * into v from public.socios
   where public._qr_norm_tel(telefono) = v_tel and public._qr_norm_dni(dni) = v_dni
   limit 1;
  if not found then
    insert into public.qr_intentos (telefono) values (v_tel), ('dni:' || v_dni);
    perform pg_sleep(0.5);
    return null;
  end if;
  return v;
end;
$$;
revoke all on function public._socio_qr(text, text) from public, anon, authenticated;

create or replace function public._qr_bloqueado(p_telefono text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) >= 8 from public.qr_intentos
   where telefono = public._qr_norm_tel(p_telefono)
     and created_at > now() - interval '15 minutes';
$$;

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
  v_tel_existe boolean;
  v_dni_existe boolean;
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
      'cupones', public._cupones_estado(v));
  end if;

  select exists(select 1 from public.socios where public._qr_norm_tel(telefono) = v_tel) into v_tel_existe;
  select exists(select 1 from public.socios where public._qr_norm_dni(dni) = v_dni) into v_dni_existe;
  return jsonb_build_object('ok', false, 'motivo',
    case when v_dni_existe then 'TELEFONO_NO_COINCIDE'
         when v_tel_existe then 'DNI_NO_COINCIDE'
         else 'NO_REGISTRADO' end);
end;
$$;
revoke all on function public.verificar_socio_qr(text, text) from public;
grant execute on function public.verificar_socio_qr(text, text) to anon, authenticated;
