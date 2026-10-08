import { test } from "node:test";
import assert from "node:assert/strict";
import { VirtualConsole } from "jsdom";
import {
  LAST_ITEMS_MENU_HTML,
  SIMPLE_TABERU_OJAD_HTML,
  capturedRequests,
  createDom,
  flushMutationObservers,
  loadUserscript,
  ojadResultsHtml,
  quizInputHtml,
  stimulusGlobals,
  vocabularySubjectPageHtml,
  waitFor,
} from "./support/userscript-harness.js";

test("pitch accent silently ignores dashboard mutations", async () => {
  const messages = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("debug", (...args) => messages.push(args.join(" ")));
  const dom = createDom("<main></main>", "https://www.wanikani.com/dashboard", {
    virtualConsole,
  });

  await loadUserscript(dom, "wk-pitch-accent.js");

  dom.window.document
    .querySelector("main")
    .append(dom.window.document.createElement("div"));
  await flushMutationObservers();

  assert.deepEqual(
    messages.filter(
      (message) =>
        message.includes("Not a vocabulary subject page") ||
        message.includes("No subject detected, skipping"),
    ),
    [],
  );
});

test("pitch accent inserts an exact OJAD result inside Reading", async () => {
  const ojadHtml = `
    <table id="word_table"><tbody><tr>
      <td class="midashi"><p class="midashi_word">食べる・食べます</p></td>
      <td class="katsuyo katsuyo_jisho_js">
        <span class="accented_word">
          <span class="mola_-3"><span class="char">た</span></span>
          <span class="accent_top mola_-2"><span class="char">べ</span></span>
          <span class="mola_-1"><span class="char">る</span></span>
        </span>
      </td>
    </tr></tbody></table>
  `;
  const dom = createDom(
    `
      <style>
        .subject-readings-with-audio { height: 60px; }
        .subject-readings-with-audio__item { height: 44px; margin: 8px 0; }
        .reading-with-audio__audio svg { width: 16px; height: 16px; }
      </style>
      <header><span class="subject-character subject-character--vocabulary" title="たべる">
        <span class="subject-character__characters-text">食べる</span>
      </span></header>
      <nav><ul class="wk-nav__items">
        <li class="wk-nav__item"><a class="wk-nav__item-link" href="#reading"><div class="wk-nav__item-text">Reading</div></a></li>
        <li class="wk-nav__item"><a class="wk-nav__item-link" href="#context"><div class="wk-nav__item-text">Context</div></a></li>
      </ul></nav>
      <main>
        <section class="subject-section subject-section--reading">
          <a id="reading"></a><h2>Reading</h2>
          <section class="subject-section__content">
            <section class="subject-section__subsection subject-section__subsection--reading">
              <div class="subject-readings-with-audio">
                <div class="subject-readings-with-audio__item">
                  <div class="reading-with-audio">
                    <span class="reading-with-audio__reading">たべる</span>
                    <button class="reading-with-audio__audio">
                      <svg class="reading-with-audio__audio-icon"></svg>Play audio
                    </button>
                  </div>
                </div>
              </div>
            </section>
            <section class="subject-section__subsection subject-section__subsection--explanation">
              Reading explanation
            </section>
          </section>
        </section>
        <section class="subject-section subject-section--context" data-controller="toggle">
          <a class="wk-nav__anchor" id="context"></a>
          <h2 class="subject-section__title">
            <a class="subject-section__toggle" aria-controls="section-context">
              <span class="subject-section__title-text">Context</span>
            </a>
          </h2>
          <section id="section-context" class="subject-section__content" data-toggle-target="content"></section>
        </section>
      </main>
    `,
    "https://www.wanikani.com/vocabulary/%E9%A3%9F%E3%81%B9%E3%82%8B",
  );
  const readingItem = dom.window.document.querySelector(
    ".subject-readings-with-audio__item",
  );
  const audioControl = dom.window.document.querySelector(
    ".reading-with-audio__audio",
  );
  let fetchedUrl;

  await loadUserscript(dom, "wk-pitch-accent.js", {
    GM: {
      xmlHttpRequest({ url, onload }) {
        fetchedUrl = url;
        onload({ status: 200, responseText: ojadHtml });
      },
    },
  });

  await waitFor(() => {
    assert.ok(dom.window.document.querySelector(".wk-pitch-accent-charts svg"));
  });

  const sections = [
    ...dom.window.document.querySelectorAll("main > .subject-section"),
  ];
  assert.deepEqual(
    sections.map((section) => section.classList[1]),
    ["subject-section--reading", "subject-section--context"],
  );
  assert.equal(
    fetchedUrl,
    "https://www.gavo.t.u-tokyo.ac.jp/ojad/search/index/word:%E3%81%9F%E3%81%B9%E3%82%8B",
  );
  assert.ok(
    dom.window.document.querySelector(
      ".subject-section--reading #wk-pitch-accent",
    ),
  );
  assert.equal(
    dom.window.document.querySelector(".wk-pitch-accent-label-name")
      ?.textContent,
    "Nakadaka",
  );
  assert.equal(
    dom.window.document.querySelector(".wk-pitch-accent-heading"),
    null,
  );
  assert.notEqual(dom.window.getComputedStyle(audioControl).display, "none");
  assert.equal(
    dom.window.getComputedStyle(
      audioControl.querySelector(".reading-with-audio__audio-icon"),
    ).height,
    "16px",
  );
  assert.equal(
    dom.window.getComputedStyle(
      dom.window.document.querySelector(".subject-readings-with-audio"),
    ).height,
    "60px",
  );
  assert.equal(
    dom.window.getComputedStyle(
      dom.window.document.querySelector(".subject-readings-with-audio__item"),
    ).display,
    "block",
  );
  assert.equal(
    dom.window.getComputedStyle(
      dom.window.document.querySelector(".wk-pitch-accent-credit"),
    ).marginTop,
    "50px",
  );
  assert.equal(
    dom.window.document.querySelector(".wk-pitch-accent-credit a")?.href,
    "https://www.gavo.t.u-tokyo.ac.jp/ojad",
  );
  assert.equal(
    dom.window.getComputedStyle(
      dom.window.document.querySelector(".wk-pitch-accent-details"),
    ).paddingTop,
    "0px",
  );
  assert.equal(
    dom.window.getComputedStyle(
      dom.window.document.querySelector(".wk-pitch-accent-details"),
    ).marginTop,
    "-26px",
  );
  assert.equal(dom.window.getComputedStyle(readingItem).marginBottom, "8px");
  assert.equal(
    dom.window.document.querySelector('a[href="#pitch-accent"]'),
    null,
  );
  assert.deepEqual(
    [
      ...dom.window.document.querySelectorAll(
        ".wk-pitch-accent-charts svg text",
      ),
    ].map((node) => node.textContent),
    ["た", "べ", "る"],
  );
  assert.equal(
    dom.window.document
      .querySelector(".wk-pitch-accent-charts svg")
      ?.getAttribute("viewBox"),
    "0 0 88 44",
  );
  assert.equal(
    dom.window.document
      .querySelector(".wk-pitch-accent-charts svg polyline")
      ?.getAttribute("points"),
    "12,16 36,3 60,16 80.75,16",
  );
  assert.deepEqual(
    [
      ...dom.window.document.querySelectorAll(
        ".wk-pitch-accent-charts svg circle",
      ),
    ].map((circle) => circle.getAttribute("cx")),
    ["12", "36", "60", "84"],
  );
  assert.deepEqual(
    [
      ...dom.window.document.querySelectorAll(
        ".wk-pitch-accent-charts svg circle",
      ),
    ].map((circle) => circle.getAttribute("cy")),
    ["16", "3", "16", "16"],
  );
  assert.equal(
    dom.window.document.querySelectorAll(".wk-pitch-accent-charts svg ellipse")
      .length,
    0,
  );
  const accentNumber = dom.window.document.querySelector(
    ".wk-pitch-accent-label-number",
  );
  const pitchFigure = dom.window.document.querySelector(
    ".wk-pitch-accent-charts figure",
  );
  const pitchCaption = pitchFigure.querySelector("figcaption");
  assert.equal(
    dom.window.getComputedStyle(accentNumber).display,
    "inline-flex",
  );
  assert.equal(
    dom.window.getComputedStyle(pitchFigure).alignItems,
    "flex-start",
  );
  assert.equal(dom.window.getComputedStyle(pitchCaption).lineHeight, "16px");
  assert.equal(dom.window.getComputedStyle(pitchCaption).alignItems, "center");
  assert.deepEqual(
    [
      ...dom.window.document.querySelectorAll(
        ".subject-section--reading > .subject-section__content > .subject-section__subsection",
      ),
    ].map((section) => section.classList[1]),
    [
      "subject-section__subsection--reading",
      "subject-section__subsection--explanation",
    ],
  );
  assert.deepEqual(
    [
      ...dom.window.document.querySelector(
        ".subject-section__subsection--reading",
      ).children,
    ].map((element) => element.className),
    ["subject-readings-with-audio", "wk-pitch-accent wk-pitch-accent-details"],
  );
});

