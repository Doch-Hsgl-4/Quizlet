/*
 * srs.js — интервальное повторение, упрощённый SM-2 (как в Anki).
 *
 * Оценка пользователя -> качество ответа q по шкале SM-2 (0..5):
 *   «снова»  -> 2   «трудно» -> 3   «хорошо» -> 4   «легко» -> 5
 *
 * Коэффициент лёгкости — стандартная формула SM-2:
 *   EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)),  EF >= 1.3
 *
 * Интервал — расписание SM-2 (1 день -> 6 дней -> interval * EF)
 * с anki-подобными поправками: «трудно» = x1.2, «легко» = x EF x 1.3,
 * «снова» обнуляет серию и возвращает карточку в сегодняшнюю сессию.
 */
(function (global) {
  'use strict';

  var MIN_EF = 1.3;
  var DEFAULT_EF = 2.5;
  var MAX_INTERVAL = 3650;          // 10 лет — дальше расти незачем
  var MATURE_INTERVAL = 21;         // с этого интервала карточка считается выученной
  var HARD_MULTIPLIER = 1.2;
  var EASY_BONUS = 1.3;

  var RATINGS = ['again', 'hard', 'good', 'easy'];

  var QUALITY = { again: 2, hard: 3, good: 4, easy: 5 };

  var LABELS = {
    again: 'Снова',
    hard: 'Трудно',
    good: 'Хорошо',
    easy: 'Легко'
  };

  function clampEase(ef) {
    return Math.max(MIN_EF, Math.round(ef * 100) / 100);
  }

  function nextEase(ef, quality) {
    var diff = 5 - quality;
    return clampEase((ef || DEFAULT_EF) + (0.1 - diff * (0.08 + diff * 0.02)));
  }

  function clampInterval(days) {
    return Math.max(1, Math.min(MAX_INTERVAL, Math.round(days)));
  }

  /**
   * Считает новое состояние карточки.
   * @param {object} progress запись прогресса (не изменяется)
   * @param {string} rating   again | hard | good | easy
   * @param {string} [todayStr] дата в формате YYYY-MM-DD
   * @returns {object} новая запись прогресса
   */
  function schedule(progress, rating, todayStr) {
    if (RATINGS.indexOf(rating) === -1) throw new Error('Неизвестная оценка: ' + rating);
    var day = todayStr || DB.today();
    var p = progress || {};
    var ef = nextEase(p.easeFactor || DEFAULT_EF, QUALITY[rating]);
    var reps = p.repetitions || 0;
    var prev = p.interval || 0;
    var interval;
    var lapses = p.lapses || 0;

    if (rating === 'again') {
      // Провал: серия сбрасывается, карточка снова показывается сегодня.
      reps = 0;
      interval = 0;
      lapses += 1;
    } else {
      reps += 1;
      if (reps === 1) {
        interval = rating === 'easy' ? 4 : 1;
      } else if (reps === 2) {
        interval = rating === 'hard' ? 4 : (rating === 'easy' ? 8 : 6);
      } else {
        var base = prev > 0 ? prev : 1;
        if (rating === 'hard') interval = base * HARD_MULTIPLIER;
        else if (rating === 'easy') interval = base * ef * EASY_BONUS;
        else interval = base * ef;
      }
      interval = clampInterval(interval);
    }

    return {
      cardId: p.cardId,
      deckId: p.deckId,
      interval: interval,
      easeFactor: ef,
      repetitions: reps,
      lapses: lapses,
      dueDate: interval === 0 ? day : DB.addDays(day, interval),
      lastReviewed: new Date().toISOString()
    };
  }

  /** Интервал, который получится при такой оценке (для подписей на кнопках). */
  function previewInterval(progress, rating) {
    return schedule(progress, rating, DB.today()).interval;
  }

  /** «5 д», «2 мес», «сейчас» — короткая подпись интервала. */
  function formatInterval(days) {
    if (!days) return 'сейчас';
    if (days < 30) return days + ' д';
    if (days < 365) {
      var m = Math.round(days / 30);
      return m + ' мес';
    }
    var y = Math.round(days / 36.5) / 10;
    return (y % 1 === 0 ? y : y.toFixed(1)) + ' г';
  }

  function isDue(progress, todayStr) {
    var day = todayStr || DB.today();
    return !progress || !progress.dueDate || progress.dueDate <= day;
  }

  /** Состояние карточки: new | learning | mature. */
  function stateOf(progress) {
    if (!progress || !progress.lastReviewed) return 'new';
    return (progress.interval || 0) > MATURE_INTERVAL ? 'mature' : 'learning';
  }

  global.SRS = {
    RATINGS: RATINGS,
    QUALITY: QUALITY,
    LABELS: LABELS,
    DEFAULT_EF: DEFAULT_EF,
    MIN_EF: MIN_EF,
    MATURE_INTERVAL: MATURE_INTERVAL,
    schedule: schedule,
    nextEase: nextEase,
    previewInterval: previewInterval,
    formatInterval: formatInterval,
    isDue: isDue,
    stateOf: stateOf
  };
})(window);
