/* ==========================================================================
   Brewstead — le personnage du joueur

   Le même dessin sert partout : dans la salle de la taverne, et dans
   l'atelier où chacun compose son allure. Il est pensé pour la peinture de
   la taverne : un trait brun franc, des volumes, une ombre du côté du mur et
   la lueur chaude des bougies de l'autre. Les anciens personnages étaient
   des aplats clairs, et ils avaient l'air collés sur le tableau.

   L'origine est aux pieds. Le personnage mesure 150 unités ; la scène le
   met à l'échelle de sa profondeur dans la salle.
   ========================================================================== */

(function (global) {
    'use strict';

    var TRAIT = '#3a2210';

    var CATALOGUE = {
        corps: [['robuste', 'Robuste'], ['fin', 'Élancé'], ['grand', 'Grand']],
        peau: [['claire', 'Claire'], ['rosee', 'Rosée'], ['doree', 'Dorée'], ['halee', 'Hâlée'],
            ['brune', 'Brune'], ['ebene', 'Ébène']],
        cheveux: [['court', 'Courts'], ['tresse', 'Tresses'], ['long', 'Longs'], ['chignon', 'Chignon'],
            ['boucles', 'Bouclés'], ['rase', 'Rasés']],
        teinte: [['blond', 'Blond'], ['roux', 'Roux'], ['chatain', 'Châtain'], ['brun', 'Brun'],
            ['noir', 'Noir'], ['gris', 'Gris']],
        barbe: [['aucune', 'Sans'], ['courte', 'Courte'], ['longue', 'Longue'], ['tressee', 'Tressée'],
            ['moustache', 'Moustache']],
        tenue: [['brasseur', 'Brasseur'], ['voyageur', 'Voyageur'], ['fermier', 'Fermier'],
            ['marchand', 'Marchand'], ['guerrier', 'Guerrier']],
        couleur: [['ambre', 'Ambre'], ['fjord', 'Fjord'], ['mousse', 'Mousse'], ['prune', 'Prune'],
            ['cuivre', 'Cuivre'], ['ardoise', 'Ardoise']]
    };

    // [ton, ombre, lumière]
    var PEAUX = {
        claire: ['#f6d4ba', '#dcaa8a', '#fff0e2'],
        rosee: ['#efbf9e', '#d09372', '#ffdcc4'],
        doree: ['#e0a676', '#bb8055', '#f7c896'],
        halee: ['#c68a5b', '#a0683f', '#e5aa77'],
        brune: ['#99633f', '#76482b', '#bd8358'],
        ebene: ['#6b4029', '#4f2e1c', '#8d5a3b']
    };
    var TEINTES = {
        blond: ['#dcae55', '#a97c30', '#f5d98f'],
        roux: ['#b5522a', '#86381a', '#e0804b'],
        chatain: ['#7a4a29', '#56321a', '#a7703f'],
        brun: ['#4a2f1f', '#301d12', '#6f4a31'],
        noir: ['#261c17', '#130e0b', '#4b3b32'],
        gris: ['#bbb4a9', '#8d857a', '#e4dfd5']
    };
    var COULEURS = {
        ambre: ['#8f4d28', '#c9803f', '#efb466'],
        fjord: ['#2d5068', '#4b7b90', '#96c0c2'],
        mousse: ['#43593a', '#6c7b48', '#aeaa60'],
        prune: ['#553650', '#82556b', '#c48f8e'],
        cuivre: ['#6f3f2c', '#a3623a', '#d9975f'],
        ardoise: ['#3b4650', '#626f78', '#a2aca9']
    };
    var CUIR = ['#5a3418', '#7a4a26', '#a8703f'];
    var FOURRURE = ['#c7b089', '#ebdcbe', '#fff6e3'];
    var PANTALON = '#47352a';
    var BOTTE = ['#3d2616', '#5a3a22'];
    var LUEUR = '#ffbf66';

    function el(tag, attrs) {
        var s = '<' + tag;
        for (var k in attrs) if (attrs[k] != null) s += ' ' + k + '="' + attrs[k] + '"';
        return s + '/>';
    }
    function trace(d, fill, extra) {
        var a = { d: d, fill: fill, stroke: TRAIT, 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
        if (extra) for (var k in extra) a[k] = extra[k];
        return el('path', a);
    }
    function aplat(d, fill, opacite) {
        return el('path', { d: d, fill: fill, opacity: opacite == null ? null : opacite });
    }
    function ligne(d, stroke, largeur, opacite) {
        return el('path', { d: d, fill: 'none', stroke: stroke, 'stroke-width': largeur || 1.6, 'stroke-linecap': 'round', opacity: opacite == null ? null : opacite });
    }

    /**
     * Le modelé : deux dégradés partagés, posés par-dessus chaque forme en
     * coordonnées de la forme elle-même. Sombre du côté du mur, chaud du
     * côté des bougies, un peu de lumière sur le dessus. Deux définitions
     * pour tous les personnages de la salle, et aucun filtre.
     */
    function defs() {
        return '<linearGradient id="pp-volume" x1="0" x2="1" y1="0" y2="0">' +
            '<stop offset="0" stop-color="#1a0900" stop-opacity=".38"/>' +
            '<stop offset=".42" stop-color="#1a0900" stop-opacity="0"/>' +
            '<stop offset=".72" stop-color="#ffbe6a" stop-opacity="0"/>' +
            '<stop offset="1" stop-color="#ffbe6a" stop-opacity=".42"/></linearGradient>' +
            '<linearGradient id="pp-haut" x1="0" x2="0" y1="0" y2="1">' +
            '<stop offset="0" stop-color="#ffe2b0" stop-opacity=".22"/>' +
            '<stop offset=".45" stop-color="#ffe2b0" stop-opacity="0"/>' +
            '<stop offset="1" stop-color="#1a0900" stop-opacity=".26"/></linearGradient>';
    }

    /** Une forme dessinée, puis modelée. */
    function forme(d, fill, extra) {
        return trace(d, fill, extra) + aplat(d, 'url(#pp-volume)') + aplat(d, 'url(#pp-haut)');
    }

    function choix(valeur, liste, defaut) {
        for (var i = 0; i < liste.length; i++) if (liste[i][0] === valeur) return valeur;
        return defaut;
    }

    /** L'allure complète, avec des valeurs sûres pour ce qui manque. */
    function allure(c) {
        c = c || {};
        return {
            corps: choix(c.body || c.corps, CATALOGUE.corps, 'robuste'),
            peau: choix(c.skin || c.peau, CATALOGUE.peau, 'rosee'),
            cheveux: choix(c.hair || c.cheveux, CATALOGUE.cheveux, 'court'),
            teinte: choix(c.hairColor || c.teinte, CATALOGUE.teinte, 'chatain'),
            barbe: choix(c.beard || c.barbe, CATALOGUE.barbe, 'aucune'),
            tenue: choix(c.outfit || c.tenue, CATALOGUE.tenue, 'brasseur'),
            couleur: choix(c.palette || c.couleur, CATALOGUE.couleur, 'ambre')
        };
    }

    /* ------------------------------------------------------------ Cheveux */

    // La tête est dessinée autour de (0, -126) : front à -146, menton à -104.

    function cheveuxDerriere(style, h) {
        if (style === 'long') {
            return forme('M-19-128Q-25-152-4-155Q20-157 21-132Q23-112 25-98Q20-90 12-93Q6-89 0-92Q-7-88-13-93Q-21-90-25-98Q-22-112-19-128Z', h[0]) +
                ligne('M-18-118Q-21-106-20-97M18-118Q21-106 20-97M-12-104q-1 6-2 10M12-104q1 6 2 10', h[1], 1.4, .8);
        }
        if (style === 'tresse') {
            var tresse = function (x, sens) {
                var s = '';
                for (var i = 0; i < 5; i++) {
                    var y = -118 + i * 7, dx = sens * i * .6;
                    s += trace('M' + (x - 5 + dx) + ' ' + y + 'q5-5 10 0q-5 6-10 0Z', h[0], { 'stroke-width': 1.5 }) +
                        ligne('M' + (x - 2 + dx) + ' ' + (y - 1) + 'q2-1.5 4 0', h[2], 1, .7);
                }
                var bout = x + sens * 3;
                return s + el('circle', { cx: bout, cy: -82, r: 2.8, fill: '#b8372a', stroke: TRAIT, 'stroke-width': 1.3 }) +
                    trace('M' + (bout - 3) + '-80l3 8 3-8Z', h[0], { 'stroke-width': 1.3 });
            };
            return tresse(-20, -1) + tresse(20, 1);
        }
        if (style === 'chignon') {
            return forme('M-9-152a9 8 0 1 1 18 0a9 8 0 1 1-18 0Z', h[0]) +
                ligne('M-5-156q5-3 10 0M-6-150q6 2 12 0', h[2], 1.4, .7);
        }
        if (style === 'boucles') {
            return forme('M-21-126Q-27-134-22-142Q-22-152-11-153Q-2-160 8-154Q20-155 21-144Q27-136 21-126Q24-118 20-112Q14-118 16-126L-16-126Q-14-118-20-112Q-24-118-21-126Z', h[0]);
        }
        return '';
    }

    function cheveuxDevant(style, h) {
        var reflet = function (d) { return ligne(d, h[2], 2.2, .75); };
        if (style === 'rase') {
            return aplat('M-17-129Q-18-146 0-147Q18-146 17-129Q14-135 8-137Q0-139-8-137Q-14-135-17-129Z', h[0], .75) +
                ligne('M-9-143q9-3 18 0', h[2], 1.3, .45) +
                ligne('M-13-137l1 2M-7-140l.5 2M0-141v2M7-140l-.5 2M13-137l-1 2', h[1], 1, .6);
        }
        if (style === 'boucles') {
            var s = '';
            [[-16, -138, 5.6], [-9, -145, 6], [0, -147, 6], [9, -145, 6], [16, -138, 5.6], [-19, -129, 4.2], [19, -129, 4.2]]
                .forEach(function (b) {
                    s += el('circle', { cx: b[0], cy: b[1], r: b[2], fill: h[0], stroke: TRAIT, 'stroke-width': 1.8 }) +
                        ligne('M' + (b[0] - 2) + ' ' + (b[1] - 1) + 'q2-2 4 0', h[2], 1.3, .8);
                });
            return s;
        }
        if (style === 'long') {
            return forme('M-19-124Q-21-148 0-149Q21-148 19-124Q21-114 20-106Q15-112 15-121Q14-134 4-139Q-4-133-13-133Q-15-126-15-118Q-16-110-20-106Q-21-114-19-124Z', h[0]) +
                reflet('M-10-143q7-3 13-2M8-141q4 2 6 6');
        }
        if (style === 'tresse' || style === 'chignon') {
            return forme('M-19-125Q-20-149 0-149Q20-149 19-125Q17-133 12-137Q7-140 1-139L-1-135Q-4-139-11-137Q-17-133-19-125Z', h[0]) +
                reflet('M-11-144q6-3 11-2M5-145q5 1 8 4') +
                ligne('M1-139q-1-5 1-9', h[1], 1.3, .8);
        }
        // court : des mèches ébouriffées, pas un casque
        return forme('M-19-124Q-22-137-16-145Q-10-152 0-151Q11-152 17-145Q22-137 19-124Q17-129 14-131Q13-127 10-128Q10-133 5-135Q2-130-3-132Q-5-136-10-134Q-12-129-15-130Q-17-127-19-124Z', h[0]) +
            reflet('M-11-145q7-4 14-3M8-146q4 1 6 4') +
            ligne('M-6-141q2 3 1 6M4-142q2 3 1 6', h[1], 1.2, .8);
    }

    function barbe(style, h) {
        if (style === 'aucune') return '';
        var moustache = forme('M-10-111Q-4-116 0-113Q4-116 10-111Q13-107 15-109Q11-103 4-108Q0-107-4-108Q-11-103-15-109Q-13-107-10-111Z', h[0], { 'stroke-width': 1.5 });
        if (style === 'moustache') return moustache;
        if (style === 'courte') {
            return aplat('M-17-121Q-17-105-8-101Q0-98 8-101Q17-105 17-121Q14-110 7-108Q0-110-7-108Q-14-110-17-121Z', h[0], .88) +
                aplat('M-17-121Q-17-105-8-101Q0-98 8-101Q17-105 17-121Q14-110 7-108Q0-110-7-108Q-14-110-17-121Z', 'url(#pp-volume)') +
                moustache;
        }
        var longue = forme('M-19-121Q-21-100-12-89Q-6-80 0-79Q6-80 12-89Q21-100 19-121Q14-109 6-108Q0-110-6-108Q-14-109-19-121Z', h[0]) +
            ligne('M-9-100q3 6 2 12M0-101v15M9-100q-3 6-2 12', h[1], 1.3, .85) +
            ligne('M-5-104q1 4 0 8M5-104q-1 4 0 8', h[2], 1.1, .6) + moustache;
        if (style === 'tressee') {
            return longue + forme('M-4-82h8l-1 9h-6Z', h[0], { 'stroke-width': 1.5 }) +
                el('circle', { cx: 0, cy: -71, r: 2.6, fill: '#e8c15a', stroke: TRAIT, 'stroke-width': 1.3 });
        }
        return longue;
    }

    /* ------------------------------------------------------------ Tenues */

    function tenueDerriere(tenue, t) {
        if (tenue === 'voyageur') {
            return forme('M-24-96Q-37-66-36-30Q-18-24 0-25Q18-24 36-30Q37-66 24-96Z', t[0]) +
                ligne('M-24-62q-3 16-3 30M24-62q3 16 3 30M-12-40q-1 8 0 14M12-40q1 8 0 14', '#000', 1.3, .22);
        }
        return '';
    }

    function tenueDevant(tenue, t) {
        if (tenue === 'brasseur') {
            return forme('M-14-88Q0-91 14-88L18-45Q0-40-18-45Z', '#e7d7b6') +
                trace('M-8-73h16v10h-16Z', '#d9c59d', { 'stroke-width': 1.3 }) +
                ligne('M-8-73l16 0', '#b99c6c', 1, .8) +
                ligne('M-14-88l-7-7M14-88l7-7', CUIR[0], 2.4) +
                ligne('M-12-50q12 3 24 0', '#b99c6c', 1.2, .8);
        }
        if (tenue === 'marchand') {
            return forme('M-22-94L-6-79L-7-52L-25-54Q-27-66-27-78Z', CUIR[1]) +
                forme('M22-94L6-79L7-52L25-54Q27-66 27-78Z', CUIR[1]) +
                ligne('M-19-86q4 12 1 28M19-86q-4 12-1 28', CUIR[0], 1.1, .7) +
                el('circle', { cx: -8, cy: -73, r: 1.6, fill: '#e8c15a', stroke: TRAIT, 'stroke-width': .8 }) +
                el('circle', { cx: -8.5, cy: -64, r: 1.6, fill: '#e8c15a', stroke: TRAIT, 'stroke-width': .8 }) +
                forme('M17-53q6-1 8 4 1 7-5 8-6-1-6-7Z', CUIR[2], { 'stroke-width': 1.5 });
        }
        if (tenue === 'fermier') {
            return ligne('M-12-95Q-11-75-10-55M12-95Q11-75 10-55', CUIR[0], 3.8) +
                ligne('M-12-95Q-11-75-10-55M12-95Q11-75 10-55', CUIR[2], 1.2, .6) +
                el('circle', { cx: -11.5, cy: -84, r: 1.8, fill: '#e8c15a', stroke: TRAIT, 'stroke-width': .8 }) +
                el('circle', { cx: 11.5, cy: -84, r: 1.8, fill: '#e8c15a', stroke: TRAIT, 'stroke-width': .8 });
        }
        if (tenue === 'guerrier') {
            return forme('M-20-87Q0-81 20-87L22-58Q0-52-22-58Z', CUIR[1]) +
                ligne('M-20-78Q0-72 20-78M-21-68Q0-62 21-68', CUIR[0], 1.3, .9) +
                [-14, -5, 5, 14].map(function (x) {
                    return el('circle', { cx: x, cy: -83 + Math.abs(x) * .12, r: 1.4, fill: '#d9b35c', stroke: TRAIT, 'stroke-width': .7 });
                }).join('');
        }
        // voyageur : l'agrafe de la cape
        return forme('M-6-96h12l-2 6h-8Z', '#d9b35c', { 'stroke-width': 1.3 });
    }

    function fourrure(tenue) {
        if (tenue === 'marchand' || tenue === 'fermier') return '';
        var grand = tenue === 'guerrier';
        var d = grand
            ? 'M-31-88Q-35-98-25-101Q-20-108-11-105Q-5-111 2-106Q9-111 16-105Q25-108 27-100Q36-97 31-87Q24-82 13-88Q5-83-3-88Q-12-82-21-88Q-26-83-31-88Z'
            : 'M-25-93Q-28-100-19-101Q-14-106-7-103Q0-107 7-103Q14-106 19-101Q28-100 25-93Q17-88 8-92Q0-88-8-92Q-17-88-25-93Z';
        return forme(d, FOURRURE[1]) +
            ligne(grand ? 'M-17-99l2 5M-7-101l1 6M5-101l-1 6M16-99l-2 5M-24-93l3 3M24-93l-3 3' : 'M-12-99l1 4M0-100v4M12-99l-1 4', FOURRURE[0], 1.3, .9) +
            ligne(grand ? 'M-12-103q4-2 8 0M6-104q4-1 7 1' : 'M-8-102q4-2 7 0', FOURRURE[2], 1.4, .8);
    }

    /* ------------------------------------------------------------ Le tout */

    /**
     * Le personnage, en SVG.
     *
     * options.chope : une chope dans la main droite (vrai par défaut).
     */
    function dessiner(caractere, options) {
        options = options || {};
        var a = allure(caractere);
        var p = PEAUX[a.peau], h = TEINTES[a.teinte], t = COULEURS[a.couleur];
        var large = a.corps === 'robuste' ? 1.1 : a.corps === 'fin' ? .9 : 1;
        var yeux = a.teinte === 'blond' ? '#3f6f96' : a.teinte === 'roux' ? '#4f7a3a' : '#5a3a1e';
        var chope = options.chope !== false;

        var jambes = '<g class="sc-patron__legs">' +
            forme('M-18-52Q-11-50-3-52L-5-31Q-6-21-6-13H-17Q-18-23-19-32Z', PANTALON) +
            forme('M3-52Q11-50 18-52L19-32Q18-23 17-13H6Q6-21 5-31Z', PANTALON) +
            ligne('M-12-36q2 2 1 5M12-36q-2 2-1 5', '#000', 1.1, .35) +
            forme('M-18-16H-5L-4-5Q-3 1-9 1H-22Q-27 0-23-6Z', BOTTE[1]) +
            forme('M5-16H18L23-6Q27 0 22 1H9Q3 1 4-5Z', BOTTE[1]) +
            forme('M-19-18Q-12-21-4-18Q-3-12-11-12Q-19-12-19-18Z', FOURRURE[1], { 'stroke-width': 1.5 }) +
            forme('M4-18Q12-21 19-18Q19-12 11-12Q3-12 4-18Z', FOURRURE[1], { 'stroke-width': 1.5 }) +
            '</g>';

        var main = function (cx, cy) {
            return trace('M' + (cx - 5.5) + ' ' + cy + 'a5.5 5.8 0 1 0 11 0a5.5 5.8 0 1 0-11 0Z', p[0], { 'class': 'sc-patron__hand', 'stroke-width': 1.8 }) +
                aplat('M' + (cx - 5.5) + ' ' + cy + 'a5.5 5.8 0 0 0 5.5 5.8q-4-2-4-6Z', p[1], .8);
        };

        var brasGauche = '<g class="sc-patron__arm sc-patron__arm--left">' +
            forme('M-23-94Q-33-91-35-77L-37-61Q-37-56-32-55L-27-56Q-26-61-26-67L-24-80Q-22-88-18-90Z', t[1]) +
            ligne('M-30-70q2 3 5 3', t[0], 1.2, .8) +
            main(-32, -51) +
            '</g>';

        var mug = chope
            ? '<g class="sc-patron__mug" transform="translate(42 -74)">' +
            forme('M-7-10H7L6 11H-6Z', '#8a5a33', { 'stroke-width': 1.8 }) +
            ligne('M-7-4H7M-7 4H7', '#caa14f', 1.6) +
            trace('M7-6Q15-5 13 3Q12 7 7 6', 'none', { 'stroke-width': 2 }) +
            el('ellipse', { 'class': 'sc-patron__foam', cx: 0, cy: -10, rx: 8, ry: 3.4, fill: '#fff4d6', stroke: TRAIT, 'stroke-width': 1.4 }) +
            '</g>'
            : '';
        var brasDroit = '<g class="sc-patron__arm sc-patron__arm--right">' +
            forme('M23-94Q33-90 34-77L33-67Q32-62 27-63L23-65Q22-72 22-80Q21-88 17-90Z', t[1]) +
            forme('M24-70Q31-75 37-73L38-64Q31-61 25-62Z', t[1]) +
            main(38, -68) +
            mug +
            '</g>';

        var tunique = 'M-23-95Q-12-101 0-100Q12-101 23-95Q28-90 27-80L24-62Q27-52 31-42Q0-35-31-42Q-27-52-24-62L-27-80Q-28-90-23-95Z';
        var torse =
            trace(tunique, t[1], { 'class': 'sc-patron__torso' }) +
            aplat(tunique, 'url(#pp-volume)') + aplat(tunique, 'url(#pp-haut)') +
            ligne('M-7-62q2 10-2 19M9-64q-1 10 3 21M-20-46q3-3 5-1', t[0], 1.4, .8) +
            trace('M-8-99L0-88L8-99Z', p[1], { 'stroke-width': 1.5 }) +
            tenueDevant(a.tenue, t) +
            forme('M-26-60Q0-54 26-60L27-52Q0-46-27-52Z', CUIR[0]) +
            trace('M-5-61h10v9h-10Z', '#e8c15a', { 'stroke-width': 1.4 }) +
            ligne('M-2-58h4', '#9a6a1a', 1.2) +
            fourrure(a.tenue);

        var visage = 'M-18-126Q-19-111-10-105Q-4-101 0-101Q4-101 10-105Q19-111 18-126Q17-146 0-147Q-17-146-18-126Z';
        // Une tête un peu plus petite que le reste ne le voudrait : assez pour
        // qu'on lise un visage de loin, pas au point d'en faire une poupée.
        var reduite = 'translate(0 -104) scale(.88) translate(0 104)';
        var tete = '<g class="sc-patron__head">' +
            trace('M-5.5-110h11v12h-11Z', p[1], { 'class': 'sc-patron__neck' }) +
            '<g transform="' + reduite + '">' +
            el('ellipse', { 'class': 'sc-patron__ear', cx: -18, cy: -123, rx: 3.8, ry: 5.8, fill: p[0], stroke: TRAIT, 'stroke-width': 1.9 }) +
            el('ellipse', { 'class': 'sc-patron__ear', cx: 18, cy: -123, rx: 3.8, ry: 5.8, fill: p[0], stroke: TRAIT, 'stroke-width': 1.9 }) +
            trace(visage, p[0], { 'class': 'sc-patron__face' }) +
            aplat(visage, 'url(#pp-volume)') +
            aplat('M-16-116Q-14-106-6-103Q-12-108-13-116Z', p[1], .6) +
            el('ellipse', { cx: -11, cy: -114, rx: 4, ry: 2.4, fill: '#e5806a', opacity: .4 }) +
            el('ellipse', { cx: 11, cy: -114, rx: 4, ry: 2.4, fill: '#e5806a', opacity: .4 }) +
            el('ellipse', { cx: -7, cy: -123, rx: 4, ry: 3.5, fill: '#fffaf0', stroke: TRAIT, 'stroke-width': .9 }) +
            el('ellipse', { cx: 7, cy: -123, rx: 4, ry: 3.5, fill: '#fffaf0', stroke: TRAIT, 'stroke-width': .9 }) +
            el('circle', { cx: -6.4, cy: -122.6, r: 2.6, fill: yeux }) +
            el('circle', { cx: 7.6, cy: -122.6, r: 2.6, fill: yeux }) +
            el('circle', { cx: -6.4, cy: -122.6, r: 1.25, fill: '#150c06' }) +
            el('circle', { cx: 7.6, cy: -122.6, r: 1.25, fill: '#150c06' }) +
            el('circle', { cx: -5.5, cy: -123.8, r: .9, fill: '#fff' }) +
            el('circle', { cx: 8.5, cy: -123.8, r: .9, fill: '#fff' }) +
            ligne('M-11.3-124.6q4.3-4.1 8.7 0M2.6-124.6q4.3-4.1 8.7 0', TRAIT, 1.8) +
            ligne('M-12-131q5-3.2 10-1M2-132q5-2.2 10 1', h[1], 2.3) +
            ligne('M-.5-120q3.2 5-.8 7', p[1], 1.8) +
            ligne('M.9-118.5q1 1.5.3 3', p[2], 1, .8) +
            barbe(a.barbe, h) +
            ligne('M-5-110q5 4.5 10 0', '#7a3322', 1.6) +
            cheveuxDevant(a.cheveux, h) +
            '</g></g>';

        return '<g class="sc-patron__figure" data-corps="' + a.corps + '">' +
            tenueDerriere(a.tenue, t) +
            '<g transform="' + reduite + '">' + cheveuxDerriere(a.cheveux, h) + '</g>' +
            // La carrure sur un groupe intérieur : la marche anime le corps
            // par une transformation CSS, qui remplacerait celle-ci.
            '<g class="sc-patron__body"><g' + (large !== 1 ? ' transform="scale(' + large + ' 1)"' : '') + '>' +
            jambes + brasGauche + torse + brasDroit +
            '</g></g>' +
            tete +
            '</g>';
    }

    /** Une allure tirée au sort, pour qui veut se laisser surprendre. */
    function auHasard() {
        var r = {};
        Object.keys(CATALOGUE).forEach(function (k) {
            var l = CATALOGUE[k];
            r[k] = l[Math.floor(Math.random() * l.length)][0];
        });
        return r;
    }

    /** L'échantillon de couleur d'une option, pour les nuanciers. */
    function nuance(groupe, cle) {
        if (groupe === 'peau') return (PEAUX[cle] || [])[0];
        if (groupe === 'teinte') return (TEINTES[cle] || [])[0];
        if (groupe === 'couleur') return (COULEURS[cle] || [])[1];
        return null;
    }

    global.BrewsteadPersonnage = {
        CATALOGUE: CATALOGUE,
        defs: defs,
        allure: allure,
        dessiner: dessiner,
        auHasard: auHasard,
        nuance: nuance
    };
})(typeof window !== 'undefined' ? window : globalThis);
