// Detecta declaraciones de la familia .sc que nunca cambian el resultado final en las tarjetas.
// Quita cada declaración en vivo, recalcula el estilo de todos los elementos de las tarjetas y la
// restaura si algo cambia. Uso: node tools/verificacion/declaraciones_muertas.js <dirSupabaseUMD> <baseUrl> <salida.json>
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const [,, supaDir, base, salida] = process.argv;
const SUPA_JS = fs.readFileSync(path.join(supaDir, 'npm/package/dist/umd/supabase.js'), 'utf8');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: 'u1', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, email: 'a@b.c' }) + '.x';
const dias = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const hoy = dias(0);
const SOCIOS = [
  { id: 1, dni: '10000001', nombre: 'Socio Activo', telefono: '900000001', tipo_memb: 'Un mes', dias_restantes: 20, dias_totales: 30, fecha_fin: '2099-12-31', inicio: '2026-10-01', deuda: '0', fecha_deuda: null, precio: 70 },
  { id: 2, dni: '10000002', nombre: 'Socio Vencido', telefono: '900000002', tipo_memb: 'Un mes', dias_restantes: 0, dias_totales: 30, fecha_fin: '2020-01-01', inicio: '2019-12-01', deuda: '0', fecha_deuda: null, precio: 70 },
  { id: 3, dni: '10000003', nombre: 'Socio Bloqueado', telefono: '900000003', tipo_memb: 'Un mes', dias_restantes: 10, dias_totales: 30, fecha_fin: '2099-12-31', inicio: '2026-10-01', deuda: '10', fecha_deuda: '2020-01-01', precio: 70 },
  { id: 4, dni: '10000004', nombre: 'Socio Deudor', telefono: '900000004', tipo_memb: 'Un mes', dias_restantes: 10, dias_totales: 30, fecha_fin: '2099-12-31', inicio: '2026-10-01', deuda: '10', fecha_deuda: hoy, precio: 70 },
  { id: 5, dni: '10000005', nombre: 'Socio Agotado', telefono: '900000005', tipo_memb: 'Interdiario', dias_restantes: 0, dias_totales: 15, fecha_fin: '2099-12-31', inicio: '2026-10-01', deuda: '0', fecha_deuda: null, precio: 40 },
  { id: 6, dni: '10000006', nombre: 'Socio Por Vencer', telefono: '900000006', tipo_memb: 'Un mes', dias_restantes: 3, dias_totales: 30, fecha_fin: dias(3), inicio: '2026-10-01', deuda: '0', fecha_deuda: null, precio: 70 },
];
const PROPS = JSON.parse(fs.readFileSync(path.join(__dirname, 'props_sc.json'), 'utf8'));
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.route((u) => !/127\.0\.0\.1|supabase\.co/.test(u.host), (r) => r.request().url().includes('supabase-js') ? r.fulfill({ status: 200, contentType: 'application/javascript', body: SUPA_JS }) : r.abort());
  await page.route(/supabase\.co/, async (route) => {
    const p = new URL(route.request().url()).pathname; const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (p.includes('/auth/v1/token')) return json({ access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: { id: 'u1', email: 'a@b.c', aud: 'authenticated', role: 'authenticated' } });
    if (p.endsWith('/rpc/mi_rol')) return json('admin'); if (p.endsWith('/rpc/es_staff')) return json(true);
    if (p.includes('/rest/v1/socios')) return json(SOCIOS);
    return json([]);
  });
  await page.goto(base + '/gym.html'); await page.waitForTimeout(1200);
  await page.fill('#loginEmail', 'a@b.c'); await page.fill('#loginPassword', 'buena');
  await page.click('#btnLoginStaff'); await page.waitForTimeout(1200);
  await page.reload(); await page.waitForTimeout(2800);
  await page.evaluate(() => { const b = [...document.querySelectorAll('.tabs button')].find(x => /Lista/i.test(x.textContent)); if (b) b.click(); });
  await page.waitForTimeout(900);
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
  const res = await page.evaluate(({ PROPS }) => {
    // Elementos de las tarjetas (y sus pseudoelementos) y propiedades a comparar
    const tarjetas = [...document.querySelectorAll('article.sc')];
    const elementos = [];
    tarjetas.forEach(t => { elementos.push(t); t.querySelectorAll('*').forEach(e => elementos.push(e)); });
    const firma = () => {
      const out = [];
      elementos.forEach(el => {
        const cs = getComputedStyle(el); for (const p of PROPS) out.push(cs.getPropertyValue(p));
        for (const ps of ['::before', '::after']) { const c2 = getComputedStyle(el, ps); for (const p of PROPS) out.push(c2.getPropertyValue(p)); }
      });
      return out.join('|');
    };
    const base = firma();
    // Reglas de la familia .sc (y sus @media) de las hojas de la app
    const hojas = [...document.styleSheets].filter(s => s.href && /\/(app|tienda)\.css$/.test(s.href));
    const reglas = [];
    const recorrer = (lista, hoja) => { for (const r of lista) { if (r.type === 4) { recorrer(r.cssRules, hoja); continue; } if (r.type === 1 && /(^|[\s,(])\.sc(?![a-zA-Z0-9_])/.test(r.selectorText)) reglas.push({ r, hoja: hoja.href.split('/').pop() }); } };
    hojas.forEach(h => recorrer(h.cssRules, h));
    const muertas = [];
    const candidatas = [];
    let probadas = 0;
    for (const { r, hoja } of reglas) {
      // No tocamos estados que no se pueden medir aquí (hover, active, focus, :has)
      if (/:hover|:active|:focus|:has\(|:not\(:has/.test(r.selectorText)) continue;
      const props = [];
      for (let k = 0; k < r.style.length; k++) { const p = r.style[k]; props.push({ p, v: r.style.getPropertyValue(p), pr: r.style.getPropertyPriority(p) }); }
      const instantanea = r.style.cssText;   // restauración exacta de la regla completa
      for (const { p, v, pr } of props) {
        probadas++;
        // Cada declaración se prueba sola: se quita, se compara y siempre se vuelve a poner
        r.style.removeProperty(p);
        const despues = firma();
        r.style.cssText = instantanea;
        if (despues === base) candidatas.push({ r, hoja, selector: r.selectorText, prop: p, value: v, important: pr === 'important' });
      }
    }
    // Fase acumulativa: dos declaraciones redundantes entre sí son "muertas" cada una por separado,
    // pero no las dos a la vez. Se quitan en orden y se mantiene cada quita solo si nada cambia.
    for (const c of candidatas) {
      const antes = c.r.style.cssText;
      c.r.style.removeProperty(c.prop);
      if (firma() === base) muertas.push({ hoja: c.hoja, selector: c.selector, prop: c.prop, value: c.value, important: c.important });
      else c.r.style.cssText = antes;
    }
    return { probadas, muertas, candidatas: candidatas.length };
  }, { PROPS });
  fs.writeFileSync(salida, JSON.stringify(res, null, 1));
  console.log('declaraciones probadas:', res.probadas, '| candidatas:', res.candidatas, '| quitables juntas sin efecto:', res.muertas.length);
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
