(() => {
    const jeu = document.getElementById('jeu');
    const camera = document.getElementById('camera');
    if (!jeu || !camera) return;

    const chargerStyle = () => {
        if (document.querySelector('link[data-brewstead-seasons]')) return;
        const lien = document.createElement('link');
        lien.rel = 'stylesheet';
        lien.href = '/css/brewstead-seasons.css';
        lien.dataset.brewsteadSeasons = 'true';
        document.head.appendChild(lien);
    };

    const mois = new Date().getMonth() + 1;
    const saison = mois >= 3 && mois <= 5 ? 'printemps'
        : mois >= 6 && mois <= 8 ? 'ete'
            : mois >= 9 && mois <= 11 ? 'automne'
                : 'hiver';

    const saisonsLabel = {
        printemps: 'Printemps',
        ete: 'Été',
        automne: 'Automne',
        hiver: 'Hiver'
    };

    const meteoParSaison = {
        printemps: ['clair', 'brume', 'pluie'],
        ete: ['clair', 'clair', 'brume'],
        automne: ['brume', 'pluie', 'clair'],
        hiver: ['neige', 'brume', 'clair']
    };

    const iconesMeteo = {
        clair: '☀',
        brume: '≋',
        pluie: '☂',
        neige: '❄'
    };

    const labelsMeteo = {
        clair: 'Ciel clair',
        brume: 'Brume de vallée',
        pluie: 'Pluie fine',
        neige: 'Neige légère'
    };

    const cleJour = (() => {
        const date = new Date();
        return date.getDate() + date.getMonth() * 31 + date.getHours();
    })();

    let indexMeteo = cleJour % meteoParSaison[saison].length;
    let meteo = meteoParSaison[saison][indexMeteo];

    const creerParticules = (classe, nombre, fabriqueStyle) => {
        const conteneur = document.createElement('div');
        conteneur.className = classe;
        for (let i = 0; i < nombre; i++) {
            const element = document.createElement('i');
            const style = fabriqueStyle(i);
            Object.entries(style).forEach(([propriete, valeur]) => element.style.setProperty(propriete, valeur));
            conteneur.appendChild(element);
        }
        return conteneur;
    };

    const creerClimat = () => {
        if (document.querySelector('.climat-scene')) return document.querySelector('.climat-scene');

        const climat = document.createElement('div');
        climat.className = 'climat-scene';
        climat.setAttribute('aria-hidden', 'true');

        climat.appendChild(creerParticules('pluie', 46, () => ({
            '--x': `${Math.random() * 100}%`,
            '--duree': `${.8 + Math.random() * .9}s`,
            '--delai': `${-Math.random() * 3}s`,
            '--longueur': `${32 + Math.random() * 58}px`,
            '--opacite': `${.2 + Math.random() * .48}`
        })));

        climat.appendChild(creerParticules('neige', 56, () => ({
            '--x': `${Math.random() * 100}%`,
            '--duree': `${6 + Math.random() * 8}s`,
            '--delai': `${-Math.random() * 10}s`,
            '--taille': `${2 + Math.random() * 5}px`,
            '--opacite': `${.35 + Math.random() * .55}`
        })));

        climat.appendChild(creerParticules('feuilles', 22, () => ({
            '--x': `${Math.random() * 100}%`,
            '--duree': `${10 + Math.random() * 12}s`,
            '--delai': `${-Math.random() * 14}s`,
            '--opacite': `${.25 + Math.random() * .55}`,
            '--couleur': ['#a55d2a', '#ba7b32', '#d09a45', '#7d4c2b'][Math.floor(Math.random() * 4)]
        })));

        climat.appendChild(creerParticules('pollen', 30, () => ({
            '--x': `${Math.random() * 100}%`,
            '--y': `${22 + Math.random() * 64}%`,
            '--duree': `${6 + Math.random() * 9}s`,
            '--delai': `${-Math.random() * 10}s`
        })));

        document.body.appendChild(climat);
        return climat;
    };

    let hudClimat = null;
    const creerHudClimat = () => {
        if (hudClimat) return hudClimat;
        hudClimat = document.createElement('button');
        hudClimat.type = 'button';
        hudClimat.className = 'climat-hud';
        hudClimat.title = 'Changer la météo de démonstration';
        hudClimat.innerHTML = `
            <span class="climat-hud__icone"></span>
            <span class="climat-hud__texte"><strong></strong><small></small></span>
        `;
        document.body.appendChild(hudClimat);
        hudClimat.addEventListener('click', () => {
            indexMeteo = (indexMeteo + 1) % meteoParSaison[saison].length;
            meteo = meteoParSaison[saison][indexMeteo];
            appliquerClimat();
            montrerToast(`La météo passe à : ${labelsMeteo[meteo].toLowerCase()}.`);
        });
        return hudClimat;
    };

    const appliquerClimat = () => {
        jeu.dataset.saison = saison;
        jeu.dataset.meteo = meteo;
        const hud = creerHudClimat();
        hud.querySelector('.climat-hud__icone').textContent = iconesMeteo[meteo];
        hud.querySelector('strong').textContent = labelsMeteo[meteo];
        hud.querySelector('small').textContent = saisonsLabel[saison];
    };

    const niveaux = {
        champs: 1,
        rucher: 2,
        brasserie: 3,
        laboratoire: 2,
        taverne: 1,
        reserve: 1,
        commandes: 1
    };

    const ajouterProgressionBatiments = () => {
        document.querySelectorAll('.zone[data-zone]').forEach((zone) => {
            const nom = zone.dataset.zone;
            if (niveaux[nom]) zone.dataset.niveau = niveaux[nom];
        });

        const couche = camera.querySelector('.couche-vivante') || camera;
        Object.entries(niveaux).forEach(([nom, niveau]) => {
            if (nom === 'commandes' || couche.querySelector(`.badge-batiment[data-zone="${nom}"]`)) return;
            const badge = document.createElement('div');
            badge.className = 'badge-batiment';
            badge.dataset.zone = nom;
            badge.innerHTML = `<span>✦</span><strong>Niv. ${niveau}</strong>`;
            couche.appendChild(badge);
        });
    };

    const ajouterAnimaux = () => {
        const couche = camera.querySelector('.couche-vivante');
        if (!couche || couche.querySelector('.chat-domaine')) return;
        const chat = document.createElement('div');
        chat.className = 'animal chat-domaine';
        const chien = document.createElement('div');
        chien.className = 'animal chien-domaine';
        couche.append(chat, chien);
    };

    const phrases = {
        brasseur: [
            'Le cuivre chante bien ce matin.',
            'Encore un peu de patience pour cette cuve.',
            'Cette levure pourrait donner quelque chose de rare.'
        ],
        fermier: [
            'L’orge a bien pris cette nuit.',
            'La terre est humide, c’est parfait.',
            'Il faudra bientôt préparer la prochaine parcelle.'
        ],
        voyageur: [
            'On raconte que l’hydromel d’ici vaut le détour.',
            'La taverne semble animée ce soir.',
            'Je cherche une bière digne des routes du Nord.'
        ]
    };

    const bulles = {};
    const creerBulles = () => {
        const couche = camera.querySelector('.couche-vivante');
        if (!couche) return;
        Object.keys(phrases).forEach((role) => {
            const bulle = document.createElement('div');
            bulle.className = 'bulle-villageois';
            bulle.dataset.role = role;
            couche.appendChild(bulle);
            bulles[role] = bulle;
        });
    };

    let minuterieBulle = null;
    const lancerDialogue = () => {
        clearTimeout(minuterieBulle);
        minuterieBulle = setTimeout(() => {
            if (jeu.dataset.zoneActive !== 'domaine') {
                lancerDialogue();
                return;
            }
            const roles = Object.keys(phrases);
            const role = roles[Math.floor(Math.random() * roles.length)];
            const liste = phrases[role];
            const bulle = bulles[role];
            if (bulle) {
                bulle.textContent = liste[Math.floor(Math.random() * liste.length)];
                bulle.classList.add('est-visible');
                setTimeout(() => bulle.classList.remove('est-visible'), 4300);
            }
            lancerDialogue();
        }, 8000 + Math.random() * 8500);
    };

    let toast = null;
    let minuterieToast = null;
    function montrerToast(message) {
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'toast-vivant';
            toast.setAttribute('role', 'status');
            document.body.appendChild(toast);
        }
        clearTimeout(minuterieToast);
        toast.textContent = message;
        toast.classList.add('est-visible');
        minuterieToast = setTimeout(() => toast.classList.remove('est-visible'), 3000);
    }

    const interactions = {
        brasserie: [
            ['◉', 'Inspecter la grande cuve', 'Le brassin semble stable. La température est parfaite.', 'reaction-cuivre'],
            ['♨', 'Raviver le foyer', 'Le foyer ronfle et la lumière du cuivre gagne toute la pièce.', 'reaction-cuivre'],
            ['⌁', 'Écouter la fermentation', 'Un léger pétillement trahit une fermentation très active.', 'reaction-cuivre']
        ],
        laboratoire: [
            ['⚗', 'Examiner les flacons', 'Une note de miel sauvage domine les derniers essais.', 'reaction-labo'],
            ['ᚨ', 'Activer le cercle runique', 'Les runes s’illuminent autour du carnet de recettes.', 'reaction-labo'],
            ['✦', 'Consulter les notes', 'Une recette inachevée mentionne des herbes de montagne.', 'reaction-labo']
        ],
        taverne: [
            ['♨', 'S’approcher du feu', 'La cheminée crépite et couvre un instant le brouhaha de la salle.', 'reaction-taverne'],
            ['◌', 'Écouter les voyageurs', 'Deux voyageurs parlent d’une commande particulièrement lucrative.', 'reaction-taverne'],
            ['☕', 'Observer le comptoir', 'Une chope attend déjà le prochain client.', 'reaction-taverne']
        ]
    };

    const enrichirInterieurs = () => {
        const conteneur = document.querySelector('.interieur-cinematique');
        if (!conteneur || conteneur.dataset.interactionsPretes === 'true') return false;

        Object.entries(interactions).forEach(([nom, liste]) => {
            const scene = conteneur.querySelector(`[data-interieur="${nom}"]`);
            if (!scene) return;
            const points = document.createElement('div');
            points.className = 'points-interieur';
            liste.forEach(([icone, libelle, message, classe]) => {
                const bouton = document.createElement('button');
                bouton.type = 'button';
                bouton.className = 'point-interieur';
                bouton.textContent = icone;
                bouton.dataset.libelle = libelle;
                bouton.addEventListener('click', () => {
                    scene.classList.add(classe);
                    montrerToast(message);
                    setTimeout(() => scene.classList.remove(classe), 1450);
                });
                points.appendChild(bouton);
            });
            scene.appendChild(points);
        });

        conteneur.dataset.interactionsPretes = 'true';
        return true;
    };

    const niveauPanneau = document.createElement('div');
    niveauPanneau.className = 'niveau-batiment';
    const mettreAJourNiveauPanneau = () => {
        const zone = jeu.dataset.zoneActive;
        const panneau = document.getElementById('panneauLieu');
        const surtitre = document.getElementById('surtitreLieu');
        if (!panneau || !surtitre) return;
        if (!niveaux[zone] || zone === 'domaine') {
            niveauPanneau.remove();
            return;
        }
        niveauPanneau.textContent = `✦ Bâtiment niveau ${niveaux[zone]}`;
        if (!niveauPanneau.isConnected) surtitre.insertAdjacentElement('afterend', niveauPanneau);
    };

    const observerInterieur = new MutationObserver(() => {
        enrichirInterieurs();
    });
    observerInterieur.observe(document.body, { childList: true, subtree: true });

    const observerZone = new MutationObserver(mettreAJourNiveauPanneau);
    observerZone.observe(jeu, { attributes: true, attributeFilter: ['data-zone-active'] });

    chargerStyle();
    creerClimat();
    appliquerClimat();

    const initialiserVie = () => {
        ajouterProgressionBatiments();
        ajouterAnimaux();
        creerBulles();
        enrichirInterieurs();
        mettreAJourNiveauPanneau();
        lancerDialogue();
    };

    if (camera.querySelector('.couche-vivante')) initialiserVie();
    else {
        const attendreVie = new MutationObserver(() => {
            if (!camera.querySelector('.couche-vivante')) return;
            attendreVie.disconnect();
            initialiserVie();
        });
        attendreVie.observe(camera, { childList: true, subtree: true });
    }
})();
