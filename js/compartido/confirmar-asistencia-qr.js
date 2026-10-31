// Compartida por el QR y el panel. Clásico: mismo ámbito global y mismo orden que antes.
window.confirmarAsistenciaQR = async function () {
  if(window.yaProcesandoQR) {
    console.warn("Petición duplicada bloqueada de forma segura.");
    return; 
  }

  const socio = window.pendingQR;
  if (!socio) return;

  try {
    window.yaProcesandoQR = true;
    
    window._qrLockTimeout = setTimeout(() => {
      window.yaProcesandoQR = false;
    }, 60000);

    const div = document.getElementById("qrResult");
    // Al instante: se muestra la bienvenida con los datos que ya verificó el sistema
    // al abrir la pantalla. El servidor confirma en segundo plano (ver abajo).
    cyPintarExitoQR(Object.assign({}, socio, { dias_restantes: Math.max(0, (socio.dias_restantes || 0) - 1) }), "pendiente");
    
    window.metodoIngreso = "QR";

    // 🚀 1. REGISTRAR ASISTENCIA — un solo viaje a Supabase (antes eran dos:
    // uno para revisar el estado del socio y otro para guardar la asistencia).
    // Con internet lento se reintenta solo. Si un reintento responde "ya
    // registrado", es porque el primer intento SÍ llegó: se muestra como éxito.
    const { data: resultado, error: errorRpc, intento } = await cyRpcSeguro(
      "registrar_asistencia_qr",
      { p_telefono: (leerTelefonoSeguro() || "").replace(/\D/g,''), p_dni: socio.dni }
    );

    if (errorRpc || !resultado) {
      console.error("Error llamando a registrar_asistencia_qr:", errorRpc);
      mostrarTarjetaEstado("⚠️ SIN CONEXIÓN", "No se pudo registrar la asistencia: la señal está muy lenta.<br><br><button type='button' class='qr-btn-principal' onclick='this.disabled=true;confirmarAsistenciaQR()'><span class='icono-circulo'><i class='fa-solid fa-rotate-right'></i></span> Reintentar</button>", "#ef4444");
      return;
    }
    if (!resultado.ok && resultado.motivo === "YA_REGISTRADO" && intento > 1) {
      mostrarTarjetaEstado("ASISTENCIA REGISTRADA", `<b>${escaparHTML(resultado.nombre || socio.nombre)}</b><br><br>Tu asistencia de hoy quedó registrada.<br><br>💪 ¡A darle con todo hoy!`, "#10b981");
      playSound("ACTIVO");
      window.pendingQR = null;
      return;
    }

    if (!resultado.ok) {
      switch (resultado.motivo) {
        case "AGOTADO":
          cyAvisarIntento();
          mostrarTarjetaEstado("🚫 MEMBRESÍA AGOTADA", `<b>${escaparHTML(resultado.nombre)}</b><br><br>Ha consumido las 15 asistencias de su plan Interdiario.<br><br>Acérquese a recepción para renovar su membresía.`);
          break;
        case "VENCIDO":
          cyAvisarIntento();
          mostrarTarjetaEstado("❌ MEMBRESÍA VENCIDA", "Su membresía ha vencido por fecha calendario.<br><br>Acérquese a recepción para renovarla.");
          break;
        case "DEUDA":
          cyAvisarIntento();
          mostrarTarjetaEstado("🚫 ACCESO BLOQUEADO", `<b>${escaparHTML(resultado.nombre)}</b><br><br>💰 Deuda pendiente: <b>S/ ${escaparHTML(resultado.deuda)}</b><br><br>Regularice su pago para habilitar su acceso.`, "#ef4444");
          break;
        case "BLOQUEADO_TIENDA": {
          const dv = document.getElementById("qrResult");
          if (dv) dv.innerHTML = cyTarjetaBloqueoTienda(resultado.nombre, resultado.deudas);
          break;
        }
        case "BLOQUEADO":
          mostrarTarjetaEstado("🚫 DEMASIADOS INTENTOS", "Espera 15 minutos o acércate a recepción.", "#ef4444");
          break;
        case "YA_REGISTRADO":
          mostrarTarjetaEstado("⚠️ ASISTENCIA YA REGISTRADA", `<b>${escaparHTML(resultado.nombre)}</b><br><br>Tu asistencia de hoy ya fue registrada.<br><br>💪 ¡Nos vemos en tu próximo entrenamiento!`, "#f59e0b");
          setTimeout(() => { mostrarSocio(socio); }, 2000);
          break;
        default:
          mostrarTarjetaEstado("❌ NO ENCONTRADO", "No se pudo verificar su membresía. Intente nuevamente.", "#ef4444");
      }
      playSound("VENCIDO");
      return;
    }

    // Sincronizamos el objeto local con la respuesta real y ya actualizada del servidor
    socio.nombre = resultado.nombre;
    socio.dias_restantes = resultado.dias_restantes;
    socio.dias_totales = resultado.dias_totales;
    socio.fecha_fin = resultado.fecha_fin;
    socio.inicio = resultado.inicio;
    cyPintarExitoQR(socio, "confirmado");

    // v46: en esta pantalla ya no se muestran los accesos de Suplementos/Promos
    const filaAccesos = document.getElementById("cyPromoRow");
    if (filaAccesos) filaAccesos.style.display = "none";

    window.pendingQR = null;
  } catch (error) {
    console.error(error);
    mostrarTarjetaEstado("⚠️ SIN CONEXIÓN", "No se pudo registrar la asistencia.<br><br><button type='button' class='qr-btn-principal' onclick='this.disabled=true;confirmarAsistenciaQR()'><span class='icono-circulo'><i class='fa-solid fa-rotate-right'></i></span> Reintentar</button>", "#ef4444");
  } finally {
    clearTimeout(window._qrLockTimeout);
    window.yaProcesandoQR = false;
  }
};