test("pitch accent renders every reading on data-named vocabulary sections", async () => {
  const dom = createDom(
    `
      <header><span class="subject-character subject-character--vocabulary" title="かど">角</span></header>
      <section class="subject-section" data-name="meaning">
        <section class="subject-section__content">Corner, angle</section>
      </section>
      <section class="subject-section" data-name="reading">
        <a class="wk-nav__anchor" id="reading"></a>
        <h2 class="subject-section__title">Reading</h2>
        <section class="subject-section__content">
          <section class="subject-subsection" data-name="vocabularyReading">
            <div class="subject-subsection__content" data-content>
              <div class="subject-readings-with-audio">
                <div class="subject-readings-with-audio__item">
                  <div class="reading-with-audio">
                    <div class="reading-with-audio__reading" lang="ja">かど</div>
                    <button class="reading-with-audio__icons">Play かど</button>
                  </div>
                </div>
                <div class="subject-readings-with-audio__item">
                  <div class="reading-with-audio">
                    <div class="reading-with-audio__reading" lang="ja">かく</div>
                    <button class="reading-with-audio__icons">Play かく</button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </section>
      </section>
    `,
    "https://www.wanikani.com/vocabulary/%E8%A7%92",
  );
  const requests = [];
  const audio = [...dom.window.document.querySelectorAll("button")];
  await loadUserscript(dom, "wk-pitch-accent.js", {
    GM: {
      xmlHttpRequest({ url, onload }) {
        const reading = decodeURIComponent(url.split("word:")[1]);
        requests.push(reading);
        onload({
          status: 200,
          responseText: ojadResultsHtml([
            {
              headword: "角",
              moras: [{ text: "か", drop: true }, { text: reading[1] }],
            },
          ]),
        });
      },
    },
  });
  const readingSection = dom.window.document.querySelector(
    '[data-name="reading"]',
  );
  await waitFor(() => {
    assert.equal(
      readingSection.querySelectorAll(".wk-pitch-accent-charts svg").length,
      2,
    );
  });
  assert.deepEqual(requests, ["かど", "かく"]);
  audio.forEach((button, index) => {
    assert.equal(button.isConnected, true);
    assert.equal(
      button.previousElementSibling.dataset.reading,
      ["かど", "かく"][index],
    );
  });
  assert.equal(
    readingSection.querySelector(".reading-with-audio__reading"),
    null,
  );
  assert.equal(
    dom.window.document.querySelector('[data-name="meaning"] .wk-pitch-accent'),
    null,
  );
});

test("pitch accent queries each distinct reading", async () => {
  const dom = createDom(
    `
      <div class="character-header character-header--vocabulary">
        <div class="character-header__characters" title="そのた">その他</div>
      </div>
      <div class="subject-slide" id="reading">
        <section class="subject-section" title="Reading">
          <section class="subject-section__content">
            <div class="subject-readings-with-audio">
              <div class="reading-with-audio">
                <span class="reading-with-audio__reading">そのた</span>
                <button class="reading-with-audio__audio">Play そのた</button>
              </div>
              <div class="reading-with-audio">
                <span class="reading-with-audio__reading"> \u3000そのほか\u3000 </span>
                <button class="reading-with-audio__audio">Play そのほか</button>
              </div>
            </div>
          </section>
        </section>
      </div>
    `,
    "https://www.wanikani.com/subject-lessons/-3852124987023274978/9088#reading",
  );
  const audioControls = [
    ...dom.window.document.querySelectorAll(".reading-with-audio__audio"),
  ];
  const sonota = {
    headword: "その他",
    moras: [{ text: "そ" }, { text: "の", drop: true }, { text: "た" }],
  };
  const sonohoka = {
    headword: "そのほか",
    moras: [
      { text: "そ" },
      { text: "の", drop: true },
      { text: "ほ" },
      { text: "か" },
    ],
  };
  const requests = [];
  const requestUrl = (reading) =>
    `https://www.gavo.t.u-tokyo.ac.jp/ojad/search/index/word:${encodeURIComponent(reading)}`;

  await loadUserscript(dom, "wk-pitch-accent.js", capturedRequests(requests));

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, requestUrl("そのた"));
  requests[0].onload({
    status: 200,
    responseText: ojadResultsHtml([sonota, sonota, sonohoka]),
  });

  await waitFor(() => assert.equal(requests.length, 2));
  assert.equal(requests[1].url, requestUrl("そのほか"));
  requests[1].onload({
    status: 200,
    responseText: ojadResultsHtml([
      sonohoka,
      {
        headword: "別語",
        moras: [
          { text: "そ", drop: true },
          { text: "の" },
          { text: "ほ" },
          { text: "か" },
        ],
      },
      { ...sonota, headword: "そのほか" },
    ]),
  });

  await waitFor(() => {
    assert.equal(
      dom.window.document.querySelectorAll(".wk-pitch-accent-charts figure")
        .length,
      2,
    );
  });
  const charts = [
    ...dom.window.document.querySelectorAll(".wk-pitch-accent-charts"),
  ];
  assert.deepEqual(
    charts.map((chart) => ({
      reading: [...chart.querySelectorAll("svg text")]
        .map((node) => node.textContent)
        .join(""),
      pattern: chart.querySelector(".wk-pitch-accent-label-name").textContent,
      accent: chart.querySelector(".wk-pitch-accent-label-number").textContent,
      figures: chart.querySelectorAll("figure").length,
    })),
    [
      { reading: "そのた", pattern: "Nakadaka", accent: "2", figures: 1 },
      { reading: "そのほか", pattern: "Nakadaka", accent: "2", figures: 1 },
    ],
  );
  audioControls.forEach((audio, index) => {
    assert.equal(audio.isConnected, true);
    assert.equal(audio.previousElementSibling, charts[index]);
    assert.notEqual(dom.window.getComputedStyle(audio).display, "none");
  });
  assert.equal(requests.length, 2);
});

test("pitch accent queries characters when reading metadata is absent", async () => {
  const dom = createDom(
    `
      <span class="subject-character subject-character--vocabulary">食べる</span>
      <main><section class="subject-section subject-section--reading">
        <section class="subject-section__content">
          <div class="reading-with-audio">たべる</div>
        </section>
      </section></main>
    `,
    "https://www.wanikani.com/vocabulary/%E9%A3%9F%E3%81%B9%E3%82%8B",
  );
  const requests = [];

  await loadUserscript(dom, "wk-pitch-accent.js", capturedRequests(requests));

  assert.equal(requests.length, 1);
  assert.equal(
    requests[0].url,
    `https://www.gavo.t.u-tokyo.ac.jp/ojad/search/index/word:${encodeURIComponent("食べる")}`,
  );
  requests[0].onload({
    status: 200,
    responseText: SIMPLE_TABERU_OJAD_HTML,
  });

  await waitFor(() => {
    assert.equal(
      [
        ...dom.window.document.querySelectorAll(
          ".reading-with-audio .wk-pitch-accent-charts svg text",
        ),
      ]
        .map((node) => node.textContent)
        .join(""),
      "たべる",
    );
  });
  assert.equal(requests.length, 1);
});

