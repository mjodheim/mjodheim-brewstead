/* ==========================================================================
   Brewstead — interface
   Assemble le HUD, les écriteaux du monde, le panneau de lieu et les écrans.
   ========================================================================== */

(function (global) {
    'use strict';

    var Data = global.BrewsteadData;
    var fmt = Data.format;

    var dom = {};
    var camera = null;
    var state = null;
    var activePlace = null;
    var activeView = 'monde';
    var toastTimer = null;
    var accountDraft = null;
    var picker = null;          // { kind, fieldId, query }
    var tavern = { tab: 'salle', messages: [], lastId: null, counter: [], timer: null, loading: false };
    var offerDraft = null;      // { batchId, recipeName }
    var orders = { tab: 'marche', query: '', ingredient: null };

    /* Les préférences restent dans ce navigateur : elles ne décrivent que
       l'affichage, jamais l'état du domaine. */
    var SETTINGS_KEY = 'brewstead.reglages';
    var DEFAULTS = { taille: 'normale', mouvement: 'complet', ambiance: true, recentrage: true, alertes: true };
    var settings = Object.assign({}, DEFAULTS);
    var readySeen = {};

    function loadSettings() {
        try {
            var stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
            settings = Object.assign({}, DEFAULTS, stored);
        } catch (ignored) {
            settings = Object.assign({}, DEFAULTS);
        }
        applySettings();
    }

    function saveSettings() {
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (ignored) { /* navigation privée */ }
        applySettings();
    }

    function applySettings() {
        var root = document.documentElement;
        root.dataset.taille = settings.taille;
        root.dataset.mouvement = settings.mouvement;
        root.dataset.ambiance = settings.ambiance ? 'oui' : 'non';
    }

    /* ----------------------------------------------------------- Utilitaires */

    function $(id) { return document.getElementById(id); }

    function esc(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function icon(name, className) {
        return '<svg class="' + (className || '') + '" viewBox="0 0 24 24" aria-hidden="true"><use href="#' + name + '"/></svg>';
    }

    function chip(label, tone) {
        return '<span class="chip' + (tone ? ' chip--' + tone : '') + '">' + esc(label) + '</span>';
    }

    function row(parts) {
        return '<div class="row">' +
            (parts.icon ? icon(parts.icon, 'row__icon') : '') +
            '<div class="row__body">' +
            '<span class="row__title">' + esc(parts.title) + '</span>' +
            (parts.meta ? '<small class="row__meta">' + esc(parts.meta) + '</small>' : '') +
            (parts.progress || '') +
            '</div>' +
            (parts.side ? '<div class="row__side">' + parts.side + '</div>' : '') +
            '</div>';
    }

    function progress(startIso, endIso) {
        var done = fmt.ratio(startIso, endIso);
        return '<div class="progress"><span class="bar"><i style="width:' + Math.round(done * 100) + '%"></i></span>' +
            '<small>' + esc(fmt.countdown(endIso)) + '</small></div>';
    }

    function empty(message) {
        return '<p class="empty">' + esc(message) + '</p>';
    }

    function actionButton(action, label, id) {
        return '<button class="btn btn--sm btn--gold" type="button" data-action="' + action + '" data-id="' + id + '">' + esc(label) + '</button>';
    }

    function showFault(error) {
        var expired = !!error.sessionExpired;
        dom.faultTitle.textContent = expired ? 'Session expirée' : 'Domaine injoignable';
        dom.faultText.textContent = expired
            ? 'Ta session n’est plus valable. Reconnecte-toi pour retrouver ton domaine.'
            : (error.message || 'Le domaine n’a pas répondu.') + ' Rien n’est perdu : réessaie dans un instant.';
        dom.faultRetry.hidden = expired;
        dom.faultLogin.hidden = !expired;
        dom.fault.classList.add('is-open');
        dom.fault.setAttribute('aria-hidden', 'false');
    }

    function hideFault() {
        dom.fault.classList.remove('is-open');
        dom.fault.setAttribute('aria-hidden', 'true');
    }

    function toast(message) {
        dom.toast.textContent = message;
        dom.toast.classList.add('is-visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { dom.toast.classList.remove('is-visible'); }, 2600);
    }

    /* ------------------------------------------------------- Sections de jeu */

    var BATCH_LABELS = {
        PLANNED: 'planifié', BREWING: 'en cuve', FERMENTING: 'fermentation',
        CONDITIONING: 'garde', READY: 'prêt', SOLD_OUT: 'écoulé', CANCELLED: 'annulé'
    };

    var ORDER_LABELS = {
        OPEN: 'ouverte', IN_PROGRESS: 'en cours', COMPLETED: 'livrée',
        EXPIRED: 'expirée', CANCELED: 'annulée'
    };

    var DRINK_LABELS = { BEER: 'Bière', MEAD: 'Hydromel', CIDER: 'Cidre', OTHER: 'Autre' };

    var AVATAR_LABELS = {
        CERF: 'Cerf', CORBEAU: 'Corbeau', OURS: 'Ours', LOUP: 'Loup',
        ABEILLE: 'Abeille', ORGE: 'Orge', TONNEAU: 'Tonneau', MARTEAU: 'Marteau'
    };


    var RARITY_LABELS = { COMMUNE: 'commune', CURIEUSE: 'curieuse', RARE: 'rare', LEGENDAIRE: 'légendaire' };

    /** Ce que le joueur a en réserve, par nom d'ingrédient. */
    function stockOf(s, name) {
        var line = s.inventory.find(function (item) { return item.ingredientName === name; });
        return line ? Number(line.quantity) : 0;
    }

    /** Peut-on lancer cette recette avec ce qu'il y a dans l'entrepôt ? */
    function brewability(s, recipe) {
        var missing = (recipe.ingredients || []).filter(function (line) {
            return stockOf(s, line.ingredientName) < Number(line.quantity);
        });
        return { ok: missing.length === 0, missing: missing };
    }

    /** « de » devient « d' » devant une voyelle ou un h muet. */
    function de(word) {
        var low = String(word || '');
        return 'aeiouyéèêëàâîïôûùhAEIOUYÉÈÊËÀÂÎÏÔÛÙH'.indexOf(low.charAt(0)) !== -1
            ? 'd’' + low
            : 'de ' + low;
    }

    function matches(text, query) {
        return !query || String(text).toLowerCase().indexOf(query.toLowerCase()) !== -1;
    }

    function searchField(placeholder, value) {
        return '<label class="account-field" style="margin-bottom:.9em">' +
            '<input id="pickerSearch" type="search" placeholder="' + esc(placeholder) + '"' +
            ' value="' + esc(value || '') + '" autocomplete="off"></label>';
    }

    var SECTIONS = {
        rucher: {
            live: true,
            title: 'Rucher',
            render: function (s) {
                if (!s.hives.length) return empty('Aucune ruche installée pour l’instant.');
                return s.hives.map(function (hive) {
                    var ready = hive.status === 'READY';
                    return row({
                        icon: 'i-honey',
                        title: 'Ruche n°' + hive.id,
                        meta: 'Niveau ' + hive.level + (hive.status === 'IDLE' ? ' · en sommeil' : ''),
                        progress: hive.status === 'PRODUCING' && hive.readyAt ? progress(hive.startedAt, hive.readyAt) : '',
                        side: ready
                            ? actionButton('harvest-hive', 'Récolter', hive.id)
                            : (hive.status === 'PRODUCING'
                                ? chip('en production', 'warn')
                                : actionButton('start-hive', 'Lancer', hive.id))
                    });
                }).join('');
            }
        },

        champs: {
            live: true,
            title: 'Champs',
            render: function (s) {
                if (!s.fields.length) return empty('Aucune parcelle cultivée pour l’instant.');
                return s.fields.map(function (field) {
                    var ready = field.status === 'READY' || (field.readyAt && fmt.isDone(field.readyAt));
                    return row({
                        icon: 'i-grain',
                        title: field.cropName || 'Parcelle libre',
                        meta: field.status === 'EMPTY' ? 'Prête à semer' : 'Parcelle n°' + field.id,
                        progress: !ready && field.readyAt ? progress(field.plantedAt, field.readyAt) : '',
                        side: ready
                            ? actionButton('harvest-field', 'Récolter', field.id)
                            : (field.status === 'EMPTY'
                                ? actionButton('sow-field', 'Semer', field.id)
                                : chip('en croissance', 'warn'))
                    });
                }).join('');
            }
        },


        semer: {
            title: 'Choisir une culture',
            render: function (s) {
                var query = picker ? picker.query : '';
                var list = s.crops.filter(function (crop) {
                    return matches(crop.name, query) || matches(crop.ingredientName, query);
                });

                if (!s.crops.length) return empty('Le catalogue des cultures n’est pas encore chargé.');

                return searchField('Chercher une culture…', query) +
                    (list.length ? '<div class="grid">' + list.slice(0, 60).map(function (crop) {
                        return '<button class="row row--pick" type="button" data-action="pick-crop" data-id="' + crop.id + '">' +
                            icon('i-grain', 'row__icon') +
                            '<span class="row__body"><span class="row__title">' + esc(crop.ingredientName) + '</span>' +
                            '<small class="row__meta">' + esc(crop.name) + ' · ' +
                            crop.growDurationMinutes + ' min · rend ' +
                            esc(fmt.number(crop.yieldQuantity)) + '</small></span></button>';
                    }).join('') + '</div>' : empty('Aucune culture ne correspond.'));
            }
        },

        brasser: {
            title: 'Choisir une recette',
            render: function (s) {
                var query = picker ? picker.query : '';
                var list = s.recipes.filter(function (recipe) {
                    return matches(recipe.name, query)
                        || matches(RARITY_LABELS[recipe.rarity] || '', query)
                        || matches(recipe.effectLabel || '', query);
                });

                if (!s.recipes.length) return empty('Aucune recette au grimoire.');

                var ready = list.filter(function (r) { return brewability(s, r).ok; });
                var rest = list.filter(function (r) { return !brewability(s, r).ok; });

                function card(recipe) {
                    var can = brewability(s, recipe);
                    var lack = can.missing.slice(0, 2).map(function (l) { return l.ingredientName; }).join(', ');
                    return '<button class="row row--pick" type="button"' +
                        (can.ok ? '' : ' disabled') +
                        ' data-action="pick-recipe" data-id="' + recipe.id + '">' +
                        icon('i-barrel', 'row__icon') +
                        '<span class="row__body">' +
                        '<span class="row__title">' + esc(recipe.name) + '</span>' +
                        '<small class="row__meta">' + esc(DRINK_LABELS[recipe.drinkType] || recipe.drinkType) +
                        ' · ' + esc(RARITY_LABELS[recipe.rarity] || recipe.rarity) +
                        ' · ' + fmt.number(recipe.baseVolume) + ' L · ' + recipe.fermentationDurationMinutes + ' min' +
                        (recipe.effectKind && recipe.effectKind !== 'AUCUN'
                            ? ' — ' + esc(recipe.effectLabel) : '') +
                        (can.ok ? '' : ' · il te manque ' + esc(lack)) +
                        '</small>' +
                        (recipe.flavour ? '<small class="row__meta row__flavour">' + esc(recipe.flavour) + '</small>' : '') +
                        '</span></button>';
                }

                return searchField('Chercher parmi ' + s.recipes.length + ' recettes…', query) +
                    (ready.length ? '<p class="section-title">Brassables tout de suite</p>' +
                        '<div class="grid">' + ready.slice(0, 40).map(card).join('') + '</div>' : '') +
                    (rest.length ? '<p class="section-title">Il te manque de quoi</p>' +
                        '<div class="grid">' + rest.slice(0, 40).map(card).join('') + '</div>' : '') +
                    (list.length ? '' : empty('Aucune recette ne correspond.'));
            }
        },

        inventaire: {
            title: 'Entrepôt',
            render: function (s) {
                if (!s.inventory.length) return empty('L’entrepôt est vide.');
                return '<div class="grid">' + s.inventory.map(function (item) {
                    return row({
                        icon: 'i-pouch',
                        title: item.ingredientName,
                        meta: fmt.quantity(item.quantity, item.unit) + ' en stock'
                    });
                }).join('') + '</div>';
            }
        },

        brasserie: {
            live: true,
            title: 'Brasserie',
            render: function (s) {
                var head = '<div class="account-actions" style="margin:0 0 .8em">' +
                    '<button class="btn btn--gold" type="button" data-action="open-brew">' +
                    icon('i-plus') + 'Lancer un brassin</button></div>';
                if (!s.batches.length) return head + empty('Aucun brassin en cours.');
                return head + s.batches.map(function (batch) {
                    var ready = batch.status === 'READY';
                    return row({
                        icon: 'i-barrel',
                        title: batch.recipeName,
                        meta: fmt.number(batch.volume) + ' L' + (batch.quality ? ' · qualité ' + batch.quality : ''),
                        progress: !ready && batch.readyAt ? progress(batch.startedAt, batch.readyAt) : '',
                        side: ready
                            ? actionButton('taste-batch', 'Goûter', batch.id) +
                              actionButton('offer-batch', 'Au comptoir', batch.id)
                            : chip(BATCH_LABELS[batch.status] || batch.status, 'warn')
                    });
                }).join('');
            }
        },

        recettes: {
            title: 'Grimoire des recettes',
            render: function (s) {
                if (!s.recipes.length) return empty('Aucune recette au grimoire.');
                return s.recipes.map(function (recipe) {
                    var ingredients = (recipe.ingredients || []).map(function (i) {
                        return i.ingredientName + ' ' + fmt.quantity(i.quantity, i.unit);
                    }).join(' · ');
                    return row({
                        icon: 'i-recipe',
                        title: recipe.name,
                        meta: (DRINK_LABELS[recipe.drinkType] || recipe.drinkType) +
                            ' · ' + fmt.number(recipe.baseVolume) + ' L · ' + recipe.fermentationDurationHours + ' h' +
                            (ingredients ? ' — ' + ingredients : ''),
                        side: chip(recipe.isPublic ? 'publique' : 'privée', recipe.isPublic ? 'gold' : null)
                    });
                }).join('');
            }
        },

        commandes: {
            live: true,
            title: 'Commandes',
            render: function (s) {
                var tabs = '<div class="tabs">' +
                    [['marche', 'Le marché'], ['miennes', 'Les miennes'], ['pnj', 'Les marchands']]
                        .map(function (pair) {
                            return '<button class="tabs__tab' + (orders.tab === pair[0] ? ' is-active' : '') + '"' +
                                ' type="button" data-action="orders-tab" data-id="' + pair[0] + '">' +
                                pair[1] + '</button>';
                        }).join('') + '</div>';

                if (orders.tab === 'marche') return tabs + renderMarket(s);
                if (orders.tab === 'miennes') return tabs + renderMyOrders(s);
                return tabs + renderNpcOrders(s);
            }
        },

        taverne: {
            title: 'Taverne',
            render: function (s) {
                var tabs = '<div class="tabs">' +
                    ['salle', 'comptoir'].map(function (key) {
                        return '<button class="tabs__tab' + (tavern.tab === key ? ' is-active' : '') + '"' +
                            ' type="button" data-action="tavern-tab" data-id="' + key + '">' +
                            (key === 'salle' ? 'La salle' : 'Le comptoir') + '</button>';
                    }).join('') + '</div>';

                return tabs + (tavern.tab === 'salle' ? renderChat(s) : renderCounter(s));
            }
        },

        reglages: {
            title: 'Réglages',
            render: function () {
                function choice(key, options) {
                    return '<div class="choices">' + options.map(function (pair) {
                        return '<button class="choices__item' + (settings[key] === pair[0] ? ' is-chosen' : '') + '"' +
                            ' type="button" data-action="set-' + key + '" data-id="' + pair[0] + '">' +
                            esc(pair[1]) + '</button>';
                    }).join('') + '</div>';
                }

                function toggle(key, label, detail) {
                    return '<button class="switch' + (settings[key] ? ' is-on' : '') + '"' +
                        ' type="button" data-action="toggle" data-id="' + key + '"' +
                        ' aria-pressed="' + (!!settings[key]) + '">' +
                        '<span class="switch__track"><i></i></span>' +
                        '<span class="switch__body"><span class="switch__label">' + esc(label) + '</span>' +
                        '<small>' + esc(detail) + '</small></span></button>';
                }

                return '<p class="section-title">Taille de l’interface</p>' +
                    choice('taille', [['compacte', 'Compacte'], ['normale', 'Normale'], ['large', 'Large']]) +

                    '<p class="section-title">Mouvement</p>' +
                    choice('mouvement', [['complet', 'Complet'], ['sobre', 'Sobre']]) +
                    '<p class="hint">En mode sobre, les panneaux apparaissent sans glisser et la caméra ne dérive plus ' +
                    'après un déplacement. Utile sur une machine modeste, ou si le mouvement te gêne.</p>' +

                    '<p class="section-title">Confort</p>' +
                    toggle('ambiance', 'Lumière et vignettage',
                        'La teinte dorée et l’assombrissement des bords du domaine.') +
                    toggle('recentrage', 'Recentrer sur le lieu ouvert',
                        'La caméra vient se placer sur le bâtiment quand tu ouvres son panneau.') +
                    toggle('alertes', 'Me prévenir quand quelque chose est prêt',
                        'Un mot discret dès qu’une récolte, une ruche ou un brassin arrive à terme.');
            }
        },

        commande: {
            title: 'Passer une commande',
            render: function (s) {
                if (!orders.ingredient) {
                    var list = s.ingredients.filter(function (item) {
                        return matches(item.name, orders.query);
                    });
                    return '<p class="section-title">Que te faut-il ?</p>' +
                        '<label class="account-field" style="margin-bottom:.9em">' +
                        '<input id="pickerSearch" type="search" autocomplete="off"' +
                        ' placeholder="Chercher parmi ' + s.ingredients.length + ' ingrédients…"' +
                        ' value="' + esc(orders.query) + '"></label>' +
                        (list.length
                            ? '<div class="grid">' + list.slice(0, 48).map(function (item) {
                                return '<button class="row row--pick" type="button"' +
                                    ' data-action="pick-order-ingredient" data-id="' + item.id + '">' +
                                    icon('i-pouch', 'row__icon') +
                                    '<span class="row__body"><span class="row__title">' + esc(item.name) + '</span>' +
                                    '<small class="row__meta">en réserve : ' +
                                    esc(fmt.number(stockOf(s, item.name))) + '</small></span></button>';
                            }).join('') + '</div>'
                            : empty('Aucun ingrédient ne correspond.'));
                }

                return '<p class="section-title">' + esc(orders.ingredient.name) + '</p>' +
                    '<label class="account-field"><input id="orderQty" type="number" min="0.1" step="0.1" value="5">' +
                    '<small>Quantité demandée.</small></label>' +
                    '<label class="account-field" style="margin-top:.7em">' +
                    '<input id="orderReward" type="number" min="1" max="100000" value="120">' +
                    '<small>Récompense en pièces. Elle quitte ta bourse dès maintenant et revient si personne ne livre.</small></label>' +
                    '<label class="account-field" style="margin-top:.7em">' +
                    '<input id="orderMinutes" type="number" min="5" max="10080" value="60">' +
                    '<small>Durée en minutes. Aux deux tiers du temps, un marchand de passage prend le relais.</small></label>' +
                    '<div class="account-actions">' +
                    '<button class="btn" type="button" data-action="new-order">Changer d’ingrédient</button>' +
                    '<button class="btn btn--gold" type="button" data-action="order-confirm">Publier la commande</button>' +
                    '</div>';
            }
        },

        comptoir: {
            title: 'Mettre un fût au comptoir',
            render: function () {
                if (!offerDraft) return empty('Choisis un fût prêt depuis la brasserie.');
                return '<p class="section-title">' + esc(offerDraft.recipeName) + '</p>' +
                    '<label class="account-field"><input id="offerServings" type="number" min="1" max="40" value="6">' +
                    '<small>Nombre de services proposés. Un service, c’est un demi-litre.</small></label>' +
                    '<label class="account-field" style="margin-top:.7em">' +
                    '<input id="offerPrice" type="number" min="0" max="5000" value="0">' +
                    '<small>Prix du verre, en pièces. <strong>Zéro</strong> pour faire goûter : ça ne rapporte rien, ' +
                    'sauf de la réputation, ce qui finit par rapporter davantage.</small></label>' +
                    '<label class="account-field" style="margin-top:.7em">' +
                    '<input id="offerNote" type="text" maxlength="140" placeholder="Un mot pour vanter ta production…">' +
                    '</label>' +
                    '<div class="account-actions">' +
                    '<button class="btn btn--gold" type="button" data-action="offer-confirm">Ouvrir le fût</button>' +
                    '</div>';
            }
        },

        compte: {
            title: 'Mon compte',
            render: function (s) {
                var player = s.player;
                var chosen = accountDraft.avatar || player.avatar || 'CERF';
                var name = accountDraft.displayName !== null
                    ? accountDraft.displayName
                    : (player.displayName || player.username || '');

                var picker = Data.AVATARS.map(function (key) {
                    return '<button class="avatar-pick' + (key === chosen ? ' is-chosen' : '') + '"' +
                        ' type="button" data-action="pick-avatar" data-id="' + key + '"' +
                        ' aria-pressed="' + (key === chosen) + '" title="' + esc(AVATAR_LABELS[key] || key) + '">' +
                        icon('av-' + key) +
                        '<span>' + esc(AVATAR_LABELS[key] || key) + '</span>' +
                        '</button>';
                }).join('');

                return '<p class="section-title">Emblème</p>' +
                    '<div class="avatars">' + picker + '</div>' +

                    '<p class="section-title">Nom affiché</p>' +
                    '<label class="account-field">' +
                    '<input id="accountName" type="text" maxlength="30" value="' + esc(name) + '"' +
                    ' placeholder="' + esc(player.username || '') + '" autocomplete="off">' +
                    '<small>Ce nom apparaît sur ton domaine, à la taverne et au classement. ' +
                    'Laisse-le vide pour reprendre ton identifiant de connexion.</small>' +
                    '</label>' +

                    '<div class="account-actions">' +
                    '<button class="btn btn--gold" type="button" data-action="save-account">' +
                    icon('i-check') + 'Enregistrer</button>' +
                    '</div>' +

                    '<p class="section-title">Connexion</p>' +
                    row({
                        icon: 'i-pouch',
                        title: player.username || '—',
                        meta: 'Identifiant de connexion, il ne change pas'
                    }) +
                    '<label class="account-field" style="margin-top:.7em">' +
                    '<input id="pwdCurrent" type="password" autocomplete="current-password" placeholder="Mot de passe actuel"></label>' +
                    '<label class="account-field" style="margin-top:.5em">' +
                    '<input id="pwdNew" type="password" autocomplete="new-password" placeholder="Nouveau mot de passe (8 caractères mini)"></label>' +
                    '<label class="account-field" style="margin-top:.5em">' +
                    '<input id="pwdConfirm" type="password" autocomplete="new-password" placeholder="Confirmation"></label>' +
                    '<div class="account-actions">' +
                    '<button class="btn" type="button" data-action="change-password">Changer le mot de passe</button>' +
                    '</div>' +
                    row({
                        icon: 'i-trophy',
                        title: 'Niveau ' + player.level,
                        meta: fmt.number(player.reputation) + ' de réputation · ' + fmt.number(player.coins) + ' pièces'
                    }) +
                    '<div class="account-actions">' +
                    '<button class="btn" type="button" data-action="open-settings">' +
                    icon('i-gear') + 'Réglages</button>' +
                    '<button class="btn" type="button" data-action="logout">' +
                    icon('i-logout') + 'Quitter le domaine</button>' +
                    '</div>';
            }
        },

        classement: {
            title: 'Classement',
            render: function (s) {
                var players = (s.tavern.notablePlayers || []).slice().sort(function (a, b) {
                    return b.reputation - a.reputation;
                });
                if (!players.length) return empty('Le classement n’est pas encore établi.');
                return players.map(function (player, index) {
                    var mine = player.username === s.player.username;
                    return row({
                        icon: 'i-trophy',
                        title: (index + 1) + '. ' + player.username + (mine ? ' — toi' : ''),
                        meta: 'Niveau ' + player.level,
                        side: chip(fmt.number(player.reputation) + ' réputation', index === 0 ? 'gold' : null)
                    });
                }).join('');
            }
        }
    };

    /** Ai-je de quoi honorer cette commande ? */
    function deliverability(s, order) {
        var missing = (order.lines || []).filter(function (line) {
            return stockOf(s, line.ingredientName) < Number(line.quantity);
        });
        return { ok: missing.length === 0, missing: missing };
    }

    function orderLines(order) {
        return (order.lines || []).map(function (line) {
            return fmt.quantity(line.quantity, line.unit) + ' ' + de(line.ingredientName);
        }).join(', ');
    }

    function renderMarket(s) {
        var open = s.market.filter(function (order) { return order.creatorId !== s.player.id; });
        var head = '<p class="section-title">Ce que les autres domaines réclament</p>';

        if (!open.length) {
            return head + empty('Aucune demande en attente. Passe la tienne, quelqu’un finira par la voir.') +
                newOrderButton();
        }

        return head + open.map(function (order) {
            var can = deliverability(s, order);
            var lack = can.missing.slice(0, 2).map(function (l) { return l.ingredientName; }).join(', ');
            return row({
                icon: 'i-orders',
                title: order.creatorUsername,
                meta: orderLines(order) +
                    ' · expire dans ' + fmt.countdown(order.expiresAt) +
                    (can.ok ? '' : ' — il te manque ' + lack),
                side: (can.ok
                        ? actionButton('fulfill-order', 'Livrer', order.id)
                        : chip('hors de portée')) +
                    chip(fmt.number(order.rewardCoins) + ' pièces', 'gold')
            });
        }).join('') + newOrderButton();
    }

    function renderMyOrders(s) {
        if (!s.myOrders.length) {
            return empty('Tu n’as rien demandé pour l’instant.') + newOrderButton();
        }
        return s.myOrders.map(function (order) {
            var open = order.status === 'OPEN';
            var who = order.fulfillerUsername
                ? ' · livrée par ' + order.fulfillerUsername
                : (open ? ' · expire dans ' + fmt.countdown(order.expiresAt) : '');
            return row({
                icon: 'i-orders',
                title: orderLines(order),
                meta: (ORDER_LABELS[order.status] || order.status) + who,
                side: (open ? actionButton('cancel-order', 'Annuler', order.id) : '') +
                    chip(fmt.number(order.rewardCoins) + ' pièces', order.fulfilledByNpc ? 'warn' : 'gold')
            });
        }).join('') + newOrderButton();
    }

    function renderNpcOrders(s) {
        if (!s.npcOrders.length) return empty('Aucun marchand ne te réclame quoi que ce soit.');
        return s.npcOrders.map(function (order) {
            var lines = (order.lines || []).map(function (line) {
                return line.quantity + ' × ' + line.recipeName +
                    (line.minQuality ? ' (qualité ≥ ' + line.minQuality + ')' : '');
            }).join(' · ');
            return row({
                icon: 'i-orders',
                title: order.customerName,
                meta: lines + (order.expiresAt ? ' — expire dans ' + fmt.countdown(order.expiresAt) : ''),
                side: chip(ORDER_LABELS[order.status] || order.status, order.status === 'OPEN' ? 'ok' : 'info') +
                    chip(fmt.number(order.rewardCoins) + ' pièces', 'gold')
            });
        }).join('');
    }

    function newOrderButton() {
        return '<div class="account-actions">' +
            '<button class="btn btn--gold" type="button" data-action="new-order">' +
            icon('i-plus') + 'Passer une commande</button></div>';
    }

    function renderChat(s) {
        var mine = s.player.id;
        var list = tavern.messages.length
            ? '<div class="chat" id="chatLog">' + tavern.messages.map(function (message) {
                return '<div class="chat__line' + (message.authorId === mine ? ' chat__line--mine' : '') + '">' +
                    '<span class="chat__avatar">' + icon('av-' + (message.avatar || 'CERF')) + '</span>' +
                    '<span class="chat__body">' +
                    '<span class="chat__who">' + esc(message.author) + '</span>' +
                    '<span class="chat__text">' + esc(message.body) + '</span>' +
                    '</span></div>';
            }).join('') + '</div>'
            : '<p class="empty">La salle est silencieuse. Lance la première réplique.</p>';

        return list +
            '<div class="chat__compose">' +
            '<input id="chatInput" type="text" maxlength="280" placeholder="Dire quelque chose à la salle…" autocomplete="off">' +
            '<button class="btn btn--gold" type="button" data-action="chat-send">Parler</button>' +
            '</div>';
    }

    function renderCounter(s) {
        if (!tavern.counter.length) {
            return empty('Personne ne sert rien pour l’instant. Mets ton fût au comptoir depuis la brasserie.');
        }
        return tavern.counter.map(function (offer) {
            var free = offer.price === 0;
            return row({
                icon: 'i-tavern',
                title: offer.recipeName,
                meta: 'servi par ' + offer.seller +
                    ' · ' + offer.servings + ' service' + (offer.servings > 1 ? 's' : '') +
                    (offer.quality ? ' · qualité ' + offer.quality : '') +
                    (offer.note ? ' — ' + offer.note : ''),
                side: (offer.mine
                        ? chip('ton fût', 'gold')
                        : actionButton('serve-offer', free ? 'Goûter' : offer.price + ' pièces', offer.id)) +
                    (offer.effectKind && offer.effectKind !== 'AUCUN' ? chip(offer.effectLabel, 'info') : '')
            });
        }).join('');
    }

    /* ------------------------------------------------------------- Actions */

    function csrfHeaders() {
        var token = document.querySelector('meta[name="_csrf"]');
        var header = document.querySelector('meta[name="_csrf_header"]');
        var headers = { Accept: 'application/json' };
        if (token && header && token.content) headers[header.content] = token.content;
        return headers;
    }

    function post(url) {
        return fetch(url, { method: 'POST', credentials: 'same-origin', headers: csrfHeaders() })
            .then(function (response) {
                if (!response.ok) throw new Error(String(response.status));
                return response;
            });
    }

    var ENDPOINTS = {
        'harvest-hive': function (id) { return '/api/apiary/hives/' + id + '/harvest'; },
        'harvest-field': function (id) { return '/api/farm/fields/' + id + '/harvest'; }
    };

    function currentNameInput() {
        var field = $('accountName');
        return field ? field.value : null;
    }

    function saveAccount() {
        var payload = {
            displayName: currentNameInput(),
            avatar: accountDraft.avatar || state.player.avatar || 'CERF'
        };
        var headers = csrfHeaders();
        headers['Content-Type'] = 'application/json';

        Data.saveAccount(payload, headers)
            .then(function (account) {
                state.player = account;
                accountDraft = { avatar: null, displayName: null };
                render();
                toast('Compte mis à jour.');
            })
            .catch(function (error) {
                if (error.sessionExpired) showFault(error);
                else toast(error.message);
            });
    }

    function openPicker(kind, fieldId) {
        picker = { kind: kind, fieldId: fieldId, query: '' };
        openScreen(kind === 'crop' ? 'semer' : 'brasser');
        focusSearch();
    }

    function focusSearch() {
        var field = $('pickerSearch');
        if (!field) return;
        field.focus();
        field.setSelectionRange(field.value.length, field.value.length);
    }

    function send(url, body, onDone) {
        var headers = csrfHeaders();
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        return Data.postJson(url, body, headers)
            .then(function (payload) { return refresh().then(function () { onDone(payload); }); })
            .catch(function (error) {
                if (error.sessionExpired) showFault(error);
                else toast(error.message);
            });
    }

    /** Fusionne sans doublon : deux chargements peuvent se croiser. */
    function mergeMessages(existing, incoming) {
        var seen = {};
        return existing.concat(incoming)
            .filter(function (message) {
                if (seen[message.id]) return false;
                seen[message.id] = true;
                return true;
            })
            .sort(function (a, b) { return a.id - b.id; })
            .slice(-60);
    }

    function loadTavern(force) {
        if (tavern.loading && !force) return Promise.resolve();
        tavern.loading = true;

        var job = tavern.tab === 'salle'
            ? Data.get('/api/tavern/chat' + (tavern.lastId && !force ? '?since=' + tavern.lastId : ''))
                .then(function (messages) {
                    tavern.messages = force ? messages : mergeMessages(tavern.messages, messages);
                    if (tavern.messages.length) {
                        tavern.lastId = tavern.messages[tavern.messages.length - 1].id;
                    }
                })
            : Data.get('/api/tavern/counter').then(function (offers) { tavern.counter = offers; });

        return job
            .then(function () { if (activeView === 'taverne') { renderScreen(); scrollChat(); } })
            .catch(function () { /* la salle attendra le prochain passage */ })
            .then(function () { tavern.loading = false; });
    }

    function scrollChat() {
        var log = $('chatLog');
        if (log) log.scrollTop = log.scrollHeight;
    }

    function watchTavern(on) {
        clearInterval(tavern.timer);
        tavern.timer = null;
        if (on) tavern.timer = setInterval(function () { loadTavern(false); }, 4000);
    }

    function runAction(action, id) {
        if (action && action.indexOf('set-') === 0) {
            settings[action.slice(4)] = id;
            saveSettings();
            renderScreen();
            return;
        }

        if (action === 'toggle') {
            settings[id] = !settings[id];
            saveSettings();
            renderScreen();
            return;
        }

        if (action === 'orders-tab') { orders.tab = id; renderScreen(); return; }

        if (action === 'new-order') {
            orders.ingredient = null;
            orders.query = '';
            openScreen('commande');
            focusSearch();
            return;
        }

        if (action === 'pick-order-ingredient') {
            orders.ingredient = state.ingredients.find(function (i) { return i.id === Number(id); });
            renderScreen();
            return;
        }

        if (action === 'order-confirm') {
            var quantity = Number(($('orderQty') || {}).value || 0);
            var reward = Number(($('orderReward') || {}).value || 0);
            var minutes = Number(($('orderMinutes') || {}).value || 0);
            if (quantity <= 0 || reward <= 0) { toast('Quantité et récompense doivent être positives.'); return; }
            if (reward > state.player.coins) { toast('Ta bourse ne suit pas.'); return; }

            send('/api/player-orders', {
                creatorId: state.player.id,
                expiresInMinutes: minutes,
                rewardCoins: reward,
                lines: [{ ingredientId: orders.ingredient.id, quantity: quantity }]
            }, function () {
                orders.tab = 'miennes';
                openScreen('commandes');
                toast('Commande publiée.');
            });
            return;
        }

        if (action === 'fulfill-order') {
            send('/api/player-orders/' + Number(id) + '/fulfill', undefined,
                function () { toast('Livré. Les pièces sont à toi.'); });
            return;
        }

        if (action === 'cancel-order') {
            send('/api/player-orders/' + Number(id) + '/cancel', undefined,
                function () { toast('Commande retirée, mise remboursée.'); });
            return;
        }

        if (action === 'tavern-tab') {
            tavern.tab = id;
            tavern.lastId = null;
            renderScreen();
            loadTavern(true);
            return;
        }

        if (action === 'chat-send') {
            var field = $('chatInput');
            if (!field || !field.value.trim()) return;
            var headers = csrfHeaders();
            headers['Content-Type'] = 'application/json';
            var text = field.value;
            field.value = '';
            Data.postJson('/api/tavern/chat', { body: text }, headers)
                .then(function () { return loadTavern(false); })
                .then(function () { var f = $('chatInput'); if (f) f.focus(); })
                .catch(function (error) { toast(error.message); field.value = text; });
            return;
        }

        if (action === 'serve-offer') {
            send('/api/tavern/counter/' + Number(id) + '/serve', undefined, function (result) {
                loadTavern(true);
                if (result) {
                    toast(result.effect
                        ? result.recipeName + ' — ' + result.effect.label
                        : result.recipeName + ' — ' + (result.flavour || 'santé !'));
                }
            });
            return;
        }

        if (action === 'offer-batch') {
            var batch = state.batches.find(function (b) { return b.id === Number(id); });
            if (!batch) return;
            offerDraft = { batchId: batch.id, recipeName: batch.recipeName };
            openScreen('comptoir');
            return;
        }

        if (action === 'offer-confirm') {
            var servings = Number(($('offerServings') || {}).value || 0);
            var price = Number(($('offerPrice') || {}).value || 0);
            var note = ($('offerNote') || {}).value || '';
            send('/api/tavern/counter',
                { batchId: offerDraft.batchId, servings: servings, price: price, note: note },
                function () {
                    tavern.tab = 'comptoir';
                    openScreen('taverne');
                    loadTavern(true);
                    toast(price === 0 ? 'C’est ta tournée.' : 'Fût au comptoir.');
                });
            return;
        }

        if (action === 'open-brew') { openPicker('recipe'); return; }
        if (action === 'sow-field') { openPicker('crop', Number(id)); return; }

        if (action === 'pick-crop') {
            var fieldId = picker ? picker.fieldId : null;
            send('/api/farm/plant', { fieldId: fieldId, cropId: Number(id) },
                function () { selectView('monde'); openPlace('champs'); toast('Semé. Ça pousse.'); });
            return;
        }

        if (action === 'pick-recipe') {
            var recipe = state.recipes.find(function (r) { return r.id === Number(id); });
            if (!recipe) return;
            send('/api/brewery/batches', { playerId: state.player.id, recipeId: recipe.id, volume: recipe.baseVolume },
                function () { selectView('monde'); openPlace('brasserie'); toast('Brassin lancé : ' + recipe.name); });
            return;
        }

        if (action === 'start-hive') {
            send('/api/apiary/hives/' + Number(id) + '/start', undefined,
                function () { toast('La ruche se remet au travail.'); });
            return;
        }

        if (action === 'taste-batch') {
            send('/api/brewery/batches/' + Number(id) + '/taste', undefined, function (result) {
                if (!result) return;
                var effect = result.effect;
                toast(effect
                    ? result.recipeName + ' — ' + effect.label + ' (' + effect.magnitude + '%)'
                    : result.recipeName + ' — ' + (result.flavour || 'rien de particulier.'));
            });
            return;
        }

        if (action === 'pick-avatar') {
            accountDraft.displayName = currentNameInput();
            accountDraft.avatar = id;
            renderScreen();
            return;
        }
        if (action === 'open-settings') { openScreen('reglages'); return; }

        if (action === 'change-password') {
            var current = $('pwdCurrent'), fresh = $('pwdNew'), again = $('pwdConfirm');
            if (!current || !fresh || !again) return;
            var headers = csrfHeaders();
            headers['Content-Type'] = 'application/json';
            fetch('/api/account/password', {
                method: 'PUT',
                credentials: 'same-origin',
                headers: headers,
                body: JSON.stringify({
                    currentPassword: current.value,
                    newPassword: fresh.value,
                    confirmation: again.value
                })
            }).then(function (response) {
                if (response.ok) {
                    current.value = fresh.value = again.value = '';
                    toast('Mot de passe changé.');
                    return;
                }
                return response.json().catch(function () { return {}; })
                    .then(function (payload) { toast(payload.message || 'Changement refusé.'); });
            }).catch(function () { toast('Changement impossible pour l’instant.'); });
            return;
        }

        if (action === 'save-account') {
            saveAccount();
            return;
        }
        if (action === 'logout') {
            var form = $('logoutForm');
            if (form) form.submit();
            return;
        }

        var endpoint = ENDPOINTS[action];
        if (!endpoint) return;
        post(endpoint(Number(id)))
            .then(function () { return refresh(); })
            .then(function () { toast('Action enregistrée.'); })
            .catch(function () { toast('L’action n’a pas pu être enregistrée.'); });
    }

    /* --------------------------------------------------------------- Rendu */

    function renderPlayer() {
        var player = state.player;
        dom.playerName.textContent = player.displayName || player.username || '—';
        dom.playerAvatar.innerHTML = icon('av-' + (player.avatar || 'CERF'));
        dom.playerLevel.textContent = 'Niveau ' + player.level;
        var xp = player.experience % Data.XP_PER_LEVEL;
        dom.xpBar.style.width = (xp / Data.XP_PER_LEVEL * 100) + '%';
        dom.xpLabel.textContent = fmt.number(xp) + ' / ' + fmt.number(Data.XP_PER_LEVEL) + ' XP';
    }

    function renderResources() {
        dom.resources.innerHTML = Data.RESOURCES.map(function (resource) {
            return '<div class="resource" role="listitem">' +
                icon(resource.icon, 'resource__icon') +
                '<span class="resource__text">' +
                '<span class="resource__value">' + esc(fmt.number(resource.read(state))) + '</span>' +
                '<span class="resource__label">' + esc(resource.label) + '</span>' +
                '</span></div>';
        }).join('');
    }

    function renderEffects() {
        var effects = (state.effects || []).filter(function (e) {
            return new Date(e.expiresAt).getTime() > Date.now();
        });
        dom.effects.innerHTML = effects.map(function (effect) {
            var tone = effect.cosmetic ? 'info' : (effect.beneficial ? 'ok' : 'warn');
            return '<span class="effect effect--' + tone + '" title="' + esc(effect.source || '') + '">' +
                '<i></i>' + esc(effect.label) +
                (effect.magnitude ? ' ' + effect.magnitude + '%' : '') +
                '<small>' + esc(fmt.countdown(effect.expiresAt)) + '</small></span>';
        }).join('');
        dom.effects.hidden = effects.length === 0;
    }

    function renderQuest() {
        var goal = Data.goal(state);
        dom.questText.textContent = goal.text;
        dom.questCount.textContent = goal.done + '/' + goal.total;
        dom.questBar.style.width = (goal.total ? goal.done / goal.total * 100 : 0) + '%';
        dom.questBox.classList.toggle('is-done', goal.done >= goal.total);
        dom.quest.dataset.place = goal.place;
    }

    function renderFeed() {
        var items = Data.feed(state);
        dom.feedList.innerHTML = items.slice(0, 4).map(function (item) {
            return '<li data-tone="' + item.tone + '">' + esc(item.text) + '</li>';
        }).join('');
    }

    /** Un mot quand un travail s'achève, une seule fois par élément. */
    function announceReady() {
        if (!settings.alertes || !state) return;
        var due = [];

        state.fields.forEach(function (field) {
            if ((field.status === 'READY' || (field.readyAt && fmt.isDone(field.readyAt))) && !readySeen['f' + field.id]) {
                readySeen['f' + field.id] = true;
                due.push((field.cropName || 'Une parcelle') + ' est à récolter');
            }
        });
        state.hives.forEach(function (hive) {
            if (hive.status === 'READY' && !readySeen['h' + hive.id]) {
                readySeen['h' + hive.id] = true;
                due.push('Le miel de la ruche n°' + hive.id + ' est prêt');
            }
        });
        state.batches.forEach(function (batch) {
            if (batch.status === 'READY' && !readySeen['b' + batch.id]) {
                readySeen['b' + batch.id] = true;
                due.push(batch.recipeName + ' sort de garde');
            }
        });

        if (due.length) toast(due[0] + (due.length > 1 ? ' (+' + (due.length - 1) + ')' : ''));
    }

    function renderMarkers() {
        Data.PLACES.forEach(function (place) {
            var marker = dom.markers.querySelector('[data-place="' + place.id + '"]');
            if (marker) marker.dataset.state = Data.placeState(place.id, state);
        });
    }

    function renderPlace() {
        if (!activePlace) return;
        var section = SECTIONS[activePlace.screen];
        dom.placeBody.innerHTML = section ? section.render(state) : '';
    }

    function renderScreen() {
        var section = SECTIONS[activeView];
        if (!section) return;
        dom.screenTitle.textContent = section.title;
        dom.screenBody.innerHTML = section.render(state);
    }

    function render() {
        if (!accountDraft) accountDraft = { avatar: null, displayName: null };
        renderPlayer();
        renderResources();
        renderEffects();
        renderQuest();
        renderFeed();
        renderMarkers();
        renderPlace();
        if (activeView !== 'monde') renderScreen();
    }

    /* --------------------------------------------------------- Navigation */

    function buildMarkers() {
        dom.markers.innerHTML = Data.PLACES.map(function (place) {
            return '<button class="marker" type="button" data-place="' + place.id + '" data-state="idle"' +
                ' style="left:' + place.x + 'px;top:' + place.y + 'px"' +
                ' aria-label="Ouvrir : ' + esc(place.label) + '">' +
                '<span class="marker__plate"><span class="marker__dot"></span>' + esc(place.label) + '</span>' +
                '<span class="marker__pin"></span>' +
                '</button>';
        }).join('');
    }

    function openPlace(id) {
        var place = Data.PLACES.find(function (p) { return p.id === id; });
        if (!place) return;
        closeScreen();
        activePlace = place;

        dom.markers.querySelectorAll('.marker').forEach(function (marker) {
            marker.classList.toggle('is-active', marker.dataset.place === id);
        });

        dom.placeKicker.textContent = place.kicker;
        dom.placeTitle.textContent = place.label;
        dom.placeIntro.textContent = place.intro;
        dom.placeAction.textContent = place.action;
        renderPlace();
        dom.place.classList.add('is-open');
        dom.place.setAttribute('aria-hidden', 'false');

        if (!settings.recentrage) { hideHint(); return; }

        var drawer = dom.place.getBoundingClientRect();
        var narrow = window.matchMedia('(max-width: 1080px)').matches;
        camera.focus(place.x, place.y, {
            scale: Math.max(camera.fit * 1.35, camera.fit),
            offsetX: narrow ? 0 : -drawer.width / 2,
            offsetY: narrow ? -drawer.height / 3 : 0
        });
        hideHint();
    }

    function closePlace() {
        activePlace = null;
        dom.place.classList.remove('is-open');
        dom.place.setAttribute('aria-hidden', 'true');
        dom.markers.querySelectorAll('.marker').forEach(function (marker) {
            marker.classList.remove('is-active');
        });
    }

    function openScreen(view) {
        if (!SECTIONS[view]) return;
        closePlace();
        activeView = view;
        accountDraft = { avatar: null, displayName: null };
        renderScreen();
        syncDock();
        watchTavern(view === 'taverne');
        if (view === 'taverne') loadTavern(true);
        dom.screen.classList.add('is-open');
        dom.screen.setAttribute('aria-hidden', 'false');
        dom.screen.focus({ preventScroll: true });
    }

    function closeScreen() {
        watchTavern(false);
        activeView = 'monde';
        dom.screen.classList.remove('is-open');
        dom.screen.setAttribute('aria-hidden', 'true');
        syncDock();
    }

    function syncDock() {
        dom.dock.querySelectorAll('.dock__tab').forEach(function (tab) {
            tab.classList.toggle('is-active', tab.dataset.view === activeView);
        });
        dom.game.dataset.view = activeView;
    }

    function selectView(view) {
        if (view === 'monde') {
            closeScreen();
            closePlace();
            camera.reset();
        } else {
            openScreen(view);
        }
        syncDock();
    }

    function hideHint() {
        dom.worldHint.classList.add('is-hidden');
    }

    /* ---------------------------------------------------------- Événements */

    function bind() {
        dom.markers.addEventListener('click', function (event) {
            var marker = event.target.closest('.marker');
            if (marker) openPlace(marker.dataset.place);
        });

        dom.placeClose.addEventListener('click', closePlace);

        dom.placeAction.addEventListener('click', function () {
            if (activePlace) openScreen(activePlace.screen);
        });

        dom.place.addEventListener('click', function (event) {
            var button = event.target.closest('[data-action]');
            if (button) runAction(button.dataset.action, button.dataset.id);
        });

        dom.screenBody.addEventListener('keydown', function (event) {
            if (event.target.id === 'chatInput' && event.key === 'Enter') {
                event.preventDefault();
                runAction('chat-send');
            }
        });

        dom.screenBody.addEventListener('input', function (event) {
            if (event.target.id !== 'pickerSearch') return;
            if (activeView === 'commande') orders.query = event.target.value;
            else if (picker) picker.query = event.target.value;
            else return;
            renderScreen();
            focusSearch();
        });

        dom.screenBody.addEventListener('click', function (event) {
            var button = event.target.closest('[data-action]');
            if (button) runAction(button.dataset.action, button.dataset.id);
        });

        dom.screenClose.addEventListener('click', function () { selectView('monde'); });

        dom.screen.addEventListener('click', function (event) {
            if (event.target === dom.screen) selectView('monde');
        });

        dom.dock.addEventListener('click', function (event) {
            var tab = event.target.closest('.dock__tab');
            if (tab) selectView(tab.dataset.view);
        });

        dom.questRow.addEventListener('click', function () {
            openPlace(dom.quest.dataset.place || 'commandes');
        });

        dom.settingsBtn.addEventListener('click', function () {
            openScreen('compte');
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                if (dom.screen.classList.contains('is-open')) selectView('monde');
                else if (activePlace) closePlace();
            }
        });

        dom.world.addEventListener('pointerdown', hideHint, { once: true });

        dom.faultRetry.addEventListener('click', function () {
            dom.faultRetry.disabled = true;
            refresh().catch(function () {}).then(function () { dom.faultRetry.disabled = false; });
        });
    }

    /* ------------------------------------------------------------ Démarrage */

    function refresh() {
        return Data.load().then(function (fresh) {
            state = fresh;
            hideFault();
            render();
            announceReady();
            return state;
        }, function (error) {
            showFault(error);
            throw error;
        });
    }

    function start() {
        ['game', 'world', 'scene', 'markers', 'worldHint', 'playerName', 'playerAvatar', 'playerLevel',
            'xpBar', 'xpLabel', 'resources', 'quest', 'questRow', 'questText', 'questBar', 'questCount',
            'questBox', 'feedList', 'dock', 'place', 'placeKicker', 'placeTitle', 'placeIntro', 'placeBody',
            'placeAction', 'placeClose', 'screen', 'screenTitle', 'screenBody', 'screenClose', 'toast',
            'settingsBtn', 'fault', 'faultTitle', 'faultText', 'faultRetry', 'faultLogin', 'effects'].forEach(function (id) { dom[id] = $(id); });

        loadSettings();
        camera = global.BrewsteadWorld.create({ world: dom.world, scene: dom.scene });
        buildMarkers();
        bind();
        camera.reset();

        refresh().catch(function () { /* panneau de panne déjà affiché */ }).then(function () {
            setInterval(function () {
                if (!state) return;
                renderMarkers();
                renderPlace();
                // On ne réécrit que les écrans à minuterie : ailleurs cela
                // effacerait ce que le joueur est en train de saisir.
                if (activeView !== 'monde' && SECTIONS[activeView] && SECTIONS[activeView].live) {
                    renderScreen();
                }
            }, 1000);
            setInterval(function () { if (state) { renderFeed(); renderQuest(); renderEffects(); } }, 15000);
        });

        setTimeout(hideHint, 6000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})(window);
