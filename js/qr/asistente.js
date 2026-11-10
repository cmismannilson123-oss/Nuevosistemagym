// Parte del flujo del socio (QR). Clásico: mismo ámbito global que antes.
// ASISTENTE DE FITNESS (IA) — "Coach C&Y".
// Botón flotante + ventana de chat. Habla con la Edge Function cy-asistente.
//  * Solo aparece en la pantalla del socio (modo QR) cuando el celular ya tiene
//    guardado el teléfono y el DNI (los mismos que usa el ingreso por QR).
//  * La conversación vive solo en memoria: al cerrar la página se borra.
//  * Usa funciones que ya existen: leerTelefonoSeguro, leerDniSeguro,
//    escaparHTML y supabaseClient.
const cyAsistenteEstado = { historial: [], ocupado: false, saludo: false };

const CY_ASISTENTE_SUGERENCIAS = [
  "Rutina para empezar desde cero",
  "¿Qué como antes de entrenar?",
  "¿Cómo gano masa muscular?",
  "Estiramientos después de entrenar",
];

const CY_ASISTENTE_ERRORES = {
  no_socio: "No pude verificar tu cuenta. Vuelve a ingresar con tu teléfono y DNI.",
  bloqueado: "Hubo demasiados intentos. Prueba de nuevo en unos minutos.",
  limite: "Ya usaste todas tus consultas de hoy. ¡Vuelve mañana! 💪",
  global: "El asistente está muy ocupado ahora. Prueba más tarde.",
  cupo: "El asistente está muy ocupado ahora. Prueba más tarde.",
  red: "No pude responder ahora. Revisa tu conexión e inténtalo otra vez.",
};

function cyAsistenteCredenciales() {
  const telefono = leerTelefonoSeguro();
  const dni = leerDniSeguro();
  return telefono && dni ? { telefono: telefono, dni: dni } : null;
}

// Muestra u oculta el botón flotante según haya socio guardado en este celular
function cyAsistenteActualizarFab() {
  const fab = document.getElementById("cyAsistenteFab");
  if (!fab) return;
  const visible = document.documentElement.classList.contains("qr-mode") && !!cyAsistenteCredenciales();
  fab.classList.toggle("cy-asi-fab--visible", visible);
}

// Texto del asistente -> HTML seguro (párrafos, listas y **negritas**)
function cyAsistenteNegritas(s) {
  return s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}
function cyAsistenteFormato(texto) {
  const lineas = escaparHTML(String(texto || "")).split(/\n+/);
  let html = "";
  let lista = false;
  lineas.forEach(function (l) {
    const m = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (m) {
      if (!lista) { html += "<ul>"; lista = true; }
      html += "<li>" + cyAsistenteNegritas(m[1]) + "</li>";
    } else {
      if (lista) { html += "</ul>"; lista = false; }
      if (l.trim()) html += "<p>" + cyAsistenteNegritas(l) + "</p>";
    }
  });
  if (lista) html += "</ul>";
  return html;
}

function cyAsistenteAgregar(rol, texto, esError) {
  const chat = document.getElementById("cyAsiChat");
  if (!chat) return null;
  const burbuja = document.createElement("div");
  burbuja.className = "cy-asi-msg cy-asi-msg--" + (rol === "usuario" ? "yo" : "coach") + (esError ? " cy-asi-msg--error" : "");
  if (rol === "usuario") burbuja.textContent = texto;
  else burbuja.innerHTML = cyAsistenteFormato(texto);
  chat.appendChild(burbuja);
  chat.scrollTop = chat.scrollHeight;
  return burbuja;
}

function cyAsistenteEscribiendo() {
  const chat = document.getElementById("cyAsiChat");
  const b = document.createElement("div");
  b.className = "cy-asi-msg cy-asi-msg--coach cy-asi-escribiendo";
  b.setAttribute("aria-label", "Escribiendo");
  b.innerHTML = "<span></span><span></span><span></span>";
  if (chat) { chat.appendChild(b); chat.scrollTop = chat.scrollHeight; }
  return b;
}

function cyAsistenteBloquear(bloqueado) {
  cyAsistenteEstado.ocupado = bloqueado;
  const campo = document.getElementById("cyAsiTexto");
  const boton = document.getElementById("cyAsiEnviar");
  if (campo) campo.disabled = bloqueado;
  if (boton) boton.disabled = bloqueado;
  if (!bloqueado && campo) { try { campo.focus({ preventScroll: true }); } catch (e) {} }
}

// Código de error que devolvió la función ("limite", "no_socio", ...)
async function cyAsistenteCodigoError(error) {
  try {
    if (error && error.context && typeof error.context.json === "function") {
      const cuerpo = await error.context.json();
      if (cuerpo && cuerpo.error) return String(cuerpo.error);
    }
  } catch (e) {}
  return "red";
}

