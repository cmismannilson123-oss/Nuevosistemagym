// ============================================================
// Genera qr.html: la pantalla del socio (escaneo del QR), liviana.
//
// gym.html sigue siendo la fuente de verdad (panel + QR). Este script:
//  1. Analiza el JavaScript de gym.html con un parser (acorn) y sigue qué
//     funciones usa la pantalla del socio (QR, cupones, promociones, avisos).
//  2. Copia solo esas partes a qr.html, con el mismo marcado y el mismo
//     archivo de estilos (app.css), en el mismo orden.
//  3. Verifica que todo lo que el marcado llama (onclick, etc.) exista.
//
// Uso:   node tools/build-qr.js            -> escribe qr.html
//        node tools/build-qr.js --check    -> falla si qr.html está desactualizado
// Requiere el paquete "acorn" (ACORN_PATH puede apuntar a su carpeta).
// ============================================================
const fs = require('fs');
const path = require('path');
const acorn = require(process.env.ACORN_PATH || 'acorn');

const RAIZ = path.join(__dirname, '..');
const GYM = path.join(RAIZ, 'gym.html');
const QR = path.join(RAIZ, 'qr.html');

// Nombres que se deben incluir siempre (punto de entrada de la pantalla del socio)
const RAICES = ['inicializarFlujoQR', 'sincronizarDatosSilencioso'];
// Nombres del navegador/librerías que nunca son del gimnasio
const GLOBAL_OK = new Set(['window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage']);
// Funciones solo del panel del personal. No se copian a qr.html: en su lugar se
// deja un stub vacío. Es seguro porque la pantalla del socio no tiene los
// elementos que estas funciones llenan (p. ej. #resultado de la búsqueda):
// mostrarSocio() hace "if (div) ..." y en qr.html ese div no existe.
const STUBS = ['mostrarSocio', 'generarCardSocio', 'asistenciaNueva', 'cyConfirmarIngreso', 'renovar', 'render', 'mostrarHistorial'];

function nombresPatron(p, out) {
  if (!p) return out;
  switch (p.type) {
    case 'Identifier': out.add(p.name); break;
    case 'ObjectPattern': p.properties.forEach(q => nombresPatron(q.type === 'RestElement' ? q.argument : q.value, out)); break;
    case 'ArrayPattern': p.elements.forEach(q => nombresPatron(q, out)); break;
    case 'AssignmentPattern': nombresPatron(p.left, out); break;
    case 'RestElement': nombresPatron(p.argument, out); break;
  }
  return out;
}

// Recoge los nombres que una parte del código REFERENCIA (no las propiedades
// ni las claves de objetos, que no son variables globales)
function referencias(n, out) {
  if (!n || typeof n.type !== 'string') return out;
  switch (n.type) {
    case 'Identifier': out.add(n.name); return out;
    case 'MemberExpression':
      referencias(n.object, out);
      if (n.computed) referencias(n.property, out);
      if (n.object.type === 'Identifier' && n.object.name === 'window' && !n.computed && n.property.type === 'Identifier') out.add(n.property.name);
      return out;
    case 'Property':
    case 'MethodDefinition':
    case 'PropertyDefinition':
      if (n.computed) referencias(n.key, out);
      referencias(n.value, out);
      return out;
    case 'LabeledStatement': case 'BreakStatement': case 'ContinueStatement': return out;
  }
  for (const k of Object.keys(n)) {
    if (k === 'type' || k === 'start' || k === 'end') continue;
    const v = n[k];
    if (Array.isArray(v)) v.forEach(c => referencias(c, out));
    else if (v && typeof v.type === 'string') referencias(v, out);
  }
  return out;
}

// Todo nodo dentro de una sentencia (para encontrar window.X = ... anidados)
function* todosLosNodos(n) {
  if (!n || typeof n.type !== 'string') return;
  yield n;
  for (const k of Object.keys(n)) {
    if (k === 'type' || k === 'start' || k === 'end') continue;
    const v = n[k];
    if (Array.isArray(v)) for (const c of v) yield* todosLosNodos(c);
    else if (v && typeof v.type === 'string') yield* todosLosNodos(v);
  }
}

