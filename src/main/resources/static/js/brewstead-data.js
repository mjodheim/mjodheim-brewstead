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
            id: 'rucher', tiroir: true, calque: { x: 123, y: 87, w: 264, h: 136 }, label: 'Rucher', kicker: 'Miel & cire', icon: 'i-honey',
            x: 285, y: 147, screen: 'rucher',
            intro: "Les ruches du coteau donnent le miel de bruyère qui fait la rondeur de tes hydromels.",
            action: 'Récolter le miel'
        },
        {
            id: 'champs', tiroir: true, calque: { x: 82, y: 238, w: 316, h: 124 }, label: 'Champs', kicker: 'Cultures du domaine', icon: 'i-grain',
            x: 241, y: 277, screen: 'champs',
            intro: "Orge, houblon et plantes aromatiques poussent ici, au rythme des saisons du fjord.",
            action: 'Gérer les cultures'
        },
        {
            id: 'entrepot', calque: { x: 174, y: 382, w: 252, h: 136 }, label: 'Entrepôt', kicker: 'Stocks & matières', icon: 'i-pouch',
            x: 292, y: 443, screen: 'inventaire',
            intro: "Tout ce que le domaine produit finit ici avant de repartir en brassin ou en livraison.",
            action: 'Ouvrir l’inventaire'
        },
        {
            id: 'brasserie', tiroir: true, calque: { x: 618, y: 110, w: 388, h: 236 }, label: 'Brasserie', kicker: 'Le cœur de Brewstead', icon: 'i-barrel',
            x: 841, y: 227, screen: 'brasserie',
            intro: "Cuves, fûts et fermentation : c’est ici que les recettes deviennent des bières et des hydromels.",
            action: 'Suivre les brassins'
        },
        {
            id: 'laboratoire', calque: { x: 1188, y: 190, w: 284, h: 204 }, label: 'Laboratoire', kicker: 'Recherche & recettes', icon: 'i-recipe',
            x: 1334, y: 260, screen: 'recettes',
            intro: "On y assemble les recettes, on y note les dosages, on y rate parfois de belles idées.",
            action: 'Ouvrir le grimoire'
        },
        {
            id: 'taverne', calque: { x: 856, y: 376, w: 328, h: 200 }, label: 'Taverne', kicker: 'Voyageurs & réputation', icon: 'i-tavern',
            x: 934, y: 463, screen: 'taverne',
            intro: "Les voyageurs s’y arrêtent, goûtent, racontent. Ta réputation se construit à cette table.",
            action: 'Entrer dans la taverne'
        },
        {
            id: 'commandes', calque: { x: 1284, y: 474, w: 176, h: 124 }, label: 'Commandes', kicker: 'Commerce', icon: 'i-orders',
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
    function cellarVolume(batches) {
        return batches.reduce(function (total, batch) {
            return batch.status === 'READY' ? total + Number(batch.volume || 0) : total;
        }, 0);
    }

    var RESOURCES = [
        { key: 'coins', label: 'Pièces', icon: 'i-coin', read: function (s) { return s.player.coins; } },
        { key: 'grain', label: 'Céréales', icon: 'i-grain', read: function (s) { return sumOfType(s.inventory, 'CEREAL'); } },
        { key: 'honey', label: 'Miel', icon: 'i-honey', read: function (s) { return sumOfType(s.inventory, 'HONEY'); } },
        { key: 'hop', label: 'Houblon', icon: 'i-wood', read: function (s) { return sumOfType(s.inventory, 'HOP'); } },
        { key: 'cellar', label: 'En cave', icon: 'i-barrel', read: function (s) { return cellarVolume(s.batches); } }
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

        if (state.batches.some(function (b) { return b.status === 'READY'; })) {
            return {
                texte: 'Ton brassin est prêt',
                pourquoi: 'Va le chercher à la brasserie : il ira en cave, prêt à être vendu.',
                lieu: 'brasserie'
            };
        }

        if (state.fields.some(function (f) { return f.status === 'EMPTY'; })) {
            return {
                texte: 'Sème une parcelle',
                pourquoi: 'L’orge devient la bière, le houblon lui donne son amertume.',
                lieu: 'champs'
            };
        }

        var enCours = state.batches.some(function (b) {
            return b.status !== 'SOLD_OUT' && b.status !== 'CANCELLED' && b.status !== 'READY';
        });
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
                if (state.batches.some(function (b) { return b.status === 'READY'; })) return 'ready';
                return state.batches.length ? 'busy' : 'idle';
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
                return state.batches.filter(function (b) { return b.status === 'READY'; }).length;
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
        placeState: placeState,
        placeCount: placeCount,
        harvestableCount: harvestableCount,
        format: { number: number, quantity: quantity, countdown: countdown, duration: duration, ratio: ratio, isDone: isDone }
    };
})(window);
