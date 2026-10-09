-- ============================================================
-- AVISOS DE INGRESO CONFIABLES
-- Antes: el aviso salía al guardarse la asistencia y nadie comprobaba que
-- llegara; si la llamada se perdía o se demoraba, el ingreso no se avisaba.
-- Ahora: cada ingreso se guarda en push_pendientes con su hora exacta, se
-- envía al instante, y si no se confirma, un proceso revisa cada minuto y
-- reenvía. Cada aviso lleva la hora real del ingreso.
-- ============================================================
create table if not exists public.push_pendientes (
  id           bigint generated always as identity primary key,
  asistencia_id bigint not null unique,
  evento       jsonb not null,
  creado_en    timestamptz not null default now(),
  enviado_en   timestamptz,
  intentos     int not null default 0
);
create index if not exists push_pendientes_pend on public.push_pendientes (creado_en) where enviado_en is null;
alter table public.push_pendientes enable row level security;   -- sin políticas: solo la base y la función

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
    insert into public.push_pendientes (asistencia_id, evento)
    values (new.id, jsonb_build_object('tipo', 'ingreso', 'dni', new.dni, 'nombre', new.nombre,
            'metodo', coalesce(new.metodo, 'Manual'), 'hora', new.hora, 'fecha', new.fecha))
    on conflict (asistencia_id) do nothing
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

-- Revisa cada minuto los avisos que no se confirmaron y los reenvía
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
       and p.creado_en < now() - interval '25 seconds'   -- el envío inmediato tiene su tiempo
       and p.creado_en > now() - interval '3 hours'
       and p.intentos < 6
     order by p.id limit 30
  loop
    update public.push_pendientes set intentos = intentos + 1 where id = r.id;
    perform public._enviar_push(r.evento || jsonb_build_object('pendiente_id', r.id));
  end loop;
end;
$$;
revoke all on function public._reenviar_pendientes() from public, anon, authenticated;

select cron.schedule('cy-push-reintentos', '* * * * *', 'select public._reenviar_pendientes()');