test("pitch accent shows all exact variants and rejects other headwords and readings", async () => {
  const ojadHtml = ojadResultsHtml([
    {
      headword: "上がる・上がります",
      moras: [
        { text: "あ" },
        { text: "が", high: true },
        { text: "る", high: true },
      ],
    },
    {
      headword: "上げる・上げます",
      moras: [{ text: "あ", drop: true }, { text: "げ" }, { text: "る" }],
    },
    {
      headword: "上げる・上げます",
      moras: [
        { text: "う", drop: true },
        { text: "え" },
        { text: "げ" },
        { text: "る" },
      ],
    },
    {
      headword: "上げる・上げます",
      moras: [
        { text: "あ" },
        { text: "げ", high: true },
        { text: "る", high: true },
      ],
    },
  ]);
  const dom = createDom(
    `
      <span class="subject-character subject-character--vocabulary" title="あげる"></span>
      <nav><ul><li><a href="#context"><span class="wk-nav__item-text">Context</span></a></li></ul></nav>
      <main>
        <section class="subject-section subject-section--reading"><section class="subject-section__content">
          <div class="reading-with-audio">あげる</div>
        </section></section>
        <section class="subject-section subject-section--context"></section>
      </main>
    `,
    "https://www.wanikani.com/vocabulary/%E4%B8%8A%E3%81%92%E3%82%8B",
  );
  await loadUserscript(dom, "wk-pitch-accent.js", {
    GM: {
      xmlHttpRequest({ onload }) {
        onload({ status: 200, responseText: ojadHtml });
      },
    },
  });

  await waitFor(() => {
    assert.equal(
      dom.window.document.querySelectorAll(".wk-pitch-accent-charts figure")
        .length,
      2,
    );
  });

  assert.deepEqual(
    [
      ...dom.window.document.querySelectorAll(".wk-pitch-accent-label-name"),
    ].map((node) => node.textContent),
    ["Atamadaka", "Heiban"],
  );
  assert.deepEqual(
    [
      ...dom.window.document.querySelectorAll(".wk-pitch-accent-charts figure"),
    ].map((figure) =>
      [...figure.querySelectorAll(".wk-pitch-accent-character")].map(
        (node) => node.textContent,
      ),
    ),
    [[], ["あ", "げ", "る"]],
  );
  assert.deepEqual(
    [
      ...dom.window.document.querySelectorAll(".wk-pitch-accent-charts figure"),
    ].map((figure) => figure.className),
    ["wk-pitch-accent-variant-2", "wk-pitch-accent-variant-1"],
  );
  assert.doesNotMatch(
    dom.window.document.querySelector("#wk-pitch-accent-style")?.textContent ||
      "",
    /html\[data-wk-mocha-active\] \.wk-pitch-accent-variant-1/,
  );
  assert.equal(
    dom.window.document
      .querySelectorAll(".wk-pitch-accent-charts polyline")[1]
      ?.getAttribute("points"),
    "12,16 36,3 60,3 80.75,3",
  );
});

test("pitch accent groups multiple patterns for one reading", async () => {
  const ojadHtml = ojadResultsHtml([
    {
      headword: "戸口",
      moras: [{ text: "と", drop: true }, { text: "ぐ" }, { text: "ち" }],
    },
    {
      headword: "戸口",
      moras: [
        { text: "と" },
        { text: "ぐ", high: true },
        { text: "ち", high: true },
      ],
    },
  ]);
  const dom = createDom(
    `
      <span class="subject-character subject-character--vocabulary" title="とぐち"></span>
      <main><section class="subject-section subject-section--reading">
        <section class="subject-section__content">
          <div class="reading-with-audio">
            <span class="reading-with-audio__reading">とぐち</span>
            <button class="reading-with-audio__audio">Play audio</button>
          </div>
        </section>
      </section></main>
    `,
    "https://www.wanikani.com/vocabulary/%E6%88%B8%E5%8F%A3",
  );

  await loadUserscript(dom, "wk-pitch-accent.js", {
    GM: {
      xmlHttpRequest({ onload }) {
        onload({
          status: 200,
          responseText: ojadHtml,
        });
      },
    },
  });

  await waitFor(() => {
    assert.ok(
      dom.window.document.querySelector(".wk-pitch-accent-charts--multiple"),
    );
  });

  const charts = dom.window.document.querySelector(
    ".wk-pitch-accent-charts--multiple",
  );
  assert.deepEqual(
    [...charts.querySelectorAll("figure")].map((figure) => ({
      characters: [
        ...figure.querySelectorAll(".wk-pitch-accent-character"),
      ].map((node) => node.textContent),
      number: figure.querySelector(".wk-pitch-accent-label-number")
        ?.textContent,
      name: figure.querySelector(".wk-pitch-accent-label-name")?.textContent,
      points: figure.querySelector("polyline")?.getAttribute("points"),
    })),
    [
      {
        characters: [],
        number: "1",
        name: "Atamadaka",
        points: "12,3 36,16 60,16 80.75,16",
      },
      {
        characters: ["と", "ぐ", "ち"],
        number: "0",
        name: "Heiban",
        points: "12,16 36,3 60,3 80.75,3",
      },
    ],
  );
  assert.deepEqual(
    [...charts.querySelectorAll("figure")].map((figure) => figure.className),
    ["wk-pitch-accent-variant-2", "wk-pitch-accent-variant-1"],
  );
  assert.ok(dom.window.document.querySelector(".reading-with-audio__audio"));
});

test("pitch accent shows a terminal drop on a virtual following particle", async () => {
  const dom = createDom(
    `
      <span class="subject-character subject-character--vocabulary" title="じ">
        <span class="subject-character__characters-text">字</span>
      </span>
      <main><section class="subject-section subject-section--reading">
        <section class="subject-section__content">
          <div class="reading-with-audio">じ</div>
        </section>
      </section></main>
    `,
    "https://www.wanikani.com/vocabulary/%E5%AD%97",
  );

  await loadUserscript(dom, "wk-pitch-accent.js", {
    GM: {
      xmlHttpRequest({ onload }) {
        onload({
          status: 200,
          responseText: ojadResultsHtml([
            {
              headword: "字",
              moras: [{ text: "じ", drop: true }],
            },
          ]),
        });
      },
    },
  });

  await waitFor(() => {
    assert.ok(dom.window.document.querySelector(".wk-pitch-accent-charts svg"));
  });

  const chart = dom.window.document.querySelector(".wk-pitch-accent-charts");
  assert.equal(
    chart.querySelector(".wk-pitch-accent-label-name")?.textContent,
    "Atamadaka",
  );
  assert.equal(
    chart.querySelector("polyline")?.getAttribute("points"),
    "12,3 33.14,14.45",
  );
  const particle = chart.querySelector(".wk-pitch-accent-particle");
  assert.equal(particle?.getAttribute("cx"), "36");
  assert.equal(particle?.getAttribute("cy"), "16");
  assert.equal(particle?.getAttribute("r"), "2.5");
  assert.equal(particle?.getAttribute("fill"), "none");
  assert.equal(particle?.getAttribute("stroke"), "currentColor");
  assert.equal(particle?.getAttribute("stroke-width"), "1.5");
  assert.deepEqual(
    [...chart.querySelectorAll("svg text")].map((node) => node.textContent),
    ["じ"],
  );
});

