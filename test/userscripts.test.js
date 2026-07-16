import { readFile } from "node:fs/promises";
import { test } from "node:test";
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
    new URL(`../${filename}`, import.meta.url),
    "utf8",
  );
  dom.window.eval(source);
}

async function loadDarkTheme(dom, matches = true) {
  await loadUserscript(dom, "wk-dark-theme.js", {
    matchMedia() {
      return {
        matches,
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
  return new JSDOM(html, {
    url,
    runScripts: "outside-only",
    pretendToBeVisual: true,
    ...options,
  });
}

const MINIMAL_KANJIVG_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 109 109">
    <path d="M10 50 L90 50"></path>
  </svg>
`;

const SIMPLE_TABERU_OJAD_HTML = `<table id="word_table"><tbody><tr>
    <td class="midashi"><p class="midashi_word">食べる・食べます</p></td>
    <td class="katsuyo_jisho_js"><span class="accented_word">
      <span><span class="char">た</span></span>
      <span class="accent_top"><span class="char">べ</span></span>
      <span><span class="char">る</span></span>
    </span></td>
  </tr></tbody></table>`;

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

test("redo answer inserts a disabled redo control before last items", async () => {
  const dom = createDom(
    `
      <div class="quiz-input">
        <div class="quiz-input__input-container">
          <input id="user-response">
        </div>
      </div>
      <ul>
        <li><a class="additional-content__item additional-content__item--item-info"></a></li>
        <li><a class="additional-content__item additional-content__item--last-items"></a></li>
      </ul>
    `,
    "https://www.wanikani.com/subjects/review",
  );

  await loadUserscript(dom, "wk-redo-answer.js");

  const redoButton = dom.window.document.querySelector(
    ".additional-content__item--redo-answer",
  );
  const lastItems = dom.window.document.querySelector(
    ".additional-content__item--last-items",
  );

  assert.ok(redoButton);
  assert.equal(redoButton.getAttribute("aria-disabled"), "true");
  assert.ok(
    redoButton.closest("li").compareDocumentPosition(lastItems.closest("li")) &
      dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
  );
});

test("redo answer does not insert a control outside quiz pages", async () => {
  const dom = createDom(
    `
      <ul>
        <li><a class="additional-content__item additional-content__item--last-items"></a></li>
      </ul>
    `,
    "https://www.wanikani.com/kanji/%E4%B8%80",
  );

  await loadUserscript(dom, "wk-redo-answer.js");

  assert.equal(
    dom.window.document.querySelector(".additional-content__item--redo-answer"),
    null,
  );
});

test("redo answer activates after navigating into a quiz page", async () => {
  const dom = createDom(
    "<main><h2>Meaning</h2></main>",
    "https://www.wanikani.com/kanji/%E4%B8%80",
  );

  await loadUserscript(dom, "wk-redo-answer.js");

  dom.window.document.body.innerHTML = `
    <div class="quiz-input">
      <div class="quiz-input__input-container">
        <input id="user-response">
      </div>
    </div>
    <ul>
      <li><a class="additional-content__item additional-content__item--last-items"></a></li>
    </ul>
  `;
  dom.window.history.pushState({}, "", "/subjects/review");

  await waitFor(() => {
    assert.ok(
      dom.window.document.querySelector(
        ".additional-content__item--redo-answer",
      ),
    );
  });
});

test("redo answer updates when WaniKani marks an answer correct", async () => {
  const dom = createDom(
    `
      <div class="quiz-input">
        <div class="quiz-input__input-container">
          <input id="user-response">
        </div>
      </div>
      <ul>
        <li><a class="additional-content__item additional-content__item--last-items"></a></li>
      </ul>
    `,
    "https://www.wanikani.com/subjects/review",
  );
  const quizQueueController = {
    submitAnswer() {},
    nextItem() {},
  };
  const controller = { quizQueueOutlet: quizQueueController };

  await loadUserscript(dom, "wk-redo-answer.js", {
    Stimulus: {
      getControllerForElementAndIdentifier() {
        return controller;
      },
    },
  });

  const redoButton = dom.window.document.querySelector(
    ".additional-content__item--redo-answer",
  );
  const inputContainer = dom.window.document.querySelector(
    ".quiz-input__input-container",
  );

  assert.equal(redoButton.getAttribute("aria-disabled"), "true");

  quizQueueController.submitAnswer("answer", { action: "pass" });
  inputContainer.setAttribute("correct", "");

  await waitFor(() => {
    assert.equal(redoButton.getAttribute("aria-disabled"), "false");
  });
});

test("redo answer unlocks item info when the answer is submitted", async () => {
  const dom = createDom(
    `
      <div class="quiz-input">
        <div class="quiz-input__input-container">
          <input id="user-response">
        </div>
      </div>
      <ul>
        <li>
          <a class="additional-content__item additional-content__item--item-info additional-content__item--disabled"></a>
        </li>
        <li><a class="additional-content__item additional-content__item--last-items"></a></li>
      </ul>
      <turbo-frame id="subject-info"></turbo-frame>
    `,
    "https://www.wanikani.com/subjects/review",
  );
  const itemInfo = dom.window.document.querySelector(
    ".additional-content__item--item-info",
  );
  const submitCalls = [];
  let answerEventCount = 0;
  const quizQueueController = {
    currentItem: { id: 42 },
    questionType: "meaning",
    stats: {
      get() {
        return {
          meaning: { complete: false, incorrect: 0 },
          reading: { complete: false, incorrect: 0 },
        };
      },
    },
    submitAnswer(answer, results) {
      submitCalls.push([answer, results]);
      dom.window.dispatchEvent(new dom.window.CustomEvent("didAnswerQuestion"));
    },
    nextItem() {},
  };
  const controller = { quizQueueOutlet: quizQueueController };

  await loadUserscript(dom, "wk-redo-answer.js", {
    Stimulus: {
      getControllerForElementAndIdentifier() {
        return controller;
      },
    },
  });

  dom.window.addEventListener("didAnswerQuestion", (event) => {
    answerEventCount += 1;
    const subjectId = event.detail.subjectWithStats.subject.id;
    itemInfo.classList.remove("additional-content__item--disabled");
    itemInfo.setAttribute("href", `/subjects/${subjectId}`);
    dom.window.document.querySelector("#subject-info").textContent =
      "Item details";
  });

  const results = { action: "pass" };
  quizQueueController.submitAnswer("answer", results);

  assert.equal(
    itemInfo.classList.contains("additional-content__item--disabled"),
    false,
  );
  assert.equal(itemInfo.getAttribute("href"), "/subjects/42");
  assert.equal(
    dom.window.document.querySelector("#subject-info").textContent,
    "Item details",
  );
  assert.deepEqual(submitCalls, []);
  assert.equal(answerEventCount, 1);

  quizQueueController.nextItem();

  assert.deepEqual(submitCalls, [["answer", results]]);
  assert.equal(answerEventCount, 1);
});

test("redo answer stays disabled when the pending-answer interface is unavailable", async () => {
  const dom = createDom(
    `
      <div class="quiz-input">
        <div class="quiz-input__input-container" correct="false">
          <input id="user-response">
        </div>
      </div>
      <ul><li><a class="additional-content__item additional-content__item--last-items"></a></li></ul>
    `,
    "https://www.wanikani.com/subjects/review",
  );

  await loadUserscript(dom, "wk-redo-answer.js", {
    Stimulus: {
      getControllerForElementAndIdentifier() {
        return {};
      },
    },
  });

  const redoButton = dom.window.document.querySelector(
    ".additional-content__item--redo-answer",
  );

  assert.equal(redoButton.getAttribute("aria-disabled"), "true");
});

test("redo answer can reset the current quiz input through the WaniKani controller", async () => {
  const dom = createDom(
    `
      <div class="quiz-input">
        <div class="quiz-input__input-container">
          <input id="user-response" value="old answer">
        </div>
      </div>
      <div class="answer-exception">Close enough</div>
      <turbo-frame id="subject-info">Subject details</turbo-frame>
      <ul>
        <li>
          <a class="additional-content__item additional-content__item--item-info additional-content__item--active"></a>
        </li>
        <li><a class="additional-content__item additional-content__item--last-items"></a></li>
      </ul>
    `,
    "https://www.wanikani.com/subjects/review",
  );
  const controller = {
    currentSubject: { id: 1 },
    currentQuestionType: "meaning",
    lastAnswer: "old answer",
    inputChars: ["o"],
    quizQueueOutlet: {
      submitAnswer() {},
      nextItem() {},
    },
    updateQuestionCalls: [],
    updateQuestion(event) {
      this.updateQuestionCalls.push(event.detail);
    },
  };

  await loadUserscript(dom, "wk-redo-answer.js", {
    Stimulus: {
      getControllerForElementAndIdentifier() {
        return controller;
      },
    },
  });

  const redoButton = dom.window.document.querySelector(
    ".additional-content__item--redo-answer",
  );
  const inputContainer = dom.window.document.querySelector(
    ".quiz-input__input-container",
  );

  controller.quizQueueOutlet.submitAnswer("old answer", { action: "pass" });
  inputContainer.setAttribute("correct", "");

  await waitFor(() => {
    assert.equal(redoButton.getAttribute("aria-disabled"), "false");
  });

  redoButton.click();

  await new Promise((resolve) => dom.window.requestAnimationFrame(resolve));

  const input = dom.window.document.querySelector("#user-response");
  assert.equal(controller.lastAnswer, null);
  assert.equal(controller.inputChars, "");
  assert.equal(controller.inputEnabled, true);
  assert.equal(controller.updateQuestionCalls.length, 1);
  assert.equal(
    controller.updateQuestionCalls[0].subject,
    controller.currentSubject,
  );
  assert.equal(
    controller.updateQuestionCalls[0].questionType,
    controller.currentQuestionType,
  );
  assert.equal(input.value, "");
  assert.equal(inputContainer.hasAttribute("correct"), false);
  assert.equal(redoButton.getAttribute("aria-disabled"), "true");
  assert.equal(
    dom.window.document.querySelector(".answer-exception").textContent,
    "",
  );
  assert.equal(
    dom.window.document.querySelector("turbo-frame#subject-info").innerHTML,
    "",
  );
});

test("redo answer commits only the replacement answer when advancing", async () => {
  const dom = createDom(
    `
      <div class="quiz-input">
        <div class="quiz-input__input-container">
          <input id="user-response">
        </div>
      </div>
      <ul>
        <li><a class="additional-content__item additional-content__item--last-items"></a></li>
      </ul>
    `,
    "https://www.wanikani.com/subjects/review",
  );
  const calls = [];
  const quizQueueController = {
    submitAnswer(answer, results) {
      calls.push(["submit", answer, results]);
    },
    nextItem(questionType) {
      calls.push(["next", questionType]);
    },
  };
  const controller = {
    currentSubject: { id: 1 },
    currentQuestionType: "meaning",
    lastAnswer: "wrong",
    inputChars: "wrong",
    quizQueueOutlet: quizQueueController,
    updateQuestion() {},
  };

  await loadUserscript(dom, "wk-redo-answer.js", {
    Stimulus: {
      getControllerForElementAndIdentifier() {
        return controller;
      },
    },
  });

  const inputContainer = dom.window.document.querySelector(
    ".quiz-input__input-container",
  );
  const redoButton = dom.window.document.querySelector(
    ".additional-content__item--redo-answer",
  );
  const firstResults = { action: "fail" };
  const replacementResults = { action: "pass" };

  quizQueueController.submitAnswer("wrong", firstResults);
  inputContainer.setAttribute("correct", "false");

  await waitFor(() => {
    assert.equal(redoButton.getAttribute("aria-disabled"), "false");
  });

  redoButton.click();
  await new Promise((resolve) => dom.window.requestAnimationFrame(resolve));

  quizQueueController.submitAnswer("correct", replacementResults);
  quizQueueController.nextItem("reading");

  assert.deepEqual(calls, [
    ["submit", "correct", replacementResults],
    ["next", "reading"],
  ]);
});

test("redo answer commits a pending answer when the page exits", async () => {
  const dom = createDom(
    `
      <div class="quiz-input">
        <div class="quiz-input__input-container"><input id="user-response"></div>
      </div>
      <ul><li><a class="additional-content__item additional-content__item--last-items"></a></li></ul>
    `,
    "https://www.wanikani.com/subjects/review",
  );
  const calls = [];
  const quizQueueController = {
    submitAnswer(answer, results) {
      calls.push([answer, results]);
    },
    nextItem() {},
  };
  const controller = {
    quizQueueOutlet: quizQueueController,
  };

  await loadUserscript(dom, "wk-redo-answer.js", {
    Stimulus: {
      getControllerForElementAndIdentifier() {
        return controller;
      },
    },
  });

  const results = { action: "pass" };
  quizQueueController.submitAnswer("answer", results);

  assert.deepEqual(calls, []);

  dom.window.dispatchEvent(new dom.window.Event("pagehide"));
  assert.deepEqual(calls, [["answer", results]]);

  dom.window.dispatchEvent(new dom.window.Event("pagehide"));
  assert.deepEqual(calls, [["answer", results]]);
});

test("redo answer commits a pending answer before Turbo navigation", async () => {
  const dom = createDom(
    `
      <div class="quiz-input">
        <div class="quiz-input__input-container"><input id="user-response"></div>
      </div>
      <ul><li><a class="additional-content__item additional-content__item--last-items"></a></li></ul>
    `,
    "https://www.wanikani.com/subjects/review",
  );
  const calls = [];
  const quizQueueController = {
    submitAnswer(answer) {
      calls.push(answer);
    },
    nextItem() {},
  };
  const controller = { quizQueueOutlet: quizQueueController };

  await loadUserscript(dom, "wk-redo-answer.js", {
    Stimulus: {
      getControllerForElementAndIdentifier() {
        return controller;
      },
    },
  });

  quizQueueController.submitAnswer("answer", { action: "pass" });
  dom.window.document.dispatchEvent(new dom.window.Event("turbo:before-visit"));

  assert.deepEqual(calls, ["answer"]);
});

test("redo answer retries a pending answer after submit fails", async () => {
  const dom = createDom(
    `
      <div class="quiz-input"><div class="quiz-input__input-container"></div></div>
      <ul><li><a class="additional-content__item additional-content__item--last-items"></a></li></ul>
    `,
    "https://www.wanikani.com/subjects/review",
  );
  const calls = [];
  let shouldFail = true;
  const quizQueueController = {
    submitAnswer(answer) {
      calls.push(["submit", answer]);
      if (shouldFail) {
        shouldFail = false;
        throw new Error("submit failed");
      }
    },
    nextItem() {
      calls.push(["next"]);
    },
  };

  await loadUserscript(dom, "wk-redo-answer.js", {
    Stimulus: {
      getControllerForElementAndIdentifier() {
        return { quizQueueOutlet: quizQueueController };
      },
    },
  });

  quizQueueController.submitAnswer("answer", { action: "pass" });

  assert.throws(() => quizQueueController.nextItem(), /submit failed/);
  quizQueueController.nextItem();

  assert.deepEqual(calls, [
    ["submit", "answer"],
    ["submit", "answer"],
    ["next"],
  ]);
});

test("redo answer restores quiz state when updating the question fails", async () => {
  const dom = createDom(
    `
      <div class="quiz-input">
        <div class="quiz-input__input-container" correct="false">
          <input id="user-response" value="wrong">
        </div>
      </div>
      <ul><li><a class="additional-content__item additional-content__item--last-items"></a></li></ul>
    `,
    "https://www.wanikani.com/subjects/review",
  );
  const calls = [];
  const originalInputChars = ["w"];
  const quizQueueController = {
    submitAnswer(answer, results) {
      calls.push([answer, results]);
    },
    nextItem() {},
  };
  const controller = {
    currentSubject: { id: 1 },
    currentQuestionType: "meaning",
    lastAnswer: "wrong",
    inputChars: originalInputChars,
    inputEnabled: false,
    quizQueueOutlet: quizQueueController,
    updateQuestion() {
      throw new Error("update failed");
    },
  };
  dom.window.console.error = () => {};

  await loadUserscript(dom, "wk-redo-answer.js", {
    Stimulus: {
      getControllerForElementAndIdentifier() {
        return controller;
      },
    },
  });

  const results = { action: "fail" };
  quizQueueController.submitAnswer("wrong", results);
  dom.window.document
    .querySelector(".quiz-input__input-container")
    .setAttribute("correct", "false");
  const redoButton = dom.window.document.querySelector(
    ".additional-content__item--redo-answer",
  );

  await waitFor(() => {
    assert.equal(redoButton.getAttribute("aria-disabled"), "false");
  });
  redoButton.click();

  assert.equal(controller.lastAnswer, "wrong");
  assert.equal(controller.inputChars, originalInputChars);
  assert.equal(controller.inputEnabled, false);
  assert.equal(
    dom.window.document
      .querySelector(".quiz-input__input-container")
      .getAttribute("correct"),
    "false",
  );

  quizQueueController.nextItem();
  assert.deepEqual(calls, [["wrong", results]]);
});

test("redo answer moves its transaction when the queue outlet changes", async () => {
  const dom = createDom(
    `
      <div class="quiz-input"><div class="quiz-input__input-container"></div></div>
      <ul><li><a class="additional-content__item additional-content__item--last-items"></a></li></ul>
    `,
    "https://www.wanikani.com/subjects/review",
  );
  const firstCalls = [];
  const secondCalls = [];
  const firstQueue = {
    submitAnswer(answer) {
      firstCalls.push(["submit", answer]);
    },
    nextItem() {
      firstCalls.push(["next"]);
    },
  };
  const secondQueue = {
    submitAnswer(answer) {
      secondCalls.push(["submit", answer]);
    },
    nextItem() {
      secondCalls.push(["next"]);
    },
  };
  const controller = { quizQueueOutlet: firstQueue };

  await loadUserscript(dom, "wk-redo-answer.js", {
    Stimulus: {
      getControllerForElementAndIdentifier() {
        return controller;
      },
    },
  });

  firstQueue.submitAnswer("first", { action: "pass" });
  controller.quizQueueOutlet = secondQueue;
  dom.window.document.body.appendChild(
    dom.window.document.createElement("div"),
  );

  await waitFor(() => {
    assert.deepEqual(firstCalls, [["submit", "first"]]);
  });

  firstQueue.submitAnswer("after uninstall", { action: "pass" });
  secondQueue.submitAnswer("second", { action: "pass" });

  assert.deepEqual(firstCalls, [
    ["submit", "first"],
    ["submit", "after uninstall"],
  ]);
  assert.deepEqual(secondCalls, []);

  secondQueue.nextItem();

  assert.deepEqual(secondCalls, [["submit", "second"], ["next"]]);
});

test("redo answer restores the old queue when flushing it during an outlet switch fails", async () => {
  const dom = createDom(
    `
      <div class="quiz-input"><div class="quiz-input__input-container"></div></div>
      <ul><li><a class="additional-content__item additional-content__item--last-items"></a></li></ul>
    `,
    "https://www.wanikani.com/subjects/review",
  );
  const calls = [];
  let shouldFail = true;
  const originalSubmitAnswer = (answer) => {
    calls.push(["submit", answer]);
    if (shouldFail) {
      shouldFail = false;
      throw new Error("submit failed");
    }
  };
  const originalNextItem = () => {
    calls.push(["next"]);
  };
  const firstQueue = {
    submitAnswer: originalSubmitAnswer,
    nextItem: originalNextItem,
  };
  const secondQueue = {
    submitAnswer() {},
    nextItem() {},
  };
  const controller = { quizQueueOutlet: firstQueue };

  await loadUserscript(dom, "wk-redo-answer.js", {
    Stimulus: {
      getControllerForElementAndIdentifier() {
        return controller;
      },
    },
  });

  firstQueue.submitAnswer("pending", { action: "pass" });
  controller.quizQueueOutlet = secondQueue;
  let thrown;
  dom.window.addEventListener("error", (event) => {
    thrown = event.error;
    event.preventDefault();
  });

  dom.window.document.dispatchEvent(new dom.window.Event("turbo:load"));

  assert.match(thrown?.message, /submit failed/);
  assert.equal(firstQueue.submitAnswer, originalSubmitAnswer);
  assert.equal(firstQueue.nextItem, originalNextItem);

  firstQueue.submitAnswer("after uninstall", { action: "pass" });
  firstQueue.nextItem();
  assert.deepEqual(calls, [
    ["submit", "pending"],
    ["submit", "after uninstall"],
    ["next"],
  ]);
});

test("redo answer reuses its transaction when the input controller changes", async () => {
  const dom = createDom(
    `
      <div class="quiz-input"><div class="quiz-input__input-container"></div></div>
      <ul><li><a class="additional-content__item additional-content__item--last-items"></a></li></ul>
    `,
    "https://www.wanikani.com/subjects/review",
  );
  const calls = [];
  const quizQueueController = {
    submitAnswer(answer) {
      calls.push(["submit", answer]);
    },
    nextItem() {
      calls.push(["next"]);
    },
  };
  let controller = { quizQueueOutlet: quizQueueController };

  await loadUserscript(dom, "wk-redo-answer.js", {
    Stimulus: {
      getControllerForElementAndIdentifier() {
        return controller;
      },
    },
  });

  quizQueueController.submitAnswer("answer", { action: "pass" });
  controller = { quizQueueOutlet: quizQueueController };
  dom.window.document.body.appendChild(
    dom.window.document.createElement("div"),
  );
  await flushMutationObservers();

  assert.deepEqual(calls, []);

  quizQueueController.nextItem();

  assert.deepEqual(calls, [["submit", "answer"], ["next"]]);
});

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
      <div class="quiz-input">
        <div class="quiz-input__input-container"></div>
      </div>
      <ul><li><a class="additional-content__item--last-items"></a></li></ul>
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
    Stimulus: {
      getControllerForElementAndIdentifier() {
        return controller;
      },
    },
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
        <div class="quiz-input"><div class="quiz-input__input-container" correct></div></div>
        <turbo-frame id="subject-info">
          <section class="subject-section subject-section--meaning" title="Meaning">
            <h2>Meaning</h2>
            <section class="subject-section__content"></section>
          </section>
        </turbo-frame>
        <ul><li><a class="additional-content__item--last-items"></a></li></ul>
      `,
      quizUrl,
    );

    stubSvgPathLength(dom);

    await loadUserscript(dom, "wk-stroke-order.js", {
      GM: {
        xmlHttpRequest({ onload }) {
          onload({ status: 200, responseText: MINIMAL_KANJIVG_SVG });
        },
      },
      Stimulus: {
        getControllerForElementAndIdentifier() {
          return {
            currentSubject: { id: 1, object: "kanji", characters: "一" },
          };
        },
      },
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
      <div class="quiz-input"><div class="quiz-input__input-container" correct="true"></div></div>
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
    GM: {
      xmlHttpRequest({ onload }) {
        onload({ status: 200, responseText: MINIMAL_KANJIVG_SVG });
      },
    },
    unsafeWindow: {
      Stimulus: {
        getControllerForElementAndIdentifier() {
          return controller;
        },
      },
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
      <div class="quiz-input">
        <div class="quiz-input__input-container" correct></div>
      </div>
      <ul><li><a class="additional-content__item--last-items"></a></li></ul>
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
    Stimulus: {
      getControllerForElementAndIdentifier() {
        return {
          currentSubject: {
            id: 2,
            object: "vocabulary",
            characters: "一つ",
          },
        };
      },
    },
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
      <div class="quiz-input"><div class="quiz-input__input-container" correct></div></div>
      <ul><li><a class="additional-content__item--last-items"></a></li></ul>
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
    GM: {
      xmlHttpRequest(request) {
        requests.push(request);
      },
    },
    Stimulus: {
      getControllerForElementAndIdentifier() {
        return controller;
      },
    },
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
      <div class="quiz-input"><div class="quiz-input__input-container" correct></div></div>
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
    GM: {
      xmlHttpRequest(request) {
        requests.push(request);
      },
    },
    Stimulus: {
      getControllerForElementAndIdentifier() {
        return controller;
      },
    },
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
    `
      <main>
        <h2>Radical Combination</h2>
        <h2>Meaning</h2>
      </main>
    `,
    "https://www.wanikani.com/kanji/%E4%B8%80",
  );
  const requests = [];
  const controller = {
    currentSubject: { id: 2, object: "kanji", characters: "二" },
  };

  stubSvgPathLength(dom);

  await loadUserscript(dom, "wk-stroke-order.js", {
    GM: {
      xmlHttpRequest(request) {
        requests.push(request);
      },
    },
    Stimulus: {
      getControllerForElementAndIdentifier() {
        return controller;
      },
    },
  });

  assert.equal(requests.length, 1);

  dom.window.history.pushState({}, "", "/subjects/review");
  dom.window.document.body.innerHTML = `
    <div class="quiz-input"><div class="quiz-input__input-container" correct></div></div>
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
  const page = `
    <nav><ul><li><a class="wk-nav__item" href="#meaning"><span class="wk-nav__item-text">Meaning</span></a></li></ul></nav>
    <main>
      <h2>Radical Combination</h2>
      <h2 id="meaning">Meaning</h2>
    </main>
  `;
  const dom = createDom(page, "https://www.wanikani.com/kanji/%E4%B8%80");
  const requests = [];

  stubSvgPathLength(dom);

  await loadUserscript(dom, "wk-stroke-order.js", {
    GM: {
      xmlHttpRequest(request) {
        requests.push(request);
      },
    },
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
    `
      <nav><ul><li><a class="wk-nav__item" href="#meaning"><span class="wk-nav__item-text">Meaning</span></a></li></ul></nav>
      <main>
        <h2>Radical Combination</h2>
        <h2 id="meaning">Meaning</h2>
      </main>
    `,
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
  const kanjiPage = `
    <nav><ul><li><a class="wk-nav__item" href="#meaning"><span class="wk-nav__item-text">Meaning</span></a></li></ul></nav>
    <main>
      <h2>Radical Combination</h2>
      <h2 id="meaning">Meaning</h2>
    </main>
  `;
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
    `
      <nav><ul><li><a class="wk-nav__item" href="#meaning"><span class="wk-nav__item-text">Meaning</span></a></li></ul></nav>
      <main>
        <h2>Radical Combination</h2>
        <h2 id="meaning">Meaning</h2>
      </main>
    `,
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
  const page = `
    <nav><ul><li><a class="wk-nav__item" href="#meaning"><span class="wk-nav__item-text">Meaning</span></a></li></ul></nav>
    <main>
      <h2>Radical Combination</h2>
      <h2 id="meaning">Meaning</h2>
    </main>
  `;
  const dom = createDom(page, "https://www.wanikani.com/kanji/%E4%B8%80");
  const requests = [];

  stubSvgPathLength(dom);
  dom.window.console.warn = () => {};

  await loadUserscript(dom, "wk-stroke-order.js", {
    GM: {
      xmlHttpRequest(request) {
        requests.push(request);
      },
    },
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

test("pitch accent silently ignores dashboard mutations", async () => {
  const messages = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("debug", (...args) => messages.push(args.join(" ")));
  const dom = createDom(
    "<main></main>",
    "https://www.wanikani.com/dashboard",
    { virtualConsole },
  );

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
    "https://www.gavo.t.u-tokyo.ac.jp/ojad/search/index/word:%E9%A3%9F%E3%81%B9%E3%82%8B",
  );
  assert.ok(
    dom.window.document.querySelector(
      ".subject-section--reading #wk-pitch-accent",
    ),
  );
  assert.equal(
    dom.window.document.querySelector(".wk-pitch-accent-charts figcaption")
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
    ["た", "べ", "る", "2"],
  );
  assert.equal(
    dom.window.document
      .querySelector(".wk-pitch-accent-charts svg")
      ?.getAttribute("viewBox"),
    "0 0 124 44",
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
    1,
  );
  const accentNumber = dom.window.document.querySelector(
    ".wk-pitch-accent-number",
  );
  const pitchFigure = dom.window.document.querySelector(
    ".wk-pitch-accent-charts figure",
  );
  const pitchCaption = pitchFigure.querySelector("figcaption");
  assert.equal(
    dom.window.getComputedStyle(accentNumber).dominantBaseline,
    "central",
  );
  assert.equal(dom.window.getComputedStyle(pitchFigure).alignItems, "flex-start");
  assert.equal(dom.window.getComputedStyle(pitchCaption).lineHeight, "16px");
  assert.equal(dom.window.getComputedStyle(pitchCaption).marginTop, "26px");
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

test("pitch accent shows all exact variants and rejects other headwords and readings", async () => {
  const accent = (word, reading, accentClasses) => `
    <tr>
      <td class="midashi"><p class="midashi_word">${word}</p></td>
      <td class="katsuyo_jisho_js"><span class="accented_word">
        ${[...reading]
          .map(
            (character, index) => `
          <span class="${accentClasses[index] || ""}"><span class="char">${character}</span></span>
        `,
          )
          .join("")}
      </span></td>
    </tr>
  `;
  const ojadHtml = `<table id="word_table"><tbody>
    ${accent("上がる・上がります", "あがる", ["", "accent_plain", "accent_plain"])}
    ${accent("上げる・上げます", "あげる", ["accent_top"])}
    ${accent("上げる・上げます", "うえげる", ["accent_top"])}
    ${accent("上げる・上げます", "あげる", ["", "accent_plain", "accent_plain"])}
  </tbody></table>`;
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
      ...dom.window.document.querySelectorAll(
        ".wk-pitch-accent-charts figcaption",
      ),
    ].map((node) => node.textContent),
    ["Atamadaka", "Heiban"],
  );
  assert.deepEqual(
    [
      ...dom.window.document.querySelectorAll(".wk-pitch-accent-charts figure"),
    ].map((figure) =>
      [...figure.querySelectorAll("text")].map((node) => node.textContent),
    ),
    [
      ["あ", "げ", "る", "1"],
      ["あ", "げ", "る", "0"],
    ],
  );
  assert.deepEqual(
    [
      ...dom.window.document.querySelectorAll(".wk-pitch-accent-charts figure"),
    ].map((figure) => figure.className),
    ["wk-pitch-accent-variant-2", "wk-pitch-accent-variant-1"],
  );
  assert.match(
    dom.window.document.querySelector("#wk-pitch-accent-style")?.textContent ||
      "",
    /html\[data-wk-dark-theme="dark"\] \.wk-pitch-accent-variant-1/,
  );
  assert.equal(
    dom.window.document
      .querySelectorAll(".wk-pitch-accent-charts polyline")[1]
      ?.getAttribute("points"),
    "12,16 36,3 60,3 80.75,3",
  );
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
          responseText: `
            <table id="word_table"><tbody><tr>
              <td><p class="midashi_word">字</p></td>
              <td class="katsuyo_jisho_js"><span class="accented_word">
                <span class="accent_top"><span class="char">じ</span></span>
              </span></td>
            </tr></tbody></table>
          `,
        });
      },
    },
  });

  await waitFor(() => {
    assert.ok(dom.window.document.querySelector(".wk-pitch-accent-charts svg"));
  });

  const chart = dom.window.document.querySelector(".wk-pitch-accent-charts");
  assert.equal(chart.querySelector("figcaption")?.textContent, "Atamadaka");
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
    ["じ", "1"],
  );
});

test("pitch accent replaces each reading beside its own audio control", async () => {
  const accent = (reading, dropIndex) => `
    <tr>
      <td class="midashi"><p class="midashi_word">日本</p></td>
      <td class="katsuyo_jisho_js"><span class="accented_word">
        ${[...reading]
          .map(
            (character, index) => `
          <span class="${index === dropIndex ? "accent_top" : ""}"><span class="char">${character}</span></span>
        `,
          )
          .join("")}
      </span></td>
    </tr>
  `;
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
          responseText: `<table id="word_table"><tbody>
            ${accent("にほん", 1)}
            ${accent("にっぽん", 2)}
          </tbody></table>`,
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
    ["にほん2", "にっぽん3"],
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
          responseText: `<table id="word_table"><tbody><tr>
            <td class="midashi"><p class="midashi_word">村</p></td>
            <td class="katsuyo_jisho_js"><span class="accented_word">
              <span class="accent_top"><span class="char">む</span></span>
              <span><span class="char">ら</span></span>
            </span></td>
          </tr></tbody></table>`,
        });
      },
    },
  });

  await waitFor(() => {
    assert.equal(
      dom.window.document
        .querySelector("#reading .wk-pitch-accent-charts svg text")
        ?.textContent,
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
      <div class="quiz-input"><div class="quiz-input__input-container"><input id="user-response"></div></div>
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
      Stimulus: {
        getControllerForElementAndIdentifier() {
          return controller;
        },
      },
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

test("pitch accent recognizes Reading item info outside review URLs", async () => {
  const ojadHtml = `<table id="word_table"><tbody><tr>
    <td class="midashi"><p class="midashi_word">こんにちは</p></td>
    <td class="katsuyo_jisho_js"><span class="accented_word">
      <span><span class="char">こ</span></span>
      <span class="accent_plain"><span class="char">ん</span></span>
      <span class="accent_plain"><span class="char">に</span></span>
      <span class="accent_plain"><span class="char">ち</span></span>
      <span class="accent_plain"><span class="char">は</span></span>
    </span></td>
  </tr></tbody></table>`;
  const dom = createDom(
    `
      <div class="quiz-input"><div class="quiz-input__input-container" correct="true"></div></div>
      <turbo-frame id="subject-info">
        <section class="subject-section subject-section--reading">
          <section class="subject-section__content"><div class="reading-with-audio">Reading</div></section>
        </section>
      </turbo-frame>
      <ul><li><a class="additional-content__item additional-content__item--last-items"></a></li></ul>
    `,
    "https://www.wanikani.com/subject-lessons/session/quiz",
  );

  await loadUserscript(dom, "wk-pitch-accent.js", {
    Stimulus: {
      getControllerForElementAndIdentifier() {
        return {
          currentSubject: {
            subject_category: "KanaVocabulary",
            characters: "こんにちは",
            readings: [],
          },
        };
      },
    },
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
  const result = (word, reading) => `<table id="word_table"><tbody><tr>
    <td class="midashi"><p class="midashi_word">${word}</p></td>
    <td class="katsuyo_jisho_js"><span class="accented_word">
      ${[...reading].map((character) => `<span><span class="char">${character}</span></span>`).join("")}
    </span></td>
  </tr></tbody></table>`;
  const dom = createDom(
    page("たべる"),
    "https://www.wanikani.com/vocabulary/%E9%A3%9F%E3%81%B9%E3%82%8B",
  );
  const requests = [];

  await loadUserscript(dom, "wk-pitch-accent.js", {
    GM: {
      xmlHttpRequest(request) {
        requests.push(request);
      },
    },
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
      dom.window.document.querySelector(".wk-pitch-accent-charts figcaption")
        ?.textContent,
      "Heiban",
    );
  });
});

test("pitch accent times out a stalled request and processes the destination page", async () => {
  const page = (reading) => `
    <span class="subject-character subject-character--vocabulary" title="${reading}"></span>
    <main><section class="subject-section subject-section--reading">
      <section class="subject-section__content"><div class="reading-with-audio">${reading}</div></section>
    </section></main>
  `;
  const dom = createDom(
    page("たべる"),
    "https://www.wanikani.com/vocabulary/%E9%A3%9F%E3%81%B9%E3%82%8B",
  );
  const requests = [];

  await loadUserscript(dom, "wk-pitch-accent.js", {
    GM: {
      xmlHttpRequest(request) {
        requests.push(request);
      },
    },
  });

  assert.equal(Number.isFinite(requests[0].timeout), true);
  assert.ok(requests[0].timeout > 0);

  dom.window.history.pushState({}, "", "/vocabulary/%E9%A3%B2%E3%82%80");
  dom.window.document.body.innerHTML = page("のむ");
  requests[0].ontimeout();

  await waitFor(() => {
    assert.equal(requests.length, 2);
  });

  requests[1].onload({
    status: 200,
    responseText: '<table id="word_table"><tbody></tbody></table>',
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
          responseText: '<table id="word_table"><tbody></tbody></table>',
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
          responseText: '<table id="word_table"><tbody></tbody></table>',
        });
      },
    },
  });

  await waitFor(() => {
    assert.equal(
      dom.window.document.querySelector(".wk-pitch-accent-status")
        ?.textContent,
      "OJAD pitch accent is currently unavailable.",
    );
  });

  dom.window.document.body.innerHTML = page;

  await waitFor(() => {
    assert.equal(fetchCount, 2);
    assert.equal(
      dom.window.document.querySelector(".wk-pitch-accent-status")
        ?.textContent,
      "No exact OJAD pitch accent found.",
    );
  });
});

test("pitch accent keeps only the 100 most recently used OJAD responses", async () => {
  const page = (word) => `
    <span class="subject-character subject-character--vocabulary" title="${word}"></span>
    <main><section class="subject-section subject-section--reading">
      <section class="subject-section__content"><div class="reading-with-audio">${word}</div></section>
    </section></main>
  `;
  const dom = createDom(
    page("word-0"),
    "https://www.wanikani.com/vocabulary/word-0",
  );
  const requestCounts = new Map();

  await loadUserscript(dom, "wk-pitch-accent.js", {
    GM: {
      xmlHttpRequest({ url, onload }) {
        requestCounts.set(url, (requestCounts.get(url) || 0) + 1);
        onload({
          status: 200,
          responseText: '<table id="word_table"><tbody></tbody></table>',
        });
      },
    },
  });

  const visit = async (word) => {
    dom.window.history.pushState({}, "", `/vocabulary/${word}`);
    dom.window.document.body.innerHTML = page(word);
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
  const ojadHtml = `<table id="word_table"><tbody><tr>
    <td class="midashi"><p class="midashi_word">食べる・食べます</p></td>
    <td class="katsuyo_jisho_js"><span class="accented_word">
      <span><span class="char">た</span></span>
      <span class="accent_top"><span class="char">べ</span></span>
      <span><span class="char">る</span></span>
    </span></td>
  </tr></tbody></table>`;
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

test("pitch accent parses moras with multiple char elements like じょ", async () => {
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
    ["こ", "う", "じょ", "う", "3"],
  );
  assert.equal(
    dom.window.document.querySelector(".wk-pitch-accent-charts figcaption")
      ?.textContent,
    "Nakadaka",
  );
});

test("dark theme follows a dark system preference by default", async () => {
  const dom = createDom("<main>Dashboard</main>", "https://www.wanikani.com/");

  await loadDarkTheme(dom);

  const toggle = dom.window.document.querySelector("#wk-dark-theme-toggle");

  assert.equal(dom.window.document.documentElement.dataset.wkDarkTheme, "dark");
  assert.equal(
    dom.window.document.documentElement.dataset.wkDarkThemeMode,
    "system",
  );
  assert.equal(toggle?.textContent.trim(), "System");
  assert.equal(
    toggle?.getAttribute("aria-label"),
    "Theme: System. Click for Dark.",
  );
});

test("dark theme defaults to system mode when storage reads fail", async () => {
  const dom = createDom("<main>Dashboard</main>", "https://www.wanikani.com/");
  Object.defineProperty(dom.window.Storage.prototype, "getItem", {
    configurable: true,
    value() {
      throw new dom.window.DOMException("Storage denied", "SecurityError");
    },
  });

  await loadDarkTheme(dom);

  assert.equal(
    dom.window.document.documentElement.dataset.wkDarkThemeMode,
    "system",
  );
  assert.equal(dom.window.document.documentElement.dataset.wkDarkTheme, "dark");
});

test("dark theme applies a selected mode when storage writes fail", async () => {
  const dom = createDom("<main>Dashboard</main>", "https://www.wanikani.com/");
  Object.defineProperty(dom.window.Storage.prototype, "setItem", {
    configurable: true,
    value() {
      throw new dom.window.DOMException("Storage denied", "SecurityError");
    },
  });

  await loadDarkTheme(dom, false);

  const root = dom.window.document.documentElement;
  const toggle = dom.window.document.querySelector("#wk-dark-theme-toggle");
  toggle.click();

  assert.equal(root.dataset.wkDarkThemeMode, "dark");
  assert.equal(root.dataset.wkDarkTheme, "dark");
  assert.equal(toggle.textContent.trim(), "Dark");
});

test("dark theme toggle stays in the lower-left corner in light mode", async () => {
  const dom = createDom("<main>Dashboard</main>", "https://www.wanikani.com/");

  await loadDarkTheme(dom, false);

  const toggle = dom.window.document.querySelector("#wk-dark-theme-toggle");
  const toggleStyle = dom.window.getComputedStyle(toggle);

  assert.equal(toggleStyle.bottom, "16px");
  assert.equal(toggleStyle.left, "16px");
  assert.equal(toggleStyle.right, "auto");
});

test("dark theme toggle cycles through and persists manual overrides", async () => {
  const dom = createDom("<main>Dashboard</main>", "https://www.wanikani.com/");

  await loadDarkTheme(dom, false);

  const root = dom.window.document.documentElement;
  const toggle = dom.window.document.querySelector("#wk-dark-theme-toggle");

  toggle.click();
  assert.equal(root.dataset.wkDarkThemeMode, "dark");
  assert.equal(root.dataset.wkDarkTheme, "dark");
  assert.equal(toggle.textContent.trim(), "Dark");
  assert.equal(dom.window.localStorage.getItem("wk-dark-theme-mode"), "dark");

  toggle.click();
  assert.equal(root.dataset.wkDarkThemeMode, "light");
  assert.equal(root.dataset.wkDarkTheme, "light");
  assert.equal(toggle.textContent.trim(), "Light");
  assert.equal(dom.window.localStorage.getItem("wk-dark-theme-mode"), "light");

  toggle.click();
  assert.equal(root.dataset.wkDarkThemeMode, "system");
  assert.equal(root.dataset.wkDarkTheme, "light");
  assert.equal(toggle.textContent.trim(), "System");
  assert.equal(dom.window.localStorage.getItem("wk-dark-theme-mode"), "system");
});

test("dark theme restores a saved override instead of the system preference", async () => {
  const dom = createDom("<main>Dashboard</main>", "https://www.wanikani.com/");
  dom.window.localStorage.setItem("wk-dark-theme-mode", "light");

  await loadDarkTheme(dom);

  const root = dom.window.document.documentElement;
  const toggle = dom.window.document.querySelector("#wk-dark-theme-toggle");

  assert.equal(root.dataset.wkDarkThemeMode, "light");
  assert.equal(root.dataset.wkDarkTheme, "light");
  assert.equal(toggle.textContent.trim(), "Light");
});

test("dark theme restores its control after Turbo replaces the page body", async () => {
  const dom = createDom("<main>Dashboard</main>", "https://www.wanikani.com/");

  await loadDarkTheme(dom);

  dom.window.document.body.innerHTML = "<main>Kanji</main>";
  dom.window.document.dispatchEvent(new dom.window.Event("turbo:load"));

  assert.equal(
    dom.window.document.querySelectorAll("#wk-dark-theme-toggle").length,
    1,
  );
  assert.equal(
    dom.window.document.querySelectorAll("#wk-dark-theme-styles").length,
    1,
  );
  assert.equal(dom.window.document.documentElement.dataset.wkDarkTheme, "dark");
});

test("dark theme applies at document start and adds its control when the body arrives", async () => {
  const dom = createDom("<main>Dashboard</main>", "https://www.wanikani.com/");
  dom.window.document.body.remove();

  await loadDarkTheme(dom);

  assert.equal(dom.window.document.documentElement.dataset.wkDarkTheme, "dark");
  assert.equal(
    dom.window.document.querySelector("#wk-dark-theme-toggle"),
    null,
  );

  dom.window.document.documentElement.append(
    dom.window.document.createElement("body"),
  );
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));

  assert.ok(dom.window.document.querySelector("#wk-dark-theme-toggle"));
});

test("dark theme uses the Catppuccin Mocha palette", async () => {
  const dom = createDom("<main>Dashboard</main>", "https://www.wanikani.com/");

  await loadDarkTheme(dom);

  assertCustomProperties(dom, dom.window.document.documentElement, {
    "--wk-dark-background": "#1e1e2e",
    "--wk-dark-surface": "#181825",
    "--wk-dark-surface-raised": "#313244",
    "--wk-dark-surface-hover": "#45475a",
    "--wk-dark-border": "#585b70",
    "--wk-dark-text": "#cdd6f4",
    "--wk-dark-text-muted": "#a6adc8",
    "--color-link": "#89b4fa",
  });
});

test("dark theme adds Catppuccin accents to browser interaction states", async () => {
  const dom = createDom(
    '<a href="/subjects">Subjects</a><input value="search">',
    "https://www.wanikani.com/",
  );

  await loadDarkTheme(dom);

  const root = dom.window.document.documentElement;
  const styles = dom.window.document.querySelector(
    "#wk-dark-theme-styles",
  ).textContent;

  assertCustomProperties(dom, root, {
    "--ctp-mocha-rosewater": "#f5e0dc",
    "--ctp-mocha-lavender": "#b4befe",
    "--ctp-mocha-overlay-2": "#9399b2",
    "--color-quiz-input-focus": "#b4befe",
    "--color-modal-button-edge": "#6c7086",
  });
  assert.match(styles, /::selection[^}]+--ctp-mocha-overlay-2/s);
  assert.match(styles, /input,[^{]+textarea,[^{]+select[^}]+caret-color:[^;]+--ctp-mocha-rosewater/s);
  assert.doesNotMatch(styles, /a:visited[^}]+--ctp-mocha-lavender/s);
  assert.match(styles, /:focus-visible[^}]+--ctp-mocha-lavender/s);
});

test("dark theme replaces light quiz chrome with Mocha surfaces", async () => {
  const dom = createDom(
    `<style>
      .quiz-input__question-type-container { background: #eee; color: #555; }
      .additional-content__item { background: #fbfbfb; color: #999; }
      .additional-content__item--disabled { background: #f5f5f5; color: #c3c3c3; }
      .additional-content__item--active { background: #a2a2a2; color: #eee; }
    </style>
    <div class="quiz-input__question-type-container" data-question-type="meaning">Meaning</div>
    <div class="quiz-input__question-type-container" data-question-type="reading">Reading</div>
    <a class="additional-content__item">Last 10</a>
    <a class="additional-content__item additional-content__item--disabled">Item Info</a>
    <a class="additional-content__item additional-content__item--active">Kana Chart</a>`,
    "https://www.wanikani.com/subjects/review",
  );

  await loadDarkTheme(dom);

  const [meaning, reading] = dom.window.document.querySelectorAll(
    ".quiz-input__question-type-container",
  );
  const [item, disabledItem, activeItem] = dom.window.document.querySelectorAll(
    ".additional-content__item",
  );

  assert.equal(
    dom.window.getComputedStyle(meaning).backgroundColor,
    "var(--wk-dark-surface-raised)",
  );
  assert.equal(
    dom.window.getComputedStyle(reading).backgroundColor,
    "var(--wk-dark-surface)",
  );
  assert.equal(
    dom.window.getComputedStyle(item).backgroundColor,
    "var(--wk-dark-surface-raised)",
  );
  assert.equal(
    dom.window.getComputedStyle(disabledItem).backgroundColor,
    "var(--wk-dark-surface)",
  );
  assert.equal(
    dom.window.getComputedStyle(activeItem).backgroundColor,
    "var(--ctp-mocha-overlay-0)",
  );
});

test("dark theme uses deliberate quiz input borders without light shadows", async () => {
  const dom = createDom(
    `<style>
      .quiz-input__input { border: 2px solid transparent; box-shadow: 2px 2px 0 #fff; }
      .quiz-input__input:focus { border-color: #b4befe; }
    </style>
    <div class="quiz-input__input-container" correct="true">
      <input class="quiz-input__input">
    </div>
    <div class="quiz-input__input-container" correct="false">
      <input class="quiz-input__input">
    </div>
    <div class="quiz-input__input-container">
      <input class="quiz-input__input">
    </div>`,
    "https://www.wanikani.com/subjects/review",
  );

  await loadDarkTheme(dom);

  const inputs = dom.window.document.querySelectorAll(".quiz-input__input");

  for (const [index, input] of inputs.entries()) {
    input.focus();
    assert.equal(
      dom.window.getComputedStyle(input).borderColor,
      [
        "rgb(166, 227, 161)",
        "rgba(0, 0, 0, 0)",
        "rgb(180, 190, 254)",
      ][index],
    );
    assert.equal(dom.window.getComputedStyle(input).boxShadow, "none");
  }
});

test("dark theme uses Mocha colors for correct quiz answers", async () => {
  const dom = createDom(
    `<style>
      :root {
        --color-white: #fff;
        --color-quiz-correct-background: #88cc00;
        --color-quiz-correct-text-color: var(--color-white);
      }
    </style>
    <div class="quiz-input__input-container" correct="true">
      <input class="quiz-input__input" value="foot">
      <button class="quiz-input__submit-button">Next</button>
    </div>`,
    "https://www.wanikani.com/subjects/review",
  );

  await loadDarkTheme(dom);

  const root = dom.window.document.documentElement;

  assertCustomProperties(dom, root, {
    "--color-quiz-correct-background":
      "color-mix(in srgb,var(--ctp-mocha-green) 18%,var(--wk-dark-surface))",
    "--color-quiz-correct-text-color": "#cdd6f4",
  });
});

test("dark theme replaces light Extra Study controls with Mocha colors", async () => {
  const dom = createDom(
    `<style>
      :root {
        --color-extra-study-button-background: #f4f4f4;
        --color-extra-study-button-hover-background: #e7e9eb;
        --color-extra-study-button-active-background: #cad0d6;
        --color-extra-study-button-disabled-background: #f4f4f4;
        --color-extra-study-button-border: #cad0d6;
        --color-extra-study-button-text: #333;
        --color-extra-study-button-icon: #6b7079;
        --color-extra-study-button-remaining-text: #6b7079;
        --color-focus: #00aaff;
      }
    </style>
    <a class="extra-study-multi-button-widget__button">Recent Lessons</a>`,
    "https://www.wanikani.com/dashboard",
  );

  await loadDarkTheme(dom);

  const root = dom.window.document.documentElement;
  const expected = {
    "--color-extra-study-button-background": "#313244",
    "--color-extra-study-button-hover-background": "#45475a",
    "--color-extra-study-button-active-background": "#585b70",
    "--color-extra-study-button-disabled-background": "#181825",
    "--color-extra-study-button-border": "#585b70",
    "--color-extra-study-button-text": "#cdd6f4",
    "--color-extra-study-button-icon": "#a6adc8",
    "--color-extra-study-button-remaining-text": "#a6adc8",
    "--color-focus": "#b4befe",
  };

  assertCustomProperties(dom, root, expected);
});

test("dark theme replaces light collocation pattern backgrounds", async () => {
  const dom = createDom(
    `<style>
      .subject-collocations__pattern-name { background-color: #e0e0e0; }
    </style>
    <div class="subject-collocations">
      <a class="subject-collocations__pattern-name" aria-selected="true">〜の字</a>
      <a class="subject-collocations__pattern-name" aria-selected="false">字を〜</a>
    </div>`,
    "https://www.wanikani.com/vocabulary/%E5%AD%97",
  );

  await loadDarkTheme(dom);

  const patterns = dom.window.document.querySelectorAll(
    ".subject-collocations__pattern-name",
  );

  assert.equal(
    dom.window.getComputedStyle(patterns[0]).backgroundColor,
    "var(--wk-dark-surface-raised)",
  );
  assert.equal(
    dom.window.getComputedStyle(patterns[1]).backgroundColor,
    "var(--wk-dark-surface)",
  );
});

test("dark theme keeps mnemonic highlights readable", async () => {
  const dom = createDom(
    `<style>
      :root {
        --color-text-highlight-radical-background: var(--color-blue-light);
        --color-text-highlight-radical-text: var(--color-blue-dark);
        --color-text-highlight-kanji-background: var(--color-pink-light);
        --color-text-highlight-kanji-text: var(--color-pink-dark);
        --color-text-highlight-vocabulary-background: var(--color-purple-light);
        --color-text-highlight-vocabulary-text: var(--color-purple-dark);
        --color-text-highlight-meaning-background: #cad0d6;
        --color-text-highlight-meaning-text: #333;
        --color-text-highlight-reading-background: #cad0d6;
        --color-text-highlight-reading-text: #333;
      }
    </style>`,
    "https://www.wanikani.com/subject-lessons/4357587608669614620/549",
  );

  await loadDarkTheme(dom);

  const root = dom.window.document.documentElement;
  const expected = {
    "--color-text-highlight-radical-text": "#89b4fa",
    "--color-text-highlight-radical-background":
      "color-mix(in srgb,var(--ctp-mocha-blue) 12%,var(--wk-dark-surface-raised))",
    "--color-text-highlight-kanji-text": "#f5c2e7",
    "--color-text-highlight-kanji-background":
      "color-mix(in srgb,var(--ctp-mocha-pink) 12%,var(--wk-dark-surface-raised))",
    "--color-text-highlight-vocabulary-text": "#cba6f7",
    "--color-text-highlight-vocabulary-background":
      "color-mix(in srgb,var(--ctp-mocha-mauve) 12%,var(--wk-dark-surface-raised))",
    "--color-text-highlight-meaning-text": "#cdd6f4",
    "--color-text-highlight-meaning-background": "#313244",
    "--color-text-highlight-reading-text": "#cdd6f4",
    "--color-text-highlight-reading-background": "#313244",
  };

  assertCustomProperties(dom, root, expected);
});

test("dark theme keeps lesson queue subject labels readable", async () => {
  const dom = createDom(
    `<style>
      .subject-character--radical .subject-character__characters-text {
        color: var(--color-blue-dark);
        background: var(--color-blue);
      }
      .subject-character--kanji .subject-character__characters-text {
        color: var(--color-pink-dark);
        background: var(--color-pink);
      }
      .subject-character--vocabulary .subject-character__characters-text {
        color: var(--color-purple-dark);
        background: var(--color-purple);
      }
      .subject-character--recent.subject-character--radical .subject-character__characters-text {
        background: var(--color-blue-light);
      }
      .subject-character--recent.subject-character--kanji .subject-character__characters-text {
        background: var(--color-pink-light);
      }
      .subject-character--recent.subject-character--vocabulary .subject-character__characters-text {
        background: var(--color-purple-light);
      }
      .subject-character--locked .subject-character__characters-text {
        background: transparent;
      }
      .subject-character--unlocked .subject-character__characters-text,
      .subject-character--passed .subject-character__characters-text {
        color: #fff;
      }
      .subject-character--burned .subject-character__characters-text {
        color: #fff;
        background: #6b7079;
      }
    </style>
    <div class="lesson-container__queue">
      <a class="subject-character subject-character--tiny subject-character--radical subject-character--recent"><span class="subject-character__characters-text">Radical</span></a>
      <a class="subject-character subject-character--tiny subject-character--kanji subject-character--recent"><span class="subject-character__characters-text">Kanji</span></a>
      <a class="subject-character subject-character--tiny subject-character--vocabulary subject-character--recent"><span class="subject-character__characters-text">Vocabulary</span></a>
      <a class="subject-character subject-character--tiny subject-character--radical subject-character--passed"><span class="subject-character__characters-text">Radical</span></a>
      <a class="subject-character subject-character--tiny subject-character--kanji subject-character--passed"><span class="subject-character__characters-text">Kanji</span></a>
      <a class="subject-character subject-character--tiny subject-character--vocabulary subject-character--passed"><span class="subject-character__characters-text">Vocabulary</span></a>
      <a class="subject-character subject-character--tiny subject-character--radical subject-character--locked"><span class="subject-character__characters-text">Radical</span></a>
      <a class="subject-character subject-character--tiny subject-character--kanji subject-character--locked"><span class="subject-character__characters-text">Kanji</span></a>
      <a class="subject-character subject-character--tiny subject-character--vocabulary subject-character--locked"><span class="subject-character__characters-text">Vocabulary</span></a>
      <a class="subject-character subject-character--tiny subject-character--radical subject-character--burned"><span class="subject-character__characters-text">Burned</span></a>
    </div>`,
    "https://www.wanikani.com/subject-lessons/4357587608669614620/549",
  );

  await loadDarkTheme(dom);

  for (const [category, accent] of [
    ["radical", "blue"],
    ["kanji", "pink"],
    ["vocabulary", "mauve"],
  ]) {
    for (const state of ["recent", "passed"]) {
      const styles = dom.window.getComputedStyle(
        dom.window.document.querySelector(
          `.subject-character--${category}.subject-character--${state} .subject-character__characters-text`,
        ),
      );
      assert.equal(styles.color, "var(--ctp-mocha-crust)");
      if (state === "recent") {
        assert.equal(styles.backgroundColor, `var(--ctp-mocha-${accent})`);
      }
    }

    assert.equal(
      dom.window.getComputedStyle(
        dom.window.document.querySelector(
          `.subject-character--${category}.subject-character--locked .subject-character__characters-text`,
        ),
      ).color,
      `var(--ctp-mocha-${accent})`,
    );
  }

  const burned = dom.window.getComputedStyle(
    dom.window.document.querySelector(
      ".subject-character--burned .subject-character__characters-text",
    ),
  );
  assert.equal(burned.color, "var(--ctp-mocha-text)");
  assert.equal(burned.backgroundColor, "var(--ctp-mocha-surface-2)");
});

test("dark theme replaces the light subject lesson slide", async () => {
  const dom = createDom(
    `<style>
      .subject-slide {
        background-color: #fafafa;
        border: 2px solid #d4d4d4;
        box-shadow: 2px 2px 4px #e3e3e3;
      }
    </style>
    <div class="subject-slides">
      <section class="subject-slide">Lesson content</section>
    </div>`,
    "https://www.wanikani.com/subject-lessons/920088919089344908/95",
  );

  await loadDarkTheme(dom);

  const slide = dom.window.document.querySelector(".subject-slide");
  const slideStyles = dom.window.getComputedStyle(slide);

  assert.equal(slideStyles.backgroundColor, "var(--wk-dark-surface)");
});

test("dark theme uses Mocha teal for the lesson Quiz button", async () => {
  const dom = createDom(
    `<style>
      :root {
        --color-button-quiz-background: #34d399;
        --color-button-quiz-border: #23a375;
        --color-button-quiz-edge: #23a375;
        --color-button-quiz-text: #fff;
      }
      .lesson-modal__buttons {
        --color-button-border: #000;
        --color-button-edge: #000;
      }
    </style>
    <div class="lesson-modal__buttons">
      <button class="wk-button wk-button--quiz">
        <span class="wk-button__content">Quiz</span>
        <span class="wk-button__edge"></span>
      </button>
    </div>`,
    "https://www.wanikani.com/subject-lessons/920088919089344908/95",
  );

  await loadDarkTheme(dom);

  const button = dom.window.document.querySelector(".wk-button--quiz");
  const expected = {
    "--color-button-background": "#94e2d5",
    "--color-button-hover-background": "#94e2d5",
    "--color-button-active-background":
      "color-mix(in srgb,var(--ctp-mocha-teal) 80%,var(--ctp-mocha-crust))",
    "--color-button-border":
      "color-mix(in srgb,var(--ctp-mocha-teal) 65%,var(--ctp-mocha-crust))",
    "--color-button-edge":
      "color-mix(in srgb,var(--ctp-mocha-teal) 65%,var(--ctp-mocha-crust))",
    "--color-button-text": "#11111b",
    "--color-button-icon": "#11111b",
    "--color-button-hover-icon": "#11111b",
    "--color-button-active-icon": "#11111b",
    "--button-outline": "#94e2d5",
  };

  assertCustomProperties(dom, button, expected);
});

test("dark theme colors lesson and quiz headers by subject category", async () => {
  const dom = createDom(
    `<style>
      .character-header--radical, .quiz-header--radical {
        background-color: #00aaff;
        background-image: linear-gradient(to bottom, #00aaff, #0093dd);
      }
      .character-header--kanji, .quiz-header--kanji {
        background-color: #ff00aa;
        background-image: linear-gradient(to bottom, #ff00aa, #dd0093);
      }
      .character-header--vocabulary, .quiz-header--vocabulary {
        background-color: #aa00ff;
        background-image: linear-gradient(to bottom, #aa00ff, #9300dd);
      }
    </style>
    <header class="character-header character-header--radical"></header>
    <header class="character-header character-header--kanji"></header>
    <header class="character-header character-header--vocabulary"></header>
    <header class="quiz-header quiz-header--radical"></header>
    <header class="quiz-header quiz-header--kanji"></header>
    <header class="quiz-header quiz-header--vocabulary"></header>`,
    "https://www.wanikani.com/subject-lessons/920088919089344908/95",
  );

  await loadDarkTheme(dom);

  for (const [category, color] of [
    ["radical", "var(--color-radical)"],
    ["kanji", "var(--color-kanji)"],
    ["vocabulary", "var(--color-vocabulary)"],
  ]) {
    for (const header of dom.window.document.querySelectorAll(
      `.character-header--${category}, .quiz-header--${category}`,
    )) {
      const headerStyles = dom.window.getComputedStyle(header);
      assert.equal(headerStyles.backgroundColor, color);
      assert.equal(headerStyles.backgroundImage, "none");
    }
  }
});

test("dark theme replaces the light review item info background", async () => {
  const dom = createDom(
    `<style>
      .subject-info { background-color: #fafafa; }
    </style>
    <turbo-frame class="subject-info" id="subject-info">
      <section class="subject-section">Item information</section>
    </turbo-frame>`,
    "https://www.wanikani.com/subjects/review",
  );

  await loadDarkTheme(dom);

  const itemInfo = dom.window.document.querySelector("#subject-info");

  assert.equal(
    dom.window.getComputedStyle(itemInfo).backgroundColor,
    "var(--wk-dark-surface)",
  );
});

test("dark theme keeps sitemap section headers readable", async () => {
  const dom = createDom(
    `<style>
      :root { --color-global-header-background: #fff; }
      .sitemap__section-header { color: #333; }
    </style>
    <header class="global-header">
      <button class="sitemap__section-header">Levels</button>
    </header>`,
    "https://www.wanikani.com/",
  );

  await loadDarkTheme(dom);

  const root = dom.window.document.documentElement;
  const sectionHeader = dom.window.document.querySelector(
    ".sitemap__section-header",
  );
  const computedColor = dom.window.getComputedStyle(sectionHeader).color;
  const foreground = parseColor(
    computedColor.startsWith("var(")
      ? resolveCustomProperty(
          dom,
          sectionHeader,
          computedColor.slice(4, -1),
        )
      : computedColor,
  );
  const background = parseColor(
    resolveCustomProperty(
      dom,
      root,
      "--color-global-header-background",
    ),
  );

  assert.ok(contrastRatio(foreground, background) >= 4.5);
});

test("dark theme gives generic sitemap headers visible interaction borders", async () => {
  const dom = createDom(
    `<header class="global-header">
      <button class="sitemap__section-header">Levels</button>
      <button class="sitemap__section-header">Help</button>
      <button class="sitemap__section-header sitemap__section-header--radicals">Radicals</button>
    </header>`,
    "https://www.wanikani.com/recent-unlocks",
  );

  await loadDarkTheme(dom);

  const styles = dom.window.document.querySelector(
    "#wk-dark-theme-styles",
  ).textContent;

  assert.match(
    styles,
    /\.sitemap__section-header:not\([^}]+:hover\s*\{[^}]*border-color:\s*var\(--ctp-mocha-overlay-1\)/s,
  );
  assert.match(
    styles,
    /\.sitemap__section-header:not\([^}]+:focus\s*\{[^}]*border-color:\s*var\(--ctp-mocha-lavender\)/s,
  );
});

test("dark theme colors category sitemap headers and menus", async () => {
  const dom = createDom(
    `<style>
      :root {
        --color-radical: #00aaff;
        --color-kanji: #ff00aa;
        --color-vocabulary: #aa00ff;
      }
      .sitemap__expandable-chunk--radicals { background: #00aaff; }
      .sitemap__expandable-chunk--kanji { background: #ff00aa; }
      .sitemap__expandable-chunk--vocabulary { background: #aa00ff; }
    </style>
    <header class="global-header">
      <div class="sitemap__section sitemap__section--open">
        <button class="sitemap__section-header sitemap__section-header--radicals">Radicals</button>
        <div class="sitemap__expandable-chunk sitemap__expandable-chunk--radicals"></div>
      </div>
      <div class="sitemap__section sitemap__section--open">
        <button class="sitemap__section-header sitemap__section-header--kanji">Kanji</button>
        <div class="sitemap__expandable-chunk sitemap__expandable-chunk--kanji"></div>
      </div>
      <div class="sitemap__section sitemap__section--open">
        <button class="sitemap__section-header sitemap__section-header--vocabulary">Vocabulary</button>
        <div class="sitemap__expandable-chunk sitemap__expandable-chunk--vocabulary"></div>
      </div>
    </header>`,
    "https://www.wanikani.com/recent-unlocks",
  );

  await loadDarkTheme(dom);

  const styles = dom.window.document.querySelector(
    "#wk-dark-theme-styles",
  ).textContent;

  const accents = {
    radicals: "radical",
    kanji: "kanji",
    vocabulary: "vocabulary",
  };

  for (const [category, accent] of Object.entries(accents)) {
    assert.match(
      styles,
      new RegExp(
        `sitemap__section-header--${category}:hover[^}]+border-color:[^;]+--color-${accent}[^}]+color:[^;]+--color-${accent}`,
        "s",
      ),
    );
    assert.match(
      styles,
      new RegExp(
        `sitemap__section--open[^,{]+sitemap__section-header--${category}[^}]+border-color:[^;]+--color-${accent}[^}]+color:[^;]+--color-${accent}`,
        "s",
      ),
    );
    assert.equal(
      dom.window.getComputedStyle(
        dom.window.document.querySelector(
          `.sitemap__expandable-chunk--${category}`,
        ),
      ).background,
      `var(--color-${accent})`,
    );
    assert.match(
      styles,
      new RegExp(
        `sitemap__expandable-chunk--${category}:before[^}]+background:[^;]+--color-${accent}`,
        "s",
      ),
    );
  }
});

test("dark theme keeps completed lesson and review widgets readable", async () => {
  const dom = createDom(
    `<style>
      :root {
        --color-widget-background: #fff;
        --color-widget-primary-text: #333;
        --color-widget-secondary-text: #6b7079;
      }
      .todays-lessons-widget--complete,
      .reviews-widget--complete {
        --color-widget-background: #e8ecf0;
      }
    </style>
    <section class="todays-lessons-widget--complete">
      <h2>Today's Lessons</h2>
    </section>
    <section class="reviews-widget--complete">
      <h2>Reviews</h2>
    </section>`,
    "https://www.wanikani.com/",
  );

  await loadDarkTheme(dom);

  for (const widget of dom.window.document.querySelectorAll(
    ".todays-lessons-widget--complete, .reviews-widget--complete",
  )) {
    const foreground = parseColor(
      resolveCustomProperty(dom, widget, "--color-widget-primary-text"),
    );
    const background = parseColor(
      resolveCustomProperty(dom, widget, "--color-widget-background"),
    );

    assert.ok(contrastRatio(foreground, background) >= 4.5);
  }
});

test("dark theme keeps review forecast header text readable", async () => {
  const dom = createDom(
    `<style>
      :root {
        --color-widget-primary-text: #333;
        --color-widget-secondary-text: #6b7079;
        --color-review-forecast-header-background: #e7e9eb;
      }
      .review-forecast-widget--50.review-forecast-widget:not(.review-forecast-widget--loading) {
        --color-review-forecast-header-background: #d2e8ff;
      }
    </style>
    <section class="review-forecast-widget review-forecast-widget--50">
      <header class="review-forecast-widget__header">
        <div class="review-forecast-widget__header-text">Next 24 Hours:</div>
        <div class="review-forecast-widget__header-count">+46 Items</div>
      </header>
    </section>`,
    "https://www.wanikani.com/",
  );

  await loadDarkTheme(dom);

  const header = dom.window.document.querySelector(
    ".review-forecast-widget__header",
  );
  const background = parseColor(
    resolveCustomProperty(
      dom,
      header,
      "--color-review-forecast-header-background",
    ),
  );

  for (const property of [
    "--color-widget-primary-text",
    "--color-widget-secondary-text",
  ]) {
    const foreground = parseColor(
      resolveCustomProperty(dom, header, property),
    );

    assert.ok(contrastRatio(foreground, background) >= 4.5);
  }
});

test("dark theme uses Mocha surfaces for review forecast row interactions", async () => {
  const dom = createDom(
    `<style>
      :root {
        --color-review-forecast-day-hover: #f4f4f4;
        --color-review-forecast-day-active: #e7e9eb;
      }
    </style>
    <a class="review-forecast-widget__row" href="/review/session">Today</a>`,
    "https://www.wanikani.com/dashboard",
  );

  await loadDarkTheme(dom);

  const row = dom.window.document.querySelector(
    ".review-forecast-widget__row",
  );

  assertCustomProperties(dom, row, {
    "--color-review-forecast-day-hover": "#45475a",
    "--color-review-forecast-day-active": "#585b70",
  });
});

test("dark theme uses Mocha colors for dashboard progress bars", async () => {
  const dom = createDom(
    `<style>
      :root {
        --color-review-forecast-bar-positive: #35a753;
        --color-review-forecast-bar-positive-border: #317442;
        --color-review-forecast-increase-positive: #317442;
        --color-review-forecast-priority-count-inside: #fff;
        --color-review-forecast-bar-zero: #f4f4f4;
        --color-review-forecast-bar-zero-border: #cad0d6;
        --color-level-progress-completed-bar: #35a753;
        --color-level-progress-bar: #cad0d6;
        --color-subject-srs-progress-stage-complete-background: #08c66c;
      }
    </style>
    <section class="review-forecast-widget"></section>
    <section class="level-progress-widget"></section>`,
    "https://www.wanikani.com/dashboard",
  );

  await loadDarkTheme(dom);

  const root = dom.window.document.documentElement;
  const expected = {
    "--color-review-forecast-bar-positive": "#a6e3a1",
    "--color-review-forecast-bar-positive-border": "#a6e3a1",
    "--color-review-forecast-increase-positive": "#a6e3a1",
    "--color-review-forecast-priority-count-inside": "#11111b",
    "--color-review-forecast-bar-zero": "#45475a",
    "--color-review-forecast-bar-zero-border": "#585b70",
    "--color-level-progress-completed-bar": "#a6e3a1",
    "--color-level-progress-bar": "#585b70",
    "--color-subject-srs-progress-stage-complete-background": "#a6e3a1",
  };

  assertCustomProperties(dom, root, expected);
});

test("dark theme uses Mocha surfaces for level progress notifications", async () => {
  const dom = createDom(
    `<style>
      :root {
        --color-notification-info-background: #dde3fd;
        --color-notification-info-border: #adbcfb;
        --color-notification-info-icon: #2452bc;
        --color-notification-success-background: #d2eeda;
        --color-notification-success-border: #7fd495;
        --color-notification-success-icon: #35a753;
      }
    </style>
    <div class="level-progress-widget__info-bubble wk-notification--info"></div>
    <div class="level-progress-widget__info-bubble wk-notification--success"></div>`,
    "https://www.wanikani.com/dashboard",
  );

  await loadDarkTheme(dom);

  const info = dom.window.document.querySelector(".wk-notification--info");
  const success = dom.window.document.querySelector(
    ".wk-notification--success",
  );

  for (const [element, expected] of [
    [
      info,
      {
        "--color-notification-info-background": "#313244",
        "--color-notification-info-border": "#89b4fa",
        "--color-notification-info-icon": "#89b4fa",
      },
    ],
    [
      success,
      {
        "--color-notification-success-background": "#313244",
        "--color-notification-success-border": "#a6e3a1",
        "--color-notification-success-icon": "#a6e3a1",
      },
    ],
  ]) {
    assertCustomProperties(dom, element, expected);
  }
});

test("dark theme disables text shadows globally", async () => {
  const dom = createDom(
    `<style>
      .subject-readings-with-audio { text-shadow: 0 1px 0 #fff !important; }
    </style>
    <div class="subject-readings-with-audio">Kyoko (Tokyo accent, female)</div>`,
    "https://www.wanikani.com/vocabulary/%E9%A3%9F%E3%81%B9%E3%82%8B",
  );

  await loadDarkTheme(dom);

  const audioDetails = dom.window.document.querySelector(
    ".subject-readings-with-audio",
  );
  assert.equal(
    dom.window.getComputedStyle(audioDetails).textShadow,
    "rgba(0, 0, 0, 0)",
  );

  dom.window.document.documentElement.dataset.wkDarkTheme = "light";
  assert.equal(
    dom.window.getComputedStyle(audioDetails).textShadow,
    "0 1px 0 #fff",
  );
});

test("dark theme uses bold Mocha subject colors and preserves the incorrect quiz state", async () => {
  const dom = createDom(
    `<style>
      :root {
        --color-radical: #00aaff;
        --color-kanji: #ff00aa;
        --color-vocabulary: #aa00ff;
        --color-blue: #00aaff;
        --color-pink: #ff00aa;
        --color-purple: #aa00ff;
        --color-quiz-incorrect-background: #ff0033;
      }
    </style>`,
    "https://www.wanikani.com/",
  );

  await loadDarkTheme(dom);

  const root = dom.window.document.documentElement;
  const expected = {
    "--color-radical": "oklch(72.04%0.1913 261.88)",
    "--color-kanji": "oklch(81.78%0.1552 338.3)",
    "--color-vocabulary": "oklch(73.99%0.1987 306.77)",
    "--color-blue": "oklch(72.04%0.1913 261.88)",
    "--color-pink": "oklch(81.78%0.1552 338.3)",
    "--color-purple": "oklch(73.99%0.1987 306.77)",
    "--color-quiz-incorrect-background": "#ff0033",
  };

  assertCustomProperties(dom, root, expected);
});

test("dark theme responds when the system preference changes", async () => {
  const dom = createDom("<main>Dashboard</main>", "https://www.wanikani.com/");
  let preferenceChanged;
  const preference = {
    matches: false,
    addEventListener(_event, listener) {
      preferenceChanged = listener;
    },
  };

  await loadUserscript(dom, "wk-dark-theme.js", {
    matchMedia() {
      return preference;
    },
  });

  assert.equal(
    dom.window.document.documentElement.dataset.wkDarkTheme,
    "light",
  );

  preference.matches = true;
  preferenceChanged();

  assert.equal(dom.window.document.documentElement.dataset.wkDarkTheme, "dark");
});
