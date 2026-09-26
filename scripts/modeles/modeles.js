/* ==========================================================================
   Brewstead — les objets des lieux, modelés en volume

   Fûts, ruches, parcelles et cultures, plus quelques icônes (gerbe, houblon,
   levure, corne). Tout est construit ici, géométrie et textures, sans aucun
   fichier extérieur : la même graine donne toujours la même image.

   La page rend un seul objet, choisi par l'adresse :
     rendu.html?modele=fut-pret&taille=640&haut=640&expo=1.05&ombre=1
   puis met son titre à « pret ». Voir rendre.mjs et LISEZMOI.md.
   ========================================================================== */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const params = new URLSearchParams(location.search);
const TAILLE = Number(params.get('taille') || 640);
const HAUT = Number(params.get('haut') || TAILLE);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(TAILLE, HAUT);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = Number(params.get('expo') || 1.05);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

/* ------------------------------------------------------------- aléatoire */
let graine = 7;
const alea = () => { graine = (graine * 16807) % 2147483647; return (graine - 1) / 2147483646; };

/* --------------------------------------------------------------- textures */
function toile(w, h, dessin) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  dessin(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const hsl = (h, s, l) => `hsl(${h},${s}%,${l}%)`;

function boisDouelles(n, teinte = 28) {
  return toile(1024, 512, (g, w, h) => {
    const lw = w / n;
    for (let i = 0; i < n; i++) {
      const l = 30 + alea() * 12, s = 45 + alea() * 12, t = teinte + (alea() - .5) * 8;
      const grad = g.createLinearGradient(i * lw, 0, (i + 1) * lw, 0);
      grad.addColorStop(0, hsl(t, s, l - 6)); grad.addColorStop(.5, hsl(t, s, l + 4)); grad.addColorStop(1, hsl(t, s, l - 8));
      g.fillStyle = grad; g.fillRect(i * lw, 0, lw, h);
      // veines
      for (let k = 0; k < 14; k++) {
        g.strokeStyle = `rgba(40,20,5,${.12 + alea() * .18})`; g.lineWidth = 1 + alea() * 1.6;
        const x0 = i * lw + alea() * lw; g.beginPath(); g.moveTo(x0, 0);
        for (let y = 0; y <= h; y += 16) g.lineTo(x0 + Math.sin(y / (30 + alea() * 30) + k) * 3, y);
        g.stroke();
      }
      // nœud
      if (alea() > .55) { const cx = i * lw + lw * (.3 + alea() * .4), cy = alea() * h; const r = g.createRadialGradient(cx, cy, 1, cx, cy, 9); r.addColorStop(0, 'rgba(50,25,8,.8)'); r.addColorStop(1, 'rgba(50,25,8,0)'); g.fillStyle = r; g.beginPath(); g.ellipse(cx, cy, 5, 11, 0, 0, 7); g.fill(); }
      // joint sombre
      g.fillStyle = 'rgba(25,12,4,.85)'; g.fillRect(i * lw, 0, 2.5, h);
    }
  });
}
function planches(n, teinte = 30, clair = 36) {
  return toile(512, 512, (g, w, h) => {
    const lh = h / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = hsl(teinte + (alea() - .5) * 6, 44, clair + (alea() - .5) * 8); g.fillRect(0, i * lh, w, lh);
      for (let k = 0; k < 10; k++) { g.strokeStyle = `rgba(45,22,6,${.1 + alea() * .15})`; g.lineWidth = 1.2; const y0 = i * lh + alea() * lh; g.beginPath(); g.moveTo(0, y0); for (let x = 0; x <= w; x += 20) g.lineTo(x, y0 + Math.sin(x / 40 + k) * 2); g.stroke(); }
      g.fillStyle = 'rgba(25,12,4,.8)'; g.fillRect(0, i * lh, w, 3);
    }
  });
}
function metal(base = [48, 44, 40]) {
  return toile(256, 256, (g, w, h) => {
    g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${alea() > .5 ? '255,230,200' : '0,0,0'},${alea() * .08})`; g.fillRect(alea() * w, alea() * h, 2, 2); }
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(120,60,20,${alea() * .25})`; g.beginPath(); g.arc(alea() * w, alea() * h, 3 + alea() * 10, 0, 7); g.fill(); }
  });
}

/* -------------------------------------------------------------- matières */
const mat = (o) => new THREE.MeshStandardMaterial(o);