test("pitch accent replaces each reading beside its own audio control", async () => {
  const result = (reading, dropIndex) => ({
    headword: "日本",
    moras: [...reading].map((text, index) => ({
      text,
      drop: index === dropIndex,
    })),
  });
  const dom = createDom(
    `
      <span class="subject-character subject-character--vocabulary"></span>
      <main><section class="subject-section subject-section--reading">
        <section class="subject-section__content">
          <div class="subject-readings-with-audio">
            <div class="subject-readings-with-audio__item">
              <div class="reading-with-audio">
                <span class="reading-with-audio__reading">にほん</span>
                <button class="reading-with-audio__audio">Play にほん</button>
              </div>
            </div>
            <div class="subject-readings-with-audio__item">
              <div class="reading-with-audio">
                <span class="reading-with-audio__reading">にっぽん</span>
                <button class="reading-with-audio__audio">Play にっぽん</button>
              </div>
            </div>
          </div>
        </section>
      </section></main>
    `,
    "https://www.wanikani.com/vocabulary/%E6%97%A5%E6%9C%AC",
  );
  const originalReadings = [
    ...dom.window.document.querySelectorAll(".reading-with-audio__reading"),
  ];

  await loadUserscript(dom, "wk-pitch-accent.js", {
    GM: {
      xmlHttpRequest({ onload }) {
        onload({
          status: 200,
          responseText: ojadResultsHtml([
            result("にほん", 1),
            result("にっぽん", 2),
          ]),
        });
      },
    },
  });

  await waitFor(() => {
    assert.equal(
      dom.window.document.querySelectorAll(".wk-pitch-accent-charts figure")
        .length,
      2,
    );
  });

  const readingRow = dom.window.document.querySelector(
    ".subject-readings-with-audio",
  );
  assert.deepEqual(
    [...readingRow.children].map((element) => element.className),
    ["subject-readings-with-audio__item", "subject-readings-with-audio__item"],
  );
  assert.deepEqual(
    [...readingRow.querySelectorAll(".reading-with-audio")].map((row) =>
      [...row.children].map((element) => element.className),
    ),
    [
      ["wk-pitch-accent wk-pitch-accent-charts", "reading-with-audio__audio"],
      ["wk-pitch-accent wk-pitch-accent-charts", "reading-with-audio__audio"],
    ],
  );
  assert.deepEqual(
    originalReadings.map((reading) => [reading.isConnected, reading.className]),
    [
      [false, "reading-with-audio__reading"],
      [false, "reading-with-audio__reading"],
    ],
  );
  assert.deepEqual(
    [...readingRow.querySelectorAll(".wk-pitch-accent-charts")].map((charts) =>
      [...charts.querySelectorAll("svg text")]
        .map((node) => node.textContent)
        .join(""),
    ),
    ["にほん", "にっぽん"],
  );
  assert.deepEqual(
    [...readingRow.querySelectorAll(".wk-pitch-accent-label-number")].map(
      (number) => number.textContent,
    ),
    ["2", "3"],
  );
});

test("pitch accent inserts inside the vocabulary lesson Reading slide", async () => {
  const dom = createDom(
    `
      <div class="character-header character-header--vocabulary">
        <div class="character-header__characters" title="たべる">食べる</div>
      </div>
      <ul class="subject-slides__navigation-items">
        <li><a class="subject-slides__navigation-link" href="#meaning">Meaning</a></li>
        <li><a class="subject-slides__navigation-link" href="#reading">Reading</a></li>
        <li><a class="subject-slides__navigation-link" href="#context">Context</a></li>
      </ul>
      <div class="subject-slides__slides">
        <div class="subject-slide" id="meaning"></div>
        <div class="subject-slide" id="reading">
          <a class="subject-slide__navigation" aria-label="previous slide" href="#meaning">Previous</a>
          <div class="subject-slide__content"><div class="subject-slide__sections">
            <section class="subject-section" title="Reading"><section class="subject-section__content">
              <div class="reading-with-audio">
                <span class="reading-with-audio__reading">たべる</span>
                <button class="reading-with-audio__audio">Play audio</button>
              </div>
            </section></section>
          </div></div>
          <a class="subject-slide__navigation" aria-label="next slide" href="#context">Next</a>
        </div>
        <div class="subject-slide" id="context" hidden>
          <a class="subject-slide__navigation" aria-label="previous slide" href="#reading">Previous</a>
          <div class="subject-slide__content"><div class="subject-slide__sections"></div></div>
        </div>
      </div>
    `,
    "https://www.wanikani.com/subject-lessons/-4190889689937224551/544",
  );

  await loadUserscript(dom, "wk-pitch-accent.js", {
    GM: {
      xmlHttpRequest({ onload }) {
        onload({ status: 200, responseText: SIMPLE_TABERU_OJAD_HTML });
      },
    },
  });

  await waitFor(() => {
    assert.ok(dom.window.document.querySelector("#reading #wk-pitch-accent"));
  });

  assert.deepEqual(
    [
      ...dom.window.document.querySelector("#reading .subject-section__content")
        .children,
    ].map((element) => element.className),
    ["reading-with-audio", "wk-pitch-accent wk-pitch-accent-details"],
  );
  assert.deepEqual(
    [
      ...dom.window.document.querySelector("#reading .reading-with-audio")
        .children,
    ].map((element) => element.className),
    ["wk-pitch-accent wk-pitch-accent-charts", "reading-with-audio__audio"],
  );
  assert.notEqual(
    dom.window.getComputedStyle(
      dom.window.document.querySelector("#reading .reading-with-audio__audio"),
    ).display,
    "none",
  );

  assert.deepEqual(
    [
      ...dom.window.document.querySelectorAll(
        ".subject-slides__navigation-link",
      ),
    ].map((link) => link.textContent.trim()),
    ["Meaning", "Reading", "Context"],
  );
  assert.deepEqual(
    [...dom.window.document.querySelectorAll(".subject-slide")].map(
      (slide) => slide.id,
    ),
    ["meaning", "reading", "context"],
  );
  assert.equal(
    dom.window.document
      .querySelector('#reading [aria-label="next slide"]')
      ?.getAttribute("href"),
    "#context",
  );
  assert.equal(
    dom.window.document
      .querySelector('#context [aria-label="previous slide"]')
      ?.getAttribute("href"),
    "#reading",
  );
});

test("pitch accent replaces a kanji lesson reading", async () => {
  const dom = createDom(
    `
      <div class="character-header character-header--kanji">
        <div class="character-header__characters">村</div>
      </div>
      <div class="subject-slide" id="reading">
        <section class="subject-section" title="Readings (kun’yomi)">
          <section class="subject-section__content">
            <p class="wk-text" lang="ja">むら</p>
          </section>
        </section>
      </div>
    `,
    "https://www.wanikani.com/subject-lessons/930252633918130599/554#reading",
  );

  await loadUserscript(dom, "wk-pitch-accent.js", {
    GM: {
      xmlHttpRequest({ onload }) {
        onload({
          status: 200,
          responseText: ojadResultsHtml([
            {
              headword: "村",
              moras: [{ text: "む", drop: true }, { text: "ら" }],
            },
          ]),
        });
      },
    },
  });

  await waitFor(() => {
    assert.equal(
      dom.window.document.querySelector(
        "#reading .wk-pitch-accent-charts svg text",
      )?.textContent,
      "む",
    );
  });

  assert.equal(
    dom.window.document.querySelector("#reading .wk-pitch-accent-charts")
      ?.dataset.reading,
    "むら",
  );
  assert.ok(dom.window.document.querySelector("#reading #wk-pitch-accent"));
});

