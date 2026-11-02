// Validación y guardado del formulario de registro de socios.
// Clásico (no módulo): mismo ámbito global y mismo orden que antes.
function rgValidar(d){
  const err = [];
  const lista = (typeof dataGlobal !== 'undefined' && dataGlobal) || [];
  if (!d.dniCrudo.trim()) err.push({ id: 'dni', msg: 'Falta el DNI.' });
  else if (/[^\d\s.-]/.test(d.dniCrudo)) err.push({ id: 'dni', msg: 'El DNI solo lleva números.' });
  else if (d.dni.length < 8 || d.dni.length > 12) err.push({ id: 'dni', msg: 'El DNI debe tener 8 dígitos (carnet de extranjería: 9 a 12). Tiene ' + d.dni.length + '.' });
  else {
    const otro = lista.find(s => cyLimpiarDni(s.dni) === d.dni);
    if (otro) err.push({ id: 'dni', msg: 'Ya existe un socio con este DNI: ' + (otro.nombre || '') + '. Búscalo en Lista para renovarlo.' });
  }
  if (d.nombre.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '').length < 2) err.push({ id: 'nombre', msg: 'Escribe el nombre del socio.' });
  if (!d.telCrudo.trim() && !d.sinWhatsapp) err.push({ id: 'telefono', msg: 'Escribe el celular del socio o marca «No tiene WhatsApp».' });
  if (d.telCrudo.trim() && !d.sinWhatsapp) {
    if (/[^\d\s+()-]/.test(d.telCrudo)) err.push({ id: 'telefono', msg: 'El celular solo lleva números.' });
    else if (!/^9\d{8}$/.test(d.telefono)) err.push({ id: 'telefono', msg: d.telefono.length === 9
      ? 'El celular debe empezar con 9 (ej. 927885791).'
      : 'El celular debe tener 9 dígitos y empezar con 9. Tiene ' + d.telefono.length + '.' });
    else {
      const otro = lista.find(s => cyLimpiarTelefono(s.telefono) === d.telefono);
      if (otro) err.push({ id: 'telefono', msg: 'Este celular ya lo tiene ' + (otro.nombre || 'otro socio') + '. Cada socio necesita su propio número para el QR.' });
    }
  }
  if (!d.tipo.trim()) err.push({ id: 'tipo_memb', msg: 'Escribe o elige un plan.' });
  if (!d.inicio) err.push({ id: 'inicio', msg: 'Falta la fecha de inicio.' });
  if (!d.fin) err.push({ id: 'fin', msg: 'Falta la fecha de vencimiento.' });
  else if (d.inicio && d.fin < d.inicio) err.push({ id: 'fin', msg: 'El vencimiento no puede ser antes del inicio.' });
  const precio = d.precio === '' ? 0 : Number(d.precio);
  const deuda = d.deuda === '' ? 0 : Number(d.deuda);
  if (isNaN(precio) || precio < 0) err.push({ id: 'precio', msg: 'El precio debe ser un monto, por ejemplo 80.' });
  if (isNaN(deuda) || deuda < 0) err.push({ id: 'deuda', msg: 'La deuda debe ser un monto, por ejemplo 20.' });
  else if (precio > 0 && deuda > precio) err.push({ id: 'deuda', msg: 'La deuda no puede ser mayor que el precio (S/ ' + precio + ').' });
  return err;
}

let _guardando = false;

// Texto del botón combinado según si el socio tiene WhatsApp
window.cyCambiarSinWhatsapp = function(){
  const sin = document.getElementById("sinWhatsapp").checked;
  const t = document.getElementById("textoBotonCombo");
  if (t) t.textContent = sin ? "Guardar y descargar comprobante" : "Guardar y enviar comprobante";
  if (sin) document.getElementById("telefono").value = "";
  rgLimpiarErrores();
};

// Botón combinado: guarda al socio y, si se guardó, genera el comprobante
window.guardarConComprobante = function(){
  return guardar({ conComprobante: true });
};