// Pinta la pantalla de bienvenida. estado: "pendiente" (aún sin respuesta del
// servidor) o "confirmado". Con los datos del servidor se vuelve a pintar igual.
window.cyPintarExitoQR = function (socio, estado) {
  const div = document.getElementById("qrResult");
  if (!div) return;
  // Datos ya en memoria (sin otra consulta): Usamos los datos ya actualizados en memoria (sin otra consulta)
  let usadas = socio.dias_totales - socio.dias_restantes;

  const dateHoy = new Date();
  dateHoy.setHours(0,0,0,0);
  const dateFinSocio = new Date(socio.fecha_fin + "T00:00:00");
  const diasVigenciaReales = Math.max(0, Math.round((dateFinSocio - dateHoy) / 86400000));
  const horaRegistro = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

  div.innerHTML = `
      <div class="qr-hero-card qr-ok">

        <div class="check-burst">
          <svg viewBox="0 0 24 24"><path d="M4 12.5L9.5 18L20 6"/></svg>
          <span class="conf" aria-hidden="true"><i style="--a:0deg;--c:#34d399"></i><i style="--a:36deg;--c:#fbbf24"></i><i style="--a:72deg;--c:#22d3ee"></i><i style="--a:108deg;--c:#fb7185"></i><i style="--a:144deg;--c:#a78bfa"></i><i style="--a:180deg;--c:#34d399"></i><i style="--a:216deg;--c:#fbbf24"></i><i style="--a:252deg;--c:#22d3ee"></i><i style="--a:288deg;--c:#fb7185"></i><i style="--a:324deg;--c:#a78bfa"></i></span>
        </div>

        <div class="ok-pill"><i></i><span>${estado === "pendiente" ? "Registrando tu asistencia…" : "Asistencia registrada"}</span></div>
        <div class="qr-conf" style="text-align:center; font-size:12.5px; margin:-4px 0 10px; color:${estado === "pendiente" ? "#94a3b8" : "#34d399"};">${estado === "pendiente" ? "Confirmando con el gimnasio…" : "✔ Confirmado por el gimnasio"}</div>

        <h1 class="stagger-item qr-titulo ok-brand" style="animation-delay:.05s;">
          <span class="logo-cy"></span><span>C&Y <span class="accent">FITNESS</span></span>
        </h1>

        <h3 class="stagger-item ok-hi" style="animation-delay:.1s;"><small>¡Bienvenido de nuevo,</small><b>${escaparHTML(socio.nombre)}!</b></h3>

        <div class="stagger-item qr-badge" style="animation-delay:.13s;"><i class="dot"></i> Socio Activo</div>

        <div class="stagger-item qr-info-grid" style="animation-delay:.17s;">
          <div class="box"><div class="l">Últ. asistencia</div><div class="v">Hoy</div></div>
          <div class="box"><div class="l">Hora</div><div class="v">${horaRegistro}</div></div>
          <div class="box"><div class="l">Plan</div><div class="v">${escaparHTML(socio.tipo_memb)}</div></div>
        </div>

        <div class="stagger-item ok-rend" style="animation-delay:.2s;">
          <div class="rh"><span class="l"><i class="fa-solid fa-chart-line"></i>Rendimiento del plan</span><span class="okpc">${socio.dias_totales > 0 ? Math.round(Math.min(100, (usadas / socio.dias_totales) * 100)) : 0}%</span></div>
          <div class="v"><span class="l2">Asistencias</span><span class="n"><b>${usadas}</b><i>/</i><em>${socio.dias_totales}</em></span></div>
          <div class="ok-bar"><b style="width:${Math.min(100, (usadas / socio.dias_totales) * 100)}%"></b></div>
        </div>

        <div class="stagger-item ok-grid" style="animation-delay:.25s;">
          <div class="ok-box"><div class="l">Fecha inicio</div><div class="v">${escaparHTML(socio.inicio)}</div></div>
          <div class="ok-box"><div class="l">Vencimiento</div><div class="v">${escaparHTML(socio.fecha_fin)}</div></div>
          <div class="ok-box key ${diasVigenciaReales <= 7 ? 'low' : diasVigenciaReales <= 15 ? 'warn' : ''}"><div class="l">Días restantes</div><div class="v big">${diasVigenciaReales}<small> días</small></div></div>
          <div class="ok-box ${parseFloat(socio.deuda || 0) > 0 ? 'debt' : 'good'}"><div class="l">Estado de cuenta</div><div class="v"><span class="chip">${parseFloat(socio.deuda || 0) > 0 ? 'S/ ' + socio.deuda : 'Al día ✓'}</span></div></div>
        </div>

        <div class="stagger-item ok-foot" style="animation-delay:.3s;">¡A darle con todo hoy!</div>
        ${window.cyCuponesBloque ? cyCuponesBloque(window.cyCupones) : ''}

        <div class="qr-secure-line stagger-item" style="animation-delay:.35s;"><i class="fa-solid fa-lock"></i> Registro seguro y rápido</div>

      </div>
`;
};
