// Parte del flujo del socio (QR). Clásico: mismo ámbito global que antes.
window.procesarIngresoSocio = function(event) {
  event.preventDefault(); // Evita que la página se recargue
  
  let telefonoIngresado = cyLimpiarTelefono(document.getElementById("qrPhone").value);
  let dniIngresado = cyLimpiarDni((document.getElementById("qrDni") || {}).value || "");

  if (!/^9\d{8}$/.test(telefonoIngresado)) {
    mostrarFormularioSocioQR("Tu número de celular debe tener 9 dígitos y empezar con 9.", { tipo: "aviso", titulo: "Revisa tu celular. ", tel: document.getElementById("qrPhone").value, dni: dniIngresado, foco: "tel" });
    return;
  }
  if (!/^\d{6,12}$/.test(dniIngresado)) {
    mostrarFormularioSocioQR("Escribe tu DNI completo (8 números).", { tipo: "aviso", titulo: "Revisa tu DNI. ", tel: telefonoIngresado, dni: dniIngresado, foco: "dni" });
    return;
  }

  if (telefonoIngresado && dniIngresado) {
    // Guarda número y DNI para mantener el automatismo (Android e iPhone)
    guardarTelefonoSeguro(telefonoIngresado);
    guardarDniSeguro(dniIngresado);
    
    // Oculta toda la pantalla de bienvenida (ahora es a pantalla completa) para que
    // el resultado de la búsqueda quede visible, igual que le pasa a un socio recurrente.
    const tarjetaInicio = document.getElementById("qrCardPrimeraVez");
    if (tarjetaInicio) tarjetaInicio.style.display = "none";
    document.getElementById("loginFormGym").style.display = "none";
    document.getElementById("qrResult").innerHTML = "<div class='card' style='text-align:center'><h2>🔄 Verificando...</h2><div class='skeleton-line'></div><div class='skeleton-line' style='width:45%'></div></div>";
    
    // Llama a tu función original que ya tienes abajo (true = primera vez que lo ingresa a mano)
    window.buscarQR(true);
  }
};

// Guarda el número como "credencial" del propio sistema del celular (Guardar/Actualizar
// contraseña), SOLO se llama una vez que ya encontramos al socio en la base de datos.
// Esto es lo que le permite a un iPhone (donde el localStorage no siempre se conserva)
// recordar el número la próxima vez, igual que ya le pasa a Android con localStorage.
window.guardarCredencialNavegador = function(telefono, dni){
  try {
    const userInput = document.getElementById("credSaveUser");
    const passInput = document.getElementById("credSavePass");
    const form = document.getElementById("credSaveForm");
    if (!userInput || !passInput || !form) return;
    userInput.value = telefono;
    passInput.value = dni;
    form.submit();
  } catch (e) { /* si el navegador no lo soporta, no pasa nada, no interrumpe el flujo */ }
};

// Antes de mostrar los botones de "primera vez", intenta recuperar en silencio (sin
// mostrar ningún cartel al socio) un número guardado previamente por el propio
// celular. Si lo encuentra, lo usa directo — esto es lo que resuelve el caso de
// iPhone sin que el socio tenga que volver a escribir su número cada vez.
window.intentarRecuperarCredencialSilenciosa = async function(){
  try {
    if (!('credentials' in navigator) || !window.PasswordCredential) return null;
    const cred = await navigator.credentials.get({ password: true, mediation: 'silent' });
    if (cred && cred.id) {
      // Versiones anteriores guardaban "gym-<teléfono>" como contraseña; ahora es el DNI
      const dni = (cred.password && !String(cred.password).startsWith("gym-")) ? String(cred.password).replace(/\D/g,'') : null;
      return { telefono: cred.id.replace(/\D/g,''), dni: dni };
    }
  } catch (e) { /* sin soporte o sin credencial guardada: seguimos con el flujo normal */ }
  return null;
};

// Avisa a recepción (voz y notificación) que un socio quiso ingresar y no puede.
// La base decide el motivo con los datos reales; no frena la pantalla.
window.cyAvisarIntento = function(){
  try {
    const tel = (leerTelefonoSeguro() || "").replace(/\D/g, ""), dni = (leerDniSeguro() || "").replace(/\D/g, "");
    if (tel && dni) supabaseClient.rpc("avisar_intento_qr", { p_telefono: tel, p_dni: dni }).then(() => {}, () => {});
  } catch (e) {}
};

