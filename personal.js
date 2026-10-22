/* ============================================================
   AJUSTES DEL ADMINISTRADOR — cuentas del personal.
   Solo para el dueño (el panel no muestra este botón a recepción).
   Las reglas viven en la base de datos; aquí solo se piden las acciones.
   ============================================================ */
(function () {
  "use strict";

  const esc = (t) => escaparHTML(t);
  const st = { cuentas: [], confirmar: null, claveDe: null, ocupado: false };
  const MIN_CLAVE = 8;

  const q = (id) => document.getElementById(id);
  const mensajeError = (e) => (e && e.message) || "Ocurrió un error. Inténtalo de nuevo.";
  const fechaCorta = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Lima" });
  };

  window.cyAbrirAjustes = async function () {
    const modal = q("modalAjustes");
    if (!modal || document.documentElement.dataset.rol !== "admin") return;
    modal.hidden = false;
    st.confirmar = null;
    st.claveDe = null;
    await cargarCuentas();
  };

  window.cyCerrarAjustes = function () {
    const modal = q("modalAjustes");
    if (modal) modal.hidden = true;
    st.confirmar = null;
    st.claveDe = null;
  };

  async function cargarCuentas() {
    const cont = q("cyPersonal");
    cont.innerHTML = `<p class="td-vacio">Cargando cuentas…</p>`;
    try {
      const { data, error } = await supabaseClient.rpc("listar_personal");
      if (error) throw error;
      st.cuentas = data || [];
      pintar();
    } catch (e) {
      cont.innerHTML = `<p class="td-error">${esc(mensajeError(e))}</p>`;
    }
  }

  function formClave(userId) {
    return `
      <form class="td-form td-form-clave" data-form="clave" data-user="${esc(userId)}" autocomplete="off">
        <label class="td-campo"><span>Nueva contraseña (mínimo ${MIN_CLAVE} caracteres)</span>
          <input name="clave" type="password" autocomplete="new-password" minlength="${MIN_CLAVE}" maxlength="72" required></label>
        <label class="td-campo"><span>Repetir la contraseña</span>
          <input name="clave2" type="password" autocomplete="new-password" minlength="${MIN_CLAVE}" maxlength="72" required></label>
        <div class="td-botones">
          <button type="button" class="td-btn td-btn--sec" data-accion="cancelar-clave">Cancelar</button>
          <button type="submit" class="td-btn td-btn--main">Guardar contraseña</button>
        </div>
      </form>`;
  }

  function pintar() {
    const cont = q("cyPersonal");
    if (!st.cuentas.length) {
      cont.innerHTML = `<p class="td-vacio">No hay cuentas del personal.</p>`;
      return;
    }
    cont.innerHTML = st.cuentas.map((c) => {
      const esAdmin = c.rol === "admin";
      const etiqueta = esAdmin ? "Administrador" : "Recepción";
      const pendiente = st.confirmar === c.user_id;
      const acciones = esAdmin
        ? `<p class="td-ayuda">Esta es tu cuenta de administrador.</p>`
        : `<div class="td-botones">
             <button type="button" class="td-btn td-btn--sec" data-accion="cambiar-clave" data-user="${esc(c.user_id)}">Cambiar contraseña</button>
             <button type="button" class="td-btn td-btn--main${pendiente ? " td-peligro" : ""}" data-accion="cerrar-sesiones" data-user="${esc(c.user_id)}">
               ${pendiente ? "Confirmar: cerrar sus sesiones" : "Cerrar sesión en sus dispositivos"}</button>
           </div>
           ${st.claveDe === c.user_id ? formClave(c.user_id) : ""}`;
      return `<article class="td-gprod">
        <div class="td-gprod-info">
          <b>${esc(c.nombre || c.email)}</b>
          <small>${esc(c.email)} · ${etiqueta} · desde ${esc(fechaCorta(c.creado))}</small>
        </div>
        ${acciones}
      </article>`;
    }).join("");
  }

  async function cerrarSesiones(userId) {
    if (st.confirmar !== userId) {
      st.confirmar = userId;
      pintar();
      setTimeout(() => { if (st.confirmar === userId) { st.confirmar = null; pintar(); } }, 5000);
      return;
    }
    st.confirmar = null;
    const { error } = await supabaseClient.rpc("cerrar_sesiones_personal", { p_user: userId });
    if (error) throw error;
    mostrarToast("✅ Sesiones cerradas. Esa cuenta ya no puede seguir usando el panel.", "#10b981");
    pintar();
  }

  async function guardarClave(form) {
    const clave = form.elements.clave.value;
    const clave2 = form.elements.clave2.value;
    if (clave.length < MIN_CLAVE) return mostrarToast(`La contraseña debe tener al menos ${MIN_CLAVE} caracteres`, "#ef4444");
    if (clave !== clave2) return mostrarToast("Las dos contraseñas no coinciden", "#ef4444");
    const { error } = await supabaseClient.rpc("cambiar_clave_personal", { p_user: form.dataset.user, p_clave: clave });
    if (error) throw error;
    form.reset();
    st.claveDe = null;
    mostrarToast("✅ Contraseña cambiada. Sus sesiones abiertas se cerraron.", "#10b981");
    pintar();
  }

  async function onClick(ev) {
    const t = ev.target.closest("[data-accion]");
    if (!t || st.ocupado) return;
    const accion = t.dataset.accion;
    try {
      if (accion === "cambiar-clave") { st.claveDe = t.dataset.user; st.confirmar = null; return pintar(); }
      if (accion === "cancelar-clave") { st.claveDe = null; return pintar(); }
      if (accion === "cerrar-sesiones") {
        st.ocupado = true;
        try { await cerrarSesiones(t.dataset.user); } finally { st.ocupado = false; }
        return;
      }
    } catch (e) {
      st.ocupado = false;
      mostrarToast("❌ " + mensajeError(e), "#ef4444");
    }
  }

  async function onSubmit(ev) {
    const form = ev.target.closest("form[data-form='clave']");
    if (!form) return;
    ev.preventDefault();
    if (st.ocupado) return;
    st.ocupado = true;
    try { await guardarClave(form); }
    catch (e) { mostrarToast("❌ " + mensajeError(e), "#ef4444"); }
    finally { st.ocupado = false; }
  }

  function montar() {
    const modal = q("modalAjustes");
    if (!modal || modal.dataset.listo) return;
    modal.dataset.listo = "1";
    modal.addEventListener("click", (ev) => {
      if (ev.target === modal) return window.cyCerrarAjustes();
      if (ev.target.closest(".td-cerrar")) return window.cyCerrarAjustes();
      onClick(ev);
    });
    modal.addEventListener("submit", onSubmit);
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && !modal.hidden) window.cyCerrarAjustes();
    });
  }

  document.addEventListener("DOMContentLoaded", montar);
  if (document.readyState !== "loading") montar();
})();