window.guardar = async function(opts){
  if (_guardando) return;
  _guardando = true;
  const conComprobante = !!(opts && opts.conComprobante);
  try{
    const dniCrudo = document.getElementById("dni").value;
    const sinWhatsapp = document.getElementById("sinWhatsapp").checked;
    const telCrudo = sinWhatsapp ? "" : document.getElementById("telefono").value;
    let dni = cyLimpiarDni(dniCrudo);
    let nombre = document.getElementById("nombre").value.trim().replace(/\s+/g, " ");
    let telefono = cyLimpiarTelefono(telCrudo);
    let tipo = document.getElementById("tipo_memb").value.trim();
    let precio = document.getElementById("precio").value;
    let inicio = document.getElementById("inicio").value;
    let fin = document.getElementById("fin").value;
    let deuda = document.getElementById("deuda").value || "0";

    rgLimpiarErrores();
    const errores = rgValidar({ dniCrudo, dni, nombre, telCrudo, telefono, tipo, inicio, fin, precio, deuda: document.getElementById("deuda").value, sinWhatsapp });
    if (errores.length) { rgMostrarErrores(errores); return; }

    // FIX: Cálculo preciso basado en fechas locales evitando desvíos por zona horaria
    const dateInicio = new Date(inicio + "T00:00:00");
    const dateFin = new Date(fin + "T00:00:00");
    let dias = Math.round((dateFin - dateInicio) / 86400000);
    
    if(dias < 0) dias = 0;
    if((tipo || "").toLowerCase().includes("interdiario")) dias = 15;

    const {error} = await supabaseClient
      .from("socios")
      .insert([{
      dni, nombre, telefono,
      tipo_memb: tipo, inicio
      , fecha_fin: fin, deuda
      , precio: parseFloat(precio) || 0,

        fecha_deuda: parseFloat(deuda) > 0 ? fechaHoyISO() : null,
        dias_totales:dias, dias_restantes:dias
      }]);

    if (error) {
      console.error("No se pudo registrar:", error);
      const msg = String(error.message || "") + " " + String(error.details || "");
      if (error.code === "23505" && msg.includes("dni")) {
        rgMostrarErrores([{ id: "dni", msg: "Ya existe un socio con este DNI (se registró hace poco o desde otro celular). Búscalo en Lista." }]);
      } else if (error.code === "23505" && msg.includes("telefono")) {
        rgMostrarErrores([{ id: "telefono", msg: "Este celular ya lo tiene otro socio. Cada socio necesita su propio número para el QR." }]);
      } else if (error.code === "23505") {
        mostrarToast("⚠️ Ya existe un socio con esos datos. Búscalo en Lista.", "#f59e0b");
      } else if (/JWT|jwt/.test(msg) || /^PGRST30/.test(String(error.code || ""))) {
        mostrarToast("🔒 Tu sesión venció. Cierra sesión, vuelve a entrar y toca Guardar otra vez.", "#ef4444");
      } else if (error.code === "42501") {
        mostrarToast("⛔ La base de datos no permitió guardar (no es tu internet). Detalle: " + (error.message || "").slice(0, 80), "#ef4444");
      } else if (error.code === "22P02" || error.code === "22007" || error.code === "22008") {
        mostrarToast("⚠️ Hay un dato con formato inválido (fecha o monto). Revísalos.", "#f59e0b");
      } else if (!error.code || /fetch|network|Failed/i.test(msg)) {
        mostrarToast("📶 Sin internet: el socio NO se guardó. Revisa la conexión y toca Guardar otra vez.", "#ef4444");
      } else {
        mostrarToast("❌ No se guardó: " + (error.message || "error desconocido").slice(0, 90), "#ef4444");
      }
      return;
    }

    mostrarToast("✅ Socio registrado correctamente", "#10b981");
    try{ if(window.cyProspectoProcesado) cyProspectoProcesado(dni); }catch(e){}
    // Comprobante: se genera con los datos del formulario antes de limpiarlo
    if (conComprobante) {
      try { await enviarReciboPremium({ soloDescarga: sinWhatsapp }); }
      catch (eComp) { console.error("Comprobante no generado:", eComp); }
    }
    await render();
    // 📖 REGISTRAR INSCRIPCIÓN EN EL CUADERNO EN VIVO (HOY)
    try {
      let precioVal = parseFloat(precio) || 0;
      let deudaVal = 0;
      
      let campoDeuda = document.getElementById("deuda");
      if (campoDeuda) {
        deudaVal = parseFloat(campoDeuda.value) || 0;
      }

      let pagoRealHoy = precioVal - deudaVal;
      cyCajaGuardar({
        dni: dni || '',
        nombre: nombre || '',
        tipo_memb: tipo || 'Membresía',
        concepto: 'Inscripción inicial',
        monto_ingreso: pagoRealHoy > 0 ? pagoRealHoy : 0,
        deuda_visual: deudaVal
      });

    } catch (errCaja) {
      console.error("Error guardando en cuaderno local:", errCaja);
    }

    document.getElementById("dni").value = "";
    document.getElementById("nombre").value = "";
    document.getElementById("telefono").value = "";
    document.getElementById("tipo_memb").value = "";
    document.getElementById("precio").value = "";
    document.getElementById("inicio").value = "";
    document.getElementById("fin").value = "";
    document.getElementById("deuda").value = "";
    document.getElementById("sinWhatsapp").checked = false;
    window.cyCambiarSinWhatsapp();
  }catch(e){
    alert("Error inesperado");
  } finally {
    _guardando = false;
  }
};

// Búsqueda por DNI: el socio aparece solo cuando están los 8 dígitos.
// La tarjeta muestra su condición, sin botones: el ingreso se marca con la
// flecha (o Enter) del buscador, y solo si el socio está activo.
const DNI_LARGO = 8;

function socioPuedeIngresar(socio){
  const c = scCuerpo(socio);
  return !c.tieneBloqueoDeuda && c.estado === "ACTIVO";
}

// Si no se puede leer la deuda de tienda, no se marca (falla cerrado)
async function resumenTiendaSocio(dni){
  try { return await TD.resumenSocio(dni); } catch(e) { return null; }
}

// La flecha del buscador muestra lo que va a pasar: escribe el DNI (deshabilitada),
// marcar ingreso (check), o no puede ingresar (apagada)
function estadoBotonIngreso(estado){
  const b = document.querySelector("#tab1 .ig-search-btn");
  if(!b) return;
  const config = {
    vacio: { icono: "fa-arrow-right", texto: "Escribe el DNI" },
    listo: { icono: "fa-square-check", texto: "Marcar ingreso" },
    no:    { icono: "fa-ban", texto: "No puede ingresar" }
  }[estado];
  b.innerHTML = `<i class="fa-solid ${config.icono}"></i>`;
  b.title = config.texto;
  b.setAttribute("aria-label", config.texto);
  b.disabled = estado !== "listo";
  b.classList.toggle("ig-listo", estado === "listo");
}

async function traerSocioPorDni(dni){
  const { data, error } = await supabaseClient.from("socios").select("*").eq("dni", dni).single();
  return (error || !data) ? null : data;
}

// Estado que impide ingresar: la misma tarjeta que se muestra en el QR (mismo orden de reglas).
// Devuelve el HTML de la tarjeta, o null si el socio puede ingresar.
function tarjetaEstadoBusqueda(socio, resumen){
  if (resumen && resumen.bloquea) return cyTarjetaBloqueoTienda(socio.nombre, resumen.bloqueos);
  const deuda = parseFloat(socio.deuda || 0);
  if (deuda > 0 && socio.fecha_deuda) {
    const dias = Math.floor((new Date() - new Date(socio.fecha_deuda)) / 86400000);
    if (dias > 7) return pantallaEstado({ icono: "fa-lock", titulo: "ACCESO BLOQUEADO", nombre: socio.nombre,
      texto: `Deuda pendiente: <b>S/ ${escaparHTML(socio.deuda)}</b><br>Regularice su pago para habilitar su acceso.` });
  }
  if (estadoSocio(socio) === "AGOTADO") {
    return pantallaEstado({ icono: "fa-ban", titulo: "MEMBRESÍA AGOTADA", nombre: socio.nombre,
      texto: "Ha consumido todas las asistencias de su plan.<br>Acérquese a recepción para renovar." });
  }
  if (estadoSocio(socio) === "VENCIDO") return pantallaEstado({ icono: "fa-calendar-xmark", titulo: "MEMBRESÍA VENCIDA", nombre: socio.nombre,
    texto: "Su membresía ha vencido por fecha calendario.<br>Acérquese a recepción para renovar." });
  return null;
}

async function mostrarTarjetaBusqueda(socio){
  const div = document.getElementById("resultado");
  if(!div) return;
  const resumen = await resumenTiendaSocio(socio.dni);
  // Si el DNI cambió mientras se consultaba, no se pinta una tarjeta vieja
  const bDni = document.getElementById("buscarDni");
  if(bDni && bDni.value !== String(socio.dni)) return;
  const puede = !!resumen && !resumen.bloquea && socioPuedeIngresar(socio);
  estadoBotonIngreso(puede ? "listo" : "no");
  const estadoHtml = tarjetaEstadoBusqueda(socio, resumen);
  if (estadoHtml) { cyAlertaError(); div.innerHTML = estadoHtml; return; }
  const c = scCuerpo(socio);
  const aviso = !resumen
    ? `<p class="td-error"><i class="fa-solid fa-circle-exclamation"></i> No se pudo verificar la deuda de tienda. Intente de nuevo.</p>`
    : "";
  div.innerHTML = `
  <article class="sc sc--${c.st} sc--ingreso">
    ${c.html}
    ${c.tieneDeuda ? "" : `<div class="sc-deuda no"><span><i class="fa-solid fa-circle-check"></i> Sin deuda de membresía</span><b>S/ 0</b></div>`}
    ${TD.htmlSeccionSocio(resumen)}
    ${aviso}
  </article>`;
}

