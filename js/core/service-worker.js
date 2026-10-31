// Registro del Service Worker (caché de la app).
// Clásico (no módulo): mismo ámbito global y mismo orden que antes.
  // Registro del Service Worker: hace que la app cargue instantánea
  // en visitas repetidas (después de la primera vez). Si el navegador
  // no lo soporta, simplemente no pasa nada — el sistema sigue
  // funcionando igual, solo sin ese extra de velocidad.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .catch((err) => console.error('No se pudo registrar el Service Worker:', err));
    });
  }