/* ------------------------------------------------------------------ fût */
function profilFut(h, rMil, rBout) {
  const pts = [];
  for (let i = 0; i <= 24; i++) { const t = i / 24; const y = (t - .5) * h; const r = rBout + (rMil - rBout) * Math.sin(Math.PI * t); pts.push(new THREE.Vector2(r, y)); }
  return pts;
}
function fut({ ouvert = false, mousse = false } = {}) {
  const g = new THREE.Group();
  const H = 1.5, RM = .62, RB = .5;
  const bois = mat({ map: boisDouelles(22), roughness: .78, metalness: 0 });
  const corps = new THREE.Mesh(new THREE.LatheGeometry(profilFut(H, RM, RB), 64), bois);
  corps.castShadow = corps.receiveShadow = true; g.add(corps);
  // cerclages
  const fer = mat({ map: metal([92, 86, 80]), roughness: .5, metalness: .55, color: 0xa39a90 });
  const rayonA = y => RB + (RM - RB) * Math.sin(Math.PI * (y / H + .5));
  for (const y of [-.62, -.36, .36, .62]) {
    const r = rayonA(y) + .012;
    const c = new THREE.Mesh(new THREE.TorusGeometry(r, .028, 10, 96), fer);
    c.rotation.x = Math.PI / 2; c.position.y = y; c.scale.z = 1.6; c.castShadow = true; g.add(c);
    // rivets
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; const rv = new THREE.Mesh(new THREE.SphereGeometry(.014, 8, 6), fer); rv.position.set(Math.cos(a) * (r + .025), y, Math.sin(a) * (r + .025)); g.add(rv); }
  }
  // fond du haut
  const dessus = new THREE.Mesh(new THREE.CircleGeometry(RB - .01, 48), mat({ map: planches(6, 28, 30), roughness: .8 }));
  dessus.rotation.x = -Math.PI / 2; dessus.position.y = H / 2 - (ouvert ? .06 : .015); dessus.receiveShadow = true; g.add(dessus);
  // rebord (chanfrein)
  const rebord = new THREE.Mesh(new THREE.TorusGeometry(RB - .005, .03, 8, 64), mat({ color: 0x6e4424, roughness: .8 }));
  rebord.rotation.x = Math.PI / 2; rebord.position.y = H / 2; g.add(rebord);
  if (mousse) {
    // bière qui déborde : un dôme de mousse fine, des bulles serrées, des coulures
    const m = mat({ color: 0xfff4dc, roughness: .6, emissive: 0x2a1c08, emissiveIntensity: .12 });
    // un chapeau de mousse qui déborde du fût, bosselé
    const cap = new THREE.SphereGeometry(RB + .06, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    const pos = cap.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const bosse = 1 + .06 * Math.sin(x * 23 + z * 17) * Math.cos(z * 19 - x * 7) + .04 * Math.sin(x * 41 - z * 37);
      pos.setXYZ(i, x * bosse, y * bosse, z * bosse);
    }
    cap.computeVertexNormals();
    const dome = new THREE.Mesh(cap, m);
    dome.scale.y = .5; dome.position.y = H / 2 - .04; dome.castShadow = true; g.add(dome);
    for (let i = 0; i < 45; i++) {
      const a = alea() * Math.PI * 2, d = Math.sqrt(alea()) * (RB - .02);
      const hauteur = Math.sqrt(Math.max(0, 1 - (d / (RB + .06)) ** 2)) * (RB + .06) * .5;
      const b = new THREE.Mesh(new THREE.SphereGeometry(.018 + alea() * .03, 12, 8), m);
      b.position.set(Math.cos(a) * d, H / 2 - .05 + hauteur, Math.sin(a) * d); g.add(b);
    }
    for (const [ang, len, ep] of [[1.2, .24, .05], [1.75, .12, .04], [2.2, .32, .045], [.7, .16, .04]]) {
      const r = RB + .045;
      const c = new THREE.Mesh(new THREE.CapsuleGeometry(ep, len, 6, 14), m);
      c.position.set(Math.cos(ang) * r, H / 2 - .02 - len / 2, Math.sin(ang) * r); g.add(c);
    }
  } else {
    // bonde et robinet
    const bonde = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .03, 20), mat({ color: 0x4a2e18, roughness: .7 }));
    bonde.position.set(.12, H / 2 + .005, -.1); g.add(bonde);
  }
  const laiton = mat({ color: 0xc89b3c, roughness: .3, metalness: .9 });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .2, 16), laiton);
  tube.rotation.x = Math.PI / 2; tube.position.set(0, -.38, RM - .05 + .1); g.add(tube);
  const bec = new THREE.Mesh(new THREE.CylinderGeometry(.03, .022, .1, 14), laiton); bec.position.set(0, -.44, RM + .1); g.add(bec);
  const cle = new THREE.Mesh(new THREE.BoxGeometry(.14, .03, .03), laiton); cle.position.set(0, -.34, RM + .1); g.add(cle);
  // tréteau
  const bois2 = mat({ map: planches(1, 26, 28), roughness: .85 });
  for (const x of [-.42, .42]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(.16, .16, 1.1), bois2); t.position.set(x, -H / 2 - .02, 0); t.castShadow = t.receiveShadow = true; g.add(t);
  }
  g.position.y = H / 2 + .1;
  return g;
}


