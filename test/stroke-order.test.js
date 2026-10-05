import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KANJI_SUBJECT_PAGE_HTML,
  KANJI_SUBJECT_PAGE_WITHOUT_NAV_HTML,
  LAST_ITEMS_MENU_HTML,
  MINIMAL_KANJIVG_SVG,
  capturedRequests,
  contrastRatio,
  createDom,
  flushMutationObservers,
  immediateKanjiVgResponse,
  loadUserscript,
  parseColor,
  quizInputHtml,
  resolveCustomProperty,
  stimulusGlobals,
  stubSvgPathLength,
  waitFor,
} from "./support/userscript-harness.js";

test("stroke order inserts a KanjiVG section and navigation link on kanji pages", async () => {
  const dom = createDom(
    `
      <nav><ul><li><a class="wk-nav__item" href="#meaning"><span class="wk-nav__item-text">Meaning</span></a></li></ul></nav>
      <main>
        <h2>Radical Combination</h2>
        <section>Radicals</section>
        <h2 id="meaning">Meaning</h2>
      </main>
    `,
    "https://www.wanikani.com/kanji/%E4%B8%80",
  );
  let fetchedUrl = null;

  stubSvgPathLength(dom);

  await loadUserscript(dom, "wk-stroke-order.js", {
    GM: {
      xmlHttpRequest({ url, onload }) {
        fetchedUrl = url;
        onload({ status: 200, responseText: MINIMAL_KANJIVG_SVG });
      },
    },
  });

  const document = dom.window.document;

  await waitFor(() => {
    assert.equal(
      document.querySelector("#stroke-order")?.textContent,
      "Stroke Order",
    );
  });

  assert.equal(
    fetchedUrl,
    "https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/04e00.svg",
  );
  assert.ok(
    document.querySelector("#wk-kanjivg-stroke-order svg.wk-kanjivg-main"),
  );
  assert.equal(
    document.querySelector('a[href="#stroke-order"]')?.textContent,
    "Stroke Order",
  );
  assert.equal(
    document.querySelector(".wk-kanjivg-credit a")?.href,
    "https://kanjivg.tagaini.net/",
  );
});

