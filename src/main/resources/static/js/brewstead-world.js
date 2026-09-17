(() => {
    const jeu = document.getElementById('jeu');
    const intro = document.getElementById('intro');
    const panneau = document.getElementById('panneauLieu');
    const fermerPanneau = document.getElementById('fermerPanneau');
    const iconeLieu = document.getElementById('iconeLieu');
    const surtitreLieu = document.getElementById('surtitreLieu');
    const titreLieu = document.getElementById('titreLieu');
    const descriptionLieu = document.getElementById('descriptionLieu');
    const etatLieu = document.getElementById('etatLieu');
    const actionsLieu = document.getElementById('actionsLieu');
    const notification = document.getElementById('notification');
    const boutonSon = document.getElementById('boutonSon');
    const boutonPleinEcran = document.getElementById('boutonPleinEcran');
    const heureJeu = document.getElementById('heureJeu');

    const lieux = {
        domaine: {
            icone: 'ᛗ',
            surtitre: 'Ton domaine',
            titre: 'Le domaine de Mjödheim',
            description: 'La vallée entière s’organise autour de ta brasserie. Cultive, transforme, expérimente et attire des voyageurs venus goûter tes créations.',
            etats: [
                ['Météo', 'Nuit claire'],
                ['Activité', 'Le feu brûle encore'],
                ['Prochaine étape', 'Choisis un lieu']
            ],
            actions: []
        },
        champs: {
            icone: '🌾',
            surtitre: 'Terres de la vallée',
            titre: 'Les champs',
            description: 'Ici poussent les céréales qui nourrissent tes recettes. Chaque parcelle devient une ressource stratégique pour la brasserie.',
            etats: [
                ['Parcelle I', 'Orge · 03:42'],
                ['Parcelle II', 'Seigle · prêt'],
                ['Parcelle III', 'Libre']
            ],
            actions: [
                ['Récolter le seigle', 'Récolte simulée', true],
                ['Planter une culture', 'Le choix de culture sera connecté au service des champs', false]
            ]
        },
        rucher: {
            icone: '⬡',
            surtitre: 'Miel & cire',
            titre: 'Le rucher',
            description: 'Tes abeilles produisent des miels différents selon les saisons et la flore. Le miel devient la base de tes hydromels les plus rares.',
            etats: [
                ['Ruche du vieux chêne', '61 %'],
                ['Ruche de la rivière', '88 %'],
                ['Production active', '2 ruches']
            ],
            actions: [
                ['Inspecter les ruches', 'Inspection du rucher à connecter au service du rucher', true],
                ['Récolter le miel', 'Récolte disponible quand une ruche est prête', false]
            ]
        },
        laboratoire: {
            icone: '⚗',
            surtitre: 'Expérimentation',
            titre: 'Le laboratoire',
            description: 'Le cœur créatif de Mjödheim. Mélange ingrédients, quantités et temps de fermentation pour mettre au point tes propres recettes.',
            etats: [
                ['Recettes connues', '6'],
                ['Dernière découverte', 'Hydromel de brume'],
                ['Qualité maximale', '88']
            ],
            actions: [
                ['Créer une recette', 'Éditeur de recette à connecter au service des recettes', true],
                ['Ouvrir le carnet', 'Carnet de recettes en préparation', false]
            ]
        },
        brasserie: {
            icone: '♨',
            surtitre: 'Cuivre & fermentation',
            titre: 'La brasserie',
            description: 'Le foyer du domaine. Les cuves chauffent, les levures travaillent et chaque brassin transforme tes récoltes en réputation.',
            etats: [
                ['Cuve I', 'Hydromel du novice · 47 %'],
                ['Cuve II', 'Bière du Skalde · 83 %'],
                ['Brassins actifs', '2']
            ],
            actions: [
                ['Lancer un brassin', 'Nouveau brassin à connecter au service de brassage', true],
                ['Voir les fermentations', 'Suivi détaillé des cuves à venir', false]
            ]
        },
        reserve: {
            icone: '▤',
            surtitre: 'Stocks du domaine',
            titre: 'Les réserves',
            description: 'Céréales, miel, houblon, eau et ingrédients rares sont conservés ici avant de rejoindre une recette ou une commande.',
            etats: [
                ['Orge', '12,5 kg'],
                ['Miel', '3 kg'],
                ['Houblon', '250 g']
            ],
            actions: [
                ['Ouvrir l’inventaire', 'Inventaire détaillé à connecter au service des stocks', true]
            ]
        },
        commandes: {
            icone: '✉',
            surtitre: 'Clients & voyageurs',
            titre: 'Les commandes',
            description: 'Les habitants et visiteurs déposent leurs demandes. Choisis lesquelles méritent tes ressources et ta meilleure production.',
            etats: [
                ['Commandes ouvertes', '3'],
                ['Meilleure récompense', '420 pièces'],
                ['Urgence', '1 commande expire bientôt']
            ],
            actions: [
                ['Consulter les commandes', 'Liste des commandes à connecter au service des commandes', true],
                ['Prioriser une commande', 'Gestion des priorités à venir', false]
            ]
        },
        taverne: {
            icone: 'ᚦ',
            surtitre: 'Le cœur social',
            titre: 'La taverne',
            description: 'Voyageurs, brasseurs et marchands s’y croisent. À terme, ce lieu reliera les joueurs et fera circuler commandes, recettes et réputation.',
            etats: [
                ['Voyageurs présents', '4'],
                ['Ambiance', 'Chaleureuse'],
                ['Fût du soir', 'Hydromel de brume']
            ],
            actions: [
                ['Entrer dans la taverne', 'La taverne communautaire arrive dans une prochaine étape', true]
            ]
        }
    };

    let minuterieNotification;
    let contexteAudio = null;
    let noeudGain = null;
    let intervalleAmbiance = null;

    const afficherNotification = (message) => {
        clearTimeout(minuterieNotification);
        notification.textContent = message;
        notification.classList.add('est-visible');
        minuterieNotification = setTimeout(() => notification.classList.remove('est-visible'), 2800);
    };

    const remplirPanneau = (zone) => {
        const lieu = lieux[zone];
        if (!lieu) return;

        iconeLieu.textContent = lieu.icone;
        surtitreLieu.textContent = lieu.surtitre;
        titreLieu.textContent = lieu.titre;
        descriptionLieu.textContent = lieu.description;
        etatLieu.innerHTML = lieu.etats
            .map(([libelle, valeur]) => `<div class="ligne-etat"><span>${libelle}</span><strong>${valeur}</strong></div>`)
            .join('');
        actionsLieu.innerHTML = lieu.actions
            .map(([texte, message, forte]) => `<button type="button" class="action-lieu${forte ? ' action-lieu--forte' : ''}" data-message="${message.replace(/"/g, '&quot;')}">${texte}</button>`)
            .join('');

        actionsLieu.querySelectorAll('[data-message]').forEach((bouton) => {
            bouton.addEventListener('click', () => afficherNotification(bouton.dataset.message));
        });
    };

    const activerZone = (zone) => {
        if (!lieux[zone]) return;
        jeu.dataset.zoneActive = zone;
        remplirPanneau(zone);

        document.querySelectorAll('[data-zone]').forEach((element) => {
            element.classList.toggle('est-actif', element.dataset.zone === zone);
        });

        if (zone === 'domaine') {
            intro.classList.remove('est-cachee');
            panneau.classList.remove('est-visible');
        } else {
            intro.classList.add('est-cachee');
            panneau.classList.add('est-visible');
        }
    };

    document.querySelectorAll('[data-zone]').forEach((element) => {
        element.addEventListener('click', () => activerZone(element.dataset.zone));
        element.addEventListener('keydown', (evenement) => {
            if (evenement.key === 'Enter' || evenement.key === ' ') {
                evenement.preventDefault();
                activerZone(element.dataset.zone);
            }
        });
    });

    fermerPanneau.addEventListener('click', () => activerZone('domaine'));

    document.addEventListener('keydown', (evenement) => {
        if (evenement.key === 'Escape') activerZone('domaine');
    });

    boutonPleinEcran.addEventListener('click', async () => {
        try {
            if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
            else await document.exitFullscreen();
        } catch (_) {
            afficherNotification('Le plein écran n’est pas disponible dans ce navigateur.');
        }
    });

    const jouerNote = (frequence, duree = 2.8, volume = .016) => {
        if (!contexteAudio || !noeudGain) return;
        const oscillateur = contexteAudio.createOscillator();
        const enveloppe = contexteAudio.createGain();
        oscillateur.type = 'sine';
        oscillateur.frequency.value = frequence;
        enveloppe.gain.setValueAtTime(0, contexteAudio.currentTime);
        enveloppe.gain.linearRampToValueAtTime(volume, contexteAudio.currentTime + .7);
        enveloppe.gain.exponentialRampToValueAtTime(.0001, contexteAudio.currentTime + duree);
        oscillateur.connect(enveloppe);
        enveloppe.connect(noeudGain);
        oscillateur.start();
        oscillateur.stop(contexteAudio.currentTime + duree + .1);
    };

    const demarrerAmbiance = async () => {
        const AudioContexte = window.AudioContext || window.webkitAudioContext;
        if (!AudioContexte) {
            afficherNotification('L’ambiance sonore n’est pas prise en charge ici.');
            return;
        }

        if (!contexteAudio) {
            contexteAudio = new AudioContexte();
            noeudGain = contexteAudio.createGain();
            noeudGain.gain.value = .65;
            noeudGain.connect(contexteAudio.destination);
        }
        await contexteAudio.resume();

        jouerNote(110, 4.5, .012);
        jouerNote(164.81, 5.2, .009);
        intervalleAmbiance = setInterval(() => {
            const notes = [110, 123.47, 146.83, 164.81, 196];
            jouerNote(notes[Math.floor(Math.random() * notes.length)], 4 + Math.random() * 2.5, .008 + Math.random() * .007);
        }, 3600);
    };

    const couperAmbiance = () => {
        clearInterval(intervalleAmbiance);
        intervalleAmbiance = null;
        if (contexteAudio?.state === 'running') contexteAudio.suspend();
    };

    boutonSon.addEventListener('click', async () => {
        const actif = boutonSon.getAttribute('aria-pressed') === 'true';
        if (actif) {
            couperAmbiance();
            boutonSon.setAttribute('aria-pressed', 'false');
            boutonSon.textContent = '♪';
            afficherNotification('Ambiance sonore coupée.');
        } else {
            await demarrerAmbiance();
            boutonSon.setAttribute('aria-pressed', 'true');
            boutonSon.textContent = '♫';
            afficherNotification('Ambiance sonore activée.');
        }
    });

    const actualiserHeure = () => {
        const maintenant = new Date();
        heureJeu.textContent = maintenant.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
    };
    actualiserHeure();
    setInterval(actualiserHeure, 30000);

    const carte = document.querySelector('.carte');
    if (carte && window.matchMedia('(pointer:fine)').matches) {
        carte.addEventListener('pointermove', (evenement) => {
            if (jeu.dataset.zoneActive !== 'domaine') return;
            const rect = carte.getBoundingClientRect();
            const x = ((evenement.clientX - rect.left) / rect.width - .5) * 8;
            const y = ((evenement.clientY - rect.top) / rect.height - .5) * 6;
            carte.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        });
        carte.addEventListener('pointerleave', () => {
            carte.style.transform = '';
        });
    }

    remplirPanneau('domaine');
})();

