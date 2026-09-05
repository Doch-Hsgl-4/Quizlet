/*
 * ui.js — рендеринг экранов и общие элементы интерфейса.
 *
 * Каждый экран — функция, возвращающая промис с описанием:
 *   { el, title, back, actions, study }
 * Роутинг и монтирование — в app.js.
 */
(function (global) {
  'use strict';

  /* ================================================================
     Утилиты
     ================================================================ */

  var ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ENTITIES[c];
    });
  }

  /** HTML-строка -> DOM-элемент. */
  function el(html) {
    var tpl = document.createElement('template');
    tpl.innerHTML = String(html).trim();
    return tpl.content.firstElementChild;
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function on(node, type, handler, opts) {
    if (node) node.addEventListener(type, handler, opts || false);
    return node;
  }

  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /** Склонение: plural(5, 'карточка', 'карточки', 'карточек'). */
  function plural(n, one, few, many) {
    var abs = Math.abs(n) % 100;
    var last = abs % 10;
    if (abs > 10 && abs < 20) return many;
    if (last > 1 && last < 5) return few;
    if (last === 1) return one;
    return many;
  }

  function cards(n) { return n + ' ' + plural(n, 'карточка', 'карточки', 'карточек'); }

  var ICONS = {
    back: 'M15 5l-7 7 7 7',
    forward: 'M9 5l7 7-7 7',
    plus: 'M12 5v14M5 12h14',
    check: 'M5 13l4 4L19 7',
    close: 'M6 6l12 12M18 6L6 18',
    trash: 'M4 7h16M9 7V5.5A1.5 1.5 0 0110.5 4h3A1.5 1.5 0 0115 5.5V7M6.5 7l.8 12.1A1.9 1.9 0 009.2 21h5.6a1.9 1.9 0 001.9-1.9L17.5 7',
    pencil: 'M4.5 19.5l4.2-1L20 7.2a2.3 2.3 0 10-3.2-3.2L5.5 15.3l-1 4.2z',
    chart: 'M3.5 20.5h17M7 17V9.5M12 17V4.5M17 17v-6',
    cards: 'M4.5 15.5V6.2A1.7 1.7 0 016.2 4.5h9.3M9.5 8h8.3A1.7 1.7 0 0119.5 9.7V18a1.7 1.7 0 01-1.7 1.7H9.5A1.7 1.7 0 017.8 18V9.7A1.7 1.7 0 019.5 8z',
    bolt: 'M13.5 3L6 13.2h5.2L10.5 21 18 10.8h-5.2L13.5 3z',
    quiz: 'M9.2 9a2.9 2.9 0 115.4 1.4c-.8 1.2-2.4 1.5-2.4 3.1M12 17.5h.01',
    download: 'M12 4v11m0 0l4.2-4.2M12 15l-4.2-4.2M4.5 19.5h15',
    upload: 'M12 20V9m0 0l4.2 4.2M12 9L7.8 13.2M4.5 4.5h15',
    refresh: 'M20 12a8 8 0 01-13.7 5.7L4 15.5M4 12a8 8 0 0113.7-5.7L20 8.5M20 4.5v4h-4M4 19.5v-4h4',
    dots: 'M12 6.2h.01M12 12h.01M12 17.8h.01',
    search: 'M11 18.5a7.5 7.5 0 100-15 7.5 7.5 0 000 15zM21 21l-4.6-4.6',
    image: 'M4.5 5.5h15v13h-15zM4.5 15l4.2-4.2 3.3 3.3 3-2.6 4.5 4',
    eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 14.6a2.6 2.6 0 100-5.2 2.6 2.6 0 000 5.2z',
    home: 'M4.5 10.5L12 4l7.5 6.5V19a1 1 0 01-1 1h-13a1 1 0 01-1-1z'
  };

  function icon(name, cls) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" class="' + (cls || '') + '"><path d="' +
      ICONS[name] + '"/></svg>';
  }

  /* ================================================================
     Тосты и модальные окна
     ================================================================ */

  var toastTimer = null;

  function toast(message, kind) {
    var node = document.getElementById('toast');
    node.textContent = message;
    node.className = 'toast is-visible' + (kind === 'error' ? ' toast--error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      node.className = 'toast';
    }, kind === 'error' ? 3200 : 2200);
  }

  /**
   * Показывает нижнюю шторку.
   * opts: { title, body (Element|string), actions:[{label, value, cls, keepOpen, onClick}],
   *         dismissible (по умолчанию true), onOpen(sheet) }
   * Возвращает промис со значением нажатой кнопки (или null).
   */
  function modal(opts) {
    return new Promise(function (resolve) {
      var root = document.getElementById('modal-root');
      var wrap = el('<div class="modal"><div class="modal__backdrop"></div>' +
        '<div class="modal__sheet" role="dialog" aria-modal="true"></div></div>');
      var sheet = $('.modal__sheet', wrap);
      var settled = false;

      if (opts.title) sheet.appendChild(el('<div class="modal__title">' + esc(opts.title) + '</div>'));
      if (opts.body) {
        sheet.appendChild(typeof opts.body === 'string' ? el('<div>' + opts.body + '</div>') : opts.body);
      }

      function close(value) {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', onKey);
        wrap.remove();
        if (!root.children.length) document.body.classList.remove('is-locked');
        resolve(value === undefined ? null : value);
      }

      function onKey(e) {
        if (e.key === 'Escape' && opts.dismissible !== false) close(null);
      }

      var actions = opts.actions || [];
      if (actions.length) {
        var box = el('<div class="modal__actions"></div>');
        actions.forEach(function (a) {
          var btn = el('<button type="button" class="btn ' + (a.cls || '') + '">' + esc(a.label) + '</button>');
          on(btn, 'click', function () {
            if (a.onClick) {
              var res = a.onClick(sheet, close);
              if (res === false) return;         // обработчик сам решает, закрывать ли
            }
            if (!a.keepOpen) close(a.value === undefined ? a.label : a.value);
          });
          box.appendChild(btn);
        });
        sheet.appendChild(box);
      }

      if (opts.dismissible !== false) {
        on($('.modal__backdrop', wrap), 'click', function () { close(null); });
      }
      document.addEventListener('keydown', onKey);
      document.body.classList.add('is-locked');
      root.appendChild(wrap);
      if (opts.onOpen) opts.onOpen(sheet, close);
    });
  }

  function confirmDialog(opts) {
    return modal({
      title: opts.title,
      body: opts.message ? '<p class="muted">' + esc(opts.message) + '</p>' : null,
      actions: [
        { label: opts.cancelLabel || 'Отмена', value: false, cls: '' },
        {
          label: opts.confirmLabel || 'Да',
          value: true,
          cls: opts.danger ? 'btn--danger' : 'btn--primary'
        }
      ]
    }).then(function (v) { return v === true; });
  }

  function promptDialog(opts) {
    var field = el('<div class="field"></div>');
    if (opts.label) field.appendChild(el('<label class="field__label">' + esc(opts.label) + '</label>'));
    var input = el(opts.multiline
      ? '<textarea class="textarea" rows="4"></textarea>'
      : '<input class="input" type="text" enterkeyhint="done">');
    input.value = opts.value || '';
    if (opts.placeholder) input.placeholder = opts.placeholder;
    field.appendChild(input);

    return modal({
      title: opts.title,
      body: field,
      onOpen: function () {
        setTimeout(function () { input.focus(); input.select && input.select(); }, 60);
      },
      actions: [
        { label: 'Отмена', value: null },
        {
          label: opts.confirmLabel || 'Сохранить',
          cls: 'btn--primary',
          onClick: function (sheet, close) {
            close(input.value.trim() || null);
            return false;
          }
        }
      ]
    });
  }

  /** Меню действий (нижняя шторка со списком). */
  function actionSheet(title, items) {
    var box = el('<div class="stack"></div>');
    return modal({
      title: title,
      body: box,
      actions: [{ label: 'Отмена', value: null }],
      onOpen: function (sheet, close) {
        items.forEach(function (item) {
          var btn = el('<button type="button" class="btn btn--block ' + (item.cls || '') + '">' +
            esc(item.label) + '</button>');
          on(btn, 'click', function () { close(item.value); });
          box.appendChild(btn);
        });
      }
    });
  }

  /* ================================================================
     Импорт / экспорт текста
     ================================================================ */

  /**
   * Разбирает текст построчно: «термин - определение», «термин[TAB]определение»,
   * «термин = определение». Возвращает { items, skipped }.
   */
  function parseCardsText(text) {
    var items = [];
    var skipped = 0;
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var raw = line.trim();
      if (!raw) return;
      var term = null, definition = null, parts;
      if (raw.indexOf('\t') !== -1) {
        parts = raw.split('\t').filter(function (p) { return p.trim() !== ''; });
        term = parts[0];
        definition = parts.slice(1).join(' ');
      } else {
        // разделитель — тире/дефис/равно/двоеточие, окружённый пробелами
        var m = raw.match(/^(.+?)\s+[-–—=:]\s+(.+)$/);
        if (!m) m = raw.match(/^([^-–—=]{1,80})[–—](.+)$/);   // «термин—определение»
        if (!m) m = raw.match(/^([^:]{1,80}):\s+(.+)$/);     // «термин: определение»
        if (m) { term = m[1]; definition = m[2]; }
      }
      if (term && definition && term.trim() && definition.trim()) {
        items.push({ term: term.trim(), definition: definition.trim() });
      } else {
        skipped++;
      }
    });
    return { items: items, skipped: skipped };
  }

  function cardsToText(list, separator) {
    var sep = separator === 'tab' ? '\t' : ' - ';
    return list.map(function (c) {
      var flat = function (s) { return String(s || '').replace(/\s*\n\s*/g, ' / ').trim(); };
      return flat(c.term) + sep + flat(c.definition);
    }).join('\n');
  }

  /** Сохранение файла: сначала «Поделиться» (iOS), потом обычная ссылка. */
  function saveTextFile(filename, text, mime) {
    var type = mime || 'text/plain';
    var blob = new Blob([text], { type: type + ';charset=utf-8' });
    try {
      if (navigator.canShare && global.File) {
        var file = new File([blob], filename, { type: type });
        if (navigator.canShare({ files: [file] })) {
          return navigator.share({ files: [file], title: filename })
            .catch(function () { downloadBlob(filename, blob); });
        }
      }
    } catch (e) { /* к обычной загрузке */ }
    downloadBlob(filename, blob);
    return Promise.resolve();
  }

  function downloadBlob(filename, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 1000);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      ok ? resolve() : reject(new Error('Копирование не поддерживается'));
    });
  }

  /** Уменьшает картинку до maxSide и отдаёт data URL. */
  function readImageFile(file, maxSide) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('Это не изображение'));
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Не удалось прочитать файл')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('Не удалось открыть изображение')); };
        img.onload = function () {
          var limit = maxSide || 900;
          var scale = Math.min(1, limit / Math.max(img.width, img.height));
          var w = Math.round(img.width * scale);
          var h = Math.round(img.height * scale);
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          try {
            resolve(canvas.toDataURL('image/jpeg', 0.82));
          } catch (e) { reject(e); }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ================================================================
     Стороны карточек (прямые и обратные)
     ================================================================ */

  var DIRECTION_LABELS = {
    forward: 'Термин → определение',
    reverse: 'Определение → термин',
    both: 'Обе стороны'
  };

  var DIRECTION_SHORT = { forward: 'прямые', reverse: 'обратные', both: 'обе стороны' };

  /** Что показывается на лицевой стороне: термин ('f') или определение ('r'). */
  function frontOf(card, dir) { return dir === 'r' ? card.definition : card.term; }
  function backOf(card, dir) { return dir === 'r' ? card.term : card.definition; }
  function frontKicker(dir) { return dir === 'r' ? 'определение' : 'термин'; }
  function backKicker(dir) { return dir === 'r' ? 'термин' : 'определение'; }

  /** Уникальный ключ элемента обучения (у сторон одной карточки он разный). */
  function itemKey(item) { return DB.progressKey(item.card.id, item.dir); }

  /**
   * Элементы обучения набора: по одному на каждую изучаемую сторону карточки.
   * У сторон независимые интервалы, поэтому элемент несёт свою запись прогресса.
   */
  function buildItems(cardList, progressList, dirs) {
    var byId = {};
    cardList.forEach(function (c) { byId[c.id] = c; });
    return DB.filterByDirs(progressList, dirs)
      .filter(function (p) { return byId[p.card]; })
      .map(function (p) { return { card: byId[p.card], dir: p.dir, progress: p }; });
  }

  /** Шторка выбора изучаемых сторон набора. */
  function directionDialog(deck) {
    return actionSheet('Какие стороны учить', [
      { label: DIRECTION_LABELS.forward + (deck.direction === 'forward' ? ' ✓' : ''), value: 'forward' },
      { label: DIRECTION_LABELS.reverse + (deck.direction === 'reverse' ? ' ✓' : ''), value: 'reverse' },
      { label: DIRECTION_LABELS.both + (deck.direction === 'both' ? ' ✓' : ''), value: 'both' }
    ]).then(function (choice) {
      if (!choice || choice === (deck.direction || 'forward')) return false;
      return DB.setDeckDirection(deck.id, choice).then(function () {
        toast('Стороны: ' + DIRECTION_SHORT[choice]);
        return true;
      });
    });
  }

  var LEARN_MODE_LABELS = {
    quiz: 'Проверка ответов',
    self: 'Самооценка (снова / трудно / хорошо / легко)'
  };

  /** Шторка выбора режима обучения набора. */
  function learnModeDialog(deck) {
    var current = deck.learnMode === 'self' ? 'self' : 'quiz';
    return actionSheet('Как проходит обучение', [
      { label: LEARN_MODE_LABELS.quiz + (current === 'quiz' ? ' ✓' : ''), value: 'quiz' },
      { label: LEARN_MODE_LABELS.self + (current === 'self' ? ' ✓' : ''), value: 'self' }
    ]).then(function (choice) {
      if (!choice || choice === current) return false;
      return DB.setDeckLearnMode(deck.id, choice).then(function () {
        toast(choice === 'quiz' ? 'Приложение будет проверять ответы' : 'Оценивать себя будете сами');
        return true;
      });
    });
  }

  /* ================================================================
     Переиспользуемые блоки
     ================================================================ */

  function progressBarNode() {
    return el('<div class="progress"><div class="progress__bar"></div></div>');
  }

  function statGrid(sum) {
    return el('<div class="stat-grid">' +
      '<div class="stat"><div class="stat__value">' + sum.total + '</div><div class="stat__label">всего</div></div>' +
      '<div class="stat"><div class="stat__value">' + sum.fresh + '</div><div class="stat__label">новых</div></div>' +
      '<div class="stat stat--learning"><div class="stat__value">' + sum.learning + '</div><div class="stat__label">изучаю</div></div>' +
      '<div class="stat stat--mature"><div class="stat__value">' + sum.mature + '</div><div class="stat__label">выучено</div></div>' +
      '</div>');
  }

  function splitBar(sum) {
    var total = Math.max(1, sum.total);
    var pct = function (n) { return (n / total * 100).toFixed(2) + '%'; };
    return el('<div class="stack">' +
      '<div class="split-bar">' +
      '<span class="seg--mature" style="width:' + pct(sum.mature) + '"></span>' +
      '<span class="seg--learning" style="width:' + pct(sum.learning) + '"></span>' +
      '<span class="seg--fresh" style="width:' + pct(sum.fresh) + '"></span>' +
      '</div>' +
      '<div class="legend">' +
      '<span><i class="seg--mature"></i>Выучено ' + sum.mature + '</span>' +
      '<span><i class="seg--learning"></i>Изучаю ' + sum.learning + '</span>' +
      '<span><i class="seg--fresh"></i>Новых ' + sum.fresh + '</span>' +
      '</div></div>');
  }

  function emptyState(opts) {
    var node = el('<div class="empty">' +
      '<div class="empty__icon">' + icon(opts.icon || 'cards') + '</div>' +
      '<div class="empty__title">' + esc(opts.title) + '</div>' +
      (opts.text ? '<div class="small">' + esc(opts.text) + '</div>' : '') +
      '</div>');
    (opts.buttons || []).forEach(function (b) {
      var btn = el('<button type="button" class="btn ' + (b.cls || '') + '">' + esc(b.label) + '</button>');
      on(btn, 'click', b.onClick);
      node.appendChild(btn);
    });
    return node;
  }

  /* ================================================================
     Диалоги: импорт, экспорт, редактирование карточки
     ================================================================ */

  /** Шторка импорта текста в набор. Возвращает число добавленных карточек. */
  function showImportDialog(deckId) {
    var body = el('<div class="stack">' +
      '<p class="small muted">Каждая строка — одна карточка. Разделитель: «термин - определение», ' +
      'табуляция или «термин = определение».</p>' +
      '<textarea class="textarea textarea--code" rows="8" placeholder="apple - яблоко&#10;book - книга"></textarea>' +
      '<div class="small muted" data-preview>Пока ничего не распознано</div>' +
      '</div>');
    var ta = $('textarea', body);
    var preview = $('[data-preview]', body);

    function refresh() {
      var res = parseCardsText(ta.value);
      preview.textContent = res.items.length
        ? 'Будет добавлено: ' + cards(res.items.length) +
          (res.skipped ? ' · пропущено строк: ' + res.skipped : '')
        : (ta.value.trim() ? 'Не удалось распознать ни одной строки' : 'Пока ничего не распознано');
    }
    on(ta, 'input', refresh);

    return modal({
      title: 'Импорт карточек',
      body: body,
      onOpen: function () { setTimeout(function () { ta.focus(); }, 60); },
      actions: [
        { label: 'Отмена', value: null },
        {
          label: 'Импортировать',
          cls: 'btn--primary',
          onClick: function (sheet, close) {
            var res = parseCardsText(ta.value);
            if (!res.items.length) { toast('Не найдено ни одной карточки', 'error'); return false; }
            DB.addCards(deckId, res.items).then(function (added) {
              toast('Добавлено: ' + cards(added.length));
              close(added.length);
            }).catch(function (err) { toast(err.message, 'error'); close(0); });
            return false;
          }
        }
      ]
    }).then(function (v) { return v || 0; });
  }

  /** Шторка экспорта набора в текст. */
  function showExportDialog(deck, list) {
    var mode = { sep: 'dash' };
    var body = el('<div class="stack">' +
      '<div class="segmented">' +
      '<button type="button" class="is-active" data-sep="dash">термин - определение</button>' +
      '<button type="button" data-sep="tab">табуляция</button>' +
      '</div>' +
      '<textarea class="textarea textarea--code" rows="9" readonly></textarea>' +
      '<div class="btn-grid">' +
      '<button type="button" class="btn btn--soft" data-copy>Скопировать</button>' +
      '<button type="button" class="btn btn--soft" data-save>Сохранить .txt</button>' +
      '</div></div>');
    var ta = $('textarea', body);

    function render() { ta.value = cardsToText(list, mode.sep); }
    render();

    $$('[data-sep]', body).forEach(function (btn) {
      on(btn, 'click', function () {
        mode.sep = btn.getAttribute('data-sep');
        $$('[data-sep]', body).forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        render();
      });
    });

    on($('[data-copy]', body), 'click', function () {
      ta.select();
      copyText(ta.value)
        .then(function () { toast('Скопировано в буфер обмена'); })
        .catch(function () { toast('Выделите текст и скопируйте вручную', 'error'); });
    });

    on($('[data-save]', body), 'click', function () {
      var name = (deck.name || 'cards').replace(/[^\wа-яёА-ЯЁ\- ]+/gi, '').trim() || 'cards';
      saveTextFile(name + '.txt', ta.value);
    });

    return modal({
      title: 'Экспорт «' + deck.name + '»',
      body: body,
      actions: [{ label: 'Закрыть', value: null }]
    });
  }

  /**
   * Шторка создания/редактирования карточки.
   * Возвращает 'saved' | 'deleted' | null.
   */
  function showCardDialog(opts) {
    var card = opts.card || null;
    var image = card ? card.image : null;
    var body = el('<div class="stack">' +
      '<div class="field"><label class="field__label">Термин</label>' +
      '<textarea class="textarea" rows="2" data-term></textarea></div>' +
      '<div class="field"><label class="field__label">Определение</label>' +
      '<textarea class="textarea" rows="3" data-def></textarea></div>' +
      '<div class="stack" data-image-box></div>' +
      '<div class="row"><label class="btn btn--soft btn--sm">' + icon('image') +
      ' Изображение<input type="file" accept="image/*" class="sr-only" data-file></label>' +
      '<span class="spacer"></span></div>' +
      '</div>');
    var termEl = $('[data-term]', body);
    var defEl = $('[data-def]', body);
    var imageBox = $('[data-image-box]', body);
    termEl.value = card ? card.term : (opts.term || '');
    defEl.value = card ? card.definition : '';

    function renderImage() {
      imageBox.innerHTML = '';
      if (!image) return;
      var img = el('<img class="img-preview" alt="Изображение карточки">');
      img.src = image;
      var remove = el('<button type="button" class="btn btn--sm btn--danger">Удалить изображение</button>');
      on(remove, 'click', function () { image = null; renderImage(); });
      imageBox.appendChild(img);
      imageBox.appendChild(remove);
    }
    renderImage();

    on($('[data-file]', body), 'change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      readImageFile(file, 900).then(function (dataUrl) {
        image = dataUrl;
        renderImage();
      }).catch(function (err) { toast(err.message, 'error'); });
      e.target.value = '';
    });

    var actions = [{ label: 'Отмена', value: null }];
    if (card) {
      actions.push({
        label: 'Удалить',
        cls: 'btn--danger',
        onClick: function (sheet, close) {
          confirmDialog({
            title: 'Удалить карточку?',
            message: card.term,
            confirmLabel: 'Удалить',
            danger: true
          }).then(function (ok) {
            if (!ok) return;
            DB.deleteCard(card.id).then(function () {
              toast('Карточка удалена');
              close('deleted');
            });
          });
          return false;
        }
      });
    }
    actions.push({
      label: 'Сохранить',
      cls: 'btn--primary',
      onClick: function (sheet, close) {
        var term = termEl.value.trim();
        var definition = defEl.value.trim();
        if (!term || !definition) { toast('Заполните термин и определение', 'error'); return false; }
        var save = card
          ? DB.updateCard({ id: card.id, term: term, definition: definition, image: image })
          : DB.addCards(opts.deckId, [{ term: term, definition: definition, image: image }]);
        save.then(function () {
          toast(card ? 'Сохранено' : 'Карточка добавлена');
          close('saved');
        }).catch(function (err) { toast(err.message, 'error'); });
        return false;
      }
    });

    return modal({
      title: card ? 'Карточка' : 'Новая карточка',
      body: body,
      onOpen: function () { setTimeout(function () { termEl.focus(); }, 60); },
      actions: actions
    });
  }

  /** Создание набора: имя + необязательный текст для импорта. */
  function showNewDeckDialog() {
    var body = el('<div class="stack">' +
      '<div class="field"><label class="field__label">Название</label>' +
      '<input class="input" type="text" placeholder="Английский — базовый" data-name></div>' +
      '<div class="field"><label class="field__label">Какие стороны учить</label>' +
      '<div class="segmented" data-direction>' +
      '<button type="button" data-value="forward">Прямые</button>' +
      '<button type="button" data-value="reverse">Обратные</button>' +
      '<button type="button" data-value="both">Обе</button>' +
      '</div>' +
      '<span class="small muted" data-direction-hint></span></div>' +
      '<div class="field"><label class="field__label">Карточки (необязательно)</label>' +
      '<textarea class="textarea textarea--code" rows="5" placeholder="apple - яблоко&#10;book - книга" data-text></textarea>' +
      '<span class="small muted">Одна строка — одна карточка: «термин - определение» или через табуляцию.</span>' +
      '</div></div>');
    var nameEl = $('[data-name]', body);
    var textEl = $('[data-text]', body);
    var direction = 'forward';
    var DIR_HINTS = {
      forward: 'Показываем термин, вспоминаем определение.',
      reverse: 'Показываем определение, вспоминаем термин.',
      both: 'Обе стороны с раздельными интервалами — карточек к повторению вдвое больше.'
    };
    function syncDirection() {
      $$('[data-direction] button', body).forEach(function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-value') === direction);
      });
      $('[data-direction-hint]', body).textContent = DIR_HINTS[direction];
    }
    $$('[data-direction] button', body).forEach(function (b) {
      on(b, 'click', function () { direction = b.getAttribute('data-value'); syncDirection(); });
    });
    syncDirection();

    return modal({
      title: 'Новый набор',
      body: body,
      onOpen: function () { setTimeout(function () { nameEl.focus(); }, 60); },
      actions: [
        { label: 'Отмена', value: null },
        {
          label: 'Создать',
          cls: 'btn--primary',
          onClick: function (sheet, close) {
            var name = nameEl.value.trim();
            if (!name) { toast('Введите название', 'error'); return false; }
            var parsed = parseCardsText(textEl.value);
            DB.createDeck(name, direction).then(function (deck) {
              if (!parsed.items.length) return deck;
              return DB.addCards(deck.id, parsed.items).then(function () { return deck; });
            }).then(function (deck) {
              toast(parsed.items.length ? 'Набор создан, ' + cards(parsed.items.length) : 'Набор создан');
              close(deck);
            }).catch(function (err) { toast(err.message, 'error'); });
            return false;
          }
        }
      ]
    });
  }

  var SAMPLE_CARDS = [
    { term: 'ubiquitous', definition: 'вездесущий, повсеместный' },
    { term: 'to grasp', definition: 'ухватить; понять, осознать' },
    { term: 'deliberate', definition: 'намеренный; обдуманный' },
    { term: 'resilient', definition: 'устойчивый, быстро восстанавливающийся' },
    { term: 'to alleviate', definition: 'облегчать, смягчать' },
    { term: 'concise', definition: 'краткий, лаконичный' },
    { term: 'to postpone', definition: 'откладывать, переносить на потом' },
    { term: 'cumbersome', definition: 'громоздкий, неудобный' },
    { term: 'to retain', definition: 'сохранять, удерживать' },
    { term: 'spaced repetition', definition: 'интервальное повторение' },
    { term: 'flashcard', definition: 'карточка для запоминания' },
    { term: 'to review', definition: 'повторять, просматривать заново' }
  ];

  function createSampleDeck() {
    return DB.createDeck('Пример: английские слова').then(function (deck) {
      return DB.addCards(deck.id, SAMPLE_CARDS).then(function () { return deck; });
    });
  }

  /** Меню набора (переименовать / импорт / экспорт / сброс / удалить). */
  function deckMenu(deck, list) {
    return actionSheet(deck.name, [
      { label: 'Переименовать', value: 'rename' },
      { label: 'Стороны карточек', value: 'direction' },
      { label: 'Режим «Учить»', value: 'learnMode' },
      { label: 'Импорт из текста', value: 'import' },
      { label: 'Экспорт в текст', value: 'export' },
      { label: 'Сбросить прогресс', value: 'reset' },
      { label: 'Удалить набор', value: 'delete', cls: 'btn--danger' }
    ]).then(function (choice) {
      switch (choice) {
        case 'rename':
          return promptDialog({
            title: 'Переименовать набор',
            label: 'Название',
            value: deck.name
          }).then(function (name) {
            if (!name) return false;
            return DB.renameDeck(deck.id, name).then(function () {
              toast('Название обновлено');
              return true;
            });
          });
        case 'direction':
          return directionDialog(deck);
        case 'learnMode':
          return learnModeDialog(deck);
        case 'import':
          return showImportDialog(deck.id).then(function (n) { return n > 0; });
        case 'export':
          return (list ? Promise.resolve(list) : DB.listCards(deck.id)).then(function (l) {
            if (!l.length) { toast('В наборе нет карточек', 'error'); return false; }
            return showExportDialog(deck, l).then(function () { return false; });
          });
        case 'reset':
          return confirmDialog({
            title: 'Сбросить прогресс?',
            message: 'Все карточки набора снова станут новыми. Сами карточки останутся.',
            confirmLabel: 'Сбросить',
            danger: true
          }).then(function (ok) {
            if (!ok) return false;
            return DB.resetDeckProgress(deck.id).then(function () {
              toast('Прогресс сброшен');
              return true;
            });
          });
        case 'delete':
          return confirmDialog({
            title: 'Удалить набор?',
            message: '«' + deck.name + '» и все его карточки будут удалены безвозвратно.',
            confirmLabel: 'Удалить',
            danger: true
          }).then(function (ok) {
            if (!ok) return false;
            return DB.deleteDeck(deck.id).then(function () {
              toast('Набор удалён');
              App.go('#/');
              return false;
            });
          });
        default:
          return false;
      }
    });
  }

  /* ================================================================
     Экран: список наборов
     ================================================================ */

  function screenHome() {
    return Promise.all([DB.listDecks(), DB.getAllProgress()]).then(function (res) {
      var decks = res[0];
      var progress = res[1];
      var byDeck = {};
      progress.forEach(function (p) {
        (byDeck[p.deckId] = byDeck[p.deckId] || []).push(p);
      });

      var root = el('<div class="stack"></div>');
      var sums = {};
      var totalDue = 0;
      decks.forEach(function (d) {
        sums[d.id] = DB.summarize(DB.filterByDirs(byDeck[d.id] || [], DB.directionsOf(d)));
        totalDue += sums[d.id].due;
      });

      if (!decks.length) {
        root.appendChild(emptyState({
          icon: 'cards',
          title: 'Пока нет наборов',
          text: 'Создайте набор вручную или загрузите пример, чтобы посмотреть, как всё работает.',
          buttons: [
            {
              label: 'Создать набор', cls: 'btn--primary', onClick: function () {
                showNewDeckDialog().then(function (deck) { if (deck) App.go('#/deck/' + deck.id); });
              }
            },
            {
              label: 'Загрузить пример', cls: 'btn--soft', onClick: function () {
                createSampleDeck().then(function (deck) {
                  toast('Пример загружен');
                  App.go('#/deck/' + deck.id);
                });
              }
            }
          ]
        }));
        return { el: root, title: 'Карточки', actions: homeActions() };
      }

      var banner = el('<div class="banner">' +
        '<div class="banner__value">' + totalDue + '</div>' +
        '<div class="grow"><div style="font-weight:650">' +
        (totalDue ? plural(totalDue, 'карточка ждёт', 'карточки ждут', 'карточек ждут') + ' повторения'
          : 'На сегодня всё повторено') + '</div>' +
        '<div class="banner__text">' + (totalDue ? 'Откройте набор и нажмите «Учить»' : 'Возвращайтесь завтра — интервалы подрастут') +
        '</div></div></div>');
      root.appendChild(banner);

      root.appendChild(el('<div class="section-title">Наборы</div>'));
      var list = el('<div class="card list"></div>');
      decks.forEach(function (deck) {
        var sum = sums[deck.id];
        // карточек в наборе — по числу прямых сторон (у каждой карточки она одна)
        var cardCount = (byDeck[deck.id] || []).filter(function (p) { return p.dir !== 'r'; }).length;
        var direction = deck.direction || 'forward';
        var row = el('<div class="list__row">' +
          '<div class="list__main">' +
          '<div class="list__title">' + esc(deck.name) + '</div>' +
          '<div class="list__sub">' + cards(cardCount) +
          (direction === 'forward' ? '' : ' · ' + DIRECTION_SHORT[direction]) +
          (sum.mature ? ' · выучено ' + sum.mature : '') +
          (sum.fresh ? ' · новых ' + sum.fresh : '') + '</div>' +
          '</div>' +
          (sum.due ? '<span class="badge badge--due">' + sum.due + '</span>' : '') +
          '<button type="button" class="icon-btn" data-menu aria-label="Меню набора">' + icon('dots') + '</button>' +
          '<svg viewBox="0 0 24 24" class="chevron" aria-hidden="true"><path d="' + ICONS.forward + '"/></svg>' +
          '</div>');
        on(row, 'click', function (e) {
          if (e.target.closest('[data-menu]')) return;
          App.go('#/deck/' + deck.id);
        });
        on($('[data-menu]', row), 'click', function (e) {
          e.stopPropagation();
          deckMenu(deck).then(function (changed) { if (changed) App.refresh(); });
        });
        list.appendChild(row);
      });
      root.appendChild(list);

      var addBtn = el('<button type="button" class="btn btn--primary btn--block btn--lg">' +
        icon('plus') + ' Новый набор</button>');
      on(addBtn, 'click', function () {
        showNewDeckDialog().then(function (deck) { if (deck) App.go('#/deck/' + deck.id); });
      });
      root.appendChild(addBtn);

      return { el: root, title: 'Карточки', actions: homeActions() };
    });
  }

  function homeActions() {
    return [{
      html: icon('chart'),
      label: 'Статистика',
      onClick: function () { App.go('#/stats'); }
    }];
  }

  /* ================================================================
     Экран: набор
     ================================================================ */

  function screenDeck(deckId) {
    return DB.ensureProgress(deckId).then(function () {
      return Promise.all([DB.getDeck(deckId), DB.listCards(deckId), DB.getDeckProgress(deckId)]);
    }).then(function (res) {
      var deck = res[0], list = res[1], progress = res[2];
      if (!deck) return notFound();
      var direction = deck.direction || 'forward';
      var dirs = DB.directionsOf(deck);
      var sum = DB.summarize(DB.filterByDirs(progress, dirs));
      var root = el('<div class="stack"></div>');

      var banner = el('<div class="banner">' +
        '<div class="banner__value">' + sum.due + '</div>' +
        '<div class="grow"><div style="font-weight:650">' +
        (sum.due ? 'к повторению сегодня' : 'на сегодня всё готово') + '</div>' +
        '<div class="banner__text">' + cards(list.length) + ' в наборе' +
        (dirs.length > 1 ? ' · обе стороны' : (direction === 'reverse' ? ' · обратные' : '')) +
        '</div></div></div>');
      root.appendChild(banner);

      if (sum.total) {
        root.appendChild(statGrid(sum));
        if (dirs.length > 1) {
          root.appendChild(el('<p class="small muted center">Счёт по сторонам: ' + list.length +
            ' × 2 = ' + sum.total + '. У прямой и обратной стороны свои интервалы.</p>'));
        }
      }

      var learnBtn = el('<button type="button" class="btn btn--primary btn--block btn--lg">' +
        icon('bolt') + (sum.due ? ' Учить · ' + sum.due : ' Учить досрочно') + '</button>');
      if (!sum.total) learnBtn.disabled = true;
      on(learnBtn, 'click', function () { App.go('#/deck/' + deckId + '/learn'); });
      root.appendChild(learnBtn);

      var grid = el('<div class="btn-grid"></div>');
      var fcBtn = el('<button type="button" class="btn btn--block">' + icon('cards') + ' Карточки</button>');
      var testBtn = el('<button type="button" class="btn btn--block">' + icon('quiz') + ' Тест</button>');
      if (!sum.total) { fcBtn.disabled = true; testBtn.disabled = true; }
      on(fcBtn, 'click', function () { App.go('#/deck/' + deckId + '/flashcards'); });
      on(testBtn, 'click', function () { App.go('#/deck/' + deckId + '/test'); });
      grid.appendChild(fcBtn);
      grid.appendChild(testBtn);
      root.appendChild(grid);

      if (!sum.due && sum.total) {
        root.appendChild(el('<p class="small muted center">На сегодня всё повторено. ' +
          'Досрочная тренировка не сбивает расписание: правильные ответы не приближают ' +
          'следующий показ.</p>'));
      }

      if (sum.total) {
        var mastery = el('<div class="card card--pad stack">' +
          '<div class="row"><div class="grow list__title">Освоение набора</div>' +
          '<div class="mastery__value">' + sum.mastery + '%</div></div>' +
          '<div class="progress progress--lg"><div class="progress__bar" style="width:' +
          sum.mastery + '%"></div></div>' +
          '<p class="small muted">100% — когда все стороны выходят на интервал ' +
          SRS.MATURE_INTERVAL + ' дней и больше.</p></div>');
        mastery.appendChild(splitBar(sum));
        root.appendChild(mastery);
      }

      root.appendChild(el('<div class="section-title">Содержимое</div>'));
      var menu = el('<div class="card list"></div>');
      var dirRow = el('<div class="list__row"><div class="list__main">' +
        '<div class="list__title">Стороны карточек</div>' +
        '<div class="list__sub">' + esc(DIRECTION_LABELS[direction]) + '</div></div>' +
        '<svg viewBox="0 0 24 24" class="chevron" aria-hidden="true"><path d="' + ICONS.forward + '"/></svg></div>');
      on(dirRow, 'click', function () {
        directionDialog(deck).then(function (changed) { if (changed) App.refresh(); });
      });
      menu.appendChild(dirRow);

      var learnMode = deck.learnMode === 'self' ? 'self' : 'quiz';
      var modeRow = el('<div class="list__row"><div class="list__main">' +
        '<div class="list__title">Режим «Учить»</div>' +
        '<div class="list__sub">' + esc(LEARN_MODE_LABELS[learnMode]) + '</div></div>' +
        '<svg viewBox="0 0 24 24" class="chevron" aria-hidden="true"><path d="' + ICONS.forward + '"/></svg></div>');
      on(modeRow, 'click', function () {
        learnModeDialog(deck).then(function (changed) { if (changed) App.refresh(); });
      });
      menu.appendChild(modeRow);
      var cardsRow = el('<div class="list__row"><div class="list__main">' +
        '<div class="list__title">Карточки набора</div>' +
        '<div class="list__sub">Добавить, изменить, удалить</div></div>' +
        '<span class="badge">' + list.length + '</span>' +
        '<svg viewBox="0 0 24 24" class="chevron" aria-hidden="true"><path d="' + ICONS.forward + '"/></svg></div>');
      on(cardsRow, 'click', function () { App.go('#/deck/' + deckId + '/cards'); });
      menu.appendChild(cardsRow);

      var importRow = el('<div class="list__row"><div class="list__main">' +
        '<div class="list__title">Импорт из текста</div>' +
        '<div class="list__sub">Вставить список «термин - определение»</div></div>' +
        '<svg viewBox="0 0 24 24" class="chevron" aria-hidden="true"><path d="' + ICONS.forward + '"/></svg></div>');
      on(importRow, 'click', function () {
        showImportDialog(deckId).then(function (n) { if (n) App.refresh(); });
      });
      menu.appendChild(importRow);

      var exportRow = el('<div class="list__row"><div class="list__main">' +
        '<div class="list__title">Экспорт в текст</div>' +
        '<div class="list__sub">Скопировать или сохранить .txt</div></div>' +
        '<svg viewBox="0 0 24 24" class="chevron" aria-hidden="true"><path d="' + ICONS.forward + '"/></svg></div>');
      on(exportRow, 'click', function () {
        if (!list.length) return toast('В наборе нет карточек', 'error');
        showExportDialog(deck, list);
      });
      menu.appendChild(exportRow);
      root.appendChild(menu);

      if (!list.length) {
        root.appendChild(el('<p class="small muted center">Набор пуст. Добавьте карточки вручную ' +
          'или импортируйте списком.</p>'));
      }

      return {
        el: root,
        title: deck.name,
        back: '#/',
        actions: [{
          html: icon('dots'),
          label: 'Меню набора',
          onClick: function () {
            deckMenu(deck, list).then(function (changed) { if (changed) App.refresh(); });
          }
        }]
      };
    });
  }

  function notFound() {
    return {
      el: emptyState({
        icon: 'search',
        title: 'Набор не найден',
        text: 'Возможно, он был удалён.',
        buttons: [{ label: 'К списку наборов', cls: 'btn--primary', onClick: function () { App.go('#/'); } }]
      }),
      title: 'Ошибка',
      back: '#/'
    };
  }

  /* ================================================================
     Экран: карточки набора (редактор)
     ================================================================ */

  function screenCards(deckId) {
    return Promise.all([DB.getDeck(deckId), DB.listCards(deckId)]).then(function (res) {
      var deck = res[0], list = res[1];
      if (!deck) return notFound();

      var root = el('<div class="stack"></div>');
      var addBtn = el('<button type="button" class="btn btn--primary btn--block">' +
        icon('plus') + ' Добавить карточку</button>');
      on(addBtn, 'click', function () {
        showCardDialog({ deckId: deckId }).then(function (r) { if (r) App.refresh(); });
      });
      root.appendChild(addBtn);

      if (!list.length) {
        root.appendChild(emptyState({
          icon: 'cards',
          title: 'Карточек пока нет',
          text: 'Добавьте первую карточку или импортируйте список.',
          buttons: [{
            label: 'Импорт из текста', cls: 'btn--soft', onClick: function () {
              showImportDialog(deckId).then(function (n) { if (n) App.refresh(); });
            }
          }]
        }));
        return { el: root, title: 'Карточки', back: '#/deck/' + deckId };
      }

      var search = el('<input class="input" type="search" placeholder="Поиск по карточкам" ' +
        'enterkeyhint="search" autocomplete="off">');
      if (list.length > 7) root.appendChild(search);

      var listNode = el('<div class="card list"></div>');
      root.appendChild(listNode);
      var counter = el('<p class="small muted center">' + cards(list.length) + ' в наборе</p>');
      root.appendChild(counter);

      function render(filter) {
        var q = (filter || '').trim().toLowerCase();
        var visible = q
          ? list.filter(function (c) {
              return (c.term + ' ' + c.definition).toLowerCase().indexOf(q) !== -1;
            })
          : list;
        listNode.innerHTML = '';
        if (!visible.length) {
          listNode.appendChild(el('<div class="list__row list__row--static">' +
            '<div class="list__main"><div class="list__sub">Ничего не найдено</div></div></div>'));
        }
        visible.forEach(function (card) {
          var row = el('<div class="list__row">' +
            (card.image ? '<img class="thumb" alt="" src="' + esc(card.image) + '">' : '') +
            '<div class="list__main">' +
            '<div class="list__title">' + esc(card.term) + '</div>' +
            '<div class="list__sub">' + esc(card.definition) + '</div></div>' +
            '<button type="button" class="icon-btn" data-del aria-label="Удалить">' + icon('trash') + '</button>' +
            '</div>');
          on(row, 'click', function (e) {
            if (e.target.closest('[data-del]')) return;
            showCardDialog({ card: card, deckId: deckId }).then(function (r) { if (r) App.refresh(); });
          });
          on($('[data-del]', row), 'click', function (e) {
            e.stopPropagation();
            confirmDialog({
              title: 'Удалить карточку?',
              message: card.term,
              confirmLabel: 'Удалить',
              danger: true
            }).then(function (ok) {
              if (!ok) return;
              DB.deleteCard(card.id).then(function () {
                toast('Карточка удалена');
                App.refresh();
              });
            });
          });
          listNode.appendChild(row);
        });
        counter.textContent = q
          ? 'Найдено: ' + cards(visible.length)
          : cards(list.length) + ' в наборе';
      }

      on(search, 'input', function () { render(search.value); });
      render('');

      return {
        el: root,
        title: deck.name,
        back: '#/deck/' + deckId,
        actions: [{
          html: icon('plus'),
          label: 'Добавить карточку',
          onClick: function () {
            showCardDialog({ deckId: deckId }).then(function (r) { if (r) App.refresh(); });
          }
        }]
      };
    });
  }

  /* ================================================================
     Экран: режим «Карточки» (быстрый просмотр с оценкой помню/не помню)
     ================================================================ */

  function emptyStudy(deckId, title, text) {
    return {
      el: emptyState({
        icon: 'cards',
        title: title,
        text: text,
        buttons: [{
          label: 'К набору', cls: 'btn--primary',
          onClick: function () { App.go('#/deck/' + deckId); }
        }]
      }),
      title: 'Обучение',
      back: '#/deck/' + deckId
    };
  }

  function progressMapOf(progressList) {
    var map = {};
    progressList.forEach(function (p) { map[p.cardId] = p; });
    return map;
  }

  /** Сохраняет оценку стороны карточки: прогресс + запись в журнал. */
  function applyRating(deckId, item, rating, opts) {
    var base = item.progress || DB.newProgressRecord(item.card.id, deckId, item.dir);
    base.cardId = DB.progressKey(item.card.id, item.dir);
    base.card = item.card.id;
    base.dir = item.dir;
    base.deckId = deckId;
    var next = SRS.schedule(base, rating);
    // Досрочная тренировка не должна приближать следующий показ: если карточка
    // была запланирована на потом и отвечена верно, оставляем дальнюю дату.
    if (opts && opts.keepLaterDue && rating !== 'again' &&
        base.dueDate && base.dueDate > next.dueDate) {
      next.dueDate = base.dueDate;
    }
    item.progress = next;
    DB.putProgress(next).catch(function () { toast('Не удалось сохранить прогресс', 'error'); });
    DB.recordReview({
      cardId: item.card.id,
      dir: item.dir,
      deckId: deckId,
      rating: rating,
      quality: SRS.QUALITY[rating],
      interval: next.interval
    }).catch(function () { /* журнал не критичен */ });
    return next;
  }

  /* Сессия обучения: раунды как в Quizlet — короткие круги по 7 элементов,
     каждый круг доучивается до конца, а не «один проход и до завтра». */
  var ROUND_SIZE = 7;
  var MAX_ROUNDS = 3;
  var NEW_PER_SESSION = 14;   // два полных круга новых за раз

  /**
   * Набирает элементы сессии: сначала повторения на сегодня, потом немного
   * новых. Если на сегодня ничего не запланировано — берёт ближайшие по сроку
   * и помечает сессию досрочной (расписание от неё не пострадает).
   */
  function buildSession(items, todayStr) {
    var limit = ROUND_SIZE * MAX_ROUNDS;
    var due = items.filter(function (it) { return SRS.isDue(it.progress, todayStr); });
    var reviews = shuffle(due.filter(function (it) { return it.progress.lastReviewed; }));
    var fresh = shuffle(due.filter(function (it) { return !it.progress.lastReviewed; }));
    var picked = reviews.slice(0, limit);
    picked = picked.concat(fresh.slice(0, Math.min(limit - picked.length, NEW_PER_SESSION)));
    var ahead = false;
    if (!picked.length) {
      ahead = true;
      picked = items.slice().sort(function (a, b) {
        return String(a.progress.dueDate || '').localeCompare(String(b.progress.dueDate || ''));
      }).slice(0, limit);
    }
    return {
      items: shuffle(picked),
      ahead: ahead,
      dueTotal: due.length,
      leftOver: Math.max(0, due.length - picked.length)
    };
  }

  /** Варианты для вопроса с выбором: правильный ответ + 3 чужих. */
  function choiceOptions(cardList, card, dir) {
    var correct = backOf(card, dir);
    var seen = {};
    seen[normalizeAnswer(correct)] = true;
    var others = [];
    shuffle(cardList).forEach(function (c) {
      if (c.id === card.id || others.length >= 3) return;
      var text = backOf(c, dir);
      var key = normalizeAnswer(text);
      if (!text || seen[key]) return;
      seen[key] = true;
      others.push(text);
    });
    return others.length >= 3 ? shuffle([correct].concat(others)) : null;
  }

  function screenFlashcards(deckId) {
    return DB.ensureProgress(deckId).then(function () {
      return Promise.all([DB.getDeck(deckId), DB.listCards(deckId), DB.getDeckProgress(deckId)]);
    }).then(function (res) {
      var deck = res[0], list = res[1];
      if (!deck) return notFound();
      if (!list.length) return emptyStudy(deckId, 'В наборе нет карточек', 'Добавьте карточки, чтобы начать.');

      var dirs = DB.directionsOf(deck);
      var queue = shuffle(buildItems(list, res[2], dirs));
      var index = 0;
      var requeued = {};
      var score = { known: 0, unknown: 0 };
      var wrong = [];
      var flipped = false;

      var root = el('<div class="study"></div>');
      var head = el('<div class="study__head">' +
        '<div class="study__counter"><span data-pos></span><span data-score></span></div>' +
        '<div class="progress"><div class="progress__bar"></div></div></div>');
      var fc = el('<div class="flashcard"><div class="flashcard__inner">' +
        '<div class="flashcard__face flashcard__face--front">' +
        '<div class="flashcard__kicker" data-front-kicker></div>' +
        '<div class="flashcard__text" data-front></div>' +
        '<div class="flashcard__hint">Нажмите, чтобы перевернуть</div>' +
        '<div class="swipe-badge swipe-badge--yes">помню</div>' +
        '<div class="swipe-badge swipe-badge--no">не помню</div>' +
        '</div>' +
        '<div class="flashcard__face flashcard__face--back">' +
        '<div class="flashcard__kicker" data-back-kicker></div>' +
        '<div class="flashcard__text flashcard__text--answer" data-back></div>' +
        '<img class="flashcard__img" data-img alt="" hidden>' +
        '<div class="flashcard__hint">Свайп влево — не помню, вправо — помню</div>' +
        '</div></div></div>');
      var controls = el('<div class="answer-grid">' +
        '<button type="button" class="btn btn--danger" data-no>Не помню</button>' +
        '<button type="button" class="btn btn--success" data-yes>Помню</button>' +
        '</div>');

      root.appendChild(head);
      root.appendChild(fc);
      root.appendChild(controls);

      var inner = $('.flashcard__inner', fc);
      var badgeYes = $('.swipe-badge--yes', fc);
      var badgeNo = $('.swipe-badge--no', fc);

      function current() { return queue[index]; }

      function render() {
        var item = current();
        if (!item) return finish();
        flipped = false;
        fc.classList.remove('is-flipped');
        inner.style.transform = '';
        inner.style.opacity = '';
        $('[data-front-kicker]', fc).textContent = frontKicker(item.dir);
        $('[data-back-kicker]', fc).textContent = backKicker(item.dir);
        $('[data-front]', fc).textContent = frontOf(item.card, item.dir);
        $('[data-back]', fc).textContent = backOf(item.card, item.dir);
        var img = $('[data-img]', fc);
        if (item.card.image) { img.src = item.card.image; img.hidden = false; }
        else { img.hidden = true; img.removeAttribute('src'); }
        $('[data-pos]', head).textContent = 'Карточка ' + (index + 1) + ' из ' + queue.length;
        $('[data-score]', head).textContent = '✓ ' + score.known + '   ✗ ' + score.unknown;
        $('.progress__bar', head).style.width = (index / queue.length * 100) + '%';
      }

      function answer(known) {
        var item = current();
        if (!item) return;
        applyRating(deckId, item, known ? 'good' : 'again');
        if (known) {
          score.known++;
        } else {
          score.unknown++;
          if (wrong.indexOf(item) === -1) wrong.push(item);
          var key = itemKey(item);
          if (!requeued[key]) { requeued[key] = true; queue.push(item); }
        }
        index++;
        render();
      }

      function flyOut(dir, done) {
        inner.style.transition = 'transform .28s ease, opacity .28s ease';
        inner.style.transform = 'translateX(' + (dir * 130) + '%) rotate(' + (dir * 18) + 'deg)' +
          (flipped ? ' rotateY(180deg)' : '');
        inner.style.opacity = '0';
        setTimeout(function () {
          inner.style.transition = '';
          done();
        }, 260);
      }

      function answerAnimated(known) {
        flyOut(known ? 1 : -1, function () { answer(known); });
      }

      function finish() {
        root.innerHTML = '';
        var accuracy = score.known + score.unknown
          ? Math.round(score.known / (score.known + score.unknown) * 100) : 0;
        var summary = el('<div class="summary">' +
          '<div class="summary__emoji">' + (accuracy >= 80 ? '🎉' : accuracy >= 50 ? '👍' : '💪') + '</div>' +
          '<div class="summary__title">Сессия завершена</div>' +
          '<div class="summary__score">' + accuracy + '%</div>' +
          '<div class="muted small">помню: ' + score.known + ' · не помню: ' + score.unknown + '</div>' +
          '</div>');
        root.appendChild(summary);
        if (wrong.length) {
          var again = el('<button type="button" class="btn btn--primary btn--block btn--lg">' +
            'Повторить сложные (' + wrong.length + ')</button>');
          on(again, 'click', function () {
            queue = shuffle(wrong);
            wrong = [];
            requeued = {};
            index = 0;
            score = { known: 0, unknown: 0 };
            root.innerHTML = '';
            root.appendChild(head);
            root.appendChild(fc);
            root.appendChild(controls);
            render();
          });
          root.appendChild(again);
        }
        var restart = el('<button type="button" class="btn btn--block">Пройти набор заново</button>');
        on(restart, 'click', function () { App.refresh(); });
        var back = el('<button type="button" class="btn btn--ghost btn--block">К набору</button>');
        on(back, 'click', function () { App.go('#/deck/' + deckId); });
        root.appendChild(restart);
        root.appendChild(back);
      }

      /* переворот по нажатию */
      var suppressClick = false;
      on(fc, 'click', function () {
        if (suppressClick) { suppressClick = false; return; }
        flipped = !flipped;
        fc.classList.toggle('is-flipped', flipped);
      });

      /* свайпы */
      var startX = 0, startY = 0, dx = 0, dragging = false;
      on(fc, 'touchstart', function (e) {
        if (e.touches.length !== 1) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        dx = 0;
        dragging = true;
        fc.classList.add('is-dragging');
      }, { passive: true });

      on(fc, 'touchmove', function (e) {
        if (!dragging) return;
        var x = e.touches[0].clientX, y = e.touches[0].clientY;
        var dy = y - startY;
        dx = x - startX;
        if (Math.abs(dx) < Math.abs(dy)) return;
        inner.style.transform = 'translateX(' + dx + 'px) rotate(' + (dx / 22) + 'deg)' +
          (flipped ? ' rotateY(180deg)' : '');
        var k = Math.min(1, Math.abs(dx) / 90);
        badgeYes.style.opacity = dx > 0 ? k : 0;
        badgeNo.style.opacity = dx < 0 ? k : 0;
      }, { passive: true });

      on(fc, 'touchend', function () {
        if (!dragging) return;
        dragging = false;
        fc.classList.remove('is-dragging');
        badgeYes.style.opacity = 0;
        badgeNo.style.opacity = 0;
        if (Math.abs(dx) > 12) suppressClick = true;
        if (Math.abs(dx) > 90) {
          answerAnimated(dx > 0);
        } else {
          inner.style.transform = '';
        }
        dx = 0;
      });

      on($('[data-yes]', controls), 'click', function () { answerAnimated(true); });
      on($('[data-no]', controls), 'click', function () { answerAnimated(false); });

      function onKey(e) {
        if (e.target.matches('input, textarea')) return;
        if (e.code === 'Space' || e.key === ' ') {
          e.preventDefault();
          flipped = !flipped;
          fc.classList.toggle('is-flipped', flipped);
        } else if (e.key === 'ArrowRight') { answerAnimated(true); }
        else if (e.key === 'ArrowLeft') { answerAnimated(false); }
      }
      document.addEventListener('keydown', onKey);

      render();

      return {
        el: root,
        title: deck.name,
        back: '#/deck/' + deckId,
        study: true,
        destroy: function () { document.removeEventListener('keydown', onKey); }
      };
    });
  }

  /* ================================================================
     Экран: режим «Учить» (интервальное повторение)
     ================================================================ */

  function screenLearn(deckId) {
    return DB.ensureProgress(deckId).then(function () {
      return Promise.all([DB.getDeck(deckId), DB.listCards(deckId), DB.getDeckProgress(deckId)]);
    }).then(function (res) {
      var deck = res[0], cardList = res[1];
      if (!deck) return notFound();
      if (!cardList.length) {
        return emptyStudy(deckId, 'В наборе нет карточек', 'Добавьте карточки, чтобы начать.');
      }

      var dirs = DB.directionsOf(deck);
      var all = buildItems(cardList, res[2], dirs);
      var today = DB.today();
      var session = buildSession(all, today);
      var rateOpts = { keepLaterDue: session.ahead };
      var root = el('<div class="study"></div>');
      var keyHandler = null;
      var timer = null;

      function setKeys(handler) {
        if (keyHandler) document.removeEventListener('keydown', keyHandler);
        keyHandler = handler;
        if (handler) document.addEventListener('keydown', handler);
      }

      function cleanup() {
        if (keyHandler) document.removeEventListener('keydown', keyHandler);
        clearTimeout(timer);
      }

      /* ---------------------------------------------------------- общее */

      function headNode(doneCount, total, right) {
        return el('<div class="study__head">' +
          '<div class="study__counter"><span>Изучено ' + doneCount + ' из ' + total + '</span>' +
          '<span>' + esc(right) + '</span></div>' +
          '<div class="progress"><div class="progress__bar" style="width:' +
          (total ? doneCount / total * 100 : 0) + '%"></div></div></div>');
      }

      /** Итог сессии: сколько осталось на сегодня и что делать дальше. */
      function sessionDone(stats) {
        setKeys(null);
        DB.getDeckProgress(deckId).then(function (fresh) {
          var left = buildItems(cardList, fresh, dirs)
            .filter(function (it) { return SRS.isDue(it.progress, DB.today()); }).length;
          root.innerHTML = '';
          var perfect = !stats.mistakes;
          root.appendChild(el('<div class="summary">' +
            '<div class="summary__emoji">' + (perfect ? '🎉' : '👍') + '</div>' +
            '<div class="summary__title">' + (session.ahead ? 'Тренировка завершена' : 'Раунды пройдены') + '</div>' +
            '<div class="summary__score">' + stats.learned + '</div>' +
            '<div class="muted small">' +
            plural(stats.learned, 'термин изучен', 'термина изучено', 'терминов изучено') +
            (stats.mistakes ? ' · ошибок: ' + stats.mistakes : ' · без ошибок') + '</div>' +
            '</div>'));

          if (left) {
            var more = el('<button type="button" class="btn btn--primary btn--block btn--lg">' +
              icon('bolt') + ' Учить дальше · ' + left + '</button>');
            on(more, 'click', function () { App.refresh(); });
            root.appendChild(more);
          } else {
            var again = el('<button type="button" class="btn btn--primary btn--block btn--lg">' +
              icon('refresh') + ' Повторить ещё раз</button>');
            on(again, 'click', function () { App.refresh(); });
            root.appendChild(again);
            root.appendChild(el('<p class="small muted center">На сегодня всё повторено. ' +
              'Можно тренироваться дальше — досрочные ответы не сбивают расписание.</p>'));
          }

          var back = el('<button type="button" class="btn btn--block">К набору</button>');
          on(back, 'click', function () { App.go('#/deck/' + deckId); });
          root.appendChild(back);
        });
      }

      /* ------------------------------------- режим «проверка ответов» */

      function startQuiz() {
        var entries = session.items.map(function (item) {
          // Выученную карточку (интервал больше 21 дня) не гоняем через выбор
          // из вариантов — сразу просим написать ответ.
          var stage = SRS.stateOf(item.progress) === 'mature' ? 1 : 0;
          return { item: item, stage: stage, mistakes: 0 };
        });
        var total = entries.length;
        var learned = 0;
        var mistakes = 0;
        var rounds = [];
        for (var i = 0; i < entries.length; i += ROUND_SIZE) {
          rounds.push(entries.slice(i, i + ROUND_SIZE));
        }
        var roundIndex = 0;
        var queue = [];

        function roundLabel() {
          return (session.ahead ? 'досрочно · ' : '') +
            'круг ' + (roundIndex + 1) + ' из ' + rounds.length;
        }

        function startRound() {
          queue = shuffle(rounds[roundIndex].slice());
          nextQuestion();
        }

        /** Возвращает карточку в очередь через несколько вопросов. */
        function requeue(entry, gap) {
          var pos = Math.min(queue.length, gap + Math.floor(Math.random() * 2));
          queue.splice(pos, 0, entry);
        }

        function finishEntry(entry) {
          // Итог по карточке переводим в оценку SM-2: без ошибок — «хорошо»,
          // одна ошибка — «трудно», больше — «снова» (вернётся сегодня же).
          var rating = entry.mistakes === 0 ? 'good' : (entry.mistakes === 1 ? 'hard' : 'again');
          applyRating(deckId, entry.item, rating, rateOpts);
          learned++;
        }

        function answered(entry, correct) {
          if (correct) {
            entry.stage++;
            queue.shift();
            if (entry.stage >= 2) finishEntry(entry);
            else requeue(entry, 2);
          } else {
            mistakes++;
            entry.mistakes++;
            entry.stage = 0;
            queue.shift();
            requeue(entry, 1);
          }
        }

        function roundDone() {
          setKeys(null);
          roundIndex++;
          if (roundIndex >= rounds.length) {
            return sessionDone({ learned: learned, mistakes: mistakes });
          }
          root.innerHTML = '';
          root.appendChild(el('<div class="summary">' +
            '<div class="summary__emoji">✅</div>' +
            '<div class="summary__title">Круг ' + roundIndex + ' пройден</div>' +
            '<div class="summary__score">' + learned + ' / ' + total + '</div>' +
            '<div class="muted small">Осталось кругов: ' + (rounds.length - roundIndex) + '</div></div>'));
          var next = el('<button type="button" class="btn btn--primary btn--block btn--lg">Продолжить</button>');
          on(next, 'click', startRound);
          root.appendChild(next);
          setKeys(function (e) {
            if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); startRound(); }
          });
        }

        function nextQuestion() {
          if (!queue.length) return roundDone();
          renderQuestion(queue[0]);
        }

        function renderQuestion(entry) {
          var item = entry.item;
          var options = entry.stage === 0 ? choiceOptions(cardList, item.card, item.dir) : null;
          var expected = backOf(item.card, item.dir);

          root.innerHTML = '';
          root.appendChild(headNode(learned, total, roundLabel()));
          root.appendChild(el('<div class="question">' +
            '<div class="question__kicker">' +
            (options ? 'выберите ' : 'напишите ') + backKicker(item.dir) + '</div>' +
            '<div class="question__text">' + esc(frontOf(item.card, item.dir)) + '</div></div>'));

          var area = el('<div class="stack"></div>');
          root.appendChild(area);

          /** Показывает вердикт и ведёт к следующему вопросу. */
          function reveal(correct, given) {
            answered(entry, correct);
            var verdict = el('<div class="verdict ' + (correct ? 'verdict--ok' : 'verdict--no') + '">' +
              icon(correct ? 'check' : 'close') +
              '<span class="grow">' + (correct
                ? 'Верно!'
                : 'Правильный ответ: <span class="verdict__answer">' + esc(expected) + '</span>' +
                  (given ? '<br><span class="small">вы ответили: ' + esc(given) + '</span>' : '')) +
              '</span></div>');
            area.appendChild(verdict);
            $$('button, input', area).forEach(function (b) { b.disabled = true; });

            var next = el('<button type="button" class="btn btn--primary btn--block btn--lg">' +
              (correct ? 'Дальше' : 'Понятно, дальше') + '</button>');
            next.disabled = false;
            on(next, 'click', function () { clearTimeout(timer); nextQuestion(); });
            area.appendChild(next);
            setKeys(function (e) {
              if (e.key === 'Enter' || e.code === 'Space') {
                e.preventDefault();
                clearTimeout(timer);
                nextQuestion();
              }
            });
            // верный ответ не задерживаем — как в Quizlet, идём дальше сами
            if (correct) timer = setTimeout(nextQuestion, 900);
          }

          if (options) {
            var box = el('<div class="options"></div>');
            options.forEach(function (text, i) {
              var btn = el('<button type="button" class="option"><span class="option__mark"></span>' +
                '<span class="grow">' + esc(text) + '</span></button>');
              on(btn, 'click', function () {
                var correct = normalizeAnswer(text) === normalizeAnswer(expected);
                $$('.option', box).forEach(function (b) { b.classList.add('option--disabled'); });
                btn.classList.add(correct ? 'option--correct' : 'option--wrong');
                $('.option__mark', btn).innerHTML = icon(correct ? 'check' : 'close');
                if (!correct) {
                  $$('.option', box).forEach(function (b, idx) {
                    if (normalizeAnswer(options[idx]) === normalizeAnswer(expected)) {
                      b.classList.add('option--correct');
                      $('.option__mark', b).innerHTML = icon('check');
                    }
                  });
                }
                reveal(correct, text);
              });
              box.appendChild(btn);
            });
            area.appendChild(box);
            setKeys(function (e) {
              var n = parseInt(e.key, 10);
              if (n >= 1 && n <= options.length) {
                e.preventDefault();
                $$('.option', box)[n - 1].click();
              }
            });
          } else {
            var form = el('<form class="stack" autocomplete="off">' +
              '<input class="input" type="text" placeholder="Ваш ответ" enterkeyhint="done" ' +
              'autocorrect="off" autocapitalize="none" spellcheck="false">' +
              '<div class="btn-grid">' +
              '<button type="button" class="btn" data-skip>Не знаю</button>' +
              '<button type="submit" class="btn btn--primary">Ответить</button>' +
              '</div></form>');
            var input = $('input', form);
            on(form, 'submit', function (e) {
              e.preventDefault();
              var value = input.value.trim();
              if (!value) return;
              reveal(answerMatches(value, expected), value);
            });
            on($('[data-skip]', form), 'click', function () { reveal(false, ''); });
            area.appendChild(form);
            setKeys(null);
            setTimeout(function () { input.focus(); }, 60);
          }
        }

        startRound();
      }

      /* ------------------------------------------ режим «самооценка» */

      function startSelfMode() {
        var queue = session.items.slice();
        var total = queue.length;
        var index = 0;
        var doneKeys = {};
        var learned = 0;
        var againCount = 0;
        var revealed = false;

        var head = headNode(0, total, session.ahead ? 'досрочно' : 'самооценка');
        var card = el('<div class="flashcard"><div class="flashcard__inner">' +
          '<div class="flashcard__face flashcard__face--front">' +
          '<div class="flashcard__kicker" data-front-kicker></div>' +
          '<div class="flashcard__text" data-front></div>' +
          '<div class="flashcard__hint">Вспомните ответ и нажмите «Показать»</div>' +
          '</div>' +
          '<div class="flashcard__face flashcard__face--back">' +
          '<div class="flashcard__kicker" data-front-small></div>' +
          '<div class="flashcard__text flashcard__text--answer" data-back></div>' +
          '<img class="flashcard__img" data-img alt="" hidden>' +
          '</div></div></div>');
        var showBtn = el('<button type="button" class="btn btn--primary btn--block btn--lg">' +
          icon('eye') + ' Показать ответ</button>');
        var ratings = el('<div class="rating-grid" hidden></div>');

        SRS.RATINGS.forEach(function (rating) {
          var btn = el('<button type="button" class="rating rating--' + rating + '" data-rating="' + rating + '">' +
            '<span class="rating__label">' + SRS.LABELS[rating] + '</span>' +
            '<span class="rating__interval" data-interval></span></button>');
          on(btn, 'click', function () { rate(rating); });
          ratings.appendChild(btn);
        });

        root.appendChild(head);
        root.appendChild(card);
        root.appendChild(showBtn);
        root.appendChild(ratings);

        function render() {
          var item = queue[index];
          if (!item) return sessionDone({ learned: learned, mistakes: againCount });
          revealed = false;
          card.classList.remove('is-flipped');
          showBtn.hidden = false;
          ratings.hidden = true;
          var front = frontOf(item.card, item.dir);
          $('[data-front-kicker]', card).textContent = frontKicker(item.dir);
          $('[data-front]', card).textContent = front;
          $('[data-front-small]', card).textContent = front;
          $('[data-back]', card).textContent = backOf(item.card, item.dir);
          var img = $('[data-img]', card);
          if (item.card.image) { img.src = item.card.image; img.hidden = false; }
          else { img.hidden = true; img.removeAttribute('src'); }

          var p = item.progress || DB.newProgressRecord(item.card.id, deckId, item.dir);
          $$('[data-rating]', ratings).forEach(function (btn) {
            var rating = btn.getAttribute('data-rating');
            $('[data-interval]', btn).textContent = SRS.formatInterval(SRS.previewInterval(p, rating));
          });

          $('.study__counter span', head).textContent = 'Изучено ' + learned + ' из ' + total;
          $('.progress__bar', head).style.width = (learned / total * 100) + '%';
        }

        function reveal() {
          if (revealed) return;
          revealed = true;
          card.classList.add('is-flipped');
          showBtn.hidden = true;
          ratings.hidden = false;
        }

        function rate(rating) {
          var item = queue[index];
          if (!item || !revealed) return;
          applyRating(deckId, item, rating, rateOpts);
          var key = itemKey(item);
          if (rating === 'again') {
            againCount++;
            queue.splice(Math.min(index + 3, queue.length), 0, item);
          } else if (!doneKeys[key]) {
            doneKeys[key] = true;
            learned++;
          }
          index++;
          render();
        }

        on(showBtn, 'click', reveal);
        on(card, 'click', reveal);
        setKeys(function (e) {
          if (e.target.matches('input, textarea')) return;
          if (!revealed && (e.code === 'Space' || e.key === 'Enter')) { e.preventDefault(); reveal(); return; }
          if (!revealed) return;
          var map = { '1': 'again', '2': 'hard', '3': 'good', '4': 'easy' };
          if (map[e.key]) { e.preventDefault(); rate(map[e.key]); }
          else if (e.code === 'Space') { e.preventDefault(); rate('good'); }
        });

        render();
      }

      if ((deck.learnMode || 'quiz') === 'self') startSelfMode();
      else startQuiz();

      return {
        el: root,
        title: 'Учить · ' + deck.name,
        back: '#/deck/' + deckId,
        study: true,
        destroy: cleanup
      };
    });
  }

  /* ================================================================
     Экран: тест
     ================================================================ */

  /** Приводит ответ к сравнимому виду: регистр, ё, пробелы, пунктуация. */
  function normalizeAnswer(text) {
    var s = String(text || '').toLowerCase().replace(/ё/g, 'е');
    try {
      s = s.replace(/[^\p{L}\p{N}\s]+/gu, ' ');
    } catch (e) {
      s = s.replace(/[^0-9a-zа-я\s]+/g, ' ');   // запасной вариант для старых движков
    }
    return s.replace(/\s+/g, ' ').trim();
  }

  /** Ответ верен, если совпал целиком или с одним из вариантов «а, б / в». */
  function answerMatches(input, expected) {
    var got = normalizeAnswer(input);
    if (!got) return false;
    if (got === normalizeAnswer(expected)) return true;
    return String(expected).split(/[\/,;]|\sили\s/).some(function (part) {
      var norm = normalizeAnswer(part);
      return norm && norm === got;
    });
  }

  function screenTest(deckId) {
    return Promise.all([DB.getDeck(deckId), DB.listCards(deckId)]).then(function (res) {
      var deck = res[0], list = res[1];
      if (!deck) return notFound();
      if (!list.length) return emptyStudy(deckId, 'В наборе нет карточек', 'Добавьте карточки, чтобы пройти тест.');

      var root = el('<div class="stack"></div>');
      var deckDirection = deck.direction || 'forward';
      // «ask» — что показывать в вопросе: термин (ответ — определение),
      // определение (ответ — термин) или вперемешку.
      var settings = {
        type: 'mixed',
        count: Math.min(10, list.length),
        ask: deckDirection === 'reverse' ? 'definition' : (deckDirection === 'both' ? 'mixed' : 'term')
      };

      function dirFor() {
        if (settings.ask === 'mixed') return Math.random() < 0.5 ? 'f' : 'r';
        return settings.ask === 'definition' ? 'r' : 'f';
      }

      function buildQuestions() {
        var pool = shuffle(list).slice(0, settings.count);
        return pool.map(function (card) {
          var dir = dirFor();
          var kind = settings.type === 'mixed' ? (Math.random() < 0.5 ? 'choice' : 'written') : settings.type;
          if (kind === 'choice' && list.length < 3) kind = 'written';
          if (kind !== 'choice') return { card: card, dir: dir, kind: 'written' };
          var others = shuffle(list.filter(function (c) { return c.id !== card.id; })).slice(0, 3);
          return { card: card, dir: dir, kind: 'choice', options: shuffle([card].concat(others)) };
        });
      }

      function renderSetup() {
        root.innerHTML = '';
        var counts = [10, 20, list.length].filter(function (n, i, arr) {
          return n <= list.length && arr.indexOf(n) === i;
        });
        if (!counts.length) counts = [list.length];
        settings.count = Math.min(settings.count, list.length);

        var box = el('<div class="stack">' +
          '<div class="section-title">Что в вопросе</div>' +
          '<div class="segmented" data-ask>' +
          '<button type="button" data-value="term">Термин</button>' +
          '<button type="button" data-value="definition">Определение</button>' +
          '<button type="button" data-value="mixed">Вперемешку</button>' +
          '</div>' +
          '<p class="small muted" data-ask-hint></p>' +
          '<div class="section-title">Тип вопросов</div>' +
          '<div class="segmented" data-type>' +
          '<button type="button" data-value="mixed">Смешанный</button>' +
          '<button type="button" data-value="choice">Выбор</button>' +
          '<button type="button" data-value="written">Написать</button>' +
          '</div>' +
          '<div class="section-title">Сколько вопросов</div>' +
          '<div class="segmented" data-count></div>' +
          '</div>');
        var countBox = $('[data-count]', box);
        counts.forEach(function (n) {
          countBox.appendChild(el('<button type="button" data-value="' + n + '">' +
            (n === list.length ? 'все (' + n + ')' : n) + '</button>'));
        });

        var ASK_HINTS = {
          term: 'Показываем термин — ответить нужно определением.',
          definition: 'Показываем определение — ответить нужно термином (например, слово по-русски, а написать по-английски).',
          mixed: 'Стороны чередуются случайно.'
        };

        function syncSegments() {
          $$('[data-ask] button', box).forEach(function (b) {
            b.classList.toggle('is-active', b.getAttribute('data-value') === settings.ask);
          });
          $$('[data-type] button', box).forEach(function (b) {
            b.classList.toggle('is-active', b.getAttribute('data-value') === settings.type);
          });
          $$('[data-count] button', box).forEach(function (b) {
            b.classList.toggle('is-active', +b.getAttribute('data-value') === settings.count);
          });
          $('[data-ask-hint]', box).textContent = ASK_HINTS[settings.ask];
        }
        $$('[data-ask] button', box).forEach(function (b) {
          on(b, 'click', function () { settings.ask = b.getAttribute('data-value'); syncSegments(); });
        });
        $$('[data-type] button', box).forEach(function (b) {
          on(b, 'click', function () { settings.type = b.getAttribute('data-value'); syncSegments(); });
        });
        $$('[data-count] button', box).forEach(function (b) {
          on(b, 'click', function () { settings.count = +b.getAttribute('data-value'); syncSegments(); });
        });
        syncSegments();

        var start = el('<button type="button" class="btn btn--primary btn--block btn--lg">Начать тест</button>');
        on(start, 'click', function () { runTest(buildQuestions()); });

        root.appendChild(box);
        root.appendChild(start);
        root.appendChild(el('<p class="small muted center">Тест не меняет расписание повторений — ' +
          'это просто проверка себя.</p>'));
      }

      function runTest(questions) {
        var index = 0;
        var correct = 0;
        var mistakes = [];

        function renderQuestion() {
          root.innerHTML = '';
          if (index >= questions.length) return renderResult();
          var q = questions[index];

          var head = el('<div class="study__head">' +
            '<div class="study__counter"><span>Вопрос ' + (index + 1) + ' из ' + questions.length + '</span>' +
            '<span>✓ ' + correct + '</span></div>' +
            '<div class="progress"><div class="progress__bar" style="width:' +
            (index / questions.length * 100) + '%"></div></div></div>');
          root.appendChild(head);

          var action = q.kind === 'choice' ? 'выберите ' : 'напишите ';
          var question = el('<div class="question">' +
            '<div class="question__kicker">' + action + backKicker(q.dir) + '</div>' +
            '<div class="question__text">' + esc(frontOf(q.card, q.dir)) + '</div></div>');
          root.appendChild(question);

          if (q.kind === 'choice') renderChoice(q);
          else renderWritten(q);
        }

        function proceed(isCorrect, q, given) {
          if (isCorrect) correct++;
          else mistakes.push({ prompt: frontOf(q.card, q.dir), expected: backOf(q.card, q.dir), given: given });
          var next = el('<button type="button" class="btn btn--primary btn--block btn--lg">' +
            (index === questions.length - 1 ? 'Показать результат' : 'Далее') + '</button>');
          on(next, 'click', function () { index++; renderQuestion(); });
          root.appendChild(next);
          setTimeout(function () { next.focus(); }, 30);
        }

        function renderChoice(q) {
          var box = el('<div class="options"></div>');
          q.options.forEach(function (option) {
            var btn = el('<button type="button" class="option"><span class="option__mark"></span>' +
              '<span class="grow">' + esc(backOf(option, q.dir)) + '</span></button>');
            on(btn, 'click', function () {
              var isCorrect = option.id === q.card.id;
              $$('.option', box).forEach(function (b) { b.classList.add('option--disabled'); });
              btn.classList.add(isCorrect ? 'option--correct' : 'option--wrong');
              $('.option__mark', btn).innerHTML = icon(isCorrect ? 'check' : 'close');
              if (!isCorrect) {
                $$('.option', box).forEach(function (b, i) {
                  if (q.options[i].id === q.card.id) {
                    b.classList.add('option--correct');
                    $('.option__mark', b).innerHTML = icon('check');
                  }
                });
              }
              proceed(isCorrect, q, backOf(option, q.dir));
            });
            box.appendChild(btn);
          });
          root.appendChild(box);
        }

        function renderWritten(q) {
          var form = el('<form class="stack" autocomplete="off">' +
            '<input class="input" type="text" placeholder="Ваш ответ" enterkeyhint="done" ' +
            'autocorrect="off" autocapitalize="none" spellcheck="false">' +
            '<button type="submit" class="btn btn--primary btn--block">Проверить</button>' +
            '</form>');
          var input = $('input', form);
          on(form, 'submit', function (e) {
            e.preventDefault();
            var value = input.value;
            var expected = backOf(q.card, q.dir);
            var isCorrect = answerMatches(value, expected);
            input.disabled = true;
            $('button', form).remove();
            var verdict = el('<div class="verdict ' + (isCorrect ? 'verdict--ok' : 'verdict--no') + '">' +
              icon(isCorrect ? 'check' : 'close') +
              '<span class="grow">' + (isCorrect ? 'Верно!' : 'Правильный ответ: <span class="verdict__answer">' +
                esc(expected) + '</span>') + '</span></div>');
            root.insertBefore(verdict, form.nextSibling);
            proceed(isCorrect, q, value.trim() || '—');
          });
          root.appendChild(form);
          setTimeout(function () { input.focus(); }, 60);
        }

        function renderResult() {
          root.innerHTML = '';
          var pct = Math.round(correct / questions.length * 100);
          root.appendChild(el('<div class="summary">' +
            '<div class="summary__emoji">' + (pct >= 90 ? '🏆' : pct >= 70 ? '👍' : '💪') + '</div>' +
            '<div class="summary__title">Результат</div>' +
            '<div class="summary__score">' + pct + '%</div>' +
            '<div class="muted small">правильных: ' + correct + ' из ' + questions.length + '</div></div>'));

          if (mistakes.length) {
            root.appendChild(el('<div class="section-title">Ошибки</div>'));
            var list2 = el('<div class="card list"></div>');
            mistakes.forEach(function (m) {
              list2.appendChild(el('<div class="list__row list__row--static"><div class="list__main">' +
                '<div class="list__title">' + esc(m.prompt) + '</div>' +
                '<div class="list__sub">Правильно: ' + esc(m.expected) + '</div>' +
                '<div class="list__sub">Вы ответили: ' + esc(m.given) + '</div>' +
                '</div></div>'));
            });
            root.appendChild(list2);
          }

          var again = el('<button type="button" class="btn btn--primary btn--block btn--lg">Пройти ещё раз</button>');
          on(again, 'click', function () { runTest(buildQuestions()); });
          var setup = el('<button type="button" class="btn btn--block">Изменить настройки</button>');
          on(setup, 'click', renderSetup);
          var back = el('<button type="button" class="btn btn--ghost btn--block">К набору</button>');
          on(back, 'click', function () { App.go('#/deck/' + deckId); });
          root.appendChild(again);
          root.appendChild(setup);
          root.appendChild(back);
        }

        renderQuestion();
      }

      renderSetup();

      return { el: root, title: 'Тест · ' + deck.name, back: '#/deck/' + deckId };
    });
  }

  /* ================================================================
     Экран: статистика
     ================================================================ */

  function computeStreak(dates) {
    if (!dates.length) return 0;
    var has = {};
    dates.forEach(function (d) { has[d] = true; });
    var today = DB.today();
    var cursor = has[today] ? today : DB.addDays(today, -1);
    var streak = 0;
    while (has[cursor]) {
      streak++;
      cursor = DB.addDays(cursor, -1);
    }
    return streak;
  }

  function historyChart(reviews, days) {
    var counts = {};
    reviews.forEach(function (r) { counts[r.date] = (counts[r.date] || 0) + 1; });
    var today = DB.today();
    var series = [];
    for (var i = days - 1; i >= 0; i--) {
      var date = DB.addDays(today, -i);
      series.push({ date: date, count: counts[date] || 0 });
    }
    var max = series.reduce(function (m, s) { return Math.max(m, s.count); }, 0);
    var chart = el('<div class="chart"></div>');
    series.forEach(function (s) {
      var height = max ? Math.max(4, Math.round(s.count / max * 100)) : 4;
      var col = el('<div class="chart__col">' +
        '<span class="chart__value">' + (s.count || '') + '</span>' +
        '<span class="chart__bar' + (s.count ? '' : ' chart__bar--empty') + '" style="height:' + height + '%"></span>' +
        '<span class="chart__label">' + s.date.slice(8) + '</span></div>');
      col.title = s.date + ': ' + s.count;
      chart.appendChild(col);
    });
    return { node: chart, series: series, max: max };
  }

  function backupBlock() {
    var box = el('<div class="card card--pad stack">' +
      '<div class="list__title">Резервная копия</div>' +
      '<p class="small muted">Данные хранятся только на устройстве. Сохраните копию перед ' +
      'очисткой Safari или переездом на другой телефон.</p>' +
      '<div class="btn-grid">' +
      '<button type="button" class="btn btn--soft btn--sm" data-export>Сохранить</button>' +
      '<label class="btn btn--soft btn--sm">Восстановить' +
      '<input type="file" accept="application/json,.json" class="sr-only" data-import></label>' +
      '</div></div>');

    on($('[data-export]', box), 'click', function () {
      DB.exportAll().then(function (data) {
        saveTextFile('flashcards-' + DB.today() + '.json', JSON.stringify(data), 'application/json');
        toast('Копия сохранена');
      }).catch(function (e) { toast(e.message, 'error'); });
    });

    on($('[data-import]', box), 'change', function (e) {
      var file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      file.text ? file.text().then(handle).catch(fail) : readAsText(file).then(handle).catch(fail);

      function readAsText(f) {
        return new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onload = function () { resolve(reader.result); };
          reader.onerror = function () { reject(new Error('Не удалось прочитать файл')); };
          reader.readAsText(f);
        });
      }
      function fail(err) { toast(err.message, 'error'); }
      function handle(text) {
        var data;
        try { data = JSON.parse(text); } catch (err) { return fail(new Error('Файл повреждён')); }
        actionSheet('Восстановление', [
          { label: 'Добавить к текущим наборам', value: 'merge' },
          { label: 'Заменить все данные', value: 'replace', cls: 'btn--danger' }
        ]).then(function (mode) {
          if (!mode) return;
          DB.importAll(data, mode).then(function (r) {
            toast('Загружено наборов: ' + r.decks + ', карточек: ' + r.cards);
            App.refresh();
          }).catch(fail);
        });
      }
    });

    return box;
  }

  function screenStats() {
    return Promise.all([
      DB.listDecks(),
      DB.getAllProgress(),
      DB.listReviewsSince(DB.addDays(DB.today(), -29)),
      DB.countReviews(),
      DB.reviewDates()
    ]).then(function (res) {
      var decks = res[0], progress = res[1], reviews = res[2], totalReviews = res[3], dates = res[4];
      var byDeck = {};
      progress.forEach(function (p) { (byDeck[p.deckId] = byDeck[p.deckId] || []).push(p); });
      // в общий счёт идут только те стороны, которые в наборе действительно учат
      var studied = [];
      decks.forEach(function (deck) {
        studied = studied.concat(DB.filterByDirs(byDeck[deck.id] || [], DB.directionsOf(deck)));
      });
      var sum = DB.summarize(studied);
      var root = el('<div class="stack"></div>');

      if (!studied.length) {
        root.appendChild(emptyState({
          icon: 'chart',
          title: 'Пока нет данных',
          text: 'Добавьте карточки и начните учить — здесь появится статистика.',
          buttons: [{ label: 'К наборам', cls: 'btn--primary', onClick: function () { App.go('#/'); } }]
        }));
        root.appendChild(backupBlock());
        return { el: root, title: 'Статистика', back: '#/' };
      }

      root.appendChild(statGrid(sum));
      root.appendChild(el('<div class="card card--pad stack">' +
        '<div class="row"><div class="grow list__title">Освоение</div>' +
        '<div class="mastery__value">' + sum.mastery + '%</div></div>' +
        '<div class="progress progress--lg"><div class="progress__bar" style="width:' +
        sum.mastery + '%"></div></div>' +
        '<div class="row"><div class="grow small muted">Состояние карточек</div>' +
        '<span class="badge badge--due">' + sum.due + ' к повтору</span></div></div>'));
      $('.card--pad', root).appendChild(splitBar(sum));
      $('.card--pad', root).appendChild(el('<p class="small muted">Выученной считается карточка ' +
        'с интервалом больше ' + SRS.MATURE_INTERVAL + ' дней.</p>'));

      var todayCount = reviews.filter(function (r) { return r.date === DB.today(); }).length;
      var week = reviews.filter(function (r) { return r.date >= DB.addDays(DB.today(), -6); }).length;
      var streak = computeStreak(dates);

      root.appendChild(el('<div class="section-title">Повторения</div>'));
      root.appendChild(el('<div class="stat-grid">' +
        '<div class="stat stat--due"><div class="stat__value">' + todayCount + '</div><div class="stat__label">сегодня</div></div>' +
        '<div class="stat"><div class="stat__value">' + week + '</div><div class="stat__label">за 7 дней</div></div>' +
        '<div class="stat"><div class="stat__value">' + totalReviews + '</div><div class="stat__label">всего</div></div>' +
        '<div class="stat stat--mature"><div class="stat__value">' + streak + '</div><div class="stat__label">дней подряд</div></div>' +
        '</div>'));

      var chart = historyChart(reviews, 14);
      var chartCard = el('<div class="card card--pad stack">' +
        '<div class="list__title">История за 14 дней</div></div>');
      chartCard.appendChild(chart.node);
      if (!chart.max) {
        chartCard.appendChild(el('<p class="small muted center">Повторений пока не было</p>'));
      }
      root.appendChild(chartCard);

      if (decks.length) {
        root.appendChild(el('<div class="section-title">По наборам</div>'));
        var list = el('<div class="card list"></div>');
        decks.forEach(function (deck) {
          var s = DB.summarize(DB.filterByDirs(byDeck[deck.id] || [], DB.directionsOf(deck)));
          var dirNote = (deck.direction && deck.direction !== 'forward')
            ? ' · ' + DIRECTION_SHORT[deck.direction] : '';
          var row = el('<div class="list__row"><div class="list__main">' +
            '<div class="list__title">' + esc(deck.name) + '</div>' +
            '<div class="list__sub">освоено ' + s.mastery + '% · выучено ' + s.mature +
            ' · изучаю ' + s.learning + ' · новых ' + s.fresh + dirNote + '</div></div>' +
            (s.due ? '<span class="badge badge--due">' + s.due + '</span>' : '') +
            '<svg viewBox="0 0 24 24" class="chevron" aria-hidden="true"><path d="' + ICONS.forward + '"/></svg></div>');
          on(row, 'click', function () { App.go('#/deck/' + deck.id); });
          list.appendChild(row);
        });
        root.appendChild(list);
      }

      root.appendChild(backupBlock());

      var updateBtn = el('<button type="button" class="btn btn--ghost btn--sm btn--block">' +
        'Проверить обновление</button>');
      on(updateBtn, 'click', function () {
        if (global.App && App.forceUpdate) App.forceUpdate();
      });
      var footer = el('<p class="small muted center">Версия ' + (global.App && App.VERSION || '1.0') + '</p>');
      root.appendChild(updateBtn);
      root.appendChild(footer);

      if (navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate().then(function (est) {
          if (!est || !est.usage) return;
          var mb = (est.usage / 1048576).toFixed(1);
          footer.textContent = 'Занято ' + mb + ' МБ · ' + footer.textContent;
        }).catch(function () { /* не критично */ });
      }

      return { el: root, title: 'Статистика', back: '#/' };
    });
  }

  /* ================================================================
     Экспорт модуля
     ================================================================ */

  global.UI = {
    esc: esc,
    el: el,
    $: $,
    $$: $$,
    on: on,
    icon: icon,
    shuffle: shuffle,
    plural: plural,
    cardsWord: cards,
    toast: toast,
    modal: modal,
    confirmDialog: confirmDialog,
    promptDialog: promptDialog,
    actionSheet: actionSheet,
    parseCardsText: parseCardsText,
    cardsToText: cardsToText,
    normalizeAnswer: normalizeAnswer,
    answerMatches: answerMatches,
    computeStreak: computeStreak,
    saveTextFile: saveTextFile,
    createSampleDeck: createSampleDeck,
    showNewDeckDialog: showNewDeckDialog,
    directionDialog: directionDialog,
    buildItems: buildItems,
    frontOf: frontOf,
    backOf: backOf,
    DIRECTION_LABELS: DIRECTION_LABELS,
    screens: {
      home: screenHome,
      deck: screenDeck,
      cards: screenCards,
      flashcards: screenFlashcards,
      learn: screenLearn,
      test: screenTest,
      stats: screenStats
    }
  };
})(window);
