// Recibo premium del panel.
// Clásico (no módulo): mismo ámbito global y mismo orden que antes.
let _reciboOcupado = false;
async function enviarReciboPremium(){
  if (_reciboOcupado) return; // evita toques repetidos mientras se genera
  let telefono = document.getElementById("telefono").value;
  let nombre = document.getElementById("nombre").value;
  let dni = document.getElementById("dni").value;
  let tipo = document.getElementById("tipo_memb").value;
  let precio = document.getElementById("precio").value;
  let inicio = document.getElementById("inicio").value;
  let fin = document.getElementById("fin").value;

  if(!telefono){
    mostrarToast("📱 Ingrese un número de WhatsApp", "#f59e0b");
    return;
  }

  _reciboOcupado = true;
  const btn = document.querySelector(".cy-act-wa");
  if (btn) { btn.disabled = true; btn.style.opacity = ".75"; }
  mostrarToast("⏳ Preparando comprobante…", "#3b82f6");

  // Número y mensaje listos ANTES del trabajo pesado
  telefono = telefono.replace(/\D/g,'');
  if(telefono.startsWith("51")) telefono = telefono.substring(2);
  const mensaje = `🏋️ C&Y FITNESS GYM\n\nHola ${nombre}\n\nTu recibo / comprobante está por enviarse en un momento.\n\n💪 Gracias por confiar en nosotros y entrenar en nuestro gimnasio`;
  const texto = encodeURIComponent(mensaje);
  const urlWeb = `https://wa.me/51${telefono}?text=${texto}`;
  const urlApp = `whatsapp://send?phone=51${telefono}&text=${texto}`;
  const esMovil = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  try {
    document.getElementById("vNombre").innerText = nombre;
    document.getElementById("vDni").innerText = dni;
    document.getElementById("vTipo").innerText = tipo;
    document.getElementById("vPrecio").innerText = "S/ " + (precio || "0");
    const fechaPe = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? m[3] + "/" + m[2] + "/" + m[1] : (iso || "—"); };
    document.getElementById("vInicio").innerText = fechaPe(inicio);
    document.getElementById("vFin").innerText = fechaPe(fin);

    const ahora = new Date();
    const fechaCodigo = ahora.getFullYear().toString() + String(ahora.getMonth()+1).padStart(2,"0") + String(ahora.getDate()).padStart(2,"0");
    const numero = String(Date.now()).slice(-4);
    document.getElementById("vCodigo").innerText = "CY-" + fechaCodigo + "-" + numero;
    document.getElementById("vFecha").innerText = new Date().toLocaleString("es-PE", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit", hour12:false, timeZone:"America/Lima" });

    let voucher = document.getElementById("voucher");
    voucher.style.opacity = "1";
    let img = null;
    try {
      // Solo se procesa el comprobante (se ignora el resto de la página) y a 2x: rápido y nítido
      const canvas = await html2canvas(voucher, {
        scale: 2, logging: false, useCORS: true, backgroundColor: "#ffffff",
        ignoreElements: (el) => {
          const t = el.tagName;
          if (t === "STYLE" || t === "LINK" || t === "HEAD" || t === "META" || t === "TITLE") return false;
          if (el === document.documentElement || el === document.body) return false;
          return !(voucher.contains(el) || el.contains(voucher));
        }
      });
      img = canvas.toDataURL("image/png");
    } finally {
      voucher.style.opacity = "0";
    }

    // Descarga del comprobante. Dentro de la app Android la descarga normal no funciona:
    // la app lo guarda en Descargas.
    const nombreArchivo = `voucher-${dni}-${numero}.png`;
    if (window.AndroidApp) {
      // En la app: se guarda en Descargas y se abre WhatsApp con la imagen adjunta
      const listo = window.AndroidApp.compartirComprobante(img, nombreArchivo, mensaje, "51" + telefono);
      mostrarToast(listo ? "✅ Se abrió el chat del socio. Adjunta el comprobante de Descargas y envía" : "⚠️ No se pudo preparar el comprobante", listo ? "#10b981" : "#ef4444");
      return;
    } else {
      const a = document.createElement("a");
      a.href = img;
      a.download = nombreArchivo;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { if (a.parentNode) a.parentNode.removeChild(a); }, 100);
    }

    // Abrir WhatsApp enseguida: en celular directo a la app, con respaldo a la web
    setTimeout(() => {
      if (esMovil) {
        window.location.href = urlApp;
        setTimeout(() => { if (!document.hidden) window.open(urlWeb, "_blank"); }, 1800);
      } else {
        window.open(urlWeb, "_blank");
      }
    }, 250);
  } catch (e) {
    console.error("Error generando comprobante:", e);
    mostrarToast("⚠️ No se pudo generar el comprobante, abriendo WhatsApp…", "#f59e0b");
    window.open(urlWeb, "_blank");
  } finally {
    setTimeout(() => {
      _reciboOcupado = false;
      if (btn) { btn.disabled = false; btn.style.opacity = ""; }
    }, 1500);
  }
}


