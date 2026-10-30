// Parte del flujo del socio (QR). Clásico: mismo ámbito global que antes.
async function inicializarFlujoQR(){
  // Evita que dos disparadores (la carga inicial y el evento de "pestaña
  // visible") terminen ejecutando el flujo dos veces al mismo tiempo,
  // compitiendo entre sí por la misma conexión y haciendo sentir todo más lento.
  if (window._flujoQREnCurso) return;
  window._flujoQREnCurso = true;
  try {
    await inicializarFlujoQRInterno();
  } finally {
    window._flujoQREnCurso = false;
  }
}

async function inicializarFlujoQRInterno(){
  const url = new URL(window.location.href);
  if(url.searchParams.get("qr") === "1"){
    const dash = document.querySelector(".dashboard");
    if(dash) dash.style.display = "none";
    
    const tabs = document.querySelector(".tabs");
    if(tabs) tabs.style.display = "none";

    const panels = ["tab1", "tab2", "tab3", "tab5", "tab6"];
    panels.forEach(p => {
      const el = document.getElementById(p);
      if(el) el.style.display = "none";
    });

    const pubCheck = document.getElementById("publicCheckin");
    if(pubCheck) pubCheck.style.display = "block";
    detectarProblemaNavegador();

    const telefonoGuardado = leerTelefonoSeguro();
    const tarjetaPrimeraVez = document.getElementById("qrCardPrimeraVez");

    // --- AQUÍ CAMBIA LA LÓGICA PARA CONTROLAR EL FORMULARIO NUEVO ---

    if (!telefonoGuardado) {
      // Antes de mostrar los botones, intentamos recuperar en silencio un número
      // guardado por el propio celular (esto es lo que resuelve el caso de iPhone,
      // donde el localStorage no siempre persiste). Si lo encontramos, seguimos
      // directo al flujo de marcar asistencia, igual que ya le pasa a Android.
      const recuperado = await intentarRecuperarCredencialSilenciosa();
      if (recuperado) {
        guardarTelefonoSeguro(recuperado.telefono);
        if (recuperado.dni) guardarDniSeguro(recuperado.dni);
        await continuarConTelefonoGuardado();
        return;
      }

      // SI NO HAY TELÉFONO: mostramos primero la bifurcación (socio vs. primera vez).
      if (tarjetaPrimeraVez) tarjetaPrimeraVez.style.display = "block";
      const formGym = document.getElementById("loginFormGym");
      if(formGym) formGym.style.display = "none";
      const qrResultLimpio = document.getElementById("qrResult");
      if (qrResultLimpio) qrResultLimpio.innerHTML = "";

      const opciones = document.getElementById("qrOpcionesInicio");
      const btnRegistrar = document.getElementById("btnRegistrarSocioQR");
      const btnSoySocio = document.getElementById("btnSoySocioQR");
      const btnPrimeraVez = document.getElementById("btnPrimeraVezQR");

      if (btnSoySocio) {
        btnSoySocio.onclick = () => {
          if (opciones) opciones.style.display = "none";
          if (formGym) formGym.style.display = "block";
          const phoneInput = document.getElementById("qrPhone");
          if (phoneInput) phoneInput.focus();
        };
      }

      if (btnPrimeraVez) {
        btnPrimeraVez.onclick = () => {
          mostrarBienvenidaPublicaQR();
        };
      }

      if (btnRegistrar) {
        btnRegistrar.style.display = "none";
        btnRegistrar.onclick = () => {
          btnRegistrar.style.display = "none";
          if (formGym) formGym.style.display = "block";
          const phoneInput = document.getElementById("qrPhone");
          if (phoneInput) phoneInput.focus();
        };
      }
      return;
    }

    // SI YA HAY TELÉFONO (Android, o iPhone ya recuperado arriba): procesamos directo
    await continuarConTelefonoGuardado();

    async function continuarConTelefonoGuardado(){
      if (!leerDniSeguro()) {
        mostrarFormularioSocioQR("Por seguridad, confirma tu DNI (solo una vez en este celular).");
        return;
      }
      if (tarjetaPrimeraVez) tarjetaPrimeraVez.style.display = "none";
      const formGym = document.getElementById("loginFormGym");
      if(formGym) formGym.style.display = "none";

      document.getElementById("qrResult").innerHTML = "<div class='card' style='text-align:center'><h2>🔄 Verificando...</h2><div class='skeleton-line'></div><div class='skeleton-line' style='width:45%'></div></div>";

      await buscarQR();
    }
  }
}
// Arranca apenas el HTML está listo (DOMContentLoaded), sin esperar a que
// terminen de cargar imágenes, fotos de fondo, etc. — eso es lo que antes
// retrasaba innecesariamente el inicio de la búsqueda del socio con
// window.onload, aunque la conexión a internet fuera excelente.
document.addEventListener("DOMContentLoaded", inicializarFlujoQR);

// --- CORRECCIÓN: el navegador a veces reutiliza una pestaña ya abierta (o la restaura
// desde su caché) en vez de recargarla, dejando visible la pantalla de "Bienvenido" de
// la asistencia anterior. Forzamos una re-verificación cada vez que la pestaña vuelve
// a estar visible/en foco, para que siempre muestre el estado real y actual del socio.
window.addEventListener('pageshow', (event) => {
  if (event.persisted && document.documentElement.classList.contains("qr-mode")) {
    inicializarFlujoQR();
  }
});

// --- INTEGRACIÓN DE LA SOLUCIÓN DE SINCRONIZACIÓN AUTOMÁTICA ---
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    sincronizarDatosSilencioso();
  }
});

window.addEventListener('focus', () => {
  sincronizarDatosSilencioso();
});

async function sincronizarDatosSilencioso() {
  try {
    if (document.documentElement.classList.contains("qr-mode")) {
      // En la vista pública del QR no hay panel de administrador que sincronizar;
      // en vez de eso, volvemos a verificar el estado real del socio, por si el
      // navegador reutilizó una pestaña vieja con la pantalla de "Bienvenido" de
      // una asistencia anterior.
      inicializarFlujoQR();
      return;
    }
    await render();
    await mostrarHistorial();
  } catch (error) {
    console.error("Error en sincronización en segundo plano:", error);
  }
}
// ---------------------------------------------------------------------------------------

const SUPABASE_URL = "https://ygbiqnbygjbrmwyttkku.supabase.co";
const SUPABASE_KEY = "sb_publishable_M9fPsgu2VkCyu9ro0ECx8A_no-0RLLt";
