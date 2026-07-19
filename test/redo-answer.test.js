import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LAST_ITEMS_MENU_HTML,
  createDom,
  flushMutationObservers,
  loadUserscript,
  quizInputHtml,
  stimulusGlobals,
  waitFor,
} from "./support/userscript-harness.js";

test("redo answer inserts a disabled redo control before last items", async () => {
  const dom = createDom(
    `
      ${quizInputHtml({ input: true })}
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

test("redo answer keeps every additional-content control in the menu", async () => {
  const dom = createDom(
    `<style>
      .additional-content__menu {
        display: flex;
      }
      .additional-content__menu-item {
        margin-right: 10px;
      }
      .additional-content__menu-item--5 {
        flex: 0 0 calc(20% - 8px);
        width: calc(20% - 8px);
      }
    </style>
    ${quizInputHtml({ input: true })}
    <ul class="additional-content__menu">
      <li class="additional-content__menu-item additional-content__menu-item--5"><a class="additional-content__item"></a></li>
      <li class="additional-content__menu-item additional-content__menu-item--5"><a class="additional-content__item"></a></li>
      <li class="additional-content__menu-item additional-content__menu-item--5"><a class="additional-content__item"></a></li>
      <li class="additional-content__menu-item additional-content__menu-item--5"><a class="additional-content__item"></a></li>
      <li class="additional-content__menu-item additional-content__menu-item--5"><a class="additional-content__item additional-content__item--last-items"></a></li>
    </ul>`,
    "https://www.wanikani.com/subjects/review",
  );

  await loadUserscript(dom, "wk-redo-answer.js");

  const items = dom.window.document.querySelectorAll(
    ".additional-content__menu > li",
  );

  assert.equal(items.length, 6);
  for (const item of items) {
    const styles = dom.window.getComputedStyle(item);
    assert.equal(styles.flexGrow, "1");
    assert.equal(styles.flexShrink, "1");
    assert.equal(styles.flexBasis, "0px");
    assert.equal(styles.minWidth, "0px");
    assert.equal(styles.width, "auto");
  }
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
    ${quizInputHtml({ input: true })}
    ${LAST_ITEMS_MENU_HTML}
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

test("redo answer unlocks item info when the answer is submitted", async () => {
  const dom = createDom(
    `
      ${quizInputHtml({ input: true })}
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

  await loadUserscript(
    dom,
    "wk-redo-answer.js",
    stimulusGlobals(() => controller),
  );

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
      ${quizInputHtml({ correct: "false", input: true })}
      ${LAST_ITEMS_MENU_HTML}
    `,
    "https://www.wanikani.com/subjects/review",
  );

  await loadUserscript(
    dom,
    "wk-redo-answer.js",
    stimulusGlobals(() => ({})),
  );

  const redoButton = dom.window.document.querySelector(
    ".additional-content__item--redo-answer",
  );

  assert.equal(redoButton.getAttribute("aria-disabled"), "true");
});

test("redo answer can reset the current quiz input through the WaniKani controller", async () => {
  const dom = createDom(
    `
      ${quizInputHtml({ input: true, value: "old answer" })}
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

  await loadUserscript(
    dom,
    "wk-redo-answer.js",
    stimulusGlobals(() => controller),
  );

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
      ${quizInputHtml({ input: true })}
      ${LAST_ITEMS_MENU_HTML}
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

  await loadUserscript(
    dom,
    "wk-redo-answer.js",
    stimulusGlobals(() => controller),
  );

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
      ${quizInputHtml({ input: true })}
      ${LAST_ITEMS_MENU_HTML}
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

  await loadUserscript(
    dom,
    "wk-redo-answer.js",
    stimulusGlobals(() => controller),
  );

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
      ${quizInputHtml({ input: true })}
      ${LAST_ITEMS_MENU_HTML}
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

  await loadUserscript(
    dom,
    "wk-redo-answer.js",
    stimulusGlobals(() => controller),
  );

  quizQueueController.submitAnswer("answer", { action: "pass" });
  dom.window.document.dispatchEvent(new dom.window.Event("turbo:before-visit"));

  assert.deepEqual(calls, ["answer"]);
});

test("redo answer retries a pending answer after submit fails", async () => {
  const dom = createDom(
    `
      ${quizInputHtml()}
      ${LAST_ITEMS_MENU_HTML}
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

  await loadUserscript(
    dom,
    "wk-redo-answer.js",
    stimulusGlobals(() => ({ quizQueueOutlet: quizQueueController })),
  );

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
      ${quizInputHtml({ correct: "false", input: true, value: "wrong" })}
      ${LAST_ITEMS_MENU_HTML}
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

  await loadUserscript(
    dom,
    "wk-redo-answer.js",
    stimulusGlobals(() => controller),
  );

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
      ${quizInputHtml()}
      ${LAST_ITEMS_MENU_HTML}
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

  await loadUserscript(
    dom,
    "wk-redo-answer.js",
    stimulusGlobals(() => controller),
  );

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
      ${quizInputHtml()}
      ${LAST_ITEMS_MENU_HTML}
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

  await loadUserscript(
    dom,
    "wk-redo-answer.js",
    stimulusGlobals(() => controller),
  );

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
      ${quizInputHtml()}
      ${LAST_ITEMS_MENU_HTML}
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

  await loadUserscript(
    dom,
    "wk-redo-answer.js",
    stimulusGlobals(() => controller),
  );

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
