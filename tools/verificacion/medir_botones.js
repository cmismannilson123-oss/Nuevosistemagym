// Mide los botones de la pantalla inicial del QR (y sus partes y pseudoelementos) con todas sus propiedades,
// incluidas las de animación declaradas, en varios anchos y alturas. Uso: node tools/verificacion/medir_botones.js <dirSupabaseUMD> <baseUrl> <salida.json>
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const [,, supaDir, base, salida] = process.argv;
const SUPA_JS = fs.readFileSync(path.join(supaDir, 'npm/package/dist/umd/supabase.js'), 'utf8');
const MEDIDAS = [[360, 844], [390, 844], [1280, 844], [360, 700], [390, 720], [390, 820]];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const out = {};
  for (const [ancho, alto] of MEDIDAS) {
    const page = await (await browser.newContext({ viewport: { width: ancho, height: alto } })).newPage();
    await page.route((u) => !/127\.0\.0\.1|supabase\.co/.test(u.host), (r) => r.request().url().includes('supabase-js') ? r.fulfill({ status: 200, contentType: 'application/javascript', body: SUPA_JS }) : r.abort());
    await page.route(/supabase\.co/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto(base + '/qr.html'); await page.waitForTimeout(1200);
    // Solo se apagan las transiciones: las animaciones se miden como valores declarados, no como instantes
    await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important}' });
    await page.waitForTimeout(200);
    const datos = await page.evaluate(() => {
      const raiz = document.getElementById('qrOpcionesInicio');
      const botones = [...raiz.querySelectorAll('button')];
      const res = [];
      // d, cx, cy, x e y son trazos de SVG animados con SMIL (no son CSS): se excluyen
      const tomar = (el, ps) => { const cs = getComputedStyle(el, ps || null); const o = {}; for (let k = 0; k < cs.length; k++) { const p = cs[k]; if (/^(width|height|inline-size|block-size|transform-origin|perspective-origin|transform|opacity|d|cx|cy|x|y)$/.test(p)) continue; o[p] = cs.getPropertyValue(p); } return o; };
      botones.forEach((b, i) => {
        res.push({ id: b.id, ruta: 'btn' + i, estilo: tomar(b) });
        res.push({ id: b.id, ruta: 'btn' + i + '::before', estilo: tomar(b, '::before') });
        res.push({ id: b.id, ruta: 'btn' + i + '::after', estilo: tomar(b, '::after') });
        [...b.querySelectorAll('*')].forEach((h, j) => res.push({ id: b.id, ruta: 'btn' + i + ' > ' + h.tagName.toLowerCase() + '.' + (h.getAttribute('class') || '') + '#' + j, estilo: tomar(h) }));
      });
      return res;
    });
    out[ancho + 'x' + alto] = datos;
    await page.context().close();
  }
  fs.writeFileSync(salida, JSON.stringify(out));
  console.log('botones medidos:', Object.values(out).reduce((s, a) => s + a.length, 0));
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
