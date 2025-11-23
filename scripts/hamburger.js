
(function () {
  const ham = document.getElementById('gn-hamburger');
  const nav = document.getElementById('gn-mobile-nav');
  if(!ham || !nav) return;

  const backdrop = nav.querySelector('.gn-mobile-backdrop');
  const searchTrigger = document.getElementById('gn-search-btn'); // your existing search button in header
  const themeTrigger  = document.getElementById('theme-toggle'); // your existing theme toggle
  const mobileSearchBtn = nav.querySelector('.gn-mobile-search');
  const mobileThemeBtn  = nav.querySelector('.gn-mobile-theme');

  function openMenu(){
    nav.classList.add('open');
    ham.classList.add('open');
    nav.setAttribute('aria-hidden','false');
    ham.setAttribute('aria-expanded','true');
    document.body.style.overflow = 'hidden';
  }

  function closeMenu(){
    nav.classList.remove('open');
    ham.classList.remove('open');
    nav.setAttribute('aria-hidden','true');
    ham.setAttribute('aria-expanded','false');
    document.body.style.overflow = '';
    ham.focus();
  }

  ham.addEventListener('click', () => nav.classList.contains('open') ? closeMenu() : openMenu() );
  backdrop.addEventListener('click', closeMenu);

  // Wire mobile search to your existing search UI
  if(mobileSearchBtn && searchTrigger) {
    mobileSearchBtn.addEventListener('click', () => {
      searchTrigger.click();
      closeMenu();
    });
  }

  if(mobileThemeBtn && themeTrigger) {
    mobileThemeBtn.addEventListener('click', () => {
      themeTrigger.click();
      // short delay so user sees theme change
      setTimeout(closeMenu, 150);
    });
  }

  // Close menu on link click
  nav.querySelectorAll('.gn-mobile-links a').forEach(a => {
    a.addEventListener('click', closeMenu);
  });

  // Close on escape
  window.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && nav.classList.contains('open')) closeMenu();
  });

  // Close if resizing to desktop
  window.addEventListener('resize', () => {
    if(window.innerWidth > 900 && nav.classList.contains('open')) closeMenu();
  });

  // Accessibility defaults
  nav.setAttribute('aria-hidden','true');
  ham.setAttribute('aria-expanded','false');

})();

/* Optimized GN carousel: rAF autoplay + IntersectionObserver + lazy-friendly */
(function () {
  const carousel = document.querySelector('.gn-carousel');
  if (!carousel) return;

  const track = carousel.querySelector('.gn-carousel-track');
  const slides = Array.from(carousel.querySelectorAll('.gn-slide'));
  const nextBtn = carousel.querySelector('.gn-next');
  const prevBtn = carousel.querySelector('.gn-prev');

  let index = 0;
  const total = slides.length;
  const autoplayDelay = 10000; // ms
  let rafId = null;
  let lastTime = 0;
  let playing = true;
  let accum = 0;

  // compute width and set exact transform
  function updateTrackTransform() {
    // Use translate3d for GPU acceleration
    track.style.transform = `translate3d(-${index * 100}%, 0, 0)`;
    // mark visibility for slide-content optimization
    slides.forEach((s, i) => s.classList.toggle('is-visible', i === index));
  }

  // debounced resize to avoid layout thrash
  let resizeTimer = null;
  function onResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      updateTrackTransform();
    }, 120);
  }
  window.addEventListener('resize', onResize);

  // Arrow controls (lightweight)
  if (nextBtn) nextBtn.addEventListener('click', () => goto(index + 1));
  if (prevBtn) prevBtn.addEventListener('click', () => goto(index - 1));

  function goto(i) {
    index = (i + total) % total;
    updateTrackTransform();
    resetTimer();
  }

  // Autoplay via rAF for smoothness
  function resetTimer() {
    accum = 0;
    lastTime = performance.now();
  }

  function step(now) {
    if (!playing) { rafId = requestAnimationFrame(step); return; }
    const dt = now - lastTime;
    lastTime = now;
    accum += dt;
    if (accum >= autoplayDelay) {
      goto(index + 1);
      accum = 0;
    }
    rafId = requestAnimationFrame(step);
  }

  // Pause/resume using IntersectionObserver to prevent wasted CPU offscreen
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) {
        playing = false;
      } else {
        playing = true;
        resetTimer();
      }
    });
  }, { threshold: 0.6 });
  io.observe(carousel);

  // Respect reduced motion: disable autoplay
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    playing = false;
  }

  // Start rAF loop
  resetTimer();
  rafId = requestAnimationFrame(step);

  // Ensure initial layout is correct
  updateTrackTransform();

  // Clean up on navigation unload (optional)
  window.addEventListener('beforeunload', () => {
    if (rafId) cancelAnimationFrame(rafId);
  });

})();
