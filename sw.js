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

const CACHE_NAME = 'cy-fitness-gym-v55';

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

const ARCHIVOS_APP = [
  './',
  './gym.html',
  './images/logo-cy.png',
  './images/catalogo-thumb-1.png',
  './images/catalogo-thumb-2.png',
  './images/catalogo-thumb-3.png',
  './images/catalogo-thumb-4.png',
  './images/promo-thumb.jpg',
  './images/promo-renueva.jpg',
  './images/catalogo-full-1.jpg',
  './images/catalogo-full-2.jpg',
  './images/catalogo-full-3.jpg',
  './images/catalogo-full-4.jpg',
  './images/catalogo-full-5.jpg',
  './images/catalogo-full-6.jpg',
  './images/catalogo-full-7.jpg',
  './images/catalogo-full-8.jpg',
  './images/catalogo-full-9.jpg',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://images.unsplash.com/photo-1744551154623-4b5336e95c28?q=80&w=1400&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1744551154623-4b5336e95c28?q=80&w=900&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1744551154623-4b5336e95c28?q=80&w=500&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?q=80&w=500&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1524594152303-9fd13543fe6e?q=80&w=600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1524594152303-9fd13543fe6e?q=80&w=500&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1556817411-92f5ec899a55?q=80&w=500&auto=format&fit=crop'
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
