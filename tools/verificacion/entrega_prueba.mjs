// Pruebas de la lógica de entrega de cy-push (supabase/functions/cy-push/entrega.ts).
// Uso: node --experimental-strip-types tools/verificacion/entrega_prueba.mjs
import assert from "node:assert/strict";
import { esTemporal, esTokenMuerto, enviarConReintentos, debeConfirmar } from "../../supabase/functions/cy-push/entrega.ts";

const sinEspera = async () => {};
const seguidas = (...rs) => { let i = 0; return async () => rs[Math.min(i++, rs.length - 1)]; };
let n = 0;
const caso = async (nombre, fn) => { await fn(); n++; console.log("ok -", nombre); };

await caso("429, 5xx y red son temporales", async () => {
  assert.equal(esTemporal(429, ""), true); assert.equal(esTemporal(503, ""), true); assert.equal(esTemporal(0, "red"), true);
  assert.equal(esTemporal(400, "INVALID_ARGUMENT"), false);
});
await caso("404 o UNREGISTERED: token muerto", async () => {
  assert.equal(esTokenMuerto(404, ""), true); assert.equal(esTokenMuerto(400, "UNREGISTERED"), true); assert.equal(esTokenMuerto(503, ""), false);
});
await caso("entrega al primer intento", async () => {
  assert.equal(await enviarConReintentos(seguidas({ status: 200, texto: "" }), [1], sinEspera), "ok");
});
await caso("un 503 y luego ok: se reintenta y llega", async () => {
  assert.equal(await enviarConReintentos(seguidas({ status: 503, texto: "UNAVAILABLE" }, { status: 200, texto: "" }), [1, 1], sinEspera), "ok");
});
await caso("error de red y luego ok", async () => {
  let k = 0;
  const f = async () => { if (k++ === 0) throw new Error("red caída"); return { status: 200, texto: "" }; };
  assert.equal(await enviarConReintentos(f, [1], sinEspera), "ok");
});
await caso("token muerto no se reintenta", async () => {
  let llamadas = 0;
  const f = async () => { llamadas++; return { status: 404, texto: "UNREGISTERED" }; };
  assert.equal(await enviarConReintentos(f, [1, 1, 1], sinEspera), "muerto"); assert.equal(llamadas, 1);
});
await caso("error permanente (400) no se reintenta y queda como fallo", async () => {
  let llamadas = 0;
  const f = async () => { llamadas++; return { status: 400, texto: "INVALID_ARGUMENT" }; };
  assert.equal(await enviarConReintentos(f, [1, 1, 1], sinEspera), "fallo"); assert.equal(llamadas, 1);
});
await caso("temporal que nunca se recupera: fallo tras agotar esperas", async () => {
  let llamadas = 0;
  const f = async () => { llamadas++; return { status: 503, texto: "" }; };
  assert.equal(await enviarConReintentos(f, [1, 1], sinEspera), "fallo"); assert.equal(llamadas, 3);
});
await caso("confirmar: todos los Android recibieron", async () => {
  assert.equal(debeConfirmar({ resultadosFcm: ["ok", "ok"], subsWeb: 0, webOk: 0 }), true);
});
await caso("confirmar: uno de dos Android falló: NO confirmar (la cola reintenta)", async () => {
  assert.equal(debeConfirmar({ resultadosFcm: ["ok", "fallo"], subsWeb: 1, webOk: 1 }), false);
});
await caso("confirmar: el Android que no existe ya no cuenta como pendiente", async () => {
  assert.equal(debeConfirmar({ resultadosFcm: ["muerto", "ok"], subsWeb: 0, webOk: 0 }), true);
});
await caso("confirmar: sin Android, basta con una suscripción web", async () => {
  assert.equal(debeConfirmar({ resultadosFcm: [], subsWeb: 2, webOk: 1 }), true);
  assert.equal(debeConfirmar({ resultadosFcm: [], subsWeb: 2, webOk: 0 }), false);
  assert.equal(debeConfirmar({ resultadosFcm: [], subsWeb: 0, webOk: 0 }), true);
});
console.log(`\n${n} comprobaciones de entrega OK`);
