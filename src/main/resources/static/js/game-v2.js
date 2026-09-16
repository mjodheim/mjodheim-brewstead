(() => {
    const jeu = document.querySelector('.jeu');
    const pieces = [...document.querySelectorAll('.piece')];
    const boutonsNavigation = [...document.querySelectorAll('[data-aller]')];
    const notification = document.getElementById('notification');
    const boutonSon = document.getElementById('son');
    const boutonPleinEcran = document.getElementById('pleinEcran');

    let pieceCourante = 'domaine';
    let verrouille = false;
    let minuterieNotification;
    let contexteAudio;
    let ambianceActive = false;
    let oscillateurs = [];

    function indexPiece(nom) {
        return pieces.findIndex(piece => piece.dataset.piece === nom);
    }

    function allerVers(nom) {
        if (verrouille || nom === pieceCourante) return;
        const actuelle = pieces.find(piece => piece.dataset.piece === pieceCourante);
        const suivante = pieces.find(piece => piece.dataset.piece === nom);
        if (!actuelle || !suivante) return;

        verrouille = true;
        const versDroite = indexPiece(nom) > indexPiece(pieceCourante);
        actuelle.classList.add(versDroite ? 'sortie-gauche' : 'sortie-droite');

        setTimeout(() => {
            pieces.forEach(piece => piece.classList.remove('active', 'sortie-gauche', 'sortie-droite'));
            suivante.classList.add('active');
            pieceCourante = nom;
            jeu.dataset.piece = nom;
            document.querySelectorAll('.navigation [data-aller]').forEach(bouton => {
                bouton.classList.toggle('actif', bouton.dataset.aller === nom);
            });
            document.title = `Mjödheim · ${titrePiece(nom)}`;
            verrouille = false;
        }, 330);
    }

    function titrePiece(nom) {
        return ({
            domaine: 'Domaine',
            champs: 'Champs',
            rucher: 'Rucher',
            laboratoire: 'Laboratoire',
            brasserie: 'Brasserie',
            reserves: 'Réserves',
            commandes: 'Commandes',
            taverne: 'Taverne'
        })[nom] || 'Domaine';
    }

    boutonsNavigation.forEach(bouton => {
        bouton.addEventListener('click', () => allerVers(bouton.dataset.aller));
    });

    document.querySelectorAll('[data-message]').forEach(bouton => {
        bouton.addEventListener('click', () => afficherNotification(bouton.dataset.message));
    });

    function afficherNotification(message) {
        clearTimeout(minuterieNotification);
        notification.textContent = message;
        notification.classList.add('visible');
        minuterieNotification = setTimeout(() => notification.classList.remove('visible'), 2600);
    }

    document.addEventListener('keydown', event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        const index = indexPiece(pieceCourante);
        const cible = event.key === 'ArrowRight' ? index + 1 : index - 1;
        if (pieces[cible]) allerVers(pieces[cible].dataset.piece);
    });

    boutonPleinEcran?.addEventListener('click', async () => {
        try {
            if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
            else await document.exitFullscreen();
        } catch {
            afficherNotification('Le plein écran n’est pas disponible dans ce navigateur.');
        }
    });

    boutonSon?.addEventListener('click', async () => {
        ambianceActive = !ambianceActive;
        boutonSon.setAttribute('aria-pressed', String(ambianceActive));
        boutonSon.title = ambianceActive ? 'Couper l’ambiance sonore' : 'Activer l’ambiance sonore';
        if (ambianceActive) {
            await demarrerAmbiance();
            afficherNotification('Ambiance sonore activée.');
        } else {
            arreterAmbiance();
            afficherNotification('Ambiance sonore coupée.');
        }
    });

    async function demarrerAmbiance() {
        if (!contexteAudio) contexteAudio = new (window.AudioContext || window.webkitAudioContext)();
        if (contexteAudio.state === 'suspended') await contexteAudio.resume();
        arreterAmbiance();

        const volume = contexteAudio.createGain();
        volume.gain.value = 0.035;
        volume.connect(contexteAudio.destination);

        const frequences = [73.42, 110, 146.83];
        oscillateurs = frequences.map((frequence, index) => {
            const oscillateur = contexteAudio.createOscillator();
            const gain = contexteAudio.createGain();
            oscillateur.type = index === 0 ? 'sine' : 'triangle';
            oscillateur.frequency.value = frequence;
            gain.gain.value = index === 0 ? 0.34 : 0.12;
            oscillateur.connect(gain);
            gain.connect(volume);
            oscillateur.start();
            return { oscillateur, gain };
        });
    }

    function arreterAmbiance() {
        oscillateurs.forEach(({ oscillateur }) => {
            try { oscillateur.stop(); } catch (_) {}
        });
        oscillateurs = [];
    }
})();