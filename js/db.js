/*
 * db.js — обёртка над IndexedDB.
 *
 * Хранилища:
 *   decks    { id, name, direction, learnMode, createdAt, updatedAt, cardIds[] }
 *              direction: forward (термин -> определение) | reverse | both
 *              learnMode: quiz (приложение проверяет ответ) | self (самооценка)
 *   cards    { id, deckId, term, definition, image, createdAt, updatedAt }
 *   progress { cardId, card, dir, deckId, interval, easeFactor, repetitions,
 *              lapses, dueDate, lastReviewed }
 *              У каждой карточки две независимо планируемые стороны.
 *              cardId — ключ записи: «<id>» для прямой стороны и «<id>|r» для
 *              обратной; поле card всегда хранит настоящий id карточки, dir —
 *              сторону ('f' или 'r'). Записи, созданные до появления обратных
 *              карточек, лишены card/dir и достраиваются в normalizeProgress().
 *   reviews  { id++, cardId, dir, deckId, rating, quality, interval, date, ts }
 *   meta     { key, value }
 */
(function (global) {
  'use strict';

  var DB_NAME = 'flashcards';
  var DB_VERSION = 1;
  var dbPromise = null;

  /* ---------------------------------------------------------------- утилиты */

  function uid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    if (global.crypto && global.crypto.getRandomValues) {
      var a = new Uint8Array(16);
      global.crypto.getRandomValues(a);
      return Array.prototype.map.call(a, function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    }
    return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function dateToStr(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  /** Сегодняшняя дата по локальному времени в формате YYYY-MM-DD. */
  function today() { return dateToStr(new Date()); }

  function strToDate(str) {
    var p = String(str).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function addDays(dateStr, n) {
    var d = strToDate(dateStr);
    d.setDate(d.getDate() + n);
    return dateToStr(d);
  }

  /** Сколько дней от a до b (b - a). */
  function daysBetween(a, b) {
    return Math.round((strToDate(b) - strToDate(a)) / 86400000);
  }

  /* ------------------------------------------------------- стороны карточек */

  var DIRECTIONS = { forward: ['f'], reverse: ['r'], both: ['f', 'r'] };

  /** Какие стороны карточек изучаются в наборе: ['f'], ['r'] или обе. */
  function directionsOf(deck) {
    return DIRECTIONS[(deck && deck.direction) || 'forward'] || DIRECTIONS.forward;
  }

  /** Ключ записи прогресса для стороны карточки. */
  function progressKey(cardId, dir) {
    return dir === 'r' ? cardId + '|r' : cardId;
  }

  /** Достраивает card/dir у записей, сохранённых до появления обратных карточек. */
  function normalizeProgress(p) {
    if (!p) return p;
    if (!p.dir) p.dir = 'f';
    if (!p.card) {
      p.card = p.dir === 'r' ? String(p.cardId).replace(/\|r$/, '') : p.cardId;
    }
    return p;
  }

  /** Оставляет только записи изучаемых сторон. */
  function filterByDirs(progressList, dirs) {
    return progressList.map(normalizeProgress).filter(function (p) {
      return dirs.indexOf(p.dir) !== -1;
    });
  }

  /* ------------------------------------------------------------ соединение */

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('decks')) {
          db.createObjectStore('decks', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('cards')) {
          db.createObjectStore('cards', { keyPath: 'id' }).createIndex('by_deck', 'deckId');
        }
        if (!db.objectStoreNames.contains('progress')) {
          var pr = db.createObjectStore('progress', { keyPath: 'cardId' });
          pr.createIndex('by_deck', 'deckId');
          pr.createIndex('by_due', 'dueDate');
        }
        if (!db.objectStoreNames.contains('reviews')) {
          var rv = db.createObjectStore('reviews', { keyPath: 'id', autoIncrement: true });
          rv.createIndex('by_date', 'date');
          rv.createIndex('by_deck', 'deckId');
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };
      req.onsuccess = function () {
        req.result.onversionchange = function () { req.result.close(); dbPromise = null; };
        resolve(req.result);
      };
      req.onerror = function () { reject(req.error); };
      req.onblocked = function () { reject(new Error('База заблокирована другой вкладкой')); };
    });
    return dbPromise;
  }

  /**
   * Выполняет транзакцию. body(stores, done) работает на колбэках IndexedDB —
   * так транзакция гарантированно не закроется между шагами (важно для Safari).
   */
  function withTx(names, mode, body) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(names, mode);
        var result;
        var stores = {};
        (typeof names === 'string' ? [names] : names).forEach(function (n) {
          stores[n] = tx.objectStore(n);
        });
        tx.oncomplete = function () { resolve(result); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error || new Error('Транзакция прервана')); };
        try {
          body(stores, function (value) { result = value; }, tx);
        } catch (err) {
          try { tx.abort(); } catch (e) { /* уже прервана */ }
          reject(err);
        }
      });
    });
  }

  /** Обходит курсор индекса/хранилища и вызывает fn для каждой записи. */
  function eachCursor(source, range, fn) {
    var req = source.openCursor(range);
    req.onsuccess = function () {
      var cur = req.result;
      if (!cur) return;
      fn(cur.value, cur);
      cur.continue();
    };
  }

  /* ---------------------------------------------------------------- наборы */

  function listDecks() {
    return withTx('decks', 'readonly', function (s, done) {
      s.decks.getAll().onsuccess = function (e) {
        done(e.target.result.sort(function (a, b) {
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        }));
      };
    });
  }

  function getDeck(id) {
    return withTx('decks', 'readonly', function (s, done) {
      s.decks.get(id).onsuccess = function (e) { done(e.target.result || null); };
    });
  }

  function createDeck(name, direction) {
    var deck = {
      id: uid(),
      name: String(name || 'Без названия').trim() || 'Без названия',
      direction: DIRECTIONS[direction] ? direction : 'forward',
      learnMode: 'quiz',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      cardIds: []
    };
    return withTx('decks', 'readwrite', function (s, done) {
      s.decks.put(deck);
      done(deck);
    });
  }

  function renameDeck(id, name) {
    return updateDeck(id, { name: name });
  }

  /** Меняет настройки набора (name, direction, learnMode). */
  function updateDeck(deckId, patch) {
    return withTx(['decks'], 'readwrite', function (s, done) {
      s.decks.get(deckId).onsuccess = function (e) {
        var deck = e.target.result;
        if (!deck) throw new Error('Набор не найден');
        if (patch.name) deck.name = String(patch.name).trim() || deck.name;
        if (patch.direction && DIRECTIONS[patch.direction]) deck.direction = patch.direction;
        if (patch.learnMode) deck.learnMode = patch.learnMode === 'self' ? 'self' : 'quiz';
        deck.updatedAt = Date.now();
        s.decks.put(deck);
        done(deck);
      };
    });
  }

  function setDeckLearnMode(deckId, mode) {
    return updateDeck(deckId, { learnMode: mode });
  }

  /** Меняет изучаемые стороны набора и досоздаёт недостающие записи прогресса. */
  function setDeckDirection(deckId, direction) {
    return updateDeck(deckId, { direction: DIRECTIONS[direction] ? direction : 'forward' })
      .then(function (deck) {
      return ensureProgress(deckId).then(function () { return deck; });
    });
  }

  /**
   * Досоздаёт записи прогресса для обеих сторон каждой карточки.
   * Нужен для наборов, созданных до появления обратных карточек; если всё на
   * месте, не пишет ничего.
   */
  function ensureProgress(deckId) {
    return withTx(['cards', 'progress'], 'readwrite', function (s, done) {
      s.cards.index('by_deck').getAll(IDBKeyRange.only(deckId)).onsuccess = function (e) {
        var cards = e.target.result;
        s.progress.index('by_deck').getAllKeys(IDBKeyRange.only(deckId)).onsuccess = function (ev) {
          var have = {};
          ev.target.result.forEach(function (key) { have[key] = true; });
          var created = 0;
          cards.forEach(function (card) {
            ['f', 'r'].forEach(function (dir) {
              if (!have[progressKey(card.id, dir)]) {
                s.progress.put(newProgressRecord(card.id, deckId, dir));
                created++;
              }
            });
          });
          done(created);
        };
      };
    });
  }

  function touchDeck(stores, deckId) {
    stores.decks.get(deckId).onsuccess = function (e) {
      var deck = e.target.result;
      if (deck) { deck.updatedAt = Date.now(); stores.decks.put(deck); }
    };
  }

  /** Удаляет набор вместе с карточками, прогрессом и журналом повторений. */
  function deleteDeck(id) {
    return withTx(['decks', 'cards', 'progress', 'reviews'], 'readwrite', function (s, done) {
      s.decks.delete(id);
      eachCursor(s.cards.index('by_deck'), IDBKeyRange.only(id), function (v, c) { c.delete(); });
      eachCursor(s.progress.index('by_deck'), IDBKeyRange.only(id), function (v, c) { c.delete(); });
      eachCursor(s.reviews.index('by_deck'), IDBKeyRange.only(id), function (v, c) { c.delete(); });
      done(true);
    });
  }

  /* -------------------------------------------------------------- карточки */

  function newProgressRecord(cardId, deckId, dir) {
    var d = dir === 'r' ? 'r' : 'f';
    return {
      cardId: progressKey(cardId, d),
      card: cardId,
      dir: d,
      deckId: deckId,
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
      lapses: 0,
      dueDate: today(),
      lastReviewed: null
    };
  }

  /** Карточки набора в порядке deck.cardIds (хвостом — всё, чего нет в списке). */
  function listCards(deckId) {
    return withTx(['decks', 'cards'], 'readonly', function (s, done) {
      s.decks.get(deckId).onsuccess = function (e) {
        var deck = e.target.result;
        s.cards.index('by_deck').getAll(IDBKeyRange.only(deckId)).onsuccess = function (ev) {
          var cards = ev.target.result;
          var byId = {};
          cards.forEach(function (c) { byId[c.id] = c; });
          var ordered = [];
          var seen = {};
          ((deck && deck.cardIds) || []).forEach(function (id) {
            if (byId[id] && !seen[id]) { ordered.push(byId[id]); seen[id] = true; }
          });
          cards.forEach(function (c) { if (!seen[c.id]) ordered.push(c); });
          done(ordered);
        };
      };
    });
  }

  function makeCard(deckId, data) {
    return {
      id: uid(),
      deckId: deckId,
      term: String(data.term || '').trim(),
      definition: String(data.definition || '').trim(),
      image: data.image || null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  /** Добавляет одну или несколько карточек ([{term, definition, image}]). */
  function addCards(deckId, list) {
    var items = (Array.isArray(list) ? list : [list])
      .map(function (d) { return makeCard(deckId, d); })
      .filter(function (c) { return c.term || c.definition; });
    if (!items.length) return Promise.resolve([]);
    return withTx(['decks', 'cards', 'progress'], 'readwrite', function (s, done) {
      items.forEach(function (card) {
        s.cards.put(card);
        s.progress.put(newProgressRecord(card.id, deckId, 'f'));
        s.progress.put(newProgressRecord(card.id, deckId, 'r'));
      });
      s.decks.get(deckId).onsuccess = function (e) {
        var deck = e.target.result;
        if (!deck) throw new Error('Набор не найден');
        deck.cardIds = (deck.cardIds || []).concat(items.map(function (c) { return c.id; }));
        deck.updatedAt = Date.now();
        s.decks.put(deck);
      };
      done(items);
    });
  }

  function updateCard(card) {
    return withTx(['cards', 'decks'], 'readwrite', function (s, done) {
      s.cards.get(card.id).onsuccess = function (e) {
        var stored = e.target.result;
        if (!stored) throw new Error('Карточка не найдена');
        stored.term = String(card.term || '').trim();
        stored.definition = String(card.definition || '').trim();
        stored.image = card.image === undefined ? stored.image : card.image;
        stored.updatedAt = Date.now();
        s.cards.put(stored);
        touchDeck(s, stored.deckId);
        done(stored);
      };
    });
  }

  /** Удаляет карточку и её прогресс. Журнал повторений (история) сохраняется. */
  function deleteCard(cardId) {
    return withTx(['decks', 'cards', 'progress'], 'readwrite', function (s, done) {
      s.cards.get(cardId).onsuccess = function (e) {
        var card = e.target.result;
        if (!card) return done(false);
        s.cards.delete(cardId);
        s.progress.delete(progressKey(cardId, 'f'));
        s.progress.delete(progressKey(cardId, 'r'));
        s.decks.get(card.deckId).onsuccess = function (ev) {
          var deck = ev.target.result;
          if (!deck) return;
          deck.cardIds = (deck.cardIds || []).filter(function (id) { return id !== cardId; });
          deck.updatedAt = Date.now();
          s.decks.put(deck);
        };
        done(true);
      };
    });
  }

  /* -------------------------------------------------------------- прогресс */

  function getDeckProgress(deckId) {
    return withTx('progress', 'readonly', function (s, done) {
      s.progress.index('by_deck').getAll(IDBKeyRange.only(deckId)).onsuccess = function (e) {
        done(e.target.result.map(normalizeProgress));
      };
    });
  }

  function getAllProgress() {
    return withTx('progress', 'readonly', function (s, done) {
      s.progress.getAll().onsuccess = function (e) {
        done(e.target.result.map(normalizeProgress));
      };
    });
  }

  function putProgress(progress) {
    return withTx('progress', 'readwrite', function (s, done) {
      s.progress.put(progress);
      done(progress);
    });
  }

  /** Сбрасывает прогресс набора: карточки снова становятся новыми. */
  function resetDeckProgress(deckId) {
    return withTx(['progress', 'cards'], 'readwrite', function (s, done) {
      s.cards.index('by_deck').getAll(IDBKeyRange.only(deckId)).onsuccess = function (e) {
        e.target.result.forEach(function (card) {
          s.progress.put(newProgressRecord(card.id, deckId, 'f'));
          s.progress.put(newProgressRecord(card.id, deckId, 'r'));
        });
        done(true);
      };
    });
  }

  /* ------------------------------------------------------- журнал повторов */

  function recordReview(entry) {
    var row = {
      cardId: entry.cardId,
      dir: entry.dir === 'r' ? 'r' : 'f',
      deckId: entry.deckId,
      rating: entry.rating,
      quality: entry.quality,
      interval: entry.interval,
      date: today(),
      ts: Date.now()
    };
    return withTx('reviews', 'readwrite', function (s, done) {
      s.reviews.put(row);
      done(row);
    });
  }

  /** Все повторения начиная с даты YYYY-MM-DD включительно. */
  function listReviewsSince(dateStr) {
    return withTx('reviews', 'readonly', function (s, done) {
      s.reviews.index('by_date').getAll(IDBKeyRange.lowerBound(dateStr)).onsuccess = function (e) {
        done(e.target.result);
      };
    });
  }

  function countReviews() {
    return withTx('reviews', 'readonly', function (s, done) {
      s.reviews.count().onsuccess = function (e) { done(e.target.result); };
    });
  }

  /** Все даты повторений (для серии дней подряд) — уникальные, по возрастанию. */
  function reviewDates() {
    return withTx('reviews', 'readonly', function (s, done) {
      var dates = [];
      var last = null;
      var req = s.reviews.index('by_date').openKeyCursor();
      req.onsuccess = function () {
        var cur = req.result;
        if (!cur) return done(dates);
        if (cur.key !== last) { dates.push(cur.key); last = cur.key; }
        cur.continue();
      };
    });
  }

  /* --------------------------------------------------------------- сводки */

  /** Считает статистику по массиву прогресса: новые / изучаю / выучено / к повтору. */
  function summarize(progressList) {
    var t = today();
    var mature = (global.SRS && global.SRS.MATURE_INTERVAL) || 21;
    var sum = { total: progressList.length, fresh: 0, learning: 0, mature: 0, due: 0, mastery: 0 };
    var masterySum = 0;
    progressList.forEach(function (p) {
      if (!p.lastReviewed) sum.fresh++;
      else if ((p.interval || 0) > mature) sum.mature++;
      else sum.learning++;
      if (!p.dueDate || p.dueDate <= t) sum.due++;
      // освоенность стороны: интервал в долях «взрослого» (21 день)
      masterySum += Math.min(p.interval || 0, mature) / mature;
    });
    sum.mastery = progressList.length ? Math.round(masterySum / progressList.length * 100) : 0;
    return sum;
  }

  function deckSummary(deckId, deck) {
    return getDeckProgress(deckId).then(function (list) {
      return summarize(filterByDirs(list, directionsOf(deck)));
    });
  }

  /* ------------------------------------------------------- meta / сервисы */

  function getMeta(key, fallback) {
    return withTx('meta', 'readonly', function (s, done) {
      s.meta.get(key).onsuccess = function (e) {
        done(e.target.result ? e.target.result.value : fallback);
      };
    });
  }

  function setMeta(key, value) {
    return withTx('meta', 'readwrite', function (s, done) {
      s.meta.put({ key: key, value: value });
      done(value);
    });
  }

  /** Полная выгрузка базы (резервная копия). */
  function exportAll() {
    return Promise.all([
      listDecks(),
      withTx('cards', 'readonly', function (s, done) {
        s.cards.getAll().onsuccess = function (e) { done(e.target.result); };
      }),
      getAllProgress(),
      withTx('reviews', 'readonly', function (s, done) {
        s.reviews.getAll().onsuccess = function (e) { done(e.target.result); };
      })
    ]).then(function (r) {
      return {
        format: 'flashcards-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        decks: r[0], cards: r[1], progress: r[2], reviews: r[3]
      };
    });
  }

  /**
   * Импорт резервной копии. mode 'merge' — добавить наборы к существующим
   * (id перегенерируются), 'replace' — полностью заменить базу.
   */
  function importAll(data, mode) {
    if (!data || !Array.isArray(data.decks) || !Array.isArray(data.cards)) {
      return Promise.reject(new Error('Файл не похож на резервную копию'));
    }
    var replace = mode === 'replace';
    var idMap = {};
    var decks = data.decks.map(function (d) {
      var id = replace ? d.id : uid();
      idMap[d.id] = id;
      return {
        id: id, name: d.name || 'Без названия',
        direction: DIRECTIONS[d.direction] ? d.direction : 'forward',
        learnMode: d.learnMode === 'self' ? 'self' : 'quiz',
        createdAt: d.createdAt || Date.now(), updatedAt: Date.now(), cardIds: []
      };
    });
    var cardMap = {};
    var cards = data.cards.filter(function (c) { return idMap[c.deckId]; }).map(function (c) {
      var id = replace ? c.id : uid();
      cardMap[c.id] = id;
      return {
        id: id, deckId: idMap[c.deckId], term: c.term || '', definition: c.definition || '',
        image: c.image || null, createdAt: c.createdAt || Date.now(), updatedAt: Date.now()
      };
    });
    var deckById = {};
    decks.forEach(function (d) { deckById[d.id] = d; });
    data.decks.forEach(function (d) {
      var target = deckById[idMap[d.id]];
      target.cardIds = (d.cardIds || []).map(function (cid) { return cardMap[cid]; })
        .filter(Boolean);
    });
    cards.forEach(function (c) {
      var d = deckById[c.deckId];
      if (d.cardIds.indexOf(c.id) === -1) d.cardIds.push(c.id);
    });
    var progress = (data.progress || []).map(normalizeProgress)
      .filter(function (p) { return cardMap[p.card]; })
      .map(function (p) {
        var card = cardMap[p.card];
        return {
          cardId: progressKey(card, p.dir), card: card, dir: p.dir,
          deckId: idMap[p.deckId],
          interval: p.interval || 0, easeFactor: p.easeFactor || 2.5,
          repetitions: p.repetitions || 0, lapses: p.lapses || 0,
          dueDate: p.dueDate || today(), lastReviewed: p.lastReviewed || null
        };
      });
    var haveProgress = {};
    progress.forEach(function (p) { haveProgress[p.cardId] = true; });
    cards.forEach(function (c) {
      ['f', 'r'].forEach(function (dir) {
        if (!haveProgress[progressKey(c.id, dir)]) {
          progress.push(newProgressRecord(c.id, c.deckId, dir));
        }
      });
    });
    var reviews = (data.reviews || []).filter(function (r) { return cardMap[r.cardId]; })
      .map(function (r) {
        return {
          cardId: cardMap[r.cardId], dir: r.dir === 'r' ? 'r' : 'f',
          deckId: idMap[r.deckId], rating: r.rating,
          quality: r.quality, interval: r.interval, date: r.date, ts: r.ts || Date.now()
        };
      });

    return withTx(['decks', 'cards', 'progress', 'reviews'], 'readwrite', function (s, done) {
      if (replace) {
        s.decks.clear(); s.cards.clear(); s.progress.clear(); s.reviews.clear();
      }
      decks.forEach(function (d) { s.decks.put(d); });
      cards.forEach(function (c) { s.cards.put(c); });
      progress.forEach(function (p) { s.progress.put(p); });
      reviews.forEach(function (r) { s.reviews.put(r); });
      done({ decks: decks.length, cards: cards.length });
    });
  }

  /** Просит браузер не вытеснять данные (iOS чистит storage у редких сайтов). */
  function requestPersistence() {
    if (!navigator.storage || !navigator.storage.persist) return Promise.resolve(false);
    return navigator.storage.persisted().then(function (already) {
      return already ? true : navigator.storage.persist();
    }).catch(function () { return false; });
  }

  global.DB = {
    uid: uid,
    today: today,
    addDays: addDays,
    daysBetween: daysBetween,
    dateToStr: dateToStr,
    strToDate: strToDate,
    open: openDB,
    listDecks: listDecks,
    getDeck: getDeck,
    createDeck: createDeck,
    renameDeck: renameDeck,
    updateDeck: updateDeck,
    setDeckDirection: setDeckDirection,
    setDeckLearnMode: setDeckLearnMode,
    ensureProgress: ensureProgress,
    directionsOf: directionsOf,
    progressKey: progressKey,
    normalizeProgress: normalizeProgress,
    filterByDirs: filterByDirs,
    deleteDeck: deleteDeck,
    listCards: listCards,
    addCards: addCards,
    updateCard: updateCard,
    deleteCard: deleteCard,
    getDeckProgress: getDeckProgress,
    getAllProgress: getAllProgress,
    putProgress: putProgress,
    resetDeckProgress: resetDeckProgress,
    newProgressRecord: newProgressRecord,
    recordReview: recordReview,
    listReviewsSince: listReviewsSince,
    countReviews: countReviews,
    reviewDates: reviewDates,
    summarize: summarize,
    deckSummary: deckSummary,
    getMeta: getMeta,
    setMeta: setMeta,
    exportAll: exportAll,
    importAll: importAll,
    requestPersistence: requestPersistence
  };
})(window);
