/* ============================================================
   TIENDA DEL GYM — punto de venta, fiados y deudas.
   Solo para el panel del personal. La pantalla del QR no lo usa.
   Las reglas viven en la base de datos; aquí solo se muestran y se
   piden acciones. Fecha siempre en hora de Lima.
   ============================================================ */
(function () {
  "use strict";

  const UMBRAL = 10.99;
  const TD = (window.TD = {});
  const q = (id) => document.getElementById(id);
  const esc = (t) => escaparHTML(t);
  const soles = (n) => "S/ " + (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const CATEGORIAS = ["Bebidas", "Suplementos", "Accesorios", "Otros"];
  const sb = () => supabaseClient; // cliente global de gym.html

  const hoyLima = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const sumarDias = (iso, n) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  };
  const fechaCorta = (iso) => {
    if (!iso) return "—";
    const [, m, d] = iso.split("-").map(Number);
    return d + " " + MESES[m - 1];
  };
  const dniValido = (dni) => /^\d{8}$/.test(dni || "");
  const mensajeError = (e) => (e && e.message) || "Ocurrió un error. Inténtalo de nuevo.";

  // ---------- Datos ----------

  TD.fiadosDeSocio = async function (dni) {
    const { data, error } = await sb().from("ventas")
      .select("id, fecha, total, saldo, fecha_vencimiento, venta_items(nombre, cantidad)")
      .eq("dni", dni).eq("metodo", "fiado").eq("estado", "pendiente")
      .order("fecha", { ascending: true });
    if (error) throw error;
    const hoy = hoyLima();
    return (data || []).map((v) => ({
      id: v.id,
      fecha: v.fecha,
      total: Number(v.total),
      saldo: Number(v.saldo),
      vence: v.fecha_vencimiento || null,
      articulos: (v.venta_items || []).map((i) => i.cantidad + " × " + i.nombre).join(", "),
      bloquea: !!v.fecha_vencimiento && hoy >= v.fecha_vencimiento,
    }));
  };

  TD.resumenSocio = async function (dni) {
    const fiados = await TD.fiadosDeSocio(dni);
    const bloqueos = fiados.filter((f) => f.bloquea);
    return {
      fiados,
      bloqueos,
      bloquea: bloqueos.length > 0,
      saldo: fiados.reduce((s, f) => s + f.saldo, 0),
    };
  };

  // Texto de cuándo bloquea (o bloqueó) una deuda de tienda
  function textoVencimiento(f) {
    if (!f.vence) return "Sin fecha límite · no bloquea";
    return (f.bloquea ? "Bloqueado desde " : "Bloquea desde ") + fechaCorta(f.vence);
  }

  // Sección que se agrega a la tarjeta del socio en el panel de ingreso
  TD.htmlSeccionSocio = function (resumen) {
    if (!resumen || !resumen.fiados.length) return "";
    const filas = resumen.fiados.map((f) => `
      <li class="td-fila${f.bloquea ? " td-fila--bloquea" : ""}">
        <div>
          <b>${esc(f.articulos)}</b>
          <span>${fechaCorta(f.fecha)} · ${esc(textoVencimiento(f))}</span>
        </div>
        <strong>${soles(f.saldo)}</strong>
      </li>`).join("");
    const alerta = resumen.bloquea
      ? `<p class="td-alerta"><i class="fa-solid fa-ban"></i> Acceso bloqueado por deuda de tienda. Debe pagarla para ingresar.</p>`
      : "";
    return `
    <section class="td-socio" aria-label="Deuda de tienda">
      <header><span><i class="fa-solid fa-bag-shopping"></i> Deuda de tienda</span><b>${soles(resumen.saldo)}</b></header>
      ${alerta}
      <ul class="td-lista">${filas}</ul>
    </section>`;
  };

  // ---------- Catálogo: categorías y productos ----------

  const cat = { categorias: [], productos: [] }; // todos, activos e inactivos

  async function cargarCatalogo() {
    const [c, p] = await Promise.all([
      sb().from("categorias_producto").select("nombre").order("nombre"),
      sb().from("productos").select("id, nombre, categoria, precio, stock, activo").order("nombre"),
    ]);
    if (c.error) throw c.error;
    if (p.error) throw p.error;
    cat.categorias = (c.data || []).map((x) => x.nombre);
    cat.productos = p.data || [];
  }

  const aLaVenta = () => cat.productos.filter((p) => p.activo);
  const tieneControl = (p) => p.stock !== null && p.stock !== undefined;
  const stockBajo = (p) => tieneControl(p) && p.stock <= 3;

  async function cargarVentasHoy() {
    const cont = q("tdHoy");
    if (!cont) return;
    const { data, error } = await sb().from("ventas")
      .select("id, nombre_socio, total, saldo, metodo, estado, creado_en")
      .eq("fecha", hoyLima()).order("creado_en", { ascending: false }).limit(50);
    if (error) { cont.innerHTML = `<p class="td-vacio">No se pudieron cargar las ventas de hoy.</p>`; return; }
    if (!data || !data.length) { cont.innerHTML = `<p class="td-vacio">Todavía no hay ventas hoy.</p>`; return; }
    const etiqueta = { efectivo: "Efectivo", yape_plin: "Yape / Plin", fiado: "Fiado" };
    cont.innerHTML = data.map((v) => {
      const hora = new Date(v.creado_en).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });
      const estadoTxt = v.metodo === "fiado" ? (v.estado === "pagada" ? "Pagado" : "Saldo " + soles(v.saldo)) : "Cobrado";
      return `<div class="td-venta-fila">
        <span>${esc(hora)}</span>
        <div><b>${esc(v.nombre_socio || "Cliente sin socio")}</b><small>${esc(etiqueta[v.metodo] || v.metodo)} · ${esc(estadoTxt)}</small></div>
        <strong>${soles(v.total)}</strong></div>`;
    }).join("");
  }

  // ---------- Ventas en curso (una por cliente, para atender a varios a la vez) ----------

  const MAX_VENTAS = 8;
  let contadorVenta = 0;
  const ui = { ventas: [], activa: null, categoria: "Todas" };

  function nuevaVenta() {
    contadorVenta += 1;
    const v = { id: "v" + contadorVenta, carrito: [], metodo: "efectivo", dni: "", socio: null,
                fechaLimite: "", confirmando: false, guardando: false };
    ui.ventas.push(v);
    ui.activa = v.id;
    return v;
  }
  const ventaActiva = () => ui.ventas.find((v) => v.id === ui.activa) || ui.ventas[0];
  // Total en soles con dos decimales exactos (evita errores de coma flotante al comparar con S/ 10.99)
  const totalDe = (v) => Math.round(v.carrito.reduce((s, l) => s + l.precio * l.cant, 0) * 100) / 100;
  const etiquetaVenta = (v, i) => (v.socio ? v.socio.nombre : "Cliente " + (i + 1));

  // Unidades que aún se pueden agregar de un producto (según stock y lo que ya está en el carrito)
  function disponible(p, v) {
    if (!tieneControl(p)) return Infinity;
    const enCarrito = v.carrito.filter((l) => l.id === p.id).reduce((s, l) => s + l.cant, 0);
    return Math.max(0, p.stock - enCarrito);
  }

  function pintarVentas() {
    const cont = q("tdVentas");
    if (!cont) return;
    cont.innerHTML = ui.ventas.map((v, i) => {
      const activa = v.id === ui.activa;
      const cerrable = v.carrito.length === 0 && ui.ventas.length > 1;
      return `<div class="td-ticket${activa ? " activo" : ""}" role="tab" aria-selected="${activa}" data-venta="${esc(v.id)}">
        <button type="button" class="td-ticket-main" data-ir="${esc(v.id)}">
          <span>${esc(etiquetaVenta(v, i))}</span><b>${soles(totalDe(v))}</b>
        </button>
        ${cerrable ? `<button type="button" class="td-ticket-x" data-cerrar="${esc(v.id)}" aria-label="Cerrar esta venta">×</button>` : ""}
      </div>`;
    }).join("") + (ui.ventas.length < MAX_VENTAS
      ? `<button type="button" class="td-ticket td-ticket--nuevo" data-nueva="1"><i class="fa-solid fa-plus"></i> Nueva venta</button>`
      : "");
  }

  // Identidad de cada categoría: color e icono (la clave es el nombre sin tildes, en minúscula)
  const ESTILO_CATEGORIA = {
    bebidas: { color: "#38bdf8", icono: "fa-glass-water" },
    suplementos: { color: "#f59e0b", icono: "fa-capsules" },
    accesorios: { color: "#a78bfa", icono: "fa-dumbbell" },
    quemador: { color: "#f43f5e", icono: "fa-fire" },
    otros: { color: "#94a3b8", icono: "fa-box" },
  };
  const estiloCategoria = (nombre) => {
    const clave = String(nombre || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    return ESTILO_CATEGORIA[clave] || { color: "#94a3b8", icono: "fa-tag" };
  };

  function pintarCategorias() {
    const cats = ["Todas", ...cat.categorias];
    q("tdCats").innerHTML = cats.map((c) =>
      `<button type="button" class="td-cat${ui.categoria === c ? " activa" : ""}" data-cat="${esc(c)}" style="--cat:${c === "Todas" ? "#f59e0b" : estiloCategoria(c).color}"><i class="fa-solid ${c === "Todas" ? "fa-layer-group" : estiloCategoria(c).icono}"></i>${esc(c)}</button>`).join("");
  }

  function pintarProductos() {
    const v = ventaActiva();
    const lista = aLaVenta().filter((p) => ui.categoria === "Todas" || p.categoria === ui.categoria);
    q("tdProductos").innerHTML = lista.length
      ? lista.map((p) => {
          const libre = disponible(p, v);
          const agotado = libre <= 0;
          const badge = !tieneControl(p) ? ""
            : agotado ? `<em class="td-stock td-stock--cero">Sin stock</em>`
            : `<em class="td-stock${stockBajo(p) ? " td-stock--bajo" : ""}">Quedan ${p.stock}</em>`;
          const est = estiloCategoria(p.categoria);
          return `
        <button type="button" class="td-prod${agotado ? " agotado" : ""}" data-id="${esc(p.id)}" ${agotado ? "disabled" : ""} style="--cat:${est.color}">
          <i class="fa-solid ${est.icono} td-prod-ico" aria-hidden="true"></i>
          <span class="td-prod-cat">${esc(p.categoria)}</span>
          <b>${esc(p.nombre)}</b>
          <strong>${soles(p.precio)}</strong>
          ${badge}
        </button>`;
        }).join("")
      : `<p class="td-vacio">No hay productos en esta categoría.</p>`;
  }

  function pintarVenta() {
    const v = ventaActiva();
    const cont = q("tdCarrito");
    if (!v.carrito.length) {
      cont.innerHTML = `<p class="td-vacio">Toque un producto para agregarlo.</p>`;
    } else {
      cont.innerHTML = v.carrito.map((l) => `
        <div class="td-linea">
          <div><b>${esc(l.nombre)}</b><small>${soles(l.precio)} c/u</small></div>
          <div class="td-cant">
            <button type="button" data-restar="${esc(l.id)}" aria-label="Quitar uno">−</button>
            <span>${l.cant}</span>
            <button type="button" data-sumar="${esc(l.id)}" aria-label="Agregar uno">+</button>
          </div>
          <strong>${soles(l.precio * l.cant)}</strong>
        </div>`).join("");
    }
    q("tdTotal").textContent = soles(totalDe(v));
    document.querySelectorAll("#tiendaRoot [data-metodo]").forEach((b) =>
      b.classList.toggle("activo", b.dataset.metodo === v.metodo));
    q("tdDni").value = v.dni;
    pintarSocio(v);
    pintarFiado(v);
    pintarRegistrar(v);
    pintarProductos();
    pintarVentas();
  }

  function pintarSocio(v) {
    const cont = q("tdSocio");
    if (v.dni.length && !dniValido(v.dni)) {
      cont.innerHTML = `<p class="td-ayuda">El DNI tiene 8 números.</p>`;
    } else if (v.socio) {
      cont.innerHTML = `<p class="td-socio-ok"><i class="fa-solid fa-circle-check"></i> ${esc(v.socio.nombre)}</p>`;
    } else {
      cont.innerHTML = "";
    }
  }

  function pintarFiado(v) {
    const cont = q("tdFiado");
    if (v.metodo !== "fiado") { cont.innerHTML = ""; return; }
    const t = totalDe(v);
    const ayuda = !v.carrito.length ? ""
      : t <= UMBRAL
        ? `<p class="td-ayuda"><i class="fa-solid fa-circle-info"></i> Hasta S/ ${UMBRAL.toFixed(2)}: bloquea la entrada desde ${fechaCorta(sumarDias(hoyLima(), 1))}.</p>`
        : `<p class="td-ayuda"><i class="fa-solid fa-circle-info"></i> Más de S/ ${UMBRAL.toFixed(2)}: elija una fecha límite si quiere que bloquee la entrada. Sin fecha, no bloquea.</p>`;
    const fechaCampo = t > UMBRAL
      ? `<label class="td-campo"><span>Fecha límite (opcional)</span>
           <input id="tdFechaLimite" type="date" min="${sumarDias(hoyLima(), 1)}" value="${esc(v.fechaLimite)}"></label>`
      : "";
    cont.innerHTML = fechaCampo + ayuda;
  }

  function pintarRegistrar(v) {
    const cont = q("tdConfirmar");
    const btn = q("tdRegistrar");
    const listo = v.carrito.length > 0 && !v.guardando && (v.metodo !== "fiado" || !!v.socio);
    btn.disabled = !listo;
    btn.textContent = v.guardando ? "Registrando…" : v.metodo === "fiado" ? "Registrar fiado" : "Registrar venta";
    if (!v.confirmando) { cont.innerHTML = ""; return; }
    const conFecha = v.metodo === "fiado" && v.fechaLimite && totalDe(v) > UMBRAL;
    const detalle = v.metodo === "fiado"
      ? `Fiar <b>${soles(totalDe(v))}</b> a <b>${esc(v.socio.nombre)}</b>${conFecha
          ? `, con fecha límite el ${fechaCorta(v.fechaLimite)}`
          : totalDe(v) <= UMBRAL ? `, que bloquea desde ${fechaCorta(sumarDias(hoyLima(), 1))}` : ", sin fecha límite (no bloquea)"}.`
      : `Cobrar <b>${soles(totalDe(v))}</b> en ${v.metodo === "yape_plin" ? "Yape / Plin" : "efectivo"}.`;
    cont.innerHTML = `<div class="td-confirmar" role="alertdialog" aria-label="Confirmar venta">
      <p>${detalle}</p>
      <div class="td-botones">
        <button type="button" class="td-btn td-btn--sec" data-accion="cancelar-confirmar">Cancelar</button>
        <button type="button" class="td-btn td-btn--main" data-accion="confirmar">Confirmar</button>
      </div></div>`;
  }

  function pintarTodo() { pintarCategorias(); pintarVenta(); }

  // Valida el DNI del socio de una venta (para fiar o para asociarla)
  async function validarSocio(v, dni) {
    v.socio = null;
    if (!dniValido(dni)) { pintarVenta(); return; }
    const { data, error } = await sb().from("socios").select("dni, nombre").eq("dni", dni).single();
    if (v.dni !== dni) return; // cambió mientras consultaba
    if (error || !data) {
      q("tdSocio").innerHTML = `<p class="td-error"><i class="fa-solid fa-circle-xmark"></i> No hay socio con ese DNI.</p>`;
      pintarRegistrar(v);
      return;
    }
    v.socio = { dni: data.dni, nombre: data.nombre };
    pintarVenta();
  }

  function agregar(id) {
    const v = ventaActiva();
    if (v.guardando) return;
    const p = cat.productos.find((x) => x.id === id);
    if (!p || !p.activo || disponible(p, v) <= 0) return;
    const linea = v.carrito.find((l) => l.id === id);
    if (linea) linea.cant = Math.min(linea.cant + 1, 50);
    else v.carrito.push({ id: p.id, nombre: p.nombre, precio: Number(p.precio), cant: 1 });
    v.confirmando = false;
    pintarVenta();
  }

  function cambiarCantidad(id, delta) {
    const v = ventaActiva();
    if (v.guardando) return;
    const linea = v.carrito.find((l) => l.id === id);
    if (!linea) return;
    if (delta > 0) {
      const p = cat.productos.find((x) => x.id === id);
      if (!p || disponible(p, v) <= 0) return;
    }
    linea.cant += delta;
    if (linea.cant < 1) v.carrito = v.carrito.filter((l) => l.id !== id);
    else linea.cant = Math.min(linea.cant, 50);
    v.confirmando = false;
    pintarVenta();
  }

  // Termina una venta: se quita de la lista y las demás siguen intactas
  function terminarVenta(v) {
    ui.ventas = ui.ventas.filter((x) => x.id !== v.id);
    if (!ui.ventas.length) nuevaVenta();
    ui.activa = ui.ventas[0].id;
    pintarTodo();
  }

  async function registrarVenta(v) {
    if (v.guardando || !v.carrito.length) return;
    if (v.metodo === "fiado" && !v.socio) return;
    // Un DNI escrito que aún no se valida no debe perderse en silencio
    if (dniValido(v.dni) && !v.socio) return mostrarToast("Revise el DNI del socio antes de registrar", "#ef4444");
    v.guardando = true;
    pintarRegistrar(v);
    try {
      const items = v.carrito.map((l) => ({ producto_id: l.id, cantidad: l.cant }));
      const dni = v.socio ? v.socio.dni : null;
      const fecha = v.metodo === "fiado" && v.fechaLimite && totalDe(v) > UMBRAL ? v.fechaLimite : null;
      const { data, error } = await sb().rpc("registrar_venta", {
        p_items: items, p_metodo: v.metodo, p_dni: dni, p_fecha_limite: fecha,
      });
      if (error) throw error;
      mostrarToast("✅ " + (v.metodo === "fiado" ? "Fiado registrado" : "Venta registrada") + " · " + soles(data.total), "#10b981");
      v.guardando = false;
      terminarVenta(v);
      cargarCatalogo().then(() => pintarProductos()).catch(() => {});
      cargarVentasHoy();
    } catch (e) {
      mostrarToast("❌ " + mensajeError(e), "#ef4444");
      v.guardando = false;
      cargarCatalogo().then(() => pintarVenta()).catch(() => pintarRegistrar(v));
    }
  }

  // Montaje de la pestaña Tienda (se llama al abrirla)
  TD.montar = async function () {
    const root = q("tiendaRoot");
    if (!root) return;
    if (!root.dataset.listo) {
      root.innerHTML = plantilla();
      root.dataset.listo = "1";
      root.addEventListener("click", onClick);
      root.addEventListener("input", onInput);
      root.addEventListener("change", onChange);
    }
    if (!ui.ventas.length) nuevaVenta();
    try {
      await cargarCatalogo();
    } catch (e) {
      mostrarToast("❌ " + mensajeError(e), "#ef4444");
    }
    pintarTodo();
    cargarVentasHoy();
  };

  // Abre una venta nueva con el socio ya elegido (desde el formulario de deuda)
  TD.iniciarFiado = async function (dni) {
    await TD.montar();
    let v = ventaActiva();
    if (v.carrito.length || v.dni) v = nuevaVenta();
    v.metodo = "fiado";
    v.dni = dni;
    pintarTodo();
    // Muestra la pestaña Tienda (el mismo botón de la barra) antes de preparar la venta
    const botonTienda = document.querySelector(".tabs .tabbtn-centro");
    if (botonTienda) botonTienda.click();
    await validarSocio(v, dni);
    q("tiendaRoot").scrollIntoView({ behavior: "smooth", block: "start" });
  };

  function onClick(ev) {
    const t = ev.target.closest("button");
    if (!t) return;
    if (t.dataset.nueva) { if (ui.ventas.length < MAX_VENTAS) { nuevaVenta(); pintarTodo(); } return; }
    if (t.dataset.cerrar) {
      const v = ui.ventas.find((x) => x.id === t.dataset.cerrar);
      if (v && !v.carrito.length && ui.ventas.length > 1) terminarVenta(v);
      return;
    }
    if (t.dataset.ir) { ui.activa = t.dataset.ir; return pintarTodo(); }
    if (t.dataset.cat) { ui.categoria = t.dataset.cat; return pintarTodo(); }
    if (t.dataset.id) return agregar(t.dataset.id);
    if (t.dataset.sumar) return cambiarCantidad(t.dataset.sumar, +1);
    if (t.dataset.restar) return cambiarCantidad(t.dataset.restar, -1);
    if (t.dataset.metodo) {
      const v = ventaActiva();
      v.metodo = t.dataset.metodo;
      v.confirmando = false;
      if (v.metodo !== "fiado") v.fechaLimite = "";
      return pintarVenta();
    }
    if (t.dataset.accion === "gestionar") return TD.abrirGestion();
    if (t.dataset.accion === "cancelar-confirmar") { const v = ventaActiva(); v.confirmando = false; return pintarRegistrar(v); }
    if (t.dataset.accion === "confirmar") { const v = ventaActiva(); v.confirmando = false; return registrarVenta(v); }
    if (t.id === "tdRegistrar") { const v = ventaActiva(); v.confirmando = true; return pintarRegistrar(v); }
  }

  function onInput(ev) {
    if (ev.target.id === "tdDni") {
      const v = ventaActiva();
      const d = ev.target.value.replace(/\D/g, "").slice(0, 8);
      ev.target.value = d;
      v.dni = d;
      v.confirmando = false;
      if (dniValido(d)) validarSocio(v, d);
      else { v.socio = null; pintarVenta(); }
    }
  }

  function onChange(ev) {
    if (ev.target.id === "tdFechaLimite") {
      ventaActiva().fechaLimite = ev.target.value || "";
      pintarRegistrar(ventaActiva());
    }
  }

  function plantilla() {
    return `
    <div class="td-wrap">
      <header class="td-head">
        <div>
          <h3><i class="fa-solid fa-bag-shopping"></i> Tienda</h3>
          <p>Venta de suplementos y productos del gimnasio</p>
        </div>
        <button type="button" class="td-btn td-btn--sec td-gestionar" data-accion="gestionar"><i class="fa-solid fa-sliders"></i> Productos</button>
      </header>
      <nav class="td-ventas" id="tdVentas" aria-label="Ventas en curso"></nav>
      <div class="td-grid">
        <section class="card td-catalogo" aria-label="Productos">
          <div class="td-cats" id="tdCats"></div>
          <div class="td-productos" id="tdProductos"></div>
        </section>
        <section class="card td-venta" aria-label="Venta actual">
          <h4>Venta</h4>
          <div id="tdCarrito"></div>
          <div class="td-total"><span>Total</span><b id="tdTotal">S/ 0.00</b></div>
          <div class="td-metodos" role="group" aria-label="Forma de pago">
            <button type="button" data-metodo="efectivo">Efectivo</button>
            <button type="button" data-metodo="yape_plin">Yape / Plin</button>
            <button type="button" data-metodo="fiado">Fiar</button>
          </div>
          <label class="td-campo"><span>DNI del socio</span>
            <input id="tdDni" inputmode="numeric" maxlength="8" placeholder="Obligatorio para fiar" autocomplete="off"></label>
          <div id="tdSocio"></div>
          <div id="tdFiado"></div>
          <div id="tdConfirmar"></div>
          <button id="tdRegistrar" class="td-btn td-btn--main" type="button" disabled>Registrar venta</button>
        </section>
      </div>
      <section class="card td-hoy" aria-label="Ventas de hoy">
        <h4>Ventas de hoy</h4>
        <div id="tdHoy"></div>
      </section>
    </div>`;
  }

  // ---------- Gestión de productos y categorías ----------

  const gest = { editandoId: null, confirmarBorrar: null, filtro: "Todas", guardando: false };

  TD.abrirGestion = async function () {
    const modal = q("modalProductos");
    if (!modal) return;
    modal.hidden = false;
    if (!modal.dataset.listo) {
      modal.dataset.listo = "1";
      modal.innerHTML = `<div class="td-modal" role="dialog" aria-modal="true" aria-labelledby="tdgTitulo">
        <header class="td-deuda-head">
          <div><h3 id="tdgTitulo">Productos y categorías</h3><p>Lo que se vende en la tienda</p></div>
          <button type="button" class="td-cerrar" data-g="cerrar" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
        </header>
        <form id="tdgForm" class="td-form td-gform" novalidate data-solo-admin>
          <h4 id="tdgFormTitulo">Nuevo producto</h4>
          <div class="td-fila-2">
            <label class="td-campo"><span>Nombre</span><input id="tdgNombre" maxlength="80" placeholder="Ej. Proteína 1 kg" autocomplete="off"></label>
            <label class="td-campo"><span>Categoría</span><select id="tdgCat"></select></label>
          </div>
          <div class="td-fila-2">
            <label class="td-campo"><span>Precio (S/)</span><input id="tdgPrecio" type="number" step="0.01" min="0.01" max="9999" inputmode="decimal" placeholder="0.00"></label>
            <label class="td-campo td-check"><span>Control de stock</span>
              <span class="td-switch"><input id="tdgControl" type="checkbox"><i></i> <em>Llevar cantidad disponible</em></span></label>
          </div>
          <label class="td-campo" id="tdgStockCampo" hidden><span>Stock disponible</span>
            <input id="tdgStock" type="number" step="1" min="0" max="100000" inputmode="numeric" placeholder="0">
            <small id="tdgStockAyuda" class="td-ayuda-campo"></small></label>
          <div class="td-botones">
            <button type="button" class="td-btn td-btn--sec" data-g="cancelar-edicion" hidden>Cancelar edición</button>
            <button type="submit" class="td-btn td-btn--main" id="tdgGuardar">Guardar producto</button>
          </div>
        </form>
        <section class="td-gseccion" aria-labelledby="tdgCatTitulo" data-solo-admin>
          <h4 id="tdgCatTitulo">Categorías</h4>
          <div class="td-fila-acciones">
            <input id="tdgNuevaCat" maxlength="40" placeholder="Nueva categoría" autocomplete="off" aria-label="Nombre de la nueva categoría">
            <button type="button" class="td-btn td-btn--sec" data-g="crear-cat">Agregar</button>
          </div>
          <div id="tdgCategorias" class="td-glista"></div>
        </section>
        <section class="td-gseccion" aria-labelledby="tdgProdTitulo">
          <div class="td-gseccion-cab">
            <h4 id="tdgProdTitulo">Productos</h4>
            <select id="tdgFiltro" aria-label="Filtrar por categoría"></select>
          </div>
          <div id="tdgProductos" class="td-glista"></div>
        </section>
      </div>`;
      modal.addEventListener("click", onClickGestion);
      modal.addEventListener("submit", onSubmitGestion);
      modal.addEventListener("change", (ev) => {
        if (ev.target.id === "tdgControl") toggleStockCampo();
        if (ev.target.id === "tdgFiltro") { gest.filtro = ev.target.value; pintarGestion(); }
      });
      document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !modal.hidden) TD.cerrarGestion(); });
    }
    try { await cargarCatalogo(); } catch (e) { mostrarToast("❌ " + mensajeError(e), "#ef4444"); }
    pintarGestion();
    q("tdgNombre").focus();
  };

  TD.cerrarGestion = function () {
    const modal = q("modalProductos");
    if (modal) modal.hidden = true;
  };

  function toggleStockCampo() {
    const on = q("tdgControl").checked;
    q("tdgStockCampo").hidden = !on;
  }

  // Al volver a dibujar las listas se conserva lo que el usuario ya eligió en el formulario
  function llenarSelects() {
    const selCat = q("tdgCat");
    const elegida = selCat.value;
    const opciones = cat.categorias.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    selCat.innerHTML = opciones;
    if (cat.categorias.includes(elegida)) selCat.value = elegida;
    q("tdgFiltro").innerHTML = `<option value="Todas">Todas las categorías</option>` +
      cat.categorias.map((c) => `<option value="${esc(c)}"${c === gest.filtro ? " selected" : ""}>${esc(c)}</option>`).join("");
  }

  function pintarGestion() {
    if (!q("tdgForm")) return;
    llenarSelects();
    const conteo = (c) => cat.productos.filter((p) => p.categoria === c);
    q("tdgCategorias").innerHTML = cat.categorias.length ? cat.categorias.map((c) => {
      const lista = conteo(c);
      const activos = lista.filter((p) => p.activo).length;
      const bloqueada = activos > 0;
      const pendiente = gest.confirmarBorrar === c;
      return `<div class="td-glinea">
        <div><b>${esc(c)}</b><small>${activos} a la venta${lista.length - activos ? ` · ${lista.length - activos} desactivado(s)` : ""}</small></div>
        ${c === "Otros" ? `<span class="td-chip-fijo">Fija</span>` : `
        <button type="button" class="td-btn td-btn--sec td-btn-chico${pendiente ? " td-peligro" : ""}" data-solo-admin data-g="borrar-cat" data-cat="${esc(c)}"
          ${bloqueada ? `disabled title="Tiene ${activos} producto(s) a la venta. Muévalos antes de eliminarla"` : ""}>
          ${pendiente ? "Confirmar" : "Eliminar"}</button>`}
      </div>`;
    }).join("") : `<p class="td-vacio">No hay categorías.</p>`;

    const lista = cat.productos.filter((p) => gest.filtro === "Todas" || p.categoria === gest.filtro);
    q("tdgProductos").innerHTML = lista.length ? lista.map((p) => {
      const stock = tieneControl(p) ? `${p.stock} en stock` : "Sin control de stock";
      return `<article class="td-gprod${p.activo ? "" : " inactivo"}">
        <div class="td-gprod-info">
          <b>${esc(p.nombre)}${p.activo ? "" : ` <em class="td-chip-off">Desactivado</em>`}</b>
          <small>${esc(p.categoria)} · ${soles(p.precio)} · ${esc(stock)}</small>
        </div>
        <div class="td-gprod-acc">
          <button type="button" class="td-btn td-btn--sec td-btn-chico" data-solo-admin data-g="editar" data-id="${esc(p.id)}">Editar</button>
          ${tieneControl(p) && p.activo ? `
          <span class="td-reponer">
            <input type="number" min="1" max="100000" step="1" inputmode="numeric" placeholder="+ uds" data-reponer-input="${esc(p.id)}" aria-label="Unidades a reponer">
            <button type="button" class="td-btn td-btn--sec td-btn-chico" data-g="reponer" data-id="${esc(p.id)}">Reponer</button>
          </span>` : ""}
          <button type="button" class="td-btn td-btn--sec td-btn-chico" data-solo-admin data-g="activar" data-id="${esc(p.id)}" data-activo="${p.activo}">${p.activo ? "Desactivar" : "Activar"}</button>
        </div>
      </article>`;
    }).join("") : `<p class="td-vacio">Todavía no hay productos en esta categoría.</p>`;
  }

  function cargarFormulario(p) {
    gest.editandoId = p ? p.id : null;
    const yaControlado = !!p && tieneControl(p);
    q("tdgStock").readOnly = yaControlado;
    q("tdgStockAyuda").textContent = yaControlado
      ? "Para sumar unidades use «Reponer» en la lista de productos."
      : "Cantidad disponible para vender. Se descuenta con cada venta.";
    q("tdgFormTitulo").textContent = p ? "Editar producto" : "Nuevo producto";
    q("tdgNombre").value = p ? p.nombre : "";
    q("tdgCat").value = p ? p.categoria : (cat.categorias[0] || "");
    q("tdgPrecio").value = p ? Number(p.precio).toFixed(2) : "";
    q("tdgControl").checked = p ? tieneControl(p) : false;
    q("tdgStock").value = p && tieneControl(p) ? p.stock : "";
    q("tdgGuardar").textContent = p ? "Guardar cambios" : "Guardar producto";
    q("tdgForm").querySelector('[data-g="cancelar-edicion"]').hidden = !p;
    toggleStockCampo();
    q("tdgNombre").focus();
  }

  // Muestra un error de gestión; si la función aún no existe en la base, lo explica
  function errorGestion(e) {
    const m = mensajeError(e);
    if (/function .* does not exist|Could not find the function|schema cache/i.test(m)) {
      return "Esta función todavía no está instalada en la base de datos. Avise al administrador.";
    }
    return m;
  }

  async function onSubmitGestion(ev) {
    if (ev.target.id !== "tdgForm") return;
    ev.preventDefault();
    if (gest.guardando) return;
    const nombre = q("tdgNombre").value.trim();
    const categoria = q("tdgCat").value;
    const precio = Number(q("tdgPrecio").value);
    const control = q("tdgControl").checked;
    const stockCrudo = q("tdgStock").value.trim();
    const stock = control ? Number(stockCrudo) : null;
    if (control && stockCrudo === "") return mostrarToast("Escriba el stock disponible (0 si no hay)", "#ef4444");
    if (nombre.length < 2) return mostrarToast("Escriba el nombre del producto", "#ef4444");
    if (!categoria) return mostrarToast("Cree primero una categoría", "#ef4444");
    if (!(precio > 0 && precio < 10000)) return mostrarToast("El precio debe ser mayor a S/ 0", "#ef4444");
    if (control && (!Number.isInteger(stock) || stock < 0)) return mostrarToast("El stock debe ser un número entero, desde 0", "#ef4444");
    gest.guardando = true;
    q("tdgGuardar").disabled = true;
    try {
      const { error } = await sb().rpc("guardar_producto", {
        p_id: gest.editandoId, p_nombre: nombre, p_categoria: categoria, p_precio: precio, p_stock: stock,
      });
      if (error) throw error;
      mostrarToast(gest.editandoId ? "✅ Producto actualizado" : "✅ Producto guardado", "#10b981");
      cargarFormulario(null);
    } catch (e) {
      mostrarToast("❌ " + errorGestion(e), "#ef4444");
      return;
    } finally {
      gest.guardando = false;
      q("tdgGuardar").disabled = false;
    }
    try {
      await cargarCatalogo();
      pintarGestion();
      pintarVenta();
    } catch (e) {
      mostrarToast("❌ No se pudo actualizar la lista: " + mensajeError(e), "#ef4444");
    }
  }

  async function onClickGestion(ev) {
    const modal = q("modalProductos");
    if (ev.target === modal) return TD.cerrarGestion();
    const t = ev.target.closest("[data-g]");
    if (!t) return;
    const accion = t.dataset.g;
    try {
      if (accion === "cerrar") return TD.cerrarGestion();
      if (accion === "cancelar-edicion") return cargarFormulario(null);
      if (accion === "editar") return cargarFormulario(cat.productos.find((p) => p.id === t.dataset.id));
      if (accion === "crear-cat") {
        const input = q("tdgNuevaCat");
        const nombre = input.value.trim();
        if (nombre.length < 2) return mostrarToast("Escriba el nombre de la categoría", "#ef4444");
        const { error } = await sb().rpc("crear_categoria", { p_nombre: nombre });
        if (error) throw error;
        input.value = "";
        mostrarToast("✅ Categoría creada", "#10b981");
        await cargarCatalogo();
        return pintarGestion();
      }
      if (accion === "borrar-cat") {
        const nombre = t.dataset.cat;
        if (gest.confirmarBorrar !== nombre) {
          gest.confirmarBorrar = nombre;
          pintarGestion();
          setTimeout(() => { if (gest.confirmarBorrar === nombre) { gest.confirmarBorrar = null; pintarGestion(); } }, 4000);
          return;
        }
        gest.confirmarBorrar = null;
        const { error } = await sb().rpc("eliminar_categoria", { p_nombre: nombre });
        if (error) throw error;
        mostrarToast("✅ Categoría eliminada", "#10b981");
        await cargarCatalogo();
        return pintarGestion();
      }
      if (accion === "activar") {
        const { error } = await sb().rpc("activar_producto", { p_id: t.dataset.id, p_activo: t.dataset.activo !== "true" });
        if (error) throw error;
        mostrarToast("✅ Producto actualizado", "#10b981");
        await cargarCatalogo();
        pintarGestion();
        return pintarVenta();
      }
      if (accion === "reponer") {
        const input = modal.querySelector(`[data-reponer-input="${t.dataset.id}"]`);
        const cantidad = Number(input && input.value);
        if (!Number.isInteger(cantidad) || cantidad < 1) return mostrarToast("Escriba cuántas unidades se reponen", "#ef4444");
        const { error } = await sb().rpc("reponer_stock", { p_id: t.dataset.id, p_cantidad: cantidad });
        if (error) throw error;
        mostrarToast("✅ Stock repuesto", "#10b981");
        await cargarCatalogo();
        pintarGestion();
        return pintarVenta();
      }
    } catch (e) {
      mostrarToast("❌ " + errorGestion(e), "#ef4444");
    }
  }

  // ---------- Formulario de deuda del socio (botón "Deuda") ----------

  // Último socio y resumen cargados en el modal: cambiar de pestaña usa esto (sin consultar otra vez)
  let deudaEnPantalla = null;

  TD.abrirDeuda = async function (dni) {
    const modal = q("modalDeuda");
    const root = q("tdDeudaRoot");
    if (!modal || !root) return;
    modal.hidden = false;
    root.innerHTML = `<p class="td-vacio">Cargando…</p>`;
    try {
      const [{ data: socio, error: e1 }, resumen] = await Promise.all([
        sb().from("socios").select("dni, nombre, tipo_memb, deuda, fecha_deuda").eq("dni", dni).single(),
        TD.resumenSocio(dni),
      ]);
      if (e1 || !socio) throw new Error("No se encontró al socio.");
      root.dataset.dni = dni;
      root.dataset.tab = "membresia";
      deudaEnPantalla = { dni, socio, resumen };
      pintarDeuda(socio, resumen);
    } catch (e) {
      root.innerHTML = `<p class="td-error">${esc(mensajeError(e))}</p>`;
    }
  };

  TD.cerrarDeuda = function () {
    const modal = q("modalDeuda");
    if (modal) modal.hidden = true;
  };

  async function recargarDeuda() {
    const root = q("tdDeudaRoot");
    if (!root || !root.dataset.dni) return;
    const dni = root.dataset.dni;
    let socio, resumen;
    try {
      [{ data: socio }, resumen] = await Promise.all([
        sb().from("socios").select("dni, nombre, tipo_memb, deuda, fecha_deuda").eq("dni", dni).single(),
        TD.resumenSocio(dni),
      ]);
    } catch (e) {
      mostrarToast("❌ " + mensajeError(e), "#ef4444");
      return;
    }
    if (socio) {
      const idx = (window.dataGlobal || []).findIndex((s) => String(s.dni) === String(dni));
      if (idx >= 0) Object.assign(window.dataGlobal[idx], socio);
      deudaEnPantalla = { dni, socio, resumen };
      pintarDeuda(socio, resumen);
      if (q("buscarDni") && q("buscarDni").value === dni && window.buscarAutomatico) window.buscarAutomatico();
    }
  }

  function pintarDeuda(socio, resumen) {
    const root = q("tdDeudaRoot");
    const deuda = parseFloat(String(socio.deuda || "0").replace(/[^0-9.]/g, "")) || 0;
    const pestana = root.dataset.tab || "membresia";
    const pestanas = `
      <div class="td-tabs" role="tablist">
        <button type="button" role="tab" data-pestana="membresia" aria-selected="${pestana === "membresia"}" class="${pestana === "membresia" ? "activa" : ""}">Membresía${deuda > 0 ? ` · ${soles(deuda)}` : ""}</button>
        <button type="button" role="tab" data-pestana="tienda" aria-selected="${pestana === "tienda"}" class="${pestana === "tienda" ? "activa" : ""}">Tienda${resumen.saldo > 0 ? ` · ${soles(resumen.saldo)}` : ""}</button>
      </div>`;
    const cuerpo = pestana === "membresia"
      ? cuerpoMembresia(socio, deuda)
      : cuerpoTienda(resumen);
    root.innerHTML = `
      <header class="td-deuda-head">
        <div><h3 id="tdDeudaTitulo">Deuda de ${esc(socio.nombre)}</h3><p>DNI ${esc(socio.dni)}</p></div>
        <button type="button" class="td-cerrar" data-accion="cerrar-deuda" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
      </header>
      ${pestanas}
      <div class="td-deuda-cuerpo">${cuerpo}</div>`;
  }

  function cuerpoMembresia(socio, deuda) {
    if (deuda <= 0) {
      return `<p class="td-vacio">Este socio no tiene deuda de membresía.</p>`;
    }
    return `
      <div class="td-saldo"><span>Debe por membresía</span><b>${soles(deuda)}</b>
        ${socio.fecha_deuda ? `<small>Desde el ${fechaCorta(socio.fecha_deuda)}</small>` : ""}</div>
      <p class="td-ayuda">La deuda de membresía solo se puede cobrar. Para agregar deuda, inscriba al socio o use la tienda.</p>
      <div class="td-cobro">
        <p class="td-cobro-titulo">Cobrar deuda de membresía</p>
        <label class="td-campo"><span>Monto a cobrar ahora (S/)</span>
          <input id="tdMontoMem" type="number" step="0.01" min="0.01" max="${deuda}" value="${deuda}" inputmode="decimal"></label>
        <div class="td-botones">
          <button type="button" class="td-btn td-btn--sec" data-accion="abonar-mem">Cobrar este monto</button>
          <button type="button" class="td-btn td-btn--main" data-accion="cancelar-mem" data-deuda="${deuda}">Cobrar todo · ${soles(deuda)}</button>
        </div>
      </div>`;
  }

  function cuerpoTienda(resumen) {
    const agregar = `<button type="button" class="td-btn td-btn--sec td-agregar" data-accion="agregar-tienda"><i class="fa-solid fa-plus"></i> Agregar deuda de tienda</button>`;
    if (!resumen.fiados.length) {
      return `<p class="td-vacio">No tiene deudas de tienda.</p>${agregar}`;
    }
    const filas = resumen.fiados.map((f) => `
      <article class="td-deuda-item${f.bloquea ? " td-deuda-item--bloquea" : ""}" data-venta="${esc(f.id)}">
        <header>
          <div>
            <b>${esc(f.articulos)}</b>
            <small>Compra del ${fechaCorta(f.fecha)}</small>
            <span class="td-vence${f.bloquea ? " td-vence--bloquea" : ""}">${esc(textoVencimiento(f))}</span>
          </div>
          <strong>${soles(f.saldo)}</strong>
        </header>
        <div class="td-cobro">
          <p class="td-cobro-titulo">Cobrar</p>
          <div class="td-fila-acciones">
            <label class="td-campo"><span>Monto (S/)</span>
              <input type="number" step="0.01" min="0.01" max="${f.saldo}" value="${f.saldo}" inputmode="decimal" data-monto></label>
            <label class="td-campo"><span>Forma de pago</span>
              <select data-metodo-pago><option value="efectivo">Efectivo</option><option value="yape_plin">Yape / Plin</option></select></label>
          </div>
          <div class="td-botones">
            <button type="button" class="td-btn td-btn--sec" data-accion="abonar-tienda">Cobrar este monto</button>
            <button type="button" class="td-btn td-btn--main" data-accion="cancelar-tienda">Cobrar todo · ${soles(f.saldo)}</button>
          </div>
        </div>
        ${f.total > UMBRAL ? `
        <div class="td-fecha">
          <p class="td-cobro-titulo">Fecha límite de pago</p>
          <label class="td-campo"><span>Fecha en la que debe pagar</span>
            <input type="date" min="${sumarDias(hoyLima(), 1)}" value="${esc(f.vence || "")}" data-fecha></label>
          <div class="td-botones">
            <button type="button" class="td-btn td-btn--sec" data-accion="fecha-tienda">Guardar fecha</button>
            ${f.vence ? `<button type="button" class="td-btn td-btn--sec" data-accion="quitar-fecha">Quitar fecha límite</button>` : ""}
          </div>
        </div>` : `<p class="td-fecha-ayuda">Deudas de hasta S/ ${UMBRAL.toFixed(2)} vencen al día siguiente y no admiten otra fecha límite.</p>`}
      </article>`).join("");
    return `${filas}${agregar}`;
  }

  // Acciones del formulario de deuda
  async function accionDeuda(ev) {
    const root = q("tdDeudaRoot");
    const t = ev.target.closest("[data-accion]");
    if (!t || !root.contains(t)) return;
    // Mientras un cobro se procesa, los demás toques se ignoran (evita cobrar dos veces)
    if (root.dataset.ocupado) return;
    const accion = t.dataset.accion;
    const dni = root.dataset.dni;
    root.dataset.ocupado = "1";
    root.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    try {
      if (accion === "cerrar-deuda") return TD.cerrarDeuda();
      if (accion === "abonar-mem" || accion === "cancelar-mem") {
        const monto = accion === "cancelar-mem"
          ? parseFloat(t.dataset.deuda)
          : parseFloat(q("tdMontoMem").value);
        const { error } = await sb().rpc("abonar_deuda_membresia", { p_dni: dni, p_monto: monto });
        if (error) throw error;
        mostrarToast("✅ Membresía: pago registrado", "#10b981");
        return await recargarDeuda();
      }
      if (accion === "agregar-tienda") {
        TD.cerrarDeuda();
        return TD.iniciarFiado(dni);
      }
      const fila = t.closest("[data-venta]");
      if (!fila) return;
      const ventaId = fila.dataset.venta;
      if (accion === "abonar-tienda" || accion === "cancelar-tienda") {
        const monto = accion === "cancelar-tienda"
          ? parseFloat(fila.querySelector("[data-monto]").max)
          : parseFloat(fila.querySelector("[data-monto]").value);
        const metodo = fila.querySelector("[data-metodo-pago]").value;
        const { error } = await sb().rpc("registrar_pago_tienda", { p_venta_id: ventaId, p_monto: monto, p_metodo: metodo });
        if (error) throw error;
        mostrarToast("✅ Tienda: pago registrado", "#10b981");
        return await recargarDeuda();
      }
      if (accion === "fecha-tienda" || accion === "quitar-fecha") {
        const fecha = accion === "quitar-fecha" ? null : fila.querySelector("[data-fecha]").value || null;
        if (accion === "fecha-tienda" && !fecha) return mostrarToast("Elija una fecha", "#ef4444");
        const { error } = await sb().rpc("fijar_fecha_limite_tienda", { p_venta_id: ventaId, p_fecha: fecha });
        if (error) throw error;
        mostrarToast(fecha ? "✅ Fecha límite guardada" : "✅ Sin fecha límite", "#10b981");
        return await recargarDeuda();
      }
    } catch (e) {
      mostrarToast("❌ " + mensajeError(e), "#ef4444");
    } finally {
      delete root.dataset.ocupado;
      root.querySelectorAll("button").forEach((b) => { b.disabled = false; });
    }
  }

  // Estructura del modal de deuda (se monta una vez)
  function montarModalDeuda() {
    const modal = q("modalDeuda");
    if (!modal || modal.dataset.listo) return;
    modal.dataset.listo = "1";
    modal.addEventListener("click", (ev) => {
      if (ev.target === modal) return TD.cerrarDeuda();
      const pestana = ev.target.closest("[data-pestana]");
      if (pestana) {
        const root = q("tdDeudaRoot");
        root.dataset.tab = pestana.dataset.pestana;
        if (deudaEnPantalla && deudaEnPantalla.dni === root.dataset.dni) {
          pintarDeuda(deudaEnPantalla.socio, deudaEnPantalla.resumen);
          return;
        }
        return recargarDeuda().catch((e) => mostrarToast("❌ " + mensajeError(e), "#ef4444"));
      }
      accionDeuda(ev);
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && !modal.hidden) TD.cerrarDeuda();
    });
  }

  document.addEventListener("DOMContentLoaded", montarModalDeuda);
  if (document.readyState !== "loading") montarModalDeuda();
})();
