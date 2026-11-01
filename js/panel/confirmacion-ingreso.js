// Confirmación de ingreso en el panel: pantalla completa con el check animado, el nombre y la hora.
// Clásico (no módulo). Si ya hay una en pantalla se reemplaza: nunca se apilan. Se cierra sola o al tocarla.
window.cyConfirmarIngreso = function(nombre){
  try{
    document.querySelectorAll(".cy-ingreso-ok").forEach(function(el){ el.remove(); });
    var hora = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
    var el = document.createElement("div");
    el.className = "cy-ingreso-ok"; el.setAttribute("role", "status");
    el.innerHTML = "<div class=\"cy-ingreso-ok-card\">"
      + "<div class=\"check-burst cy-ingreso-ok-check\"><svg viewBox=\"0 0 24 24\"><path d=\"M4 12.5L9.5 18L20 6\"/></svg></div>"
      + "<p class=\"cy-ingreso-ok-kicker\">Asistencia registrada</p>"
      + "<h2 class=\"cy-ingreso-ok-nombre\"></h2>"
      + "<p class=\"cy-ingreso-ok-hora\">Hora " + hora + "</p>"
      + "</div>";
    el.querySelector(".cy-ingreso-ok-nombre").textContent = nombre || "";
    var cerrar = function(){ el.classList.add("out"); setTimeout(function(){ el.remove(); }, 320); };
    el.addEventListener("click", cerrar);
    document.body.appendChild(el);
    setTimeout(cerrar, 2400);
  }catch(e){}
};