/* ---------------------------------------------------------------- ruche */
function paille() {
  return toile(1024, 256, (g, w, h) => {
    g.fillStyle = hsl(40, 62, 52); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const y = alea() * h, x = alea() * w, l = 20 + alea() * 60;
      g.strokeStyle = alea() > .5 ? `rgba(255,228,150,${.25 + alea() * .35})` : `rgba(120,80,20,${.2 + alea() * .3})`;
      g.lineWidth = .8 + alea() * 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (alea() - .5) * 4); g.stroke();
    }
    // liens d'osier qui serrent les boudins
    for (let x = 0; x < w; x += 64) { g.fillStyle = 'rgba(95,60,20,.55)'; g.fillRect(x + alea() * 10, 0, 6, h); }
  });
}
function ruche({ miel = false } = {}) {
  const g = new THREE.Group();
  const matPaille = mat({ map: paille(), roughness: .92, color: 0xfff0d0 });
  // la cloche : des boudins de paille empilés, de plus en plus petits
  const tours = 9, H = 1.25, R = .72;
  for (let i = 0; i < tours; i++) {
    const t = i / tours;
    const y = t * H;
    const r = R * Math.sqrt(Math.max(.02, 1 - Math.pow(t, 1.6))) ;
    const ep = .085 * (1 - t * .35);
    if (r < .06) break;
    const boudin = new THREE.Mesh(new THREE.TorusGeometry(r, ep, 14, 72), matPaille);
    boudin.rotation.x = Math.PI / 2; boudin.position.y = y + ep; boudin.castShadow = boudin.receiveShadow = true;
    boudin.material.map.repeat.set(3, 1);
    g.add(boudin);
    // remplissage intérieur pour qu'on ne voie pas à travers
    const disque = new THREE.Mesh(new THREE.CylinderGeometry(r, r, ep * 1.6, 48), matPaille); disque.position.y = y + ep; g.add(disque);
  }
  const sommet = new THREE.Mesh(new THREE.SphereGeometry(.16, 24, 16), matPaille); sommet.position.y = H + .02; sommet.scale.y = .7; g.add(sommet);
  // l'entrée
  const entree = new THREE.Mesh(new THREE.SphereGeometry(.12, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat({ color: 0x1a0e04, roughness: 1 }));
  entree.rotation.x = Math.PI / 2; entree.position.set(0, .14, R - .02); entree.scale.set(1.1, 1, .6); g.add(entree);
  // planche d'envol et socle
  const bois = mat({ map: planches(3, 26, 32), roughness: .85 });
  const socle = new THREE.Mesh(new THREE.CylinderGeometry(R + .16, R + .2, .12, 48), bois); socle.position.y = -.06; socle.castShadow = socle.receiveShadow = true; g.add(socle);
  const envol = new THREE.Mesh(new THREE.BoxGeometry(.4, .04, .22), bois); envol.position.set(0, .02, R + .12); g.add(envol);
  for (const [x, z] of [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]]) {
    const pied = new THREE.Mesh(new THREE.CylinderGeometry(.06, .07, .3, 12), bois); pied.position.set(x * 1.1, -.27, z * 1.1); pied.castShadow = true; g.add(pied);
  }
  if (miel) {
    // le miel coule de l'entrée et perle sur la paille
    const m = mat({ color: 0xf2a516, roughness: .15, metalness: 0, emissive: 0x6a3a00, emissiveIntensity: .35, transparent: true, opacity: .95 });
    const coulee = new THREE.Mesh(new THREE.CapsuleGeometry(.06, .14, 8, 16), m); coulee.position.set(0, .06, R + .02); g.add(coulee);
    for (const [a, y, l] of [[.5, .55, .22], [-.4, .75, .18], [1.1, .35, .16], [-1.0, .4, .2], [.1, .9, .15]]) {
      const r = R * Math.sqrt(1 - Math.pow(y / H, 1.6)) + .075;
      const c = new THREE.Mesh(new THREE.CapsuleGeometry(.045, l, 6, 12), m);
      c.position.set(Math.sin(a) * r, y - l / 2, Math.cos(a) * r); g.add(c);
    }
    const flaque = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .015, 32), m); flaque.position.set(0, .05, R + .14); flaque.scale.z = .6; g.add(flaque);
    // un pot de grès plein à ras bord, posé sur le socle
    const profil = []; for (let i = 0; i <= 16; i++) { const t = i / 16; profil.push(new THREE.Vector2(.1 + Math.sin(t * Math.PI) * .07 - (t > .85 ? (t - .85) * .3 : 0), t * .26)); }
    const pot = new THREE.Mesh(new THREE.LatheGeometry(profil, 40), mat({ color: 0x9a5a34, roughness: .55 })); pot.castShadow = true;
    const groupePot = new THREE.Group(); groupePot.add(pot);
    const dessus = new THREE.Mesh(new THREE.SphereGeometry(.105, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), m); dessus.scale.y = .35; dessus.position.y = .25; groupePot.add(dessus);
    for (const [a, l] of [[.4, .1], [2.2, .07], [4, .12]]) { const c = new THREE.Mesh(new THREE.CapsuleGeometry(.022, l, 6, 12), m); c.position.set(Math.cos(a) * .11, .25 - l / 2, Math.sin(a) * .11); groupePot.add(c); }
    const lien = new THREE.Mesh(new THREE.TorusGeometry(.105, .012, 8, 40), mat({ color: 0x6b4a2a, roughness: .9 })); lien.rotation.x = Math.PI / 2; lien.position.y = .2; groupePot.add(lien);
    groupePot.position.set(.62, 0, .42); g.add(groupePot);
  }
  g.position.y = .42;
  return g;
}


/* -------------------------------------------------------------- parcelle */
const PW = 2.6, PD = 1.7, RANGS = 5;
const zRang = r => -PD / 2 + .2 + (PD - .4) * (r + .5) / RANGS;   // crête de chaque billon
function terre() {
  return toile(1024, 1024, (g, w, h) => {
    g.fillStyle = hsl(24, 38, 20); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const l = 10 + alea() * 22; g.fillStyle = hsl(22 + alea() * 10, 30 + alea() * 20, l); const r = .6 + alea() * 2.4; g.beginPath(); g.arc(alea() * w, alea() * h, r, 0, 7); g.fill(); }
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${alea() > .5 ? '120,90,60' : '20,10,5'},${.25 + alea() * .3})`; g.beginPath(); g.ellipse(alea() * w, alea() * h, 3 + alea() * 6, 2 + alea() * 4, alea() * 3, 0, 7); g.fill(); }
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(150,140,125,${.5 + alea() * .4})`; g.beginPath(); g.ellipse(alea() * w, alea() * h, 2 + alea() * 4, 1.5 + alea() * 3, alea() * 3, 0, 7); g.fill(); }
  });
}
function ecorce() {
  return toile(512, 256, (g, w, h) => {
    g.fillStyle = hsl(26, 34, 26); g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 6 + alea() * 10) { g.fillStyle = hsl(24 + alea() * 8, 30, 18 + alea() * 14); g.fillRect(x, 0, 4 + alea() * 8, h); }
    for (let i = 0; i < 260; i++) { g.strokeStyle = alea() > .6 ? `rgba(170,130,90,${.2 + alea() * .25})` : `rgba(15,8,3,${.35 + alea() * .35})`; g.lineWidth = 1 + alea() * 2; const y = alea() * h, x = alea() * w; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (alea() - .5) * 4, y + 30 + alea() * 90); g.stroke(); }
  });
}
function parcelle() {
  const g = new THREE.Group();
  // la terre, labourée en billons
  const geo = new THREE.PlaneGeometry(PW - .12, PD - .12, 220, 140); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position; const couleurs = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const u = (z + PD / 2 - .2) / (PD - .4) * RANGS - .5;       // 0 au sommet d'un billon
    const crete = Math.cos(u * Math.PI * 2) * .5 + .5;
    const bord = Math.min(1, (PW / 2 - .06 - Math.abs(x)) / .12, (PD / 2 - .06 - Math.abs(z)) / .12);
    const y = .1 + (crete * .09 + (alea() - .5) * .012 + .008 * Math.sin(x * 13 + z * 5)) * Math.max(0, bord);
    pos.setY(i, y);
    const c = .62 + crete * .45; couleurs.push(c, c * .97, c * .94);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(couleurs, 3));
  geo.computeVertexNormals();
  const t = terre(); t.repeat.set(2.2, 1.4);
  const sol = new THREE.Mesh(geo, mat({ map: t, vertexColors: true, roughness: .97 }));
  sol.receiveShadow = true; sol.castShadow = true; g.add(sol);
  const fond = new THREE.Mesh(new THREE.BoxGeometry(PW - .1, .1, PD - .1), mat({ color: 0x3a2412, roughness: 1 })); fond.position.y = .05; g.add(fond);
  // la bordure : quatre rondins
  const m = mat({ map: ecorce(), roughness: .9 });
  const bout = mat({ map: toile(128, 128, (c, w, h) => { c.fillStyle = hsl(32, 48, 52); c.fillRect(0, 0, w, h); for (let r = 8; r < 64; r += 7) { c.strokeStyle = 'rgba(110,70,30,.6)'; c.lineWidth = 2; c.beginPath(); c.arc(64, 64, r, 0, 7); c.stroke(); } c.strokeStyle = hsl(26, 34, 22); c.lineWidth = 10; c.beginPath(); c.arc(64, 64, 60, 0, 7); c.stroke(); }), roughness: .85 });
  const rondin = (long, x, z, rot) => {
    const cyl = new THREE.CylinderGeometry(.075, .08, long, 20, 1);
    const r = new THREE.Mesh(cyl, [m, bout, bout]); r.rotation.z = Math.PI / 2; r.rotation.y = rot; r.position.set(x, .08, z);
    r.castShadow = r.receiveShadow = true; g.add(r);
  };
  rondin(PW + .12, 0, PD / 2, 0); rondin(PW + .12, 0, -PD / 2, 0);
  rondin(PD - .06, PW / 2, 0, Math.PI / 2); rondin(PD - .06, -PW / 2, 0, Math.PI / 2);
  // quelques mottes et cailloux sur les bords
  for (let i = 0; i < 8; i++) { const c = new THREE.Mesh(new THREE.DodecahedronGeometry(.018 + alea() * .02, 1), mat({ color: alea() > .6 ? 0x6a6258 : 0x3e2818, roughness: 1 })); c.position.set((alea() - .5) * (PW - .3), .2, (alea() > .5 ? 1 : -1) * (PD / 2 - .12)); c.position.y = .16; g.add(c); }
  return g;
}
const hauteurSol = z => { const u = (z + PD / 2 - .2) / (PD - .4) * RANGS - .5; return .1 + (Math.cos(u * Math.PI * 2) * .5 + .5) * .09; };

