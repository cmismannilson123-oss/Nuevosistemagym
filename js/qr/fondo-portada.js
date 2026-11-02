// Fondo de la portada del socio: usa la imagen subida desde el panel, si hay una.
// Si no hay, o si algo falla, la portada se queda con la foto por defecto.
// No bloquea el flujo: se llama sin esperar (ver arranque.js).
let _fondoPortadaPedido = false;
async function cyAplicarFondoPortada(){
  if (_fondoPortadaPedido) return; // una sola lectura por carga de página
  _fondoPortadaPedido = true;
  try {
    if (typeof supabaseClient === 'undefined') return;
    const { data, error } = await supabaseClient.rpc('fondo_portada_url');
    if (error || !data) return;
    // Solo imágenes del almacenamiento de este proyecto
    if (!/^https:\/\/.+\/storage\/v1\/object\/public\/fondo-portada\//.test(data)) return;
    const el = document.querySelector('.cy-bg-photo');
    if (!el) return;
    const img = new Image();
    img.onload = () => { el.style.backgroundImage = 'url("' + data + '")'; };
    img.src = data;
  } catch (e) {
    // Sin fondo subido o sin conexión: se queda la foto por defecto
  }
}
