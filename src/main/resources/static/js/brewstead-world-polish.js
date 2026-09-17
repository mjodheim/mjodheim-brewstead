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
