// Comprobantes enviados por WhatsApp desde el panel.
// Clásico (no módulo): mismo ámbito global y mismo orden que antes.
function enviarComprobanteTextoWhatsApp(telefono, nombre, membresia, fechaInicio, fechaVencimiento, precio) {
  if (!telefono) {
    console.log("No se pudo enviar por WhatsApp: Celular no registrado.");
    return;
  }

  const telefonoLimpio = telefono.replace(/\D/g, '');

  const formatearFecha = (strFecha) => {
    if(!strFecha) return '--/--/----';
    const partes = strFecha.split('-');
    if(partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`;
    return strFecha;
  };

  const fInicio = formatearFecha(fechaInicio);
  const fVence = formatearFecha(fechaVencimiento);

  const mensaje = `🏋️‍♂️ *C%26Y FITNESS GYM*%0A` +
                  `=========================%0A` +
                  `*¡Hola, ${nombre}!* Tu membresía ha sido renovada con éxito. %0A%0A` +
                  `*Detalles de tu renovación:*%0A` +
                  `• *Plan:* ${membresia}%0A` +
                  `• *Fecha de Inicio:* ${fInicio}%0A` +
                  `• *Fecha de Vencimiento:* ${fVence}%0A%0A` +
                      `• *Monto Pagado:* S/ ${precio}%0A%0A` +
                  `Tu asistencia ya se encuentra actualizada en el sistema. ¡Gracias por entrenar con nosotros! 💪🔥`;

  const numeroCompleto = telefonoLimpio.startsWith("51") ? telefonoLimpio : "51" + telefonoLimpio;
  const urlWhatsApp = `https://wa.me/${numeroCompleto}?text=${mensaje}`;

  window.open(urlWhatsApp, '_blank');
}
// MENSAJE DE WHATSAPP PARA ADELANTO DE MEMBRESÍA
function enviarComprobanteAdelantoWhatsApp(telefono, nombre, plan, inicio, fin, precio) {
  if (!telefono) return;

  let numLimpio = telefono.toString().replace(/\D/g, '');
  if (numLimpio.length === 9) numLimpio = "51" + numLimpio;

  let mensaje = `🏋️ *C&Y FITNESS GYM* 🏋️\n` +
    `-----------------------------------\n` +
    `⏩ *COMPROBANTE DE ADELANTO DE MEMBRESÍA*\n\n` +
    `👤 *Socio:* ${nombre}\n` +
    `📌 *Plan Adquirido:* ${plan}\n` +
    `📅 *Inicio del nuevo periodo:* ${inicio}\n` +
    `📅 *Nuevo Vencimiento:* ${fin}\n` +
    `💰 *Monto Pagado:* S/ ${parseFloat(precio).toFixed(2)}\n\n` +
    `✅ ¡Gracias por asegurar tu entrenamiento con anticipación! Tu membresía ha sido extendida con éxito. 💪🔥\n` +
    `-----------------------------------`;

  let url = `https://api.whatsapp.com/send?phone=${numLimpio}&text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank');
}
// --- Ventana flotante a pantalla completa: "Nuevo / Quiero conocer el gym" ---
