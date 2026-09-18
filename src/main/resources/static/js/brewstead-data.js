/* ==========================================================================
   Brewstead — modèle de données du client
   Lit l'état du jeu via l'API ; bascule sur un domaine de démonstration
   lorsque l'API n'est pas joignable (session non authentifiée, hors ligne).
   ========================================================================== */

(function (global) {
    'use strict';

    var XP_PER_LEVEL = 1000;
    var AVATARS = ['CERF', 'CORBEAU', 'OURS', 'LOUP', 'ABEILLE', 'ORGE', 'TONNEAU', 'MARTEAU'];

    /* ---------------------------------------------------------------- Lieux */

    var PLACES = [
        {
            id: 'rucher', label: 'Rucher', kicker: 'Miel & cire', icon: 'i-honey',
            x: 285, y: 147, screen: 'rucher',
            intro: "Les ruches du coteau donnent le miel de bruyère qui fait la rondeur de tes hydromels.",
            action: 'Récolter le miel'
        },
        {
            id: 'champs', label: 'Champs', kicker: 'Cultures du domaine', icon: 'i-grain',
            x: 241, y: 277, screen: 'champs',
            intro: "Orge, houblon et plantes aromatiques poussent ici, au rythme des saisons du fjord.",
            action: 'Gérer les cultures'
        },
        {
            id: 'entrepot', label: 'Entrepôt', kicker: 'Stocks & matières', icon: 'i-pouch',
            x: 292, y: 443, screen: 'inventaire',
            intro: "Tout ce que le domaine produit finit ici avant de repartir en brassin ou en livraison.",
            action: 'Ouvrir l’inventaire'
        },
        {
            id: 'brasserie', label: 'Brasserie', kicker: 'Le cœur de Brewstead', icon: 'i-barrel',
            x: 841, y: 227, screen: 'brasserie',
            intro: "Cuves, fûts et fermentation : c’est ici que les recettes deviennent des bières et des hydromels.",
            action: 'Suivre les brassins'
        },
        {
            id: 'laboratoire', label: 'Laboratoire', kicker: 'Recherche & recettes', icon: 'i-recipe',
            x: 1334, y: 260, screen: 'recettes',
            intro: "On y assemble les recettes, on y note les dosages, on y rate parfois de belles idées.",
            action: 'Ouvrir le grimoire'
        },
        {
            id: 'taverne', label: 'Taverne', kicker: 'Voyageurs & réputation', icon: 'i-tavern',
            x: 934, y: 463, screen: 'taverne',
            intro: "Les voyageurs s’y arrêtent, goûtent, racontent. Ta réputation se construit à cette table.",
            action: 'Entrer dans la taverne'
        },
        {
            id: 'commandes', label: 'Commandes', kicker: 'Commerce', icon: 'i-orders',
            x: 1364, y: 523, screen: 'commandes',
            intro: "Les demandes des marchands et des autres domaines. Livre à l’heure, la réputation suit.",
            action: 'Voir les commandes'
        }
    ];

    /* ------------------------------------------------------------ Ressources */

    function nameMatches(item, words) {
        var name = (item.ingredientName || '').toLowerCase();
        return words.some(function (w) { return name.indexOf(w) !== -1; });
    }

    function sumWhere(inventory, words) {
        return inventory.reduce(function (total, item) {
            return nameMatches(item, words) ? total + Number(item.quantity || 0) : total;
        }, 0);
    }

    var RESOURCES = [
        { key: 'coins', label: 'Pièces', icon: 'i-coin', read: function (s) { return s.player.coins; } },
        { key: 'wood', label: 'Bois', icon: 'i-wood', read: function (s) { return sumWhere(s.inventory, ['bois', 'wood', 'chêne', 'bûche']); } },
        { key: 'grain', label: 'Céréales', icon: 'i-grain', read: function (s) { return sumWhere(s.inventory, ['orge', 'barley', 'céréale', 'cereal', 'blé', 'wheat', 'malt', 'seigle']); } },
        { key: 'honey', label: 'Miel', icon: 'i-honey', read: function (s) { return sumWhere(s.inventory, ['miel', 'honey']); } },
        {
            key: 'brew', label: 'Bières', icon: 'i-barrel', read: function (s) {
                var stored = sumWhere(s.inventory, ['bière', 'biere', 'hydromel', 'cervoise', 'cidre']);
                var ready = s.batches.filter(function (b) { return b.status === 'READY'; }).length;
                return stored + ready;
            }
        }
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
        var minutes = Math.floor(left / 60000);
        if (minutes < 60) return minutes + ' min';
        var hours = Math.floor(minutes / 60);
        if (hours < 24) return hours + ' h ' + String(minutes % 60).padStart(2, '0');
        return Math.floor(hours / 24) + ' j ' + (hours % 24) + ' h';
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

    /* ------------------------------------------------ Domaine de démonstration */

    function minutesFromNow(minutes) {
        return new Date(Date.now() + minutes * 60000).toISOString();
    }

    function demoState() {
        return {
            source: 'demo',
            player: {
                id: 0, username: 'Eirik', displayName: 'Eirik', avatar: 'CERF',
                level: 12, experience: 320, coins: 1240, reputation: 86
            },
            inventory: [
                { id: 1, ingredientName: 'Bois de chêne', unit: 'KILOGRAM', quantity: 328 },
                { id: 2, ingredientName: 'Orge maltée', unit: 'KILOGRAM', quantity: 96 },
                { id: 3, ingredientName: 'Miel de bruyère', unit: 'KILOGRAM', quantity: 12 },
                { id: 4, ingredientName: 'Hydromel doré', unit: 'UNIT', quantity: 7 },
                { id: 5, ingredientName: 'Houblon du fjord', unit: 'GRAM', quantity: 1450 },
                { id: 6, ingredientName: 'Eau de source', unit: 'LITER', quantity: 240 },
                { id: 7, ingredientName: 'Baies de genièvre', unit: 'GRAM', quantity: 320 },
                { id: 8, ingredientName: 'Levure de Mjödheim', unit: 'GRAM', quantity: 90 }
            ],
            fields: [
                { id: 1, cropName: 'Orge de printemps', plantedAt: minutesFromNow(-48), readyAt: minutesFromNow(12), status: 'GROWING' },
                { id: 2, cropName: 'Houblon du fjord', plantedAt: minutesFromNow(-20), readyAt: minutesFromNow(38), status: 'GROWING' },
                { id: 3, cropName: 'Seigle noir', plantedAt: minutesFromNow(-180), readyAt: minutesFromNow(-4), status: 'READY' },
                { id: 4, cropName: null, plantedAt: null, readyAt: null, status: 'EMPTY' }
            ],
            hives: [
                { id: 1, level: 3, startedAt: minutesFromNow(-240), readyAt: minutesFromNow(-15), status: 'READY' },
                { id: 2, level: 2, startedAt: minutesFromNow(-30), readyAt: minutesFromNow(25), status: 'PRODUCING' },
                { id: 3, level: 1, startedAt: null, readyAt: null, status: 'IDLE' }
            ],
            recipes: [
                {
                    id: 1, name: 'Hydromel doré', drinkType: 'MEAD', baseVolume: 20, fermentationDurationHours: 72,
                    isPublic: true, ownerUsername: 'Eirik',
                    ingredients: [
                        { ingredientName: 'Miel de bruyère', unit: 'KILOGRAM', quantity: 6 },
                        { ingredientName: 'Eau de source', unit: 'LITER', quantity: 18 },
                        { ingredientName: 'Levure de Mjödheim', unit: 'GRAM', quantity: 12 }
                    ]
                },
                {
                    id: 2, name: 'Cervoise du fjord', drinkType: 'BEER', baseVolume: 35, fermentationDurationHours: 96,
                    isPublic: true, ownerUsername: 'Eirik',
                    ingredients: [
                        { ingredientName: 'Orge maltée', unit: 'KILOGRAM', quantity: 9 },
                        { ingredientName: 'Houblon du fjord', unit: 'GRAM', quantity: 180 },
                        { ingredientName: 'Eau de source', unit: 'LITER', quantity: 32 }
                    ]
                },
                {
                    id: 3, name: 'Brune de Mjödheim', drinkType: 'BEER', baseVolume: 25, fermentationDurationHours: 120,
                    isPublic: false, ownerUsername: 'Eirik',
                    ingredients: [
                        { ingredientName: 'Orge maltée', unit: 'KILOGRAM', quantity: 12 },
                        { ingredientName: 'Miel de bruyère', unit: 'KILOGRAM', quantity: 2 }
                    ]
                },
                {
                    id: 4, name: 'Cidre des vergers', drinkType: 'CIDER', baseVolume: 18, fermentationDurationHours: 60,
                    isPublic: false, ownerUsername: 'Eirik',
                    ingredients: [{ ingredientName: 'Baies de genièvre', unit: 'GRAM', quantity: 120 }]
                }
            ],
            batches: [
                { id: 1, recipeId: 1, recipeName: 'Hydromel doré', volume: 20, startedAt: minutesFromNow(-90), readyAt: minutesFromNow(45), status: 'FERMENTING', quality: null },
                { id: 2, recipeId: 2, recipeName: 'Cervoise du fjord', volume: 35, startedAt: minutesFromNow(-600), readyAt: minutesFromNow(180), status: 'CONDITIONING', quality: null },
                { id: 3, recipeId: 3, recipeName: 'Brune de Mjödheim', volume: 25, startedAt: minutesFromNow(-900), readyAt: minutesFromNow(-30), status: 'READY', quality: 87 }
            ],
            npcOrders: [
                {
                    id: 1, customerName: 'Guilde des marchands', status: 'OPEN',
                    createdAt: minutesFromNow(-120), expiresAt: minutesFromNow(240),
                    rewardCoins: 320, rewardReputation: 12,
                    lines: [{ recipeName: 'Hydromel doré', quantity: 3, minQuality: 70 }]
                },
                {
                    id: 2, customerName: 'Taverne du Corbeau', status: 'IN_PROGRESS',
                    createdAt: minutesFromNow(-300), expiresAt: minutesFromNow(600),
                    rewardCoins: 180, rewardReputation: 6,
                    lines: [{ recipeName: 'Cervoise du fjord', quantity: 5, minQuality: 55 }]
                },
                {
                    id: 3, customerName: 'Jarl Sigrun', status: 'OPEN',
                    createdAt: minutesFromNow(-30), expiresAt: minutesFromNow(1440),
                    rewardCoins: 540, rewardReputation: 25,
                    lines: [
                        { recipeName: 'Brune de Mjödheim', quantity: 2, minQuality: 80 },
                        { recipeName: 'Hydromel doré', quantity: 2, minQuality: 75 }
                    ]
                }
            ],
            tavern: {
                openPlayerOrders: 4,
                notablePlayers: [
                    { playerId: 7, username: 'Astrid', level: 18, reputation: 214 },
                    { playerId: 3, username: 'Bjorn', level: 15, reputation: 168 },
                    { playerId: 0, username: 'Eirik', level: 12, reputation: 86 },
                    { playerId: 11, username: 'Ingrid', level: 11, reputation: 74 },
                    { playerId: 5, username: 'Torvald', level: 9, reputation: 52 }
                ]
            }
        };
    }

    /* ------------------------------------------------------------------- API */

    function getJson(url) {
        return fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
            .then(function (response) {
                var type = response.headers.get('content-type') || '';
                if (!response.ok || type.indexOf('json') === -1) throw new Error('Réponse inattendue : ' + response.status);
                return response.json();
            });
    }

    function normalise(state, tavern) {
        return {
            source: 'api',
            player: state.player,
            playerId: state.player ? state.player.id : null,
            inventory: state.inventory || [],
            fields: state.fields || [],
            hives: state.hives || [],
            recipes: state.recipes || [],
            batches: state.batches || [],
            npcOrders: state.npcOrders || [],
            tavern: tavern || { notablePlayers: [], openPlayerOrders: 0 }
        };
    }

    /** Le domaine chargé est toujours celui de la session en cours. */
    function load() {
        return getJson('/api/account/me')
            .then(function (account) {
                return Promise.all([
                    getJson('/api/players/' + account.id + '/state'),
                    getJson('/api/tavern').catch(function () { return null; })
                ]).then(function (results) {
                    return normalise(results[0], results[1]);
                });
            })
            .catch(function (error) {
                if (global.console) console.info('Brewstead : état local utilisé (' + error.message + ').');
                return demoState();
            });
    }

    function saveAccount(payload, headers) {
        return fetch('/api/account/me', {
            method: 'PUT',
            credentials: 'same-origin',
            headers: headers,
            body: JSON.stringify(payload)
        }).then(function (response) {
            if (!response.ok) {
                return response.json()
                    .catch(function () { return {}; })
                    .then(function (body) { throw new Error(body.message || 'Enregistrement refusé.'); });
            }
            return response.json();
        });
    }

    /* ---------------------------------------------------------- Journal & but */

    function feed(state) {
        var items = [];
        var readyFields = state.fields.filter(function (f) { return f.status === 'READY' || (f.readyAt && isDone(f.readyAt)); });
        var nextField = state.fields
            .filter(function (f) { return f.readyAt && !isDone(f.readyAt); })
            .sort(function (a, b) { return new Date(a.readyAt) - new Date(b.readyAt); })[0];
        var readyHives = state.hives.filter(function (h) { return h.status === 'READY'; });
        var readyBatches = state.batches.filter(function (b) { return b.status === 'READY'; });
        var openOrders = state.npcOrders.filter(function (o) { return o.status === 'OPEN'; });

        if (openOrders.length) items.push({ tone: 'ok', text: openOrders.length > 1 ? openOrders.length + ' nouvelles commandes' : 'Nouvelle commande disponible' });
        if (nextField) items.push({ tone: 'warn', text: 'Récolte prête dans ' + countdown(nextField.readyAt) });
        else if (readyFields.length) items.push({ tone: 'ok', text: 'Récolte prête aux champs' });
        if (readyHives.length) items.push({ tone: 'ok', text: 'Miel à récolter au rucher' });
        if (readyBatches.length) items.push({ tone: 'info', text: readyBatches[0].recipeName + ' est prêt en cave' });
        items.push({ tone: 'info', text: 'Un visiteur est à la taverne' });

        return items.slice(0, 4);
    }

    function goal(state) {
        var order = state.npcOrders.filter(function (o) { return o.status === 'OPEN' || o.status === 'IN_PROGRESS'; })[0];
        if (!order || !order.lines.length) {
            return { text: 'Lancer un brassin à la brasserie', done: 0, total: 1, place: 'brasserie' };
        }
        var line = order.lines[0];
        var brewed = state.batches.filter(function (b) {
            return b.status === 'READY' && b.recipeName === line.recipeName;
        }).length;
        return {
            text: 'Livrer ' + line.quantity + ' tonneau' + (line.quantity > 1 ? 'x' : '') + ' de ' + line.recipeName,
            done: Math.min(brewed, line.quantity),
            total: line.quantity,
            place: 'commandes'
        };
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

    global.BrewsteadData = {
        PLACES: PLACES,
        RESOURCES: RESOURCES,
        AVATARS: AVATARS,
        saveAccount: saveAccount,
        XP_PER_LEVEL: XP_PER_LEVEL,
        load: load,
        demoState: demoState,
        feed: feed,
        goal: goal,
        placeState: placeState,
        format: { number: number, quantity: quantity, countdown: countdown, ratio: ratio, isDone: isDone }
    };
})(window);
