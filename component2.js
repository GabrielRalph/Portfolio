import { ShadowElement } from "./SvgPlus/shadow-element.js";
import { SvgPlus } from "./SvgPlus/4.js";
import jsyaml from 'https://esm.sh/js-yaml@4';

// ── CarouselDots ──────────────────────────────────────────────────────────────
// Renders a row of pill-shaped dot buttons, one per slide.

class CarouselDots extends SvgPlus {
    /** @param {string} [el="div"] */
    constructor() {
        super("div");
        this.class = "dots";
        this.setAttribute("role", "tablist");
        this.setAttribute("aria-label", "Slide navigation");
        /** @type {Element[]} */
        this._dots = [];
    }

    /**
     * Rebuild dots for `count` pages.
     * @param {number} count
     * @param {function(number): void} onDotClick
     */
    build(count, onDotClick) {
        this.innerHTML = "";
        this._dots = [];
        for (let i = 0; i < count; i++) {
            const dot = this.createChild("button", {
                class: `dot${i === 0 ? " active" : ""}`,
                role: "tab",
                "aria-selected": i === 0 ? "true" : "false",
                "aria-label": `Slide ${i + 1}`,
            });
            dot.addEventListener("click", () => onDotClick(i));
            this._dots.push(dot);
        }
    }

    /** Update the active dot to match `idx`. */
    sync(idx) {
        this._dots.forEach((d, i) => {
            d.classList.toggle("active", i === idx);
            d.setAttribute("aria-selected", i === idx ? "true" : "false");
        });
    }
}

// __ CarouselSlide ─────────────────────────────────────────────────────────────
// Renders an individual slide tile within the track. (Currently just an image but could be extended with more complex content if desired.)

class CarouselSlide extends SvgPlus {
    constructor(page, i, n) {
        super("div");
        this.props =  {
            class: `slide${i === 0 ? " active" : ""}`,
            role: "group",
            "aria-label": `Slide ${i + 1} of ${n}`,
            "aria-hidden": i !== 0 ? "true" : "false",
            "data-i": String(i),
        }

        // White image box
       const imgBox = this.createChild("div", { class: "img-box" });
       const image  = imgBox.createChild("img", {
           src: page.image ?? "",
           alt: page.title ?? "",
           draggable: "false",
       });

       if (page.webpage) {
           const link = imgBox.createChild("iframe", {
               src: page.webpage,
               title: page.title ?? "",
               loading: "lazy",
               events: {
                    load: () => {
                        image.remove();
                    }
               }
           });
        }
    }
}



// ── CarouselVisualContent ─────────────────────────────────────────────────────
// Renders the slides viewport, draggable track, and all slide tiles.

class CarouselVisualContent extends SvgPlus {
    /** @param {string} [el="div"] */
    constructor() {
        super("div");
        this.class = "slides-area";

        // Viewport — handles cursor / touch-action styles
        this._vp = this.createChild("div", {
            class: "slides-vp",
            role: "region",
            "aria-label": "Design carousel",
        });

        // Track — the horizontally-scrolling strip of slide tiles
        this._track = this._vp.createChild("div", { class: "track" });

        /** @type {Element[]} */
        this._slides = [];
    }

    /**
     * Populate slides from `pages` data.
     * @param {object[]} pages
     * @param {function(number): void} onSlideClick  called when a slide tile is clicked
     */
    build(pages, onSlideClick) {
        this._track.innerHTML = "";
        
        const n = pages.length;
        this._slides = pages.map((pg, i) => 
            this._track.createChild(CarouselSlide, {events: {
                click: () => onSlideClick(i)
            }}, pg, i, n)
        );

        this._track.style.transform = "translateX(0)";
    }

    /** Toggle `.active` class and aria-hidden on each slide tile. */
    syncSlides(idx) {
        this._slides.forEach((s, i) => {
            s.classList.toggle("active", i === idx);
            s.setAttribute("aria-hidden", i !== idx ? "true" : "false");
        });
    }

    /** Pixel width of the first slide (includes gap/padding). */
    get slideWidth() {
        return this._slides[0]?.offsetWidth ?? 0;
    }

    /** Target translateX for the given slide index. */
    trackX(idx) {
        return -(idx * this.slideWidth);
    }

    /**
     * Move the track to `x` pixels.
     * @param {number}  x
     * @param {boolean} [animated=true]
     */
    setTrackX(x, animated = true) {
        this._track.styles = {
            transition: animated
                ? "transform 300ms cubic-bezier(0.34, 0.2, 0.53, 0.96)"
                : "none",
            transform: `translateX(${x}px)`,
        }
    }

