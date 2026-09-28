(() => {
  const root = document.documentElement;
  const isDesktop = root.classList.contains('is-desktop');
  const reduced = root.classList.contains('is-reduced');
  const phone = !matchMedia('(min-width: 821px)').matches;
  const variant = phone ? 'm' : 'd';

  /* ---------- Liens internes : défilement doux natif ---------- */
  const scrollToY = (y) => window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
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

  /* ---------- Le film ----------
     Un seul film continu (néon → artisan → trois box → stand de nuit → néon). Le défilement pilote sa position,
     la vidéo suit en douceur ; les textes, les fenêtres et la ligne de progression s'affichent par-dessus.
     Aux arrêts, quand on ne défile plus, une boucle d'ambiance prend le relais : vapeur, farine, fumée, foule. */
  const STOPS = [
    { id: 'intro', t: 0, hold: 0.7, show: ['intro'] },
    { id: 'artisan', t: 11, go: 2, hold: 0.6, show: ['artisan'], ambient: 'artisan', bed: 'cuisine' },
    { id: 'bolognese', t: 25.45, go: 2.6, hold: 0.6, show: ['bolognese'], ambient: 'bolognese' },
    { id: 'pesto', t: 37.2, go: 2.1, hold: 0.6, show: ['pesto'], ambient: 'pesto' },
    { id: 'pomodoro', t: 48.95, go: 2.1, hold: 0.6, show: ['pomodoro'], ambient: 'pomodoro' },
    { id: 'evenements', t: 56.8, go: 1.5, hold: 1.1, show: ['stand', 'evenements'], ambient: 'stand', bed: 'terrasse' },
    { id: 'histoire', t: 64.75, go: 1.5, hold: 0.9, show: ['histoire'] },
  ];
  // Sur téléphone, l'image occupe le haut de l'écran : le cadre se resserre sur la box, puis s'élargit pour l'enseigne
  const CROP = { full: [0, 1], artisan: [0.14, 0.72], box: [0.016, 0.72], stand: [0, 0.72] };
  const CROP_KEYS = [[0, 'full'], [7.94, 'artisan'], [13.81, 'artisan'], [19.69, 'box'], [49.06, 'box'], [56.94, 'stand'], [64.8, 'full']];

  const section = document.getElementById('immersion');
  const stage = section.querySelector('.stage');
  const media = document.getElementById('stageMedia');
  const introV = document.getElementById('introVideo');
  const filmV = document.getElementById('filmVideo');
  const ambV = document.getElementById('ambientVideo');
  const layers = Object.fromEntries([...section.querySelectorAll('[data-show]')].map((l) => [l.dataset.show, l]));
  const windows = [...section.querySelectorAll('.window')];
  const dots = [...document.querySelectorAll('.journey a')];
  const journeyFill = document.getElementById('journeyFill');
  const loadingEl = document.getElementById('filmLoading');
  const src = (name) => `assets/film/${variant}/${name}`;

  // Parcours : un trajet (le film avance) puis un arrêt (le film se tient), en hauteurs d'écran
  const PATH = [];
  let acc = 0;
  STOPS.forEach((s, i) => {
    if (i) { PATH.push({ start: acc, len: s.go, from: STOPS[i - 1].t, to: s.t }); acc += s.go; }
    s.start = acc; PATH.push({ start: acc, len: s.hold, stop: s, from: s.t, to: s.t }); acc += s.hold;
    // repère de navigation et point d'aimantation, un peu après le début de l'arrêt
    const m = section.querySelector(`[data-mark="${s.id}"]`);
    if (m) m.style.top = `calc(${i ? s.start + Math.min(0.3, s.hold / 2) : 0} * 100vh)`;
  });
  const total = acc;
  section.style.setProperty('--len', total);
  windows.forEach((w, i) => w.style.setProperty('--i', i));

  // 1 « hauteur d'écran » = 100vh CSS, mesurée : innerHeight varie quand la barre d'adresse de Safari se replie
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:100vh;visibility:hidden;pointer-events:none';
  section.appendChild(probe);
  let vh = probe.offsetHeight || innerHeight;

  const ease = (x) => x * x * (3 - 2 * x);
  const timeAt = (g) => {
    const p = PATH.find((it) => g < it.start + it.len) || PATH[PATH.length - 1];
    return p.from + (p.to - p.from) * Math.min(1, Math.max(0, (g - p.start) / p.len));
  };
  const cropAt = (t) => {
    let i = 0;
    while (i < CROP_KEYS.length - 2 && t > CROP_KEYS[i + 1][0]) i++;
    const [t0, a] = CROP_KEYS[i], [t1, b] = CROP_KEYS[i + 1];
    const k = ease(Math.min(1, Math.max(0, (t - t0) / (t1 - t0))));
    return [CROP[a][0] + (CROP[b][0] - CROP[a][0]) * k, CROP[a][1] + (CROP[b][1] - CROP[a][1]) * k];
  };

  // Mise en place de l'image : plein écran sur ordinateur ; sur téléphone, bande haute recadrée (une seule transformation, sans relayout)
  let SW = 0, SH = 0;
  const ANCHOR_Y = 0.75, NEON_BOTTOM = 0.7, BOX_RIGHT = 0.43;
  const layout = () => {
    SW = stage.clientWidth; SH = stage.clientHeight;
    if (!phone) {
      // repères dans l'image plein cadre : bas de l'enseigne (intro, histoire) et bord droit de la box du stand (fenêtres)
      const dw = Math.max(SW, SH / 9 * 16), dh = dw / 16 * 9;
      section.style.setProperty('--neon-b', `${Math.round((SH - dh) * ANCHOR_Y + dh * NEON_BOTTOM)}px`);
      section.style.setProperty('--win-left', `${Math.round((SW - dw) / 2 + dw * BOX_RIGHT + 20)}px`);
    }
  };
  let lastCrop = '';
  const placeMedia = (t) => {
    if (!phone) return;
    const [sx, sw] = cropAt(t);
    const s = 1 / sw, dh = SW * 9 / 16 * s, top = SH * 0.08 + Math.max(0, (SH * 0.52 - dh) / 2);
    const tr = `translate3d(${(-sx * SW * s).toFixed(1)}px, ${top.toFixed(1)}px, 0) scale(${s.toFixed(4)})`;
    if (tr !== lastCrop) { media.style.transform = tr; lastCrop = tr; }
  };

  /* Lecture du film : on télécharge le fichier en entier (les sauts sont alors instantanés), pendant que le néon s'allume */
  let filmReady = false, introDone = reduced, want = 0, shown = 0, g = 0, raf = 0, lastT = 0;
  // le film remplace l'intro quand il est prêt et que l'enseigne a fini de s'allumer (ou dès qu'on a quitté le début)
  const reveal = () => { if (filmReady && (introDone || g > 0.25)) section.classList.add('film-ready'); };
  // iPhone en mode économie d'énergie : les vidéos ne démarrent qu'après un premier geste ; on les « débloque » au premier toucher
  const unlock = () => {
    if (!introDone && introV.paused) introV.play().catch(() => {});
    [filmV, ambV].forEach((v) => { if (v.src && v.paused && !(v === ambV && ambOn)) v.play().then(() => { if (!(v === ambV && ambOn)) v.pause(); }).catch(() => {}); });
  };
  const loadFilm = () => {
    const url = src('film.mp4');
    const fallback = () => { filmV.src = url; filmV.preload = 'auto'; };
    if (!window.fetch || !window.ReadableStream || !window.URL) return fallback();
    fetch(url).then(async (r) => {
      if (!r.ok || !r.body) throw new Error(r.status);
      const size = +r.headers.get('content-length') || 0, reader = r.body.getReader(), parts = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value); got += value.length;
        if (size) loadingEl.style.setProperty('--p', (got / size).toFixed(3));
      }
      filmV.src = URL.createObjectURL(new Blob(parts, { type: 'video/mp4' }));
    }).catch(fallback);
  };
  filmV.addEventListener('loadeddata', () => {
    // Safari n'affiche les images d'une vidéo jamais lue qu'après un premier départ : lecture muette puis pause immédiate
    const ready = () => {
      filmV.pause();
      filmReady = true;
      filmV.currentTime = shown;
      reveal();
      schedule();
    };
    const p = filmV.play();
    if (p && p.then) p.then(ready, ready); else ready();
  }, { once: true });
  filmV.addEventListener('seeked', () => schedule());

  // Boucles d'ambiance : quand on s'arrête à une étape, la scène continue de vivre
  let ambName = null, ambOn = false, ambTimer = 0;
  const ambientStop = () => PATH.find((it) => it.stop && g >= it.start && g < it.start + it.len && it.stop.ambient)?.stop;
  const ambientPrepare = (s) => {
    if (!s || reduced || s.ambient === ambName) return;
    ambName = s.ambient;
    ambV.src = src(`loop-${s.ambient}.mp4`);
    ambV.preload = 'auto';
    ambV.load();
  };
  const ambientShow = () => {
    const s = ambientStop();
    if (!s || !filmReady || reduced || ambOn || !filmV.paused || Math.abs(filmV.currentTime - s.t) > 0.08) return;
    ambientPrepare(s);
    ambOn = true;
    ambV.currentTime = 0;
    const p = ambV.play();
    const reveal = () => { if (ambOn) section.classList.add('ambient-on'); };
    if (p && p.then) p.then(() => (ambV.readyState >= 3 ? reveal() : ambV.addEventListener('playing', reveal, { once: true })), () => { ambOn = false; });
  };
  const ambientHide = () => {
    if (!ambOn) return;
    ambOn = false;
    section.classList.remove('ambient-on');
    clearTimeout(ambTimer);
    ambTimer = setTimeout(() => { if (!ambOn) ambV.pause(); }, 450);
  };

  /* Rendu : la vidéo rejoint la position du défilement.
     Safari (iPhone, Mac) saute très vite d'une image à l'autre : on la déplace par petits sauts lissés.
     Chrome et Android sautent plus lentement : vers l'avant, on lit le film en accéléré juste ce qu'il faut pour rattraper
     le défilement (lecture continue, bien plus fluide), et on ne saute que pour revenir en arrière. */
  const webkit = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Android/.test(navigator.userAgent);
  const follow = !webkit && !reduced;
  const settle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(ambientShow, 350); };
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.1, lastT ? (now - lastT) / 1000 : 0.016); lastT = now;
    if (!filmReady) { shown = want; placeMedia(want); return; }
    const cur = filmV.currentTime, d = want - cur;
    if (follow && d > 0.045 && d < 4) {
      const rate = Math.min(8, Math.max(0.5, d / 0.28));
      if (Math.abs(filmV.playbackRate - rate) > 0.04) filmV.playbackRate = rate;
      if (filmV.paused) filmV.play().catch(() => {});
      shown = cur;
    } else {
      if (!filmV.paused) filmV.pause();
      const k = reduced ? 1 : 1 - Math.exp(-dt / (phone ? 0.07 : 0.08));
      shown += (want - shown) * k;
      if (Math.abs(want - shown) < 0.01) shown = want;
      if (!filmV.seeking && Math.abs(cur - shown) > 0.04) filmV.currentTime = shown;
    }
    placeMedia(filmV.currentTime);
    if (Math.abs(want - filmV.currentTime) > 0.045 || filmV.seeking) raf = requestAnimationFrame(frame);
    else { if (!filmV.paused) filmV.pause(); lastT = 0; settle(); }
  }
  let idleTimer = 0;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(frame); };
  if (location.search.includes('filmdebug')) window.__film = { get want() { return want; }, get shown() { return shown; }, get g() { return g; }, get ready() { return filmReady; }, film: filmV, amb: ambV };

  // Textes, fenêtres et ligne de progression, selon la position dans le parcours
  let lastStop = null;
  function update() {
    const r = section.getBoundingClientRect();
    g = Math.max(0, Math.min(total - 1e-6, -r.top / vh));
    const t = timeAt(g);
    if (t !== want) { want = t; ambientHide(); clearTimeout(idleTimer); }
    const visible = new Set();
    let current = STOPS[0];
    STOPS.forEach((s) => {
      if (g >= s.start - 0.5) current = s;
      if (g < s.start - 0.5 || g > s.start + s.hold + 0.05) return;
      const into = g - s.start;
      if (s.id === 'evenements' && phone) {
        // téléphone : le texte du stand à l'approche, puis les fenêtres en carrousel sur la scène animée
        if (into < 0.12) visible.add('stand');
        if (into > 0.08) visible.add('evenements');
      } else s.show.forEach((n) => visible.add(n));
    });
    Object.entries(layers).forEach(([name, el]) => el.classList.toggle('is-on', visible.has(name)));
    const winOn = visible.has('evenements');
    windows.forEach((w) => w.classList.toggle('is-on', winOn));
    document.body.classList.toggle('fab-off', winOn || visible.has('histoire'));
    if (current !== lastStop) {
      lastStop = current;
      dots.forEach((d) => d.classList.toggle('is-current', d.dataset.stop === current.id));
      if (current.bed) sound.setBed(current.bed);
    }
    journeyFill.style.setProperty('--x', Math.min(1, g / STOPS[STOPS.length - 1].start).toFixed(4));
    reveal();
    ambientPrepare(ambientStop() || STOPS.find((s) => s.ambient && g < s.start + s.hold && g > s.start - 1.2));
    schedule();
  }

  // Intro : l'enseigne s'allume seule au chargement ; le film prend le relais sur l'image de l'enseigne allumée
  introV.poster = src('intro-fin.webp');
  if (!reduced) {
    introV.src = src('intro.mp4');
    const done = () => { introDone = true; reveal(); };
    introV.addEventListener('ended', done, { once: true });
    introV.addEventListener('error', done, { once: true });
    const p = introV.play();
    if (p && p.catch) p.catch(done);
  }
  addEventListener('touchstart', unlock, { once: true, passive: true });
  addEventListener('pointerdown', unlock, { once: true });

  layout();
  update();
  if (document.readyState === 'complete') loadFilm(); else addEventListener('load', loadFilm, { once: true });
  addEventListener('resize', () => { vh = probe.offsetHeight || innerHeight; layout(); lastCrop = ''; placeMedia(shown); update(); });
  addEventListener('scroll', update, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) ambientHide(); });

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
    dialog.showModal();
  }));
  const closeDialog = () => dialog.close();
  $('eventClose').addEventListener('click', closeDialog);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) closeDialog(); });
  dialog.addEventListener('close', () => opener?.focus({ preventScroll: true }));
  $('eventCta').addEventListener('click', (e) => {
    e.preventDefault();
    const sel = document.querySelector('#bookForm select[name="type"]');
    if (sel && chosenType) sel.value = chosenType;
    dialog.close();
    scrollToY(contact.getBoundingClientRect().top + window.scrollY);
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