test("pitch accent waits for a revealed quiz answer and Reading item info", async () => {
  const dom = createDom(
    `
      ${quizInputHtml({ input: true })}
      <turbo-frame id="subject-info"></turbo-frame>
      <ul>
        <li><a class="additional-content__item additional-content__item--item-info"></a></li>
        <li><a class="additional-content__item additional-content__item--last-items"></a></li>
      </ul>
    `,
    "https://www.wanikani.com/subjects/review",
  );
  const controller = {
    currentSubject: {
      type: "Vocabulary",
      subject_category: "Vocabulary",
      characters: "食べる",
      readings: [{ text: "たべる", kind: "primary" }],
    },
  };
  let fetchCount = 0;

  await loadUserscript(dom, "wk-pitch-accent.js", {
    unsafeWindow: {
      ...stimulusGlobals(() => controller),
    },
    GM: {
      xmlHttpRequest({ onload }) {
        fetchCount += 1;
        onload({ status: 200, responseText: SIMPLE_TABERU_OJAD_HTML });
      },
    },
  });

  const inputContainer = dom.window.document.querySelector(
    ".quiz-input__input-container",
  );
  const frame = dom.window.document.querySelector("#subject-info");

  assert.equal(
    dom.window.document.querySelector(
      ".additional-content__item--pitch-accent",
    ),
    null,
  );
  assert.equal(fetchCount, 0);

  inputContainer.setAttribute("correct", "true");
  await flushMutationObservers();
  assert.equal(fetchCount, 0);

  frame.innerHTML = `
    <section class="subject-section subject-section--reading">
      <section class="subject-section__content">
        <section class="subject-section__subsection subject-section__subsection--reading">
          <div class="reading-with-audio">
            <span class="reading-with-audio__reading">たべる</span>
            <button class="reading-with-audio__audio">Play audio</button>
          </div>
        </section>
      </section>
    </section>
  `;
  const originalQuizReading = frame.querySelector(
    ".reading-with-audio__reading",
  );

  await waitFor(() => {
    assert.ok(
      dom.window.document.querySelector(
        "#subject-info .wk-pitch-accent-charts svg",
      ),
    );
  });

  assert.equal(fetchCount, 1);
  assert.deepEqual(
    [
      ...frame.querySelector(".subject-section__subsection--reading").children,
    ].map((element) => element.className),
    ["reading-with-audio", "wk-pitch-accent wk-pitch-accent-details"],
  );
  assert.deepEqual(
    [...frame.querySelector(".reading-with-audio").children].map(
      (element) => element.className,
    ),
    ["wk-pitch-accent wk-pitch-accent-charts", "reading-with-audio__audio"],
  );
  assert.equal(originalQuizReading.isConnected, false);
  assert.notEqual(
    dom.window.getComputedStyle(
      frame.querySelector(".reading-with-audio__audio"),
    ).display,
    "none",
  );

  inputContainer.removeAttribute("correct");

  await waitFor(() => {
    assert.equal(
      dom.window.document.querySelector("#subject-info #wk-pitch-accent"),
      null,
    );
  });
  assert.equal(frame.querySelector(".wk-pitch-accent-charts"), null);
  assert.equal(originalQuizReading.isConnected, true);
  assert.equal(
    frame.querySelector(".reading-with-audio__reading"),
    originalQuizReading,
  );
});

test("pitch accent gates lesson-quiz charts and follows vocabulary and kana Item Info", async () => {
  const readingInfo = (reading, subject) => `
    ${subject ? `<header class="item-info__header"><a data-subject-character-item-value='${JSON.stringify(subject)}'></a></header>` : ""}
    <section class="subject-section" data-name="reading">
      <section class="subject-section__content">
        <section class="subject-subsection" data-name="vocabularyReading">
          <div class="reading-with-audio">
            <div class="reading-with-audio__reading" data-reading-text>${reading}</div>
            <button class="reading-with-audio__icons">Play audio</button>
          </div>
        </section>
      </section>
    </section>
  `;
  const dom = createDom(
    `${quizInputHtml()}<div id="item-info">${readingInfo("たべる")}</div>`,
    "https://www.wanikani.com/subject-lessons/-1234567890123456789/quiz",
  );
  const controller = {
    currentSubject: {
      id: 1,
      type: "Vocabulary",
      characters: "食べる",
      readings: [{ text: "たべる", kind: "primary" }],
    },
  };
  const response = ojadResultsHtml([
    {
      headword: "食べる",
      moras: [{ text: "た" }, { text: "べ", drop: true }, { text: "る" }],
    },
    { headword: "とか", moras: [{ text: "と" }, { text: "か", high: true }] },
  ]);
  const requests = [];
  await loadUserscript(dom, "wk-pitch-accent.js", {
    ...stimulusGlobals(() => controller),
    GM: {
      xmlHttpRequest(request) {
        requests.push(request.url);
        request.onload({ status: 200, responseText: response });
      },
    },
  });
  const info = dom.window.document.querySelector("#item-info");
  const input = dom.window.document.querySelector(
    ".quiz-input__input-container",
  );
  const audio = info.querySelector("button");
  await flushMutationObservers();
  assert.equal(info.querySelector(".wk-pitch-accent"), null);
  assert.deepEqual(requests, []);

  input.setAttribute("correct", "false");
  await waitFor(() => {
    assert.match(
      info
        .querySelector(".wk-pitch-accent-charts svg")
        ?.getAttribute("aria-label") || "",
      /たべる/,
    );
  });
  assert.equal(audio.isConnected, true);

  info.innerHTML = readingInfo("にち", {
    itemId: 2,
    subjectCategory: "Kanji",
    characters: "日",
  });
  await flushMutationObservers();
  assert.equal(info.querySelector(".wk-pitch-accent"), null);
  assert.equal(info.querySelector("[data-reading-text]").textContent, "にち");

  const kana = {
    itemId: 3,
    subjectCategory: "KanaVocabulary",
    characters: "とか",
  };
  info.innerHTML = readingInfo("とか", kana);
  const kanaReading = info.querySelector("[data-reading-text]");
  await waitFor(() => {
    assert.match(
      info
        .querySelector(".wk-pitch-accent-charts svg")
        ?.getAttribute("aria-label") || "",
      /とか/,
    );
  });
  input.removeAttribute("correct");
  await waitFor(() => {
    assert.equal(info.querySelector(".wk-pitch-accent"), null);
    assert.equal(kanaReading.isConnected, true);
  });

  controller.currentSubject = {
    ...kana,
    readings: [{ text: "とか", kind: "primary" }],
  };
  info.innerHTML = readingInfo("とか");
  await flushMutationObservers();
  assert.equal(info.querySelector(".wk-pitch-accent"), null);
  input.setAttribute("correct", "true");
  await waitFor(() => {
    assert.match(
      info
        .querySelector(".wk-pitch-accent-charts svg")
        ?.getAttribute("aria-label") || "",
      /とか/,
    );
  });
});