/* ------------------------------------------------------------- végétaux */
// Tout ce qui pousse est fusionné en quelques maillages, couleur par sommet.
class Botte {
  constructor() { this.parts = new Map(); }
  add(cle, geo, matrice, couleur) {
    const g = geo.clone(); g.applyMatrix4(matrice);
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = couleur.r; c[i * 3 + 1] = couleur.g; c[i * 3 + 2] = couleur.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    if (!this.parts.has(cle)) this.parts.set(cle, []);
    this.parts.get(cle).push(g.index ? g.toNonIndexed() : g);
  }
  maillages(materiaux) {
    const out = new THREE.Group();
    for (const [cle, geos] of this.parts) {
      const ms = new THREE.Mesh(mergeGeometries(geos.map(x => { for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'color', 'uv'].includes(k)) x.deleteAttribute(k); if (!x.attributes.uv) x.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(x.attributes.position.count * 2), 2)); return x; })), materiaux[cle]);
      ms.castShadow = true; ms.receiveShadow = true; out.add(ms);
    }
    return out;
  }
}
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S3 = new THREE.Vector3();
function place(x, y, z, rx, ry, rz, sx, sy = sx, sz = sx) { E.set(rx, ry, rz, 'YXZ'); Q.setFromEuler(E); return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), Q.clone(), new THREE.Vector3(sx, sy, sz)); }
const teinte = (h, s, l) => new THREE.Color().setHSL(h / 360, Math.min(1, s * 1.25), l * .62);

// un brin : une lame effilée, courbée
function lame(courbe = .35) {
  const geo = new THREE.PlaneGeometry(.035, 1, 1, 6); geo.translate(0, .5, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (1 - y * .92)); p.setZ(i, y * y * courbe); }
  geo.computeVertexNormals(); return geo;
}
// une feuille ovale, légèrement creusée
function feuilleGeo(pointe = 1) {
  const s = new THREE.Shape(); s.moveTo(0, 0); s.bezierCurveTo(.45, .2, .4, .75, 0, 1 * pointe); s.bezierCurveTo(-.4, .75, -.45, .2, 0, 0);
  const geo = new THREE.ShapeGeometry(s, 8); const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, x * x * .8 - y * y * .25); }
  geo.computeVertexNormals(); return geo;
}
// feuille de houblon : trois lobes dentelés
function feuilleHoublon() {
  const s = new THREE.Shape(); s.moveTo(0, 0);
  s.bezierCurveTo(.35, .05, .6, .25, .55, .5); s.lineTo(.4, .48); s.bezierCurveTo(.42, .7, .25, .85, 0, 1);
  s.bezierCurveTo(-.25, .85, -.42, .7, -.4, .48); s.lineTo(-.55, .5); s.bezierCurveTo(-.6, .25, -.35, .05, 0, 0);
  const geo = new THREE.ShapeGeometry(s, 8); const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, x * x * .5 - y * .15); }
  geo.computeVertexNormals(); return geo;
}
const matVeg = () => mat({ vertexColors: true, roughness: .75, side: THREE.DoubleSide });
const matFruit = () => mat({ vertexColors: true, roughness: .25, metalness: 0 });

function planter(g, pas, fn) {
  // pour chaque rang, des pieds répartis avec un peu de désordre
  for (let r = 0; r < RANGS; r++) {
    const z = zRang(r);
    for (let x = -PW / 2 + .2 + alea() * .05; x < PW / 2 - .16; x += pas * (.85 + alea() * .3)) fn(x, hauteurSol(z) - .01, z + (alea() - .5) * .05, r);
  }
}

