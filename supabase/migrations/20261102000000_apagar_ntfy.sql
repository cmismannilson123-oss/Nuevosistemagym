-- Apaga ntfy por completo: ningún aviso se envía ya a ntfy.sh.
-- Los avisos al celular siguen por Web Push / FCM (cy-push) con su cola de reintentos.

-- 1) Ingreso: solo la cola propia (push_pendientes -> _enviar_push), sin ntfy.
create or replace function public._notificar_asistencia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  -- Aviso propio (cola + envío inmediato). Un fallo aquí no frena el registro.
  begin
    insert into public.push_pendientes (asistencia_id, clave, evento)
    values (new.id, 'asist-' || new.id, jsonb_build_object('tipo', 'ingreso', 'dni', new.dni, 'nombre', new.nombre,
            'metodo', coalesce(new.metodo, 'Manual'), 'hora', new.hora, 'fecha', new.fecha))
    on conflict (clave) do nothing
    returning id into v_id;
    if v_id is not null then
      perform public._enviar_push(jsonb_build_object('tipo', 'ingreso', 'pendiente_id', v_id,
              'dni', new.dni, 'nombre', new.nombre, 'metodo', coalesce(new.metodo, 'Manual'),
              'hora', new.hora, 'fecha', new.fecha));
    end if;
  exception when others then
    raise warning 'aviso de ingreso no encolado: %', sqlerrm;
  end;
  return new;
end;
$$;

-- 2) Cupón usado: se registra igual, sin el aviso a ntfy.
create or replace function public.usar_cupon_qr(p_telefono text, p_dni text, p_tipo text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v public.socios;
  v_estado jsonb;
  v_cupon jsonb;
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
  return jsonb_build_object('ok', true, 'cupones', public._cupones_estado(v));
end;
$function$;

-- 3) Se borra el canal: sin esta clave ninguna función puede volver a enviar a ntfy.
delete from public.admin_config where clave = 'ntfy_topic';