test("pitch accent handles client-rendered review Item Info and accepted readings", async () => {
  const dom = createDom(
    `
      ${quizInputHtml({ input: true })}
      <div id="item-info" class="item-info" data-controller="subject-info"></div>
    `,
    "https://www.wanikani.com/subjects/review",
  );
  const requests = [];
  const ojadHtml = ojadResultsHtml([
    {
      headword: "角",
      moras: [{ text: "か", drop: true }, { text: "ど" }],
    },
    {
      headword: "角",
      moras: [{ text: "か", drop: true }, { text: "く" }],
    },
  ]);
  await loadUserscript(dom, "wk-pitch-accent.js", {
    ...stimulusGlobals(() => ({
      currentSubject: {
        type: "Vocabulary",
        characters: "角",
        readings: [
          { text: "かど", kind: "primary" },
          { text: "かく", kind: "alternative" },
          { text: "つの", kind: "warned" },
        ],
      },
    })),
    GM: {
      xmlHttpRequest({ url, onload }) {
        requests.push(decodeURIComponent(url));
        onload({ status: 200, responseText: ojadHtml });
      },
    },
  });
  const input = dom.window.document.querySelector(
    ".quiz-input__input-container",
  );
  const info = dom.window.document.querySelector("#item-info");
  assert.deepEqual(requests, []);

  input.setAttribute("correct", "false");
  await flushMutationObservers();
  assert.deepEqual(requests, []);

  // Current review pages populate these sections from client-side templates.
  info.innerHTML = `
    <section class="subject-section subject-section--collapsible" data-name="reading">
      <section class="subject-section__content" id="section-reading" hidden>
        <section class="subject-subsection" data-name="vocabularyReading">
          <div class="subject-subsection__content" data-content>
            <div class="subject-readings-with-audio">
              ${["かど", "かく"]
                .map(
                  (reading) => `
                <div class="subject-readings-with-audio__item">
                  <div class="reading-with-audio">
                    <div class="reading-with-audio__reading" lang="ja" data-reading-text>${reading}</div>
                    <button class="reading-with-audio__icons">Play ${reading}</button>
                  </div>
                </div>
              `,
                )
                .join("")}
            </div>
          </div>
        </section>
      </section>
    </section>
  `;
  const originals = [...info.querySelectorAll(".reading-with-audio__reading")];
  const audio = [...info.querySelectorAll("button")];
  await waitFor(() => {
    assert.equal(
      info.querySelectorAll(".wk-pitch-accent-charts svg").length,
      2,
    );
  });
  assert.deepEqual(
    [...info.querySelectorAll(".wk-pitch-accent-charts")].map(
      (chart) => chart.dataset.reading,
    ),
    ["かど", "かく"],
  );
  assert.deepEqual(
    requests.map((url) => url.split("word:")[1]),
    ["かど", "かく"],
  );
  assert.ok(audio.every((button) => button.isConnected));

  input.removeAttribute("correct");
  await waitFor(() => {
    assert.equal(info.querySelector(".wk-pitch-accent"), null);
    assert.ok(originals.every((reading) => reading.isConnected));
  });
});

test("pitch accent follows browsed vocabulary and restores the current quiz reading", async () => {
  const readingInfo = (reading, subject) => `
    ${
      subject
        ? `<header class="item-info__header">
            <a data-subject-character-item-value='${JSON.stringify(subject)}'></a>
          </header>`
        : ""
    }
    <section class="subject-section" data-name="reading">
      <section class="subject-section__content">
        <div class="reading-with-audio">
          <span class="reading-with-audio__reading" data-reading-text>${reading}</span>
          <button>Play audio</button>
        </div>
      </section>
    </section>
  `;
  const dom = createDom(
    `${quizInputHtml({ correct: "true" })}
     <turbo-frame id="subject-info">
       <div id="item-info">${readingInfo("さんかく")}</div>
     </turbo-frame>`,
    "https://www.wanikani.com/subjects/extra_study",
  );
  const info = dom.window.document.querySelector("#item-info");
  const ojadHtml = ojadResultsHtml([
    {
      headword: "三角",
      moras: [
        { text: "さ", drop: true },
        { text: "ん" },
        { text: "か" },
        { text: "く" },
      ],
    },
    {
      headword: "四角",
      moras: [
        { text: "し" },
        { text: "か", high: true },
        { text: "く", high: true },
      ],
    },
  ]);
  await loadUserscript(dom, "wk-pitch-accent.js", {
    ...stimulusGlobals(() => ({
      currentSubject: {
        id: 2836,
        type: "Vocabulary",
        characters: "三角",
        readings: [{ text: "さんかく", kind: "primary" }],
      },
    })),
    GM: {
      xmlHttpRequest({ onload }) {
        onload({ status: 200, responseText: ojadHtml });
      },
    },
  });
  await waitFor(() => {
    assert.equal(
      info.querySelector(".wk-pitch-accent-charts")?.dataset.reading,
      "さんかく",
    );
  });

  info.innerHTML = readingInfo("しかく", {
    itemId: 2837,
    characters: "四角",
    subjectCategory: "Vocabulary",
  });
  const browsedReading = info.querySelector("[data-reading-text]");
  const audio = info.querySelector("button");
  await waitFor(() => {
    assert.equal(
      info.querySelector(".wk-pitch-accent-charts")?.dataset.reading,
      "しかく",
    );
  });
  assert.equal(browsedReading.isConnected, false);
  assert.equal(audio.isConnected, true);
  assert.equal(info.textContent.includes("さんかく"), false);

  info.innerHTML = `
    <header class="item-info__header">
      <a data-subject-character-item-value='{"itemId":592,"characters":"角","subjectCategory":"Kanji"}'></a>
    </header>
    <section class="subject-section" data-name="reading">
      <section class="subject-section__content">
        <div data-kanji-reading>かく</div>
      </section>
    </section>
  `;
  await flushMutationObservers();
  assert.equal(info.querySelector(".wk-pitch-accent"), null);
  assert.equal(info.querySelector("[data-kanji-reading]").textContent, "かく");

  info.innerHTML = readingInfo("さんかく");
  await waitFor(() => {
    assert.equal(
      info.querySelector(".wk-pitch-accent-charts")?.dataset.reading,
      "さんかく",
    );
  });
});

test("pitch accent reads browsed vocabulary when the active quiz subject is kanji", async () => {
  const dom = createDom(
    `${quizInputHtml({ correct: "false" })}
     <div id="item-info">
       <header class="item-info__header">
         <a data-subject-character-item-value='{"itemId":2835,"characters":"角","subjectCategory":"Vocabulary"}'></a>
       </header>
       <section class="subject-section" data-name="reading">
         <section class="subject-section__content">
           <div class="subject-readings-with-audio">
             ${["かど", "かく"]
               .map(
                 (reading) => `
               <div class="reading-with-audio">
                 <span class="reading-with-audio__reading" data-reading-text>${reading}</span>
                 <button>Play ${reading}</button>
               </div>
             `,
               )
               .join("")}
           </div>
         </section>
       </section>
     </div>`,
    "https://www.wanikani.com/subjects/review",
  );
  const info = dom.window.document.querySelector("#item-info");
  await loadUserscript(dom, "wk-pitch-accent.js", {
    ...stimulusGlobals(() => ({
      currentSubject: { id: 592, type: "Kanji", characters: "角" },
    })),
    GM: {
      xmlHttpRequest({ onload }) {
        onload({
          status: 200,
          responseText: ojadResultsHtml([
            {
              headword: "角",
              moras: [{ text: "か", drop: true }, { text: "ど" }],
            },
            {
              headword: "角",
              moras: [{ text: "か", drop: true }, { text: "く" }],
            },
          ]),
        });
      },
    },
  });
  await waitFor(() => {
    assert.deepEqual(
      [...info.querySelectorAll(".wk-pitch-accent-charts")].map(
        (chart) => chart.dataset.reading,
      ),
      ["かど", "かく"],
    );
  });
  dom.window.document
    .querySelector(".quiz-input__input-container")
    .removeAttribute("correct");
  await waitFor(() => {
    assert.equal(info.querySelector(".wk-pitch-accent"), null);
    assert.deepEqual(
      [...info.querySelectorAll("[data-reading-text]")].map(
        (el) => el.textContent,
      ),
      ["かど", "かく"],
    );
  });
});

