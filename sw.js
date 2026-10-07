// ============================================================
// SERVICE WORKER — C&Y FITNESS GYM
// ============================================================
// Qué hace: después de la primera visita, guarda una copia de la
// app en el celular de la persona. Las siguientes veces, la
// pantalla aparece INSTANTÁNEA (sin descargar nada), y en
// segundo plano revisa si hay una versión más nueva para la
// próxima vez.
//
// IMPORTANTE: las consultas a Supabase (buscar socio, marcar
// asistencia, etc.) NUNCA se guardan en caché — esas siempre
// van a internet en tiempo real, como debe ser. Este Service
// Worker acelera la CARGA de la página en sí (el diseño, los
// botones, el código, los íconos, las fotos y las librerías
// externas que usa), nunca los datos reales del gimnasio.
//
// Nota sobre el flujo del QR: la validación de si un socio está
// al día SIEMPRE necesita internet real (es información que
// puede cambiar en cualquier momento), así que ese paso puntual
// no se puede acelerar con caché. Lo que SÍ logra este archivo es
// que todo lo demás (pantalla, botones, íconos, fotos, y las
// librerías de las que depende la app) cargue al instante desde
// el primer segundo, incluso con internet lento o momentáneamente
// caído, para que esa consulta puntual sea lo único que dependa
// de la señal del socio.
//
// Si vuelves a actualizar gym.html en el futuro, sube también
// este archivo cambiando el número de versión de abajo
// (CACHE_NAME) — así el celular de la gente descarta la copia
// vieja y toma la nueva automáticamente.
// ============================================================

const CACHE_NAME = 'cy-fitness-gym-v71';

// Dominios externos de los que es seguro guardar copia (son archivos estáticos:
// librerías, íconos, fuentes, fotos — nunca datos de socios). Cualquier petición
// a Supabase (u otro dominio no listado aquí) sigue yendo siempre a internet en
// tiempo real, sin pasar por caché.
const HOSTS_EXTERNOS_CACHEABLES = [
  'cdnjs.cloudflare.com',   // Font Awesome, html2canvas, qrcodejs
  'cdn.jsdelivr.net',       // librería de Supabase (el código, no los datos)
  'images.unsplash.com',    // fotos de fondo/decorativas
  'fonts.googleapis.com',   // tipografía de marca (CSS)
  'fonts.gstatic.com'       // tipografía de marca (archivos)
];

// Solo lo indispensable para que la pantalla abra (unos 300 KB). Las fotos del
// catálogo y de fondo NO se descargan al instalar: con internet lento competían
// con "Marcar asistencia" la primera vez que el socio escaneaba. Se guardan
// solas la primera vez que se ven (ver el manejador 'fetch' de abajo).
const ARCHIVOS_APP = [
  './',
  './gym.html',
  './images/logo-cy.png',
  './images/icon-192.png',
  './images/badge-96.png',
  './manifest-panel.json',
  './manifest-qr.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

// Al instalarse: guarda una primera copia de la app y de las librerías/fotos
// externas. Si alguna falla (por ejemplo, sin internet en el primerísimo
// instante), no rompe la instalación — cada una se cachea por separado.
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        ARCHIVOS_APP.map((url) =>
          cache.add(url).catch((err) => console.warn('SW: no se pudo pre-cachear', url, err))
        )
      )
    )
  );
});

