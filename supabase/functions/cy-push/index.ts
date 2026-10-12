// ============================================================
// cy-push — envía las notificaciones del gimnasio a los celulares del
// personal (Web Push), sin ntfy.
// La llama la base de datos (public._enviar_push) al guardarse cada
// asistencia, o el botón "Probar" del panel. Solo acepta llamadas que traen
// el secreto guardado en admin_config ('push_secreto').
// ============================================================
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

let config: Record<string, string> | null = null;
async function leerConfig() {
  if (config) return config;
  const { data, error } = await sb.from("admin_config").select("clave, valor")
    .in("clave", ["push_secreto", "vapid_publica", "vapid_privada"]);
  if (error) throw error;
  const c: Record<string, string> = Object.fromEntries((data ?? []).map((r) => [r.clave, r.valor]));
  if (!c.push_secreto || !c.vapid_publica || !c.vapid_privada) return c; // aún sin llaves: no se guarda
  webpush.setVapidDetails("mailto:fitnessgym21@gmail.com", c.vapid_publica, c.vapid_privada);
  config = c;
  return config;
}


// ---------- Firebase (FCM): la app Android del administrador ----------
// Usa la cuenta de servicio guardada como secreto FCM_SERVICE_ACCOUNT. El envío
// es "de datos" con prioridad alta: llega aunque la pantalla esté apagada y la
// app nativa lo lee en voz alta.
let fcmCuenta: { project_id: string; client_email: string; private_key: string } | null = null;
let fcmAcceso: { token: string; vence: number } | null = null;

function b64url(bytes: Uint8Array | string): string {
  const b = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function accesoFcm(): Promise<string | null> {
  const crudo = Deno.env.get("FCM_SERVICE_ACCOUNT");
  if (!crudo) return null;                       // sin cuenta: se omite Firebase
  if (!fcmCuenta) fcmCuenta = JSON.parse(crudo);
  if (fcmAcceso && fcmAcceso.vence > Date.now() + 60_000) return fcmAcceso.token;
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const cuerpo = b64url(JSON.stringify({
    iss: fcmCuenta!.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: ahora, exp: ahora + 3600,
  }));
  const pem = fcmCuenta!.private_key.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const clave = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const firma = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", clave, new TextEncoder().encode(cabecera + "." + cuerpo)));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: cabecera + "." + cuerpo + "." + b64url(firma) }),
  });
  if (!r.ok) { console.error("FCM token falló", r.status); return null; }
  const j = await r.json();
  fcmAcceso = { token: j.access_token, vence: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return fcmAcceso.token;
}

