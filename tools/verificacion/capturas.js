// Captura pantallas clave (QR, panel, tarjetas por estado, tienda y ajustes) para comparar
// una versión contra otra. Uso: node tools/verificacion/capturas.js <dirSupabaseUMD> <baseUrl> <carpetaSalida>
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
const FIADOS = { '10000003': [{ id: 'v1', fecha: '2026-10-10', total: 10.99, saldo: 10.99, fecha_vencimiento: '2020-01-01', venta_items: [{ nombre: 'Proteína 1 kg', cantidad: 1 }] }] };
const quieto = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
(async () => {
  fs.mkdirSync(salida, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const nuevaPagina = async (ancho) => {
    const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: ancho, height: 844 } });
    const page = await ctx.newPage();
    await page.route((u) => !/127\.0\.0\.1|supabase\.co/.test(u.host), (r) => r.request().url().includes('supabase-js') ? r.fulfill({ status: 200, contentType: 'application/javascript', body: SUPA_JS }) : r.abort());
    await page.route(/supabase\.co/, async (route) => {
      const req = route.request(); const p = new URL(req.url()).pathname; const url = new URL(req.url());
      const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
      if (p.includes('/auth/v1/token')) return json({ access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: { id: 'u1', email: 'a@b.c', aud: 'authenticated', role: 'authenticated' } });
      if (p.endsWith('/rpc/mi_rol')) return json('admin');
      if (p.endsWith('/rpc/es_staff')) return json(true);
      if (p.endsWith('/rpc/listar_personal')) return json([{ user_id: 'u1', email: 'a@b.c', nombre: 'Dueño', rol: 'admin', creado: '2026-10-01' }]);
      if (p.includes('/rest/v1/socios')) { const dni = (url.searchParams.get('dni') || '').replace('eq.', ''); if (req.headers()['accept']?.includes('vnd.pgrst.object')) { const s = SOCIOS.find(x => x.dni === dni); return s ? json(s) : json({ code: 'PGRST116' }, 406); } return json(SOCIOS); }
      if (p.includes('/rest/v1/ventas')) { const dni = (url.searchParams.get('dni') || '').replace('eq.', ''); return json(FIADOS[dni] || []); }
      if (p.includes('/rest/v1/productos')) return json([{ id: 'p1', nombre: 'Agua', categoria: 'Bebidas', precio: 1.5, activo: true, stock: null }]);
      if (p.includes('/rest/v1/categorias_producto')) return json([{ nombre: 'Bebidas' }, { nombre: 'Otros' }]);
      return json([]);
    });
    return page;
  };
  const foto = async (page, nombre) => { await page.addStyleTag({ content: quieto }); await page.waitForTimeout(300); await page.screenshot({ path: path.join(salida, nombre + '.png'), fullPage: true }); };
  // Pantallas del socio (QR)
  for (const ancho of [390]) {
    let page = await nuevaPagina(ancho);
    await page.goto(base + '/qr.html'); await page.waitForTimeout(1500);
    await foto(page, `qr-${ancho}-inicio`);
    await page.click('#btnSoySocioQR').catch(() => {}); await page.waitForTimeout(400); await foto(page, `qr-${ancho}-ingreso`);
    await page.click('#loginFormGym .wiz-back').catch(() => {}); await page.waitForTimeout(200);
    await page.click('#btnInscribirseQR').catch(() => {}); await page.waitForTimeout(400); await foto(page, `qr-${ancho}-inscripcion`);
    // Pantallas de presentación del socio: conoce el gym, horarios y planes
    for (const [id, nombre] of [['wizConoce', 'conoce'], ['wizHorarios', 'horarios'], ['wizPlanes', 'planes']]) {
      // Los planes se dibujan al abrir la bienvenida: se llama primero a esa función
      await page.evaluate((i) => { if (i === 'wizPlanes') window.mostrarBienvenidaPublicaQR(); window.wizIr(i); }, id).catch(() => {}); await page.waitForTimeout(900);
      await foto(page, `qr-${ancho}-${nombre}`);
      await page.evaluate(() => { const o = document.getElementById('wizOverlay'); if (o) o.style.display = 'none'; }); await page.waitForTimeout(200);
    }
  }
  // Panel del personal: login, lista de socios (cada estado), tienda, ajustes
  for (const ancho of [390, 1280]) {
    const page = await nuevaPagina(ancho);
    await page.goto(base + '/gym.html'); await page.waitForTimeout(1200);
    await page.fill('#loginEmail', 'a@b.c'); await page.fill('#loginPassword', 'buena');
    await page.click('#btnLoginStaff'); await page.waitForTimeout(1200);
    await page.reload(); await page.waitForTimeout(2800);
    await page.addStyleTag({ content: quieto });
    await page.evaluate(() => { const b = [...document.querySelectorAll('.tabs button')].find(x => /Lista/i.test(x.textContent)); if (b) b.click(); });
    await page.waitForTimeout(900);
    await foto(page, `panel-${ancho}-lista`);
    const tarjetas = await page.$$('article.sc');
    for (let i = 0; i < tarjetas.length; i++) {
      if (!(await tarjetas[i].isVisible())) continue;
      await tarjetas[i].scrollIntoViewIfNeeded(); await page.waitForTimeout(120);
      await tarjetas[i].screenshot({ path: path.join(salida, `tarjeta-${ancho}-${i}.png`) });
    }
    await page.evaluate(() => { const b = [...document.querySelectorAll('.tabs button')].find(x => /Tienda/i.test(x.textContent)); if (b) b.click(); });
    await page.waitForTimeout(900); await foto(page, `panel-${ancho}-tienda`);
    await page.evaluate(() => { document.getElementById('modalAjustes').hidden = false; }); await page.waitForTimeout(400); await foto(page, `panel-${ancho}-ajustes`);
    await page.evaluate(() => { document.getElementById('modalAjustes').hidden = true; TD.abrirDeuda('10000003'); }); await page.waitForTimeout(700); await foto(page, `panel-${ancho}-deuda`);
  }
  await browser.close();
  console.log('capturas en', salida, '->', fs.readdirSync(salida).length, 'archivos');
})().catch(e => { console.error(e.message); process.exit(1); });
