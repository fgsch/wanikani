// ==UserScript==
// @name         WaniKani Pitch Accent
// @namespace    wk-pitch-accent
// @version      0.8.0
// @author       Federico G. Schwindt <fgsch@lodoss.net>
// @description  Adds OJAD pitch-accent diagrams to WaniKani vocabulary pages, lessons, and quizzes.
// @license      MIT
// @homepageURL  https://github.com/fgsch/wanikani
// @updateURL    https://raw.githubusercontent.com/fgsch/wanikani/main/wk-pitch-accent.js
// @downloadURL  https://raw.githubusercontent.com/fgsch/wanikani/main/wk-pitch-accent.js
// @match        https://www.wanikani.com/*
// @grant        GM.xmlHttpRequest
// @grant        unsafeWindow
// @connect      www.gavo.t.u-tokyo.ac.jp
// ==/UserScript==

(function () {
  "use strict";

  const CONTENT_ID = "wk-pitch-accent";
  const STYLE_ID = "wk-pitch-accent-style";
  const OJAD_BASE_URL = "https://www.gavo.t.u-tokyo.ac.jp/ojad";
  const RESPONSE_CACHE_LIMIT = 100;
  const REQUEST_TIMEOUT_MS = 15_000;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const PATTERN_VARIANT = {
    Heiban: 1,
    Atamadaka: 2,
    Nakadaka: 3,
    Odaka: 4,
  };
  const ORIGINAL_READING_NODES = Symbol("originalReadingNodes");
  const NAME = GM_info.script.name;
  const VERSION = GM_info.script.version;

  const responseCache = new Map();
  let isRunning = false;

  function isQuizPage() {
    return (
      /^\/subjects\/(?:review|extra_study)(?:\/|$)/.test(location.pathname) ||
      Boolean(
        document.querySelector(".quiz-input") &&
        document.querySelector(".additional-content__item--last-items"),
      )
    );
  }

  function isVocabularySubjectPage() {
    return /^\/(?:vocabulary|kana-vocabulary)\/[^/]+\/?$/.test(
      location.pathname,
    );
  }

  function isSubjectLessonPage() {
    return /^\/subject-lessons\/[\d-]+\/\d+\/?$/.test(location.pathname);
  }

  function isSupportedLessonPage() {
    return (
      isSubjectLessonPage() &&
      Boolean(
        document.querySelector(
          ".character-header--kanji, .character-header--vocabulary, .character-header--kana-vocabulary",
        ),
      )
    );
  }

  function normalizeJapanese(text) {
    return (text || "").replace(/\s+/g, "").normalize("NFC");
  }

  function collectReadings(root, initialReadings = []) {
    const readings = new Set(
      initialReadings.map(normalizeJapanese).filter(Boolean),
    );

    root
      ?.querySelectorAll(
        ".reading-with-audio__reading, [data-reading], .wk-text[lang='ja']",
      )
      .forEach((element) => {
        const reading = normalizeJapanese(
          element.getAttribute("data-reading") || element.textContent,
        );
        if (reading) {
          readings.add(reading);
        }
      });

    return [...readings];
  }

  function vocabularyKey(subject) {
    if (!subject) {
      return null;
    }
    return `${subject.characters}\n${[...subject.readings].sort().join("\n")}`;
  }

  function getSubjectPageVocabulary(quiet) {
    if (!isVocabularySubjectPage()) {
      if (!quiet) {
        console.debug(`[${NAME}] Not a vocabulary subject page`);
      }
      return null;
    }

    const characters = normalizeJapanese(
      decodeURIComponent(
        location.pathname.split("/").filter(Boolean).pop() || "",
      ),
    );
    const header = document.querySelector(
      ".subject-character--vocabulary, .subject-character--kana-vocabulary",
    );
    const readings = collectReadings(
      document.querySelector(".subject-section--reading"),
      [header?.getAttribute("title")],
    );

    if (!characters) {
      if (!quiet) {
        console.debug(`[${NAME}] No characters found for subject page`);
      }
      return null;
    }

    if (!quiet) {
      console.debug(`[${NAME}] Subject page vocabulary:`, {
        characters,
        readings,
      });
    }
    return {
      characters,
      readings,
    };
  }

  function getLessonSubject(quiet) {
    if (!isSupportedLessonPage()) {
      if (!quiet) {
        console.debug(`[${NAME}] Not a supported lesson page`);
      }
      return null;
    }

    const header = document.querySelector(
      ".character-header--kanji, .character-header--vocabulary, .character-header--kana-vocabulary",
    );
    const charactersElement = header?.querySelector(
      ".character-header__characters",
    );
    const characters = normalizeJapanese(charactersElement?.textContent);
    const readings = collectReadings(
      document.querySelector("#reading.subject-slide"),
      [charactersElement?.getAttribute("title"), header?.getAttribute("title")],
    );

    if (!characters) {
      if (!quiet) {
        console.debug(`[${NAME}] No characters found for lesson page`);
      }
      return null;
    }
    if (!quiet) {
      console.debug(`[${NAME}] Lesson subject:`, { characters, readings });
    }
    return { characters, readings };
  }

  function getQuizController() {
    const pageWindow =
      typeof unsafeWindow === "undefined" ? window : unsafeWindow;
    const stimulus = pageWindow.Stimulus || window.Stimulus;
    const quizInput =
      pageWindow.document?.querySelector(".quiz-input") ||
      document.querySelector(".quiz-input");

    return stimulus?.getControllerForElementAndIdentifier?.(
      quizInput,
      "quiz-input",
    );
  }

  function getQuizVocabulary() {
    const subject = getQuizController()?.currentSubject;
    if (!subject) {
      console.debug(`[${NAME}] No quiz controller/subject found`);
      return null;
    }

    const type = normalizeJapanese(
      subject.object || subject.type || subject.subject_category,
    )
      .toLowerCase()
      .replace(/[_-]/g, "");

    if (type !== "vocabulary" && type !== "kanavocabulary") {
      console.debug(`[${NAME}] Quiz subject is not vocabulary:`, type);
      return null;
    }

    const characters = normalizeJapanese(subject.characters);
    const readings = (subject.readings || [])
      .filter((reading) => {
        const accepted =
          reading.acceptedAnswer ?? reading.accepted_answer ?? reading.primary;
        if (accepted !== undefined) {
          return accepted;
        }

        const kind = normalizeJapanese(reading.kind).toLowerCase();
        return !kind || kind === "primary" || kind === "alternative";
      })
      .map((reading) => normalizeJapanese(reading.reading || reading.text))
      .filter(Boolean);

    if (!characters) {
      console.debug(`[${NAME}] No characters found for quiz subject`);
      return null;
    }
    console.debug(`[${NAME}] Quiz vocabulary:`, { characters, readings });
    return {
      characters,
      readings: readings.length ? readings : [characters],
    };
  }

  function fetchText(url) {
    if (responseCache.has(url)) {
      const response = responseCache.get(url);
      responseCache.delete(url);
      responseCache.set(url, response);
      return response;
    }

    const request = new Promise((resolve, reject) => {
      GM.xmlHttpRequest({
        method: "GET",
        url,
        timeout: REQUEST_TIMEOUT_MS,
        onload: (response) => {
          if (response.status >= 200 && response.status < 300) {
            resolve(response.responseText);
          } else {
            reject(new Error(`HTTP ${response.status}`));
          }
        },
        onerror: reject,
        ontimeout: () => reject(new Error("Request timed out")),
      });
    });

    responseCache.set(url, request);
    request.catch(() => {
      if (responseCache.get(url) === request) {
        responseCache.delete(url);
      }
    });
    if (responseCache.size > RESPONSE_CACHE_LIMIT) {
      responseCache.delete(responseCache.keys().next().value);
    }
    return request;
  }

  function parseAccentWord(accentedWord) {
    const moras = [...accentedWord.children].map((element) => ({
      text: normalizeJapanese(
        [...element.querySelectorAll(".char")]
          .map((char) => char.textContent)
          .join(""),
      ),
      high:
        element.classList.contains("accent_plain") ||
        element.classList.contains("accent_top"),
      drop: element.classList.contains("accent_top"),
      unvoiced: element.classList.contains("unvoiced"),
    }));

    if (!moras.length || moras.some((mora) => !mora.text)) {
      return null;
    }
    return moras;
  }

  function parseOjadResults(html, subject) {
    const document = new DOMParser().parseFromString(html, "text/html");
    const acceptedReadings = new Set(subject.readings.map(normalizeJapanese));
    const variants = [];
    const seen = new Set();

    const rows = document.querySelectorAll("#word_table tbody tr");
    console.debug(
      `[${NAME}] OJAD rows found:`,
      rows.length,
      "for",
      subject.characters,
    );

    document.querySelectorAll("#word_table tbody tr").forEach((row) => {
      const headword = normalizeJapanese(
        row.querySelector(".midashi_word")?.textContent.split("・")[0],
      );

      if (headword !== subject.characters) {
        console.debug(
          `[${NAME}] Skipping row, headword mismatch:`,
          headword,
          "!=",
          subject.characters,
        );
        return;
      }

      row
        .querySelectorAll(".katsuyo_jisho_js .accented_word")
        .forEach((word) => {
          const moras = parseAccentWord(word);
          if (!moras) {
            console.debug(`[${NAME}] Could not parse accent word`);
            return;
          }

          const reading = moras.map((mora) => mora.text).join("");
          if (acceptedReadings.size && !acceptedReadings.has(reading)) {
            console.debug(
              `[${NAME}] Skipping reading not in accepted:`,
              reading,
              "accepted:",
              [...acceptedReadings],
            );
            return;
          }

          const key = moras
            .map(
              (mora) =>
                `${mora.text}:${mora.high ? 1 : 0}:${mora.drop ? 1 : 0}`,
            )
            .join("|");

          if (seen.has(key)) {
            console.debug(`[${NAME}] Skipping duplicate variant:`, key);
            return;
          }
          seen.add(key);
          console.debug(`[${NAME}] Adding variant:`, reading, key);
          variants.push({ reading, moras });
        });
    });

    console.debug(`[${NAME}] Total variants:`, variants.length);
    return variants;
  }

  function getPatternLabel(moras) {
    return `${getPatternName(moras)} [${getAccentNumber(moras)}]`;
  }

  function getPatternName(moras) {
    const dropIndex = getAccentNumber(moras);

    if (!dropIndex) {
      return "Heiban";
    }
    if (dropIndex === 1) {
      return "Atamadaka";
    }
    if (dropIndex === moras.length) {
      return "Odaka";
    }
    return "Nakadaka";
  }

  function getAccentNumber(moras) {
    return moras.findIndex((mora) => mora.drop) + 1;
  }

  function createSvgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, String(value));
    });
    return element;
  }

  function createPitchSvg(variant, showReading) {
    const step = 24;
    const highY = 3;
    const lowY = 16;
    const textY = 34;
    const particleRadius = 2.5;
    const particleStrokeWidth = 1.5;
    const accentNumber = getAccentNumber(variant.moras);
    const particleX = step / 2 + variant.moras.length * step;
    const particleY = accentNumber === 0 ? highY : lowY;
    const width = particleX + 4;
    const height = showReading ? 44 : 20;
    const svg = createSvgElement("svg", {
      viewBox: `0 0 ${width} ${height}`,
      role: "img",
      "aria-label": `${variant.reading}, ${getPatternLabel(variant.moras)} pitch accent`,
    });
    if (!showReading) {
      svg.classList.add("wk-pitch-accent-diagram-only");
    }

    if (showReading) {
      variant.moras.forEach((mora, index) => {
        const character = createSvgElement("text", {
          x: step / 2 + index * step,
          y: textY,
          class: "wk-pitch-accent-character",
        });
        character.textContent = mora.text;
        if (mora.unvoiced) {
          character.classList.add("wk-pitch-accent-unvoiced");
        }
        svg.appendChild(character);
      });
    }

    const points = variant.moras.map((mora, index) => ({
      x: step / 2 + index * step,
      y: mora.high ? highY : lowY,
    }));
    const previousPoint = points.at(-1);
    const deltaX = particleX - previousPoint.x;
    const deltaY = particleY - previousPoint.y;
    const distance = Math.hypot(deltaX, deltaY);
    const particleOuterRadius = particleRadius + particleStrokeWidth / 2;
    points.push({
      x: Number(
        (particleX - (deltaX / distance) * particleOuterRadius).toFixed(2),
      ),
      y: Number(
        (particleY - (deltaY / distance) * particleOuterRadius).toFixed(2),
      ),
    });

    svg.appendChild(
      createSvgElement("polyline", {
        points: points.map((point) => `${point.x},${point.y}`).join(" "),
        fill: "none",
        stroke: "var(--wk-pitch-accent-color)",
        "stroke-width": 2.5,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }),
    );

    variant.moras.forEach((mora, index) => {
      svg.appendChild(
        createSvgElement("circle", {
          cx: step / 2 + index * step,
          cy: mora.high ? highY : lowY,
          r: 3,
          fill: "var(--wk-pitch-accent-color)",
        }),
      );
    });

    svg.appendChild(
      createSvgElement("circle", {
        cx: particleX,
        cy: particleY,
        r: particleRadius,
        fill: "none",
        stroke: "currentColor",
        "stroke-width": particleStrokeWidth,
        class: "wk-pitch-accent-particle",
      }),
    );

    return svg;
  }

  function getVariantClass(variant) {
    return `wk-pitch-accent-variant-${PATTERN_VARIANT[getPatternName(variant.moras)] || 1}`;
  }

  function createCredit() {
    const credit = document.createElement("p");
    credit.className = "wk-pitch-accent-credit";

    credit.append("Pitch-accent data from ");

    const link = document.createElement("a");
    link.href = OJAD_BASE_URL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "OJAD (Online Japanese Accent Dictionary)";
    credit.append(link, ".");

    return credit;
  }

  function createPitchContent(variants, error = null) {
    const visual = document.createElement("div");
    const details = document.createElement("div");
    visual.id = CONTENT_ID;
    visual.className = "wk-pitch-accent wk-pitch-accent-visual";
    details.className = "wk-pitch-accent wk-pitch-accent-details";

    if (error) {
      visual.hidden = true;
      const message = document.createElement("p");
      message.className = "wk-pitch-accent-status";
      message.textContent = error;
      details.appendChild(message);
    } else {
      const variantsByReading = new Map();

      variants.forEach((variant) => {
        const readingVariants = variantsByReading.get(variant.reading) || [];
        readingVariants.push(variant);
        variantsByReading.set(variant.reading, readingVariants);
      });

      variantsByReading.forEach((readingVariants, reading) => {
        const charts = document.createElement("span");
        charts.className = "wk-pitch-accent wk-pitch-accent-charts";
        charts.dataset.reading = reading;
        visual.appendChild(charts);

        if (readingVariants.length > 1) {
          charts.classList.add("wk-pitch-accent-charts--multiple");
        }

        readingVariants.forEach((variant, index) => {
          const figure = document.createElement("figure");
          const caption = document.createElement("figcaption");
          const number = document.createElement("span");
          const name = document.createElement("span");
          const showReading = index === readingVariants.length - 1;

          figure.className = getVariantClass(variant);
          number.className = "wk-pitch-accent-label-number";
          number.textContent = String(getAccentNumber(variant.moras));
          name.className = "wk-pitch-accent-label-name";
          name.textContent = getPatternName(variant.moras);
          caption.append(number, name);
          figure.append(createPitchSvg(variant, showReading), caption);
          charts.appendChild(figure);
        });
      });
    }

    if (!error) {
      details.appendChild(createCredit());
    }
    return { visual, details, replacesReading: !error };
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .wk-pitch-accent-visual {
        padding: 12px 0 8px;
      }

      .wk-pitch-accent-details {
        padding: 0 0 4px;
      }

      .subject-readings-with-audio + .wk-pitch-accent-details {
        margin-top: -26px;
      }

      .wk-pitch-accent-charts {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        align-items: flex-end;
        margin-bottom: 8px;
      }

      .wk-pitch-accent-charts--multiple {
        flex-direction: column;
        align-items: flex-start;
      }

      .wk-pitch-accent figure {
        display: flex;
        align-items: flex-start;
        gap: 7px;
        margin: 0;
      }

      .wk-pitch-accent-variant-1 { --wk-pitch-accent-color: #007a4d; }
      .wk-pitch-accent-variant-2 { --wk-pitch-accent-color: #9c007e; }
      .wk-pitch-accent-variant-3 { --wk-pitch-accent-color: #0068a8; }
      .wk-pitch-accent-variant-4 { --wk-pitch-accent-color: #984b00; }

      .wk-pitch-accent-charts svg {
        display: block;
        width: auto;
        height: 44px;
        overflow: visible;
      }

      .wk-pitch-accent-charts .wk-pitch-accent-diagram-only {
        height: 20px;
      }

      .wk-pitch-accent .wk-pitch-accent-character {
        font-size: 18px;
        text-anchor: middle;
        dominant-baseline: middle;
        fill: currentColor;
      }

      .wk-pitch-accent .wk-pitch-accent-unvoiced {
        opacity: .55;
      }

      .wk-pitch-accent figcaption {
        align-items: center;
        color: var(--wk-pitch-accent-color);
        display: flex;
        font-size: 16px;
        font-weight: 600;
        gap: 7px;
        line-height: 16px;
      }

      .wk-pitch-accent-label-number {
        align-items: center;
        background: color-mix(in srgb, var(--wk-pitch-accent-color) 16%, transparent);
        border-radius: 999px;
        display: inline-flex;
        font-size: 14px;
        height: 20px;
        justify-content: center;
        width: 20px;
      }

      .wk-pitch-accent .wk-pitch-accent-credit,
      .wk-pitch-accent .wk-pitch-accent-status {
        margin: 0;
        margin-top: 50px;
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
      readingContent.querySelector(".subject-readings-with-audio") ||
      readingContent.querySelector(".reading-with-audio") ||
      readingContent.querySelector(".subject-section__subsection--reading") ||
      readingContent.querySelector(".wk-text[lang='ja']")
    );
  }

  function findReadingContainers(readingRow) {
    const audioRows = readingRow.matches(".reading-with-audio")
      ? [readingRow]
      : [...readingRow.querySelectorAll(".reading-with-audio")];
    return audioRows.length ? audioRows : [readingRow];
  }

  function getContainerReading(container) {
    const reading = container.querySelector(
      ".reading-with-audio__reading, [data-reading]",
    );
    return normalizeJapanese(
      reading?.getAttribute("data-reading") ||
        reading?.textContent ||
        container.dataset.reading ||
        container.textContent,
    );
  }

  function findReadingTarget(container) {
    return (
      container.querySelector(".reading-with-audio__reading, [data-reading]") ||
      [...container.childNodes].find(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
      )
    );
  }

  function insertPitchAroundReading(readingContent, content) {
    const readingRow = findReadingRow(readingContent);

    if (!readingRow) {
      return false;
    }

    if (content.replacesReading) {
      const charts = [
        ...content.visual.querySelectorAll(".wk-pitch-accent-charts"),
      ];
      const usedCharts = new Set();
      let replacedReading = false;

      findReadingContainers(readingRow).forEach((container) => {
        const reading = getContainerReading(container);
        const matchingCharts = charts.filter(
          (chart) => chart.dataset.reading === reading,
        );
        if (!matchingCharts.length) {
          return;
        }

        const originalReading = findReadingTarget(container);
        if (!originalReading) {
          return;
        }

        const replacementCharts = matchingCharts.map((chart) => {
          const replacement = usedCharts.has(chart)
            ? chart.cloneNode(true)
            : chart;
          usedCharts.add(chart);
          replacement[ORIGINAL_READING_NODES] = [originalReading];
          return replacement;
        });

        originalReading.replaceWith(...replacementCharts);
        replacedReading = true;
      });

      if (replacedReading) {
        content.visual.removeAttribute("id");
        content.details.id = CONTENT_ID;
      } else {
        readingRow.before(content.visual);
      }
      readingRow.after(content.details);
    } else {
      readingRow.before(content.visual);
      readingRow.after(content.details);
    }
    return true;
  }

  function restorePitchContent(root) {
    root?.querySelectorAll(".wk-pitch-accent-charts").forEach((charts) => {
      const originalNodes = charts[ORIGINAL_READING_NODES];
      if (originalNodes) {
        charts.replaceWith(...originalNodes);
      } else {
        charts.remove();
      }
    });
    root
      ?.querySelectorAll(".wk-pitch-accent-visual, .wk-pitch-accent-details")
      .forEach((element) => {
        element.remove();
      });
  }

  function getSubjectReadingContent() {
    return document.querySelector(
      ".subject-section--reading > .subject-section__content",
    );
  }

  function insertSubjectReading(content) {
    const readingContent = getSubjectReadingContent();
    if (!readingContent) {
      return false;
    }

    insertPitchAroundReading(readingContent, content);
    return true;
  }

  function getLessonReadingContent() {
    const readingSlide = document.querySelector("#reading.subject-slide");
    return (
      readingSlide?.querySelector(
        '.subject-section[title="Reading"] > .subject-section__content',
      ) ||
      readingSlide?.querySelector(".subject-section__content") ||
      readingSlide?.querySelector(".subject-slide__sections")
    );
  }

  function lessonPageIsReady() {
    const readingContent = getLessonReadingContent();
    return Boolean(readingContent && findReadingRow(readingContent));
  }

  function insertLessonReading(content) {
    const readingContent = getLessonReadingContent();

    if (!readingContent) {
      return false;
    }

    insertPitchAroundReading(readingContent, content);
    return true;
  }

  async function runQuiz() {
    if (!isQuizPage()) {
      return;
    }

    const subject = getQuizVocabulary();
    const input = document.querySelector(".quiz-input__input-container");
    const frame = document.querySelector(
      "turbo-frame#subject-info, turbo-frame.subject-info",
    );
    const revealed = Boolean(subject && input?.hasAttribute("correct"));

    if (!revealed) {
      console.debug(`[${NAME}] Quiz not revealed yet, restoring`);
      restorePitchContent(frame);
      return;
    }

    const readingContent = frame?.querySelector(
      ".subject-section--reading > .subject-section__content",
    );
    if (
      !readingContent ||
      !findReadingRow(readingContent) ||
      document.getElementById(CONTENT_ID) ||
      isRunning
    ) {
      console.debug(`[${NAME}] Quiz not ready for insertion:`, {
        hasReadingContent: Boolean(readingContent),
        hasReadingRow: Boolean(
          readingContent && findReadingRow(readingContent),
        ),
        hasContent: Boolean(document.getElementById(CONTENT_ID)),
        isRunning,
      });
      return;
    }

    isRunning = true;
    try {
      const content = await loadPitchContent(subject);
      const currentSubject = getQuizVocabulary();
      const stillRevealed = document
        .querySelector(".quiz-input__input-container")
        ?.hasAttribute("correct");

      if (
        !stillRevealed ||
        vocabularyKey(currentSubject) !== vocabularyKey(subject) ||
        !readingContent.isConnected ||
        document.getElementById(CONTENT_ID)
      ) {
        console.debug(`[${NAME}] Quiz state changed during fetch, aborting:`, {
          stillRevealed,
          subjectChanged:
            vocabularyKey(currentSubject) !== vocabularyKey(subject),
          readingConnected: readingContent.isConnected,
          hasContent: Boolean(document.getElementById(CONTENT_ID)),
        });
        return;
      }

      injectStyles();
      insertPitchAroundReading(readingContent, content);
      console.debug(`[${NAME}] Quiz inserted successfully`);
    } finally {
      isRunning = false;
      setTimeout(run, 0);
    }
  }

  async function loadPitchContent(subject) {
    const searchUrl = `${OJAD_BASE_URL}/search/index/word:${encodeURIComponent(subject.characters)}`;
    console.debug(`[${NAME}] Fetching OJAD:`, searchUrl);

    try {
      const html = await fetchText(searchUrl);
      console.debug(`[${NAME}] OJAD response length:`, html.length);
      const variants = parseOjadResults(html, subject);
      return createPitchContent(
        variants,
        variants.length ? null : "No exact OJAD pitch accent found.",
      );
    } catch (error) {
      console.debug(`[${NAME}] Could not fetch OJAD:`, error);
      return createPitchContent(
        [],
        "OJAD pitch accent is currently unavailable.",
      );
    }
  }

  async function run() {
    if (isQuizPage()) {
      runQuiz();
      return;
    }

    if (!isVocabularySubjectPage() && !isSubjectLessonPage()) {
      return;
    }

    if (isRunning || document.getElementById(CONTENT_ID)) {
      return;
    }

    const isLesson = isSupportedLessonPage();
    const subject = isLesson ? getLessonSubject() : getSubjectPageVocabulary();
    const pageIsReady = isLesson
      ? lessonPageIsReady()
      : Boolean(
          getSubjectReadingContent() &&
          findReadingRow(getSubjectReadingContent()),
        );

    if (!subject) {
      console.debug(`[${NAME}] No subject detected, skipping`);
      return;
    }
    if (!pageIsReady) {
      console.debug(`[${NAME}] Page not ready yet, skipping`);
      return;
    }

    isRunning = true;
    try {
      const content = await loadPitchContent(subject);
      if (document.getElementById(CONTENT_ID)) {
        console.debug(`[${NAME}] Content already present, aborting`);
        return;
      }
      if (isLesson ? !isSupportedLessonPage() : !isVocabularySubjectPage()) {
        console.debug(`[${NAME}] Page changed during fetch, aborting`);
        return;
      }
      const currentSubject = isLesson
        ? getLessonSubject(true)
        : getSubjectPageVocabulary(true);
      if (vocabularyKey(currentSubject) !== vocabularyKey(subject)) {
        console.debug(`[${NAME}] Subject changed during fetch, aborting`);
        return;
      }
      injectStyles();
      if (isLesson) {
        insertLessonReading(content);
      } else {
        insertSubjectReading(content);
      }
      console.debug(`[${NAME}] Inserted successfully`);
    } finally {
      isRunning = false;
      setTimeout(run, 0);
    }
  }

  function installNavigationWatcher() {
    document.addEventListener("turbo:load", run);
    document.addEventListener("turbo:render", run);
    document.addEventListener("turbo:frame-load", run);
    window.addEventListener("popstate", () => setTimeout(run, 0));

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
      attributeFilter: ["correct"],
      childList: true,
      subtree: true,
    });
  }

  console.debug(`[${NAME}] Script loaded, version ${VERSION}`);
  injectStyles();
  installNavigationWatcher();
  run();
})();
