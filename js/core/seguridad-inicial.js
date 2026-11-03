// Arranque de seguridad y estado inicial del panel.
// Clásico (no módulo): mismo ámbito global y mismo orden que antes.
  let esAdelanto = false;
// --- SEGURIDAD ---
// El acceso al panel se controla con usuarios reales de Supabase Auth (correo +
// contraseña). Las reglas de la base de datos (RLS) solo dejan leer/escribir a
// los usuarios que están en la tabla "staff", así que aquí NO hay contraseñas
// guardadas: cualquiera puede ver el código de esta página.

// Convierte un texto en HTML seguro (evita que un nombre como "<img onerror=...>"
// se ejecute como código al pintarlo con innerHTML).
function escaparHTML(t) {
  return String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
// Para pasar un valor como texto dentro de onclick="funcion(...)"
function jsAttr(v) {
  return escaparHTML(JSON.stringify(String(v == null ? "" : v)));
}

// --- CATÁLOGO DE PRODUCTOS: ventana flotante con las páginas del catálogo ---
// Lectura/escritura segura del teléfono guardado: si el navegador bloquea el almacenamiento,
// esto NO debe romper el flujo de registro (solo hace que no se "recuerde" al usuario).
