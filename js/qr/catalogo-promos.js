// Parte del flujo del socio (QR). Clásico: mismo ámbito global que antes.
window.abrirCatalogoModal = function() {
  const modal = document.getElementById("catalogoModal");
  if (modal) modal.style.display = "flex";
};
window.cerrarCatalogoModal = function() {
  const modal = document.getElementById("catalogoModal");
  if (modal) modal.style.display = "none";
};
window.abrirPromoModal = function() {
  const m = document.getElementById("promoModal");
  if (m) { m.style.display = "flex"; const b = m.querySelector(".cy-pm-body"); if (b) b.scrollTop = 0; }
};
window.cerrarPromoModal = function() {
  const m = document.getElementById("promoModal");
  if (m) m.style.display = "none";
};
document.addEventListener("keydown", function(e){
  if (e.key === "Escape") { cerrarPromoModal(); }
  if ((e.key === "Enter" || e.key === " ") && e.target && e.target.classList && e.target.classList.contains("cy-pbtn")) { e.preventDefault(); e.target.click(); }
});
document.addEventListener("click", function(e){
  const m = document.getElementById("promoModal");
  if (m && e.target === m) cerrarPromoModal();
});