// Pantalla de estado al marcar (bloqueada, agotada o vencida). Un solo diseño para las tres.
// conPlanes: añade el botón "Ver todos los planes".
function pantallaEstado({ icono, titulo, nombre, texto, conPlanes }) {
  const cta = conPlanes ? `<button type="button" class="estado-cta" onclick="abrirPlanesDesdeVencimiento()">
      <span class="estado-cta-ico"><i class="fa-solid fa-clipboard-list" aria-hidden="true"></i></span>
      <span class="estado-cta-txt"><b>Ver todos los planes</b><small>Elige el plan que mejor te convenga</small></span>
      <i class="fa-solid fa-chevron-right estado-cta-flecha" aria-hidden="true"></i>
    </button>` : "";
  return `<div class="estado-pantalla">
    <section class="estado" role="alert">
      <div class="estado-icono" aria-hidden="true"><i class="fa-solid ${icono}"></i></div>
      <h2 class="estado-titulo">${titulo}</h2>
      <h3 class="estado-nombre">${escaparHTML(nombre)}</h3>
      <p class="estado-texto">${texto}</p>
    </section>
    ${cta}
  </div>`;
}

window.buscarQR = async function(esPrimeraVez){
  let telefonoGuardado = leerTelefonoSeguro();
  let phoneInput = document.getElementById("qrPhone");
  let telefono = telefonoGuardado || (phoneInput ? phoneInput.value : "");
  telefono = telefono.replace(/\D/g,'');
  const dni = (leerDniSeguro() || "").replace(/\D/g,'');

  // La vista pública no puede leer la tabla de socios: el servidor devuelve
  // solo los datos mínimos del socio si el teléfono Y el DNI coinciden.
  window._ultimaVerificacionQR = Date.now();
  const { data: resp, error } = await cyRpcSeguro("verificar_socio_qr", { p_telefono: telefono, p_dni: dni });
  const socio = resp && resp.ok ? resp : (resp && resp.bloqueado ? resp : null);
  let div = document.getElementById("qrResult");
  if(!div) return;
  const filaAccesos0 = document.getElementById("cyPromoRow");
  if (filaAccesos0) filaAccesos0.style.display = "";

  if (error) {
    div.innerHTML = "<div class='card qr-sinred' style='text-align:center; color:#ef4444; font-weight:700;'>⚠️ La señal está muy lenta o sin internet.<br><button type='button' class='qr-btn-principal' style='margin-top:14px;' onclick='this.disabled=true;buscarQR(" + (esPrimeraVez ? "true" : "false") + ")'><span class='icono-circulo'><i class='fa-solid fa-rotate-right'></i></span> Reintentar</button></div>";
    return;
  }
  if (socio && socio.bloqueado) {
    div.innerHTML = "<div class='card' style='text-align:center; color:#ef4444; font-weight:700;'>🚫 Demasiados intentos. Espera 15 minutos o acércate a recepción.</div>";
    return;
  }
  if(!socio){
    // No coincide: se olvida lo guardado (para no repetir el error la próxima
    // vez) y se vuelve a mostrar el formulario con un aviso claro. Nunca se
    // muestran datos de otro socio.
    borrarDniSeguro();
    borrarTelefonoSeguro();
    div.innerHTML = "";
    const motivo = resp && resp.motivo;
    // El servidor responde igual si el celular o el DNI no coinciden (no revela qué socios existen)
    if (motivo === "DATOS_INVALIDOS") {
      mostrarFormularioSocioQR("Revisa que tu celular tenga 9 dígitos y tu DNI 8.", { tipo: "aviso", titulo: "Datos incompletos. ", tel: telefono, dni: dni, foco: "tel" });
    } else {
      mostrarFormularioSocioQR("No encontramos un socio con ese celular ni con ese DNI. Si ya te inscribiste, acércate a recepción.", { tipo: "error", titulo: "Número no registrado. ", tel: telefono, dni: dni, foco: "tel" });
    }
    return;
  }

  // Deuda de tienda que bloquea: no se ofrece marcar; se muestra la tarjeta de bloqueo
  if (socio.tienda_bloqueada) {
    // Igual que un socio sin bloqueo: el celular queda recordado para la próxima vez
    guardarTelefonoSeguro(telefono);
    if (esPrimeraVez) guardarCredencialNavegador(telefono, dni);
    window.pendingQR = null;
    div.innerHTML = cyTarjetaBloqueoTienda(socio.nombre, socio.deudas_tienda);
    playSound("VENCIDO");
    return;
  }

  socio.dni = dni;
  window.cyCupones = socio.cupones || {};
  window.cyFinSocio = socio.fecha_fin;
  guardarTelefonoSeguro(telefono);
  if (esPrimeraVez) guardarCredencialNavegador(telefono, dni);
  let estado = estadoSocio(socio);

  // 1. VALIDACIÓN DE DEUDA
  if (parseFloat(socio.deuda || 0) > 0 && socio.fecha_deuda) {
    const diasDeuda = Math.floor((new Date() - new Date(socio.fecha_deuda)) / 86400000);
    if (diasDeuda > 7) {
      div.innerHTML = pantallaEstado({ icono: "fa-lock", titulo: "ACCESO BLOQUEADO", nombre: socio.nombre, texto: `Deuda pendiente: <b>S/ ${escaparHTML(socio.deuda)}</b><br>Regularice su pago para habilitar su acceso.` });
      playSound("VENCIDO");
      cyAvisarIntento();
      return;
    }
  }

  // 2. VALIDACIÓN DE ASISTENCIAS AGOTADAS (Planes interdiarios / por cupos)
  const esInterdiario = (socio.tipo_memb || "").toLowerCase().includes("interdiario");
  if ((esInterdiario && socio.dias_restantes <= 0) || estado === "AGOTADO") {
    div.innerHTML = pantallaEstado({ icono: "fa-ban", titulo: "MEMBRESÍA AGOTADA", nombre: socio.nombre, texto: "Ha consumido todas las asistencias de su plan.<br>Acérquese a recepción para renovar.", conPlanes: true });
    playSound("VENCIDO");
    cyAvisarIntento();
    return;
  }

  // 3. VALIDACIÓN DE MEMBRESÍA VENCIDA POR FECHA
  if(estado === "VENCIDO"){
    div.innerHTML = pantallaEstado({ icono: "fa-calendar-xmark", titulo: "MEMBRESÍA VENCIDA", nombre: socio.nombre, texto: "Su membresía ha vencido por fecha calendario.<br>Acérquese a recepción para renovar.", conPlanes: true });
    playSound("VENCIDO");
    cyAvisarIntento();
    return;
  }

  // SI PASA TODAS LAS VALIDACIONES -> MUESTRA EL BOTÓN DE REGISTRO
  window.pendingQR = socio;

  // Datos reales del plan para la tarjeta (vence en, asistencias usadas)
  const _hoy = new Date(); _hoy.setHours(0,0,0,0);
  const _fin = new Date((socio.fecha_fin || "") + "T00:00:00");
  const diasVence = isNaN(_fin) ? null : Math.max(0, Math.round((_fin - _hoy) / 86400000));
  const textoVence = diasVence === null ? "—" : diasVence === 0 ? "Hoy" : diasVence === 1 ? "1 día" : diasVence + " días";
  const totalAsis = Number(socio.dias_totales) || 0;
  const usadasAsis = totalAsis ? Math.max(0, totalAsis - (Number(socio.dias_restantes) || 0)) : 0;
  const fraccion = totalAsis ? Math.min(1, usadasAsis / totalAsis) : 0;
  const deudaNum = parseFloat(socio.deuda || 0);
  const nombreCorto = String(socio.nombre || "").trim().split(/\s+/).slice(0, 2).join(" ");

  div.innerHTML = `
  <div class="qr-hero-card cy-check">
    <div class="cyc-head">
      <div class="qr-logo-ring"><span class="logo-cy"></span></div>
      <div class="cyc-hola">
        <small>Hola,</small>
        <h2 class="qr-titulo">${escaparHTML(nombreCorto)}</h2>
        <div class="qr-badge"><i class="dot"></i> Socio activo</div>
      </div>
    </div>

    <div class="cyc-stats">
      <div class="${String(socio.tipo_memb || '').trim().length > 11 ? 'largo' : ''}"><span>Plan</span><b>${escaparHTML(socio.tipo_memb || "—")}</b></div>
      <div class="${diasVence !== null && diasVence <= 5 ? 'warn' : ''}"><span>Vence en</span><b>${textoVence}</b></div>
      <div><span>Asistencias</span><b>${totalAsis ? usadasAsis + '<i>/' + totalAsis + '</i>' : '—'}</b></div>
    </div>
    ${totalAsis ? `<div class="cyc-bar" role="progressbar" aria-label="Asistencias usadas" aria-valuemin="0" aria-valuemax="${totalAsis}" aria-valuenow="${usadasAsis}"><i style="--p:${fraccion}"></i></div>` : ''}
    ${deudaNum > 0 ? `<div class="cyc-deuda"><i class="fa-solid fa-circle-exclamation"></i> Tienes S/ ${escaparHTML(socio.deuda)} pendiente. Págalo en recepción.</div>` : ''}

    <button class="qr-btn-principal cyc-btn" onclick="confirmarAsistenciaQR()">
      <span class="icono-circulo"><i class="fa-solid fa-fingerprint"></i><span class="cyc-scan" aria-hidden="true"></span><b class="spin" aria-hidden="true"></b></span>
      <span class="lbl">Marcar asistencia</span>
    </button>
    ${window.cyCuponesBloque ? cyCuponesBloque(socio.cupones) : ''}

    <div class="qr-secure-line"><i class="fa-solid fa-lock"></i> Registro seguro y rápido</div>
  </div>`;
};
