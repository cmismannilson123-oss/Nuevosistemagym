// Efectos de scroll de "Nuestros planes" en la pantalla del socio.
// Clásico (no módulo): comparte el mismo ámbito global que antes del corte.
/* v49: efectos de scroll de "Quiero conocer el gym" — solo presentación; si algo falla, la pantalla sigue funcionando. */
(function(){
  try{
    var ov = document.getElementById('wizOverlay'); if(!ov) return;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* Luz ambiental de fondo (dos manchas muy lentas) */
    if(!reduce && !ov.querySelector('.ap-aurora')){
      var au = document.createElement('div'); au.className = 'ap-aurora'; au.setAttribute('aria-hidden','true');
      au.innerHTML = '<i></i><i></i>'; ov.insertBefore(au, ov.firstChild);
    }

    /* Frase: separa en palabras para iluminarlas con el scroll */
    var state = document.getElementById('apState'), words = [];
    if(state && !state.dataset.split){
      var txt = state.textContent.trim().split(/\s+/);
      state.textContent = '';
      txt.forEach(function(w, i){
        var sp = document.createElement('span'); sp.className = 'w' + (i >= txt.length - 2 ? ' em' : ''); sp.textContent = w;
        state.appendChild(sp); if(i < txt.length - 1) state.appendChild(document.createTextNode(' '));
        words.push(sp);
      });
      state.dataset.split = '1';
    }
    if(reduce) words.forEach(function(w){ w.classList.add('on'); });

    var hero = document.getElementById('apHero'), conoce = document.getElementById('wizConoce');
    var tick = false, lastN = -1, lastHp = -1, lastT = null, heroH = 0, topbars = ov.querySelectorAll('.wiz-topbar');
    function medirHero(){ heroH = hero ? hero.offsetHeight : 0; }
    function frame(){
      tick = false;
      /* 1) todas las lecturas juntas */
      var y = ov.scrollTop, vh = ov.clientHeight;
      var enConoce = conoce && conoce.style.display !== 'none';
      var rTop = (enConoce && state && words.length && !reduce) ? state.getBoundingClientRect().top : null;
      /* 2) escrituras, solo si cambia algo */
      var t = y > (enConoce ? vh * 0.5 : 56);
      if(t !== lastT){ lastT = t; topbars.forEach(function(b){ b.classList.toggle('t-in', t); }); }
      if(!enConoce) return;
      if(hero && !reduce){
        if(!heroH) medirHero();
        var hp = Math.min(1, Math.max(0, y / (heroH * 0.85)));
        if(Math.abs(hp - lastHp) > 0.004 || (hp === 0 && lastHp !== 0)){ lastHp = hp; hero.style.setProperty('--hp', hp.toFixed(3)); }
      }
      if(rTop !== null){
        var ini = vh * 0.9, fin = vh * 0.34;
        var p = Math.max(0, Math.min(1, (ini - rTop) / (ini - fin)));
        var n = Math.round(p * words.length);
        if(n !== lastN){ lastN = n; words.forEach(function(w, i){ w.classList.toggle('on', i < n); }); }
      }
    }
    ov.addEventListener('scroll', function(){ if(!tick){ tick = true; requestAnimationFrame(frame); } }, {passive:true});
    window.addEventListener('resize', function(){ heroH = 0; if(!tick){ tick = true; requestAnimationFrame(frame); } });

    /* Aparición escalonada de las piezas nuevas */
    var io = null;
    if('IntersectionObserver' in window && !reduce){
      io = new IntersectionObserver(function(es){
        var n = 0;
        es.forEach(function(e){
          if(!e.isIntersecting) return;
          var el = e.target; el.style.transitionDelay = (Math.min(n, 4) * 90) + 'ms'; n++;
          el.classList.add('ap-in'); io.unobserve(el);
          if(el.parentNode && el.parentNode.id === 'apStats') contar(el.querySelector('b'));
        });
      }, {root: ov, threshold: 0.15});
      ov.classList.add('ap-ok');
      ov.querySelectorAll('.ap-rv').forEach(function(el){ io.observe(el); });
    }
    /* Animaciones continuas: solo corren mientras el elemento está a la vista */
    if('IntersectionObserver' in window){
      var vivo = new IntersectionObserver(function(es){ es.forEach(function(e){ e.target.classList.toggle('live', e.isIntersecting); }); }, {root: ov, threshold: 0.01});
      ov.querySelectorAll('.ap-eq,.ap-btn-main,.ap-hero,.pr-wrap').forEach(function(el){ vivo.observe(el); });
      window.cyObservarVivo = function(el){ vivo.observe(el); };
    }

    /* Números que suben al aparecer */
    function contar(b){
      if(!b || !b.dataset.n || b.dataset.hecho) return; b.dataset.hecho = '1';
      var fin = parseInt(b.dataset.n, 10), t0 = null, dur = 900;
      b.textContent = '0';
      function paso(t){ if(t0 === null) t0 = t; var k = Math.min(1, (t - t0) / dur); k = 1 - Math.pow(1 - k, 3); b.textContent = Math.round(fin * k); if(k < 1) requestAnimationFrame(paso); }
      requestAnimationFrame(paso);
    }

    /* Tras cada cambio de pantalla: volver arriba y recalcular */
    var prev = window.wizIr;
    if(typeof prev === 'function'){
      window.wizIr = function(){
        var r = prev.apply(this, arguments);
        lastN = -1; lastHp = -1; lastT = null; heroH = 0; ov.scrollTop = 0;
        if(hero) hero.style.setProperty('--hp', '0');
        requestAnimationFrame(frame);
        return r;
      };
    }

    /* v50: mientras una ventana cubre la pantalla, lo que queda debajo no se anima (ahorra GPU/batería y evita tirones) */
    var cubiertos = ['wizOverlay','inscOverlay','celebOverlay'].map(function(id){ return document.getElementById(id); }).filter(Boolean);
    function revisarCobertura(){
      var cubierto = cubiertos.some(function(el){ return el.style.display && el.style.display !== 'none'; });
      var ya = document.documentElement.classList.contains('cy-covered');
      if(cubierto === ya) return;
      document.documentElement.classList.toggle('cy-covered', cubierto);
      document.querySelectorAll('#qrCardPrimeraVez svg').forEach(function(sv){ try{ cubierto ? sv.pauseAnimations() : sv.unpauseAnimations(); }catch(e){} });
    }
    if(window.MutationObserver){
      var mo = new MutationObserver(revisarCobertura);
      cubiertos.forEach(function(el){ mo.observe(el, {attributes:true, attributeFilter:['style']}); });
    }
    revisarCobertura();
    frame();
  }catch(err){ console.warn('Capa v49:', err); }
})();
