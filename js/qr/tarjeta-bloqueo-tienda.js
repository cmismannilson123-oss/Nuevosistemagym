// Parte del flujo del socio (QR). Clásico: mismo ámbito global que antes.
function cyTarjetaBloqueoTienda(nombre, deudas){
  const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  const fecha = (iso) => { if(!iso) return "—"; const [, m, d] = String(iso).split("-").map(Number); return d + " " + MESES[m - 1]; };
  const lista = Array.isArray(deudas) ? deudas : [];
  const total = lista.reduce((s, d) => s + (Number(d.saldo) || 0), 0);
  const filas = lista.map((d) => `
    <li class="tb-fila">
      <div>
        <b>${escaparHTML(d.articulos || "Productos de tienda")}</b>
        <small>Compra del ${escaparHTML(fecha(d.fecha))} · bloqueado desde el ${escaparHTML(fecha(d.vence))}</small>
      </div>
      <strong>S/ ${(Number(d.saldo) || 0).toFixed(2)}</strong>
    </li>`).join("");
  return `
  <article class="tb-card" role="alert" aria-live="assertive">
    <div class="tb-icono" aria-hidden="true"><i class="fa-solid fa-lock"></i></div>
    <p class="tb-kicker">Ingreso bloqueado</p>
    <h2 class="tb-titulo">Deuda de producto fiado</h2>
    <p class="tb-nombre">${escaparHTML(nombre || "Socio")}</p>
    <div class="tb-total"><span>Debe en total</span><b>S/ ${total.toFixed(2)}</b></div>
    <ul class="tb-lista">${filas}</ul>
    <p class="tb-pie"><i class="fa-solid fa-store" aria-hidden="true"></i> Acérquese a recepción para pagar su deuda y activar su ingreso.</p>
  </article>`;
}
