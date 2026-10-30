// Parte del flujo del socio (QR). Clásico: mismo ámbito global que antes.
document.addEventListener('input', (e) => {
  const l = e.target && e.target.closest && e.target.closest('#tab2 .rg-f--mal');
  if (l) { l.classList.remove('rg-f--mal'); const m = l.querySelector('.rg-err'); if (m) m.remove(); }
});
