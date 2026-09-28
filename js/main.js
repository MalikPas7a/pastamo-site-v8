(() => {
  const root = document.documentElement;
  const isDesktop = root.classList.contains('is-desktop');
  const reduced = root.classList.contains('is-reduced');
  const { gsap, ScrollTrigger, Lenis } = window;
  const animated = !!(gsap && ScrollTrigger) && !reduced;
  if (animated) { gsap.registerPlugin(ScrollTrigger); root.classList.add('js-anim'); }

  /* ---------- Défilement fluide (ordinateur) ---------- */
  let lenis = null;
  if (animated && isDesktop && Lenis) {
    lenis = new Lenis({ lerp: 0.12 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { duration: 1.4 });
    else target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  }));

  /* ---------- Navigation, bouton flottant, rubrique active ---------- */
  const nav = document.getElementById('nav');
  const fab = document.getElementById('fab');
  const contact = document.getElementById('contact');
  const onScroll = () => {
    const y = window.scrollY;
    nav.classList.toggle('scrolled', y > innerHeight * 0.6);
    const c = contact.getBoundingClientRect();
    fab.classList.toggle('show', (!isDesktop || y > innerHeight * 0.8) && !(c.top < innerHeight * 0.85 && c.bottom > 0));
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const links = [...document.querySelectorAll('.nav-links a')];
  const spy = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) links.forEach((l) => l.classList.toggle('on', l.getAttribute('href') === `#${e.target.id}`));
  }), { rootMargin: '-45% 0px -50% 0px' });
  ['box', 'evenements', 'stand', 'histoire'].forEach((id) => spy.observe(document.getElementById(id)));

  /* ---------- Son d'ambiance (coupé par défaut) ---------- */
  const sound = (() => {
    const toggle = document.getElementById('soundToggle');
    let on = false, current = null, beds = null, fx = null;
    const make = (file, loop, vol) => { const a = new Audio(`assets/sound/${file}.mp3`); a.loop = loop; a.preload = 'none'; a.volume = 0; a.dataset.max = vol; return a; };
    // les lecteurs audio ne sont créés qu'au premier clic sur « Son » : rien n'est préparé pour un visiteur qui ne l'active pas
    const ensure = () => {
      if (beds) return;
      beds = { cuisine: make('son-cuisine', true, 0.3), terrasse: make('son-terrasse', true, 0.3) };
      fx = { neon: make('son-neon-allumage', false, 0.35), sauce: make('son-sauce', false, 0.4) };
    };
    const fade = (a, to, ms = 1400) => {
      const from = a.volume, t0 = performance.now();
      if (to > 0 && a.paused) a.play().catch(() => {});
      const step = (t) => { const k = Math.min(1, (t - t0) / ms); a.volume = from + (to - from) * k; if (k < 1) requestAnimationFrame(step); else if (to === 0) a.pause(); };
      requestAnimationFrame(step);
    };
    const setBed = (name) => { current = name; if (on) Object.entries(beds).forEach(([k, a]) => fade(a, k === name ? +a.dataset.max : 0)); };
    const play = (name) => { if (!on) return; const a = fx[name]; a.currentTime = 0; a.volume = +a.dataset.max; a.play().catch(() => {}); };
    toggle.addEventListener('click', () => {
      on = !on;
      toggle.setAttribute('aria-pressed', String(on));
      toggle.setAttribute('aria-label', on ? "Couper le son d'ambiance" : "Activer le son d'ambiance");
      if (on) ensure();
      if (on && current) setBed(current); else if (!on) Object.values(beds).forEach((a) => fade(a, 0, 500));
    });
    return { setBed, play };
  })();
  [['box', 'cuisine'], ['evenements', 'terrasse'], ['stand', 'terrasse']].forEach(([id, bed]) => {
    new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) sound.setBed(bed); }), { threshold: 0.3 }).observe(document.getElementById(id));
  });

  /* ---------- Vidéos : chargées à l'approche, jouées à l'écran ---------- */
  const srcFor = (v) => (isDesktop ? `assets/video/${v.dataset.video}.mp4` : `assets/video/${v.dataset.mobile || v.dataset.video}-m.mp4`);
  const videos = [...document.querySelectorAll('video[data-video]')];
  if (!isDesktop) videos.forEach((v) => { if (v.dataset.mobile) v.poster = `assets/poster/${v.dataset.mobile}.webp`; });
  const load = (v) => { if (!v.getAttribute('src')) { v.src = srcFor(v); v.load(); } };
  const loader = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) load(e.target); }), { rootMargin: '100% 0px' });
  const player = new IntersectionObserver((es) => es.forEach((e) => {
    const v = e.target;
    if (e.isIntersecting) { load(v); v.play().catch(() => {}); } else v.pause();
  }), { threshold: 0.35 });
  videos.forEach((v) => { loader.observe(v); player.observe(v); });

  /* ---------- 1. L'enseigne néon s'allume (vraie vidéo), puis vit ---------- */
  const neon = document.getElementById('neonVideo');
  const heroCopy = document.querySelectorAll('.hero-copy > *');
  const showCopy = () => { if (animated) gsap.to(heroCopy, { opacity: 1, y: 0, duration: 1.2, ease: 'expo.out', stagger: 0.1 }); };
  neon.src = `assets/video/neon-allumage${isDesktop ? '' : '-m'}.mp4`;
  if (reduced) { neon.poster = 'assets/img/neon-on.webp'; neon.removeAttribute('src'); }
  else {
    const start = () => { neon.play().then(() => { sound.play('neon'); setTimeout(showCopy, 1800); }).catch(() => { neon.poster = 'assets/img/neon-on.webp'; showCopy(); }); };
    if (neon.readyState >= 3) setTimeout(start, 500); else neon.addEventListener('canplaythrough', () => setTimeout(start, 500), { once: true });
    setTimeout(() => { if (neon.paused && neon.currentTime === 0) { neon.poster = 'assets/img/neon-on.webp'; showCopy(); } }, 6000);
    // une fois allumé, un tube hésite de temps en temps, comme un vrai néon
    neon.addEventListener('ended', () => {
      const blip = () => {
        if (animated) gsap.timeline().to(neon, { filter: 'brightness(.72)', duration: 0.05 }).to(neon, { filter: 'brightness(1)', duration: 0.08 }).to(neon, { filter: 'brightness(.85)', duration: 0.04, delay: 0.05 }).to(neon, { filter: 'brightness(1)', duration: 0.1 });
        setTimeout(blip, 7000 + Math.random() * 8000);
      };
      setTimeout(blip, 5000);
    });
  }

  boxfilmSetup();
  if (!animated) { formSetup(); return; }

  // En quittant l'ouverture, le néon s'éloigne dans le noir
  gsap.to('.hero-media', { opacity: 0.25, scale: 0.96, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });

  /* ---------- 4. Événements : la galerie glisse à l'horizontale (ordinateur) ---------- */
  if (isDesktop) {
    const track = document.getElementById('eventsTrack');
    const dist = () => Math.max(0, track.scrollWidth - innerWidth + 40);
    gsap.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: '.events-pin', start: 'top top', end: () => `+=${dist()}`, pin: true, scrub: 0.6, invalidateOnRefresh: true, anticipatePin: 1 } });
  }
  gsap.from('.events-head > *', { opacity: 0, y: 24, duration: 1, ease: 'expo.out', stagger: 0.08, scrollTrigger: { trigger: '.events', start: 'top 75%', once: true } });

  /* ---------- 5. Le stand : les informations s'allument une à une ---------- */
  gsap.from('.stand-copy .eyebrow, .stand-copy .title', { opacity: 0, y: 24, duration: 1.1, ease: 'expo.out', stagger: 0.1, scrollTrigger: { trigger: '.stand-copy', start: 'top 80%', once: true } });
  gsap.utils.toArray('.stand-facts li').forEach((li, i) => {
    gsap.timeline({ scrollTrigger: { trigger: '.stand-facts', start: 'top 78%', once: true }, delay: 0.25 + i * 0.28 })
      .from(li, { opacity: 0, duration: 0.5 })
      .to(li, { '--lit': 1, duration: 0.05 }, '<')
      .to(li, { '--lit': 0.2, duration: 0.06 })
      .to(li, { '--lit': 1, duration: 0.5, ease: 'power2.out' })
      .to(li, { '--lit': 0.35, duration: 1.4, ease: 'power1.out' });
  });

  /* ---------- 6 & 7. Histoire, contact ---------- */
  gsap.from('.story > *', { opacity: 0, y: 20, duration: 1.2, ease: 'power2.out', stagger: 0.12, scrollTrigger: { trigger: '.story', start: 'top 75%', once: true } });
  gsap.timeline({ scrollTrigger: { trigger: '.contact', start: 'top 70%', once: true } })
    .from('.neon-title em', { opacity: 0.15, duration: 0.06 })
    .to('.neon-title em', { opacity: 0.4, duration: 0.05 })
    .to('.neon-title em', { opacity: 1, duration: 0.6, ease: 'power2.out' });

  formSetup();

  /* ---------- La Pasta Box : les films avancent au rythme du défilement ---------- */
  // Chaque recette est une suite d'images (film pré-rendu) dessinée dans un cadre fixe ; un voile sombre
  // sépare les recettes et éteint la lumière sur la box avant les événements.
  function boxfilmSetup() {
    const section = document.getElementById('box');
    const canvas = document.getElementById('boxCanvas');
    const ctx = canvas.getContext('2d');
    const veil = section.querySelector('.boxfilm-veil');
    const steps = [...section.querySelectorAll('.box-step')];
    const phone = !matchMedia('(min-width: 821px)').matches;
    const variant = phone ? 'm' : 'd';
    const films = { artisan: 72, bolognese: 96, pesto: 1, pomodoro: 96 };
    const src = (key, i) => (films[key] === 1 ? `assets/box/${key}/${variant}.webp` : `assets/box/${key}/${variant}/${String(i + 1).padStart(3, '0')}.webp`);
    const cache = {};
    let cur = { key: 'artisan', f: 0 };
    let W = 0, H = 0;

    const load = (key) => {
      if (cache[key]) return;
      cache[key] = [];
      const n = films[key];
      // première et dernière image d'abord, pour pouvoir dessiner tout de suite
      const order = [...new Set([0, n - 1, ...Array.from({ length: n }, (_, i) => i)])];
      order.forEach((i) => {
        const im = new Image();
        im.decoding = 'async';
        // l'image reste compressée en mémoire (quelques dizaines de Ko) ; seules ses voisines sont décodées
        im.onload = () => { cache[key][i] = im; if (cur.key === key && Math.abs(i - cur.f) < 3) schedule(); };
        im.src = src(key, i);
      });
    };
    // Décode à l'avance les images qui vont s'afficher (surtout celles qui suivent), hors du fil principal :
    // le défilement n'attend pas, et la mémoire du téléphone n'est jamais saturée par tout le film décodé.
    const primed = new Set();
    const prime = (key, f) => {
      const arr = cache[key] || [];
      for (let i = f - 3; i <= f + 8; i++) {
        const im = arr[i], id = key + i;
        if (!im || primed.has(id) || !im.decode) continue;
        primed.add(id);
        im.decode().catch(() => primed.delete(id));
      }
      if (primed.size > 60) primed.clear();
    };
    const nearest = (key, f) => {
      const arr = cache[key] || [];
      for (let d = 0; d < films[key]; d++) { if (arr[f - d]) return arr[f - d]; if (arr[f + d]) return arr[f + d]; }
      return null;
    };
    // Placement de l'image et vignettage : calculés une fois par taille d'écran, pas à chaque image.
    let rect = null, vignette = null, drawn = null, frame = 0;
    const layout = (iw, ih, key) => {
      // ordinateur : box à gauche, un peu en retrait, texte à droite ; téléphone : box en haut, pleine largeur.
      // La scène de l'artisan occupe toute la largeur de son image : on la tient dans les deux tiers gauches.
      const wide = key === 'artisan' && !phone;
      const s = phone ? W / iw : wide ? Math.min((H / ih) * 0.88, (W * 0.64) / iw) : (H / ih) * 0.88;
      const dw = iw * s, dh = ih * s;
      const dx = phone ? (W - dw) / 2 : wide ? W * 0.03 : Math.min(W * 0.36 - 0.375 * dw, (W - dw) / 2);
      const dy = phone ? H * 0.07 : (H - dh) / 2 + H * 0.03;
      rect = { iw, ih, key: wide, dx, dy, dw, dh };
      // les bords de l'image se fondent dans le noir du décor
      vignette = document.createElement('canvas');
      vignette.width = W; vignette.height = H;
      const v = vignette.getContext('2d');
      v.fillStyle = '#0c0a09';
      v.fillRect(0, 0, W, Math.max(0, dy)); v.fillRect(0, dy + dh, W, H); v.fillRect(0, 0, Math.max(0, dx), H); v.fillRect(dx + dw, 0, W, H);
      const fade = (x0, y0, x1, y1) => {
        const g = v.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, 'rgba(12,10,9,1)');
        g.addColorStop(1, 'rgba(12,10,9,0)');
        v.fillStyle = g;
        v.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || W, Math.abs(y1 - y0) || H);
      };
      fade(dx, 0, dx + dw * 0.1, 0);
      fade(dx + dw, 0, dx + dw * 0.86, 0);
      fade(0, dy, 0, dy + dh * 0.14);
      fade(0, dy + dh, 0, dy + dh * 0.86);
    };
    function draw() {
      frame = 0;
      const im = nearest(cur.key, cur.f);
      if (!im || !W || im === drawn) return;
      const wide = cur.key === 'artisan' && !phone;
      if (!rect || rect.iw !== im.naturalWidth || rect.ih !== im.naturalHeight || rect.key !== wide) layout(im.naturalWidth, im.naturalHeight, cur.key);
      ctx.fillStyle = '#0c0a09';
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(im, rect.dx, rect.dy, rect.dw, rect.dh);
      ctx.drawImage(vignette, 0, 0);
      drawn = im;
    }
    // un seul dessin par image d'écran, quel que soit le nombre d'événements de défilement
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    const resize = () => {
      const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, phone ? 1.5 : 2);
      const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
      if (w === W && h === H) return;
      W = canvas.width = w;
      H = canvas.height = h;
      rect = null; drawn = null;
      schedule();
    };
    const update = () => {
      const mid = innerHeight * 0.5;
      let veilOp = 1;
      steps.forEach((st, k) => {
        const r = st.getBoundingClientRect();
        const inside = r.top <= mid && r.bottom > mid;
        const p = (mid - r.top) / r.height;
        // le texte apparaît une fois la recette dévoilée et s'efface avant de repartir, sans jamais passer sur la box
        st.classList.toggle('is-on', inside && p > 0.06 && p < 0.8);
        if (!inside) return;
        const key = st.dataset.recipe, n = films[key];
        load(key);
        if (steps[k + 1]) load(steps[k + 1].dataset.recipe);
        // le geste se joue entre 12 % et 85 % de l'étape ; en mouvement réduit, on montre l'image finale
        const fp = reduced ? 1 : Math.min(1, Math.max(0, (p - 0.12) / 0.73));
        cur = { key, f: Math.round(fp * (n - 1)) };
        prime(key, cur.f);
        veilOp = 1 - Math.min(1, Math.min(p, 1 - p) / 0.1);
      });
      veil.style.opacity = veilOp.toFixed(3);
      schedule();
    };
    // Les images ne se chargent qu'une fois la page prête (elles ne retardent jamais l'ouverture) ;
    // les recettes suivantes arrivent à l'approche de la box.
    const start = () => {
      load('artisan'); load('bolognese');
      new IntersectionObserver((es, io) => { if (es.some((e) => e.isIntersecting)) { Object.keys(films).forEach(load); io.disconnect(); } }, { rootMargin: '0px 0px 80% 0px' })
        .observe(section);
    };
    if (document.readyState === 'complete') start(); else addEventListener('load', start, { once: true });
    resize();
    addEventListener('resize', resize);
    addEventListener('scroll', update, { passive: true });
    if (lenis) lenis.on('scroll', update);
    update();
  }

  /* ---------- Formulaire : email pré-rempli ---------- */
  function formSetup() {
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
  }
})();
