(() => {
    const jeu = document.getElementById('jeu');
    const camera = document.getElementById('camera');
    if (!jeu || !camera) return;

    const ajouterFeuilleStyle = () => {
        if (document.querySelector('link[data-brewstead-life]')) return;
        const lien = document.createElement('link');
        lien.rel = 'stylesheet';
        lien.href = '/css/brewstead-life.css';
        lien.dataset.brewsteadLife = 'true';
        document.head.appendChild(lien);
    };

    const creerMondeVivant = () => {
        if (camera.querySelector('.couche-vivante')) return;

        const couche = document.createElement('div');
        couche.className = 'couche-vivante';
        couche.setAttribute('aria-hidden', 'true');
        couche.innerHTML = `
            <div class="reflets-riviere"></div>
            <div class="villageois villageois--brasseur"></div>
            <div class="villageois villageois--voyageur"></div>
            <div class="villageois villageois--fermier"></div>
            <div class="charrette"></div>
            <div class="oiseaux">
                <span class="oiseau"></span>
                <span class="oiseau"></span>
                <span class="oiseau"></span>
            </div>
            <div class="etincelles-foyer"><i></i><i></i><i></i></div>
        `;
        camera.appendChild(couche);

        const meteo = document.createElement('div');
        meteo.className = 'meteo-vivante';
        meteo.setAttribute('aria-hidden', 'true');
        camera.appendChild(meteo);
    };

    const scenes = {
        brasserie: {
            surtitre: 'Le cœur chaud du domaine',
            titre: 'La brasserie',
            texte: 'Le cuivre rayonne, les cuves respirent et les levures travaillent dans l’ombre. Ici, chaque récolte devient une boisson qui peut bâtir ta légende.',
            decor: `
                <div class="charpente"></div>
                <div class="tuyauterie"></div>
                <div class="cuve-interieure cuve-interieure--1"></div>
                <div class="cuve-interieure cuve-interieure--2"></div>
                <div class="cuve-interieure cuve-interieure--3"></div>
                <div class="foyer-brasserie"></div>
                <div class="vapeur-interieure"></div>
            `
        },
        laboratoire: {
            surtitre: 'Le sanctuaire des recettes',
            titre: 'Le laboratoire',
            texte: 'Flacons, levures, plantes et vieux symboles s’entassent autour de ton carnet. C’est ici que naissent les recettes que personne d’autre ne possède.',
            decor: `
                <div class="mur-pierre"></div>
                <div class="etageres-labo"></div>
                <div class="flacons"></div>
                <div class="cercle-runique-interieur"></div>
            `
        },
        taverne: {
            surtitre: 'Le foyer social de Mjödheim',
            titre: 'La taverne',
            texte: 'La chaleur du feu, les voix des voyageurs et le bruit des chopes donnent enfin un visage vivant au domaine. Plus tard, les autres joueurs s’y croiseront réellement.',
            decor: `
                <div class="poutres-taverne"></div>
                <div class="cheminee-taverne"></div>
                <div class="table-taverne"></div>
                <div class="silhouettes-taverne"></div>
            `
        }
    };

    let interieur = null;
    let sceneActive = null;

    const creerInterieur = () => {
        if (interieur) return interieur;

        interieur = document.createElement('section');
        interieur.className = 'interieur-cinematique';
        interieur.setAttribute('aria-hidden', 'true');
        interieur.innerHTML = `
            <div class="porte-transition"><span></span><span></span></div>
            ${Object.entries(scenes).map(([cle, scene]) => `
                <div class="scene-interieure interieur--${cle}" data-interieur="${cle}">
                    <div class="scene-interieure__fond"></div>
                    <div class="scene-interieure__sol"></div>
                    ${scene.decor}
                    <div class="scene-interieure__entete">
                        <small>${scene.surtitre}</small>
                        <h2>${scene.titre}</h2>
                        <p>${scene.texte}</p>
                    </div>
                </div>
            `).join('')}
            <button class="quitter-interieur" type="button" aria-label="Retour au domaine"><span>←</span> Revenir dehors</button>
        `;
        document.body.appendChild(interieur);

        interieur.querySelector('.quitter-interieur').addEventListener('click', fermerInterieur);
        return interieur;
    };

    const ouvrirInterieur = (nom) => {
        if (!scenes[nom]) return;
        const conteneur = creerInterieur();
        conteneur.querySelectorAll('[data-interieur]').forEach((scene) => {
            scene.classList.toggle('est-active', scene.dataset.interieur === nom);
        });
        sceneActive = nom;
        conteneur.classList.add('est-ouvert');
        conteneur.setAttribute('aria-hidden', 'false');
        document.body.dataset.interieurActif = nom;
    };

    function fermerInterieur() {
        if (!interieur?.classList.contains('est-ouvert')) return;
        interieur.classList.remove('est-ouvert');
        interieur.setAttribute('aria-hidden', 'true');
        delete document.body.dataset.interieurActif;
        sceneActive = null;
    }

    const boutonCorrespondA = (bouton, fragments) => {
        const texte = bouton.textContent.trim().toLowerCase();
        return fragments.some((fragment) => texte.includes(fragment));
    };

    document.addEventListener('click', (event) => {
        const bouton = event.target.closest('.action-lieu');
        if (!bouton) return;

        const zone = jeu.dataset.zoneActive;
        if (zone === 'brasserie' && boutonCorrespondA(bouton, ['lancer un brassin', 'fermentation'])) {
            event.preventDefault();
            event.stopPropagation();
            ouvrirInterieur('brasserie');
        }
        if (zone === 'laboratoire' && boutonCorrespondA(bouton, ['créer une recette', 'carnet'])) {
            event.preventDefault();
            event.stopPropagation();
            ouvrirInterieur('laboratoire');
        }
        if (zone === 'taverne' && boutonCorrespondA(bouton, ['entrer dans la taverne'])) {
            event.preventDefault();
            event.stopPropagation();
            ouvrirInterieur('taverne');
        }
    }, true);

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !sceneActive) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        fermerInterieur();
    }, true);

    const ajouterRaccourcisEntree = () => {
        document.querySelectorAll('.zone--brasserie, .zone--laboratoire, .zone--taverne').forEach((zone) => {
            zone.addEventListener('dblclick', () => {
                const nom = zone.dataset.zone;
                if (nom === 'brasserie' || nom === 'laboratoire' || nom === 'taverne') ouvrirInterieur(nom);
            });
        });
    };

    const animerLueurs = () => {
        const fenetres = document.querySelectorAll('[fill="url(#lueurFenetre)"]');
        fenetres.forEach((fenetre, index) => {
            fenetre.animate(
                [
                    { opacity: .72, filter: 'brightness(.92)' },
                    { opacity: 1, filter: 'brightness(1.2)' },
                    { opacity: .8, filter: 'brightness(1)' }
                ],
                {
                    duration: 4200 + index * 310,
                    iterations: Infinity,
                    direction: 'alternate',
                    easing: 'ease-in-out',
                    delay: index * 240
                }
            );
        });
    };

    const adapterVieAlaPhase = () => {
        const phase = jeu.dataset.phase || 'nuit';
        const couche = camera.querySelector('.couche-vivante');
        if (!couche) return;

        const villageois = couche.querySelectorAll('.villageois, .charrette');
        villageois.forEach((element) => {
            element.style.opacity = phase === 'nuit' ? '.46' : phase === 'jour' ? '.92' : '.72';
        });
    };

    ajouterFeuilleStyle();
    creerMondeVivant();
    creerInterieur();
    ajouterRaccourcisEntree();
    animerLueurs();
    adapterVieAlaPhase();

    const observateur = new MutationObserver(adapterVieAlaPhase);
    observateur.observe(jeu, { attributes: true, attributeFilter: ['data-phase'] });

    if (!document.querySelector('script[data-brewstead-seasons]')) {
        const script = document.createElement('script');
        script.src = '/js/brewstead-seasons.js';
        script.defer = true;
        script.dataset.brewsteadSeasons = 'true';
        document.body.appendChild(script);
    }
})();
