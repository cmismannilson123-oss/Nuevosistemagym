// Cupones del socio: pase de invitado y 10% por pago anticipado.
// Clásico (no módulo): comparte el mismo ámbito global que antes del corte.
/* ==========================================================================
   v55 — CUPONES DEL SOCIO (pase de invitado + 10% por pago anticipado)
   Las reglas viven en el servidor (consultar_socio_qr / usar_cupon_qr).
   Aquí solo se pinta el estado y se anima el uso. No toca el flujo de
   asistencia: el estado llega en la misma consulta del QR y nada de esto
   hace pedidos de red hasta que el socio presiona "Usar".
   ========================================================================== */
(function(){
  var MESES = ['ene','feb','mar','abr','may','jun','jul','ago','set','oct','nov','dic'];
  function dm(iso){ // '2026-10-21' -> '21/10'
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? m[3] + '/' + m[2] : '';
  }
  function diaMes(iso){ // '2026-11-01' -> '1 nov'
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? (+m[3]) + ' ' + MESES[+m[2] - 1] : '';
  }
  function cuando(ts){
    try { return new Date(ts).toLocaleString('es-PE', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'America/Lima' }); }
    catch(e){ return ''; }
  }
  function ticket(tipo, c){
    var e = c.estado, inv = tipo === 'invitado';
    var top = inv
      ? '<span class="cup-ic" aria-hidden="true"><i class="fa-solid fa-user-plus"></i></span>' +
        '<b class="cup-t">Pase de invitado</b><small class="cup-s">Trae a un amigo gratis una vez al mes.</small>'
      : '<span class="cup-big">10%</span>' +
        '<b class="cup-t">Pago anticipado</b><small class="cup-s">Renueva tu plan hasta el ' + dm(c.hasta) + '.</small>';
    var bot;
    if (e === 'disponible') {
      bot = '<button type="button" class="cup-btn" data-cupon="' + tipo + '">' + (inv ? 'Usar pase' : 'Usar 10%') + '</button>';
    } else if (e === 'usado') {
      bot = '<p class="cup-nota"><b>Usado ' + cuando(c.usado_en) + '</b>' +
        (inv ? 'Nuevo pase el ' + diaMes(c.proximo) + '.' : 'Renueva en recepción hasta el ' + dm(c.hasta) + '.') + '</p>';
    } else {
      bot = '<p class="cup-nota"><b>Vencido</b>Se activa de nuevo al renovar.</p>';
    }
    return '<div class="cup cup--' + (inv ? 'inv' : 'dto') + ' is-' + e + '" data-tipo="' + tipo + '">' +
      '<div class="cup-top">' + top + '</div>' +
      '<div class="cup-cut" aria-hidden="true"></div>' +
      '<div class="cup-bot">' + bot + '</div>' +
      (e === 'usado' ? '<span class="cup-sello" aria-hidden="true">Usado</span>' : '') +
    '</div>';
  }
  function interior(c){
    c = c || {}; var h = '';
    if (c.invitado) h += ticket('invitado', c.invitado);
    if (c.descuento) h += ticket('descuento', c.descuento);
    return h;
  }
  window.cyCuponesBloque = function(c){
    var h = interior(c);
    return h ? '<div class="cyc-cupones">' + h + '</div>' : '';
  };
  function repintar(recien){
    document.querySelectorAll('.cyc-cupones').forEach(function(box){
      box.innerHTML = interior(window.cyCupones);
      if (recien) { var t = box.querySelector('.cup[data-tipo="' + recien + '"]'); if (t) t.classList.add('recien'); }
    });
  }

  /* ---------- Hoja inferior (confirmar / resultado) ---------- */
  var hoja, resolver;
  function abrirHoja(o){
    if (!hoja) {
      hoja = document.createElement('div');
      hoja.className = 'cup-hoja-fondo';
      hoja.innerHTML = '<div class="cup-hoja" role="dialog" aria-modal="true" aria-labelledby="cupHojaT">' +
        '<div class="cup-hoja-ic" aria-hidden="true"></div><h3 id="cupHojaT"></h3><p></p>' +
        '<div class="cup-hoja-acc"><button type="button" class="cup-h-si"></button><button type="button" class="cup-h-no"></button></div></div>';
      document.body.appendChild(hoja);
      hoja.addEventListener('click', function(e){ if (e.target === hoja) cerrar(false); });
      hoja.querySelector('.cup-h-si').addEventListener('click', function(){ cerrar(true); });
      hoja.querySelector('.cup-h-no').addEventListener('click', function(){ cerrar(false); });
    }
    hoja.querySelector('.cup-hoja-ic').innerHTML = o.icono;
    hoja.querySelector('h3').textContent = o.titulo;
    hoja.querySelector('p').textContent = o.texto;
    var si = hoja.querySelector('.cup-h-si'), no = hoja.querySelector('.cup-h-no');
    si.textContent = o.si; no.textContent = o.no || ''; no.style.display = o.no ? '' : 'none';
    hoja.className = 'cup-hoja-fondo ' + (o.clase || '');
    hoja.offsetWidth; hoja.classList.add('abierta');
    setTimeout(function(){ try { si.focus({ preventScroll:true }); } catch(e){} }, 50);
    return new Promise(function(r){ resolver = r; });
  }
  function cerrar(v){
    if (!hoja) return;
    hoja.classList.remove('abierta');
    var r = resolver; resolver = null; if (r) r(v);
  }
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && hoja && hoja.classList.contains('abierta')) cerrar(false); });

  /* ---------- Fiesta: globos, mancuernas y serpentinas ---------- */
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function fiesta(){
    if (reduce) return;
    var capa = document.createElement('div'); capa.className = 'cup-fiesta'; capa.setAttribute('aria-hidden', 'true');
    var colores = ['#34d399', '#10b981', '#fbbf24', '#f59e0b', '#ffffff', '#e11d48', '#5eead4'];
    var h = '', i, x, c;
    for (i = 0; i < 9; i++) { // globos que suben
      x = 4 + i * 11 + Math.random() * 5; c = colores[i % colores.length];
      h += '<span class="gl" style="--x:' + x + '%;--c:' + c + ';--d:' + (Math.random() * .5).toFixed(2) + 's;--t:' + (2.6 + Math.random() * .9).toFixed(2) + 's;--w:' + (Math.random() * 30 - 15).toFixed(0) + 'px"><i></i></span>';
    }
    for (i = 0; i < 8; i++) { // mancuernas que caen girando
      x = Math.random() * 92; c = colores[(i + 2) % colores.length];
      h += '<span class="mc" style="--x:' + x.toFixed(1) + '%;--c:' + c + ';--d:' + (Math.random() * .6).toFixed(2) + 's;--t:' + (1.9 + Math.random() * .9).toFixed(2) + 's;--r:' + (Math.random() > .5 ? 540 : -540) + 'deg"><i class="fa-solid fa-dumbbell"></i></span>';
    }
    for (i = 0; i < 34; i++) { // serpentinas y papel picado
      x = Math.random() * 100; c = colores[i % colores.length];
      h += '<span class="sp' + (i % 3 === 0 ? ' larga' : '') + '" style="--x:' + x.toFixed(1) + '%;--c:' + c + ';--d:' + (Math.random() * .7).toFixed(2) + 's;--t:' + (1.8 + Math.random() * 1.2).toFixed(2) + 's;--r:' + (Math.random() * 720 - 360).toFixed(0) + 'deg;--dx:' + (Math.random() * 80 - 40).toFixed(0) + 'px"></span>';
    }
    capa.innerHTML = '<span class="flash"></span>' + h;
    document.body.appendChild(capa);
    setTimeout(function(){ capa.remove(); }, 4200);
  }

  /* ---------- Usar cupón ---------- */
  var ocupado = false;
  function finSocio(){ return dm(window.cyFinSocio); }
  document.addEventListener('click', async function(e){
    var b = e.target.closest && e.target.closest('.cup-btn[data-cupon]');
    if (!b || ocupado) return;
    var tipo = b.getAttribute('data-cupon'), inv = tipo === 'invitado';
    var c = (window.cyCupones || {})[tipo]; if (!c) return;

    var sigue = await abrirHoja(inv ? {
      clase: 'inv', icono: '<i class="fa-solid fa-user-plus"></i>',
      titulo: '¿Usar tu pase de invitado ahora?',
      texto: 'Hazlo frente a recepción. Tienes 1 pase por mes y no se acumula.',
      si: 'Sí, usar ahora', no: 'Ahora no'
    } : {
      clase: 'dto', icono: '<span>10%</span>',
      titulo: '¿Usar tu 10% de descuento?',
      texto: 'Se aplica al renovar o reservar tu plan en recepción hasta el ' + dm(c.hasta) + '. Úsalo frente a recepción.',
      si: 'Sí, usar ahora', no: 'Ahora no'
    });
    if (!sigue) return;

    ocupado = true;
    b.disabled = true; b.classList.add('cargando');
    try {
      var tel = (leerTelefonoSeguro() || '').replace(/\D/g, ''), dni = (leerDniSeguro() || '').replace(/\D/g, '');
      // Con internet lento se reintenta solo; si el reintento dice "ya usado",
      // es porque el primer intento sí llegó: se muestra como usado con éxito.
      var r = await cyRpcSeguro('usar_cupon_qr', { p_telefono: tel, p_dni: dni, p_tipo: tipo });
      var d = r && r.data;
      if (r.error || !d) throw r.error || new Error('sin respuesta');
      if (!d.ok && d.motivo === 'USADO' && r.intento > 1) d.ok = true;
      if (d.cupones) window.cyCupones = d.cupones;
      if (d.ok) {
        repintar(tipo);
        fiesta();
        setTimeout(function(){
          abrirHoja(inv ? {
            clase: 'inv ok', icono: '<i class="fa-solid fa-champagne-glasses"></i>',
            titulo: '¡Pase de invitado usado!',
            texto: 'Muéstrale esta pantalla a recepción: tu invitado entra gratis hoy.',
            si: 'Listo'
          } : {
            clase: 'dto ok', icono: '<i class="fa-solid fa-champagne-glasses"></i>',
            titulo: '¡Cupón de 10% usado!',
            texto: 'Acércate a recepción para renovar o reservar tu membresía antes de tu fecha de vencimiento (' + finSocio() + ').',
            si: 'Entendido'
          });
        }, reduce ? 0 : 900);
      } else {
        repintar();
        var t = { USADO: 'Este cupón ya fue usado.', VENCIDO: 'Este cupón ya venció. Se activa de nuevo al renovar.',
                  NO_APLICA: 'Este cupón no aplica a tu plan.', BLOQUEADO: 'Demasiados intentos. Espera 15 minutos.',
                  NO_ENCONTRADO: 'No pudimos verificar tus datos. Vuelve a escanear el QR.' }[d.motivo] || 'No se pudo usar el cupón.';
        abrirHoja({ clase: 'error', icono: '<i class="fa-solid fa-circle-exclamation"></i>', titulo: 'No se pudo usar', texto: t, si: 'Entendido' });
      }
    } catch (err) {
      console.warn('usar_cupon_qr:', err);
      b.disabled = false; b.classList.remove('cargando');
      abrirHoja({ clase: 'error', icono: '<i class="fa-solid fa-wifi"></i>', titulo: 'Sin conexión', texto: 'Revisa tu internet e inténtalo otra vez.', si: 'Entendido' });
    } finally {
      ocupado = false;
    }
  });
})();
