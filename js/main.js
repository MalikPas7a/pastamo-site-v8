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
     Un plan-séquence en sept étapes (néon → pâtes fraîches → trois box → stand de nuit → néon).
     Chaque mouvement de caméra est une courte vidéo lue normalement, comme n'importe quelle vidéo de fond (la méthode
     la plus sûre sur iPhone) : elle part exactement de l'image fixe de l'étape précédente et finit sur celle de la suivante.
     Un geste (défilement, glissement, flèche, « Suivant », clic sur une étape) passe à l'étape suivante ;
     revenir en arrière ou sauter plus loin se fait par un fondu. À l'arrivée, l'image reste fixe. */
  const STOPS = [
    { id: 'intro', show: ['intro'], layout: 'center' },
    { id: 'artisan', show: ['artisan'], layout: 'left', bed: 'cuisine' },
    { id: 'bolognese', show: ['bolognese'], layout: 'left' },
    { id: 'pesto', show: ['pesto'], layout: 'left' },
    { id: 'pomodoro', show: ['pomodoro'], layout: 'left' },
    { id: 'evenements', show: ['evenements'], layout: 'stand', bed: 'terrasse' },
    { id: 'histoire', show: ['histoire'], layout: 'story' },
  ];
  const FILM_V = '4'; // à changer à chaque nouveau montage, pour que les navigateurs ne gardent pas l'ancien en cache
  const src = (name) => `assets/film/${variant}/${name}?v=${FILM_V}`;

  const section = document.getElementById('immersion');
  const stage = section.querySelector('.stage');
  const media = document.getElementById('stageMedia');
  const still = document.getElementById('stageStill');
  const vids = [document.getElementById('vidA'), document.getElementById('vidB')];
  const steps = [...section.querySelectorAll('.step')];
  const layers = Object.fromEntries([...section.querySelectorAll('[data-show]')].map((l) => [l.dataset.show, l]));
  const windows = [...section.querySelectorAll('.window')];
  const dots = [...document.querySelectorAll('.journey a')];
  const journeyFill = document.getElementById('journeyFill');
  const nextBtn = document.getElementById('nextStep');
  windows.forEach((w, i) => w.style.setProperty('--i', i));
  vids.forEach((v) => { v.muted = true; v.playsInline = true; });
  // les images fixes des étapes sont petites : on les charge toutes pour des retours et des fondus instantanés
  const stills = STOPS.map((_, i) => { const im = new Image(); im.src = src(`stop-${i}.webp`); return im; });

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
  let S = 0, at = 0, playing = null, cutting = false, introDone = reduced;
  const queue = [];
  const front = (v) => vids.forEach((x) => x.classList.toggle('is-front', x === v));
  const showStill = (i) => { still.src = stills[i].src; };
  const prepare = (v, i) => {
    if (v.dataset.move === String(i)) return;
    v.dataset.move = String(i);
    v.src = src(`move-${i}.mp4`);
    v.preload = 'auto';
    v.load();
  };
  const arrive = (i) => {
    at = i;
    showStill(i);
    updateLayers();
    // prépare le mouvement suivant dans le lecteur qui n'est pas affiché (jamais dans celui qui montre l'image)
    if (i + 1 < STOPS.length && !queue.length) prepare(vids.find((v) => !v.classList.contains('is-front') && v !== playing) || vids[1], i + 1);
  };
  const playNext = () => {
    if (playing || cutting || !queue.length) return;
    const i = queue.shift();
    const v = vids.find((x) => x.dataset.move === String(i)) || vids.find((x) => !x.classList.contains('is-front')) || vids[0];
    prepare(v, i);
    playing = v;
    try { v.currentTime = 0; } catch (e) { /* pas encore chargée : elle partira du début */ }
    v.playbackRate = queue.length ? 1.6 : 1; // plusieurs gestes d'affilée : on enchaîne un peu plus vite, sans coupure
    // Safari (iPhone) refuse parfois de lancer une vidéo invisible : on l'affiche avant de la lancer.
    // Tant que sa première image n'est pas prête elle reste transparente, et l'image fixe de l'étape reste visible dessous.
    front(v);
    const done = () => {
      if (playing !== v) return;
      v.removeEventListener('timeupdate', near);
      playing = null;
      if (queue.length) { arrive(i); playNext(); return; }
      arrive(i);
      // l'image fixe de l'étape est identique à la dernière image du mouvement : on peut retirer la vidéo sans que ça se voie
      setTimeout(() => { if (!playing) front(null); }, 120);
    };
    const near = () => { if (v.duration && v.currentTime > v.duration - 0.8 && !queue.length) updateLayers(i); };
    v.addEventListener('ended', done, { once: true });
    v.addEventListener('timeupdate', near);
    const p = v.play();
    // lecture refusée (iPhone en mode économie d'énergie) : on passe directement à l'image de l'étape
    if (p && p.catch) p.catch(() => { if (playing === v) { playing = null; v.removeEventListener('timeupdate', near); arrive(i); playNext(); } });
  };
  const cutTo = (i) => {
    queue.length = 0;
    if (playing) { playing.pause(); playing = null; }
    cutting = true;
    section.classList.add('is-cut');
    updateLayers();
    setTimeout(() => {
      front(null);
      cutting = false;
      arrive(i);
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
    else { goTo(i, 'jump'); holdScroll(300); window.scrollTo(0, top); }
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

  goTo(stepFromScroll(), 'init');
  // Intro (en haut de page) : l'enseigne s'allume seule au chargement, puis l'image fixe de l'enseigne allumée prend le relais
  if (!reduced && S === 0) {
    const v = vids[0];
    v.src = src('intro.mp4');
    v.dataset.move = 'intro';
    front(v);
    const done = () => { introDone = true; if (!playing && v.classList.contains('is-front')) front(null); };
    v.addEventListener('ended', done, { once: true });
    v.addEventListener('error', done, { once: true });
    const p = v.play();
    if (p && p.catch) p.catch(done);
  }
  // iPhone en mode économie d'énergie : les vidéos ne démarrent qu'après un premier toucher ; on les « débloque » à ce moment-là
  const unlock = () => vids.forEach((v) => { if (v.src && v.paused && v !== playing) v.play().then(() => { if (v !== playing) v.pause(); }).catch(() => {}); });
  addEventListener('touchend', unlock, { once: true, passive: true });
  addEventListener('click', unlock, { once: true });

  if (S + 1 < STOPS.length) prepare(vids[1], S + 1);
  addEventListener('resize', () => place(STOPS[S].layout));
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
