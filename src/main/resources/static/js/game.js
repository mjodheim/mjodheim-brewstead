(() => {
    "use strict";

    const shell = document.querySelector(".game-shell");
    const rooms = [...document.querySelectorAll(".room")];
    const dockItems = [...document.querySelectorAll("[data-target-room]")];
    const roomLinks = [...document.querySelectorAll("[data-go-room]")];
    const toast = document.getElementById("gameToast");
    const musicToggle = document.getElementById("musicToggle");
    const fullscreenToggle = document.getElementById("fullscreenToggle");
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (!shell || rooms.length === 0) return;

    let currentRoom = shell.dataset.currentRoom || "hearth";
    let transitionLocked = false;
    let toastTimeout;

    const roomMap = new Map(rooms.map(room => [room.dataset.room, room]));

    function roomIndex(name) {
        const room = roomMap.get(name);
        return room ? Number(room.dataset.index || 0) : 0;
    }

    function setDockState(name) {
        dockItems.forEach(item => {
            const active = item.dataset.targetRoom === name;
            item.classList.toggle("is-active", active);
            item.setAttribute("aria-current", active ? "page" : "false");
        });
    }

    function switchRoom(name, { instant = false } = {}) {
        if (!roomMap.has(name) || name === currentRoom || transitionLocked) return;

        const current = roomMap.get(currentRoom);
        const next = roomMap.get(name);
        const movingForward = roomIndex(name) > roomIndex(currentRoom);
        const duration = instant || prefersReducedMotion.matches ? 0 : 660;

        transitionLocked = true;
        shell.classList.toggle("is-transitioning", duration > 0);
        current?.classList.add(movingForward ? "is-exiting-left" : "is-exiting-right");

        window.setTimeout(() => {
            rooms.forEach(room => {
                room.classList.remove("is-active", "is-exiting-left", "is-exiting-right");
                room.setAttribute("aria-hidden", "true");
            });

            next.classList.add("is-active");
            next.setAttribute("aria-hidden", "false");
            currentRoom = name;
            shell.dataset.currentRoom = name;
            setDockState(name);
            updateTitle(name);

            if (history.replaceState) {
                history.replaceState(null, "", name === "hearth" ? location.pathname : `#${name}`);
            }

            window.setTimeout(() => {
                shell.classList.remove("is-transitioning");
                transitionLocked = false;
            }, Math.max(100, duration * 0.55));
        }, duration > 0 ? duration * 0.48 : 0);
    }

    function updateTitle(name) {
        const names = {
            hearth: "Domaine",
            fields: "Champs",
            apiary: "Rucher",
            lab: "Laboratoire",
            brewery: "Brasserie",
            inventory: "Réserves",
            orders: "Commandes",
            tavern: "Taverne"
        };
        document.title = `Mjödheim · ${names[name] || "Brewstead"}`;
    }

    dockItems.forEach(item => item.addEventListener("click", () => switchRoom(item.dataset.targetRoom)));
    roomLinks.forEach(item => item.addEventListener("click", () => switchRoom(item.dataset.goRoom)));

    document.addEventListener("keydown", event => {
        if (event.target.matches("input, textarea, select")) return;

        const ordered = [...roomMap.keys()].sort((a, b) => roomIndex(a) - roomIndex(b));
        const currentIndex = ordered.indexOf(currentRoom);

        if (event.key === "ArrowRight" && currentIndex < ordered.length - 1) {
            switchRoom(ordered[currentIndex + 1]);
        } else if (event.key === "ArrowLeft" && currentIndex > 0) {
            switchRoom(ordered[currentIndex - 1]);
        } else if (event.key === "Escape") {
            switchRoom("hearth");
        }
    });

    function showToast(message) {
        if (!toast) return;
        window.clearTimeout(toastTimeout);
        toast.textContent = message;
        toast.classList.add("is-visible");
        toastTimeout = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
    }

    document.querySelectorAll("[data-demo-action]").forEach(button => {
        button.addEventListener("click", () => showToast(button.dataset.demoAction));
    });

    function startTimers() {
        document.querySelectorAll("[data-timer]").forEach(element => {
            let seconds = Number(element.dataset.timer);
            if (!Number.isFinite(seconds)) return;

            const render = () => {
                const minutes = Math.max(0, Math.floor(seconds / 60));
                const remainder = Math.max(0, seconds % 60);
                element.textContent = `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
                if (seconds <= 0) {
                    element.textContent = "Prêt";
                    element.closest(".plot-card")?.classList.add("is-ready");
                    return;
                }
                seconds -= 1;
                window.setTimeout(render, 1000);
            };
            render();
        });
    }

    function setupParallax() {
        if (prefersReducedMotion.matches || window.matchMedia("(pointer: coarse)").matches) return;

        let pointerX = 0;
        let pointerY = 0;
        let targetX = 0;
        let targetY = 0;
        let raf;

        const animate = () => {
            pointerX += (targetX - pointerX) * 0.055;
            pointerY += (targetY - pointerY) * 0.055;

            const activeRoom = roomMap.get(currentRoom);
            const scene = activeRoom?.querySelector(".scene");
            const panel = activeRoom?.querySelector(".room__panel, .room__content--hero");

            if (scene) scene.style.transform = `scale(1.018) translate3d(${pointerX * -8}px, ${pointerY * -5}px, 0)`;
            if (panel) panel.style.setProperty("--parallax-x", `${pointerX * 4}px`);

            raf = requestAnimationFrame(animate);
        };

        window.addEventListener("pointermove", event => {
            targetX = (event.clientX / window.innerWidth - 0.5) * 2;
            targetY = (event.clientY / window.innerHeight - 0.5) * 2;
        }, { passive: true });

        window.addEventListener("blur", () => {
            targetX = 0;
            targetY = 0;
        });

        raf = requestAnimationFrame(animate);
        window.addEventListener("beforeunload", () => cancelAnimationFrame(raf), { once: true });
    }

    async function toggleFullscreen() {
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen?.();
            } else {
                await document.exitFullscreen?.();
            }
        } catch {
            showToast("Le plein écran n'est pas disponible dans ce navigateur.");
        }
    }

    fullscreenToggle?.addEventListener("click", toggleFullscreen);

    class BrewsteadAmbience {
        constructor() {
            this.context = null;
            this.master = null;
            this.started = false;
            this.muted = true;
            this.pluckTimer = null;
        }

        async ensureStarted() {
            if (!this.context) this.buildGraph();
            if (this.context.state === "suspended") await this.context.resume();
            if (!this.started) {
                this.started = true;
                this.schedulePlucks();
            }
        }

        buildGraph() {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) throw new Error("Web Audio unavailable");

            this.context = new AudioContext();
            this.master = this.context.createGain();
            this.master.gain.value = 0.0001;
            this.master.connect(this.context.destination);

            const lowpass = this.context.createBiquadFilter();
            lowpass.type = "lowpass";
            lowpass.frequency.value = 720;
            lowpass.Q.value = 0.7;
            lowpass.connect(this.master);

            const droneGain = this.context.createGain();
            droneGain.gain.value = 0.14;
            droneGain.connect(lowpass);

            [73.42, 110.0, 146.83].forEach((frequency, index) => {
                const oscillator = this.context.createOscillator();
                const gain = this.context.createGain();
                oscillator.type = index === 0 ? "sine" : "triangle";
                oscillator.frequency.value = frequency;
                oscillator.detune.value = index === 1 ? -5 : index === 2 ? 4 : 0;
                gain.gain.value = index === 0 ? 0.7 : 0.22;
                oscillator.connect(gain);
                gain.connect(droneGain);
                oscillator.start();
            });

            const noiseBuffer = this.context.createBuffer(1, this.context.sampleRate * 3, this.context.sampleRate);
            const data = noiseBuffer.getChannelData(0);
            for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * 0.22;

            const wind = this.context.createBufferSource();
            const windFilter = this.context.createBiquadFilter();
            const windGain = this.context.createGain();
            wind.buffer = noiseBuffer;
            wind.loop = true;
            windFilter.type = "bandpass";
            windFilter.frequency.value = 410;
            windFilter.Q.value = 0.45;
            windGain.gain.value = 0.05;
            wind.connect(windFilter);
            windFilter.connect(windGain);
            windGain.connect(this.master);
            wind.start();
        }

        schedulePlucks() {
            const play = () => {
                if (!this.context || this.muted) return;
                const notes = [220, 246.94, 293.66, 329.63, 369.99];
                const frequency = notes[Math.floor(Math.random() * notes.length)] / 2;
                const now = this.context.currentTime;
                const oscillator = this.context.createOscillator();
                const gain = this.context.createGain();
                const filter = this.context.createBiquadFilter();

                oscillator.type = "triangle";
                oscillator.frequency.setValueAtTime(frequency, now);
                filter.type = "lowpass";
                filter.frequency.value = 980;
                gain.gain.setValueAtTime(0.0001, now);
                gain.gain.exponentialRampToValueAtTime(0.09, now + 0.025);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);

                oscillator.connect(filter);
                filter.connect(gain);
                gain.connect(this.master);
                oscillator.start(now);
                oscillator.stop(now + 3);
            };

            const schedule = () => {
                const delay = 5800 + Math.random() * 6400;
                this.pluckTimer = window.setTimeout(() => {
                    play();
                    schedule();
                }, delay);
            };
            schedule();
        }

        async setMuted(muted) {
            await this.ensureStarted();
            this.muted = muted;
            const now = this.context.currentTime;
            this.master.gain.cancelScheduledValues(now);
            this.master.gain.setValueAtTime(Math.max(this.master.gain.value, 0.0001), now);
            this.master.gain.exponentialRampToValueAtTime(muted ? 0.0001 : 0.13, now + 0.55);
        }
    }

    const ambience = new BrewsteadAmbience();

    musicToggle?.addEventListener("click", async () => {
        const nextMuted = musicToggle.getAttribute("aria-pressed") === "true";
        try {
            await ambience.setMuted(nextMuted);
            musicToggle.setAttribute("aria-pressed", String(!nextMuted));
            showToast(nextMuted ? "Ambiance coupée" : "Ambiance nordique activée");
        } catch {
            showToast("L'audio n'est pas disponible dans ce navigateur.");
        }
    });

    function init() {
        rooms.forEach(room => room.setAttribute("aria-hidden", room.dataset.room === currentRoom ? "false" : "true"));
        setDockState(currentRoom);
        startTimers();
        setupParallax();

        const requestedRoom = location.hash.replace("#", "");
        if (requestedRoom && roomMap.has(requestedRoom) && requestedRoom !== currentRoom) {
            switchRoom(requestedRoom, { instant: true });
        }
    }

    init();
})();
