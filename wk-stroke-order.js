// ==UserScript==
// @name         WaniKani Stroke Order
// @namespace    wk-stroke-order
// @version      0.1.0
// @author       Federico G. Schwindt <fgsch@lodoss.net>
// @description  Adds animated KanjiVG stroke order, radicals, and component groups to WaniKani kanji pages.
// @license      MIT
// @homepageURL  https://github.com/fgsch/wanikani
// @updateURL    https://raw.githubusercontent.com/fgsch/wanikani/main/wk-stroke-order.js
// @downloadURL  https://raw.githubusercontent.com/fgsch/wanikani/main/wk-stroke-order.js
// @match        https://www.wanikani.com/*
// @grant        GM.xmlHttpRequest
// @connect      raw.githubusercontent.com
// ==/UserScript==

(async function () {
  'use strict';

  const SECTION_ID = 'stroke-order';
  const CONTENT_ID = 'wk-kanjivg-stroke-order';
  const STYLE_ID = 'wk-kanjivg-style';
  const RADICAL_COLOR = '#c586d7';
  const GROUP_COLOR = '#86a8d7';

  let isRunning = false;
  const processedPaths = new Set();

  function isKanjiPage() {
    return /^\/kanji\/[^/]+\/?$/.test(location.pathname);
  }

  function getKanjiFromUrl() {
    if (!isKanjiPage()) return null;

    const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
    return Array.from(slug)[0] || null;
  }

  function kanjiToKanjiVGFilename(kanji) {
    return `${kanji.codePointAt(0).toString(16).padStart(5, '0')}.svg`;
  }

  function randomKanjiVGViewerColor() {
    let color = '#';
    for (let i = 0; i < 3; i++) {
      color += Math.floor(Math.random() * 12).toString(16).toUpperCase();
    }
    return color;
  }

  function findHeading(text) {
    return [...document.querySelectorAll('h2, h3')].find(h =>
      h.textContent.trim().toLowerCase().includes(text.toLowerCase())
    );
  }

  function findGoToLink(text) {
    return [...document.querySelectorAll('a')].find(a =>
      a.textContent.trim() === text
    );
  }

  function fetchText(url) {
    return new Promise((resolve, reject) => {
      GM.xmlHttpRequest({
        method: 'GET',
        url,
        onload: res => {
          if (res.status >= 200 && res.status < 300) resolve(res.responseText);
          else reject(new Error(`HTTP ${res.status}`));
        },
        onerror: reject
      });
    });
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${CONTENT_ID} {
        display: grid;
        grid-template-columns: minmax(260px, 320px) 1fr;
        gap: 28px;
        align-items: start;
      }

      #${CONTENT_ID} .wk-kanjivg-main-column {
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      #${CONTENT_ID} svg.wk-kanjivg-main {
        width: 280px;
        height: 280px;
        display: block;
        margin: 16px 0 12px;
      }

      #${CONTENT_ID} path {
        fill: none !important;
        stroke-width: 3 !important;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      #${CONTENT_ID} text {
        font-weight: bold;
      }

      #${CONTENT_ID} .wk-kanjivg-replay {
        display: inline-flex;
        width: fit-content;
        margin-top: 12px;
        list-style: none;
      }

      #${CONTENT_ID} .wk-kanjivg-options {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin: 16px 0;
      }

      #${CONTENT_ID} .wk-kanjivg-options label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
      }

      #${CONTENT_ID} .wk-kanjivg-figures {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        margin-bottom: 16px;
      }

      #${CONTENT_ID} figure {
        margin: 0;
        text-align: center;
      }

      #${CONTENT_ID} figure svg {
        width: 120px;
        height: 120px;
        display: block;
      }

      #${CONTENT_ID} figcaption {
        font-size: 13px;
        margin-top: 4px;
      }

      #${CONTENT_ID} .wk-kanjivg-credit {
        grid-column: 1 / -1;
        margin-top: 20px;
        margin-bottom: 32px;
        font-size: 12px;
        opacity: .75;
      }

      #${CONTENT_ID} .wk-kanjivg-credit a {
        text-decoration: underline;
      }

      @media (max-width: 720px) {
        #${CONTENT_ID} {
          grid-template-columns: 1fr;
        }

        #${CONTENT_ID} svg.wk-kanjivg-main {
          width: 240px;
          height: 240px;
        }
      }

      @keyframes wkKanjiVGDraw {
        to {
          stroke-dashoffset: 0;
        }
      }

      @keyframes wkKanjiVGFadeIn {
        to {
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function prepareSvg(svg, kanji) {
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.classList.add('wk-kanjivg-main');
    svg.setAttribute('aria-label', `${kanji} stroke order`);
  }

  function sanitizeSvg(svg) {
    svg.querySelectorAll('script, foreignObject').forEach(element => {
      element.remove();
    });

    [svg, ...svg.querySelectorAll('*')].forEach(element => {
      [...element.attributes].forEach(attribute => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim().toLowerCase();

        if (name.startsWith('on')) {
          element.removeAttribute(attribute.name);
          return;
        }

        if ((name === 'href' || name === 'xlink:href') && value && !value.startsWith('#')) {
          element.removeAttribute(attribute.name);
        }
      });
    });
  }

  function animateSvg(svg) {
    const paths = [...svg.querySelectorAll('path')];
    const texts = [...svg.querySelectorAll('text')];

    texts.forEach(text => {
      text.style.opacity = '0';
      text.style.animation = 'none';
    });

    paths.forEach((path, index) => {
      const color = randomKanjiVGViewerColor();
      const length = path.getTotalLength();
      const delay = `${index * 0.55}s`;

      path.style.stroke = color;
      path.style.strokeDasharray = String(length);
      path.style.strokeDashoffset = String(length);
      path.style.animation = 'wkKanjiVGDraw 0.7s ease forwards';
      path.style.animationDelay = delay;

      if (texts[index]) {
        texts[index].style.fill = color;
        texts[index].style.opacity = '0';
        texts[index].style.animation = 'wkKanjiVGFadeIn 0.15s ease forwards';
        texts[index].style.animationDelay = delay;
      }
    });
  }

  function getGroupLabel(group) {
    return (
      group.getAttribute('kvg:element') ||
      group.getAttribute('kvg:original') ||
      group.id ||
      'Group'
    );
  }

  function createHighlightedCopy(svg, matchingGroupIds, highlightColor, label) {
    const copy = svg.cloneNode(true);
    copy.classList.remove('wk-kanjivg-main');
    copy.setAttribute('aria-label', label);

    [...copy.querySelectorAll('text')].forEach(text => {
      text.style.display = 'none';
    });

    [...copy.querySelectorAll('path')].forEach(path => {
      path.style.stroke = '#ddd';
      path.style.strokeWidth = '2';
      path.style.opacity = '0.35';
      path.style.animation = 'none';
      path.style.strokeDasharray = 'none';
      path.style.strokeDashoffset = '0';
    });

    matchingGroupIds.forEach(groupId => {
      const group = copy.getElementById(groupId);
      if (!group) return;

      [...group.querySelectorAll('path')].forEach(path => {
        path.style.stroke = highlightColor;
        path.style.strokeWidth = '4';
        path.style.opacity = '1';
      });
    });

    [...copy.querySelectorAll('[id]')].forEach(element => {
      element.removeAttribute('id');
    });

    return copy;
  }

  function collectRadicals(svg) {
    return [...svg.querySelectorAll('g')]
      .filter(group => group.getAttribute('kvg:radical') && group.id)
      .map(group => {
        const radicalType = group.getAttribute('kvg:radical');
        return {
          id: group.id,
          label:
            radicalType === 'general' || radicalType === 'tradit'
              ? 'Radical'
              : `${radicalType} radical`
        };
      });
  }

  function collectComponentGroups(svg) {
    return [...svg.querySelectorAll('g')]
      .filter(group =>
        group.getAttribute('kvg:element') &&
        group.id &&
        group.querySelectorAll('path').length
      )
      .map(group => ({
        id: group.id,
        label: getGroupLabel(group)
      }));
  }

  function createFigure(svg, groupIds, color, captionText, className) {
    const figure = document.createElement('figure');
    const caption = document.createElement('figcaption');
    const copy = createHighlightedCopy(svg, groupIds, color, captionText);

    if (className) figure.className = className;

    caption.textContent = captionText;
    figure.append(copy, caption);

    return figure;
  }

  function createCheckbox(labelText, checked) {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');

    checkbox.type = 'checkbox';
    checkbox.checked = checked;

    label.append(checkbox, document.createTextNode(labelText));

    return { label, checkbox };
  }

  function createSidePanel(svg) {
    const side = document.createElement('div');
    side.className = 'wk-kanjivg-side-column';

    const options = document.createElement('div');
    options.className = 'wk-kanjivg-options';

    const figures = document.createElement('div');
    figures.className = 'wk-kanjivg-figures';

    const radicals = collectRadicals(svg);
    const groups = collectComponentGroups(svg);

    const radicalControl = createCheckbox('Show the radicals', true);
    const groupControl = createCheckbox('Show the component groups', true);

    radicals.forEach(radical => {
      figures.appendChild(
        createFigure(
          svg,
          [radical.id],
          RADICAL_COLOR,
          radical.label,
          'wk-kanjivg-radical-figure'
        )
      );
    });

    groups.forEach(group => {
      figures.appendChild(
        createFigure(
          svg,
          [group.id],
          GROUP_COLOR,
          group.label,
          'wk-kanjivg-group-figure'
        )
      );
    });

    if (radicals.length) options.appendChild(radicalControl.label);
    if (groups.length) options.appendChild(groupControl.label);

    radicalControl.checkbox.addEventListener('change', () => {
      figures.querySelectorAll('.wk-kanjivg-radical-figure').forEach(figure => {
        figure.hidden = !radicalControl.checkbox.checked;
      });
    });

    groupControl.checkbox.addEventListener('change', () => {
      figures.querySelectorAll('.wk-kanjivg-group-figure').forEach(figure => {
        figure.hidden = !groupControl.checkbox.checked;
      });
    });

    if (options.children.length) side.appendChild(options);
    if (figures.children.length) side.appendChild(figures);

    return side;
  }

  function copyNavTextStyle(navTemplate, control) {
    const sourceText =
      navTemplate.querySelector('.wk-nav__item-text') ||
      navTemplate.querySelector('span') ||
      navTemplate;

    const targetText =
      control.querySelector('.wk-nav__item-text') ||
      control.querySelector('span') ||
      control;

    const computed = getComputedStyle(sourceText);

    targetText.style.fontSize = computed.fontSize;
    targetText.style.lineHeight = computed.lineHeight;
    targetText.style.fontFamily = computed.fontFamily;
    targetText.style.fontWeight = computed.fontWeight;
  }

  function createReplayControl(onClick) {
    const navTemplate =
      document.querySelector('a.wk-nav__item') ||
      findGoToLink('Meaning') ||
      findGoToLink('Stroke Order');

    let control;

    if (navTemplate) {
      control = navTemplate.cloneNode(true);
      control.classList.add('wk-kanjivg-replay');
      control.href = '#';
      control.removeAttribute('aria-current');

      const text =
        control.querySelector('.wk-nav__item-text') ||
        control.querySelector('span') ||
        control;

      text.textContent = 'Replay animation';
      copyNavTextStyle(navTemplate, control);
    } else {
      control = document.createElement('a');
      control.href = '#';
      control.className = 'wk-kanjivg-replay wk-nav__item';

      const text = document.createElement('span');
      text.className = 'wk-nav__item-text';
      text.textContent = 'Replay animation';
      control.appendChild(text);
    }

    control.addEventListener('click', event => {
      event.preventDefault();
      onClick();
    });

    return control;
  }

  function addGoToNavigationItem() {
    if (document.querySelector(`a[href="#${SECTION_ID}"]`)) return;

    const meaningLink = findGoToLink('Meaning');
    if (!meaningLink) return;

    const newLink = meaningLink.cloneNode(true);
    newLink.textContent = 'Stroke Order';
    newLink.href = `#${SECTION_ID}`;

    const meaningLi = meaningLink.closest('li');

    if (meaningLi) {
      const newLi = meaningLi.cloneNode(false);
      newLi.appendChild(newLink);
      meaningLi.insertAdjacentElement('beforebegin', newLi);
    } else {
      meaningLink.insertAdjacentElement('beforebegin', newLink);
    }
  }

  function insertStrokeOrderSection(svg, kanji) {
    const radicalHeading = findHeading('Radical Combination');
    const meaningHeading = findHeading('Meaning');

    if (!radicalHeading || !meaningHeading) return false;

    const strokeHeading = radicalHeading.cloneNode(false);
    strokeHeading.id = SECTION_ID;
    strokeHeading.textContent = 'Stroke Order';

    const content = document.createElement('div');
    content.id = CONTENT_ID;

    const mainColumn = document.createElement('div');
    mainColumn.className = 'wk-kanjivg-main-column';

    prepareSvg(svg, kanji);

    const replayControl = createReplayControl(() => {
      const clone = svg.cloneNode(true);
      svg.replaceWith(clone);
      svg = clone;
      prepareSvg(svg, kanji);
      animateSvg(svg);
    });

    const credit = document.createElement('p');
    credit.className = 'wk-kanjivg-credit';
    credit.innerHTML = `
      Stroke, radical, and component data from
      <a href="https://kanjivg.tagaini.net/"
         target="_blank"
         rel="noopener noreferrer">KanjiVG</a>,
      CC BY-SA 3.0.
    `;

    mainColumn.append(svg, replayControl);
    content.append(mainColumn, createSidePanel(svg), credit);

    meaningHeading.insertAdjacentElement('beforebegin', content);
    content.insertAdjacentElement('beforebegin', strokeHeading);

    animateSvg(svg);

    return true;
  }

  async function run() {
    if (isRunning) return;
    if (!isKanjiPage()) return;
    if (document.getElementById(CONTENT_ID)) return;
    if (processedPaths.has(location.pathname)) return;

    const radicalHeading = findHeading('Radical Combination');
    const meaningHeading = findHeading('Meaning');

    if (!radicalHeading || !meaningHeading) return;

    isRunning = true;

    try {
      const kanji = getKanjiFromUrl();
      if (!kanji) return;

      processedPaths.add(location.pathname);

      const filename = kanjiToKanjiVGFilename(kanji);
      const svgUrl = `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${filename}`;

      let svgText;

      try {
        svgText = await fetchText(svgUrl);
      } catch (err) {
        console.warn('[KanjiVG] Could not fetch SVG:', err);
        return;
      }

      const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
      const svg = doc.querySelector('svg');

      if (!svg) return;

      sanitizeSvg(svg);
      injectStyles();

      if (insertStrokeOrderSection(svg, kanji)) {
        addGoToNavigationItem();
      }
    } finally {
      isRunning = false;
    }
  }

  function installNavigationWatcher() {
    let previousPath = location.pathname;

    const checkPath = () => {
      if (location.pathname === previousPath) return;

      previousPath = location.pathname;
      processedPaths.clear();
      run();
    };

    if (window.navigation && typeof window.navigation.addEventListener === 'function') {
      window.navigation.addEventListener('navigate', () => {
        setTimeout(checkPath, 0);
      });
    }

    document.addEventListener('turbo:load', run);
    document.addEventListener('turbo:render', run);
    document.addEventListener('turbo:frame-load', run);

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args);
      setTimeout(checkPath, 0);
      return result;
    };

    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      setTimeout(checkPath, 0);
      return result;
    };

    window.addEventListener('popstate', () => {
      setTimeout(checkPath, 0);
    });

    const observer = new MutationObserver(() => {
      run();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  injectStyles();
  installNavigationWatcher();
  run();
})();