// Nombres que se llaman dentro de un texto (onclick="guardar(1)", `${f()}`).
// Las palabras sueltas de un mensaje ("guardar un socio") no cuentan.
function llamadasEnTexto(t) {
  return [...t.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]);
}

function analizarSentencia(st, texto) {
  const defs = new Set();
  if (st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') defs.add(st.id.name);
  if (st.type === 'VariableDeclaration') st.declarations.forEach(d => nombresPatron(d.id, defs));
  const cadenas = [];
  for (const n of todosLosNodos(st)) {
    if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.left.object.type === 'Identifier' &&
        n.left.object.name === 'window' && !n.left.computed && n.left.property.type === 'Identifier') defs.add(n.left.property.name);
    if (n.type === 'Literal' && typeof n.value === 'string') cadenas.push(...llamadasEnTexto(n.value));
    if (n.type === 'TemplateLiteral') n.quasis.forEach(q => cadenas.push(...llamadasEnTexto(q.value.cooked || '')));
  }
  return { defs, refs: referencias(st, new Set()), cadenas, texto };
}

function leerBloquesScript(html) {
  const bloques = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    if (/\bsrc\s*=/.test(m[1])) continue;               // librerías externas: se quedan en la cabecera
    bloques.push({ attrs: m[1], contenido: m[2], inicio: m.index, fin: m.index + m[0].length });
  }
  return bloques;
}

// Elementos que solo usa el panel del personal: no van en la pantalla del socio
const PANEL_SOLO = [
  'id="topbarPrincipal"', 'id="topbarSpacer"', 'class="tabs"', 'class="dashboard"',
  'id="tab1"', 'id="tab2"', 'id="tab3"', 'id="tab4"', 'id="tab5"',
  'id="modalRenovar"', 'id="modalEditarSocio"', 'id="modalCuaderno"', 'id="cyAvisos"',
  'id="modalPreciosInvite"', 'id="voucher"', 'id="loading-screen"',
];

// Quita un elemento completo (con todo lo que tiene dentro) a partir de un atributo
function quitarElemento(html, atributo) {
  const idx = html.indexOf(atributo);
  if (idx < 0) return html;                          // ya no está
  const inicio = html.lastIndexOf('<', idx);
  const tag = /^<(\w+)/.exec(html.slice(inicio))[1];
  const abre = new RegExp('<' + tag + '\\b', 'g');
  const cierra = '</' + tag + '>';
  let prof = 0, pos = inicio, fin = -1;
  while (true) {
    abre.lastIndex = pos;
    const a = abre.exec(html);
    const c = html.indexOf(cierra, pos);
    if (c < 0) throw new Error('Elemento sin cierre: ' + atributo);
    if (a && a.index < c) { prof++; pos = a.index + 1; }
    else { prof--; pos = c + cierra.length; if (prof === 0) { fin = pos; break; } }
  }
  return html.slice(0, inicio) + html.slice(fin);
}

