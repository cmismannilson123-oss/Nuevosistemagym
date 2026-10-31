// Mide el estilo final de cada elemento de las tarjetas de socios (.sc), por estado, para
// reescribir la familia con el mismo resultado. Uso: node tools/verificacion/medir_tarjetas.js <dirSupabaseUMD> <baseUrl> <salida.json>
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
// Propiedades que declaran las reglas de la familia .sc en app.css
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
  const resultado = await page.evaluate((PROPS) => {
    const tarjetas = [...document.querySelectorAll('article.sc')];
    return tarjetas.map(card => {
      const estado = [...card.classList].find(c => c.startsWith('sc--')) || 'sc--(sin)';
      const elementos = [];
      const visitar = (el, ruta) => {
        const clases = [...el.classList].filter(c => c.startsWith('sc') || c.startsWith('ig-')).sort();
        const cs = getComputedStyle(el);
        const v = {}; for (const p of PROPS) v[p] = cs.getPropertyValue(p);
        elementos.push({ ruta, tag: el.tagName.toLowerCase(), clases, estilo: v });
        [...el.children].forEach((h, i) => visitar(h, ruta + ' > ' + h.tagName.toLowerCase() + (h.className && typeof h.className === 'string' ? '.' + h.className.trim().split(/\s+/).join('.') : '') + '#' + i));
      };
      visitar(card, 'article');
      const pseudo = {};
      for (const ps of ['::before', '::after']) { const cs = getComputedStyle(card, ps); const v = {}; for (const p of PROPS) v[p] = cs.getPropertyValue(p); pseudo[ps] = v; }
      return { estado, elementos, pseudo, clases: [...card.classList] };
    });
  }, PROPS);
  fs.writeFileSync(salida, JSON.stringify(resultado, null, 1));
  console.log('tarjetas medidas:', resultado.length, resultado.map(t => t.estado + '(' + t.elementos.length + ')').join(' '));
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
