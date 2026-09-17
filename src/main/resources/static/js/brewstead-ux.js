(() => {
    const jeu = document.getElementById('jeu');
    if (!jeu) return;

    const STOCKAGE = 'mjodheim.ux.v1';
    const VISITE = 'mjodheim.onboarding.v1';
    const ZONE = 'mjodheim.zone.v1';
    const defauts = {
        mouvementReduit: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
        effetsReduits: !!navigator.connection?.saveData || (navigator.deviceMemory && navigator.deviceMemory <= 4),
        contrasteEleve: false,
        interfaceCompacte: false
    };

    const chargerPreferences = () => {
        try { return { ...defauts, ...JSON.parse(localStorage.getItem(STOCKAGE) || '{}') }; }
        catch (_) { return { ...defauts }; }
    };
    let prefs = chargerPreferences();

    const sauver = () => {
        try { localStorage.setItem(STOCKAGE, JSON.stringify(prefs)); } catch (_) {}
    };

    const ajouterStyle = () => {
        if (document.querySelector('link[data-brewstead-ux]')) return;
        const lien = document.createElement('link');
        lien.rel = 'stylesheet';
        lien.href = '/css/brewstead-ux.css';
        lien.dataset.brewsteadUx = 'true';
        document.head.appendChild(lien);
    };

    const appliquerPreferences = () => {
        document.body.classList.toggle('ux-mouvement-reduit', !!prefs.mouvementReduit);
        document.body.classList.toggle('ux-effets-reduits', !!prefs.effetsReduits);
        document.body.classList.toggle('ux-contraste-eleve', !!prefs.contrasteEleve);
        document.body.classList.toggle('ux-interface-compacte', !!prefs.interfaceCompacte);
        document.querySelectorAll('[data-pref]').forEach((bouton) => {
            bouton.setAttribute('aria-pressed', String(!!prefs[bouton.dataset.pref]));
        });
    };

    const creerChargement = () => {
        const ecran = document.createElement('div');
        ecran.className = 'chargement-domaine';
        ecran.innerHTML = `
            <div class="chargement-domaine__centre">
                <div class="chargement-domaine__rune">ᛗ</div>
                <strong>Mjödheim</strong>
                <small>Le domaine s’éveille…</small>
            </div>`;
        document.body.appendChild(ecran);
        const terminer = () => setTimeout(() => ecran.classList.add('est-termine'), 180);
        if (document.readyState === 'complete') terminer();
        else window.addEventListener('load', terminer, { once:true });
        setTimeout(() => ecran.classList.add('est-termine'), 2200);
    };

    const ajouterObjectif = () => {
        if (document.querySelector('.ux-objectif')) return;
        const objectif = document.createElement('aside');
        objectif.className = 'ux-objectif';
        objectif.setAttribute('aria-label', 'Objectif actuel');
        objectif.innerHTML = `<small>Objectif du domaine</small><strong>Découvre les lieux de Mjödheim</strong><span>Explore les bâtiments pour préparer tes premières productions.</span>`;
        document.body.appendChild(objectif);
    };

    const ajouterBoutons = () => {
        const actions = document.querySelector('.actions-hautes');
        if (!actions || actions.querySelector('[data-ux-reglages]')) return;

        const aide = document.createElement('button');
        aide.className = 'ux-bouton';
        aide.type = 'button';
        aide.title = 'Aide et raccourcis';
        aide.setAttribute('aria-label', 'Aide et raccourcis');
        aide.dataset.uxAide = 'true';
        aide.textContent = '?';

        const reglages = document.createElement('button');
        reglages.className = 'ux-bouton';
        reglages.type = 'button';
        reglages.title = 'Réglages d’affichage';
        reglages.setAttribute('aria-label', 'Réglages d’affichage');
        reglages.dataset.uxReglages = 'true';
        reglages.textContent = '⚙';

        actions.append(aide, reglages);
    };

    const creerPanneau = () => {
        if (document.getElementById('uxPanneau')) return document.getElementById('uxPanneau');
        const panneau = document.createElement('aside');
        panneau.id = 'uxPanneau';
        panneau.className = 'ux-panneau';
        panneau.setAttribute('aria-hidden','true');
        panneau.innerHTML = `
            <div class="ux-panneau__entete">
                <div><small>Confort de jeu</small><h2>Réglages</h2></div>
                <button class="ux-fermer" type="button" aria-label="Fermer les réglages">×</button>
            </div>
            <section class="ux-section">
                <h3>Affichage</h3>
                ${ligneReglage('Animations réduites','Réduit les mouvements et transitions.','mouvementReduit')}
                ${ligneReglage('Effets légers','Réduit brume, particules et éléments décoratifs.','effetsReduits')}
                ${ligneReglage('Contraste renforcé','Améliore la lisibilité des panneaux et textes.','contrasteEleve')}
                ${ligneReglage('Interface compacte','Prend moins de place sur les petits écrans.','interfaceCompacte')}
            </section>
            <section class="ux-section">
                <h3>Visite</h3>
                <button class="ux-action-secondaire" type="button" data-relancer-visite>Relancer l’accueil guidé</button>
                <button class="ux-action-secondaire" type="button" data-reinitialiser-ux>Réinitialiser mes préférences d’interface</button>
            </section>`;
        document.body.appendChild(panneau);
        panneau.querySelector('.ux-fermer').addEventListener('click', fermerPanneau);
        panneau.querySelectorAll('[data-pref]').forEach((b) => b.addEventListener('click', () => basculerPref(b.dataset.pref)));
        panneau.querySelector('[data-relancer-visite]').addEventListener('click', () => { fermerPanneau(); ouvrirOnboarding(true); });
        panneau.querySelector('[data-reinitialiser-ux]').addEventListener('click', () => {
            prefs = { ...defauts }; sauver(); appliquerPreferences();
            notifier('Préférences d’interface réinitialisées.');
        });
        return panneau;
    };

    function ligneReglage(titre, detail, cle) {
        return `<div class="ux-reglage"><div><strong>${titre}</strong><span>${detail}</span></div><button class="ux-interrupteur" type="button" data-pref="${cle}" aria-label="${titre}" aria-pressed="false"></button></div>`;
    }

    const creerAide = () => {
        if (document.getElementById('uxAide')) return document.getElementById('uxAide');
        const aide = document.createElement('aside');
        aide.id = 'uxAide';
        aide.className = 'ux-panneau';
        aide.setAttribute('aria-hidden','true');
        aide.innerHTML = `
            <div class="ux-panneau__entete">
                <div><small>Navigation</small><h2>Aide</h2></div>
                <button class="ux-fermer" type="button" aria-label="Fermer l’aide">×</button>
            </div>
            <section class="ux-section">
                <h3>Raccourcis clavier</h3>
                <div class="ux-raccourcis">
                    ${raccourci('D','Domaine')}${raccourci('C','Champs')}${raccourci('R','Rucher')}${raccourci('L','Laboratoire')}
                    ${raccourci('B','Brasserie')}${raccourci('S','Réserves')}${raccourci('O','Commandes')}${raccourci('T','Taverne')}
                    ${raccourci('M','Son')}${raccourci('?','Aide')}${raccourci('Échap','Retour / fermer')}
                </div>
            </section>
            <section class="ux-section">
                <h3>Gestes utiles</h3>
                <div class="ux-reglage"><div><strong>Cliquer sur un lieu</strong><span>Approche la caméra du bâtiment choisi.</span></div></div>
                <div class="ux-reglage"><div><strong>Double-cliquer</strong><span>Entre directement dans la brasserie, le laboratoire ou la taverne.</span></div></div>
                <div class="ux-reglage"><div><strong>Plein écran</strong><span>Utilise le bouton ⛶ pour une expérience plus immersive.</span></div></div>
            </section>`;
        document.body.appendChild(aide);
        aide.querySelector('.ux-fermer').addEventListener('click', fermerAide);
        return aide;
    };

    const raccourci = (touche, nom) => `<div class="ux-raccourci"><kbd>${touche}</kbd><span>${nom}</span></div>`;

    let panneauOuvert = null;
    const ouvrirPanneau = () => { fermerAide(); const p=creerPanneau(); p.classList.add('est-ouvert'); p.setAttribute('aria-hidden','false'); panneauOuvert=p; p.querySelector('.ux-fermer')?.focus(); appliquerPreferences(); };
    function fermerPanneau(){ const p=document.getElementById('uxPanneau'); p?.classList.remove('est-ouvert'); p?.setAttribute('aria-hidden','true'); if(panneauOuvert===p) panneauOuvert=null; }
    const ouvrirAide = () => { fermerPanneau(); const p=creerAide(); p.classList.add('est-ouvert'); p.setAttribute('aria-hidden','false'); panneauOuvert=p; p.querySelector('.ux-fermer')?.focus(); };
    function fermerAide(){ const p=document.getElementById('uxAide'); p?.classList.remove('est-ouvert'); p?.setAttribute('aria-hidden','true'); if(panneauOuvert===p) panneauOuvert=null; }

    const basculerPref = (cle) => { prefs[cle] = !prefs[cle]; sauver(); appliquerPreferences(); };

    const creerOnboarding = () => {
        if (document.getElementById('uxOnboarding')) return document.getElementById('uxOnboarding');
        const modal = document.createElement('section');
        modal.id = 'uxOnboarding';
        modal.className = 'ux-onboarding';
        modal.setAttribute('aria-hidden','true');
        modal.innerHTML = `
            <div class="ux-onboarding__carte" role="dialog" aria-modal="true" aria-labelledby="uxBienvenue">
                <div class="ux-onboarding__rune">ᛗ</div>
                <h1 id="uxBienvenue">Bienvenue à Mjödheim.</h1>
                <p class="ux-onboarding__intro">Ton domaine est un petit monde vivant. Cultive, récolte, expérimente tes recettes et fais de ta brasserie un lieu connu bien au-delà de la vallée.</p>
                <div class="ux-etapes">
                    <article class="ux-etape"><span>1</span><strong>Explore</strong><p>Clique sur les bâtiments ou utilise la boussole pour parcourir le domaine.</p></article>
                    <article class="ux-etape"><span>2</span><strong>Produis</strong><p>Les champs, le rucher et les réserves alimenteront progressivement tes recettes.</p></article>
                    <article class="ux-etape"><span>3</span><strong>Crée</strong><p>Le laboratoire et la brasserie seront le cœur de ton identité de maître brasseur.</p></article>
                </div>
                <div class="ux-onboarding__actions">
                    <button class="ux-commencer" type="button" data-commencer>Entrer dans le domaine</button>
                    <button class="ux-visite-guidee" type="button" data-voir-aide>Voir les commandes</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        modal.querySelector('[data-commencer]').addEventListener('click', fermerOnboarding);
        modal.querySelector('[data-voir-aide]').addEventListener('click', () => { fermerOnboarding(); ouvrirAide(); });
        return modal;
    };

    function ouvrirOnboarding(force=false){
        if (!force) {
            try { if (localStorage.getItem(VISITE) === 'vu') return; } catch(_) {}
        }
        const modal=creerOnboarding();
        modal.classList.add('est-ouvert'); modal.setAttribute('aria-hidden','false');
        setTimeout(()=>modal.querySelector('[data-commencer]')?.focus(),150);
    }
    function fermerOnboarding(){
        const modal=document.getElementById('uxOnboarding');
        modal?.classList.remove('est-ouvert'); modal?.setAttribute('aria-hidden','true');
        try { localStorage.setItem(VISITE,'vu'); } catch(_) {}
    }

    const notifier = (message) => {
        const notif=document.getElementById('notification');
        if (!notif) return;
        notif.textContent=message; notif.classList.add('est-visible');
        clearTimeout(notifier.timer); notifier.timer=setTimeout(()=>notif.classList.remove('est-visible'),2600);
    };

    const ajouterEtatReseau = () => {
        const el=document.createElement('div'); el.className='ux-reseau'; el.setAttribute('role','status'); document.body.appendChild(el);
        const afficher=(message)=>{ el.textContent=message; el.classList.add('est-visible'); clearTimeout(afficher.timer); afficher.timer=setTimeout(()=>el.classList.remove('est-visible'),3200); };
        window.addEventListener('offline',()=>afficher('Connexion perdue — le domaine reste affiché, mais les actions en ligne attendront.'));
        window.addEventListener('online',()=>afficher('Connexion rétablie.'));
        if (!navigator.onLine) afficher('Tu es actuellement hors ligne.');
    };

    const navigationClavier = () => {
        const zones = { d:'domaine', c:'champs', r:'rucher', l:'laboratoire', b:'brasserie', s:'reserve', o:'commandes', t:'taverne' };
        document.addEventListener('keydown',(event)=>{
            const cible=event.target;
            if (cible?.matches?.('input,textarea,select,[contenteditable="true"]')) return;
            if (event.key === '?') { event.preventDefault(); ouvrirAide(); return; }
            if (event.key.toLowerCase() === 'm') { event.preventDefault(); document.getElementById('boutonSon')?.click(); return; }
            if (event.key === 'Escape') {
                if (document.getElementById('uxOnboarding')?.classList.contains('est-ouvert')) { fermerOnboarding(); return; }
                if (panneauOuvert) { fermerPanneau(); fermerAide(); return; }
            }
            const zone=zones[event.key.toLowerCase()];
            if (!zone) return;
            const bouton=document.querySelector(`.boussole [data-zone="${zone}"]`) || document.querySelector(`[data-zone="${zone}"]`);
            if (bouton) { event.preventDefault(); bouton.click(); bouton.focus({preventScroll:true}); }
        },true);
    };

    const memoriserZone = () => {
        const obs=new MutationObserver(()=>{
            const zone=jeu.dataset.zoneActive;
            if (zone) try { sessionStorage.setItem(ZONE,zone); } catch(_) {}
        });
        obs.observe(jeu,{attributes:true,attributeFilter:['data-zone-active']});

        let precedente='';
        try { precedente=sessionStorage.getItem(ZONE)||''; } catch(_) {}
        if (precedente && precedente !== 'domaine') {
            setTimeout(()=>document.querySelector(`.boussole [data-zone="${precedente}"]`)?.click(),650);
        }
    };

    const cycleViePage = () => {
        document.addEventListener('visibilitychange',()=>document.documentElement.classList.toggle('page-cachee',document.hidden));
    };

    ajouterStyle();
    creerChargement();
    ajouterObjectif();
    ajouterBoutons();
    creerPanneau();
    creerAide();
    ajouterEtatReseau();
    appliquerPreferences();
    navigationClavier();
    memoriserZone();
    cycleViePage();

    document.querySelector('[data-ux-reglages]')?.addEventListener('click',()=> document.getElementById('uxPanneau')?.classList.contains('est-ouvert') ? fermerPanneau() : ouvrirPanneau());
    document.querySelector('[data-ux-aide]')?.addEventListener('click',()=> document.getElementById('uxAide')?.classList.contains('est-ouvert') ? fermerAide() : ouvrirAide());

    setTimeout(()=>ouvrirOnboarding(false),750);
})();
