(() => {
  const jeu = document.getElementById('jeu');
  const image = document.getElementById('sceneImage');
  const panneau = document.getElementById('panneauLieu');
  const fermer = document.getElementById('fermerPanneau');
  const titre = document.getElementById('titreLieu');
  const surtitre = document.getElementById('surtitreLieu');
  const description = document.getElementById('descriptionLieu');
  const action = document.getElementById('actionLieu');
  const notification = document.getElementById('notification');
  if (!jeu) return;

  const lieux = {
    rucher: {
      surtitre: 'Miel & cire',
      titre: 'Rucher',
      description: 'Inspecte les ruches, surveille leur production et récolte le miel destiné aux hydromels.',
      action: 'Entrer dans le rucher'
    },
    champs: {
      surtitre: 'Cultures du domaine',
      titre: 'Champs',
      description: 'Cultive céréales, aromates et plantes utiles à tes recettes et à la vie du domaine.',
      action: 'Gérer les cultures'
    },
    reserve: {
      surtitre: 'Stocks & matières',
      titre: 'Entrepôt',
      description: 'Retrouve ici les récoltes, ingrédients, matières premières et produits prêts à être utilisés.',
      action: 'Voir les stocks'
    },
    brasserie: {
      surtitre: 'Le cœur de Brewstead',
      titre: 'Brasserie',
      description: 'Prépare tes recettes, lance les brassins et suis fermentation, maturation et mise en fût.',
      action: 'Entrer dans la brasserie'
    },
    laboratoire: {
      surtitre: 'Recherche & recettes',
      titre: 'Laboratoire',
      description: 'Expérimente de nouvelles associations et développe les recettes qui feront la réputation de Mjödheim.',
      action: 'Ouvrir le laboratoire'
    },
    taverne: {
      surtitre: 'Voyageurs & réputation',
      titre: 'Taverne',
      description: 'Sers tes productions, accueille les voyageurs et fais vivre la réputation de ton domaine.',
      action: 'Entrer dans la taverne'
    },
    commandes: {
      surtitre: 'Commerce',
      titre: 'Commandes',
      description: 'Consulte les demandes en cours, prépare les livraisons et transforme tes productions en revenus.',
      action: 'Voir les commandes'
    }
  };

  let zoneActive = null;
  let notificationTimer;
  let fallbackStarted = false;
  let objectUrl = null;

  function notifier(message) {
    if (!notification) return;
    clearTimeout(notificationTimer);
    notification.textContent = message;
    notification.classList.add('is-visible');
    notificationTimer = setTimeout(() => notification.classList.remove('is-visible'), 2200);
  }

  function fermerPanneau() {
    zoneActive = null;
    jeu.dataset.zoneActive = 'domaine';
    panneau?.classList.remove('is-open');
    panneau?.setAttribute('aria-hidden', 'true');
    document.querySelectorAll('.hotspot.is-active').forEach(el => el.classList.remove('is-active'));
  }

  function ouvrirPanneau(zone, source) {
    const lieu = lieux[zone];
    if (!lieu || !panneau) return;
    zoneActive = zone;
    jeu.dataset.zoneActive = zone;
    surtitre.textContent = lieu.surtitre;
    titre.textContent = lieu.titre;
    description.textContent = lieu.description;
    action.textContent = lieu.action;
    panneau.classList.add('is-open');
    panneau.setAttribute('aria-hidden', 'false');
    document.querySelectorAll('.hotspot.is-active').forEach(el => el.classList.remove('is-active'));
    source?.classList.add('is-active');
  }

  document.addEventListener('click', event => {
    const hotspot = event.target.closest?.('.hotspot[data-zone]');
    if (hotspot) {
      ouvrirPanneau(hotspot.dataset.zone, hotspot);
      return;
    }
    if (event.target === action && zoneActive) {
      notifier(`${lieux[zoneActive].titre} sélectionné.`);
    }
  });

  fermer?.addEventListener('click', fermerPanneau);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') fermerPanneau();
  });

  window.setBrewsteadWeather = weather => {
    const allowed = new Set(['clear', 'rain', 'snow']);
    jeu.dataset.weather = allowed.has(weather) ? weather : 'clear';
  };

  const requestedWeather = new URLSearchParams(location.search).get('weather');
  if (requestedWeather) window.setBrewsteadWeather(requestedWeather);

  async function chargerImageDepuisSegments() {
    if (!image || fallbackStarted) return;
    fallbackStarted = true;
    try {
      const urls = Array.from({ length: 16 }, (_, i) =>
        `/images/brewstead-reference.webp.b64.part${String(i).padStart(2, '0')}`
      );
      const parts = await Promise.all(urls.map(async url => {
        const response = await fetch(url, { cache: 'force-cache' });
        if (!response.ok) throw new Error(`Segment absent: ${url}`);
        return response.text();
      }));
      const encoded = parts.join('').replace(/\s+/g, '');
      const raw = atob(encoded);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
      image.src = objectUrl;
      image.addEventListener('load', () => jeu.classList.remove('scene-missing'), { once: true });
      image.addEventListener('error', () => jeu.classList.add('scene-missing'), { once: true });
    } catch (error) {
      console.error('Impossible de reconstruire le décor Brewstead.', error);
      jeu.classList.add('scene-missing');
    }
  }

  if (image) {
    image.addEventListener('error', chargerImageDepuisSegments, { once: true });
    if (image.complete && image.naturalWidth === 0) chargerImageDepuisSegments();
  }

  window.addEventListener('beforeunload', () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }, { once: true });
})();