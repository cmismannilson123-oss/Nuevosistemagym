-- ============================================================
-- VERIFICACIÓN QR: RESPUESTA GENÉRICA CUANDO LOS DATOS NO COINCIDEN
-- Antes, la respuesta distinguía "DNI inscrito con otro celular" de
-- "celular inscrito con otro DNI". Así cualquiera podía averiguar qué
-- DNI es socio del gym probando uno por uno. Ahora todo dato que no
-- coincide responde NO_REGISTRADO. Lo demás (bloqueo por intentos,
-- datos válidos, datos del socio) queda igual.
-- ============================================================
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
      'cupones', public._cupones_estado(v));
  end if;

  -- Mismo motivo para cualquier combinación que no coincida: no se revela
  -- si el celular o el DNI existen en el gym.
  return jsonb_build_object('ok', false, 'motivo', 'NO_REGISTRADO');
end;
$$;

revoke all on function public.verificar_socio_qr(text, text) from public;
grant execute on function public.verificar_socio_qr(text, text) to anon, authenticated;
