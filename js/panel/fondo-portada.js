// Fotos de la portada y de la galería (máximo 8).
// Cada foto se guarda en dos tamaños: grande (portada y visor) y miniatura (cuadrícula).
// Una sola lista "orden" guarda el orden de pantalla: { tipo: 'g', foto:{g,t} } o { tipo: 'n', file, url }.
// La lista va a la base con admin_set_fondo_fotos (solo personal).
// Clásico (no módulo): mismo ámbito global que el resto del panel.
const FONDO_BUCKET = 'fondo-portada';
const FONDO_MAX_FOTOS = 8;
const FONDO_ANCHO_GRANDE = 1600;
const FONDO_ANCHO_MINI = 640;
const FONDO_PESO_MAX = 15 * 1024 * 1024;

let fotosActivas = [];   // [{ g, t }] las que están guardadas en la base
let orden = [];          // orden en pantalla, mezcla guardadas y nuevas

function fondoEstado(msg, color) {
  const e = document.getElementById('fpEstado');
  if (e) { e.textContent = msg; e.style.color = color || '#94a3b8'; }
}

function fondoRutaDesdeUrl(url) {
  const partes = String(url || '').split('/fondo-portada/');
  return partes.length === 2 ? partes[1] : null;
}

function fondoHayCambios() {
  if (orden.some(it => it.tipo === 'n')) return true;
  if (orden.length !== fotosActivas.length) return true;
  return orden.some((it, i) => it.foto !== fotosActivas[i]);
}

function fondoPintarLista() {
  const cont = document.getElementById('fpLista');
  const guardar = document.getElementById('fpGuardar');
  if (!cont) return;
  cont.innerHTML = '';
  if (!orden.length) {
    cont.innerHTML = '<p style="color:#94a3b8; font-size:13px; margin:0;">Sin fotos: la portada usa la foto por defecto.</p>';
  }
  orden.forEach((it, pos) => {
    const url = it.tipo === 'g' ? it.foto.t : it.url;
    const fila = document.createElement('div');
    fila.className = 'fp-item';
    fila.innerHTML =
      '<img src="' + url + '" alt="Foto ' + (pos + 1) + '">' +
      '<span class="fp-num">' + (pos + 1) + '</span>' +
      '<div class="fp-acc">' +
        '<button type="button" title="Subir" onclick="cyFondoMover(' + pos + ',-1)"' + (pos === 0 ? ' disabled' : '') + '><i class="fa-solid fa-arrow-up"></i></button>' +
        '<button type="button" title="Bajar" onclick="cyFondoMover(' + pos + ',1)"' + (pos === orden.length - 1 ? ' disabled' : '') + '><i class="fa-solid fa-arrow-down"></i></button>' +
        '<button type="button" title="Quitar" onclick="cyFondoQuitarFoto(' + pos + ')"><i class="fa-solid fa-xmark"></i></button>' +
      '</div>';
    cont.appendChild(fila);
  });
  if (guardar) guardar.disabled = !fondoHayCambios();
}

window.cyFondoMover = function (pos, dir) {
  const destino = pos + dir;
  if (destino < 0 || destino >= orden.length) return;
  [orden[pos], orden[destino]] = [orden[destino], orden[pos]];
  fondoPintarLista();
};

window.cyFondoQuitarFoto = function (pos) {
  const it = orden[pos];
  if (!it) return;
  if (it.tipo === 'n') URL.revokeObjectURL(it.url);
  orden.splice(pos, 1);
  fondoPintarLista();
  fondoEstado('Quitaste una foto. Pulsa Guardar fotos para confirmar.');
};

// Fotos elegidas: se validan y se añaden al final, hasta el máximo
window.cyFondoElegido = function (input) {
  const archivos = Array.from(input.files || []);
  input.value = '';
  if (!archivos.length) return;
  let aceptadas = 0;
  for (const f of archivos) {
    if (orden.length >= FONDO_MAX_FOTOS) { mostrarToast('Solo caben 8 fotos en total', '#f59e0b'); break; }
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { mostrarToast('⚠️ ' + f.name + ': solo JPG, PNG o WebP', '#f59e0b'); continue; }
    if (f.size > FONDO_PESO_MAX) { mostrarToast('⚠️ ' + f.name + ' pasa de 15 MB', '#f59e0b'); continue; }
    orden.push({ tipo: 'n', file: f, url: URL.createObjectURL(f) });
    aceptadas++;
  }
  fondoPintarLista();
  if (aceptadas) fondoEstado('Listas para guardar: ' + aceptadas + ' foto(s) nueva(s).');
};