    /**
     * Attach touch + mouse drag handlers.
     * @param {function(number): void} goTo     navigate to absolute slide index
     * @param {function(): number}     getIdx   current slide index getter
     * @param {function(): number}     count    total slide count getter
     * @param {function(): boolean}    canDrag  return false to block drag start (e.g. while busy)
     */
    bindDrag(goTo, getIdx, count, canDrag = () => true) {
        const THRESHOLD = 50;
        const RESIST    = 0.25;

        let active = false, startX = 0, startY = 0, lastX = 0, lastY = 0;
        let axis = null;
        let wasDragged = false;

        const onStart = (x, y) => {
            if (!canDrag()) return;   // ignore drags during slide animation
            active     = true;
            axis       = null;
            wasDragged = false;
            startX = lastX = x;
            startY = lastY = y;
            this.setTrackX(this.trackX(getIdx()), false);
        };

        const applyDrag = (x) => {
            lastX = x;
            const dx  = x - startX;
            const idx = getIdx();
            const n   = count();
            if (Math.abs(dx) > 8) wasDragged = true;
            const offset =
                (idx === 0 && dx > 0) || (idx === n - 1 && dx < 0)
                    ? dx * RESIST
                    : dx;
            this._track.style.transform = `translateX(${this.trackX(idx) + offset}px)`;
        };

        const onEnd = () => {
            if (!active) return;
            active = false;
            const dx  = lastX - startX;
            const dy  = lastY - startY;
            const idx = getIdx();
            const n   = count();
            // On fast swipes, touchend fires before axis is locked; resolve it from the total delta
            const resolvedAxis = axis ?? (Math.abs(dx) >= Math.abs(dy) ? "h" : "v");
            if (resolvedAxis === "h" && Math.abs(dx) > THRESHOLD) {
                if (dx < 0 && idx < n - 1) goTo(idx + 1);
                else if (dx > 0 && idx > 0) goTo(idx - 1);
                // If goTo was blocked (busy or at edge), snap back ourselves
                if (getIdx() === idx) this.setTrackX(this.trackX(idx));
                return;
            }
            this.setTrackX(this.trackX(idx));
        };

        const onCancel = () => {
            if (!active) return;
            active = false;
            this.setTrackX(this.trackX(getIdx()), false);
        };


       

        // Touch (axis-lock so vertical scroll is preserved)
        this._vp.addEventListener("touchstart", e => {
            onStart(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });

        this._vp.addEventListener("touchmove", e => {
            if (!active) return;
            const touch = e.touches[0];
            // Always track position so onEnd has the final delta even on fast swipes
            lastX = touch.clientX;
            lastY = touch.clientY;
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            if (!axis) {
                if (Math.hypot(dx, dy) < 6) return;
                axis = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
                if (axis === "v") { onCancel(); return; }
            }
            e.preventDefault();
            applyDrag(touch.clientX);
        }, { passive: false });

        this._vp.addEventListener("touchend",    () => onEnd(),    { passive: true });
        this._vp.addEventListener("touchcancel", () => onCancel(), { passive: true });

        // Mouse drag
        this._vp.addEventListener("mousedown", e => {
            if (e.button !== 0) return;
            e.preventDefault();
            onStart(e.clientX, e.clientY);
            axis = "h";
            const onMove = e => { if (active) applyDrag(e.clientX); };
            const onUp   = () => {
                onEnd();
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup",   onUp);
            };
            window.addEventListener("mousemove", onMove, { passive: true });
            window.addEventListener("mouseup",   onUp,   { passive: true });
        });

        // Expose wasDragged so slide-click handler can ignore drag releases
        this._wasDragged = () => wasDragged;
    }
}

// ── DesignCarousel ────────────────────────────────────────────────────────────
// Root custom element — orchestrates data loading, navigation, and sub-blocks.

class DesignCarousel extends ShadowElement {
    #pages = [];
    #title = "";
    #date  = "";
    #idx   = 0;
    #captionTimer = null;
    #kh    = null;

    /** @param {Element} el  the custom element node provided by the browser */
    constructor(el) {
        super(el, new SvgPlus("div"));

        // ── Card shell ────────────────────────────────────────────────────────
        this.root.class = "card";
        this.root.setAttribute("part", "card");

        // ── Title row  (h1 > span + i) ────────────────────────────────────────
        this._titleEl   = this.createChild("h1", { class: "carousel-title" });
        this._titleSpan = this._titleEl.createChild("span");
        this._titleDate = this._titleEl.createChild("i");

        // ── Carousel wrapper ──────────────────────────────────────────────────
        this._carouselWrap = this.createChild("div", { class: "carousel" });

        // Slides viewport + track block
        this._visual = this._carouselWrap.createChild(CarouselVisualContent, {}, "div");

        // Dot navigation block
        this._dots = this._carouselWrap.createChild(CarouselDots, {}, "div");

        // ── Caption (slide title + description) ───────────────────────────────
        this._caption    = this.createChild("div", {
            class: "caption visible",
            "aria-live": "polite",
            "aria-atomic": "true",
        });
        this._slideTitle = this._caption.createChild("h3", { class: "slide-title" });
        this._slideDesc  = this._caption.createChild("p",  { class: "slide-desc"  });
    }

