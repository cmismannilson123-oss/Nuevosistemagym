// Fotos de la portada del socio, de "Conocer el gym" y de la galería.
// Orden: 1) la última lista conocida de este celular (aparece al instante),
// 2) lo que diga el servidor, 3) la foto sola subida antes, 4) la foto por defecto.
// Si el servidor tarda más de 4 s y no hay nada conocido, se muestra la foto por defecto.
// Una sola lectura por carga. No bloquea el flujo (ver arranque.js).
const FONDO_POR_DEFECTO = 'images/fondo-defecto.jpg';
const FONDO_CLAVE_FOTOS = 'cyFondoFotos';
const FONDO_CLAVE_UNICA = 'cyFondoPortada';
const FONDO_ESPERA_MAX = 4000;
let _fondoPortadaPedido = false;
let _fondoAplicado = '';
const _pases = {};   // id -> { capas, urls, i, vez, paso, timer, activo, clave }
window.cyFondoLista = [];

function fondoEsValido(url) {
  return typeof url === 'string' && /^https:\/\/.+\/storage\/v1\/object\/public\/fondo-portada\//.test(url);
}
function fondoLeerLocal(clave) { try { return localStorage.getItem(clave) || ''; } catch (e) { return ''; } }
function fondoGuardarLocal(clave, valor) {
  try { if (valor) localStorage.setItem(clave, valor); else localStorage.removeItem(clave); } catch (e) {}
}
function fondoLimpiarLista(lista) {
  return (Array.isArray(lista) ? lista : []).filter(f => f && fondoEsValido(f.g) && fondoEsValido(f.t));
}
function fondoMovimientoReducido() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// Una sola foto (sin cambios): portada y "Conocer el gym"
function fondoPintarUnica(url, esRespaldo) {
  const els = document.querySelectorAll('.cy-bg-photo');
  if (!els.length || !url || url === _fondoAplicado) return;
  _fondoAplicado = url;
  const img = new Image();
  img.onload = () => { if (_fondoAplicado === url) els.forEach(el => { el.style.backgroundImage = 'url("' + url + '")'; }); };
  img.onerror = () => { if (!esRespaldo && url !== FONDO_POR_DEFECTO) fondoPintarUnica(FONDO_POR_DEFECTO, true); };
  img.src = url;
}

// Varias fotos: cambian solas con transición. Se alternan cambios lentos y rápidos:
// lento = 5 s de pausa y fundido de 1,8 s; rápido = 2,2 s de pausa y fundido de 0,7 s.
function fondoPase(id, contenedor, urls) {
  if (!contenedor || urls.length < 2) return;
  const clave = urls.join('|');
  let p = _pases[id];
  if (p && p.clave === clave) return;
  if (p) { clearTimeout(p.timer); p.activo = false; }
  if (!p) {
    p = { capas: [0, 1].map(() => {
      const d = document.createElement('div');
      d.className = 'cy-slide';
      contenedor.appendChild(d);
      return d;
    }) };
    _pases[id] = p;
  }
  Object.assign(p, { clave, urls, i: -1, vez: 0, paso: 0, timer: null, activo: true });
  if (id === 'portada') document.querySelectorAll('.cy-bg-photo').forEach(el => { el.style.opacity = '0'; });
  // La primera foto se muestra ya, sin esperar a las demás
  fondoCargar(urls[0], () => { if (p.activo) { p.i = 0; fondoPoner(p, urls[0], 0); programarCambio(p); } });
}

function fondoCargar(url, alCargar) {
  const img = new Image();
  img.onload = () => alCargar(false);
  img.onerror = () => alCargar(true);
  img.src = url;
}

function fondoPoner(p, url, duracion) {
  const entra = p.capas[p.vez % 2], sale = p.capas[(p.vez + 1) % 2];
  entra.style.backgroundImage = 'url("' + url + '")';
  entra.style.transitionDuration = duracion + 'ms';
  entra.classList.add('on');
  sale.classList.remove('on');
  p.vez++;
}

function programarCambio(p) {
  if (!p.activo || fondoMovimientoReducido()) return;
  const lento = p.paso % 2 === 0;
  const pausa = lento ? 5000 : 2200;
  p.timer = setTimeout(() => siguienteFoto(p), pausa);
}