(() => {
    const jeu = document.getElementById('jeu');
    const carte = document.querySelector('.carte');
    if (!jeu) return;

    const definirPhase = () => {
        const heure = new Date().getHours();
        let phase = 'nuit';
        if (heure >= 6 && heure < 9) phase = 'aube';
        else if (heure >= 9 && heure < 18) phase = 'jour';
        else if (heure >= 18 && heure < 21) phase = 'crepuscule';
        jeu.dataset.phase = phase;
    };

    definirPhase();
    setInterval(definirPhase, 5 * 60 * 1000);

    if (window.matchMedia('(pointer:fine)').matches) {
        let cibleX = 50;
        let cibleY = 50;
        let actuelleX = 50;
        let actuelleY = 50;
        let animation = 0;

        const dessiner = () => {
            actuelleX += (cibleX - actuelleX) * .075;
            actuelleY += (cibleY - actuelleY) * .075;
            jeu.style.setProperty('--curseur-x', `${actuelleX}%`);
            jeu.style.setProperty('--curseur-y', `${actuelleY}%`);
            animation = requestAnimationFrame(dessiner);
        };

        window.addEventListener('pointermove', (event) => {
            cibleX = event.clientX / window.innerWidth * 100;
            cibleY = event.clientY / window.innerHeight * 100;

            if (!carte || jeu.dataset.zoneActive !== 'domaine') return;
            const dx = (event.clientX / window.innerWidth - .5) * 5;
            const dy = (event.clientY / window.innerHeight - .5) * 3;
            carte.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotateX(${-dy * .08}deg) rotateY(${dx * .08}deg)`;
        }, { passive: true });

        window.addEventListener('pointerleave', () => {
            cibleX = 50;
            cibleY = 50;
            if (carte) carte.style.transform = '';
        });

        animation = requestAnimationFrame(dessiner);
        window.addEventListener('beforeunload', () => cancelAnimationFrame(animation), { once: true });
    }

    document.querySelectorAll('.zone').forEach((zone) => {
        zone.addEventListener('pointerdown', () => {
            zone.animate(
                [
                    { transform: 'scale(1)' },
                    { transform: 'scale(.985)' },
                    { transform: 'scale(1)' }
                ],
                { duration: 280, easing: 'cubic-bezier(.2,.7,.2,1)' }
            );
        });
    });

    requestAnimationFrame(() => {
        requestAnimationFrame(() => jeu.classList.add('est-charge'));
    });
})();

(() => {
    if (document.querySelector('script[data-brewstead-life]')) return;
    const script = document.createElement('script');
    script.src = '/js/brewstead-life.js';
    script.defer = true;
    script.dataset.brewsteadLife = 'true';
    document.body.appendChild(script);
})();