test("pitch accent rejects a delayed quiz lookup when the displayed subject changes in place", async () => {
  const dom = createDom(
    `${quizInputHtml({ correct: "true" })}
     <div id="item-info">
       <section class="subject-section" data-name="reading">
         <section class="subject-section__content">
           <div class="reading-with-audio">
             <span class="reading-with-audio__reading" data-reading-text>さんかく</span>
           </div>
         </section>
       </section>
     </div>`,
    "https://www.wanikani.com/subjects/extra_study",
  );
  const requests = [];
  const info = dom.window.document.querySelector("#item-info");
  const reading = info.querySelector("[data-reading-text]");
  await loadUserscript(dom, "wk-pitch-accent.js", {
    ...stimulusGlobals(() => ({
      currentSubject: {
        id: 2836,
        type: "Vocabulary",
        characters: "三角",
        readings: [{ text: "さんかく", kind: "primary" }],
      },
    })),
    ...capturedRequests(requests),
  });
  assert.equal(requests.length, 1);

  reading.textContent = "しかく";
  info.insertAdjacentHTML(
    "afterbegin",
    `
    <header class="item-info__header">
      <a data-subject-character-item-value='{"itemId":2837,"characters":"四角","subjectCategory":"Vocabulary"}'></a>
    </header>
  `,
  );
  const responseText = ojadResultsHtml([
    {
      headword: "三角",
      moras: [
        { text: "さ", drop: true },
        { text: "ん" },
        { text: "か" },
        { text: "く" },
      ],
    },
    {
      headword: "四角",
      moras: [
        { text: "し" },
        { text: "か", high: true },
        { text: "く", high: true },
      ],
    },
  ]);
  requests[0].onload({ status: 200, responseText });
  await waitFor(() => {
    assert.equal(
      decodeURIComponent(requests[1]?.url || "").split("word:")[1],
      "しかく",
    );
  });
  assert.equal(info.querySelector(".wk-pitch-accent"), null);
  assert.equal(reading.isConnected, true);
  assert.equal(reading.textContent, "しかく");

  requests[1].onload({ status: 200, responseText });
  await waitFor(() => {
    assert.equal(
      info.querySelector(".wk-pitch-accent-charts")?.dataset.reading,
      "しかく",
    );
  });
});

test("pitch accent supports recent mistakes without a last-items menu", async () => {
  const dom = createDom(
    `
      ${quizInputHtml({ input: true })}
      <turbo-frame id="subject-info">
        <section class="subject-section subject-section--reading">
          <section class="subject-section__content">
            <div class="reading-with-audio">
              <span class="reading-with-audio__reading">たべる</span>
              <button class="reading-with-audio__audio">Play audio</button>
            </div>
          </section>
        </section>
      </turbo-frame>
    `,
    "https://www.wanikani.com/recent-mistakes/376490190126789252/quiz",
  );
  let fetchCount = 0;
  await loadUserscript(dom, "wk-pitch-accent.js", {
    ...stimulusGlobals(() => ({
      currentSubject: {
        subject_category: "Vocabulary",
        characters: "食べる",
        readings: [{ text: "たべる", kind: "primary" }],
      },
    })),
    GM: {
      xmlHttpRequest({ onload }) {
        fetchCount += 1;
        onload({ status: 200, responseText: SIMPLE_TABERU_OJAD_HTML });
      },
    },
  });

  const frame = dom.window.document.querySelector("#subject-info");
  const input = dom.window.document.querySelector(
    ".quiz-input__input-container",
  );
  assert.equal(fetchCount, 0);
  assert.equal(frame.querySelector("svg"), null);

  input.setAttribute("correct", "false");
  await waitFor(() => {
    assert.ok(frame.querySelector(".wk-pitch-accent-charts svg"));
  });
  assert.equal(fetchCount, 1);

  input.removeAttribute("correct");
  await waitFor(() => {
    assert.equal(frame.querySelector(".wk-pitch-accent-charts"), null);
    assert.equal(
      frame.querySelector(".reading-with-audio__reading")?.textContent,
      "たべる",
    );
  });
});

test("pitch accent recognizes Reading item info outside review URLs", async () => {
  const ojadHtml = ojadResultsHtml([
    {
      headword: "こんにちは",
      moras: [
        { text: "こ" },
        { text: "ん", high: true },
        { text: "に", high: true },
        { text: "ち", high: true },
        { text: "は", high: true },
      ],
    },
  ]);
  const dom = createDom(
    `
      ${quizInputHtml({ correct: "true" })}
      <turbo-frame id="subject-info">
        <section class="subject-section subject-section--reading">
          <section class="subject-section__content"><div class="reading-with-audio">Reading</div></section>
        </section>
      </turbo-frame>
      ${LAST_ITEMS_MENU_HTML}
    `,
    "https://www.wanikani.com/subject-lessons/session/quiz",
  );

  await loadUserscript(dom, "wk-pitch-accent.js", {
    ...stimulusGlobals(() => ({
      currentSubject: {
        subject_category: "KanaVocabulary",
        characters: "こんにちは",
        readings: [],
      },
    })),
    GM: {
      xmlHttpRequest({ onload }) {
        onload({ status: 200, responseText: ojadHtml });
      },
    },
  });

  await waitFor(() => {
    assert.ok(
      dom.window.document.querySelector("#subject-info #wk-pitch-accent"),
    );
  });
});

test("pitch accent does not insert a stale lookup after vocabulary navigation", async () => {
  const page = (reading) => `
    <span class="subject-character subject-character--vocabulary" title="${reading}"></span>
    <nav><ul><li><a href="#context"><span class="wk-nav__item-text">Context</span></a></li></ul></nav>
    <main>
      <section class="subject-section subject-section--reading"><section class="subject-section__content">
        <div class="reading-with-audio">WaniKani reading</div>
      </section></section>
      <section class="subject-section subject-section--context"></section>
    </main>
  `;
  const result = (word, reading) =>
    ojadResultsHtml([
      {
        headword: word,
        moras: [...reading].map((text) => ({ text })),
      },
    ]);
  const dom = createDom(
    page("たべる"),
    "https://www.wanikani.com/vocabulary/%E9%A3%9F%E3%81%B9%E3%82%8B",
  );
  const requests = [];

  await loadUserscript(dom, "wk-pitch-accent.js", {
    ...capturedRequests(requests),
  });

  assert.equal(requests.length, 1);

  dom.window.history.pushState({}, "", "/vocabulary/%E9%A3%B2%E3%82%80");
  dom.window.document.body.innerHTML = page("のむ");
  requests[0].onload({ status: 200, responseText: result("食べる", "たべる") });

  await waitFor(() => {
    assert.equal(requests.length, 2);
  });

  assert.equal(dom.window.document.querySelector("#wk-pitch-accent"), null);

  requests[1].onload({ status: 200, responseText: result("飲む", "のむ") });

  await waitFor(() => {
    assert.equal(
      dom.window.document.querySelector(".wk-pitch-accent-label-name")
        ?.textContent,
      "Heiban",
    );
  });
});

test("pitch accent times out a stalled request and processes the destination page", async () => {
  const dom = createDom(
    vocabularySubjectPageHtml("たべる"),
    "https://www.wanikani.com/vocabulary/%E9%A3%9F%E3%81%B9%E3%82%8B",
  );
  const requests = [];

  await loadUserscript(dom, "wk-pitch-accent.js", capturedRequests(requests));

  assert.equal(Number.isFinite(requests[0].timeout), true);
  assert.ok(requests[0].timeout > 0);

  dom.window.history.pushState({}, "", "/vocabulary/%E9%A3%B2%E3%82%80");
  dom.window.document.body.innerHTML = vocabularySubjectPageHtml("のむ");
  requests[0].ontimeout();

  await waitFor(() => {
    assert.equal(requests.length, 2);
  });

  requests[1].onload({
    status: 200,
    responseText: ojadResultsHtml(),
  });

  await waitFor(() => {
    assert.equal(
      dom.window.document.querySelector(".wk-pitch-accent-status")?.textContent,
      "No exact OJAD pitch accent found.",
    );
  });
});

test("pitch accent omits the OJAD credit when no exact result is found", async () => {
  const dom = createDom(
    `
      <span class="subject-character subject-character--vocabulary" title="たべる"></span>
      <main><section class="subject-section subject-section--reading">
        <section class="subject-section__content"><div class="reading-with-audio">WaniKani reading</div></section>
      </section></main>
    `,
    "https://www.wanikani.com/vocabulary/%E9%A3%9F%E3%81%B9%E3%82%8B",
  );

  await loadUserscript(dom, "wk-pitch-accent.js", {
    GM: {
      xmlHttpRequest({ onload }) {
        onload({
          status: 200,
          responseText: ojadResultsHtml(),
        });
      },
    },
  });

  await waitFor(() => {
    assert.equal(
      dom.window.document.querySelector(".wk-pitch-accent-status")?.textContent,
      "No exact OJAD pitch accent found.",
    );
  });
  assert.equal(
    dom.window.document.querySelector(".wk-pitch-accent-credit"),
    null,
  );
});

