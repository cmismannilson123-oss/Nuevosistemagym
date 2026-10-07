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

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const hoyLima = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
const primerNombre = (n: string) => String(n || "Socio").trim().split(/\s+/).slice(0, 2).join(" ");

async function mensajeIngreso(ev: { dni: string; nombre: string; metodo?: string }) {
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
  const alerta = deuda > 0 || (diasVence !== null && diasVence <= 3);
  return {
    title: `${alerta ? "⚠️" : "✅"} Ingresó ${nombre}`,
    body: `${partes.join(" · ")} — ${via}`,
    tag: "ingreso-" + ev.dni,
    dni: ev.dni,
    nombre,
    metodo: ev.metodo === "QR" ? "QR" : "Manual",
    tipo: "ingreso",
    url: "./?app=panel",
    voz: `Ingresó ${primerNombre(nombre)}. ${deuda > 0 ? `Tiene deuda de ${deuda} soles` : "Estado activo"}.`,
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
    const payload = JSON.stringify(aviso);
    let enviados = 0;
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
    return Response.json({ enviados, vencidos: vencidos.length, total: subs?.length ?? 0 });
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 500 });
  }
});