async function cyAsistenteEnviar(texto) {
  const est = cyAsistenteEstado;
  texto = String(texto || "").replace(/\s+/g, " ").trim().slice(0, 500);
  if (!texto || est.ocupado) return;

  const cred = cyAsistenteCredenciales();
  if (!cred) {
    cyAsistenteAgregar("coach", "Primero ingresa con tu teléfono y DNI en la pantalla principal para usar el asistente.", true);
    return;
  }

  const sugs = document.getElementById("cyAsiSugs");
  if (sugs) sugs.style.display = "none";
  cyAsistenteAgregar("usuario", texto);
  est.historial.push({ rol: "usuario", texto: texto });
  cyAsistenteBloquear(true);
  const espera = cyAsistenteEscribiendo();

  let respuesta = null;
  let codigo = null;
  try {
    const llamada = supabaseClient.functions.invoke("cy-asistente", {
      body: { telefono: cred.telefono, dni: cred.dni, mensajes: est.historial.slice(-10) },
    });
    const limite = new Promise(function (_, rechazar) { setTimeout(function () { rechazar(new Error("tiempo")); }, 35000); });
    const res = await Promise.race([llamada, limite]);
    if (res.error) codigo = await cyAsistenteCodigoError(res.error);
    else if (res.data && res.data.respuesta) respuesta = String(res.data.respuesta);
    else codigo = "red";
  } catch (e) {
    codigo = "red";
  }

  if (espera && espera.parentNode) espera.parentNode.removeChild(espera);
  if (respuesta) {
    est.historial.push({ rol: "asistente", texto: respuesta });
    cyAsistenteAgregar("coach", respuesta);
  } else {
    est.historial.pop(); // la pregunta sin respuesta no se manda otra vez
    cyAsistenteAgregar("coach", CY_ASISTENTE_ERRORES[codigo] || CY_ASISTENTE_ERRORES.red, true);
  }
  cyAsistenteBloquear(false);
}

function cyAsistenteCrearPanel() {
  const panel = document.createElement("div");
  panel.id = "cyAsistente";
  panel.className = "cy-asi";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Asistente de fitness C&Y");
  panel.innerHTML =
    '<div class="cy-asi-panel">' +
      '<div class="cy-asi-head">' +
        '<div class="cy-asi-titulo"><i class="fa-solid fa-dumbbell" aria-hidden="true"></i>' +
          '<div><strong>Coach C&amp;Y</strong><small>Asistente de fitness con IA</small></div></div>' +
        '<button type="button" class="cy-asi-cerrar" id="cyAsiCerrar" aria-label="Cerrar">✕</button>' +
      '</div>' +
      '<div class="cy-asi-chat" id="cyAsiChat" role="log" aria-live="polite"></div>' +
      '<div class="cy-asi-sugs" id="cyAsiSugs"></div>' +
      '<form class="cy-asi-form" id="cyAsiForm" autocomplete="off">' +
        '<input id="cyAsiTexto" type="text" maxlength="500" enterkeyhint="send" placeholder="Pregunta sobre ejercicio o nutrición…" aria-label="Tu pregunta">' +
        '<button type="submit" id="cyAsiEnviar" aria-label="Enviar"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></button>' +
      '</form>' +
      '<p class="cy-asi-aviso">Consejos generales. No reemplazan a un médico o nutricionista.</p>' +
    '</div>';
  document.body.appendChild(panel);

  const sugs = panel.querySelector("#cyAsiSugs");
  CY_ASISTENTE_SUGERENCIAS.forEach(function (t) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cy-asi-sug";
    b.textContent = t;
    b.addEventListener("click", function () { cyAsistenteEnviar(t); });
    sugs.appendChild(b);
  });

  panel.querySelector("#cyAsiCerrar").addEventListener("click", cyCerrarAsistente);
  panel.addEventListener("click", function (e) { if (e.target === panel) cyCerrarAsistente(); });
  panel.addEventListener("keydown", function (e) { if (e.key === "Escape") cyCerrarAsistente(); });
  panel.querySelector("#cyAsiForm").addEventListener("submit", function (e) {
    e.preventDefault();
    const campo = document.getElementById("cyAsiTexto");
    const texto = campo ? campo.value : "";
    if (campo) campo.value = "";
    cyAsistenteEnviar(texto);
  });
  return panel;
}

function cyAbrirAsistente() {
  let panel = document.getElementById("cyAsistente");
  if (!panel) panel = cyAsistenteCrearPanel();
  if (!cyAsistenteEstado.saludo) {
    cyAsistenteEstado.saludo = true;
    cyAsistenteAgregar("coach", "¡Hola! Soy **Coach C&Y** 💪 Pregúntame lo que quieras sobre ejercicios, rutinas, recuperación o alimentación.");
  }
  panel.classList.add("cy-asi--abierto");
  document.documentElement.classList.add("cy-asi-abierto");
  const campo = document.getElementById("cyAsiTexto");
  if (campo) setTimeout(function () { try { campo.focus({ preventScroll: true }); } catch (e) {} }, 80);
}

function cyCerrarAsistente() {
  const panel = document.getElementById("cyAsistente");
  if (panel) panel.classList.remove("cy-asi--abierto");
  document.documentElement.classList.remove("cy-asi-abierto");
}

// El botón aparece apenas el celular tiene teléfono + DNI guardados
// (al cargar la página y justo cuando el socio ingresa por primera vez).
document.addEventListener("DOMContentLoaded", cyAsistenteActualizarFab);
(function () {
  const original = window.guardarDniSeguro;
  if (typeof original !== "function") return;
  window.guardarDniSeguro = function () {
    const r = original.apply(this, arguments);
    cyAsistenteActualizarFab();
    return r;
  };
})();
