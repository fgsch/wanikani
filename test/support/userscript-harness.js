import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { JSDOM, VirtualConsole } from "jsdom";

async function loadUserscript(dom, filename, globals = {}) {
  Object.assign(dom.window, {
    GM_info: {
      script: {
        name: "Test Script",
        version: "0.0.0-test",
      },
    },
    ...globals,
  });

  const source = await readFile(
    new URL(`../../${filename}`, import.meta.url),
    "utf8",
  );
  dom.window.eval(source);
}

async function loadCatppuccinMocha(dom, prefersDark = true) {
  await loadUserscript(dom, "wk-catppuccin-mocha.js", {
    matchMedia() {
      return {
        matches: prefersDark,
        addEventListener() {},
      };
    },
  });
}

async function flushMutationObservers() {
  await Promise.resolve();
}

async function waitFor(assertion, { attempts = 20 } = {}) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  throw lastError;
}

function createDom(html, url, options = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("error", (...args) => console.error(...args));
  virtualConsole.on("warn", (...args) => console.warn(...args));
  virtualConsole.on("jsdomError", (error) => console.error(error));

  return new JSDOM(html, {
    url,
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole,
    ...options,
  });
}

const MINIMAL_KANJIVG_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 109 109">
    <path d="M10 50 L90 50"></path>
  </svg>
`;

function ojadResultRowHtml({ headword, moras }) {
  const accentedWord = moras
    .map(({ text, high = false, drop = false, unvoiced = false }) => {
      const classes = [
        drop ? "accent_top" : high ? "accent_plain" : "",
        unvoiced ? "unvoiced" : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<span${classes ? ` class="${classes}"` : ""}><span class="char">${text}</span></span>`;
    })
    .join("");

  return `<tr>
    <td class="midashi"><p class="midashi_word">${headword}</p></td>
    <td class="katsuyo_jisho_js"><span class="accented_word">${accentedWord}</span></td>
  </tr>`;
}

function ojadResultsHtml(results = []) {
  return `<table id="word_table"><tbody>${results
    .map(ojadResultRowHtml)
    .join("")}</tbody></table>`;
}

const SIMPLE_TABERU_OJAD_HTML = ojadResultsHtml([
  {
    headword: "食べる・食べます",
    moras: [{ text: "た" }, { text: "べ", drop: true }, { text: "る" }],
  },
]);

function vocabularySubjectPageHtml(reading) {
  return `
    <span class="subject-character subject-character--vocabulary" title="${reading}"></span>
    <main><section class="subject-section subject-section--reading">
      <section class="subject-section__content"><div class="reading-with-audio">${reading}</div></section>
    </section></main>
  `;
}

const LAST_ITEMS_MENU_HTML = `
  <ul>
    <li><a class="additional-content__item additional-content__item--last-items"></a></li>
  </ul>
`;

const KANJI_SUBJECT_PAGE_HTML = `
  <nav><ul><li><a class="wk-nav__item" href="#meaning"><span class="wk-nav__item-text">Meaning</span></a></li></ul></nav>
  <main>
    <h2>Radical Combination</h2>
    <h2 id="meaning">Meaning</h2>
  </main>
`;

const KANJI_SUBJECT_PAGE_WITHOUT_NAV_HTML = `
  <main>
    <h2>Radical Combination</h2>
    <h2>Meaning</h2>
  </main>
`;

function quizInputHtml({ correct, input = false, value } = {}) {
  const correctAttribute =
    correct === undefined
      ? ""
      : correct === true
        ? " correct"
        : ` correct="${correct}"`;
  const inputElement = input
    ? `<input id="user-response"${value === undefined ? "" : ` value="${value}"`}>`
    : "";

  return `
    <div class="quiz-input">
      <div class="quiz-input__input-container"${correctAttribute}>${inputElement}</div>
    </div>
  `;
}

function stimulusGlobals(getController) {
  return {
    Stimulus: {
      getControllerForElementAndIdentifier: getController,
    },
  };
}

function immediateKanjiVgResponse(svg = MINIMAL_KANJIVG_SVG) {
  return {
    GM: {
      xmlHttpRequest({ onload }) {
        onload({ status: 200, responseText: svg });
      },
    },
  };
}

function capturedRequests(requests) {
  return {
    GM: {
      xmlHttpRequest(request) {
        requests.push(request);
      },
    },
  };
}

function stubSvgPathLength(dom) {
  dom.window.SVGElement.prototype.getTotalLength = () => 100;
}

function resolveCustomProperty(dom, element, property) {
  let value = dom.window
    .getComputedStyle(element)
    .getPropertyValue(property)
    .trim();

  while (value.startsWith("var(")) {
    const referencedProperty = value.slice(4, -1).trim();
    value = dom.window
      .getComputedStyle(element)
      .getPropertyValue(referencedProperty)
      .trim();
  }

  return value;
}

function assertCustomProperties(dom, element, expected) {
  for (const [property, value] of Object.entries(expected)) {
    assert.equal(
      resolveCustomProperty(dom, element, property),
      value,
      `unexpected value for ${property}`,
    );
  }
}

function parseColor(value) {
  const hex = value.match(/^#([0-9a-f]{6})$/i)?.[1];
  if (hex) {
    return [0, 2, 4].map((offset) =>
      Number.parseInt(hex.slice(offset, offset + 2), 16),
    );
  }

  return value.match(/\d+/g).slice(0, 3).map(Number);
}

function contrastRatio(firstColor, secondColor) {
  const luminance = (color) =>
    color
      .map((channel) => channel / 255)
      .map((channel) =>
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4,
      )
      .reduce(
        (total, channel, index) =>
          total + channel * [0.2126, 0.7152, 0.0722][index],
        0,
      );
  const firstLuminance = luminance(firstColor);
  const secondLuminance = luminance(secondColor);

  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

export {
  MINIMAL_KANJIVG_SVG,
  SIMPLE_TABERU_OJAD_HTML,
  LAST_ITEMS_MENU_HTML,
  KANJI_SUBJECT_PAGE_HTML,
  KANJI_SUBJECT_PAGE_WITHOUT_NAV_HTML,
  assertCustomProperties,
  capturedRequests,
  contrastRatio,
  createDom,
  flushMutationObservers,
  immediateKanjiVgResponse,
  loadCatppuccinMocha,
  loadUserscript,
  ojadResultsHtml,
  parseColor,
  quizInputHtml,
  resolveCustomProperty,
  stimulusGlobals,
  stubSvgPathLength,
  vocabularySubjectPageHtml,
  waitFor,
};