// Al activarse: borra copias de versiones anteriores para no acumular espacio
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((nombres) =>
        Promise.all(
          nombres
            .filter((nombre) => nombre !== CACHE_NAME)
            .map((nombre) => caches.delete(nombre))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Al pedir un archivo: responde al instante con la copia guardada (si existe).
//
// Hay dos estrategias distintas, a propósito:
// - Tu propia página (gym.html, este mismo sw.js, etc.): además de responder
//   con la copia guardada, en paralelo revisa si hay una versión más nueva
//   para la próxima vez — así seguís recibiendo tus actualizaciones.
// - Librerías y fotos externas (Font Awesome, Supabase JS, las fotos de
//   Unsplash): esas prácticamente nunca cambian una vez que quedaron
//   guardadas, así que NO se vuelven a pedir de nuevo en cada escaneo. Esto es
//   justamente lo que hacía sentir "Verificando..." un poco más lento: esas
//   ~13 peticiones de fondo competían por la misma conexión del celular justo
//   mientras se esperaba la respuesta real de Supabase. Ahora, una vez
//   guardadas, se sirven directo desde el celular, sin tocar la red — dejando
//   toda la conexión disponible para lo único que de verdad necesita internet
//   en vivo: la consulta a Supabase.
self.addEventListener('fetch', (event) => {
  const peticion = event.request;

  if (peticion.method !== 'GET') return;

  const url = new URL(peticion.url);
  const esPropio = url.origin === self.location.origin;
  const esExternoCacheable = HOSTS_EXTERNOS_CACHEABLES.includes(url.hostname);

  // Todo lo que NO sea nuestro sitio ni uno de los CDN/fotos de la lista de
  // arriba (por ejemplo, cualquier petición a Supabase) sigue yendo siempre
  // directo a internet, sin pasar por aquí — sin caché, en tiempo real.
  if (!esPropio && !esExternoCacheable) {
    return;
  }

  // Externo (librerías/fotos): cache-first puro. Si ya está guardado, se sirve
  // así nomás, sin ir a la red para nada. Solo se pide por internet la
  // primerísima vez que hace falta (o si por algún motivo no quedó guardado).
  if (esExternoCacheable) {
    event.respondWith(
      caches.match(peticion).then((respuestaGuardada) => {
        if (respuestaGuardada) return respuestaGuardada;
        return fetch(peticion).then((respuestaFresca) => {
          if (respuestaFresca && (respuestaFresca.status === 200 || respuestaFresca.type === 'opaque')) {
            const copia = respuestaFresca.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(peticion, copia));
          }
          return respuestaFresca;
        });
      })
    );
    return;
  }

  // Tu propia página: responde al instante con la copia guardada (si existe),
  // y en paralelo va a buscar la versión más reciente para la próxima vez.
  event.respondWith(
    caches.match(peticion).then((respuestaGuardada) => {
      const peticionRed = fetch(peticion)
        .then((respuestaFresca) => {
          if (respuestaFresca && respuestaFresca.status === 200) {
            const copia = respuestaFresca.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(peticion, copia));
          }
          return respuestaFresca;
        })
        .catch(() => respuestaGuardada); // Sin internet: usamos lo último que quedó guardado

      // Si ya hay una copia guardada, la mostramos YA (instantáneo).
      // Si es la primerísima vez, esperamos la respuesta de internet.
      return respuestaGuardada || peticionRed;
    })
  );
});


// ============================================================
// NOTIFICACIONES PROPIAS (Web Push, sin ntfy)
// Las envía la Edge Function "cy-push" cuando un socio ingresa. Llegan
// aunque la app esté cerrada y el celular bloqueado.
// ============================================================
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; }
  catch (e) { d = { title: 'C&Y Fitness Gym', body: event.data ? event.data.text() : '' }; }
  const titulo = d.title || 'C&Y Fitness Gym';
  // Si el panel está abierto, se le avisa para que actualice la lista al
  // instante (aunque su conexión en vivo se haya cortado) y, si la voz está
  // activada, anuncie el ingreso.
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((vs) => {
    vs.forEach((v) => v.postMessage({ tipo: 'cy-push', dni: d.dni, nombre: d.nombre, metodo: d.metodo, tag: d.tag }));
  }).catch(() => {}));
  event.waitUntil(self.registration.showNotification(titulo, {
    body: d.body || '',
    icon: './images/icon-192.png',
    badge: './images/badge-96.png',
    tag: d.tag || 'cy-aviso',
    renotify: true,
    vibrate: [180, 90, 180],
    timestamp: Date.now(),
    data: { url: d.url || './?app=panel' }
  }));
});

// Al tocar la notificación: abre el panel (o lo trae al frente si ya está abierto)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = new URL((event.notification.data && event.notification.data.url) || './?app=panel', self.registration.scope).href;
  event.waitUntil((async () => {
    const ventanas = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const v of ventanas) {
      if (v.url.startsWith(self.registration.scope) && !v.url.includes('qr=1') && 'focus' in v) return v.focus();
    }
    if (clients.openWindow) return clients.openWindow(destino);
  })());
});
