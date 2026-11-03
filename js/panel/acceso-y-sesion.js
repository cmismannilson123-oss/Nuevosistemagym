// Acceso al panel y arranque según el rol.
// Clásico (no módulo): mismo ámbito global y mismo orden que antes.
// Entrada al sistema: vista pública del QR, o login del personal
async function verificarAccesoSistema() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("qr") === "1") {
    document.getElementById("loading-screen").style.display = "none";
    document.getElementById("publicCheckin").style.display = "block";
    detectarProblemaNavegador();
    return;
  }

  // Limpia las marcas del sistema de claves anterior
  try { ["auth_nivel1", "auth_nivel2", "auth_nivel3"].forEach(k => localStorage.removeItem(k)); } catch (e) {}

  const form = document.getElementById("loginStaffForm");
  const inputEmail = document.getElementById("loginEmail");
  const inputPass = document.getElementById("loginPassword");
  const btn = document.getElementById("btnLoginStaff");
  const errorMsg = document.getElementById("loginError");

  const mostrarDashboard = () => {
    document.getElementById("loading-screen").style.display = "none";
  };

  // ¿Ya hay una sesión guardada en este dispositivo?
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    const { data: esStaff } = await supabaseClient.rpc("es_staff");
    if (esStaff === true) { await cyFijarRol(); mostrarDashboard(); return; }
    await supabaseClient.auth.signOut();
    if (errorMsg) errorMsg.textContent = "❌ Este usuario no tiene permiso para usar el sistema.";
  }

  if (!form) return;
  form.style.display = "block";
  if (inputEmail) inputEmail.focus();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (btn.disabled) return;
    btn.disabled = true;
    if (errorMsg) errorMsg.textContent = "";

    const { error } = await supabaseClient.auth.signInWithPassword({
      email: inputEmail.value.trim(),
      password: inputPass.value
    });

    if (error) {
      btn.disabled = false;
      if (errorMsg) errorMsg.textContent = "❌ Correo o contraseña incorrectos.";
      inputPass.value = "";
      inputPass.focus();
      return;
    }

    const { data: esStaff } = await supabaseClient.rpc("es_staff");
    if (esStaff !== true) {
      await supabaseClient.auth.signOut();
      btn.disabled = false;
      if (errorMsg) errorMsg.textContent = "❌ Este usuario no tiene permiso para usar el sistema.";
      return;
    }

    // Recargamos para que la lista, el historial y el tiempo real arranquen
    // ya con la sesión iniciada.
    location.reload();
  });
}

// Rol de la cuenta: 'admin' o 'recepcion'. Si no se puede leer, queda 'recepcion' (lo más restrictivo).
window.cyFijarRol = async function () {
  let rol = "recepcion";
  try {
    const { data } = await supabaseClient.rpc("mi_rol");
    if (data === "admin") rol = "admin";
  } catch (e) { /* se queda en recepción */ }
  document.documentElement.dataset.rol = rol;
  const tbRol = document.getElementById("tbRol");
  if (tbRol) tbRol.textContent = rol === "admin" ? "Panel del administrador" : "Panel de recepción";
};

window.cerrarSesionStaff = async function() {
  if (!confirm("¿Cerrar sesión en este dispositivo?")) return;
  await supabaseClient.auth.signOut();
  location.reload();
};

document.addEventListener("DOMContentLoaded", () => {
  document.body.style.visibility = "visible";
  verificarAccesoSistema();

  // Efecto "tarjeta seleccionada": al tocar una tarjeta (fuera de sus botones),
  // queda resaltada/levantada hasta que el usuario toque afuera o haga scroll.
  const listaSocios = document.getElementById("lista");
  if (listaSocios) {
    listaSocios.addEventListener("click", (e) => {
      // Si el toque fue sobre un botón interno, NUNCA tocar la selección de la
      // tarjeta — el botón hace su propia función y listo.
      if (e.target.closest("button")) return;

      const card = e.target.closest(".sc");
      if (!card) return;

      const yaSeleccionada = card.classList.contains("seleccionada");
      document.querySelectorAll(".sc.seleccionada")
        .forEach(c => c.classList.remove("seleccionada"));
      if (!yaSeleccionada) card.classList.add("seleccionada");
    });
  }

  // Cerrar la tarjeta seleccionada al tocar en cualquier lugar fuera de las tarjetas
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".sc")) {
      document.querySelectorAll(".sc.seleccionada")
        .forEach(c => c.classList.remove("seleccionada"));
    }
  });

  // Cerrar la tarjeta seleccionada al hacer scroll
  var _selCards = document.getElementsByClassName("seleccionada");
  window.addEventListener("scroll", () => {
    if (!_selCards.length) return;
    document.querySelectorAll(".sc.seleccionada")
      .forEach(c => c.classList.remove("seleccionada"));
  }, { passive: true });
});
