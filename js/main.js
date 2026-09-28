(() => {
  const root = document.documentElement;
  const isDesktop = root.classList.contains('is-desktop');
  const reduced = root.classList.contains('is-reduced');
  const phone = !matchMedia('(min-width: 821px)').matches;

  /* ---------- Défilement fluide à la molette (ordinateur) ---------- */
  let lenis = null;
  if (isDesktop && !reduced && window.Lenis) {
    lenis = new Lenis({ lerp: 0.1 });
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }
  const scrollToY = (y, d = 1.6) => (lenis ? lenis.scrollTo(y, { duration: d }) : window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' }));
  document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    scrollToY(target.getBoundingClientRect().top + window.scrollY);
  }));

  /* ---------- Navigation, bouton flottant ---------- */
  const nav = document.getElementById('nav');
  const fab = document.getElementById('fab');
  const contact = document.getElementById('contact');
  const onScroll = () => {
    const y = window.scrollY;
    nav.classList.toggle('scrolled', y > innerHeight * 0.4);
    const c = contact.getBoundingClientRect();
    fab.classList.toggle('show', (!isDesktop || y > innerHeight * 0.8) && !(c.top < innerHeight * 0.85 && c.bottom > 0));
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Son d'ambiance : rien n'est préparé avant le premier clic ---------- */
  const sound = (() => {
    const toggle = document.getElementById('soundToggle');
    // Web Audio : sur iPhone, le volume d'un élément audio ne se règle pas ; le gain, lui, permet de vrais fondus
    let on = false, current = null, beds = null, ac = null;
    const make = (file, vol) => {
      const a = new Audio(`assets/sound/${file}.mp3`); a.loop = true; a.preload = 'none';
      const g = ac.createGain(); g.gain.value = 0;
      ac.createMediaElementSource(a).connect(g).connect(ac.destination);
      return { a, g, max: vol, timer: 0 };
    };
    const ensure = () => {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      if (!beds) beds = { cuisine: make('son-cuisine', 0.3), terrasse: make('son-terrasse', 0.3) };
    };
    const fade = (s, to, ms = 1400) => {
      clearTimeout(s.timer);
      if (to > 0 && s.a.paused) s.a.play().catch(() => {});
      const t = ac.currentTime;
      s.g.gain.cancelScheduledValues(t);
      s.g.gain.setValueAtTime(s.g.gain.value, t);
      s.g.gain.linearRampToValueAtTime(to, t + ms / 1000);
      if (to === 0) s.timer = setTimeout(() => s.a.pause(), ms + 60);
    };
    const setBed = (name) => { if (name === current) return; current = name; if (on) Object.entries(beds).forEach(([k, b]) => fade(b, k === name ? b.max : 0)); };
    toggle.addEventListener('click', () => {
      on = !on;
      toggle.setAttribute('aria-pressed', String(on));
      toggle.setAttribute('aria-label', on ? "Couper le son d'ambiance" : "Activer le son d'ambiance");
      if (on) { ensure(); const c = current; current = null; setBed(c || 'cuisine'); }
      else if (beds) Object.values(beds).forEach((b) => fade(b, 0, 500));
    });
    return { setBed };
  })();

  /* ---------- Le plan-séquence ----------
     Un seul film découpé en segments (images WebP), tous raccordés image pour image.
     « len » = longueur de défilement en hauteurs d'écran. Sur téléphone, le cadre se resserre
     progressivement sur la box (crop), puis s'élargit de nouveau pour l'enseigne. */
  const CROP = { full: [0, 1], artisan: [0.14, 0.72], box: [0.016, 0.72], stand: [0, 0.72] };
  const TIMELINE = [
    { seg: '00-neon', at: 'end', len: 0.9, crop: 'full', show: [['intro', 0, 0.75]], mark: 'intro' },
    { seg: '01-neon-artisan', len: 1.5, crop: ['full', 'artisan'] },
    { seg: '02-farine', len: 1.4, crop: 'artisan', show: [['artisan', 0.1, 0.9]], mark: 'artisan', bed: 'cuisine' },
    { seg: '03-farine-bolognese', len: 1.0, crop: ['artisan', 'box'] },
    { seg: '04-bolognese', len: 1.3, crop: 'box', show: [['bolognese', 0.08, 0.9]], mark: 'bolognese' },
    { seg: '05-vers-pesto', len: 0.9, crop: 'box' },
    { seg: '06-pesto', len: 1.3, crop: 'box', show: [['pesto', 0.08, 0.9]], mark: 'pesto' },
    { seg: '07-vers-pomodoro', len: 0.9, crop: 'box' },
    { seg: '08-pomodoro', len: 1.3, crop: 'box', show: [['pomodoro', 0.08, 0.9]], mark: 'pomodoro' },
    { seg: '09-vers-stand', len: 1.5, crop: ['box', 'stand'], show: [['stand', 0.6, 1]], bed: 'terrasse' },
    // téléphone : le texte du stand d'abord, puis les fenêtres en carrousel ; ordinateur : les deux ensemble
    { seg: '09-vers-stand', at: 'end', len: 3.2, crop: 'stand', show: phone ? [['stand', 0, 0.3], ['evenements', 0.26, 0.97]] : [['stand', 0, 0.97], ['evenements', 0.02, 0.97]], mark: 'evenements', windows: phone ? [0.3, 0.04] : [0.06, 0.13] },
    { seg: '10-vers-neon', len: 1.4, crop: ['stand', 'full'] },
    { seg: '10-vers-neon', at: 'end', len: 1.6, crop: 'full', show: [['histoire', 0.08, 1]], mark: 'histoire' },
  ];

  const section = document.getElementById('immersion');
  const canvas = document.getElementById('seqCanvas');
  const ctx = canvas.getContext('2d');
  const layers = Object.fromEntries([...section.querySelectorAll('[data-show]')].map((l) => [l.dataset.show, l]));
  const windows = [...section.querySelectorAll('.window')];
  const variant = phone ? 'm' : 'd';
  let counts = null, W = 0, H = 0, drawn = null, frameReq = 0;
  // 1 « hauteur d'écran » = 100vh CSS, mesurée une fois : innerHeight varie quand la barre d'adresse de Safari se replie
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:100vh;visibility:hidden;pointer-events:none';
  section.appendChild(probe);
  let vh = probe.offsetHeight || innerHeight;
  let cur = { seg: '00-neon', f: 0, crop: CROP.full };
  const total = TIMELINE.reduce((s, it) => s + it.len, 0);

  // hauteur du parcours et repères de navigation
  section.style.setProperty('--len', total);
  let acc = 0;
  TIMELINE.forEach((it) => { it.start = acc; acc += it.len; if (it.mark) { const m = section.querySelector(`[data-mark="${it.mark}"]`); if (m) m.style.top = `calc(${it.start} * 100vh + ${it.mark === 'intro' ? 0 : 1}px)`; } });

  const src = (seg, i) => `assets/seq/${seg}/${variant}/${String(i + 1).padStart(3, '0')}.webp`;
  /* Chargement : chaque image est téléchargée une fois (fichier compressé gardé en mémoire), puis décodée hors du fil
     principal (createImageBitmap) seulement autour de la position courante. Le défilement n'attend jamais un décodage.
     Mémoire (iPhone) : on ne garde que les fichiers du segment courant, du précédent et des deux suivants. */
  const SEGS = [...new Set(TIMELINE.map((it) => it.seg))];
  const AHEAD = 12, BEHIND = 4, MAX_DECODING = 4;
  const files = {};          // segment -> { blobs, left, ctrl }
  const bitmaps = new Map(); // index global -> { seg, i, bmp } décodée, ou promesse en cours
  let decoding = 0;
  const decodeBlob = window.createImageBitmap
    ? (b) => createImageBitmap(b)
    : (b) => new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = ko; im.src = URL.createObjectURL(b); });
  const release = (bmp) => { if (bmp && bmp.close) bmp.close(); };
  const isReady = (v) => v && !(v instanceof Promise);
  const load = (seg) => {
    if (!counts || !seg || files[seg]) return;
    const n = counts[seg];
    const entry = files[seg] = { blobs: [], left: n, ctrl: window.AbortController ? new AbortController() : null };
    [...new Set([0, n - 1, ...Array.from({ length: n }, (_, i) => i)])].forEach((i) => {
      const arrived = (blob) => {
        if (files[seg] !== entry) return;
        if (blob) entry.blobs[i] = blob;
        if (--entry.left === 0) update(); else want();
      };
      fetch(src(seg, i), entry.ctrl ? { signal: entry.ctrl.signal } : {})
        .then((r) => (r.ok ? r.blob() : null))
        .then(arrived, () => arrived(null));
    });
  };
  const evict = (seg) => {
    const k = SEGS.indexOf(seg);
    SEGS.forEach((s, j) => {
      if ((j >= k - 1 && j <= k + 2) || !files[s]) return;
      if (files[s].ctrl) files[s].ctrl.abort();
      delete files[s];
    });
  };
  // Vitesse du parcours (images par seconde, lissée) : quand on défile vite, on décode moins d'images mais plus loin devant,
  // pour que l'image affichée suive toujours le défilement sans à-coups.
  let vel = 0, lastG = 0, lastT = 0;
  const track = (g, it) => {
    const now = performance.now();
    if (lastT && it.at !== 'end') { const inst = (g - lastG) / Math.max(16, now - lastT) * 1000 * counts[it.seg] / it.len; vel = vel * 0.6 + inst * 0.4; }
    else if (it.at === 'end') vel = 0;
    lastG = g; lastT = now;
  };
  // Toutes les images du film sont numérotées à la suite (index global) : les raccords entre segments se préparent comme le reste.
  const base = {};
  const locate = (G) => { for (const sg of SEGS) { if (G >= base[sg] && G < base[sg] + counts[sg]) return [sg, G - base[sg]]; } return null; };
  const MAX_KEEP = phone ? 30 : 36;
  // images à décoder, par priorité : la courante, puis devant sur une grille stable (une sur 1, 2, 4 ou 8 selon la vitesse),
  // puis les voisines immédiates et quelques-unes derrière. La grille ne bouge pas quand on avance : rien n'est décodé pour rien.
  const plan = () => {
    const G = base[cur.seg] + cur.f;
    const v = performance.now() - lastT < 250 ? vel : 0, dir = v < 0 ? -1 : 1, sp = Math.abs(v);
    const stride = sp < 18 ? 1 : sp < 40 ? 2 : sp < 80 ? 4 : 8;
    const order = [G];
    let j = dir > 0 ? Math.floor(G / stride) * stride + stride : Math.ceil(G / stride) * stride - stride;
    for (let s = 0; s < AHEAD; s++, j += dir * stride) order.push(j);
    for (let s = 1; s <= 2; s++) order.push(G + dir * s);
    for (let s = 1; s <= BEHIND; s++) order.push(G - dir * s * stride);
    return { G, order, lo: dir > 0 ? G - BEHIND * stride - 2 : G - AHEAD * stride - 2, hi: dir > 0 ? G + AHEAD * stride + 2 : G + BEHIND * stride + 2 };
  };
  function want() {
    if (!counts) return;
    const { G, order, lo, hi } = plan();
    // libère ce qui sort de la zone utile, puis, au-delà du plafond, les images les plus éloignées
    bitmaps.forEach((v, key) => { const g = +key; if (g < lo || g > hi) { if (isReady(v)) release(v.bmp); bitmaps.delete(key); } });
    if (bitmaps.size > MAX_KEEP) {
      [...bitmaps.keys()].sort((x, y) => Math.abs(y - G) - Math.abs(x - G)).slice(0, bitmaps.size - MAX_KEEP)
        .forEach((key) => { const v = bitmaps.get(key); if (isReady(v)) release(v.bmp); bitmaps.delete(key); });
    }
    for (const g of order) {
      if (decoding >= MAX_DECODING) break;
      if (bitmaps.has(g)) continue;
      const pos = locate(g); if (!pos) continue;
      const [sg, i] = pos, blob = files[sg] && files[sg].blobs[i];
      if (!blob) continue;
      decoding++;
      const job = decodeBlob(blob)
        .then((bmp) => {
          if (bitmaps.get(g) !== job) { release(bmp); return; }
          bitmaps.set(g, { seg: sg, i, bmp });
          if (sg === cur.seg) schedule();
        }, () => bitmaps.delete(g))
        .finally(() => { decoding--; want(); });
      bitmaps.set(g, job);
    }
  }
  // l'image voulue si elle est prête, sinon la plus proche déjà décodée du même segment
  const pick = () => {
    let best = null, bd = Infinity;
    bitmaps.forEach((v) => { if (isReady(v) && v.seg === cur.seg) { const d = Math.abs(v.i - cur.f); if (d < bd) { bd = d; best = v; } } });
    return best;
  };
  if (location.search.includes('seqdebug')) window.__seq = { get cur() { return cur; }, bitmaps, files, get decoding() { return decoding; }, get vel() { return vel; } };

  function draw() {
    frameReq = 0;
    const found = pick();
    if (!found || !W) return;
    const im = found.bmp, key = found.seg + found.i + cur.crop.join();
    if (key === drawn) return;
    const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
    ctx.fillStyle = '#0c0a09';
    ctx.fillRect(0, 0, W, H);
    if (phone) {
      // téléphone : zone recadrée, pleine largeur, dans la moitié haute de l'écran
      const [sx, sw] = cur.crop;
      const sW = iw * sw, sX = iw * sx, dh = W * ih / sW;
      const top = H * 0.08, room = H * 0.52, y = top + Math.max(0, (room - dh) / 2);
      ctx.drawImage(im, sX, 0, sW, ih, 0, y, W, dh);
      // bords haut et bas fondus dans le noir de la page : l'image n'a pas de cadre visible
      for (const [a, b] of [[y, y + dh * 0.14], [y + dh, y + dh * 0.8]]) {
        const grad = ctx.createLinearGradient(0, a, 0, b);
        grad.addColorStop(0, '#0c0a09'); grad.addColorStop(1, 'rgba(12, 10, 9, 0)');
        ctx.fillStyle = grad; ctx.fillRect(0, Math.min(a, b) - 1, W, Math.abs(b - a) + 2);
      }
    } else {
      // ordinateur : l'image couvre tout l'écran, plein cadre
      const s = Math.max(W / iw, H / ih), dw = iw * s, dh = ih * s;
      ctx.drawImage(im, (W - dw) / 2, (H - dh) * ANCHOR_Y, dw, dh);
    }
    drawn = key;
  }
  const schedule = () => { if (!frameReq) frameReq = requestAnimationFrame(draw); };
  // repères dans l'image plein cadre (ordinateur) : bas de l'enseigne néon (70 % de la hauteur) pour placer l'intro et l'histoire,
  // bord droit de la box sur le comptoir du stand (43 % de la largeur) pour que les fenêtres ne la recouvrent pas
  const ANCHOR_Y = 0.75, NEON_BOTTOM = 0.7, BOX_RIGHT = 0.43;
  const placeMarks = (cw, ch) => {
    const dw = Math.max(cw, ch / 9 * 16), dh = dw / 16 * 9;
    section.style.setProperty('--neon-b', `${Math.round((ch - dh) * ANCHOR_Y + dh * NEON_BOTTOM)}px`);
    section.style.setProperty('--win-left', `${Math.round((cw - dw) / 2 + dw * BOX_RIGHT + 20)}px`);
  };
  const resize = () => {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, phone ? 1.5 : 2);
    if (!phone) placeMarks(r.width, r.height);
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (w === W && h === H) return;
    W = canvas.width = w; H = canvas.height = h; drawn = null; schedule();
  };

  const ease = (t) => t * t * (3 - 2 * t);
  const lerpCrop = (a, b, t) => [a[0] + (b[0] - a[0]) * ease(t), a[1] + (b[1] - a[1]) * ease(t)];
  let introDone = reduced, introFrame = 0;

  function update() {
    if (!counts) return;
    const r = section.getBoundingClientRect();
    const g = Math.max(0, Math.min(total - 1e-6, -r.top / vh)); // position dans le parcours, en hauteurs d'écran
    const idx = TIMELINE.findIndex((it) => g >= it.start && g < it.start + it.len);
    const it = TIMELINE[Math.max(0, idx)];
    const p = (g - it.start) / it.len;
    const n = counts[it.seg];
    let f = it.at === 'end' ? n - 1 : Math.round(Math.min(1, p) * (n - 1));
    if (it.seg === '00-neon' && !introDone) f = introFrame; // l'allumage se joue seul au chargement
    const crop = Array.isArray(it.crop) ? lerpCrop(CROP[it.crop[0]], CROP[it.crop[1]], p) : CROP[it.crop];
    cur = { seg: it.seg, f, crop };
    track(g, it);
    // télécharge le segment courant, puis les deux suivants une fois le précédent complet
    const k = SEGS.indexOf(it.seg), done = (sg) => files[sg] && files[sg].left === 0;
    load(it.seg);
    if (done(it.seg)) load(SEGS[k + 1]);
    if (done(SEGS[k + 1])) load(SEGS[k + 2]);
    if (k > 0 && done(it.seg)) load(SEGS[k - 1]);
    evict(it.seg);
    want();
    // textes et fenêtres intégrés à la scène
    const visible = new Set();
    (it.show || []).forEach(([name, a, b]) => { if (p >= a && p <= b) visible.add(name); });
    Object.entries(layers).forEach(([name, el]) => el.classList.toggle('is-on', visible.has(name)));
    if (it.windows) windows.forEach((w, i) => w.classList.toggle('is-on', p > it.windows[0] + i * it.windows[1]));
    else windows.forEach((w) => w.classList.remove('is-on'));
    document.body.classList.toggle('fab-off', visible.has('evenements') || visible.has('histoire'));
    if (it.bed) sound.setBed(it.bed);
    schedule();
  }

  // Allumage du néon : 4 s d'images jouées seules au chargement, puis la main passe au défilement
  const playIntro = () => {
    if (reduced) { introFrame = counts['00-neon'] - 1; update(); return; }
    const n = counts['00-neon'], fps = 12, t0 = performance.now() + 500;
    const tick = (t) => {
      introFrame = Math.max(0, Math.min(n - 1, Math.floor((t - t0) / 1000 * fps)));
      update();
      if (introFrame < n - 1 && !introDone) requestAnimationFrame(tick); else { introDone = true; update(); }
    };
    requestAnimationFrame(tick);
  };

  fetch('assets/seq/manifest.json').then((r) => r.json()).then((m) => {
    counts = m;
    let acc2 = 0;
    SEGS.forEach((sg) => { base[sg] = acc2; acc2 += counts[sg]; });
    resize();
    update();
    playIntro();
  });
  addEventListener('resize', () => { vh = probe.offsetHeight || innerHeight; resize(); update(); });
  addEventListener('scroll', () => { if (window.scrollY > 10) introDone = true; update(); }, { passive: true });

  /* ---------- Fenêtres d'événements : le détail s'ouvre au clic ---------- */
  const EVENTS = {
    festival: { kicker: 'Festivals', title: 'Des milliers de personnes, <em>une file qui avance.</em>', img: 'festival', type: 'Festival',
      text: "Grosses affluences et longues soirées : on dimensionne le nombre de postes avec vous, pour servir chaud et vite du premier concert au dernier.",
      facts: ["Jusqu'à 150 portions par heure et par poste", 'Postes ajoutés selon la fréquentation', 'Pasta Box qui se mange debout, à une main'] },
    marathon: { kicker: 'Marathons & tournois', title: "Le repas d'après l'effort, <em>prêt à l'arrivée.</em>", img: 'marathon', type: 'Marathon / course',
      text: "Un plat de pâtes chaud pour les participants, les bénévoles et les supporters. Les quantités se prévoient à l'avance avec l'organisation.",
      facts: ['Service rapide aux heures de pointe', 'Trois sauces, dont une vegan', 'Quantités calées sur les inscriptions'] },
    entreprise: { kicker: 'Entreprises & B2B', title: 'Afterworks, séminaires, <em>portes ouvertes.</em>', img: 'entreprise', type: 'Entreprise / B2B',
      text: "Un stand qui cuisine devant vos équipes et vos invités : simple à accueillir, convivial, et chacun choisit sa sauce.",
      facts: ['Installation discrète, intérieur ou extérieur', 'Carte courte, adaptée aux régimes', 'Devis selon le nombre de convives'] },
    fete: { kicker: 'Fêtes communales & marchés', title: 'Une grande tablée <em>de quartier.</em>', img: 'fete-communale', type: 'Fête communale / marché',
      text: "Des familles, des voisins, toutes les générations : une box généreuse à prix accessible, servie sans attente.",
      facts: ['Portions pour les petits et les grands', 'Stand autonome, rapide à installer', 'Pâtes artisanales de Genève, sauces préparées en Suisse'] },
    prive: { kicker: 'Événements privés', title: 'Mariages, anniversaires, <em>fêtes de famille.</em>', img: 'prive', type: 'Événement privé',
      text: "Un repas chaleureux et sans chichis pour vos invités, dans votre jardin ou votre salle.",
      facts: ['Formule adaptée au nombre d’invités', 'Bolognese halal, Pesto végétarien, Pomodoro vegan', "Emplacement, électricité et eau : on fait le point avec vous avant l'événement"] },
  };
  const dialog = document.getElementById('eventDialog');
  const $ = (id) => document.getElementById(id);
  let opener = null, chosenType = null;
  windows.forEach((w) => w.addEventListener('click', () => {
    const d = EVENTS[w.dataset.event];
    opener = w; chosenType = d.type;
    $('eventKicker').textContent = d.kicker;
    $('eventTitle').innerHTML = d.title;
    $('eventText').textContent = d.text;
    $('eventFacts').innerHTML = d.facts.map((f) => `<li>${f}</li>`).join('');
    $('eventImg').src = `assets/fenetres/${d.img}.webp`;
    $('eventImg').alt = d.kicker;
    if (lenis) lenis.stop();
    dialog.showModal();
  }));
  const closeDialog = () => dialog.close();
  $('eventClose').addEventListener('click', closeDialog);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) closeDialog(); });
  dialog.addEventListener('close', () => { if (lenis) lenis.start(); opener?.focus({ preventScroll: true }); });
  $('eventCta').addEventListener('click', (e) => {
    e.preventDefault();
    const sel = document.querySelector('#bookForm select[name="type"]');
    if (sel && chosenType) sel.value = chosenType;
    dialog.close();
    scrollToY(contact.getBoundingClientRect().top + window.scrollY, 1.2);
  });

  /* ---------- Formulaire : email pré-rempli ---------- */
  const form = document.getElementById('bookForm');
  const out = document.getElementById('formOut');
  const text = document.getElementById('formText');
  const mail = document.getElementById('formMail');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const d = Object.fromEntries(new FormData(form));
    const date = d.date ? new Date(d.date + 'T12:00').toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' }) : 'à définir';
    const body = [
      "Bonjour Pasta Mo',", '',
      'Nous aimerions vous faire venir à notre événement.', '',
      `Type : ${d.type}`, `Date : ${date}`, `Lieu : ${d.lieu || 'à préciser'}`, `Personnes (estimation) : ${d.personnes || 'à définir'}`, '',
      d.message ? d.message + '\n' : '', d.nom, d.email,
    ].join('\n');
    text.textContent = body;
    mail.href = `mailto:malik@pastamo.ch?subject=${encodeURIComponent(`Événement · ${d.type} · ${date}`)}&body=${encodeURIComponent(body)}`;
    out.hidden = false;
  });
  document.getElementById('formCopy').addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText(text.textContent); e.target.textContent = 'Copié'; }
    catch { e.target.textContent = 'Sélectionnez le texte ci-dessus'; }
  });
})();