// Envía el mismo aviso a cada celular de la app nativa. Devuelve cuántos lo recibieron.
async function enviarFcm(tokens: string[], datos: Record<string, string>): Promise<number> {
  if (!tokens.length) return 0;
  const acceso = await accesoFcm();
  if (!acceso) return 0;
  let ok = 0;
  const muertos: string[] = [];
  await Promise.all(tokens.map(async (token) => {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${fcmCuenta!.project_id}/messages:send`, {
      method: "POST",
      headers: { "Authorization": "Bearer " + acceso, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { token, data: datos, android: { priority: "HIGH", ttl: "3600s" } } }),
    });
    if (r.ok) ok++;
    else {
      const txt = await r.text();
      // Token que ya no existe (app desinstalada): se borra
      if (r.status === 404 || txt.includes("UNREGISTERED")) muertos.push(token);
      else console.error("FCM falló", r.status, txt.slice(0, 200));
    }
  }));
  if (muertos.length) await sb.from("fcm_tokens").delete().in("token", muertos);
  return ok;
}

// Saludo de bienvenida, igual criterio que el panel (terminación del nombre)
function saludoVoz(nombre: string): string {
  const n = String(nombre || "").trim().split(/\s+/)[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const esFem = /a$/.test(n) && !/(ma|pa|ta)$/.test(n) || /(eth|lyn|line|elle|ette)$/.test(n);
  const esMasc = /o$/.test(n) || /[bcdfgjklmnprstvxz]$/.test(n);
  if (esFem) return `Bienvenida, ${nombre}`;
  if (esMasc) return `Bienvenido, ${nombre}`;
  return `Te damos la bienvenida, ${nombre}`;
}

// Lo que la voz dice al recepcionista/socio, según el caso (acordado con el panel)
const MOTIVO_VOZ: Record<string, string> = {
  VENCIDO: "Tu membresía venció. Por favor, acércate a recepción, en un momento te atendemos.",
  AGOTADO: "Ya usaste todas las asistencias de tu plan. Por favor, acércate a recepción, en un momento te atendemos.",
  DEUDA: "Por favor, acércate a recepción, en un momento te atendemos.",
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const hoyLima = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
const primerNombre = (n: string) => String(n || "Socio").trim().split(/\s+/).slice(0, 2).join(" ");

async function mensajeIngreso(ev: { dni: string; nombre: string; metodo?: string; hora?: string; fecha?: string; pendiente_id?: number }) {
  const { data: s } = await sb.from("socios")
    .select("nombre, tipo_memb, fecha_fin, dias_restantes, dias_totales, deuda")
    .eq("dni", ev.dni).maybeSingle();
  const nombre = String(s?.nombre || ev.nombre || "Socio").trim();
  const deuda = parseFloat(String(s?.deuda ?? "0").replace(/[^0-9.]/g, "")) || 0;
  const partes: string[] = [];
  let estado = "Activo";
  let diasVence: number | null = null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s?.fecha_fin || ""));
  if (m) {
    diasVence = Math.round((Date.parse(m[0]) - Date.parse(hoyLima())) / 864e5);
  }
  if (deuda > 0) estado = `Debe S/ ${deuda}`;
  partes.push(estado);
  if (s?.tipo_memb) partes.push(String(s.tipo_memb).trim());
  const total = Number(s?.dias_totales) || 0;
  if (total) partes.push(`${Math.max(0, total - (Number(s?.dias_restantes) || 0))}/${total} asistencias`);
  if (m) {
    partes.push(diasVence !== null && diasVence <= 3
      ? (diasVence <= 0 ? "vence hoy" : `vence en ${diasVence} ${diasVence === 1 ? "día" : "días"}`)
      : `vence ${m[3]} ${MESES[+m[2] - 1]}`);
  }
  const via = ev.metodo === "QR" ? "por QR" : "en recepción";
  // Hora REAL del ingreso (Lima), no la hora en que llega el aviso
  const hora = String(ev.hora || "").slice(0, 5);
  const ts = ev.fecha && ev.hora ? Date.parse(`${ev.fecha}T${String(ev.hora).slice(0, 8)}-05:00`) : Date.now();
  const alerta = deuda > 0 || (diasVence !== null && diasVence <= 3);
  return {
    title: `${alerta ? "⚠️" : "✅"} Ingresó ${nombre}`,
    body: `${hora ? hora + " · " : ""}${partes.join(" · ")} — ${via}`,
    tag: "ingreso-" + (ev.pendiente_id ?? ev.dni),
    ts,
    dni: ev.dni,
    nombre,
    metodo: ev.metodo === "QR" ? "QR" : "Manual",
    tipo: "ingreso",
    url: "./?app=panel",
    voz: deuda > 0
      ? `${primerNombre(nombre)}, tiene una deuda de ${deuda} soles. Por favor, acércate a recepción.`
      : `${saludoVoz(primerNombre(nombre))}.${diasVence !== null && diasVence <= 3 && diasVence >= 0 ? ` Tu membresía vence en ${diasVence} ${diasVence === 1 ? "día" : "días"}.` : ""}`,
  };
}

Deno.serve(async (req) => {
  try {
    const cfg = await leerConfig();
    if (!cfg.push_secreto || req.headers.get("x-cy-secreto") !== cfg.push_secreto) {
      return new Response("no autorizado", { status: 401 });
    }
    const ev = await req.json();
    let aviso;
    let consulta = sb.from("push_suscripciones").select("id, endpoint, p256dh, auth");
    if (ev.tipo === "ingreso") {
      aviso = await mensajeIngreso(ev);
    } else if (ev.tipo === "intento") {
      const motivos: Record<string, string> = {
        VENCIDO: "Membresía vencida",
        AGOTADO: "Asistencias del plan agotadas",
        DEUDA: "Bloqueado por deuda",
      };
      const nombre = String(ev.nombre || "Un socio").trim();
      aviso = {
        title: `⛔ ${nombre} intentó ingresar`,
        body: `${motivos[ev.motivo] ?? "No puede ingresar"} — está esperando en recepción`,
        voz: ev.motivo === "DEUDA"
          ? `Membresía bloqueada, ${nombre}. Deuda pendiente.`
          : `Membresía vencida o agotada, ${nombre}.`,
        tag: "intento-" + ev.dni,
        dni: ev.dni, nombre, motivo: ev.motivo, metodo: "QR", tipo: "intento",
        url: "./?app=panel",
      };
    } else if (ev.tipo === "prueba") {
      aviso = {
        title: "🔔 Notificaciones activadas",
        body: "Así te avisaremos cada vez que un socio ingrese al gimnasio.",
        tag: "prueba", url: "./?app=panel", voz: "Notificaciones activadas",
      };
      if (ev.user_id) consulta = consulta.eq("user_id", ev.user_id);
    } else {
      return new Response("evento desconocido", { status: 400 });
    }

    const { data: subs, error } = await consulta;
    if (error) throw error;
    // Celulares con la app nativa (Firebase). En "prueba" solo los de quien la pidió.
    let qFcm = sb.from("fcm_tokens").select("token");
    if (ev.tipo === "prueba" && ev.user_id) qFcm = qFcm.eq("user_id", ev.user_id);
    const { data: fcmTokens } = await qFcm;
    const datosFcm: Record<string, string> = {};
    for (const [k, v] of Object.entries(aviso)) if (v !== undefined && v !== null) datosFcm[k] = String(v);
    datosFcm.tipo = String(aviso.tipo ?? ev.tipo);
    // Si Firebase falla, el aviso por Web Push sigue su camino
    const enviadosFcm = await enviarFcm((fcmTokens ?? []).map((t) => t.token), datosFcm)
      .catch((e) => { console.error("FCM error", (e as Error).message); return 0; });
    const payload = JSON.stringify(aviso);
    let enviados = enviadosFcm;
    const vencidos: number[] = [];
    await Promise.all((subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 3600, urgency: "high", topic: String(aviso.tag).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) },
        );
        enviados++;
      } catch (e) {
        const st = (e as { statusCode?: number }).statusCode;
        if (st === 404 || st === 410) vencidos.push(s.id);
        else console.error("push falló", st, (e as Error).message);
      }
    }));
    // Celulares que ya no aceptan avisos (app desinstalada, permiso quitado)
    if (vencidos.length) await sb.from("push_suscripciones").delete().in("id", vencidos);
    // Confirmar el aviso en la cola: solo si llegó a algún celular (o no hay celulares),
    // así el reenvío de cada minuto recupera los que fallaron
    if (ev.pendiente_id && (enviados > 0 || !(subs ?? []).length)) {
      await sb.from("push_pendientes").update({ enviado_en: new Date().toISOString() }).eq("id", ev.pendiente_id);
    }
    return Response.json({ enviados, vencidos: vencidos.length, total: subs?.length ?? 0 });
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 500 });
  }
});
