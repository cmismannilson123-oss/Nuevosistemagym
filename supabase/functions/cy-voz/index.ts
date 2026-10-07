// ============================================================
// cy-voz — voz natural (IA) para la recepción del gimnasio. GRATIS.
// Usa Google Gemini TTS (nivel gratuito, solo cuenta de Google): voz
// neuronal femenina con indicaciones de estilo (cálida, natural, pausas y
// entonación humanas). Cada audio se guarda en el bucket privado "voz":
// una frase se genera UNA sola vez y después se sirve gratis al instante.
//  * Personal (sesión + staff): genera y reproduce.
//  * Tarea nocturna (x-cy-secreto): prepara las bienvenidas de los socios
//    que más vienen, usando el cupo gratuito que sobró del día.
// Secreto requerido: GEMINI_API_KEY (Supabase → Edge Functions → Secrets).
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-cy-cache, x-cy-voz",
};
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

// Voces femeninas de Gemini (nombre interno → descripción)
const VOCES: Record<string, string> = {
  Sulafat: "Sulafat · cálida (recomendada)",
  Despina: "Despina · suave y natural",
  Laomedeia: "Laomedeia · alegre",
  Aoede: "Aoede · fresca y ligera",
  Kore: "Kore · firme y clara",
};
const VOZ_DEFECTO = "Sulafat";
const MODELOS = ["gemini-2.5-flash-preview-tts", "gemini-2.5-flash-tts", "gemini-3.1-flash-tts-preview"];
let modeloOk: string | null = null;

const BASE = "en español de Perú, con voz femenina cálida y cercana, natural como una persona real conversando en ese momento, " +
  "con entonación viva según el sentido, pausas breves y naturales, ritmo ágil y pronunciación clara sin exagerar";
const ESTILO: Record<string, string> = {
  saludo: `Como una recepcionista que saluda con una sonrisa a alguien que aprecia, ${BASE}, di con alegría genuina`,
  aviso: `Como una recepcionista amable y empática, sin regañar ni alarmar, ${BASE}, di con calma`,
  anuncio: `Como un anuncio por altavoz en un gimnasio, con buena proyección, segura y amable, ${BASE}, di`,
};

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const audio = (b: Uint8Array | ArrayBuffer, cache: string, voz: string) =>
  new Response(b, { headers: { ...CORS, "Content-Type": "audio/wav", "Cache-Control": "private, max-age=31536000", "x-cy-cache": cache, "x-cy-voz": voz } });

async function sha(t: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, "0")).join("");
}
// Gemini entrega PCM 16 bits, 24 kHz, mono: se le pone cabecera WAV
function wav(pcm: Uint8Array, rate = 24000) {
  const h = new DataView(new ArrayBuffer(44));
  const s = (o: number, t: string) => [...t].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
  s(0, "RIFF"); h.setUint32(4, 36 + pcm.length, true); s(8, "WAVE"); s(12, "fmt ");
  h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
  h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true);
  s(36, "data"); h.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length); out.set(new Uint8Array(h.buffer), 0); out.set(pcm, 44); return out;
}

class ErrorIA extends Error { constructor(public codigo: string, msg: string) { super(msg); } }

async function generar(clave: string, voz: string, texto: string, tipo: string): Promise<Uint8Array> {
  const cuerpo = JSON.stringify({
    contents: [{ parts: [{ text: `${ESTILO[tipo]}: ${texto}` }] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voz } } } },
  });
  const lista = modeloOk ? [modeloOk] : MODELOS;
  let ultimo = "";
  for (const m of lista) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": clave }, body: cuerpo,
    });
    if (r.status === 404) { ultimo = "modelo no disponible: " + m; continue; }
    if (r.status === 429) throw new ErrorIA("cupo", "cupo gratuito agotado por ahora");
    if (r.status === 400 || r.status === 401 || r.status === 403) {
      const t = await r.text();
      if (/API key|API_KEY|permission|PERMISSION/i.test(t)) throw new ErrorIA("clave_invalida", t.slice(0, 200));
      throw new ErrorIA("fallo_ia", t.slice(0, 200));
    }
    if (!r.ok) throw new ErrorIA("fallo_ia", `HTTP ${r.status}`);
    const j = await r.json();
    const b64 = j?.candidates?.[0]?.content?.parts?.find((p: { inlineData?: { data?: string } }) => p.inlineData?.data)?.inlineData?.data;
    if (!b64) throw new ErrorIA("fallo_ia", "respuesta sin audio");
    modeloOk = m;
    const bin = atob(b64); const pcm = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) pcm[i] = bin.charCodeAt(i);
    return wav(pcm);
  }
  throw new ErrorIA("fallo_ia", ultimo || "sin modelo");
}