/* céréales : orge et seigle, en touffes puis en épis */
function cereales(stade) {
  const b = new Botte(), l = lame(.25);
  const tige = new THREE.CylinderGeometry(.0035, .005, 1, 5); tige.translate(0, .5, 0);
  const grain = new THREE.SphereGeometry(.011, 7, 5); grain.scale(1, 1.7, .8);
  const barbe = new THREE.CylinderGeometry(.0012, .0012, .11, 3); barbe.translate(0, .055, 0);
  const g = new THREE.Group();
  const axe = new THREE.Vector3(), haut = new THREE.Vector3(0, 1, 0);
  planter(g, stade === 1 ? .1 : .09, (x, y, z) => {
    // les feuilles de la touffe
    const n = stade === 3 ? 3 : stade === 1 ? 6 : 7;
    for (let k = 0; k < n; k++) {
      const a = alea() * Math.PI * 2, pen = .35 + alea() * .35;
      const h = (stade === 1 ? .1 : stade === 2 ? .34 : .2) * (.75 + alea() * .5);
      const c = stade === 3 ? teinte(34 + alea() * 12, .55, .36 + alea() * .1) : teinte(92 + alea() * 22, .55, .3 + alea() * .1);
      b.add('v', l, place(x + (alea() - .5) * .03, y, z + (alea() - .5) * .03, pen * Math.cos(a), a, pen * Math.sin(a) * .3, 1, h, 1), c);
    }
    if (stade !== 3) return;
    // les tiges, et au bout un épi de grains serrés, penché, barbu
    for (let k = 0; k < 4; k++) {
      const a = alea() * Math.PI * 2, pen = .05 + alea() * .16, h = .42 + alea() * .16;
      const x0 = x + (alea() - .5) * .04, z0 = z + (alea() - .5) * .04;
      const rot = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pen * Math.cos(a), a, pen * Math.sin(a), 'YXZ'));
      b.add('v', tige, place(x0, y, z0, pen * Math.cos(a), a, pen * Math.sin(a), 1, h, 1), teinte(40, .55, .45 + alea() * .08));
      axe.copy(haut).applyMatrix4(rot);
      const base = new THREE.Vector3(x0, y, z0).addScaledVector(axe, h);
      // l'épi continue la tige en s'inclinant un peu plus
      const penche = new THREE.Vector3(axe.x * 1.8, axe.y, axe.z * 1.8).normalize();
      const ce = teinte(38 + alea() * 8, .72, .5 + alea() * .1);
      const q = new THREE.Quaternion().setFromUnitVectors(haut, penche);
      for (let j = 0; j < 9; j++) for (const cote of [-1, 1]) {
        const off = new THREE.Vector3(cote * .008, j * .013, 0).applyQuaternion(q);
        const m = new THREE.Matrix4().compose(base.clone().add(off), q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -cote * .35))), new THREE.Vector3(1, 1, 1).multiplyScalar(1 - j * .05));
        b.add('e', grain, m, ce);
        if (j % 2 === 0) b.add('e', barbe, new THREE.Matrix4().compose(base.clone().add(off), q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((alea() - .5) * .3, 0, -cote * .45))), new THREE.Vector3(1, 1, 1)), ce);
      }
    }
  });
  g.add(b.maillages({ v: matVeg(), e: mat({ vertexColors: true, roughness: .5 }) }));
  return g;
}

/* houblon : des perches, et la liane qui y grimpe */
function houblon(stade) {
  const g = new THREE.Group(), b = new Botte(), f = feuilleHoublon();
  const bois = mat({ map: ecorce(), roughness: .9 });
  const HP = stade === 1 ? .38 : 1.15;
  const cone = new THREE.SphereGeometry(.035, 10, 8); cone.scale(1, 1.55, 1);
  const tige = new THREE.CylinderGeometry(.006, .006, 1, 5); tige.translate(0, .5, 0);
  for (const z of [zRang(1), zRang(3)]) for (const x of [-.9, -.3, .3, .9]) {
    const xx = x + (alea() - .5) * .06, y0 = hauteurSol(z);
    const perche = new THREE.Mesh(new THREE.CylinderGeometry(.018, .026, HP, 8), bois); perche.position.set(xx, y0 + HP / 2 - .02, z); perche.castShadow = true; g.add(perche);
    // la liane s'enroule autour de la perche jusqu'à sa hauteur de pousse
    const monte = stade === 1 ? .22 : stade === 2 ? .7 : 1.1;
    const tours = monte * 5, pts = 40;
    for (let i = 0; i < pts; i++) {
      const t = i / pts, a = t * tours * Math.PI * 2 + x * 3, y = y0 + t * monte;
      const px = xx + Math.cos(a) * .035, pz = z + Math.sin(a) * .035;
      b.add('v', tige, place(px, y, pz, .35, a, 0, 1, monte / pts * 1.2, 1), teinte(90, .35, .3));
      if (i % (stade === 1 ? 5 : 2) === 0) {
        const s = (stade === 1 ? .07 : .12) * (1.1 - t * .4) * (.8 + alea() * .4);
        b.add('v', f, place(px + Math.cos(a) * .04, y, pz + Math.sin(a) * .04, -.5 - alea() * .6, a - Math.PI / 2 + (alea() - .5), (alea() - .5) * .6, s), teinte(100 + alea() * 18, .5, .26 + alea() * .1));
      }
      if (stade === 3 && t > .25 && i % 2 === 1) {
        for (let k = 0; k < 2; k++) {
          const aa = a + (alea() - .5) * 1.5;
          b.add('c', cone, place(xx + Math.cos(aa) * .08, y - .03, z + Math.sin(aa) * .08, (alea() - .5) * .4, alea() * 6, 0, .85 + alea() * .4), teinte(78 + alea() * 12, .55, .55 + alea() * .1));
        }
      }
    }
    // pied de la liane : quelques feuilles au sol
    for (let k = 0; k < 4; k++) { const a = alea() * 6; b.add('v', f, place(xx + Math.cos(a) * .06, y0 + .02, z + Math.sin(a) * .06, -1.1, a, 0, .09), teinte(105, .45, .28)); }
  }
  // le fil entre les perches
  if (stade > 1) for (const z of [zRang(1), zRang(3)]) {
    const fil = new THREE.Mesh(new THREE.CylinderGeometry(.004, .004, 1.9, 4), mat({ color: 0x8a7650, roughness: .9 }));
    fil.rotation.z = Math.PI / 2; fil.position.set(0, hauteurSol(z) + HP - .06, z); g.add(fil);
  }
  const ecaille = toile(128, 128, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) for (let x = (y / 16 % 2) * 12; x < w; x += 24) { c.fillStyle = 'rgba(60,80,20,.35)'; c.beginPath(); c.arc(x + 12, y + 16, 12, Math.PI, 0); c.lineTo(x + 24, y + 18); c.fill(); } });
  g.add(b.maillages({ v: matVeg(), c: mat({ vertexColors: true, map: ecaille, roughness: .6 }) }));
  return g;
}

