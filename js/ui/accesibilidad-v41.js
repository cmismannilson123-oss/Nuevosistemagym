// Nombres accesibles para campos y botones de iconos (presentación).
// Clásico (no módulo): mismo ámbito global y mismo orden que antes.
/* v41: nombre accesible para campos con solo placeholder y botones de iconos */
(function(){
  try{
    document.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(function(e){
      if(!e.getAttribute('aria-label') && !(e.labels && e.labels.length)) e.setAttribute('aria-label', e.getAttribute('placeholder'));
    });
    document.querySelectorAll('button[title]').forEach(function(b){
      if(!b.getAttribute('aria-label')) b.setAttribute('aria-label', b.getAttribute('title'));
    });
    var tabs=document.querySelectorAll('.tabs .tabbtn');
    tabs.forEach(function(b){ if(!b.getAttribute('aria-label')){ var t=(b.innerText||'').trim(); if(t) b.setAttribute('aria-label',t); else b.setAttribute('aria-label','Escanear código QR'); } });
  }catch(e){}
})();
