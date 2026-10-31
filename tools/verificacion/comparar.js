// Compara dos carpetas de capturas píxel por píxel. Uso: node tools/verificacion/comparar.js <carpetaA> <carpetaB>
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const [,, a, b] = process.argv;
const py = `
import sys, os
from PIL import Image, ImageChops
a, b = sys.argv[1], sys.argv[2]
nombres = sorted(set(os.listdir(a)) | set(os.listdir(b)))
malos = 0
for n in nombres:
    if not (os.path.exists(os.path.join(a, n)) and os.path.exists(os.path.join(b, n))):
        print('FALTA', n); malos += 1; continue
    x = Image.open(os.path.join(a, n)).convert('RGB'); y = Image.open(os.path.join(b, n)).convert('RGB')
    if x.size != y.size: print('TAMAÑO', n, x.size, y.size); malos += 1; continue
    d = ImageChops.difference(x, y)
    bbox = d.getbbox()
    if not bbox: continue
    # Las tarjetas por separado no toleran nada; las pantallas completas toleran un ruido mínimo de animación
    px = sum(1 for p in d.convert('L').getdata() if p > 0)
    tolerancia = 0 if n.startswith('tarjeta') else 1200
    if px <= tolerancia and not n.startswith('tarjeta'):
        print('RUIDO (tolerado)', n, 'píxeles', px, 'zona', bbox)
    else:
        print('DIFERENTE', n, 'píxeles', px, 'zona', bbox); malos += 1
print('iguales:', len(nombres) - malos, 'de', len(nombres))
sys.exit(1 if malos else 0)
`;
try { process.stdout.write(execFileSync('python3', ['-c', py, a, b], { encoding: 'utf8' })); process.exit(0); }
catch (e) { process.stdout.write(e.stdout || ''); process.exit(1); }