/* arbustes à baies : airelles, groseilles, sureau… */
function baies(stade) {
  const g = new THREE.Group(), b = new Botte(), f = feuilleGeo();
  const baie = new THREE.SphereGeometry(.024, 12, 10);
  const pas = stade === 1 ? .22 : .32;
  let n = 0;
  for (let r = 0; r < RANGS; r += (stade === 1 ? 1 : 1)) {
    const z = zRang(r);
    for (let x = -PW / 2 + .22 + (r % 2) * pas / 2; x < PW / 2 - .18; x += pas) {
      const y0 = hauteurSol(z), R = stade === 1 ? .05 : stade === 2 ? .15 : .17;
      const nf = stade === 1 ? 5 : 70;
      for (let k = 0; k < nf; k++) {
        // des feuilles posées sur une demi-sphère, tournées vers l'extérieur
        const th = alea() * Math.PI * 2, ph = Math.acos(alea() * .95);
        const px = x + Math.sin(ph) * Math.cos(th) * R, py = y0 + Math.cos(ph) * R * 1.05 + (stade === 1 ? .02 : .03), pz = z + Math.sin(ph) * Math.sin(th) * R;
        b.add('v', f, place(px, py, pz, -ph - .3, -th + Math.PI / 2, (alea() - .5), stade === 1 ? .07 : .075 + alea() * .03), teinte(110 + alea() * 25, .45, .2 + alea() * .12));
      }
      if (stade === 3) for (let k = 0; k < 8; k++) {
        const th = alea() * Math.PI * 2, ph = Math.acos(alea() * .9);
        const px = x + Math.sin(ph) * Math.cos(th) * (R + .02), py = y0 + Math.cos(ph) * (R + .02) * 1.05 + .03, pz = z + Math.sin(ph) * Math.sin(th) * (R + .02);
        for (let j = 0; j < 3; j++) b.add('f', baie, place(px + (alea() - .5) * .05, py + (alea() - .5) * .04, pz + (alea() - .5) * .05, 0, 0, 0, .8 + alea() * .5), teinte(350 + alea() * 14, .85, .42 + alea() * .12));
      }
      n++;
    }
  }
  g.add(b.maillages({ v: matVeg(), f: matFruit() }));
  return g;
}

/* herbes et épices : touffes basses, fleurs en épis */
function herbes(stade) {
  const g = new THREE.Group(), b = new Botte(), f = feuilleGeo(1.4);
  const fleur = new THREE.SphereGeometry(.012, 6, 5);
  const tige = new THREE.CylinderGeometry(.004, .004, 1, 4); tige.translate(0, .5, 0);
  planter(g, stade === 1 ? .16 : .2, (x, y, z) => {
    const R = stade === 1 ? .04 : .1, nf = stade === 1 ? 6 : 34;
    for (let k = 0; k < nf; k++) {
      const th = alea() * Math.PI * 2, ph = Math.acos(alea() * .9);
      b.add('v', f, place(x + Math.sin(ph) * Math.cos(th) * R, y + Math.cos(ph) * R * .8 + .015, z + Math.sin(ph) * Math.sin(th) * R, -ph - .2, -th + Math.PI / 2, (alea() - .5) * .5, stade === 1 ? .05 : .055 + alea() * .02), teinte(125 + alea() * 30, .32, .26 + alea() * .12));
    }
    if (stade === 3) for (let k = 0; k < 5; k++) {
      const a = alea() * 6, h = .12 + alea() * .08, dx = Math.cos(a) * .04, dz = Math.sin(a) * .04;
      b.add('v', tige, place(x + dx, y + .05, z + dz, (alea() - .5) * .3, 0, (alea() - .5) * .3, 1, h, 1), teinte(120, .3, .3));
      const c = alea() > .35 ? teinte(285 + alea() * 25, .5, .55 + alea() * .1) : teinte(50, .1, .92);
      for (let j = 0; j < 9; j++) b.add('f', fleur, place(x + dx + (alea() - .5) * .025, y + .05 + h * (.65 + j * .045), z + dz + (alea() - .5) * .025, 0, 0, 0, 1), c);
    }
  });
  g.add(b.maillages({ v: matVeg(), f: mat({ vertexColors: true, roughness: .6 }) }));
  return g;
}

function champ(culture, stade) {
  const g = parcelle();
  if (culture) g.add(culture(stade));
  return g;
}


