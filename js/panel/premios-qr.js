// Panel: premios del QR (promociones con fecha límite).
// Clásico (no módulo): mismo ámbito global y mismo orden que antes.
/* v44 — Panel admin: premios del QR (promociones con fecha límite). */
(function(){
  if(document.documentElement.classList.contains('qr-mode')) return;
  function $(id){ return document.getElementById(id); }
  var P = window.CY_PROMO || { DEFECTO:'', ESTILOS:{fuego:{e:'🔥',n:'Fuego'}}, restante:function(){return null;}, fecha:function(f){return f;} };
  var lista = [], editando = null, estiloSel = 'fuego', timer = null, cargando = false;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function hoyLima(){ return new Date(Date.now() - 5*3600*1000).toISOString().slice(0,10); }
  function estadoLocal(p){
    var ahora = Date.now();
    if(!p.activo) return 'pausado';
    if(ahora >= new Date(p.fin).getTime()) return 'vencido';
    if(ahora < new Date(p.inicio).getTime()) return 'programado';
    return 'activo';
  }
  function diaLima(iso){ return new Date(iso).toLocaleDateString('es-PE',{day:'2-digit',month:'2-digit',timeZone:'America/Lima'}); }
  function toast(m,c){ if(typeof mostrarToast === 'function') mostrarToast(m,c); }

  /* Sub-pestañas Invitar / Premios */
  window.cyInvTab = function(t){
    var premios = (t === 'premios'), cupones = (t === 'cupones'), enviar = !premios && !cupones;
    $('invPanelEnviar').style.display = enviar ? 'block' : 'none';
    $('invPanelPremios').style.display = premios ? 'block' : 'none';
    if($('invPanelCupones')) $('invPanelCupones').style.display = cupones ? 'block' : 'none';
    [['segEnviar', enviar], ['segPremios', premios], ['segCupones', cupones]].forEach(function(x){
      var el = $(x[0]); if(!el) return; el.classList.toggle('on', x[1]); el.setAttribute('aria-selected', String(x[1]));
    });
    if(premios){ prepararForm(); cyCargarPremios(); iniciarTimer(); } else { detenerTimer(); }
    if(cupones && window.cyCargarCuponesMes) window.cyCargarCuponesMes();
  };

  function pintarEstilos(){
    var c = $('premEstilos'); if(!c) return; c.innerHTML = '';
    Object.keys(P.ESTILOS).forEach(function(k){
      var b = document.createElement('button'); b.type = 'button'; b.className = 'prem-estilo st-' + k + (k === estiloSel ? ' on' : '');
      b.setAttribute('role','radio'); b.setAttribute('aria-checked', String(k === estiloSel));
      b.innerHTML = '<span aria-hidden="true">' + P.ESTILOS[k].e + '</span><small>' + P.ESTILOS[k].n + '</small>';
      b.addEventListener('click', function(){ estiloSel = k; pintarEstilos(); });
      c.appendChild(b);
    });
  }
  function prepararForm(){
    if(!$('premDesde').value) $('premDesde').value = hoyLima();
    pintarEstilos();
  }
  function limpiarForm(){
    editando = null; estiloSel = 'fuego';
    $('premTitulo').value = ''; $('premDesc').value = ''; $('premDesde').value = hoyLima(); $('premHasta').value = '';
    $('premError').textContent = ''; $('premFormTitulo').textContent = 'Nueva promoción';
    $('premGuardar').querySelector('span').textContent = 'Crear promoción'; $('premCancelar').style.display = 'none';
    pintarEstilos();
  }
  window.cyCancelarEdicionPremio = limpiarForm;

  window.cyGuardarPremio = async function(){
    var b = $('premGuardar'), err = $('premError'); if(b.disabled) return;
    var titulo = $('premTitulo').value.replace(/\s+/g,' ').trim();
    var desc = $('premDesc').value.trim();
    var desde = $('premDesde').value || hoyLima(), hasta = $('premHasta').value;
    if(titulo.length < 3){ err.textContent = 'Escribe el premio de la promoción.'; $('premTitulo').focus(); return; }
    if(!hasta){ err.textContent = 'Elige la fecha límite.'; $('premHasta').focus(); return; }
    if(hasta < desde){ err.textContent = 'La fecha límite no puede ser antes de la fecha de inicio.'; return; }
    var ini = desde + 'T00:00:00-05:00', fin = hasta + 'T23:59:59-05:00';
    if(!editando && new Date(fin).getTime() <= Date.now()){ err.textContent = 'Esa fecha límite ya pasó.'; return; }
    err.textContent = ''; b.disabled = true;
    try{
      var r = await supabaseClient.rpc('admin_guardar_premio_qr', { p_id: editando, p_titulo: titulo, p_descripcion: desc || null, p_estilo: estiloSel, p_inicio: ini, p_fin: fin, p_activo: editando ? null : true });
      if(r && r.error) throw r.error;
      toast(editando ? '✅ Promoción actualizada' : '🔥 Promoción creada', '#10b981');
      limpiarForm(); cyCargarPremios();
    }catch(e){
      err.textContent = 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.';
    }finally{ b.disabled = false; }
  };

  window.cyCargarPremios = async function(manual){
    if(cargando) return; cargando = true;
    try{
      var r = await supabaseClient.rpc('admin_listar_premios_qr');
      if(r.error) throw r.error;
      lista = r.data || []; pintarLista();
    }catch(e){
      if(!lista.length){ var c = $('premLista'); c.innerHTML = ''; var v = document.createElement('div'); v.className = 'pend-vacio'; v.textContent = 'No se pudieron cargar las promociones.'; c.appendChild(v); }
      if(manual) toast('⚠️ No se pudo actualizar', '#f59e0b');
    }finally{ cargando = false; }
  };

  function textoTiempo(p, est){
    if(est === 'activo'){ var q = P.restante(p.fin); return q ? '⏳ Termina en ' + q : 'Termina hoy'; }
    if(est === 'programado') return '📅 Empieza el ' + diaLima(p.inicio);
    if(est === 'vencido') return 'Venció el ' + P.fecha(p.fin);
    return '⏸ En pausa · límite ' + P.fecha(p.fin);
  }
  var ETQ = { activo:'ACTIVA AHORA', programado:'PROGRAMADA', vencido:'VENCIDA', pausado:'PAUSADA' };

  function boton(cls, icono, txt, fn){
    var b = document.createElement('button'); b.type = 'button'; b.className = 'pc-btn ' + cls;
    b.innerHTML = '<i class="fa-solid ' + icono + '"></i><span>' + txt + '</span>'; b.addEventListener('click', fn); return b;
  }

  function pintarLista(){
    var c = $('premLista'); c.innerHTML = '';
    if(!lista.length){
      var v = document.createElement('div'); v.className = 'pend-vacio'; v.textContent = 'Aún no creaste promociones. Siempre se entrega el premio de siempre.'; c.appendChild(v); return;
    }
    lista.forEach(function(p){
      var est = estadoLocal(p), estilo = P.ESTILOS[p.estilo] ? p.estilo : 'fuego';
      var card = document.createElement('div'); card.className = 'pc st-' + estilo + ' est-' + est; card.dataset.id = p.id;
      var em = document.createElement('span'); em.className = 'pc-em'; em.setAttribute('aria-hidden','true'); em.textContent = P.ESTILOS[estilo].e;
      var body = document.createElement('div'); body.className = 'pc-body';
      var chip = document.createElement('span'); chip.className = 'pc-chip'; chip.textContent = ETQ[est];
      var t = document.createElement('strong'); t.className = 'pc-t'; t.textContent = p.titulo;
      body.appendChild(chip); body.appendChild(t);
      if(p.descripcion){ var d = document.createElement('span'); d.className = 'pc-d'; d.textContent = p.descripcion; body.appendChild(d); }
      var tm = document.createElement('span'); tm.className = 'pc-time'; tm.dataset.k = 'time'; tm.textContent = textoTiempo(p, est); body.appendChild(tm);
      var gn = document.createElement('span'); gn.className = 'pc-gan'; gn.textContent = '🏆 ' + (p.ganados || 0) + (p.ganados === 1 ? ' ganador' : ' ganadores'); body.appendChild(gn);
      var acc = document.createElement('div'); acc.className = 'pc-acc';
      acc.appendChild(boton('', 'fa-eye', 'Ver', function(){ cyMostrarCelebracion(p.titulo, 'Cliente', false, { es_promo:true, descripcion:p.descripcion, estilo:estilo, fin:p.fin }); }));
      acc.appendChild(boton('', 'fa-pen', 'Editar', function(){ editar(p); }));
      if(est !== 'vencido') acc.appendChild(boton('', p.activo ? 'fa-pause' : 'fa-play', p.activo ? 'Pausar' : 'Activar', function(){ alternar(p); }));
      var del = boton('pc-del', 'fa-trash', 'Eliminar', function(){}); var tt = null;
      del.addEventListener('click', function(){
        if(!del.classList.contains('conf')){ del.classList.add('conf'); del.querySelector('span').textContent = '¿Seguro?'; tt = setTimeout(function(){ del.classList.remove('conf'); del.querySelector('span').textContent = 'Eliminar'; }, 3000); return; }
        clearTimeout(tt); eliminar(p, del);
      });
      acc.appendChild(del);
      card.appendChild(em); card.appendChild(body); card.appendChild(acc);
      c.appendChild(card);
    });
  }

  function editar(p){
    editando = p.id; estiloSel = P.ESTILOS[p.estilo] ? p.estilo : 'fuego';
    $('premTitulo').value = p.titulo; $('premDesc').value = p.descripcion || '';
    $('premDesde').value = new Date(new Date(p.inicio).getTime() - 5*3600*1000).toISOString().slice(0,10);
    $('premHasta').value = new Date(new Date(p.fin).getTime() - 5*3600*1000).toISOString().slice(0,10);
    $('premFormTitulo').textContent = 'Editar promoción';
    $('premGuardar').querySelector('span').textContent = 'Guardar cambios'; $('premCancelar').style.display = 'inline-block';
    pintarEstilos(); $('premError').textContent = '';
    $('premForm').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }
  async function alternar(p){
    try{
      var r = await supabaseClient.rpc('admin_guardar_premio_qr', { p_id: p.id, p_titulo: p.titulo, p_descripcion: p.descripcion || null, p_estilo: p.estilo, p_inicio: p.inicio, p_fin: p.fin, p_activo: !p.activo });
      if(r && r.error) throw r.error;
      toast(p.activo ? '⏸ Promoción en pausa' : '▶️ Promoción activada', '#10b981'); cyCargarPremios();
    }catch(e){ toast('❌ No se pudo cambiar el estado', '#ef4444'); }
  }
  async function eliminar(p, btn){
    btn.disabled = true;
    try{
      var r = await supabaseClient.rpc('admin_eliminar_premio_qr', { p_id: p.id });
      if(r && r.error) throw r.error;
      if(editando === p.id) limpiarForm();
      toast('🗑️ Promoción eliminada', '#10b981'); cyCargarPremios();
    }catch(e){ btn.disabled = false; toast('❌ No se pudo eliminar', '#ef4444'); }
  }

  /* Cuenta regresiva en vivo mientras se ve la pestaña */
  function iniciarTimer(){
    detenerTimer();
    timer = setInterval(function(){
      var panel = $('invPanelPremios'); if(!panel || panel.style.display === 'none' || document.hidden) return;
      var cambio = false;
      lista.forEach(function(p){
        var card = document.querySelector('.pc[data-id="' + p.id + '"]'); if(!card) return;
        var est = estadoLocal(p);
        if(!card.classList.contains('est-' + est)){ cambio = true; return; }
        var tm = card.querySelector('[data-k="time"]'); if(tm) tm.textContent = textoTiempo(p, est);
      });
      if(cambio) pintarLista();
    }, 30000);
  }
  function detenerTimer(){ if(timer){ clearInterval(timer); timer = null; } }
})();
