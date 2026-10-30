// Cola de cobros de caja pendientes (funciona sin conexión).
// Clásico (no módulo): mismo ámbito global y mismo orden que antes.
// ===== CUADERNO DE CAJA: ningún pago se pierde =====
// Cada movimiento se anota primero en el celular (cola) y luego se sube.
// Si no hay internet, se reintenta solo; el cliente_id evita duplicados.
const CY_CAJA_COLA = 'cy_caja_pendiente';
function cyUuid(){
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.random() * 256 | 0;
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
}
function cyCajaCola(){ try { return JSON.parse(localStorage.getItem(CY_CAJA_COLA)) || []; } catch(e){ return []; } }
function cyCajaGuardarCola(c){ try { localStorage.setItem(CY_CAJA_COLA, JSON.stringify(c)); } catch(e){} }
function cyCajaGuardar(mov){
  const fila = Object.assign({}, mov, {
    monto_ingreso: parseFloat(mov.monto_ingreso) || 0,
    deuda_visual: parseFloat(mov.deuda_visual) || 0,
    cliente_id: cyUuid(),
    fecha_movimiento: new Date().toISOString()
  });
  const cola = cyCajaCola(); cola.push(fila); cyCajaGuardarCola(cola);
  if (window.cyCuadernoInvalidar) window.cyCuadernoInvalidar();
  cyCajaVaciarCola();
}
let _cyCajaSubiendo = null;
function cyCajaVaciarCola(){
  if (_cyCajaSubiendo) return _cyCajaSubiendo;
  _cyCajaSubiendo = (async () => {
    let subio = false;
    for (let i = 0; i < 50; i++) {
      const fila = cyCajaCola()[0];
      if (!fila) break;
      const { error } = await supabaseClient.from('historial_caja')
        .upsert([fila], { onConflict: 'cliente_id', ignoreDuplicates: true });
      // Un dato inválido (22xxx/23xxx) no se arregla reintentando: se descarta
      if (error && !/^2[23]/.test(String(error.code || ''))) break;
      if (error) console.error('Movimiento de caja descartado:', error, fila);
      cyCajaGuardarCola(cyCajaCola().filter(f => f.cliente_id !== fila.cliente_id));
      subio = true;
    }
    if (subio && window.cyCuadernoInvalidar) window.cyCuadernoInvalidar(true);
  })().catch(e => console.warn('Caja sin conexión, se reintentará:', e))
     .finally(() => { _cyCajaSubiendo = null; });
  return _cyCajaSubiendo;
}
window.addEventListener('online', () => cyCajaVaciarCola());
setInterval(() => { if (cyCajaCola().length) cyCajaVaciarCola(); }, 30000);
setTimeout(() => { if (cyCajaCola().length) cyCajaVaciarCola(); }, 4000);

// Los avisos de ingreso al celular (ntfy) los manda la base de datos al
// guardarse cada asistencia; el canal es secreto y NO está en esta página.

let accesoAdmin = false; 
let dataGlobal = [];
let historialGlobal = [];
let filtroEstadoActual = 'todos'; 
