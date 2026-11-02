// Fotos de la portada del socio y de la galería.
// Orden: 1) la última lista conocida de este celular (aparece al instante),
// 2) lo que diga el servidor, 3) la foto sola subida antes, 4) la foto por defecto.
// Si el servidor tarda más de 4 s y no hay nada conocido, se muestra la foto por defecto.
// Una sola lectura por carga. No bloquea el flujo (ver arranque.js).
const FONDO_POR_DEFECTO = 'images/fondo-defecto.jpg';
const FONDO_CLAVE_FOTOS = 'cyFondoFotos';
const FONDO_CLAVE_UNICA = 'cyFondoPortada';
const FONDO_ESPERA_MAX = 4000;
const FONDO_INTERVALO = 6500;
let _fondoPortadaPedido = false;
let _fondoAplicado = '';
let _pase = null; // { urls, idx, timer, capas }
window.cyFondoLista = [];

function fondoEsValido(url) {
  return typeof url === 'string' && /^https:\/\/.+\/storage\/v1\/object\/public\/fondo-portada\//.test(url);
}

function fondoLeerLocal(clave) {
  try { return localStorage.getItem(clave) || ''; } catch (e) { return ''; }
}
function fondoGuardarLocal(clave, valor) {
  try { if (valor) localStorage.setItem(clave, valor); else localStorage.removeItem(clave); } catch (e) {}
}

function fondoLimpiarLista(lista) {
  return (Array.isArray(lista) ? lista : []).filter(f => f && fondoEsValido(f.g) && fondoEsValido(f.t));
}

// Una sola foto (sin cambios): en la portada y en "Conocer el gym"
function fondoPintarUnica(url, esRespaldo) {
  const els = document.querySelectorAll('.cy-bg-photo, .ap-hero-photo');
  if (!els.length || !url || url === _fondoAplicado) return;
  _fondoAplicado = url;
  const img = new Image();
  img.onload = () => { if (_fondoAplicado === url) els.forEach(el => { el.style.backgroundImage = 'url("' + url + '")'; }); };
  img.onerror = () => { if (!esRespaldo && url !== FONDO_POR_DEFECTO) fondoPintarUnica(FONDO_POR_DEFECTO, true); };
  img.src = url;
}

// Varias fotos: cambian solas con un desvanecido suave
function fondoIniciarPase(urls) {
  const par = document.querySelector('.cy-bg-par');
  if (!par || urls.length < 2) return;
  const clave = urls.join('|');
  if (_pase && _pase.clave === clave) return;
  if (_pase && _pase.timer) clearInterval(_pase.timer);
  // Capas: dos fondos que se alternan
  if (!_pase || !_pase.capas) {
    const capas = [0, 1].map(() => {
      const d = document.createElement('div');
      d.className = 'cy-slide';
      par.appendChild(d);
      return d;
    });
    _pase = { capas, idx: -1, urls, clave, timer: null, vez: 0 };
  } else {
    _pase.urls = urls; _pase.clave = clave; _pase.idx = -1;
  }
  document.querySelectorAll('.cy-bg-photo').forEach(el => { el.style.opacity = '0'; });
  document.querySelectorAll('.ap-hero-photo').forEach(el => { el.style.backgroundImage = 'url("' + urls[0] + '")'; });
  mostrarSiguienteFoto();
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  _pase.timer = setInterval(() => { if (!document.hidden) mostrarSiguienteFoto(); }, FONDO_INTERVALO);
}

function mostrarSiguienteFoto() {
  if (!_pase) return;
  const p = _pase;
  p.idx = (p.idx + 1) % p.urls.length;
  const url = p.urls[p.idx];
  const img = new Image();
  img.onload = () => {
    if (!_pase || _pase !== p) return;
    const entra = p.capas[p.vez % 2], sale = p.capas[(p.vez + 1) % 2];
    entra.style.backgroundImage = 'url("' + url + '")';
    entra.classList.add('on');
    sale.classList.remove('on');
    p.vez++;
  };
  img.src = url;
}

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
    if (!respondio && !_fondoAplicado && !_pase) fondoPintarUnica(FONDO_POR_DEFECTO, true);
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
    if (!_fondoAplicado && !_pase) fondoPintarUnica(FONDO_POR_DEFECTO, true);
  } finally {
    clearTimeout(temporizador);
  }
}

function fondoAplicarLista(lista) {
  window.cyFondoLista = lista;
  const boton = document.getElementById('btnGaleriaQR');
  if (boton) boton.style.display = lista.length ? 'inline-flex' : 'none';
  if (lista.length === 1) fondoPintarUnica(lista[0].g);
  else if (lista.length > 1) fondoIniciarPase(lista.map(f => f.g));
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
  else cyCerrarGaleria();
});
