/*
 * Unshite My Site QA probe (from No Shite Sites).
 * Paste into any browser tool that can evaluate JavaScript on the page
 * (built-in browser, Claude in Chrome, Playwright page.evaluate). It is async:
 * it scrolls through the page to trigger lazy content, runs the checks at the
 * current viewport size, returns to the top and resolves with a JSON report.
 * Run it once at 1440x900 and once at 390x844.
 */
(async () => {
  const W = innerWidth, H = innerHeight;
  // A hidden or minimised browser reports a 0x0 viewport: layout and hit-testing
  // then return nothing, and every check would silently "pass". Refuse instead.
  if (W < 200 || H < 200) {
    return { error: `Viewport is ${W}x${H}. Make the browser visible and set the window to 1440x900 or 390x844, then run again. No checks were run.` };
  }
  // Smooth scrolling (CSS scroll-behavior or a library like Lenis) animates scrollTo,
  // so measurements would be taken mid-scroll. Force instant scrolling while the probe runs.
  const root = document.documentElement;
  const savedBehaviour = [root.style.getPropertyValue('scroll-behavior'), document.body.style.getPropertyValue('scroll-behavior')];
  root.style.setProperty('scroll-behavior', 'auto', 'important');
  document.body.style.setProperty('scroll-behavior', 'auto', 'important');
  if (window.lenis && typeof window.lenis.stop === 'function') window.lenis.stop();
  const issues = [];
  const add = (type, el, detail) => issues.push({
    type,
    where: el ? describe(el) : '',
    detail,
  });
  const describe = (el) => {
    const id = el.id ? '#' + el.id : '';
    const cls = typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const sec = el.closest('section[id], [id]');
    const text = (el.innerText || el.alt || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    return `${el.tagName.toLowerCase()}${id}${cls}${sec && sec !== el ? ' in #' + sec.id : ''}${text ? ' "' + text + '"' : ''}`;
  };
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const textRects = (el) => { const r = document.createRange(); r.selectNodeContents(el); return [...r.getClientRects()].filter((x) => x.width > 0 && x.height > 0); };
  const notes = [];
  const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

  // Headline text sliding over an image that belongs to a different panel, card or slide
  // (type over its own image is a design feature; over a neighbour's image it's a collision).
  const UNIT = 'article, li, figure, [class*=panel], [class*=card], [class*=slide], [class*=item], [class*=step]';
  const collisions = new Map();
  const flush = new Map();
  // Body text that sits right against an image's side edge with no gutter (0 to 12px), rather than
  // clearly beside it or deliberately set on it. Checked at every scroll step, like collisions.
  const checkFlush = (imgs) => {
    for (const el of document.querySelectorAll('p, dl, ul, ol, blockquote, figcaption, a[class*=link], a[class*=btn], a[class*=button]')) {
      if (!visible(el) || flush.has(el) || !(el.innerText || '').trim()) continue;
      const lines = textRects(el).filter((t) => t.bottom > 0 && t.top < H && t.right > 0 && t.left < W);
      if (!lines.length) continue;
      const box = { left: Math.min(...lines.map((t) => t.left)), right: Math.max(...lines.map((t) => t.right)), top: Math.min(...lines.map((t) => t.top)), bottom: Math.max(...lines.map((t) => t.bottom)) };
      for (const im of imgs) {
        if (im.contains(el) || el.contains(im)) continue;
        const ir = im.getBoundingClientRect();
        const vOverlap = Math.min(box.bottom, ir.bottom) - Math.max(box.top, ir.top);
        if (vOverlap < (box.bottom - box.top) * 0.5) continue;
        const gapRight = box.left - ir.right, gapLeft = ir.left - box.right;
        if ((gapRight >= -2 && gapRight < 12) || (gapLeft >= -2 && gapLeft < 12)) { flush.set(el, im); break; }
      }
    }
  };
  const checkCollisions = () => {
    const imgs = [...document.querySelectorAll('img, picture, video, canvas')].filter(visible);
    checkFlush(imgs);
    for (const h of document.querySelectorAll('h1,h2,h3')) {
      if (!visible(h)) continue;
      // The heading's own unit: the nearest wrapper (not the heading itself) that is an article,
      // list item or figure, or that holds media. Class-name matches alone (panel__text) aren't enough.
      let own = null;
      for (let q = h.parentElement; q && q !== document.body; q = q.parentElement) {
        if (!q.matches(UNIT)) continue;
        if (q.matches('article, li, figure') || q.querySelector('img, picture, video, canvas')) { own = q; break; }
      }
      if (!own) continue;
      const lines = textRects(h).filter((t) => t.bottom > 0 && t.top < H && t.right > 0 && t.left < W);
      for (const im of imgs) {
        if (own.contains(im) || im.contains(h)) continue;
        let theirs = null;
        for (let q = im.parentElement; q && q !== document.body; q = q.parentElement) { if (q.matches(UNIT) && (q.matches('article, li, figure') || q.querySelector('h1, h2, h3, h4'))) { theirs = q; break; } }
        if (!theirs || theirs.contains(own) || own.contains(theirs)) continue;
        const ir = im.getBoundingClientRect();
        const hit = lines.some((t) => overlap(t, ir) > t.width * t.height * 0.15);
        if (hit && !collisions.has(h)) collisions.set(h, im);
      }
    }
  };

  // 1. Scroll through so lazy images and scroll effects run (and check collisions as panels move).
  const maxY = () => document.scrollingElement.scrollHeight - H;
  for (let y = 0; y <= maxY(); y += Math.round(H * 0.6)) { scrollTo(0, y); await sleep(120); checkCollisions(); }
  const pinnedEls = [...document.querySelectorAll('[class*=track], [class*=panels], [class*=horizontal], [data-pin], [class*=pin], .pin-spacer, [class*=stage], [class*=sticky]')];
  document.querySelectorAll('body *').forEach((el) => { if (getComputedStyle(el).position === 'sticky' && el.getBoundingClientRect().height > H * 0.6) pinnedEls.push(el); });
  const pinnedAt = () => pinnedEls.some((t) => { const r = t.getBoundingClientRect(); return r.top < H && r.bottom > 0 && r.height > H * 0.5; });
  for (let y = 0; y <= maxY(); y += Math.round(H * 0.2)) {
    scrollTo(0, y);
    if (pinnedAt()) { await sleep(160); checkCollisions(); }
  }
  scrollTo(0, maxY()); await sleep(400);
  // Settle reveals: finish every finite CSS or Web Animation, so text and images are measured in
  // their final place even in a browser that isn't drawing frames (a hidden pane, a background tab).
  for (const a of document.getAnimations()) {
    try { const it = a.effect && a.effect.getComputedTiming().iterations; if (it !== Infinity) a.finish(); } catch (e) { /* infinite or unsupported */ }
  }
  await sleep(100);

  // 1b. Settled pass, screen by screen (after reveals have played): an image covering headline
  // text, two pieces of text visible on top of each other (e.g. a step change mid-crossfade), and
  // screens that are mostly empty (e.g. a gap left when a pinned section unpins).
  const effOpacity = (el) => { let o = 1; for (let q = el; q && q !== document.documentElement; q = q.parentElement) { const st = getComputedStyle(q); if (st.visibility === 'hidden' || st.display === 'none') return 0; o *= +st.opacity; } return o; };
  const MEDIA = 'img, picture, video, canvas, svg';
  const covered = new Map(), textClash = new Map(), emptyAt = [];
  const pe = document.createElement('style'); pe.textContent = '* { pointer-events: auto !important; }';
  document.head.appendChild(pe);
  const hasOwnText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.data.trim());
  const isContent = (el) => {
    if (effOpacity(el) < 0.15) return false;
    if (el.matches(MEDIA) || el.closest('svg')) return true;
    if (hasOwnText(el)) return true;
    const bg = getComputedStyle(el).backgroundImage; return bg && /url\(/.test(bg);
  };
  const inStickyBar = (el) => { for (let q = el; q && q !== document.body; q = q.parentElement) { const st = getComputedStyle(q); if ((st.position === 'fixed' || st.position === 'sticky') && (q.matches('header, nav, [role="banner"], [role="navigation"]') || q.getBoundingClientRect().height < H * 0.2)) return true; } return false; };
  const checkCovered = () => {
    // Image over headline text.
    for (const h of document.querySelectorAll('h1, h2')) {
      if (covered.has(h) || !visible(h) || effOpacity(h) < 0.3) continue;
      const lines = textRects(h).filter((t) => t.top > 0 && t.bottom < H && t.left >= 0 && t.right <= W);
      let hits = 0, by = null;
      for (const t of lines) for (const fx of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        const stack = document.elementsFromPoint(t.left + t.width * fx, t.top + t.height / 2);
        const hi = stack.findIndex((e) => h === e || h.contains(e));
        // A logo in a fixed or sticky header passing over headings is normal (header-covers-heading judges the header itself).
        const mi = stack.findIndex((e) => !h.contains(e) && effOpacity(e) > 0.3 && (e.matches(MEDIA) || /url\(/.test(getComputedStyle(e).backgroundImage)) && !inStickyBar(e));
        if (mi >= 0 && hi >= 0 && mi < hi) { const r = stack[mi].getBoundingClientRect(); if (r.width * r.height < W * H * 0.9) { hits++; by = stack[mi]; } }
      }
      if (hits >= 2) covered.set(h, by);
    }
  };
  const checkTextClash = (y) => {
    // Text over text.
    const inBar = (el) => { for (let q = el; q && q !== document.body; q = q.parentElement) { const st = getComputedStyle(q); if (st.position === 'fixed' || st.position === 'sticky') { const r = q.getBoundingClientRect(); if (r.height < H * 0.3) return true; } } return false; };
    const texts = [...document.querySelectorAll('h1, h2, h3, p, li, blockquote')].filter((el) => visible(el) && el.innerText.trim() && effOpacity(el) > 0.15 && !inBar(el))
      .map((el) => { const ls = textRects(el).filter((t) => t.bottom > 0 && t.top < H); if (!ls.length) return null; return { el, box: { left: Math.min(...ls.map((t) => t.left)), right: Math.max(...ls.map((t) => t.right)), top: Math.min(...ls.map((t) => t.top)), bottom: Math.max(...ls.map((t) => t.bottom)) } }; })
      .filter(Boolean);
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j];
      if (a.el.contains(b.el) || b.el.contains(a.el) || textClash.has(a.el)) continue;
      const ov = overlap(a.box, b.box);
      const small = Math.min((a.box.right - a.box.left) * (a.box.bottom - a.box.top), (b.box.right - b.box.left) * (b.box.bottom - b.box.top));
      if (small > 0 && ov > small * 0.25) textClash.set(a.el, { other: (b.el.innerText || '').trim().slice(0, 40), y });
    }
  };
  // Text over photos: is every word readable against the picture behind it? Pixels are read from
  // each photo (every slide of a slideshow, not just the one showing), then scrims, gradients and
  // glows on top are blended in, and the contrast is measured along each line of text.
  // WCAG: 3:1 for large text (24px+, or 18.5px+ bold), 4.5:1 for everything else.
  const photoContrast = new Map();
  const photoNotes = [];
  const unreadable = new Set();
  const pixCache = new Map();
  let frameCache = new Map(); // video and canvas frames, re-read at every scroll step
  let styleCache = new Map();
  const cs = (el, ps) => { const k = ps || ''; let m = styleCache.get(el); if (!m) { m = {}; styleCache.set(el, m); } return m[k] || (m[k] = getComputedStyle(el, ps)); };
  const parseColour = (s) => {
    // color-mix() and other modern colours compute to color(srgb r g b / a), with 0-1 channels.
    const cm = s && s.match(/color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/);
    if (cm) { let a = cm[4] === undefined ? 1 : parseFloat(cm[4]); if (cm[4] && cm[4].endsWith('%')) a /= 100; return [+cm[1], +cm[2], +cm[3], a]; }
    const m = s && s.match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/);
    if (!m) return null;
    let a = m[4] === undefined ? 1 : parseFloat(m[4]); if (m[4] && m[4].endsWith('%')) a /= 100;
    return [+m[1] / 255, +m[2] / 255, +m[3] / 255, a];
  };
  const splitTop = (s) => { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };
  const relLum = (c) => { const f = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = relLum(a), y = relLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const blend = (base, c, a, mode) => {
    const mix = mode === 'screen' ? c.map((v, i) => 1 - (1 - v) * (1 - base[i])) : mode === 'multiply' ? c.map((v, i) => v * base[i]) : c;
    return base.map((v, i) => mix[i] * a + v * (1 - a));
  };
  // Evaluate a CSS gradient layer at a point inside box r. Linear and radial (ellipse/circle,
  // percentage or px radii, "at x y") are computed; anything else falls back to its average colour.
  const gradientAt = (g, r, x, y) => {
    const inner = g.slice(g.indexOf('(') + 1, g.lastIndexOf(')'));
    let parts = splitTop(inner), t = null, L = 0; // L: gradient length in px, for px stops
    const pct = (v, size) => (/%$/.test(v) ? parseFloat(v) / 100 * size : parseFloat(v));
    if (/^linear/.test(g)) {
      let ang = 180; const first = parts[0];
      if (/deg|turn|rad/.test(first) || /^to /.test(first)) {
        parts = parts.slice(1);
        if (/deg/.test(first)) ang = parseFloat(first); else if (/turn/.test(first)) ang = parseFloat(first) * 360; else if (/rad/.test(first)) ang = parseFloat(first) * 180 / Math.PI;
        else ang = { 'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270 }[first] ?? 180;
      }
      const a = ang * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a);
      const len = Math.abs(r.width * dx) + Math.abs(r.height * dy);
      t = ((x - r.left - r.width / 2) * dx + (y - r.top - r.height / 2) * dy) / len + 0.5; L = len;
    } else if (/^radial/.test(g) && !/^\s*(rgb|#|transparent)/.test(parts[0])) {
      const shape = parts.shift(); const [sz, at] = shape.split(/\s+at\s+/);
      const pos = (at || '50% 50%').split(/\s+/);
      const kw = { left: '0%', top: '0%', center: '50%', right: '100%', bottom: '100%' };
      const cx = r.left + pct(kw[pos[0]] || pos[0], r.width), cy = r.top + pct(kw[pos[1] || 'center'] || pos[1], r.height);
      const lens = (sz || '').split(/\s+/).filter((v) => /[\d.]+(px|%)/.test(v));
      let rx, ry;
      if (lens.length >= 2) { rx = pct(lens[0], r.width); ry = pct(lens[1], r.height); }
      else if (lens.length === 1) { rx = ry = pct(lens[0], r.width); }
      else { const fx = Math.max(cx - r.left, r.right - cx), fy = Math.max(cy - r.top, r.bottom - cy); if (/circle/.test(sz)) rx = ry = Math.hypot(fx, fy); else { rx = fx * Math.SQRT2; ry = fy * Math.SQRT2; } }
      t = Math.hypot((x - cx) / rx, (y - cy) / ry); L = rx;
    }
    const stops = parts.map((p) => { const c = parseColour(p) || (/transparent/.test(p) ? [0, 0, 0, 0] : null); const rest = p.replace(/(rgba?|color)\([^)]*\)/, ''); const m = rest.match(/(-?[\d.]+)(%|px)/); return c && { c, at: !m ? null : m[2] === '%' ? parseFloat(m[1]) / 100 : L ? parseFloat(m[1]) / L : null }; }).filter(Boolean);
    if (!stops.length) return null;
    if (t === null) { const avg = [0, 1, 2, 3].map((i) => stops.reduce((s, st) => s + st.c[i], 0) / stops.length); return avg; }
    stops.forEach((s, i) => { if (s.at === null) s.at = i === 0 ? 0 : i === stops.length - 1 ? 1 : null; });
    for (let i = 1; i < stops.length; i++) if (stops[i].at === null) { let j = i; while (stops[j].at === null) j++; const a0 = stops[i - 1].at, a1 = stops[j].at; for (let k = i; k < j; k++) stops[k].at = a0 + (a1 - a0) * (k - i + 1) / (j - i + 1); }
    if (t <= stops[0].at) return stops[0].c;
    for (let i = 1; i < stops.length; i++) if (t <= stops[i].at) { const s0 = stops[i - 1], s1 = stops[i]; const f = (t - s0.at) / ((s1.at - s0.at) || 1); return s0.c.map((v, k) => v + (s1.c[k] - v) * f); }
    return stops[stops.length - 1].c;
  };
  // Colour layers an element (or its ::before/::after) paints at a point: background-color plus gradients.
  const paintLayers = (el, pseudo, r, x, y, layerChecked = false) => {
    const st = cs(el, pseudo);
    if (pseudo && (st.content === 'none' || st.content === 'normal' || (!layerChecked && +st.zIndex < 0))) return []; // a negative layer may sit under the photo, unless the caller checked it
    // A pseudo-element only paints its own box: skip thin rules and underlines, and ones scaled to nothing.
    if (pseudo) { const pw = parseFloat(st.width), ph = parseFloat(st.height); if ((pw && pw < r.width * 0.3) || (ph && ph < r.height * 0.3)) return []; const m = st.transform.match(/matrix\(([^,]+),[^,]+,[^,]+,([^,]+)/); if (m && (Math.abs(+m[1]) < 0.05 || Math.abs(+m[2]) < 0.05)) return []; }
    const op = pseudo ? +st.opacity : 1, mode = st.mixBlendMode;
    const layers = [];
    const bg = parseColour(st.backgroundColor); if (bg && bg[3] > 0) layers.push({ c: bg, mode });
    const imgs = splitTop(st.backgroundImage), sizes = splitTop(st.backgroundSize), poss = splitTop(st.backgroundPosition), reps = splitTop(st.backgroundRepeat);
    imgs.map((l, i) => ({ l, i })).reverse().forEach(({ l, i }) => {
      if (!/gradient\(/.test(l) || /repeating/.test(l)) return;
      // Each layer paints a tile set by background-size/position: an underline gradient sized 0% or
      // 1px only covers that strip, so it must not count as filling the whole box.
      const [sw, sh] = (sizes[i % sizes.length] || 'auto').split(/\s+/);
      const len = (v, full) => (!v || v === 'auto' || v === 'cover' || v === 'contain' ? full : /%$/.test(v) ? parseFloat(v) / 100 * full : parseFloat(v));
      const tw = len(sw, r.width), th = len(sh || sw, r.height);
      if (tw < 1 || th < 1) return;
      const [px0, py0] = (poss[i % poss.length] || '0% 0%').split(/\s+/);
      const pos = (v, free) => (/%$/.test(v) ? parseFloat(v) / 100 * free : parseFloat(v) || 0);
      const tile = { left: r.left + pos(px0, r.width - tw), top: r.top + pos(py0 || '0%', r.height - th) };
      tile.right = tile.left + tw; tile.bottom = tile.top + th; tile.width = tw; tile.height = th;
      const small = tw < r.width * 0.9 || th < r.height * 0.9;
      if (small && /no-repeat/.test(reps[i % reps.length] || '')) { if (x < tile.left || x > tile.right || y < tile.top || y > tile.bottom) return; }
      else if (small) return; // a repeating pattern: too fine to judge, leave it out
      const c = gradientAt(l, small ? tile : r, x, y); if (c && c[3] > 0) layers.push({ c, mode });
    });
    return layers.map((l) => ({ c: l.c.slice(0, 3), a: l.c[3] * op, mode: l.mode }));
  };
  const loadPix = async (el) => {
    // The first real picture among the background layers (SVG noise and pattern textures are skipped).
    const bgUrl = !el.matches('img, video, canvas') && ([...cs(el).backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => m[1]).find((u) => !/^data:image\/svg/.test(u)));
    const key = el.matches('video, canvas') ? el : (bgUrl || el.currentSrc || el.src);
    if (!key) return null;
    const cache = el.matches('video, canvas') ? frameCache : pixCache;
    if (cache.has(key)) return cache.get(key);
    let src = el;
    try {
      if (bgUrl) { src = new Image(); if (!bgUrl.startsWith(location.origin) && /^https?:/.test(bgUrl)) src.crossOrigin = 'anonymous'; src.src = bgUrl; await Promise.race([src.decode(), sleep(2500)]); }
      else if (el.tagName === 'IMG' && !(el.complete && el.naturalWidth)) { el.loading = 'eager'; await Promise.race([el.decode(), sleep(2500)]); }
      const nw = src.naturalWidth || src.videoWidth || src.width, nh = src.naturalHeight || src.videoHeight || src.height;
      if (!nw || !nh || (src.tagName === 'VIDEO' && src.readyState < 2)) return null;
      const s = Math.min(1, 480 / Math.max(nw, nh)), cw = Math.max(1, Math.round(nw * s)), ch = Math.max(1, Math.round(nh * s));
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
      const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(src, 0, 0, cw, ch);
      const px = { data: ctx.getImageData(0, 0, cw, ch).data, cw, ch, nw, nh, bg: !!bgUrl };
      cache.set(key, px); return px;
    } catch (e) { unreadable.add((bgUrl || el.currentSrc || el.src || el.tagName).split('/').pop().slice(0, 60)); cache.set(key, null); return null; }
  };
  // Where a point on screen lands inside the picture, honouring object-fit/position or background-size/position.
  const pixelAt = (el, px, x, y) => {
    const r = el.getBoundingClientRect(), st = cs(el);
    const fit = px.bg ? ({ cover: 'cover', contain: 'contain' }[st.backgroundSize.split(',')[0].trim()] || 'size') : st.objectFit;
    let sx, sy;
    if (fit === 'cover' || fit === 'contain' || fit === 'scale-down') { const f = (fit === 'cover' ? Math.max : Math.min)(r.width / px.nw, r.height / px.nh); sx = sy = fit === 'scale-down' ? Math.min(1, f) : f; }
    else if (fit === 'none') { sx = sy = 1; }
    else if (fit === 'size') { const [bw, bh] = st.backgroundSize.split(',')[0].trim().split(/\s+/); const w = bw && bw !== 'auto' ? (/%$/.test(bw) ? parseFloat(bw) / 100 * r.width : parseFloat(bw)) : px.nw; const h = bh && bh !== 'auto' ? (/%$/.test(bh) ? parseFloat(bh) / 100 * r.height : parseFloat(bh)) : (bw && bw !== 'auto' ? w * px.nh / px.nw : px.nh); sx = w / px.nw; sy = h / px.nh; }
    else { sx = r.width / px.nw; sy = r.height / px.nh; }
    const rw = px.nw * sx, rh = px.nh * sy;
    const pos = (px.bg ? st.backgroundPosition.split(',')[0] : st.objectPosition).trim().split(/\s+/);
    const off = (v, free) => (v === undefined ? free / 2 : /%$/.test(v) ? parseFloat(v) / 100 * free : parseFloat(v) || 0);
    const u = (x - r.left - off(pos[0], r.width - rw)) / rw, v = (y - r.top - off(pos[1], r.height - rh)) / rh;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return null;
    const i = (Math.floor(v * px.ch) * px.cw + Math.floor(u * px.cw)) * 4;
    if (px.data[i + 3] < 128) return null; // transparent part of a cut-out
    return [px.data[i] / 255, px.data[i + 1] / 255, px.data[i + 2] / 255];
  };
  const isPhoto = (e) => e.matches('img, video, canvas') || (!e.matches('.grain, [class*=grain], [class*=noise]') && /url\((?!["']?data:image\/svg)/.test(cs(e).backgroundImage));
  const nearSame = (a, b) => Math.abs((a.left + a.right) - (b.left + b.right)) / 2 < b.width * 0.15 && Math.abs((a.top + a.bottom) - (b.top + b.bottom)) / 2 < b.height * 0.15 && Math.abs(a.width - b.width) < b.width * 0.15 && Math.abs(a.height - b.height) < b.height * 0.15;
  // Does an ancestor's ::before/::after scrim paint above the photo? Compare their z-index layers inside
  // that ancestor: e.g. a photo at z-index -2 under a ::before darkening gradient at -1 (a common pattern).
  // Equal layers paint in tree order: ::before under the children, ::after over them.
  const zLayer = (el, anc) => {
    let positioned = false;
    for (let q = el; q && q !== anc; q = q.parentElement) { const st = cs(q); if (st.position !== 'static') { positioned = true; if (st.zIndex !== 'auto') return +st.zIndex; } }
    return positioned ? 0 : -0.5; // in-flow content paints under positioned layers
  };
  const overlayAbove = (s2, ps, photo, anc) => {
    const zp = s2.zIndex === 'auto' ? 0 : +s2.zIndex, zb = zLayer(photo, anc);
    return zp > zb || (zp === zb && ps === '::after');
  };
  const checkPhotoContrast = async (y) => {
    frameCache = new Map(); styleCache = new Map();
    const els = [...document.querySelectorAll('body *')].filter((el) => { if (!hasOwnText(el) || el.closest('svg, script, style, noscript')) return false; const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < H && r.width > 0 && visible(el) && effOpacity(el) > 0.15; });
    for (const el of els) {
      if (effOpacity(el) < 0.85) continue; // fading in or out right now, not its settled look
      const st = cs(el);
      if (/text/.test(st.backgroundClip + st.webkitBackgroundClip)) continue; // gradient-filled type
      let tc = parseColour(st.color); if (!tc) continue;
      const fs = parseFloat(st.fontSize), large = fs >= 24 || (fs >= 18.5 && +st.fontWeight >= 700);
      const need = large ? 3 : 4.5;
      const sh = st.textShadow !== 'none' && st.textShadow.match(/(rgba?\([^)]*\))[^,]*?(\d+(?:\.\d+)?)px\s*(?:,|$)/);
      // A soft glow (text-shadow) lifts the background a little; a wide blur barely reaches thin letters.
      const haloBlur = sh ? parseFloat(sh[2]) : 0, halo = haloBlur >= 6 ? parseColour(sh[1]) : null, haloK = haloBlur >= 16 ? 0.15 : 0.35;
      const lines = textRects(el).filter((t) => t.top >= 0 && t.bottom <= H && t.left >= 0 && t.right <= W && t.width > fs);
      for (const t of lines) {
        if (![0.2, 0.5, 0.8].some((f) => document.elementsFromPoint(t.left + t.width * f, t.top + t.height * 0.55).some((e) => isPhoto(e)))) continue;
        const n = Math.max(6, Math.min(40, Math.round(t.width / 24))), colW = t.width / n;
        const cols = [];
        for (let i = 0; i < n; i++) {
          const x = t.left + (i + 0.5) * colW, ym = t.top + t.height * 0.55;
          const stack = document.elementsFromPoint(x, ym);
          const ti = stack.findIndex((e) => e === el || el.contains(e));
          if (ti < 0) { cols.push(null); continue; }
          if (stack.slice(0, ti).some((e) => isPhoto(e) && effOpacity(e) > 0.9 && !e.contains(el))) { cols.push(null); continue; } // a photo in front (depth sandwich)
          const behind = stack.slice(ti + 1);
          const photos = behind.filter((e) => isPhoto(e)); // includes a section's own background photo
          const top = photos.find((e) => effOpacity(e) > 0.9);
          if (!top) { cols.push(null); continue; }
          const topR = top.getBoundingClientRect();
          // Hidden slides: invisible photos stacked in the same place as the visible one.
          const bases = [top, ...photos.filter((e) => e !== top && effOpacity(e) < 0.05 && nearSame(e.getBoundingClientRect(), topR))];
          const ordered = [...bases].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
          const res = [];
          for (const b of bases) {
            const px = await loadPix(b); if (!px) continue;
            const bi = behind.indexOf(b);
            const over = behind.slice(0, bi).reverse().filter((e) => !isPhoto(e)).concat([el]);
            const ancs = behind.slice(bi + 1).filter((a) => a.contains(b)).reverse();
            let worstHere = null;
            for (const fy of [0.35, 0.55, 0.75]) {
              const yy = t.top + t.height * fy;
              let c = pixelAt(b, px, x, yy); if (!c) continue;
              for (const anc of ancs) for (const ps of ['::before', '::after']) { const s2 = cs(anc, ps); if (s2.content !== 'none' && s2.content !== 'normal' && /absolute|fixed/.test(s2.position) && overlayAbove(s2, ps, b, anc)) paintLayers(anc, ps, anc.getBoundingClientRect(), x, yy, true).forEach((l) => { c = blend(c, l.c, l.a, l.mode); }); }
              for (const o of over) { const orr = o.getBoundingClientRect(), oo = effOpacity(o); for (const ps of [null, '::before', '::after']) paintLayers(o, ps, orr, x, yy).forEach((l) => { c = blend(c, l.c, l.a * oo, l.mode); }); }
              if (halo) c = blend(c, halo.slice(0, 3), halo[3] * haloK);
              // Judge each column by its worst point: a dark band across the top of the letters is enough to lose them.
              const fg = tc[3] < 1 ? blend(c, tc.slice(0, 3), tc[3]) : tc.slice(0, 3);
              const rr = ratio(fg, c); if (worstHere === null || rr < worstHere) worstHere = rr;
            }
            if (worstHere === null) continue;
            res.push({ b, slide: bases.length > 1 ? `slide ${ordered.indexOf(b) + 1} of ${ordered.length}` : '', r: worstHere });
          }
          cols.push(res.length ? res : null);
        }
        // Per photo (slide), find the longest stretch of the line below the needed contrast.
        const byPhoto = new Map();
        cols.forEach((c, i) => (c || []).forEach((r) => { if (!byPhoto.has(r.b)) byPhoto.set(r.b, { slide: r.slide, rs: new Array(n).fill(null) }); byPhoto.get(r.b).rs[i] = r.r; }));
        byPhoto.forEach((v, b) => {
          let best = null, run = [];
          v.rs.concat([null]).forEach((r, i) => { if (r !== null && r < need) run.push(i); else { if (run.length && (!best || run.length > best.length)) best = run; run = []; } });
          if (!best || best.length * colW < Math.max(fs * (large ? 0.8 : 1.2), colW * 2)) return; // about one or two letters
          const worst = Math.min(...best.map((i) => v.rs[i]));
          const words = new Set();
          for (const i of [best[0], best[Math.floor(best.length / 2)], best[best.length - 1]]) {
            const cr = document.caretRangeFromPoint && document.caretRangeFromPoint(t.left + (i + 0.5) * colW, t.top + t.height / 2);
            if (cr && el.contains(cr.startContainer) && cr.startContainer.nodeType === 3) { const s = cr.startContainer.data; let a = cr.startOffset, z = a; while (a > 0 && /\S/.test(s[a - 1])) a--; while (z < s.length && /\S/.test(s[z])) z++; const w = s.slice(a, z).replace(/[^\p{L}\p{N}'’-]/gu, ''); if (w) words.add(w); }
          }
          const key = el; const prev = photoContrast.get(key) || [];
          const label = (b.tagName === 'CANVAS' ? 'the scroll animation canvas' : b.tagName === 'VIDEO' ? (b.currentSrc || 'the video') : b.currentSrc || b.src || getComputedStyle(b).backgroundImage).split('/').pop().replace(/["']|\)$/g, '').split('?')[0].slice(0, 60);
          const same = prev.find((p) => p.label === label);
          if (same) { words.forEach((w) => same.words.add(w)); same.worst = Math.min(same.worst, worst); }
          else prev.push({ label, slide: v.slide, words, worst, need, y: Math.round(y) });
          photoContrast.set(key, prev);
        });
      }
    }
  };
  // A big headline that only partly crosses a framed image (a few letters over the edge, or nearly all
  // of it inside with the end sticking out) reads as a mistake, not a design. Cross decisively or keep clear.
  const crossing = new Map();
  const checkCrossing = () => {
    const heads = [...document.querySelectorAll('h1, h2')].filter((h) => visible(h) && effOpacity(h) > 0.5 && parseFloat(getComputedStyle(h).fontSize) >= 32);
    if (!heads.length) return;
    // Cut-outs (a transparent subject, e.g. a depth-sandwich hero) are judged by image-covers-headline instead.
    const cutout = (m) => /cut-?out|isolated|subject|knockout/i.test(`${m.className} ${m.currentSrc || m.src || ''} ${m.alt || ''}`);
    const boxes = [...document.querySelectorAll('img, video, canvas')].filter((m) => visible(m) && effOpacity(m) > 0.5 && !cutout(m)).map((m) => {
      let r = m.getBoundingClientRect(), frame = null;
      // Use the steel/wood frame around the photo when there is one (a border of 3px or more).
      for (let q = m.parentElement, i = 0; q && i < 5; q = q.parentElement, i++) {
        const st = getComputedStyle(q); const bw = Math.max(...['Top', 'Right', 'Bottom', 'Left'].map((s) => parseFloat(st[`border${s}Width`]) || 0));
        if (bw >= 3) { const fr = q.getBoundingClientRect(); if (fr.width < r.width * 1.6 && fr.height < r.height * 1.6) { frame = { el: q, colour: st.borderLeftColor }; r = fr; } break; }
      }
      return { m, r, frame };
    }).filter((b) => b.r.width * b.r.height > W * H * 0.06 && b.r.bottom > 0 && b.r.top < H);
    for (const h of heads) {
      const tc = parseColour(getComputedStyle(h).color);
      for (const t of textRects(h).filter((x) => x.bottom > 0 && x.top < H && x.width > 60)) {
        for (const b of boxes) {
          if (b.m.contains(h) || (b.frame && b.frame.el.contains(h))) continue;
          if (Math.min(t.bottom, b.r.bottom) - Math.max(t.top, b.r.top) < t.height * 0.5) continue;
          const f = Math.max(0, Math.min(t.right, b.r.right) - Math.max(t.left, b.r.left)) / t.width;
          if ((f > 0.04 && f < 0.4) || (f > 0.6 && f < 0.96)) {
            // A cut-out in front of the type (depth-sandwich hero, D) is deliberate: skip it.
            const mx = (Math.max(t.left, b.r.left) + Math.min(t.right, b.r.right)) / 2, my = t.top + t.height / 2;
            const st = document.elementsFromPoint(mx, my); const hi = st.findIndex((e) => h === e || h.contains(e)), mi = st.indexOf(b.m);
            if (mi >= 0 && (hi < 0 || mi < hi)) continue;
            const fc = b.frame && parseColour(b.frame.colour);
            const merge = tc && fc && ratio(tc.slice(0, 3), fc.slice(0, 3)) < 1.6;
            if (!crossing.has(h)) crossing.set(h, { pct: Math.round(f * 100), merge, what: describe(b.frame ? b.frame.el : b.m) });
          }
        }
      }
    }
  };
  // Stickers and badges (small round or rotated labels) crowding a button or link.
  const stickerNear = new Map();
  const checkStickers = () => {
    // Links in a fixed or sticky header or bar pass over everything while scrolling, so they don't count.
    const acts = [...document.querySelectorAll('a[href], button')].filter((a) => visible(a) && effOpacity(a) > 0.5 && !inStickyBar(a)).map((a) => ({ a, r: a.getBoundingClientRect() })).filter((x) => x.r.width > 20 && x.r.bottom > 0 && x.r.top < H);
    const stickers = [...document.querySelectorAll('body *')].filter((el) => {
      const st = getComputedStyle(el); if (!/absolute|fixed/.test(st.position) || el.closest('header, nav, [role=dialog]') || el.matches('a, button') || el.querySelector('a, button')) return false;
      const r = el.getBoundingClientRect(); if (r.width < 40 || r.width * r.height > W * H * 0.05 || r.bottom < 0 || r.top > H || effOpacity(el) < 0.5) return false;
      const txt = (el.innerText || '').trim(); if (!txt || txt.length > 40) return false;
      const round = parseFloat(st.borderTopLeftRadius) >= Math.min(r.width, r.height) * 0.4;
      const rotated = st.transform !== 'none' && !/^matrix\(1, 0, 0, 1,/.test(st.transform);
      return round || rotated;
    });
    for (const s of stickers) {
      const r = s.getBoundingClientRect();
      for (const { a, r: ar } of acts) {
        if (s.contains(a) || a.contains(s)) continue;
        const gap = Math.max(ar.left - r.right, r.left - ar.right, ar.top - r.bottom, r.top - ar.bottom);
        if (gap < 56 && !stickerNear.has(s)) stickerNear.set(s, { a, gap: Math.round(gap) });
      }
    }
  };
  // Hero presence: the first-screen headline should be the main event, not a caption.
  let heroWeak = null;
  const checkHero = () => {
    const h1 = [...document.querySelectorAll('h1')].find((h) => visible(h) && h.getBoundingClientRect().top + scrollY < H);
    if (!h1 || W < 360 || (W >= 600 && W < 1024)) return;
    const fs = parseFloat(getComputedStyle(h1).fontSize);
    // Measure the glyph boxes of the text nodes only (element boxes would count each line twice).
    let area = 0; const walk = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) { if (!n.data.trim()) continue; const r = document.createRange(); r.selectNodeContents(n); for (const x of r.getClientRects()) area += x.width * x.height; }
    area /= W * H;
    const minFs = W >= 1024 ? 56 : 34;
    if (fs < minFs || area < 0.04) heroWeak = { h1, fs: Math.round(fs), pct: (area * 100).toFixed(1) };
  };
  // Sliding tracks: text sliced by the window it slides in (an overflow-clipping ancestor or the screen edge).
  const sliced = new Map();
  const clipBox = (el) => {
    let b = { left: 0, right: W };
    for (let q = el.parentElement; q && q !== document.body; q = q.parentElement) {
      const st = getComputedStyle(q);
      if (/hidden|clip/.test(st.overflowX) || /hidden|clip/.test(st.overflow)) { const r = q.getBoundingClientRect(); b = { left: Math.max(b.left, r.left), right: Math.min(b.right, r.right) }; }
    }
    return b;
  };
  const moving = (el) => { for (let q = el.parentElement, i = 0; q && q !== document.body && i < 8; q = q.parentElement, i++) { const t = getComputedStyle(q).transform; if (t && t !== 'none' && !/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(t)) return true; } return false; };
  const checkTrackSlices = (y) => {
    for (const el of document.querySelectorAll('h1, h2, h3, h4, p, li, span, a, figcaption, time')) {
      if (!hasOwnText(el) || effOpacity(el) < 0.3 || !moving(el)) continue;
      // Screen-reader-only text (1px boxes, clip) is hidden on purpose.
      const er = el.getBoundingClientRect(); if (er.width <= 2 || er.height <= 2 || el.matches('.visually-hidden, .sr-only, .screen-reader-text, [class*=visually-hidden]')) continue;
      const b = clipBox(el);
      for (const t of textRects(el)) {
        if (t.bottom < 0 || t.top > H || t.width < 12) continue;
        const vis = Math.max(0, Math.min(t.right, b.right) - Math.max(t.left, b.left)) / t.width;
        if (vis > 0.1 && vis < 0.9 && !sliced.has(el)) sliced.set(el, Math.round(y));
      }
    }
  };
  // Progress indicators: a time shown outside the sliding track should match a time on a panel that is fully in view.
  const syncOff = [];
  const TIME = /\b(\d{1,2}(?::\d{2})?\s?(?:am|pm))\b/i;
  const checkProgressSync = (y) => {
    const times = [...document.querySelectorAll('body *')].filter((el) => hasOwnText(el) && effOpacity(el) > 0.5 && TIME.test(el.textContent) && el.textContent.trim().length < 40 && parseFloat(getComputedStyle(el).fontSize) >= 16)
      .map((el) => { const r = el.getBoundingClientRect(); const b = clipBox(el); return { el, t: el.textContent.match(TIME)[1].replace(/\s/g, '').toLowerCase(), r, inView: r.top >= 0 && r.bottom <= H && r.left >= b.left - 1 && r.right <= b.right + 1, mov: moving(el) }; })
      .filter((x) => x.inView && !x.el.closest('header, nav, footer'));
    const panels = times.filter((x) => x.mov).map((x) => x.t), labels = times.filter((x) => !x.mov);
    if (!panels.length) return;
    for (const l of labels) if (!panels.includes(l.t) && syncOff.length < 3) syncOff.push({ el: l.el, shows: l.t, panels: [...new Set(panels)].join(', '), y: Math.round(y) });
  };
  // Scroll layers that start out of place: a CSS load animation and a JS scroll tween on the same element.
  // The tween records whatever the half-finished load animation shows as its start, so at the top of the
  // page the layer sits a few pixels off (e.g. a cut-out landscape no longer lining up with its plate).
  const offsetLayers = [];
  const checkLayerRest = () => {
    for (const el of document.querySelectorAll('body *')) {
      if (!el.style || !el.style.transform) continue; // only transforms set by script
      const st = getComputedStyle(el);
      if (!st.animationName || st.animationName === 'none') continue;
      if (!el.matches('img, picture, canvas, video') && !el.querySelector('img, picture, canvas, video')) continue;
      const r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > H || r.width < W * 0.3) continue;
      const m = new DOMMatrix(st.transform === 'none' ? undefined : st.transform);
      const dx = Math.abs(m.m41), dy = Math.abs(m.m42), sc = Math.hypot(m.a, m.b);
      if (dx > 4 || dy > 4 || Math.abs(sc - 1) > 0.015) offsetLayers.push({ el, dx: Math.round(dx), dy: Math.round(dy), sc: sc.toFixed(2), anim: st.animationName.split(',')[0] });
    }
  };
  // Moving layers whose own edge comes into view: a cut-out the same height as its frame rises on scroll,
  // its bottom edge lifts inside the frame and the layers behind show through as stripes.
  const edgeShows = new Map();
  const clipOf = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p); if (/hidden|clip/.test(o.overflow + o.overflowY)) return p; } return null; };
  const checkLayerEdge = (y) => {
    for (const el of document.querySelectorAll('body *')) {
      if (edgeShows.has(el) || !el.style || !el.style.transform) continue; // only transforms set by script
      if (!el.matches('img, picture, canvas, video') && !el.querySelector('img, picture, canvas, video')) continue;
      const st = getComputedStyle(el); if (st.transform === 'none' || effOpacity(el) < 0.5) continue;
      const dy = new DOMMatrix(st.transform).m42; if (Math.abs(dy) < 6) continue;
      // the layer's extent includes media hanging outside its own box (an apron of extra ground below it)
      const box = el.getBoundingClientRect(); if (box.width < W * 0.5) continue;
      const r = { left: box.left, width: box.width, top: box.top, bottom: box.bottom };
      for (const m of el.querySelectorAll('img, canvas, video')) { if (!visible(m)) continue; const q = m.getBoundingClientRect(); if (q.width < box.width * 0.5) continue;
        let t = q.top, b = q.bottom; // trimmed to any clipping wrapper inside the layer
        for (let p = m.parentElement; p && p !== el; p = p.parentElement) { const o = getComputedStyle(p); if (/hidden|clip/.test(o.overflow + o.overflowY)) { const pr = p.getBoundingClientRect(); t = Math.max(t, pr.top); b = Math.min(b, pr.bottom); } }
        if (b > t) { r.top = Math.min(r.top, t); r.bottom = Math.max(r.bottom, b); } }
      const clip = clipOf(el); if (!clip) continue;
      const c = clip.getBoundingClientRect();
      // rising (dy < 0) shows the bottom edge; sinking shows the top edge
      const edge = dy < 0 ? r.bottom : r.top, gapTop = dy < 0 ? r.bottom : c.top, gapBot = dy < 0 ? c.bottom : r.top;
      const top = Math.max(gapTop, 0), bot = Math.min(gapBot, H);
      if (bot - top < 8 || edge < 0 || edge > H) continue;
      // fine if another image painted above this layer covers the gap (a foreground layer that overhangs)
      const xs = [0.25, 0.5, 0.75].map((f) => r.left + r.width * f), yIn = dy < 0 ? edge - 3 : edge + 3, yGap = (top + bot) / 2;
      const covered = xs.every((x) => {
        const inStack = document.elementsFromPoint(x, yIn), i = inStack.findIndex((n) => el.contains(n));
        if (i < 0) return true;
        const above = inStack.slice(0, i).filter((n) => n.matches('img, picture, canvas, video'));
        return document.elementsFromPoint(x, yGap).some((n) => above.includes(n));
      });
      if (covered) continue;
      // a shade with a solid stop over the strip (e.g. a fade to the section colour) can hide it: note only
      const shaded = xs.every((x) => document.elementsFromPoint(x, yGap).some((n) => !el.contains(n) && /gradient/.test(getComputedStyle(n).backgroundImage) && /rgb\(/.test(getComputedStyle(n).backgroundImage)));
      edgeShows.set(el, { y, gap: Math.round(bot - top), side: dy < 0 ? 'bottom' : 'top', shaded });
    }
  };
  // Phone crops so tight that the subject of a wide photo can be cut out ('cover' on a portrait screen keeps
  // only the middle of a landscape photo). Flagged as an issue when the alt text describes a person.
  const tightCrops = new Map();
  const PERSON = /^\s*[A-Z][a-z]+(?:\s+(?:and|&)\s+[A-Z][a-z]+)?\s+(?:at|in|with|on|by|holding|checking|shaping|pouring|cutting|working|making|turning|planing|fitting)\b|\b(person|people|man|woman|men|women|child|children|kids?|baker|barber|chef|maker|owner|founder|team|staff|portrait|hands?|face|couple|family|guests?|customers?|smiling|wearing)\b/i;
  const checkPhoneCrop = () => {
    if (W >= 600) return;
    for (const im of document.querySelectorAll('img')) {
      if (tightCrops.has(im) || !im.naturalWidth || !visible(im) || effOpacity(im) < 0.5) continue;
      if (getComputedStyle(im).objectFit !== 'cover') continue;
      const r = im.getBoundingClientRect(); if (r.width * r.height < W * H * 0.3 || r.bottom < 0 || r.top > H) continue;
      const s = Math.max(r.width / im.naturalWidth, r.height / im.naturalHeight);
      const fx = r.width / (im.naturalWidth * s), fy = r.height / (im.naturalHeight * s);
      const shown = Math.min(fx, fy);
      if (shown < 0.4) tightCrops.set(im, { pct: Math.round(shown * 100), person: PERSON.test(im.alt || ''), side: fx < fy ? 'width' : 'height' });
    }
  };
  const isEmpty = () => {
    // Mostly empty screen: collect every visible text line, image and picture box on screen,
    // split the screen below the header into 9 bands, and look for 5 or more blank bands in a row.
    const boxes = [];
    for (const el of document.querySelectorAll('body *')) {
      const isMedia = el.matches(MEDIA);
      const bgImg = !isMedia && /url\(/.test(getComputedStyle(el).backgroundImage) && !el.matches('.grain, [class*=grain], [class*=noise]');
      const textLeaf = !isMedia && hasOwnText(el);
      if (!isMedia && !bgImg && !textLeaf) continue;
      if (effOpacity(el) < 0.15) continue;
      const rects = textLeaf ? textRects(el) : [el.getBoundingClientRect()];
      for (const r of rects) if (r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < H && r.right > 0 && r.left < W && !(bgImg && r.width >= W * 0.98 && r.height >= H * 0.98 && effOpacity(el) < 0.3)) boxes.push(r);
    }
    const rows = [];
    for (let r = 0; r < 9; r++) {
      const top = H * (0.08 + r * 0.1), bottom = top + H * 0.1;
      rows.push(boxes.some((b) => b.bottom > top && b.top < bottom));
    }
    let run = 0, best = 0; rows.forEach((x) => { run = x ? 0 : run + 1; best = Math.max(best, run); });
    return best >= 5; // at least about half the screen blank in one band
  };;
  for (let y = 0; y <= maxY(); y += Math.round(H * 0.35)) {
    scrollTo(0, y); await sleep(1000);
    const emptyNow = isEmpty();
    for (const a of document.getAnimations()) { try { if (a.effect && a.effect.getComputedTiming().iterations !== Infinity) a.finish(); } catch (e) { /* skip */ } }
    await sleep(60);
    if (emptyNow && isEmpty()) emptyAt.push(Math.round(y));
    checkCovered(); checkTextClash(y); checkCrossing(); checkStickers(); checkTrackSlices(y);
    if (y === 0) { checkHero(); checkLayerRest(); }
    else checkLayerEdge(y);
    checkPhoneCrop();
    await checkPhotoContrast(y);
  }
  // Fine steps through pinned scenes: step changes overlap only briefly mid-crossfade.
  for (let y = 0; y <= maxY(); y += Math.round(H * 0.08)) {
    scrollTo(0, y);
    if (!pinnedAt()) continue;
    await sleep(140); checkTextClash(y); checkTrackSlices(y); checkProgressSync(y);
  }
  pe.remove();
  offsetLayers.forEach((v) => add('layer-off-at-rest', v.el, `at the top of the page this layer is already moved (${v.dx}px across, ${v.dy}px down, scale ${v.sc}) while it also has the load animation "${v.anim}": a scroll tween took its start from the half-finished load animation, so layers that should line up don't (e.g. a doubled horizon). Use gsap.fromTo with explicit start values (y: 0, yPercent: 0, scale: 1), or put the load animation on an inner wrapper. If the offset is deliberate, confirm by eye`));
  edgeShows.forEach((v, el) => v.shaded ? photoNotes.push(`${describe(el).slice(0, 60)}: this moving layer's ${v.side} edge comes inside its frame (${v.gap}px around scroll ${v.y}px) under a shade with a solid colour. Probably hidden; check by eye that no edge or stripe shows`) : add('layer-edge-shows', el, `this moving layer's ${v.side} edge comes into view inside its frame (a ${v.gap}px strip around scroll ${v.y}px), so the layers behind it show through: its image is no bigger than the frame it moves in. Make the layer taller than its frame by at least its travel (a taller asset with more ground below it, or an apron of shaded ground), and cap the travel in code at the measured overhang`));
  tightCrops.forEach((v, im) => {
    const msg = `on phones only ${v.pct}% of this photo's ${v.side} shows (object-fit: cover on a portrait screen)`;
    if (v.person) add('phone-crop-cuts-subject', im, `${msg}, and its alt text describes a person ("${(im.alt || '').slice(0, 50)}"): check they're actually in view. Give phones their own object-position aimed at the subject, or a portrait crop of the photo`);
    else photoNotes.push(`${describe(im).slice(0, 60)}: ${msg}. Fine for skies and landscapes; if it has a subject (a person, a product, a building), check it's in view on phones`);
  });
  if (heroWeak) add('hero-headline-weak', heroWeak.h1, `the hero headline is ${heroWeak.fs}px and fills ${heroWeak.pct}% of the first screen: make it the main event (about 64px or more on desktop, 36px on phones, roughly 5% of the screen), and show the site's concept in the first screen. Fine only for a deliberate image-led corner title (J); confirm by eye`);
  // One issue per section, with a few examples.
  const slicedBySection = new Map();
  sliced.forEach((y, el) => { const sec = el.closest('section') || document.body; if (!slicedBySection.has(sec)) slicedBySection.set(sec, []); slicedBySection.get(sec).push({ el, y }); });
  slicedBySection.forEach((list, sec) => add('track-slices-text', sec, `${list.length} piece(s) of text get sliced by the edge of the sliding window as it moves (e.g. ${list.slice(0, 3).map((v) => '"' + (v.el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24) + '" at ' + v.y + 'px').join(', ')}): snap from panel to panel, or fade each panel's text out before it reaches the edge (photos may cross the edge, text may not)`));
  syncOff.forEach((v) => add('progress-out-of-sync', v.el, `shows ${v.shows} while the panel on screen shows ${v.panels} (around scroll ${v.y}px): drive the clock, counter or label from the panel centred on screen`));
  crossing.forEach((v, h) => add('headline-half-crosses-image', h, `${v.pct < 50 ? 'only ' + v.pct + '% of a headline line sits over ' + v.what + ': a few letters across an image edge' : v.pct + '% of a headline line sits over ' + v.what + ' with its end sticking out: a line that nearly fits'} reads as a mistake, not a design. Cross decisively (whole words well inside) or keep the headline clear of the image${v.merge ? '. The frame is the same colour as the letters, so they merge where the frame runs through them' : ''}`));
  stickerNear.forEach((v, s) => add('sticker-crowds-action', s, `${v.gap < 0 ? 'overlaps' : 'sits ' + v.gap + 'px from'} the "${(v.a.innerText || v.a.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${v.a.tagName === 'BUTTON' ? 'button' : 'link'}: keep stickers and badges well away from buttons and links (at least 56px), and only where they add a fact that isn't already on screen`));
  // Below 3:1 is an issue at any size; small text between 3:1 and 4.5:1 is listed as borderline.
  const borderline = [];
  photoContrast.forEach((list, el) => list.forEach((v) => {
    const words = v.words.size ? '"' + [...v.words].join(' ') + '"' : 'part of the text';
    if (v.worst >= 3) { borderline.push(`${describe(el).slice(0, 50)} ${v.worst.toFixed(1)}:1 over ${v.label}`); return; }
    add('text-over-photo-contrast', el, `${words} is hard to read over ${v.label}${v.slide ? ' (' + v.slide + ')' : ''}: contrast ${v.worst.toFixed(1)}:1, needs at least 3:1${v.need > 3 ? ' (ideally 4.5:1 at this size)' : ''} (around scroll ${v.y}px). Move the text or re-crop the photo (object-position) so it sits on a calm, even area, or add a soft scrim behind the text on that photo`);
  }));
  if (borderline.length) photoNotes.push(`${borderline.length} small text element(s) over photos are borderline (3 to 4.5:1): readable, but lift them if it's easy (a touch more scrim or a re-crop): ${borderline.slice(0, 4).join('; ')}`);
  if (unreadable.size) photoNotes.push(`could not read the pixels of ${unreadable.size} photo(s) (other-site images): check text contrast over them by eye, e.g. ${[...unreadable].slice(0, 3).join(', ')}`);
  covered.forEach((im, h) => add('image-covers-headline', h, `${describe(im)} sits on top of the headline text at some scroll position. Keep images clear of headlines (unless this is a deliberate depth-sandwich hero, archetype D; confirm by eye)`));
  textClash.forEach((v, el) => add('text-overlaps-text', el, `overlaps "${v.other}" around scroll ${v.y}px (often a step change mid-crossfade): fade the outgoing text out before the incoming text fades in`));
  if (emptyAt.length) add('empty-screen', null, `screens at least half empty (after reveals have finished) at scroll ${emptyAt.slice(0, 5).join(', ')}px (a gap where a pinned section unpins, too much padding, or a washed-out frame in a scroll scene). Tighten the spacing or recompose that frame so the screen is never half blank`);
  scrollTo(0, maxY()); await sleep(300);

  // 2. Images that failed to load. Lazy images (including ones in hidden tabs or
  // carousels) are forced to load first, so only genuinely broken files are reported.
  for (const img of document.querySelectorAll('img')) {
    if (img.complete && img.naturalWidth > 0) continue;
    img.loading = 'eager';
    try { await Promise.race([img.decode(), sleep(4000)]); } catch (e) { /* checked below */ }
    if (img.complete && img.naturalWidth > 0) continue;
    const src = img.currentSrc || img.src;
    let status = 'no src';
    if (src) { try { status = (await fetch(src, { method: 'HEAD' })).status; } catch (e) { status = 'fetch failed'; } }
    add('broken-image', img, `${src} (${status})`);
  }

  // 3. Sideways scrolling.
  if (document.scrollingElement.scrollWidth > W + 1) {
    const wide = [...document.querySelectorAll('body *')].filter((el) => {
      const r = el.getBoundingClientRect(); return visible(el) && (r.right > W + 1 || r.left < -1);
    }).slice(0, 5);
    add('horizontal-overflow', null, `page is ${document.scrollingElement.scrollWidth}px wide at ${W}px; e.g. ${wide.map(describe).join('; ')}`);
  }

  // 4. Text clipped inside its own box.
  document.querySelectorAll('h1,h2,h3,h4,p,li,a,button,label,blockquote,figcaption,span').forEach((el) => {
    if (!visible(el) || !el.innerText.trim()) return;
    const s = getComputedStyle(el);
    const hides = /hidden|clip/.test(s.overflow + s.overflowX + s.overflowY) || s.textOverflow === 'ellipsis' || +s.webkitLineClamp > 0;
    if (!hides || !(el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2)) return;
    const truncates = s.textOverflow === 'ellipsis' || +s.webkitLineClamp > 0;
    const box = el.getBoundingClientRect();
    const spills = textRects(el).some((t) => t.bottom > box.bottom + 2 || t.top < box.top - 2 || t.right > box.right + 2 || t.left < box.left - 2);
    if (truncates || spills) add('clipped-text', el, 'text is cut off by its own box');
  });

  // 5. Content cut by an overflow-hidden ancestor (cards, slider handles, labels).
  document.querySelectorAll('button,a,img,[class*=card],[class*=handle],[class*=label],blockquote,figure').forEach((el) => {
    if (!visible(el)) return;
    const r = el.getBoundingClientRect();
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/hidden|clip/.test(s.overflow + s.overflowX + s.overflowY)) {
        const pr = p.getBoundingClientRect();
        const cut = r.left < pr.left - 1 || r.right > pr.right + 1 || r.top < pr.top - 1 || r.bottom > pr.bottom + 1;
        const fullyOut = r.right <= pr.left || r.left >= pr.right || r.bottom <= pr.top || r.top >= pr.bottom;
        // Ignore carousel items that are deliberately off-screen in a scroller.
        const scroller = /auto|scroll/.test(s.overflowX);
        const moved = (n) => { for (let q = n; q && q !== p; q = q.parentElement) { const t = getComputedStyle(q).transform; if (t && t !== 'none' && !/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(t)) return true; } return false; };
        const oversized = r.width >= pr.width * 1.04 || r.height >= pr.height * 1.04;
        const parallaxCrop = el.matches('img,picture,figure') && (oversized || moved(el));
        if (cut && !fullyOut && parallaxCrop) { notes.push(describe(el)); break; }
        if (cut && !fullyOut && !(scroller && el.matches('img,figure,[class*=card]'))) add('cut-by-container', el, `partly hidden by ${describe(p)}`);
        break;
      }
    }
  });

  flush.forEach((im, el) => add('text-flush-to-image', el, `text sits right against the edge of ${describe(im)} with no gap; give it a gutter (about 32px desktop, 20px mobile) or set it clearly on the image with a scrim`));
  collisions.forEach((im, h) => add('text-over-neighbour-image', h, `at some scroll position the heading's text sits over ${describe(im)}, which belongs to another panel or card. Keep each title inside its own panel at every stop (narrower title column, smaller size, or more gap between panels)`));

  // 6. Inline images or decorations sitting on top of headline text.
  document.querySelectorAll('h1,h2,h3').forEach((h) => {
    if (!visible(h)) return;
    const range = document.createRange(); range.selectNodeContents(h);
    const textRects = [...range.getClientRects()];
    h.querySelectorAll('img,svg,picture,span[style*=background],[class*=pill],[class*=inline]').forEach((m) => {
      if (!visible(m)) return;
      const mr = m.getBoundingClientRect();
      const mText = m.innerText ? m.innerText.trim() : '';
      if (mText) return;
      const hit = textRects.some((tr) => overlap(tr, mr) > 16 && !(tr.left >= mr.left && tr.right <= mr.right && tr.top >= mr.top && tr.bottom <= mr.bottom));
      if (hit) add('overlaps-headline', m, `covers letters in ${describe(h)}`);
    });
  });

  // 7. Fixed and sticky bars.
  const bars = [...document.querySelectorAll('body *')].filter((el) => {
    const p = getComputedStyle(el).position; return (p === 'fixed' || p === 'sticky') && visible(el);
  });
  const headerLike = (b) => { const r = b.getBoundingClientRect(); return r.top <= 2 && r.top > -r.height && r.height > 20 && r.height < H * 0.3 && r.width >= W * 0.5; };
  const isHeaderTag = (b) => b.matches('header, [role=banner], nav, [class*=header], [class*=nav]');
  const topBar = bars.filter(headerLike).sort((a, b) => (isHeaderTag(b) - isHeaderTag(a)) || (a.getBoundingClientRect().height - b.getBoundingClientRect().height))[0];
  const bottomBars = bars.filter((b) => b.getBoundingClientRect().bottom >= H - 2 && b.getBoundingClientRect().height < H / 3);

  // 7a. Sticky header covering section headings when jumping to them.
  if (topBar) {
    const headerH = topBar.getBoundingClientRect().bottom;
    for (const sec of document.querySelectorAll('section[id], main [id]')) {
      const heading = sec.querySelector('h1,h2,h3');
      if (!heading || !visible(heading)) continue;
      sec.scrollIntoView({ block: 'start' }); await sleep(150);
      const line = textRects(heading)[0] || heading.getBoundingClientRect();
      if (line.top < headerH - 2 && line.bottom > 0) add('header-covers-heading', heading, `heading text starts at ${Math.round(line.top)}px, under the ${Math.round(headerH)}px header, after jumping to #${sec.id} (add scroll-margin-top or more padding)`);
    }
  }

  // 7b. Bottom bars covering the end of the page.
  if (bottomBars.length) {
    scrollTo(0, maxY()); await sleep(250);
    const barTop = Math.min(...bottomBars.map((b) => b.getBoundingClientRect().top));
    const last = [...document.querySelectorAll('footer *, main > :last-child *')].filter((el) => visible(el) && el.children.length === 0 && el.innerText && el.innerText.trim());
    const covered = last.filter((el) => el.getBoundingClientRect().bottom > barTop + 2 && el.getBoundingClientRect().top < H && !bottomBars.some((b) => b.contains(el)));
    if (covered.length) add('bottom-bar-covers-content', covered[0], `the fixed bar at the bottom hides ${covered.length} element(s) at the end of the page; add bottom padding equal to the bar height`);
  }

  // 8. First screen: things cut in half by the bottom of the viewport.
  scrollTo(0, 0); await sleep(400);
  document.querySelectorAll('main *, header ~ * *').forEach((el) => {
    if (!visible(el) || bottomBars.some((b) => b.contains(el))) return;
    const r = el.getBoundingClientRect();
    const textish = el.matches('p,li,blockquote,figcaption,a,button,[class*=card],[class*=review],[class*=rating],[class*=trust],[class*=badge]');
    if (textish && r.height < H * 0.5 && r.top < H - 4 && r.bottom > H + 4) add('cut-by-fold', el, `straddles the bottom of the first screen (${Math.round(r.top)}px to ${Math.round(r.bottom)}px of ${H}px)`);
  });

  // 8b. Pure black text (a templated look; designs use a tinted charcoal around #333).
  const pureBlack = (c) => /^rgba?\(0,\s*0,\s*0(,\s*1)?\)$/.test(c.replace(/\s+/g, ' ').trim());
  const blackHits = [...document.querySelectorAll('h1,h2,h3,h4,p,li,a,button,blockquote,figcaption,label,span')]
    .filter((el) => visible(el) && el.innerText && el.innerText.trim() && pureBlack(getComputedStyle(el).color));
  const headingsInBlack = blackHits.filter((el) => /^H[1-3]$/.test(el.tagName));
  headingsInBlack.slice(0, 5).forEach((el) => add('pure-black-text', el, 'headline set in pure black #000; use the charcoal (about #333) from the design tokens'));
  if (blackHits.length > headingsInBlack.length) add('pure-black-text', blackHits.find((el) => !/^H[1-3]$/.test(el.tagName)), `${blackHits.length - headingsInBlack.length} other text element(s) in pure black #000`);

  // 8b2. Headings darker than charcoal (#333 is the house dark; anything below ~#2A2A2A reads heavy).
  const lum = (c) => {
    const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
    if (!m) return null;
    const ch = [m[1], m[2], m[3]].map((v) => { v = +v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const tooDark = [...document.querySelectorAll('h1,h2,h3')].filter((el) => {
    if (!visible(el) || !el.innerText.trim()) return false;
    const c = getComputedStyle(el).color; const L = lum(c);
    return L !== null && L > 0 && L < 0.022;
  });
  tooDark.slice(0, 5).forEach((el) => add('text-too-dark', el, `heading colour ${getComputedStyle(el).color} is darker than the charcoal house dark; use about #333 tinted to the palette`));

  // 8c. Headline wrapping: a word stranded alone on a line, or a hero headline
  // that breaks onto too many lines (usually a text column too narrow for the size).
  const headlineLines = (el) => {
    const words = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const re = /\S+/g; let m;
      while ((m = re.exec(node.data))) {
        const range = document.createRange();
        range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
        const rect = range.getClientRects()[0];
        if (rect && rect.width) words.push({ text: m[0], top: rect.top, h: rect.height });
      }
    }
    const lines = [];
    words.forEach((w) => {
      const line = lines.find((l) => Math.abs(l.top - w.top) < w.h * 0.5);
      if (line) line.words.push(w.text); else lines.push({ top: w.top, words: [w.text] });
    });
    return lines.sort((a, b) => a.top - b.top).map((l) => l.words);
  };
  [...document.querySelectorAll('h1,h2')].filter((el) => visible(el) && el.innerText.trim().split(/\s+/).length > 2).forEach((el) => {
    const lines = headlineLines(el);
    if (lines.length < 2) return;
    const lone = lines.filter((l) => l.length === 1);
    if (lone.length) add('headline-orphan', el, `${lines.length} lines; word(s) left alone on a line: ${lone.map((l) => '"' + l[0] + '"').join(', ')}. Widen the text column, lower the size, set explicit line breaks or text-wrap: balance`);
    const r = el.getBoundingClientRect();
    if (el.tagName === 'H1' && r.top < H && lines.length > (W < 600 ? 4 : 3)) add('headline-too-many-lines', el, `hero headline wraps onto ${lines.length} lines at ${W}px (max ${W < 600 ? 4 : 3})`);
  });

  // 8d. Maps that grab the scroll: an interactive map iframe (or Leaflet/Mapbox map)
  // that receives wheel and touch events while the visitor scrolls past it.
  const mapBoxes = [...document.querySelectorAll('[class*=map], [id*=map], iframe')].filter((el) => !el.closest('nav'));
  for (const m of mapBoxes.slice(0, 6)) { m.scrollIntoView({ block: 'center' }); await sleep(250); }
  document.querySelectorAll('iframe[loading=lazy]').forEach((f) => { f.loading = 'eager'; });
  await sleep(1200);
  document.querySelectorAll('iframe').forEach((f) => {
    const src = f.getAttribute('src') || f.getAttribute('data-src') || '';
    if (!/google\.[a-z.]+\/maps|maps\.google|openstreetmap\.org|mapbox|bing\.com\/maps|here\.com|what3words/i.test(src)) return;
    let el = f, blocked = false;
    while (el && el !== document.body) { if (getComputedStyle(el).pointerEvents === 'none') { blocked = true; break; } el = el.parentElement; }
    if (!blocked) add('map-traps-scroll', f, 'map iframe accepts the mouse wheel and swipes, so scrolling past it zooms the map instead of the page; start it at pointer-events: none behind a "Click to use the map" layer');
  });
  document.querySelectorAll('.leaflet-container, .mapboxgl-map, .maplibregl-map').forEach((m) => {
    if (m.dataset.scrollLocked === 'true') return;
    add('map-traps-scroll', m, 'Leaflet/Mapbox map found: confirm scroll-wheel zoom and one-finger drag are off (set data-scroll-locked="true" on the map element once they are)');
  });

  // 9. Same-page links that go nowhere.
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    const id = decodeURIComponent(a.getAttribute('href').slice(1));
    if (id && !document.getElementById(id)) add('broken-anchor', a, `#${id} does not exist`);
  });

  // 10. Before/after comparison widgets: which picture actually sits under each label.
  const BEFORE = /\bbefore\b/i, AFTER = /\bafter\b/i;
  const leafText = (el) => (el.children.length === 0 ? el.textContent.trim() : '');
  const pictureAt = (x, y, box) => {
    for (const el of document.elementsFromPoint(x, y)) {
      if (!box.contains(el)) continue;
      if (el.tagName === 'IMG') return { src: el.currentSrc || el.src, alt: el.alt || '' };
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none' && /url\(/.test(bg)) return { src: bg.replace(/^url\(["']?|["']?\)$/g, ''), alt: el.getAttribute('aria-label') || '' };
    }
    return null;
  };
  const candidates = [...document.querySelectorAll('section, figure, div')].filter((el) => {
    if (!visible(el)) return false;
    const t = el.innerText || '';
    return BEFORE.test(t) && AFTER.test(t) && el.querySelectorAll('img, [style*=background]').length >= 2 && el.getBoundingClientRect().height > 150;
  });
  const widgets = candidates.filter((el) => !candidates.some((o) => o !== el && el.contains(o)));
  const comparisons = [];
  for (const box of widgets.slice(0, 4)) {
    const labels = [...box.querySelectorAll('*')].filter((el) => visible(el) && /^(before|after)\b/i.test(leafText(el)) && leafText(el).length < 40);
    const before = labels.find((l) => BEFORE.test(leafText(l))), after = labels.find((l) => AFTER.test(leafText(l)));
    const picEls = [...box.querySelectorAll('img, [style*=background]')].filter(visible);
    if (!before || !after || !picEls.length) continue;
    // Centre the pictures themselves on screen so the sample points are inside the viewport.
    picEls[0].scrollIntoView({ block: 'center' }); await sleep(300);
    const pics = picEls.map((p) => p.getBoundingClientRect());
    const area = pics.reduce((a, r) => ({ left: Math.min(a.left, r.left), right: Math.max(a.right, r.right), top: Math.min(a.top, r.top), bottom: Math.max(a.bottom, r.bottom) }), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
    const midY = (area.top + area.bottom) / 2;
    const leftPic = pictureAt(area.left + (area.right - area.left) * 0.08, midY, box);
    const rightPic = pictureAt(area.left + (area.right - area.left) * 0.92, midY, box);
    const bx = before.getBoundingClientRect(), ax = after.getBoundingClientRect();
    const beforeIsLeft = bx.left + bx.width / 2 < ax.left + ax.width / 2;
    const underBefore = beforeIsLeft ? leftPic : rightPic, underAfter = beforeIsLeft ? rightPic : leftPic;
    const caption = (label) => { const n = label.nextElementSibling || label.parentElement.querySelector('p'); return n ? n.textContent.trim().slice(0, 120) : ''; };
    const entry = {
      widget: describe(box),
      beforeLabelSide: beforeIsLeft ? 'left' : 'right',
      beforeLabel: { side: beforeIsLeft ? 'left' : 'right', caption: caption(before), pictureShown: underBefore },
      afterLabel: { side: beforeIsLeft ? 'right' : 'left', caption: caption(after), pictureShown: underAfter },
      todo: 'Open each pictureShown.src on its own, describe what it actually shows, and confirm it matches its label and caption.',
    };
    comparisons.push(entry);
    const says = (p, re) => p && re.test(`${p.src} ${p.alt}`);
    const NEWISH = /after|new|finish|complete|done|renovat|restor/i, OLDISH = /before|old|worn|damag|original|moss|broken/i;
    if (says(underBefore, NEWISH) && !says(underBefore, OLDISH)) add('before-after-swapped', before, `the "Before" side shows ${underBefore.src} (${underBefore.alt || 'no alt'}), which looks like the after picture`);
    if (says(underAfter, OLDISH) && !says(underAfter, NEWISH)) add('before-after-swapped', after, `the "After" side shows ${underAfter.src} (${underAfter.alt || 'no alt'}), which looks like the before picture`);
    if (underBefore && underAfter && underBefore.src === underAfter.src) add('before-after-same-image', box, 'both sides show the same picture');
  }

  // 11. First-screen weight: what a phone's Lighthouse score waits for. Uses the browser's own record
  // of what loaded with the page (before the load event), so run the probe on the production build.
  {
    const nav = performance.getEntriesByType('navigation')[0];
    const loadEnd = nav && (nav.loadEventEnd || nav.domContentLoadedEventEnd);
    if (loadEnd) {
      const size = (e) => e.transferSize || e.encodedBodySize || 0;
      const kb = (b) => Math.round(b / 1024);
      const initial = performance.getEntriesByType('resource').filter((e) => e.startTime <= loadEnd);
      const fonts = initial.filter((e) => /\.(woff2?|ttf|otf)(\?|#|$)/i.test(e.name));
      const fontKB = kb(fonts.reduce((t, e) => t + size(e), 0));
      const scripts = initial.filter((e) => e.initiatorType === 'script' || /\.m?js(\?|$)/i.test(e.name));
      const jsKB = kb(scripts.reduce((t, e) => t + size(e), 0));
      const phone = W < 600;
      const firstPhotos = [...document.images].filter((im) => { const r = im.getBoundingClientRect(); return im.currentSrc && r.top + scrollY < H && r.width * r.height > W * H * 0.15 && effOpacity(im) > 0.5; });
      // Phones have dense screens (Lighthouse emulates about 1.75x), so judge the file a real phone picks
      // from the srcset, not the one this browser window happened to load.
      const phoneFile = async (im) => {
        const r = im.getBoundingClientRect(), need = r.width * 1.75;
        const sets = [im, ...(im.parentElement && im.parentElement.tagName === 'PICTURE' ? im.parentElement.querySelectorAll('source') : [])].map((x) => x.srcset).filter((ss) => ss && ss.includes(im.currentSrc.split('/').pop()));
        const cands = (sets[0] || '').split(',').map((c) => c.trim().split(/\s+/)).filter((c) => /w$/.test(c[1] || '')).map((c) => ({ url: new URL(c[0], location.href).href, w: parseInt(c[1], 10) })).sort((a, b) => a.w - b.w);
        const pick = cands.find((c) => c.w >= need) || cands[cands.length - 1];
        if (!pick || pick.url === im.currentSrc) return null;
        try { const res = await fetch(pick.url); return (await res.blob()).size; } catch (e) { return null; }
      };
      for (const im of firstPhotos) {
        const e = initial.find((x) => x.name === im.currentSrc); let k = e ? kb(size(e)) : 0;
        if (phone) { const pk = await phoneFile(im); if (pk) k = Math.max(k, kb(pk)); }
        if (phone && k > 60) add('first-screen-weight', im, `the first-screen photo is ${k}KB on a phone: re-encode the phone crop to 50KB or less (AVIF about 750px wide, quality around 50); it looks the same and is worth several Lighthouse points`);
        if (!phone && k > 250) add('first-screen-weight', im, `the first-screen photo is ${k}KB on desktop: aim for about 200KB or less (AVIF, quality around 50)`);
      }
      if (fontKB > 120) add('first-screen-weight', null, `${fonts.length} font files (${fontKB}KB) load with the page: use weight-only variable files (never the opsz optical-size file), drop italics the first screen doesn't use, and aim for about 100KB`);
      if (jsKB > 30) add('first-screen-weight', null, `${jsKB}KB of JavaScript loads with the page: import the motion and interaction code after the load event (a tiny script that calls import() on load) so the first screen never waits for it`);
    }
  }

  // Collapse duplicates and report.
  const seen = new Set();
  const unique = issues.filter((i) => { const k = i.type + i.where; if (seen.has(k)) return false; seen.add(k); return true; });
  root.style.setProperty('scroll-behavior', savedBehaviour[0]);
  document.body.style.setProperty('scroll-behavior', savedBehaviour[1]);
  if (window.lenis && typeof window.lenis.start === 'function') window.lenis.start();
  return {
    viewport: `${W}x${H}`,
    totals: unique.reduce((t, i) => { t[i.type] = (t[i.type] || 0) + 1; return t; }, {}),
    issues: unique.slice(0, 60),
    beforeAfter: comparisons.length ? comparisons : undefined,
    notes: notes.length || photoNotes.length ? [...(notes.length ? [`${notes.length} image(s) are oversized or moving inside a clipping frame (parallax or push-in crops). Not reported as issues: check by eye that each looks intended, e.g. ${notes.slice(0, 3).join('; ')}`] : []), ...photoNotes] : undefined,
  };
})();