function mostrarNoEncontradoBusqueda(){
  const div = document.getElementById("resultado");
  estadoBotonIngreso("vacio");
  if(div) div.innerHTML = "<div class='empty-state' style='margin-bottom:16px'><i class='fa-solid fa-user-slash'></i><b>Socio no encontrado</b><span>Revisa el DNI e inténtalo de nuevo.</span></div>";
}

let cyLimpiarBusqueda = null;

window.buscarAutomatico = async function(){
  const input = document.getElementById("buscarDni");
  const div = document.getElementById("resultado");
  if(!input || !div) return;
  if(cyLimpiarBusqueda){ clearTimeout(cyLimpiarBusqueda); cyLimpiarBusqueda = null; }
  input.value = input.value.replace(/\D/g, "").slice(0, DNI_LARGO);
  const dni = input.value;
  if(dni.length < DNI_LARGO){ div.innerHTML = ""; estadoBotonIngreso("vacio"); return; }

  const socio = (dataGlobal || []).find(s => String(s.dni) === dni) || await traerSocioPorDni(dni);
  if(input.value !== dni) return; // el DNI cambió mientras se consultaba
  if(!socio){ mostrarNoEncontradoBusqueda(); return; }
  await mostrarTarjetaBusqueda(socio);
};

window.registrarDesdeBusqueda = async function(){
  const input = document.getElementById("buscarDni");
  if(!input) return;
  const dni = input.value.replace(/\D/g, "");
  if(dni.length < DNI_LARGO) return;

  const socio = (dataGlobal || []).find(s => String(s.dni) === dni) || await traerSocioPorDni(dni);
  if(input.value !== dni) return;
  if(!socio){ mostrarNoEncontradoBusqueda(); return; }
  // Vencido, agotado o bloqueado (membresía o tienda): no se marca, solo queda su tarjeta
  const resumen = await resumenTiendaSocio(socio.dni);
  if(!resumen || resumen.bloquea || !socioPuedeIngresar(socio)){ await mostrarTarjetaBusqueda(socio); return; }
  await asistenciaNueva(socio.dni, socio.dias_restantes, socio);
};

function generarCardSocio(data){
  const c = scCuerpo(data);
  let accion;
  if (c.tieneBloqueoDeuda) {
    // Igual que antes: con deuda de más de 7 días no se ofrece registrar el ingreso
    accion = `<p class="sc-nota"><i class="fa-solid fa-ban"></i> Regularice su pago para habilitar el acceso.</p>`;
  } else {
    const esInterdiario = (data.tipo_memb || "").toLowerCase().includes("interdiario");
    const asistenciasAgotadas = esInterdiario && data.dias_restantes <= 0;
    accion = (c.estado === "ACTIVO" && !asistenciasAgotadas)
      ? `<button class="sc-grande" onclick="asistenciaNueva(${jsAttr(data.dni)}, ${Number(data.dias_restantes) || 0})"><i class="fa-solid fa-square-check"></i> Registrar ingreso</button>`
      : `<button class="sc-grande sc-grande--renovar" onclick="renovar(${jsAttr(data.dni)})"><i class="fa-solid fa-rotate"></i> Renovar membresía</button>`;
  }
  return `
  <article class="sc sc--${c.st} sc--ingreso">
    ${c.html}
    ${c.tieneDeuda ? "" : `<div class="sc-deuda no"><span><i class="fa-solid fa-circle-check"></i> Sin deuda</span><b>S/ 0</b></div>`}
    ${accion}
  </article>`;
}

