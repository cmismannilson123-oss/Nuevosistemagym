// Fondo de la pantalla del socio (portada del QR).
// El personal sube una foto desde el panel. La imagen se reduce en el navegador,
// se guarda en el almacenamiento (bucket "fondo-portada") y su dirección queda en
// la base mediante la función admin_set_fondo_portada (solo personal).
// Clásico (no módulo): mismo ámbito global que el resto del panel.
const FONDO_BUCKET = 'fondo-portada';
const FONDO_ANCHO_MAX = 1600;
const FONDO_PESO_MAX = 15 * 1024 * 1024;
let fondoElegido = null;

function fondoEstado(msg, color) {
  const e = document.getElementById('fpEstado');
  if (e) { e.textContent = msg; e.style.color = color || '#94a3b8'; }
}

function fondoPintarVista(url) {
  const img = document.getElementById('fpVista');
  if (!img) return;
  if (url) { img.src = url; img.style.display = 'block'; }
  else { img.removeAttribute('src'); img.style.display = 'none'; }
}

// Foto elegida: se valida y se muestra antes de guardar
window.cyFondoElegido = function (input) {
  const f = input.files && input.files[0];
  if (!f) return;
  if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
    mostrarToast('⚠️ Elige una imagen JPG, PNG o WebP', '#f59e0b');
    input.value = ''; return;
  }
  if (f.size > FONDO_PESO_MAX) {
    mostrarToast('⚠️ La imagen pasa de 15 MB', '#f59e0b');
    input.value = ''; return;
  }
  fondoElegido = f;
  fondoPintarVista(URL.createObjectURL(f));
  document.getElementById('fpGuardar').disabled = false;
  fondoEstado('Lista para guardar: ' + f.name);
};

// Reduce a un ancho máximo y convierte a WebP (o PNG si el navegador no lo soporta)
function fondoReducir(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, FONDO_ANCHO_MAX / img.naturalWidth);
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => (b ? resolve(b) : reject(new Error('no se pudo preparar la imagen'))), 'image/webp', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('la imagen no se pudo leer')); };
    img.src = url;
  });
}

window.cyGuardarFondo = async function () {
  if (!fondoElegido) return;
  const btn = document.getElementById('fpGuardar');
  btn.disabled = true;
  try {
    fondoEstado('Preparando la imagen…');
    const blob = await fondoReducir(fondoElegido);
    const ext = blob.type === 'image/webp' ? 'webp' : 'png';
    const ruta = 'portada-' + Date.now() + '.' + ext;

    fondoEstado('Subiendo…');
    const { error: eSubida } = await supabaseClient.storage.from(FONDO_BUCKET)
      .upload(ruta, blob, { contentType: blob.type, cacheControl: '3600' });
    if (eSubida) throw eSubida;

    const { data } = supabaseClient.storage.from(FONDO_BUCKET).getPublicUrl(ruta);
    const { error: eGuardar } = await supabaseClient.rpc('admin_set_fondo_portada', { p_url: data.publicUrl });
    if (eGuardar) throw eGuardar;

    fondoElegido = null;
    document.getElementById('fpFile').value = '';
    fondoEstado('✅ Fondo guardado. Se verá en la portada al abrirla.', '#10b981');
    mostrarToast('✅ Fondo de la portada actualizado', '#10b981');
  } catch (e) {
    console.error('Fondo de portada no guardado:', e);
    fondoEstado('No se guardó: ' + (e.message || e), '#ef4444');
    btn.disabled = false;
  }
};

window.cyQuitarFondo = async function () {
  if (!confirm('¿Volver a la foto por defecto de la portada?')) return;
  try {
    const { error } = await supabaseClient.rpc('admin_set_fondo_portada', { p_url: null });
    if (error) throw error;
    fondoElegido = null;
    document.getElementById('fpFile').value = '';
    document.getElementById('fpGuardar').disabled = true;
    fondoPintarVista(null);
    fondoEstado('Ahora la portada usa la foto por defecto.', '#10b981');
  } catch (e) {
    console.error('No se pudo quitar el fondo:', e);
    fondoEstado('No se pudo quitar: ' + (e.message || e), '#ef4444');
  }
};

// Muestra el fondo que está activo ahora (si hay uno subido)
async function fondoCargarActual() {
  try {
    const { data, error } = await supabaseClient.rpc('fondo_portada_url');
    if (error) throw error;
    fondoPintarVista(data || null);
    fondoEstado(data ? 'Fondo activo: subido desde el panel.' : 'Fondo activo: foto por defecto.');
  } catch (e) {
    fondoEstado('No se pudo leer el fondo actual.', '#f59e0b');
  }
}
document.addEventListener('DOMContentLoaded', fondoCargarActual);
