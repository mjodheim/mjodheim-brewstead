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
  if (!jeu) return;

  const lieux = {
    domaine: {
      icone:'ᛗ', surtitre:'Ta vallée', titre:'Le domaine de Mjödheim',
      description:'Ton Brewstead s’étend entre les montagnes et le fjord. Chaque lieu nourrit une même boucle : récolter, expérimenter, brasser, vendre et faire grandir ta renommée.',
      etats:[['Saison','Fin d’été'],['Météo','Lumière dorée'],['Activité','Le domaine est éveillé']], actions:[]
    },
    champs: {
      icone:'🌾', surtitre:'Terres de la vallée', titre:'Les champs',
      description:'Cultive les céréales et plantes nécessaires à tes recettes. Les parcelles suivent leur propre cycle jusqu’à la récolte.',
      etats:[['Parcelle I','Orge · 03:42'],['Parcelle II','Seigle · prêt'],['Parcelle III','Libre']],
      actions:[['Récolter le seigle','Récolte disponible côté backend.',true],['Planter une culture','Le choix de culture sera relié à FarmService.',false]]
    },
    rucher: {
      icone:'⬡', surtitre:'Miel & cire', titre:'Le rucher',
      description:'Les ruches transforment le temps en miel. Cette ressource précieuse devient la base de tes hydromels.',
      etats:[['Ruche du vieux chêne','61 %'],['Ruche de la rivière','88 %'],['Production','2 ruches actives']],
      actions:[['Inspecter les ruches','Le rucher est prêt à être relié à ApiaryService.',true],['Récolter le miel','Action disponible lorsqu’une ruche est READY.',false]]
    },
    laboratoire: {
      icone:'⚗', surtitre:'Expérimentation', titre:'Le laboratoire',
      description:'Ici naissent les recettes qui rendent ton domaine unique. Combine ingrédients, volume et fermentation pour créer tes propres signatures.',
      etats:[['Recettes connues','6'],['Dernière découverte','Hydromel de brume'],['Qualité record','88']],
      actions:[['Créer une recette','Le moteur de recettes est prêt côté backend.',true],['Ouvrir le carnet','Le carnet sera alimenté par RecipeService.',false]]
    },
    brasserie: {
      icone:'♨', surtitre:'Cuivre & fermentation', titre:'La brasserie',
      description:'Le cœur chaud du Brewstead. Les ingrédients quittent les réserves, entrent dans les cuves et deviennent des brassins qui évoluent avec le temps.',
      etats:[['Cuve I','Hydromel · 47 %'],['Cuve II','Bière du Skalde · 83 %'],['Brassins actifs','2']],
      actions:[['Lancer un brassin','BrewService est prêt à recevoir cette action.',true],['Voir les fermentations','Les états de production sont disponibles côté backend.',false]]
    },
    reserve: {
      icone:'▤', surtitre:'Stocks du domaine', titre:'Les réserves',
      description:'Tout ce que tu cultives, récoltes ou achètes finit ici avant de repartir vers une recette, une commande ou une production.',
      etats:[['Orge','12,5 kg'],['Miel','3 kg'],['Houblon','250 g']],
      actions:[['Ouvrir l’inventaire','InventoryService est prêt côté backend.',true]]
    },
    commandes: {
      icone:'✉', surtitre:'Clients & voyageurs', titre:'Les commandes',
      description:'PNJ et joueurs déposent leurs besoins. Satisfaire une commande transforme tes stocks en pièces et en renommée.',
      etats:[['Ouvertes','3'],['Meilleure récompense','420 pièces'],['Urgence','1 expire bientôt']],
      actions:[['Consulter les commandes','Les services de commandes PNJ et joueurs sont prêts.',true],['Préparer une livraison','La livraison sera branchée après la sécurité.',false]]
    },
    taverne: {
      icone:'ᚦ', surtitre:'Le cœur social', titre:'La taverne',
      description:'Le lieu où le monde de Mjödheim se rencontre. Voyageurs, boissons, commandes et renommée y convergent.',
      etats:[['Voyageurs','4'],['Ambiance','Chaleureuse'],['Fût du soir','Hydromel de brume']],
      actions:[['Entrer dans la taverne','TavernService est prêt pour le raccordement.',true]]
    }
  };

  let notificationTimer;
  let audioContext;
  let gain;
  let ambienceTimer;

  const zones = [...document.querySelectorAll('[data-zone]')];

  function notifier(message){
    if(!notification) return;
    clearTimeout(notificationTimer);
    notification.textContent = message;
    notification.classList.add('est-visible');
    notificationTimer = setTimeout(()=>notification.classList.remove('est-visible'),2600);
  }

  function remplirPanneau(zone){
    const lieu = lieux[zone];
    if(!lieu) return;
    iconeLieu.textContent = lieu.icone;
    surtitreLieu.textContent = lieu.surtitre;
    titreLieu.textContent = lieu.titre;
    descriptionLieu.textContent = lieu.description;
    etatLieu.innerHTML = lieu.etats.map(([label,value]) => `<div class="ligne-etat"><span>${label}</span><strong>${value}</strong></div>`).join('');
    actionsLieu.innerHTML = lieu.actions.map(([label,msg,strong]) => `<button type="button" class="action-lieu${strong?' action-lieu--forte':''}" data-message="${msg.replace(/"/g,'&quot;')}">${label}</button>`).join('');
  }

  function activerZone(zone){
    if(!lieux[zone]) return;
    jeu.dataset.zoneActive = zone;
    zones.forEach(el=>el.classList.toggle('est-actif',el.dataset.zone===zone));
    remplirPanneau(zone);
    if(zone==='domaine'){
      intro?.classList.remove('est-cachee');
      panneau?.classList.remove('est-visible');
    } else {
      intro?.classList.add('est-cachee');
      panneau?.classList.add('est-visible');
    }
  }

  document.addEventListener('click',event=>{
    const action = event.target.closest?.('.action-lieu[data-message]');
    if(action){notifier(action.dataset.message);return;}
    const cible = event.target.closest?.('[data-zone]');
    if(cible) activerZone(cible.dataset.zone);
  });

  document.addEventListener('keydown',event=>{
    const cible = event.target.closest?.('[data-zone]');
    if(cible && (event.key==='Enter' || event.key===' ')){
      event.preventDefault();activerZone(cible.dataset.zone);return;
    }
    if(event.key==='Escape') activerZone('domaine');
  });

  fermerPanneau?.addEventListener('click',()=>activerZone('domaine'));

  boutonPleinEcran?.addEventListener('click',async()=>{
    try{
      if(!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    }catch{notifier('Le plein écran n’est pas disponible ici.');}
  });

  function note(freq,duration=2.8,volume=.012){
    if(!audioContext || !gain) return;
    const osc=audioContext.createOscillator();
    const env=audioContext.createGain();
    osc.type='sine';osc.frequency.value=freq;
    env.gain.setValueAtTime(.0001,audioContext.currentTime);
    env.gain.exponentialRampToValueAtTime(volume,audioContext.currentTime+.45);
    env.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+duration);
    osc.connect(env);env.connect(gain);osc.start();osc.stop(audioContext.currentTime+duration+.1);
  }

  async function startAmbience(){
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC){notifier('Ambiance sonore indisponible.');return;}
    if(!audioContext){audioContext=new AC();gain=audioContext.createGain();gain.gain.value=.55;gain.connect(audioContext.destination);}
    await audioContext.resume();
    note(110,4,.01);note(164.81,5,.007);
    clearInterval(ambienceTimer);
    ambienceTimer=setInterval(()=>{if(!document.hidden){const n=[98,110,123.47,146.83,164.81];note(n[Math.floor(Math.random()*n.length)],4+Math.random()*2,.006+Math.random()*.006);}},4300);
  }

  boutonSon?.addEventListener('click',async()=>{
    const actif=boutonSon.getAttribute('aria-pressed')==='true';
    if(actif){clearInterval(ambienceTimer);audioContext?.suspend();boutonSon.setAttribute('aria-pressed','false');boutonSon.textContent='♪';notifier('Ambiance coupée.');}
    else{await startAmbience();boutonSon.setAttribute('aria-pressed','true');boutonSon.textContent='♫';notifier('Ambiance activée.');}
  });

  function updateClock(){if(heureJeu) heureJeu.textContent=new Date().toLocaleTimeString('fr-BE',{hour:'2-digit',minute:'2-digit'});}
  updateClock();setInterval(()=>{if(!document.hidden)updateClock();},60000);

  remplirPanneau('domaine');
  requestAnimationFrame(()=>jeu.classList.add('est-charge'));
})();
