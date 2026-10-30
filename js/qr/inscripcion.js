// Pre-registro por QR (público) y lista de espera (admin).
// Clásico (no módulo): comparte el mismo ámbito global que antes del corte.
/* v42 — Pre-registro por QR (público) + lista de espera (admin). */
(function(){
  var DEFECTO = '2 días adicionales en tu membresía mensual';
  var ESTILOS = { fuego:{e:'🔥',n:'Fuego'}, oro:{e:'👑',n:'Oro'}, neon:{e:'⚡',n:'Neón'}, hielo:{e:'💎',n:'Hielo'}, fiesta:{e:'🎉',n:'Fiesta'} };
  function restante(fin){
    var ms = new Date(fin).getTime() - Date.now(); if(!(ms > 0)) return null;
    var m = Math.floor(ms/60000), d = Math.floor(m/1440), h = Math.floor((m%1440)/60), mi = m%60;
    return d > 0 ? d + 'd ' + h + 'h' : (h > 0 ? h + 'h ' + mi + 'm' : Math.max(1,mi) + 'm');
  }
  function fechaCorta(fin){ return new Date(fin).toLocaleDateString('es-PE',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'America/Lima'}); }
  window.CY_PROMO = { DEFECTO: DEFECTO, ESTILOS: ESTILOS, restante: restante, fecha: fechaCorta };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function $(id){ return document.getElementById(id); }
  function esc(t){ return escaparHTML(t); }

  /* ---------- Instalar la página del QR como app (Chrome en Android) ---------- */
  (function(){
    var btnI = document.getElementById('btnInstalarQR');
    var cardI = document.getElementById('cardInstalarQR');
    var pasosI = document.getElementById('pasosInstalarQR');
    if (!btnI || !cardI || !pasosI) return;
    var yaInstalada = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    if (yaInstalada) return;
    // iPhone/iPad: no hay instalación con un toque; se muestran los pasos para Agregar a pantalla de inicio
    var esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (esIOS) { pasosI.hidden = false; btnI.hidden = true; cardI.style.display = 'flex'; return; }
    var evInstalar = null;
    window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); evInstalar = e; cardI.style.display = 'flex'; });
    window.addEventListener('appinstalled', function(){ cardI.style.display = 'none'; });
    btnI.addEventListener('click', async function(){
      if (!evInstalar) return;
      evInstalar.prompt();
      try { await evInstalar.userChoice; } catch(e){}
      evInstalar = null; cardI.style.display = 'none';
    });
  })();

  /* ---------- Público ---------- */
  var btn = $('btnInscribirseQR');
  if(btn) btn.addEventListener('click', function(){ window.cyAbrirInscripcion(); });

  window.cyAbrirInscripcion = function(){
    var ov = $('inscOverlay'); if(!ov) return;
    ov.style.display = 'block'; ov.scrollTop = 0;
    $('inscError').textContent = '';
    setTimeout(function(){ try{ $('inscDni').focus({preventScroll:true}); }catch(e){} }, 300);
  };
  window.cyCerrarInscripcion = function(){
    var ov = $('inscOverlay'); if(ov) ov.style.display = 'none';
  };

  function soloDigitos(v){ return String(v||'').replace(/\D/g,''); }

  window.cyEnviarPrereg = async function(e){
    if(e) e.preventDefault();
    var err = $('inscError'), b = $('inscEnviar');
    if(b.disabled) return;
    var dni = soloDigitos($('inscDni').value);
    var nombre = $('inscNombre').value.replace(/\s+/g,' ').trim();
    var wsp = soloDigitos($('inscWsp').value);
    if(wsp.length === 11 && wsp.indexOf('51') === 0) wsp = wsp.slice(2);
    if(dni.length < 6 || dni.length > 12){ err.textContent = 'Revisa tu DNI (solo números).'; $('inscDni').focus(); return; }
    if(nombre.length < 2){ err.textContent = 'Escribe tu nombre completo.'; $('inscNombre').focus(); return; }
    if(wsp.length < 7 || wsp.length > 15){ err.textContent = 'Revisa tu número de WhatsApp.'; $('inscWsp').focus(); return; }
    err.textContent = '';
    b.disabled = true; b.querySelector('span').textContent = 'Enviando…';
    try{
      /* El SERVIDOR decide el premio según la hora real (promoción vigente o el de siempre) */
      var r = await supabaseClient.rpc('registrar_prospecto_qr', { p_dni: dni, p_nombre: nombre, p_whatsapp: wsp });
      if(r && r.error){
        var msg = String(r.error.message || '');
        if(r.error.code === 'PGRST202' || /could not find the function/i.test(msg)){
          /* Respaldo: si la función aún no existe en la base, se usa el registro directo con el premio de siempre */
          var r2 = await supabaseClient.from('prospectos_qr').insert([{ dni: dni, nombre: nombre, whatsapp: wsp, premio: DEFECTO }]);
          if(r2 && r2.error){
            if(r2.error.code === '23505'){ cyMostrarCelebracion(null, nombre, true); return; }
            err.textContent = 'No pudimos enviar tus datos. Inténtalo de nuevo en un momento.'; return;
          }
          cyMostrarCelebracion(DEFECTO, nombre, false, null); return;
        }
        err.textContent = (r.error.code === '22023') ? 'Revisa tus datos e inténtalo otra vez.' : 'No pudimos enviar tus datos. Inténtalo de nuevo en un momento.';
        return;
      }
      var row = Array.isArray(r.data) ? r.data[0] : r.data;
      if(!row){ err.textContent = 'No pudimos enviar tus datos. Inténtalo de nuevo en un momento.'; return; }
      if(row.estado === 'duplicado'){ cyMostrarCelebracion(null, nombre, true); return; }
      cyMostrarCelebracion(row.premio, nombre, false, row);
    }catch(ex){
      err.textContent = 'Sin conexión. Revisa tu internet e inténtalo otra vez.';
    }finally{
      b.disabled = false; b.querySelector('span').textContent = 'Enviar y ver mi premio';
    }
  };

  var CONF = ['#fbbf24','#34d399','#60a5fa','#f472b6','#a78bfa','#fb923c','#f87171','#2dd4bf'];
  function rnd(a,b){ return a + Math.random()*(b-a); }
  function construirFx(){
    var fx = $('celFx'); if(!fx) return; fx.innerHTML = '';
    if(reduce) return;
    var frag = document.createDocumentFragment(), i, el;
    for(i=0;i<56;i++){
      el = document.createElement('i'); el.className = 'cf';
      var ser = i%4===0, ang = rnd(0,Math.PI*2), dist = rnd(90,Math.min(window.innerWidth,420));
      el.style.cssText = '--w:'+(ser?4:rnd(7,12)).toFixed(1)+'px;--h:'+(ser?rnd(26,44):rnd(9,16)).toFixed(1)+'px;--r:'+(ser?'2px':(i%3?'2px':'50%'))+
        ';--c:'+CONF[i%CONF.length]+';--bx:'+(Math.cos(ang)*dist).toFixed(0)+'px;--by:'+(Math.sin(ang)*dist*0.9-40).toFixed(0)+'px;--sw:'+rnd(-60,60).toFixed(0)+'px;--rot:'+rnd(120,420).toFixed(0)+'deg;--t:'+rnd(3.2,5.4).toFixed(2)+'s;--d:'+rnd(0,.35).toFixed(2)+'s';
      frag.appendChild(el);
    }
    for(i=0;i<9;i++){
      el = document.createElement('i'); el.className = 'bl';
      el.style.cssText = '--x:'+rnd(2,90).toFixed(0)+'%;--s:'+rnd(38,64).toFixed(0)+'px;--c:'+CONF[(i+2)%CONF.length]+';--sw:'+rnd(-30,30).toFixed(0)+'px;--t:'+rnd(6,9.5).toFixed(1)+'s;--d:'+rnd(.2,1.8).toFixed(2)+'s';
      frag.appendChild(el);
    }
    for(i=0;i<7;i++){
      el = document.createElement('i'); el.className = 'db';
      el.style.cssText = '--x:'+rnd(2,92).toFixed(0)+'%;--sw:'+rnd(-70,70).toFixed(0)+'px;--t:'+rnd(7,11).toFixed(1)+'s;--d:'+rnd(0,6).toFixed(1)+'s';
      frag.appendChild(el);
    }
    fx.appendChild(frag);
  }

  window.cyMostrarCelebracion = function(premio, nombre, yaEstaba, info){
    var ov = $('celebOverlay'); if(!ov) return;
    var promo = !!(info && info.es_promo && !yaEstaba);
    var est = promo ? (ESTILOS[info.estilo] ? info.estilo : 'fuego') : '';
    ov.className = 'cy-ov cy-celeb' + (promo ? ' promo st-' + est : '');
    var primero = String(nombre||'').split(' ')[0];
    $('celNombre').textContent = primero ? ', ' + primero : '';
    var prize = $('celPrize'), hint = $('celHint'), sub = $('celSub'), badge = $('celBadge'), desc = $('celDesc'), vence = $('celVence');
    $('celEmoji').textContent = promo ? ESTILOS[est].e : '🎉';
    badge.style.display = promo ? 'inline-block' : 'none';
    if(promo) badge.textContent = ESTILOS[est].e + ' PROMO ESPECIAL';
    desc.style.display = 'none'; vence.style.display = 'none';
    ov.style.display = 'block'; ov.scrollTop = 0;
    construirFx();
    if(yaEstaba || !premio){
      $('celebTitulo').firstChild.textContent = '¡Ya estás en la lista';
      sub.textContent = 'Tus datos ya estaban registrados';
      prize.textContent = '¡Te esperamos en recepción!';
      hint.textContent = 'Menciona tu DNI para que te atiendan.';
      return;
    }
    $('celebTitulo').firstChild.textContent = '¡Felicidades';
    sub.textContent = 'Ganaste';
    hint.textContent = 'Preséntate en recepción y menciona tu DNI para canjear tu premio. ¡Te esperamos!';
    function detalles(){
      if(!promo) return;
      if(info.descripcion){ desc.textContent = info.descripcion; desc.style.display = 'block'; }
      if(info.fin){
        var q = restante(info.fin);
        vence.textContent = '⏳ Válido hasta el ' + fechaCorta(info.fin) + (q ? ' · quedan ' + q : '');
        vence.style.display = 'inline-block';
      }
    }
    if(reduce){ prize.textContent = premio; detalles(); return; }
    /* efecto "ruleta": alterna premios un instante y se detiene en el real */
    var cola = promo ? [DEFECTO, premio, DEFECTO, premio] : [DEFECTO, '¡Sorpresa! 🎁', 'Premio especial ✨', DEFECTO];
    prize.classList.add('girando'); var n = 0, t = setInterval(function(){
      prize.textContent = cola[n++ % cola.length];
      if(n > 8){ clearInterval(t); prize.textContent = premio; prize.classList.remove('girando'); detalles(); }
    }, 110);
  };

  window.cyCerrarCelebracion = function(){
    var ov = $('celebOverlay'); if(ov){ ov.style.display = 'none'; ov.className = 'cy-ov cy-celeb'; }
    var fx = $('celFx'); if(fx) fx.innerHTML = '';
    cyCerrarInscripcion();
    var f = $('inscForm'); if(f) f.reset();
    var h = $('qrCardPrimeraVez'); if(h) h.scrollTop = 0;
  };

  /* ---------- Promoción vigente (pantalla pública) ---------- */
  var promoActiva = null, promoTimer = null;
  function pintarPromoPublica(){
    var p = promoActiva, tz = $('promoTeaser'), tile = $('tilePromo'), ip = $('inscPromo'), b = $('btnInscribirseQR');
    var q = p ? restante(p.fin) : null;
    if(!p || !q){
      promoActiva = null;
      if(tz) tz.style.display = 'none'; if(tile) tile.style.display = 'none'; if(ip) ip.style.display = 'none';
      if(b) b.classList.remove('has-promo');
      if(promoTimer){ clearInterval(promoTimer); promoTimer = null; }
      return;
    }
    var est = ESTILOS[p.estilo] ? p.estilo : 'fuego';
    if(tz){ tz.className = 'promo-teaser st-' + est; tz.style.display = 'flex'; }
    if($('ptEm')) $('ptEm').textContent = ESTILOS[est].e;
    if($('ptTx')) $('ptTx').textContent = 'Inscríbete y gana: ' + p.titulo;
    if($('ptTime')) $('ptTime').textContent = '⏳ ' + q;
    if(tile){ tile.style.display = 'inline-block'; tile.textContent = ESTILOS[est].e + ' PROMO'; }
    if(b) b.classList.add('has-promo');
    if(ip){ ip.className = 'insc-promo st-' + est; ip.style.display = 'block'; ip.textContent = ESTILOS[est].e + ' Hoy puedes ganar: ' + p.titulo + ' · termina en ' + q; }
  }
  window.cyCargarPromoQR = async function(){
    try{
      var r = await supabaseClient.rpc('premio_activo_qr');
      var row = r && !r.error ? (Array.isArray(r.data) ? r.data[0] : r.data) : null;
      promoActiva = row || null;
      pintarPromoPublica();
      if(promoActiva && !promoTimer) promoTimer = setInterval(pintarPromoPublica, 30000);
    }catch(e){}
  };

  /* ---------- Admin ---------- */
  var esPublico = document.documentElement.classList.contains('qr-mode');
  if(esPublico) window.cyCargarPromoQR();
  var cargando = false, pendientes = [], timer = null, seleccionado = null;

  function pintarPendientes(){
    var cont = $('pendLista'), cnt = $('pendCount'); if(!cont) return;
    cont.innerHTML = '';
    if(cnt){ cnt.style.display = pendientes.length ? 'inline-grid' : 'none'; cnt.textContent = pendientes.length; }
    if(!pendientes.length){
      var v = document.createElement('div'); v.className = 'pend-vacio'; v.textContent = 'No hay solicitudes pendientes';
      cont.appendChild(v); return;
    }
    pendientes.forEach(function(p){
      var wrap = document.createElement('div'); wrap.className = 'pend-wrap';
      var b = document.createElement('button'); b.type = 'button'; b.className = 'pend-item' + (seleccionado === p.dni ? ' sel' : '');
      var av = document.createElement('span'); av.className = 'pend-av'; av.textContent = (p.nombre||'?').trim().charAt(0).toUpperCase();
      var info = document.createElement('span'); info.className = 'pend-info';
      var n = document.createElement('strong'); n.textContent = p.nombre;
      var d = document.createElement('small');
      var d1 = document.createElement('span'); d1.textContent = 'DNI ' + p.dni;
      var d2 = document.createElement('span'); d2.innerHTML = '<i class="fa-brands fa-whatsapp"></i> '; d2.appendChild(document.createTextNode(p.whatsapp || ''));
      d.appendChild(d1); d.appendChild(d2);
      info.appendChild(n); info.appendChild(d);
      if(p.premio){ var esPromo = p.premio !== DEFECTO; var pr = document.createElement('span'); pr.className = 'pend-premio' + (esPromo ? ' promo' : ''); pr.textContent = (esPromo ? '🔥 Promo: ' : '🎁 ') + p.premio; info.appendChild(pr); }
      var go = document.createElement('i'); go.className = 'fa-solid fa-chevron-right pend-go';
      b.appendChild(av); b.appendChild(info); b.appendChild(go);
      b.addEventListener('click', function(){ elegir(p); });
      /* X para quitar de la lista a quien ya no vendrá (pide un segundo toque para confirmar) */
      var x = document.createElement('button'); x.type = 'button'; x.className = 'pend-x';
      x.setAttribute('aria-label', 'Eliminar a ' + p.nombre + ' de la lista de espera');
      x.innerHTML = '<span aria-hidden="true">✕</span>';
      var t = null;
      x.addEventListener('click', function(ev){
        ev.stopPropagation();
        if(!x.classList.contains('conf')){
          x.classList.add('conf'); x.innerHTML = '<span>¿Eliminar?</span>';
          t = setTimeout(function(){ x.classList.remove('conf'); x.innerHTML = '<span aria-hidden="true">✕</span>'; }, 3000);
          return;
        }
        clearTimeout(t); eliminarPendiente(p, wrap, x);
      });
      wrap.appendChild(b); wrap.appendChild(x);
      cont.appendChild(wrap);
    });
    var hint = $('pendHint'); if(hint) hint.style.display = pendientes.length > 3 ? 'block' : 'none';
  }

  async function eliminarPendiente(p, wrap, x){
    x.disabled = true;
    try{
      var r = await supabaseClient.rpc('borrar_prospecto_qr', { p_dni: String(p.dni).trim() });
      if(r && r.error) throw r.error;
      pendientes = pendientes.filter(function(q){ return q.dni !== p.dni; });
      if(seleccionado === p.dni){ seleccionado = null; var av = $('avisoPremio'); if(av) av.style.display = 'none'; }
      pintarPendientes();
      if(typeof mostrarToast === 'function') mostrarToast('🗑️ Solicitud eliminada', '#10b981');
    }catch(e){
      x.disabled = false; x.classList.remove('conf'); x.innerHTML = '<span aria-hidden="true">✕</span>';
      if(typeof mostrarToast === 'function') mostrarToast('❌ No se pudo eliminar. Intenta de nuevo.', '#ef4444');
    }
  }

  function elegir(p){
    seleccionado = p.dni;
    var m = {dni:p.dni, nombre:p.nombre, telefono:p.whatsapp};
    Object.keys(m).forEach(function(id){ var el = $(id); if(el){ el.value = m[id]; el.dispatchEvent(new Event('input',{bubbles:true})); } });
    var av = $('avisoPremio');
    if(av){
      if(p.premio){ av.textContent = (p.premio !== DEFECTO ? '🔥 PROMO' : '🎁 Premio') + ' de ' + p.nombre.split(' ')[0] + ': ' + p.premio + '. Aplícalo manualmente al guardar.'; av.style.display = 'block'; }
      else { av.style.display = 'none'; }
    }
    pintarPendientes();
    var campo = $('tipo_memb'); if(campo){ campo.scrollIntoView({behavior: reduce ? 'auto' : 'smooth', block:'center'}); }
  }

  window.cyCargarProspectos = async function(manual){
    if(esPublico || cargando) return; cargando = true;
    var cont = $('pendLista');
    try{
      var r = await supabaseClient.rpc('listar_prospectos_qr');
      if(r.error) throw r.error;
      pendientes = r.data || [];
      pintarPendientes();
    }catch(e){
      if(cont && !pendientes.length){ cont.innerHTML = ''; var v = document.createElement('div'); v.className = 'pend-vacio'; v.textContent = 'No se pudo cargar la lista de espera.'; cont.appendChild(v); }
      if(manual && typeof mostrarToast === 'function') mostrarToast('⚠️ No se pudo actualizar la lista de espera', '#f59e0b');
    }finally{ cargando = false; }
  };

  /* Se llama justo después de guardar un socio con éxito: quita su solicitud pendiente */
  window.cyProspectoProcesado = async function(dni){
    try{
      var r = await supabaseClient.rpc('borrar_prospecto_qr', { p_dni: String(dni||'').trim() });
      if(r && r.error) throw r.error;
    }catch(e){ console.warn('No se pudo quitar la solicitud pendiente:', e); }
    seleccionado = null;
    var av = $('avisoPremio'); if(av) av.style.display = 'none';
    cyCargarProspectos();
  };

  /* Actualización automática mientras la pestaña Registro está abierta */
  if(!esPublico){
    timer = setInterval(function(){
      var t2 = $('tab2');
      if(t2 && t2.classList.contains('active') && !document.hidden) cyCargarProspectos();
    }, 25000);
  }
})();