function mostrarSocio(data){
  const div = document.getElementById("resultado");
  if(div) div.innerHTML = generarCardSocio(data);
}
window.asistenciaNueva = async function(dni, diasRestantesPasados, socioConocido){
  // 🚀 Si ya tenemos el socio completo en memoria (viene del flujo del QR, que
  // ya lo trajo en buscarQR()), lo usamos directo — esto evita volver a pedirle
  // a Supabase el MISMO registro que ya habíamos traído hace un instante.
  let socio = socioConocido || (dataGlobal || []).find(s => s.dni == dni);
  if (!socio) {
    const { data } = await supabaseClient
      .from("socios")
      .select("id, dni, nombre, telefono, tipo_memb, dias_restantes, dias_totales, fecha_fin, inicio, deuda, fecha_deuda, precio")
      .eq("dni", dni)
      .single();
    socio = data;
  }
  if(!socio) return false;

  // 1. VALIDACIÓN DÍAS AGOTADOS
  const esInterdiario = (socio.tipo_memb || "").toLowerCase().includes("interdiario");
  if(esInterdiario && socio.dias_restantes <= 0){
    mostrarTarjetaEstado("🚫 MEMBRESÍA AGOTADA", `<b>${escaparHTML(socio.nombre)}</b><br><br>Ha consumido las 15 asistencias de su plan Interdiario.<br><br>Acérquese a recepción para renovar su membresía.`);
    cyAlertaError();
    return false;
  }

  // 2. VALIDACIÓN VENCIDO POR FECHA
  let estado = estadoSocio(socio);
  if(estado === "VENCIDO"){
    mostrarTarjetaEstado("❌ MEMBRESÍA VENCIDA", "Su membresía ha vencido por fecha calendario.<br><br>Acérquese a recepción para renovarla.");
    cyAlertaError();
    return false;
  }

  if (parseFloat(socio.deuda || 0) > 0 && socio.fecha_deuda) {
    const diasDeuda = Math.floor((new Date() - new Date(socio.fecha_deuda)) / 86400000);
    if (diasDeuda > 7) {
      mostrarTarjetaEstado("🚫 ACCESO BLOQUEADO", `<b>${escaparHTML(socio.nombre)}</b><br><br>💰 Deuda pendiente: <b>S/ ${escaparHTML(socio.deuda)}</b><br><br>Regularice su pago para habilitar su acceso.`, "#ef4444");
      cyAlertaError();
      return false;
    }
  }

  let fechaHoy = fechaHoyISO();

  if(esInterdiario && socio.dias_totales > 15){
    await supabaseClient.from("socios").update({ dias_totales:15, dias_restantes: Math.min(socio.dias_restantes,15) }).eq("dni", socio.dni);
    socio.dias_totales = 15;
    socio.dias_restantes = Math.min(socio.dias_restantes, 15);
  }

  // Formato de 24 horas (HH:MM:SS), igual al que ya usa el registro por QR
  // desde el servidor — así todas las asistencias se ven parejas sin importar
  // si se registraron manualmente o escaneando el código.
  const _ahora = new Date();
  let hora = String(_ahora.getHours()).padStart(2,'0') + ":" +
             String(_ahora.getMinutes()).padStart(2,'0') + ":" +
             String(_ahora.getSeconds()).padStart(2,'0');
  let metodoFinal = window.metodoIngreso || "Manual";
  
  // Guardamos en DB la asistencia
  const nuevosDias = Math.max(0, (socio.dias_restantes || 0) - 1);

  // 🚀 Antes acá se hacía una consulta aparte para preguntar "¿ya tiene
  // asistencia hoy?" (un viaje de red completo) y RECIÉN DESPUÉS se insertaba.
  // Ahora insertamos directo: si ya existe un registro para este dni+fecha,
  // la restricción única de la base de datos (ver índice recomendado) rechaza
  // el insert al instante, y lo interpretamos como "ya registrada" — es a la
  // vez más rápido (un viaje de red menos) y más seguro contra dos escaneos
  // casi simultáneos, porque la decisión final la toma la base de datos, no
  // dos consultas separadas que pueden pisarse entre sí.
  // Primero se guarda la asistencia y SOLO si se guardó se descuenta el día
  // (antes iban en paralelo y un doble escaneo descontaba el día igual).
  const resInsert = await supabaseClient.from("historial_asistencia").insert([{
    nombre: socio.nombre, dni: socio.dni, hora, fecha: fechaHoy, metodo: metodoFinal
  }]);
  if (resInsert.error && (resInsert.error.code === "P0001" || /BLOQUEADO_TIENDA/.test(resInsert.error.message || ""))) {
    mostrarToast("🚫 Deuda de tienda pendiente: no se registró la asistencia", "#ef4444");
    await mostrarTarjetaBusqueda(socio);
    return false;
  }
  if (!resInsert.error) {
    await supabaseClient.from("socios").update({ dias_restantes: nuevosDias }).eq("dni", dni);
  }

  // Si el insert falló (ya sea por doble escaneo casi simultáneo, o porque
  // ya había marcado antes hoy), lo tratamos como "ya registrada" en vez de
  // mostrar un éxito falso.
  if (resInsert && resInsert.error && resInsert.error.code !== '23505') {
    console.error("No se pudo registrar la asistencia:", resInsert.error);
    mostrarToast("❌ No se registró la asistencia. Revisa el internet e inténtalo de nuevo", "#ef4444");
    return false;
  }
  if (resInsert && resInsert.error) {
    console.warn("No se pudo registrar la asistencia (posiblemente ya registrada hoy, o doble escaneo casi simultáneo):", resInsert.error);
    mostrarTarjetaEstado("⚠️ ASISTENCIA YA REGISTRADA",
      `<b>${escaparHTML(socio.nombre)}</b><br><br>Tu asistencia de hoy ya fue registrada.<br><br>💪 ¡Nos vemos en tu próximo entrenamiento!`,
      "#f59e0b"
    );
    playSound("VENCIDO");
    setTimeout(() => { mostrarTarjetaBusqueda(socio); }, 2000);
    return false;
  }

  // Actualizamos el objeto local en memoria al instante
  socio.dias_restantes = nuevosDias;
  estadoBotonIngreso("vacio");

  // 🚀 TAREAS EN SEGUNDO PLANO (Sin await para no demorar la respuesta en pantalla)
  window.metodoIngreso = null;
  playSound("ACTIVO");

  // El panel de Lista/Historial solo existe en el dashboard de administración —
  // en la pantalla pública del QR (donde escanea el socio) ni siquiera está en
  // la página, así que actualizarlo ahí sería descargar TODA la lista de socios
  // y el historial del día para nada, cada vez más pesado cuantos más socios
  // tengas. Solo lo hacemos si de verdad estamos en el panel de admin.
  if (!document.documentElement.classList.contains("qr-mode")) {
    if (window.cyConfirmarIngreso) window.cyConfirmarIngreso(socio.nombre);
    mostrarHistorial();
    render();
  }

  // La confirmación es la pantalla animada de cyConfirmarIngreso (arriba). Aquí solo se
  // limpia la búsqueda tras un momento, igual que antes.
  const resDiv = document.getElementById("resultado");
  if(resDiv) {
    if (cyLimpiarBusqueda) clearTimeout(cyLimpiarBusqueda);
    cyLimpiarBusqueda = setTimeout(()=>{
      const bDni = document.getElementById("buscarDni");
      if(bDni) bDni.value="";
      resDiv.innerHTML="";
      estadoBotonIngreso("vacio");
      cyLimpiarBusqueda = null;
    },2500);
  }

  return true;
};

async function mostrarHistorial(){
  let fechaHoy = fechaHoyISO();
  const {data,error} = await supabaseClient.from("historial_asistencia").select("*").eq("fecha", fechaHoy).order("id",{ascending:false});
  
  if(error) {
    console.error(error);
    return;
  }
  historialGlobal = Array.isArray(data) ? data : [];
  let html = "";
  const contenedorHistorial = document.getElementById("historial");

  if(!contenedorHistorial) return;

  if(historialGlobal.length === 0){
    contenedorHistorial.innerHTML = "<div class='empty-state' style='margin:0'><i class='fa-solid fa-door-open'></i><b>Aún no hay ingresos hoy</b><span>Los ingresos aparecerán aquí apenas se registren.</span></div>";
    return;
  }

  const nQR = historialGlobal.filter(h => h.metodo === "QR").length;
  const horaCorta = (h) => String(h || "").slice(0, 5) || "—";
  html += `
  <div class="ig-stats">
    <div><b>${historialGlobal.length}</b><span>${historialGlobal.length === 1 ? "Ingreso" : "Ingresos"}</span></div>
    <div><b>${nQR}</b><span>Por QR</span></div>
    <div><b>${historialGlobal.length - nQR}</b><span>Manual</span></div>
    <div><b>${escaparHTML(horaCorta(historialGlobal[0].hora))}</b><span>Último</span></div>
  </div>`;
  historialGlobal.forEach(h=>{
    const esQR = h.metodo === "QR";
    const inicial = String(h.nombre || "?").trim().charAt(0).toUpperCase();
    html += `
    <div class="act-item ig-row">
      <div class="sc-av" aria-hidden="true">${escaparHTML(inicial)}</div>
      <div class="act-main">
        <div class="act-name">${escaparHTML(h.nombre)}</div>
        <div class="ig-met ${esQR ? "qr" : "manual"}"><i class="fa-solid ${esQR ? "fa-qrcode" : "fa-hand-pointer"}"></i>${esQR ? "Con QR" : "Manual"}</div>
      </div>
      <b class="ig-hora">${escaparHTML(horaCorta(h.hora))}</b>
    </div>`;
  });

  contenedorHistorial.innerHTML = html;
}

