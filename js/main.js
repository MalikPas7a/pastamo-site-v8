(() => {
  const root = document.documentElement;
  const isDesktop = !matchMedia('(max-width: 820px), (pointer: coarse)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.add(isDesktop ? 'is-desktop' : 'is-mobile');
  if (reduced) root.classList.add('is-reduced');
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
     Un plan-séquence en sept étapes (néon → pâtes fraîches → trois box → stand de nuit → néon).
     Chaque mouvement de caméra est une courte vidéo lue normalement, comme n'importe quelle vidéo de fond (la méthode
     la plus sûre sur iPhone) : elle part exactement de l'image fixe de l'étape précédente et finit sur celle de la suivante.
     Un geste (défilement, glissement, flèche, « Suivant », clic sur une étape) passe à l'étape suivante ;
     revenir en arrière ou sauter plus loin se fait par un fondu. À l'arrivée, seule une légère vapeur continue de monter
     (l'image de l'étape reste fixe au pixel près, la caméra ne bouge pas) ; aux pâtes fraîches, la farine a fini de tomber : image calme. */
  const STOPS = [
    { id: 'intro', show: ['intro'], layout: 'center' },
    { id: 'artisan', show: ['artisan'], layout: 'left', bed: 'cuisine' },
    { id: 'bolognese', show: ['bolognese'], layout: 'left', loop: true },
    { id: 'pesto', show: ['pesto'], layout: 'left', loop: true },
    { id: 'pomodoro', show: ['pomodoro'], layout: 'left', loop: true, from: 2.5 },
    { id: 'evenements', show: ['evenements'], layout: 'stand', bed: 'terrasse', loop: true, from: 2.1, lead: 2.3 },
    { id: 'histoire', show: ['histoire'], layout: 'story' },
  ];
  const FILM_V = '14'; // à changer à chaque nouveau montage, pour que les navigateurs ne gardent pas l'ancien en cache
  // la dernière seconde de chaque mouvement est déjà fondue dans le début de la boucle de vapeur (film_final.py, LOOP_FROM) :
  // la boucle reprend donc à 1 s, sur l'image exacte où le mouvement s'arrête (Pomodoro : 2,5 s, la vapeur accompagne le basilic)
  const LOOP_FROM = 1;
  const loopFrom = (i) => (STOPS[i] && STOPS[i].from) || LOOP_FROM;
  if (location.search.includes('filmdebug')) window.__syncLog = [];
  const src = (name) => `assets/film/${variant}/${name}?v=${FILM_V}`;

  const section = document.getElementById('immersion');
  const stage = section.querySelector('.stage');
  const media = document.getElementById('stageMedia');
  const still = document.getElementById('stageStill');
  const vids = [document.getElementById('vidA'), document.getElementById('vidB')];
  const loopEls = [document.getElementById('vidLoop'), document.getElementById('vidLoop2')];
  const steps = [...section.querySelectorAll('.step')];
  const layers = Object.fromEntries([...section.querySelectorAll('[data-show]')].map((l) => [l.dataset.show, l]));
  const windows = [...section.querySelectorAll('.window')];
  const dots = [...document.querySelectorAll('.journey a')];
  const journeyFill = document.getElementById('journeyFill');
  const nextBtn = document.getElementById('nextStep');
  windows.forEach((w, i) => w.style.setProperty('--i', i));
  [...vids, ...loopEls].forEach((v) => { v.muted = true; v.playsInline = true; });
  // vapeur en attente sous un mouvement : si le navigateur la laisse avancer, on la ramène au début
  loopEls.forEach((el) => el.addEventListener('timeupdate', () => { if (el.dataset.priming && !el.paused && el.currentTime > 0.35) { el.pause(); try { el.currentTime = 0; } catch (e) { /* */ } } }));
  // les images fixes des étapes sont petites : on les charge toutes pour des retours et des fondus instantanés ; à l'ouverture,
  // seulement l'enseigne et les pâtes fraîches, pour laisser la priorité au premier mouvement (les autres suivent)
  const stillUrl = (i) => src(`stop-${i}.webp`);
  const stills = STOPS.map((_, i) => { const im = new Image(); if (i < 2) im.src = stillUrl(i); return im; });
  const loadStills = () => stills.forEach((im, i) => { if (!im.getAttribute('src')) im.src = stillUrl(i); });
  setTimeout(loadStills, 4000);

  /* Cadre de l'image : il garde la taille naturelle du film (jamais agrandi ni recadré) et se place selon l'étape.
     Ordinateur : grand et centré pour l'enseigne, à gauche pour les box (texte à droite), plus petit pour le stand,
     en haut pour l'histoire. Téléphone : pleine largeur en haut, plus petit pour le stand et l'histoire. */
  const frameFor = (layout, W, H) => {
    let w, x, y;
    if (phone) {
      w = layout === 'stand' || layout === 'story' ? W * 0.64 : W;
      x = (W - w) / 2; y = Math.max(92, H * 0.13);
    } else if (layout === 'center') {
      w = Math.min(W * 0.8, (H - 344) / 0.7 * 16 / 9); x = (W - w) / 2; y = 64;
    } else if (layout === 'story') {
      // l'enseigne en haut, le texte entièrement dessous (jamais sur l'image)
      w = Math.min(W * 0.62, (H - 384) * 16 / 9); x = (W - w) / 2; y = 64;
    } else {
      w = Math.min(W * (layout === 'stand' ? 0.44 : 0.6), (H - 120) * 16 / 9);
      x = W * (layout === 'stand' ? 0.03 : 0.035); y = (H - w * 9 / 16) / 2 + 22;
    }
    return { x, y, w, h: w * 9 / 16 };
  };
  let SW = 0, SH = 0;
  const place = (layout) => {
    SW = stage.clientWidth; SH = stage.clientHeight;
    const r = frameFor(layout, SW, SH);
    media.style.setProperty('--mx', `${r.x.toFixed(1)}px`);
    media.style.setProperty('--my', `${r.y.toFixed(1)}px`);
    media.style.setProperty('--mw', `${r.w.toFixed(1)}px`);
    // repères pour les textes : sous l'enseigne, à droite du cadre, sous l'image (téléphone)
    section.style.setProperty('--neon-b', `${Math.round(layout === 'story' ? r.y + r.h + 6 : r.y + r.h * 0.7)}px`);
    section.style.setProperty('--text-x', `${Math.round(r.x + r.w + SW * 0.04)}px`);
    section.style.setProperty('--win-left', `${Math.round(r.x + r.w + SW * 0.03)}px`);
    section.style.setProperty('--band-b', `${Math.round(r.y + r.h + 14)}px`);
  };

  /* Lecture : S = étape visée, at = étape affichée (arrivée), queue = mouvements à jouer */
  let S = 0, at = 0, playing = null, cutting = false, introDone = reduced, playId = 0;
  const queue = [];
  // is-instant : le mouvement disparaît d'un coup (la vapeur synchronisée dessous montre déjà la même image)
  const front = (v, instant) => vids.forEach((x) => {
    if (x === v) { x.classList.remove('is-instant'); x.classList.add('is-front'); }
    else if (x.classList.contains('is-front')) { x.classList.toggle('is-instant', !!instant); x.classList.remove('is-front'); }
  });
  const showStill = (i) => { still.src = stillUrl(i); };
  /* Téléchargement à l'avance, un fichier à la fois, dans l'ordre où on en aura besoin : sur téléphone tout le parcours
     (≈ 4 Mo), sur ordinateur les deux étapes suivantes. Lus depuis la mémoire, mouvements et vapeurs ne s'arrêtent jamais
     pour attendre le réseau (l'iPhone ne précharge pas les vidéos). Tant qu'un fichier n'est pas arrivé, on le lit en direct. */
  const inMemory = {};
  // Firefox fige une vidéo en mémoire dès qu'on la repositionne (même au début) : il garde la lecture en direct
  const canPrefetch = !reduced && !/firefox/i.test(navigator.userAgent);
  if (!canPrefetch) loadStills();
  let fetchQueue = [], fetching = false, current = null;
  // arrête le téléchargement en cours s'il s'agit de ce fichier (devenu inutile : on passe au suivant)
  const cancelFetch = (name) => { if (current && current.name === name && current.ctrl) current.ctrl.abort(); };
  const pump = () => {
    if (fetching || !fetchQueue.length) return;
    const name = fetchQueue.shift();
    if (name in inMemory) return pump();
    fetching = true;
    inMemory[name] = null;
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    current = { name, ctrl };
    fetch(src(name), ctrl ? { signal: ctrl.signal } : undefined).then((r) => {
      if (!r.ok) return null;
      const total = +r.headers.get('content-length') || 0;
      if (!total || !r.body || !r.body.getReader) return r.blob();
      // on suit l'arrivée des octets : on sait ainsi si un fichier demandé est presque là (voir eta)
      const reader = r.body.getReader(), parts = [], pr = progress[name] = { got: 0, total, t0: performance.now() };
      const read = () => reader.read().then(({ done, value }) => {
        if (done) return new Blob(parts, { type: r.headers.get('content-type') || 'video/mp4' });
        parts.push(value); pr.got += value.length;
        return read();
      });
      return read();
    }).then((b) => {
      if (!b) return;
      const url = inMemory[name] = URL.createObjectURL(b);
      if (name === 'move-1.mp4') loadStills();
      // déjà préparé en direct mais pas encore lancé : on passe à la copie en mémoire
      const [, kind, k] = name.match(/^(move|loop)-(\d)/);
      if (kind === 'move') vids.forEach((v) => { if (v.dataset.move === k && v !== playing && !v.classList.contains('is-front') && v.paused) { v.src = url; v.load(); } });
      else loopEls.forEach((el) => { if (el.dataset.step === k && el.paused && !el.classList.contains('is-on') && !el.classList.contains('is-leaving')) { el.src = url; el.load(); } });
    }).catch(() => {}).then(() => {
      fetching = false;
      current = null;
      const ok = !!inMemory[name];
      if (!ok) delete inMemory[name];   // échec : on lira en direct
      (waiters[name] || []).forEach((f) => f(ok)); delete waiters[name];
      pump();
    });
  };
  // un mouvement est demandé avant d'être en mémoire : on le télécharge en premier, et on peut l'attendre
  const waiters = {}, progress = {};
  // temps restant estimé (s) avant qu'un fichier en cours soit entièrement arrivé ; infini s'il n'a pas encore commencé
  const eta = (name) => {
    const pr = progress[name];
    if (!pr || !pr.got) return Infinity;
    const s = (performance.now() - pr.t0) / 1000;
    return s > 0 ? (pr.total - pr.got) / (pr.got / s) : Infinity;
  };
  const prefetchNow = (name) => {
    if (!canPrefetch || name in inMemory) return;
    fetchQueue = [name].concat(fetchQueue.filter((n) => n !== name));
    pump();
  };
  const whenInMemory = (name, ms) => new Promise((res) => {
    if (inMemory[name]) return res(true);
    (waiters[name] = waiters[name] || []).push(res);
    setTimeout(() => res(false), ms);
  });
  const mediaSrc = (name) => inMemory[name] || src(name);
  const prefetchAround = (i) => {
    if (!canPrefetch) return;
    const names = [];
    for (let k = i + 1; k < STOPS.length && (phone || k <= i + 2); k++) {
      names.push(`move-${k}.mp4`);
      if (STOPS[k].loop) names.push(`loop-${k}.mp4`);
    }
    fetchQueue = names.concat(fetchQueue.filter((n) => !names.includes(n)));
    pump();
  };
  const prepare = (v, i) => {
    if (v.dataset.move === String(i)) return;
    v.dataset.move = String(i);
    v.src = mediaSrc(`move-${i}.mp4`);
    v.preload = 'auto';
    v.load();
  };
  /* Vapeur à l'arrêt : boucle de l'étape (l'image fixe au pixel près, sauf la vapeur, la farine, la foule).
     Deux lecteurs : celui de l'étape qu'on quitte s'efface pendant que l'autre prépare la vapeur d'arrivée. */
  let loopV = loopEls[0], loopGen = 0;
  const loopPrepare = (i) => {
    if (reduced || !STOPS[i] || !STOPS[i].loop || loopV.dataset.step === String(i)) return;
    loopV.dataset.step = String(i);
    loopV.classList.remove('is-on', 'is-instant', 'is-leaving');
    loopV.src = mediaSrc(`loop-${i}.mp4`);
    loopV.preload = 'auto';
    loopV.load();
  };
  const seekLoop = (t, tol = 0.01) => { try { if (Math.abs(loopV.currentTime - t) > tol) loopV.currentTime = t; } catch (e) { /* pas encore chargée */ } };
  // Pendant le mouvement, la vapeur d'arrivée est chargée sous lui (il la cache). L'iPhone ne charge une vidéo qu'une fois
  // lancée : on la lance un instant puis on l'arrête au début, prête pour le départ synchronisé de la dernière seconde.
  const loopPrime = (i) => {
    loopPrepare(i);
    if (reduced || !STOPS[i] || !STOPS[i].loop) return;
    const gen = ++loopGen, el = loopV;
    el.dataset.priming = '1';
    seekLoop(0);
    el.classList.remove('is-leaving');
    el.classList.add('is-instant', 'is-on');
    const p = el.play();
    const hold = () => { if (gen === loopGen && el.dataset.priming) { el.pause(); seekLoop(0, 0.02); } };
    if (p && p.then) p.then(hold, () => { if (gen === loopGen) el.classList.remove('is-on', 'is-instant'); }); else hold();
  };
  // Départ : la vapeur de l'étape quittée continue de jouer au-dessus du mouvement, dans sa seule zone vivante, et s'y fond
  // en 0,9 s (elle ne s'arrête jamais net) ; l'autre lecteur prend la vapeur suivante
  const loopLeave = () => {
    const el = loopV;
    ++loopGen;
    delete el.dataset.priming;
    loopV = loopEls.find((x) => x !== el);
    loopV.classList.remove('is-leaving');
    el.playbackRate = 1;
    if (el.paused || !el.classList.contains('is-on')) { el.classList.remove('is-on', 'is-instant'); el.pause(); return; }
    el.classList.add('is-leaving');
    el.classList.remove('is-on', 'is-instant');
    setTimeout(() => { if (!el.classList.contains('is-on')) { el.pause(); el.classList.remove('is-leaving'); } }, 1000);
  };
  // chaque départ ou arrêt de la vapeur a son numéro : un ancien arrêt ne peut pas couper la nouvelle vapeur
  // how = 'suite' : la vapeur tourne déjà, synchronisée (rien à faire) ; 'relais' : en fin de mouvement, elle reprend d'un coup
  // sur l'image de raccord ; 'net' : image cachée (fondu de retour) ; sinon fondu lent sur l'image fixe
  const loopStart = (i, how) => {
    if (reduced || !STOPS[i] || !STOPS[i].loop) return null;
    const gen = ++loopGen;
    loopPrepare(i);
    delete loopV.dataset.priming;
    loopV.classList.remove('is-leaving');
    if (how === 'suite' && !loopV.paused) { loopV.playbackRate = 1; loopV.classList.add('is-instant', 'is-on'); return null; }
    if (how === 'suite') how = 'relais';
    if (how && loopV.readyState < 2) how = '';
    seekLoop(loopFrom(i), how ? 0.15 : 0.01);
    if (!how && loopV.classList.contains('is-instant')) { loopV.classList.remove('is-on', 'is-instant'); void loopV.offsetWidth; }
    // Safari (iPhone) peut refuser de lancer une vidéo invisible : on l'affiche avant de la lancer
    // (tant qu'elle n'a pas d'image, elle reste transparente et l'image fixe reste visible dessous)
    if (how) loopV.classList.add('is-instant');
    loopV.classList.add('is-on');
    loopV.playbackRate = 1;
    const el = loopV, p = el.play();
    const fail = () => { if (gen === loopGen) el.classList.remove('is-on', 'is-instant'); };
    if (p && p.then) p.then(() => { if (gen !== loopGen || at !== i || playing || S !== i) fail(); }, fail);
    return how && p && p.then ? p : null;
  };
  const loopStop = () => {
    ++loopGen;
    loopEls.forEach((el) => { delete el.dataset.priming; el.playbackRate = 1; el.classList.remove('is-on', 'is-instant', 'is-leaving'); });
    // on n'arrête que les lecteurs restés invisibles (une vapeur relancée entre-temps continue)
    setTimeout(() => loopEls.forEach((el) => { if (!el.classList.contains('is-on')) el.pause(); }), 450);
  };
  // exécute cb quand la vapeur a vraiment affiché une image à partir du raccord (au plus tard après 800 ms)
  const afterLoopFrame = (cb) => {
    let done = false;
    const el = loopV, from = loopFrom(+el.dataset.step), once = () => { if (!done) { done = true; cb(); } };
    const check = (now, meta) => {
      if (done) return;
      if (!meta || (meta.mediaTime >= from - 0.02 && meta.mediaTime < from + 0.6)) once(); else el.requestVideoFrameCallback(check);
    };
    if (el.requestVideoFrameCallback) el.requestVideoFrameCallback(check);
    setTimeout(once, el.requestVideoFrameCallback ? 800 : 80);
  };

  const arrive = (i, how) => {
    at = i;
    showStill(i);
    updateLayers();
    prefetchAround(i);
    let p = null;
    if (!playing && !queue.length && S === i) p = loopStart(i, how);
    // prépare le mouvement suivant dans le lecteur qui n'est pas affiché (jamais dans celui qui montre l'image)
    if (i + 1 < STOPS.length && !queue.length) prepare(vids.find((v) => !v.classList.contains('is-front') && v !== playing) || vids[1], i + 1);
    return p;
  };
  // Rejoindre une étape en fondu, en recalant la page dessus (mouvement impossible ou bloqué par le réseau)
  const forceStep = (i) => {
    queue.length = 0;
    waitingFor = null;
    holdScroll(500);
    window.scrollTo(0, steps[i].getBoundingClientRect().top + window.scrollY);
    S = -1;
    goTo(i, 'jump');
  };
  // Fondu direct vers l'étape i, sans mouvement ni attente : l'image actuelle (l'enseigne en train de s'allumer, ou sa dernière
  // image) passe devant et s'efface en 0,9 s sur l'image de l'étape, posée dessous
  const dissolveTo = (i) => {
    queue.length = 0;
    waitingFor = null;
    const cur = vids.find((x) => x.classList.contains('is-front')) || vids.find((x) => x.dataset.move === 'intro' && x.readyState >= 2);
    cancelFetch(`move-${i}.mp4`);
    if (!cur || cutting) return forceStep(i);
    cur.classList.add('is-instant', 'is-front');
    void cur.offsetWidth;
    arrive(i);
    cur.classList.remove('is-instant', 'is-front');
    cur.classList.add('is-slow');
    dissolving = Date.now();
    setTimeout(() => cur.classList.remove('is-slow'), 1000);
  };
  let dissolving = 0;
  let waitingFor = null;
  const playNext = () => {
    if (playing || cutting || !queue.length || waitingFor !== null) return;
    const i = queue[0], name = `move-${i}.mp4`;
    const ready = vids.find((x) => x.dataset.move === String(i));
    // Tout début de visite : le mouvement n'est pas encore téléchargé. Lu en direct, l'iPhone peut se figer au milieu, et une
    // attente se voit comme un blocage. Donc : presque arrivé (moins de 0,4 s) → on l'attend un instant et il part d'un trait ;
    // sinon, aucune attente : l'image se fond aussitôt dans celle de l'étape.
    if (canPrefetch && !inMemory[name] && !(ready && ready.readyState >= 4)) {
      prefetchNow(name);
      if (eta(name) < 0.4) {
        waitingFor = i;
        whenInMemory(name, 900).then((ok) => {
          if (waitingFor !== i) return;
          waitingFor = null;
          if (queue[0] !== i || cutting || playing) return;
          if (ok) playNext(); else dissolveTo(i);
        });
      } else dissolveTo(i);
      return;
    }
    queue.shift();
    const v = vids.find((x) => x.dataset.move === String(i)) || vids.find((x) => !x.classList.contains('is-front')) || vids[0];
    prepare(v, i);
    playing = v;
    // chaque lecture a son numéro : un mouvement interrompu (retour en arrière) ne peut plus « finir » à la place d'un autre
    const id = ++playId;
    const mine = () => playing === v && id === playId;
    let handed = false;
    try { v.currentTime = 0; } catch (e) { /* pas encore chargée : elle partira du début */ }
    v.playbackRate = queue.length ? 1.6 : 1; // plusieurs gestes d'affilée : on enchaîne un peu plus vite, sans coupure
    // Safari (iPhone) refuse parfois de lancer une vidéo invisible : on l'affiche avant de la lancer.
    // Tant que sa première image n'est pas prête elle reste transparente, et l'image fixe de l'étape reste visible dessous.
    front(v);
    // la vapeur de l'étape quittée se fond dans le mouvement ; celle d'arrivée se prépare dans l'autre lecteur une fois ce
    // fondu fini (jamais plus de deux vidéos décodées à la fois sur téléphone)
    v.addEventListener('playing', () => { if (!mine()) return; loopLeave(); setTimeout(() => { if (mine() && !queue.length) loopPrime(i); }, 900); }, { once: true });
    // Dernière seconde : la vapeur d'arrivée démarre sous le mouvement, calée sur lui image par image (petites corrections de
    // vitesse). Le mouvement se retire d'un coup sur ses toutes dernières images, identiques à celles de la vapeur : aucun arrêt.
    const debug = window.__syncLog;
    const sync = () => {
      if (!mine() || handed) return;
      const L = loopV, D = v.duration;
      if (queue.length || S !== i || !STOPS[i].loop || reduced) { L.playbackRate = 1; return; }
      if (debug && !(D && !v.paused && L.dataset.step === String(i) && L.readyState >= 2) && D && D - v.currentTime < 1.1) debug.push(`${i} attente: pause=${v.paused} étape=${L.dataset.step} rs=${L.readyState}`);
      if (D && !v.paused && L.dataset.step === String(i) && L.readyState >= 2) {
        const want = v.currentTime - (D - loopFrom(i));
        if (debug && want > -0.2) debug.push(`${i} reste=${(D - v.currentTime).toFixed(3)} vapeur=${L.paused ? 'pause' : 'lecture'}@${L.currentTime.toFixed(3)} voulu=${want.toFixed(3)} vitesse=${L.playbackRate.toFixed(2)} rs=${L.readyState}`);
        if (want >= 0) {
          delete L.dataset.priming;
          // départ avec un peu d'avance : le temps que la lecture démarre vraiment
          if (L.paused) { seekLoop(want + 0.1, 0.03); L.playbackRate = 1; const p = L.play(); if (p && p.catch) p.catch(() => {}); }
          else {
            const err = L.currentTime - want;
            if (Math.abs(err) > 0.2 && D - v.currentTime > 0.3) seekLoop(want + 0.1, 0);
            else L.playbackRate = Math.min(1.4, Math.max(0.7, 1 - err * 3.5));
            // dernières images (le mouvement y est déjà la vapeur à 97 % et plus) : on retire le mouvement
            if (D - v.currentTime < 0.13 && Math.abs(err) < 0.07) {
              handed = true;
              L.playbackRate = 1;
              L.classList.add('is-instant', 'is-on');
              front(null, true);
              return;
            }
          }
        }
      }
      requestAnimationFrame(sync);
    };
    if (!queue.length && !reduced) requestAnimationFrame(sync);
    const done = () => {
      if (!mine()) return;
      v.removeEventListener('timeupdate', near);
      playing = null;
      if (queue.length) { arrive(i); playNext(); return; }
      if (handed) { arrive(i, 'suite'); return; }
      // sinon : la vapeur reprend sur l'image exacte où le mouvement s'arrête, et on retire le mouvement dès qu'elle tourne
      // (sans vapeur, l'image fixe est identique à la dernière image du mouvement : on le retire sans que ça se voie)
      const off = () => { if (!playing) front(null); };
      const p = arrive(i, 'relais');
      if (p) p.then(() => afterLoopFrame(off), off); else setTimeout(off, 120);
    };
    const near = () => { if (!mine()) { v.removeEventListener('timeupdate', near); return; } if (v.duration && v.currentTime > v.duration - (STOPS[i].lead || 0.8) && !queue.length) updateLayers(i); };
    // le réseau bloque le mouvement plus d'1,2 s : on rejoint l'étape en fondu plutôt que de rester figé
    let stallT = 0;
    const unwatch = () => { clearTimeout(stallT); v.removeEventListener('waiting', onWait); v.removeEventListener('playing', onGo); };
    const onGo = () => clearTimeout(stallT);
    const onWait = () => { clearTimeout(stallT); stallT = setTimeout(() => { if (mine() && v.readyState < 3) { unwatch(); forceStep(i); } }, 1200); };
    v.addEventListener('waiting', onWait);
    v.addEventListener('playing', onGo);
    v.addEventListener('ended', unwatch, { once: true });
    v.addEventListener('ended', done, { once: true });
    v.addEventListener('timeupdate', near);
    const p = v.play();
    // lecture refusée (iPhone en mode économie d'énergie) : on passe directement à l'image de l'étape
    if (p && p.catch) p.catch(() => { if (mine()) { playing = null; v.removeEventListener('timeupdate', near); arrive(i); playNext(); } });
  };
  const cutTo = (i) => {
    queue.length = 0;
    if (playing) { playing.pause(); playing = null; }
    playId++;
    loopStop();
    cutting = true;
    section.classList.add('is-cut');
    updateLayers();
    setTimeout(() => {
      front(null);
      cutting = false;
      // l'image est cachée par le fondu : la vapeur y est déjà en marche quand elle réapparaît
      arrive(i, 'net');
      setTimeout(() => section.classList.remove('is-cut'), 60);
    }, 280);
  };

  // Textes et fenêtres : ils apparaissent à l'arrivée (ou juste avant la fin du mouvement)
  function updateLayers(arriving) {
    const s = STOPS[S];
    const ready = !cutting && (at === S || arriving === S);
    const visible = new Set(ready ? s.show : []);
    Object.entries(layers).forEach(([name, el]) => el.classList.toggle('is-on', visible.has(name)));
    const winOn = visible.has('evenements');
    windows.forEach((w) => w.classList.toggle('is-on', winOn));
    document.body.classList.toggle('fab-off', winOn || visible.has('histoire'));
  }

  const goTo = (s, how) => {
    if (s === S && how !== 'init') return;
    // pendant un fondu direct (moins d'une seconde), un nouveau geste en avant ne fait pas sauter l'étape qui apparaît
    if (how !== 'init' && s > S && Date.now() - dissolving < 1000) { holdScroll(400); window.scrollTo(0, steps[S].getBoundingClientRect().top + window.scrollY); return; }
    if (waitingFor !== null && how !== 'init') {
      if (s > waitingFor) { holdScroll(400); window.scrollTo(0, steps[waitingFor].getBoundingClientRect().top + window.scrollY); return; }
      waitingFor = null;
      queue.length = 0;
    }
    const last = queue.length ? queue[queue.length - 1] : (playing ? +playing.dataset.move : at);
    S = s;
    const st = STOPS[s];
    section.dataset.layout = st.layout;
    place(st.layout);
    dots.forEach((d) => d.classList.toggle('is-current', d.dataset.stop === st.id));
    journeyFill.style.setProperty('--x', (s / (STOPS.length - 1)).toFixed(4));
    nextBtn.querySelector('span').textContent = s === STOPS.length - 1 ? 'Contact' : 'Suivant';
    if (st.bed) sound.setBed(st.bed);
    if (how === 'init') { at = s; front(null); arrive(s); return; }
    if (s === last + 1 && !reduced && how !== 'jump') {
      queue.push(s);
      updateLayers();
      if (playing) prepare(vids.find((v) => v !== playing), queue[0]);
      playNext();
    } else cutTo(s);
  };

  // Une étape = un écran ; le navigateur s'y cale (aimantation) et chaque changement d'écran déclenche l'étape
  let programmatic = 0, lastScrollAt = 0;
  const stepFromScroll = () => {
    const h = steps[0].offsetHeight || innerHeight;
    return Math.max(0, Math.min(STOPS.length - 1, Math.round(-section.getBoundingClientRect().top / h)));
  };
  // pendant un défilement lancé par le site, on ignore les écrans traversés ; tant que la page bouge encore, on attend
  const holdScroll = (ms) => {
    clearTimeout(programmatic);
    programmatic = setTimeout(() => {
      if (Date.now() - lastScrollAt < 150) return holdScroll(200);
      programmatic = 0; const s = stepFromScroll(); if (s !== S) goTo(s, 'jump');
    }, ms);
  };
  // L'image est fixe (collée à l'écran) : on saute directement à l'écran de l'étape, sans défilement animé.
  // Sur iPhone, un défilement animé combattu par l'aimantation pouvait revenir en arrière et couper le mouvement.
  const scrollToStep = (i) => {
    const top = steps[i].getBoundingClientRect().top + window.scrollY;
    goTo(i, i === S + 1 && !reduced ? 'play' : 'jump');
    holdScroll(400);
    window.scrollTo(0, top);
  };
  // Un geste = une étape : dès que le défilement passe à l'écran suivant, le mouvement part ; ensuite on ignore l'élan (sur
  // iPhone il peut dépasser puis revenir, ce qui faisait sauter les pâtes fraîches) jusqu'à ce que la page soit posée
  let gesture = false, settleTimer = 0;
  // Ouverture ou rechargement : tant que le visiteur n'a pas touché l'écran (ni clavier, souris, molette), tout défilement vient
  // du navigateur (l'iPhone tente de remettre l'ancienne position, et l'aimantation posait alors la page sur les pâtes fraîches) :
  // on le remet en haut. Protection limitée aux 2 premières secondes.
  let userMoved = !!location.hash;
  const moved = () => { userMoved = true; };
  ['touchstart', 'pointerdown', 'mousedown', 'wheel', 'keydown'].forEach((ev) => addEventListener(ev, moved, { once: true, passive: true }));
  setTimeout(moved, 2000);
  const backToTop = () => { if (!userMoved && window.scrollY > 0) { holdScroll(300); window.scrollTo(0, 0); } };
  addEventListener('load', backToTop);
  addEventListener('pageshow', backToTop);
  addEventListener('scroll', () => {
    lastScrollAt = Date.now();
    if (!userMoved) { backToTop(); return; }
    if (programmatic) return;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      gesture = false;
      if (programmatic) return;
      const s = stepFromScroll();
      if (s !== S) goTo(s, Math.abs(s - S) > 1 ? 'jump' : 'play');
    }, 160);
    if (gesture) return;
    const s = stepFromScroll();
    if (s !== S) { gesture = true; goTo(s, Math.abs(s - S) > 1 ? 'jump' : 'play'); }
  }, { passive: true });
  nextBtn.addEventListener('click', () => {
    if (S < STOPS.length - 1) scrollToStep(S + 1);
    else { holdScroll(1200); scrollToY(contact.getBoundingClientRect().top + window.scrollY); }
  });

  // À l'ouverture, on commence toujours par l'enseigne et la première phrase (le navigateur ne remet pas l'ancienne position),
  // sauf lien direct vers une partie de la page
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (!location.hash) window.scrollTo(0, 0);
  goTo(stepFromScroll(), 'init');
  // Intro (en haut de page) : l'enseigne s'allume seule au chargement, puis l'image fixe de l'enseigne allumée prend le relais
  if (!reduced && S === 0) {
    const v = vids[0];
    // l'enseigne éteinte d'abord (première image de la vidéo), puis elle s'allume doucement ; à la fin, l'image allumée prend le relais
    still.src = src('intro-0.webp');
    v.src = src('intro.mp4');
    v.dataset.move = 'intro';
    front(v);
    const done = () => { introDone = true; if (at === 0) showStill(0); if (!playing && v.classList.contains('is-front')) setTimeout(() => { if (!playing) front(null); }, 80); };
    v.addEventListener('ended', done, { once: true });
    v.addEventListener('error', done, { once: true });
    const p = v.play();
    if (p && p.catch) p.catch(done);
  }
  // iPhone en mode économie d'énergie : les vidéos ne démarrent qu'après un premier toucher ; on les « débloque » à ce moment-là
  const unlock = () => [...vids, ...loopEls].forEach((v) => {
    if (!v.src || !v.paused || v === playing) return;
    v.play().then(() => { if (v !== playing && !(v === loopV && loopV.classList.contains('is-on'))) v.pause(); if (v === loopV && at === S && !playing) loopStart(S); }).catch(() => {});
  });
  addEventListener('touchend', unlock, { once: true, passive: true });
  addEventListener('click', unlock, { once: true });

  if (S + 1 < STOPS.length) prepare(vids[1], S + 1);
  // Redimensionnement ou rotation : on recale le cadre et on reste sur la même étape (le navigateur recale le défilement,
  // ce qui ne doit pas déclencher de mouvement vers l'étape voisine)
  let resizeTimer = 0, lastW = innerWidth;
  addEventListener('resize', () => {
    place(STOPS[S].layout);
    // sur iPhone, la barre d'adresse qui se replie pendant le défilement change seulement la hauteur : on ne touche à rien
    if (innerWidth === lastW) return;
    lastW = innerWidth;
    clearTimeout(resizeTimer);
    holdScroll(700);
    resizeTimer = setTimeout(() => {
      if (section.getBoundingClientRect().bottom > innerHeight * 0.5) window.scrollTo(0, steps[S].getBoundingClientRect().top + window.scrollY);
    }, 150);
  });
  // onglet caché : la vapeur s'arrête ; de retour, elle reprend si l'on est arrêté sur une étape
  document.addEventListener('visibilitychange', () => { if (document.hidden) loopStop(); else if (at === S && !playing) loopStart(S); });
  if (location.search.includes('filmdebug')) window.__film = { get step() { return S; }, get at() { return at; }, get playing() { return !!playing; }, get queue() { return queue.length; }, vids };

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
      text: "Nos pâtes fraîches viennent d'un artisan de Genève. Pour le reste, on choisit le circuit court dès que possible : du bœuf suisse, des légumes du maraîcher. Trois recettes de famille, des sauces faites maison, et une Pasta Box qui se tient d'une main.",
      facts: ["Pâtes fraîches d'un artisan genevois", 'Bœuf suisse et légumes du maraîcher, en circuit court dès que possible', 'Sauces faites maison, mijotées longtemps'] },
    bolognese: { kicker: 'La généreuse', title: 'Bolognese<em>.</em>', img: 'assets/film/still-bolognese.webp?v=3',
      text: "Un ragù de bœuf suisse et de légumes du maraîcher, mijoté longtemps comme à la maison, avec des tomates et beaucoup de patience. Une sauce faite avec amour.",
      facts: ['Bœuf suisse, halal', 'Légumes du maraîcher', 'Mijotée longtemps, faite maison'] },
    pesto: { kicker: 'La fraîche', title: 'Pesto <em>Verde.</em>', img: 'assets/film/still-pesto.webp?v=3',
      text: "Basilic frais, pignons, parmesan et huile d'olive, préparé à froid pour garder tout son parfum. La recette la plus fraîche de la maison.",
      facts: ['Végétarien', 'Préparé à froid', 'Fait maison'] },
    pomodoro: { kicker: "L'essentielle", title: 'Pomodoro<em>.</em>', img: 'assets/film/still-pomodoro.webp?v=3',
      text: "Des tomates mijotées doucement, de l'huile d'olive et du basilic frais. Douce et généreuse, sans piquant : les enfants l'adorent, et elle met tout le monde d'accord.",
      facts: ['Végétarien', 'Kid friendly, sans piquant', 'Mijotée longtemps, faite maison'] },
  };
  const EVENTS = {
    festival: { kicker: 'Festivals', title: 'Des milliers de personnes, <em>une file qui avance.</em>', img: 'festival', type: 'Festival',
      text: "Grosses affluences et longues soirées : on dimensionne le nombre de postes avec vous, pour servir chaud et vite du premier concert au dernier.",
      facts: ["Jusqu'à 150 portions par heure et par poste", 'Postes ajoutés selon la fréquentation', 'Pasta Box qui se mange debout, à une main'] },
    sport: { kicker: 'Événements sportifs', title: "Le repas d'après l'effort, <em>prêt à l'arrivée.</em>", img: 'marathon', type: 'Événement sportif',
      text: "Courses, marathons, tournois : un plat de pâtes chaud, simple et sain, pour refaire le plein de glucides et bien récupérer. Pour les participants, les bénévoles et le public, avec des quantités prévues à l'avance avec l'organisation.",
      facts: ['Des glucides pour la récupération', 'Service rapide aux heures d’arrivée', 'Trois sauces, dont deux végétariennes'] },
    entreprise: { kicker: 'Entreprises & B2B', title: 'Afterworks, séminaires, <em>portes ouvertes.</em>', img: 'entreprise', type: 'Entreprise / B2B',
      text: "Un stand qui cuisine devant vos équipes et vos invités : simple à accueillir, convivial, et chacun choisit sa sauce.",
      facts: ['Installation discrète, intérieur ou extérieur', 'Carte courte, adaptée aux régimes', 'Devis selon le nombre de convives'] },
    fete: { kicker: 'Fêtes communales & marchés', title: 'Une grande tablée <em>de quartier.</em>', img: 'fete-communale', type: 'Fête communale / marché',
      text: "Des familles, des voisins, toutes les générations : une box généreuse à prix accessible, servie sans attente.",
      facts: ['Portions pour les petits et les grands', 'Stand autonome, rapide à installer', 'Pâtes artisanales de Genève, sauces faites maison'] },
    prive: { kicker: 'Événements privés', title: 'Mariages, anniversaires, <em>fêtes de famille.</em>', img: 'prive', type: 'Événement privé',
      text: "Un repas chaleureux et sans chichis pour vos invités, dans votre jardin ou votre salle.",
      facts: ['Formule adaptée au nombre d’invités', 'Bolognese au bœuf suisse halal, Pesto et Pomodoro végétariens', "Emplacement, électricité et eau : on fait le point avec vous avant l'événement"] },
  };
  const dialog = document.getElementById('eventDialog');
  const $ = (id) => document.getElementById(id);
  let opener = null, chosenType = null;
  // titres : seul <em>…</em> est reconnu, tout le reste est inséré comme du texte (jamais interprété comme du HTML)
  const setTitle = (el, str) => {
    el.replaceChildren(...str.split(/(<em>.*?<\/em>)/).filter(Boolean).map((part) => {
      const m = /^<em>(.*)<\/em>$/.exec(part);
      if (!m) return document.createTextNode(part);
      const em = document.createElement('em'); em.textContent = m[1]; return em;
    }));
  };
  const openDetail = (d, img, ctaLabel) => {
    $('eventKicker').textContent = d.kicker;
    setTitle($('eventTitle'), d.title);
    $('eventText').textContent = d.text;
    $('eventFacts').replaceChildren(...d.facts.map((f) => { const li = document.createElement('li'); li.textContent = f; return li; }));
    $('eventImg').src = img;
    $('eventImg').alt = d.kicker;
    $('eventCta').textContent = ctaLabel;
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', ''); // anciens navigateurs sans <dialog>
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
  const closeDialog = () => { if (dialog.close) dialog.close(); else { dialog.removeAttribute('open'); dialog.dispatchEvent(new Event('close')); } };
  $('eventClose').addEventListener('click', closeDialog);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) closeDialog(); });
  dialog.addEventListener('close', () => opener?.focus({ preventScroll: true }));
  $('eventCta').addEventListener('click', (e) => {
    e.preventDefault();
    const sel = document.querySelector('#bookForm select[name="type"]');
    if (sel && chosenType) sel.value = chosenType;
    closeDialog();
    holdScroll(1200);
    scrollToY(contact.getBoundingClientRect().top + window.scrollY);
  });

  /* ---------- Formulaire : email pré-rempli ---------- */
  const form = document.getElementById('bookForm');
  const out = document.getElementById('formOut');
  const text = document.getElementById('formText');
  const mail = document.getElementById('formMail');
  // anti-spam invisible : un champ piège que seuls les robots remplissent, et un délai minimum avant l'envoi
  const shownAt = Date.now();
  const clean = (v, max) => String(v || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (form.elements.site && form.elements.site.value) return; // robot : on ne prépare rien
    if (Date.now() - shownAt < 2000) return;
    if (!form.reportValidity()) return;
    const raw = Object.fromEntries(new FormData(form));
    const d = { type: clean(raw.type, 40), nom: clean(raw.nom, 80), email: clean(raw.email, 120), date: clean(raw.date, 10),
      lieu: clean(raw.lieu, 120), personnes: clean(raw.personnes, 6), message: clean(raw.message, 1500) };
    if (d.date && !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) d.date = '';
    if (d.personnes && !/^\d+$/.test(d.personnes)) d.personnes = '';
    const date = d.date ? new Date(d.date + 'T12:00').toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' }) : 'à définir';
    const body = [
      "Bonjour Pasta Mo',", '',
      'Nous aimerions vous faire venir à notre événement.', '',
      `Type : ${d.type}`, `Date : ${date}`, `Lieu : ${d.lieu || 'à préciser'}`, `Personnes (estimation) : ${d.personnes || 'à définir'}`, '',
      d.message ? d.message + '\n' : '', d.nom, d.email,
    ].join('\n');
    text.textContent = body;
    mail.href = `mailto:ciao@pastamo.ch?subject=${encodeURIComponent(`Événement · ${d.type} · ${date}`)}&body=${encodeURIComponent(body)}`;
    out.hidden = false;
  });
  document.getElementById('formCopy').addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText(text.textContent); e.target.textContent = 'Copié'; }
    catch { e.target.textContent = 'Sélectionnez le texte ci-dessus'; }
  });
})();
