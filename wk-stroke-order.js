// ==UserScript==
// @name         WaniKani Stroke Order
// @namespace    wk-stroke-order
// @version      0.4.0
// @author       Federico G. Schwindt <fgsch@lodoss.net>
// @description  Adds animated KanjiVG stroke order, radicals, and component groups to WaniKani kanji pages, lessons, and reviews.
// @license      MIT
// @homepageURL  https://github.com/fgsch/wanikani
// @updateURL    https://raw.githubusercontent.com/fgsch/wanikani/main/wk-stroke-order.js
// @downloadURL  https://raw.githubusercontent.com/fgsch/wanikani/main/wk-stroke-order.js
// @match        https://www.wanikani.com/*
// @grant        GM.xmlHttpRequest
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// ==/UserScript==

(async function () {
  "use strict";

  const SECTION_ID = "stroke-order";
  const CONTENT_ID = "wk-kanjivg-stroke-order";
  const STYLE_ID = "wk-kanjivg-style";
  const RADICAL_COLOR = "#c586d7";
  const GROUP_COLOR = "#86a8d7";
  const NAME = GM_info.script.name;
  const VERSION = GM_info.script.version;

  let isPageRunning = false;
  let isQuizRunning = false;
  let failedQuizSubjectKey = null;
  let previousQuizSubjectKey = null;
  const processedPaths = new Set();

  function isReviewPage() {
    return /^\/subjects\/review(?:\/|$)/.test(location.pathname);
  }

  function isKanjiSubjectPage() {
    return /^\/kanji\/[^/]+\/?$/.test(location.pathname);
  }

  function isSubjectLessonPage() {
    return /^\/subject-lessons\/[\d-]+\/\d+\/?$/.test(location.pathname);
  }

  function isKanjiLessonPage() {
    return (
      isSubjectLessonPage() &&
      Boolean(
        document.querySelector(".character-header.character-header--kanji"),
      )
    );
  }

  function isKanjiPage() {
    return isKanjiSubjectPage() || isKanjiLessonPage();
  }

  function getKanji() {
    if (isKanjiLessonPage()) {
      const characters = document.querySelector(
        ".character-header--kanji .character-header__characters",
      );

      return Array.from(characters?.textContent.trim() || "")[0] || null;
    }

    if (!isKanjiSubjectPage()) {
      return null;
    }

    const slug = decodeURIComponent(
      location.pathname.split("/").filter(Boolean).pop() || "",
    );
    return Array.from(slug)[0] || null;
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

  function getQuizKanjiSubject() {
    const subject = getQuizController()?.currentSubject;
    if (!subject) {
      return null;
    }

    const type = String(
      subject.object || subject.type || subject.subject_category || "",
    )
      .toLowerCase()
      .replace(/[_-]/g, "");

    if (type !== "kanji") {
      return null;
    }

    const kanji = Array.from((subject.characters || "").trim())[0] || null;
    if (!kanji) {
      return null;
    }

    return {
      kanji,
      key: `${subject.id ?? kanji}:${kanji}`,
    };
  }

  function kanjiToKanjiVGFilename(kanji) {
    return `${kanji.codePointAt(0).toString(16).padStart(5, "0")}.svg`;
  }

  function randomKanjiVGViewerColor() {
    let color = "#";
    for (let i = 0; i < 3; i++) {
      color += Math.floor(Math.random() * 12)
        .toString(16)
        .toUpperCase();
    }
    return color;
  }

  function findHeading(text) {
    return [...document.querySelectorAll("h2, h3")].find((h) =>
      h.textContent.trim().toLowerCase().includes(text.toLowerCase()),
    );
  }

  function findGoToLink(text) {
    return [...document.querySelectorAll("a")].find(
      (a) => a.textContent.trim() === text,
    );
  }

  function fetchText(url) {
    return new Promise((resolve, reject) => {
      GM.xmlHttpRequest({
        method: "GET",
        url,
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) {
            resolve(res.responseText);
          } else {
            reject(new Error(`HTTP ${res.status}`));
          }
        },
        onerror: reject,
      });
    });
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
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

      #${CONTENT_ID} button.wk-kanjivg-replay {
        padding: 0;
        border: 0;
        background: none;
        color: inherit;
        font: inherit;
        text-decoration: underline;
        cursor: pointer;
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

      .subject-section--stroke-order #${CONTENT_ID} .wk-kanjivg-credit {
        margin-bottom: 0;
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
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.classList.add("wk-kanjivg-main");
    svg.setAttribute("aria-label", `${kanji} stroke order`);
  }

  function sanitizeSvg(svg) {
    svg.querySelectorAll("script, foreignObject").forEach((element) => {
      element.remove();
    });

    [svg, ...svg.querySelectorAll("*")].forEach((element) => {
      [...element.attributes].forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim().toLowerCase();

        if (name.startsWith("on")) {
          element.removeAttribute(attribute.name);
          return;
        }

        if (
          (name === "href" || name === "xlink:href") &&
          value &&
          !value.startsWith("#")
        ) {
          element.removeAttribute(attribute.name);
        }
      });
    });
  }

  function animateSvg(svg) {
    const paths = [...svg.querySelectorAll("path")];
    const texts = [...svg.querySelectorAll("text")];

    texts.forEach((text) => {
      text.style.opacity = "0";
      text.style.animation = "none";
    });

    paths.forEach((path, index) => {
      const color = randomKanjiVGViewerColor();
      const length = path.getTotalLength();
      const delay = `${index * 0.55}s`;

      path.style.stroke = color;
      path.style.strokeDasharray = String(length);
      path.style.strokeDashoffset = String(length);
      path.style.animation = "wkKanjiVGDraw 0.7s ease forwards";
      path.style.animationDelay = delay;

      if (texts[index]) {
        texts[index].style.fill = color;
        texts[index].style.opacity = "0";
        texts[index].style.animation = "wkKanjiVGFadeIn 0.15s ease forwards";
        texts[index].style.animationDelay = delay;
      }
    });
  }

  function getGroupLabel(group) {
    return (
      group.getAttribute("kvg:element") ||
      group.getAttribute("kvg:original") ||
      group.id ||
      "Group"
    );
  }

  function createHighlightedCopy(svg, matchingGroupIds, highlightColor, label) {
    const copy = svg.cloneNode(true);
    copy.classList.remove("wk-kanjivg-main");
    copy.setAttribute("aria-label", label);

    [...copy.querySelectorAll("text")].forEach((text) => {
      text.style.display = "none";
    });

    [...copy.querySelectorAll("path")].forEach((path) => {
      path.style.stroke = "#ddd";
      path.style.strokeWidth = "2";
      path.style.opacity = "0.35";
      path.style.animation = "none";
      path.style.strokeDasharray = "none";
      path.style.strokeDashoffset = "0";
    });

    matchingGroupIds.forEach((groupId) => {
      const group = copy.getElementById(groupId);
      if (!group) {
        return;
      }

      [...group.querySelectorAll("path")].forEach((path) => {
        path.style.stroke = highlightColor;
        path.style.strokeWidth = "4";
        path.style.opacity = "1";
      });
    });

    [...copy.querySelectorAll("[id]")].forEach((element) => {
      element.removeAttribute("id");
    });

    return copy;
  }

  function collectRadicals(svg) {
    return [...svg.querySelectorAll("g")]
      .filter((group) => group.getAttribute("kvg:radical") && group.id)
      .map((group) => {
        const radicalType = group.getAttribute("kvg:radical");
        return {
          id: group.id,
          label:
            radicalType === "general" || radicalType === "tradit"
              ? "Radical"
              : `${radicalType} radical`,
        };
      });
  }

  function collectComponentGroups(svg) {
    return [...svg.querySelectorAll("g")]
      .filter(
        (group) =>
          group.getAttribute("kvg:element") &&
          group.id &&
          group.querySelectorAll("path").length,
      )
      .map((group) => ({
        id: group.id,
        label: getGroupLabel(group),
      }));
  }

  function createFigure(svg, groupIds, color, captionText, className) {
    const figure = document.createElement("figure");
    const caption = document.createElement("figcaption");
    const copy = createHighlightedCopy(svg, groupIds, color, captionText);

    if (className) {
      figure.className = className;
    }

    caption.textContent = captionText;
    figure.append(copy, caption);

    return figure;
  }

  function createCheckbox(labelText, checked) {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");

    checkbox.type = "checkbox";
    checkbox.checked = checked;

    label.append(checkbox, document.createTextNode(labelText));

    return { label, checkbox };
  }

  function createSidePanel(svg) {
    const side = document.createElement("div");
    side.className = "wk-kanjivg-side-column";

    const options = document.createElement("div");
    options.className = "wk-kanjivg-options";

    const figures = document.createElement("div");
    figures.className = "wk-kanjivg-figures";

    const radicals = collectRadicals(svg);
    const groups = collectComponentGroups(svg);

    const radicalControl = createCheckbox("Show the radicals", true);
    const groupControl = createCheckbox("Show the component groups", true);

    radicals.forEach((radical) => {
      figures.appendChild(
        createFigure(
          svg,
          [radical.id],
          RADICAL_COLOR,
          radical.label,
          "wk-kanjivg-radical-figure",
        ),
      );
    });

    groups.forEach((group) => {
      figures.appendChild(
        createFigure(
          svg,
          [group.id],
          GROUP_COLOR,
          group.label,
          "wk-kanjivg-group-figure",
        ),
      );
    });

    if (radicals.length) {
      options.appendChild(radicalControl.label);
    }
    if (groups.length) {
      options.appendChild(groupControl.label);
    }

    radicalControl.checkbox.addEventListener("change", () => {
      figures
        .querySelectorAll(".wk-kanjivg-radical-figure")
        .forEach((figure) => {
          figure.hidden = !radicalControl.checkbox.checked;
        });
    });

    groupControl.checkbox.addEventListener("change", () => {
      figures.querySelectorAll(".wk-kanjivg-group-figure").forEach((figure) => {
        figure.hidden = !groupControl.checkbox.checked;
      });
    });

    if (options.children.length) {
      side.appendChild(options);
    }
    if (figures.children.length) {
      side.appendChild(figures);
    }

    return side;
  }

  function copyNavTextStyle(navTemplate, control) {
    const sourceText =
      navTemplate.querySelector(".wk-nav__item-text") ||
      navTemplate.querySelector("span") ||
      navTemplate;

    const targetText =
      control.querySelector(".wk-nav__item-text") ||
      control.querySelector("span") ||
      control;

    const computed = getComputedStyle(sourceText);

    targetText.style.fontSize = computed.fontSize;
    targetText.style.lineHeight = computed.lineHeight;
    targetText.style.fontFamily = computed.fontFamily;
    targetText.style.fontWeight = computed.fontWeight;
  }

  function createReplayControl(onClick) {
    const navTemplate =
      !isReviewPage() &&
      (document.querySelector("a.wk-nav__item") ||
        (!isKanjiLessonPage() &&
          (findGoToLink("Meaning") || findGoToLink("Stroke Order"))));

    let control;

    if (isReviewPage()) {
      control = document.createElement("button");
      control.type = "button";
      control.className = "wk-kanjivg-replay";
      control.textContent = "Replay animation";
    } else if (navTemplate) {
      control = navTemplate.cloneNode(true);
      control.classList.add("wk-kanjivg-replay");
      control.href = "#";
      control.removeAttribute("aria-current");

      const text =
        control.querySelector(".wk-nav__item-text") ||
        control.querySelector("span") ||
        control;

      text.textContent = "Replay animation";
      copyNavTextStyle(navTemplate, control);
    } else {
      control = document.createElement("a");
      control.href = "#";
      control.className = "wk-kanjivg-replay wk-nav__item";

      const text = document.createElement("span");
      text.className = "wk-nav__item-text";
      text.textContent = "Replay animation";
      control.appendChild(text);
    }

    control.addEventListener("click", (event) => {
      event.preventDefault();
      onClick();
    });

    return control;
  }

  function addGoToNavigationItem() {
    if (document.querySelector(`a[href="#${SECTION_ID}"]`)) {
      return;
    }

    const meaningLink = findGoToLink("Meaning");
    if (!meaningLink) {
      return;
    }

    const newLink = meaningLink.cloneNode(true);
    newLink.textContent = "Stroke Order";
    newLink.href = `#${SECTION_ID}`;

    const meaningLi = meaningLink.closest("li");

    if (meaningLi) {
      const newLi = meaningLi.cloneNode(false);
      newLi.appendChild(newLink);
      meaningLi.insertAdjacentElement("beforebegin", newLi);
    } else {
      meaningLink.insertAdjacentElement("beforebegin", newLink);
    }
  }

  function createStrokeOrderContent(svg, kanji) {
    const content = document.createElement("div");
    content.id = CONTENT_ID;

    const mainColumn = document.createElement("div");
    mainColumn.className = "wk-kanjivg-main-column";

    prepareSvg(svg, kanji);

    const replayControl = createReplayControl(() => {
      const clone = svg.cloneNode(true);
      svg.replaceWith(clone);
      svg = clone;
      prepareSvg(svg, kanji);
      animateSvg(svg);
    });

    const credit = document.createElement("p");
    credit.className = "wk-kanjivg-credit";
    credit.innerHTML = `
      Stroke, radical, and component data from
      <a href="https://kanjivg.tagaini.net/"
         target="_blank"
         rel="noopener noreferrer">KanjiVG</a>,
      CC BY-SA 3.0.
    `;

    mainColumn.append(svg, replayControl);
    content.append(mainColumn, createSidePanel(svg), credit);

    return content;
  }

  function insertStrokeOrderSection(svg, kanji) {
    const radicalHeading = findHeading("Radical Combination");
    const meaningHeading = findHeading("Meaning");

    if (!radicalHeading || !meaningHeading) {
      return false;
    }

    const strokeHeading = radicalHeading.cloneNode(false);
    strokeHeading.id = SECTION_ID;
    strokeHeading.textContent = "Stroke Order";
    const content = createStrokeOrderContent(svg, kanji);

    meaningHeading.insertAdjacentElement("beforebegin", content);
    content.insertAdjacentElement("beforebegin", strokeHeading);

    animateSvg(svg);

    return true;
  }

  function insertStrokeOrderLessonTab(svg, kanji) {
    const radicalLink = document.querySelector(
      '.subject-slides__navigation-link[href="#composition"]',
    );
    const meaningLink = document.querySelector(
      '.subject-slides__navigation-link[href="#meaning"]',
    );
    const compositionSlide = document.querySelector(
      "#composition.subject-slide",
    );
    const meaningSlide = document.querySelector("#meaning.subject-slide");
    const radicalSection = compositionSlide?.querySelector(
      '.subject-section[title="Radical Composition"]',
    );
    const compositionNext = compositionSlide?.querySelector(
      '.subject-slide__navigation[aria-label="next slide"]',
    );
    const meaningPrevious = meaningSlide?.querySelector(
      '.subject-slide__navigation[aria-label="previous slide"]',
    );

    if (
      !radicalLink ||
      !meaningLink ||
      !compositionSlide ||
      !meaningSlide ||
      !radicalSection ||
      !compositionNext ||
      !meaningPrevious
    ) {
      return false;
    }

    const navigationItem = radicalLink.closest("li").cloneNode(true);
    const strokeLink = navigationItem.querySelector("a");

    strokeLink.href = `#${SECTION_ID}`;
    strokeLink.setAttribute("aria-controls", SECTION_ID);
    strokeLink.setAttribute("aria-selected", "false");
    strokeLink.textContent = "Stroke Order";
    radicalLink.closest("li").insertAdjacentElement("afterend", navigationItem);

    const strokeSlide = compositionSlide.cloneNode(false);
    const previousNavigation = meaningPrevious.cloneNode(true);
    const nextNavigation = compositionNext.cloneNode(true);
    const slideContent = document.createElement("div");
    const slideSections = document.createElement("div");
    const section = document.createElement("section");
    const sectionHeading = radicalSection.querySelector("h2").cloneNode(true);
    const sectionContent = document.createElement("section");

    strokeSlide.id = SECTION_ID;
    strokeSlide.hidden = true;
    previousNavigation.href = "#composition";
    nextNavigation.href = "#meaning";
    slideContent.className = "subject-slide__content";
    slideSections.className = "subject-slide__sections";
    section.className = "subject-section";
    section.title = "Stroke Order";
    sectionHeading.querySelector(".subject-section__title-text").textContent =
      "Stroke Order";
    sectionContent.className = "subject-section__content";
    sectionContent.appendChild(createStrokeOrderContent(svg, kanji));
    section.append(sectionHeading, sectionContent);
    slideSections.appendChild(section);
    slideContent.appendChild(slideSections);
    strokeSlide.append(previousNavigation, slideContent, nextNavigation);

    compositionNext.href = `#${SECTION_ID}`;
    meaningPrevious.href = `#${SECTION_ID}`;
    compositionSlide.insertAdjacentElement("afterend", strokeSlide);

    animateSvg(svg);

    return true;
  }

  function getQuizMeaningSection() {
    const frame = document.querySelector(
      "turbo-frame#subject-info, turbo-frame.subject-info",
    );

    return (
      frame?.querySelector(".subject-section--meaning") ||
      frame?.querySelector('.subject-section[title="Meaning"]') ||
      [...(frame?.querySelectorAll(".subject-section") || [])].find((section) =>
        section
          .querySelector(
            ".subject-section__title-text, .subject-section__title, h2",
          )
          ?.textContent.trim()
          .toLowerCase()
          .includes("meaning"),
      ) ||
      null
    );
  }

  function insertStrokeOrderQuizSection(svg, subject) {
    const meaningSection = getQuizMeaningSection();
    if (!meaningSection) {
      return false;
    }

    const section = meaningSection.cloneNode(false);
    const sourceHeading = meaningSection.querySelector(
      ".subject-section__title, h2",
    );
    const sourceContent = meaningSection.querySelector(
      ".subject-section__content",
    );
    const heading =
      sourceHeading?.cloneNode(true) || document.createElement("h2");
    const content =
      sourceContent?.cloneNode(false) || document.createElement("section");
    const headingText =
      heading.querySelector(".subject-section__title-text") || heading;

    section.removeAttribute("id");
    section.classList.remove("subject-section--meaning");
    section.classList.add("subject-section--stroke-order");
    section.title = "Stroke Order";
    heading
      .querySelectorAll("[id]")
      .forEach((element) => element.removeAttribute("id"));
    heading.removeAttribute("id");
    headingText.textContent = "Stroke Order";
    content.classList.add("subject-section__content");

    const strokeOrder = createStrokeOrderContent(svg, subject.kanji);
    strokeOrder.dataset.quizSubjectKey = subject.key;
    content.appendChild(strokeOrder);
    section.append(heading, content);
    meaningSection.before(section);
    animateSvg(svg);

    return true;
  }

  function pageIsReady() {
    if (isKanjiLessonPage()) {
      return Boolean(
        document.querySelector(
          '.subject-slides__navigation-link[href="#composition"]',
        ) &&
        document.querySelector(
          '.subject-slides__navigation-link[href="#meaning"]',
        ) &&
        document.querySelector(
          '#composition.subject-slide .subject-section[title="Radical Composition"]',
        ) &&
        document.querySelector(
          '#composition.subject-slide .subject-slide__navigation[aria-label="next slide"]',
        ) &&
        document.querySelector(
          '#meaning.subject-slide .subject-slide__navigation[aria-label="previous slide"]',
        ),
      );
    }

    return Boolean(
      findHeading("Radical Combination") && findHeading("Meaning"),
    );
  }

  async function runQuiz() {
    const existingContent = document.getElementById(CONTENT_ID);
    const existingSection = existingContent?.closest(
      ".subject-section--stroke-order",
    );
    const subject = getQuizKanjiSubject();
    const subjectKey = subject?.key || null;

    if (subjectKey !== previousQuizSubjectKey) {
      previousQuizSubjectKey = subjectKey;
      failedQuizSubjectKey = null;
    }

    const revealed = Boolean(
      subject &&
      document
        .querySelector(".quiz-input__input-container")
        ?.hasAttribute("correct"),
    );

    if (!revealed) {
      existingSection?.remove();
      return;
    }

    if (existingContent?.dataset.quizSubjectKey === subject.key) {
      return;
    }
    existingSection?.remove();

    const meaningSection = getQuizMeaningSection();
    if (
      !meaningSection ||
      isQuizRunning ||
      failedQuizSubjectKey === subject.key
    ) {
      return;
    }

    isQuizRunning = true;
    try {
      const filename = kanjiToKanjiVGFilename(subject.kanji);
      const svgUrl = `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${filename}`;
      let svgText;

      try {
        svgText = await fetchText(svgUrl);
      } catch (error) {
        failedQuizSubjectKey = subject.key;
        console.warn(`[${NAME}] Could not fetch SVG:`, error);
        return;
      }

      const currentSubject = getQuizKanjiSubject();
      const stillRevealed = document
        .querySelector(".quiz-input__input-container")
        ?.hasAttribute("correct");

      if (
        !stillRevealed ||
        currentSubject?.key !== subject.key ||
        !meaningSection.isConnected ||
        document.getElementById(CONTENT_ID)
      ) {
        return;
      }

      const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
      const svg = doc.querySelector("svg");
      if (!svg) {
        failedQuizSubjectKey = subject.key;
        console.warn(`[${NAME}] Response did not contain an SVG`);
        return;
      }

      sanitizeSvg(svg);
      injectStyles();
      insertStrokeOrderQuizSection(svg, subject);
    } finally {
      isQuizRunning = false;
      setTimeout(run, 0);
    }
  }

  async function runPage() {
    if (isPageRunning) {
      return;
    }
    if (!isKanjiPage()) {
      return;
    }
    if (document.getElementById(CONTENT_ID)) {
      return;
    }
    if (processedPaths.has(location.pathname)) {
      return;
    }

    if (!pageIsReady()) {
      return;
    }

    isPageRunning = true;

    try {
      const kanji = getKanji();
      if (!kanji) {
        return;
      }

      const pagePath = location.pathname;

      processedPaths.add(pagePath);

      const filename = kanjiToKanjiVGFilename(kanji);
      const svgUrl = `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${filename}`;

      let svgText;

      try {
        svgText = await fetchText(svgUrl);
      } catch (error) {
        console.warn(`[${NAME}] Could not fetch SVG:`, error);
        return;
      }

      if (
        location.pathname !== pagePath ||
        !isKanjiPage() ||
        getKanji() !== kanji
      ) {
        return;
      }

      const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
      const svg = doc.querySelector("svg");

      if (!svg) {
        return;
      }

      sanitizeSvg(svg);
      injectStyles();

      let inserted;

      if (isKanjiLessonPage()) {
        inserted = insertStrokeOrderLessonTab(svg, kanji);
      } else {
        inserted = insertStrokeOrderSection(svg, kanji);
      }

      processedPaths.delete(location.pathname);

      if (inserted && !isKanjiLessonPage()) {
        addGoToNavigationItem();
      }
    } finally {
      isPageRunning = false;
    }
  }

  function run() {
    if (isReviewPage()) {
      runQuiz();
      return;
    }

    runPage();
  }

  function installNavigationWatcher() {
    let previousPath = location.pathname;

    const checkPath = () => {
      if (location.pathname === previousPath) {
        return;
      }

      previousPath = location.pathname;
      processedPaths.clear();
      run();
    };

    if (
      window.navigation &&
      typeof window.navigation.addEventListener === "function"
    ) {
      window.navigation.addEventListener("navigate", () => {
        setTimeout(checkPath, 0);
      });
    }

    document.addEventListener("turbo:load", run);
    document.addEventListener("turbo:render", run);
    document.addEventListener("turbo:frame-load", run);

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

    window.addEventListener("popstate", () => {
      setTimeout(checkPath, 0);
    });

    const observer = new MutationObserver(() => {
      run();
    });

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
