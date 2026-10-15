/* BC Glass & Tint - site polish: tooltip timing, hover lift, scroll reveal.
   Progressive enhancement: nothing is hidden without JS; respects reduced-motion.
   Only elements BELOW the fold are animated in, so there is no flash or layout shift. */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var css = ''
    /* Tooltips: wait ~400ms before showing (industry-standard hover delay), hide instantly. */
    + '[data-tip]:hover::after,[data-tip]:hover::before,'
    + '[data-tip]:focus-visible::after,[data-tip]:focus-visible::before{transition-delay:.4s}'
    /* Service cards pop up on hover. */
    + '.card{transition:transform .28s cubic-bezier(.2,.7,.2,1),box-shadow .28s ease}'
    + '.card:hover{transform:translateY(-6px);box-shadow:0 16px 34px rgba(0,0,0,.13)}'
    /* Buttons + chips get a subtle micro-lift. */
    + '.qbtn,.qsmall,.callbtn,.send,.revbadge,.chip,.lmore{transition:transform .2s ease,box-shadow .2s ease}'
    + '.qbtn:hover,.qsmall:hover,.callbtn:hover,.send:hover{transform:translateY(-2px)}'
    + '.lmore:hover{transform:translateX(3px)}'
    + '.chip:hover{transform:translateY(-2px);border-color:var(--gold)}'
    + '.revbadge:hover{transform:translateY(-3px);box-shadow:0 10px 22px rgba(0,0,0,.10)}';

  if (!reduce) {
    css += '@media print{.reveal{opacity:1 !important;transform:none !important}}'
         + '.reveal{opacity:0;transform:translateY(20px);'
         + 'transition:opacity .7s ease,transform .7s cubic-bezier(.2,.7,.2,1)}'
         + '.reveal.seen{opacity:1;transform:none}';
  }
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  if (reduce) return;

  /* Scroll reveal ---------------------------------------------------------- */
  var sel = '.card, .why .item, .faq2 .item, .chips .chip, .metric, .storefronts, .yelpblock';
  var vh = window.innerHeight || document.documentElement.clientHeight;
  var targets = [];

  [].slice.call(document.querySelectorAll(sel)).forEach(function (el) {
    // Only hide things that start below the fold -> no flash for what's already visible.
    if (el.getBoundingClientRect().top <= vh * 0.9) return;
    el.classList.add('reveal');
    // Gentle stagger for items that share a parent (cards in a row, chips, FAQ list).
    var sibs = el.parentNode
      ? [].slice.call(el.parentNode.children).filter(function (c) { return c.classList.contains('reveal'); })
      : [];
    var idx = sibs.indexOf(el);
    if (idx > 0) el.style.transitionDelay = Math.min(idx * 70, 280) + 'ms';
    targets.push(el);
  });

  if (!('IntersectionObserver' in window)) {
    targets.forEach(function (el) { el.classList.add('seen'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var el = e.target;
      el.classList.add('seen');
      io.unobserve(el);
      // Once the reveal finishes, drop the classes so native hover transitions
      // (e.g. the card lift + shadow) take back over cleanly. Element stays visible.
      setTimeout(function () {
        el.classList.remove('reveal', 'seen');
        el.style.transitionDelay = '';
      }, 850);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  targets.forEach(function (el) { io.observe(el); });
})();
/* r1-failsafe: never leave content hidden if the observer never fires */
setTimeout(function(){try{document.querySelectorAll('.reveal').forEach(function(el){el.classList.remove('reveal');el.style.transitionDelay=''})}catch(e){}},4000);
