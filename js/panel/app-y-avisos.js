// App instalable, notificaciones push y avisos por voz (solo panel).
// Clásico (no módulo): mismo ámbito global y mismo orden que antes.
// =====================================================================
// APP Y NOTIFICACIONES — instalar la app, avisos push propios (sin ntfy),
// voz de bienvenida y anuncios por voz. Solo en el panel.
// =====================================================================
(function(){
  if (document.documentElement.classList.contains('qr-mode')) return;
  const VAPID = 'BAGbwqTYN3ORt7VRygX0uhX_5ZT3FiWJhFMvlSzwsDK0zcjK0Y-OiLArjBgJae3clm27Rp4EZRLFnFcmyu9TTws';
  const LS = { voz: 'cy_voz_recepcion', intentos: 'cy_voz_intentos', vozNombre: 'cy_voz_nombre', mios: 'cy_anuncios_mios', timbre: 'cy_anuncio_timbre', push: 'cy_push_activo' };
  const $ = (id) => document.getElementById(id);
  const leer = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch(e){ return d; } };
  const escribir = (k, v) => { try { localStorage.setItem(k, v); } catch(e){} };
  let promptInstalar = null;
  let ocupado = false;

  const soportaPush = () => ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
  const instalada = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  // En la app Android del administrador la voz la lee la propia app (con la pantalla apagada),
  // así que la página no habla para no repetir cada aviso.
  const esAppNativa = () => !!window.AndroidApp;
  const vozActiva = () => !esAppNativa() && leer(LS.voz, '0') === '1';
  const avisarIntentos = () => leer(LS.intentos, '1') === '1';
  const b64aBytes = (b64) => {
    const p = '='.repeat((4 - b64.length % 4) % 4);
    const s = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(s, c => c.charCodeAt(0));
  };
  const nota = (txt, tipo) => { const n = $('avNota'); if (!n) return; n.textContent = txt || ''; n.className = 'av-nota' + (tipo ? ' av-nota--' + tipo : ''); };

  // ---------- Instalar ----------
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); promptInstalar = e; pintar(); });
  window.addEventListener('appinstalled', () => { promptInstalar = null; pintar(); mostrarToast('✅ App instalada en tu pantalla de inicio', '#10b981'); });
  async function instalar(){
    if (instalada()) return;
    if (promptInstalar) { promptInstalar.prompt(); try { await promptInstalar.userChoice; } catch(e){} promptInstalar = null; pintar(); return; }
    nota('En Chrome: toca los tres puntos ⋮ (arriba a la derecha) y elige “Instalar aplicación” o “Agregar a la pantalla principal”.', 'info');
  }

  // ---------- App Android: registra el celular para recibir avisos ----------
  // El token lo entrega la app (puente AndroidApp). Se guarda en la base cuando hay sesión.
  if (esAppNativa()) {
    let intentosToken = 0;
    const tokenTimer = setInterval(async () => {
      intentosToken++;
      try {
        const { data } = await supabaseClient.auth.getSession();
        const token = window.AndroidApp.tokenFcm();
        if (data && data.session && token) {
          const { error } = await supabaseClient.rpc('guardar_fcm_token', { p_token: token, p_dispositivo: window.AndroidApp.nombreDispositivo() });
          if (!error) clearInterval(tokenTimer);
        }
      } catch (e) {}
      if (intentosToken > 40) clearInterval(tokenTimer);
    }, 15000);
  }

  // ---------- Notificaciones push ----------
  async function suscripcionActual(){
    if (!soportaPush()) return null;
    // Si el service worker aún no está listo, no se queda esperando para siempre
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 3000))]);
    return reg ? reg.pushManager.getSubscription() : null;
  }
  async function guardarSuscripcion(sub){
    const j = sub.toJSON();
    const { error } = await supabaseClient.from('push_suscripciones').upsert([{
      endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, dispositivo: (navigator.userAgent || '').slice(0, 160)
    }], { onConflict: 'endpoint' });
    if (error) throw error;
  }
  async function activarPush(){
    if (!soportaPush()) { nota('Este navegador no permite notificaciones. Abre el panel en Google Chrome.', 'mal'); return; }
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') { nota('Las notificaciones están bloqueadas. Toca el candado junto a la dirección (o Ajustes del sitio) → Notificaciones → Permitir, y vuelve a intentarlo.', 'mal'); return; }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64aBytes(VAPID) });
    await guardarSuscripcion(sub);
    escribir(LS.push, '1');
    nota('Listo. Te llegará un aviso con cada ingreso. Toca “Enviar una notificación de prueba” para comprobarlo.', 'ok');
  }
  async function desactivarPush(){
    const sub = await suscripcionActual();
    if (sub) { try { await supabaseClient.from('push_suscripciones').delete().eq('endpoint', sub.endpoint); } catch(e){} await sub.unsubscribe(); }
    escribir(LS.push, '0');
    nota('Notificaciones apagadas en este celular.', 'info');
  }
  async function probar(){
    const { error } = await supabaseClient.rpc('probar_push');
    if (error) throw error;
    nota('Enviada. Debería llegarte en unos segundos (también con la pantalla apagada).', 'ok');
  }

  // =====================================================================
  // VOZ: femenina, cálida y clara. Se elige la mejor voz en español del
  // celular (prefiere español latino y voces de mujer), con un tono un poco
  // más alegre y un ritmo pausado para que se entienda bien. Antes de hablar
  // suena un timbre suave para que la gente preste atención.
  // =====================================================================
  const tieneVoz = 'speechSynthesis' in window;
  const RE_MUJER = /(female|mujer|woman|paulina|m[oó]nica|helena|laura|sabina|lupe|camila|paloma|elvira|dalia|marisol|valentina|sof[ií]a|luciana|francisca|isabela|esperanza|catalina|ximena|elena|sfb|esc\b|eea|-f\d|#female)/i;
  const RE_HOMBRE = /(\bmale\b|hombre|jorge|diego|juan\b|carlos|pablo|enrique|ra[uú]l|andr[eé]s|tom[aá]s|esd\b|esf\b|eed|#male)/i;
  function vocesEs(){ return tieneVoz ? speechSynthesis.getVoices().filter(v => /^es/i.test(v.lang)) : []; }
  function puntaje(v){
    let p = 0;
    if (/^es[-_](US|MX|419|PE|CO|AR|CL)/i.test(v.lang)) p += 30; else if (/^es[-_]ES/i.test(v.lang)) p += 10;
    if (RE_MUJER.test(v.name + ' ' + (v.voiceURI || ''))) p += 25;
    if (RE_HOMBRE.test(v.name + ' ' + (v.voiceURI || ''))) p -= 40;
    if (/google/i.test(v.name)) p += 8;           // voces de Google: las más naturales
    if (/natural|neural|enhanced|premium/i.test(v.name)) p += 10;
    if (!v.localService) p += 6;                  // voces de red: más naturales
    return p;
  }
  function vozElegida(){
    const vs = vocesEs(); if (!vs.length) return null;
    const g = leer(LS.vozNombre, ''), guardada = g.startsWith('dev:') ? g.slice(4) : '';
    return vs.find(v => v.name === guardada) || vs.slice().sort((a, b) => puntaje(b) - puntaje(a))[0];
  }

  // Timbre suave (dos notas) con el propio celular, sin archivos
  let ctxAudio = null;
  function timbre(largo){
    try {
      ctxAudio = ctxAudio || new (window.AudioContext || window.webkitAudioContext)();
      if (ctxAudio.state === 'suspended') ctxAudio.resume();
      const notas = largo ? [[659.25, 0], [830.61, .22], [987.77, .44]] : [[783.99, 0], [1046.5, .16]];
      notas.forEach(([f, t0]) => {
        const o = ctxAudio.createOscillator(), g = ctxAudio.createGain();
        o.type = 'sine'; o.frequency.value = f;
        const t = ctxAudio.currentTime + t0;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.32, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (largo ? 0.9 : 0.6));
        o.connect(g).connect(ctxAudio.destination); o.start(t); o.stop(t + 1);
      });
      return largo ? 1100 : 650;
    } catch(e){ return 0; }
  }

  // Texto pensado para el oído: nombres bien escritos y siglas que se leen bien
  const capital = (s) => String(s || '').toLowerCase().replace(/(^|[\s'-])([a-záéíóúüñ])/g, (m, a, b) => a + b.toUpperCase());
  function paraVoz(t){
    return String(t || '')
      .replace(/C\s*&\s*Y/gi, 'C y Y')
      .replace(/S\/\.?\s*(\d+(?:[.,]\d+)?)/g, '$1 soles')
      .replace(/(\d+)\s*%/g, '$1 por ciento')
      .replace(/\s+/g, ' ').trim();
  }
  function trozos(t){
    const partes = t.match(/[^.!?¡¿\n]+[.!?]*|[¡¿][^.!?\n]+[.!?]*/g) || [t];
    const out = [];
    partes.forEach(p => {
      p = p.trim(); if (!p) return;
      while (p.length > 180) { const i = p.lastIndexOf(',', 180); const c = i > 40 ? i + 1 : 180; out.push(p.slice(0, c)); p = p.slice(c).trim(); }
      if (p) out.push(p);
    });
    return out;
  }
  // =====================================================================
  // MOTOR DE VOZ
  // 1) Voz natural (IA): la Edge Function "cy-voz" genera voz neuronal con
  //    instrucciones de estilo (cálida, natural, entonación y pausas humanas).
  //    Cada frase se guarda en el servidor y en el celular: lo que se repite
  //    (la bienvenida de los socios de siempre) suena al instante.
  // 2) Si no hay internet o no hay clave de IA: voz del celular, con ajustes
  //    neutros (los ajustes extremos son los que la hacen sonar robótica).
  // El timbre suena mientras llega el audio, así la espera no se nota.
  // =====================================================================
  // Voz natural GRATIS con Google Gemini (nivel gratuito). Si el cupo del día
  // se acaba, se usa la voz del celular unos minutos y se vuelve a intentar.
  const IA = { estado: null, motivo: '', voces: {}, defecto: 'Sulafat', pausaHasta: 0 };
  const eleccion = () => leer(LS.vozNombre, '');
  // Aunque el cupo esté agotado se sigue consultando: lo ya guardado sale gratis con voz natural
  const usarIA = () => IA.estado === true && !eleccion().startsWith('dev:');
  const vozIA = () => { const g = eleccion(); return g.startsWith('ia:') && IA.voces[g.slice(3)] ? g.slice(3) : IA.defecto; };
  async function comprobarIA(forzar){
    if (IA.estado !== null && !forzar) return IA.estado;
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) return false;
      const r = await fetch(SUPABASE_URL + '/functions/v1/cy-voz', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token, apikey: SUPABASE_KEY },
        body: JSON.stringify({ probar: true }) });
      const j = await r.json().catch(() => ({}));
      IA.estado = !!(r.ok && j.ia); IA.motivo = IA.estado ? '' : 'sin_clave';
      if (j.voces) IA.voces = j.voces;
      if (j.defecto) IA.defecto = j.defecto;
    } catch(e){ IA.estado = null; }   // sin internet: se vuelve a intentar luego
    return IA.estado === true;
  }
  async function huella(s){
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(d), x => x.toString(16).padStart(2, '0')).join('');
  }
  async function audioIA(texto, tipo){
    const voz = vozIA();
    const url = 'https://voz.cy-fitness.local/' + voz + '/' + tipo + '/' + (await huella(texto)) + '.wav';
    let cache = null;
    try { cache = await caches.open('cy-voz-v1'); const r = await cache.match(url); if (r) return await r.arrayBuffer(); } catch(e){}
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) throw new Error('sin sesión');
    const ctrl = new AbortController(); const reloj = setTimeout(() => ctrl.abort(), 7000);
    let r;
    try {
      r = await fetch(SUPABASE_URL + '/functions/v1/cy-voz', { method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token, apikey: SUPABASE_KEY },
        body: JSON.stringify({ texto, voz, tipo }) });
    } finally { clearTimeout(reloj); }
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      if (['sin_clave', 'clave_invalida'].includes(e.error)) { IA.estado = false; IA.motivo = e.error; }
      if (e.error === 'cupo') { IA.pausaHasta = Date.now() + 10 * 60000; IA.motivo = 'cupo'; }
      throw new Error(e.error || ('HTTP ' + r.status));
    }
    const buf = await r.arrayBuffer();
    try { if (cache) cache.put(url, new Response(buf.slice(0), { headers: { 'Content-Type': 'audio/wav' } })); } catch(e){}
    return buf;
  }
  function contexto(){
    ctxAudio = ctxAudio || new (window.AudioContext || window.webkitAudioContext)();
    if (ctxAudio.state === 'suspended') ctxAudio.resume().catch(() => {});
    return ctxAudio;
  }
  // El celular solo deja sonar audio después de un toque: se "despierta" con el primero
  document.addEventListener('pointerdown', () => { try { contexto(); } catch(e){} }, { capture: true, passive: true });

  let fuente = null;
  async function reproducir(buf){
    const c = contexto();
    const ab = await c.decodeAudioData(buf.slice(0));
    return new Promise((ok) => {
      const s = c.createBufferSource(); s.buffer = ab;
      s.connect(c.destination);
      s.onended = () => { if (fuente === s) fuente = null; ok(); };
      fuente = s; s.start();
    });
  }
  function hablarCelular(t){
    return new Promise((ok) => {
      if (!tieneVoz) return ok();
      const v = vozElegida();
      const frases = t.length <= 220 ? [t] : trozos(t);   // corto = una sola frase, fluida
      frases.forEach((f, i) => {
        const u = new SpeechSynthesisUtterance(f);
        if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'es-US';
        u.rate = 1; u.pitch = 1; u.volume = 1;            // natural: sin forzar tono ni velocidad
        if (i === frases.length - 1) u.onend = u.onerror = () => ok();
        speechSynthesis.speak(u);
      });
      if (speechSynthesis.paused) speechSynthesis.resume();
    });
  }
  const pausa = (ms) => new Promise(r => setTimeout(r, ms));
  let hablando = false, turno = 0, cola = Promise.resolve();
  function hablar(texto, op){
    op = op || {};
    if (!texto && !op.partes) return false;
    const mio = turno;
    cola = cola.then(async () => {
      if (mio !== turno) return;
      hablando = true; pintarAnuncio();
      // Un mensaje puede ir en partes (ej.: bienvenida + "tu membresía venció"):
      // así la parte común se genera una sola vez para todos los socios.
      const partes = (op.partes || [{ texto, tipo: op.tipo || 'anuncio' }]).map(x => ({ texto: paraVoz(x.texto), tipo: x.tipo }));
      const t = partes.map(x => x.texto).join(' ');
      let audios = null;
      if (IA.estado === null) await Promise.race([comprobarIA(), pausa(1500)]);
      if (usarIA()) audios = Promise.all(partes.map(x => audioIA(x.texto, x.tipo))).catch(e => { console.warn('Voz IA no disponible, se usa la del celular:', e.message); return null; });
      const espera = op.timbre === false ? 0 : timbre(op.largo);
      await pausa(espera ? espera + 60 : 0);
      const bufs = audios ? await audios : null;   // si falta una parte, todo con la misma voz (del celular)
      for (let vez = 0; vez < (op.repetir ? 2 : 1) && mio === turno; vez++) {
        if (vez) await pausa(900);
        if (bufs) {
          try { for (let i = 0; i < bufs.length && mio === turno; i++) { if (i) await pausa(120); await reproducir(bufs[i]); } continue; } catch(e){}
        }
        await hablarCelular(t);
      }
    }).catch(() => {}).then(() => { if (mio === turno) { hablando = false; pintarAnuncio(); } });
    return true;
  }
  function detener(){
    turno++;
    if (esAppNativa()) { try { window.AndroidApp.detener(); } catch(e){} }
    try { if (fuente) fuente.stop(); } catch(e){}
    fuente = null;
    if (tieneVoz) speechSynthesis.cancel();
    hablando = false; pintarAnuncio();
  }
  if (tieneVoz) { try { speechSynthesis.getVoices(); speechSynthesis.addEventListener('voiceschanged', () => llenarVoces()); } catch(e){} }

  // ¿Bienvenida o bienvenido? Según el primer nombre (nombres comunes en Perú).
  const FEM = new Set('isabel raquel carmen pilar luz ruth ester esther beatriz ines mercedes dolores soledad rocio belen nicole nicol jazmin yasmin maribel marisol consuelo rosario milagros lourdes flor abigail miriam mirian sharon karen evelyn ingrid lizbeth elizabeth yuliet juliet scarlet scarleth nayeli yaneli aracely aracelly deysi daysi daisy heidi wendy sandy cindy betty kelly sally nancy mery mary ruby lucy gisel gissel giselle noemi zoe mabel sol lili liz yamileth joselyn jocelyn estefany stefany tiffany brigitte brigith anahi nohely nely edith judith yudith ivonne ivon lisbeth nataly nathaly kimberly shirley fanny jenny jhenny emily emely melany melanie stephanie madeleine caroline jacqueline jaqueline yesenia dayana diana catherine katherine kathy cathy rachel rebeca ximena geraldine jade irene danae adele marilyn madai nahomi naomi sheyli sheily yeni yeny leydi lady suly araceli rosmery rosemary maricel marisel aylin ailin evelin ashley britany brittany alison allison'.split(' '));
  const MASC = new Set('luca joshua nikita bautista elias jeremias isaias matias tobias josue jhony johnny jony rony andy henry danny freddy eddy teddy ruddy harry jerry gary roy ray rey ali rudi rudy jhonny yoel jose felipe enrique dante jorge jaime vicente alexis kenny jhoel noe abel'.split(' '));
  function genero(nombre){
    const n = String(nombre || '').trim().split(/\s+/)[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (!n) return null;
    if (FEM.has(n)) return 'f';
    if (MASC.has(n)) return 'm';
    if (/a$/.test(n)) return 'f';
    if (/o$/.test(n)) return 'm';
    if (/(eth|lyn|line|elle|ette)$/.test(n)) return 'f';
    if (/[bcdfgjklmnprstvxz]$/.test(n)) return 'm';
    return null;   // no estamos seguros: saludo neutral
  }
  function saludo(nombreCompleto){
    const partes = capital(nombreCompleto).trim().split(/\s+/);
    const corto = partes.slice(0, 2).join(' ') || 'socio';
    const g = genero(corto);
    return { corto, frase: g === 'f' ? '¡Bienvenida, ' + corto + '!' : g === 'm' ? '¡Bienvenido, ' + corto + '!' : '¡Te damos la bienvenida, ' + corto + '!' };
  }
  const MOTIVO_VOZ = {
    VENCIDO: 'Tu membresía venció. Por favor, acércate a recepción, en un momento te atendemos.',
    AGOTADO: 'Ya usaste todas las asistencias de tu plan. Por favor, acércate a recepción, en un momento te atendemos.',
    DEUDA: 'Por favor, acércate a recepción, en un momento te atendemos.'
  };
  const MOTIVO_TXT = { VENCIDO: 'membresía vencida', AGOTADO: 'asistencias agotadas', DEUDA: 'bloqueado por deuda' };
  const nombreDe = (dni, nombre) => {
    const s = ((typeof dataGlobal !== 'undefined' && dataGlobal) || []).find(x => String(x.dni) === String(dni));
    return (s && s.nombre) || nombre || '';
  };

  // Cada ingreso o intento se anuncia una sola vez (llega en vivo y por push)
  const hechos = new Map();
  function unaVez(clave, ms){
    const ahora = Date.now();
    for (const [k, t] of hechos) if (ahora - t > 300000) hechos.delete(k);
    if (hechos.has(clave) && ahora - hechos.get(clave) < ms) return false;
    hechos.set(clave, ahora); return true;
  }
  function alIngresar(dni, nombre, metodo){
    if (!vozActiva() || String(metodo || '').toUpperCase() !== 'QR') return;
    if (!unaVez('i' + dni, 120000)) return;
    hablar(saludo(nombreDe(dni, nombre)).frase, { tipo: 'saludo' });
  }
  function alIntentar(dni, nombre, motivo){
    // Llega en vivo y por push: se avisa una vez. La base ya separa los reintentos (10 s).
    if (!unaVez('t' + dni + motivo, 9000)) return;
    const n = nombreDe(dni, nombre);
    mostrarToast('⛔ ' + (capital(n) || 'Un socio') + ' intentó ingresar — ' + (MOTIVO_TXT[motivo] || 'no puede ingresar'), '#ef4444');
    if (vozActiva() && avisarIntentos()) hablar('', { partes: [{ texto: saludo(n).frase, tipo: 'saludo' }, { texto: MOTIVO_VOZ[motivo] || MOTIVO_VOZ.DEUDA, tipo: 'aviso' }] });
  }
  document.addEventListener('cy-ingreso', (e) => { const f = e.detail || {}; alIngresar(f.dni, f.nombre, f.metodo); });
  document.addEventListener('cy-intento', (e) => { const f = e.detail || {}; alIntentar(f.dni, f.nombre, f.motivo); });
  document.addEventListener('cy-push', (e) => {
    const d = e.detail || {};
    if (d.evento === 'intento') alIntentar(d.dni, d.nombre, d.motivo);
    else alIngresar(d.dni, d.nombre, d.metodo);
  });

  // ---------- Anuncios por voz ----------
  const SUGERIDOS = [
    ['Cierre en 5 min', 'Atención, por favor. El gimnasio cerrará en 5 minutos. ¡Muchas gracias por entrenar con nosotros, los esperamos mañana!'],
    ['Cierre en 15 min', 'Atención, por favor. Les recordamos que el gimnasio cerrará en 15 minutos. Vayan terminando su rutina con calma.'],
    ['Ordenar equipos', 'Les pedimos, por favor, devolver las pesas, discos y mancuernas a su lugar después de usarlos. ¡Gracias por mantener el orden!'],
    ['Limpiar máquinas', 'Por favor, limpien las máquinas y bancas después de usarlas. Cuidemos juntos nuestro espacio.'],
    ['Hidratación', 'Recuerden mantenerse hidratados durante su entrenamiento. ¡Su cuerpo se lo agradecerá!'],
    ['Buenos días', '¡Buenos días, familia C&Y Fitness! Les deseamos un excelente entrenamiento. ¡A darle con todo!'],
    ['Buenas noches', '¡Buenas noches, familia C&Y Fitness! Gracias por elegirnos. Disfruten su entrenamiento.'],
    ['Renovación 10%', 'Les recordamos que si renuevan su membresía antes de su fecha de vencimiento, tienen 10% de descuento. Consulten en recepción.'],
    ['Pertenencias', 'Por favor, cuiden sus pertenencias y usen los casilleros. El gimnasio no se responsabiliza por objetos olvidados.'],
    ['Clase en 10 min', 'Atención, por favor. La clase grupal empieza en 10 minutos. ¡Los esperamos!']
  ];
  function misMensajes(){ try { return JSON.parse(leer(LS.mios, '[]')) || []; } catch(e){ return []; } }
  function pintarSugeridos(){
    const s = $('avSugeridos'), m = $('avMios'), mt = $('avMisT');
    if (s && !s.childElementCount) s.innerHTML = SUGERIDOS.map((x, i) => `<button type="button" class="av-chip" data-av="usar" data-i="${i}">${escaparHTML(x[0])}</button>`).join('');
    const mios = misMensajes();
    if (m) m.innerHTML = mios.map((x, i) => `<span class="av-chip av-chip--mio"><button type="button" data-av="usarmio" data-i="${i}">${escaparHTML(x.length > 34 ? x.slice(0, 32) + '…' : x)}</button><button type="button" class="av-chip-x" data-av="borrarmio" data-i="${i}" aria-label="Quitar"><i class="fa-solid fa-xmark"></i></button></span>`).join('');
    if (mt) mt.hidden = !mios.length;
  }
  function pintarAnuncio(){
    const b = $('avPlay'); if (!b) return;
    b.classList.toggle('sonando', hablando);
    b.querySelector('span').textContent = hablando ? 'Reproduciendo…' : 'Reproducir';
  }
  function contar(){ const t = $('avAnuncioTxt'), c = $('avAnuncioCont'); if (t && c) c.textContent = t.value.length + '/600'; }
  function anunciar(){
    const t = ($('avAnuncioTxt').value || '').trim();
    if (!t) { nota('Escribe un mensaje o toca uno de los sugeridos.', 'info'); $('avAnuncioTxt').focus(); return; }
    if (esAppNativa()) { window.AndroidApp.hablar(t); nota('Anuncio reproducido en el celular.', 'ok'); return; }
    if (!tieneVoz) { nota('Este navegador no tiene voz. Usa Google Chrome.', 'mal'); return; }
    detener();
    const conTimbre = $('avTimbre').checked;
    escribir(LS.timbre, conTimbre ? '1' : '0');
    hablar(t, { tipo: 'anuncio', timbre: conTimbre, largo: true, repetir: $('avRepetir').checked });
    nota('');
  }

  // ---------- Selector de voz ----------
  function llenarVoces(){
    const sel = $('avVozSel'); if (!sel) return;
    const vs = vocesEs().sort((a, b) => puntaje(b) - puntaje(a));
    const actual = usarIA() ? 'ia:' + vozIA() : 'dev:' + ((vozElegida() || {}).name || '');
    let html = '';
    if (IA.estado === true) html += '<optgroup label="Voz natural (IA gratis)">' + Object.keys(IA.voces).map(k => `<option value="ia:${escaparHTML(k)}"${actual === 'ia:' + k ? ' selected' : ''}>${escaparHTML(IA.voces[k])}</option>`).join('') + '</optgroup>';
    if (vs.length) html += '<optgroup label="Voz del celular' + (IA.estado === true ? ' (sin internet)' : '') + '">' + vs.map((v, i) => `<option value="dev:${escaparHTML(v.name)}"${actual === 'dev:' + v.name ? ' selected' : ''}>${!IA.estado && i === 0 ? '★ ' : ''}${escaparHTML(v.name)} (${escaparHTML(v.lang)})</option>`).join('') + '</optgroup>';
    sel.innerHTML = html || '<option>Voz del celular</option>';
    sel.disabled = !html;
    const est = $('avVozEstado');
    if (est) {
      if (IA.estado === true && Date.now() < IA.pausaHasta) { est.className = 'av-estado mal'; est.innerHTML = '<i class="fa-solid fa-hourglass-half"></i> Cupo gratuito del momento agotado: unos minutos con la voz del celular. Las frases ya guardadas siguen con voz natural.'; }
      else if (IA.estado === true) { est.className = 'av-estado ok'; est.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Voz natural (IA) activa · gratis'; }
      else if (IA.motivo === 'clave_invalida') { est.className = 'av-estado mal'; est.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> La clave de Google no es válida. Usando la voz del celular.'; }
      else { est.className = 'av-estado'; est.innerHTML = '<i class="fa-solid fa-mobile-screen"></i> Usando la voz del celular. Para la voz natural gratis, falta poner la clave de Google.'; }
    }
  }

  // ---------- Pantalla ----------
  async function pintar(){
    const appBtn = $('avAppBtn'), appTxt = $('avAppTxt');
    if (appBtn) {
      if (instalada()) { appBtn.textContent = 'Instalada'; appBtn.disabled = true; appBtn.classList.add('ok'); appTxt.textContent = 'Ya la estás usando como app.'; }
      else { appBtn.textContent = 'Instalar'; appBtn.disabled = false; appBtn.classList.remove('ok'); }
    }
    const pushBtn = $('avPushBtn'), pushTxt = $('avPushTxt'), prueba = $('avPrueba');
    let activo = false;
    if (esAppNativa()) {
      const avisos = window.AndroidApp.obtenerPref('ingresos_on');
      pushBtn.disabled = false;
      pushBtn.textContent = avisos ? 'Pausar' : 'Reanudar';
      pushBtn.classList.toggle('ok', avisos);
      pushTxt.textContent = avisos ? 'Activadas: te llega un aviso con cada ingreso, aunque la app esté cerrada.' : 'Pausadas: no llegará ningún aviso hasta que lo reanudes.';
      try {
        const log = JSON.parse(window.AndroidApp.ultimosAvisos() || '[]');
        if (log.length) pushTxt.textContent += ' Último aviso: ' + log[0].hora + ' · ' + (log[0].voz ? 'se leyó en voz' : 'sin voz') + '.';
      } catch (e) {}
      activo = avisos;
    }
    else if (!soportaPush()) { pushBtn.textContent = 'No disponible'; pushBtn.disabled = true; }
    else {
      let sub = null; try { sub = await suscripcionActual(); } catch(e){}
      // En la app instalada la comprobación del navegador puede tardar; si ya se activó aquí, cuenta como activo
      activo = Notification.permission === 'granted' && (!!sub || leer(LS.push, '0') === '1');
      pushBtn.disabled = false;
      pushBtn.textContent = activo ? 'Apagar' : 'Activar';
      pushBtn.classList.toggle('ok', activo);
      pushTxt.textContent = activo ? 'Activadas: te llega un aviso con cada ingreso, aunque la app esté cerrada.'
        : (Notification.permission === 'denied' ? 'Bloqueadas en este celular. Permítelas en los ajustes del sitio.' : 'Te llega un aviso cada vez que un socio ingresa, aunque la app esté cerrada.');
    }
    if (prueba) prueba.hidden = !activo;
    // En la app Android la voz la lee la propia app: se ocultan las opciones de voz de la página
    if (esAppNativa()) {
      // La voz de la página no se usa en la app; solo se ocultan sus opciones de página
      const subVoz = document.querySelector('.av-op--voz + .av-sub');
      if (subVoz) subVoz.hidden = true;
    }
    const vozBtn = $('avVozBtn');
    if (vozBtn) {
      const on = esAppNativa() ? window.AndroidApp.obtenerPref('voz_on') : vozActiva();
      vozBtn.textContent = on ? 'Pausar' : 'Reanudar';
      vozBtn.classList.toggle('ok', on);
      vozBtn.setAttribute('aria-pressed', String(on));
    }
    const chk = $('avVozIntentos'); if (chk) chk.checked = avisarIntentos();
    const tim = $('avTimbre'); if (tim) tim.checked = leer(LS.timbre, '1') === '1';
    llenarVoces(); pintarSugeridos(); pintarAnuncio(); contar();
    comprobarIA(true).then(() => llenarVoces());
    const punto = document.querySelector('#btnAvisos .tb-punto');
    if (punto) punto.hidden = activo;
  }

  window.cyAbrirAvisos = function(){
    const m = $('cyAvisos'); if (!m) return;
    nota('');
    m.hidden = false; requestAnimationFrame(() => m.classList.add('visible'));
    pintar();
  };
  function cerrar(){ const m = $('cyAvisos'); if (!m) return; m.classList.remove('visible'); setTimeout(() => { m.hidden = true; }, 200); }

  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'avVozSel') { escribir(LS.vozNombre, e.target.value); detener(); hablar(saludo('María Quispe').frase, { tipo: 'saludo' }); }
    if (e.target && e.target.id === 'avVozIntentos') escribir(LS.intentos, e.target.checked ? '1' : '0');
  });
  document.addEventListener('input', (e) => { if (e.target && e.target.id === 'avAnuncioTxt') contar(); });
  document.addEventListener('click', async (e) => {
    const m = $('cyAvisos');
    if (!m || m.hidden) return;
    if (e.target === m) return cerrar();
    const b = e.target.closest('[data-av]'); if (!b || !m.contains(b)) return;
    const a = b.getAttribute('data-av');
    if (a === 'cerrar') return cerrar();
    if (a === 'detener') return detener();
    if (a === 'anunciar') return anunciar();
    if (a === 'usar') { $('avAnuncioTxt').value = SUGERIDOS[+b.dataset.i][1]; contar(); return; }
    if (a === 'usarmio') { $('avAnuncioTxt').value = misMensajes()[+b.dataset.i] || ''; contar(); return; }
    if (a === 'borrarmio') { const l = misMensajes(); l.splice(+b.dataset.i, 1); escribir(LS.mios, JSON.stringify(l)); pintarSugeridos(); return; }
    if (a === 'guardarmsg') {
      const t = ($('avAnuncioTxt').value || '').trim();
      if (!t) { nota('Escribe primero el mensaje que quieres guardar.', 'info'); return; }
      const l = misMensajes().filter(x => x !== t); l.unshift(t); escribir(LS.mios, JSON.stringify(l.slice(0, 12)));
      pintarSugeridos(); nota('Mensaje guardado en “Mis mensajes”.', 'ok'); return;
    }
    if (a === 'vozprueba') {
      if (!tieneVoz) { nota('Este navegador no tiene voz. Usa Google Chrome.', 'mal'); return; }
      detener();
      if (b.dataset.ej === 'vencido') hablar('', { partes: [{ texto: saludo('Juan García').frase, tipo: 'saludo' }, { texto: MOTIVO_VOZ.VENCIDO, tipo: 'aviso' }] });
      else hablar(saludo('Karla Quispe').frase, { tipo: 'saludo' });
      return;
    }
    if (ocupado) return;
    ocupado = true; b.classList.add('cargando');
    try {
      if (a === 'instalar') await instalar();
      else if (a === 'push' && esAppNativa()) { window.AndroidApp.guardarPref('ingresos_on', !window.AndroidApp.obtenerPref('ingresos_on')); await pintar(); }
      else if (a === 'voz' && esAppNativa()) { window.AndroidApp.guardarPref('voz_on', !window.AndroidApp.obtenerPref('voz_on')); await pintar(); }
      else if (a === 'push') { const sub = await suscripcionActual().catch(() => null); const activo = Notification.permission === 'granted' && (!!sub || leer(LS.push, '0') === '1'); if (activo) await desactivarPush(); else await activarPush(); }
      else if (a === 'prueba') await probar();
      else if (a === 'voz') {
        const on = !vozActiva();
        escribir(LS.voz, on ? '1' : '0');
        if (on) { hablar('¡Listo! La voz de bienvenida está activada.', { tipo: 'saludo' }); nota('Mantén el panel abierto y el volumen alto: saludará a cada socio que ingrese por QR.', 'ok'); }
        else { detener(); nota('Voz apagada.', 'info'); }
      }
    } catch (err) {
      console.error('Avisos:', err);
      const n = err && err.name;
      nota((n === 'AbortError' || n === 'NotAllowedError' || n === 'NotSupportedError')
        ? 'Este navegador no dejó activar las notificaciones. Abre el panel en Google Chrome (no en modo incógnito) e inténtalo otra vez.'
        : 'No se pudo completar. Revisa el internet e inténtalo de nuevo.', 'mal');
    } finally {
      ocupado = false; b.classList.remove('cargando'); pintar();
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const m = $('cyAvisos'); if (m && !m.hidden) cerrar(); } });

  // Al abrir el panel con sesión: renueva en silencio la suscripción push
  setTimeout(async () => {
    try {
      if (soportaPush() && Notification.permission === 'granted') {
        const sub = await suscripcionActual();
        if (sub) await guardarSuscripcion(sub);
      }
      pintar();
    } catch(e){}
  }, 5000);
})();
