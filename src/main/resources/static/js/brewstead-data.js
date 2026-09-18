/* ==========================================================================
   Brewstead — modèle de données du client
   Lit l'état du jeu via l'API. En cas d'échec, l'erreur remonte telle quelle :
   mieux vaut un message franc qu'un domaine inventé.
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

    /* ------------------------------------------------------------------- API */

    function sessionLost() {
        var error = new Error('Ta session a expiré.');
        error.sessionExpired = true;
        return error;
    }

    function getJson(url) {
        return fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
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

    function postJson(url, body, headers) {
        return fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: headers,
            body: body === undefined ? undefined : JSON.stringify(body)
        }).then(function (response) {
            if (response.redirected && response.url.indexOf('/login') !== -1) throw sessionLost();
            if (!response.ok) {
                return response.json()
                    .catch(function () { return {}; })
                    .then(function (payload) { throw new Error(payload.message || 'Action refusée.'); });
            }
            var type = response.headers.get('content-type') || '';
            return type.indexOf('json') === -1 ? null : response.json();
        });
    }

    function normalise(state, tavern) {
        return {
            source: 'api',
            player: state.player,
            playerId: state.player ? state.player.id : null,
            crops: [],
            effects: [],
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
                    getJson('/api/tavern').catch(function () { return null; }),
                    getJson('/api/catalog/crops').catch(function () { return []; }),
                    getJson('/api/account/me/effects').catch(function () { return []; })
                ]).then(function (results) {
                    var state = normalise(results[0], results[1]);
                    state.crops = results[2] || [];
                    state.effects = results[3] || [];
                    return state;
                });
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
        postJson: postJson,
        XP_PER_LEVEL: XP_PER_LEVEL,
        load: load,
        feed: feed,
        goal: goal,
        placeState: placeState,
        format: { number: number, quantity: quantity, countdown: countdown, ratio: ratio, isDone: isDone }
    };
})(window);
