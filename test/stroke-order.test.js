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
  ].map((path) => parseColor(path.style.stroke));

  assert.equal(new Set(strokes.map(String)).size, 4);
  for (const stroke of strokes) {
    assert.ok(contrastRatio(stroke, parseColor("#ffffff")) >= 3);
    assert.ok(contrastRatio(stroke, parseColor("#1e1e2e")) >= 3);
  }
});

test("stroke order inserts a lesson tab after Radicals on kanji lessons", async () => {
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
                  <section class="subject-section" title="Radical Composition">
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

test("stroke order inserts before Meaning in review Item Info after answering", async () => {
  const dom = createDom(
    `
      ${quizInputHtml()}
      ${LAST_ITEMS_MENU_HTML}
      <turbo-frame id="subject-info">
        <section class="subject-section subject-section--meaning" title="Meaning">
          <h2 class="subject-section__title"><span class="subject-section__title-text">Meaning</span></h2>
          <section class="subject-section__content">One</section>
        </section>
      </turbo-frame>
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
    ...dom.window.document.querySelectorAll("#subject-info > .subject-section"),
  ];

  assert.equal(fetchCount, 1);
  assert.deepEqual(
    sections.map((section) => section.title),
    ["Stroke Order", "Meaning"],
  );
  assert.equal(
    sections[0].querySelector(".subject-section__title-text")?.textContent,
    "Stroke Order",
  );
  assert.ok(
    sections[0].querySelector("#wk-kanjivg-stroke-order svg.wk-kanjivg-main"),
  );
});

for (const [quizName, quizUrl] of [
  ["extra study", "https://www.wanikani.com/subjects/extra_study"],
  [
    "a non-standard URL",
    "https://www.wanikani.com/subject-lessons/session/quiz",
  ],
]) {
  test(`stroke order recognizes ${quizName} quizzes`, async () => {
    const dom = createDom(
      `
        ${quizInputHtml({ correct: true })}
        <turbo-frame id="subject-info">
          <section class="subject-section subject-section--meaning" title="Meaning">
            <h2>Meaning</h2>
            <section class="subject-section__content"></section>
          </section>
        </turbo-frame>
        ${LAST_ITEMS_MENU_HTML}
      `,
      quizUrl,
    );

    stubSvgPathLength(dom);

    await loadUserscript(dom, "wk-stroke-order.js", {
      ...immediateKanjiVgResponse(),
      ...stimulusGlobals(() => ({
        currentSubject: { id: 1, object: "kanji", characters: "一" },
      })),
    });

    await waitFor(() => {
      assert.ok(
        dom.window.document.querySelector(".subject-section--stroke-order"),
      );
    });

    assert.equal(
      dom.window.document.querySelector(".wk-kanjivg-replay").tagName,
      "BUTTON",
    );
  });
}

test("stroke order reads the review subject from the userscript page window", async () => {
  const dom = createDom(
    `
      ${quizInputHtml({ correct: "true" })}
      <turbo-frame class="subject-info" id="subject-info">
        <div class="container">
          <section class="subject-section subject-section--meaning subject-section--collapsible">
            <h2 class="subject-section__title">
              <a class="subject-section__toggle">
                <span class="subject-section__title-text">Meaning</span>
              </a>
            </h2>
            <section id="section-meaning" class="subject-section__content"></section>
          </section>
        </div>
      </turbo-frame>
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

  const replay = dom.window.document.querySelector(
    "#wk-kanjivg-stroke-order .wk-kanjivg-replay",
  );

  assert.equal(replay.tagName, "BUTTON");
  assert.equal(replay.textContent, "Replay animation");
  assert.equal(replay.classList.contains("subject-section__toggle"), false);
});

test("stroke order does not fetch diagrams for non-kanji review subjects", async () => {
  const dom = createDom(
    `
      ${quizInputHtml({ correct: true })}
      ${LAST_ITEMS_MENU_HTML}
      <turbo-frame id="subject-info">
        <section class="subject-section subject-section--meaning" title="Meaning"></section>
      </turbo-frame>
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

test("stroke order discards a stale review lookup when the subject changes", async () => {
  const svgText = (kanji) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 109 109">
      <path d="M10 50 L90 50"></path>
      <text x="12" y="45">1</text>
      <title>${kanji}</title>
    </svg>
  `;
  const itemInfo = () => `
    <section class="subject-section subject-section--meaning" title="Meaning">
      <h2 class="subject-section__title"><span class="subject-section__title-text">Meaning</span></h2>
      <section class="subject-section__content"></section>
    </section>
  `;
  const dom = createDom(
    `
      ${quizInputHtml({ correct: true })}
      ${LAST_ITEMS_MENU_HTML}
      <turbo-frame id="subject-info">${itemInfo()}</turbo-frame>
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
  dom.window.document.querySelector("#subject-info").innerHTML = itemInfo();
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

test("stroke order retries a failed kanji only after the review subject changes", async () => {
  const itemInfo = `
    <section class="subject-section subject-section--meaning" title="Meaning">
      <h2>Meaning</h2>
      <section class="subject-section__content"></section>
    </section>
  `;
  const dom = createDom(
    `
      ${quizInputHtml({ correct: true })}
      <turbo-frame id="subject-info">${itemInfo}</turbo-frame>
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
  dom.window.document.querySelector("#subject-info").innerHTML = itemInfo;
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(requests.length, 1);

  controller.currentSubject = {
    id: 2,
    object: "vocabulary",
    characters: "一つ",
  };
  dom.window.document.querySelector("#subject-info").innerHTML = itemInfo;
  await flushMutationObservers();

  controller.currentSubject = { id: 1, object: "kanji", characters: "一" };
  dom.window.document.querySelector("#subject-info").innerHTML = itemInfo;

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
    <turbo-frame id="subject-info">
      <section class="subject-section" title="Radical Combination">
        <h2>Radical Combination</h2>
      </section>
      <section class="subject-section subject-section--meaning" title="Meaning">
        <h2>Meaning</h2>
        <section class="subject-section__content"></section>
      </section>
    </turbo-frame>
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
