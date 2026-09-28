(() => {
  const root = document.documentElement;
  const isDesktop = root.classList.contains('is-desktop');
  const reduced = root.classList.contains('is-reduced');
  const phone = !matchMedia('(min-width: 821px)').matches;
  const variant = phone ? 'm' : 'd';

  /* ---------- Défilement doux natif ---------- */
  const scrollToY = (y) => window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });

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
     Un seul film continu (néon → artisan → trois box → stand de nuit → néon), découpé en sept étapes.
     Un geste suffit pour passer à l'étape suivante (défilement, glissement, flèche, « Suivant », clic sur une étape) :
     le mouvement de caméra se joue alors tout seul, puis la scène continue de vivre en boucle (farine, vapeur, fumée).
     Revenir en arrière se fait par un fondu rapide. */
  const STOPS = [
    { id: 'intro', t: 0, show: ['intro'] },
    { id: 'artisan', t: 11, show: ['artisan'], ambient: 'artisan', bed: 'cuisine' },
    { id: 'bolognese', t: 25.45, show: ['bolognese'], ambient: 'bolognese' },
    { id: 'pesto', t: 37.2, show: ['pesto'], ambient: 'pesto' },
    { id: 'pomodoro', t: 48.95, show: ['pomodoro'], ambient: 'pomodoro' },
    { id: 'evenements', t: 56.8, show: ['evenements'], ambient: 'stand', bed: 'terrasse' },
    { id: 'histoire', t: 64.75, show: ['histoire'] },
  ];
  // Vitesse de lecture selon le passage du film : déplacements de caméra rapides, gestes sur les box plus posés
  const PACE = [[0, 3.4], [7.94, 1.6], [11, 2.6], [13.81, 3.4], [19.69, 2.6], [25.56, 3.4], [31.44, 2.6], [37.31, 3.4], [43.19, 2.6], [49.06, 3.2], [56.94, 3.2]];
  const paceAt = (t) => { let r = PACE[0][1]; for (const [t0, v] of PACE) if (t >= t0) r = v; return r; };
  // Sur téléphone, l'image occupe le haut de l'écran : le cadre se resserre sur la box, puis s'élargit pour l'enseigne
  const CROP = { full: [0, 1], artisan: [0.14, 0.72], box: [0.016, 0.72], stand: [0, 0.72] };
  const CROP_KEYS = [[0, 'full'], [7.94, 'artisan'], [13.81, 'artisan'], [19.69, 'box'], [49.06, 'box'], [56.94, 'stand'], [64.8, 'full']];

  const section = document.getElementById('immersion');
  const stage = section.querySelector('.stage');
  const media = document.getElementById('stageMedia');
  const introV = document.getElementById('introVideo');
  const filmV = document.getElementById('filmVideo');
  const ambV = document.getElementById('ambientVideo');
  const steps = [...section.querySelectorAll('.step')];
  const layers = Object.fromEntries([...section.querySelectorAll('[data-show]')].map((l) => [l.dataset.show, l]));
  const windows = [...section.querySelectorAll('.window')];
  const dots = [...document.querySelectorAll('.journey a')];
  const journeyFill = document.getElementById('journeyFill');
  const loadingEl = document.getElementById('filmLoading');
  const nextBtn = document.getElementById('nextStep');
  // numéro de version : à changer à chaque nouveau film, pour que les navigateurs ne gardent pas l'ancien en cache
  const FILM_V = '3';
  const src = (name) => `assets/film/${variant}/${name}?v=${FILM_V}`;
  windows.forEach((w, i) => w.style.setProperty('--i', i));

  const ease = (x) => x * x * (3 - 2 * x);
  const cropAt = (t) => {
    let i = 0;
    while (i < CROP_KEYS.length - 2 && t > CROP_KEYS[i + 1][0]) i++;
    const [t0, a] = CROP_KEYS[i], [t1, b] = CROP_KEYS[i + 1];
    const k = ease(Math.min(1, Math.max(0, (t - t0) / (t1 - t0))));
    return [CROP[a][0] + (CROP[b][0] - CROP[a][0]) * k, CROP[a][1] + (CROP[b][1] - CROP[a][1]) * k];
  };

  // Mise en place de l'image : plein écran sur ordinateur ; sur téléphone, bande haute recadrée (une seule transformation, sans relayout)
  let SW = 0, SH = 0;
  const ANCHOR_Y = 0.75, NEON_BOTTOM = 0.7, BOX_RIGHT = 0.43, FRAME_X = 0.88;
  const layout = () => {
    SW = stage.clientWidth; SH = stage.clientHeight;
    if (phone) {
      // bas de la bande d'image (cadre serré sur la box) : le nom de l'étape se pose juste dessous
      const dh = SW * 9 / 16 / 0.72, top = SH * 0.08 + Math.max(0, (SH * 0.52 - dh) / 2);
      section.style.setProperty('--band-b', `${Math.round(top + dh * 0.86)}px`);
    } else {
      // repères dans l'image plein cadre : bas de l'enseigne (intro, histoire) et bord droit de la box du stand (fenêtres)
      const dw = Math.max(SW, SH / 9 * 16), dh = dw / 16 * 9;
      section.style.setProperty('--neon-b', `${Math.round((SH - dh) * ANCHOR_Y + dh * NEON_BOTTOM)}px`);
      section.style.setProperty('--win-left', `${Math.round((SW - dw) * FRAME_X + dw * BOX_RIGHT + 20)}px`);
    }
  };
  let lastCrop = '';
  const placeMedia = (t) => {
    if (!phone) return;
    const [sx, sw] = cropAt(t);
    // l'enseigne (cadre large) se cale en haut, la box (cadre serré) se centre dans la moitié haute
    const s = 1 / sw, dh = SW * 9 / 16 * s, f = Math.min(1, (1 - sw) / 0.28);
    const top = SH * 0.08 + Math.max(0, (SH * 0.52 - dh) / 2) * f;
    const tr = `translate3d(${(-sx * SW * s).toFixed(1)}px, ${top.toFixed(1)}px, 0) scale(${s.toFixed(4)})`;
    if (tr !== lastCrop) { media.style.transform = tr; lastCrop = tr; }
  };

  /* Lecture du film : on télécharge le fichier en entier (les sauts sont alors instantanés), pendant que le néon s'allume */
  let filmReady = false, introDone = reduced, S = 0, T = 0, want = 0, shown = 0, raf = 0, lastT = 0, cutting = false;
  // le film remplace l'intro quand il est prêt et que l'enseigne a fini de s'allumer (ou dès qu'on a quitté le début)
  const reveal = () => { if (filmReady && (introDone || S > 0)) section.classList.add('film-ready'); };
  // iPhone en mode économie d'énergie : les vidéos ne démarrent qu'après un premier geste ; on les « débloque » au premier toucher
  const unlock = () => {
    if (!introDone && introV.paused) introV.play().catch(() => {});
    [filmV, ambV].forEach((v) => { if (v.src && v.paused && !(v === ambV && ambOn)) v.play().then(() => { if (!(v === ambV && ambOn) && !(v === filmV && want !== T)) v.pause(); }).catch(() => {}); });
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
      filmV.currentTime = shown = want;
      reveal();
      schedule();
    };
    const p = filmV.play();
    if (p && p.then) p.then(ready, ready); else ready();
  }, { once: true });
  filmV.addEventListener('seeked', () => schedule());

  // Boucles d'ambiance : arrivé à une étape, la scène continue de vivre
  let ambName = null, ambOn = false, ambTimer = 0, idleTimer = 0;
  const ambientPrepare = (s) => {
    if (!s || !s.ambient || reduced || s.ambient === ambName || ambOn) return;
    ambName = s.ambient;
    ambV.src = src(`loop-${s.ambient}.mp4`);
    ambV.preload = 'auto';
    ambV.load();
  };
  const ambientShow = () => {
    const s = STOPS[S];
    if (!s.ambient || !filmReady || reduced || ambOn || cutting || want !== T || !filmV.paused || Math.abs(filmV.currentTime - T) > 0.08) return;
    ambientPrepare(s);
    ambOn = true;
    ambV.currentTime = 0;
    const p = ambV.play();
    const show = () => { if (ambOn) section.classList.add('ambient-on'); };
    if (p && p.then) p.then(() => (ambV.readyState >= 3 ? show() : ambV.addEventListener('playing', show, { once: true })), () => { ambOn = false; });
  };
  const ambientHide = () => {
    clearTimeout(idleTimer);
    if (!ambOn) return;
    ambOn = false;
    section.classList.remove('ambient-on');
    clearTimeout(ambTimer);
    ambTimer = setTimeout(() => { if (!ambOn) ambV.pause(); }, 450);
  };

  // Textes et fenêtres : ils apparaissent juste avant l'arrivée à l'étape
  function updateLayers() {
    const s = STOPS[S];
    const arriving = !cutting && T - want <= paceAt(want) * 0.7;
    const visible = new Set(arriving ? s.show : []);
    Object.entries(layers).forEach(([name, el]) => el.classList.toggle('is-on', visible.has(name)));
    const winOn = visible.has('evenements');
    windows.forEach((w) => w.classList.toggle('is-on', winOn));
    document.body.classList.toggle('fab-off', winOn || visible.has('histoire'));
    section.classList.toggle('story-on', visible.has('histoire'));
  }

  /* Rendu : la vidéo suit le temps « voulu », qui avance tout seul vers l'étape visée.
     Safari (iPhone, Mac) saute très vite d'une image à l'autre : on la déplace par petits sauts.
     Chrome et Android : on lit le film à la vitesse voulue (lecture continue, plus fluide). */
  const webkit = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Android/.test(navigator.userAgent);
  const follow = !webkit && !reduced;
  const settle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(ambientShow, 250); };
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.1, lastT ? (now - lastT) / 1000 : 0.016); lastT = now;
    if (!cutting && want < T) {
      // plusieurs gestes d'affilée : le film accélère pour rattraper, sans coupure
      const ahead = STOPS.filter((s) => s.t > want + 0.01 && s.t <= T + 0.001).length;
      want = Math.min(T, want + paceAt(want) * (1 + 0.9 * Math.max(0, ahead - 1)) * dt);
      updateLayers();
    } else if (!cutting && want > T) want = T;
    if (!filmReady) { shown = want; placeMedia(want); }
    else {
      const cur = filmV.currentTime, d = want - cur;
      if (follow && d > 0.045 && d < 4) {
        const rate = Math.min(8, Math.max(0.5, d / 0.28));
        if (Math.abs(filmV.playbackRate - rate) > 0.04) filmV.playbackRate = rate;
        if (filmV.paused) filmV.play().catch(() => {});
        shown = cur;
      } else {
        if (!filmV.paused) filmV.pause();
        const k = reduced ? 1 : 1 - Math.exp(-dt / 0.06);
        shown += (want - shown) * k;
        if (Math.abs(want - shown) < 0.01) shown = want;
        if (!filmV.seeking && Math.abs(cur - shown) > 0.04) filmV.currentTime = shown;
      }
      placeMedia(filmV.currentTime);
    }
    const busy = cutting || want !== T || (filmReady && (Math.abs(want - filmV.currentTime) > 0.045 || filmV.seeking));
    if (busy) raf = requestAnimationFrame(frame);
    else { if (filmReady && !filmV.paused) filmV.pause(); lastT = 0; updateLayers(); settle(); }
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(frame); };
  if (location.search.includes('filmdebug')) window.__film = { get want() { return want; }, get target() { return T; }, get step() { return S; }, get ready() { return filmReady; }, film: filmV, amb: ambV };

  // Retour en arrière ou saut lointain : fondu rapide vers l'étape
  const cutTo = (t) => {
    cutting = true;
    section.classList.add('is-cut');
    updateLayers();
    setTimeout(() => {
      want = shown = t;
      if (filmReady) filmV.currentTime = t;
      placeMedia(t);
      cutting = false;
      updateLayers();
      setTimeout(() => section.classList.remove('is-cut'), 80);
      schedule();
    }, 260);
  };
  const goTo = (s, how) => {
    if (s === S && how !== 'init') return;
    const back = s < S;
    S = s; T = STOPS[s].t;
    ambientHide();
    if (how === 'init' || reduced) { want = shown = T; if (filmReady) filmV.currentTime = T; placeMedia(T); }
    else if (back || how === 'jump') cutTo(T);
    const st = STOPS[s];
    section.classList.toggle('frame-right', s > 0 && s < STOPS.length - 1);
    dots.forEach((d) => d.classList.toggle('is-current', d.dataset.stop === st.id));
    journeyFill.style.setProperty('--x', (s / (STOPS.length - 1)).toFixed(4));
    nextBtn.querySelector('span').textContent = s === STOPS.length - 1 ? 'Contact' : 'Suivant';
    if (st.bed) sound.setBed(st.bed);
    ambientPrepare(st);
    reveal();
    updateLayers();
    schedule();
  };

  // Une étape = un écran ; le navigateur s'y cale (aimantation) et chaque changement d'écran déclenche l'étape
  let programmatic = 0;
  const stepFromScroll = () => {
    const h = steps[0].offsetHeight || innerHeight;
    return Math.max(0, Math.min(STOPS.length - 1, Math.round(-section.getBoundingClientRect().top / h)));
  };
  const holdScroll = (ms) => {
    clearTimeout(programmatic);
    programmatic = setTimeout(() => { programmatic = 0; const s = stepFromScroll(); if (s !== S) goTo(s, 'jump'); }, ms);
  };
  const scrollToStep = (i) => {
    const top = steps[i].getBoundingClientRect().top + window.scrollY;
    if (i === S + 1 && !reduced) { goTo(i, 'play'); holdScroll(1000); window.scrollTo({ top, behavior: 'smooth' }); }
    else { goTo(i, 'jump'); holdScroll(300); window.scrollTo({ top, behavior: 'instant' }); }
  };
  addEventListener('scroll', () => {
    if (programmatic) return;
    const s = stepFromScroll();
    if (s !== S) goTo(s, Math.abs(s - S) > 1 ? 'jump' : 'play');
  }, { passive: true });
  nextBtn.addEventListener('click', () => {
    if (S < STOPS.length - 1) scrollToStep(S + 1);
    else { holdScroll(1200); scrollToY(contact.getBoundingClientRect().top + window.scrollY); }
  });

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
  goTo(stepFromScroll(), 'init');
  if (document.readyState === 'complete') loadFilm(); else addEventListener('load', loadFilm, { once: true });
  addEventListener('resize', () => { layout(); lastCrop = ''; placeMedia(shown); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) ambientHide(); else settle(); });

  // Liens internes : une étape du parcours passe par le film ; le reste défile en douceur
  document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    const i = steps.indexOf(target);
    if (i >= 0) return scrollToStep(i);
    holdScroll(1200);
    scrollToY(target.getBoundingClientRect().top + window.scrollY);
  }));

  /* ---------- Fiches détaillées : pâtes, sauces et événements, au clic ---------- */
  const DETAILS = {
    artisan: { kicker: "D'ici", title: 'Des pâtes fraîches <em>d’un artisan genevois.</em>', img: 'assets/film/still-artisan.webp?v=3',
      text: "Nos pâtes fraîches viennent d'un artisan de Genève. Pour le reste, on choisit le circuit court dès que possible, comme le bœuf suisse de notre Bolognese. Trois recettes de famille, des sauces faites maison, et une Pasta Box qui se tient d'une main.",
      facts: ["Pâtes fraîches d'un artisan genevois", 'Produits en circuit court dès que possible', 'Sauces faites maison, mijotées longtemps'] },
    bolognese: { kicker: 'La généreuse', title: 'Bolognese<em>.</em>', img: 'assets/film/still-bolognese.webp?v=3',
      text: "Un ragù de bœuf suisse mijoté longtemps, comme à la maison, avec des tomates et beaucoup de patience. Une sauce faite avec amour, sans alcool, et un voile de parmesan pour finir.",
      facts: ['Bœuf suisse, halal', 'Sans alcool', 'Mijotée longtemps, faite maison'] },
    pesto: { kicker: 'La fraîche', title: 'Pesto <em>Verde.</em>', img: 'assets/film/still-pesto.webp?v=3',
      text: "Basilic frais, pignons, parmesan et huile d'olive, préparé à froid pour garder tout son parfum. La recette la plus fraîche de la maison.",
      facts: ['Végétarien', 'Préparé à froid', 'Fait maison'] },
    pomodoro: { kicker: "L'essentielle", title: 'Pomodoro<em>.</em>', img: 'assets/film/still-pomodoro.webp?v=3',
      text: "Des tomates mijotées doucement, de l'huile d'olive et du basilic frais. Simple et généreuse, elle met tout le monde d'accord.",
      facts: ['Vegan', 'Sans piquant', 'Mijotée longtemps, faite maison'] },
  };
  const EVENTS = {
    festival: { kicker: 'Festivals', title: 'Des milliers de personnes, <em>une file qui avance.</em>', img: 'festival', type: 'Festival',
      text: "Grosses affluences et longues soirées : on dimensionne le nombre de postes avec vous, pour servir chaud et vite du premier concert au dernier.",
      facts: ["Jusqu'à 150 portions par heure et par poste", 'Postes ajoutés selon la fréquentation', 'Pasta Box qui se mange debout, à une main'] },
    sport: { kicker: 'Événements sportifs', title: "Le repas d'après l'effort, <em>prêt à l'arrivée.</em>", img: 'marathon', type: 'Événement sportif',
      text: "Courses, marathons, tournois : un plat de pâtes chaud, simple et sain, pour refaire le plein de glucides et bien récupérer. Pour les participants, les bénévoles et le public, avec des quantités prévues à l'avance avec l'organisation.",
      facts: ['Des glucides pour la récupération', 'Service rapide aux heures d’arrivée', 'Trois sauces, dont une vegan'] },
    entreprise: { kicker: 'Entreprises & B2B', title: 'Afterworks, séminaires, <em>portes ouvertes.</em>', img: 'entreprise', type: 'Entreprise / B2B',
      text: "Un stand qui cuisine devant vos équipes et vos invités : simple à accueillir, convivial, et chacun choisit sa sauce.",
      facts: ['Installation discrète, intérieur ou extérieur', 'Carte courte, adaptée aux régimes', 'Devis selon le nombre de convives'] },
    fete: { kicker: 'Fêtes communales & marchés', title: 'Une grande tablée <em>de quartier.</em>', img: 'fete-communale', type: 'Fête communale / marché',
      text: "Des familles, des voisins, toutes les générations : une box généreuse à prix accessible, servie sans attente.",
      facts: ['Portions pour les petits et les grands', 'Stand autonome, rapide à installer', 'Pâtes artisanales de Genève, sauces faites maison'] },
    prive: { kicker: 'Événements privés', title: 'Mariages, anniversaires, <em>fêtes de famille.</em>', img: 'prive', type: 'Événement privé',
      text: "Un repas chaleureux et sans chichis pour vos invités, dans votre jardin ou votre salle.",
      facts: ['Formule adaptée au nombre d’invités', 'Bolognese au bœuf suisse halal, Pesto végétarien, Pomodoro vegan', "Emplacement, électricité et eau : on fait le point avec vous avant l'événement"] },
  };
  const dialog = document.getElementById('eventDialog');
  const $ = (id) => document.getElementById(id);
  let opener = null, chosenType = null;
  const openDetail = (d, img, ctaLabel) => {
    $('eventKicker').textContent = d.kicker;
    $('eventTitle').innerHTML = d.title;
    $('eventText').textContent = d.text;
    $('eventFacts').innerHTML = d.facts.map((f) => `<li>${f}</li>`).join('');
    $('eventImg').src = img;
    $('eventImg').alt = d.kicker;
    $('eventCta').textContent = ctaLabel;
    dialog.showModal();
  };
  windows.forEach((w) => w.addEventListener('click', () => {
    const d = EVENTS[w.dataset.event];
    opener = w; chosenType = d.type;
    openDetail(d, `assets/fenetres/${d.img}.webp`, 'Parler de mon événement');
  }));
  document.querySelectorAll('.stop-card').forEach((c) => c.addEventListener('click', () => {
    const d = DETAILS[c.dataset.detail];
    opener = c; chosenType = null;
    openDetail(d, d.img, 'Faire venir Pasta Mo');
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
    holdScroll(1200);
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
