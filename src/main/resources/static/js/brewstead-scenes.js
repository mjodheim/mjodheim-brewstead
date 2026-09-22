/* ==========================================================================
   Brewstead — les scènes des lieux

   Le tableau du domaine reste la vue d'ensemble : il est peint en 1536 × 742
   et devient flou dès qu'on s'en approche. Entrer dans un lieu ouvre donc une
   scène dessinée, où chaque parcelle, chaque ruche, chaque cuve est un objet
   qu'on vise et sur lequel on agit.

   Deux temps volontairement séparés :
     - build()  reconstruit le décor quand la composition du lieu change ;
     - tick()   ne retouche que ce qui avance avec le temps.
   Tout réécrire chaque seconde relancerait les animations CSS à zéro et
   donnerait une scène qui tremble.
   ========================================================================== */

(function (global) {
    'use strict';

    var STAGE_WIDTH = 960;
    var STAGE_HEIGHT = 540;

    /* ------------------------------------------------------------ Utilitaires */

    function esc(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /**
     * Désordre reproductible.
     *
     * <p>Les touffes d'herbe et les tiges doivent être irrégulières, mais au
     * même endroit à chaque affichage : un champ qui se réarrange à chaque
     * battement de seconde donne le mal de mer.
     */
    function jitter(seed, index) {
        var n = Math.sin(seed * 127.1 + index * 311.7) * 43758.5453;
        return n - Math.floor(n);
    }

    function clamp01(value) {
        return value < 0 ? 0 : (value > 1 ? 1 : value);
    }

    /** Avancement d'un travail entre son début et son terme. */
    function ratio(startIso, endIso) {
        if (!startIso || !endIso) return 0;
        var start = new Date(startIso).getTime();
        var end = new Date(endIso).getTime();
        if (!(end > start)) return 1;
        return clamp01((Date.now() - start) / (end - start));
    }

    function countdown(endIso) {
        if (!endIso) return '';
        var left = Math.max(0, new Date(endIso).getTime() - Date.now());
        var minutes = Math.floor(left / 60000);
        var seconds = Math.floor(left / 1000) % 60;
        if (minutes >= 60) return Math.floor(minutes / 60) + ' h ' + (minutes % 60) + ' min';
        if (minutes >= 1) return minutes + ' min';
        return seconds + ' s';
    }

    /* ------------------------------------------------------- Grille en fuite */

    /**
     * Place n emplacements sur un sol vu de trois quarts.
     *
     * <p>Les rangées du fond sont plus petites et plus resserrées : c'est ce
     * décalage, pas une vraie projection, qui suffit à donner la profondeur.
     */
    function ground(count, options) {
        options = options || {};
        var columns = options.columns || (count <= 2 ? count : (count <= 6 ? 3 : 4));
        var rows = Math.ceil(count / columns);
        var baseY = options.baseY || 470;
        var depth = options.depth || 104;
        var width = options.width || 236;
        var height = options.height || 96;
        var slots = [];

        for (var i = 0; i < count; i++) {
            var column = i % columns;
            var row = Math.floor(i / columns);
            // Les rangées se rangent d'arrière en avant : le fond se dessine
            // en premier pour que l'avant le recouvre.
            var fromBack = rows - 1 - row;
            var shrink = 1 - fromBack * 0.17;
            var y = baseY - fromBack * depth;
            var spread = (options.spread || 250) * shrink;
            var centre = STAGE_WIDTH / 2 + (column - (columns - 1) / 2) * spread;

            slots.push({
                index: i,
                x: centre,
                y: y,
                width: width * shrink,
                height: height * shrink,
                scale: shrink,
                depth: fromBack
            });
        }

        // D'arrière en avant, pour que le recouvrement soit correct.
        return slots.sort(function (a, b) { return a.y - b.y; });
    }

    /** Le quadrilatère d'un emplacement, plus étroit au fond. */
    function slotShape(slot, taper) {
        var halfFront = slot.width / 2;
        var halfBack = halfFront * (taper === undefined ? 0.8 : taper);
        var top = slot.y - slot.height;
        return 'M' + (slot.x - halfFront) + ' ' + slot.y +
            'L' + (slot.x + halfFront) + ' ' + slot.y +
            'L' + (slot.x + halfBack) + ' ' + top +
            'L' + (slot.x - halfBack) + ' ' + top + 'Z';
    }

    /* ------------------------------------------------------------- Décors */

    /**
     * La région du tableau qui sert de fond à chaque lieu.
     *
     * <p>Dessiner des montagnes en triangles à côté d'un décor peint donnait un
     * résultat indigne : on reprend donc le tableau lui-même, agrandi et flouté.
     * Le flou n'est pas un pis-aller — il place le décor hors de la mise au
     * point et fait ressortir les objets qu'on vient manipuler.
     *
     * <p>La hauteur se déduit de la largeur : la scène est en 16/9.
     */
    var CROPS = {
        champs: { x: 241, y: 262, width: 470 },
        rucher: { x: 285, y: 150, width: 430 },
        brasserie: { x: 841, y: 232, width: 400 },
        taverne: { x: 1020, y: 470, width: 420 },
        entrepot: { x: 292, y: 448, width: 400 },
        commandes: { x: 1372, y: 520, width: 330 }
    };

    var ART = '/images/brewstead-domaine.webp';

    function painted(place) {
        var crop = CROPS[place] || CROPS.champs;
        var height = crop.width * STAGE_HEIGHT / STAGE_WIDTH;
        var scale = STAGE_WIDTH / crop.width;
        var left = crop.x - crop.width / 2;
        var top = crop.y - height / 2;

        return '<g class="sc-far">' +
            '<image href="' + ART + '" x="' + (-left * scale).toFixed(1) + '" y="' + (-top * scale).toFixed(1) +
            '" width="' + (1536 * scale).toFixed(1) + '" height="' + (742 * scale).toFixed(1) +
            '" preserveAspectRatio="none"/>' +
            '</g>' +
            // Hors du groupe flouté : une brume nette se lit comme de l'air,
            // une brume floue comme une tache.
            '<rect class="sc-brume" width="' + STAGE_WIDTH + '" height="' + STAGE_HEIGHT + '"/>';
    }

    /**
     * Le sol où se posent les objets.
     *
     * <p>Le tableau reste derrière, mais il faut une surface franche sur
     * laquelle une parcelle ou une ruche ait l'air posée plutôt que collée.
     */
    function meadow(seed, horizon) {
        var out = '';
        for (var i = 0; i < 9; i++) {
            var y = horizon + 34 + jitter(seed, i) * (STAGE_HEIGHT - horizon - 50);
            var width = 160 + jitter(seed, i + 40) * 420;
            var x = jitter(seed, i + 80) * (STAGE_WIDTH - width);
            out += '<path d="M' + x.toFixed(0) + ' ' + y.toFixed(0) +
                'q' + (width / 2).toFixed(0) + ' ' + (-7 - jitter(seed, i + 60) * 9).toFixed(0) + ' ' +
                width.toFixed(0) + ' 0"/>';
        }
        return '<g class="sc-meadow">' + out + '</g>';
    }

    /** Le plancher d'une cave : des lames qui fuient vers le fond. */
    function planks(horizon) {
        var out = '';
        for (var i = -3; i <= 3; i++) {
            var top = STAGE_WIDTH / 2 + i * 54;
            var bottom = STAGE_WIDTH / 2 + i * 168;
            out += '<path d="M' + top.toFixed(0) + ' ' + (horizon + 20) +
                'L' + bottom.toFixed(0) + ' ' + STAGE_HEIGHT + '"/>';
        }
        for (var j = 1; j <= 3; j++) {
            var y = horizon + 34 + j * j * 22;
            out += '<path d="M0 ' + y.toFixed(0) + 'h960"/>';
        }
        return '<g class="sc-planks">' + out + '</g>';
    }

    function floor(horizon, variant) {
        horizon = horizon || 296;
        var plate = 'sc-floor-plate' + (variant ? ' sc-floor-plate--' + variant : '');
        return '<path class="' + plate + '" d="M0 ' + (horizon + 26) +
            'Q240 ' + (horizon - 8) + ' 480 ' + (horizon + 4) +
            'T960 ' + (horizon + 18) + 'V' + STAGE_HEIGHT + 'H0Z"/>' +
            '<path class="sc-floor-lip" d="M0 ' + (horizon + 26) +
            'Q240 ' + (horizon - 8) + ' 480 ' + (horizon + 4) +
            'T960 ' + (horizon + 18) + '"/>' +
            (variant === 'cellar' ? planks(horizon) : meadow(horizon, horizon));
    }

    /** Lumière chaude et coins assombris : ce qui lie le dessin au tableau. */
    function light() {
        return '<rect class="sc-warm" width="' + STAGE_WIDTH + '" height="' + STAGE_HEIGHT + '"/>' +
            '<rect class="sc-vignette" width="' + STAGE_WIDTH + '" height="' + STAGE_HEIGHT + '"/>';
    }

    /** Les défs partagées : dégradés, filtres, motifs. */
    function defs() {
        return '<defs>' +
            '<linearGradient id="sc-earth" x2="0" y2="1">' +
            '<stop offset="0" stop-color="#8a6a3c"/><stop offset=".45" stop-color="#6d4f2a"/>' +
            '<stop offset="1" stop-color="#4a331a"/></linearGradient>' +

            '<linearGradient id="sc-boards" x2="0" y2="1">' +
            '<stop offset="0" stop-color="#5a4327" stop-opacity=".5"/>' +
            '<stop offset=".3" stop-color="#4d391f" stop-opacity=".88"/>' +
            '<stop offset="1" stop-color="#31240f"/></linearGradient>' +

            '<linearGradient id="sc-grass" x2="0" y2="1">' +
            '<stop offset="0" stop-color="#7d8a4c" stop-opacity=".16"/>' +
            '<stop offset=".26" stop-color="#6b7d40" stop-opacity=".62"/>' +
            '<stop offset=".7" stop-color="#55682f" stop-opacity=".92"/>' +
            '<stop offset="1" stop-color="#3a4a22"/></linearGradient>' +

            '<linearGradient id="sc-crop" x2="0" y2="1">' +
            '<stop offset="0" stop-color="#ffe89c"/><stop offset=".55" stop-color="#e0b55a"/>' +
            '<stop offset="1" stop-color="#9c6f22"/></linearGradient>' +

            '<linearGradient id="sc-sprout" x2="0" y2="1">' +
            '<stop offset="0" stop-color="#b6dc72"/><stop offset="1" stop-color="#4f7a2c"/></linearGradient>' +

            '<radialGradient id="sc-halo">' +
            '<stop offset="0" stop-color="#fff2c2" stop-opacity=".9"/>' +
            '<stop offset=".42" stop-color="#ffd270" stop-opacity=".4"/>' +
            '<stop offset="1" stop-color="#ffb63c" stop-opacity="0"/></radialGradient>' +

            '<radialGradient id="sc-ready">' +
            '<stop offset="0" stop-color="#e4ffcf" stop-opacity=".85"/>' +
            '<stop offset=".45" stop-color="#93e469" stop-opacity=".34"/>' +
            '<stop offset="1" stop-color="#5fbf42" stop-opacity="0"/></radialGradient>' +

            '<radialGradient id="sc-warmth" cx=".5" cy=".22" r=".9">' +
            '<stop offset="0" stop-color="#ffdca0" stop-opacity=".26"/>' +
            '<stop offset=".55" stop-color="#ffb862" stop-opacity=".08"/>' +
            '<stop offset="1" stop-color="#7a3d10" stop-opacity="0"/></radialGradient>' +

            '<radialGradient id="sc-dark" cx=".5" cy=".46" r=".78">' +
            '<stop offset=".55" stop-color="#000" stop-opacity="0"/>' +
            '<stop offset="1" stop-color="#140c04" stop-opacity=".62"/></radialGradient>' +

            // La brume du fond. Sans elle, l'arrière-plan reste une photo
            // floue collée derrière le décor ; avec elle, il devient de la
            // distance.
            '<linearGradient id="sc-brume" x2="0" y2="1">' +
            '<stop offset="0" stop-color="#e6ddc6" stop-opacity=".2"/>' +
            '<stop offset=".58" stop-color="#dcd3bb" stop-opacity=".3"/>' +
            '<stop offset="1" stop-color="#cdc6ad" stop-opacity=".04"/></linearGradient>' +

            '<filter id="sc-blur"><feGaussianBlur stdDeviation="5.5"/></filter>' +
            '<filter id="sc-drop" x="-.4" y="-.4" width="1.8" height="1.8">' +
            '<feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#160d04" flood-opacity=".5"/></filter>' +
            '</defs>';
    }

    /** Quelques touffes d'herbe pour que le sol ne soit pas un aplat. */
    function tufts(seed, count, fromY, toY) {
        var out = '';
        for (var i = 0; i < count; i++) {
            var x = jitter(seed, i * 3) * STAGE_WIDTH;
            var y = fromY + jitter(seed, i * 3 + 1) * (toY - fromY);
            var size = 6 + jitter(seed, i * 3 + 2) * 9;
            out += '<path class="sc-tuft" d="M' + x + ' ' + y +
                'q' + (-size * 0.4) + ' ' + (-size) + ' ' + (-size * 0.1) + ' ' + (-size * 1.3) +
                'M' + x + ' ' + y + 'q' + (size * 0.1) + ' ' + (-size * 1.1) + ' ' + (size * 0.5) + ' ' + (-size * 1.4) +
                'M' + x + ' ' + y + 'q' + (size * 0.5) + ' ' + (-size * 0.7) + ' ' + (size * 0.9) + ' ' + (-size * 0.9) + '"/>';
        }
        return '<g class="sc-tufts">' + out + '</g>';
    }

    /* -------------------------------------------------------------- Champs */

    function fieldState(field) {
        if (field.status === 'READY') return 'ready';
        if (field.status === 'EMPTY' || !field.cropName) return 'empty';
        if (field.readyAt && Date.now() >= new Date(field.readyAt).getTime()) return 'ready';
        return 'growing';
    }

    /** Les sillons d'une parcelle : une bande creuse et sa crête éclairée. */
    function furrows(slot) {
        var hollow = '';
        var crest = '';
        var lines = 5;
        for (var i = 1; i <= lines; i++) {
            var t = i / (lines + 1);
            var y = slot.y - slot.height * t;
            var half = (slot.width / 2) * (1 - t * 0.2);
            var bow = -5 * slot.scale;
            hollow += '<path d="M' + (slot.x - half) + ' ' + y + 'q' + half + ' ' + bow + ' ' + (half * 2) + ' 0"/>';
            crest += '<path d="M' + (slot.x - half) + ' ' + (y - 2.2 * slot.scale) +
                'q' + half + ' ' + bow + ' ' + (half * 2) + ' 0"/>';
        }
        return '<g class="sc-furrows">' + hollow + '</g><g class="sc-furrows sc-furrows--lit">' + crest + '</g>';
    }

    /**
     * La pousse par paliers.
     *
     * <p>Faire grandir la culture en étirant le dessin donnait une rampe
     * jaune : une culture ne s'étire pas, elle se remplit. On redessine donc
     * la parcelle à cinq moments de sa croissance, et entre deux paliers rien
     * ne bouge — ce qui évite aussi de relancer les animations chaque seconde.
     */
    var GROWTH_STAGES = 5;

    function growthStage(field) {
        if (fieldState(field) === 'ready') return GROWTH_STAGES;
        if (fieldState(field) !== 'growing') return 0;
        return 1 + Math.min(GROWTH_STAGES - 1,
            Math.floor(ratio(field.plantedAt, field.readyAt) * (GROWTH_STAGES - 1)));
    }

    /**
     * La culture d'une parcelle, rangée par rangée.
     *
     * <p>Une masse pleine faisait une dalle, des brins isolés faisaient des
     * allumettes. Ce sont les rangées qui disent « champ » : on plante donc le
     * long des sillons, en suivant leur courbure et leur fuite.
     */
    function crop(slot, seed, stage, ripe) {
        if (stage <= 0) return '';
        var grown = stage / GROWTH_STAGES;
        var rows = '';
        var lines = 5;

        for (var r = 1; r <= lines; r++) {
            var t = r / (lines + 1);
            var y = slot.y - slot.height * t;
            var half = (slot.width / 2) * (1 - t * 0.2);
            // Les rangées du fond sont plus petites et plus serrées.
            var near = 1 - t * 0.28;
            var tall = (9 + 15 * grown) * slot.scale * near;
            var step = (13 - 4 * grown) * slot.scale * near;
            var tufts = '';
            var ears = '';

            for (var x = -half + step * 0.5; x < half; x += step) {
                var i = Math.round((x + half) / step);
                var px = slot.x + x + (jitter(seed + r * 31, i) - 0.5) * step * 0.5;
                var py = y - (jitter(seed + r * 17, i) - 0.5) * 5 * slot.scale;
                var h = tall * (0.7 + jitter(seed + r * 7, i) * 0.62);
                var w = step * 0.3;

                // Une touffe : deux flancs et une pointe, fermée pour que la
                // rangée lise comme une masse et non comme des traits.
                tufts += '<path d="M' + (px - w).toFixed(1) + ' ' + py.toFixed(1) +
                    'q' + (w * 0.35).toFixed(1) + ' ' + (-h * 0.75).toFixed(1) + ' ' + (w * 0.9).toFixed(1) + ' ' + (-h).toFixed(1) +
                    'q' + (w * 0.6).toFixed(1) + ' ' + (h * 0.28).toFixed(1) + ' ' + (w * 1.1).toFixed(1) + ' ' + h.toFixed(1) + 'Z"/>';

                if (ripe && jitter(seed + r * 3, i) > 0.42) {
                    ears += '<ellipse cx="' + (px - w * 0.1).toFixed(1) + '" cy="' + (py - h).toFixed(1) +
                        '" rx="' + (1.7 * slot.scale * near).toFixed(1) +
                        '" ry="' + (3.6 * slot.scale * near).toFixed(1) + '"/>';
                }
            }

            rows += '<g class="sc-row" style="--row:' + r + '">' +
                '<g class="sc-row__tufts">' + tufts + '</g>' +
                (ears ? '<g class="sc-ears">' + ears + '</g>' : '') + '</g>';
        }
        return rows;
    }

    function fieldNode(field, slot) {
        var state = fieldState(field);
        var stage = growthStage(field);
        var label = state === 'empty' ? 'Parcelle libre' : (field.cropName || 'Parcelle');
        var action = state === 'ready' ? 'harvest-field' : (state === 'empty' ? 'sow-field' : '');
        var seed = field.id * 17 + 3;

        return '<g class="sc-node sc-plot" data-state="' + state + '" data-id="' + field.id + '"' +
            (action ? ' data-action="' + action + '" tabindex="0" role="button"' : '') +
            ' aria-label="' + esc(label) + '">' +

            (state === 'ready'
                ? '<ellipse class="sc-node__glow" cx="' + slot.x + '" cy="' + (slot.y - slot.height * 0.4) +
                  '" rx="' + (slot.width * 0.62) + '" ry="' + (slot.height * 0.72) + '" fill="url(#sc-ready)"/>'
                : '') +

            '<ellipse class="sc-contact" cx="' + slot.x + '" cy="' + (slot.y + 3 * slot.scale) +
            '" rx="' + (slot.width * 0.56) + '" ry="' + (11 * slot.scale) + '"/>' +
            '<path class="sc-plot__soil" d="' + slotShape(slot) + '"/>' +
            furrows(slot) +
            '<g class="sc-plot__crop">' + crop(slot, seed, stage, state === 'ready') + '</g>' +
            '<path class="sc-plot__lip" d="M' + (slot.x - slot.width / 2) + ' ' + slot.y +
            'h' + slot.width + 'v' + (7 * slot.scale) + 'h' + (-slot.width) + 'Z"/>' +
            '<path class="sc-plot__edge" d="' + slotShape(slot) + '"/>' +

            badge(slot.x, slot.y - slot.height - 30 * slot.scale, slot.scale, state) +

            '<text class="sc-plot__time" x="' + slot.x + '" y="' + (slot.y + 22 * slot.scale) + '">' +
            (state === 'growing' ? esc(countdown(field.readyAt)) : '') + '</text>' +
            hit(slot.x, slot.y - slot.height - 48 * slot.scale, slot.width * 1.06, slot.height + 62 * slot.scale) +
            '</g>';
    }

    /**
     * La pastille d'action, posée au-dessus de l'objet.
     *
     * <p>Deux groupes imbriqués, et ce n'est pas un caprice : une animation
     * CSS `transform` remplace l'attribut `transform` du SVG au lieu de s'y
     * ajouter. Placer et animer le même groupe expédiait la pastille en haut
     * à gauche de la scène, hors du cadre.
     */
    /**
     * La zone sensible d'un objet.
     *
     * <p>Un groupe SVG ne reçoit les clics que sur ses pixels peints : viser
     * un brin de blé ou l'entrée d'une ruche relève de l'adresse. On pose donc
     * un rectangle transparent par-dessus, franchement plus large que l'objet,
     * qui prend le clic et le doigt.
     */
    function hit(x, y, width, height) {
        return '<rect class="sc-node__hit" x="' + (x - width / 2).toFixed(1) + '" y="' + y.toFixed(1) +
            '" width="' + width.toFixed(1) + '" height="' + height.toFixed(1) + '"/>';
    }

    function badge(x, y, scale, state) {
        return '<g class="sc-badge" transform="translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')">' +
            '<g class="sc-badge__bob">' +
            '<circle class="sc-badge__disc" r="' + (17 * scale).toFixed(1) + '"/>' +
            '<g class="sc-badge__mark" transform="scale(' + (scale * 0.9).toFixed(3) + ')">' +
            badgeMark(state) + '</g></g></g>';
    }

    function badgeMark(state) {
        if (state === 'empty') return '<path d="M0-9v18M-9 0h18"/>';
        if (state === 'ready') return '<path d="M-9 1h18l-2 8H-7Z"/><path d="M-6 1 -2-8M6 1 3-7"/>';
        return '<circle r="8"/><path d="M0-5v5l4 3"/>';
    }

    function champs(state) {
        var fields = state.fields || [];
        if (!fields.length) return '';
        var slots = ground(fields.length, { baseY: 486, depth: 112, width: 252, height: 116, spread: 268 });

        return defs() + painted('champs') + floor(292) + light() +
            tufts(7, 30, 300, 348) +
            '<g class="sc-plots">' +
            slots.map(function (slot) { return fieldNode(fields[slot.index], slot); }).join('') +
            '</g>' +
            tufts(19, 20, 496, 536);
    }

    /* -------------------------------------------------------------- Rucher */

    function hiveState(hive) {
        if (hive.status === 'READY') return 'ready';
        if (hive.status === 'PRODUCING') {
            return hive.readyAt && Date.now() >= new Date(hive.readyAt).getTime() ? 'ready' : 'growing';
        }
        return 'empty';
    }

    function bees(slot, seed) {
        var out = '';
        for (var i = 0; i < 5; i++) {
            var radius = (26 + jitter(seed, i) * 22) * slot.scale;
            out += '<g class="sc-bee" style="--bee-r:' + radius.toFixed(1) +
                'px;--bee-delay:' + (-i * 1.3).toFixed(1) + 's">' +
                '<circle r="' + (2.6 * slot.scale) + '"/></g>';
        }
        return '<g class="sc-bees" transform="translate(' + slot.x + ' ' + (slot.y - slot.height * 0.75) + ')">' + out + '</g>';
    }

    function hiveNode(hive, slot) {
        var state = hiveState(hive);
        // Une ruche ne se lance plus : elle tourne seule. Le seul geste est
        // de la vider quand le miel est prêt.
        var action = state === 'ready' ? 'harvest-hive' : '';
        // La hauteur du dessin, pas celle de la case du terrain. Les deux
        // avaient été confondues : la pastille d'état flottait cent vingt
        // pixels au-dessus de sa ruche, sans rien pour la relier.
        var h = 46 * slot.scale;

        return '<g class="sc-node sc-hive" data-state="' + state + '" data-id="' + hive.id + '"' +
            (action ? ' data-action="' + action + '" tabindex="0" role="button"' : '') +
            ' aria-label="Ruche n°' + hive.id + '">' +

            (state === 'ready'
                ? '<ellipse class="sc-node__glow" cx="' + slot.x + '" cy="' + (slot.y - h * 0.5) +
                  '" rx="' + (slot.width * 0.42) + '" ry="' + (h * 1.25) + '" fill="url(#sc-halo)"/>'
                : '') +

            '<ellipse class="sc-shadow" cx="' + slot.x + '" cy="' + slot.y + '" rx="' + (slot.width * 0.3) + '" ry="' + (9 * slot.scale) + '"/>' +
            '<g class="sc-hive__body" transform="translate(' + slot.x + ' ' + slot.y + ') scale(' + slot.scale + ')">' +
            '<path class="sc-hive__stand" d="M-44 0h88l-6 8H-38Z"/>' +
            '<path class="sc-hive__dome" d="M-38 0a38 46 0 0 1 76 0Z"/>' +
            '<path class="sc-hive__rings" d="M-35-14h70M-30-28h60M-22-40h44"/>' +
            '<ellipse class="sc-hive__door" cy="-9" rx="7" ry="5"/>' +
            '</g>' +
            (state === 'growing' || state === 'ready' ? bees(slot, hive.id * 13) : '') +

            badge(slot.x, slot.y - h - 30 * slot.scale, slot.scale, state) +
            '<text class="sc-plot__time" x="' + slot.x + '" y="' + (slot.y + 22 * slot.scale) + '">' +
            (state === 'growing' ? esc(countdown(hive.readyAt)) : '') + '</text>' +
            hit(slot.x, slot.y - h - 48 * slot.scale, slot.width * 1.1, h + 66 * slot.scale) +
            '</g>';
    }

    function rucher(state) {
        var hives = state.hives || [];
        if (!hives.length) return '';
        var slots = ground(hives.length, { baseY: 476, depth: 112, width: 196, height: 118, spread: 260, columns: hives.length <= 3 ? hives.length : 3 });

        return defs() + painted('rucher') + floor(286) + light() +
            '<g class="sc-blossoms">' +
            (function () {
                var out = '';
                for (var i = 0; i < 34; i++) {
                    var x = jitter(3, i * 2) * STAGE_WIDTH;
                    var y = 318 + jitter(3, i * 2 + 1) * 210;
                    out += '<circle cx="' + x + '" cy="' + y + '" r="' + (2 + jitter(3, i * 5) * 2.4) + '"/>';
                }
                return out;
            })() + '</g>' +
            tufts(11, 24, 312, 352) +
            '<g class="sc-plots">' +
            slots.map(function (slot) { return hiveNode(hives[slot.index], slot); }).join('') +
            '</g>' +
            tufts(23, 16, 486, 532);
    }

    /* ----------------------------------------------------------- Brasserie */

    function batchState(batch) {
        if (batch.status === 'READY') return 'ready';
        if (batch.status === 'SOLD_OUT' || batch.status === 'CANCELLED') return 'done';
        return 'growing';
    }

    function vatNode(batch, slot) {
        var state = batchState(batch);
        var fill = state === 'ready' ? 1 : (state === 'done' ? 0.08 : 0.16 + ratio(batch.startedAt, batch.readyAt) * 0.78);
        var w = slot.width * 1.05;
        var h = slot.height * 1.75;
        var top = slot.y - h;
        var bulge = w * 0.16;
        var liquidTop = top + 10 * slot.scale + (h - 18 * slot.scale) * (1 - fill);
        var clip = 'sc-vat-' + batch.id;

        // La silhouette d'un tonneau : des flancs qui s'arrondissent. Dessiné
        // en traits, on obtenait une cage à oiseaux.
        var body = 'M' + (slot.x - w / 2).toFixed(1) + ' ' + slot.y.toFixed(1) +
            'C' + (slot.x - w / 2 - bulge).toFixed(1) + ' ' + (slot.y - h * 0.32).toFixed(1) +
            ' ' + (slot.x - w / 2 - bulge).toFixed(1) + ' ' + (slot.y - h * 0.68).toFixed(1) +
            ' ' + (slot.x - w / 2).toFixed(1) + ' ' + top.toFixed(1) +
            'L' + (slot.x + w / 2).toFixed(1) + ' ' + top.toFixed(1) +
            'C' + (slot.x + w / 2 + bulge).toFixed(1) + ' ' + (slot.y - h * 0.68).toFixed(1) +
            ' ' + (slot.x + w / 2 + bulge).toFixed(1) + ' ' + (slot.y - h * 0.32).toFixed(1) +
            ' ' + (slot.x + w / 2).toFixed(1) + ' ' + slot.y.toFixed(1) + 'Z';

        var bubbles = '';
        if (state === 'growing') {
            for (var i = 0; i < 7; i++) {
                bubbles += '<circle class="sc-bubble" cx="' +
                    (slot.x - w * 0.32 + jitter(batch.id * 5, i) * w * 0.64).toFixed(1) +
                    '" r="' + ((2 + jitter(batch.id * 5, i + 9) * 3.4) * slot.scale).toFixed(1) +
                    '" style="--bub-delay:' + (-i * 0.62).toFixed(1) + 's;--bub-from:' + slot.y.toFixed(0) +
                    'px;--bub-to:' + liquidTop.toFixed(0) + 'px"/>';
            }
        }

        var staves = '';
        for (var k = -2; k <= 2; k++) {
            var sx = slot.x + k * (w / 5.4);
            staves += '<path d="M' + sx.toFixed(1) + ' ' + slot.y.toFixed(1) +
                'C' + (sx + k * bulge * 0.34).toFixed(1) + ' ' + (slot.y - h * 0.32).toFixed(1) +
                ' ' + (sx + k * bulge * 0.34).toFixed(1) + ' ' + (slot.y - h * 0.68).toFixed(1) +
                ' ' + sx.toFixed(1) + ' ' + top.toFixed(1) + '"/>';
        }

        return '<g class="sc-node sc-vat" data-state="' + state + '" data-id="' + batch.id + '"' +
            (state === 'ready' ? ' data-action="taste-batch" tabindex="0" role="button"' : '') +
            ' aria-label="' + esc(batch.recipeName || 'Brassin') + '">' +

            (state === 'ready'
                ? '<ellipse class="sc-node__glow" cx="' + slot.x + '" cy="' + (slot.y - h * 0.5).toFixed(1) +
                  '" rx="' + (w * 0.85).toFixed(1) + '" ry="' + (h * 0.72).toFixed(1) + '" fill="url(#sc-halo)"/>'
                : '') +

            '<ellipse class="sc-contact" cx="' + slot.x + '" cy="' + (slot.y + 2 * slot.scale).toFixed(1) +
            '" rx="' + (w * 0.58).toFixed(1) + '" ry="' + (10 * slot.scale).toFixed(1) + '"/>' +

            '<clipPath id="' + clip + '"><path d="' + body + '"/></clipPath>' +
            '<path class="sc-vat__wood" d="' + body + '"/>' +

            '<g clip-path="url(#' + clip + ')">' +
            '<rect class="sc-vat__liquid" x="' + (slot.x - w).toFixed(1) + '" y="' + liquidTop.toFixed(1) +
            '" width="' + (w * 2).toFixed(1) + '" height="' + (slot.y - liquidTop + 4).toFixed(1) + '"/>' +
            '<ellipse class="sc-vat__surface" cx="' + slot.x + '" cy="' + liquidTop.toFixed(1) +
            '" rx="' + (w * 0.49).toFixed(1) + '" ry="' + (w * 0.09).toFixed(1) + '"/>' +
            bubbles +
            '<g class="sc-vat__staves">' + staves + '</g>' +
            '<path class="sc-vat__hoop" d="M' + (slot.x - w * 0.62).toFixed(1) + ' ' + (top + h * 0.2).toFixed(1) +
            'h' + (w * 1.24).toFixed(1) + 'M' + (slot.x - w * 0.62).toFixed(1) + ' ' + (top + h * 0.74).toFixed(1) +
            'h' + (w * 1.24).toFixed(1) + '"/>' +
            '</g>' +

            '<ellipse class="sc-vat__rim" cx="' + slot.x + '" cy="' + top.toFixed(1) +
            '" rx="' + (w / 2).toFixed(1) + '" ry="' + (w * 0.1).toFixed(1) + '"/>' +

            badge(slot.x, top - 34 * slot.scale, slot.scale, state === 'ready' ? 'ready' : 'growing') +

            '<text class="sc-vat__name" x="' + slot.x + '" y="' + (slot.y + 24 * slot.scale).toFixed(1) + '">' +
            esc(batch.recipeName || '') + '</text>' +
            '<text class="sc-plot__time" x="' + slot.x + '" y="' + (slot.y + 42 * slot.scale).toFixed(1) + '">' +
            (state === 'growing' ? esc(countdown(batch.readyAt)) : '') + '</text>' +
            hit(slot.x, top - 52 * slot.scale, w * 1.35, h + 74 * slot.scale) +

            // Un fût prêt part au comptoir aussi bien qu'il se goûte : le
            // second geste a sa propre pastille, posée après la zone sensible
            // du tonneau pour qu'elle reçoive bien le clic.
            (state === 'ready'
                ? '<g class="sc-act" data-action="offer-batch" data-id="' + batch.id + '"' +
                  ' tabindex="0" role="button" aria-label="Mettre au comptoir">' +
                  '<g class="sc-badge" transform="translate(' + (slot.x + w * 0.66).toFixed(1) + ' ' +
                  (top + h * 0.28).toFixed(1) + ')">' +
                  '<g class="sc-badge__bob">' +
                  '<circle class="sc-badge__disc" r="' + (16 * slot.scale).toFixed(1) + '"/>' +
                  '<g class="sc-badge__mark" transform="scale(' + (slot.scale * 0.82).toFixed(3) + ')">' +
                  '<path d="M-8-6h13a4 4 0 0 1 0 8H-8Z"/><path d="M-8 2v5a4 4 0 0 0 4 4h5a4 4 0 0 0 4-4V2"/>' +
                  '<path d="M-10 13h16"/></g></g></g>' +
                  hit(slot.x + w * 0.66, top + h * 0.28 - 22 * slot.scale, 46 * slot.scale, 46 * slot.scale) +
                  '</g>'
                : '') +
            '</g>';
    }

    function brasserie(state) {
        var batches = (state.batches || []).filter(function (b) {
            return b.status !== 'SOLD_OUT' && b.status !== 'CANCELLED';
        });
        if (!batches.length) return '';
        var slots = ground(batches.length, { baseY: 470, depth: 116, width: 150, height: 92, spread: 214, columns: batches.length <= 3 ? batches.length : 4 });

        return defs() + painted('brasserie') +
            '<rect class="sc-dusk" width="' + STAGE_WIDTH + '" height="' + STAGE_HEIGHT + '"/>' +
            floor(300, 'cellar') + light() +
            '<g class="sc-lanterns">' +
            '<ellipse cx="164" cy="188" rx="96" ry="84" fill="url(#sc-halo)"/>' +
            '<ellipse cx="806" cy="176" rx="82" ry="72" fill="url(#sc-halo)"/>' +
            '</g>' +
            '<g class="sc-plots">' +
            slots.map(function (slot) { return vatNode(batches[slot.index], slot); }).join('') +
            '</g>';
    }


    /* ------------------------------------------------------------ Taverne */

    /**
     * La salle.
     *
     * <p>Le comptoir était une liste de lignes : « Cervoise du fjord · servi
     * par Untel · 2 services ». On entre maintenant dans la pièce. Chaque fût
     * qu'un voisin a mis au comptoir est une chope posée sur le zinc, qu'on
     * vise et qu'on boit ; les siennes portent une marque au lieu d'un geste.
     * Les tables du premier plan ne servent à rien, et c'est exactement leur
     * rôle : une salle vide n'est pas une taverne.
     */
    function taverne(state) {
        var offres = state.tavernCounter || [];

        var zinc = comptoir();
        var chopes = '';
        if (offres.length) {
            var largeur = Math.min(150, 620 / offres.length);
            offres.slice(0, 6).forEach(function (offre, i) {
                var n = Math.min(offres.length, 6);
                var x = STAGE_WIDTH / 2 + (i - (n - 1) / 2) * largeur;
                chopes += chopeNode(offre, x, 342, Math.min(1.15, largeur / 118));
            });
        }

        return defs() + painted('taverne') +
            '<rect class="sc-dusk" width="' + STAGE_WIDTH + '" height="' + STAGE_HEIGHT + '"/>' +
            floor(336, 'cellar') +
            '<g class="sc-lanterns">' +
            '<ellipse cx="150" cy="150" rx="104" ry="92" fill="url(#sc-halo)"/>' +
            '<ellipse cx="812" cy="138" rx="94" ry="82" fill="url(#sc-halo)"/>' +
            '<ellipse cx="480" cy="250" rx="150" ry="70" fill="url(#sc-halo)"/>' +
            '</g>' +
            zinc + chopes + tables() + light() +
            (offres.length ? '' :
                '<text class="sc-salle__vide" x="' + (STAGE_WIDTH / 2) + '" y="300">' +
                'Le comptoir est vide. Mets un fût en vente depuis la brasserie.</text>');
    }

    /**
     * Le zinc, et le rack de fûts derrière.
     *
     * <p>Un premier essai posait les fûts en simples ellipses : ils
     * flottaient comme des jetons. Un fût couché se reconnaît à trois
     * choses — le galbe des douves, les deux cercles de fer, et la bonde.
     * C'est peu, mais il faut les trois.
     */
    function comptoir() {
        var out = '<g class="sc-bar">';

        // L'étagère qui porte les fûts, sinon ils lévitent.
        out += '<path class="sc-bar__etagere" d="M18 226h924v16H18Z"/>' +
            '<path class="sc-bar__console" d="M96 242h16v26H96ZM440 242h16v26h-16ZM848 242h16v26h-16Z"/>';

        for (var i = 0; i < 5; i++) {
            var x = 128 + i * 176;
            out += futCouche(x, 222, 0.92);
        }

        // Le plateau. Le liseré clair sur l'arête est ce qui fait « zinc ».
        out += '<path class="sc-bar__front" d="M34 344h892v112H34Z"/>';
        for (var j = 1; j < 9; j++) {
            var px = 34 + j * 99;
            out += '<path class="sc-bar__planche" d="M' + px + ' 348v104"/>';
        }
        out += '<path class="sc-bar__moulure" d="M34 430h892"/>' +
            '<path class="sc-bar__top" d="M22 326h916l-12 20H34Z"/>' +
            '<path class="sc-bar__edge" d="M22 326h916"/>' +
            '</g>';
        return out;
    }

    /** Un fût couché sur l'étagère, vu de face. */
    function futCouche(x, y, k) {
        var rx = 58 * k;
        var ry = 42 * k;
        var out = '<g class="sc-fut">';
        // Le galbe : plus large au milieu qu'aux extrémités.
        out += '<path class="sc-fut__corps" d="M' + (x - rx) + ' ' + (y - ry * 0.74) +
            'q' + (-9 * k) + ' ' + (ry * 0.74) + ' 0 ' + (ry * 1.48) +
            'h' + (rx * 2) + 'q' + (9 * k) + ' ' + (-ry * 0.74) + ' 0 ' + (-ry * 1.48) + 'Z"/>';
        out += '<ellipse class="sc-fut__fond" cx="' + (x - rx - 3 * k) + '" cy="' + y +
            '" rx="' + (11 * k) + '" ry="' + (ry * 0.78) + '"/>';
        for (var d = -2; d <= 2; d++) {
            var dx = x + d * rx * 0.36;
            out += '<path class="sc-fut__douve" d="M' + dx.toFixed(1) + ' ' + (y - ry * 0.7) +
                'q' + (d * 2.5 * k) + ' ' + (ry * 0.7) + ' 0 ' + (ry * 1.4) + '"/>';
        }
        out += '<path class="sc-fut__cercle" d="M' + (x - rx * 0.56) + ' ' + (y - ry * 0.78) +
            'q' + (-6 * k) + ' ' + (ry * 0.78) + ' 0 ' + (ry * 1.56) +
            'M' + (x + rx * 0.56) + ' ' + (y - ry * 0.78) +
            'q' + (6 * k) + ' ' + (ry * 0.78) + ' 0 ' + (ry * 1.56) + '"/>' +
            '<circle class="sc-fut__bonde" cx="' + x + '" cy="' + (y + ry * 0.12) + '" r="' + (6 * k) + '"/>' +
            '</g>';
        return out;
    }

    /** Une chope sur le zinc : un fût qu'un voisin propose à la dégustation. */
    function chopeNode(offre, x, y, scale) {
        var mienne = !!offre.mine;
        var h = 64 * scale;
        var w = 42 * scale;
        var top = y - h;

        return '<g class="sc-node sc-chope" data-state="' + (mienne ? 'mine' : 'ready') + '"' +
            ' data-id="' + offre.id + '"' +
            (mienne ? '' : ' data-action="serve-offer" tabindex="0" role="button"') +
            ' aria-label="' + esc(offre.recipeName || 'Une chope') +
            (mienne ? ' — ton fût' : ', servi par ' + esc(offre.seller || '')) + '">' +

            (mienne ? '' :
                '<ellipse class="sc-node__glow" cx="' + x.toFixed(1) + '" cy="' + (y - h * 0.5).toFixed(1) +
                '" rx="' + (w * 1.5).toFixed(1) + '" ry="' + (h * 0.9).toFixed(1) + '" fill="url(#sc-halo)"/>') +

            '<ellipse class="sc-contact" cx="' + x.toFixed(1) + '" cy="' + (y + 2).toFixed(1) +
            '" rx="' + (w * 0.62).toFixed(1) + '" ry="' + (5 * scale).toFixed(1) + '"/>' +

            '<path class="sc-chope__body" d="M' + (x - w / 2).toFixed(1) + ' ' + top.toFixed(1) +
            'h' + w.toFixed(1) + 'l' + (-w * 0.08).toFixed(1) + ' ' + h.toFixed(1) +
            'h' + (-w * 0.84).toFixed(1) + 'Z"/>' +
            '<path class="sc-chope__biere" d="M' + (x - w * 0.42).toFixed(1) + ' ' + (top + h * 0.26).toFixed(1) +
            'h' + (w * 0.84).toFixed(1) + 'l' + (-w * 0.06).toFixed(1) + ' ' + (h * 0.7).toFixed(1) +
            'h' + (-w * 0.72).toFixed(1) + 'Z"/>' +
            '<ellipse class="sc-chope__mousse" cx="' + x.toFixed(1) + '" cy="' + (top + h * 0.2).toFixed(1) +
            '" rx="' + (w * 0.46).toFixed(1) + '" ry="' + (h * 0.13).toFixed(1) + '"/>' +
            '<path class="sc-chope__anse" d="M' + (x + w * 0.46).toFixed(1) + ' ' + (top + h * 0.3).toFixed(1) +
            'q' + (w * 0.5).toFixed(1) + ' ' + (h * 0.2).toFixed(1) + ' 0 ' + (h * 0.42).toFixed(1) + '"/>' +

            // La pastille appelle au-dessus de la chope ; la mention « à toi »
            // descend sous le nom, sinon elle se pose sur les fûts du fond.
            (mienne ? '' : badge(x, top - 22 * scale, scale, 'ready')) +

            '<text class="sc-chope__nom" x="' + x.toFixed(1) + '" y="' + (y + 26 * scale).toFixed(1) + '">' +
            esc(offre.recipeName || '') + '</text>' +
            '<text class="sc-chope__hote" x="' + x.toFixed(1) + '" y="' + (y + 42 * scale).toFixed(1) + '">' +
            esc(offre.seller || '') + (offre.price ? ' · ' + offre.price + ' pièces' : ' · offert') + '</text>' +
            (mienne
                ? '<text class="sc-chope__sien" x="' + x.toFixed(1) + '" y="' + (y + 60 * scale).toFixed(1) + '">à toi</text>'
                : '') +
            hit(x, top - 34 * scale, w * 2.4, h + 70 * scale) +
            '</g>';
    }

    /**
     * Tables et tabourets au premier plan.
     *
     * <p>Elles ne servent à rien, et c'est exactement leur rôle : une salle
     * vide n'est pas une taverne. Le plateau a une tranche — sans elle, une
     * ellipse sur un pied ressemble à un champignon.
     */
    function tables() {
        var out = '<g class="sc-salle">';
        [[168, 506, 1], [478, 532, 1.14], [792, 500, 0.95]].forEach(function (t, i) {
            var x = t[0], y = t[1], k = t[2];
            var haut = y - 50 * k;
            var rx = 76 * k;
            var ry = 21 * k;

            out += '<ellipse class="sc-contact" cx="' + x + '" cy="' + (y + 8 * k) + '" rx="' + (rx * 1.16) + '" ry="' + (15 * k) + '"/>';

            // Tabourets derrière la table, pour qu'elle les recouvre.
            [-1.42, 1.42].forEach(function (cote) {
                var sx = x + cote * rx;
                out += '<path class="sc-tabouret__pied" d="M' + (sx - 7 * k) + ' ' + (y - 26 * k) + 'l' + (-3 * k) + ' ' + (28 * k) +
                    'M' + (sx + 7 * k) + ' ' + (y - 26 * k) + 'l' + (3 * k) + ' ' + (28 * k) + '"/>' +
                    '<ellipse class="sc-tabouret" cx="' + sx + '" cy="' + (y - 28 * k) + '" rx="' + (23 * k) + '" ry="' + (9 * k) + '"/>' +
                    '<path class="sc-tabouret__tranche" d="M' + (sx - 23 * k) + ' ' + (y - 28 * k) +
                    'v' + (5 * k) + 'a' + (23 * k) + ' ' + (9 * k) + ' 0 0 0 ' + (46 * k) + ' 0v' + (-5 * k) + 'Z"/>';
            });

            out += '<path class="sc-table__pied" d="M' + (x - 11 * k) + ' ' + y + 'l' + (4 * k) + ' ' + (-50 * k) +
                'h' + (14 * k) + 'l' + (4 * k) + ' ' + (50 * k) + 'Z"/>' +
                '<path class="sc-table__socle" d="M' + (x - 30 * k) + ' ' + y + 'h' + (60 * k) + 'l' + (-6 * k) + ' ' + (-7 * k) +
                'h' + (-48 * k) + 'Z"/>' +
                // La tranche du plateau, dessinée avant le dessus.
                '<path class="sc-table__tranche" d="M' + (x - rx) + ' ' + haut + 'v' + (9 * k) +
                'a' + rx + ' ' + ry + ' 0 0 0 ' + (rx * 2) + ' 0v' + (-9 * k) + 'Z"/>' +
                '<ellipse class="sc-table__plateau" cx="' + x + '" cy="' + haut + '" rx="' + rx + '" ry="' + ry + '"/>' +
                '<ellipse class="sc-table__veine" cx="' + x + '" cy="' + (haut - 2 * k) + '" rx="' + (rx * 0.62) + '" ry="' + (ry * 0.56) + '"/>';

            // Une chandelle sur deux tables : la salle respire.
            if (i !== 1) {
                var cx = x + 26 * k;
                out += '<path class="sc-bougeoir" d="M' + (cx - 9 * k) + ' ' + (haut - 3 * k) + 'h' + (18 * k) + 'l' + (-4 * k) + ' ' + (-5 * k) + 'h' + (-10 * k) + 'Z"/>' +
                    '<path class="sc-bougie" d="M' + cx + ' ' + (haut - 8 * k) + 'v' + (-20 * k) + '"/>' +
                    '<ellipse class="sc-bougie__flamme" cx="' + cx + '" cy="' + (haut - 33 * k) + '" rx="' + (3.6 * k) + '" ry="' + (6.4 * k) + '"/>' +
                    '<ellipse class="sc-bougie__halo" cx="' + cx + '" cy="' + (haut - 30 * k) + '" rx="' + (30 * k) + '" ry="' + (24 * k) + '" fill="url(#sc-halo)"/>';
            }
        });
        return out + '</g>';
    }


    /* ----------------------------------------------------------- Entrepôt */

    /**
     * L'entrepôt.
     *
     * <p>C'était une grille de lignes : « Orge maltée · 14 kg en stock ».
     * Une réserve se regarde, elle ne se lit pas. Chaque matière prend ici la
     * forme sous laquelle on la range vraiment — le grain en sacs, le miel en
     * jarres, le houblon en bottes, l'eau en tonnelets — sur trois planches
     * d'étagère. On ne clique sur rien : une réserve n'est pas un menu, c'est
     * un état des lieux.
     */
    function entrepot(state) {
        var stock = (state.inventory || []).filter(function (item) {
            return Number(item.quantity) > 0;
        });
        if (!stock.length) return '';

        var parPlanche = Math.ceil(Math.min(stock.length, 18) / 3);
        // Les planches vont du fond vers l'avant : plus basses, plus grandes.
        var planches = [
            { y: 212, k: 0.78 },
            { y: 334, k: 0.88 },
            { y: 456, k: 0.98 }
        ];
        var marge = 64;

        // Le bâti : deux montants pleine hauteur et un fond, sinon les
        // planches flottent comme des règles posées en l'air.
        var bati = '<path class="sc-bati" d="M' + marge + ' 150h26v390h-26ZM' +
            (STAGE_WIDTH - marge - 26) + ' 150h26v390h-26Z"/>' +
            '<path class="sc-bati__fond" d="M' + (marge + 26) + ' 150h' +
            (STAGE_WIDTH - marge * 2 - 52) + 'v390h' + (-(STAGE_WIDTH - marge * 2 - 52)) + 'Z"/>';
        for (var v = 1; v < 7; v++) {
            var vx = marge + 26 + v * ((STAGE_WIDTH - marge * 2 - 52) / 7);
            bati += '<path class="sc-bati__latte" d="M' + vx.toFixed(0) + ' 150v390"/>';
        }

        var bois = '';
        var objets = '';
        planches.forEach(function (planche, rang) {
            var lot = stock.slice(rang * parPlanche, (rang + 1) * parPlanche);
            if (!lot.length) return;

            var ep = 15 * planche.k;
            bois += '<path class="sc-rayon" d="M' + (marge + 8) + ' ' + planche.y + 'h' +
                (STAGE_WIDTH - marge * 2 - 16) + 'v' + ep.toFixed(1) + 'h' +
                (-(STAGE_WIDTH - marge * 2 - 16)) + 'Z"/>' +
                '<path class="sc-rayon__nez" d="M' + (marge + 8) + ' ' + planche.y + 'h' +
                (STAGE_WIDTH - marge * 2 - 16) + '"/>';

            var utile = STAGE_WIDTH - marge * 2 - 60;
            var pas = utile / lot.length;
            lot.forEach(function (item, i) {
                var x = marge + 30 + pas * (i + 0.5);
                objets += contenant(item, x, planche.y, planche.k, rang * 7 + i, ep);
            });
        });

        return defs() + painted('entrepot') +
            '<rect class="sc-dusk" width="' + STAGE_WIDTH + '" height="' + STAGE_HEIGHT + '"/>' +
            bati +
            '<g class="sc-lanterns"><ellipse cx="480" cy="168" rx="240" ry="92" fill="url(#sc-halo)"/></g>' +
            bois + objets + light();
    }

    /** La forme sous laquelle on range chaque matière. */
    function contenant(item, x, y, k, seed, epaisseur) {
        var type = item.type || 'OTHER';
        var sous = y + (epaisseur || 14) + 16 * k;
        var corps;

        if (type === 'CEREAL') corps = sac(x, y, k);
        else if (type === 'HONEY') corps = jarre(x, y, k);
        else if (type === 'HOP' || type === 'HERB') corps = botte(x, y, k, seed);
        else if (type === 'WATER') corps = tonnelet(x, y, k);
        else if (type === 'FRUIT') corps = cageot(x, y, k);
        else corps = pot(x, y, k);

        return '<g class="sc-stock" data-type="' + esc(type) + '">' +
            '<ellipse class="sc-contact" cx="' + x.toFixed(1) + '" cy="' + (y + 2).toFixed(1) +
            '" rx="' + (46 * k).toFixed(1) + '" ry="' + (7 * k).toFixed(1) + '"/>' +
            corps +
            '<text class="sc-stock__nom" x="' + x.toFixed(1) + '" y="' + sous.toFixed(1) + '">' +
            esc(item.ingredientName) + '</text>' +
            '<text class="sc-stock__qte" x="' + x.toFixed(1) + '" y="' + (sous + 16 * k).toFixed(1) + '">' +
            esc(quantite(item)) + '</text>' +
            '</g>';
    }

    var UNITES = { GRAM: 'g', KILOGRAM: 'kg', MILLILITER: 'ml', LITER: 'L', UNIT: '' };

    function quantite(item) {
        var n = Number(item.quantity || 0);
        var arrondi = Math.abs(n % 1) < 0.005 ? Math.round(n) : Math.round(n * 10) / 10;
        var suffixe = UNITES[item.unit] === undefined ? '' : UNITES[item.unit];
        return arrondi.toLocaleString('fr-FR') + (suffixe ? ' ' + suffixe : '');
    }

    function sac(x, y, k) {
        var w = 58 * k, h = 76 * k;
        var col = y - h * 0.72;
        return '<path class="sc-sac" d="M' + (x - w / 2) + ' ' + y +
            'q' + (-5 * k) + ' ' + (-h * 0.34) + ' ' + (w * 0.19) + ' ' + (-h * 0.56) +
            'q' + (w * 0.1) + ' ' + (-h * 0.08) + ' ' + (w * 0.12) + ' ' + (-h * 0.16) +
            'h' + (w * 0.38) +
            'q' + (w * 0.02) + ' ' + (h * 0.08) + ' ' + (w * 0.12) + ' ' + (h * 0.16) +
            'q' + (w * 0.24) + ' ' + (h * 0.22) + ' ' + (w * 0.19) + ' ' + (h * 0.56) + 'Z"/>' +
            // Le col noué et l'ouverture évasée : sans eux, c'est un galet.
            '<path class="sc-sac__gueule" d="M' + (x - w * 0.19) + ' ' + col +
            'q' + (w * 0.19) + ' ' + (-h * 0.16) + ' ' + (w * 0.38) + ' 0' +
            'q' + (-w * 0.19) + ' ' + (h * 0.07) + ' ' + (-w * 0.38) + ' 0Z"/>' +
            '<path class="sc-sac__col" d="M' + (x - w * 0.2) + ' ' + (col + h * 0.05) + 'h' + (w * 0.4) + '"/>' +
            '<path class="sc-sac__pli" d="M' + (x - w * 0.3) + ' ' + (y - h * 0.3) +
            'q' + (w * 0.3) + ' ' + (h * 0.12) + ' ' + (w * 0.6) + ' 0"/>';
    }

    function jarre(x, y, k) {
        var w = 50 * k, h = 70 * k;
        return '<path class="sc-jarre" d="M' + (x - w * 0.28) + ' ' + (y - h) +
            'h' + (w * 0.56) + 'l' + (w * 0.2) + ' ' + (h * 0.22) +
            'a' + (w * 0.5) + ' ' + (h * 0.44) + ' 0 0 1 ' + (-w * 0.96) + ' 0Z"/>' +
            '<ellipse class="sc-jarre__bouchon" cx="' + x + '" cy="' + (y - h) + '" rx="' + (w * 0.32) + '" ry="' + (5 * k) + '"/>' +
            '<path class="sc-jarre__reflet" d="M' + (x - w * 0.24) + ' ' + (y - h * 0.58) + 'q' + (-3 * k) + ' ' + (h * 0.3) + ' ' + (4 * k) + ' ' + (h * 0.42) + '"/>';
    }

    function botte(x, y, k, seed) {
        var h = 74 * k;
        var tiges = '';
        for (var i = 0; i < 7; i++) {
            var d = (jitter(seed, i) - 0.5) * 44 * k;
            tiges += '<path class="sc-botte__tige" d="M' + x.toFixed(1) + ' ' + y.toFixed(1) +
                'q' + (d * 0.4).toFixed(1) + ' ' + (-h * 0.6) + ' ' + d.toFixed(1) + ' ' + (-h).toFixed(1) + '"/>';
        }
        return tiges + '<path class="sc-botte__lien" d="M' + (x - 18 * k) + ' ' + (y - h * 0.32) + 'h' + (36 * k) + '"/>';
    }

    function tonnelet(x, y, k) {
        var w = 54 * k, h = 68 * k;
        return '<path class="sc-tonnelet" d="M' + (x - w * 0.4) + ' ' + y +
            'q' + (-6 * k) + ' ' + (-h / 2) + ' 0 ' + (-h) + 'h' + (w * 0.8) +
            'q' + (6 * k) + ' ' + (h / 2) + ' 0 ' + h + 'Z"/>' +
            '<path class="sc-tonnelet__cercle" d="M' + (x - w * 0.46) + ' ' + (y - h * 0.68) + 'h' + (w * 0.92) +
            'M' + (x - w * 0.46) + ' ' + (y - h * 0.3) + 'h' + (w * 0.92) + '"/>';
    }

    function cageot(x, y, k) {
        var w = 60 * k, h = 52 * k;
        return '<path class="sc-cageot" d="M' + (x - w / 2) + ' ' + y + 'v' + (-h) + 'h' + w + 'v' + h + 'Z"/>' +
            '<path class="sc-cageot__latte" d="M' + (x - w / 2) + ' ' + (y - h * 0.62) + 'h' + w +
            'M' + (x - w / 2) + ' ' + (y - h * 0.3) + 'h' + w + '"/>' +
            '<circle class="sc-cageot__fruit" cx="' + (x - 8 * k) + '" cy="' + (y - h - 6 * k) + '" r="' + (8 * k) + '"/>' +
            '<circle class="sc-cageot__fruit" cx="' + (x + 8 * k) + '" cy="' + (y - h - 5 * k) + '" r="' + (7 * k) + '"/>';
    }

    function pot(x, y, k) {
        var w = 40 * k, h = 50 * k;
        return '<path class="sc-pot" d="M' + (x - w / 2) + ' ' + y + 'v' + (-h * 0.8) +
            'q0 ' + (-h * 0.2) + ' ' + (w / 2) + ' ' + (-h * 0.2) +
            'q' + (w / 2) + ' 0 ' + (w / 2) + ' ' + (h * 0.2) + 'V' + y + 'Z"/>' +
            '<path class="sc-pot__etiquette" d="M' + (x - w * 0.34) + ' ' + (y - h * 0.5) + 'h' + (w * 0.68) + 'v' + (h * 0.3) + 'h' + (-w * 0.68) + 'Z"/>';
    }


    /* ---------------------------------------------------------- Commandes */

    /**
     * Le tableau d'affichage.
     *
     * <p>Les contrats étaient des lignes de liste. Le tableau existe pourtant
     * déjà dans le décor peint, avec ses parchemins cloués : on le dessine.
     * Chaque marchand a sa feuille, punaisée de travers, avec ce qu'il veut,
     * ce qu'il paie, et le temps qu'il reste. Une feuille prête à livrer
     * s'allume ; une feuille acceptée porte son cachet de cire.
     */
    function commandes(state) {
        var contrats = (state.npcOrders || []).filter(function (o) {
            return o.status === 'OPEN' || o.status === 'IN_PROGRESS';
        }).slice(0, 3);
        if (!contrats.length) return '';

        var bois = '<g class="sc-tableau">' +
            '<path class="sc-tableau__cadre" d="M52 96h856v404H52Z"/>' +
            '<path class="sc-tableau__liege" d="M74 118h812v360H74Z"/>';
        for (var g = 0; g < 26; g++) {
            var gx = 74 + jitter(11, g) * 812;
            var gy = 118 + jitter(11, g + 40) * 360;
            bois += '<circle class="sc-tableau__grain" cx="' + gx.toFixed(0) + '" cy="' + gy.toFixed(0) +
                '" r="' + (2 + jitter(11, g + 80) * 3).toFixed(1) + '"/>';
        }
        bois += '</g>';

        var feuilles = contrats.map(function (contrat, i) {
            var x = 480 + (i - (contrats.length - 1) / 2) * 268;
            return parchemin(contrat, state, x, 300, i);
        }).join('');

        return defs() + painted('commandes') +
            '<rect class="sc-dusk" width="' + STAGE_WIDTH + '" height="' + STAGE_HEIGHT + '"/>' +
            bois +
            '<g class="sc-lanterns"><ellipse cx="480" cy="180" rx="260" ry="110" fill="url(#sc-halo)"/></g>' +
            feuilles + light();
    }

    /** Une feuille punaisée : ce qu'on veut, ce qu'on paie, ce qu'il reste. */
    function parchemin(contrat, state, x, y, i) {
        var ligne = (contrat.lines || [])[0] || {};
        var enCours = contrat.status === 'IN_PROGRESS';
        var livrable = (contrat.lines || []).length > 0 && (contrat.lines || []).every(function (l) {
            return (state.batches || []).filter(function (b) {
                return b.recipeId === l.recipeId && b.status === 'READY' && b.quality >= l.minQuality;
            }).reduce(function (t, b) { return t + Number(b.volume); }, 0) >= l.quantity;
        });
        var etat = livrable ? 'ready' : (enCours ? 'busy' : 'open');

        var w = 216, h = 280;
        var gauche = x - w / 2;
        var haut = y - h / 2;
        // Chaque feuille penche un peu, et toujours du même côté : une
        // punaise au milieu ne tient pas une feuille droite.
        var angle = (jitter(7, i) - 0.5) * 5;

        var action = livrable ? 'npc-complete' : (contrat.status === 'OPEN' ? 'npc-accept' : '');

        return '<g class="sc-node sc-contrat" data-state="' + etat + '" data-id="' + contrat.id + '"' +
            (action ? ' data-action="' + action + '" tabindex="0" role="button"' : '') +
            ' aria-label="' + esc(contrat.customerName || 'Contrat') + '"' +
            ' transform="rotate(' + angle.toFixed(2) + ' ' + x + ' ' + y + ')">' +

            (livrable
                ? '<ellipse class="sc-node__glow" cx="' + x + '" cy="' + y +
                  '" rx="' + (w * 0.78) + '" ry="' + (h * 0.62) + '" fill="url(#sc-halo)"/>'
                : '') +

            '<path class="sc-feuille__ombre" d="M' + (gauche + 6) + ' ' + (haut + 8) + 'h' + w + 'v' + h + 'h' + (-w) + 'Z"/>' +
            // Un coin corné en bas à droite : une feuille plate est un rectangle.
            '<path class="sc-feuille" d="M' + gauche + ' ' + haut + 'h' + w + 'v' + (h - 26) +
            'l-26 26H' + gauche + 'Z"/>' +
            '<path class="sc-feuille__corne" d="M' + (gauche + w) + ' ' + (haut + h - 26) +
            'l-26 26v-26Z"/>' +

            '<text class="sc-feuille__client" x="' + x + '" y="' + (haut + 44) + '">' +
            esc(contrat.customerName || '') + '</text>' +
            '<path class="sc-feuille__filet" d="M' + (gauche + 26) + ' ' + (haut + 58) + 'h' + (w - 52) + '"/>' +

            '<text class="sc-feuille__quoi" x="' + x + '" y="' + (haut + 104) + '">' +
            esc(ligne.quantity ? ligne.quantity + ' L' : '') + '</text>' +
            '<text class="sc-feuille__recette" x="' + x + '" y="' + (haut + 130) + '">' +
            esc(ligne.recipeName || '') + '</text>' +
            (ligne.minQuality
                ? '<text class="sc-feuille__note" x="' + x + '" y="' + (haut + 152) + '">qualité ≥ ' +
                  ligne.minQuality + '</text>'
                : '') +

            '<text class="sc-feuille__prix" x="' + x + '" y="' + (haut + 200) + '">' +
            (contrat.rewardCoins || 0) + ' pièces</text>' +
            '<text class="sc-feuille__note" x="' + x + '" y="' + (haut + 222) + '">+' +
            (contrat.rewardReputation || 0) + ' réputation</text>' +
            '<text class="sc-plot__time sc-feuille__delai" x="' + x + '" y="' + (haut + 250) + '">' +
            esc(countdown(contrat.expiresAt)) + '</text>' +

            // La punaise, et le cachet de cire quand le contrat est pris.
            '<circle class="sc-punaise" cx="' + x + '" cy="' + (haut + 14) + '" r="9"/>' +
            '<circle class="sc-punaise__reflet" cx="' + (x - 3) + '" cy="' + (haut + 11) + '" r="3"/>' +
            (enCours
                ? '<circle class="sc-cachet" cx="' + (gauche + 40) + '" cy="' + (haut + h - 54) + '" r="22"/>' +
                  '<text class="sc-cachet__texte" x="' + (gauche + 40) + '" y="' + (haut + h - 48) + '">pris</text>'
                : '') +

            (livrable ? badge(gauche + w - 34, haut + h - 66, 1, 'ready') : '') +
            hit(x, haut, w + 24, h + 24) +
            '</g>';
    }


    /* ---------------------------------------------------------- Paillasse */

    /* La couleur de chaque matière dans la cuve. Elles se mélangent vraiment :
       trois parts d'orge et une de bruyère donnent un blond qui tire à peine
       au vert, et c'est ce qu'on veut voir. */
    var TEINTES = {
        CEREAL: [216, 160, 58], HONEY: [224, 167, 44], HOP: [127, 155, 70],
        HERB: [111, 155, 82], FRUIT: [184, 66, 47], SPICE: [165, 100, 42],
        YEAST: [201, 189, 160], WATER: [127, 163, 184], OTHER: [141, 130, 114]
    };

    /**
     * La couleur du mélange : une part par matière.
     *
     * <p>Pondérer par la dose semblait évident et donnait un résultat faux :
     * 400 g de bruyère et 9 kg d'orge ne sont pas des nombres comparables,
     * et l'unité décidait de la teinte à la place de la recette. Une part
     * chacun se lit juste, et chaque ajout se voit.
     */
    function melange(lignes) {
        if (!lignes.length) return [120, 132, 140];
        var somme = [0, 0, 0];
        lignes.forEach(function (l) {
            var t = TEINTES[l.type] || TEINTES.OTHER;
            for (var c = 0; c < 3; c++) somme[c] += t[c];
        });
        return somme.map(function (v) { return Math.round(v / lignes.length); });
    }

    /**
     * La paillasse du laboratoire.
     *
     * <p>Composer une recette était un formulaire : un nom, deux nombres et
     * une liste de lignes avec des boutons « + » et « − ». Le joueur dosait
     * à l'aveugle et ne voyait rien de ce qu'il fabriquait.
     *
     * <p>La cuve montre maintenant le mélange : sa couleur est la moyenne
     * des matières qu'on y verse, pondérée par la dose, et elle se remplit à
     * mesure qu'on ajoute. Elle ne dit pas l'effet — c'est l'alchimie qui le
     * décide, et le découvrir est le jeu — mais elle montre qu'on fabrique
     * quelque chose plutôt que de remplir un bordereau.
     */
    function paillasse(state) {
        var lignes = (state.labLines || []).slice(0, 8);
        var couleur = melange(lignes);
        var rgb = 'rgb(' + couleur.join(',') + ')';
        var clair = 'rgb(' + couleur.map(function (v) { return Math.min(255, v + 46); }).join(',') + ')';

        var cx = STAGE_WIDTH / 2;
        var sol = 470;
        var rCuve = 132;
        var hCuve = 150;
        var hautCuve = sol - hCuve;
        var remplissage = lignes.length ? 0.24 + Math.min(1, lignes.length / 8) * 0.56 : 0.1;
        var niveau = sol - 14 - (hCuve - 28) * remplissage;

        var bulles = '';
        for (var b = 0; b < (lignes.length ? 7 : 0); b++) {
            var bx = cx + (jitter(23, b) - 0.5) * rCuve * 1.1;
            bulles += '<circle class="sc-bulle-cuve" cx="' + bx.toFixed(1) + '" cy="' + (sol - 20).toFixed(1) +
                '" r="' + (3 + jitter(23, b + 20) * 4).toFixed(1) +
                '" style="--bul-delay:' + (-b * 0.55).toFixed(2) + 's;--bul-haut:' +
                (-(sol - 20 - niveau - 8)).toFixed(0) + 'px"/>';
        }

        // Les matières posées sur la paillasse, de part et d'autre de la cuve.
        var poses = lignes.map(function (ligne, i) {
            var cote = i % 2 === 0 ? -1 : 1;
            var rang = Math.floor(i / 2);
            var x = cx + cote * (rCuve + 78 + rang * 112);
            return '<g class="sc-node sc-fiole" data-state="ready" data-id="' + ligne.id + '"' +
                ' data-action="lab-remove" tabindex="0" role="button"' +
                ' aria-label="Retirer ' + esc(ligne.name || '') + ' du mélange">' +
                '<ellipse class="sc-contact" cx="' + x.toFixed(1) + '" cy="' + (sol + 4) +
                '" rx="38" ry="7"/>' +
                contenant({ type: ligne.type, ingredientName: ligne.name,
                            quantity: ligne.quantity, unit: ligne.unit }, x, sol, 0.66, i, 0) +
                hit(x, sol - 76, 92, 128) +
                '</g>';
        }).join('');

        return defs() + painted('brasserie') +
            '<rect class="sc-dusk" width="' + STAGE_WIDTH + '" height="' + STAGE_HEIGHT + '"/>' +
            '<g class="sc-lanterns"><ellipse cx="' + cx + '" cy="220" rx="250" ry="120" fill="url(#sc-halo)"/></g>' +

            '<path class="sc-paillasse" d="M0 ' + sol + 'h' + STAGE_WIDTH + 'v' + (STAGE_HEIGHT - sol) + 'H0Z"/>' +
            '<path class="sc-paillasse__nez" d="M0 ' + sol + 'h' + STAGE_WIDTH + '"/>' +

            poses +

            '<ellipse class="sc-contact" cx="' + cx + '" cy="' + (sol + 6) + '" rx="' + (rCuve * 0.92) + '" ry="14"/>' +
            '<clipPath id="sc-cuve-clip"><path d="M' + (cx - rCuve) + ' ' + hautCuve +
            'q' + (-10) + ' ' + hCuve + ' ' + (rCuve * 0.18) + ' ' + hCuve +
            'h' + (rCuve * 1.64) + 'q' + (rCuve * 0.18 + 10) + ' 0 ' + (rCuve * 0.18) + ' ' + (-hCuve) + 'Z"/></clipPath>' +
            '<path class="sc-cuve__paroi" d="M' + (cx - rCuve) + ' ' + hautCuve +
            'q' + (-10) + ' ' + hCuve + ' ' + (rCuve * 0.18) + ' ' + hCuve +
            'h' + (rCuve * 1.64) + 'q' + (rCuve * 0.18 + 10) + ' 0 ' + (rCuve * 0.18) + ' ' + (-hCuve) + 'Z"/>' +
            '<g clip-path="url(#sc-cuve-clip)">' +
            '<rect x="' + (cx - rCuve - 20) + '" y="' + niveau.toFixed(1) + '" width="' + (rCuve * 2 + 40) +
            '" height="' + (sol - niveau + 10).toFixed(1) + '" fill="' + rgb + '"/>' +
            '<ellipse class="sc-cuve__surface" cx="' + cx + '" cy="' + niveau.toFixed(1) +
            '" rx="' + (rCuve * 0.94) + '" ry="16" fill="' + clair + '"/>' +
            bulles +
            '</g>' +
            '<ellipse class="sc-cuve__col" cx="' + cx + '" cy="' + hautCuve + '" rx="' + rCuve + '" ry="22"/>' +

            (lignes.length
                ? '<text class="sc-cuve__compte" x="' + cx + '" y="' + (hautCuve - 44) + '">' +
                  lignes.length + ' sur 8</text>'
                : '<text class="sc-cuve__vide" x="' + cx + '" y="' + (hautCuve - 44) + '">' +
                  'La cuve est vide</text>') +
            light();
    }

    /* ------------------------------------------------------------- Montage */

    var SCENES = {
        champs: { build: champs, empty: 'Aucune parcelle sur ce domaine.' },
        rucher: { build: rucher, empty: 'Aucune ruche installée.' },
        brasserie: { build: brasserie, empty: 'Aucune cuve en travail. Lance un brassin.' },
        taverne: { build: taverne, empty: '' },
        entrepot: { build: entrepot, empty: 'L’entrepôt est vide.' },
        commandes: { build: commandes, empty: 'Aucun marchand n’est encore passé. Le premier ne tardera pas.' },
        atelier: { build: paillasse, empty: '' }
    };

    /**
     * Signature de la composition du lieu.
     *
     * <p>Tant qu'elle ne change pas, la scène n'est pas reconstruite : seules
     * les valeurs qui avancent avec le temps sont retouchées.
     */
    function signature(place, state) {
        if (place === 'champs') {
            return (state.fields || []).map(function (f) {
                return f.id + ':' + fieldState(f) + ':' + growthStage(f) + ':' + (f.cropName || '');
            }).join('|');
        }
        if (place === 'rucher') {
            return (state.hives || []).map(function (h) { return h.id + ':' + hiveState(h); }).join('|');
        }
        if (place === 'brasserie') {
            return (state.batches || []).map(function (b) { return b.id + ':' + batchState(b); }).join('|');
        }
        if (place === 'taverne') {
            return (state.tavernCounter || []).map(function (o) {
                return o.id + ':' + o.servings + ':' + (o.mine ? 'm' : '');
            }).join('|');
        }
        if (place === 'entrepot') {
            return (state.inventory || []).map(function (i) {
                return i.ingredientId + ':' + i.quantity;
            }).join('|');
        }
        if (place === 'commandes') {
            return (state.npcOrders || []).filter(function (o) {
                return o.status === 'OPEN' || o.status === 'IN_PROGRESS';
            }).map(function (o) { return o.id + ':' + o.status; }).join('|');
        }
        if (place === 'atelier') {
            return (state.labLines || []).map(function (l) {
                return l.id + ':' + l.quantity;
            }).join('|');
        }
        return '';
    }

    function has(place) {
        return Object.prototype.hasOwnProperty.call(SCENES, place);
    }

    function markup(place, state) {
        var scene = SCENES[place];
        if (!scene) return '';
        var body = scene.build(state);
        if (!body) return '<p class="sc-empty">' + esc(scene.empty) + '</p>';
        return '<svg class="sc-stage" viewBox="0 0 ' + STAGE_WIDTH + ' ' + STAGE_HEIGHT + '"' +
            ' preserveAspectRatio="xMidYMax slice" role="group">' + body + '</svg>';
    }

    /**
     * Retouche ce qui avance : le compte à rebours, la pousse, le niveau des
     * cuves. Rien d'autre n'est touché, donc rien ne saute.
     */
    function tick(root, place, state) {
        if (!root) return;

        if (place === 'champs') {
            (state.fields || []).forEach(function (field) {
                var node = root.querySelector('.sc-plot[data-id="' + field.id + '"]');
                if (!node) return;
                var time = node.querySelector('.sc-plot__time');
                if (time) time.textContent = fieldState(field) === 'growing' ? countdown(field.readyAt) : '';
            });
            return;
        }

        if (place === 'rucher') {
            (state.hives || []).forEach(function (hive) {
                var node = root.querySelector('.sc-hive[data-id="' + hive.id + '"]');
                if (!node) return;
                var time = node.querySelector('.sc-plot__time');
                if (time) time.textContent = hiveState(hive) === 'growing' ? countdown(hive.readyAt) : '';
            });
            return;
        }

        if (place === 'commandes') {
            (state.npcOrders || []).forEach(function (order) {
                var node = root.querySelector('.sc-contrat[data-id="' + order.id + '"]');
                if (!node) return;
                var time = node.querySelector('.sc-feuille__delai');
                if (time) time.textContent = countdown(order.expiresAt);
            });
            return;
        }

        if (place === 'brasserie') {
            (state.batches || []).forEach(function (batch) {
                var node = root.querySelector('.sc-vat[data-id="' + batch.id + '"]');
                if (!node) return;
                var time = node.querySelector('.sc-plot__time');
                if (time) time.textContent = batchState(batch) === 'growing' ? countdown(batch.readyAt) : '';
                var liquid = node.querySelector('.sc-vat__liquid');
                if (liquid && batchState(batch) === 'growing') {
                    liquid.style.setProperty('--fill', ratio(batch.startedAt, batch.readyAt).toFixed(3));
                }
            });
        }
    }

    global.BrewsteadScenes = {
        has: has,
        markup: markup,
        signature: signature,
        tick: tick
    };
})(window);
