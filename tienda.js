/* ============================================================
   TIENDA DEL GYM — punto de venta, fiados y deudas.
   Solo para el panel del personal (no se carga en la pantalla del QR).
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

  // ---------- Productos ----------

  async function cargarProductos() {
    const { data, error } = await sb().from("productos")
      .select("id, nombre, categoria, precio, activo").order("nombre");
    if (error) throw error;
    st.productos = data || [];
  }

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

  // ---------- Estado del punto de venta ----------

  const st = {
    productos: [],
    carrito: [],          // { id, nombre, precio, cant }
    categoria: "Todas",
    metodo: "efectivo",
    socio: null,          // { dni, nombre } validado
    dni: "",
    fechaLimite: "",
    confirmando: false,
    guardando: false,
  };

  const total = () => st.carrito.reduce((s, l) => s + l.precio * l.cant, 0);

  function pintarCategorias() {
    const cats = ["Todas", ...CATEGORIAS];
    q("tdCats").innerHTML = cats.map((c) =>
      `<button type="button" class="td-cat${st.categoria === c ? " activa" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
  }

  function pintarProductos() {
    const lista = st.productos.filter((p) => p.activo && (st.categoria === "Todas" || p.categoria === st.categoria));
    q("tdProductos").innerHTML = lista.length
      ? lista.map((p) => `
        <button type="button" class="td-prod" data-id="${esc(p.id)}">
          <span class="td-prod-cat">${esc(p.categoria)}</span>
          <b>${esc(p.nombre)}</b>
          <strong>${soles(p.precio)}</strong>
        </button>`).join("")
      : `<p class="td-vacio">No hay productos en esta categoría.</p>`;
  }

  function pintarCarrito() {
    const cont = q("tdCarrito");
    if (!st.carrito.length) {
      cont.innerHTML = `<p class="td-vacio">Toca un producto para agregarlo.</p>`;
    } else {
      cont.innerHTML = st.carrito.map((l) => `
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
    q("tdTotal").textContent = soles(total());
    document.querySelectorAll("#tiendaRoot [data-metodo]").forEach((b) =>
      b.classList.toggle("activo", b.dataset.metodo === st.metodo));
    pintarSocio();
    pintarFiado();
    pintarRegistrar();
  }

  function pintarSocio() {
    const cont = q("tdSocio");
    if (!dniValido(st.dni) && st.dni.length) {
      cont.innerHTML = `<p class="td-ayuda">El DNI tiene 8 números.</p>`;
    } else if (st.socio) {
      cont.innerHTML = `<p class="td-socio-ok"><i class="fa-solid fa-circle-check"></i> ${esc(st.socio.nombre)}</p>`;
    } else {
      cont.innerHTML = "";
    }
  }

  function pintarFiado() {
    const cont = q("tdFiado");
    if (st.metodo !== "fiado") { cont.innerHTML = ""; return; }
    const t = total();
    const ayuda = !st.carrito.length
      ? ""
      : t <= UMBRAL
        ? `<p class="td-ayuda"><i class="fa-solid fa-circle-info"></i> Hasta S/ ${UMBRAL.toFixed(2)}: bloquea la entrada desde ${fechaCorta(sumarDias(hoyLima(), 1))}.</p>`
        : `<p class="td-ayuda"><i class="fa-solid fa-circle-info"></i> Más de S/ ${UMBRAL.toFixed(2)}: elija una fecha límite si quiere que bloquee la entrada. Sin fecha, no bloquea.</p>`;
    const fechaCampo = t > UMBRAL
      ? `<label class="td-campo"><span>Fecha límite (opcional)</span>
           <input id="tdFechaLimite" type="date" min="${sumarDias(hoyLima(), 1)}" value="${esc(st.fechaLimite)}"></label>`
      : "";
    cont.innerHTML = fechaCampo + ayuda;
  }

  function pintarRegistrar() {
    const cont = q("tdConfirmar");
    const btn = q("tdRegistrar");
    const listo = st.carrito.length > 0 && !st.guardando &&
      (st.metodo !== "fiado" || !!st.socio);
    btn.disabled = !listo;
    btn.textContent = st.metodo === "fiado" ? "Registrar fiado" : "Registrar venta";
    if (!st.confirmando) { cont.innerHTML = ""; return; }
    const detalle = st.metodo === "fiado"
      ? `Fiar <b>${soles(total())}</b> a <b>${esc(st.socio.nombre)}</b>${st.fechaLimite
          ? `, con fecha límite el ${fechaCorta(st.fechaLimite)}`
          : total() <= UMBRAL ? `, que bloquea desde ${fechaCorta(sumarDias(hoyLima(), 1))}` : ", sin fecha límite (no bloquea)"}.`
      : `Cobrar <b>${soles(total())}</b> en ${st.metodo === "yape_plin" ? "Yape / Plin" : "efectivo"}.`;
    cont.innerHTML = `<div class="td-confirmar" role="alertdialog" aria-label="Confirmar venta">
      <p>${detalle}</p>
      <div class="td-botones">
        <button type="button" class="td-btn td-btn--sec" data-accion="cancelar-confirmar">Cancelar</button>
        <button type="button" class="td-btn td-btn--main" data-accion="confirmar">Confirmar</button>
      </div></div>`;
  }

  // Valida el DNI del socio (para fiar o para asociar la venta)
  async function validarSocio(dni) {
    st.socio = null;
    if (!dniValido(dni)) { pintarCarrito(); return; }
    const { data, error } = await sb().from("socios").select("dni, nombre").eq("dni", dni).single();
    if (st.dni !== dni) return; // cambió mientras consultaba
    if (error || !data) {
      q("tdSocio").innerHTML = `<p class="td-error"><i class="fa-solid fa-circle-xmark"></i> No hay socio con ese DNI.</p>`;
      pintarRegistrar();
      return;
    }
    st.socio = { dni: data.dni, nombre: data.nombre };
    pintarCarrito();
  }

  function agregar(id) {
    const p = st.productos.find((x) => x.id === id);
    if (!p) return;
    const linea = st.carrito.find((l) => l.id === id);
    if (linea) linea.cant = Math.min(linea.cant + 1, 50);
    else st.carrito.push({ id: p.id, nombre: p.nombre, precio: Number(p.precio), cant: 1 });
    st.confirmando = false;
    pintarCarrito();
  }

  function cambiarCantidad(id, delta) {
    const linea = st.carrito.find((l) => l.id === id);
    if (!linea) return;
    linea.cant += delta;
    if (linea.cant < 1) st.carrito = st.carrito.filter((l) => l.id !== id);
    else linea.cant = Math.min(linea.cant, 50);
    st.confirmando = false;
    pintarCarrito();
  }

  function limpiarVenta() {
    st.carrito = [];
    st.dni = "";
    st.socio = null;
    st.fechaLimite = "";
    st.confirmando = false;
    st.metodo = "efectivo";
    q("tdDni").value = "";
    pintarCarrito();
  }

  async function registrarVenta() {
    if (st.guardando || !st.carrito.length) return;
    if (st.metodo === "fiado" && !st.socio) return;
    st.guardando = true;
    pintarRegistrar();
    try {
      const items = st.carrito.map((l) => ({ producto_id: l.id, cantidad: l.cant }));
      const dni = st.socio ? st.socio.dni : null;
      const fecha = st.metodo === "fiado" && st.fechaLimite && total() > UMBRAL ? st.fechaLimite : null;
      const { data, error } = await sb().rpc("registrar_venta", {
        p_items: items, p_metodo: st.metodo, p_dni: dni, p_fecha_limite: fecha,
      });
      if (error) throw error;
      const etiqueta = st.metodo === "fiado" ? "Fiado registrado" : "Venta registrada";
      mostrarToast("✅ " + etiqueta + " · " + soles(data.total), "#10b981");
      limpiarVenta();
      cargarVentasHoy();
    } catch (e) {
      mostrarToast("❌ " + mensajeError(e), "#ef4444");
    } finally {
      st.guardando = false;
      pintarRegistrar();
    }
  }

  async function guardarProducto(ev) {
    ev.preventDefault();
    const nombre = q("tdPNombre").value.trim();
    const precio = Number(q("tdPPrecio").value);
    const categoria = q("tdPCat").value;
    if (nombre.length < 2) return mostrarToast("Escriba el nombre del producto", "#ef4444");
    if (!(precio > 0 && precio < 10000)) return mostrarToast("El precio debe ser mayor a S/ 0", "#ef4444");
    try {
      const { error } = await sb().from("productos").insert({ nombre, categoria, precio });
      if (error) throw error;
      mostrarToast("✅ Producto agregado", "#10b981");
      q("tdFormProducto").reset();
      await cargarProductos();
      pintarCategorias();
      pintarProductos();
    } catch (e) {
      mostrarToast("❌ " + mensajeError(e), "#ef4444");
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
      root.addEventListener("submit", onSubmit);
    }
    try {
      await cargarProductos();
    } catch (e) {
      mostrarToast("❌ " + mensajeError(e), "#ef4444");
    }
    pintarCategorias();
    pintarProductos();
    pintarCarrito();
    cargarVentasHoy();
  };

  // Preselecciona un socio y el método fiar (desde el formulario de deuda)
  TD.iniciarFiado = async function (dni) {
    await TD.montar();
    st.dni = dni;
    st.metodo = "fiado";
    q("tdDni").value = dni;
    await validarSocio(dni);
    q("tiendaRoot").scrollIntoView({ behavior: "smooth", block: "start" });
  };

  function onClick(ev) {
    const t = ev.target.closest("button, [data-accion]");
    if (!t) return;
    if (t.dataset.cat) { st.categoria = t.dataset.cat; pintarCategorias(); pintarProductos(); return; }
    if (t.dataset.id) return agregar(t.dataset.id);
    if (t.dataset.sumar) return cambiarCantidad(t.dataset.sumar, +1);
    if (t.dataset.restar) return cambiarCantidad(t.dataset.restar, -1);
    if (t.dataset.metodo) {
      st.metodo = t.dataset.metodo;
      st.confirmando = false;
      if (st.metodo !== "fiado") st.fechaLimite = "";
      return pintarCarrito();
    }
    if (t.dataset.accion === "limpiar") return limpiarVenta();
    if (t.dataset.accion === "cancelar-confirmar") { st.confirmando = false; return pintarRegistrar(); }
    if (t.dataset.accion === "confirmar") { st.confirmando = false; return registrarVenta(); }
    if (t.id === "tdRegistrar") { st.confirmando = true; return pintarRegistrar(); }
  }

  function onInput(ev) {
    if (ev.target.id === "tdDni") {
      const v = ev.target.value.replace(/\D/g, "").slice(0, 8);
      ev.target.value = v;
      st.dni = v;
      st.confirmando = false;
      if (dniValido(v)) validarSocio(v);
      else { st.socio = null; pintarCarrito(); }
    }
  }

  function onChange(ev) {
    if (ev.target.id === "tdFechaLimite") {
      st.fechaLimite = ev.target.value || "";
      pintarRegistrar();
    }
  }

  function onSubmit(ev) {
    if (ev.target.id === "tdFormProducto") guardarProducto(ev);
  }

  function plantilla() {
    return `
    <div class="td-wrap">
      <header class="td-head">
        <h3><i class="fa-solid fa-bag-shopping"></i> Tienda</h3>
        <p>Venta de suplementos y productos del gimnasio</p>
      </header>
      <div class="td-grid">
        <section class="card td-catalogo" aria-label="Productos">
          <div class="td-cats" id="tdCats"></div>
          <div class="td-productos" id="tdProductos"></div>
          <details class="td-nuevo">
            <summary><i class="fa-solid fa-plus"></i> Agregar producto</summary>
            <form id="tdFormProducto" class="td-form">
              <label class="td-campo"><span>Nombre</span><input id="tdPNombre" maxlength="80" placeholder="Ej. Proteína 1 kg" required></label>
              <label class="td-campo"><span>Categoría</span>
                <select id="tdPCat">${CATEGORIAS.map((c) => `<option>${c}</option>`).join("")}</select></label>
              <label class="td-campo"><span>Precio (S/)</span>
                <input id="tdPPrecio" type="number" step="0.01" min="0.01" max="9999" inputmode="decimal" placeholder="0.00" required></label>
              <button class="td-btn td-btn--sec" type="submit">Guardar producto</button>
            </form>
          </details>
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

  // ---------- Formulario de deuda del socio (botón "Deuda") ----------

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
    const [{ data: socio }, resumen] = await Promise.all([
      sb().from("socios").select("dni, nombre, tipo_memb, deuda, fecha_deuda").eq("dni", dni).single(),
      TD.resumenSocio(dni),
    ]);
    if (socio) {
      const idx = (window.dataGlobal || []).findIndex((s) => String(s.dni) === String(dni));
      if (idx >= 0) Object.assign(window.dataGlobal[idx], socio);
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
      <p class="td-ayuda">La deuda de membresía solo se puede abonar o cancelar. Para agregar deuda, inscriba al socio o use la tienda.</p>
      <div class="td-accion">
        <label class="td-campo"><span>Monto a abonar (S/)</span>
          <input id="tdMontoMem" type="number" step="0.01" min="0.01" max="${deuda}" value="${deuda}" inputmode="decimal"></label>
        <div class="td-botones">
          <button type="button" class="td-btn td-btn--sec" data-accion="abonar-mem">Abonar</button>
          <button type="button" class="td-btn td-btn--main" data-accion="cancelar-mem" data-deuda="${deuda}">Cancelar deuda (${soles(deuda)})</button>
        </div>
      </div>`;
  }

  function cuerpoTienda(resumen) {
    const agregar = `<button type="button" class="td-btn td-btn--sec td-agregar" data-accion="agregar-tienda"><i class="fa-solid fa-plus"></i> Agregar deuda de tienda</button>`;
    if (!resumen.fiados.length) {
      return `<p class="td-vacio">No tiene deudas de tienda.</p>${agregar}`;
    }
    const filas = resumen.fiados.map((f) => `
      <article class="td-deuda-item${f.bloquea ? " td-fila--bloquea" : ""}" data-venta="${esc(f.id)}">
        <header>
          <div><b>${esc(f.articulos)}</b><small>${fechaCorta(f.fecha)} · ${esc(textoVencimiento(f))}</small></div>
          <strong>${soles(f.saldo)}</strong>
        </header>
        <div class="td-accion">
          <div class="td-fila-acciones">
            <input type="number" step="0.01" min="0.01" max="${f.saldo}" value="${f.saldo}" inputmode="decimal" data-monto aria-label="Monto a abonar">
            <select data-metodo-pago aria-label="Forma de pago"><option value="efectivo">Efectivo</option><option value="yape_plin">Yape / Plin</option></select>
          </div>
          <div class="td-botones">
            <button type="button" class="td-btn td-btn--sec" data-accion="abonar-tienda">Abonar</button>
            <button type="button" class="td-btn td-btn--main" data-accion="cancelar-tienda">Cancelar saldo</button>
          </div>
          ${f.total > UMBRAL ? `
          <div class="td-fila-acciones">
            <input type="date" min="${sumarDias(hoyLima(), 1)}" value="${esc(f.vence || "")}" data-fecha aria-label="Fecha límite">
            <button type="button" class="td-btn td-btn--sec" data-accion="fecha-tienda">Guardar fecha</button>
            ${f.vence ? `<button type="button" class="td-btn td-btn--sec" data-accion="quitar-fecha">Sin fecha</button>` : ""}
          </div>` : `<p class="td-ayuda">Deudas de hasta S/ ${UMBRAL.toFixed(2)} vencen al día siguiente y no admiten otra fecha.</p>`}
        </div>
      </article>`).join("");
    return `${filas}${agregar}`;
  }

  // Acciones del formulario de deuda
  async function accionDeuda(ev) {
    const root = q("tdDeudaRoot");
    const t = ev.target.closest("[data-accion]");
    if (!t || !root.contains(t)) return;
    const accion = t.dataset.accion;
    const dni = root.dataset.dni;
    try {
      if (accion === "cerrar-deuda") return TD.cerrarDeuda();
      if (accion === "abonar-mem" || accion === "cancelar-mem") {
        const monto = accion === "cancelar-mem"
          ? parseFloat(t.dataset.deuda)
          : parseFloat(q("tdMontoMem").value);
        const { error } = await sb().rpc("abonar_deuda_membresia", { p_dni: dni, p_monto: monto });
        if (error) throw error;
        mostrarToast("✅ Membresía: pago registrado", "#10b981");
        return recargarDeuda();
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
        return recargarDeuda();
      }
      if (accion === "fecha-tienda" || accion === "quitar-fecha") {
        const fecha = accion === "quitar-fecha" ? null : fila.querySelector("[data-fecha]").value || null;
        if (accion === "fecha-tienda" && !fecha) return mostrarToast("Elija una fecha", "#ef4444");
        const { error } = await sb().rpc("fijar_fecha_limite_tienda", { p_venta_id: ventaId, p_fecha: fecha });
        if (error) throw error;
        mostrarToast(fecha ? "✅ Fecha límite guardada" : "✅ Sin fecha límite", "#10b981");
        return recargarDeuda();
      }
    } catch (e) {
      mostrarToast("❌ " + mensajeError(e), "#ef4444");
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
        q("tdDeudaRoot").dataset.tab = pestana.dataset.pestana;
        return recargarDeuda();
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
