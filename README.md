# C&Y Fitness Gym

App web del gimnasio: `gym.html` (panel de administración y check-in por QR con `?qr=1`),
`sw.js` (service worker) e `images/`. Los datos viven en Supabase.

## Seguridad

- El panel usa **usuarios reales de Supabase Auth** (correo + contraseña). En el código
  no hay contraseñas guardadas.
- Las tablas `socios`, `historial_caja` e `historial_asistencia` solo las pueden leer y
  escribir los usuarios que están en la tabla `public.staff`.
- La pantalla pública del QR solo usa las funciones `consultar_socio_qr`,
  `registrar_asistencia_qr`, `registrar_prospecto_qr` y `premio_activo_qr`. El socio se
  identifica con **teléfono + DNI** (solo la primera vez en cada celular; queda guardado).
  Tras 8 intentos fallidos con un mismo teléfono, se bloquea 15 minutos.
- Los avisos de ingreso al celular (ntfy) los manda la base de datos al guardarse cada
  asistencia. El canal es aleatorio y está guardado en `admin_config`, no en la página.

Migración: `supabase/migrations/20261006000000_seguridad_auth_rls.sql`.

## Puesta en marcha del login (una sola vez)

Hay que hacerlo **todo junto**: en cuanto se aplica la migración, la versión vieja de
`gym.html` deja de ver los datos.

1. **Crear el usuario del personal.** En Supabase: *Authentication → Users → Add user →
   Create new user*. Pon el correo y una contraseña fuerte y marca *Auto Confirm User*.
2. **Desactivar el registro público.** En *Authentication → Sign In / Providers*, apaga
   *Allow new users to sign up*. (Aunque alguien se registrara, no estaría en `staff` y no
   vería nada, pero así queda más limpio).
3. **Aplicar la migración** `supabase/migrations/20261006000000_seguridad_auth_rls.sql`
   (en el *SQL Editor* de Supabase).
4. **Dar permiso al usuario** (en el *SQL Editor*):

   ```sql
   insert into public.staff (user_id, nombre)
   select id, 'Administrador' from auth.users where email = 'TU_CORREO@ejemplo.com';
   ```

5. **Subir `gym.html` y `sw.js` nuevos** al hosting donde está la app.
6. **Suscribirse al canal nuevo de avisos.** En el *SQL Editor*:
   `select valor from public.admin_config where clave = 'ntfy_topic';`
   En la app ntfy, suscríbete a ese nombre y borra la suscripción vieja
   (`gym-clisman-alertas-2026`, que ya es público).
7. En cada celular o PC del gimnasio: abrir la app, **recargar una vez** (el service worker
   puede mostrar la versión anterior en la primera carga) e iniciar sesión con el correo y la
   contraseña.

Los socios que ya tenían su número guardado verán una sola vez un aviso pidiéndoles
confirmar su DNI.

Para agregar más personal, repite los pasos 1 y 4. Para quitarle el acceso a alguien:
`delete from public.staff where user_id = (select id from auth.users where email = '...');`

## Cupones del socio (pantalla del QR)

Aparecen debajo de "Marcar asistencia" (y también en la pantalla de asistencia registrada).
Las reglas las calcula la base de datos (`supabase/migrations/20261007000000_cupones.sql`);
el estado llega en la misma consulta del QR, así que no hace más lento el registro.

| Cupón | Quién lo tiene | Vigencia |
|---|---|---|
| **Pase de invitado** | Socios activos cuyo plan no es interdiario | 1 por mes calendario (no se acumula) |
| **10% por pago anticipado** | Planes que mencionan "mes" o "personalizado", excepto interdiario | Hasta un día antes del vencimiento; una vez por periodo. Se reactiva al renovar |

Cada uso queda guardado en `public.cupones_uso` y manda un aviso al canal de ntfy. En el panel:
- **Ingreso → "Cupones usados hoy"**: se actualiza en vivo cuando un socio usa un cupón.
- **Invitar → Cupones**: historial por mes con totales (`listar_cupones_usados`,
  `supabase/migrations/20261007010000_cupones_panel.sql`).

## Cuaderno de caja

Botón **Cuaderno de caja** (pestaña Lista). Muestra los ingresos de un mes a la vez:
total del mes, lo de hoy, cuánto entró por inscripciones, renovaciones, adelantos y
cobros de deuda (tocando cada uno se filtra), buscador por nombre o DNI, y los
movimientos agrupados por día con su total.

- Los datos vienen de una sola consulta por mes (`cuaderno_caja`,
  `supabase/migrations/20261008000000_cuaderno.sql`), así carga rápido aunque el
  internet sea lento y no tiene el límite de 1000 filas.
- La inscripción muestra lo que se pagó **ese día** (antes se recalculaba con el precio
  actual del socio y cambiaba al renovar).
- **Ningún pago se pierde:** cada movimiento se guarda primero en el celular y luego se
  sube. Sin internet, aparece como "Por subir" y se sube solo al volver la conexión,
  sin duplicarse (`cliente_id`).

## App instalable y notificaciones propias

- **Instalar:** el panel y la pantalla del QR se instalan como apps separadas con el
  logo (`manifest-panel.json`, `manifest-qr.json`, íconos en `images/icon-*`).
- **Notificaciones (sin ntfy):** botón de la campana del panel → *Activar*. Al guardarse
  cada asistencia, la base (`_notificar_asistencia` → `_enviar_push`) llama a la Edge
  Function `cy-push` (`supabase/functions/cy-push`), que arma el mensaje con el estado del
  socio y lo envía a los celulares suscritos (`push_suscripciones`). Llegan con la app
  cerrada y el celular bloqueado. Migración: `supabase/migrations/20261010000000_push.sql`.
  Las llaves VAPID y el secreto están en `admin_config` (no en el código).
- **Voz en recepción:** con el panel abierto, anuncia los ingresos por QR.
- ntfy sigue funcionando en paralelo; para apagarlo:
  `delete from public.admin_config where clave = 'ntfy_topic';`

## Voz natural (IA) — gratis

La voz de bienvenida y los anuncios usan voz neuronal de **Google Gemini TTS** (nivel
gratuito, solo cuenta de Google) a través de la Edge Function `cy-voz` (solo personal).
Cada frase se genera una vez y se guarda en el bucket privado `voz` y en el celular: lo que
se repite suena al instante y no gasta cupo. Cada noche (`cy-voz-precalentar`, pg_cron) se
usa el cupo sobrante para preparar las bienvenidas de los socios más frecuentes. Sin
internet, sin clave o con el cupo agotado, se usa la voz del celular.

Para activarla: crear una clave gratis en aistudio.google.com (Get API key) y guardarla en
Supabase → Edge Functions → Secrets como `GEMINI_API_KEY`.
