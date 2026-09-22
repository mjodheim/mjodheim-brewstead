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
        brasserie: { x: 841, y: 232, width: 400 }
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
            '</g>';
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
        var h = slot.height * 1.15;

        return '<g class="sc-node sc-hive" data-state="' + state + '" data-id="' + hive.id + '"' +
            (action ? ' data-action="' + action + '" tabindex="0" role="button"' : '') +
            ' aria-label="Ruche n°' + hive.id + '">' +

            (state === 'ready'
                ? '<ellipse class="sc-node__glow" cx="' + slot.x + '" cy="' + (slot.y - h * 0.5) +
                  '" rx="' + (slot.width * 0.5) + '" ry="' + (h * 0.75) + '" fill="url(#sc-halo)"/>'
                : '') +

            '<ellipse class="sc-shadow" cx="' + slot.x + '" cy="' + slot.y + '" rx="' + (slot.width * 0.3) + '" ry="' + (9 * slot.scale) + '"/>' +
            '<g class="sc-hive__body" transform="translate(' + slot.x + ' ' + slot.y + ') scale(' + slot.scale + ')">' +
            '<path class="sc-hive__stand" d="M-44 0h88l-6 8H-38Z"/>' +
            '<path class="sc-hive__dome" d="M-38 0a38 46 0 0 1 76 0Z"/>' +
            '<path class="sc-hive__rings" d="M-35-14h70M-30-28h60M-22-40h44"/>' +
            '<ellipse class="sc-hive__door" cy="-9" rx="7" ry="5"/>' +
            '</g>' +
            (state === 'growing' || state === 'ready' ? bees(slot, hive.id * 13) : '') +

            badge(slot.x, slot.y - h - 34 * slot.scale, slot.scale, state) +
            '<text class="sc-plot__time" x="' + slot.x + '" y="' + (slot.y + 22 * slot.scale) + '">' +
            (state === 'growing' ? esc(countdown(hive.readyAt)) : '') + '</text>' +
            hit(slot.x, slot.y - h - 52 * slot.scale, slot.width * 1.1, h + 74 * slot.scale) +
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

    /* ------------------------------------------------------------- Montage */

    var SCENES = {
        champs: { build: champs, empty: 'Aucune parcelle sur ce domaine.' },
        rucher: { build: rucher, empty: 'Aucune ruche installée.' },
        brasserie: { build: brasserie, empty: 'Aucune cuve en travail. Lance un brassin.' }
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
