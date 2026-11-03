// Dibuja el QR de invitación en el panel cuando la librería carga.
// Clásico (no módulo): mismo ámbito global y mismo orden que antes.
// La librería del QR carga sin frenar la pantalla (defer); al estar lista, dibuja el QR.
window.cyQrListo = function(){
  const caja = document.getElementById("gymQR");
  if (!caja || caja.dataset.listo || !window.QRCode) return;
  try {
    new QRCode(caja, { text: location.origin + location.pathname + "?qr=1", width: 240, height: 240 });
    caja.dataset.listo = "1";
  } catch (e) {
    console.warn("No se pudo generar el QR de recepción:", e);
  }
};
window.cyQrListo();

function fechaHoyISO(){
  const d = new Date();
  const año = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${año}-${mes}-${dia}`;
}

function estadoSocio(s){
  if (!s || !s.fecha_fin) return "VENCIDO";

  let esInterdiario = (s.tipo_memb || "").toLowerCase().includes("interdiario");
  
  // Si consumió sus 15 asistencias, devolvemos "AGOTADO"
  if (esInterdiario && s.dias_restantes <= 0) {
    return "AGOTADO"; 
  }

  let hoy = fechaHoyISO();
  if (s.fecha_fin < hoy) return "VENCIDO";

  return "ACTIVO";
}

function playSound(status){
  const audio = status === "ACTIVO" ? document.getElementById("soundOk") : document.getElementById("soundBad");
  if(audio) {
    audio.pause();
    audio.currentTime = 0;
    audio.play().catch(err=>{ console.log("Audio bloqueado:", err); });
  }
}

function mostrarToast(mensaje,color="#10b981"){
  let toast=document.createElement("div");
  toast.className="cy-toast";
  toast.setAttribute("role","status");
  let texto = String(mensaje);
  const esAdmin = !document.documentElement.classList.contains("qr-mode");
  if (esAdmin) {
    // En el panel: icono profesional en lugar del emoji inicial, según el tipo de aviso
    texto = texto.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, "");
    const c = String(color).toLowerCase();
    const icono = (c === "#10b981") ? "fa-check" : (c === "#ef4444" ? "fa-xmark" : (c === "#f59e0b" ? "fa-exclamation" : "fa-info"));
    toast.style.setProperty("--tc", c === "#10b981" ? "#34d399" : (c === "#ef4444" ? "#f06a6a" : (c === "#f59e0b" ? "#f5b53d" : c)));
    toast.innerHTML = '<i class="fa-solid ' + icono + '"></i><span>' + texto + '</span>';
  } else {
    toast.innerHTML = texto;
    toast.style.background = color;
  }
  document.body.appendChild(toast);
  setTimeout(()=>{ toast.remove(); },3000);
}

// Tarjeta de ingreso bloqueado por deuda de productos (tienda).
// Reemplaza la pantalla de marcar asistencia: el socio ve cuánto debe y por qué.
