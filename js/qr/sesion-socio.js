// Parte del flujo del socio (QR). Clásico: mismo ámbito global que antes.
function leerTelefonoSeguro() {
  let valor = null;
  try { valor = localStorage.getItem("telefonoGym"); } catch (e) {}
  if (!valor) {
    try { valor = sessionStorage.getItem("telefonoGym"); } catch (e) {}
  }
  return valor;
}
function guardarTelefonoSeguro(telefono) {
  try { localStorage.setItem("telefonoGym", telefono); } catch (e) {}
  try { sessionStorage.setItem("telefonoGym", telefono); } catch (e) {}
}
// El DNI se pide junto con el teléfono (una sola vez por celular): así nadie
// puede ver los datos de un socio sabiendo solo su número.
function leerDniSeguro() {
  let valor = null;
  try { valor = localStorage.getItem("dniGym"); } catch (e) {}
  if (!valor) {
    try { valor = sessionStorage.getItem("dniGym"); } catch (e) {}
  }
  return valor;
}
function guardarDniSeguro(dni) {
  try { localStorage.setItem("dniGym", dni); } catch (e) {}
  try { sessionStorage.setItem("dniGym", dni); } catch (e) {}
}
function borrarDniSeguro() {
  try { localStorage.removeItem("dniGym"); } catch (e) {}
  try { sessionStorage.removeItem("dniGym"); } catch (e) {}
}
// Muestra el formulario de teléfono + DNI (con el teléfono ya escrito si lo tenemos)
document.addEventListener("input", function(e){ if (e.target && e.target.classList && e.target.classList.contains("qr-campo-mal")) e.target.classList.remove("qr-campo-mal"); });
function borrarTelefonoSeguro() {
  try { localStorage.removeItem("telefonoGym"); } catch (e) {}
  try { sessionStorage.removeItem("telefonoGym"); } catch (e) {}
}
// Muestra el formulario con un aviso. op = { tipo:'error'|'aviso', titulo, tel, dni, foco:'tel'|'dni' }
// Vuelve de la pantalla de ingreso de socio a las opciones iniciales (sin borrar lo guardado)
window.cyVolverOpcionesQR = function () {
  const form = document.getElementById("loginFormGym");
  if (form) form.style.display = "none";
  const opciones = document.getElementById("qrOpcionesInicio");
  if (opciones) opciones.style.display = "flex";
};

function mostrarFormularioSocioQR(mensaje, op) {
  op = op || {};
  const tarjeta = document.getElementById("qrCardPrimeraVez");
  if (tarjeta) tarjeta.style.display = "block";
  const opciones = document.getElementById("qrOpcionesInicio");
  if (opciones) opciones.style.display = "none";
  const form = document.getElementById("loginFormGym");
  if (form) form.style.display = "block";
  const aviso = document.getElementById("qrFormAviso");
  if (aviso && mensaje) {
    aviso.className = op.tipo ? "qr-aviso qr-aviso--" + op.tipo : "";
    aviso.innerHTML = op.tipo
      ? '<i class="fa-solid ' + (op.tipo === "error" ? "fa-circle-exclamation" : "fa-triangle-exclamation") + '" aria-hidden="true"></i><span>' +
        (op.titulo ? "<b>" + escaparHTML(op.titulo) + "</b>" : "") + escaparHTML(mensaje) + "</span>"
      : escaparHTML(mensaje);
    aviso.setAttribute("role", op.tipo ? "alert" : "status");
  }
  const tel = leerTelefonoSeguro();
  const phoneInput = document.getElementById("qrPhone");
  const dniInput = document.getElementById("qrDni");
  if (phoneInput) {
    if (op.tel != null) phoneInput.value = op.tel;
    else if (tel && !phoneInput.value) phoneInput.value = tel;
    phoneInput.classList.toggle("qr-campo-mal", op.foco === "tel");
  }
  if (dniInput) {
    dniInput.value = op.dni != null ? op.dni : "";
    dniInput.classList.toggle("qr-campo-mal", op.foco === "dni");
  }
  const enfocar = op.foco === "dni" ? dniInput : (op.foco === "tel" ? phoneInput : ((phoneInput && !phoneInput.value) ? phoneInput : dniInput));
  if (enfocar) { try { enfocar.focus({ preventScroll: false }); if (op.foco) enfocar.select(); } catch (e) {} }
}