function actualizarDashboard(){
  let listado = dataGlobal || [];
  let total = listado.length;
  let activos = listado.filter(s => estadoSocio(s) === "ACTIVO").length;
  // "Vencidos" agrupa VENCIDO y AGOTADO para que Activos + Vencidos = Total de socios
  let vencidos = listado.filter(s => estadoSocio(s) !== "ACTIVO").length;
  let deuda = listado.reduce((sum,s)=> sum + (parseFloat(s.deuda)||0), 0);

  const tSocios = document.getElementById("totalSocios");
  const act = document.getElementById("activos");
  const ven = document.getElementById("vencidos");
  const dTotal = document.getElementById("deudaTotal");

  const reducir = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const aplicarConPop = (el, valor, etiqueta, prefijo) => {
    if (!el) return;
    prefijo = prefijo || "";
    const clave = valor + "|" + etiqueta;
    if (el.dataset.v === clave) return;
    const previo = parseFloat(el.dataset.n || "0") || 0;
    el.dataset.v = clave;
    el.dataset.n = valor;
    el.innerHTML = "<b>" + prefijo + previo + "</b><span>" + etiqueta + "</span>";
    const b = el.querySelector("b");
    const finalTxt = prefijo + (Number.isInteger(valor) ? valor : Number(valor).toFixed(2));
    const delta = valor - previo;
    if (!delta || reducir) {
      b.textContent = finalTxt;
    } else {
      const t0 = performance.now(), dur = 450;
      const paso = (t) => {
        const k = Math.min(1, (t - t0) / dur);
        if (k >= 1) { b.textContent = finalTxt; return; }
        b.textContent = prefijo + Math.round(previo + delta * (1 - Math.pow(1 - k, 3)));
        requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    }
    el.classList.remove("updated");
    void el.offsetWidth; // fuerza reinicio de la animación
    el.classList.add("updated");
  };

  // Métricas calculadas solo con la lista que ya está en memoria (sin consultas nuevas)
  const hoyISO = fechaISOOffset(0), en3 = fechaISOOffset(3), mesActual = hoyISO.slice(0, 7);
  const porVencer = listado.filter(s => estadoSocio(s) === "ACTIVO" && s.fecha_fin && s.fecha_fin >= hoyISO && s.fecha_fin <= en3).length;
  const nuevosMes = listado.filter(s => (s.created_at || "").slice(0, 7) === mesActual).length;

  aplicarConPop(tSocios, total, "Total");
  aplicarConPop(act, activos, total > 0 ? "Socios activos de " + total : "Socios activos");
  aplicarConPop(ven, vencidos, "Vencidos");
  aplicarConPop(dTotal, deuda, "Deuda", "S/ ");
  aplicarConPop(document.getElementById("porVencer"), porVencer, "Por vencer");
  aplicarConPop(document.getElementById("nuevosMes"), nuevosMes, "Nuevos este mes");
  const fill = document.getElementById("kpiMeterFill");
  if (fill) {
    const ratio = total > 0 ? activos / total : 0;
    fill.setAttribute("stroke-dasharray", (ratio * 163.36).toFixed(2) + " 163.36");
    const pct = document.getElementById("kpiPct");
    if (pct) pct.textContent = Math.round(ratio * 100) + "%";
  }
}

let socioRenovar = null;

window.renovar = async function(dni){
  socioRenovar = dni;
  const socio = (dataGlobal || []).find(s => s.dni === dni);
  if(!socio) return;

  const hoy = fechaHoyISO();
  let fechaFinSugerida = socio.fecha_fin;

  // Si venció o agotó sus 15 días, sugiere 1 mes desde hoy
  if (socio.fecha_fin < hoy || socio.dias_restantes <= 0) {
    let d = new Date();
    d.setMonth(d.getMonth() + 1);
    fechaFinSugerida = d.toISOString().split('T')[0];
  }

  document.getElementById("renTipo").value = socio.tipo_memb || "";
  document.getElementById("renInicio").value = hoy;
  document.getElementById("renFin").value = fechaFinSugerida;
  document.querySelector("#modalRenovar h3, #modalRenovar h2").innerText = "🔄 Renovar membresía";
  document.getElementById("modalRenovar").style.display = "flex";
};
// FUNCIÓN PARA ADELANTAR MEMBRESÍA
window.adelantarMembresia = async function(dni) {
  socioRenovar = dni;
  const socio = (dataGlobal || []).find(s => s.dni === dni);
  if(!socio) return;

  esAdelanto = true;

  // Toma la fecha en que vence su plan actual como inicio del nuevo periodo
  let fechaInicioAdelanto = socio.fecha_fin; 
  
  // Calcula 1 mes después partiendo de ese vencimiento
  let d = new Date(fechaInicioAdelanto + "T00:00:00");
  d.setMonth(d.getMonth() + 1);
  let fechaFinAdelanto = d.toISOString().split('T')[0];

  document.getElementById("renTipo").value = socio.tipo_memb || "";
  document.getElementById("renInicio").value = fechaInicioAdelanto;
  document.getElementById("renFin").value = fechaFinAdelanto;
  document.getElementById("renPrecio").value = socio.precio || "";
document.querySelector("#modalRenovar h3, #modalRenovar h2").innerText = "⏩ Adelantar membresía";
  document.getElementById("modalRenovar").style.display = "flex";
};

window.cerrarModalRenovar = function(){
  document.getElementById("modalRenovar").style.display = "none";
};

// --- Editar / corregir los datos generales de un socio ya inscrito ---
let _dniEditandoOriginal = null;

window.abrirModalEditarSocio = function(dni){
  const s = (dataGlobal || []).find(x => String(x.dni || '').trim() === String(dni).trim());
  if (!s) {
    mostrarToast("No se encontró al socio", "#ef4444");
    return;
  }
  _dniEditandoOriginal = s.dni;

  document.getElementById("editNombre").value = s.nombre || "";
  document.getElementById("editDni").value = s.dni || "";
  document.getElementById("editTelefono").value = s.telefono || "";
  document.getElementById("editTipoMemb").value = s.tipo_memb || "";
  document.getElementById("editPrecio").value = s.precio ?? "";
  document.getElementById("editInicio").value = s.inicio || "";
  document.getElementById("editFin").value = s.fecha_fin || "";
  document.getElementById("editDiasTotales").value = s.dias_totales ?? "";
  document.getElementById("editDiasRestantes").value = s.dias_restantes ?? "";
  document.getElementById("editDeuda").value = s.deuda || 0;

  document.getElementById("modalEditarSocio").style.display = "flex";
};

window.cerrarModalEditarSocio = function(){
  document.getElementById("modalEditarSocio").style.display = "none";
  _dniEditandoOriginal = null;
};

window.guardarEdicionSocio = async function(){
  const nombre = document.getElementById("editNombre").value.trim();
  const nuevoDni = cyLimpiarDni(document.getElementById("editDni").value);
  const telefono = cyLimpiarTelefono(document.getElementById("editTelefono").value);
  if (!cyTelefonoValido(telefono)) {
    mostrarToast("📱 El celular debe tener 9 dígitos y empezar con 9. Revísalo.", "#f59e0b");
    return;
  }
  const tipoMemb = document.getElementById("editTipoMemb").value.trim();
  const precio = document.getElementById("editPrecio").value;
  const inicio = document.getElementById("editInicio").value;
  const fin = document.getElementById("editFin").value;
  const diasTotales = document.getElementById("editDiasTotales").value;
  const diasRestantes = document.getElementById("editDiasRestantes").value;
  const deuda = document.getElementById("editDeuda").value;

  if (!nombre || !nuevoDni || !tipoMemb || !inicio || !fin) {
    mostrarToast("Complete todos los campos obligatorios", "#f59e0b");
    return;
  }

  const dniOriginal = _dniEditandoOriginal;
  if (!dniOriginal) return;

  const socioOriginal = (dataGlobal || []).find(s => String(s.dni || '').trim() === String(dniOriginal).trim()) || {};
  const nuevaDeuda = parseFloat(deuda) || 0;
  const deudaOriginal = parseFloat(socioOriginal.deuda) || 0;

  // Solo tocamos fecha_deuda cuando de verdad cambia si debe o no debe —
  // así no reseteamos el conteo de "días con deuda" solo por corregir otro dato.
  let nuevaFechaDeuda = socioOriginal.fecha_deuda || null;
  if (nuevaDeuda > 0 && deudaOriginal <= 0) {
    nuevaFechaDeuda = fechaHoyISO();
  } else if (nuevaDeuda <= 0) {
    nuevaFechaDeuda = null;
  }

  const { error } = await supabaseClient.from("socios").update({
    nombre: nombre,
    dni: nuevoDni,
    telefono: telefono,
    tipo_memb: tipoMemb,
    precio: parseFloat(precio) || 0,
    inicio: inicio,
    fecha_fin: fin,
    dias_totales: parseInt(diasTotales) || 0,
    dias_restantes: parseInt(diasRestantes) || 0,
    deuda: String(nuevaDeuda),
    fecha_deuda: nuevaFechaDeuda
  }).eq("dni", dniOriginal);

  if (error) {
    if (error.code === '23505') {
      mostrarToast("⚠️ Ya existe otro socio con ese DNI o teléfono", "#ef4444");
    } else {
      mostrarToast("❌ No se pudo guardar el cambio", "#ef4444");
      console.error(error);
    }
    return;
  }

  cerrarModalEditarSocio();
  mostrarToast("✅ Datos del socio corregidos", "#10b981");
  render();
};

let _renovando = false;
window.guardarRenovacion = async function(){
  if (_renovando) return;
  let tipo = document.getElementById("renTipo").value;
  let inicio = document.getElementById("renInicio").value;
  let fin = document.getElementById("renFin").value;
  let precio = document.getElementById("renPrecio").value;
  
  if(!tipo || !inicio || !fin || !precio){
    mostrarToast("Complete todos los campos", "#f59e0b");
    return;
  }

  let dias;
  if(tipo.toLowerCase().includes("interdiario")){
    dias = 15;
  }else{
    const dateInicio = new Date(inicio + "T00:00:00");
    const dateFin = new Date(fin + "T00:00:00");
    dias = Math.round((dateFin - dateInicio) / 86400000);
    if(dias < 0) dias = 0;
  }

  const dniBuscado = String(socioRenovar || '').trim();
  const socioPreRenovacion = (dataGlobal || []).find(s => String(s.dni || '').trim() === dniBuscado);
  
  const nombreSocio = socioPreRenovacion ? socioPreRenovacion.nombre : "Socio";
  const telefonoSocio = socioPreRenovacion ? socioPreRenovacion.telefono : "";
  const precioNum = parseFloat(precio) || 0;

  // 1. OBTENER LA FECHA LOCAL EXACTA (Sin desfase de zona horaria / GMT-5)
  const ahora = new Date();
  const tzoffset = ahora.getTimezoneOffset() * 60000;
  const hoyLocalISO = (new Date(ahora.getTime() - tzoffset)).toISOString();
  const hoyFechaCorta = hoyLocalISO.split('T')[0];

  // 2. AGREGAR ETIQUETA SI LA MEMBRESÍA INICIA DESPUÉS DE HOY
  let textoTipoMemb = tipo;
  if (inicio > hoyFechaCorta) {
    const [y, m, d] = inicio.split('-');
    textoTipoMemb = `${tipo} (Inicia: ${d}/${m}/${y})`;
  }

  // 3. ¿YA SE REGISTRÓ ESTE COBRO HACE UN MOMENTO? (evita cobrar dos veces)
  _renovando = true;
  try {
    const desde = new Date(Date.now() - 10 * 60000).toISOString();
    const { data: recientes } = await supabaseClient.from("historial_caja")
      .select("monto_ingreso, fecha_movimiento")
      .eq("dni", dniBuscado).in("concepto", ["Renovación de membresía", "Adelanto de membresía"])
      .eq("anulado", false).gte("fecha_movimiento", desde)
      .order("fecha_movimiento", { ascending: false }).limit(1);
    const enCola = (typeof cyCajaCola === "function" ? cyCajaCola() : [])
      .filter(f => f.dni === dniBuscado && /Renovación|Adelanto/.test(f.concepto || "") && f.fecha_movimiento >= desde);
    const previo = (recientes && recientes[0]) || enCola[0];
    if (previo) {
      const seg = Math.max(1, Math.round((Date.now() - new Date(previo.fecha_movimiento).getTime()) / 1000));
      const hace = seg < 60 ? seg + " segundos" : Math.round(seg / 60) + (Math.round(seg / 60) === 1 ? " minuto" : " minutos");
      const sigue = confirm("⚠️ A " + nombreSocio + " ya se le registró una renovación de S/ " + (parseFloat(previo.monto_ingreso) || 0) +
        " hace " + hace + ".\n\n¿Es un pago NUEVO y quieres cobrarlo otra vez?\n\nAceptar = sí, registrar otro cobro\nCancelar = no, fue un error");
      if (!sigue) {
        _renovando = false;
        cerrarModalRenovar();
        mostrarToast("No se registró de nuevo: la renovación anterior ya está guardada", "#3b82f6");
        return;
      }
    }
  } catch (e) { /* si no se puede revisar, se sigue normalmente */ }

  // 4. GUARDAR EN SUPABASE (un solo toque: el botón se bloquea mientras guarda)
  const btnRen = document.querySelector('#modalRenovar .btn-green');
  if (btnRen) btnRen.disabled = true;
  let errRen = null;
  try {
    const res = await supabaseClient
      .from("socios")
      .update({
        tipo_memb: tipo,
        inicio: inicio,
        fecha_fin: fin,
        dias_totales: dias,
        dias_restantes: dias,
        precio: precioNum
      })
      .eq("dni", socioRenovar);
    errRen = res.error;
  } catch (e) { errRen = e; }
  _renovando = false;
  if (btnRen) btnRen.disabled = false;
  if (errRen) {
    console.error("No se pudo renovar:", errRen);
    mostrarToast("❌ No se guardó. Revisa el internet e inténtalo de nuevo", "#ef4444");
    return;
  }

  // 5. ANOTAR EL PAGO EN EL CUADERNO DE CAJA (solo si se guardó)
  cyCajaGuardar({
    dni: dniBuscado || '',
    nombre: nombreSocio || '',
    tipo_memb: textoTipoMemb || 'Membresía',
    concepto: esAdelanto ? "Adelanto de membresía" : "Renovación de membresía",
    monto_ingreso: precioNum,
    deuda_visual: 0
  });

  cerrarModalRenovar();
  let msgToast = esAdelanto ? "⏩ Adelanto guardado con éxito" : "✅ Membresía renovada correctamente";
  mostrarToast(msgToast, "#10b981");

  // 3. WHATSAPP
  if (telefonoSocio) {
    if (esAdelanto) {
      enviarComprobanteAdelantoWhatsApp(telefonoSocio, nombreSocio, tipo, inicio, fin, precio);
    } else {
      enviarComprobanteTextoWhatsApp(telefonoSocio, nombreSocio, tipo, inicio, fin, precio);
    }
  }

  esAdelanto = false;
  await render();
};

// Celular y DNI se guardan solo con números (sin espacios, guiones ni +51),
// así el socio siempre puede entrar por el QR con sus datos bien escritos.
function cyLimpiarTelefono(v){ let d = String(v || "").replace(/\D/g, ""); if (/^51\d{9}$/.test(d)) d = d.slice(2); return d; }
function cyLimpiarDni(v){ return String(v || "").replace(/\D/g, ""); }
function cyTelefonoValido(d){ return !d || /^9\d{8}$/.test(d); }

// ---- Errores claros del formulario de registro (marca el campo y dice qué pasa) ----
function rgLimpiarErrores(){
  document.querySelectorAll('#tab2 .rg-f--mal').forEach(l => l.classList.remove('rg-f--mal'));
  document.querySelectorAll('#tab2 .rg-err').forEach(e => e.remove());
}
function rgError(id, msg){
  const input = document.getElementById(id);
  const label = input && input.closest('.rg-f');
  if (!label) return;
  label.classList.add('rg-f--mal');
  let e = label.querySelector('.rg-err');
  if (!e) { e = document.createElement('small'); e.className = 'rg-err'; e.setAttribute('role', 'alert'); label.appendChild(e); }
  e.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> ' + escaparHTML(msg);
}
function rgMostrarErrores(errores){
  rgLimpiarErrores();
  errores.forEach(x => rgError(x.id, x.msg));
  const primero = document.getElementById(errores[0].id);
  if (primero) { primero.scrollIntoView({ behavior: 'smooth', block: 'center' }); try { primero.focus({ preventScroll: true }); } catch(e){} }
  mostrarToast(errores.length === 1 ? "⚠️ " + errores[0].msg : "⚠️ Revisa los " + errores.length + " datos marcados en rojo", "#f59e0b");
}
