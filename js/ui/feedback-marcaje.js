// Feedback visual al registrar asistencia (no cambia la lógica).
// Clásico (no módulo): mismo ámbito global y mismo orden que antes.
/* v51: feedback visual al registrar asistencia (no altera la lógica: solo marca el botón como "cargando") */
document.addEventListener("click", function(e){
  var b = e.target.closest && e.target.closest(".qr-hero-card .qr-btn-principal[onclick]");
  if (!b) return;
  b.classList.add("is-loading");
  setTimeout(function(){ b.classList.remove("is-loading"); }, 6000);
}, true);
