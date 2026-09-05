/*
 * app.js — инициализация приложения, хеш-роутинг, service worker.
 */
(function (global) {
  'use strict';

  var VERSION = '1.2.0';

  var ROUTES = [
    { re: /^\/?$/, screen: function () { return UI.screens.home(); } },
    { re: /^\/stats$/, screen: function () { return UI.screens.stats(); } },
    { re: /^\/deck\/([^/]+)$/, screen: function (m) { return UI.screens.deck(m[1]); } },
    {
      re: /^\/deck\/([^/]+)\/(cards|flashcards|learn|test)$/,
      screen: function (m) { return UI.screens[m[2]](m[1]); }
    }
  ];

  var appNode, titleNode, backNode, actionsNode, topbarNode;
  var currentDestroy = null;
  var renderToken = 0;
  var lastRenderDay = null;

  function currentPath() {
    var hash = String(location.hash || '').replace(/^#/, '');
    return hash || '/';
  }

  function go(hash) {
    var target = hash.charAt(0) === '#' ? hash : '#' + hash;
    if (location.hash === target) render();
    else location.hash = target;
  }

  function refresh() { render(); }

  function showLoader() {
    appNode.innerHTML = '<div class="loader"><span class="spinner"></span></div>';
  }

  function setTopbar(screen) {
    titleNode.textContent = screen.title || 'Карточки';
    document.title = screen.title ? screen.title + ' · Карточки' : 'Карточки';

    if (screen.back) {
      backNode.hidden = false;
      backNode.onclick = function () { go(screen.back); };
    } else {
      backNode.hidden = true;
      backNode.onclick = null;
    }

    actionsNode.innerHTML = '';
    (screen.actions || []).forEach(function (action) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-label', action.label || '');
      btn.innerHTML = action.html || UI.esc(action.label || '');
      btn.addEventListener('click', action.onClick);
      actionsNode.appendChild(btn);
    });
  }

  function mount(screen) {
    if (currentDestroy) {
      try { currentDestroy(); } catch (e) { /* экран уже снят */ }
    }
    currentDestroy = screen.destroy || null;
    setTopbar(screen);
    appNode.classList.toggle('screen--study', !!screen.study);
    appNode.innerHTML = '';
    appNode.appendChild(screen.el);
    global.scrollTo(0, 0);
    lastRenderDay = DB.today();
  }

  function renderError(err) {
    appNode.classList.remove('screen--study');
    appNode.innerHTML = '';
    var box = UI.el('<div class="empty">' +
      '<div class="empty__title">Что-то пошло не так</div>' +
      '<p class="small">' + UI.esc(err && err.message ? err.message : String(err)) + '</p>' +
      '</div>');
    var retry = UI.el('<button type="button" class="btn btn--primary">Повторить</button>');
    retry.addEventListener('click', render);
    box.appendChild(retry);
    var home = UI.el('<button type="button" class="btn btn--ghost">К наборам</button>');
    home.addEventListener('click', function () { go('#/'); });
    box.appendChild(home);
    appNode.appendChild(box);
    setTopbar({ title: 'Ошибка' });
  }

  function render() {
    var path = currentPath();
    var token = ++renderToken;
    var match = null;
    var route = null;

    for (var i = 0; i < ROUTES.length; i++) {
      match = path.match(ROUTES[i].re);
      if (match) { route = ROUTES[i]; break; }
    }

    if (!route) { go('#/'); return; }

    showLoader();
    Promise.resolve()
      .then(function () { return route.screen(match); })
      .then(function (screen) {
        if (token !== renderToken) return;    // пока грузили, ушли на другой экран
        mount(screen);
      })
      .catch(function (err) {
        if (token !== renderToken) return;
        console.error(err);
        renderError(err);
      });
  }

  /* --------------------------------------------------------- service worker */

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    var hadController = !!navigator.serviceWorker.controller;
    var reloading = false;

    navigator.serviceWorker.register('service-worker.js').catch(function (err) {
      console.warn('Service worker не зарегистрирован:', err);
    });

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController || reloading) return;   // первая установка — перезагрузка не нужна
      reloading = true;
      location.reload();
    });
  }

  /** Принудительно проверяет обновление кода и перезагружает приложение. */
  function forceUpdate() {
    if (!('serviceWorker' in navigator)) { location.reload(); return; }
    UI.toast('Проверяем обновления…');
    navigator.serviceWorker.getRegistration().then(function (reg) {
      if (!reg) { location.reload(); return; }
      return reg.update().then(function () {
        setTimeout(function () { location.reload(); }, 900);
      });
    }).catch(function () { location.reload(); });
  }

  /* --------------------------------------------------------------- запуск */

  function init() {
    appNode = document.getElementById('app');
    titleNode = document.getElementById('topbar-title');
    backNode = document.getElementById('btn-back');
    actionsNode = document.getElementById('topbar-actions');
    topbarNode = document.getElementById('topbar');

    global.addEventListener('hashchange', render);

    global.addEventListener('scroll', function () {
      topbarNode.classList.toggle('is-scrolled', global.scrollY > 4);
    }, { passive: true });

    // Если приложение провисело открытым до следующего дня — обновить счётчики.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && lastRenderDay && lastRenderDay !== DB.today()) render();
    });

    DB.open().then(function () {
      DB.requestPersistence();
      render();
    }).catch(function (err) {
      renderError(new Error('Не удалось открыть хранилище: ' + err.message));
    });

    registerServiceWorker();
  }

  global.App = {
    VERSION: VERSION,
    go: go,
    refresh: refresh,
    render: render,
    forceUpdate: forceUpdate
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