test("stroke order animated colors contrast with light and dark backgrounds", async () => {
  const svgText = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 109 109">
      <path d="M10 20 L90 20"></path>
      <path d="M10 40 L90 40"></path>
      <path d="M10 60 L90 60"></path>
      <path d="M10 80 L90 80"></path>
    </svg>
  `;
  const dom = createDom(
    `
      <nav><a href="#meaning">Meaning</a></nav>
      <main><h2>Radical Combination</h2><h2>Meaning</h2></main>
    `,
    "https://www.wanikani.com/kanji/%E4%B8%80",
  );
  const randomValues = [0, 0.25, 0.5, 0.99];
  let randomIndex = 0;

  dom.window.Math.random = () =>
    randomValues[randomIndex++ % randomValues.length];
  stubSvgPathLength(dom);

  await loadUserscript(dom, "wk-stroke-order.js", {
    GM: {
      xmlHttpRequest({ onload }) {
        onload({ status: 200, responseText: svgText });
      },
    },
  });

  await waitFor(() => {
    assert.equal(
      dom.window.document.querySelectorAll(
        "#wk-kanjivg-stroke-order svg.wk-kanjivg-main path",
      ).length,
      4,
    );
  });

  const strokes = [
    ...dom.window.document.querySelectorAll(
      "#wk-kanjivg-stroke-order svg.wk-kanjivg-main path",
    ),
  ].map((path) =>
    parseColor(resolveCustomProperty(dom, path, "--wk-kanjivg-stroke-color")),
  );

  assert.equal(new Set(strokes.map(String)).size, 4);
  for (const stroke of strokes) {
    assert.ok(contrastRatio(stroke, parseColor("#ffffff")) >= 3);
    assert.ok(contrastRatio(stroke, parseColor("#1e1e2e")) >= 3);
  }
});

test("stroke order inserts a lesson tab after Radicals without section title attributes", async () => {
  const dom = createDom(
    `
      <div class="lesson-container">
        <div class="character-header character-header--kanji">
          <div class="character-header__characters" lang="ja">先</div>
        </div>
        <div class="subject-slides">
          <ul class="subject-slides__navigation-items" role="tablist">
            <li class="subject-slides__navigation-item" role="presentation">
              <a class="subject-slides__navigation-link" data-subject-slides-target="navigationItem" data-action="subject-slides#switchSlide" aria-controls="composition" aria-selected="true" role="tab" href="#composition">Radicals</a>
            </li>
            <li class="subject-slides__navigation-item" role="presentation">
              <a class="subject-slides__navigation-link" data-subject-slides-target="navigationItem" data-action="subject-slides#switchSlide" aria-controls="meaning" aria-selected="false" role="tab" href="#meaning">Meaning</a>
            </li>
          </ul>
          <div class="subject-slides__slides">
            <div class="subject-slide" id="composition" data-subject-slides-target="slide" role="tabpanel">
              <div class="subject-slide__content">
                <div class="subject-slide__sections">
                  <section class="subject-section">
                    <h2 class="subject-section__title"><span class="subject-section__title-text">Radical Composition</span></h2>
                    <section class="subject-section__content">Radicals</section>
                  </section>
                </div>
              </div>
              <a class="subject-slide__navigation" data-action="subject-slides#switchSlide" data-subject-slides-target="nextButton" aria-label="next slide" href="#meaning">Next</a>
            </div>
            <div class="subject-slide" id="meaning" data-subject-slides-target="slide" role="tabpanel" hidden="hidden">
              <a class="subject-slide__navigation" data-action="subject-slides#switchSlide" data-subject-slides-target="prevButton" aria-label="previous slide" href="#composition">Previous</a>
              <div class="subject-slide__content"><div class="subject-slide__sections"></div></div>
            </div>
          </div>
        </div>
      </div>
    `,
    "https://www.wanikani.com/subject-lessons/-4190889689937224551/543",
  );
  let fetchedUrl = null;

  stubSvgPathLength(dom);

  await loadUserscript(dom, "wk-stroke-order.js", {
    GM: {
      xmlHttpRequest({ url, onload }) {
        fetchedUrl = url;
        onload({ status: 200, responseText: MINIMAL_KANJIVG_SVG });
      },
    },
  });

  const document = dom.window.document;

  await waitFor(() => {
    assert.ok(document.querySelector("#stroke-order #wk-kanjivg-stroke-order"));
  });

  const tabs = [
    ...document.querySelectorAll(".subject-slides__navigation-link"),
  ];
  const slides = [...document.querySelectorAll(".subject-slide")];

  assert.equal(
    fetchedUrl,
    "https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/05148.svg",
  );
  assert.deepEqual(
    tabs.map((tab) => tab.textContent.trim()),
    ["Radicals", "Stroke Order", "Meaning"],
  );
  assert.deepEqual(
    slides.map((slide) => slide.id),
    ["composition", "stroke-order", "meaning"],
  );
  assert.equal(
    document
      .querySelector('#composition [aria-label="next slide"]')
      ?.getAttribute("href"),
    "#stroke-order",
  );
  assert.equal(
    document
      .querySelector('#meaning [aria-label="previous slide"]')
      ?.getAttribute("href"),
    "#stroke-order",
  );
  assert.equal(
    document
      .querySelector("#stroke-order .wk-kanjivg-replay")
      ?.hasAttribute("data-action"),
    false,
  );
});

test("stroke order renders in current kanji-review Item Info", async () => {
  const dom = createDom(
    `
      ${quizInputHtml({ correct: "true" })}
      <div id="item-info" data-controller="subject-info">
        <section class="subject-section subject-section--collapsible" data-name="components">
          <h2 class="subject-section__title">Radical Combination</h2>
          <section class="subject-section__content" id="section-components" hidden></section>
        </section>
        <section class="subject-section subject-section--collapsible" data-name="meaning">
          <h2 class="subject-section__title">Meaning</h2>
          <section class="subject-section__content" id="section-meaning" hidden>Blue</section>
        </section>
        <section class="subject-section subject-section--collapsible" data-name="reading" expanded>
          <h2 class="subject-section__title">Readings</h2>
          <section class="subject-section__content" id="section-reading">せい / あお</section>
        </section>
      </div>
    `,
    "https://www.wanikani.com/subjects/review",
  );

  stubSvgPathLength(dom);
  await loadUserscript(dom, "wk-stroke-order.js", {
    ...immediateKanjiVgResponse(),
    ...stimulusGlobals(() => ({
      currentSubject: { id: 604, type: "Kanji", characters: "青" },
    })),
  });

  await waitFor(() => {
    assert.equal(
      dom.window.document
        .querySelector("#item-info #wk-kanjivg-stroke-order svg")
        ?.getAttribute("aria-label"),
      "青 stroke order",
    );
  });

  const sections = [
    ...dom.window.document.querySelectorAll("#item-info > .subject-section"),
  ];
  assert.deepEqual(
    sections.map((section) =>
      section.querySelector(".subject-section__title").textContent.trim(),
    ),
    ["Radical Combination", "Stroke Order", "Meaning", "Readings"],
  );
  assert.equal(
    dom.window.document.querySelector("#section-meaning").textContent,
    "Blue",
  );
  assert.equal(
    dom.window.document.querySelector("#section-meaning").hidden,
    true,
  );
});

test("stroke order follows browsed kanji and clears diagrams for other Item Info subjects", async () => {
  const currentInfo = `
    <section class="subject-section" data-name="meaning">
      <h2 class="subject-section__title">Meaning</h2>
      <section class="subject-section__content">Grass</section>
    </section>
  `;
  const dom = createDom(
    `${quizInputHtml({ correct: "true" })}<div id="item-info">${currentInfo}</div>`,
    "https://www.wanikani.com/subjects/extra_study",
  );
  const controller = {
    currentSubject: { id: 605, type: "Kanji", characters: "草" },
  };
  const info = dom.window.document.querySelector("#item-info");

  stubSvgPathLength(dom);
  await loadUserscript(dom, "wk-stroke-order.js", {
    ...immediateKanjiVgResponse(),
    ...stimulusGlobals(() => controller),
  });
  await waitFor(() => {
    assert.equal(
      info.querySelector(".wk-kanjivg-main")?.getAttribute("aria-label"),
      "草 stroke order",
    );
  });

  info.innerHTML = `
    <header class="item-info__header">
      <a data-subject-character-item-value='{"itemId":90,"characters":"艹","subjectCategory":"Radical","meaning":"Flowers"}'>艹 Flowers</a>
    </header>
    <section class="subject-section" data-name="meaning">
      <h2 class="subject-section__title">Name</h2>
      <section class="subject-section__content">Flowers</section>
    </section>
  `;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushMutationObservers();

  assert.equal(info.querySelector(".subject-section--stroke-order"), null);
  assert.equal(
    info.querySelector('[data-name="meaning"] .subject-section__content')
      .textContent,
    "Flowers",
  );

  info.innerHTML = `
    <header class="item-info__header">
      <a data-subject-character-item-value='{"itemId":601,"characters":"日","subjectCategory":"Kanji","meaning":"Sun"}'>日 Sun</a>
    </header>
    <section class="subject-section" data-name="meaning">
      <h2>Meaning</h2>
      <section class="subject-section__content">Sun</section>
    </section>
  `;
  await waitFor(() => {
    assert.equal(
      info.querySelector(".wk-kanjivg-main")?.getAttribute("aria-label"),
      "日 stroke order",
    );
  });

  info.innerHTML = `
    <header class="item-info__header">
      <a data-subject-character-item-value='{"itemId":22,"characters":"日","subjectCategory":"Radical","meaning":"Sun"}'>日 Sun</a>
    </header>
    <section class="subject-section" data-name="meaning">
      <h2>Name</h2>
      <section class="subject-section__content">Sun</section>
    </section>
  `;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushMutationObservers();
  assert.equal(info.querySelector(".subject-section--stroke-order"), null);

  info.innerHTML = `
    <header class="item-info__header">
      <a data-subject-character-item-value='{"itemId":606,"characters":"草","subjectCategory":"Vocabulary","meaning":"Grass"}'>草 Grass</a>
    </header>
    ${currentInfo}
  `;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushMutationObservers();
  assert.equal(info.querySelector(".subject-section--stroke-order"), null);

  info.innerHTML = currentInfo;
  await waitFor(() => {
    assert.equal(
      info.querySelector(".wk-kanjivg-main")?.getAttribute("aria-label"),
      "草 stroke order",
    );
  });
});

test("stroke order does not reinsert a delayed quiz diagram into browsed radical Item Info", async () => {
  const dom = createDom(
    `
      ${quizInputHtml({ correct: "true" })}
      <div id="item-info">
        <section class="subject-section" data-name="meaning">
          <h2>Meaning</h2>
          <section class="subject-section__content">Grass</section>
        </section>
      </div>
    `,
    "https://www.wanikani.com/subjects/review",
  );
  const requests = [];
  const info = dom.window.document.querySelector("#item-info");

  stubSvgPathLength(dom);
  await loadUserscript(dom, "wk-stroke-order.js", {
    ...capturedRequests(requests),
    ...stimulusGlobals(() => ({
      currentSubject: { id: 605, type: "Kanji", characters: "草" },
    })),
  });

  info.innerHTML = `
    <header class="item-info__header">
      <a data-subject-character-item-value='{"itemId":90,"characters":"艹","subjectCategory":"Radical","meaning":"Flowers"}'>艹 Flowers</a>
    </header>
    <section class="subject-section" data-name="meaning">
      <h2>Name</h2>
      <section class="subject-section__content">Flowers</section>
    </section>
  `;
  await flushMutationObservers();

  // Settle any requests the browsing transition triggers, not just the old one.
  for (const request of requests) {
    request.onload({ status: 200, responseText: MINIMAL_KANJIVG_SVG });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await flushMutationObservers();

  assert.equal(info.querySelector(".subject-section--stroke-order"), null);
  assert.equal(
    info.querySelector('[data-name="meaning"] .subject-section__content')
      .textContent,
    "Flowers",
  );
});

test("stroke order starts collapsed in reviews even when Meaning is expanded", async () => {
  const dom = createDom(
    `
      ${quizInputHtml({ correct: "true" })}
      <div id="item-info" data-controller="subject-info">
        <section class="subject-section subject-section--collapsible" data-name="meaning"
          data-controller="toggle" data-toggle-context-value='{"auto_expand_question_types":["meaning"]}' expanded>
          <h2 class="subject-section__title">
            <a class="subject-section__toggle" data-toggle-target="toggle"
              data-action="toggle#toggle" aria-expanded="true" aria-controls="section-meaning">
              <span class="subject-section__title-text">Meaning</span>
            </a>
          </h2>
          <section class="subject-section__content" id="section-meaning" data-toggle-target="content">Grass</section>
        </section>
      </div>
    `,
    "https://www.wanikani.com/subjects/review",
  );

  stubSvgPathLength(dom);
  await loadUserscript(dom, "wk-stroke-order.js", {
    ...immediateKanjiVgResponse(),
    ...stimulusGlobals(() => ({
      currentSubject: { id: 1, type: "Kanji", characters: "草" },
    })),
  });

  await waitFor(() => {
    assert.ok(
      dom.window.document.querySelector("#wk-kanjivg-stroke-order svg"),
    );
  });

  const strokes = dom.window.document.querySelector(
    ".subject-section--stroke-order",
  );
  assert.equal(strokes.querySelector(".subject-section__content").hidden, true);
  assert.equal(strokes.hasAttribute("expanded"), false);
  assert.equal(
    strokes
      .querySelector('[data-toggle-target="toggle"]')
      .getAttribute("aria-expanded"),
    "false",
  );
  assert.equal(
    dom.window.document.querySelector("#section-meaning").hidden,
    false,
  );
  assert.equal(
    dom.window.document
      .querySelector('[data-name="meaning"]')
      .hasAttribute("expanded"),
    true,
  );
});

test("stroke order inserts before Meaning in review Item Info after answering", async () => {
  const dom = createDom(
    `
      ${quizInputHtml()}
      ${LAST_ITEMS_MENU_HTML}
      <div id="item-info">
        <section class="subject-section" data-name="meaning">
          <h2 class="subject-section__title"><span class="subject-section__title-text">Meaning</span></h2>
          <section class="subject-section__content">One</section>
        </section>
      </div>
    `,
    "https://www.wanikani.com/subjects/review",
  );
  let fetchCount = 0;
  const controller = {
    currentSubject: {
      id: 1,
      object: "kanji",
      characters: "一",
    },
  };

  stubSvgPathLength(dom);

  await loadUserscript(dom, "wk-stroke-order.js", {
    GM: {
      xmlHttpRequest({ onload }) {
        fetchCount += 1;
        onload({ status: 200, responseText: MINIMAL_KANJIVG_SVG });
      },
    },
    ...stimulusGlobals(() => controller),
  });

  assert.equal(fetchCount, 0);

  dom.window.document
    .querySelector(".quiz-input__input-container")
    .setAttribute("correct", "");

  await waitFor(() => {
    assert.ok(
      dom.window.document.querySelector(".subject-section--stroke-order"),
    );
  });

  const sections = [
    ...dom.window.document.querySelectorAll("#item-info > .subject-section"),
  ];

  assert.equal(fetchCount, 1);
  assert.equal(sections[0].nextElementSibling, sections[1]);
  assert.ok(
    sections[0].querySelector("#wk-kanjivg-stroke-order svg.wk-kanjivg-main"),
  );
});

for (const [context, url] of [
  ["Extra Study", "https://www.wanikani.com/subjects/extra_study"],
  ["Recent Mistakes", "https://www.wanikani.com/recent-mistakes/123/quiz"],
]) {
  test(`stroke order renders answered kanji in ${context} Item Info`, async () => {
    const dom = createDom(
      `
      ${quizInputHtml({ correct: true })}
      <div id="item-info">
        <section class="subject-section" data-name="meaning">
          <h2>Meaning</h2>
          <section class="subject-section__content"></section>
        </section>
      </div>
    `,
      url,
    );

    stubSvgPathLength(dom);

    await loadUserscript(dom, "wk-stroke-order.js", {
      ...immediateKanjiVgResponse(),
      ...stimulusGlobals(() => ({
        currentSubject: { id: 1, type: "Kanji", characters: "一" },
      })),
    });

    await waitFor(() => {
      assert.equal(
        dom.window.document
          .querySelector("#item-info #wk-kanjivg-stroke-order svg")
          ?.getAttribute("aria-label"),
        "一 stroke order",
      );
    });
  });
}

test("stroke order reads the review subject from the userscript page window", async () => {
  const dom = createDom(
    `
      ${quizInputHtml({ correct: "true" })}
      <div id="item-info">
        <section class="subject-section subject-section--collapsible" data-name="meaning">
          <h2 class="subject-section__title">
            <a class="subject-section__toggle">
              <span class="subject-section__title-text">Meaning</span>
            </a>
          </h2>
          <section id="section-meaning" class="subject-section__content"></section>
        </section>
      </div>
    `,
    "https://www.wanikani.com/subjects/review",
  );
  const controller = {
    currentSubject: {
      id: 543,
      type: "Kanji",
      subject_category: "Kanji",
      characters: "先",
    },
  };

  stubSvgPathLength(dom);

  await loadUserscript(dom, "wk-stroke-order.js", {
    ...immediateKanjiVgResponse(),
    unsafeWindow: {
      ...stimulusGlobals(() => controller),
    },
  });

  await waitFor(() => {
    assert.equal(
      dom.window.document
        .querySelector("#wk-kanjivg-stroke-order svg")
        ?.getAttribute("aria-label"),
      "先 stroke order",
    );
  });
});

test("stroke order does not fetch diagrams for non-kanji review subjects", async () => {
  const dom = createDom(
    `
      ${quizInputHtml({ correct: true })}
      ${LAST_ITEMS_MENU_HTML}
      <div id="item-info">
        <section class="subject-section" data-name="meaning"></section>
      </div>
    `,
    "https://www.wanikani.com/subjects/review",
  );
  let fetchCount = 0;

  await loadUserscript(dom, "wk-stroke-order.js", {
    GM: {
      xmlHttpRequest() {
        fetchCount += 1;
      },
    },
    ...stimulusGlobals(() => ({
      currentSubject: {
        id: 2,
        object: "vocabulary",
        characters: "一つ",
      },
    })),
  });

  await flushMutationObservers();

  assert.equal(fetchCount, 0);
  assert.equal(
    dom.window.document.querySelector(".subject-section--stroke-order"),
    null,
  );
});

test("stroke order gates browsed kanji in vocabulary quizzes until answering and clears on the next question", async () => {
  const dom = createDom(
    `
      ${quizInputHtml()}
      <div id="item-info">
        <header class="item-info__header">
          <a data-subject-character-item-value='{"itemId":601,"characters":"日","subjectCategory":"Kanji","meaning":"Sun"}'>日 Sun</a>
        </header>
        <section class="subject-section" data-name="meaning">
          <h2>Meaning</h2>
          <section class="subject-section__content">Sun</section>
        </section>
      </div>
    `,
    "https://www.wanikani.com/subjects/review",
  );
  const controller = {
    currentSubject: { id: 2804, type: "Vocabulary", characters: "音" },
  };
  const info = dom.window.document.querySelector("#item-info");
  const input = dom.window.document.querySelector(
    ".quiz-input__input-container",
  );

  stubSvgPathLength(dom);
  await loadUserscript(dom, "wk-stroke-order.js", {
    ...immediateKanjiVgResponse(),
    ...stimulusGlobals(() => controller),
  });
  await flushMutationObservers();
  assert.equal(info.querySelector(".subject-section--stroke-order"), null);

  input.setAttribute("correct", "false");
  await waitFor(() => {
    assert.equal(
      info.querySelector(".wk-kanjivg-main")?.getAttribute("aria-label"),
      "日 stroke order",
    );
  });

  controller.currentSubject = {
    id: 2805,
    type: "Vocabulary",
    characters: "休む",
  };
  input.removeAttribute("correct");
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushMutationObservers();
  assert.equal(info.querySelector(".subject-section--stroke-order"), null);
});

test("stroke order gates lesson-quiz diagrams and rejects stale browsed kanji", async () => {
  const meaningInfo = (meaning, subject) => `
    ${subject ? `<header class="item-info__header"><a data-subject-character-item-value='${JSON.stringify(subject)}'></a></header>` : ""}
    <section class="subject-section subject-section--collapsible" data-name="meaning">
      <h2 class="subject-section__title">Meaning</h2>
      <section class="subject-section__content">${meaning}</section>
    </section>
  `;
  const dom = createDom(
    `${quizInputHtml()}<div id="item-info">${meaningInfo("One")}</div>`,
    "https://www.wanikani.com/subject-lessons/1234567890123456789/quiz",
  );
  const controller = {
    currentSubject: { id: 1, type: "Kanji", characters: "一" },
  };
  const requests = [];
  stubSvgPathLength(dom);
  await loadUserscript(dom, "wk-stroke-order.js", {
    ...capturedRequests(requests),
    ...stimulusGlobals(() => controller),
  });
  const info = dom.window.document.querySelector("#item-info");
  const input = dom.window.document.querySelector(
    ".quiz-input__input-container",
  );
  await flushMutationObservers();
  assert.equal(info.querySelector(".subject-section--stroke-order"), null);
  assert.deepEqual(requests, []);

  input.setAttribute("correct", "false");
  await waitFor(() => assert.equal(requests.length, 1));
  info.innerHTML = meaningInfo("Two", {
    itemId: 2,
    subjectCategory: "Kanji",
    characters: "二",
  });
  await flushMutationObservers();
  requests[0].onload({ status: 200, responseText: MINIMAL_KANJIVG_SVG });
  await waitFor(() => assert.equal(requests.length, 2));
  assert.equal(info.querySelector(".subject-section--stroke-order"), null);
  const twoStrokeSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 109 109">
      <path d="M20 35 L80 35"></path>
      <path d="M10 70 L90 70"></path>
    </svg>
  `;
  requests[1].onload({ status: 200, responseText: twoStrokeSvg });
  await waitFor(() => {
    const svg = info.querySelector("svg.wk-kanjivg-main");
    assert.match(svg?.getAttribute("aria-label") || "", /二/);
    assert.equal(svg.querySelectorAll("path").length, 2);
  });

  input.removeAttribute("correct");
  await waitFor(() => {
    assert.equal(info.querySelector(".subject-section--stroke-order"), null);
  });
  info.innerHTML = meaningInfo("One");
  await flushMutationObservers();
  assert.equal(info.querySelector(".subject-section--stroke-order"), null);
  input.setAttribute("correct", "true");
  await waitFor(() => assert.equal(requests.length, 3));
  requests[2].onload({ status: 200, responseText: MINIMAL_KANJIVG_SVG });
  await waitFor(() => {
    assert.match(
      info.querySelector("svg.wk-kanjivg-main")?.getAttribute("aria-label") ||
        "",
      /一/,
    );
  });

  info.innerHTML = meaningInfo("Ground", {
    itemId: 3,
    subjectCategory: "Radical",
    characters: "一",
  });
  await flushMutationObservers();
  assert.equal(info.querySelector(".subject-section--stroke-order"), null);
  assert.equal(requests.length, 3);
});

