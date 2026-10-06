-- ============================================================
-- CUPONES DE LA PANTALLA DEL SOCIO (QR)
-- ============================================================
--  * Pase de invitado: socios activos cuyo plan NO es interdiario.
--    Uno por mes calendario (hora de Lima); no se acumula.
--  * 10% por pago anticipado: planes que mencionan "mes" (1 mes, Un mes,
--    Mensual, 2 meses...) o "personalizado", excepto interdiario.
--    Vale hasta un día antes del vencimiento. Se usa una vez por periodo
--    de membresía (el periodo es la fecha de vencimiento: al renovar,
--    cambia y el cupón vuelve a estar disponible).
-- Las reglas viven aquí, en el servidor; la página solo muestra el estado.
-- Este cambio es compatible con la versión anterior de gym.html.
-- ============================================================

create table if not exists public.cupones_uso (
  id        bigint generated always as identity primary key,
  dni       text not null,
  tipo      text not null check (tipo in ('invitado', 'descuento')),
  periodo   text not null,
  usado_en  timestamptz not null default now(),
  unique (dni, tipo, periodo)
);
alter table public.cupones_uso enable row level security;
create policy "Staff ve cupones" on public.cupones_uso
  for select to authenticated using ((select public.es_staff()));

-- Estado de los cupones de un socio (solo para socios activos)
create or replace function public._cupones_estado(v public.socios)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy  date := (now() at time zone 'America/Lima')::date;
  v_mes  text := to_char(now() at time zone 'America/Lima', 'YYYY-MM');
  v_tipo text := lower(coalesce(v.tipo_memb, ''));
  v_fin  date;
  v_usado timestamptz;
  r jsonb := '{}'::jsonb;
begin
  begin
    v_fin := v.fecha_fin::date;
  exception when others then
    v_fin := null;
  end;
  if v_fin is null or v_fin < v_hoy then
    return r;
  end if;
  -- Interdiario (también con la falta de ortografía "imterdiario"): sin cupones
  if v_tipo ~ 'i[nm]terdiario' then
    return r;
  end if;

  select usado_en into v_usado from public.cupones_uso
   where dni = v.dni and tipo = 'invitado' and periodo = v_mes;
  r := r || jsonb_build_object('invitado', jsonb_build_object(
    'estado', case when v_usado is null then 'disponible' else 'usado' end,
    'usado_en', v_usado,
    'proximo', to_char(date_trunc('month', v_hoy) + interval '1 month', 'YYYY-MM-DD')));

  if v_tipo ~ '\mmes' or v_tipo ~ '(mensual|mesual|menaual|personalizado)' then
    v_usado := null;
    select usado_en into v_usado from public.cupones_uso
     where dni = v.dni and tipo = 'descuento' and periodo = v.fecha_fin;
    r := r || jsonb_build_object('descuento', jsonb_build_object(
      'estado', case when v_usado is not null then 'usado'
                     when v_hoy <= v_fin - 1 then 'disponible'
                     else 'vencido' end,
      'usado_en', v_usado,
      'hasta', to_char(v_fin - 1, 'YYYY-MM-DD')));
  end if;
  return r;
end;
$$;
revoke all on function public._cupones_estado(public.socios) from public, anon, authenticated;

-- La consulta del QR ahora también trae el estado de los cupones
-- (misma llamada: no agrega viajes de red al flujo de asistencia)
create or replace function public.consultar_socio_qr(p_telefono text, p_dni text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v public.socios;
begin
  if public._qr_bloqueado(p_telefono) then
    return jsonb_build_object('bloqueado', true);
  end if;
  v := public._socio_qr(p_telefono, p_dni);
  if v.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'nombre', v.nombre, 'tipo_memb', v.tipo_memb,
    'dias_restantes', v.dias_restantes, 'dias_totales', v.dias_totales,
    'fecha_fin', v.fecha_fin, 'inicio', v.inicio,
    'deuda', v.deuda, 'fecha_deuda', v.fecha_deuda,
    'cupones', public._cupones_estado(v));
end;
$$;

-- Usar un cupón (lo presiona el socio frente a recepción)
create or replace function public.usar_cupon_qr(p_telefono text, p_dni text, p_tipo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.socios;
  v_estado jsonb;
  v_cupon jsonb;
  v_topic text;
begin
  if public._qr_bloqueado(p_telefono) then
    return jsonb_build_object('ok', false, 'motivo', 'BLOQUEADO');
  end if;
  v := public._socio_qr(p_telefono, p_dni);
  if v.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'NO_ENCONTRADO');
  end if;

  v_estado := public._cupones_estado(v);
  v_cupon := v_estado -> p_tipo;
  if v_cupon is null then
    return jsonb_build_object('ok', false, 'motivo', 'NO_APLICA', 'cupones', v_estado);
  end if;
  if v_cupon ->> 'estado' <> 'disponible' then
    return jsonb_build_object('ok', false, 'motivo', upper(v_cupon ->> 'estado'), 'cupones', v_estado);
  end if;

  insert into public.cupones_uso (dni, tipo, periodo)
  values (v.dni, p_tipo,
          case p_tipo when 'invitado' then to_char(now() at time zone 'America/Lima', 'YYYY-MM')
                      else v.fecha_fin end)
  on conflict (dni, tipo, periodo) do nothing;

  -- Aviso a recepción por ntfy (si falla, el cupón igual queda usado)
  begin
    select valor into v_topic from public.admin_config where clave = 'ntfy_topic';
    if v_topic is not null then
      perform net.http_post(
        url := 'https://ntfy.sh/',
        body := jsonb_build_object(
          'topic', v_topic,
          'title', '🎟️ Cupón usado',
          'priority', 4,
          'tags', jsonb_build_array('tada'),
          'message', format('%s usó su %s.', v.nombre,
            case p_tipo when 'invitado' then 'pase de invitado del mes'
                        else '10% de descuento por pago anticipado' end)),
        headers := '{"Content-Type": "application/json"}'::jsonb);
    end if;
  exception when others then
    null;
  end;

  return jsonb_build_object('ok', true, 'cupones', public._cupones_estado(v));
end;
$$;
revoke all on function public.usar_cupon_qr(text, text, text) from public;
grant execute on function public.usar_cupon_qr(text, text, text) to anon, authenticated;
