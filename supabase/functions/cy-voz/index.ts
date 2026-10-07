// ============================================================
// cy-voz — voz natural (IA) para la recepción del gimnasio.
// Convierte texto en voz neuronal con OpenAI (gpt-4o-mini-tts), con
// instrucciones de estilo: femenina, cálida, natural, entonación dinámica y
// pausas naturales. Cada audio se guarda en el bucket privado "voz": si la
// misma frase se repite, se sirve al instante y sin costo.
// Solo para el personal (sesión + tabla staff). Clave: secreto OPENAI_API_KEY.
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-cy-cache, x-cy-voz",
};
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const VOCES = ["marin", "coral", "nova", "shimmer", "sage"];

const BASE = "Voz femenina adulta joven, cálida, amable y cercana, en español latinoamericano neutro con un suave acento peruano. " +
  "Habla con total naturalidad, como una persona real conversando en ese momento, no leyendo un texto: entonación dinámica según el sentido de cada frase, " +
  "pequeñas variaciones naturales de ritmo, pausas breves y fluidas entre ideas, énfasis sutil en las palabras importantes. " +
  "Clara y bien articulada pero sin exagerar la pronunciación, sin sonar robótica ni demasiado perfecta, sin cambios bruscos de tono. Ritmo ágil, nunca lento.";
const ESTILO: Record<string, string> = {
  saludo: "Es la bienvenida a un socio que acaba de llegar al gimnasio: alegre y genuina, con una sonrisa en la voz, breve y espontánea, como quien saluda a alguien que aprecia.",
  aviso: "Es un aviso amable para que un socio se acerque a recepción: empática, tranquila y respetuosa, nunca regañando ni con tono de alarma.",
  anuncio: "Es un anuncio por altavoz para todas las personas del gimnasio: clara, segura y con buena proyección, amable y profesional, transmitiendo cercanía.",
};

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const audio = (b: ArrayBuffer | Uint8Array, cache: string, voz: string) =>
  new Response(b, { headers: { ...CORS, "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=31536000", "x-cy-cache": cache, "x-cy-voz": voz } });

async function sha(t: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, "0")).join("");
}

async function generar(clave: string, voz: string, texto: string, estilo: string) {
  return fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: voz, input: texto, instructions: BASE + " " + estilo, response_format: "mp3" }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // Solo personal del gimnasio
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await sb.auth.getUser(token);
    if (!u?.user) return json({ error: "no_autorizado" }, 401);
    const { data: st } = await sb.from("staff").select("user_id").eq("user_id", u.user.id).maybeSingle();
    if (!st) return json({ error: "no_autorizado" }, 403);

    const clave = Deno.env.get("OPENAI_API_KEY");
    const body = await req.json().catch(() => ({}));
    if (body.probar) return json({ ia: !!clave, voces: VOCES });
    if (!clave) return json({ error: "sin_clave" }, 503);

    const texto = String(body.texto || "").replace(/\s+/g, " ").trim().slice(0, 700);
    if (!texto) return json({ error: "sin_texto" }, 400);
    let voz = VOCES.includes(body.voz) ? body.voz : "marin";
    const tipo = ESTILO[body.tipo] ? body.tipo : "anuncio";
    const ruta = `${voz}/${tipo}/${await sha(texto)}.mp3`;

    // 1) ¿Ya se generó antes? Se sirve desde la caché
    const { data: guardado } = await sb.storage.from("voz").download(ruta);
    if (guardado) return audio(await guardado.arrayBuffer(), "hit", voz);

    // 2) Se genera con IA (si la voz elegida no existe en la cuenta, se usa "coral")
    let r = await generar(clave, voz, texto, ESTILO[tipo]);
    if (r.status === 400 && voz !== "coral") { voz = "coral"; r = await generar(clave, voz, texto, ESTILO[tipo]); }
    if (!r.ok) {
      const detalle = (await r.text()).slice(0, 300);
      console.error("OpenAI", r.status, detalle);
      return json({ error: r.status === 401 ? "clave_invalida" : r.status === 429 ? "sin_saldo_o_limite" : "fallo_ia", detalle }, 502);
    }
    const bytes = new Uint8Array(await r.arrayBuffer());
    const subir = sb.storage.from("voz").upload(ruta, bytes, { contentType: "audio/mpeg", upsert: true }).catch(() => {});
    // @ts-ignore EdgeRuntime existe en Supabase
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(subir); else await subir;
    return audio(bytes, "miss", voz);
  } catch (e) {
    console.error(e);
    return json({ error: "error" }, 500);
  }
});
