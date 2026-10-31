// Mide el estilo calculado de todos los elementos de las pantallas de presentación del QR
// (conoce el gym, horarios y planes). Uso: node tools/verificacion/medir_presentacion.js <dirSupabaseUMD> <baseUrl> <salida.json>
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const [,, supaDir, base, salida] = process.argv;
const SUPA_JS = fs.readFileSync(path.join(supaDir, 'npm/package/dist/umd/supabase.js'), 'utf8');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const out = {};
  for (const ancho of [360, 390, 1280]) {
    const page = await (await browser.newContext({ viewport: { width: ancho, height: 844 } })).newPage();
    await page.route((u) => !/127\.0\.0\.1|supabase\.co/.test(u.host), (r) => r.request().url().includes('supabase-js') ? r.fulfill({ status: 200, contentType: 'application/javascript', body: SUPA_JS }) : r.abort());
    await page.route(/supabase\.co/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto(base + '/qr.html'); await page.waitForTimeout(1500);
    // Animaciones apagadas: así los valores de opacidad y posición no dependen del instante de la medición
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
    for (const pantalla of ['wizConoce', 'wizHorarios', 'wizPlanes']) {
      await page.evaluate((p) => { if (p === 'wizPlanes') window.mostrarBienvenidaPublicaQR(); window.wizIr(p); }, pantalla);
      // Los precios de los planes se cuentan con animación de JavaScript: se espera a que terminen
      await page.waitForTimeout(2500);
      const datos = await page.evaluate(() => {
        const raiz = document.getElementById('wizOverlay');
        const els = [raiz, ...raiz.querySelectorAll('*')];
        return els.map((el, i) => { const cs = getComputedStyle(el); const o = {}; for (let k = 0; k < cs.length; k++) { const p = cs[k]; if (!/^(transition|animation)/.test(p)) o[p] = cs.getPropertyValue(p); } return o; });
      });
      out[ancho + '|' + pantalla] = datos;
    }
    await page.context().close();
  }
  fs.writeFileSync(salida, JSON.stringify(out));
  console.log('elementos medidos:', Object.values(out).reduce((s, a) => s + a.length, 0));
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
