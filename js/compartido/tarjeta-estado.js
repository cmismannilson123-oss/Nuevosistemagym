// Compartida por el QR y el panel. Clásico: mismo ámbito global y mismo orden que antes.
function mostrarTarjetaEstado(titulo, mensaje, color="#ef4444"){
  const div = document.getElementById("qrResult");
  if(!div) return;
  let icono = "ℹ️";
  if(color=="#10b981") icono="✅";
  if(color=="#ef4444") icono="🚫";
  if(color=="#f59e0b") icono="⚠️";

  div.innerHTML=`
  <div class="card" style="max-width:520px;margin:25px auto;text-align:center;padding:35px;border:2px solid ${color};box-shadow:0 0 30px ${color}55;">
    <div style="font-size:70px;margin-bottom:15px;">${icono}</div>
    <h1 style="margin:0;font-size:32px;color:${color};">C&Y FITNESS GYM</h1>
    <h2 style="margin-top:18px;color:${color};">${titulo}</h2>
    <div style="margin-top:18px;font-size:20px;line-height:1.8;">${mensaje}</div>
    <hr style="margin:25px 0;border:none;border-top:1px solid rgba(255,255,255,.15);">
    <div style="color:#9ca3af;font-size:15px;">💪 Gracias por elegir C&Y FITNESS GYM</div>
  </div>`;
}
