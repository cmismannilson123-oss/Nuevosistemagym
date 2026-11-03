// Capa de diseño: solo presentación.
// Clásico (no módulo): mismo ámbito global y mismo orden que antes.
/* CAPA DE DISEÑO v33 — solo presentación. Si algo falla aquí, la app sigue funcionando igual. */
(function(){
  try{
    var overlay = document.getElementById('wizOverlay');
    if(!overlay) return;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* Barra de progreso + sombra de la barra superior (v50: lecturas cacheadas y escrituras solo si cambian) */
    var bar = document.createElement('div'); bar.id = 'wizProgress'; overlay.appendChild(bar);
    var tick = false, ultEscala = -1, ultScrolled = false, topbars = overlay.querySelectorAll('.wiz-topbar');
    function actualizar(){
      tick = false;
      var max = overlay.scrollHeight - overlay.clientHeight;
      var y = overlay.scrollTop;
      var esc = max > 0 ? Math.min(1, y / max) : 0;
      if(Math.abs(esc - ultEscala) > 0.002){ ultEscala = esc; bar.style.transform = 'scaleX(' + esc.toFixed(3) + ')'; }
      var sc = y > 8;
      if(sc !== ultScrolled){ ultScrolled = sc; topbars.forEach(function(t){ t.classList.toggle('scrolled', sc); }); }
    }
    overlay.addEventListener('scroll', function(){ if(!tick){ tick = true; requestAnimationFrame(actualizar); } }, {passive:true});

    /* Revelado progresivo al entrar en pantalla (una sola vez por elemento) */
    var io = null;
    if('IntersectionObserver' in window && !reduce){
      io = new IntersectionObserver(function(entries){
        var n = 0;
        entries.forEach(function(e){
          if(e.isIntersecting){
            var el = e.target; el.style.transitionDelay = (Math.min(n,6) * 45) + 'ms'; n++;
            el.classList.add('in'); io.unobserve(el);
          }
        });
      }, {root: overlay, threshold: 0.08});
      overlay.classList.add('rv-ready');
    }
    function registrarReveal(){
      var sel = '.wiz-feat-card2,.plan,.wiz-info-card,.wiz-banner,.wiz-quote,.wiz-secondary-btn,.estado-cta';
      overlay.querySelectorAll(sel).forEach(function(el){
        if(el.dataset.rv) return; el.dataset.rv = '1';
        if(io){ el.classList.add('rv'); io.observe(el); }
      });
    }

    /* v50: sin inclinación 3D (en el celular provocaba temblor/parpadeo al tocar). El feedback ahora es un simple 'presionado' por CSS. */

    /* Planes: expandir/contraer al tocar */
    var lista = document.getElementById('listaPlanesPublica');
    function alternarPlan(head){
      var plan = head.closest('.plan'); if(!plan) return;
      var abierto = plan.classList.toggle('open');
      plan.classList.add('seen');
      head.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    }
    if(lista){
      lista.addEventListener('click', function(e){ var h = e.target.closest('.plan-head'); if(h) alternarPlan(h); });
      lista.addEventListener('keydown', function(e){
        if(e.key !== 'Enter' && e.key !== ' ') return;
        var h = e.target.closest('.plan-head'); if(h){ e.preventDefault(); alternarPlan(h); }
      });
    }

    /* Horarios: "Abierto ahora" según la hora de Lima */
    var VENTANAS = [[390, 720], [960, 1350]]; /* 6:30–12:00 y 16:00–22:30, lunes a sábado */
    function fmt(min){ var h = Math.floor(min/60), m = min%60, ap = h >= 12 ? 'p.m.' : 'a.m.'; h = h%12 || 12; return h + ':' + (m<10?'0':'') + m + ' ' + ap; }
    function estadoAhora(){
      var p = new Intl.DateTimeFormat('en-US', {timeZone:'America/Lima', weekday:'short', hour:'2-digit', minute:'2-digit', hour12:false}).formatToParts(new Date());
      var o = {}; p.forEach(function(x){ o[x.type] = x.value; });
      var dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(o.weekday);
      var min = (parseInt(o.hour,10) % 24) * 60 + parseInt(o.minute,10);
      if(dow > 0){
        for(var i = 0; i < VENTANAS.length; i++){
          if(min >= VENTANAS[i][0] && min < VENTANAS[i][1]) return {abierto:true, texto:'Abierto ahora · cierra a las ' + fmt(VENTANAS[i][1]), turno:i};
        }
        for(var j = 0; j < VENTANAS.length; j++){
          if(min < VENTANAS[j][0]) return {abierto:false, texto:'Cerrado ahora · abre a las ' + fmt(VENTANAS[j][0])};
        }
      }
      var manana = (dow + 1) % 7;
      return {abierto:false, texto: manana === 0 ? 'Cerrado ahora · abrimos el lunes a las ' + fmt(VENTANAS[0][0]) : 'Cerrado ahora · abrimos mañana a las ' + fmt(VENTANAS[0][0])};
    }
    // Baile: lunes a viernes de 7:00 p.m. a 9:00 p.m. (hora del celular)
    function pintarBaile(){
      var caja = document.getElementById('hzBaile'); if(!caja) return;
      var ahora = new Date(), dia = ahora.getDay(), minutos = ahora.getHours() * 60 + ahora.getMinutes();
      var enClase = dia >= 1 && dia <= 5 && minutos >= 19 * 60 && minutos < 21 * 60;
      caja.classList.toggle('en-clase', enClase);
      var est = document.getElementById('estadoBaile');
      if(est){
        est.className = 'hz-estado-baile ' + (enClase ? 'en-clase' : 'espera');
        est.querySelector('.hz-estado-txt').textContent = enClase ? '¡Estamos bailando! Ven y únete' : 'Esperando la hora de clase';
      }
    }
    function pintarEstado(){
      try{ pintarBaile(); }catch(e){}
      var chip = document.getElementById('estadoAbierto'); if(!chip) return;
      var s = estadoAhora();
      chip.className = 'open-chip' + (s.abierto ? '' : ' cerrado');
      chip.innerHTML = '<span class="dot"></span><span>' + s.texto + '</span>';
      var cols = overlay.querySelectorAll('.hz-turno');
      cols.forEach(function(c, i){ c.classList.toggle('ahora', s.abierto && s.turno === i); });
    }

    /* Mientras se ve la pantalla de horarios, el estado se actualiza solo (cada 30 s) */
    setInterval(function(){
      var h = document.getElementById('wizHorarios');
      if(h && h.style.display === 'block'){ try{ pintarEstado(); }catch(e){} }
    }, 30000);

    /* Enganche no invasivo: tras cada cambio de pantalla se registran los reveals y se reinicia el scroll */
    var wizIrOriginal = window.wizIr;
    if(typeof wizIrOriginal === 'function'){
      window.wizIr = function(id){
        wizIrOriginal.apply(this, arguments);
        overlay.scrollTop = 0;
        try{ pintarEstado(); }catch(e){}
        requestAnimationFrame(function(){ registrarReveal(); actualizar(); });
      };
    }
    registrarReveal();
  }catch(err){ console.warn('Capa de diseño v33:', err); }
})();