    // ── Custom-element lifecycle ──────────────────────────────────────────────

    static get observedAttributes() { return ["data-src"]; }

    set ["data-src"](val) { 
        if (val) {
            this.#load(val);
        }
    }


    connectedCallback() {
        this.tabIndex = 0;
        this.#kh = (e) => {
            if (document.activeElement !== this) return;
            if (e.key === "ArrowLeft")  { e.preventDefault(); this.#go(this.#idx - 1); }
            if (e.key === "ArrowRight") { e.preventDefault(); this.#go(this.#idx + 1); }
        };
        document.addEventListener("keydown", this.#kh);
        const src = this.getAttribute("data-src");
        src ? this.#load(src) : this.#render();
    }

    disconnectedCallback() {
        document.removeEventListener("keydown", this.#kh);
        this.#kh = null;
    }

    // ── Data loading ──────────────────────────────────────────────────────────

    async #load(url) {
        try {
            const r = await fetch(url);
            if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
            this.loadData(await r.text());
            console.log(`[DesignCarousel] Loaded data from ${url}`);    
        } catch (e) {
            console.error("[DesignCarousel]", e);
        }
    }

    /**
     * Supply carousel data.
     * @param {string|object} input  YAML string, JSON string, or parsed object with a `pages` array.
     */
    loadData(input) {
        if (typeof input === "string") {
            const s = input.trim();
            try {
                input = (s[0] === "{" || s[0] === "[") ? JSON.parse(s) : jsyaml.load(s);
            } catch (e) {
                console.error("[DesignCarousel] Parse error:", e);
                return;
            }
        }
        if (input && typeof input === "object") {
            this.#pages = Array.isArray(input.pages) ? input.pages : [];
            this.#title = String(input.title ?? "");
            this.#date  = String(input.date  ?? "");
            this.#idx   = 0;
            this.#render();
        }
    }

    // ── Navigation ────────────────────────────────────────────────────────────

    #go(i) {
        const n = this.#pages.length;
        if (i < 0 || i >= n || i === this.#idx) return;

        // Cancel any in-flight caption fade so rapid swipes don't flash
        clearTimeout(this.#captionTimer);

        this._caption.classList.remove("visible");
        this.#idx = i;

        this._visual.setTrackX(this._visual.trackX(i));
        this._dots.sync(i);
        this.#syncText();
        this._visual.syncSlides(i);

        // Fade caption back in after the slide transition completes
        this.#captionTimer = setTimeout(() => {
            this._caption.classList.add("visible");
        }, 300);
    }

    #syncText() {
        const p = this.#pages[this.#idx] ?? {};
        this._slideTitle.textContent = p.title       ?? "";
        this._slideDesc.textContent  = p.description ?? "";
    }

    // Measure every page's caption and lock the container to the tallest one.
    // Called via rAF so CSS is guaranteed applied before reading offsetHeight.
    #lockCaptionHeight() {
        // Hide during measurement to prevent text flash
        this._caption.style.visibility = "hidden";
        this._caption.style.minHeight  = "";

        let maxH = 0;
        for (const p of this.#pages) {
            this._slideTitle.textContent = p.title       ?? "";
            this._slideDesc.textContent  = p.description ?? "";
            maxH = Math.max(maxH, this._caption.offsetHeight);
        }

        // Restore current slide text and unlock visibility
        this.#syncText();
        this._caption.style.minHeight  = `${maxH}px`;
        this._caption.style.visibility = "";
    }

    // ── Render ────────────────────────────────────────────────────────────────

    #render() {
        const p = this.#pages[0] ?? {};

        // Title row
        this._titleSpan.textContent = this.#title;
        this._titleDate.textContent = this.#date;

        // Slides
        this._visual.build(this.#pages, (i) => {
            if (this._visual._wasDragged?.()) return;
            this.#go(i);
        });

        // Dots (only when there is more than one page)
        const n = this.#pages.length;
        this._dots.style.display = n > 1 ? "" : "none";
        if (n > 1) this._dots.build(n, (i) => this.#go(i));

        // Initial caption text
        this._slideTitle.textContent = p.title       ?? "";
        this._slideDesc.textContent  = p.description ?? "";
        this._caption.classList.add("visible");

        // Lock caption height to the tallest page after styles are applied
        requestAnimationFrame(() => this.#lockCaptionHeight());

        // Drag support
        this._visual.bindDrag(
            (i)  => this.#go(i),
            ()   => this.#idx,
            ()   => this.#pages.length,
        );
    }

    // ── Style sheets (loaded via ShadowElement) ───────────────────────────────

    static get usedStyleSheets() {
        return [new URL("./carousel.css", import.meta.url).href];
    }
}

SvgPlus.defineHTMLElement(DesignCarousel);

