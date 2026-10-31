// Unshite My Site: AI slop probe. Paste into the page (or run with Playwright's page.evaluate) at 1440x900.
// Looks for the things that make a website read as "made by AI": the purple gradient, emoji icons,
// one generic font, three identical cards, stock hero, cliché copy, placeholder content and so on.
// It is async: it first scrolls slowly through the page so lazy images and scroll-reveal sections
// load (slow sites included), returns to the top, then checks.
// Resolves with { score, grade, findings: [{ type, title, points, count, examples, fix }] }.
// Every finding is a lead: confirm it on screen before changing anything.
(async () => {
  const W = window.innerWidth, H = window.innerHeight;
  if (!W || !H) return { error: 'The window is 0x0 (hidden or minimised). Set a real size (1440x900) and run again.' };

  // ---------- warm-up: load the whole page before judging it ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const started = Date.now();
  if (document.readyState !== 'complete') await Promise.race([new Promise((r) => addEventListener('load', r, { once: true })), sleep(15000)]);
  if (window.lenis && typeof window.lenis.stop === 'function') window.lenis.stop();
  const root = document.documentElement, savedBehaviour = root.style.getPropertyValue('scroll-behavior');
  root.style.setProperty('scroll-behavior', 'auto', 'important');
  const pendingImages = () => [...document.images].filter((im) => !im.complete && im.getBoundingClientRect().top < H * 1.5 && im.getBoundingClientRect().bottom > -H * 0.5);
  for (let y = 0; y < root.scrollHeight - H && Date.now() - started < 25000; y += Math.round(H * 0.6)) {
    scrollTo(0, y);
    await sleep(350);
    const waitFor = pendingImages();
    if (waitFor.length) await Promise.race([Promise.all(waitFor.map((im) => im.decode().catch(() => {}))), sleep(2000)]);
  }
  scrollTo(0, root.scrollHeight); await sleep(600);
  scrollTo(0, 0); await sleep(700);
  root.style.setProperty('scroll-behavior', savedBehaviour);
  if (window.lenis && typeof window.lenis.start === 'function') window.lenis.start();

  const findings = [];
  const add = (type, title, points, examples, fix, count) => {
    findings.push({ type, title, points, count: count ?? examples.length, examples: examples.slice(0, 5), fix });
  };

  // ---------- helpers ----------
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  // Any CSS colour to sRGB {r,g,b,a}. Tailwind 4 (Lovable, Bolt, v0) reports colours as oklch(),
  // so anything that isn't rgb() is painted on a 1px canvas and read back.
  const COLOR_FN = /(?:rgba?|hsla?|hwb|oklch|oklab|lch|lab|color)\([^()]*\)|#[0-9a-f]{3,8}\b/gi;
  const pix = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const colourCache = new Map();
  const rgb = (c) => {
    c = (c || '').trim();
    if (!c || c === 'transparent' || c === 'none') return null;
    if (colourCache.has(c)) return colourCache.get(c);
    let out = null;
    const m = c.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+)(%?))?\s*\)/);
    if (m) out = { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : m[5] ? +m[4] / 100 : +m[4] };
    else if (pix && CSS.supports('color', c)) {
      pix.clearRect(0, 0, 1, 1); pix.fillStyle = c; pix.fillRect(0, 0, 1, 1);
      const d = pix.getImageData(0, 0, 1, 1).data;
      out = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    }
    colourCache.set(c, out);
    return out;
  };
  const hsl = ({ r, g, b }) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: h * 60, s, l };
  };
  const colorsIn = (str) => (str.match(COLOR_FN) || []).map(rgb).filter(Boolean);
  const label = (el) => {
    const t = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50);
    const tag = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : '');
    return t ? `${tag} "${t}"` : tag;
  };
  const textEls = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,a,button,span,blockquote,figcaption,label,td,th,dd,dt')]
    .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1) && visible(el));
  const bodyText = (document.body.innerText || '').replace(/\s+/g, ' ');
  const sections = [...document.querySelectorAll('main > section, main > div > section, body > section, section')].filter((s) => visible(s) && s.getBoundingClientRect().height > 120);
  const headings = [...document.querySelectorAll('h1,h2,h3')].filter(visible);
  const h1 = document.querySelector('h1');

  // ---------- 1. Pure black text ----------
  // pure black, or the near-black defaults (Tailwind slate-900 #0F172A, gray-900 #111827, #111): darker than about #2A2A2A
  const black = textEls.filter((el) => { const c = rgb(getComputedStyle(el).color); return c && c.a > 0.9 && Math.max(c.r, c.g, c.b) <= 44 && hsl(c).l < 0.16; });
  const isPure = (el) => { const c = rgb(getComputedStyle(el).color); return Math.max(c.r, c.g, c.b) <= 12; };
  if (black.length >= 3) add('black-text', black.some(isPure) ? 'Pure black text' : 'Near-black default text', 8, black.map(label),
    'Jet black (#000), or the near-black every template uses (#0F172A, #111827, #111), looks templated on a light page. Use a charcoal around #333, tinted slightly to the palette (warm #36302C, cool #2F3237), for headings and body.', black.length);

  // ---------- 2. The purple / indigo AI gradient ----------
  const isAiHue = (c) => { const { h, s, l } = hsl(c); return s > 0.35 && l > 0.2 && l < 0.8 && h >= 235 && h <= 320; };
  const gradEls = [];
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    if (!/gradient/.test(s.backgroundImage)) continue;
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const textClip = /text/.test(s.webkitBackgroundClip || s.backgroundClip || '');
    if (!textClip && r.width * r.height < W * H * 0.04) continue; // only big areas, or gradient text
    const cs = colorsIn(s.backgroundImage).filter((c) => c.a > 0.25);
    const ai = cs.filter(isAiHue).length;
    if (ai >= 1 && cs.length >= 2) gradEls.push(el);
  }
  if (gradEls.length) add('ai-gradient', 'The purple/indigo AI gradient', Math.min(14, 8 + gradEls.length * 2), gradEls.map(label),
    'The violet-to-blue (or purple-to-pink) gradient is the most recognisable AI default. Replace it with one colour taken from the business itself (its materials, place or product) and a quieter background: a photograph, a texture or a flat tinted neutral.', gradEls.length);

  // ---------- 3. Gradient text ----------
  const gradText = headings.filter((el) => { const s = getComputedStyle(el); return /gradient/.test(s.backgroundImage) && /text/.test(s.webkitBackgroundClip || s.backgroundClip || ''); });
  const gradTextInner = [...document.querySelectorAll('h1 *, h2 *')].filter((el) => { const s = getComputedStyle(el); return visible(el) && /gradient/.test(s.backgroundImage) && /text/.test(s.webkitBackgroundClip || s.backgroundClip || ''); });
  const gt = [...new Set([...gradText, ...gradTextInner])];
  if (gt.length) add('gradient-text', 'Gradient-filled headline words', 6, gt.map(label),
    'Rainbow or gradient-filled headline words are an AI landing-page cliché. Set the headline in one solid colour and get emphasis from size, weight or a line break instead.', gt.length);

  // ---------- 4. Emoji used as icons ----------
  const emojiRe = /\p{Extended_Pictographic}/u;
  const emojiEls = [...document.querySelectorAll('h1,h2,h3,h4,h5,li,button,a,span,div,p')]
    .filter((el) => visible(el) && [...el.childNodes].some((n) => n.nodeType === 3 && emojiRe.test(n.textContent)) && !el.closest('footer'));
  if (emojiEls.length >= 2) add('emoji-icons', 'Emoji used as icons or decoration', Math.min(12, 6 + emojiEls.length), emojiEls.map(label),
    'Emoji (🚀 ✨ ⚡ 💡 ✅) in headings, feature cards and buttons are a strong AI tell. Use a small set of matching line icons (one stroke width, one style), or no icons at all: a strong heading often does the job better.', emojiEls.length);

  // ---------- 5. One generic font everywhere ----------
  const GENERIC = /^(inter|roboto|poppins|open sans|montserrat|lato|arial|helvetica|helvetica neue|segoe ui|system-ui|-apple-system|blinkmacsystemfont|ui-sans-serif|sans-serif|nunito|nunito sans|dm sans|manrope|plus jakarta sans|geist)$/i;
  const fam = (el) => (getComputedStyle(el).fontFamily.split(',')[0] || '').replace(/["']/g, '').trim();
  const headFam = h1 ? fam(h1) : (headings[0] ? fam(headings[0]) : '');
  const bodyEl = [...document.querySelectorAll('p')].find(visible) || document.body;
  const bodyFam = fam(bodyEl);
  if (headFam && GENERIC.test(headFam) && headFam.toLowerCase() === bodyFam.toLowerCase())
    add('generic-font', `One default font for everything (${headFam})`, 8, [`headings and body both in ${headFam}`],
      `${headFam} for every heading and every paragraph is what most AI builders default to. Pair a display font with character (chosen for the business: a sturdy slab for a trade, an elegant serif for a spa) with a plain, readable body font.`, 1);
  // the "elegant" pairing AI reaches for whenever a business sounds upmarket (bakeries, spas, florists, salons)
  const DEFAULT_SERIF = /^(playfair display|playfair|cormorant garamond|cormorant|lora|merriweather|libre baskerville|dm serif display)$/i;
  const PLAIN_BODY = /^(lato|open sans|source sans pro|source sans 3|raleway)$/i;
  if (headFam && DEFAULT_SERIF.test(headFam) && (GENERIC.test(bodyFam) || PLAIN_BODY.test(bodyFam)))
    add('default-pairing', `The default "elegant" font pair (${headFam} with ${bodyFam})`, 6, [`headings in ${headFam}, body in ${bodyFam}`],
      `${headFam} with ${bodyFam} is the pairing AI picks whenever a business sounds upmarket, so every AI bakery, spa and florist looks the same. Choose a display face for this business in particular (its era, its place, its craft) and test it against your logo.`, 1);

  // ---------- 5b. The default indigo / violet accent ----------
  const btns = [...document.querySelectorAll('a, button')].filter((x) => visible(x) && x.getBoundingClientRect().height >= 32 && (x.innerText || '').trim().length > 1 && (x.innerText || '').trim().length < 40);
  const filled = btns.filter((x) => { const c = rgb(getComputedStyle(x).backgroundColor); return c && c.a >= 0.8 && hsl(c).s > 0.3; });
  // indigo/violet, or Tailwind's own vivid default blue (#2563EB, #1D4ED8 and the Tailwind 4 versions)
  const indigo = filled.filter((x) => {
    const { h, s: sat, l } = hsl(rgb(getComputedStyle(x).backgroundColor));
    return (h >= 238 && h <= 275 && sat > 0.5 && l > 0.3 && l < 0.7) || (h >= 215 && h < 238 && sat > 0.78 && l > 0.38 && l < 0.6);
  });
  if (indigo.length >= 2 && indigo.length >= filled.length * 0.5)
    add('default-accent', 'The default blue, indigo or violet button colour', 5, indigo.map(label),
      'Tailwind\'s vivid default blue and the indigo/violet family (#2563EB, #4F46E5, #6366F1, #7C3AED) are the colours AI tools reach for first. Choose an accent from the business itself (its van, its materials, its place) and check it against your text colours.', indigo.length);

  // ---------- 6. Three (or more) identical cards in a row ----------
  const grids = [];
  for (const parent of document.querySelectorAll('body *')) {
    const kids = [...parent.children].filter(visible);
    // a real numbered list (<ol>) of steps is the fix this check recommends, not the problem
    if (kids.length < 3 || kids.length > 9 || parent.tagName === 'OL') continue;
    const rs = kids.map((k) => k.getBoundingClientRect());
    // one row of 3+, or a grid of rows of 3+ (six cards in 3x2 count too)
    const rows = new Set(rs.map((r) => Math.round(r.top / 6)));
    const sameRow = rows.size <= Math.floor(kids.length / 3);
    const sameSize = rs.every((r) => Math.abs(r.width - rs[0].width) < 6 && Math.abs(r.height - rs[0].height) < 24);
    if (!sameRow || !sameSize || rs[0].width < 160 || rs[0].width > W * 0.45) continue;
    // an icon, an emoji or a number label ("01", "[02]", "3.") above a heading and a line of text
    const cardLike = kids.every((k) => k.querySelector('h2,h3,h4,strong') && k.querySelector('p') && (k.querySelector('svg,img,i,[class*=icon]') || emojiRe.test(k.textContent.slice(0, 6)) || /^\s*\[?\d{1,2}\]?[.)]?\s/.test(k.innerText || '')));
    if (cardLike && !grids.some((g) => g.contains(parent) || parent.contains(g))) grids.push(parent);
  }
  if (grids.length) add('identical-cards', 'Rows of identical icon (or number) + heading + text cards', grids.length >= 2 ? 9 : 5,
    grids.map((g) => `${label(g)} (${g.children.length} cards)`),
    'Three identical cards (icon, heading, two lines) is the default AI section, and repeating it down the page makes every section look the same. Vary the layout: a list with numbers, a split with a photo, one big feature and two small ones, or a short paragraph.', grids.length);

  // ---------- 7. Everything centred ----------
  const h2s = [...document.querySelectorAll('h2')].filter(visible);
  const centred = h2s.filter((h) => getComputedStyle(h).textAlign === 'center');
  const h1Centred = h1 && getComputedStyle(h1).textAlign === 'center';
  if ((h2s.length >= 4 && centred.length / h2s.length >= 0.8) || (h2s.length === 3 && centred.length === 3 && h1Centred)) add('all-centred', 'Every section heading centred', 6, [`${centred.length} of ${h2s.length} section headings centred`],
    'When every section is a centred heading over a centred block, the page has no rhythm. Left-align most sections, keep centred type for one or two statements, and use asymmetric layouts (text on one side, image on the other).', 1);

  // ---------- 8. Stock hero (centred headline on a gradient, two buttons, no picture) ----------
  if (h1) {
    const hero = h1.closest('section, header, [class*=hero], main > div') || h1.parentElement;
    const hr = hero.getBoundingClientRect();
    const centredH1 = getComputedStyle(h1).textAlign === 'center';
    const hasPicture = [...hero.querySelectorAll('img, picture, video, canvas, svg')].some((m) => { const r = m.getBoundingClientRect(); return visible(m) && r.width * r.height > hr.width * hr.height * 0.12; }) ||
      [...hero.querySelectorAll('*'), hero].some((e) => /url\(/.test(getComputedStyle(e).backgroundImage) && e.getBoundingClientRect().width > W * 0.4);
    const buttons = [...hero.querySelectorAll('a, button')].filter((b) => visible(b) && b.getBoundingClientRect().height >= 36 && (b.innerText || '').trim().length < 30);
    if (centredH1 && !hasPicture && buttons.length >= 2) add('stock-hero', 'The stock AI hero', 8, [`${label(h1)}, centred, ${buttons.length} buttons, no photo`],
      'A centred headline, a grey sub-line and two buttons on a plain or gradient background is the hero every AI tool makes. Show the business: a real photograph of the work, the place or the product, with the headline placed deliberately against it.', 1);
    // the little "New: ..." pill above the headline
    const before = [...hero.querySelectorAll('a, span, div, p')].filter((e) => {
      if (!visible(e) || e.contains(h1)) return false;
      const r = e.getBoundingClientRect(), hr1 = h1.getBoundingClientRect();
      const st = getComputedStyle(e);
      return r.bottom <= hr1.top + 4 && hr1.top - r.bottom < 60 && r.height < 44 && r.width < 420 && parseFloat(st.borderRadius) >= 12 && (e.innerText || '').trim().length > 3;
    });
    if (before.length) add('hero-pill', 'A little pill badge above the headline', 4, before.map(label),
      'The rounded "✨ New: ..." pill above the headline is copied from startup templates. Drop it, or turn it into a plain eyebrow line if it says something real.', before.length);
  }

  // ---------- 9. Glass and glow ----------
  let glass = 0, glow = 0; const ggEx = [];
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    if (/blur\(/.test(s.backdropFilter || s.webkitBackdropFilter || '') && !el.closest('header, nav')) { glass++; if (ggEx.length < 5) ggEx.push('glass: ' + label(el)); }
    if (s.boxShadow && s.boxShadow !== 'none') {
      const m = s.boxShadow.match(/(?:rgba?|oklch|oklab|lch|lab|hsla?|color)\([^()]*\)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/);
      const c = colorsIn(s.boxShadow)[0];
      if (m && c && +m[3] >= 24 && hsl(c).s > 0.45 && c.a > 0.2) { glow++; if (ggEx.length < 5) ggEx.push('glow: ' + label(el)); }
    }
  }
  if (glass + glow >= 4) add('glass-glow', 'Frosted glass and coloured glows', 6, ggEx,
    'Frosted-glass cards and neon glows everywhere date a site instantly. Keep at most one (the header is fine) and let the content sit on solid surfaces with quiet shadows.', glass + glow);

  // ---------- 10. Cliché AI copy ----------
  const CLICHES = [
    /\belevate your\b/i, /\bunlock (?:the|your)\b/i, /\bseamless(?:ly)?\b/i, /\bempower(?:s|ing)?\b/i, /\brevolutioni[sz]e/i, /\btransform your\b/i,
    /\bin today'?s fast[- ]paced\b/i, /\bcutting[- ]edge\b/i, /\bsupercharge\b/i, /\bunleash\b/i, /\bgame[- ]chang/i, /\bnext[- ]level\b/i,
    /\btake your [\w\s]{1,20} to the next level\b/i, /\bdiscover the power of\b/i, /\bworld[- ]class\b/i, /\bembark on\b/i, /\bdelve\b/i,
    /\bunparalleled\b/i, /\bstate[- ]of[- ]the[- ]art\b/i, /\btailored solutions?\b/i, /\bone[- ]stop shop\b/i, /\bhassle[- ]free\b/i,
    /\bwe(?:'re| are) passionate about\b/i, /\byour journey\b/i, /\bharness the power\b/i, /\bin the realm of\b/i, /\ba testament to\b/i,
    /\bnavigat(?:e|ing) the (?:complex|ever)/i, /\bever[- ]evolving\b/i, /\bbespoke solutions?\b/i, /\bleverag(?:e|ing)\b/i, /\bsynerg/i,
    /\bcrafted with (?:passion|love|care)\b/i, /\bthe finest (?:ingredients|quality|materials)\b/i, /\bmade with love\b/i, /\blook no further\b/i, /\bwe'?ve got you covered\b/i,
    /\byour trusted partner\b/i, /\bexceed(?:ing)? your expectations\b/i, /\bpeace of mind\b/i, /\bcommitted to excellence\b/i, /\bstreamline your\b/i,
  ];
  const hits = [];
  for (const re of CLICHES) { const m = bodyText.match(re); if (m) hits.push(`"${m[0]}"`); }
  if (hits.length >= 2) add('cliche-copy', 'AI-sounding copy', Math.min(14, hits.length * 2), hits,
    'Words like "elevate", "seamless", "unlock" and "cutting-edge" are what AI writes when it knows nothing about the business. Replace each with something specific and true: what you actually do, for whom, where, how fast, for how much.', hits.length);

  // ---------- 11. Placeholder content ----------
  const PLACEHOLDER = [/\blorem ipsum\b/i, /\bdolor sit amet\b/i, /\byour company\b/i, /\bcompany name\b/i, /\bacme\b/i, /\bexample\.com\b/i, /\bjohn doe\b/i, /\bjane (?:doe|smith)\b/i, /\b123 main st/i, /\b123 [a-z]+ (?:street|st|road|rd|avenue|ave|lane|way|drive)\b/i, /\b90210\b/, /\b(?:anytown|sweet town|sample town|your city|city, state)\b/i, /\(555\)\s?\d/, /\byour (?:email|name) here\b/i, /\[[A-Z][A-Za-z ]{2,30}\]/];
  const ph = [];
  for (const re of PLACEHOLDER) { const m = bodyText.match(re); if (m) ph.push(`"${m[0]}"`); }
  const placeholderLinks = [...document.querySelectorAll('a[href="#"], a[href=""], a:not([href])')].filter((a) => visible(a) && (a.innerText || '').trim().length > 1);
  if (placeholderLinks.length >= 3) ph.push(`${placeholderLinks.length} links that go nowhere (href="#"), e.g. ${label(placeholderLinks[0])}`);
  if (ph.length) add('placeholder', 'Placeholder content left in', Math.min(14, 6 + ph.length * 2), ph,
    'Lorem ipsum, "Your Company", John Doe, (555) numbers and links that go nowhere tell visitors nobody checked the site. Replace every one with the real thing, or remove it.', ph.length);

  // ---------- 12. Vague, round-number stats ----------
  const STAT = /\b(\d{1,3}(?:[,.]\d{3})*\+?|\d+k\+|\d{2,3}%)\s+(happy (?:customers|clients)|satisfied (?:customers|clients)|satisfaction|customers served|projects (?:completed|delivered)|uptime)\b/gi;
  const stats = [...new Set((bodyText.match(STAT) || []).map((s) => `"${s}"`))];
  if (stats.length >= 2) add('vague-stats', 'Round-number stats that may not be true', 4, stats,
    '"10,000+ happy customers" and "99% satisfaction" are the numbers AI makes up. Keep a stat only if it is real and you can stand behind it; otherwise use one specific fact ("Fitting boilers in Harrogate since 2012").', stats.length);

  // ---------- 13. Same section shape over and over ----------
  const shapes = sections.map((s) => {
    const h = s.querySelector('h2'); const grid = grids.some((g) => s.contains(g));
    return (h && getComputedStyle(h).textAlign === 'center' ? 'C' : 'L') + (grid ? 'G' : '') + (s.querySelector('img,picture,video') ? 'I' : '');
  });
  let run = 1, best = 1;
  for (let i = 1; i < shapes.length; i++) { run = shapes[i] === shapes[i - 1] && shapes[i].includes('C') ? run + 1 : 1; best = Math.max(best, run); }
  if (best >= 3) add('repeating-sections', 'The same section layout, again and again', 6, [`${best} sections in a row with the same centred layout`],
    'When three or more sections in a row share one layout (centred heading, then a grid), the page reads like a template. Give each section a shape that suits its job: a list, a split, a quote, a gallery, a form.', best);

  // ---------- 14. Not one photograph ----------
  // AI builders can't photograph the work, the place or the people, so they leave photos out (or use icons).
  const photoMedia = [...document.querySelectorAll('img, picture, video, canvas')].filter((m) => {
    if (m.tagName === 'IMG' && /\.svg(?:[?#]|$)/i.test(m.currentSrc || m.src || '')) return false;
    const r = m.getBoundingClientRect(); return r.width >= 160 && r.height >= 120;
  }).length;
  const photoBgs = [...document.querySelectorAll('body *')].filter((e) => {
    const bg = getComputedStyle(e).backgroundImage;
    if (!/url\(/.test(bg) || /\.svg/i.test(bg)) return false;
    const r = e.getBoundingClientRect(); return r.width >= 240 && r.height >= 160;
  }).length;
  if (photoMedia + photoBgs === 0 && sections.length >= 2) add('no-photos', 'Not one photograph', 8, ['no photos or videos anywhere on the page'],
    'A business site with no photographs at all is the clearest sign nobody went there with a camera. Add real photos of the work, the place, the product or the people (even good phone photos beat none), and let at least one lead the first screen.', 1);

  // ---------- 14b. The same photo over and over ----------
  // AI builders fill a product grid by reusing the few photos they have. Carousel and marquee
  // clones (aria-hidden, "duplicate", "clone") are copies by design, so they don't count.
  const bySrc = new Map();
  for (const im of document.images) {
    const src = (im.currentSrc || im.src || '').split(/[?#]/)[0];
    if (!src || /\.svg$/i.test(src) || im.closest('[aria-hidden=true], [class*=duplicate], [class*=clone], [class*=marquee]')) continue;
    const r = im.getBoundingClientRect();
    if (r.width < 120 || r.height < 90) continue;
    bySrc.set(src, (bySrc.get(src) || 0) + 1);
  }
  const reused = [...bySrc].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
  const reusedTotal = reused.reduce((t, [, n]) => t + n, 0);
  if (reused.length) add('repeated-images', 'The same photo used again and again', reusedTotal >= 10 ? 10 : 8,
    reused.map(([src, n]) => `${src.split('/').pop()} shown ${n} times`),
    'Showing the same few photos on different products (or services) tells visitors the pictures are filler, and they can\'t see what they\'d actually be buying. Give every item its own photo, even a plain phone shot on a clean background.', reusedTotal);

  // ---------- 15. The AI builder's own badge ----------
  const BADGE = /\b(?:edit|made|built|created|powered) (?:with|in|by) (?:lovable|bolt(?:\.new)?|v0|replit|base44)\b/i;
  const BADGE_HREF = /lovable\.dev|bolt\.new|v0\.(?:dev|app)|base44\.com|replit\.com\/refer/i;
  const badges = [...document.querySelectorAll('a, div, span, button, [id*=badge]')].filter((e) => {
    if (!visible(e) || e.getBoundingClientRect().height > 80) return false;
    const t = (e.innerText || '').trim();
    return (BADGE.test(t) && t.length < 60) || (BADGE_HREF.test(e.getAttribute('href') || '') && t.length < 40) || /^(?:lovable|bolt)-badge/i.test(e.id || '');
  }).filter((e, i, all) => !all.some((o) => o !== e && o.contains(e)));
  if (badges.length) add('builder-badge', "The AI builder's badge is still on", 6, badges.map(label),
    'An "Edit with Lovable" (or Bolt, v0, Replit) badge tells every visitor the site came out of an AI builder in an afternoon. Remove it: the builder\'s paid plan or a setting turns it off.', badges.length);

  // ---------- did the page actually load? ----------
  // A page still showing loading placeholders, an error, or almost no text can't be judged:
  // the score would only measure the empty frame. Say so instead of passing it.
  const incomplete = [];
  const skeletons = [...document.querySelectorAll('[class*=skeleton], [class*=animate-pulse], [aria-busy=true], [class*=shimmer], [class*=placeholder-glow]')]
    .filter((e) => visible(e) && e.getBoundingClientRect().width >= 60 && e.getBoundingClientRect().height >= 12);
  if (skeletons.length >= 3) incomplete.push(`${skeletons.length} grey loading placeholders are still showing (the content behind them never arrived)`);
  const ERROR_TEXT = /\b(?:something went wrong|failed to (?:load|fetch)|error loading|application error|overloaded|please (?:try again|retry)|unexpected error|service unavailable|could not load|try again later)\b/i;
  const errEl = [...document.querySelectorAll('h1,h2,h3,p,div,span,[role=alert],[role=status]')].find((e) => visible(e) && e.children.length < 4 && ERROR_TEXT.test(e.innerText || '') && (e.innerText || '').length < 200);
  if (errEl) incomplete.push(`the page shows an error: "${(errEl.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 80)}"`);
  const words = bodyText.split(' ').filter((w) => /\w/.test(w)).length;
  if (words < 80) incomplete.push(`only ${words} words on the page`);

  // ---------- score ----------
  const lost = findings.reduce((n, f) => n + f.points, 0);
  const score = Math.max(0, 100 - lost);
  const grade = score >= 85 ? 'Looks designed' : score >= 65 ? 'A few AI tells' : score >= 40 ? 'Looks AI-made' : 'AI slop';
  findings.sort((a, b) => b.points - a.points);
  return { score, grade, viewport: `${W}x${H}`, url: location.href, findings, incomplete: incomplete.length ? incomplete : undefined };
})();
