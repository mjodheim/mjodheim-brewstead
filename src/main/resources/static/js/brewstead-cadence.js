/* ==========================================================================
   Brewstead — la cadence du décor

   Nuages, cascades, reflets, fenêtres qui respirent, repères qui battent :
   une trentaine de boucles tournent sans fin. Le navigateur les jouait à
   soixante images par seconde, chacune à son rythme, si bien que la carte
   graphique recomposait l'écran en continu. Sur une machine modeste, c'était
   tout un cœur de processeur, et l'interface ramait avec lui.

   Ici, les boucles ne bougent plus seules : elles avancent ensemble, d'un
   même pas, de six à vingt-quatre fois par seconde. Une seule image par pas
   au lieu d'une par animation et par rafraîchissement. Le pas s'adapte : si
   la machine peine à suivre, il ralentit ; si elle respire, il remonte. Et
   pendant qu'on fait glisser la carte, le décor s'arrête le temps du geste.

   Les animations qui ont une fin (un panneau qui s'ouvre, un gain qui
   s'envole) ne sont pas concernées : elles gardent toute leur fluidité.
   ========================================================================== */

(function (global) {
    'use strict';

    var PALIERS = [24, 20, 15, 12, 8, 6];  // images par seconde du décor
    var MODESTE = 2;                 // 15 images : téléphone, petit processeur
    var ECONOME = 3;                 // 12 images : le mode économe
    var BUDGET = 400;                // ms par seconde que le décor peut prendre
    var VSYNC = 1000 / 60;
    var ECHANTILLONS = 10;

    var palierMin = 0;               // le plus rapide autorisé par le réglage
    var palier = 0;
    var fige = false;
    var geste = false;
    var minuterie = null;
    var dernier = 0;
    var couts = [];
    var mesure = false;
    var suivies = typeof WeakMap === 'function' ? new WeakMap() : null;

    /**
     * Le pas propre à une animation, en plus du pas commun.
     *
     * <p>Une couche qui couvre l'écran (la pluie, la brume, les reflets de
     * la rivière) oblige à recomposer tout ce qu'il y a dessous chaque fois
     * qu'elle bouge : c'est elle qui doublait le coût d'une carte sous la
     * pluie. Elle avance donc au plus neuf fois par seconde, ce qui suffit à
     * une averse. Une animation lente (un nuage qui met trente secondes à
     * traverser) n'a besoin que de quelques pas pour paraître continue.
     */
    var GRANDE_COUCHE = 0.3;             // part de l'écran
    var PAS_GRANDE_COUCHE = 150;         // ms : une averse tombe très bien à six ou sept images
    var PAS_PAR_CYCLE_LENT = 160;
    var PAS_PAR_CYCLE_LENT_ET_GRAND = 60; // la brume : un demi-pixel par pas, trois pas par seconde

    function rythme(animation) {
        var intervalle = 0;
        try {
            var cible = animation.effect.target;
            // Sur une machine modeste, ou en mode économe, le temps qu'il
            // fait se montre sans bouger : un voile de pluie immobile dit
            // qu'il pleut, et ne coûte plus une image.
            if (palierMin >= MODESTE && cible && cible.classList && cible.classList.contains('weather')) {
                return { intervalle: Infinity, retard: 0 };
            }
            var r = cible && cible.getBoundingClientRect();
            var ecran = Math.max(1, global.innerWidth * global.innerHeight);
            var grande = !!r && r.width * r.height / ecran > GRANDE_COUCHE;
            if (grande) intervalle = PAS_GRANDE_COUCHE;
            var duree = Number(animation.effect.getTiming().duration) || 0;
            if (duree > 10000) {
                intervalle = Math.max(intervalle, duree / (grande ? PAS_PAR_CYCLE_LENT_ET_GRAND : PAS_PAR_CYCLE_LENT));
            }
        } catch (ignored) { /* cible détachée : pas commun */ }
        return { intervalle: intervalle, retard: 0 };
    }

    // Les pas d'un personnage qui marche restent à pleine cadence : ils ne
    // durent que le temps du trajet, et une démarche à quinze images par
    // seconde boite.
    var LIBRES = /^tavern-walk/;

    function sansFin(animation) {
        var effet = animation.effect;
        return !!effet && typeof effet.getTiming === 'function' && effet.getTiming().iterations === Infinity
            && !LIBRES.test(animation.animationName || '');
    }

    function mediane(valeurs) {
        var triees = valeurs.slice().sort(function (a, b) { return a - b; });
        return triees[Math.floor(triees.length / 2)];
    }

    /**
     * Ce que coûte une image du décor, et le pas qu'on peut se permettre.
     *
     * <p>Juste après un pas, on regarde l'écart entre deux rafraîchissements
     * : tant que la carte graphique dessine, le suivant attend. Ce qui
     * dépasse un rafraîchissement normal, c'est le prix de l'image. On garde
     * le décor sous quatre dixièmes du temps : à 15 ms l'image, il tourne à
     * vingt-quatre pas ; à 60 ms, il descend à six, et l'interface reste
     * libre.
     */
    function noter(ecart) {
        couts.push(Math.max(ecart - VSYNC, 1));
        if (couts.length < ECHANTILLONS) return;
        var cout = mediane(couts);
        couts = [];
        var vise = PALIERS.length - 1;
        for (var i = palierMin; i < PALIERS.length; i++) {
            if (PALIERS[i] * cout <= BUDGET) { vise = i; break; }
        }
        // Monter d'un cran à la fois, descendre d'un coup : une machine qui
        // peine doit être soulagée tout de suite.
        if (vise < palier) vise = palier - 1;
        if (vise !== palier) { palier = vise; demarrer(); }
    }

    function pas() {
        var maintenant = global.performance.now();
        var ecart = Math.min(maintenant - dernier, 250);
        dernier = maintenant;
        if (document.hidden) return;

        var animations = document.getAnimations ? document.getAnimations() : [];
        var bouge = false;
        for (var i = 0; i < animations.length; i++) {
            var a = animations[i];
            if (!sansFin(a)) continue;
            var suivi = suivies && suivies.get(a);
            if (suivies && !suivi) {
                suivi = rythme(a);
                suivies.set(a, suivi);
                // À l'arrêt entre deux pas ; la feuille de style garde la
                // main sur la pause (lieu ouvert, onglet caché).
                a.playbackRate = 0;
            }
            if (fige || geste || a.playState !== 'running') continue;
            var avance = ecart;
            if (suivi && suivi.intervalle) {
                suivi.retard += ecart;
                if (suivi.retard < suivi.intervalle) continue;
                avance = suivi.retard;
                suivi.retard = 0;
            }
            a.currentTime = (a.currentTime || 0) + avance;
            bouge = true;
        }
        if (bouge && !mesure && global.requestAnimationFrame) {
            mesure = true;
            global.requestAnimationFrame(function (t1) {
                global.requestAnimationFrame(function (t2) {
                    mesure = false;
                    noter(t2 - t1);
                });
            });
        }
    }

    function demarrer() {
        if (minuterie) global.clearInterval(minuterie);
        document.documentElement.dataset.cadence = fige ? '0' : String(PALIERS[palier]);
        dernier = global.performance.now();
        minuterie = global.setInterval(pas, 1000 / PALIERS[palier]);
        pas();
    }

    /**
     * Le réglage du joueur : « complet » laisse la cadence s'adapter depuis
     * le haut, « econome » part d'un pas lent, « sobre » fige le décor.
     */
    /**
     * Une carte graphique qui peine ne se voit pas toujours depuis la page :
     * elle dessine à part, et la page continue de recevoir ses
     * rafraîchissements à l'heure. On ne compte donc pas que sur la mesure :
     * un téléphone ou un petit processeur part d'un pas plus lent.
     */
    function modeste() {
        var coeurs = global.navigator && global.navigator.hardwareConcurrency;
        var memoire = global.navigator && global.navigator.deviceMemory;
        var tactile = global.matchMedia && global.matchMedia('(pointer: coarse)').matches;
        return tactile || (coeurs && coeurs <= 4) || (memoire && memoire <= 4);
    }

    function regler(mode) {
        var reduit = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
        fige = mode === 'sobre' || reduit;
        palierMin = mode === 'econome' ? ECONOME : modeste() ? MODESTE : 0;
        // Les rythmes propres dépendent du mode : on les recalculera.
        if (suivies) suivies = new WeakMap();
        palier = Math.max(palier, palierMin);
        couts = [];
        demarrer();
    }

    function suspendre() { geste = true; }
    function reprendre() { geste = false; dernier = global.performance.now(); }

    if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('pointerdown', suspendre, true);
        document.addEventListener('pointerup', reprendre, true);
        document.addEventListener('pointercancel', reprendre, true);
        document.addEventListener('visibilitychange', function () { dernier = global.performance.now(); });
    }

    global.BrewsteadCadence = {
        regler: regler,
        images: function () { return fige ? 0 : PALIERS[palier]; }
    };
})(window);