// Trae TODOS los socios en bloques de 1000 (Supabase entrega máximo 1000 por
// consulta: pasando ese número, los demás no aparecían). Si falla el internet,
// se conserva la lista que ya se tenía en vez de dejarla vacía.
async function actualizarSocios(){
  const BLOQUE = 1000;
  let todos = [];
  for (let desde = 0; ; desde += BLOQUE) {
    const { data, error } = await supabaseClient.from("socios").select("*")
      .order("id", { ascending: true }).range(desde, desde + BLOQUE - 1);
    if (error) { console.warn("No se pudo actualizar la lista de socios:", error); return dataGlobal; }
    todos = todos.concat(data || []);
    if (!data || data.length < BLOQUE) break;
  }
  dataGlobal = todos;
  return dataGlobal;
}

async function render(){
  try{
    await actualizarSocios();
    filtrarLista(); 
    actualizarDashboard();
  }catch(e){
    console.error("Render error:", e);
  }
}

window.cambiarFiltroEstado = function(estado) {
  filtroEstadoActual = estado;
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  
  if(estado === 'todos') document.getElementById('filter-all').classList.add('active');
  if(estado === 'ACTIVO') document.getElementById('filter-activo').classList.add('active');
  if(estado === 'VENCIDO') document.getElementById('filter-vencido').classList.add('active');
  if(estado === 'DEUDORES') document.getElementById('filter-deuda').classList.add('active');
  if(estado === 'POR_AVISAR') document.getElementById('filter-avisar').classList.add('active');
  
  filtrarLista();
};

// Parte común de la tarjeta de socio (lista y pestaña Ingreso):
// estado por color, encabezado, plan, fechas, asistencias y deuda.
const _scMES = ["ene","feb","mar","abr","may","jun","jul","ago","set","oct","nov","dic"];
function scCuerpo(s){
  const _hoy0 = new Date(); _hoy0.setHours(0,0,0,0);
  const fechaCorta = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
    if (!m) return "—";
    return m[3] + " " + _scMES[+m[2] - 1] + (+m[1] !== _hoy0.getFullYear() ? " " + m[1].slice(2) : "");
  };
  let estado = estadoSocio(s);
  const fin = new Date((s.fecha_fin || "") + "T00:00:00");
  const ini = new Date((s.inicio || "") + "T00:00:00");
  const diasDiff = isNaN(fin) ? null : Math.round((fin - _hoy0) / 86400000);
  const total = Number(s.dias_totales) || 0;
  const usadas = total ? Math.max(0, total - (Number(s.dias_restantes) || 0)) : 0;
  let avance = 0;
  if (!isNaN(fin) && !isNaN(ini) && fin > ini) avance = Math.min(1, Math.max(0, (_hoy0 - ini) / (fin - ini)));

  let diasDeuda = s.fecha_deuda ? Math.floor((new Date() - new Date(s.fecha_deuda)) / 86400000) : 0;
  let tieneDeuda = parseFloat(s.deuda || 0) > 0;
  let tieneBloqueoDeuda = tieneDeuda && diasDeuda > 7;

  // Estado visual (solo color; no cambia ninguna regla)
  let st = "activo", etiqueta = "Activo";
  if (tieneBloqueoDeuda) { st = "bloqueado"; etiqueta = "Bloqueado"; }
  else if (estado === "VENCIDO") { st = "vencido"; etiqueta = "Vencido"; }
  else if (estado === "AGOTADO") { st = "agotado"; etiqueta = "Agotado"; }
  else if (tieneDeuda) { st = "deuda"; etiqueta = "Con deuda"; }

  let quedan;
  if (diasDiff === null) quedan = `<b>—</b>`;
  else if (diasDiff < 0) quedan = `<b class="mal">Venció</b><small>hace ${-diasDiff} ${-diasDiff === 1 ? "día" : "días"}</small>`;
  else if (diasDiff === 0) quedan = `<b class="warn">Hoy</b><small>último día</small>`;
  else quedan = `<b class="${diasDiff <= 5 ? "warn" : ""}">${diasDiff} ${diasDiff === 1 ? "día" : "días"}</b>`;

  return { estado, st, tieneDeuda, tieneBloqueoDeuda, html: `
      <header class="sc-head">
      <div class="sc-av" aria-hidden="true">${escaparHTML(String(s.nombre || "?").trim().charAt(0).toUpperCase())}</div>
      <div class="sc-id">
        <h4>${escaparHTML(s.nombre)}</h4>
        <span>DNI ${escaparHTML(s.dni)}</span>
      </div>
      <span class="sc-badge"><i aria-hidden="true"></i>${etiqueta}</span>
    </header>

    ${tieneBloqueoDeuda ? `<div class="sc-alerta"><i class="fa-solid fa-triangle-exclamation"></i> Acceso bloqueado: deuda de más de 7 días</div>` : ""}

    <div class="sc-plan"><i class="fa-solid fa-id-card"></i><span>${escaparHTML(String(s.tipo_memb || "Mensual").trim())}</span></div>

    <div class="sc-stats">
      <div><span>Vence</span><b>${fechaCorta(s.fecha_fin)}</b><small>desde ${fechaCorta(s.inicio)}</small></div>
      <div><span>Quedan</span>${quedan}</div>
      <div><span>Asistencias</span><b>${total ? usadas + `<i>/${total}</i>` : "—"}</b></div>
    </div>
    <div class="sc-bar" title="Avance del periodo"><i style="--p:${avance.toFixed(3)}"></i></div>

    ${tieneDeuda ? `<div class="sc-deuda si"><span><i class="fa-solid fa-sack-dollar"></i> Deuda pendiente</span><b>S/ ${escaparHTML(s.deuda)}</b></div>` : ""}

` };
}

