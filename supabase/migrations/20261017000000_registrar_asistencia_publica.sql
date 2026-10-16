-- ============================================================
-- REGISTRO DE ASISTENCIA (función interna) Y RESTRICCIÓN DE UN REGISTRO POR DÍA
-- Esta función ya existía en la base de datos pero no estaba en el repositorio.
-- Se agrega tal cual está en producción, para que git y la base queden iguales.
-- Solo la llama registrar_asistencia_qr (después de validar celular + DNI).
-- No la puede ejecutar el público ni los usuarios no autenticados.
-- ============================================================

-- Un solo registro por socio y por día (regla "YA_REGISTRADO" de la función)
create unique index if not exists historial_asistencia_dni_fecha_unico
  on public.historial_asistencia (dni, fecha);

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
