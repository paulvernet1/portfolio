// Trace d’images
// - En bougeant la souris, les posts apparaissent sous le curseur, l’un après
//   l’autre, puis s’effacent.
// - Quand le curseur s’arrête, la dernière image reste posée : un clic ouvre
//   l’article.
// - Sur mobile : toucher pose une image, glisser le doigt dessine une trace.
// Les posts sont lus dans la liste <ul class="posts"> de index.html.
(function () {
  // ---------- Réglages ----------
  var ESPACEMENT = 130;     // distance (px maquette) à parcourir avant une nouvelle image (plus grand = plus espacé)
  var DUREE_VIE = 900;      // ms avant qu’une image de la trace commence à s’effacer
  var DELAI_POSE = 260;     // ms d’arrêt du curseur avant que la dernière image reste posée
  var MAX_IMAGES = 16;      // nombre maximum d’images à l’écran
  var ROTATION = 6;         // inclinaison aléatoire maximale, en degrés

  var scene = document.querySelector('.scene');
  var liens = Array.prototype.slice.call(document.querySelectorAll('.posts a'));
  if (!scene || !liens.length) return;

  var reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var unite = function () { return window.innerWidth / 1728; };
  var espacement = function () { return Math.max(70, ESPACEMENT * unite()); };

  // ---------- Préchargement ----------
  // Chaque image est téléchargée et décodée à l’avance : une image n’entre
  // dans la trace qu’une fois prête, pour qu’elle s’affiche instantanément
  // (en ligne, sinon, on bougerait la souris sans rien voir apparaître).
  var posts = liens.map(function (a) {
    var media = a.querySelector('img, video');
    var post = { href: a.getAttribute('href'), media: media, pret: false };
    if (!media) return post;
    if (media.tagName === 'IMG') {
      var i = new Image();
      i.src = media.getAttribute('src');
      var fini = function () { post.pret = i.naturalWidth > 0; };
      (i.decode ? i.decode() : Promise.reject()).then(fini, function () { i.onload = fini; if (i.complete) fini(); });
    } else {
      if (media.readyState >= 2) post.pret = true;
      media.addEventListener('loadeddata', function () { post.pret = true; }, { once: true });
      media.load();
    }
    return post;
  }).filter(function (p) { return p.media; });

  var index = Math.floor(Math.random() * posts.length);
  function suivant() {
    for (var k = 0; k < posts.length; k++) {
      index = (index + 1) % posts.length;
      if (posts[index].pret) return posts[index];
    }
    return null;                            // rien n’est encore chargé
  }

  // ---------- Création d’une image ----------
  var traces = [];          // images à l’écran, de la plus ancienne à la plus récente
  var posee = null;         // image restée sous le curseur

  function creer(x, y) {
    var post = suivant();
    if (!post) return null;
    var el = document.createElement('a');
    el.className = 'trace';
    el.href = post.href;
    el.target = '_blank';
    el.rel = 'noopener';
    el.tabIndex = -1;

    var media = post.media.cloneNode(true);
    media.removeAttribute('alt');
    media.setAttribute('alt', '');
    if (media.tagName === 'VIDEO') {
      media.muted = true; media.loop = true; media.playsInline = true; media.autoplay = true;
    }
    el.appendChild(media);
    scene.appendChild(el);
    if (media.tagName === 'VIDEO') { var p = media.play(); if (p && p.catch) p.catch(function () {}); }

    var r = reduit ? 0 : (Math.random() * 2 - 1) * ROTATION;
    var base = 'translate(' + x + 'px,' + y + 'px) translate(-50%,-50%) rotate(' + r + 'deg)';
    el.style.transform = base;
    var trace = { el: el, base: base, minuteur: null, sortie: false };

    if (!reduit) {
      el.animate(
        [{ opacity: 0, transform: base + ' scale(.7)' }, { opacity: 1, transform: base + ' scale(1)' }],
        { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' }
      );
    }

    traces.push(trace);
    while (traces.length > MAX_IMAGES) retirer(traces[0], true);
    return trace;
  }

  function programmerSortie(trace, delai) {
    clearTimeout(trace.minuteur);
    trace.minuteur = setTimeout(function () { retirer(trace, false); }, delai);
  }

  function retirer(trace, immediat) {
    if (trace.sortie) return;
    trace.sortie = true;
    clearTimeout(trace.minuteur);
    if (posee === trace) posee = null;
    var i = traces.indexOf(trace);
    if (i !== -1) traces.splice(i, 1);
    trace.el.classList.remove('posee');
    if (immediat || reduit) {
      if (reduit && !immediat) {
        trace.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250 }).onfinish = function () { trace.el.remove(); };
      } else trace.el.remove();
      return;
    }
    var anim = trace.el.animate(
      [{ opacity: 1, transform: trace.base + ' scale(1)' }, { opacity: 0, transform: trace.base + ' scale(.92)' }],
      { duration: 650, easing: 'ease-in', fill: 'forwards' }
    );
    anim.onfinish = function () { trace.el.remove(); };
  }

  function poser(trace) {
    if (!trace || trace.sortie) return;
    if (posee && posee !== trace) liberer();
    clearTimeout(trace.minuteur);
    trace.el.classList.add('posee');
    posee = trace;
  }

  function liberer() {
    if (!posee) return;
    var t = posee;
    posee = null;
    t.el.classList.remove('posee');
    programmerSortie(t, 200);
  }

  // ---------- Suivi du curseur ----------
  var dernier = null;       // dernière position du curseur
  var parcouru = 0;         // distance parcourue depuis la dernière image
  var minuteurPose = null;
  var derniereTrace = null;

  // On additionne tout le chemin parcouru par le curseur (et pas seulement
  // la distance à vol d’oiseau) : même de petits mouvements finissent par
  // faire apparaître une image.
  function deplacer(x, y) {
    if (!dernier) dernier = { x: x, y: y };
    parcouru += Math.hypot(x - dernier.x, y - dernier.y);
    dernier = { x: x, y: y };
    if (parcouru >= espacement()) {
      var t = creer(x, y);
      if (t) {
        liberer();
        derniereTrace = t;
        programmerSortie(t, DUREE_VIE);
        parcouru = 0;
      }
    }
    clearTimeout(minuteurPose);
    minuteurPose = setTimeout(function () { poser(derniereTrace); }, DELAI_POSE);
  }

  function surPosee(cible) { return cible && cible.closest && cible.closest('.trace.posee'); }

  scene.addEventListener('pointermove', function (ev) {
    if (ev.pointerType !== 'mouse' && ev.buttons === 0) return;  // au doigt : seulement en glissant
    deplacer(ev.clientX, ev.clientY);
  });

  // Au doigt uniquement (mobile) : toucher l’écran pose une image.
  // À la souris, les images n’apparaissent qu’en bougeant.
  scene.addEventListener('pointerdown', function (ev) {
    if (ev.pointerType === 'mouse') return;
    if (surPosee(ev.target)) return;        // toucher une image posée : le lien s’ouvre
    var t = creer(ev.clientX, ev.clientY);
    if (!t) return;
    liberer();
    derniereTrace = t;
    dernier = { x: ev.clientX, y: ev.clientY };
    parcouru = 0;
    poser(t);
  });

})();