function mostrarLista(data){
  let html = "";
  let listado = data || [];
  listado.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  if(listado.length === 0){
    const lDiv = document.getElementById("lista");
    if(lDiv) lDiv.innerHTML = "<div class='empty-state'><i class='fa-solid fa-magnifying-glass'></i><b>No hay socios con estos filtros</b><span>Prueba con otro nombre o DNI, o cambia el filtro de estado.</span></div>";
    return;
  }

  listado.forEach(s => {
    const c = scCuerpo(s);
    const estado = c.estado, st = c.st;

    // --- LIMPIEZA DEL TELÉFONO ---
    let telfLimpio = (s.telefono || "").replace(/\D/g, '');
    if (telfLimpio && !telfLimpio.startsWith("51")) {
      telfLimpio = "51" + telfLimpio; // Prefijo de Perú por defecto
    }

    // --- MENSAJE DINÁMICO REVISADO Y ATRACTIVO ---
    let textoMensaje = "";
    if (estado === "ACTIVO") {
      // Mensaje estándar para socios Activos
      textoMensaje = `🏋️ C&Y FITNESS GYM\n\n¡Hola ${s.nombre}! Te saludamos del gimnasio para recordar que tu plan actual es: ${s.tipo_memb || 'Mensual'}. Vence el ${s.fecha_fin || '--'}. 💪🔥`;
    } else {
      // Mensaje persuasivo y vendedor para socios Vencidos
      textoMensaje = `🏋️ C&Y FITNESS GYM\n\n¡Hola ${s.nombre}! 👋 Extrañamos tu energía en la sala. Te escribimos para recordarte que tu membresía venció el pasado *${s.fecha_fin || '--'}* 🗓️.\n\n¡No queremos que pierdas tu progreso ni dejes a medias tus objetivos! 🚀 Por eso, te otorgamos un *DESCUENTO ESPECIAL DEL 15%* en tu nueva renovación. 🎁✨\n\n💡 _Para mantener este beneficio en el futuro y asegurar tu tarifa preferencial, recuerda seguir realizando tus pagos de manera puntual._\n\n⏳ *¡Atención!* Esta oportunidad es exclusiva y válida únicamente dentro de los próximos *7 días* a partir de hoy. \n\n¡Te esperamos de vuelta para seguir entrenando con todo! 💪🔥 Escríbenos para asegurar tu cupo.`;
    }

    let msjWsp = encodeURIComponent(textoMensaje);
    let urlWsp = telfLimpio ? `https://wa.me/${telfLimpio}?text=${msjWsp}` : '#';

    const accionPrincipal = estado === "ACTIVO"
      ? `<button class="sc-btn sc-btn--deuda" onclick="editarDeuda(${jsAttr(s.dni)})" title="Ver y cobrar la deuda"><i class="fa-solid fa-hand-holding-dollar ic-deuda"></i><span>Deuda</span></button>`
      : `<button class="sc-btn sc-btn--renovar" onclick="renovar(${jsAttr(s.dni)})" title="Renovar membresía"><i class="fa-solid fa-rotate"></i><span>Renovar</span></button>`;

    html += `
    <article class="sc sc--${st}">
      ${c.html}
      <footer class="sc-acc">
        ${accionPrincipal}
        <button class="sc-btn sc-btn--adel" onclick="adelantarMembresia(${jsAttr(s.dni)})" title="Adelantar membresía"><i class="fa-solid fa-forward ic-adel"></i><span>Adelantar</span></button>
        <button class="sc-btn sc-btn--wsp" onclick="${telfLimpio ? `window.open(${jsAttr(urlWsp)}, '_blank')` : "mostrarToast('⚠️ Socio sin número válido', '#f59e0b')"}" title="Abrir WhatsApp"><i class="fa-brands fa-whatsapp ic-wsp"></i><span>WhatsApp</span></button>
        <button class="sc-btn sc-btn--edit" data-solo-admin onclick="abrirModalEditarSocio(${jsAttr(s.dni)})" title="Editar datos del socio"><i class="fa-solid fa-pen-to-square ic-edit"></i><span>Editar</span></button>
        <button class="sc-btn sc-btn--peligro" data-solo-admin onclick="eliminar(${jsAttr(s.dni)})" title="Eliminar socio"><i class="fa-solid fa-trash-can"></i><span>Eliminar</span></button>
      </footer>
    </article>`;
  });

  const lDiv = document.getElementById("lista");
  if(lDiv) lDiv.innerHTML = html;
}

