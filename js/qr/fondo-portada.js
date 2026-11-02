// Fondo de la portada del socio.
// Orden: 1) el último fondo conocido de este celular (si existe), 2) lo que diga el
// servidor, 3) la foto por defecto si no hay fondo subido o si el servidor no responde.
// Así no se descarga la foto por defecto cuando ya hay un fondo subido, y nunca se
// queda esperando: si el servidor tarda, en 4 s se muestra la foto por defecto.
// No bloquea el flujo: se llama sin esperar (ver arranque.js).
const FONDO_POR_DEFECTO = 'https://images.unsplash.com/photo-1744551154623-4b5336e95c28?q=80&w=1400&auto=format&fit=crop';
const FONDO_CLAVE_LOCAL = 'cyFondoPortada';
const FONDO_ESPERA_MAX = 4000;
let _fondoPortadaPedido = false;
let _fondoPortadaAplicado = '';

function fondoEsValido(url) {
  return typeof url === 'string' && /^https:\/\/.+\/storage\/v1\/object\/public\/fondo-portada\//.test(url);
}

function fondoPintar(url) {
  const el = document.querySelector('.cy-bg-photo');
  if (!el || !url || url === _fondoPortadaAplicado) return;
  _fondoPortadaAplicado = url;
  const img = new Image();
  img.onload = () => { if (_fondoPortadaAplicado === url) el.style.backgroundImage = 'url("' + url + '")'; };
  img.src = url;
}

function fondoLeerLocal() {
  try { const v = localStorage.getItem(FONDO_CLAVE_LOCAL); return fondoEsValido(v) ? v : ''; } catch (e) { return ''; }
}
function fondoGuardarLocal(url) {
  try { if (url) localStorage.setItem(FONDO_CLAVE_LOCAL, url); else localStorage.removeItem(FONDO_CLAVE_LOCAL); } catch (e) {}
}

async function cyAplicarFondoPortada() {
  if (_fondoPortadaPedido) return; // una sola lectura por carga de página
  _fondoPortadaPedido = true;

  // 1) Lo último conocido de este celular: se muestra de inmediato
  const local = fondoLeerLocal();
  if (local) fondoPintar(local);

  // 2) Lo que dice el servidor, con límite de espera
  let respondio = false;
  const temporizador = setTimeout(() => {
    if (!respondio && !_fondoPortadaAplicado) fondoPintar(FONDO_POR_DEFECTO);
  }, FONDO_ESPERA_MAX);
  try {
    if (typeof supabaseClient === 'undefined') throw new Error('sin cliente');
    const { data, error } = await supabaseClient.rpc('fondo_portada_url');
    respondio = true;
    if (error) throw error;
    if (fondoEsValido(data)) {
      fondoGuardarLocal(data);
      fondoPintar(data);
    } else {
      fondoGuardarLocal('');
      fondoPintar(FONDO_POR_DEFECTO);
    }
  } catch (e) {
    respondio = true;
    if (!_fondoPortadaAplicado) fondoPintar(FONDO_POR_DEFECTO);
  } finally {
    clearTimeout(temporizador);
  }
}
