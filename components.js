import jsyaml from 'https://esm.sh/js-yaml@4';

// Load styles from the companion CSS file relative to this module
const cssText = await fetch(new URL('./carousel.css', import.meta.url)).then(r => r.text());

class DesignCarousel extends HTMLElement {
  #pages = [];
  #title = '';
  #date = '';
  #idx   = 0;
  #busy  = false;
  #kh    = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  static get observedAttributes() {
    return ['data-src'];
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'data-src' && newVal && newVal !== oldVal && this.isConnected) {
      this.#load(newVal);
    }
  }

  connectedCallback() {
    this.tabIndex = 0;
    this.#kh = (e) => {
      if (document.activeElement !== this) return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); this.#go(this.#idx - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); this.#go(this.#idx + 1); }
    };
    document.addEventListener('keydown', this.#kh);
    const src = this.getAttribute('data-src');
    src ? this.#load(src) : this.#render();
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this.#kh);
    this.#kh = null;
  }

  async #load(url) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      this.loadData(await r.text());
    } catch (e) {
      console.error('[DesignCarousel]', e);
    }
  }

    /**
     * Supply carousel data.
     * @param {string|object} input  YAML string, JSON string, or parsed object with a `pages` array.
     */
    loadData(input) {
        if (typeof input === 'string') {
            const s = input.trim();
            try {
                input = (s[0] === '{' || s[0] === '[') ? JSON.parse(s) : jsyaml.load(s)
            } catch (e) {
                console.error('[DesignCarousel] Parse error:', e);
            }
        }

        if (input && typeof input === 'object') {
            this.#pages = Array.isArray(input.pages) ? input.pages : [];
            this.#title = String(input.title ?? '');
            this.#date  = String(input.date  ?? '');
            this.#idx = 0;
            this.#render();
        } 
    }

  // ── Navigation ─────────────────────────────────────────────────────────────

  #go(i) {
    const n = this.#pages.length;
    if (this.#busy || i < 0 || i >= n || i === this.#idx) return;
    this.#busy = true;

    const track   = this.shadowRoot.querySelector('.track');
    const caption = this.shadowRoot.querySelector('.caption');

    // Re-enable transition (may have been stripped during drag)
    track.style.transition = 'transform 300ms cubic-bezier(.4,0,.2,1)';
    caption.classList.remove('visible');
    this.#idx = i;
    track.style.transform = `translateX(${this.#trackX(i)}px)`;
    this.#syncDots();
    this.#syncArrows();
    this.#syncText();
    this.#syncSlides();

    // Fade text back in once slide animation ends
    setTimeout(() => {
      caption.classList.add('visible');
      setTimeout(() => { this.#busy = false; }, 150);
    }, 300);
  }

  #syncDots() {
    this.shadowRoot.querySelectorAll('.dot')
      .forEach((d, i) => d.classList.toggle('active', i === this.#idx));
  }

  #syncArrows() {
    const n = this.#pages.length;
    this.shadowRoot.querySelector('.arrow-left') ?.toggleAttribute('disabled', this.#idx === 0);
    this.shadowRoot.querySelector('.arrow-right')?.toggleAttribute('disabled', this.#idx === n - 1);
  }

  #syncText() {
    const p = this.#pages[this.#idx] ?? {};
    this.shadowRoot.querySelector('.slide-title').textContent = p.title       ?? '';
    this.shadowRoot.querySelector('.slide-desc') .textContent = p.description ?? '';
  }

  #syncSlides() {
    this.shadowRoot.querySelectorAll('.slide')
      .forEach((s, i) => {
        s.classList.toggle('active', i === this.#idx);
        s.setAttribute('aria-hidden', i !== this.#idx);
      });
  }

  // Returns the rendered pixel width of a single slide (including its padding/gap)
  #slideWidth() {
    const slide = this.shadowRoot.querySelector('.slide');
    return slide ? slide.offsetWidth : 0;
  }

  #trackX(idx = this.#idx) {
    return -(idx * this.#slideWidth());
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  #h(s) {
    return String(s ?? '')
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;');
  }

  #render() {
    const n = this.#pages.length;
    const p = this.#pages[0] ?? {};

    this.shadowRoot.innerHTML = /* html */`
<style>${cssText}</style>
<div class="card" part="card">
  <h1 class="carousel-title"><span>${this.#h(this.#title)}</span><i>${this.#h(this.#date)}</i></h1>
  <div class="carousel">
    <div class="slides-area">
        <div class="slides-vp" role="region" aria-label="Design carousel">
        <div class="track">
            ${this.#pages.map((pg, i) => `
            <div class="slide${i === 0 ? ' active' : ''}"
                role="group"
                aria-label="Slide ${i + 1} of ${n}"
                aria-hidden="${i !== 0}"
                data-i="${i}">
            <div class="img-box">
                <img src="${this.#h(pg.image)}"
                    alt="${this.#h(pg.title)}"
                    draggable="false">
            </div>
            </div>`).join('')}
        </div>
        </div>

        ${n > 1 ? `
        <button class="arrow arrow-left"  aria-label="Previous slide" disabled>&#8249;</button>
        <button class="arrow arrow-right" aria-label="Next slide"            >&#8250;</button>
        ` : ''}
    </div>

    ${n > 1 ? `
    <div class="dots" role="tablist" aria-label="Slide navigation">
        ${this.#pages.map((_, i) => `
        <button class="dot${i === 0 ? ' active' : ''}"
                role="tab"
                aria-selected="${i === 0}"
                aria-label="Slide ${i + 1}"
                data-i="${i}"></button>`).join('')}
    </div>
    ` : ''}
  </div>

  <div class="caption visible" aria-live="polite" aria-atomic="true">
    <h3 class="slide-title">${this.#h(p.title)}</h3>
    <p  class="slide-desc">${this.#h(p.description)}</p>
  </div>
</div>`;

    // Set initial transform via JS (CSS file has no transform on .track)
    this.shadowRoot.querySelector('.track').style.transform = 'translateX(0)';
    this.#syncSlides();
    this.#bind();
  }

  // ── Event binding ───────────────────────────────────────────────────────────

  #bind() {
    const sr = this.shadowRoot;

    sr.querySelector('.arrow-left') ?.addEventListener('click', () => this.#go(this.#idx - 1));
    sr.querySelector('.arrow-right')?.addEventListener('click', () => this.#go(this.#idx + 1));
    sr.querySelectorAll('.dot').forEach(d =>
      d.addEventListener('click', () => this.#go(+d.dataset.i))
    );

    sr.querySelectorAll('.slide').forEach(slide =>
      slide.addEventListener('click', () => {
        if (wasDragged) return;
        const i = +slide.dataset.i;
        if (i !== this.#idx) this.#go(i);
      })
    );

    const vp = sr.querySelector('.slides-vp');
    if (!vp) return;

    const THRESHOLD = 50;   // px needed to commit to a slide change
    const RESIST    = 0.25; // rubber-band factor at edges

    let active = false, startX = 0, startY = 0, lastX = 0, axis = null, wasDragged = false;

    const getTrack = () => sr.querySelector('.track');

    const onStart = (x, y) => {
      if (this.#busy) return;
      active     = true;
      axis       = null;
      wasDragged = false;
      startX = lastX = x;
      startY = y;
      getTrack().style.transition = 'none';
    };

    const applyDrag = (x) => {
      lastX = x;
      const dx = x - startX;
      if (Math.abs(dx) > 8) wasDragged = true;
      const n  = this.#pages.length;
      const offset = (this.#idx === 0 && dx > 0) || (this.#idx === n - 1 && dx < 0)
        ? dx * RESIST
        : dx;
      getTrack().style.transform = `translateX(${this.#trackX() + offset}px)`;
    };

    const onEnd = () => {
      if (!active) return;
      active = false;
      const dx = lastX - startX;
      const t  = getTrack();
      const n  = this.#pages.length;

      if (axis === 'h' && Math.abs(dx) > THRESHOLD) {
        if (dx < 0 && this.#idx < n - 1) { this.#go(this.#idx + 1); return; }
        if (dx > 0 && this.#idx > 0)     { this.#go(this.#idx - 1); return; }
      }
      // Snap back to current slide
      t.style.transition = 'transform 300ms cubic-bezier(.4,0,.2,1)';
      t.style.transform  = `translateX(${this.#trackX()}px)`;
    };

    const onCancel = () => {
      if (!active) return;
      active = false;
      const t = getTrack();
      t.style.transition = 'none';
      t.style.transform  = `translateX(${this.#trackX()}px)`;
    };

    // ── Touch (with axis detection to preserve vertical page scroll) ──────────
    vp.addEventListener('touchstart', e => {
      onStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    vp.addEventListener('touchmove', e => {
      if (!active) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      // Wait for minimum movement before committing to an axis
      if (!axis) {
        if (Math.hypot(dx, dy) < 6) return;
        axis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
        if (axis === 'v') { onCancel(); return; }
      }

      e.preventDefault(); // block page scroll for horizontal swipes
      applyDrag(touch.clientX);
    }, { passive: false }); // must be non-passive to call preventDefault

    vp.addEventListener('touchend',    () => onEnd(),    { passive: true });
    vp.addEventListener('touchcancel', () => onCancel(), { passive: true });

    // ── Mouse drag ────────────────────────────────────────────────────────────
    vp.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      onStart(e.clientX, e.clientY);
      axis = 'h'; // mouse drags are always treated as horizontal

      const onMouseMove = e => { if (active) applyDrag(e.clientX); };
      const onMouseUp   = () => {
        onEnd();
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup',   onMouseUp);
      };
      window.addEventListener('mousemove', onMouseMove, { passive: true });
      window.addEventListener('mouseup',   onMouseUp,   { passive: true });
    });
  }
}

customElements.define('design-carousel', DesignCarousel);