/* ---------------------------------------------------------------- icônes */
function mousse(r, m) {
  const g = new THREE.Group();
  const cap = new THREE.SphereGeometry(r, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2); const pos = cap.attributes.position;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); const b = 1 + .07 * Math.sin(x * 23 / r * .5 + z * 17 / r * .5) * Math.cos(z * 19 / r * .5 - x * 7) + .05 * Math.sin(x * 41 - z * 37); pos.setXYZ(i, x * b, y * b, z * b); }
  cap.computeVertexNormals(); const d = new THREE.Mesh(cap, m); d.scale.y = .55; d.castShadow = true; g.add(d);
  for (let i = 0; i < 26; i++) { const a = alea() * 6.28, dd = Math.sqrt(alea()) * r * .9; const hh = Math.sqrt(Math.max(0, 1 - (dd / r) ** 2)) * r * .55; const b = new THREE.Mesh(new THREE.SphereGeometry(r * (.04 + alea() * .06), 10, 8), m); b.position.set(Math.cos(a) * dd, hh, Math.sin(a) * dd); g.add(b); }
  return g;
}
// le cône de houblon : des bractées rondes, en écailles serrées
function coneHoublon() {
  const g = new THREE.Group(), b = new Botte();
  // une bractée : une écaille arrondie qui pend depuis son attache, creusée
  const sh = new THREE.Shape(); sh.moveTo(-.5, 0); sh.bezierCurveTo(-.62, -.55, -.3, -1, 0, -1.02); sh.bezierCurveTo(.3, -1, .62, -.55, .5, 0); sh.lineTo(-.5, 0);
  const br = new THREE.ShapeGeometry(sh, 10); const p = br.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, -x * x * .55 + y * y * .18); }
  br.computeVertexNormals();
  const NIV = 12;
  for (let i = 0; i < NIV; i++) {
    const t = (i + .5) / NIV, y = .08 + t * 1.0;
    const R = .3 * Math.pow(Math.sin(Math.PI * Math.pow(t * .94 + .03, 1.3)), .8) + .03;
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * Math.PI * 2 + i * .63;
      const m = place(Math.cos(a) * R, y + .12, Math.sin(a) * R, -.22, -a + Math.PI / 2, (alea() - .5) * .15, .2 + R * 1.2, .16 + R * 1.1, 1);
      b.add('v', br, m, teinte(88 + alea() * 12, .6, .36 + t * .08 + alea() * .05));
    }
  }
  g.add(b.maillages({ v: mat({ vertexColors: true, roughness: .5, side: THREE.DoubleSide }) }));
  const coeur = new THREE.Mesh(new THREE.SphereGeometry(.24, 24, 16), mat({ color: 0x7a9a30, roughness: .7 })); coeur.scale.y = 2.1; coeur.position.y = .64; g.add(coeur);
  const tige = new THREE.Mesh(new THREE.CylinderGeometry(.02, .025, .3, 8), mat({ color: 0x5a7a22, roughness: .7 })); tige.position.set(.03, 1.3, 0); tige.rotation.z = -.3; g.add(tige);
  const fh = new THREE.Mesh(feuilleHoublon(), mat({ color: 0x3f7a1c, roughness: .6, side: THREE.DoubleSide })); fh.scale.setScalar(.5); fh.position.set(.1, 1.36, .02); fh.rotation.set(-.9, .4, -1.1); g.add(fh);
  return g;
}
// un pot de grès, levure qui mousse
function levure() {
  const g = new THREE.Group();
  const profil = []; for (let i = 0; i <= 20; i++) { const t = i / 20; profil.push(new THREE.Vector2(.36 + Math.sin(t * Math.PI) * .12 - (t > .8 ? (t - .8) * .5 : 0), t * .75)); }
  const pot = new THREE.Mesh(new THREE.LatheGeometry(profil, 48), mat({ color: 0xb3845a, roughness: .5, map: toile(256, 128, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(90,50,20,.55)'; c.fillRect(0, h * .55, w, 6); c.fillRect(0, h * .7, w, 3); for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(80,50,30,${alea() * .2})`; c.fillRect(alea() * w, alea() * h, 2, 2); } }) }));
  pot.castShadow = true; g.add(pot);
  const col = new THREE.Mesh(new THREE.TorusGeometry(.37, .035, 10, 48), mat({ color: 0x9a6c44, roughness: .5 })); col.rotation.x = Math.PI / 2; col.position.y = .75; g.add(col);
  const m = mat({ color: 0xfff1d2, roughness: .6, emissive: 0x2a1c08, emissiveIntensity: .1 });
  const mo = mousse(.38, m); mo.position.y = .72; g.add(mo);
  for (const [a, l] of [[.6, .16], [2.5, .1]]) { const c = new THREE.Mesh(new THREE.CapsuleGeometry(.04, l, 6, 12), m); c.position.set(Math.cos(a) * .4, .74 - l / 2, Math.sin(a) * .4); g.add(c); }
  return g;
}
// une gerbe de blé liée
function gerbe() {
  const g = new THREE.Group(), b = new Botte();
  const tige = new THREE.CylinderGeometry(.012, .012, 1, 5); tige.translate(0, .5, 0);
  const grain = new THREE.SphereGeometry(.03, 8, 6); grain.scale(1, 1.7, .8);
  const barbe = new THREE.CylinderGeometry(.003, .003, .3, 3); barbe.translate(0, .15, 0);
  const haut = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < 34; k++) {
    const a = alea() * 6.28, d = Math.sqrt(alea()) * .12;
    const x0 = Math.cos(a) * d, z0 = Math.sin(a) * d;
    // la tige passe par le lien (y = .55) et s'évase aux deux bouts
    const ev = d / .12, dir = new THREE.Vector3(Math.cos(a) * ev * .5, 1, Math.sin(a) * ev * .5).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(haut, dir);
    const bas = new THREE.Vector3(x0, .55, z0).addScaledVector(dir, -.55);
    const L = 1.25 + alea() * .15;
    b.add('t', tige, new THREE.Matrix4().compose(bas, q, new THREE.Vector3(1, L, 1)), teinte(40, .55, .5 + alea() * .1));
    if (k < 22) {
      const base = bas.clone().addScaledVector(dir, L);
      const ce = teinte(38 + alea() * 8, .72, .52 + alea() * .1);
      for (let j = 0; j < 8; j++) for (const cote of [-1, 1]) {
        const off = new THREE.Vector3(cote * .022, j * .036, 0).applyQuaternion(q);
        b.add('e', grain, new THREE.Matrix4().compose(base.clone().add(off), q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -cote * .35))), new THREE.Vector3(1, 1, 1).multiplyScalar(1 - j * .05)), ce);
        if (j % 2) b.add('e', barbe, new THREE.Matrix4().compose(base.clone().add(off), q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((alea() - .5) * .3, 0, -cote * .4))), new THREE.Vector3(1, 1, 1)), ce);
      }
    }
  }
  g.add(b.maillages({ t: mat({ vertexColors: true, roughness: .6 }), e: mat({ vertexColors: true, roughness: .5 }) }));
  const lien = new THREE.Mesh(new THREE.TorusGeometry(.16, .035, 10, 40), mat({ color: 0xb33a2a, roughness: .6 })); lien.rotation.x = Math.PI / 2; lien.position.y = .55; g.add(lien);
  return g;
}
// la corne à boire, cerclée de laiton, pleine d'hydromel
function corne() {
  const g = new THREE.Group();
  const courbe = new THREE.CatmullRomCurve3([new THREE.Vector3(-.75, .2, 0), new THREE.Vector3(-.55, -.18, 0), new THREE.Vector3(-.05, -.32, 0), new THREE.Vector3(.45, -.05, 0), new THREE.Vector3(.62, .38, 0)]);
  const n = 64, seg = 32, geo = new THREE.TubeGeometry(courbe, n, 1, seg, false);
  // le rayon grandit de la pointe à l'embouchure
  const pos = geo.attributes.position, pts = courbe.getSpacedPoints(n);
  for (let i = 0; i <= n; i++) { const r = .02 + Math.pow(i / n, 1.4) * .24; const c = courbe.getPointAt(i / n); for (let j = 0; j <= seg; j++) { const k = i * (seg + 1) + j; const v = new THREE.Vector3(pos.getX(k), pos.getY(k), pos.getZ(k)).sub(c); v.setLength(r); pos.setXYZ(k, c.x + v.x, c.y + v.y, c.z + v.z); } }
  geo.computeVertexNormals();
  const tex = toile(512, 64, (c, w, h) => { const gr = c.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#2a1a10'); gr.addColorStop(.35, '#6a4a2c'); gr.addColorStop(.8, '#d8c4a0'); gr.addColorStop(1, '#efe2c6'); c.fillStyle = gr; c.fillRect(0, 0, w, h); for (let i = 0; i < 160; i++) { c.strokeStyle = `rgba(60,40,20,${alea() * .25})`; c.beginPath(); const x = alea() * w; c.moveTo(x, 0); c.lineTo(x + (alea() - .5) * 20, h); c.stroke(); } });
  tex.wrapS = THREE.ClampToEdgeWrapping;
  const cornem = new THREE.Mesh(geo, mat({ map: tex, roughness: .35, side: THREE.DoubleSide })); cornem.castShadow = true; g.add(cornem);
  const laiton = mat({ color: 0xc89b3c, roughness: .3, metalness: .9 });
  const bout = courbe.getPointAt(1), tan = courbe.getTangentAt(1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
  const anneau = new THREE.Mesh(new THREE.TorusGeometry(.26, .03, 12, 48), laiton); anneau.position.copy(bout); anneau.quaternion.copy(q); g.add(anneau);
  const anneau2 = new THREE.Mesh(new THREE.TorusGeometry(.2, .022, 12, 48), laiton); anneau2.position.copy(courbe.getPointAt(.82)); anneau2.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), courbe.getTangentAt(.82))); g.add(anneau2);
  const pointe = new THREE.Mesh(new THREE.SphereGeometry(.035, 12, 10), laiton); pointe.position.copy(courbe.getPointAt(0)); g.add(pointe);
  // l'hydromel affleure, avec un peu de mousse
  const surf = new THREE.Mesh(new THREE.CircleGeometry(.24, 40), mat({ color: 0xf0a020, roughness: .15, emissive: 0x6a3a00, emissiveIntensity: .4 }));
  surf.position.copy(bout).addScaledVector(tan, -.03); surf.lookAt(surf.position.clone().add(new THREE.Vector3(0, 1, 0))); g.add(surf);
  g.rotation.y = -.5; g.position.y = .6;
  return g;
}

