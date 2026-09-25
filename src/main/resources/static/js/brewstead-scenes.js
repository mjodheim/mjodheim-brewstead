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
     * La salle de la taverne.
     *
     * <p>Elle était reconstruite en formes SVG par-dessus une vignette de la
     * carte : lambris, étagères, fûts, lustres, tables, barman, tout en
     * tracés. C'est maintenant une peinture, posée en image dans la page, et
     * les joueurs par-dessus. Une image fixe ne coûte rien à chaque image
     * affichée ; les tracés animés, eux, se repeignaient sans cesse.
     *
     * <p>Les habitués peints (Sigrid, Bjarne, Ylva, Leif, Torvald, Runa) sont
     * des personnages de la maison : on leur parle. Les joueurs se tiennent
     * dans l'allée qui longe le comptoir, ou sur ses tabourets libres. Tout
     * ce qui est devant l'allée — tables, habitués, bancs — est redessiné
     * par-dessus eux, découpé dans la même peinture : celui qui passe
     * derrière une table est caché par elle, comme dans une vraie salle.
     *
     * <p>Les coordonnées sont celles de la peinture (1672 × 708) et celles
     * des pieds ; le serveur utilise les mêmes.
     */
    var TV_W = 1672;
    var TV_H = 708;
    var TV_ALLEE = { x0: 520, x1: 1240, y0: 478, y1: 545 };
    var TV_SPAWN = { x: 1135, y: 520 };

    /** Les tabourets libres du comptoir et quelques places debout. */
    var TAVERN_SEATS = {
        'bar-gauche': { x: 552, y: 502, k: 1.46, face: 'droite' },
        'bar-droite': { x: 642, y: 502, k: 1.46, face: 'droite' },
        'table-gauche-a': { x: 868, y: 500, k: 1.45, face: 'gauche' },
        'table-gauche-b': { x: 1060, y: 500, k: 1.45, face: 'gauche' },
        'table-droite-a': { x: 1188, y: 504, k: 1.46, face: 'gauche' },
        'table-droite-b': { x: 760, y: 538, k: 1.54, face: 'droite' },
        'feu-gauche': { x: 528, y: 530, k: 1.52, face: 'droite' },
        'feu-droite': { x: 1226, y: 540, k: 1.54, face: 'gauche' }
    };

    /**
     * Ce qui se tient devant l'allée, découpé dans la peinture. Les contours
     * suivent les têtes des habitués et le bord des tables ; ils n'ont pas
     * besoin d'être fins, seulement de passer devant qui marche derrière.
     */
    var TV_AVANT = [
        '0,380 120,380 170,372 240,392 300,392 330,390 420,392 470,428 505,470 512,560 600,600 600,708 0,708',
        '676,480 700,440 745,420 820,408 872,438 905,394 1000,386 1062,414 1118,466 1150,540 1210,610 1210,708 640,708 640,610 676,560',
        '1204,470 1300,466 1318,402 1400,384 1468,418 1500,398 1600,392 1672,418 1672,708 1204,708'
    ];

    /** Les habitués peints : où cliquer, et où poser leur pastille. */
    var TV_HABITUES = [
        { key: 'sigrid', tete: [185, 385], zone: [185, 470, 80, 92] },
        { key: 'bjarne', tete: [392, 392], zone: [400, 480, 96, 100] },
        { key: 'ylva', tete: [800, 408], zone: [792, 500, 80, 92] },
        { key: 'leif', tete: [985, 390], zone: [1000, 490, 96, 100] },
        { key: 'torvald', tete: [1385, 385], zone: [1385, 500, 86, 100] },
        { key: 'runa', tete: [1560, 395], zone: [1560, 500, 80, 92] }
    ];

    /** Les lueurs qui vacillent : bougies, lanternes, cheminée. En % de la peinture. */
    var TV_LUEURS = [
        { x: 2.2, y: 44, t: 11, d: 2.6 },   // cheminée
        { x: 36.8, y: 16, t: 7, d: 3.4 },   // lanterne gauche
        { x: 63.4, y: 16, t: 7, d: 3.9 },   // lanterne droite
        { x: 15.8, y: 75, t: 6, d: 2.9 },   // bougie de Sigrid
        { x: 54.7, y: 77, t: 7, d: 3.1 },   // bougie du centre
        { x: 52.2, y: 64, t: 4, d: 2.4 },   // bougies derrière Ylva
        { x: 88.8, y: 67, t: 5, d: 3.6 },   // bougies de Runa
        { x: 83.8, y: 10, t: 6, d: 4.3 }    // lustre de droite
    ];

    /** Les chopes du comptoir, de la plus proche du barman à la plus loin. */
    var CHOPE_PLACES = [700, 1000, 610, 1090, 520, 1180];
    var CHOPE_Y = 352;

    function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    function normalizeTavernPoint(x, y) {
        x = clamp(Number.isFinite(Number(x)) ? Number(x) : TV_SPAWN.x, TV_ALLEE.x0, TV_ALLEE.x1);
        y = clamp(Number.isFinite(Number(y)) ? Number(y) : TV_SPAWN.y, TV_ALLEE.y0, TV_ALLEE.y1);
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

    /** La taille d'un personnage : un peu plus grand qui s'approche. */
    function tavernScale(y, bodyScale, seatKey) {
        if (seatKey && TAVERN_SEATS[seatKey]) return TAVERN_SEATS[seatKey].k * bodyScale;
        var depth = 1.42 + ((clamp(y, TV_ALLEE.y0, TV_ALLEE.y1) - TV_ALLEE.y0) / (TV_ALLEE.y1 - TV_ALLEE.y0)) * .14;
        return depth * bodyScale;
    }

    /**
     * L'adresse de la peinture. Le serveur la donne à la page, avec
     * l'empreinte de son contenu que ce script ne sait pas calculer.
     */
    function peintureTaverne() {
        var carte = global.document && global.document.getElementById('worldArt');
        return (carte && carte.getAttribute('data-taverne')) || '/images/lieux/taverne-salle.webp';
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

    /**
     * La coiffure, en deux temps : ce qui passe derrière la tête (cheveux
     * longs, tresse) et ce qui la couvre. Du volume et une mèche claire,
     * comme les habitués peints ; un simple bandeau faisait casquette.
     */
    function cheveux(style, color, devant) {
        var c = ' class="sc-patron__hair" fill="' + color + '"';
        if (!devant) {
            if (style === 'long') return '<path' + c + ' d="M-27-52q-3 30 2 44l10 2 1-30M27-52q3 30-2 44l-10 2-1-30Z"/>';
            if (style === 'tresse') return '<path' + c + ' d="M18-40q12 8 10 30-2 14-8 18l-5-3q5-8 4-17-2-14-7-22Z"/>' +
                '<circle class="sc-patron__hair-noeud" cx="21" cy="7" r="3.2"/>';
            return '';
        }
        if (style === 'rase') return '<path' + c + ' d="M-25-54q0-22 25-22t25 22q-10-8-25-9-15 1-25 9Z"/>';
        if (style === 'boucles') return '<path' + c + ' d="M-28-50q-6-10 1-17-2-11 10-13 6-9 17-5 11-4 17 6 11 2 10 13 7 7 1 17-5-9-12-10-6 6-16 3-10 4-17-2-8 1-11 8Z"/>' +
            '<path class="sc-patron__hair-reflet" d="M-12-70q8-5 16-3"/>';
        if (style === 'long' || style === 'tresse') return '<path' + c + ' d="M-27-48q-2-30 27-30t27 30q-6-14-17-16-8 8-26 8-9 2-11 8Z"/>' +
            '<path class="sc-patron__hair-reflet" d="M-14-70q10-5 20-3"/>';
        return '<path' + c + ' d="M-26-50q-2-28 26-28t26 28q-4-12-12-15-8 6-24 5-12 1-16 10Z"/>' +
            '<path class="sc-patron__hair-reflet" d="M-13-70q9-5 19-3"/>';
    }

    function patronNode(person, room) {
        var seated = !!(person.seatKey && TAVERN_SEATS[person.seatKey]);
        var seat = seated ? TAVERN_SEATS[person.seatKey] : null;
        var pos = seated
            ? { x: seat.x, y: seat.y }
            : normalizeTavernPoint(person.x == null ? TV_SPAWN.x : person.x, person.y == null ? TV_SPAWN.y : person.y);
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
            ? '<path class="sc-patron__apron" d="M-15-12h30l3 40q-18 5-36 0Z"/>'
            : outfit === 'marchand'
                ? '<path class="sc-patron__vest" d="M-24-20l10-4 14 20 14-20 10 4 4 46h-56Z"/>'
                : '';

        var bubble = '';
        if (speech) {
            var words = lignes(speech.body, 164, 14, 3);
            // La bulle laissait l'équivalent de deux lignes vides sous le
            // texte : elle s'arrête maintenant à ce qu'elle contient.
            var h = 2 + words.length * 17;
            // Deux groupes : la position sur l'un, l'animation d'apparition
            // sur l'autre. Sur un seul, la transformation CSS de l'animation
            // remplaçait le décalage, et la bulle retombait sur le ventre de
            // celui qui parle.
            bubble = '<g transform="translate(0 ' + (-142 - h) + ')">' +
                '<g class="sc-speech" data-until="' + speechUntil + '">' +
                '<path class="sc-speech__box" d="M-92 0q0-12 12-12h160q12 0 12 12v' + h + 'q0 12-12 12h-69l-13 15-2-15h-76q-12 0-12-12Z"/>' +
                texteEnLignes('sc-speech__text', 0, 12, 17, words) + '</g></g>';
        }

        return '<g class="sc-node sc-patron' + speakClass + selfClass + drinkClass + '" data-id="' + person.playerId +
            '" data-action="tavern-player" data-x="' + pos.x + '" data-y="' + pos.y + '" data-k="' + scale.toFixed(3) +
            '" data-body-scale="' + bodyScale + '" data-facing="' + facing + '" data-pose="' + pose +
            '" tabindex="0" role="button" aria-label="' + esc(person.name) + '"' +
            ' transform="translate(' + pos.x + ' ' + pos.y + ') scale(' + scale.toFixed(3) + ')">' +
            // L'origine du personnage est à ses pieds, là où le serveur le
            // place ; le dessin, lui, est centré sur le buste.
            '<g transform="translate(0 -78)">' +
            '<ellipse class="sc-patron__shadow" cx="0" cy="76" rx="32" ry="8"/>' +
            '<g class="sc-patron__figure">' +
            '<g class="sc-patron__body">' +
            '<path class="sc-patron__legs" d="M-17 24h13l-1 44h-12ZM4 24h13l-1 44H5Z"/>' +
            '<path class="sc-patron__boot" d="M-19 64h17v12q-14 3-21-1-1-7 4-11ZM2 64h17q6 4 4 11-8 3-21 1Z"/>' +
            '<g class="sc-patron__arm sc-patron__arm--left"><path fill="' + palette[1] + '" d="M-22-16q-14 8-15 30l11 3q1-16 10-24Z"/>' +
            '<circle class="sc-patron__hand" cx="-31" cy="18" r="6.5"/></g>' +
            '<path class="sc-patron__torso" fill="' + palette[1] + '" d="M-24-22q24-10 48 0l6 50q-30 9-60 0Z"/>' +
            '<path class="sc-patron__shade" fill="' + palette[0] + '" d="M-24-22q7 2 9 9l-4 43q-8 0-11-2Z"/>' +
            '<path class="sc-patron__highlight" fill="' + palette[2] + '" d="M12-20q9 2 12 7l3 30q-6 3-11 3Z"/>' +
            apron +
            '<path class="sc-patron__belt" d="M-28 12q28 6 56 0v8q-28 6-56 0Z"/>' +
            '<rect class="sc-patron__buckle" x="-5" y="12" width="10" height="10" rx="2"/>' +
            '<path class="sc-patron__fur" d="M-27-20q-3-8 5-10 4-6 11-4 5-5 11-1 6-4 11 1 7-2 11 4 8 2 5 10-8 9-27 11-19-2-29-11Z"/>' +
            '<g class="sc-patron__arm sc-patron__arm--right"><path fill="' + palette[1] + '" d="M22-16q14 8 16 27l-11 4q-2-13-9-20Z"/>' +
            '<circle class="sc-patron__hand" cx="32" cy="15" r="6.5"/>' +
            '<g class="sc-patron__mug" transform="translate(40 9)"><path d="M-7-11h14v21H-6Z"/><path d="M7-7q10 2 3 12" fill="none"/>' +
            '<ellipse class="sc-patron__foam" cx="0" cy="-11" rx="7.5" ry="3.2"/></g></g>' +
            '</g>' +
            '<g class="sc-patron__head">' +
            cheveux(person.character && person.character.hair, hc, false) +
            '<path class="sc-patron__neck" d="M-7-30h14v10H-7Z"/>' +
            '<circle class="sc-patron__ear" cx="-25" cy="-48" r="5"/><circle class="sc-patron__ear" cx="25" cy="-48" r="5"/>' +
            '<ellipse class="sc-patron__face" cx="0" cy="-49" rx="25" ry="24"/>' +
            '<ellipse class="sc-patron__joue" cx="-14" cy="-40" rx="5.5" ry="3.4"/>' +
            '<ellipse class="sc-patron__joue" cx="14" cy="-40" rx="5.5" ry="3.4"/>' +
            '<ellipse class="sc-patron__oeil" cx="-9" cy="-50" rx="3.4" ry="4.4"/>' +
            '<ellipse class="sc-patron__oeil" cx="9" cy="-50" rx="3.4" ry="4.4"/>' +
            '<circle class="sc-patron__reflet" cx="-8" cy="-52" r="1.3"/><circle class="sc-patron__reflet" cx="10" cy="-52" r="1.3"/>' +
            '<path class="sc-patron__brows" d="M-14-58q5-3 9 0m10 0q4-3 9 0"/>' +
            '<path class="sc-patron__nose" d="M0-46q3 3-1 5"/>' +
            '<path class="sc-patron__mouth" d="M-6-37q6 5 12 0"/>' +
            (((Number(person.playerId) || 0) % 3 === 0)
                ? '<path class="sc-patron__beard" fill="' + hc + '" d="M-20-42q4 8 10 7 5-4 10-4t10 4q6 1 10-7-1 22-20 26-19-4-20-26Z"/>'
                : '') +
            cheveux(person.character && person.character.hair, hc, true) +
            (person.character && person.character.accessory === 'broche' ? '<circle class="sc-patron__broche" cx="17" cy="-14" r="4"/>' : '') +
            '</g></g>' +
            // Le nom au-dessus de la tête : sous les pieds, il sortait de la
            // scène avec eux et se perdait dans les tables du premier plan.
            texteEnLignes('sc-patron__name' + (person.self ? ' sc-patron__name--self' : ''), 0, -86, 14, name) +
            (emote ? '<text class="sc-patron__emote" data-until="' + emoteUntil + '" x="38" y="-58">' + emote + '</text>' : '') +
            bubble +
            hit(0, -80, 76, 160) +
            '</g></g>';
    }

    /**
     * Une place libre, en deux calques : l'anneau au sol passe sous les
     * joueurs, le bouton au-dessus de tout. D'une pièce, la place
     * disparaissait sous quiconque se tenait dessus — à commencer par le
     * nouveau venu, qui apparaît dans l'allée entre les chaises — et plus
     * personne ne pouvait s'y asseoir.
     */
    function placeSol(key, occupied) {
        var seat = TAVERN_SEATS[key];
        if (!seat || occupied) return '';
        return '<ellipse class="sc-seat__ring" cx="' + seat.x + '" cy="' + seat.y + '" rx="34" ry="11"/>';
    }

    function placeNode(key, occupied) {
        var seat = TAVERN_SEATS[key];
        if (!seat || occupied) return '';
        return '<g class="sc-node sc-seat" data-action="tavern-seat" data-id="' + key +
            '" tabindex="0" role="button" aria-label="S’installer : ' + esc(key.replace(/-/g, ' ')) +
            '" transform="translate(' + seat.x + ' ' + seat.y + ')">' +
            '<circle class="sc-seat__pastille" cx="0" cy="-26" r="15"/>' +
            '<text class="sc-seat__plus" x="0" y="-19">+</text>' + hit(0, -48, 76, 62) + '</g>';
    }

    /**
     * Un habitué peint, en deux calques.
     *
     * <p>Son corps se touche aussi, mais sous les places libres et les
     * joueurs : posé par-dessus, le corps d'Ylva avalait le clic de la place
     * voisine, et on ne pouvait plus s'asseoir à côté d'elle. La pastille,
     * elle, reste au-dessus de tout.
     */
    function habitueNom(spot, nom) {
        var w = nom.length * 8 + 22;
        return '<g class="tv-habitue__nom" transform="translate(' + spot.tete[0] + ' ' + (spot.tete[1] - 62) + ')">' +
            '<rect x="' + (-w / 2) + '" y="-14" width="' + w + '" height="26" rx="9"/>' +
            '<text y="5">' + esc(nom) + '</text></g>';
    }

    function nomHabitue(spot, regular) {
        return regular ? regular.name : spot.key.charAt(0).toUpperCase() + spot.key.slice(1);
    }

    function habitueCorps(spot, regular) {
        var z = spot.zone;
        return '<g class="tv-habitue" data-action="tavern-regular" data-id="' + spot.key + '" aria-hidden="true">' +
            '<ellipse class="tv-habitue__zone" cx="' + z[0] + '" cy="' + z[1] + '" rx="' + z[2] + '" ry="' + z[3] + '"/>' +
            habitueNom(spot, nomHabitue(spot, regular)) + '</g>';
    }

    function habitueNode(spot, regular) {
        var nom = nomHabitue(spot, regular);
        var attend = regular && regular.request && !regular.request.done;
        return '<g class="sc-node tv-habitue' + (attend ? ' is-attend' : '') + '" data-action="tavern-regular" data-id="' +
            spot.key + '" tabindex="0" role="button" aria-label="' + esc(nom) +
            (attend ? ', attend une chope' : ', parler') + '">' +
            '<g class="tv-habitue__pastille" transform="translate(' + spot.tete[0] + ' ' + (spot.tete[1] - 26) + ')">' +
            '<rect x="-17" y="-15" width="34" height="30" rx="12"/>' +
            '<path d="M-5 13l5 9 5-9Z"/>' +
            '<text y="7">' + (attend ? '!' : '…') + '</text></g>' +
            habitueNom(spot, nom) +
            '</g>';
    }

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

    /**
     * Une chope posée sur le comptoir.
     *
     * <p>Elle ne porte que son prix sur une étiquette ; le nom se lit au
     * survol et en entier dans l'intitulé, et le journal donne le détail.
     */
    function chopeNode(offre, x, y) {
        var mienne = !!offre.mine;
        var k = .95;
        var h = 64 * k;
        var w = 42 * k;
        var top = y - h;
        // Une pièce dessinée et un chiffre : « 4 pièces » en toutes lettres
        // prenait la largeur de la chope et les étiquettes se touchaient.
        var payante = !mienne && !!offre.price;
        var prix = mienne ? 'à toi' : (payante ? String(offre.price) : 'offert');
        var largeurPrix = Math.max(40, prix.length * 7.6 + (payante ? 34 : 20));
        var nom = lignes(offre.recipeName, 170, 13, 1)[0] || '';
        var largeurNom = Math.max(60, nom.length * 7 + 24);

        return '<g class="sc-node sc-chope" data-state="' + (mienne ? 'mine' : 'ready') + '"' +
            ' data-id="' + offre.id + '"' +
            (mienne ? '' : ' data-action="serve-offer" tabindex="0" role="button"') +
            ' aria-label="' + esc(offre.recipeName || 'Une chope') +
            (mienne ? ' — ton fût' : ', servi par ' + esc(offre.seller || '') + ', ' +
                (payante ? prix + ' pièces' : prix)) + '">' +
            '<path class="sc-chope__body" d="M' + (x - w / 2).toFixed(1) + ' ' + top.toFixed(1) +
            'h' + w.toFixed(1) + 'l' + (-w * 0.08).toFixed(1) + ' ' + h.toFixed(1) +
            'h' + (-w * 0.84).toFixed(1) + 'Z"/>' +
            '<path class="sc-chope__biere" d="M' + (x - w * 0.42).toFixed(1) + ' ' + (top + h * 0.26).toFixed(1) +
            'h' + (w * 0.84).toFixed(1) + 'l' + (-w * 0.06).toFixed(1) + ' ' + (h * 0.7).toFixed(1) +
            'h' + (-w * 0.72).toFixed(1) + 'Z"/>' +
            '<ellipse class="sc-chope__mousse" cx="' + x + '" cy="' + (top + h * 0.2).toFixed(1) +
            '" rx="' + (w * 0.46).toFixed(1) + '" ry="' + (h * 0.13).toFixed(1) + '"/>' +
            '<path class="sc-chope__anse" d="M' + (x + w * 0.46).toFixed(1) + ' ' + (top + h * 0.3).toFixed(1) +
            'q' + (w * 0.5).toFixed(1) + ' ' + (h * 0.2).toFixed(1) + ' 0 ' + (h * 0.42).toFixed(1) + '"/>' +
            '<g class="sc-chope__prix" transform="translate(' + x + ' ' + (top - 16).toFixed(1) + ')">' +
            '<rect x="' + (-largeurPrix / 2).toFixed(1) + '" y="-11" width="' + largeurPrix.toFixed(1) + '" height="22" rx="11"/>' +
            (payante
                ? '<circle class="sc-chope__piece" cx="' + (-largeurPrix / 2 + 12).toFixed(1) + '" r="7"/>' +
                  '<text x="7" y="5">' + esc(prix) + '</text>'
                : '<text y="5">' + esc(prix) + '</text>') +
            '</g>' +
            '<g class="sc-chope__etiquette" transform="translate(' + x + ' ' + (top - 44).toFixed(1) + ')">' +
            '<rect x="' + (-largeurNom / 2).toFixed(1) + '" y="-12" width="' + largeurNom.toFixed(1) + '" height="24" rx="8"/>' +
            '<text y="5">' + esc(nom) + '</text></g>' +
            hit(x, top - 30, w * 2.2, h + 34) +
            '</g>';
    }

    /** Le contenu de la scène : la couche SVG posée sur la peinture. */
    function taverne(state) {
        var offres = state.tavernCounter || [];
        var room = state.tavernRoom;
        var people = room && room.players || [];
        var regulars = {};
        (state.tavernRegulars || []).forEach(function (r) { regulars[r.key] = r; });
        var occupied = {};
        people.forEach(function (person) { if (person.seatKey) occupied[person.seatKey] = true; });

        var chopes = offres.slice(0, CHOPE_PLACES.length).map(function (offre, i) {
            return chopeNode(offre, CHOPE_PLACES[i], CHOPE_Y);
        }).join('');

        var sols = room ? Object.keys(TAVERN_SEATS).map(function (key) {
            return placeSol(key, occupied[key]);
        }).join('') : '';
        var places = room ? Object.keys(TAVERN_SEATS).map(function (key) {
            return placeNode(key, occupied[key]);
        }).join('') : '';

        var patrons = room ? people.map(function (person) { return patronNode(person, room); }).join('') : '';

        var avant = '<defs><clipPath id="tv-avant-decoupe">' +
            TV_AVANT.map(function (points) { return '<polygon points="' + points + '"/>'; }).join('') +
            '</clipPath></defs>' +
            '<image class="tv-avant" href="' + esc(peintureTaverne()) + '" x="0" y="0" width="' + TV_W +
            '" height="' + TV_H + '" preserveAspectRatio="none" clip-path="url(#tv-avant-decoupe)"/>';

        return '' +
            // Repères invisibles sur la peinture : l'enseigne, et le barman
            // à qui l'on commande une tournée.
            '<rect class="sc-tavern__sign" x="664" y="36" width="372" height="132"/>' +
            '<rect class="sc-node sc-barman" data-action="tavern-barman" tabindex="0" role="button"' +
            ' aria-label="Gunnar, le tavernier" x="772" y="150" width="166" height="196"/>' +
            chopes +
            // Le plancher cliquable : l'allée et un peu autour. Le point est
            // ensuite ramené dans l'allée.
            '<rect class="sc-tavern__walk" x="440" y="420" width="880" height="190" rx="24"/>' +
            '<g class="sc-tavern__cursor"><circle r="16"/><circle class="sc-tavern__cursor-core" r="4"/></g>' +
            TV_HABITUES.map(function (spot) { return habitueCorps(spot, regulars[spot.key]); }).join('') +
            '<g class="sc-tavern__sols">' + sols + '</g>' +
            '<g class="sc-tavern__patrons">' + patrons + '</g>' +
            avant +
            places +
            TV_HABITUES.map(function (spot) { return habitueNode(spot, regulars[spot.key]); }).join('');
    }

    /** La scène complète : la peinture en image, les lueurs, la couche SVG. */
    function taverneMarkup(state) {
        var src = peintureTaverne();
        var lueurs = TV_LUEURS.map(function (l) {
            return '<i style="left:' + l.x + '%;top:' + l.y + '%;--t:' + l.t + '%;--d:' + l.d + 's"></i>';
        }).join('');
        var invite = !state.tavernRoom
            ? '<p class="tv-invite">Entre dans une salle pour retrouver les autres brasseurs.</p>' : '';
        return '<div class="tv-cadre">' +
            '<div class="tv-toile">' +
            '<img class="tv-peinture" src="' + esc(src) + '" alt="" decoding="async" draggable="false">' +
            '<svg class="sc-stage sc-stage--taverne" viewBox="0 0 ' + TV_W + ' ' + TV_H + '"' +
            ' preserveAspectRatio="none" role="group" aria-label="La salle de la taverne">' + taverne(state) + '</svg>' +
            '<div class="tv-lueurs" aria-hidden="true">' + lueurs + '</div>' +
            invite +
            '</div></div>';
    }

    /**
     * Sur un écran étroit, la salle déborde et défile : on la recentre sur
     * le joueur. Sur un écran large, elle tient entière et rien ne bouge.
     */
    function recentrer(root, x, doucement) {
        var cadre = root && root.querySelector('.tv-cadre');
        var toile = cadre && cadre.querySelector('.tv-toile');
        if (!cadre || !toile || toile.offsetWidth <= cadre.clientWidth + 2) return;
        var cible = x / TV_W * toile.offsetWidth - cadre.clientWidth / 2;
        cible = clamp(cible, 0, toile.offsetWidth - cadre.clientWidth);
        if (Math.abs(cadre.scrollLeft - cible) < 4) return;
        if (doucement && cadre.scrollTo) cadre.scrollTo({ left: cible, behavior: 'smooth' });
        else cadre.scrollLeft = cible;
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
                }).join('|') + '::' +
                (state.tavernRegulars || []).map(function (r) {
                    return r.key + ':' + (r.request && r.request.done ? 'x' : 'o');
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
        if (place === 'taverne') return taverneMarkup(state);
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
        showTavernDestination: showTavernDestination,
        recentrer: recentrer
    };
})(window);