// Frase de bienvenida: igual a la que arma el panel (para la caché nocturna)
const FEM = new Set("isabel raquel carmen pilar luz ruth ester esther beatriz ines mercedes dolores soledad rocio belen nicole nicol jazmin yasmin maribel marisol consuelo rosario milagros lourdes flor abigail miriam mirian sharon karen evelyn ingrid lizbeth elizabeth yuliet juliet scarlet scarleth nayeli yaneli aracely aracelly deysi daysi daisy heidi wendy sandy cindy betty kelly sally nancy mery mary ruby lucy gisel gissel giselle noemi zoe mabel sol lili liz yamileth joselyn jocelyn estefany stefany tiffany brigitte brigith anahi nohely nely edith judith yudith ivonne ivon lisbeth nataly nathaly kimberly shirley fanny jenny jhenny emily emely melany melanie stephanie madeleine caroline jacqueline jaqueline yesenia dayana diana catherine katherine kathy cathy rachel rebeca ximena geraldine jade irene danae adele marilyn madai nahomi naomi sheyli sheily yeni yeny leydi lady suly araceli rosmery rosemary maricel marisel aylin ailin evelin ashley britany brittany alison allison".split(" "));
const MASC = new Set("luca joshua nikita bautista elias jeremias isaias matias tobias josue jhony johnny jony rony andy henry danny freddy eddy teddy ruddy harry jerry gary roy ray rey ali rudi rudy jhonny yoel jose felipe enrique dante jorge jaime vicente alexis kenny jhoel noe abel".split(" "));
const capital = (s: string) => String(s || "").toLowerCase().replace(/(^|[\s'-])([a-záéíóúüñ])/g, (_m, a, b) => a + b.toUpperCase());
function genero(nombre: string) {
  const n = String(nombre || "").trim().split(/\s+/)[0].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!n) return null;
  if (FEM.has(n)) return "f"; if (MASC.has(n)) return "m";
  if (/a$/.test(n)) return "f"; if (/o$/.test(n)) return "m";
  if (/(eth|lyn|line|elle|ette)$/.test(n)) return "f";
  if (/[bcdfgjklmnprstvxz]$/.test(n)) return "m";
  return null;
}
function saludo(nombre: string) {
  const corto = capital(nombre).trim().split(/\s+/).slice(0, 2).join(" ") || "socio";
  const g = genero(corto);
  return g === "f" ? `¡Bienvenida, ${corto}!` : g === "m" ? `¡Bienvenido, ${corto}!` : `¡Te damos la bienvenida, ${corto}!`;
}

async function obtener(clave: string, voz: string, texto: string, tipo: string) {
  const ruta = `${voz}/${tipo}/${await sha(texto)}.wav`;
  const { data: guardado } = await sb.storage.from("voz").download(ruta);
  if (guardado) return { bytes: new Uint8Array(await guardado.arrayBuffer()), cache: "hit", ruta };
  const bytes = await generar(clave, voz, texto, tipo);
  await sb.storage.from("voz").upload(ruta, bytes, { contentType: "audio/wav", upsert: true }).catch(() => {});
  return { bytes, cache: "miss", ruta };
}

// Prepara bienvenidas de los socios más frecuentes que aún no tienen audio
async function precalentar(clave: string, maximo: number) {
  const desde = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const { data: filas } = await sb.from("historial_asistencia").select("dni, nombre").gte("fecha", desde).limit(5000);
  const cuenta = new Map<string, { n: number; nombre: string }>();
  (filas ?? []).forEach((f) => { const c = cuenta.get(f.dni) ?? { n: 0, nombre: f.nombre }; c.n++; cuenta.set(f.dni, c); });
  const orden = [...cuenta.entries()].sort((a, b) => b[1].n - a[1].n);
  let hechos = 0, revisados = 0;
  for (const [dni, c] of orden) {
    if (hechos >= maximo) break;
    const { data: s } = await sb.from("socios").select("nombre").eq("dni", dni).maybeSingle();
    const texto = saludo(s?.nombre || c.nombre);
    const ruta = `${VOZ_DEFECTO}/saludo/${await sha(texto)}.wav`;
    revisados++;
    const { data: existe } = await sb.storage.from("voz").list(`${VOZ_DEFECTO}/saludo`, { search: ruta.split("/").pop() });
    if (existe && existe.length) continue;
    try { await obtener(clave, VOZ_DEFECTO, texto, "saludo"); hechos++; }
    catch (e) { if (e instanceof ErrorIA && e.codigo === "cupo") break; console.error("precalentar", e); }
    await new Promise((r) => setTimeout(r, 21000)); // respeta el límite por minuto del nivel gratuito
  }
  return { hechos, revisados };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const clave = Deno.env.get("GEMINI_API_KEY");
    const body = await req.json().catch(() => ({}));

    // Tarea nocturna (la llama la base con el secreto de push)
    const secreto = req.headers.get("x-cy-secreto");
    if (secreto) {
      const { data: cfg } = await sb.from("admin_config").select("valor").eq("clave", "push_secreto").maybeSingle();
      if (!cfg || cfg.valor !== secreto) return json({ error: "no_autorizado" }, 401);
      if (!clave) return json({ error: "sin_clave" }, 503);
      return json(await precalentar(clave, Math.min(Number(body.maximo) || 4, 6)));
    }

    // Personal del gimnasio
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await sb.auth.getUser(token);
    if (!u?.user) return json({ error: "no_autorizado" }, 401);
    const { data: st } = await sb.from("staff").select("user_id").eq("user_id", u.user.id).maybeSingle();
    if (!st) return json({ error: "no_autorizado" }, 403);

    if (body.probar) return json({ ia: !!clave, proveedor: "gemini", voces: VOCES, defecto: VOZ_DEFECTO });
    if (!clave) return json({ error: "sin_clave" }, 503);

    const texto = String(body.texto || "").replace(/\s+/g, " ").trim().slice(0, 700);
    if (!texto) return json({ error: "sin_texto" }, 400);
    const voz = VOCES[body.voz] ? body.voz : VOZ_DEFECTO;
    const tipo = ESTILO[body.tipo] ? body.tipo : "anuncio";
    const r = await obtener(clave, voz, texto, tipo);
    return audio(r.bytes, r.cache, voz);
  } catch (e) {
    if (e instanceof ErrorIA) return json({ error: e.codigo, detalle: e.message }, e.codigo === "cupo" ? 429 : 502);
    console.error(e);
    return json({ error: "error" }, 500);
  }
});