/* ---------------------------------------------------------------- scène */
const MODELES = { 'fut-en-cours': () => fut(), 'fut-pret': () => fut({ ouvert: true, mousse: true }), 'ruche': () => ruche(), 'ruche-pleine': () => ruche({ miel: true }),
  'parcelle': () => champ(null) };
Object.assign(MODELES, { 'icone-houblon': coneHoublon, 'icone-levure': levure, 'icone-gerbe': gerbe, 'icone-corne': corne });
for (const [nom, f] of Object.entries({ cereales, houblon, baies, herbes })) for (const s of [1, 2, 3]) MODELES[`${nom}-${s}`] = () => champ(f, s);
// Les parcelles partagent un même cadre, cultures hautes comprises : la terre
// tombe au même endroit dans chaque image.
const CADRE_PARCELLE = new THREE.Box3(new THREE.Vector3(-PW / 2 - .1, 0, -PD / 2 - .1), new THREE.Vector3(PW / 2 + .1, 1.35, PD / 2 + .1));

function rendre(nom) {
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = .55;
  // lumière chaude de fin d'après-midi, comme les peintures
  scene.add(new THREE.HemisphereLight(0xfff0d8, 0x3a2a1a, 1.1));
  const soleil = new THREE.DirectionalLight(0xffe2b0, 3.2);
  soleil.position.set(-2.2, 7, 3.2); soleil.castShadow = true; soleil.shadow.mapSize.set(2048, 2048);
  soleil.shadow.camera.left = soleil.shadow.camera.bottom = -3; soleil.shadow.camera.right = soleil.shadow.camera.top = 3; soleil.shadow.bias = -.0005; soleil.shadow.radius = 6;
  scene.add(soleil);
  const contre = new THREE.DirectionalLight(0xffc27a, 1.4); contre.position.set(4, 3, -3); scene.add(contre);
  // ombre portée seule (le sol reste transparent)
  const sol = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: .38 }));
  sol.rotation.x = -Math.PI / 2; sol.receiveShadow = true; if (params.get('ombre') !== '0') scene.add(sol);
  const objet = MODELES[nom](); scene.add(objet);
  // cadrage : vue de face légèrement plongeante (28°), comme les scènes
  const plat = nom === 'parcelle' || /^(cereales|houblon|baies|herbes)-/.test(nom);
  const boite = plat ? CADRE_PARCELLE : new THREE.Box3().setFromObject(objet); const centre = boite.getCenter(new THREE.Vector3()); const taille = boite.getSize(new THREE.Vector3());
  if (plat) { soleil.shadow.camera.left = soleil.shadow.camera.bottom = -2.2; soleil.shadow.camera.right = soleil.shadow.camera.top = 2.2; }
  const camera = new THREE.PerspectiveCamera(22, TAILLE / HAUT, .1, 100);
  const dist = (plat ? taille.x * 2.35 : Math.max(taille.x, taille.y, taille.z) * (nom.startsWith('icone') ? 3.1 : 3.6));
  const el = THREE.MathUtils.degToRad(Number(params.get('elev') || 26));
  camera.position.set(centre.x, centre.y + Math.sin(el) * dist, centre.z + Math.cos(el) * dist);
  camera.lookAt(centre);
  renderer.render(scene, camera);
  document.title = 'pret';
}
rendre(params.get('modele'));
