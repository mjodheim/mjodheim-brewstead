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

    /**
     * Le tableau du fond, déjà flouté.
     *
     * <p>Le flou était calculé par le navigateur, dans le même SVG que les
     * épis qui ondulent et les abeilles qui tournent : sept pixels de flou
     * sur une image plein cadre, refaits à chaque image de chaque
     * animation. Dans les champs, un tiers du temps de calcul y passait. Le
     * flou est maintenant dans l'image, fait une fois pour toutes.
     *
     * <p>L'adresse vient de la page : le serveur sert chaque fichier sous un
     * nom qui porte l'empreinte de son contenu, que ce script ne sait pas
     * calculer.
     */
    function art() {
        var carte = global.document && global.document.getElementById('worldArt');
        return (carte && carte.getAttribute('data-flou')) || '/images/brewstead-domaine-flou.webp';
    }

    function painted(place) {
        // La taverne a maintenant sa propre peinture, légère (~50 KiB), au
        // lieu d'un zoom dans le domaine flouté. C'est plus détaillé et
        // moins coûteux qu'un décor reconstruit à chaque frame.
        if (place === 'taverne') {
            return '<g class="sc-far sc-far--tavern">' +
                '<image href="/images/lieux/taverne.webp" x="0" y="0" width="' + STAGE_WIDTH + '" height="' + STAGE_HEIGHT +
                '" preserveAspectRatio="xMidYMid slice"/>' +
                '</g>' +
                '<rect class="sc-brume sc-brume--tavern" width="' + STAGE_WIDTH + '" height="' + STAGE_HEIGHT + '"/>';
        }

        var crop = CROPS[place] || CROPS.champs;
        var height = crop.width * STAGE_HEIGHT / STAGE_WIDTH;
        var scale = STAGE_WIDTH / crop.width;
        var left = crop.x - crop.width / 2;
        var top = crop.y - height / 2;

        return '<g class="sc-far">' +
            '<image href="' + art() + '" x="' + (-left * scale).toFixed(1) + '" y="' + (-top * scale).toFixed(1) +
            '" width="' + (1536 * scale).toFixed(1) + '" height="' + (742 * scale).toFixed(1) +
            '" preserveAspectRatio="none"/>' +
            '</g>' +
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
            '<circle class="sc-badge__lip" cy="' + (3 * scale).toFixed(1) + '" r="' + (18 * scale).toFixed(1) + '"/>' +
            '<circle class="sc-badge__disc" r="' + (18 * scale).toFixed(1) + '"/>' +
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
    var TAVERN_SEATS = {
        'bar-gauche': { x: 332, y: 445, k: .92, face: 'dos' },
        'bar-droite': { x: 628, y: 445, k: .92, face: 'dos' },
        'table-gauche-a': { x: 118, y: 486, k: .84, face: 'droite' },
        'table-gauche-b': { x: 254, y: 488, k: .84, face: 'gauche' },
        'table-droite-a': { x: 706, y: 480, k: .82, face: 'droite' },
        'table-droite-b': { x: 842, y: 482, k: .82, face: 'gauche' },
        'feu-gauche': { x: 389, y: 505, k: .88, face: 'droite' },
        'feu-droite': { x: 570, y: 507, k: .88, face: 'gauche' }
    };

    var TAVERN_TABLES = [
        { cx: 168, cy: 472, rx: 112, ry: 43 },
        { cx: 478, cy: 486, rx: 126, ry: 48 },
        { cx: 792, cy: 468, rx: 106, ry: 41 }
    ];

    function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    function normalizeTavernPoint(x, y) {
        x = clamp(Number(x) || 862, 72, 888);
        y = clamp(Number(y) || 405, 382, 520);
        for (var pass = 0; pass < 2; pass++) {
            TAVERN_TABLES.forEach(function (table) {
                var nx = (x - table.cx) / table.rx;
                var ny = (y - table.cy) / table.ry;
                var d2 = nx * nx + ny * ny;
                if (d2 >= 1) return;
                if (d2 < .0001) {
                    nx = 0;
                    ny = y <= table.cy ? -1 : 1;
                    d2 = 1;
                }
                var factor = 1.08 / Math.sqrt(d2);
                x = clamp(table.cx + nx * factor * table.rx, 72, 888);
                y = clamp(table.cy + ny * factor * table.ry, 382, 520);
            });
        }
        return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
    }

    function tavernPoint(svg, clientX, clientY) {
        if (!svg || !svg.createSVGPoint || !svg.getScreenCTM()) return null;
        var point = svg.createSVGPoint();
        point.x = clientX;
        point.y = clientY;
        var local = point.matrixTransform(svg.getScreenCTM().inverse());
        return normalizeTavernPoint(local.x, local.y);
    }

    function tavernScale(y, bodyScale, seatKey) {
        if (seatKey && TAVERN_SEATS[seatKey]) return TAVERN_SEATS[seatKey].k * bodyScale;
        var depth = .76 + ((clamp(y, 382, 520) - 382) / 138) * .20;
        return depth * bodyScale;
    }

    function couleurPersonnage(palette) {
        return {
            ambre: ['#9a542d', '#d18843', '#f1ba68'],
            fjord: ['#31576f', '#4f8296', '#9fc5c5'],
            mousse: ['#48613b', '#71804b', '#b0ad62'],
            prune: ['#5b3b55', '#86596f', '#c89492'],
            cuivre: ['#75432f', '#a7663c', '#dc9b62'],
            ardoise: ['#3f4b55', '#64727b', '#a6b0ad']
        }[palette] || ['#5b4a37', '#806848', '#c19b69'];
    }

    function dernierMessage(room, playerId) {
        var messages = room && room.messages || [];
        for (var i = messages.length - 1; i >= 0; i--) {
            if (messages[i].authorId === playerId) {
                var age = Date.now() - new Date(messages[i].postedAt).getTime();
                if (age <= 12000) return messages[i];
                return null;
            }
        }
        return null;
    }

    function cheveux(style, color) {
        if (style === 'rase') return '<path class="sc-patron__hair" fill="' + color + '" d="M-20-69q20-12 40 0v8q-20-6-40 0Z"/>';
        if (style === 'tresse') return '<path class="sc-patron__hair" fill="' + color + '" d="M-23-67q21-17 45 0v10q-20-8-39 0l-6 22 8 2 8-23q4-3 8-3v31q0 12 9 22l-8 4Q-7-17-5-57q-9 1-18 8Z"/>';
        if (style === 'long') return '<path class="sc-patron__hair" fill="' + color + '" d="M-25-67q23-17 49 0v43l-12 9 1-40q-14-7-26 0l1 40-13-9Z"/>';
        if (style === 'boucles') return '<path class="sc-patron__hair" fill="' + color + '" d="M-24-67q4-12 13-8 7-9 15-2 11-6 16 5 10 1 7 12l-8 5q-5-9-14-6-8-6-17 0-7-5-12-1Z"/>';
        return '<path class="sc-patron__hair" fill="' + color + '" d="M-22-68q20-16 43 0l-3 12q-20-8-38 1Z"/>';
    }

    function patronNode(person, room) {
        var seated = !!(person.seatKey && TAVERN_SEATS[person.seatKey]);
        var seat = seated ? TAVERN_SEATS[person.seatKey] : null;
        var pos = seated
            ? { x: seat.x, y: seat.y }
            : normalizeTavernPoint(person.x == null ? 862 : person.x, person.y == null ? 405 : person.y);
        var palette = couleurPersonnage(person.character && person.character.palette);
        var hairColors = ['#352319', '#5b3a24', '#8a5d30', '#2e2b29', '#b89158'];
        var hc = hairColors[(Number(person.playerId) || 0) % hairColors.length];
        var speech = dernierMessage(room, person.playerId);
        var speechUntil = speech ? new Date(speech.postedAt).getTime() + 12000 : 0;
        var emoteAge = person.emoteAt ? Date.now() - new Date(person.emoteAt).getTime() : Infinity;
        var emote = emoteAge < 5500 ? {SKAL:'🍻',SALUT:'👋',RIRE:'😄',COEUR:'♥',MUSIQUE:'♫'}[person.emote] : '';
        var emoteUntil = person.emoteAt ? new Date(person.emoteAt).getTime() + 5500 : 0;
        var actionAge = person.actionAt ? Date.now() - new Date(person.actionAt).getTime() : Infinity;
        var drinking = person.action === 'DRINKING' && actionAge < 4500;
        var name = lignes(person.name, 128, 13, 1);
        var speakClass = speech ? ' is-speaking' : '';
        var selfClass = person.self ? ' is-self' : '';
        var drinkClass = drinking ? ' is-drinking' : '';
        var bodyScale = person.character && person.character.body === 'grand' ? 1.06 :
            (person.character && person.character.body === 'fin' ? .94 : 1);
        var scale = tavernScale(pos.y, bodyScale, person.seatKey);
        var facing = person.facing || (seat && seat.face === 'gauche' ? 'LEFT' : 'RIGHT');
        var pose = seated ? 'SEATED' : (person.pose || 'STANDING');
        var outfit = person.character && person.character.outfit || 'brasseur';
        var apron = outfit === 'brasseur'
            ? '<path class="sc-patron__apron" d="M-22-20q22-10 44 0l-3 52h-38Z"/>'
            : outfit === 'marchand'
                ? '<path class="sc-patron__vest" d="M-27-22l14-8 13 18 13-18 14 8-8 55h-38Z"/>'
                : '<path class="sc-patron__belt" d="M-27 5h54v8h-54Z"/>';

        var bubble = '';
        if (speech) {
            var words = lignes(speech.body, 164, 14, 3);
            var h = 26 + words.length * 17;
            bubble = '<g class="sc-speech" data-until="' + speechUntil + '" transform="translate(0 ' + (-128 - h) + ')">' +
                '<path class="sc-speech__box" d="M-92 0q0-12 12-12h160q12 0 12 12v' + h + 'q0 12-12 12h-69l-13 15-2-15h-76q-12 0-12-12Z"/>' +
                texteEnLignes('sc-speech__text', 0, 12, 17, words) + '</g>';
        }

        return '<g class="sc-node sc-patron' + speakClass + selfClass + drinkClass + '" data-id="' + person.playerId +
            '" data-action="tavern-player" data-x="' + pos.x + '" data-y="' + pos.y + '" data-k="' + scale.toFixed(3) +
            '" data-body-scale="' + bodyScale + '" data-facing="' + facing + '" data-pose="' + pose +
            '" tabindex="0" role="button" aria-label="' + esc(person.name) + '"' +
            ' style="--idle-delay:-' + ((Number(person.playerId) || 0) % 7) + 's" transform="translate(' +
            pos.x + ' ' + pos.y + ') scale(' + scale.toFixed(3) + ')">' +
            '<ellipse class="sc-patron__shadow" cx="0" cy="70" rx="38" ry="9"/>' +
            '<g class="sc-patron__figure">' +
            '<path class="sc-chair__back" d="M-34-35q34-13 68 0v39h-8l-5-29q-21-8-42 0l-5 29h-8Z"/>' +
            '<g class="sc-patron__body">' +
            '<path class="sc-patron__legs" d="M-23 22l-8 47h15l16-39 16 39h15l-8-47Z"/>' +
            '<path class="sc-patron__boot" d="M-31 66h18l-2 12h-26q0-10 10-12Zm44 0h18q10 2 10 12H15Z"/>' +
            '<path class="sc-patron__torso" fill="' + palette[1] + '" d="M-31-26q31-17 62 0l-5 55q-26 13-52 0Z"/>' +
            '<path class="sc-patron__shade" fill="' + palette[0] + '" d="M-31-26q10 4 14 10l-4 43q-7-1-12-5Z"/>' +
            '<path class="sc-patron__highlight" fill="' + palette[2] + '" d="M18-23q8 4 13 9l-5 36q-5 4-10 5Z"/>' +
            apron +
            '<g class="sc-patron__arm sc-patron__arm--left"><path d="M-28-18q-17 8-22 33l10 3q7-18 20-25Z"/></g>' +
            '<g class="sc-patron__arm sc-patron__arm--right"><path d="M28-18q17 8 22 31l-10 4Q33 0 20-8Z"/>' +
            '<g class="sc-patron__mug" transform="translate(47 14)"><path d="M-8-12h16v23H-7Z"/><path d="M8-7q12 2 4 13" fill="none"/>' +
            '<ellipse class="sc-patron__foam" cx="0" cy="-12" rx="8" ry="3"/></g></g>' +
            '<path class="sc-patron__folds" d="M-12-13q4 23 2 39M12-13q-4 23-2 39"/>' +
            '<path class="sc-patron__collar" d="M-15-24 0-11l15-13"/>' +
            '</g>' +
            '<g class="sc-patron__head">' +
            '<path class="sc-patron__neck" d="M-9-34h18v17H-9Z"/>' +
            '<ellipse class="sc-patron__face" cx="0" cy="-50" rx="22" ry="25"/>' +
            '<circle class="sc-patron__ear" cx="-23" cy="-49" r="5"/><circle class="sc-patron__ear" cx="23" cy="-49" r="5"/>' +
            '<path class="sc-patron__nose" d="M1-51l-3 9 6 1"/>' +
            '<path class="sc-patron__eyes" d="M-12-54q4-2 7 0m10 0q4-2 7 0"/>' +
            '<path class="sc-patron__brows" d="M-13-60q5-3 10 0m6 0q5-3 10 0"/>' +
            '<path class="sc-patron__mouth" d="M-7-39q7 5 14 0"/>' +
            (((Number(person.playerId) || 0) % 3 === 0)
                ? '<path class="sc-patron__beard" fill="' + hc + '" d="M-18-42q18 17 36 0-2 25-18 28-16-3-18-28Z"/>'
                : '') +
            cheveux(person.character && person.character.hair, hc) +
            (person.character && person.character.accessory === 'broche' ? '<circle class="sc-patron__broche" cx="18" cy="-14" r="4"/>' : '') +
            '</g></g>' +
            texteEnLignes('sc-patron__name' + (person.self ? ' sc-patron__name--self' : ''), 0, 101, 14, name) +
            (emote ? '<text class="sc-patron__emote" data-until="' + emoteUntil + '" x="0" y="-105">' + emote + '</text>' : '') +
            bubble +
            hit(0, -12, 100, 175) +
            '</g>';
    }

    function placeNode(key, occupied) {
        var seat = TAVERN_SEATS[key];
        if (!seat || occupied) return '';
        return '<g class="sc-node sc-seat" data-action="tavern-seat" data-id="' + key +
            '" tabindex="0" role="button" aria-label="S’asseoir : ' + esc(key.replace(/-/g, ' ')) +
            '" transform="translate(' + seat.x + ' ' + seat.y + ')">' +
            '<ellipse class="sc-seat__ring" cx="0" cy="5" rx="34" ry="14"/>' +
            '<path class="sc-seat__chair" d="M-24-20q24-10 48 0v24h-7l-3-18q-14-5-28 0l-3 18h-7Z"/>' +
            '<text class="sc-seat__plus" x="0" y="2">+</text>' + hit(0, -4, 82, 62) + '</g>';
    }

    function barman() {
        return '<g class="sc-barman" transform="translate(480 307)">' +
            '<ellipse class="sc-patron__shadow" cx="0" cy="35" rx="42" ry="9"/>' +
            '<path class="sc-barman__body" d="M-42-16q42-24 84 0l-6 67h-72Z"/>' +
            '<path class="sc-barman__apron" d="M-28-8h56l-5 58h-46Z"/>' +
            '<ellipse class="sc-patron__face" cx="0" cy="-51" rx="23" ry="26"/>' +
            '<path class="sc-barman__hair" d="M-23-57q23-20 46 0v9q-24-8-46 0Z"/>' +
            '<path class="sc-barman__moustache" d="M-3-43q-10-8-17 1 11 8 20 2 9 6 20-2-7-9-17-1Z"/>' +
            '<g class="sc-barman__wipe"><path class="sc-barman__arm" d="M31-10q19 13 24 32l-10 3Q36 8 23 2Z"/>' +
            '<path class="sc-barman__cloth" d="M43 15q18-6 24 8-15 11-28 2Z"/></g>' +
            '<g class="sc-barman__glass" transform="translate(-38 19)"><path d="M-8-16h16l-2 28H-6Z"/><path d="M-5 12h10"/></g>' +
            '</g>';
    }

    function tavernInteriorDecor() {
        return '<g class="sc-tavern__interior" aria-hidden="true">' +
            // Lambris et grosses poutres : profondeur nette par-dessus le tableau peint.
            '<path class="sc-tavern__panel" d="M0 116H960V326H0Z"/>' +
            '<path class="sc-tavern__beam-deep" d="M0 112h960v18H0ZM84 112h20v214H84ZM856 112h20v214h-20Z"/>' +
            '<path class="sc-tavern__beam-edge" d="M0 130h960M104 112v214M856 112v214"/>' +

            // Étagère gauche : bouteilles, cruches et plantes suspendues.
            '<g class="sc-tavern__shelf" transform="translate(18 164)">' +
            '<path class="sc-tavern__shelf-board" d="M0 70h190v14H0Z"/>' +
            '<path class="sc-tavern__shelf-brace" d="M22 84h12v26H22ZM160 84h12v26h-12Z"/>' +
            '<g class="sc-tavern__bottles">' +
            '<path d="M20 34h16v36H18V45l5-5v-6Z"/><path d="M49 20h13v50H47V32l4-4v-8Z"/>' +
            '<path d="M75 39h20v31H73V47l6-4v-4Z"/><path d="M111 27h15v43h-17V39l4-4v-8Z"/>' +
            '<path d="M143 35h22v35h-24V45l6-4v-6Z"/>' +
            '</g>' +
            '<g class="sc-tavern__herbs">' +
            '<path d="M42 0v26M39 4q-15 9 0 17M45 7q15 8 0 16"/>' +
            '<path d="M130-3v31M126 2q-16 8 0 18M134 4q16 9 0 20"/>' +
            '</g></g>' +

            // Coin droit : tableau des brassins et trophée de chasse stylisé.
            '<g class="sc-tavern__board" transform="translate(735 148)">' +
            '<path d="M0 0h116v112H0Z"/><path class="sc-tavern__board-frame" d="M0 0h116v112H0Z"/>' +
            '<path class="sc-tavern__chalk" d="M17 22h56M17 41h77M17 60h64M17 79h72"/>' +
            '<circle class="sc-tavern__chalk-dot" cx="94" cy="22" r="3"/>' +
            '<circle class="sc-tavern__chalk-dot" cx="83" cy="60" r="3"/></g>' +
            '<g class="sc-tavern__crest" transform="translate(891 158)">' +
            '<path d="M0 16 24 0l24 16-5 52-19 15L5 68Z"/>' +
            '<path class="sc-tavern__antler" d="M17 38q-15-14-9-27m8 18L5 23m26 15q15-14 9-27m-8 18 11-6"/>' +
            '<circle cx="24" cy="42" r="10"/></g>' +

            // Petit foyer latéral, loin du joueur : seulement deux flammes.
            '<g class="sc-tavern__hearth" transform="translate(18 268)">' +
            '<path class="sc-tavern__hearth-stone" d="M0 58V8Q0 0 8 0h86q8 0 8 8v50H86V18H16v40Z"/>' +
            '<path class="sc-tavern__hearth-dark" d="M16 58V18h70v40Z"/>' +
            '<path class="sc-tavern__log" d="M25 51 72 38l4 8-48 13Z"/>' +
            '<path class="sc-tavern__fire sc-tavern__fire--a" d="M48 50q-18-18 1-37-3 17 9 22 9-15 16-20 6 23-10 35Z"/>' +
            '<path class="sc-tavern__fire sc-tavern__fire--b" d="M52 51q-8-12 5-24-1 10 6 14 5-9 8-11 3 13-6 21Z"/></g>' +

            // Tapis central : masse colorée fixe, quasiment gratuite à rendre.
            '<path class="sc-tavern__rug-shadow" d="M255 448Q480 405 705 448L664 542H296Z"/>' +
            '<path class="sc-tavern__rug" d="M271 451Q480 415 689 451L651 531H309Z"/>' +
            '<path class="sc-tavern__rug-line" d="M318 470Q480 441 642 470M335 503Q480 478 625 503"/>' +

            // Lustres simples : lumière réelle portée par les halos existants.
            '<g class="sc-tavern__chandelier" transform="translate(258 100)">' +
            '<path d="M0 0v50m-38 7q38 17 76 0M-38 57v19m76-19v19"/>' +
            '<path class="sc-tavern__candle" d="M-43 76h10v24h-10Zm76 0h10v24H33Z"/>' +
            '<ellipse class="sc-tavern__flame" cx="-38" cy="72" rx="4" ry="8"/><ellipse class="sc-tavern__flame" cx="38" cy="72" rx="4" ry="8"/></g>' +
            '<g class="sc-tavern__chandelier" transform="translate(700 94)">' +
            '<path d="M0 0v48m-35 7q35 16 70 0M-35 55v18m70-18v18"/>' +
            '<path class="sc-tavern__candle" d="M-40 73h10v24h-10Zm70 0h10v24H30Z"/>' +
            '<ellipse class="sc-tavern__flame" cx="-35" cy="69" rx="4" ry="8"/><ellipse class="sc-tavern__flame" cx="35" cy="69" rx="4" ry="8"/></g>' +
            '</g>';
    }

    function taverne(state) {
        var offres = state.tavernCounter || [];
        var room = state.tavernRoom;
        var people = room && room.players || [];
        var occupied = {};
        people.forEach(function (person) { if (person.seatKey) occupied[person.seatKey] = true; });

        var zinc = comptoir();
        var chopes = '';
        if (offres.length) {
            var largeur = Math.min(150, 620 / offres.length);
            offres.slice(0, 6).forEach(function (offre, i) {
                var n = Math.min(offres.length, 6);
                var x = STAGE_WIDTH / 2 + (i - (n - 1) / 2) * largeur;
                chopes += chopeNode(offre, x, 342, Math.min(1.15, largeur / 118), largeur - 8);
            });
        }

        var places = room ? Object.keys(TAVERN_SEATS).map(function (key) {
            return placeNode(key, occupied[key]);
        }).join('') : '';

        var patrons = room ? '<g class="sc-tavern__patrons">' + people.map(function (person) {
            return patronNode(person, room);
        }).join('') + '</g>' : '';

        return defs() + painted('taverne') +
            '<rect class="sc-dusk sc-dusk--tavern" width="' + STAGE_WIDTH + '" height="' + STAGE_HEIGHT + '"/>' +
            floor(336, 'cellar') + tavernInteriorDecor() +
            '<g class="sc-lanterns">' +
            '<ellipse cx="150" cy="150" rx="104" ry="92" fill="url(#sc-halo)"/>' +
            '<ellipse cx="812" cy="138" rx="94" ry="82" fill="url(#sc-halo)"/>' +
            '<ellipse cx="480" cy="250" rx="150" ry="70" fill="url(#sc-halo)"/>' +
            '</g>' +
            '<path class="sc-tavern__lightbeam" d="M885 130 960 155 760 520 615 520Z"/>' +
            '<g class="sc-tavern__embers">' +
            '<circle cx="65" cy="400" r="2"/><circle cx="82" cy="424" r="1.6"/><circle cx="52" cy="448" r="1.4"/>' +
            '</g>' +
            '<rect class="sc-tavern__walk" x="54" y="352" width="852" height="188" rx="28"/>' +
            '<g class="sc-tavern__cursor"><circle r="13"/><circle class="sc-tavern__cursor-core" r="3"/></g>' +
            '<g class="sc-tavern__beams"><path d="M0 102h960v18H0ZM112 0h18v252H112ZM824 0h18v252h-18Z"/></g>' +
            '<g class="sc-tavern__sign"><path d="M402 160q78-20 156 0l-8 62q-70 18-140 0Z"/>' +
            '<text x="480" y="190">MJÖDHEIM</text><text class="sc-tavern__sign-small" x="480" y="210">TAVERNE DU FJORD</text></g>' +
            zinc + barman() + tables() + places + patrons + chopes + light() +
            (!room ? '<text class="sc-salle__vide" x="480" y="292">Entre dans une salle pour retrouver les autres brasseurs.</text>' : '') +
            (room && !people.some(function (p) { return p.seatKey; })
                ? '<text class="sc-salle__vide" x="480" y="292">Choisis une chaise éclairée : cette place sera la tienne.</text>' : '');
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

        [145, 340, 620, 815].forEach(function (x) {
            out += futCouche(x, 222, 0.92);
        });

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
    /**
     * Coupe un libellé en lignes qui tiennent dans la place de son objet.
     *
     * <p>Cinq chopes au comptoir, c'est cent vingt unités chacune : un nom
     * de recette en entier débordait sur la voisine et les cinq finissaient
     * en une seule ligne illisible. On compte large (une lettre, un peu plus
     * d'une demi-hauteur de police) et on coupe aux mots.
     */
    function lignes(texte, largeur, taille, max) {
        var parLigne = Math.max(4, Math.floor(largeur / (taille * 0.56)));
        var mots = String(texte || '').split(/\s+/).filter(Boolean);
        var out = [];
        var courante = '';
        mots.forEach(function (mot) {
            var essai = courante ? courante + ' ' + mot : mot;
            if (essai.length <= parLigne || !courante) { courante = essai; }
            else { out.push(courante); courante = mot; }
        });
        if (courante) out.push(courante);
        if (out.length > max) {
            out = out.slice(0, max);
            out[max - 1] = out[max - 1] + '…';
        }
        return out.map(function (l) { return l.length > parLigne ? l.slice(0, parLigne - 1) + '…' : l; });
    }

    function texteEnLignes(classe, x, y, pas, contenu) {
        return '<text class="' + classe + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '">' +
            contenu.map(function (l, i) {
                return '<tspan x="' + x.toFixed(1) + '" dy="' + (i ? pas : 0) + '">' + esc(l) + '</tspan>';
            }).join('') + '</text>';
    }

    function chopeNode(offre, x, y, scale, place) {
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

            (function () {
                var nom = lignes(offre.recipeName, place, 15, 2);
                var basNom = y + 26 + (nom.length - 1) * 17;
                var prix = offre.price ? offre.price + ' pièces' : 'offert';
                return texteEnLignes('sc-chope__nom', x, y + 26, 17, nom) +
                    texteEnLignes('sc-chope__hote', x, basNom + 17, 15,
                        [prix].concat(lignes(mienne ? 'à toi' : offre.seller, place, 12, 1)));
            })() +
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
     * Une réserve se regarde, elle ne se lit pas. Chaque matière y est posée
     * avec son illustration — le sac de grain, le pot de miel, le cône de
     * houblon, la goutte d'eau — sur trois planches d'étagère. On ne clique
     * sur rien : une réserve n'est pas un menu, c'est un état des lieux.
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
                objets += contenant(item, x, planche.y, planche.k, ep);
            });
        });

        return defs() + painted('entrepot') +
            '<rect class="sc-dusk" width="' + STAGE_WIDTH + '" height="' + STAGE_HEIGHT + '"/>' +
            bati +
            '<g class="sc-lanterns"><ellipse cx="480" cy="168" rx="240" ry="92" fill="url(#sc-halo)"/></g>' +
            bois + objets + light();
    }

    /** La forme sous laquelle on range chaque matière. */
    function contenant(item, x, y, k, epaisseur) {
        var type = item.type || 'OTHER';
        var sous = y + (epaisseur || 14) + 16 * k;
        // Les mêmes illustrations que dans les listes et le bandeau : le sac
        // d'orge du rayon est celui qu'on voit en haut de l'écran. Le
        // document porte la planche de dessins, le décor s'en sert.
        var connu = ['CEREAL', 'HONEY', 'HOP', 'HERB', 'FRUIT', 'SPICE', 'YEAST', 'WATER'].indexOf(type) >= 0;
        var cote = 78 * k;
        var corps = '<use class="sc-stock__art" href="#art-' + (connu ? type : 'OTHER') + '"' +
            ' x="' + (x - cote / 2).toFixed(1) + '" y="' + (y - cote + 5 * k).toFixed(1) + '"' +
            ' width="' + cote.toFixed(1) + '" height="' + cote.toFixed(1) + '"/>';

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
            var room = state.tavernRoom;
            var people = room && room.players || [];
            var messages = room && room.messages || [];
            return (room ? room.id : 'lobby') + '::' +
                people.map(function (p) {
                    return p.playerId + ':' + (p.seatKey || '-') + ':' + Number(p.x || 0).toFixed(1) + ':' +
                        Number(p.y || 0).toFixed(1) + ':' + (p.pose || '-') + ':' + (p.action || '-') + ':' +
                        (p.emote || '-') + ':' + (p.emoteAt || '-');
                }).join('|') + '::' +
                messages.slice(-8).map(function (m) { return m.id; }).join(',') + '::' +
                (state.tavernCounter || []).map(function (o) {
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

    function sortTavernPatrons(root) {
        var group = root && root.querySelector('.sc-tavern__patrons');
        if (!group) return;
        Array.from(group.querySelectorAll('.sc-patron'))
            .sort(function (a, b) { return Number(a.dataset.y || 0) - Number(b.dataset.y || 0); })
            .forEach(function (node) { group.appendChild(node); });
    }

    function movePatron(root, person, localPrediction) {
        if (!root || !person) return 0;
        var node = root.querySelector('.sc-patron[data-id="' + person.playerId + '"]');
        if (!node) return 0;

        var target = normalizeTavernPoint(person.x, person.y);
        var bodyScale = Number(node.dataset.bodyScale || 1);
        var targetScale = tavernScale(target.y, bodyScale, person.seatKey);
        var fromX = Number(node._brewX == null ? node.dataset.x : node._brewX);
        var fromY = Number(node._brewY == null ? node.dataset.y : node._brewY);
        var fromK = Number(node._brewK == null ? node.dataset.k : node._brewK);
        var distance = Math.hypot(target.x - fromX, (target.y - fromY) * 1.35);
        var duration = document.documentElement.dataset.mouvement === 'sobre'
            ? 0 : clamp(distance * 3.25, 170, 1350);

        if (node._brewFrame) cancelAnimationFrame(node._brewFrame);
        node.dataset.x = target.x;
        node.dataset.y = target.y;
        node.dataset.k = targetScale.toFixed(3);
        node.dataset.facing = person.facing || node.dataset.facing || 'LEFT';
        node.dataset.pose = person.pose || 'STANDING';
        node.classList.toggle('is-walking', duration > 0 && person.pose !== 'SEATED');

        function paint(x, y, k) {
            node._brewX = x; node._brewY = y; node._brewK = k;
            node.setAttribute('transform', 'translate(' + x.toFixed(2) + ' ' + y.toFixed(2) + ') scale(' + k.toFixed(4) + ')');
        }

        if (!duration) {
            paint(target.x, target.y, targetScale);
            node.classList.remove('is-walking');
            sortTavernPatrons(root);
            return 0;
        }

        var started = performance.now();
        function frame(now) {
            var t = Math.min(1, (now - started) / duration);
            var ease = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            paint(
                fromX + (target.x - fromX) * ease,
                fromY + (target.y - fromY) * ease,
                fromK + (targetScale - fromK) * ease
            );
            if (t < 1) node._brewFrame = requestAnimationFrame(frame);
            else {
                node._brewFrame = null;
                node.classList.remove('is-walking');
                sortTavernPatrons(root);
            }
        }
        node._brewFrame = requestAnimationFrame(frame);
        return duration;
    }

    function animateDrink(root, playerId, drinkName) {
        if (!root) return;
        var node = root.querySelector('.sc-patron[data-id="' + playerId + '"]');
        if (!node) return;
        node.classList.remove('is-drinking');
        // Forcer le navigateur à constater le retrait pour rejouer l'animation.
        void node.getBoundingClientRect();
        node.classList.add('is-drinking');
        node.setAttribute('aria-label', (node.getAttribute('aria-label') || '') + ' — boit ' + (drinkName || 'une pinte'));
        clearTimeout(node._drinkTimer);
        node._drinkTimer = setTimeout(function () { node.classList.remove('is-drinking'); }, 1700);
    }

    function showTavernDestination(root, x, y) {
        if (!root) return;
        var cursor = root.querySelector('.sc-tavern__cursor');
        if (!cursor) return;
        cursor.setAttribute('transform', 'translate(' + x + ' ' + y + ')');
        cursor.classList.remove('is-active');
        void cursor.getBoundingClientRect();
        cursor.classList.add('is-active');
        clearTimeout(cursor._hideTimer);
        cursor._hideTimer = setTimeout(function () { cursor.classList.remove('is-active'); }, 650);
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

        if (place === 'taverne') {
            var now = Date.now();
            root.querySelectorAll('.sc-speech[data-until], .sc-patron__emote[data-until]').forEach(function (node) {
                if (Number(node.dataset.until) < now) node.style.opacity = '0';
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
        tick: tick,
        tavernPoint: tavernPoint,
        normalizeTavernPoint: normalizeTavernPoint,
        movePatron: movePatron,
        animateDrink: animateDrink,
        showTavernDestination: showTavernDestination
    };
})(window);
