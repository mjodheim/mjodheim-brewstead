/* ==========================================================================
   Brewstead — modèle de données du client
   Lit l'état du jeu via l'API. En cas d'échec, l'erreur remonte telle quelle :
   mieux vaut un message franc qu'un domaine inventé.
   ========================================================================== */

(function (global) {
    'use strict';

    var XP_PER_LEVEL = 1000;
    var AVATARS = ['CERF', 'CORBEAU', 'OURS', 'LOUP', 'ABEILLE', 'ORGE', 'TONNEAU', 'MARTEAU'];

    /* ---------------------------------------------------------------- Lieux
     *
     * « tiroir » marque les lieux dont le panneau montre quelque chose avant
     * d'entrer : les parcelles qui poussent, les ruches, les cuves. Les
     * autres n'avaient qu'une porte de passage devant leur écran — la taverne
     * disait « Entre dans la salle » et rien d'autre — et l'ouvrent donc
     * directement.
     *
     * « x, y » place l'écriteau. « calque » donne le rectangle du bâtiment
     * dans le tableau (1536 x 742), tel qu'il a été découpé dans
     * images/lieux/<id>.webp : c'est le noyau de la découpe, sans les 34 px
     * de fondu qui débordent tout autour. Le CSS s'appuie sur cet écart,
     * donc les deux se déplacent ensemble ou pas du tout.
     */

    var PLACES = [
        {
            id: 'rucher', art: 'art-hive', tiroir: true, calque: { x: 123, y: 87, w: 264, h: 136 }, label: 'Rucher', kicker: 'Miel & cire', icon: 'i-honey',
            x: 285, y: 147, screen: 'rucher',
            intro: "Les ruches du coteau donnent le miel de bruyère qui fait la rondeur de tes hydromels.",
            action: 'Récolter le miel'
        },
        {
            id: 'champs', art: 'art-field', tiroir: true, calque: { x: 82, y: 238, w: 316, h: 124 }, label: 'Champs', kicker: 'Cultures du domaine', icon: 'i-grain',
            x: 241, y: 277, screen: 'champs',
            intro: "Orge, houblon et plantes aromatiques poussent ici, au rythme des saisons du fjord.",
            action: 'Gérer les cultures'
        },
        {
            id: 'entrepot', art: 'art-crate', calque: { x: 174, y: 382, w: 252, h: 136 }, label: 'Entrepôt', kicker: 'Stocks & matières', icon: 'i-pouch',
            x: 292, y: 443, screen: 'inventaire',
            intro: "Tout ce que le domaine produit finit ici avant de repartir en brassin ou en livraison.",
            action: 'Ouvrir l’inventaire'
        },
        {
            id: 'brasserie', art: 'art-vat', tiroir: true, calque: { x: 618, y: 110, w: 388, h: 236 }, label: 'Brasserie', kicker: 'Le cœur de Brewstead', icon: 'i-barrel',
            x: 841, y: 227, screen: 'brasserie',
            intro: "Cuves, fûts et fermentation : c’est ici que les recettes deviennent des bières et des hydromels.",
            action: 'Suivre les brassins'
        },
        {
            id: 'laboratoire', art: 'art-flask', calque: { x: 1188, y: 190, w: 284, h: 204 }, label: 'Laboratoire', kicker: 'Recherche & recettes', icon: 'i-recipe',
            x: 1334, y: 260, screen: 'recettes',
            intro: "On y assemble les recettes, on y note les dosages, on y rate parfois de belles idées.",
            action: 'Ouvrir le grimoire'
        },
        {
            id: 'taverne', art: 'art-BEER', calque: { x: 856, y: 376, w: 328, h: 200 }, label: 'Taverne', kicker: 'Voyageurs & réputation', icon: 'i-tavern',
            x: 934, y: 463, screen: 'taverne',
            intro: "Les voyageurs s’y arrêtent, goûtent, racontent. Ta réputation se construit à cette table.",
            action: 'Entrer dans la taverne'
        },
        {
            id: 'commandes', art: 'art-scroll', calque: { x: 1284, y: 474, w: 176, h: 124 }, label: 'Commandes', kicker: 'Commerce', icon: 'i-orders',
            x: 1364, y: 523, screen: 'commandes',
            intro: "Les demandes des marchands et des autres domaines. Livre à l’heure, la réputation suit.",
            action: 'Voir les commandes'
        }
    ];

    /* ------------------------------------------------------------ Ressources */

    function sumOfType(inventory, type) {
        return inventory.reduce(function (total, item) {
            return item.type === type ? total + Number(item.quantity || 0) : total;
        }, 0);
    }

    /** Litres de breuvage terminés, tous fûts confondus. */
    /**
     * Où en est un brassin, vu par le joueur.
     *
     * <p>Le serveur ne passe un fût à « prêt » qu'au chargement suivant :
     * le compte à rebours arrivait à zéro et la cuve continuait de bouillir
     * jusqu'à quinze secondes. On lit donc l'heure, comme pour les champs.
     * Un fût prêt attend dans sa cuve (« a-soutirer ») jusqu'à ce qu'on le
     * range : il est alors « en-cave », avec la réserve.
     */
    function etatBrassin(batch) {
        if (batch.status === 'SOLD_OUT' || batch.status === 'CANCELLED') return 'fini';
        var pret = batch.status === 'READY' || (batch.readyAt && isDone(batch.readyAt));
        if (!pret) return 'en-cours';
        return batch.cellaredAt ? 'en-cave' : 'a-soutirer';
    }

    function aSoutirer(state) {
        return (state.batches || []).filter(function (b) { return etatBrassin(b) === 'a-soutirer'; });
    }

    /** Ce qui est rangé en cave : le compteur monte au moment où l'on range. */
    function cellarVolume(batches) {
        return batches.reduce(function (total, batch) {
            return etatBrassin(batch) === 'en-cave' ? total + Number(batch.volume || 0) : total;
        }, 0);
    }

    var RESOURCES = [
        { key: 'coins', label: 'Pièces', art: 'art-coin', read: function (s) { return s.player.coins; } },
        { key: 'grain', label: 'Céréales', art: 'art-CEREAL', read: function (s) { return sumOfType(s.inventory, 'CEREAL'); } },
        { key: 'honey', label: 'Miel', art: 'art-HONEY', read: function (s) { return sumOfType(s.inventory, 'HONEY'); } },
        { key: 'hop', label: 'Houblon', art: 'art-HOP', read: function (s) { return sumOfType(s.inventory, 'HOP'); } },
        { key: 'cellar', label: 'En cave', art: 'art-barrel', read: function (s) { return cellarVolume(s.batches); } }
    ];

    /* ------------------------------------------------------------- Formatage */

    var UNITS = { GRAM: 'g', KILOGRAM: 'kg', MILLILITER: 'ml', LITER: 'L', UNIT: '' };

    function number(value) {
        var n = Number(value || 0);
        var rounded = Math.abs(n % 1) < 0.005 ? Math.round(n) : Math.round(n * 10) / 10;
        return rounded.toLocaleString('fr-FR');
    }

    function quantity(value, unit) {
        var suffix = UNITS[unit] === undefined ? '' : UNITS[unit];
        return number(value) + (suffix ? ' ' + suffix : '');
    }

    function countdown(iso) {
        var left = new Date(iso).getTime() - Date.now();
        if (isNaN(left)) return '';
        if (left <= 0) return 'prêt';
        if (left < 60000) return Math.ceil(left / 1000) + ' s';
        var minutes = Math.floor(left / 60000);
        if (minutes < 60) return minutes + ' min';
        var hours = Math.floor(minutes / 60);
        if (hours < 24) return hours + ' h ' + String(minutes % 60).padStart(2, '0');
        return Math.floor(hours / 24) + ' j ' + (hours % 24) + ' h';
    }

    /**
     * Une durée en minutes, dite comme on la dit à voix haute.
     *
     * <p>« 150 min » demande un calcul mental ; « 2 h 30 » ne demande rien.
     */
    function duration(minutes) {
        var m = Math.max(0, Math.round(Number(minutes) || 0));
        if (m < 60) return m + ' min';
        var h = Math.floor(m / 60);
        var reste = m % 60;
        if (h < 24) return reste ? h + ' h ' + String(reste).padStart(2, '0') : h + ' h';
        var j = Math.floor(h / 24);
        return (h % 24) ? j + ' j ' + (h % 24) + ' h' : j + ' j';
    }

    function ratio(startIso, endIso) {
        var start = new Date(startIso).getTime();
        var end = new Date(endIso).getTime();
        if (isNaN(start) || isNaN(end) || end <= start) return 1;
        return Math.min(1, Math.max(0, (Date.now() - start) / (end - start)));
    }

    function isDone(iso) {
        var end = new Date(iso).getTime();
        return isNaN(end) ? false : end <= Date.now();
    }

    /* ------------------------------------------------------------------- API */

    function sessionLost() {
        var error = new Error('Ta session a expiré.');
        error.sessionExpired = true;
        return error;
    }

    function request(url, options) {
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, 12000);
        return fetch(url, Object.assign({}, options, { signal: controller.signal }))
            .catch(function (error) {
                if (error.name === 'AbortError') throw new Error('Le serveur met trop de temps à répondre. Réessaie.');
                throw error;
            }).finally(function () { clearTimeout(timer); });
    }

    function getJson(url) {
        return request(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
            .then(function (response) {
                // Spring renvoie le portail : la session n'est plus valable.
                if (response.redirected && response.url.indexOf('/login') !== -1) throw sessionLost();
                if (response.status === 401 || response.status === 403) throw sessionLost();

                var type = response.headers.get('content-type') || '';
                if (!response.ok || type.indexOf('json') === -1) {
                    throw new Error('Le domaine n’a pas répondu (' + response.status + ').');
                }
                return response.json();
            });
    }

    function postJson(url, body, headers, method) {
        return request(url, {
            method: method || 'POST',
            credentials: 'same-origin',
            headers: headers,
            body: body === undefined ? undefined : JSON.stringify(body)
        }).then(function (response) {
            if (response.redirected && response.url.indexOf('/login') !== -1) throw sessionLost();
            if (response.status === 401 || response.status === 403) throw sessionLost();
            if (!response.ok) {
                return response.json()
                    .catch(function () { return {}; })
                    .then(function (payload) { throw new Error(payload.message || 'Action refusée.'); });
            }
            var type = response.headers.get('content-type') || '';
            return type.indexOf('json') === -1 ? null : response.json();
        });
    }

    function normalise(state, tavern, progression) {
        return {
            source: 'api',
            player: state.player,
            playerId: state.player ? state.player.id : null,
            crops: [],
            effects: [],
            ingredients: [],
            market: [],
            myOrders: [],
            inventory: state.inventory || [],
            fields: state.fields || [],
            hives: state.hives || [],
            recipes: state.recipes || [],
            batches: state.batches || [],
            npcOrders: state.npcOrders || [],
            // Le barème de l'agrandissement vient du serveur : un prix
            // recopié dans le navigateur finit toujours par diverger.
            estate: state.estate || null,
            progression: progression || null,
            tavern: tavern || { notablePlayers: [], openPlayerOrders: 0 }
        };
    }

    var accountId = null;
    var catalogs = null;

    function loadCatalogs() {
        if (!catalogs) {
            catalogs = Promise.all([getJson('/api/catalog/crops'), getJson('/api/catalog/ingredients')])
                .catch(function (error) { catalogs = null; throw error; });
        }
        return catalogs;
    }

    /** Le domaine chargé est toujours celui de la session en cours. */
    function load() {
        var identity = accountId !== null ? Promise.resolve(accountId)
            : getJson('/api/account/me').then(function (account) { accountId = account.id; return accountId; });
        return identity
            .then(function (id) {
                // La visite peut attribuer une récompense (série ou haut fait) :
                // on la comptabilise avant de relire le profil et ses ressources.
                return Promise.all([
                    getJson('/api/progression').then(function (progression) {
                        return getJson('/api/players/' + id + '/state').then(function (state) {
                            return { state: state, progression: progression };
                        });
                    }),
                    getJson('/api/tavern'),
                    loadCatalogs(),
                    getJson('/api/account/me/effects'),
                    getJson('/api/player-orders/market'),
                    getJson('/api/player-orders/players/' + id)
                ]).then(function (results) {
                        var state = normalise(results[0].state, results[1], results[0].progression);
                        state.crops = results[2][0];
                        state.effects = results[3];
                        state.ingredients = results[2][1];
                        state.market = results[4];
                        state.myOrders = results[5];
                        return state;
                });
            });
    }

    function saveAccount(payload, headers) {
        return postJson('/api/account/me', payload, headers, 'PUT');
    }

    /* ---------------------------------------------------------- Journal & but */




    /* ------------------------------------------------------- Fil conducteur */

    /**
     * La prochaine chose à faire, et la raison de la faire.
     *
     * <p>C'est la réponse à « et maintenant ? ». Un joueur qui arrive voit
     * sept lieux et ne sait pas lequel ouvre la boucle ; cette ligne la lui
     * déroule dans l'ordre — récolter, semer, brasser, livrer — en disant
     * chaque fois à quoi sert le geste. Elle ne se lit qu'une fois : le jour
     * où le joueur connaît la boucle, il ne la regarde plus.
     *
     * <p>L'ordre n'est pas décoratif. Ce qui est mûr passe avant ce qui est
     * vide, parce qu'une récolte qui attend est du temps déjà investi ; et
     * semer passe avant brasser, parce qu'on ne brasse pas sans grain.
     */
    function guide(state) {
        var mur = harvestableCount(state);
        if (mur > 0) {
            return {
                texte: mur > 1 ? 'Récolte tes ' + mur + ' choses mûres' : 'Récolte ce qui est mûr',
                pourquoi: 'Le grain et le miel sont la matière de tout ce que tu brasses.',
                action: 'reap'
            };
        }

        var prets = aSoutirer(state).length;
        if (prets > 0) {
            return {
                texte: prets > 1 ? 'Mets tes ' + prets + ' brassins en cave' : 'Mets ton brassin en cave',
                pourquoi: 'La cuve se libère, et le fût rejoint la réserve où puisent commandes et comptoir.',
                action: 'cellar'
            };
        }

        if (state.fields.some(function (f) { return f.status === 'EMPTY'; })) {
            return {
                texte: 'Sème une parcelle',
                pourquoi: 'L’orge devient la bière, le houblon lui donne son amertume.',
                lieu: 'champs'
            };
        }

        var enCours = state.batches.some(function (b) { return etatBrassin(b) === 'en-cours'; });
        if (!enCours && state.recipes.some(function (r) { return brewable(state, r); })) {
            return {
                texte: 'Lance un brassin',
                pourquoi: 'C’est à la brasserie que tes récoltes deviennent des boissons.',
                lieu: 'brasserie'
            };
        }

        var cave = cellarVolume(state.batches);
        if (cave > 0 && state.npcOrders.some(function (o) { return o.status === 'OPEN'; })) {
            return {
                texte: 'Livre une commande',
                pourquoi: 'Les marchands paient en pièces, et la renommée suit.',
                lieu: 'commandes'
            };
        }

        if (cave > 0) {
            return {
                texte: 'Offre une tournée à la taverne',
                pourquoi: 'Faire goûter aux voyageurs, c’est ainsi qu’on se fait un nom.',
                lieu: 'taverne'
            };
        }

        // Une bourse pleine et rien en attente : c'est le moment de pousser
        // les murs. Sans ce rappel, l'agrandissement resterait caché au bas
        // de deux écrans que personne n'ouvre quand tout tourne.
        var croissance = state.estate;
        if (croissance) {
            if (croissance.fieldPrice && state.player.coins >= croissance.fieldPrice) {
                return {
                    texte: 'Défriche une parcelle de plus',
                    pourquoi: 'Ta bourse le permet. Plus de terre, c’est plus de tout le reste.',
                    lieu: 'champs'
                };
            }
            if (croissance.hivePrice && state.player.coins >= croissance.hivePrice) {
                return {
                    texte: 'Installe une ruche de plus',
                    pourquoi: 'Le miel est la matière rare : une ruche de plus se rentabilise vite.',
                    lieu: 'rucher'
                };
            }
        }

        if (enCours) {
            return {
                texte: 'Ton brassin fermente',
                pourquoi: 'Rien ne presse. Le domaine travaille pendant ton absence.',
                lieu: 'brasserie'
            };
        }

        return {
            texte: 'Regarde où tu en es',
            pourquoi: 'Les autres domaines brassent aussi. Le classement dit qui mène.',
            vue: 'classement'
        };
    }

    /* --------------------------------------------------------- Premiers pas */

    /** L'avancement d'un haut fait, lu tel que le serveur le compte. */
    function avancement(state, code) {
        var faits = (state.progression && state.progression.achievements) || [];
        var fait = faits.find(function (a) { return a.code === code; });
        return fait ? Number(fait.progress) || 0 : 0;
    }

    /**
     * Les quatre gestes de la boucle, et ceux que le joueur a déjà faits.
     *
     * <p>Le fil conducteur dit quoi faire maintenant ; ceci dit où l'on en
     * est. Un joueur qui arrive ne sait pas que la partie tient en quatre
     * gestes — semer, récolter, brasser, livrer — ni qu'après, tout le reste
     * n'est que la même boucle en plus grand. Il le voit se cocher.
     *
     * <p>Rien n'est compté ici : chaque case lit un compteur que le serveur
     * tient déjà pour ses hauts faits. Recharger la page, changer
     * d'appareil ou jouer d'ailleurs ne décoche rien.
     */
    function premiersPas(state) {
        var champs = state.fields || [];
        var etapes = [
            {
                id: 'semer', titre: 'Semer', art: 'art-HERB', lieu: 'champs',
                fait: champs.some(function (f) { return f.status && f.status !== 'EMPTY'; })
                    || avancement(state, 'FIRST_HARVEST') > 0
            },
            {
                id: 'recolter', titre: 'Récolter', art: 'art-CEREAL', lieu: 'champs',
                fait: avancement(state, 'FIRST_HARVEST') > 0 || avancement(state, 'HONEY_KEEPER') > 0
            },
            {
                id: 'brasser', titre: 'Brasser', art: 'art-vat', lieu: 'brasserie',
                fait: avancement(state, 'FIRST_BREW') > 0 || (state.batches || []).length > 0
            },
            {
                id: 'livrer', titre: 'Livrer', art: 'art-scroll', lieu: 'commandes',
                fait: avancement(state, 'TRUSTED_SUPPLIER') > 0 || avancement(state, 'GOOD_NEIGHBOUR') > 0
            }
        ];
        var faites = etapes.filter(function (e) { return e.fait; }).length;
        var courante = etapes.findIndex(function (e) { return !e.fait; });
        return {
            etapes: etapes,
            faites: faites,
            total: etapes.length,
            courante: courante < 0 ? null : courante,
            fini: faites === etapes.length
        };
    }

    /** Assez de tout en réserve pour lancer cette recette ? */
    function brewable(state, recipe) {
        return (recipe.ingredients || []).every(function (line) {
            var stock = state.inventory.find(function (item) {
                return item.ingredientName === line.ingredientName;
            });
            return stock && Number(stock.quantity) >= Number(line.quantity);
        });
    }

    /* ------------------------------------------------- État d'un lieu (pastille) */

    function placeState(id, state) {
        switch (id) {
            case 'champs':
                if (state.fields.some(function (f) { return f.status === 'READY' || (f.readyAt && isDone(f.readyAt)); })) return 'ready';
                return state.fields.some(function (f) { return f.status === 'GROWING'; }) ? 'busy' : 'idle';
            case 'rucher':
                if (state.hives.some(function (h) { return h.status === 'READY'; })) return 'ready';
                return state.hives.some(function (h) { return h.status === 'PRODUCING'; }) ? 'busy' : 'idle';
            case 'brasserie':
                // Un fût déjà rangé n'appelle plus personne, et un brassin
                // épuisé depuis une semaine ne rend pas la brasserie « occupée ».
                if (aSoutirer(state).length) return 'ready';
                return state.batches.some(function (b) { return etatBrassin(b) === 'en-cours'; }) ? 'busy' : 'idle';
            case 'commandes':
                return state.npcOrders.some(function (o) { return o.status === 'OPEN'; }) ? 'ready' : 'idle';
            case 'taverne':
                return state.tavern.openPlayerOrders ? 'news' : 'idle';
            case 'entrepot':
                return state.inventory.length ? 'idle' : 'idle';
            default:
                return 'idle';
        }
    }

    /**
     * Combien de choses attendent le joueur à cet endroit.
     *
     * <p>Une pastille dit qu'il se passe quelque chose ; un nombre dit s'il
     * faut y aller tout de suite. C'est ce chiffre qui rend la carte lisible
     * d'un coup d'œil, sans ouvrir les sept lieux l'un après l'autre.
     */
    function placeCount(id, state) {
        switch (id) {
            case 'champs':
                return state.fields.filter(function (f) {
                    return f.status === 'READY' || (f.readyAt && isDone(f.readyAt));
                }).length;
            case 'rucher':
                return state.hives.filter(function (h) { return h.status === 'READY'; }).length;
            case 'brasserie':
                return aSoutirer(state).length;
            case 'commandes':
                return state.npcOrders.filter(function (o) { return o.status === 'OPEN'; }).length
                    + state.market.filter(function (o) { return o.creatorId !== state.playerId; }).length;
            case 'taverne':
                return state.tavern.openPlayerOrders || 0;
            default:
                return 0;
        }
    }

    /** Tout ce qui peut être ramassé d'un seul geste, champs et ruches. */
    function harvestableCount(state) {
        return placeCount('champs', state) + placeCount('rucher', state);
    }

    global.BrewsteadData = {
        PLACES: PLACES,
        RESOURCES: RESOURCES,
        AVATARS: AVATARS,
        saveAccount: saveAccount,
        postJson: postJson,
        get: getJson,
        XP_PER_LEVEL: XP_PER_LEVEL,
        load: load,
        guide: guide,
        premiersPas: premiersPas,
        placeState: placeState,
        placeCount: placeCount,
        harvestableCount: harvestableCount,
        etatBrassin: etatBrassin,
        aSoutirer: aSoutirer,
        format: { number: number, quantity: quantity, countdown: countdown, duration: duration, ratio: ratio, isDone: isDone }
    };
})(window);
