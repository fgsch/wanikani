// ==UserScript==
// @name         WaniKani Pitch Accent
// @namespace    wk-pitch-accent
// @version      0.1.0
// @author       Federico G. Schwindt <fgsch@lodoss.net>
// @description  Adds OJAD pitch-accent diagrams to WaniKani vocabulary pages, lessons, and quizzes.
// @license      MIT
// @homepageURL  https://github.com/fgsch/wanikani
// @updateURL    https://raw.githubusercontent.com/fgsch/wanikani/main/wk-pitch-accent.js
// @downloadURL  https://raw.githubusercontent.com/fgsch/wanikani/main/wk-pitch-accent.js
// @match        https://www.wanikani.com/*
// @grant        GM.xmlHttpRequest
// @connect      www.gavo.t.u-tokyo.ac.jp
// ==/UserScript==

(function () {
  'use strict';

  const CONTENT_ID = 'wk-pitch-accent';
  const STYLE_ID = 'wk-pitch-accent-style';
  const OJAD_BASE_URL = 'https://www.gavo.t.u-tokyo.ac.jp/ojad';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const VARIANT_COUNT = 4;

  const responseCache = new Map();
  let isRunning = false;

  function isQuizPage() {
    return (
      /^\/subjects\/(?:review|extra_study)(?:\/|$)/.test(location.pathname) ||
      Boolean(
        document.querySelector('.quiz-input') &&
        document.querySelector('.additional-content__item--last-items')
      )
    );
  }

  function isVocabularySubjectPage() {
    return /^\/(?:vocabulary|kana-vocabulary)\/[^/]+\/?$/.test(location.pathname);
  }

  function isSubjectLessonPage() {
    return /^\/subject-lessons\/[\d-]+\/\d+\/?$/.test(location.pathname);
  }

  function isVocabularyLessonPage() {
    return (
      isSubjectLessonPage() &&
      Boolean(
        document.querySelector(
          '.character-header--vocabulary, .character-header--kana-vocabulary'
        )
      )
    );
  }

  function normalizeJapanese(text) {
    return (text || '').replace(/\s+/g, '').normalize('NFC');
  }

  function collectReadings(root, initialReadings = []) {
    const readings = new Set(initialReadings.map(normalizeJapanese).filter(Boolean));

    root?.querySelectorAll('.reading-with-audio__reading, [data-reading]').forEach(element => {
      const reading = normalizeJapanese(
        element.getAttribute('data-reading') || element.textContent
      );
      if (reading) readings.add(reading);
    });

    return [...readings];
  }

  function vocabularyKey(subject) {
    if (!subject) return null;
    return `${subject.characters}\n${[...subject.readings].sort().join('\n')}`;
  }

  function getSubjectPageVocabulary() {
    if (!isVocabularySubjectPage()) return null;

    const characters = normalizeJapanese(
      decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '')
    );
    const header = document.querySelector(
      '.subject-character--vocabulary, .subject-character--kana-vocabulary'
    );
    const readings = collectReadings(document.querySelector('.subject-section--reading'), [
      header?.getAttribute('title')
    ]);

    if (!characters) return null;

    return {
      characters,
      readings
    };
  }

  function getLessonVocabulary() {
    if (!isVocabularyLessonPage()) return null;

    const header = document.querySelector(
      '.character-header--vocabulary, .character-header--kana-vocabulary'
    );
    const charactersElement = header?.querySelector('.character-header__characters');
    const characters = normalizeJapanese(charactersElement?.textContent);
    const readings = collectReadings(document.querySelector('#reading.subject-slide'), [
      charactersElement?.getAttribute('title'),
      header?.getAttribute('title')
    ]);

    if (!characters) return null;
    return { characters, readings };
  }

  function getQuizController() {
    return window.Stimulus?.getControllerForElementAndIdentifier?.(
      document.querySelector('.quiz-input'),
      'quiz-input'
    );
  }

  function getQuizVocabulary() {
    const subject = getQuizController()?.currentSubject;
    if (!subject) return null;

    const type = normalizeJapanese(
      subject.object || subject.type || subject.subject_category
    )
      .toLowerCase()
      .replace(/[_-]/g, '');

    if (type !== 'vocabulary' && type !== 'kanavocabulary') return null;

    const characters = normalizeJapanese(subject.characters);
    const readings = (subject.readings || [])
      .filter(reading =>
        reading.acceptedAnswer ?? reading.accepted_answer ?? reading.primary ?? true
      )
      .map(reading => normalizeJapanese(reading.reading))
      .filter(Boolean);

    if (!characters) return null;
    return {
      characters,
      readings: readings.length ? readings : [characters]
    };
  }

  function fetchText(url) {
    if (responseCache.has(url)) return responseCache.get(url);

    const request = new Promise((resolve, reject) => {
      GM.xmlHttpRequest({
        method: 'GET',
        url,
        onload: response => {
          if (response.status >= 200 && response.status < 300) {
            resolve(response.responseText);
          } else {
            reject(new Error(`HTTP ${response.status}`));
          }
        },
        onerror: reject
      });
    });

    responseCache.set(url, request);
    return request;
  }

  function parseAccentWord(accentedWord) {
    const moras = [...accentedWord.children].map(element => ({
      text: normalizeJapanese(element.querySelector('.char')?.textContent),
      high:
        element.classList.contains('accent_plain') ||
        element.classList.contains('accent_top'),
      drop: element.classList.contains('accent_top'),
      unvoiced: element.classList.contains('unvoiced')
    }));

    if (!moras.length || moras.some(mora => !mora.text)) return null;
    return moras;
  }

  function parseOjadResults(html, subject) {
    const document = new DOMParser().parseFromString(html, 'text/html');
    const acceptedReadings = new Set(subject.readings.map(normalizeJapanese));
    const variants = [];
    const seen = new Set();

    document.querySelectorAll('#word_table tbody tr').forEach(row => {
      const headword = normalizeJapanese(
        row.querySelector('.midashi_word')?.textContent.split('・')[0]
      );

      if (headword !== subject.characters) return;

      row.querySelectorAll('.katsuyo_jisho_js .accented_word').forEach(word => {
        const moras = parseAccentWord(word);
        if (!moras) return;

        const reading = moras.map(mora => mora.text).join('');
        if (acceptedReadings.size && !acceptedReadings.has(reading)) return;

        const key = moras
          .map(mora => `${mora.text}:${mora.high ? 1 : 0}:${mora.drop ? 1 : 0}`)
          .join('|');

        if (seen.has(key)) return;
        seen.add(key);
        variants.push({ reading, moras });
      });
    });

    return variants;
  }

  function getPatternLabel(moras) {
    return `${getPatternName(moras)} [${getAccentNumber(moras)}]`;
  }

  function getPatternName(moras) {
    const dropIndex = getAccentNumber(moras);

    if (!dropIndex) return 'Heiban';
    if (dropIndex === 1) return 'Atamadaka';
    if (dropIndex === moras.length) return 'Odaka';
    return 'Nakadaka';
  }

  function getAccentNumber(moras) {
    return moras.findIndex(mora => mora.drop) + 1;
  }

  function createSvgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, String(value));
    });
    return element;
  }

  function createPitchSvg(variant) {
    const step = 24;
    const highY = 3;
    const lowY = 30;
    const accentNumber = getAccentNumber(variant.moras);
    const width = variant.moras.length * step + 28;
    const svg = createSvgElement('svg', {
      viewBox: `0 0 ${width} 33`,
      role: 'img',
      'aria-label': `${variant.reading}, ${getPatternLabel(variant.moras)} pitch accent`
    });

    variant.moras.forEach((mora, index) => {
      const character = createSvgElement('text', {
        x: step / 2 + index * step,
        y: 18,
        class: 'wk-pitch-accent-character'
      });
      character.textContent = mora.text;
      if (mora.unvoiced) character.classList.add('wk-pitch-accent-unvoiced');
      svg.appendChild(character);
    });

    const points = [{ x: 2, y: variant.moras[0].high ? highY : lowY }];
    variant.moras.forEach((mora, index) => {
      const isLast = index === variant.moras.length - 1;
      const nextHigh = isLast ? accentNumber === 0 : variant.moras[index + 1].high;
      const currentY = mora.high ? highY : lowY;
      const nextY = nextHigh ? highY : lowY;
      const changesPitch = currentY !== nextY;
      const right = (index + 1) * step - (changesPitch ? 0 : 2);

      points.push({ x: right, y: currentY });
      if (changesPitch) points.push({ x: right, y: nextY });
    });

    svg.appendChild(
      createSvgElement('polyline', {
        points: points.map(point => `${point.x},${point.y}`).join(' '),
        fill: 'none',
        stroke: 'var(--wk-pitch-accent-color)',
        'stroke-width': 2.5,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      })
    );

    svg.appendChild(
      createSvgElement('ellipse', {
        cx: variant.moras.length * step + 16,
        cy: 18,
        rx: 10,
        ry: 10,
        fill: 'var(--wk-pitch-accent-color)',
        'fill-opacity': 0.16
      })
    );

    const number = createSvgElement('text', {
      x: variant.moras.length * step + 16,
      y: 18,
      class: 'wk-pitch-accent-number',
      fill: 'var(--wk-pitch-accent-color)'
    });
    number.textContent = String(accentNumber);
    svg.appendChild(number);

    return svg;
  }

  function createCredit(subject) {
    const credit = document.createElement('p');
    credit.className = 'wk-pitch-accent-credit';

    const searchUrl = `${OJAD_BASE_URL}/search/index/word:${encodeURIComponent(subject.characters)}`;
    credit.append('Pitch-accent data from ');

    const link = document.createElement('a');
    link.href = searchUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'OJAD (Online Japanese Accent Dictionary)';
    credit.append(link, '.');

    return credit;
  }

  function createPitchContent(subject, variants, error = null) {
    const visual = document.createElement('div');
    const details = document.createElement('div');
    visual.id = CONTENT_ID;
    visual.className = 'wk-pitch-accent wk-pitch-accent-visual';
    details.className = 'wk-pitch-accent wk-pitch-accent-details';

    if (error) {
      visual.hidden = true;
      const message = document.createElement('p');
      message.className = 'wk-pitch-accent-status';
      message.textContent = error;
      details.appendChild(message);
    } else {
      const charts = document.createElement('div');

      charts.className = 'wk-pitch-accent-charts';

      variants.forEach((variant, index) => {
        const variantClass = `wk-pitch-accent-variant-${index % VARIANT_COUNT + 1}`;
        const figure = document.createElement('figure');
        const caption = document.createElement('figcaption');

        figure.className = variantClass;
        caption.textContent = getPatternName(variant.moras);
        figure.append(createPitchSvg(variant), caption);
        charts.appendChild(figure);
      });

      visual.appendChild(charts);
    }

    details.appendChild(createCredit(subject));
    return { visual, details, replacesReading: !error };
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .wk-pitch-accent-visual {
        padding: 12px 0 8px;
      }

      .wk-pitch-accent-details {
        padding: 4px 0;
      }

      .wk-pitch-accent-reading-group {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .wk-pitch-accent-reading-group
        > .wk-pitch-accent-reading-hidden.subject-readings-with-audio
      {
        display: flex !important;
        flex-direction: column;
        gap: 12px;
        height: auto !important;
      }

      .wk-pitch-accent-reading-group
        > .wk-pitch-accent-reading-hidden.subject-readings-with-audio
        > .subject-readings-with-audio__item {
        display: contents !important;
      }

      .wk-pitch-accent-reading-group .wk-pitch-accent-details {
        padding: 0 0 4px;
      }

      .wk-pitch-accent .wk-pitch-accent-charts {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        align-items: flex-end;
      }

      .wk-pitch-accent figure {
        display: flex;
        align-items: center;
        gap: 7px;
        margin: 0;
      }

      .wk-pitch-accent-variant-1 { --wk-pitch-accent-color: #007a4d; }
      .wk-pitch-accent-variant-2 { --wk-pitch-accent-color: #9c007e; }
      .wk-pitch-accent-variant-3 { --wk-pitch-accent-color: #0068a8; }
      .wk-pitch-accent-variant-4 { --wk-pitch-accent-color: #984b00; }

      html[data-wk-dark-theme="dark"] .wk-pitch-accent-variant-1 {
        --wk-pitch-accent-color: #43e0a1;
      }

      html[data-wk-dark-theme="dark"] .wk-pitch-accent-variant-2 {
        --wk-pitch-accent-color: #ff68e7;
      }

      html[data-wk-dark-theme="dark"] .wk-pitch-accent-variant-3 {
        --wk-pitch-accent-color: #62b8ff;
      }

      html[data-wk-dark-theme="dark"] .wk-pitch-accent-variant-4 {
        --wk-pitch-accent-color: #ffad5c;
      }

      .wk-pitch-accent svg {
        display: block;
        width: auto;
        height: 33px;
        overflow: visible;
      }

      .wk-pitch-accent .wk-pitch-accent-character,
      .wk-pitch-accent .wk-pitch-accent-number {
        font-size: 18px;
        text-anchor: middle;
        dominant-baseline: middle;
      }

      .wk-pitch-accent .wk-pitch-accent-character {
        fill: currentColor;
      }

      .wk-pitch-accent .wk-pitch-accent-number {
        font-size: 14px;
        font-weight: 700;
      }

      .wk-pitch-accent .wk-pitch-accent-unvoiced {
        opacity: .55;
      }

      .wk-pitch-accent figcaption {
        color: var(--wk-pitch-accent-color);
        font-size: 16px;
        font-weight: 600;
      }

      .wk-pitch-accent-reading-hidden .wk-pitch-accent-original-reading,
      .wk-pitch-accent-reading-hidden.wk-pitch-accent-original-reading {
        display: none !important;
      }

      .wk-pitch-accent .wk-pitch-accent-credit {
        margin: 0;
        font-size: 12px;
        opacity: .75;
      }

      .wk-pitch-accent .wk-pitch-accent-credit a {
        text-decoration: underline;
      }
    `;
    document.head.appendChild(style);
  }

  function findReadingRow(readingContent) {
    return (
      readingContent.querySelector('.subject-readings-with-audio') ||
      readingContent.querySelector('.reading-with-audio') ||
      readingContent.querySelector('.subject-section__subsection--reading')
    );
  }

  function markOriginalReading(readingRow) {
    const explicitReadings = [
      ...readingRow.querySelectorAll('.reading-with-audio__reading, [data-reading]')
    ];

    if (explicitReadings.length) {
      explicitReadings.forEach(element => {
        element.classList.add('wk-pitch-accent-original-reading');
      });
      return;
    }

    const audioRows = readingRow.matches('.reading-with-audio')
      ? [readingRow]
      : [...readingRow.querySelectorAll('.reading-with-audio')];
    const containers = audioRows.length ? audioRows : [readingRow];

    containers.forEach(container => {
      [...container.childNodes]
        .filter(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
        .forEach(node => {
          const reading = document.createElement('span');
          reading.className = 'wk-pitch-accent-original-reading';
          reading.textContent = node.textContent;
          node.replaceWith(reading);
        });
    });
  }

  function insertPitchAroundReading(readingContent, content) {
    const readingRow = findReadingRow(readingContent);

    if (!readingRow) return false;

    readingRow.before(content.visual);
    if (content.replacesReading) {
      const group = document.createElement('div');
      group.className = 'wk-pitch-accent-reading-group';

      markOriginalReading(readingRow);
      readingRow.classList.add('wk-pitch-accent-reading-hidden');
      readingRow.before(group);
      group.append(readingRow, content.details);
    } else {
      readingRow.after(content.details);
    }
    return true;
  }

  function restoreReadingGroups(root) {
    root?.querySelectorAll('.wk-pitch-accent-reading-group').forEach(group => {
      const readingRow = group.querySelector('.wk-pitch-accent-reading-hidden');

      if (readingRow) {
        readingRow.classList.remove('wk-pitch-accent-reading-hidden');
        group.before(readingRow);
      }
      group.remove();
    });
  }

  function getSubjectReadingContent() {
    return document.querySelector(
      '.subject-section--reading > .subject-section__content'
    );
  }

  function insertSubjectReading(content) {
    const readingContent = getSubjectReadingContent();
    if (!readingContent) return false;

    insertPitchAroundReading(readingContent, content);
    return true;
  }

  function getLessonReadingContent() {
    const readingSlide = document.querySelector('#reading.subject-slide');
    return (
      readingSlide?.querySelector(
        '.subject-section[title="Reading"] > .subject-section__content'
      ) ||
      readingSlide?.querySelector('.subject-section__content') ||
      readingSlide?.querySelector('.subject-slide__sections')
    );
  }

  function lessonPageIsReady() {
    const readingContent = getLessonReadingContent();
    return Boolean(readingContent && findReadingRow(readingContent));
  }

  function insertLessonReading(content) {
    const readingContent = getLessonReadingContent();

    if (!readingContent) return false;

    insertPitchAroundReading(readingContent, content);
    return true;
  }

  async function runQuiz() {
    if (!isQuizPage()) return;

    const subject = getQuizVocabulary();
    const input = document.querySelector('.quiz-input__input-container');
    const frame = document.querySelector(
      'turbo-frame#subject-info, turbo-frame.subject-info'
    );
    const revealed = Boolean(subject && input?.hasAttribute('correct'));

    if (!revealed) {
      restoreReadingGroups(frame);
      frame?.querySelectorAll('.wk-pitch-accent').forEach(element => element.remove());
      return;
    }

    const readingContent = frame?.querySelector(
      '.subject-section--reading > .subject-section__content'
    );
    if (
      !readingContent ||
      !findReadingRow(readingContent) ||
      document.getElementById(CONTENT_ID) ||
      isRunning
    ) {
      return;
    }

    isRunning = true;
    try {
      const content = await loadPitchContent(subject);
      const currentSubject = getQuizVocabulary();
      const stillRevealed = document
        .querySelector('.quiz-input__input-container')
        ?.hasAttribute('correct');

      if (
        !stillRevealed ||
        vocabularyKey(currentSubject) !== vocabularyKey(subject) ||
        !readingContent.isConnected ||
        document.getElementById(CONTENT_ID)
      ) {
        return;
      }

      injectStyles();
      insertPitchAroundReading(readingContent, content);
    } finally {
      isRunning = false;
      setTimeout(run, 0);
    }
  }

  async function loadPitchContent(subject) {
    const searchUrl = `${OJAD_BASE_URL}/search/index/word:${encodeURIComponent(subject.characters)}`;

    try {
      const html = await fetchText(searchUrl);
      const variants = parseOjadResults(html, subject);
      return createPitchContent(
        subject,
        variants,
        variants.length ? null : 'No exact OJAD pitch accent found.'
      );
    } catch (error) {
      console.warn('[WaniKani Pitch Accent] Could not fetch OJAD:', error);
      return createPitchContent(subject, [], 'OJAD pitch accent is currently unavailable.');
    }
  }

  async function run() {
    if (isQuizPage()) {
      runQuiz();
      return;
    }

    if (isRunning || document.getElementById(CONTENT_ID)) return;

    const isLesson = isVocabularyLessonPage();
    const subject = isLesson ? getLessonVocabulary() : getSubjectPageVocabulary();
    const pageIsReady = isLesson
      ? lessonPageIsReady()
      : Boolean(
          getSubjectReadingContent() &&
          findReadingRow(getSubjectReadingContent())
        );

    if (!subject || !pageIsReady) return;

    isRunning = true;
    try {
      const content = await loadPitchContent(subject);
      if (document.getElementById(CONTENT_ID)) return;
      if (isLesson ? !isVocabularyLessonPage() : !isVocabularySubjectPage()) return;
      const currentSubject = isLesson
        ? getLessonVocabulary()
        : getSubjectPageVocabulary();
      if (vocabularyKey(currentSubject) !== vocabularyKey(subject)) return;
      injectStyles();
      if (isLesson) insertLessonReading(content);
      else insertSubjectReading(content);
    } finally {
      isRunning = false;
      setTimeout(run, 0);
    }
  }

  function installNavigationWatcher() {
    document.addEventListener('turbo:load', run);
    document.addEventListener('turbo:render', run);
    document.addEventListener('turbo:frame-load', run);
    window.addEventListener('popstate', () => setTimeout(run, 0));

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args);
      setTimeout(run, 0);
      return result;
    };

    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      setTimeout(run, 0);
      return result;
    };

    const observer = new MutationObserver(run);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['correct'],
      childList: true,
      subtree: true
    });
  }

  injectStyles();
  installNavigationWatcher();
  run();
})();
