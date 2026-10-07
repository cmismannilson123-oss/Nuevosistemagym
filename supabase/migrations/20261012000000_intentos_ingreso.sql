-- ============================================================
-- INTENTOS DE INGRESO NO PERMITIDOS (QR)
-- Cuando un socio escanea el QR y su tarjeta sale vencida, agotada o
-- bloqueada por deuda, la página llama a avisar_intento_qr. La base decide
-- el motivo con los datos reales del socio (no confía en la página) y lo
-- anota en intentos_ingreso. El panel lo recibe en vivo (voz de recepción)
-- y llega también como notificación push.
-- ============================================================
create table if not exists public.intentos_ingreso (
  id        bigint generated always as identity primary key,
  dni       text not null,
  nombre    text,
  motivo    text not null check (motivo in ('VENCIDO', 'AGOTADO', 'DEUDA')),
  creado_en timestamptz not null default now()
);
create index if not exists intentos_ingreso_dni_fecha on public.intentos_ingreso (dni, creado_en desc);
alter table public.intentos_ingreso enable row level security;
create policy "Staff ve intentos" on public.intentos_ingreso
  for select to authenticated using ((select public.es_staff()));
alter publication supabase_realtime add table public.intentos_ingreso;

create or replace function public.avisar_intento_qr(p_telefono text, p_dni text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.socios;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_motivo text;
  v_fin date;
begin
  if public._qr_bloqueado(p_telefono) then
    return jsonb_build_object('ok', false);
  end if;
  v := public._socio_qr(p_telefono, p_dni);
  if v.id is null then
    return jsonb_build_object('ok', false);
  end if;

  begin v_fin := left(v.fecha_fin, 10)::date; exception when others then v_fin := null; end;
  if coalesce(nullif(regexp_replace(coalesce(v.deuda, ''), '[^0-9.]', '', 'g'), '')::numeric, 0) > 0
     and v.fecha_deuda is not null and v_hoy - v.fecha_deuda > 7 then
    v_motivo := 'DEUDA';
  elsif position('interdiario' in lower(coalesce(v.tipo_memb, ''))) > 0 and coalesce(v.dias_restantes, 0) <= 0 then
    v_motivo := 'AGOTADO';
  elsif v_fin is null or v_fin < v_hoy then
    v_motivo := 'VENCIDO';
  end if;
  if v_motivo is null then
    return jsonb_build_object('ok', false);
  end if;

  -- Un mismo intento puede llegar dos veces (tarjeta + botón): se cuenta una
  if exists (select 1 from public.intentos_ingreso
              where dni = v.dni and creado_en > now() - interval '10 seconds') then
    return jsonb_build_object('ok', true, 'motivo', v_motivo);
  end if;
  insert into public.intentos_ingreso (dni, nombre, motivo) values (v.dni, v.nombre, v_motivo);
  return jsonb_build_object('ok', true, 'motivo', v_motivo);
end;
$$;
revoke all on function public.avisar_intento_qr(text, text) from public;
grant execute on function public.avisar_intento_qr(text, text) to anon, authenticated;

-- Aviso push al personal por cada intento
create or replace function public._notificar_intento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._enviar_push(jsonb_build_object(
    'tipo', 'intento', 'dni', new.dni, 'nombre', new.nombre, 'motivo', new.motivo));
  return new;
exception when others then
  return new;
end;
$$;
create trigger tr_notificar_intento after insert on public.intentos_ingreso
  for each row execute function public._notificar_intento();