// Fecha ISO (YYYY-MM-DD) de hoy + N días, con la hora local del dispositivo
// (igual de criterio que fechaHoyISO(), sin tocarla) — la usa "Por Avisar".
function fechaISOOffset(diasOffset){
  const d = new Date();
  d.setDate(d.getDate() + diasOffset);
  const año = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${año}-${mes}-${dia}`;
}

// Actualiza el contador de la pastilla "Por Avisar" (cuántos socios vencen
// mañana y todavía NO fueron avisados hoy) — se recalcula solo, sin tarea
// programada, cada vez que se refresca la lista de socios.
function actualizarContadorPorAvisar(){
  const badge = document.getElementById("contadorPorAvisar");
  if (!badge) return;
  const mañana = fechaISOOffset(1);
  const hoy = fechaISOOffset(0);
  const pendientes = (dataGlobal || []).filter(s =>
    s.fecha_fin === mañana && s.ultimo_aviso_vencimiento !== hoy
  );
  badge.textContent = pendientes.length;
}

// Números de cada filtro (misma lógica que el filtrado de abajo)
function actualizarConteosFiltros(){
  const d = dataGlobal || [];
  let act = 0, ven = 0, deu = 0;
  d.forEach(s => {
    const e = estadoSocio(s);
    if (e === "ACTIVO") act++; else if (e === "VENCIDO") ven++;
    const m = parseFloat(s.deuda); if (!isNaN(m) && m > 0) deu++;
  });
  const put = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n; };
  put("cnt-todos", d.length); put("cnt-activo", act); put("cnt-vencido", ven); put("cnt-deuda", deu);
}

window.filtrarLista = function(){
  let v = document.getElementById("buscadorLista").value.toLowerCase();
  
  let filtrados = (dataGlobal || []).filter(s =>
    (s.nombre || "").toLowerCase().includes(v) ||
    (s.dni || "").includes(v)
  );

  actualizarContadorPorAvisar();
  actualizarConteosFiltros();

  if (filtroEstadoActual === 'POR_AVISAR') {
    mostrarListaPorAvisar(filtrados);
    return;
  }

  if(filtroEstadoActual !== 'todos') {
    if (filtroEstadoActual === 'DEUDORES') {
      filtrados = filtrados.filter(s => {
        const montoDeuda = parseFloat(s.deuda);
        return !isNaN(montoDeuda) && montoDeuda > 0;
      });
    } else {
      filtrados = filtrados.filter(s => estadoSocio(s) === filtroEstadoActual);
    }
  }

  mostrarLista(filtrados);
};

// Pantalla compacta de "Por Avisar": solo nombre + "Vence mañana" + botón de
// WhatsApp. Los ya avisados hoy bajan a su propia sub-sección, atenuados.
// Convierte "YYYY-MM-DD" a "DD/MM/YYYY" para mostrar y mandar por WhatsApp.
function formatearFechaBonita(iso){
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function mostrarListaPorAvisar(data){
  const lDiv = document.getElementById("lista");
  if (!lDiv) return;

  const mañana = fechaISOOffset(1);
  const hoy = fechaISOOffset(0);
  const mañanaBonita = formatearFechaBonita(mañana);
  const candidatos = (data || []).filter(s => s.fecha_fin === mañana);
  const pendientes = candidatos.filter(s => s.ultimo_aviso_vencimiento !== hoy);
  const avisados = candidatos.filter(s => s.ultimo_aviso_vencimiento === hoy);

  if (candidatos.length === 0) {
    lDiv.innerHTML = "<div class='empty-state'><i class='fa-solid fa-bell-slash'></i><b>Nadie vence mañana</b><span>Cuando alguien esté por vencer, aparecerá aquí para avisarle por WhatsApp.</span></div>";
    return;
  }

  // padding-bottom extra para que la barra de navegación inferior (fija) no
  // tape la última tarjeta cuando la lista es corta.
  let html = `<div style="grid-column:1/-1; display:flex; flex-direction:column; gap:10px; padding-bottom:110px;">`;

  pendientes.forEach(s => {
    html += `
    <div class="pa-row">
      <div class="sc-av" aria-hidden="true">${escaparHTML(String(s.nombre || "?").trim().charAt(0).toUpperCase())}</div>
      <div class="pa-main">
        <b>${escaparHTML(s.nombre)}</b>
        <span><i class="fa-regular fa-clock"></i> Vence mañana, ${mañanaBonita}</span>
      </div>
      <button class="pa-wsp" onclick="enviarAvisoVencimiento(${jsAttr(s.dni)})" title="Avisar por WhatsApp" aria-label="Avisar por WhatsApp"><i class="fa-brands fa-whatsapp"></i></button>
    </div>`;
  });

  if (avisados.length > 0) {
    html += `<div class="pa-sep">Ya avisados hoy</div>`;
    avisados.forEach(s => {
      html += `
      <div class="pa-row hecho">
        <div class="sc-av" aria-hidden="true">${escaparHTML(String(s.nombre || "?").trim().charAt(0).toUpperCase())}</div>
        <div class="pa-main">
          <b>${escaparHTML(s.nombre)}</b>
          <span><i class="fa-regular fa-clock"></i> Vence mañana, ${mañanaBonita}</span>
        </div>
        <span class="pa-ok"><i class="fa-solid fa-check"></i> Enviado</span>
      </div>`;
    });
  }

  html += `</div>`;
  lDiv.innerHTML = html;
}

// Al tocar el botón de WhatsApp en "Por Avisar": abre el chat con el mensaje
// exacto, y guarda en Supabase (nunca en localStorage) que ya se avisó hoy —
// así se ve igual para cualquier administrador que entre a este panel.
window.enviarAvisoVencimiento = async function(dni){
  const socio = (dataGlobal || []).find(s => s.dni === dni);
  if (!socio) return;

  let telfLimpio = (socio.telefono || "").replace(/\D/g, '');
  if (telfLimpio && !telfLimpio.startsWith("51")) {
    telfLimpio = "51" + telfLimpio;
  }
  if (!telfLimpio) {
    mostrarToast('⚠️ Socio sin número válido', '#f59e0b');
    return;
  }

  const fechaVence = formatearFechaBonita(socio.fecha_fin || fechaISOOffset(1));
  const plan = socio.tipo_memb || "tu plan";

  const mensaje = `Hola *${socio.nombre}* 👋, te saludamos de *C&Y Fitness Gym* para recordarte que mañana *${fechaVence}* es tu último día de vigencia de tu membresía (*${plan}*).

🎁 *Beneficios por renovar a tiempo:*

1️⃣ Renueva tu membresía anticipadamente y obtén hasta *10% de descuento* por renovación anticipada en el plan Mensual o Personalizado (aplica solo para esos planes).

2️⃣ Tus próximas renovaciones en el plan Mensual te dan el beneficio de traer *1 invitado* para que ingrese gratis por un día.

3️⃣ Si tu invitado se inscribe, recibes *+3 días adicionales* en tu membresía — ¡acumulables por cada nuevo miembro que invites!

4️⃣ Tu invitado, al inscribirse, obtiene un *descuento de bienvenida de hasta 10%* en el plan Mensual o Personalizado, y también podrá traer su propio invitado libre por un día.

💪 ¡Qué esperas! *Renueva, invita, ganas tú y gana tu invitado* 💪`;

  const url = `https://wa.me/${telfLimpio}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank');

  const hoy = fechaISOOffset(0);
  const { error } = await supabaseClient.from("socios").update({ ultimo_aviso_vencimiento: hoy }).eq("dni", dni);
  if (error) {
    console.error("No se pudo guardar el aviso de vencimiento:", error);
    return;
  }

  // Reflejamos el cambio al instante en esta pantalla (y por la suscripción
  // en tiempo real que ya existe, también se va a reflejar en otros
  // administradores que tengan el panel abierto).
  socio.ultimo_aviso_vencimiento = hoy;
  filtrarLista();
};

let _editandoDeuda = false;
window.editarDeuda = function(dni){
  if (window.TD) return TD.abrirDeuda(dni);
};

window.eliminar = async function(dni){
  if(!confirm("¿Seguro que deseas eliminar permanentemente a este socio del sistema?")) return;
  let error = null;
  try { ({ error } = await supabaseClient.from("socios").delete().eq("dni",dni)); } catch (e) { error = e; }
  if (error) { console.error("No se pudo eliminar:", error); mostrarToast("❌ No se eliminó. Revisa el internet", "#ef4444"); return; }
  mostrarToast("✅ Socio eliminado", "#10b981");
  await render();
};

function showTab(n,event){
    document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
    document.querySelectorAll(".tabbtn").forEach(b=>b.classList.remove("active"));
    
    const targetPanel = document.getElementById("tab"+n);
    if(targetPanel) targetPanel.classList.add("active");

    if(event && event.currentTarget) event.currentTarget.classList.add("active");
    
    const dash = document.querySelector(".dashboard");
    if(dash) {
    dash.style.display = (n===1 || n===2 || n===4 || n===5 || n===6) ? "none" : "grid";

    }
    if(n===3) render();
    if(n===6 && window.TD) TD.montar();
    if(n===2 && window.cyCargarProspectos) { try{ cyCargarProspectos(); }catch(e){} }
}