test("pitch accent shows an unavailable state when OJAD fails", async () => {
  const page = `
    <span class="subject-character subject-character--vocabulary" title="たべる"></span>
    <main><section class="subject-section subject-section--reading">
      <section class="subject-section__content"><div class="reading-with-audio">WaniKani reading</div></section>
    </section></main>
  `;
  const dom = createDom(
    page,
    "https://www.wanikani.com/vocabulary/%E9%A3%9F%E3%81%B9%E3%82%8B",
  );
  let fetchCount = 0;
  dom.window.console.warn = () => {};

  await loadUserscript(dom, "wk-pitch-accent.js", {
    GM: {
      xmlHttpRequest({ onload }) {
        fetchCount += 1;
        onload({ status: 503, responseText: "Unavailable" });
      },
    },
  });

  await waitFor(() => {
    assert.equal(
      dom.window.document.querySelector(".wk-pitch-accent-status")?.textContent,
      "OJAD pitch accent is currently unavailable.",
    );
  });
  assert.equal(
    dom.window.document.querySelector(".wk-pitch-accent-credit"),
    null,
  );
  assert.equal(fetchCount, 1);
});

test("pitch accent retries an OJAD request after it fails", async () => {
  const page = `
    <span class="subject-character subject-character--vocabulary" title="たべる"></span>
    <main><section class="subject-section subject-section--reading">
      <section class="subject-section__content"><div class="reading-with-audio">WaniKani reading</div></section>
    </section></main>
  `;
  const dom = createDom(
    page,
    "https://www.wanikani.com/vocabulary/%E9%A3%9F%E3%81%B9%E3%82%8B",
  );
  let fetchCount = 0;

  await loadUserscript(dom, "wk-pitch-accent.js", {
    GM: {
      xmlHttpRequest({ onload }) {
        fetchCount += 1;
        onload({
          status: fetchCount === 1 ? 503 : 200,
          responseText: ojadResultsHtml(),
        });
      },
    },
  });

  await waitFor(() => {
    assert.equal(
      dom.window.document.querySelector(".wk-pitch-accent-status")?.textContent,
      "OJAD pitch accent is currently unavailable.",
    );
  });

  dom.window.document.body.innerHTML = page;

  await waitFor(() => {
    assert.equal(fetchCount, 2);
    assert.equal(
      dom.window.document.querySelector(".wk-pitch-accent-status")?.textContent,
      "No exact OJAD pitch accent found.",
    );
  });
});

test("pitch accent keeps only the 100 most recently used OJAD responses", async () => {
  const dom = createDom(
    vocabularySubjectPageHtml("word-0"),
    "https://www.wanikani.com/vocabulary/word-0",
  );
  const requestCounts = new Map();

  await loadUserscript(dom, "wk-pitch-accent.js", {
    GM: {
      xmlHttpRequest({ url, onload }) {
        requestCounts.set(url, (requestCounts.get(url) || 0) + 1);
        onload({
          status: 200,
          responseText: ojadResultsHtml(),
        });
      },
    },
  });

  const visit = async (word) => {
    dom.window.history.pushState({}, "", `/vocabulary/${word}`);
    dom.window.document.body.innerHTML = vocabularySubjectPageHtml(word);
    await waitFor(() => {
      assert.equal(
        dom.window.document.querySelector(".wk-pitch-accent-status")
          ?.textContent,
        "No exact OJAD pitch accent found.",
      );
    });
  };

  await waitFor(() => {
    assert.equal(requestCounts.size, 1);
  });
  for (let index = 1; index < 100; index += 1) {
    await visit(`word-${index}`);
  }

  await visit("word-0");
  await visit("word-100");
  await visit("word-1");
  await visit("word-0");

  const requestUrl = (word) =>
    `https://www.gavo.t.u-tokyo.ac.jp/ojad/search/index/word:${word}`;
  assert.equal(requestCounts.get(requestUrl("word-1")), 2);
  assert.equal(requestCounts.get(requestUrl("word-0")), 1);
});

test("pitch accent waits for the Reading row before lookup and insertion", async () => {
  const ojadHtml = SIMPLE_TABERU_OJAD_HTML;
  const dom = createDom(
    `
      <span class="subject-character subject-character--vocabulary" title="たべる"></span>
      <section class="subject-section subject-section--reading">
        <section class="subject-section__content"></section>
      </section>
    `,
    "https://www.wanikani.com/vocabulary/%E9%A3%9F%E3%81%B9%E3%82%8B",
  );
  let fetchCount = 0;

  await loadUserscript(dom, "wk-pitch-accent.js", {
    GM: {
      xmlHttpRequest({ onload }) {
        fetchCount += 1;
        onload({ status: 200, responseText: ojadHtml });
      },
    },
  });

  assert.equal(fetchCount, 0);

  const reading = dom.window.document.createElement("div");
  reading.className = "reading-with-audio";
  reading.textContent = "WaniKani reading";
  dom.window.document
    .querySelector(".subject-section__content")
    .appendChild(reading);

  await waitFor(() => {
    assert.equal(fetchCount, 1);
    assert.ok(dom.window.document.querySelector("#wk-pitch-accent"));
  });
});

test("pitch accent fits じょ without widening single-character moras", async () => {
  const ojadHtml = `<table id="word_table"><tbody><tr>
    <td class="midashi"><p class="midashi_word">工場</p></td>
    <td class="katsuyo_jisho_js"><span class="accented_word">
      <span class="mola_-4"><span class="inner"><span class="char">こ</span></span></span>
      <span class="accent_plain mola_-3"><span class="inner"><span class="char">う</span></span></span>
      <span class="accent_top mola_-2"><span class="inner"><span class="char">じ</span><span class="char">ょ</span></span></span>
      <span class="mola_-1"><span class="inner"><span class="char">う</span></span></span>
    </span></td>
  </tr></tbody></table>`;
  const dom = createDom(
    `
      <span class="subject-character subject-character--vocabulary" title="こうじょう"></span>
      <main><section class="subject-section subject-section--reading">
        <section class="subject-section__content">
          <div class="reading-with-audio">
            <span class="reading-with-audio__reading">こうじょう</span>
            <button class="reading-with-audio__audio">Play audio</button>
          </div>
        </section>
      </section></main>
    `,
    "https://www.wanikani.com/vocabulary/%E5%B7%A5%E5%A0%B4",
  );

  await loadUserscript(dom, "wk-pitch-accent.js", {
    GM: {
      xmlHttpRequest({ onload }) {
        onload({ status: 200, responseText: ojadHtml });
      },
    },
  });

  await waitFor(() => {
    assert.ok(dom.window.document.querySelector(".wk-pitch-accent-charts svg"));
  });

  assert.deepEqual(
    [
      ...dom.window.document.querySelectorAll(
        ".wk-pitch-accent-charts svg text",
      ),
    ].map((node) => node.textContent),
    ["こ", "う", "じょ", "う"],
  );
  assert.equal(
    dom.window.document.querySelector(".wk-pitch-accent-label-name")
      ?.textContent,
    "Nakadaka",
  );
  assert.equal(
    dom.window.document.querySelector(".wk-pitch-accent-label-number")
      ?.textContent,
    "3",
  );
  assert.equal(
    dom.window.document
      .querySelector(".wk-pitch-accent-charts svg")
      ?.getAttribute("viewBox"),
    "0 0 130 44",
  );
  assert.deepEqual(
    [
      ...dom.window.document.querySelectorAll(
        ".wk-pitch-accent-charts svg text",
      ),
    ].map((node) => node.getAttribute("x")),
    ["12", "36", "69", "102"],
  );
});
