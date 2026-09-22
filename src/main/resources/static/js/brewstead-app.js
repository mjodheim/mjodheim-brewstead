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
    var recipeQuery = '';
    var tavern = { tab: 'salle', messages: [], counter: [], timer: null, requests: {}, draft: '', sending: false, error: '', connectionError: '' };
    var refreshJob = null;
    var mutationPending = false;
    var navigationVersion = 0;
    var offerDraft = null;      // { batchId, recipeName, maxServings }
    var orders = { tab: 'marche', query: '', ingredient: null };
    var lab = null;             // brouillon de recette au laboratoire
    var Scenes = global.BrewsteadScenes;
    var sceneSignature = {};    // par lieu : la composition déjà dessinée
    var listMode = {};          // par lieu : le joueur a demandé la liste

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

    // Conserver les vrais nœuds : un tick ne doit pas interrompre un clic,
    // une saisie, le focus clavier ou la lecture d'un panneau défilé.
    function updateMarkup(container, html) {
        if (container._markup === html) return;
        var template = document.createElement('template');
        template.innerHTML = html;
        function reconcile(parent, incoming) {
            Array.from(incoming.childNodes).forEach(function (next, index) {
                var current = parent.childNodes[index];
                if (!current) { parent.appendChild(next.cloneNode(true)); return; }
                if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName ||
                    (current.nodeType === 1 && (current.id !== next.id ||
                     current.getAttribute('data-action') !== next.getAttribute('data-action') ||
                     current.getAttribute('data-id') !== next.getAttribute('data-id')))) {
                    parent.replaceChild(next.cloneNode(true), current);
                } else if (next.nodeType === 3) {
                    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
                } else if (next.nodeType === 1) {
                    Array.from(current.attributes).forEach(function (attr) {
                        if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
                    });
                    Array.from(next.attributes).forEach(function (attr) {
                        if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
                    });
                    reconcile(current, next);
                }
            });
            while (parent.childNodes.length > incoming.childNodes.length) parent.lastChild.remove();
        }
        reconcile(container, template.content);
        container._markup = html;
    }

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

    /* Le type d'un ingrédient oriente l'effet d'une recette inventée :
       autant que le joueur le voie au moment de le choisir. */
    var TYPE_LABELS = {
        CEREAL: 'céréale', HONEY: 'miel', HOP: 'houblon', YEAST: 'levure', FRUIT: 'fruit',
        HERB: 'plante', SPICE: 'épice', WATER: 'eau', OTHER: 'divers'
    };

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

    /* ------------------------------------------------------- Laboratoire */

    function newLab() {
        return { name: '', drinkType: 'MEAD', volume: 20, minutes: 60, lines: [], query: '' };
    }

    /**
     * Les champs libres du laboratoire sont relus avant chaque réaffichage :
     * sans cela, ajouter un ingrédient effacerait le nom déjà tapé.
     */
    function captureLab() {
        if (!lab) lab = newLab();
        var name = $('labName');
        var volume = $('labVolume');
        var minutes = $('labMinutes');
        if (name) lab.name = name.value;
        if (volume && volume.value) lab.volume = volume.value;
        if (minutes && minutes.value) lab.minutes = minutes.value;
        return lab;
    }

    function labLine(id) {
        return lab.lines.find(function (line) { return line.id === Number(id); });
    }

    function matches(text, query) {
        return !query || String(text).toLowerCase().indexOf(query.toLowerCase()) !== -1;
    }

    function searchField(placeholder, value) {
        return '<label class="account-field" style="margin-bottom:.9em">' +
            '<input id="pickerSearch" type="search" placeholder="' + esc(placeholder) + '"' +
            ' value="' + esc(value || '') + '" autocomplete="off"></label>';
    }

    /** Une tournée en tête d'écran quand plusieurs choses attendent. */
    function reapHeader(s, kind) {
        var waiting = Data.placeCount(kind, s);
        if (waiting < 2) return '';
        return '<div class="account-actions" style="margin:0 0 .8em">' +
            '<button class="btn btn--gold" type="button" data-action="harvest-all">' +
            icon('i-basket') + 'Tout récolter (' + waiting + ')</button></div>';
    }

    var SECTIONS = {
        rucher: {
            live: true,
            scene: 'rucher',
            title: 'Rucher',
            render: function (s) {
                if (!s.hives.length) return empty('Aucune ruche installée pour l’instant.');
                return reapHeader(s, 'rucher') + s.hives.map(function (hive) {
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
            scene: 'champs',
            title: 'Champs',
            render: function (s) {
                if (!s.fields.length) return empty('Aucune parcelle cultivée pour l’instant.');
                return reapHeader(s, 'champs') + s.fields.map(function (field) {
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
                    var lack = can.missing.map(function (l) {
                        return fmt.quantity(Number(l.quantity) - stockOf(s, l.ingredientName), l.unit) + ' ' + de(l.ingredientName);
                    }).join(', ');
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
            scene: 'brasserie',
            title: 'Brasserie',
            render: function (s) {
                var head = '<div class="account-actions" style="margin:0 0 .8em">' +
                    '<button class="btn btn--gold" type="button" data-action="open-brew">' +
                    icon('i-plus') + 'Lancer un brassin</button></div>';
                if (!s.batches.length) return head + empty('Aucun brassin en cours.');
                return head + s.batches.map(function (batch) {
                    var ready = batch.status === 'READY';
                    var finished = batch.status === 'SOLD_OUT' || batch.status === 'CANCELLED';
                    return row({
                        icon: 'i-barrel',
                        title: batch.recipeName,
                        meta: fmt.number(batch.volume) + ' L' + (batch.quality ? ' · qualité ' + batch.quality : ''),
                        progress: !ready && !finished && batch.readyAt ? progress(batch.startedAt, batch.readyAt) : '',
                        side: ready
                            ? actionButton('taste-batch', 'Goûter', batch.id) +
                              actionButton('offer-batch', 'Au comptoir', batch.id)
                            : chip(batch.status === 'SOLD_OUT' ? 'Fût épuisé' : (BATCH_LABELS[batch.status] || batch.status), batch.status === 'SOLD_OUT' ? 'info' : 'warn')
                    });
                }).join('');
            }
        },

        recettes: {
            title: 'Grimoire des recettes',
            render: function (s) {
                var head = '<div class="account-actions" style="margin:0 0 .8em">' +
                    '<button class="btn btn--gold" type="button" data-action="open-lab">' +
                    icon('i-plus') + 'Composer une recette</button></div>';

                if (!s.recipes.length) return head + empty('Aucune recette au grimoire.');
                var recipes = s.recipes.filter(function (recipe) {
                    return matches(recipe.name, recipeQuery) || matches(DRINK_LABELS[recipe.drinkType], recipeQuery);
                });
                return head + searchField('Chercher une recette…', recipeQuery) + (recipes.length ? recipes.map(function (recipe) {
                    var ingredients = (recipe.ingredients || []).map(function (i) {
                        return i.ingredientName + ' ' + fmt.quantity(i.quantity, i.unit);
                    }).join(' · ');
                    return row({
                        icon: 'i-recipe',
                        title: recipe.name,
                        meta: (DRINK_LABELS[recipe.drinkType] || recipe.drinkType) +
                            ' · ' + fmt.number(recipe.baseVolume) + ' L · ' + recipe.fermentationDurationMinutes + ' min' +
                            (ingredients ? ' — ' + ingredients : ''),
                        side: actionButton('prepare-recipe', 'Préparer', recipe.id) +
                            (recipe.isPublic ? '' : chip('ton invention', 'gold')) +
                            (recipe.effectKind && recipe.effectKind !== 'AUCUN'
                                ? chip(recipe.effectLabel, 'info') : '') +
                            chip(brewability(s, recipe).ok ? 'Ingrédients disponibles' : 'Ingrédients à réunir', brewability(s, recipe).ok ? 'ok' : 'warn')
                    });
                }).join('') : empty('Aucune recette ne correspond.'));
            }
        },

        atelier: {
            title: 'Composer une recette',
            render: function (s) {
                var draft = lab || (lab = newLab());
                var taken = draft.lines.map(function (line) { return line.id; });
                var shelf = s.ingredients.filter(function (item) {
                    return taken.indexOf(item.id) === -1 && matches(item.name, draft.query);
                });

                var types = '<div class="choices">' + ['MEAD', 'BEER', 'CIDER', 'OTHER'].map(function (key) {
                    return '<button class="choices__item' + (draft.drinkType === key ? ' is-chosen' : '') + '"' +
                        ' type="button" data-action="lab-type" data-id="' + key + '">' +
                        esc(DRINK_LABELS[key]) + '</button>';
                }).join('') + '</div>';

                var mix = draft.lines.length
                    ? draft.lines.map(function (line) {
                        return row({
                            icon: 'i-pouch',
                            title: line.name,
                            meta: esc(TYPE_LABELS[line.type] || 'divers') +
                                ' · en réserve : ' + fmt.number(stockOf(s, line.name)),
                            side: '<span class="dose">' +
                                '<button class="btn btn--sm" type="button" data-action="lab-less"' +
                                ' data-id="' + line.id + '" aria-label="Diminuer la dose">−</button>' +
                                '<span class="dose__value">' +
                                esc(fmt.quantity(line.quantity, line.unit)) + '</span>' +
                                '<button class="btn btn--sm" type="button" data-action="lab-more"' +
                                ' data-id="' + line.id + '" aria-label="Augmenter la dose">+</button>' +
                                '<button class="btn btn--sm" type="button" data-action="lab-remove"' +
                                ' data-id="' + line.id + '" aria-label="Retirer cet ingrédient">×</button>' +
                                '</span>'
                        });
                    }).join('')
                    : empty('Rien dans la cuve. C’est le mélange qui fait la recette.');

                return '<p class="hint">Tu choisis le mélange, jamais l’effet : c’est lui qui décide. ' +
                    'Un même dosage donne toujours le même résultat, alors note ce qui marche. ' +
                    'Les épices et les plantes réveillent les breuvages plus sûrement que l’orge.</p>' +

                    '<label class="account-field"><input id="labName" type="text" maxlength="60"' +
                    ' placeholder="Le nom de ton breuvage" value="' + esc(draft.name) + '" autocomplete="off">' +
                    '<small>Il figurera au grimoire, à la brasserie et au comptoir.</small></label>' +

                    '<p class="section-title">Type</p>' + types +

                    '<div class="lab-grid">' +
                    '<label class="account-field">' +
                    '<input id="labVolume" type="number" min="1" max="200" step="1" value="' + esc(draft.volume) + '">' +
                    '<small>Litres par brassin.</small></label>' +
                    '<label class="account-field">' +
                    '<input id="labMinutes" type="number" min="5" max="10080" step="5" value="' + esc(draft.minutes) + '">' +
                    '<small>Minutes de fermentation.</small></label>' +
                    '</div>' +

                    '<p class="section-title">Le mélange — ' + draft.lines.length + ' sur 8</p>' + mix +

                    (draft.lines.length < 8
                        ? searchField('Ajouter un ingrédient…', draft.query) +
                            (shelf.length
                                ? '<div class="grid">' + shelf.slice(0, 24).map(function (item) {
                                    return '<button class="row row--pick" type="button"' +
                                        ' data-action="lab-add" data-id="' + item.id + '">' +
                                        icon('i-pouch', 'row__icon') +
                                        '<span class="row__body"><span class="row__title">' + esc(item.name) + '</span>' +
                                        '<small class="row__meta">' + esc(TYPE_LABELS[item.type] || 'divers') +
                                        ' · en réserve : ' + esc(fmt.number(stockOf(s, item.name))) +
                                        '</small></span></button>';
                                }).join('') + '</div>'
                                : empty('Aucun ingrédient ne correspond.'))
                        : '<p class="hint">Huit ingrédients, c’est déjà beaucoup pour une seule cuve.</p>') +

                    '<div class="account-actions">' +
                    '<button class="btn" type="button" data-action="lab-reset">Repartir de zéro</button>' +
                    '<button class="btn btn--gold" type="button" data-action="lab-save">' +
                    icon('i-check') + 'Inscrire au grimoire</button>' +
                    '</div>';
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
                    toggle('ambiance', 'Décor vivant et lumière',
                        'Nuages, cascades, reflets et lumières des bâtiments. Désactive-les pour alléger l’affichage.') +
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
                    '<p class="hint">Un service = 0,5 L. Ce fût permet encore ' + offerDraft.maxServings + ' services.</p>' +
                    '<label class="account-field"><input id="offerServings" type="number" min="1" max="' + offerDraft.maxServings + '" value="' + Math.min(6, offerDraft.maxServings) + '">' +
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
            title: 'Renommée & hauts faits',
            render: function (s) {
                var progression = s.progression;
                var achievementBlock = '';
                if (progression) {
                    var unlocked = progression.achievements.filter(function (a) { return a.unlocked; }).length;
                    var season = progression.season;
                    var selectedSpec = progression.specializations.find(function (spec) { return spec.selected; });
                    var seasonNext = season.milestones.find(function (value) { return value > season.points; }) || season.milestones[season.milestones.length - 1];
                    var seasonBlock = '<section class="season-card">' +
                        '<div><small>Saison en cours · jusqu’au ' + esc(new Date(season.endsOn + 'T12:00:00').toLocaleDateString('fr-FR')) + '</small>' +
                        '<h3>' + esc(season.name) + '</h3></div>' +
                        '<strong>' + season.points + ' sceaux</strong>' +
                        '<div class="season-card__track"><span style="width:' + Math.min(100, season.points / seasonNext * 100) + '%"></span></div>' +
                        '<small>Palier personnel ' + season.rewardTier + '/' + season.milestones.length +
                        ' · effort du fjord ' + season.communityPoints + '/' + season.communityTarget + '</small></section>';
                    var specializationBlock = '<p class="section-title">Spécialisation du domaine</p>' +
                        '<div class="specializations">' + progression.specializations.map(function (spec) {
                            var locked = !!selectedSpec && !spec.selected;
                            var lowLevel = !selectedSpec && s.player.level < 2;
                            return '<button class="specialization' + (spec.selected ? ' is-selected' : '') + '" type="button"' +
                                (locked || lowLevel ? ' disabled' : '') + ' data-action="choose-specialization" data-id="' + spec.code + '">' +
                                '<strong>' + esc(spec.label) + '</strong><small>' + esc(spec.description) + '</small>' +
                                '<em>' + (spec.selected ? 'Spécialité active' : (lowLevel ? 'Disponible au niveau 2' : 'Choisir définitivement')) + '</em></button>';
                        }).join('') + '</div>';
                    var themesBlock = '<p class="section-title">Ambiance du domaine</p><div class="theme-picker">' +
                        progression.themes.map(function (theme) {
                            return '<button type="button" class="theme-choice' + (theme.selected ? ' is-selected' : '') +
                                '" data-action="choose-theme" data-id="' + theme.code + '">' + esc(theme.label) + '</button>';
                        }).join('') + '</div>';
                    var daily = progression.dailyQuest;
                    var dailyBlock = daily ? '<section class="daily-card"><strong>Objectif du jour</strong>' +
                        '<p>' + esc(daily.title) + ' · ' + daily.progress + '/' + daily.target + '</p>' +
                        (daily.claimed ? chip('Récompense reçue', 'ok') : actionButton('daily-place', 'Poursuivre l’objectif', daily.place)) + '</section>' : '';
                    achievementBlock = dailyBlock + seasonBlock + '<div class="progression-summary">' +
                        '<strong>' + progression.visitStreak + ' jour' + (progression.visitStreak > 1 ? 's' : '') + ' de série</strong>' +
                        '<span>' + unlocked + '/' + progression.achievements.length + ' hauts faits</span></div>' +
                        specializationBlock + themesBlock + '<p class="section-title">Hauts faits</p>' +
                        '<div class="achievements">' + progression.achievements.map(function (achievement) {
                            var value = Math.min(achievement.progress, achievement.target);
                            return '<article class="achievement' + (achievement.unlocked ? ' is-unlocked' : '') + '">' +
                                icon(achievement.unlocked ? 'i-trophy' : 'i-compass', 'achievement__icon') +
                                '<div><strong>' + esc(achievement.title) + '</strong>' +
                                '<small>' + esc(achievement.description) + '</small>' +
                                '<span class="bar"><i style="width:' + (value / achievement.target * 100) + '%"></i></span>' +
                                '<em>' + value + '/' + achievement.target + ' · ' + achievement.rewardCoins + ' pièces · ' + achievement.rewardExperience + ' XP</em></div>' +
                                '</article>';
                        }).join('') + '</div><p class="section-title">Classement du fjord</p>';
                }
                var players = (s.tavern.notablePlayers || []).slice().sort(function (a, b) {
                    return b.reputation - a.reputation;
                });
                if (!players.length) return achievementBlock + empty('Le classement n’est pas encore établi.');
                return achievementBlock + players.map(function (player, index) {
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
        var active = s.npcOrders.filter(function (order) { return order.status === 'OPEN' || order.status === 'IN_PROGRESS'; });
        var head = '<p class="hint">Brasse, puis livre les marchands pour gagner des pièces, de la réputation et de l’expérience. Trois contrats actifs au maximum.</p>' +
            '<div class="account-actions"><button class="btn btn--gold" type="button" data-action="npc-generate"' +
            (active.length >= 3 ? ' disabled' : '') + '>Faire venir un marchand</button></div>';
        if (!s.npcOrders.length) return head + empty('Le premier marchand attend ton invitation.');
        return head + s.npcOrders.map(function (order) {
            var open = (order.status === 'OPEN' || order.status === 'IN_PROGRESS') && !fmt.isDone(order.expiresAt);
            var available = (order.lines || []).every(function (line) {
                return s.batches.filter(function (batch) {
                    return batch.recipeId === line.recipeId && batch.status === 'READY' && batch.quality >= line.minQuality;
                }).reduce(function (total, batch) { return total + Number(batch.volume); }, 0) >= line.quantity;
            });
            var lines = (order.lines || []).map(function (line) {
                return line.quantity + ' L de ' + line.recipeName +
                    (line.minQuality ? ' (qualité ≥ ' + line.minQuality + ')' : '');
            }).join(' · ');
            return row({
                icon: 'i-orders',
                title: order.customerName,
                meta: lines + (open && order.expiresAt ? ' — expire dans ' + fmt.countdown(order.expiresAt) : ''),
                side: chip(ORDER_LABELS[order.status] || order.status, order.status === 'OPEN' ? 'ok' : 'info') +
                    chip(fmt.number(order.rewardCoins) + ' pièces · ' + order.rewardReputation + ' réputation', 'gold') +
                    (open && order.status === 'OPEN' ? actionButton('npc-accept', 'Accepter', order.id) : '') +
                    (open ? (available ? actionButton('npc-complete', 'Livrer le brassin', order.id)
                        : chip('Brassin requis en cave', 'warn') +
                          ((order.lines || []).length ? actionButton('prepare-recipe', 'Préparer la recette', order.lines[0].recipeId) : '')) : '')
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
        var list = '<div class="chat" id="chatLog" role="log" aria-label="Messages de la salle">' + (tavern.messages.length
            ? tavern.messages.map(function (message) {
                return '<div class="chat__line' + (message.authorId === mine ? ' chat__line--mine' : '') + '">' +
                    '<span class="chat__avatar">' + icon('av-' + (message.avatar || 'CERF')) + '</span>' +
                    '<span class="chat__body">' +
                    '<span class="chat__who">' + esc(message.author) + '</span>' +
                    '<span class="chat__text">' + esc(message.body) + '</span>' +
                    '</span></div>';
            }).join('')
            : '<p class="empty">La salle est silencieuse. Lance la première réplique.</p>') + '</div>';

        return list +
            '<div class="chat__compose">' +
            '<input id="chatInput" aria-label="Ton message" type="text" maxlength="280" value="' + esc(tavern.draft) + '" placeholder="Dire quelque chose à la salle…" autocomplete="off">' +
            '<button class="btn btn--gold" type="button" data-action="chat-send"' + (tavern.sending ? ' disabled' : '') + '>' + (tavern.sending ? 'Envoi…' : 'Parler') + '</button>' +
            '</div><p class="chat__status" role="status">' + esc(tavern.error || tavern.connectionError) + '</p>';
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

    function send(url, body, onDone, method) {
        if (mutationPending) { toast('Une action est déjà en cours.'); return Promise.resolve(); }
        mutationPending = true;
        var originNavigation = navigationVersion;
        dom.game.setAttribute('aria-busy', 'true');
        toast('Action en cours…');
        var headers = csrfHeaders();
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        return Data.postJson(url, body, headers, method || 'POST')
            .then(function (payload) {
                // Un chargement commencé avant la mutation n'est pas son résultat.
                return (refreshJob || Promise.resolve()).catch(function () {}).then(function () {
                    return refresh().then(function () { onDone(payload, originNavigation === navigationVersion); }, function () {
                        toast('Action enregistrée, mais actualisation impossible. Réessaie le chargement.');
                    });
                });
            })
            .catch(function (error) {
                if (error.sessionExpired) showFault(error);
                else toast(error.message);
            }).finally(function () { mutationPending = false; dom.game.removeAttribute('aria-busy'); });
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
        var tab = tavern.tab;
        if (tavern.requests[tab]) return tavern.requests[tab];
        var log = $('chatLog');
        var atBottom = !log || log.scrollHeight - log.scrollTop - log.clientHeight < 40;
        // Relire la fenêtre bornée évite de perdre un message dont la transaction
        // se termine après celle d'un id plus récent.
        var job = tab === 'salle'
            ? Data.get('/api/tavern/chat')
                .then(function (messages) {
                    tavern.messages = mergeMessages(tavern.messages, messages);
                })
            : Data.get('/api/tavern/counter').then(function (offers) { tavern.counter = offers; });

        tavern.requests[tab] = job.then(function () {
            tavern.connectionError = '';
            if (activeView === 'taverne' && tavern.tab === tab) {
                renderScreen();
                if (atBottom || force) scrollChat();
            }
        }).catch(function (error) {
            tavern.connectionError = 'Connexion interrompue. Nouvelle tentative automatique…';
            if (error.sessionExpired) showFault(error);
            if (activeView === 'taverne' && tavern.tab === tab) renderScreen();
        }).finally(function () { delete tavern.requests[tab]; });
        return tavern.requests[tab];
    }

    function scrollChat() {
        var log = $('chatLog');
        if (log) log.scrollTop = log.scrollHeight;
    }

    function watchTavern(on) {
        clearInterval(tavern.timer);
        tavern.timer = null;
        if (on) tavern.timer = setInterval(function () {
            if (!document.hidden) loadTavern(false);
        }, 4000);
    }

    function runAction(action, id) {
        if (action === 'daily-place') { openPlace(id); return; }
        if (action === 'prepare-recipe') {
            var prepared = state.recipes.find(function (recipe) { return recipe.id === Number(id); });
            if (!prepared) return;
            picker = { kind: 'recipe', query: prepared.name };
            openScreen('brasser');
            return;
        }
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

        if (action === 'npc-generate') {
            send('/api/npc-orders/players/' + state.player.id + '/generate', undefined, function () { toast('Un marchand te propose un contrat.'); });
            return;
        }
        if (action === 'npc-accept' || action === 'npc-complete') {
            send('/api/npc-orders/' + Number(id) + (action === 'npc-accept' ? '/accept' : '/complete'), undefined,
                function () { toast(action === 'npc-accept' ? 'Contrat accepté. Prépare ta livraison.' : 'Brassin livré. Pièces, expérience et réputation reçues.'); });
            return;
        }

        if (action === 'choose-specialization') {
            send('/api/progression/specialization', { specialization: id }, function () {
                toast('Ton domaine a choisi sa voie.');
            });
            return;
        }

        if (action === 'choose-theme') {
            send('/api/progression/theme', { theme: id }, function () {
                applyProgressionStyle();
                toast('Ambiance du domaine mise à jour.');
            }, 'PUT');
            return;
        }

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
            }, function (payload, stillHere) {
                if (stillHere && activeView === 'commande') {
                    orders.tab = 'miennes';
                    openScreen('commandes');
                }
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
            renderScreen();
            loadTavern(true);
            return;
        }

        if (action === 'chat-send') {
            var field = $('chatInput');
            if (!field || !field.value.trim() || tavern.sending) return;
            var headers = csrfHeaders();
            headers['Content-Type'] = 'application/json';
            var text = field.value;
            tavern.draft = text;
            tavern.sending = true;
            tavern.error = '';
            renderScreen();
            Data.postJson('/api/tavern/chat', { body: text }, headers)
                .then(function (message) {
                    tavern.messages = mergeMessages(tavern.messages, [message]);
                    if (tavern.draft === text) {
                        tavern.draft = '';
                        var input = $('chatInput');
                        if (input) input.value = '';
                    }
                })
                .catch(function (error) {
                    tavern.error = error.message + ' Ton message est conservé.';
                    if (error.sessionExpired) showFault(error);
                }).finally(function () {
                    tavern.sending = false;
                    if (activeView === 'taverne' && tavern.tab === 'salle') { renderScreen(); scrollChat(); }
                });
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
            offerDraft = { batchId: batch.id, recipeName: batch.recipeName, maxServings: Math.min(40, Math.floor(Number(batch.volume) * 2)) };
            if (!offerDraft.maxServings) { toast('Il faut au moins un demi-litre pour ouvrir un fût au comptoir.'); return; }
            openScreen('comptoir');
            return;
        }

        if (action === 'offer-confirm') {
            var servings = Number(($('offerServings') || {}).value || 0);
            var price = Number(($('offerPrice') || {}).value || 0);
            var note = ($('offerNote') || {}).value || '';
            if (!Number.isInteger(servings) || servings < 1 || servings > offerDraft.maxServings || !Number.isInteger(price) || price < 0 || price > 5000) {
                toast('Vérifie le nombre de services et le prix du verre.'); return;
            }
            send('/api/tavern/counter',
                { batchId: offerDraft.batchId, servings: servings, price: price, note: note },
                function (payload, stillHere) {
                    if (stillHere && activeView === 'comptoir') {
                        tavern.tab = 'comptoir';
                        openScreen('taverne');
                    }
                    toast(price === 0 ? 'C’est ta tournée.' : 'Fût au comptoir.');
                });
            return;
        }

        if (action === 'open-view') { openScreen(id); return; }

        if (action === 'harvest-all') {
            var waiting = Data.harvestableCount(state);
            if (!waiting) { toast('Rien n’est mûr pour l’instant.'); return; }
            send('/api/players/' + state.player.id + '/harvest-all', undefined, function (report) {
                if (!report || !(report.fields + report.hives)) { toast('Rien à ramasser.'); return; }
                var parts = [];
                if (report.fields) parts.push(report.fields + (report.fields > 1 ? ' parcelles' : ' parcelle'));
                if (report.hives) parts.push(report.hives + (report.hives > 1 ? ' ruches' : ' ruche'));
                toast('Tournée faite : ' + parts.join(' et ') + '.');
            });
            return;
        }

        if (action === 'show-list') { listMode[id] = true; renderScreen(); return; }
        if (action === 'show-scene') { listMode[id] = false; renderScreen(); return; }

        if (action === 'open-lab') {
            if (!lab) lab = newLab();
            openScreen('atelier');
            return;
        }

        if (action && action.indexOf('lab-') === 0) { runLabAction(action, id); return; }

        if (action === 'open-brew') { openPicker('recipe'); return; }
        if (action === 'sow-field') { openPicker('crop', Number(id)); return; }

        if (action === 'pick-crop') {
            var fieldId = picker ? picker.fieldId : null;
            send('/api/farm/plant', { fieldId: fieldId, cropId: Number(id) },
                function (payload, stillHere) {
                    // Une réponse lente ne doit pas écraser une navigation plus récente.
                    if (stillHere && activeView === 'semer') { selectView('monde'); openPlace('champs'); }
                    toast('Semé. Ça pousse.');
                });
            return;
        }

        if (action === 'pick-recipe') {
            var recipe = state.recipes.find(function (r) { return r.id === Number(id); });
            if (!recipe) return;
            send('/api/brewery/batches', { playerId: state.player.id, recipeId: recipe.id, volume: recipe.baseVolume },
                function (payload, stillHere) {
                    if (stillHere && activeView === 'brasser') { selectView('monde'); openPlace('brasserie'); }
                    toast('Brassin lancé : ' + recipe.name);
                });
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
        send(endpoint(Number(id)), undefined, function () { toast('Récolte rentrée à l’entrepôt.'); });
    }

    /** Le laboratoire : tout passe par le brouillon, jamais par le DOM seul. */
    function runLabAction(action, id) {
        captureLab();

        if (action === 'lab-type') { lab.drinkType = id; renderScreen(); return; }

        if (action === 'lab-add') {
            var item = state.ingredients.find(function (i) { return i.id === Number(id); });
            if (!item || lab.lines.length >= 8) return;
            lab.lines.push({ id: item.id, name: item.name, unit: item.unit, type: item.type, quantity: 1 });
            lab.query = '';
            renderScreen();
            return;
        }

        if (action === 'lab-remove') {
            lab.lines = lab.lines.filter(function (line) { return line.id !== Number(id); });
            renderScreen();
            return;
        }

        if (action === 'lab-more' || action === 'lab-less') {
            var line = labLine(id);
            if (!line) return;
            var step = line.quantity >= 10 ? 1 : 0.5;
            line.quantity = action === 'lab-more'
                ? Math.min(500, line.quantity + step)
                : Math.max(0.5, line.quantity - step);
            line.quantity = Math.round(line.quantity * 10) / 10;
            renderScreen();
            return;
        }

        if (action === 'lab-reset') { lab = newLab(); renderScreen(); return; }

        if (action === 'lab-save') {
            if (!lab.name.trim()) { toast('Il lui faut un nom.'); return; }
            if (!lab.lines.length) { toast('Il lui faut au moins un ingrédient.'); return; }
            var volume = Number(lab.volume);
            var minutes = Number(lab.minutes);
            if (!(volume > 0) || volume > 200) { toast('Le volume tient entre 1 et 200 litres.'); return; }
            if (!(minutes >= 5) || minutes > 10080) { toast('La fermentation tient entre 5 minutes et 7 jours.'); return; }

            send('/api/recipes', {
                name: lab.name.trim(),
                drinkType: lab.drinkType,
                baseVolume: volume,
                fermentationDurationMinutes: Math.round(minutes),
                ingredients: lab.lines.map(function (line) {
                    return { ingredientId: line.id, quantity: line.quantity };
                })
            }, function (recipe) {
                lab = null;
                openScreen('recettes');
                if (!recipe) { toast('Recette inscrite.'); return; }
                toast(recipe.effectKind && recipe.effectKind !== 'AUCUN'
                    ? recipe.name + ' — ' + recipe.effectLabel + ' (' + recipe.effectMagnitude + '%)'
                    : recipe.name + ' — ' + (recipe.flavour || 'rien de spectaculaire, mais ça se boit.'));
            });
        }
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

    /* Chaque ressource mène là où elle se range : on clique sur « Miel » pour
       voir son miel, pas pour admirer un compteur. */
    var RESOURCE_TARGET = { cellar: 'brasserie', coins: 'commandes' };

    function renderResources() {
        dom.resources.innerHTML = Data.RESOURCES.map(function (resource) {
            var view = RESOURCE_TARGET[resource.key] || 'inventaire';
            return '<button class="resource" type="button" role="listitem"' +
                ' data-action="open-view" data-id="' + view + '"' +
                ' title="' + esc(resource.label) + ' — ouvrir">' +
                icon(resource.icon, 'resource__icon') +
                '<span class="resource__text">' +
                '<span class="resource__value">' + esc(fmt.number(resource.read(state))) + '</span>' +
                '<span class="resource__label">' + esc(resource.label) + '</span>' +
                '</span></button>';
        }).join('');
    }

    /** La tournée ne s'affiche que s'il y a vraiment de quoi la faire. */
    function renderReap() {
        var waiting = Data.harvestableCount(state);
        dom.reapCount.textContent = waiting > 99 ? '99+' : String(waiting);
        // Masquée dès qu'un écran est ouvert : elle viserait par-dessus.
        dom.reapBtn.hidden = waiting === 0 || activeView !== 'monde';
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

    function initAtmosphere() {
        var now = new Date();
        var day = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86400000);
        var weathers = [
            { key: 'clair', label: 'Éclaircies' },
            { key: 'pluie', label: 'Pluie du fjord' },
            { key: 'brume', label: 'Brume marine' },
            { key: 'clair', label: 'Vent léger' }
        ];
        var weather = weathers[Math.abs(day * 17) % weathers.length];
        var hour = now.getHours();
        var light = hour < 6 || hour >= 21 ? 'nuit' : (hour < 9 || hour >= 18 ? 'crepuscule' : 'jour');
        dom.game.dataset.weather = weather.key;
        dom.game.dataset.light = light;
        dom.weatherLabel.textContent = weather.label;
        dom.weatherChip.title = 'Météo du domaine · ' + (light === 'jour' ? 'jour' : light);
        dom.game.dataset.paused = document.hidden ? 'true' : 'false';
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
            if (field.status === 'EMPTY' || field.status === 'GROWING') delete readySeen['f' + field.id];
            if ((field.status === 'READY' || (field.readyAt && fmt.isDone(field.readyAt))) && !readySeen['f' + field.id]) {
                readySeen['f' + field.id] = true;
                due.push((field.cropName || 'Une parcelle') + ' est à récolter');
            }
        });
        state.hives.forEach(function (hive) {
            if (hive.status === 'IDLE' || hive.status === 'PRODUCING') delete readySeen['h' + hive.id];
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
            if (!marker) return;

            var placeState = Data.placeState(place.id, state);
            marker.dataset.state = placeState;

            // Le chiffre ne s'affiche que s'il appelle une action : un « 3 »
            // permanent à côté de chaque lieu ne veut plus rien dire.
            var count = placeState === 'idle' ? 0 : Data.placeCount(place.id, state);
            var badge = marker.querySelector('.marker__count');
            if (badge) {
                badge.textContent = count > 9 ? '9+' : String(count);
                badge.hidden = count === 0;
            }
            marker.setAttribute('aria-label', count > 0
                ? 'Ouvrir : ' + place.label + ' — ' + count + ' à voir'
                : 'Ouvrir : ' + place.label);

            var lit = dom.lieux.querySelector('[data-place="' + place.id + '"]');
            if (lit) lit.dataset.state = placeState;

            var chip = dom.places.querySelector('[data-place="' + place.id + '"]');
            if (!chip) return;
            chip.dataset.state = placeState;
            chip.classList.toggle('is-active', !!activePlace && activePlace.id === place.id);
            var chipCount = chip.querySelector('.place-chip__count');
            chipCount.textContent = count > 9 ? '9+' : String(count);
            chipCount.hidden = count === 0;
        });
    }

    function renderPlace() {
        if (!activePlace) return;
        var section = SECTIONS[activePlace.screen];
        updateMarkup(dom.placeBody, activePlace.screen === 'taverne'
            ? empty('Entre dans la salle pour discuter et découvrir le comptoir.')
            : (section ? section.render(state) : ''));
    }

    /**
     * Les actions proposées sous une scène.
     *
     * <p>Ce qui vise un objet précis se fait sur l'objet ; ici ne restent que
     * les gestes qui portent sur le lieu entier.
     */
    function sceneBar(view) {
        var hint = {
            champs: 'Touche une parcelle libre pour semer, une parcelle mûre pour récolter.',
            rucher: 'Touche une ruche endormie pour la lancer, une ruche pleine pour la vider.',
            brasserie: 'Touche un fût prêt pour le goûter, la chope à côté pour l’envoyer au comptoir.'
        }[view] || '';

        var actions = '';
        if (view === 'champs' || view === 'rucher') {
            var waiting = Data.placeCount(view, state);
            if (waiting >= 2) {
                actions += '<button class="btn btn--gold" type="button" data-action="harvest-all">' +
                    icon('i-basket') + 'Tout récolter (' + waiting + ')</button>';
            }
        }
        if (view === 'brasserie') {
            actions += '<button class="btn btn--gold" type="button" data-action="open-brew">' +
                icon('i-plus') + 'Lancer un brassin</button>';
        }
        actions += '<button class="btn" type="button" data-action="show-list" data-id="' + view + '">' +
            'Voir la liste</button>';

        return '<div class="scene__bar">' +
            '<p class="scene__hint">' + esc(hint) + '</p>' + actions + '</div>';
    }

    /**
     * Dessine le lieu, ou le remet à l'heure.
     *
     * <p>Reconstruire la scène à chaque battement de seconde relancerait
     * toutes les animations : tant que la composition du lieu n'a pas changé,
     * on ne retouche que ce qui avance.
     */
    function renderSceneScreen(section) {
        var place = section.scene;
        var fresh = Scenes.signature(place, state);
        var drawn = dom.screenBody.querySelector('.sc-stage, .sc-empty');

        if (drawn && sceneSignature[place] === fresh) {
            Scenes.tick(dom.screenBody, place, state);
            return;
        }

        sceneSignature[place] = fresh;
        // innerHTML direct : updateMarkup réconcilie nœud par nœud, ce qui
        // n'a aucun sens pour un décor entier qu'on redessine.
        dom.screenBody.innerHTML = '<div class="scene scene--' + place + '">' +
            Scenes.markup(place, state) + sceneBar(place) + '</div>';
        dom.screenBody._markup = null;
    }

    function renderScreen() {
        var section = SECTIONS[activeView];
        if (!section) return;
        dom.screenTitle.textContent = section.title;

        var drawable = !!section.scene && !!Scenes && Scenes.has(section.scene);
        dom.screen.classList.toggle('screen--wide', drawable && !listMode[activeView]);

        if (drawable && !listMode[activeView]) {
            renderSceneScreen(section);
            return;
        }

        var html = section.render(state);
        if (drawable) {
            html = '<div class="account-actions" style="margin:0 0 .8em">' +
                '<button class="btn" type="button" data-action="show-scene" data-id="' +
                activeView + '">Revenir au décor</button></div>' + html;
            sceneSignature[section.scene] = null;
        }
        updateMarkup(dom.screenBody, html);
    }

    function render() {
        if (!accountDraft) accountDraft = { avatar: null, displayName: null };
        renderPlayer();
        applyProgressionStyle();
        renderResources();
        renderReap();
        renderEffects();
        renderQuest();
        renderFeed();
        renderMarkers();
        renderPlace();
        if (activeView !== 'monde') renderScreen();
    }

    function applyProgressionStyle() {
        if (!state || !state.progression) return;
        var selected = state.progression.themes.find(function (theme) { return theme.selected; });
        dom.game.dataset.theme = selected ? selected.code.toLowerCase() : 'nordique';
    }

    /* --------------------------------------------------------- Navigation */

    /**
     * La barre des lieux, pour les écrans où la carte ne les montre pas tous.
     *
     * <p>Sur un téléphone, un seul écriteau sur sept tient à l'écran au repos :
     * il fallait faire glisser la carte à l'aveugle pour retrouver ses propres
     * champs. Cette rangée donne les sept lieux d'un coup, avec le même état et
     * le même compte que les écriteaux.
     */
    function buildPlaces() {
        dom.places.innerHTML = Data.PLACES.map(function (place) {
            return '<button class="place-chip" type="button" data-place="' + place.id + '" data-state="idle">' +
                icon(place.icon, 'place-chip__icon') +
                '<span class="place-chip__label">' + esc(place.label) + '</span>' +
                '<span class="place-chip__count" hidden></span>' +
                '</button>';
        }).join('');
    }

    /**
     * Les bâtiments du tableau, découpés et reposés à leur place.
     *
     * <p>Le fond reste la peinture entière : chaque découpe se superpose
     * exactement à l'endroit d'où elle vient, donc il n'y a aucun trou. Elle
     * est invisible au repos et ne sert qu'à éclairer son bâtiment quand on
     * le vise — c'est le bâtiment qu'on touche, pas une étiquette posée
     * dessus.
     *
     * <p>Le rectangle du bouton est le noyau du lieu, sans la marge de
     * fondu : les planches voisines se recouvrent, pas les noyaux, donc
     * chaque bâtiment garde son propre survol. L'image déborde du bouton,
     * le CSS s'en charge.
     */
    function buildPlaceLayers() {
        dom.lieux.innerHTML = Data.PLACES.filter(function (place) { return place.calque; })
            .map(function (place) {
                var c = place.calque;
                // Le serveur a posé l'adresse empreintée sur le conteneur ;
                // le chemin nu ne sert que de secours.
                var art = dom.lieux.dataset['art' + place.id.charAt(0).toUpperCase() + place.id.slice(1)]
                    || '/images/lieux/' + place.id + '.webp';
                return '<button class="lieu" type="button" data-place="' + place.id + '"' +
                    ' data-state="idle" tabindex="-1" aria-hidden="true"' +
                    ' style="left:' + c.x + 'px;top:' + c.y + 'px;width:' + c.w + 'px;height:' + c.h + 'px">' +
                    '<img class="lieu__art" src="' + esc(art) + '"' +
                    ' alt="" draggable="false" decoding="async" fetchpriority="low">' +
                    '</button>';
            }).join('');
    }

    function buildMarkers() {
        dom.markers.innerHTML = Data.PLACES.map(function (place) {
            return '<button class="marker" type="button" data-place="' + place.id + '" data-state="idle"' +
                ' style="left:' + place.x + 'px;top:' + place.y + 'px"' +
                ' aria-label="Ouvrir : ' + esc(place.label) + '">' +
                '<span class="marker__plate">' +
                icon(place.icon, 'marker__icon') +
                '<span class="marker__label"><span class="marker__text">' + esc(place.label) + '</span></span>' +
                '<span class="marker__count" hidden></span>' +
                '</span>' +
                '<span class="marker__pin"></span>' +
                '</button>';
        }).join('');
    }

    /**
     * Allume le lieu visé — sa découpe dans le tableau et son médaillon — et
     * éteint les autres. {@code null} éteint tout.
     */
    function viser(id) {
        dom.lieux.querySelectorAll('.lieu').forEach(function (lieu) {
            lieu.classList.toggle('is-lit', lieu.dataset.place === id);
        });
        dom.markers.querySelectorAll('.marker').forEach(function (marker) {
            marker.classList.toggle('is-lit', marker.dataset.place === id);
        });
    }

    function openPlace(id) {
        var place = Data.PLACES.find(function (p) { return p.id === id; });
        if (!place) return;
        closeScreen();
        activePlace = place;

        dom.markers.querySelectorAll('.marker').forEach(function (marker) {
            marker.classList.toggle('is-active', marker.dataset.place === id);
        });
        dom.lieux.querySelectorAll('.lieu').forEach(function (lieu) {
            lieu.classList.toggle('is-active', lieu.dataset.place === id);
        });
        dom.places.querySelectorAll('.place-chip').forEach(function (chip) {
            chip.classList.toggle('is-active', chip.dataset.place === id);
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
        updateMarkup(dom.placeBody, '');
        dom.place.classList.remove('is-open');
        dom.place.setAttribute('aria-hidden', 'true');
        dom.markers.querySelectorAll('.marker').forEach(function (marker) {
            marker.classList.remove('is-active');
        });
        dom.lieux.querySelectorAll('.lieu').forEach(function (lieu) {
            lieu.classList.remove('is-active');
        });
        dom.places.querySelectorAll('.place-chip').forEach(function (chip) {
            chip.classList.remove('is-active');
        });
    }

    function openScreen(view) {
        if (!SECTIONS[view]) return;
        navigationVersion++;
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
        if (state) renderReap();
    }

    function closeScreen() {
        navigationVersion++;
        watchTavern(false);
        updateMarkup(dom.screenBody, '');
        activeView = 'monde';
        dom.screen.classList.remove('is-open');
        dom.screen.setAttribute('aria-hidden', 'true');
        syncDock();
        if (state) renderReap();
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

        // Toucher le bâtiment lui-même ouvre son lieu.
        dom.lieux.addEventListener('click', function (event) {
            var lieu = event.target.closest('.lieu');
            if (lieu) openPlace(lieu.dataset.place);
        });

        // Le bâtiment et son médaillon ne font qu'un : viser l'un allume
        // l'autre. Sans ça, pointer l'écriteau « Brasserie » n'éclairait pas
        // la brasserie, et pointer la brasserie ne disait pas son nom.
        if (window.matchMedia('(hover: hover)').matches) {
            [dom.lieux, dom.markers].forEach(function (zone) {
                zone.addEventListener('pointerover', function (event) {
                    var cible = event.target.closest('.lieu, .marker');
                    if (cible) viser(cible.dataset.place);
                });
                zone.addEventListener('pointerout', function (event) {
                    var cible = event.target.closest('.lieu, .marker');
                    if (cible && !cible.contains(event.relatedTarget)) viser(null);
                });
            });
        }

        dom.places.addEventListener('click', function (event) {
            var chip = event.target.closest('.place-chip');
            if (chip) { selectView('monde'); openPlace(chip.dataset.place); }
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
            if (event.target.id === 'chatInput' && event.key === 'Enter' && !event.isComposing) {
                event.preventDefault();
                runAction('chat-send');
                return;
            }
            // Un objet de la scène n'est pas un <button> : c'est un groupe SVG
            // rendu focalisable, il faut lui rendre Entrée et Espace.
            if (event.key !== 'Enter' && event.key !== ' ') return;
            var node = event.target.closest && event.target.closest('.sc-node[data-action]');
            if (!node) return;
            event.preventDefault();
            runAction(node.dataset.action, node.dataset.id);
        });

        dom.screenBody.addEventListener('input', function (event) {
            if (event.target.id === 'chatInput') { tavern.draft = event.target.value; return; }
            if (event.target.id !== 'pickerSearch') return;
            if (activeView === 'commande') orders.query = event.target.value;
            else if (activeView === 'recettes') recipeQuery = event.target.value;
            else if (activeView === 'atelier') { captureLab(); lab.query = event.target.value; }
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

        dom.reapBtn.addEventListener('click', function () { runAction('harvest-all'); });

        dom.resources.addEventListener('click', function (event) {
            var button = event.target.closest('[data-action]');
            if (button) runAction(button.dataset.action, button.dataset.id);
        });

        // Le portrait est le raccourci que tout le monde essaie en premier.
        dom.playerCard.addEventListener('click', function () {
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
        if (refreshJob) return refreshJob;
        refreshJob = Data.load().then(function (fresh) {
            state = fresh;
            hideFault();
            render();
            announceReady();
            return state;
        }, function (error) {
            showFault(error);
            throw error;
        }).finally(function () { refreshJob = null; });
        return refreshJob;
    }

    function start() {
        ['game', 'world', 'scene', 'markers', 'worldHint', 'playerName', 'playerAvatar', 'playerLevel',
            'xpBar', 'xpLabel', 'resources', 'quest', 'questRow', 'questText', 'questBar', 'questCount',
            'questBox', 'feedList', 'dock', 'place', 'placeKicker', 'placeTitle', 'placeIntro', 'placeBody',
            'placeAction', 'placeClose', 'screen', 'screenTitle', 'screenBody', 'screenClose', 'toast',
            'playerCard', 'settingsBtn', 'reapBtn', 'reapCount', 'places', 'lieux', 'fault', 'faultTitle', 'faultText', 'faultRetry', 'faultLogin', 'effects',
            'weatherChip', 'weatherLabel'].forEach(function (id) { dom[id] = $(id); });

        loadSettings();
        buildPlaceLayers();
        buildPlaces();
        initAtmosphere();
        camera = global.BrewsteadWorld.create({ world: dom.world, scene: dom.scene });
        buildMarkers();
        bind();
        camera.reset();

        refresh().catch(function () { /* panneau de panne déjà affiché */ }).then(function () {
            setInterval(function () {
                if (!state || document.hidden) return;
                renderMarkers();
                renderPlace();
                // On ne réécrit que les écrans à minuterie : ailleurs cela
                // effacerait ce que le joueur est en train de saisir.
                if (activeView !== 'monde' && SECTIONS[activeView] && SECTIONS[activeView].live) {
                    renderScreen();
                }
            }, 1000);
            setInterval(function () {
                if (!document.hidden) initAtmosphere();
                if (!document.hidden && !mutationPending) refresh().catch(function () {});
            }, 15000);
            document.addEventListener('visibilitychange', function () {
                dom.game.dataset.paused = document.hidden ? 'true' : 'false';
                if (!document.hidden && !mutationPending) {
                    refresh().catch(function () {});
                    if (activeView === 'taverne') loadTavern(false);
                }
            });
        });

        setTimeout(hideHint, 6000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})(window);
