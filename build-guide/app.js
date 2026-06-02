/* =========================================================================
   Codex Mobile — Build Guide :: interações
   ========================================================================= */
(function () {
  "use strict";

  /* ---------- Tema (persistente) ---------- */
  var root = document.documentElement;
  var THEME_KEY = "cmg-theme";
  try {
    var saved = localStorage.getItem(THEME_KEY);
    if (saved) root.setAttribute("data-theme", saved);
  } catch (e) {}

  function toggleTheme() {
    var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  }

  /* ---------- Copiar código (com fallback file://) ---------- */
  function copyText(text, btn) {
    function done() {
      var label = btn.querySelector(".lbl");
      var old = label ? label.textContent : "";
      btn.classList.add("copied");
      if (label) label.textContent = "Copiado!";
      setTimeout(function () {
        btn.classList.remove("copied");
        if (label) label.textContent = old || "Copiar";
      }, 1600);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallback(text, done); });
    } else {
      fallback(text, done);
    }
  }
  function fallback(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); } catch (e) {}
    document.body.removeChild(ta);
  }

  /* ---------- Tabs ---------- */
  function initTabs(scope) {
    scope.querySelectorAll(".tabs").forEach(function (tabs) {
      var btns = tabs.querySelectorAll(".tabs__btn");
      var panels = tabs.querySelectorAll(".tabs__panel");
      btns.forEach(function (btn, i) {
        btn.addEventListener("click", function () {
          btns.forEach(function (b) { b.classList.remove("active"); });
          panels.forEach(function (p) { p.classList.remove("active"); });
          btn.classList.add("active");
          if (panels[i]) panels[i].classList.add("active");
        });
      });
    });
  }

  /* ---------- TOC + scrollspy ---------- */
  function buildTOC() {
    var toc = document.querySelector(".toc");
    var content = document.querySelector(".content");
    if (!toc || !content) return;
    var heads = content.querySelectorAll("h2[id], h3[id]");
    if (!heads.length) { toc.style.display = "none"; return; }
    var html = '<div class="toc__title">Nesta página</div>';
    heads.forEach(function (h) {
      var lvl = h.tagName === "H3" ? " lvl-3" : "";
      html += '<a class="toc-link' + lvl + '" href="#' + h.id + '">' + h.textContent + "</a>";
    });
    toc.innerHTML = html;

    var links = toc.querySelectorAll(".toc-link");
    var map = {};
    links.forEach(function (l) { map[l.getAttribute("href").slice(1)] = l; });

    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          links.forEach(function (l) { l.classList.remove("active"); });
          var active = map[en.target.id];
          if (active) active.classList.add("active");
        }
      });
    }, { rootMargin: "-80px 0px -70% 0px", threshold: 0 });
    heads.forEach(function (h) { spy.observe(h); });
  }

  /* ---------- Checklist persistente ---------- */
  function initChecklist() {
    var list = document.querySelector(".checklist[data-store]");
    if (!list) return;
    var key = "cmg-" + list.getAttribute("data-store");
    var boxes = list.querySelectorAll('input[type="checkbox"]');
    var fill = document.querySelector(".progress__fill");
    var label = document.querySelector(".progress__label");
    var state = {};
    try { state = JSON.parse(localStorage.getItem(key) || "{}"); } catch (e) {}

    function update() {
      var done = 0;
      boxes.forEach(function (b) { if (b.checked) done++; });
      var pct = boxes.length ? Math.round((done / boxes.length) * 100) : 0;
      if (fill) fill.style.width = pct + "%";
      if (label) label.textContent = done + " de " + boxes.length + " etapas concluídas (" + pct + "%)";
    }
    boxes.forEach(function (b, i) {
      var id = b.getAttribute("data-id") || String(i);
      if (state[id]) b.checked = true;
      b.addEventListener("change", function () {
        state[id] = b.checked;
        try { localStorage.setItem(key, JSON.stringify(state)); } catch (e) {}
        update();
      });
    });
    var reset = document.querySelector(".btn-reset");
    if (reset) reset.addEventListener("click", function () {
      boxes.forEach(function (b) { b.checked = false; });
      state = {};
      try { localStorage.removeItem(key); } catch (e) {}
      update();
    });
    update();
  }

  /* ---------- Back to top ---------- */
  function initTop() {
    var btn = document.querySelector(".totop");
    if (!btn) return;
    window.addEventListener("scroll", function () {
      btn.classList.toggle("show", window.scrollY > 600);
    }, { passive: true });
    btn.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
  }

  /* ---------- DOM ready ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    // tema
    var tt = document.querySelector(".theme-toggle");
    if (tt) tt.addEventListener("click", toggleTheme);

    // menu mobile
    var mt = document.querySelector(".menu-toggle");
    var sb = document.querySelector(".sidebar");
    if (mt && sb) mt.addEventListener("click", function () { sb.classList.toggle("open"); });

    // botões de cópia
    document.querySelectorAll(".code").forEach(function (block) {
      var bar = block.querySelector(".code__bar");
      var pre = block.querySelector("pre");
      if (!bar || !pre || bar.querySelector(".code__copy")) return;
      var btn = document.createElement("button");
      btn.className = "code__copy";
      btn.type = "button";
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
        '<span class="lbl">Copiar</span>';
      btn.addEventListener("click", function () { copyText(pre.innerText, btn); });
      bar.appendChild(btn);
    });

    initTabs(document);
    buildTOC();
    initChecklist();
    initTop();
  });
})();
