# C&Y Fitness Gym

App web del gimnasio: `gym.html` (panel de administración y check-in por QR con `?qr=1`),
`sw.js` (service worker) e `images/`. Los datos viven en Supabase.

## Seguridad

- El panel usa **usuarios reales de Supabase Auth** (correo + contraseña). En el código
  no hay contraseñas guardadas.
- Las tablas `socios`, `historial_caja` e `historial_asistencia` solo las pueden leer y
  escribir los usuarios que están en la tabla `public.staff`.
- La pantalla pública del QR solo usa las funciones `consultar_socio_qr`,
  `registrar_asistencia_publica`, `registrar_prospecto_qr` y `premio_activo_qr`.

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
6. En cada celular o PC del gimnasio: abrir la app, **recargar una vez** (el service worker
   puede mostrar la versión anterior en la primera carga) e iniciar sesión con el correo y la
   contraseña.

Para agregar más personal, repite los pasos 1 y 4. Para quitarle el acceso a alguien:
`delete from public.staff where user_id = (select id from auth.users where email = '...');`