function construir() {
  const html = fs.readFileSync(GYM, 'utf8');
  const cabeceraFin = html.indexOf('</head>');
  const bloques = leerBloquesScript(html);
  // Los scripts de la cabecera (redirección y clase qr-mode) no se tocan
  const enCabecera = (b) => b.inicio < cabeceraFin;
  // Código que gym.html solo ejecuta fuera de la pantalla del socio (se corta si
  // está activo qr-mode): en qr.html nunca corre, así que no se copia
  const cuerpoBloques = bloques.filter(b => !enCabecera(b));

  // 1) Sentencias de nivel superior de cada bloque
  const sentencias = [];
  cuerpoBloques.forEach((b, bi) => {
    let ast;
    try { ast = acorn.parse(b.contenido, { ecmaVersion: 'latest', sourceType: 'script' }); }
    catch (e) { throw new Error(`No se pudo analizar un bloque de script (${bi}): ${e.message}`); }
    ast.body.forEach(st => {
      const texto = b.contenido.slice(st.start, st.end);
      if (/classList\.contains\('qr-mode'\)\) return;/.test(texto)) return;
      sentencias.push(Object.assign({ bloque: bi }, analizarSentencia(st, texto)));
    });
  });

  // 2) Mapa nombre -> sentencias que lo definen
  const definidoPor = new Map();
  sentencias.forEach((s, i) => s.defs.forEach(d => {
    if (!definidoPor.has(d)) definidoPor.set(d, []);
    definidoPor.get(d).push(i);
  }));

  // 3) Cierre de dependencias desde las raíces (incluye lo que se llama desde cadenas
  //    de texto, por ejemplo onclick="..." generados por código)
  const incluida = new Set();
  const pila = [];
  const causa = new Map();                       // para la traza (--traza NOMBRE)
  let actual = 'raiz';
  // Una sentencia que define una función de STUBS nunca se copia (se usa el stub)
  const esStub = (i) => [...sentencias[i].defs].some(d => STUBS.includes(d));
  const incluir = (i) => { if (!incluida.has(i) && !esStub(i)) { incluida.add(i); causa.set(i, actual); pila.push(i); } };
  const incluirNombre = (n) => { if (!STUBS.includes(n)) (definidoPor.get(n) || []).forEach(incluir); };
  RAICES.forEach(incluirNombre);
  // Lo que el marcado de la pantalla del socio llama directamente
  // Solo el marcado de la pantalla del socio (sin los bloques de código)
  let marcadoQR = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
  PANEL_SOLO.forEach(a => { marcadoQR = quitarElemento(marcadoQR, a); });
  const llamadasMarcado = new Set();
  for (const m of marcadoQR.matchAll(/\bon[a-z]+\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
    const codigo = m[2] ?? m[3] ?? '';
    for (const w of codigo.match(/[A-Za-z_$][\w$]*/g) || []) llamadasMarcado.add(w);
  }
  llamadasMarcado.forEach(incluirNombre);

  while (pila.length) {
    const i = pila.pop(), s = sentencias[i];
    actual = (s.defs.size ? [...s.defs][0] : 'efecto');
    s.refs.forEach(incluirNombre);
    s.cadenas.forEach(c => (c.match(/[A-Za-z_$][\w$]*/g) || []).forEach(incluirNombre));
  }

  // 4) Sentencias sin definiciones (efectos: escuchas, arranque). Se incluyen si
  //    no dependen de nada del panel que quedó fuera.
  let cambio = true;
  while (cambio) {
    cambio = false;
    sentencias.forEach((s, i) => {
      if (incluida.has(i) || s.defs.size) return;
      const dependeDePanel = [...s.refs].some(n => definidoPor.has(n) && !(definidoPor.get(n).some(j => incluida.has(j))));
      if (!dependeDePanel && [...s.refs].some(n => definidoPor.has(n) || GLOBAL_OK.has(n) || n === 'undefined')) {
        // Solo se incluye si toca algo de la pantalla del socio (o nada del gimnasio)
        const tocaQR = [...s.refs].some(n => definidoPor.has(n) && definidoPor.get(n).some(j => incluida.has(j)));
        const sinGimnasio = ![...s.refs].some(n => definidoPor.has(n));
        if (tocaQR || sinGimnasio) { incluir(i); cambio = true; }
      }
    });
    while (pila.length) {
      const s = sentencias[pila.pop()];
      s.refs.forEach(incluirNombre);
      s.cadenas.forEach(c => (c.match(/[A-Za-z_$][\w$]*/g) || []).forEach(incluirNombre));
      cambio = true;
    }
  }

  // Traza: por qué entró una función (node tools/build-qr.js --traza render)
  const quiereTraza = process.argv.indexOf('--traza');
  if (quiereTraza > -1) {
    let nombre = process.argv[quiereTraza + 1], i = (definidoPor.get(nombre) || [])[0];
    const cadena = [];
    while (i !== undefined && cadena.length < 30) {
      cadena.push([...sentencias[i].defs][0] || 'efecto');
      const c = causa.get(i); if (c === undefined || c === 'raiz') { cadena.push(c); break; }
      i = (definidoPor.get(c) || [])[0];
    }
    console.error('TRAZA ' + nombre + ': ' + cadena.join(' <- '));
  }

  // 5) Verificación: todo lo que el marcado llama debe estar disponible
  const faltan = [...llamadasMarcado].filter(n =>
    definidoPor.has(n) && !STUBS.includes(n) && !(definidoPor.get(n).some(j => incluida.has(j))));
  if (faltan.length) throw new Error('El marcado de la pantalla del socio llama a funciones que no se incluyeron: ' + faltan.join(', '));

  // 6) JavaScript de la pantalla del socio, en el mismo orden que en gym.html
  const stubs = STUBS.map(n => `window.${n} = function () {};`).join('\n');
  let js = stubs + '\n\n' + sentencias.map((s, i) => (incluida.has(i) ? s.texto : null)).filter(Boolean).join('\n\n');
  // En gym.html la pantalla del socio se activa con ?qr=1; qr.html siempre es la pantalla del socio
  js = js.replace('url.searchParams.get("qr") === "1"', 'document.documentElement.classList.contains("qr-mode")');

  // 7) Cabecera: la de gym.html, sin el arranque de ?qr=1 (qr.html siempre es la
  //    pantalla del socio), sin las librerías del panel y sin metas repetidas
  const finCabecera = html.indexOf('</head>') + '</head>'.length;
  let cabecera = html.slice(0, finCabecera);
  cabecera = cabecera.replace(/\s*<!-- ⚡ DETECCIÓN[^\n]*\n/, '\n');
  cabecera = cabecera.replace(/<script>\s*if \(window\.location\.search\.includes\("qr=1"\)\)[\s\S]*?<\/script>/,
    '<script>document.documentElement.classList.add("qr-mode");</script>\n  <link rel="manifest" href="manifest-qr.json">');
  cabecera = cabecera.replace(/<script[^>]*src="[^"]*(html2canvas|qrcode)[^"]*"[^>]*><\/script>\n?/g, '');
  // Metas y título que gym.html repite: se dejan la primera vez
  for (const meta of [/<meta charset="UTF-8">\n?/, /<meta name="viewport"[^>]*>\n?/, /<title>[^<]*<\/title>\n?/]) {
    let visto = false;
    cabecera = cabecera.replace(new RegExp(meta.source, 'g'), (m) => (visto ? '' : ((visto = true), m)));
  }

  // 8) Cuerpo: el marcado de gym.html sin el panel ni sus scripts (el JS va al final)
  let resto = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>'));
  PANEL_SOLO.forEach(a => { resto = quitarElemento(resto, a); });
  resto = resto.replace(/<script\b([^>]*)>[\s\S]*?<\/script>/g, (m, attrs) => (/\bsrc\s*=/.test(attrs) ? '' : ''));
  const finCuerpo = html.slice(html.lastIndexOf('</body>'));

  let salida = cabecera + '\n\n' + resto + finCuerpo;
  salida = salida.replace('</body>', `<script>
/* GENERADO por tools/build-qr.js desde gym.html. No editar a mano: editar gym.html y regenerar. */
${js}
</script>
</body>`);
  return salida;
}

const salida = construir();
if (process.argv.includes('--check')) {
  const actual = fs.existsSync(QR) ? fs.readFileSync(QR, 'utf8') : '';
  if (actual !== salida) { console.error('qr.html está desactualizado: ejecuta node tools/build-qr.js'); process.exit(1); }
  console.log('qr.html al día');
} else {
  fs.writeFileSync(QR, salida, 'utf8');
  console.log('qr.html generado:', Buffer.byteLength(salida, 'utf8'), 'bytes');
}
