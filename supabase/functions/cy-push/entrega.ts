// Lógica de entrega de los avisos (sin dependencias: se prueba con Node en tools/verificacion).
// Un aviso se confirma en la cola solo cuando llegó a todos los celulares Android que deben recibirlo.

export type ResultadoFcm = "ok" | "muerto" | "fallo";

// Errores temporales de Firebase: cuota, servidor o red. Se reintentan.
export function esTemporal(status: number, texto: string): boolean {
  if (status === 429 || status >= 500 || status === 0) return true;
  return /UNAVAILABLE|INTERNAL|QUOTA_EXCEEDED|DEADLINE_EXCEEDED/.test(texto);
}

// El token ya no existe (app desinstalada): no se reintenta y se borra.
export function esTokenMuerto(status: number, texto: string): boolean {
  return status === 404 || texto.includes("UNREGISTERED");
}

// Intenta enviar a un token con reintentos para los errores temporales.
// enviar() devuelve { status, texto }; status 0 = error de red.
export async function enviarConReintentos(
  enviar: () => Promise<{ status: number; texto: string }>,
  esperas: number[] = [300, 1000, 2500],
  dormir: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<ResultadoFcm> {
  for (let intento = 0; ; intento++) {
    let r: { status: number; texto: string };
    try {
      r = await enviar();
    } catch {
      r = { status: 0, texto: "red" };
    }
    if (r.status >= 200 && r.status < 300) return "ok";
    if (esTokenMuerto(r.status, r.texto)) return "muerto";
    if (!esTemporal(r.status, r.texto) || intento >= esperas.length) return "fallo";
    await dormir(esperas[intento]);
  }
}

// ¿Se puede marcar el aviso como entregado en la cola?
// - Si hay celulares Android: todos deben haberlo recibido (los muertos no cuentan: ya no existen).
// - Si no hay Android: basta con que llegue a alguna suscripción web (o que no haya ninguna).
export function debeConfirmar(p: { resultadosFcm: ResultadoFcm[]; subsWeb: number; webOk: number }): boolean {
  const fallos = p.resultadosFcm.filter((r) => r === "fallo").length;
  if (p.resultadosFcm.length > 0) return fallos === 0;
  return p.subsWeb === 0 || p.webOk > 0;
}
