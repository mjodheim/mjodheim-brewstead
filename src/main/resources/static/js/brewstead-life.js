(() => {
    const jeu = document.getElementById('jeu');
    const camera = document.getElementById('camera');
    if (!jeu || !camera) return;

    const ajouterFeuillesStyle = () => {
        [
            ['brewstead-life', '/css/brewstead-life.css'],
            ['brewstead-seasons-ui', '/css/brewstead-seasons.css']
        ].forEach(([cle, href]) => {
            if (document.querySelector(`link[data-${cle}]`)) return;
            const lien = document.createElement('link');
            lien.rel = 'stylesheet';
            lien.href = href;
            lien.dataset[cle.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = 'true';
            document.head.appendChild(lien);
        });
    };

    const creerMondeVivant = () => {
        if (camera.querySelector('.couche-vivante')) return;
        const couche = document.createElement('div');
        couche.className = 'couche-vivante couche-vivante--legere';
        couche.setAttribute('aria-hidden', 'true');
        couche.innerHTML = `
            <div class="reflets-riviere"></div>
            <div class="villageois villageois--brasseur"></div>
            <div class="villageois villageois--fermier"></div>
            <div class="oiseaux"><span class="oiseau"></span><span class="oiseau"></span></div>
            <div class="etincelles-foyer"><i></i><i></i></div>
        `;
        camera.appendChild(couche);
    };

    const scenes = {
        brasserie: {
            surtitre: 'Le cœur chaud du domaine',
            titre: 'La brasserie',
            texte: 'Le cuivre rayonne, les cuves respirent et les levures travaillent dans l’ombre. Ici, chaque récolte devient une boisson qui peut bâtir ta légende.',
            decor: `
                <div class="charpente"></div><div class="tuyauterie"></div>
                <div class="cuve-interieure cuve-interieure--1"></div><div class="cuve-interieure cuve-interieure--2"></div>
                <div class="foyer-brasserie"></div><div class="vapeur-interieure"></div>`,
            interactions: [
                ['◉', 'Inspecter la grande cuve', 'Le brassin semble stable. La température est parfaite.', 'reaction-cuivre'],
                ['♨', 'Raviver le foyer', 'Le foyer ronfle et la lumière du cuivre gagne toute la pièce.', 'reaction-cuivre']
            ]
        },
        laboratoire: {
            surtitre: 'Le sanctuaire des recettes',
            titre: 'Le laboratoire',
            texte: 'Flacons, levures, plantes et vieux symboles s’entassent autour de ton carnet. C’est ici que naissent les recettes que personne d’autre ne possède.',
            decor: `<div class="mur-pierre"></div><div class="etageres-labo"></div><div class="flacons"></div><div class="cercle-runique-interieur"></div>`,
            interactions: [
                ['⚗', 'Examiner les flacons', 'Une note de miel sauvage domine les derniers essais.', 'reaction-labo'],
                ['ᚨ', 'Activer le cercle runique', 'Les runes s’illuminent autour du carnet de recettes.', 'reaction-labo']
            ]
        },
        taverne: {
            surtitre: 'Le foyer social de Mjödheim',
            titre: 'La taverne',
            texte: 'La chaleur du feu, les voix des voyageurs et le bruit des chopes donnent enfin un visage vivant au domaine.',
            decor: `<div class="poutres-taverne"></div><div class="cheminee-taverne"></div><div class="table-taverne"></div><div class="silhouettes-taverne"></div>`,
            interactions: [
                ['♨', 'S’approcher du feu', 'La cheminée crépite et couvre un instant le brouhaha de la salle.', 'reaction-taverne'],
                ['◌', 'Écouter les voyageurs', 'Deux voyageurs parlent d’une commande particulièrement lucrative.', 'reaction-taverne']
            ]
        }
    };

    let interieur = null;
    let sceneActive = null;
    let minuterieToast = null;

    const montrerToast = (message) => {
        let toast = document.querySelector('.toast-vivant');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'toast-vivant';
            toast.setAttribute('role', 'status');
            document.body.appendChild(toast);
        }
        clearTimeout(minuterieToast);
        toast.textContent = message;
        toast.classList.add('est-visible');
        minuterieToast = setTimeout(() => toast.classList.remove('est-visible'), 2600);
    };

    const creerInterieur = () => {
        if (interieur) return interieur;
        interieur = document.createElement('section');
        interieur.className = 'interieur-cinematique';
        interieur.setAttribute('aria-hidden', 'true');
        interieur.innerHTML = `<div class="porte-transition"><span></span><span></span></div><div class="interieur-racine"></div><button class="quitter-interieur" type="button" aria-label="Retour au domaine"><span>←</span> Revenir dehors</button>`;
        document.body.appendChild(interieur);
        interieur.querySelector('.quitter-interieur').addEventListener('click', fermerInterieur);
        return interieur;
    };

    const construireScene = (nom) => {
        const scene = scenes[nom];
        if (!scene) return null;
        const conteneur = document.createElement('div');
        conteneur.className = `scene-interieure interieur--${nom} est-active`;
        conteneur.dataset.interieur = nom;
        conteneur.innerHTML = `
            <div class="scene-interieure__fond"></div>
            <div class="scene-interieure__sol"></div>
            ${scene.decor}
            <div class="scene-interieure__entete"><small>${scene.surtitre}</small><h2>${scene.titre}</h2><p>${scene.texte}</p></div>
            <div class="points-interieur"></div>`;

        const points = conteneur.querySelector('.points-interieur');
        scene.interactions.forEach(([icone, libelle, message, classe]) => {
            const bouton = document.createElement('button');
            bouton.type = 'button';
            bouton.className = 'point-interieur';
            bouton.textContent = icone;
            bouton.dataset.libelle = libelle;
            bouton.addEventListener('click', () => {
                conteneur.classList.add(classe);
                montrerToast(message);
                setTimeout(() => conteneur.classList.remove(classe), 1000);
            });
            points.appendChild(bouton);
        });
        return conteneur;
    };

    const ouvrirInterieur = (nom) => {
        if (!scenes[nom]) return;
        const conteneur = creerInterieur();
        const racine = conteneur.querySelector('.interieur-racine');
        racine.replaceChildren(construireScene(nom));
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
        const racine = interieur.querySelector('.interieur-racine');
        setTimeout(() => {
            if (!sceneActive && racine) racine.replaceChildren();
        }, 250);
    }

    const boutonCorrespondA = (bouton, fragments) => {
        const texte = bouton.textContent.trim().toLowerCase();
        return fragments.some((fragment) => texte.includes(fragment));
    };

    document.addEventListener('click', (event) => {
        const bouton = event.target.closest?.('.action-lieu');
        if (!bouton) return;
        const zone = jeu.dataset.zoneActive;
        if (zone === 'brasserie' && boutonCorrespondA(bouton, ['lancer un brassin', 'fermentation'])) {
            event.preventDefault(); event.stopPropagation(); ouvrirInterieur('brasserie');
        } else if (zone === 'laboratoire' && boutonCorrespondA(bouton, ['créer une recette', 'carnet'])) {
            event.preventDefault(); event.stopPropagation(); ouvrirInterieur('laboratoire');
        } else if (zone === 'taverne' && boutonCorrespondA(bouton, ['entrer dans la taverne'])) {
            event.preventDefault(); event.stopPropagation(); ouvrirInterieur('taverne');
        }
    }, true);

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !sceneActive) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        fermerInterieur();
    }, true);

    document.querySelectorAll('.zone--brasserie, .zone--laboratoire, .zone--taverne').forEach((zone) => {
        zone.addEventListener('dblclick', () => ouvrirInterieur(zone.dataset.zone));
    });

    ajouterFeuillesStyle();
    creerMondeVivant();

    // La logique saisons/météo lourde n'est volontairement plus chargée ici.
    // On conserve ses styles d'interface, sans créer les centaines de particules animées.
})();
