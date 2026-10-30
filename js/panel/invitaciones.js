// Invitación de amigos por WhatsApp desde el panel.
// Clásico (no módulo): mismo ámbito global y mismo orden que antes.
window.enviarInvitacionWhatsApp = function() {
  let telefono = document.getElementById("invitePhone").value;

  if (!telefono) {
    mostrarToast("📱 Por favor, ingrese un número de WhatsApp", "#f59e0b");
    return;
  }

  // Limpiar formato del número
  let telfLimpio = telefono.replace(/\D/g, '');
  if (telfLimpio && !telfLimpio.startsWith("51")) {
    telfLimpio = "51" + telfLimpio;
  }

  // Desplegar el modal del formulario escueto de precios
  let modal = document.getElementById("modalPreciosInvite");
  modal.style.display = "flex";

  // Capturar la acción del botón "Listo"
  document.getElementById("btnConfirmarPrecios").onclick = function() {
    // Cerrar el modal
    modal.style.display = "none";

    // Función auxiliar para formatear de forma escueta (si está vacío, pone '---')
    const fPrecio = (id) => {
      let val = document.getElementById(id).value.trim();
      return val ? val : "---";
    };

    // Extraer los precios ingresados por el usuario
    let valMensual      = fPrecio("pMensual");
    let valInterdiario  = fPrecio("pInterdiario");
    let valTrimestral   = fPrecio("pTrimestral");
    let valEstudiante   = fPrecio("pEstudiante");
    let valCoach        = fPrecio("pCoach");
    let valBaile        = fPrecio("pBaile");
    let valDiario       = fPrecio("pDiario");
    let valPromo3       = fPrecio("pPromo3");
    let valPromo4       = fPrecio("pPromo4");

    // CONCATENACIÓN CON DATOS DINÁMICOS INYECTADOS
    let mensaje = `🏋️‍♂️ *C&Y FITNESS GYM* 🏋️‍♂️\n` +
                  `_*Personal Training and Nutrition*_\n` +
                  `¡Tu disciplina hoy, tu mejor versión mañana! 💪🔥\n\n` +
                  `¡Hola! 👋 Te compartimos toda nuestra información oficial, planes vigentes y las mejores promociones para que empieces a entrenar con nosotros:\n\n` +
                  `📌 *NUESTROS PLANES Y TARIFAS:*\n` +
                  `• 1️⃣ *PLAN MENSUAL:* Acceso ilimitado durante 1 mes ➔ S/ ${valMensual}\n` +
                  `• 2️⃣ *PLAN INTERDIARIO:* Acceso al gimnasio día por medio ➔ S/ ${valInterdiario}\n` +
                  `• 3️⃣ *PLAN 3 MESES:* Acceso ilimitado por 3 meses completos ➔ S/ ${valTrimestral}\n` +
                  `• 4️⃣ *PLAN ESTUDIANTES:* Acceso ilimitado (Presentar carnet vigente) ➔ S/ ${valEstudiante}\n` +
                  `• 5️⃣ *PLAN PERSONALIZADO CON COACH:* Entrenamiento 100% guiado con acompañamiento profesional ➔ S/ ${valCoach}\n` +
                  `• 💃 *PLAN SOLO BAILE Y STEP:* Acceso exclusivo a las clases dirigidas ➔ S/ ${valBaile}\n` +
                  `• 🗓️ *RUTINA DIARIA:* Acceso por un solo día ➔ S/ ${valDiario}\n` +
                  `🎁 _(Beneficio extra: ¡Las rutinas acumuladas por 5 días te otorgan 1 DÍA LIBRE acumulable!)_\n\n` +
                  `👥 *PLANES GRUPALES (¡Entrena acompañado y ahorra!):*\n` +
                  `• 💥 *PLAN PROMO X 3:* (Precio especial por persona para grupos de 3) ➔ S/ ${valPromo3}\n` +
                  `• 💥 *PLAN X 4:* (Precio especial por persona para grupos de 4) ➔ S/ ${valPromo4}\n\n` +
                  `✨ *TODOS LOS PLANES INCLUYEN:* \n` +
                  `✅ Capacitación e instrucción en el uso de las máquinas en general.\n` +
                  `✅ Instructor general o personalizado en sala.\n` +
                  `✅ Asesoría nutricional básica para complementar tu entrenamiento.\n` +
                  `✅ Planificación de ejercicios según tu objetivo (bajar grasa, ganar músculo).\n` +
                  `✅ Instructores disponibles en todos los horarios de atención.\n` +
                  `⭐ *¡OJO!:* Todos los planes de gimnasio incluyen *INGRESO LIBRE* a las clases de *BAILE Y STEP*.\n\n` +
                  `🔥 *NUESTRAS MEJORES PROMOS (¡Más Beneficios!):*\n\n` +
                  `🤝 *1. PROMO INVITA Y GANA (¡Tú ganas, tu amigo también!):*\n` +
                  `• *Tú ganas:* Si eres miembro y traes a un amigo que se inscriba, recibes *4 DÍAS EXTRA* acumulables directamente en tu membresía actual.\n` +
                  `• *Tu amigo gana:* Recibe un descuento especial de bienvenida de *HASTA EL 10% DE DESCUENTO* en su inscripción.\n\n` +
                  `🏆 *2. PROMO A LA CONSTANCIA (Tu disciplina tiene recompensa):*\n` +
                  `• Si completas *3 MESES CONSECUTIVOS* entrenando con nosotros, reclamas un *15% DE DESCUENTO PERMANENTE* en todas tus siguientes renovaciones (aplicable si renuevas de manera puntual o a tiempo).\n\n` +
                  `⏰ *NUESTROS HORARIOS DE ATENCIÓN:*\n` +
                  `• 🏋️‍♂️ *Gimnasio:* Lunes a Sábado de *6:30 AM a 10:30 PM* (Ingresa a la hora que quieras y las veces que desees).\n` +
                  `• 💃 *Clases de Baile y Step:* Lunes a Viernes de *7:00 PM a 9:00 PM*.\n\n` +
                  `📍 *UBICACIÓN:* Av. San Juan Evangelista 232 - Ascensión HVCA\n\n` +
                  `🎁 🔥 *¡ATENCIÓN!* 🔥 🎁\n` +
                  `*Responde a este mensaje y obtén un descuento de hasta el 15% de descuento por bienvenida por tu primera inscripción.* ⚡🤩`;

    // Procesar envío final a WhatsApp
    let urlWsp = `https://wa.me/${telfLimpio}?text=${encodeURIComponent(mensaje)}`;
    window.open(urlWsp, '_blank');
    
    // Resetear inputs del formulario y del buscador
    document.getElementById("invitePhone").value = "";
    const ids = ["pMensual", "pInterdiario", "pTrimestral", "pEstudiante", "pCoach", "pBaile", "pDiario", "pPromo3", "pPromo4"];
    ids.forEach(id => document.getElementById(id).value = "");

    mostrarToast("🚀 Información completa enviada con promo de bienvenida", "#10b981");
  };
};
// =====================================================================
// CUADERNO DE CAJA — por mes, con resumen, búsqueda y filtros
// Una sola consulta por mes (cuaderno_caja). Lo ya visto se guarda en
// memoria y en el celular: al abrir se muestra al instante y se actualiza
// por detrás.
// =====================================================================
(function(){
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const TIPOS = {
    ins: { t:'Inscripciones', u:'Inscripción',   i:'fa-user-plus' },
    ren: { t:'Renovaciones',  u:'Renovación',    i:'fa-rotate-right' },
    ade: { t:'Adelantos',     u:'Adelanto',      i:'fa-forward' },
    deu: { t:'Deudas cobradas', u:'Cobro de deuda', i:'fa-hand-holding-dollar' },
    tie: { t:'Tienda',        u:'Venta de tienda', i:'fa-bag-shopping' }
  };
  const CACHE_LS = 'cy_cuaderno_v1';
  const cache = new Map();           // 'YYYY-MM' -> { filas, ts }
  const st = { mes:null, tipo:null, q:'', pedido:0, abierto:false };
  let el = null;

  // Perú no cambia de hora: UTC-5 todo el año
  const lima = (t) => new Date(new Date(t).getTime() - 5 * 3600e3);
  const hoyLima = () => lima(Date.now()).toISOString().slice(0, 10);
  const mesActual = () => hoyLima().slice(0, 7);
  // Recepción solo ve el día de hoy; el administrador ve el historial completo
  const cuadernoAdmin = () => document.documentElement.dataset.rol === 'admin';
  const sumarMes = (m, n) => { const [y, mm] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mm - 1 + n, 1)); return d.toISOString().slice(0, 7); };
  const finDeMes = (m) => { const [y, mm] = m.split('-').map(Number); return new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10); };
  const soles = (n) => 'S/ ' + (Math.round((+n || 0) * 100) / 100).toLocaleString('es-PE', { maximumFractionDigits: 2 });
  const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const esc = (s) => escaparHTML(s == null ? '' : String(s));

  // Conceptos de tienda empiezan con "Tienda" (ventas, pagos de fiados)
  const esTienda = (concepto) => /^tienda\b/.test(sinTildes(concepto));
  // Lo que se muestra como descripción: los productos, sin el prefijo del concepto
  const descripcionTienda = (concepto) => String(concepto || '')
    .replace(/^tienda\s*[·:]\s*/i, '')
    .replace(/^(venta|pago de fiado|fiado pagado|canceló fiado)\s*:\s*/i, '')
    .trim() || 'Productos';

  function tipoDe(concepto){
    const c = sinTildes(concepto);
    if (esTienda(concepto)) return 'tie';
    if (c.includes('inscrip')) return 'ins';
    if (c.includes('adelanto')) return 'ade';
    if (c.includes('cancelo') || c.includes('abono') || c.includes('deuda')) return 'deu';
    return 'ren';
  }

  function normalizar(r, pendiente){
    let plan = String(r.plan || r.tipo_memb || '').trim();
    let inicia = r.inicia || null;
    const m = plan.match(/\s*\(Inicia:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\)\s*$/i);
    if (m) { plan = plan.slice(0, m.index).trim(); inicia = `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
    const l = lima(r.fecha || r.fecha_movimiento);
    const tienda = esTienda(r.concepto);
    const c = sinTildes(r.concepto);
    const dni = String(r.dni || '');
    let cobro = null;
    // Solo el prefijo del concepto decide la etiqueta (un producto llamado "Abono Gold" sigue siendo una venta)
    if (tienda) cobro = /^tienda\s*[·:]\s*fiado pagado/.test(c) ? 'Fiado pagado'
                      : /^tienda\s*[·:]\s*pago de fiado/.test(c) || /^tienda\s*:\s*abono/.test(c) ? 'Pago de fiado' : 'Venta';
    else if (c.includes('abono')) cobro = 'Abono a deuda';
    if (tienda) plan = descripcionTienda(r.concepto);
    return {
      dia: l.toISOString().slice(0, 10),
      hora: l.toISOString().slice(11, 16),
      ts: new Date(r.fecha || r.fecha_movimiento).getTime(),
      dni,
      nombre: String(r.nombre || '').trim() || (tienda && !dni ? 'Cliente de tienda' : 'Socio'),
      plan: plan || 'Membresía',
      tipo: tipoDe(r.concepto),
      cobro,
      monto: parseFloat(r.monto != null ? r.monto : r.monto_ingreso) || 0,
      deuda: parseFloat(r.deuda != null ? r.deuda : r.deuda_visual) || 0,
      inicia, pendiente: !!pendiente
    };
  }

  // Pagos guardados en este celular que aún esperan internet
  function pendientesDelMes(mes){
    return (typeof cyCajaCola === 'function' ? cyCajaCola() : [])
      .filter(f => (parseFloat(f.monto_ingreso) > 0 || f.concepto === 'Inscripción inicial'))
      .map(f => normalizar(f, true))
      .filter(f => f.dia.slice(0, 7) === mes);
  }

  function leerCacheLS(){ try { return JSON.parse(localStorage.getItem(CACHE_LS)); } catch(e){ return null; } }
  function guardarCacheLS(mes, filas){ try { localStorage.setItem(CACHE_LS, JSON.stringify({ mes, ts: Date.now(), filas })); } catch(e){} }

  async function pedirMes(mes){
    const ctrl = window.AbortController ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), 20000) : null;
    try {
      let q = supabaseClient.rpc('cuaderno_caja', { p_desde: mes + '-01', p_hasta: finDeMes(mes) });
      if (ctrl && q.abortSignal) q = q.abortSignal(ctrl.signal);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(r => normalizar(r, false));
    } finally { if (t) clearTimeout(t); }
  }

  // ---------- Interfaz ----------
  function crear(){
    el = {
      raiz: document.getElementById('modalCuaderno'),
      mes: document.getElementById('cqMes'),
      prev: document.querySelector('#modalCuaderno [data-cq="prev"]'),
      next: document.querySelector('#modalCuaderno [data-cq="next"]'),
      resumen: document.getElementById('cqResumen'),
      buscar: document.getElementById('cqBuscar'),
      lista: document.getElementById('contenidoCuaderno'),
      cuerpo: document.querySelector('#modalCuaderno .cq-cuerpo'),
      estado: document.getElementById('cqEstado')
    };
    el.raiz.addEventListener('click', (e) => {
      if (e.target === el.raiz) return cerrar();
      const b = e.target.closest('[data-cq]');
      if (!b) return;
      const a = b.getAttribute('data-cq');
      if (a === 'cerrar') cerrar();
      else if (a === 'prev') irMes(sumarMes(st.mes, -1));
      else if (a === 'next') irMes(sumarMes(st.mes, 1));
      else if (a === 'reintentar') cargar(st.mes, true);
      else if (a === 'tipo') { const v = b.getAttribute('data-v'); st.tipo = (st.tipo === v ? null : v); pintar(); }
      else if (a === 'limpiar') { st.tipo = null; st.q = ''; el.buscar.value = ''; pintar(); }
    });
    let tb = null;
    el.buscar.addEventListener('input', () => {
      clearTimeout(tb);
      tb = setTimeout(() => { st.q = sinTildes(el.buscar.value.trim()); pintar(); }, 120);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && st.abierto) cerrar(); });
    window.addEventListener('popstate', () => { if (st.abierto) cerrar(true); });
  }

  function filasDelMes(mes){
    const c = cache.get(mes);
    const base = c ? c.filas : [];
    const pend = pendientesDelMes(mes);
    return pend.length ? pend.concat(base).sort((a, b) => b.ts - a.ts) : base;
  }

  function pintarResumen(filas){
    const tot = { ins:[0,0], ren:[0,0], ade:[0,0], deu:[0,0], tie:[0,0] };
    let total = 0, hoy = 0; const h = hoyLima();
    filas.forEach(f => { total += f.monto; tot[f.tipo][0] += f.monto; tot[f.tipo][1]++; if (f.dia === h) hoy += f.monto; });
    const esActual = st.mes === mesActual();
    const dias = new Set(filas.filter(f => f.monto > 0).map(f => f.dia)).size;
    el.resumen.innerHTML = `
      <div class="cq-total">
        <div><span>Total de ${MESES[+st.mes.slice(5) - 1]}</span><b>${soles(total)}</b></div>
        <div class="cq-total-lado">${esActual
          ? `<span>Hoy</span><b>${soles(hoy)}</b>`
          : `<span>Promedio por día</span><b>${soles(dias ? Math.round(total / dias) : 0)}</b>`}</div>
      </div>
      <div class="cq-tipos" role="group" aria-label="Filtrar por tipo">
        ${Object.keys(TIPOS).map(k => `
          <button type="button" class="cq-tipo cq-t-${k}${st.tipo === k ? ' activo' : ''}" data-cq="tipo" data-v="${k}" aria-pressed="${st.tipo === k}">
            <i class="fa-solid ${TIPOS[k].i}"></i>
            <b>${soles(tot[k][0])}</b>
            <span>${TIPOS[k].t}</span>
            <em>${tot[k][1]}</em>
          </button>`).join('')}
      </div>`;
  }

  function nombreDia(d){
    const h = hoyLima();
    const ayer = lima(Date.now() - 864e5).toISOString().slice(0, 10);
    const [y, m, dd] = d.split('-').map(Number);
    const fecha = new Date(Date.UTC(y, m - 1, dd));
    const txt = `${DIAS[fecha.getUTCDay()]} ${dd} ${MESES[m - 1].slice(0, 3)}`;
    if (d === h) return `<b>Hoy</b> · ${txt}`;
    if (d === ayer) return `<b>Ayer</b> · ${txt}`;
    return `<b>${txt.charAt(0).toUpperCase() + txt.slice(1)}</b>`;
  }

  function fila(f){
    const T = TIPOS[f.tipo];
    let etiqueta;
    if (f.pendiente) etiqueta = `<em class="cq-e cq-e-pend"><i class="fa-solid fa-cloud-arrow-up"></i> Por subir</em>`;
    else if (f.tipo === 'deu') etiqueta = f.deuda > 0 ? `<em class="cq-e cq-e-deu">Aún debe ${soles(f.deuda)}</em>` : `<em class="cq-e cq-e-ok">Deuda saldada</em>`;
    else if (f.deuda > 0) etiqueta = `<em class="cq-e cq-e-deu">Resta ${soles(f.deuda)}</em>`;
    else etiqueta = `<em class="cq-e cq-e-ok">Completo</em>`;
    const ini = f.inicia ? ` · <span class="cq-ini">Inicia ${f.inicia.slice(8,10)}/${f.inicia.slice(5,7)}</span>` : '';
    return `<li class="cq-fila cq-t-${f.tipo}">
      <span class="cq-ico" aria-hidden="true"><i class="fa-solid ${T.i}"></i></span>
      <div class="cq-info">
        <strong>${esc(f.nombre)}</strong>
        <small><span class="cq-con">${f.cobro || T.u}</span> · ${esc(f.plan)}${ini}</small>
      </div>
      <div class="cq-monto">
        <b>${f.monto > 0 ? '+ ' + soles(f.monto) : soles(0)}</b>
        <span>${etiqueta}<time>${f.hora}</time></span>
      </div>
    </li>`;
  }

  function pintar(){
    if (!el) return;
    const mes = st.mes;
    el.mes.textContent = MESES[+mes.slice(5) - 1].replace(/^./, c => c.toUpperCase()) + ' ' + mes.slice(0, 4);
    el.next.disabled = mes >= mesActual() || !cuadernoAdmin();
    el.prev.disabled = mes <= sumarMes(mesActual(), -36) || !cuadernoAdmin();
    const c = cache.get(mes);
    const todas = filasDelMes(mes);
    if (!c && !todas.length) { el.resumen.innerHTML = ''; return; }
    pintarResumen(todas);

    let filas = todas;
    if (st.tipo) filas = filas.filter(f => f.tipo === st.tipo);
    if (st.q) filas = filas.filter(f => sinTildes(f.nombre).includes(st.q) || f.dni.includes(st.q));

    if (!filas.length) {
      el.lista.innerHTML = (st.tipo || st.q)
        ? `<div class="cq-vacio"><i class="fa-solid fa-filter-circle-xmark"></i><p>Nada coincide con el filtro.</p><button type="button" data-cq="limpiar">Quitar filtro</button></div>`
        : `<div class="cq-vacio"><i class="fa-solid fa-book-open"></i><p>Sin movimientos en este mes.</p></div>`;
      return;
    }
    const grupos = [];
    let actual = null;
    filas.forEach(f => {
      if (!actual || actual.dia !== f.dia) { actual = { dia: f.dia, filas: [], total: 0 }; grupos.push(actual); }
      actual.filas.push(f); actual.total += f.monto;
    });
    const filtro = (st.tipo || st.q)
      ? `<div class="cq-filtro"><span>${st.tipo ? TIPOS[st.tipo].t : 'Búsqueda'}: <b>${filas.length}</b> · ${soles(filas.reduce((s, f) => s + f.monto, 0))}</span><button type="button" data-cq="limpiar">Quitar filtro</button></div>`
      : '';
    el.lista.innerHTML = filtro + grupos.map(g => `
      <section class="cq-dia">
        <header class="cq-dia-h"><span>${nombreDia(g.dia)}</span><span class="cq-dia-t">${soles(g.total)} <small>· ${g.filas.length}</small></span></header>
        <ul>${g.filas.map(fila).join('')}</ul>
      </section>`).join('');
  }

  function estado(tipo, texto){
    if (!el) return;
    el.estado.className = 'cq-estado' + (tipo ? ' cq-estado-' + tipo : '');
    el.estado.innerHTML = texto || '';
    const pend = (typeof cyCajaCola === 'function') ? cyCajaCola().length : 0;
    if (!texto && pend) {
      el.estado.className = 'cq-estado cq-estado-pend';
      el.estado.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> ${pend === 1 ? '1 pago espera' : pend + ' pagos esperan'} internet; se subirá${pend === 1 ? '' : 'n'} solo${pend === 1 ? '' : 's'}.`;
    }
  }

  function esqueleto(){
    el.resumen.innerHTML = `<div class="cq-total cq-sk"><div><span>&nbsp;</span><b>&nbsp;</b></div></div><div class="cq-tipos">${'<div class="cq-tipo cq-sk"></div>'.repeat(4)}</div>`;
    el.lista.innerHTML = `<div class="cq-dia">${'<div class="cq-fila cq-sk"></div>'.repeat(5)}</div>`;
  }

  async function cargar(mes, forzar){
    const pedido = ++st.pedido;
    const c = cache.get(mes);
    const fresco = c && (Date.now() - c.ts < 60000);
    if (c || pendientesDelMes(mes).length) pintar(); else esqueleto();
    if (fresco && !forzar) { estado(); return; }
    estado('carga', '<i class="fa-solid fa-rotate"></i> Actualizando…');
    if (window.cyCajaVaciarCola && cyCajaCola().length) { try { await cyCajaVaciarCola(); } catch(e){} }
    try {
      const filas = await pedirMes(mes);
      cache.set(mes, { filas, ts: Date.now() });
      if (mes === mesActual()) guardarCacheLS(mes, filas);
      if (pedido !== st.pedido || st.mes !== mes) return;
      pintar(); estado();
    } catch (e) {
      if (pedido !== st.pedido || st.mes !== mes) return;
      console.error('Cuaderno:', e);
      if (cache.get(mes)) {
        estado('error', `<i class="fa-solid fa-wifi"></i> Sin conexión: mostrando lo último guardado. <button type="button" data-cq="reintentar">Reintentar</button>`);
      } else {
        el.resumen.innerHTML = '';
        el.lista.innerHTML = `<div class="cq-vacio"><i class="fa-solid fa-wifi"></i><p>No se pudo cargar. Revisa el internet.</p><button type="button" data-cq="reintentar">Reintentar</button></div>`;
        estado();
      }
    }
  }

  function irMes(mes){
    if (mes > mesActual()) return;
    st.mes = cuadernoAdmin() ? mes : mesActual();
    el.cuerpo.scrollTop = 0;
    cargar(mes, false);
    // Precarga el mes anterior para que pasar de mes sea instantáneo
    const ant = sumarMes(mes, -1);
    if (!cache.has(ant)) setTimeout(() => { if (st.abierto && !cache.has(ant)) pedirMes(ant).then(f => cache.set(ant, { filas: f, ts: Date.now() })).catch(() => {}); }, 900);
  }

  window.abrirCuadernoHistorial = function(){
    if (!el) crear();
    if (!cache.has(mesActual())) {
      const ls = leerCacheLS();
      if (ls && ls.mes === mesActual() && Array.isArray(ls.filas)) cache.set(ls.mes, { filas: ls.filas, ts: 0 });
    }
    st.abierto = true; st.tipo = null; st.q = ''; el.buscar.value = '';
    el.raiz.hidden = false;
    document.documentElement.classList.add('cq-abierto');
    requestAnimationFrame(() => el.raiz.classList.add('visible'));
    try { history.pushState({ cq: 1 }, ''); } catch(e){}
    irMes(mesActual());
  };

  function cerrar(desdeHistorial){
    if (!st.abierto) return;
    st.abierto = false;
    el.raiz.classList.remove('visible');
    document.documentElement.classList.remove('cq-abierto');
    setTimeout(() => { if (!st.abierto) el.raiz.hidden = true; }, 220);
    if (!desdeHistorial && history.state && history.state.cq) { try { history.back(); } catch(e){} }
  }
  window.cerrarCuadernoHistorial = () => cerrar();

  // Llamado al guardar un pago: el mes actual se vuelve a pedir
  window.cyCuadernoInvalidar = function(){
    const m = mesActual();
    const c = cache.get(m); if (c) c.ts = 0;
    if (st.abierto && st.mes === m) cargar(m, true);
  };
})();
