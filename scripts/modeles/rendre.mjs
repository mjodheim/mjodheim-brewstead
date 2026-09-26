// Rend chaque objet en PNG transparent dans sortie/, avec Chromium sans écran
// (WebGL logiciel). Usage : npm install && node rendre.mjs [noms…]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = dirname(fileURLToPath(import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };

// nom, largeur, hauteur, exposition, ombre portée, suffixe du fichier, angle de vue
const PARCELLES = ['parcelle', ...['cereales', 'houblon', 'baies', 'herbes'].flatMap(f => [1, 2, 3].map(s => `${f}-${s}`))];
const TRAVAUX = [
  ...['fut-en-cours', 'fut-pret', 'ruche', 'ruche-pleine'].map(n => [n, 640, 640, 1.05, 1, '']),
  ...PARCELLES.map(n => [n, 800, 600, 1.05, 1, '']),
  // les icônes, sans ombre portée
  ...['icone-gerbe', 'icone-levure', 'icone-corne', 'fut-en-cours', 'fut-pret', 'ruche'].map(n => [n, 640, 640, 1.05, 0, '-i']),
  ['icone-houblon', 640, 640, 0.6, 0, '-i'],
  ['cereales-3', 800, 600, 1.05, 0, '-i'],
  // les récipients du comptoir, vus presque de face, à hauteur de comptoir
  ['chope-biere', 512, 512, 1.05, 0, '', 12],
  ['chope-hydromel', 512, 512, 1.05, 0, '', 24],
  ['chope-cidre', 512, 512, 1.05, 0, '', 12],
];

const serveur = createServer(async (req, res) => {
  try {
    const chemin = join(ici, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    res.writeHead(200, { 'content-type': TYPES[extname(chemin)] || 'application/octet-stream' });
    res.end(await readFile(chemin));
  } catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise(r => serveur.once('listening', r));
const port = serveur.address().port;

await mkdir(join(ici, 'sortie'), { recursive: true });
const navigateur = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await navigateur.newPage({ viewport: { width: 1024, height: 1024 } });
const erreurs = [];
page.on('pageerror', e => erreurs.push(e.message));

const choisis = process.argv.slice(2);
for (const [nom, l, h, expo, ombre, suffixe, elev = 26] of TRAVAUX) {
  if (choisis.length && !choisis.includes(nom)) continue;
  await page.goto(`http://127.0.0.1:${port}/rendu.html?modele=${nom}&taille=${l}&haut=${h}&expo=${expo}&ombre=${ombre}&elev=${elev}`);
  await page.waitForFunction(() => document.title === 'pret', null, { timeout: 120000 });
  await page.locator('canvas').screenshot({ path: join(ici, 'sortie', `${nom}${suffixe}.png`), omitBackground: true });
  console.log('rendu', nom + suffixe);
}
await navigateur.close();
serveur.close();
if (erreurs.length) { console.error(erreurs.join('\n')); process.exit(1); }
