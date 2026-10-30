// Confirmación visual al registrar un ingreso (panel).
// Clásico (no módulo): mismo ámbito global y mismo orden que antes.
/* PANEL ADMIN v35 — confirmación visual al registrar un ingreso. Solo presentación. */
window.cyConfirmarIngreso = function(nombre){
  try{
    var el = document.createElement('div');
    el.className = 'cy-confirm'; el.setAttribute('role','status');
    el.innerHTML = '<div class="check-burst"><svg viewBox="0 0 24 24"><path d="M4 12.5L9.5 18L20 6"/></svg></div><div class="cy-confirm-t">Ingreso registrado</div><div class="cy-confirm-n"></div>';
    el.querySelector('.cy-confirm-n').textContent = nombre || '';
    document.body.appendChild(el);
    setTimeout(function(){ el.classList.add('out'); }, 1200);
    setTimeout(function(){ el.remove(); }, 1550);
  }catch(e){}
};
