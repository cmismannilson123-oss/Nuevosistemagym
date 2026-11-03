// Parte del flujo del socio (QR). Clásico: mismo ámbito global que antes.
async function cyRpcSeguro(nombre, args, opciones){
  const o = Object.assign({ intentos: 3, espera: 15000 }, opciones || {});
  let ultimo = null;
  for (let i = 0; i < o.intentos; i++) {
    if (i) await new Promise(r => setTimeout(r, i === 1 ? 700 : 1800));
    const ctrl = window.AbortController ? new AbortController() : null;
    const reloj = ctrl ? setTimeout(() => ctrl.abort(), o.espera) : null;
    try {
      let q = supabaseClient.rpc(nombre, args);
      if (ctrl && q.abortSignal) q = q.abortSignal(ctrl.signal);
      const res = await q;
      if (!res.error || res.error.code) return Object.assign(res, { intento: i + 1 });
      ultimo = res;
    } catch (e) {
      ultimo = { data: null, error: e };
    } finally { if (reloj) clearTimeout(reloj); }
  }
  return Object.assign(ultimo || { data: null, error: new Error('Sin conexión') }, { intento: o.intentos });
}
