#!/usr/bin/env node
// ============================================================
// PUBLICAR — verifica el sitio y arma el zip para subir a Netlify a mano.
//
// Uso:  node tools/publicar.js
//       (opcional) ACORN_PATH=/ruta/a/acorn node tools/publicar.js
//
// Qué hace, en orden. Si un paso falla, no se genera el zip:
//   1. qr.html está al día con gym.html (tools/build-qr.js --check).
//   2. Todos los .js y sw.js tienen sintaxis válida.
//   3. Todos los archivos de ARCHIVOS_APP en sw.js existen en el repo.
//   4. Hay un CACHE_NAME nuevo: no coincide con el último zip generado.
//   5. Se genera dist/cy-fitness-gym-web-vNNN.zip con los archivos publicables.
// ============================================================
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const DIST = path.join(RAIZ, "dist");
const ULTIMO = path.join(DIST, "ultimo-cache.txt");

function paso(nombre, fn) {
  try {
    const detalle = fn();
    console.log(`OK    ${nombre}${detalle ? " — " + detalle : ""}`);
  } catch (e) {
    console.error(`FALLA ${nombre}\n      ${e.message}`);
    process.exit(1);
  }
}

const git = (...args) => execFileSync("git", args, { cwd: RAIZ, encoding: "utf8" });
const archivosPublicables = () =>
  git("ls-files").split("\n").filter(Boolean)
    .filter((f) => !/^(\.claude\/|\.github\/|supabase\/|tools\/|dist\/|README\.md|\.gitignore)/.test(f));

const swTexto = () => fs.readFileSync(path.join(RAIZ, "sw.js"), "utf8");
const cacheActual = () => {
  const m = swTexto().match(/const CACHE_NAME = '([^']+)'/);
  if (!m) throw new Error("No encuentro CACHE_NAME en sw.js");
  return m[1];
};

paso("qr.html al día con gym.html", () => {
  execFileSync(process.execPath, [path.join(__dirname, "build-qr.js"), "--check"], { cwd: RAIZ, stdio: "pipe" });
  return "";
});

paso("sintaxis de JavaScript", () => {
  const js = archivosPublicables().filter((f) => f.endsWith(".js"));
  js.forEach((f) => execFileSync(process.execPath, ["--check", path.join(RAIZ, f)], { stdio: "pipe" }));
  return `${js.length} archivos`;
});

paso("archivos de ARCHIVOS_APP existen", () => {
  const bloque = swTexto().match(/const ARCHIVOS_APP = \[([\s\S]*?)\];/);
  if (!bloque) throw new Error("No encuentro ARCHIVOS_APP en sw.js");
  const locales = [...bloque[1].matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]);
  const faltan = locales.filter((f) => !fs.existsSync(path.join(RAIZ, f)));
  if (faltan.length) throw new Error("No existen: " + faltan.join(", "));
  return `${locales.length} archivos locales`;
});

const version = cacheActual();
paso("CACHE_NAME nuevo", () => {
  const anterior = fs.existsSync(ULTIMO) ? fs.readFileSync(ULTIMO, "utf8").trim() : "";
  if (version === anterior) throw new Error(`"${version}" ya se publicó. Sube el número en sw.js antes de publicar.`);
  return version;
});

paso("zip generado", () => {
  fs.mkdirSync(DIST, { recursive: true });
  const salida = path.join(DIST, `cy-fitness-gym-web-${version.replace(/^cy-fitness-gym-/, "")}.zip`);
  if (fs.existsSync(salida)) fs.unlinkSync(salida);
  execFileSync("zip", ["-q", salida, "-@"], { cwd: RAIZ, input: archivosPublicables().join("\n") + "\n" });
  fs.writeFileSync(ULTIMO, version + "\n");
  const n = execFileSync("unzip", ["-Z1", salida], { encoding: "utf8" }).split("\n").filter(Boolean).length;
  console.log(`      ${salida} (${n} archivos)`);
  return "";
});