// Reducir a un ancho máximo y convertir a WebP (o PNG si el navegador no lo soporta)
function fondoReducir(file, ancho) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, ancho / img.naturalWidth);
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => (b ? resolve(b) : reject(new Error('no se pudo preparar la imagen'))), 'image/webp', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('una imagen no se pudo leer')); };
    img.src = url;
  });
}

async function fondoSubirVersion(blob, nombre) {
  const { error } = await supabaseClient.storage.from(FONDO_BUCKET)
    .upload(nombre, blob, { contentType: blob.type, cacheControl: '3600' });
  if (error) throw error;
  return supabaseClient.storage.from(FONDO_BUCKET).getPublicUrl(nombre).data.publicUrl;
}

window.cyGuardarFondo = async function () {
  const btn = document.getElementById('fpGuardar');
  btn.disabled = true;
  try {
    const stamp = Date.now();
    const nuevas = orden.filter(it => it.tipo === 'n').length;
    let i = 0;
    const lista = [];
    for (const it of orden) {
      if (it.tipo === 'g') { lista.push({ g: it.foto.g, t: it.foto.t }); continue; }
      i++;
      fondoEstado('Subiendo foto ' + i + ' de ' + nuevas + '…');
      const base = 'portada-' + stamp + '-' + i;
      const grande = await fondoReducir(it.file, FONDO_ANCHO_GRANDE);
      const mini = await fondoReducir(it.file, FONDO_ANCHO_MINI);
      const g = await fondoSubirVersion(grande, base + '-g.' + (grande.type === 'image/webp' ? 'webp' : 'png'));
      const t = await fondoSubirVersion(mini, base + '-t.' + (mini.type === 'image/webp' ? 'webp' : 'png'));
      lista.push({ g, t });
    }

    fondoEstado('Guardando la lista…');
    const { error } = await supabaseClient.rpc('admin_set_fondo_fotos', { p_fotos: lista });
    if (error) throw error;

    // Borrar del almacenamiento las fotos que se quitaron
    const seguir = new Set(lista.flatMap(f => [fondoRutaDesdeUrl(f.g), fondoRutaDesdeUrl(f.t)]));
    const quitar = fotosActivas.flatMap(f => [fondoRutaDesdeUrl(f.g), fondoRutaDesdeUrl(f.t)]).filter(r => r && !seguir.has(r));
    if (quitar.length) await supabaseClient.storage.from(FONDO_BUCKET).remove(quitar);

    // Ahora todas son guardadas, en el orden elegido
    orden = lista.map(foto => ({ tipo: 'g', foto }));
    fotosActivas = lista;
    fondoPintarLista();
    fondoEstado('✅ Fotos guardadas. Se verán en la portada al abrirla.', '#10b981');
    mostrarToast('✅ Fotos de la portada actualizadas', '#10b981');
  } catch (e) {
    console.error('Fotos no guardadas:', e);
    fondoEstado('No se guardó: ' + (e.message || e), '#ef4444');
    btn.disabled = false;
  }
};

window.cyQuitarFondo = async function () {
  if (!confirm('¿Quitar todas las fotos y volver a la foto por defecto?')) return;
  try {
    const { error } = await supabaseClient.rpc('admin_set_fondo_fotos', { p_fotos: [] });
    if (error) throw error;
    await supabaseClient.rpc('admin_set_fondo_portada', { p_url: null }).catch(() => {});
    orden.forEach(it => { if (it.tipo === 'n') URL.revokeObjectURL(it.url); });
    orden = [];
    fotosActivas = [];
    fondoPintarLista();
    fondoEstado('Ahora la portada usa la foto por defecto.', '#10b981');
  } catch (e) {
    console.error('No se pudo quitar las fotos:', e);
    fondoEstado('No se pudo quitar: ' + (e.message || e), '#ef4444');
  }
};

// Al abrir el panel: muestra las fotos activas
async function fondoCargarActual() {
  try {
    const { data, error } = await supabaseClient.rpc('fondo_fotos_lista');
    if (error) throw error;
    fotosActivas = Array.isArray(data) ? data.filter(f => f && f.g && f.t) : [];
    orden = fotosActivas.map(foto => ({ tipo: 'g', foto }));
    fondoPintarLista();
    fondoEstado(fotosActivas.length ? fotosActivas.length + ' foto(s) activa(s).' : 'Sin fotos: la portada usa la foto por defecto.');
  } catch (e) {
    fondoEstado('No se pudo leer las fotos actuales.', '#f59e0b');
  }
}
document.addEventListener('DOMContentLoaded', fondoCargarActual);
