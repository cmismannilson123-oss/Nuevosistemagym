// Detección de navegador embebido o almacenamiento bloqueado.
// Clásico (no módulo): mismo ámbito global y mismo orden que antes.
// --- DETECCIÓN: navegador embebido (WhatsApp/Instagram/Facebook/etc.) o cookies/almacenamiento bloqueado ---
// Esto no cambia el flujo de registro; solo muestra un aviso para que la persona sepa cómo evitar
// que el sistema le vuelva a pedir su número cada vez.
function detectarProblemaNavegador() {
  const ua = navigator.userAgent || "";

  // Firmas conocidas de navegadores embebidos dentro de otras apps
  const esNavegadorEmbebido = /FBAN|FBAV|Instagram|Line\/|MicroMessenger|TikTok|musical_ly|Twitter|GSA\/|WhatsApp/i.test(ua)
    || (/\bwv\b/i.test(ua) && /Android/i.test(ua)); // WebView genérico de Android

  // Prueba real de almacenamiento: si falla, es que el navegador lo está bloqueando (ej. "Bloquear todas las cookies")
  let almacenamientoBloqueado = false;
  try {
    const testKey = "__cy_test__";
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
  } catch (e) {
    almacenamientoBloqueado = true;
  }

  const aviso = document.getElementById("avisoNavegador");
  const titulo = document.getElementById("avisoNavegadorTitulo");
  const texto = document.getElementById("avisoNavegadorTexto");
  if (!aviso || !titulo || !texto) return;

  if (esNavegadorEmbebido) {
    titulo.textContent = "Abre este link en Safari o Chrome";
    texto.textContent = "Estás dentro de otra app (como WhatsApp o Instagram). Para que el sistema recuerde tu número y no te lo pida cada vez, toca el ícono de compartir o los tres puntos (⋮) y elige \"Abrir en Safari\" o \"Abrir en Chrome\".";
    aviso.style.display = "block";
  } else if (almacenamientoBloqueado) {
    titulo.textContent = "Activa las cookies para que te recordemos";
    texto.textContent = "Tu navegador está bloqueando la memoria de este sitio. En iPhone: Ajustes → Safari (o Apps → Safari) → Avanzado → desactiva \"Bloquear todas las cookies\". En Android: revisa que las cookies estén permitidas en la configuración de tu navegador.";
    aviso.style.display = "block";
  } else {
    aviso.style.display = "none";
  }
}