function siguienteFoto(p) {
  if (!p.activo) return;
  if (document.hidden) { p.timer = null; return; } // se reanuda al volver a la pestaña
  p.i = (p.i + 1) % p.urls.length;
  const url = p.urls[p.i];
  const fundido = p.paso % 2 === 0 ? 1800 : 700;
  fondoCargar(url, error => {
    if (!p.activo) return;
    if (!error) fondoPoner(p, url, fundido);
    p.paso++;
    programarCambio(p);
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  Object.values(_pases).forEach(p => { if (p.activo && !p.timer) programarCambio(p); });
});

async function cyAplicarFondoPortada() {
  if (_fondoPortadaPedido) return;
  _fondoPortadaPedido = true;

  // 1) Lo último conocido de este celular: se muestra al instante
  let conocida = [];
  try { conocida = fondoLimpiarLista(JSON.parse(fondoLeerLocal(FONDO_CLAVE_FOTOS) || '[]')); } catch (e) {}
  if (conocida.length) fondoAplicarLista(conocida);
  else {
    const unica = fondoLeerLocal(FONDO_CLAVE_UNICA);
    if (fondoEsValido(unica)) fondoPintarUnica(unica);
  }

  // 2) Lo que dice el servidor, con límite de espera
  let respondio = false;
  const temporizador = setTimeout(() => {
    if (!respondio && !_fondoAplicado && !Object.keys(_pases).length) fondoPintarUnica(FONDO_POR_DEFECTO, true);
  }, FONDO_ESPERA_MAX);
  try {
    if (typeof supabaseClient === 'undefined') throw new Error('sin cliente');
    const { data, error } = await supabaseClient.rpc('fondo_fotos_lista');
    respondio = true;
    if (error) throw error;
    const lista = fondoLimpiarLista(data);
    if (lista.length) {
      fondoGuardarLocal(FONDO_CLAVE_FOTOS, JSON.stringify(lista));
      fondoGuardarLocal(FONDO_CLAVE_UNICA, '');
      fondoAplicarLista(lista);
    } else {
      fondoGuardarLocal(FONDO_CLAVE_FOTOS, '');
      // Compatibilidad: una sola foto guardada antes
      const { data: unica } = await supabaseClient.rpc('fondo_portada_url');
      if (fondoEsValido(unica)) { fondoGuardarLocal(FONDO_CLAVE_UNICA, unica); fondoPintarUnica(unica); }
      else { fondoGuardarLocal(FONDO_CLAVE_UNICA, ''); fondoPintarUnica(FONDO_POR_DEFECTO, true); }
    }
  } catch (e) {
    respondio = true;
    if (!_fondoAplicado && !Object.keys(_pases).length) fondoPintarUnica(FONDO_POR_DEFECTO, true);
  } finally {
    clearTimeout(temporizador);
  }
}

function fondoAplicarLista(lista) {
  window.cyFondoLista = lista;
  const boton = document.getElementById('btnGaleriaQR');
  if (boton) boton.style.display = lista.length ? 'inline-flex' : 'none';
  if (lista.length === 1) { fondoPintarUnica(lista[0].g); return; }
  if (lista.length > 1) {
    fondoPase('portada', document.querySelector('.cy-bg-par'), lista.map(f => f.g));
  }
}

// ---------- Galería (cuadrícula + visor) ----------
window.cyAbrirGaleria = function () {
  const lista = window.cyFondoLista || [];
  const cont = document.getElementById('galeriaQR');
  const grid = document.getElementById('galeriaGrid');
  if (!lista.length || !cont || !grid) return;
  grid.innerHTML = '';
  lista.forEach((f, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cy-gal-item' + (i === 0 ? ' cy-gal-item--ancha' : '');
    b.style.setProperty('--i', i);
    b.setAttribute('aria-label', 'Ver foto ' + (i + 1));
    b.onclick = () => cyVerFoto(f.g);
    const img = document.createElement('img');
    img.src = f.t; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    b.appendChild(img);
    grid.appendChild(b);
  });
  cont.style.display = 'flex';
  requestAnimationFrame(() => cont.classList.add('on'));
};

window.cyCerrarGaleria = function () {
  const cont = document.getElementById('galeriaQR');
  if (!cont) return;
  cyCerrarVisor();
  cont.classList.remove('on');
  setTimeout(() => { if (!cont.classList.contains('on')) cont.style.display = 'none'; }, 350);
};

window.cyVerFoto = function (url) {
  const visor = document.getElementById('galeriaVisor');
  const img = document.getElementById('galeriaVisorImg');
  if (!visor || !img) return;
  img.onload = () => visor.classList.add('on');
  img.src = url;
  visor.style.display = 'flex';
  requestAnimationFrame(() => visor.classList.add('on'));
};

window.cyCerrarVisor = function () {
  const visor = document.getElementById('galeriaVisor');
  if (!visor) return;
  visor.classList.remove('on');
  setTimeout(() => { if (!visor.classList.contains('on')) visor.style.display = 'none'; }, 300);
};

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const visor = document.getElementById('galeriaVisor');
  if (visor && visor.classList.contains('on')) cyCerrarVisor();
  else window.cyCerrarGaleria();
});