test("stroke order discards a stale review lookup when the subject changes", async () => {
  const svgText = (kanji) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 109 109">
      <path d="M10 50 L90 50"></path>
      <text x="12" y="45">1</text>
      <title>${kanji}</title>
    </svg>
  `;
  const itemInfo = () => `
    <section class="subject-section" data-name="meaning">
      <h2 class="subject-section__title"><span class="subject-section__title-text">Meaning</span></h2>
      <section class="subject-section__content"></section>
    </section>
  `;
  const dom = createDom(
    `
      ${quizInputHtml({ correct: true })}
      ${LAST_ITEMS_MENU_HTML}
      <div id="item-info">${itemInfo()}</div>
    `,
    "https://www.wanikani.com/subjects/review",
  );
  const requests = [];
  const controller = {
    currentSubject: { id: 1, object: "kanji", characters: "一" },
  };

  stubSvgPathLength(dom);

  await loadUserscript(dom, "wk-stroke-order.js", {
    ...capturedRequests(requests),
    ...stimulusGlobals(() => controller),
  });

  assert.equal(requests.length, 1);

  controller.currentSubject = { id: 2, object: "kanji", characters: "二" };
  dom.window.document.querySelector("#item-info").innerHTML = itemInfo();
  requests[0].onload({ status: 200, responseText: svgText("一") });

  await waitFor(() => {
    assert.equal(requests.length, 2);
  });

  assert.equal(
    dom.window.document.querySelector("#wk-kanjivg-stroke-order"),
    null,
  );

  requests[1].onload({ status: 200, responseText: svgText("二") });

  await waitFor(() => {
    assert.equal(
      dom.window.document
        .querySelector("#wk-kanjivg-stroke-order svg")
        ?.getAttribute("aria-label"),
      "二 stroke order",
    );
  });
});

test("stroke order discards a pending browsed-kanji lookup when Item Info changes without changing the quiz subject", async () => {
  const dom = createDom(
    `
      ${quizInputHtml({ correct: "true" })}
      <div id="item-info">
        <header class="item-info__header">
          <a data-subject-character-item-value='{"itemId":601,"characters":"日","subjectCategory":"Kanji","meaning":"Sun"}'>日 Sun</a>
        </header>
        <section class="subject-section" data-name="meaning">
          <h2>Meaning</h2>
          <section class="subject-section__content">Sun</section>
        </section>
      </div>
    `,
    "https://www.wanikani.com/subjects/review",
  );
  const requests = [];
  const info = dom.window.document.querySelector("#item-info");

  stubSvgPathLength(dom);
  await loadUserscript(dom, "wk-stroke-order.js", {
    ...capturedRequests(requests),
    ...stimulusGlobals(() => ({
      currentSubject: { id: 605, type: "Kanji", characters: "草" },
    })),
  });
  assert.equal(
    requests[0]?.url,
    "https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/065e5.svg",
  );

  const character = info.querySelector("[data-subject-character-item-value]");
  character.dataset.subjectCharacterItemValue =
    '{"itemId":604,"characters":"青","subjectCategory":"Kanji","meaning":"Blue"}';
  character.textContent = "青 Blue";
  info.querySelector(
    '[data-name="meaning"] .subject-section__content',
  ).textContent = "Blue";
  requests[0].onload({ status: 200, responseText: MINIMAL_KANJIVG_SVG });

  await waitFor(() => {
    assert.equal(
      requests[1]?.url,
      "https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/09752.svg",
    );
  });
  assert.equal(info.querySelector(".wk-kanjivg-main"), null);

  requests[1].onload({ status: 200, responseText: MINIMAL_KANJIVG_SVG });
  await waitFor(() => {
    assert.equal(
      info.querySelector(".wk-kanjivg-main")?.getAttribute("aria-label"),
      "青 stroke order",
    );
  });
});

test("stroke order retries a failed kanji only after the review subject changes", async () => {
  const itemInfo = `
    <section class="subject-section" data-name="meaning">
      <h2>Meaning</h2>
      <section class="subject-section__content"></section>
    </section>
  `;
  const dom = createDom(
    `
      ${quizInputHtml({ correct: true })}
      <div id="item-info">${itemInfo}</div>
    `,
    "https://www.wanikani.com/subjects/review",
  );
  const requests = [];
  const controller = {
    currentSubject: { id: 1, object: "kanji", characters: "一" },
  };

  dom.window.console.warn = () => {};

  await loadUserscript(dom, "wk-stroke-order.js", {
    ...capturedRequests(requests),
    ...stimulusGlobals(() => controller),
  });

  requests[0].onload({ status: 200, responseText: "<html>Not an SVG</html>" });

  await new Promise((resolve) => setTimeout(resolve, 0));
  dom.window.document.querySelector("#item-info").innerHTML = itemInfo;
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(requests.length, 1);

  controller.currentSubject = {
    id: 2,
    object: "vocabulary",
    characters: "一つ",
  };
  dom.window.document.querySelector("#item-info").innerHTML = itemInfo;
  await flushMutationObservers();

  controller.currentSubject = { id: 1, object: "kanji", characters: "一" };
  dom.window.document.querySelector("#item-info").innerHTML = itemInfo;

  await waitFor(() => {
    assert.equal(requests.length, 2);
  });
});

test("stroke order starts a review lookup while a subject-page lookup is pending", async () => {
  const dom = createDom(
    KANJI_SUBJECT_PAGE_WITHOUT_NAV_HTML,
    "https://www.wanikani.com/kanji/%E4%B8%80",
  );
  const requests = [];
  const controller = {
    currentSubject: { id: 2, object: "kanji", characters: "二" },
  };

  stubSvgPathLength(dom);

  await loadUserscript(dom, "wk-stroke-order.js", {
    ...capturedRequests(requests),
    ...stimulusGlobals(() => controller),
  });

  assert.equal(requests.length, 1);

  dom.window.history.pushState({}, "", "/subjects/review");
  dom.window.document.body.innerHTML = `
    ${quizInputHtml({ correct: true })}
    <div id="item-info">
      <section class="subject-section" data-name="components">
        <h2>Radical Combination</h2>
      </section>
      <section class="subject-section" data-name="meaning">
        <h2>Meaning</h2>
        <section class="subject-section__content"></section>
      </section>
    </div>
  `;

  await waitFor(() => {
    assert.equal(requests.length, 2);
  });

  requests[1].onload({ status: 200, responseText: MINIMAL_KANJIVG_SVG });

  await waitFor(() => {
    assert.equal(
      dom.window.document
        .querySelector("#wk-kanjivg-stroke-order svg")
        ?.getAttribute("aria-label"),
      "二 stroke order",
    );
  });

  requests[0].onload({ status: 200, responseText: MINIMAL_KANJIVG_SVG });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(
    dom.window.document.querySelectorAll("#wk-kanjivg-stroke-order").length,
    1,
  );
  assert.equal(
    dom.window.document
      .querySelector("#wk-kanjivg-stroke-order svg")
      ?.getAttribute("aria-label"),
    "二 stroke order",
  );
});

test("stroke order starts the destination kanji lookup after a pending page lookup settles", async () => {
  const page = KANJI_SUBJECT_PAGE_HTML;
  const dom = createDom(page, "https://www.wanikani.com/kanji/%E4%B8%80");
  const requests = [];

  stubSvgPathLength(dom);

  await loadUserscript(dom, "wk-stroke-order.js", {
    ...capturedRequests(requests),
  });

  assert.equal(requests.length, 1);

  dom.window.history.pushState({}, "", "/kanji/%E4%BA%8C");
  dom.window.document.body.innerHTML = page;
  dom.window.document.dispatchEvent(new dom.window.Event("turbo:load"));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(requests.length, 1);

  requests[0].onload({ status: 200, responseText: MINIMAL_KANJIVG_SVG });

  await waitFor(() => {
    assert.equal(requests.length, 2);
  });

  requests[1].onload({ status: 200, responseText: MINIMAL_KANJIVG_SVG });

  await waitFor(() => {
    assert.equal(
      dom.window.document
        .querySelector("#wk-kanjivg-stroke-order svg")
        ?.getAttribute("aria-label"),
      "二 stroke order",
    );
  });
});

test("stroke order reinserts after a same-path lesson render", async () => {
  const lessonHtml = `
    <div class="lesson-container">
      <div class="character-header character-header--kanji">
        <div class="character-header__characters">先</div>
      </div>
      <div class="subject-slides">
        <ul class="subject-slides__navigation-items">
          <li><a class="subject-slides__navigation-link" href="#composition">Radicals</a></li>
          <li><a class="subject-slides__navigation-link" href="#meaning">Meaning</a></li>
        </ul>
        <div class="subject-slide" id="composition">
          <div class="subject-slide__content">
            <div class="subject-slide__sections">
              <section class="subject-section" title="Radical Composition">
                <h2><span class="subject-section__title-text">Radical Composition</span></h2>
              </section>
            </div>
          </div>
          <a class="subject-slide__navigation" aria-label="next slide" href="#meaning">Next</a>
        </div>
        <div class="subject-slide" id="meaning" hidden>
          <a class="subject-slide__navigation" aria-label="previous slide" href="#composition">Previous</a>
        </div>
      </div>
    </div>
  `;
  const dom = createDom(
    lessonHtml,
    "https://www.wanikani.com/subject-lessons/-4190889689937224551/543",
  );
  let fetchCount = 0;

  stubSvgPathLength(dom);

  await loadUserscript(dom, "wk-stroke-order.js", {
    GM: {
      xmlHttpRequest({ onload }) {
        fetchCount += 1;
        onload({ status: 200, responseText: MINIMAL_KANJIVG_SVG });
      },
    },
  });

  await waitFor(() => {
    assert.ok(
      dom.window.document.querySelector(
        "#stroke-order #wk-kanjivg-stroke-order",
      ),
    );
  });

  dom.window.document.body.innerHTML = lessonHtml;

  await waitFor(() => {
    assert.ok(
      dom.window.document.querySelector(
        "#stroke-order #wk-kanjivg-stroke-order",
      ),
    );
  });

  assert.equal(fetchCount, 2);
});

for (const subjectType of ["radical", "vocabulary"]) {
  test(`stroke order does not run on ${subjectType} lessons`, async () => {
    const dom = createDom(
      `
        <div class="lesson-container">
          <div class="character-header character-header--${subjectType}">
            <div class="character-header__characters" lang="ja">先</div>
          </div>
          <div class="subject-slide" id="composition"></div>
        </div>
      `,
      "https://www.wanikani.com/subject-lessons/-4190889689937224551/543",
    );
    let fetchCount = 0;

    await loadUserscript(dom, "wk-stroke-order.js", {
      GM: {
        xmlHttpRequest() {
          fetchCount += 1;
        },
      },
    });

    await flushMutationObservers();

    assert.equal(fetchCount, 0);
    assert.equal(dom.window.document.querySelector("#stroke-order"), null);
  });
}

test("stroke order sanitizes fetched SVG before insertion", async () => {
  const svgText = `
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:kvg="http://kanjivg.tagaini.net" viewBox="0 0 109 109" onload="alert(1)">
      <script>alert(1)</script>
      <style>@import url("https://attacker.example/styles.css");</style>
      <foreignObject><div>unsafe</div></foreignObject>
      <use href="#safe"></use>
      <set attributeName="href" to="javascript:alert(1)"></set>
      <animate attributeName="href" values="#safe;javascript:alert(1)"></animate>
      <animateMotion path="M0,0 L100,100"></animateMotion>
      <animateTransform attributeName="transform" type="scale" values="1;2"></animateTransform>
      <discard begin="0s"></discard>
      <a href="javascript:alert(1)">
        <g id="kvg:kanji_4e00" kvg:element="一" kvg:radical="general" onclick="alert(1)" style="background: url(https://attacker.example/image.png)">
          <path id="kvg:4e00-s1" d="M10 50 L90 50" onmouseover="alert(1)" fill="url(https://attacker.example/fill.svg)" filter="url('https://attacker.example/filter.svg')"></path>
          <text x="12" y="45">1</text>
        </g>
      </a>
    </svg>
  `;
  const dom = createDom(
    KANJI_SUBJECT_PAGE_HTML,
    "https://www.wanikani.com/kanji/%E4%B8%80",
  );

  stubSvgPathLength(dom);

  await loadUserscript(dom, "wk-stroke-order.js", {
    GM: {
      xmlHttpRequest({ onload }) {
        onload({ status: 200, responseText: svgText });
      },
    },
  });

  await waitFor(() => {
    assert.ok(
      dom.window.document.querySelector("#wk-kanjivg-stroke-order svg"),
    );
  });

  const insertedSvg = dom.window.document.querySelector(
    "#wk-kanjivg-stroke-order svg",
  );

  assert.equal(insertedSvg.hasAttribute("onload"), false);
  assert.equal(insertedSvg.querySelector("script"), null);
  assert.equal(insertedSvg.querySelector("style"), null);
  assert.equal(insertedSvg.querySelector("foreignObject"), null);
  assert.equal(insertedSvg.querySelector("[onclick]"), null);
  assert.equal(insertedSvg.querySelector("[onmouseover]"), null);
  assert.equal(insertedSvg.querySelector("g[style]"), null);
  assert.equal(insertedSvg.querySelector("[fill]"), null);
  assert.equal(insertedSvg.querySelector("[filter]"), null);
  assert.equal(insertedSvg.querySelector("a[href]"), null);
  assert.equal(
    insertedSvg.querySelector(
      "set, animate, animateMotion, animateTransform, discard",
    ),
    null,
  );
  assert.ok(insertedSvg.querySelector('use[href="#safe"]'));
  assert.equal(
    dom.window.getComputedStyle(insertedSvg.querySelector("text")).fontSize,
    "8px",
  );
  assert.equal(
    dom.window.getComputedStyle(insertedSvg.querySelector("text")).fontWeight,
    "normal",
  );
});

test("stroke order can reinsert after navigating away and back to a kanji page", async () => {
  const kanjiPage = KANJI_SUBJECT_PAGE_HTML;
  const dom = createDom(kanjiPage, "https://www.wanikani.com/kanji/%E4%B8%80");
  let fetchCount = 0;

  stubSvgPathLength(dom);

  await loadUserscript(dom, "wk-stroke-order.js", {
    GM: {
      xmlHttpRequest({ onload }) {
        fetchCount += 1;
        onload({ status: 200, responseText: MINIMAL_KANJIVG_SVG });
      },
    },
  });

  await waitFor(() => {
    assert.ok(dom.window.document.querySelector("#wk-kanjivg-stroke-order"));
  });

  dom.window.history.pushState({}, "", "/vocabulary/%E4%B8%80");
  dom.window.document.body.innerHTML = "<main><h2>Meaning</h2></main>";

  await new Promise((resolve) => setTimeout(resolve, 0));

  await waitFor(() => {
    assert.equal(
      dom.window.document.querySelector("#wk-kanjivg-stroke-order"),
      null,
    );
  });

  dom.window.history.pushState({}, "", "/kanji/%E4%B8%80");
  dom.window.document.body.innerHTML = kanjiPage;

  await new Promise((resolve) => setTimeout(resolve, 0));

  await waitFor(() => {
    assert.ok(dom.window.document.querySelector("#wk-kanjivg-stroke-order"));
    assert.equal(fetchCount, 2);
  });
});

test("stroke order does not duplicate SVG ids in generated figures", async () => {
  const svgText = `
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:kvg="http://kanjivg.tagaini.net" viewBox="0 0 109 109">
      <g id="kvg:kanji_4e00" kvg:element="一" kvg:radical="general">
        <path id="kvg:4e00-s1" d="M10 50 L90 50"></path>
        <text id="kvg:4e00-t1" x="12" y="45">1</text>
      </g>
    </svg>
  `;
  const dom = createDom(
    KANJI_SUBJECT_PAGE_HTML,
    "https://www.wanikani.com/kanji/%E4%B8%80",
  );

  stubSvgPathLength(dom);

  await loadUserscript(dom, "wk-stroke-order.js", {
    GM: {
      xmlHttpRequest({ onload }) {
        onload({ status: 200, responseText: svgText });
      },
    },
  });

  await waitFor(() => {
    assert.ok(
      dom.window.document.querySelector("#wk-kanjivg-stroke-order svg"),
    );
  });

  const ids = [
    ...dom.window.document.querySelectorAll("#wk-kanjivg-stroke-order [id]"),
  ].map((element) => element.id);

  assert.equal(new Set(ids).size, ids.length);
});

test("stroke order does not run on non-kanji pages", async () => {
  const dom = createDom(
    "<main><h2>Meaning</h2></main>",
    "https://www.wanikani.com/vocabulary/%E4%B8%80",
  );
  let fetchCount = 0;

  await loadUserscript(dom, "wk-stroke-order.js", {
    GM: {
      xmlHttpRequest() {
        fetchCount += 1;
      },
    },
  });

  await flushMutationObservers();

  assert.equal(fetchCount, 0);
  assert.equal(
    dom.window.document.querySelector("#wk-kanjivg-stroke-order"),
    null,
  );
});

test("stroke order does not repeatedly fetch a failed KanjiVG file", async () => {
  const dom = createDom(
    `
      <main>
        <h2>Radical Combination</h2>
        <h2>Meaning</h2>
      </main>
    `,
    "https://www.wanikani.com/kanji/%E4%B8%80",
  );
  let fetchCount = 0;

  dom.window.console.warn = () => {};

  await loadUserscript(dom, "wk-stroke-order.js", {
    GM: {
      xmlHttpRequest({ onload }) {
        fetchCount += 1;
        onload({ status: 404, responseText: "Not found" });
      },
    },
  });

  await waitFor(() => {
    assert.equal(fetchCount, 1);
  });

  dom.window.document.body.appendChild(
    dom.window.document.createElement("div"),
  );
  dom.window.document.body.appendChild(
    dom.window.document.createElement("div"),
  );

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(fetchCount, 1);
});

test("stroke order times out a stalled request and processes the destination page", async () => {
  const page = KANJI_SUBJECT_PAGE_HTML;
  const dom = createDom(page, "https://www.wanikani.com/kanji/%E4%B8%80");
  const requests = [];

  stubSvgPathLength(dom);
  dom.window.console.warn = () => {};

  await loadUserscript(dom, "wk-stroke-order.js", {
    ...capturedRequests(requests),
  });

  assert.equal(Number.isFinite(requests[0].timeout), true);
  assert.ok(requests[0].timeout > 0);

  dom.window.history.pushState({}, "", "/kanji/%E4%BA%8C");
  dom.window.document.body.innerHTML = page;
  requests[0].ontimeout();

  await waitFor(() => {
    assert.equal(requests.length, 2);
  });

  requests[1].onload({ status: 200, responseText: MINIMAL_KANJIVG_SVG });

  await waitFor(() => {
    assert.equal(
      dom.window.document
        .querySelector("#wk-kanjivg-stroke-order svg")
        ?.getAttribute("aria-label"),
      "二 stroke order",
    );
  });
});
