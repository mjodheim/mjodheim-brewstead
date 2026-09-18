/* ==========================================================================
   Brewstead — caméra du monde
   Déplacement à la souris ou au doigt, zoom molette et pincement,
   recentrage animé sur un lieu.
   ========================================================================== */

(function (global) {
    'use strict';

    var SCENE_WIDTH = 1536;
    var SCENE_HEIGHT = 742;
    var MAX_ZOOM_FACTOR = 2.4;
    var TAP_TOLERANCE = 6;
    var FRICTION = 0.92;

    function clamp(value, min, max) {
        return value < min ? min : (value > max ? max : value);
    }

    function World(options) {
        this.world = options.world;
        this.scene = options.scene;
        this.onMove = options.onMove || function () {};

        this.scale = 1;
        this.x = 0;
        this.y = 0;
        this.fit = 1;

        this.pointers = new Map();
        this.dragged = 0;
        this.velocityX = 0;
        this.velocityY = 0;
        this.lastMoveTime = 0;
        this.momentumId = null;
        this.pinchDistance = 0;
        this.captured = false;

        this.bind();
        this.measure();
    }

    World.prototype.measure = function () {
        var box = this.world.getBoundingClientRect();
        this.viewWidth = box.width;
        this.viewHeight = box.height;
        // Cadrage de repos : tout le domaine visible tant que les marges
        // restent raisonnables, sinon on remplit davantage la fenêtre.
        var contain = Math.min(box.width / SCENE_WIDTH, box.height / SCENE_HEIGHT);
        var cover = Math.max(box.width / SCENE_WIDTH, box.height / SCENE_HEIGHT);
        this.fit = Math.max(contain, cover * 0.85);
        this.scale = Math.max(this.scale, this.fit);
        this.apply(false);
    };

    World.prototype.limits = function (scale) {
        var width = SCENE_WIDTH * scale;
        var height = SCENE_HEIGHT * scale;
        // Plus petite que la fenêtre : la scène reste centrée au lieu de flotter.
        var restX = width < this.viewWidth ? (this.viewWidth - width) / 2 : null;
        var restY = height < this.viewHeight ? (this.viewHeight - height) / 2 : null;
        return {
            minX: restX !== null ? restX : this.viewWidth - width,
            maxX: restX !== null ? restX : 0,
            minY: restY !== null ? restY : this.viewHeight - height,
            maxY: restY !== null ? restY : 0
        };
    };

    World.prototype.apply = function (animated) {
        var bounds = this.limits(this.scale);
        this.x = clamp(this.x, bounds.minX, bounds.maxX);
        this.y = clamp(this.y, bounds.minY, bounds.maxY);
        this.scene.classList.toggle('is-animated', !!animated);
        this.scene.style.transform = 'translate3d(' + this.x + 'px,' + this.y + 'px,0) scale(' + this.scale + ')';
        this.onMove(this);
    };

    World.prototype.zoomAt = function (scale, pointX, pointY, animated) {
        var next = clamp(scale, this.fit, Math.max(this.fit * MAX_ZOOM_FACTOR, 1.8));
        if (next === this.scale) return;
        var sceneX = (pointX - this.x) / this.scale;
        var sceneY = (pointY - this.y) / this.scale;
        this.scale = next;
        this.x = pointX - sceneX * next;
        this.y = pointY - sceneY * next;
        this.apply(animated);
    };

    /** Amène le point (x, y) de la scène au centre de la zone utile. */
    World.prototype.focus = function (x, y, opts) {
        opts = opts || {};
        this.stopMomentum();
        if (opts.scale) this.scale = clamp(opts.scale, this.fit, this.fit * MAX_ZOOM_FACTOR);
        this.x = this.viewWidth / 2 + (opts.offsetX || 0) - x * this.scale;
        this.y = this.viewHeight / 2 + (opts.offsetY || 0) - y * this.scale;
        this.apply(true);
    };

    World.prototype.reset = function () {
        this.stopMomentum();
        this.scale = this.fit;
        this.x = (this.viewWidth - SCENE_WIDTH * this.scale) / 2;
        this.y = (this.viewHeight - SCENE_HEIGHT * this.scale) / 2;
        this.apply(true);
    };

    World.prototype.stopMomentum = function () {
        if (this.momentumId) cancelAnimationFrame(this.momentumId);
        this.momentumId = null;
        this.velocityX = 0;
        this.velocityY = 0;
    };

    World.prototype.runMomentum = function () {
        var self = this;
        function step() {
            self.velocityX *= FRICTION;
            self.velocityY *= FRICTION;
            if (Math.abs(self.velocityX) < 0.15 && Math.abs(self.velocityY) < 0.15) {
                self.momentumId = null;
                return;
            }
            self.x += self.velocityX;
            self.y += self.velocityY;
            self.apply(false);
            self.momentumId = requestAnimationFrame(step);
        }
        this.momentumId = requestAnimationFrame(step);
    };

    World.prototype.pinchSpread = function () {
        var points = Array.from(this.pointers.values());
        var dx = points[0].x - points[1].x;
        var dy = points[0].y - points[1].y;
        return {
            distance: Math.hypot(dx, dy),
            centerX: (points[0].x + points[1].x) / 2,
            centerY: (points[0].y + points[1].y) / 2
        };
    };

    World.prototype.bind = function () {
        var self = this;
        var world = this.world;

        world.addEventListener('pointerdown', function (event) {
            if (event.button !== undefined && event.button > 0) return;
            self.stopMomentum();
            self.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            self.dragged = 0;
            self.lastMoveTime = event.timeStamp;
            if (self.pointers.size === 2) self.pinchDistance = self.pinchSpread().distance;
        });

        world.addEventListener('pointermove', function (event) {
            var previous = self.pointers.get(event.pointerId);
            if (!previous) return;
            var dx = event.clientX - previous.x;
            var dy = event.clientY - previous.y;
            self.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

            if (self.pointers.size === 2) {
                var spread = self.pinchSpread();
                if (self.pinchDistance > 0) {
                    var box = world.getBoundingClientRect();
                    self.zoomAt(self.scale * (spread.distance / self.pinchDistance),
                        spread.centerX - box.left, spread.centerY - box.top, false);
                }
                self.pinchDistance = spread.distance;
                self.dragged += Math.abs(dx) + Math.abs(dy);
                return;
            }

            self.dragged += Math.abs(dx) + Math.abs(dy);
            if (self.dragged > TAP_TOLERANCE && !self.captured) {
                // La capture n'est prise qu'une fois le glissement engagé : sinon
                // le clic serait redirigé vers le monde au lieu de l'écriteau visé.
                world.setPointerCapture(event.pointerId);
                self.captured = true;
                world.classList.add('is-dragging');
            }

            var elapsed = Math.max(1, event.timeStamp - self.lastMoveTime);
            self.velocityX = dx / elapsed * 16;
            self.velocityY = dy / elapsed * 16;
            self.lastMoveTime = event.timeStamp;

            self.x += dx;
            self.y += dy;
            self.apply(false);
        });

        function release(event) {
            if (!self.pointers.has(event.pointerId)) return;
            self.pointers.delete(event.pointerId);
            if (self.pointers.size < 2) self.pinchDistance = 0;
            if (self.captured && world.hasPointerCapture(event.pointerId)) {
                world.releasePointerCapture(event.pointerId);
            }
            if (self.pointers.size === 0) {
                self.captured = false;
                world.classList.remove('is-dragging');
                var sobre = document.documentElement.dataset.mouvement === 'sobre';
                if (self.dragged > TAP_TOLERANCE && !sobre) self.runMomentum();
            }
        }

        world.addEventListener('pointerup', release);
        world.addEventListener('pointercancel', release);

        // un glissement ne doit pas déclencher le clic d'un écriteau
        world.addEventListener('click', function (event) {
            if (self.dragged > TAP_TOLERANCE) {
                event.preventDefault();
                event.stopPropagation();
                self.dragged = 0;
            }
        }, true);

        world.addEventListener('wheel', function (event) {
            event.preventDefault();
            var box = world.getBoundingClientRect();
            var factor = Math.exp(-event.deltaY * 0.0012);
            self.zoomAt(self.scale * factor, event.clientX - box.left, event.clientY - box.top, false);
        }, { passive: false });

        world.addEventListener('dblclick', function (event) {
            var box = world.getBoundingClientRect();
            var target = self.scale > self.fit * 1.25 ? self.fit : self.fit * 1.8;
            self.zoomAt(target, event.clientX - box.left, event.clientY - box.top, true);
        });

        window.addEventListener('resize', function () { self.measure(); });
        if (global.ResizeObserver) new ResizeObserver(function () { self.measure(); }).observe(world);
    };

    global.BrewsteadWorld = {
        SCENE_WIDTH: SCENE_WIDTH,
        SCENE_HEIGHT: SCENE_HEIGHT,
        create: function (options) { return new World(options); }
    };
})(window);
