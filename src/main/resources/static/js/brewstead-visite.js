/* ==========================================================================
   Brewstead — la visite guidée

   Un projecteur sur les vrais éléments de l'écran, une bulle qui explique,
   et trois boutons : passer, revenir, continuer. Le module ne sait rien du
   jeu ; l'interface lui donne les étapes et ce qu'il faut faire à la fin.

   Pourquoi sur les vrais éléments, et pas une série d'images : le joueur
   apprend où se trouvent les choses en les voyant éclairées à leur place.
   Une capture d'écran lui apprendrait à reconnaître une capture d'écran.
   ========================================================================== */

(function (global) {
    'use strict';

    var MARGE = 8;      // l'air autour de l'élément éclairé
    var BORD = 12;      // la bulle ne colle jamais au bord de l'écran
    var ECART = 16;     // entre l'élément éclairé et la bulle

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    /** L'élément visé, s'il est bien là et visible ; sinon rien. */
    function trouver(cible) {
        if (!cible) return null;
        var node = typeof cible === 'function' ? cible() : document.querySelector(cible);
        if (!node || node.hidden) return null;
        var rect = node.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return null;
        if (rect.bottom < 0 || rect.top > global.innerHeight || rect.right < 0 || rect.left > global.innerWidth) return null;
        return node;
    }

    /**
     * Lance la visite.
     *
     * @param options.racine    où poser le calque (le jeu entier)
     * @param options.etapes    [{ cible, titre, texte, corps?, bouton? }]
     *                          `cible` : un sélecteur, une fonction, ou rien
     *                          pour une étape au centre ; `corps` : du HTML
     *                          déjà échappé par l'appelant
     * @param options.surFin    appelé une fois, avec `true` si la visite est
     *                          allée au bout, `false` si elle a été passée
     */
    function demarrer(options) {
        // Ce qui n'est pas à l'écran au départ ne compte pas dans « Étape n
        // sur m » : sur un téléphone, l'objectif du jour cède sa place aux
        // réserves, et le compteur sautait de cinq à sept.
        var etapes = options.etapes.filter(function (etape) { return !etape.cible || trouver(etape.cible); });
        var index = 0;
        var fini = false;
        var avant = document.activeElement;

        var racine = el('div', 'visite');
        racine.setAttribute('role', 'dialog');
        racine.setAttribute('aria-modal', 'true');
        racine.setAttribute('aria-labelledby', 'visiteTitre');
        racine.setAttribute('aria-describedby', 'visiteTexte');

        var halo = el('div', 'visite__halo');
        halo.setAttribute('aria-hidden', 'true');

        var bulle = el('section', 'visite__bulle');
        var compte = el('p', 'visite__compte');
        var titre = el('h2', 'visite__titre');
        titre.id = 'visiteTitre';
        var texte = el('p', 'visite__texte');
        texte.id = 'visiteTexte';
        var corps = el('div', 'visite__corps');
        var points = el('div', 'visite__points');
        points.setAttribute('aria-hidden', 'true');
        var actions = el('div', 'visite__actions');
        var passer = el('button', 'btn btn--sm visite__passer', 'Passer la visite');
        var retour = el('button', 'btn btn--sm visite__retour', 'Retour');
        var suivant = el('button', 'btn btn--gold visite__suivant', 'Suivant');
        [passer, retour, suivant].forEach(function (b) { b.type = 'button'; actions.appendChild(b); });

        [compte, titre, texte, corps, points, actions].forEach(function (n) { bulle.appendChild(n); });
        racine.appendChild(halo);
        racine.appendChild(bulle);
        options.racine.appendChild(racine);

        function placer() {
            if (fini) return;
            var etape = etapes[index];
            var cible = trouver(etape.cible);
            var vw = global.innerWidth;
            var vh = global.innerHeight;

            if (cible) {
                var r = cible.getBoundingClientRect();
                var x = Math.max(4, r.left - MARGE);
                var y = Math.max(4, r.top - MARGE);
                var w = Math.min(vw - 8, r.right + MARGE) - x;
                var h = Math.min(vh - 8, r.bottom + MARGE) - y;
                halo.style.transform = 'translate(' + x + 'px,' + y + 'px)';
                halo.style.width = w + 'px';
                halo.style.height = h + 'px';
                racine.classList.add('a-une-cible');
            } else {
                // Pas de cible : le projecteur se referme au centre et son
                // ombre couvre tout l'écran.
                halo.style.transform = 'translate(' + (vw / 2) + 'px,' + (vh / 2) + 'px)';
                halo.style.width = '0px';
                halo.style.height = '0px';
                racine.classList.remove('a-une-cible');
            }

            var bw = bulle.offsetWidth;
            var bh = bulle.offsetHeight;
            var left, top;
            if (cible) {
                var c = cible.getBoundingClientRect();
                var dessous = vh - c.bottom - MARGE - ECART;
                var dessus = c.top - MARGE - ECART;
                if (dessous >= bh || dessous >= dessus) top = Math.min(vh - bh - BORD, c.bottom + MARGE + ECART);
                else top = Math.max(BORD, c.top - MARGE - ECART - bh);
                left = c.left + c.width / 2 - bw / 2;
            } else {
                top = (vh - bh) / 2;
                left = (vw - bw) / 2;
            }
            left = Math.max(BORD, Math.min(vw - bw - BORD, left));
            top = Math.max(BORD, Math.min(vh - bh - BORD, top));
            bulle.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
        }

        function montrer(nouvelIndex, sens) {
            // Une étape dont l'élément n'est pas à l'écran (l'objectif du jour
            // déjà rempli, par exemple) est sautée plutôt que de pointer le vide.
            while (nouvelIndex > 0 && nouvelIndex < etapes.length - 1 &&
                   etapes[nouvelIndex].cible && !trouver(etapes[nouvelIndex].cible)) {
                nouvelIndex += sens || 1;
            }
            index = Math.max(0, Math.min(etapes.length - 1, nouvelIndex));
            var etape = etapes[index];
            var dernier = index === etapes.length - 1;

            compte.textContent = 'Étape ' + (index + 1) + ' sur ' + etapes.length;
            titre.textContent = etape.titre;
            texte.textContent = etape.texte || '';
            corps.innerHTML = etape.corps || '';
            corps.hidden = !etape.corps;
            points.innerHTML = etapes.map(function (e, i) {
                return '<i class="' + (i < index ? 'is-vu' : (i === index ? 'is-ici' : '')) + '"></i>';
            }).join('');
            retour.hidden = index === 0;
            passer.hidden = dernier;
            suivant.textContent = etape.bouton || (dernier ? 'À moi de jouer !' : 'Suivant');

            // Le souffle d'entrée doit repartir de zéro à chaque étape.
            bulle.classList.remove('is-entree');
            void bulle.offsetWidth;
            bulle.classList.add('is-entree');

            placer();
            suivant.focus({ preventScroll: true });
        }

        function terminer(auBout) {
            if (fini) return;
            fini = true;
            global.removeEventListener('resize', placer);
            document.removeEventListener('keydown', clavier, true);
            racine.classList.add('is-sortie');
            // Le calque s'efface avant de disparaître ; sans transition
            // (mode sobre), l'événement ne viendrait jamais.
            var retirer = function () { if (racine.parentNode) racine.parentNode.removeChild(racine); };
            racine.addEventListener('transitionend', retirer, { once: true });
            setTimeout(retirer, 400);
            if (avant && avant.focus && document.contains(avant)) avant.focus({ preventScroll: true });
            if (options.surFin) options.surFin(auBout);
        }

        function clavier(event) {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); terminer(false); return; }
            if (event.key === 'ArrowRight') { event.preventDefault(); avancer(); return; }
            if (event.key === 'ArrowLeft' && index > 0) { event.preventDefault(); montrer(index - 1, -1); return; }
            // Le focus reste dans la bulle : derrière, rien n'est cliquable.
            if (event.key === 'Tab') {
                var boutons = Array.from(bulle.querySelectorAll('button')).filter(function (b) { return !b.hidden; });
                var i = boutons.indexOf(document.activeElement);
                event.preventDefault();
                var suivantFocus = boutons[(i + (event.shiftKey ? -1 : 1) + boutons.length) % boutons.length];
                if (suivantFocus) suivantFocus.focus();
            }
        }

        function avancer() {
            if (index >= etapes.length - 1) terminer(true);
            else montrer(index + 1, 1);
        }

        suivant.addEventListener('click', avancer);
        retour.addEventListener('click', function () { montrer(index - 1, -1); });
        passer.addEventListener('click', function () { terminer(false); });
        global.addEventListener('resize', placer);
        document.addEventListener('keydown', clavier, true);

        // Un cadre plus tard : la bulle a sa taille, le projecteur peut partir
        // du centre et glisser vers sa première cible.
        halo.style.transform = 'translate(' + (global.innerWidth / 2) + 'px,' + (global.innerHeight / 2) + 'px)';
        global.requestAnimationFrame(function () {
            racine.classList.add('is-ouverte');
            montrer(0, 1);
        });

        return { arreter: function () { terminer(false); } };
    }

    global.BrewsteadVisite = { demarrer: demarrer };
})(window);
