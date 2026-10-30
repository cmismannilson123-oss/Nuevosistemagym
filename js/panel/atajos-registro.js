// Registro: atajos de plan y resumen en vivo.
// Clásico (no módulo): mismo ámbito global y mismo orden que antes.
/* ==========================================================================
   v59 — REGISTRO: atajos de plan y duración + resumen en vivo.
   Solo llenan los campos; guardar() sigue igual.
   ========================================================================== */
(function(){
  if (document.documentElement.classList.contains('qr-mode')) return;
  function $(id){ return document.getElementById(id); }
  function iso(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function hoy(){ return iso(new Date()); }
  function sumar(isoIni, dur){
    var d = new Date(isoIni + 'T00:00:00'), n = parseInt(dur, 10);
    if (/d$/.test(dur)) d.setDate(d.getDate() + n); else d.setMonth(d.getMonth() + n);
    return iso(d);
  }
  function marcar(grupo, attr, valor){
    document.querySelectorAll('.rg-chips [' + attr + ']').forEach(function(b){ b.classList.toggle('on', b.getAttribute(attr) === valor); });
  }
  function resumen(){
    var r = $('rgResumen'); if (!r) return;
    var ini = $('inicio').value, fin = $('fin').value, plan = ($('tipo_memb').value || '').toLowerCase();
    if (!ini || !fin) { r.hidden = true; return; }
    var dias = Math.round((new Date(fin + 'T00:00:00') - new Date(ini + 'T00:00:00')) / 86400000);
    r.hidden = false;
    if (dias <= 0) { r.className = 'rg-resumen mal'; r.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> La fecha de vencimiento debe ser posterior al inicio.'; return; }
    var asis = plan.indexOf('interdiario') !== -1 ? 15 : dias;
    r.className = 'rg-resumen';
    r.innerHTML = '<i class="fa-solid fa-circle-info"></i> Membresía de <b>' + dias + ' días</b> con <b>' + asis + ' asistencias</b>.';
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('.rg-chips button'); if (!b) return;
    if (b.dataset.plan) {
      $('tipo_memb').value = b.dataset.plan; marcar('plan', 'data-plan', b.dataset.plan);
    } else if (b.dataset.dur) {
      if (!$('inicio').value) $('inicio').value = hoy();
      $('fin').value = sumar($('inicio').value, b.dataset.dur); marcar('dur', 'data-dur', b.dataset.dur);
    }
    resumen();
  });
  document.addEventListener('input', function(e){
    var id = e.target && e.target.id;
    if (id === 'tipo_memb') marcar('plan', 'data-plan', e.target.value);
    if (id === 'fin' || id === 'inicio') marcar('dur', 'data-dur', '');
    if (id === 'inicio' || id === 'fin' || id === 'tipo_memb') resumen();
  });
  // Al guardarse (los campos se vacían), limpiar el resumen y los atajos
  document.addEventListener('click', function(e){
    if (!(e.target.closest && e.target.closest('.cy-act-save'))) return;
    setTimeout(function(){ if (!$('inicio').value) { marcar('plan', 'data-plan', ''); marcar('dur', 'data-dur', ''); resumen(); } }, 1500);
  });
})();
