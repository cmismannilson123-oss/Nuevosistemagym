// Pantalla inicial del QR: reacción al tocar, parallax y pausa de animaciones.
// Clásico (no módulo): comparte el mismo ámbito global que antes del corte.
/* PANTALLA INICIAL QR v34 — reacción al tocar, parallax de fondo y pausa de animaciones SVG. Solo presentación. */
(function(){
  try{
    var hero = document.getElementById('qrCardPrimeraVez'); if(!hero) return;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduce){ hero.querySelectorAll('svg').forEach(function(s){ try{ s.pauseAnimations(); s.setCurrentTime(0.01); }catch(e){} }); }

    /* Parallax del fondo con el scroll de la pantalla (solo si la pantalla es más alta que el móvil) */
    var par = hero.querySelector('.cy-bg-par'), t = false;
    hero.addEventListener('scroll', function(){
      if(t) return; t = true;
      requestAnimationFrame(function(){ t = false; if(par && !reduce) par.style.setProperty('--bgy', (-Math.min(40, hero.scrollTop * 0.12)) + 'px'); });
    }, {passive:true});

    /* Reacción del personaje y de la tarjeta; la acción original se ejecuta ~0.25 s después */
    ['btnSoySocioQR','btnPrimeraVezQR','btnInscribirseQR'].forEach(function(id){
      var b = document.getElementById(id); if(!b) return;
      var libre = false, ocupado = false;
      b.addEventListener('click', function(e){
        if(libre){ libre = false; return; }
        if(reduce) return;
        e.stopImmediatePropagation(); e.preventDefault();
        if(ocupado) return; ocupado = true;
        b.classList.add('react');
        setTimeout(function(){ libre = true; ocupado = false; b.classList.remove('react'); b.click(); }, 250);
      }, true);
    });
  }catch(err){ console.warn('Pantalla inicial v34:', err); }
})();