const initialDash = document.querySelector(".dashboard");
if(initialDash) initialDash.style.display="none";

// 🔒 SEGURIDAD: en la vista pública del QR (check-in de socios) NO cargamos
// la base completa de socios ni el historial del día, y NO abrimos las
// conexiones en tiempo real. Esa vista solo necesita buscar a la persona
// puntual que está marcando su asistencia — nada más.
const esVistaPublicaQR = document.documentElement.classList.contains("qr-mode");

if (!esVistaPublicaQR) {
  render();
  mostrarHistorial();

  // Evita reconstruir la lista completa varias veces seguidas si llegan varios
  // cambios juntos (ej. varias personas marcando asistencia al mismo tiempo).
  // Espera un momentito y agrupa todos los cambios en una sola actualización.
  let temporizadorRender = null;
  function renderConPausa() {
    clearTimeout(temporizadorRender);
    temporizadorRender = setTimeout(render, 400);
  }
  let temporizadorHistorial = null;
  function historialConPausa() {
    clearTimeout(temporizadorHistorial);
    temporizadorHistorial = setTimeout(mostrarHistorial, 400);
  }

  // ===== TIEMPO REAL QUE NO SE QUEDA ATRÁS =====
  // Antes los canales se abrían al cargar, ANTES de tener la sesión: la base
  // los trataba como anónimos y no mandaba los ingresos. Además, al bloquear
  // el celular la conexión se cortaba y no volvía. Ahora:
  //  1. Se conecta con la sesión del personal y se reconecta solo si se cae.
  //  2. Al volver a la app (desbloquear, cambiar de app) se pone al día al instante.
  //  3. Cuando llega una notificación push, la lista se actualiza también.
  //  4. Respaldo: cada 20 s revisa si hay un ingreso nuevo (consulta mínima).
  const CANALES = [
    { nombre: 'socios-realtime', tabla: 'socios', alCambiar: () => renderConPausa() },
    { nombre: 'intentos-realtime', tabla: 'intentos_ingreso', alCambiar: (p) => {
        if (p && p.eventType === 'INSERT' && p.new) document.dispatchEvent(new CustomEvent('cy-intento', { detail: p.new }));
      } },
    { nombre: 'asistencia-realtime', tabla: 'historial_asistencia', alCambiar: (p) => {
        historialConPausa();
        if (p && p.eventType === 'INSERT' && p.new) document.dispatchEvent(new CustomEvent('cy-ingreso', { detail: p.new }));
      } }
  ];
  const canales = {};
  let reintentoRT = null, ultimoTokenRT = null;

  async function conectarTiempoReal(){
    let sesion = null;
    try { ({ data: { session: sesion } } = await supabaseClient.auth.getSession()); } catch(e){}
    if (!sesion) return;
    if (sesion.access_token !== ultimoTokenRT) {
      ultimoTokenRT = sesion.access_token;
      try { await supabaseClient.realtime.setAuth(sesion.access_token); } catch(e){}
    }
    CANALES.forEach(def => {
      const c = canales[def.nombre];
      if (c && (c.state === 'joined' || c.state === 'joining')) return;
      if (c) { try { supabaseClient.removeChannel(c); } catch(e){} }
      canales[def.nombre] = supabaseClient.channel(def.nombre)
        .on('postgres_changes', { event: '*', schema: 'public', table: def.tabla }, def.alCambiar)
        .subscribe((estado) => {
          if (estado === 'SUBSCRIBED') { if (def.tabla === 'historial_asistencia') historialConPausa(); }
          else if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT' || estado === 'CLOSED') {
            clearTimeout(reintentoRT);
            reintentoRT = setTimeout(conectarTiempoReal, 3000);
          }
        });
    });
  }
  window.cyConectarTiempoReal = conectarTiempoReal;

  // Respaldo liviano: ¿hay un ingreso más nuevo que el último que vimos?
  let ultimoIngresoVisto = null;
  async function revisarIngresosNuevos(){
    try {
      const { data, error } = await supabaseClient.from('historial_asistencia')
        .select('id').eq('fecha', fechaHoyISO()).order('id', { ascending: false }).limit(1);
      if (error) return;
      const id = data && data[0] ? data[0].id : 0;
      if (ultimoIngresoVisto !== null && id !== ultimoIngresoVisto) historialConPausa();
      ultimoIngresoVisto = id;
    } catch(e){}
  }

  let ocultoDesde = 0;
  function ponerseAlDia(){
    historialConPausa();
    if (ocultoDesde && Date.now() - ocultoDesde > 60000) renderConPausa();
    ocultoDesde = 0;
    conectarTiempoReal();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') ponerseAlDia(); else ocultoDesde = Date.now();
  });
  window.addEventListener('online', ponerseAlDia);
  window.addEventListener('pageshow', (e) => { if (e.persisted) ponerseAlDia(); });
  supabaseClient.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_IN' || evento === 'TOKEN_REFRESHED' || evento === 'INITIAL_SESSION') conectarTiempoReal();
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.tipo === 'cy-push') { historialConPausa(); document.dispatchEvent(new CustomEvent('cy-push', { detail: e.data })); }
    });
  }
  setInterval(() => { if (document.visibilityState === 'visible') { revisarIngresosNuevos(); conectarTiempoReal(); } }, 20000);
  conectarTiempoReal();
  revisarIngresosNuevos();
}

window.resetHistorial = async function(){
  if(!confirm("¿Seguro que quieres borrar el historial del día?")) return;
  // Solo las asistencias de HOY (antes borraba el historial completo)
  const { error } = await supabaseClient.from("historial_asistencia").delete().eq("fecha", fechaHoyISO());
  if(error){
    alert("Error al borrar historial");
    return;
  }
  historialGlobal = [];
  const histBox = document.getElementById("historial");
  if(histBox) histBox.innerHTML = "";
  mostrarToast("🗑️ Historial eliminado correctamente", "#10b981");
};

window.actualizarSistema = async function(){
  const btn = document.getElementById("btnActualizar");
  if(btn) {
    btn.disabled = true;
    btn.classList.add("girando");
  }

  mostrarToast("⚡ Sincronizando información...", "#3b82f6");
  await render();
  await new Promise(resolve => setTimeout(resolve, 500));
  await mostrarHistorial();
  mostrarToast("✅ Sistema actualizado correctamente", "#10b981");

  setTimeout(()=>{
    if(btn) {
      btn.disabled = false;
      btn.classList.remove("girando");
    }
  },1000);
};
