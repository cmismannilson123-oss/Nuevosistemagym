-- Entrega garantizada de los avisos al APK (Android) y reintentos de intentos rechazados.
-- 1) La cola guarda una clave única por aviso (asistencia o intento), no solo la asistencia.
alter table public.push_pendientes alter column asistencia_id drop not null;
alter table public.push_pendientes add column if not exists clave text;
update public.push_pendientes set clave = 'asist-' || asistencia_id where clave is null;
alter table public.push_pendientes alter column clave set not null;
create unique index if not exists push_pendientes_clave on public.push_pendientes (clave);

create or replace function public._notificar_asistencia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_topic text;
  v_id bigint;
  s record;
  v_fecha text := '^(\d{4})-(\d{2})-(\d{2})$';
begin
  -- 1) Aviso propio (cola + envío inmediato). Un fallo aquí no frena el registro.
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

  -- 2) ntfy, como respaldo mientras exista el canal
  begin
    select valor into v_topic from public.admin_config where clave = 'ntfy_topic';
    if v_topic is not null then
      select tipo_memb, inicio, fecha_fin, dias_restantes into s from public.socios where dni = new.dni limit 1;
      perform net.http_post(
        url := 'https://ntfy.sh/',
        body := jsonb_build_object('topic', v_topic, 'title', '🏋️ C&Y Fitness Gym', 'priority', 4,
          'tags', jsonb_build_array('dumbbell'),
          'message', format(E'Ingreso registrado (%s): %s.\nPlan: %s.\nInicio: %s | Vence: %s.\nRestan: %s asistencias.',
            coalesce(new.metodo, 'Manual'), new.nombre, coalesce(s.tipo_memb, '-'),
            coalesce(regexp_replace(s.inicio, v_fecha, '\3/\2/\1'), '--/--/----'),
            coalesce(regexp_replace(s.fecha_fin, v_fecha, '\3/\2/\1'), '--/--/----'),
            greatest(0, coalesce(s.dias_restantes, 0) - 1))),
        headers := '{"Content-Type": "application/json"}'::jsonb);
    end if;
  exception when others then
    raise warning 'ntfy no enviado: %', sqlerrm;
  end;
  return new;
end;
$$;

-- 2) Cada intento rechazado entra a la cola, igual que un ingreso, y se envía con su identificador
create or replace function public._notificar_intento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_id bigint;
begin
  begin
    insert into public.push_pendientes (clave, evento)
    values ('intento-' || new.id, jsonb_build_object('tipo', 'intento', 'dni', new.dni, 'nombre', new.nombre, 'motivo', new.motivo))
    on conflict (clave) do nothing
    returning id into v_id;
    if v_id is not null then
      perform public._enviar_push(jsonb_build_object('tipo', 'intento', 'pendiente_id', v_id,
        'dni', new.dni, 'nombre', new.nombre, 'motivo', new.motivo));
    end if;
  exception when others then
    raise warning 'aviso de intento no encolado: %', sqlerrm;
  end;
  return new;
end;
$$;

-- 3) El reenvío insiste más (hasta 30 veces, unos 30 minutos) antes de rendirse
create or replace function public._reenviar_pendientes()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r record;
begin
  for r in
    select p.id, p.evento from public.push_pendientes p
     where p.enviado_en is null
       and p.creado_en < now() - interval '25 seconds'
       and p.creado_en > now() - interval '3 hours'
       and p.intentos < 30
     order by p.id limit 30
  loop
    update public.push_pendientes set intentos = intentos + 1 where id = r.id;
    perform public._enviar_push(r.evento || jsonb_build_object('pendiente_id', r.id));
  end loop;
end;
$$;

