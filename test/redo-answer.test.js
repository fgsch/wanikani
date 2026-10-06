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

function createQueueModel({
  subject = {
    id: 42,
    type: "Vocabulary",
    subject_category: "Vocabulary",
    characters: "学年",
  },
  questionType = "meaning",
  stats,
} = {}) {
  const cachedStats = new Map();
  if (stats) {
    cachedStats.set(subject.id, structuredClone(stats));
  }

  return {
    currentItem: subject,
    questionType,
    remainingItems: 1,
    done: false,
    completions: [],
    stats: {
      get(item) {
        return (
          cachedStats.get(item.id) ?? {
            meaning: { complete: false, incorrect: 0 },
            reading: {
              complete: ["Radical", "KanaVocabulary"].includes(item.type),
              incorrect: 0,
            },
          }
        );
      },
      set(item, value) {
        cachedStats.set(item.id, value);
      },
      delete(item) {
        cachedStats.delete(item.id);
      },
    },
    srsManager: {
      updateSRS({ stats }) {
        const incorrect = stats.meaning.incorrect + stats.reading.incorrect;
        const newStage =
          incorrect === 0 ? 5 : Math.max(1, 4 - Math.round(incorrect / 2));
        return {
          wentUp: incorrect === 0,
          newLevelText: newStage >= 5 ? "Guru" : "Apprentice",
        };
      },
    },
  };
}

function createQueueController(dom, model) {
  return {
    // The Stimulus outlet delegates to this model; it exposes no stats itself.
    quizQueue: model,
    submitAnswer(answer, results) {
      if (model.commitError) {
        throw model.commitError;
      }
      const subject = model.currentItem;
      const stats = model.stats.get(subject);
      const passed = results.action === "pass";
      stats[model.questionType].complete = passed;
      if (!passed) {
        stats[model.questionType].incorrect += 1;
      }
      model.stats.set(subject, stats);
      const subjectWithStats = structuredClone({ subject, stats });
      const complete = stats.meaning.complete && stats.reading.complete;
      const srs = complete
        ? model.srsManager.updateSRS({ subject, stats })
        : {};
      if (complete) {
        model.completions.push(structuredClone({ subject, stats }));
        model.remainingItems = 0;
        model.stats.delete(subject);
      }
      dom.window.dispatchEvent(
        new dom.window.CustomEvent("didAnswerQuestion", {
          detail: {
            subjectWithStats,
            questionType: model.questionType,
            answer,
            results,
            complete,
            srs,
          },
        }),
      );
    },
    nextItem(questionType) {
      if (model.remainingItems === 0) {
        model.done = true;
        return;
      }
      const stats = model.stats.get(model.currentItem);
      model.questionType = stats.meaning.complete
        ? "reading"
        : stats.reading.complete
          ? "meaning"
          : (questionType ?? model.questionType);
      dom.window.dispatchEvent(
        new dom.window.CustomEvent("willShowNextQuestion", {
          detail: {
            subject: model.currentItem,
            questionType: model.questionType,
          },
        }),
      );
    },
  };
}

function createHistoryDatabase({ history, historyWriteGate }) {
  const records = new Map(
    history.map((item, index) => [index + 1, structuredClone(item)]),
  );
  let nextKey = records.size + 1;
  let writes = Promise.resolve();
  let firstWrite = true;
  return {
    createTransaction({ storeName }, callback) {
      const transaction = writes.then(async () => {
        if (firstWrite && historyWriteGate) {
          await historyWriteGate;
        }
        firstWrite = false;
        if (storeName !== "answer-log") {
          throw new Error(`Unknown store: ${storeName}`);
        }
        callback({
          store: {
            put(item) {
              const request = {};
              const key = nextKey++;
              queueMicrotask(() => {
                records.set(key, structuredClone(item));
                request.result = key;
                request.onsuccess?.();
              });
              return request;
            },
            delete(key) {
              records.delete(key);
            },
          },
        });
        await Promise.resolve();
      });
      writes = transaction;
      return transaction;
    },
    logAnswer(item) {
      return this.createTransaction(
        {
          storeName: "answer-log",
          mode: "readwrite",
          resolveOnTransactionComplete: true,
        },
        ({ store }) => store.put(item),
      );
    },
    getRecentLogItems() {
      return writes.then(() => structuredClone([...records.values()]));
    },
  };
}

async function createReview(t, options = {}) {
  const dom = createDom(
    `${quizInputHtml({ input: true })}
    <div data-controller="quiz-statistics">
      <span id="accuracy"></span><span id="completed"></span><span id="remaining"></span>
    </div>
    <div data-quiz-header-target="srsContainer" data-hidden="true"><span id="srs"></span></div>
    <div id="additional-content" data-controller="additional-content quiz-audio">
      <a class="additional-content__item--item-info additional-content__item--disabled" data-content-id="item-info"></a>
      <a class="additional-content__item--kana-chart" data-content-id="kana-chart"></a>
      <button class="additional-content__item--audio additional-content__item--disabled">Pronunciation</button>
      <audio id="quiz-audio"></audio>
      <div class="answer-exception answer-exception--hidden"></div>
      <div id="information" class="additional-content__content">
        <div id="item-info" style="display: none">School Year — がくねん
          <div data-controller="audio-player">
            <button id="reading-play">Play reading</button>
            <audio id="reading-audio"><source src="https://example.test/reading.wav"></audio>
          </div>
        </div>
        <div id="kana-chart" style="display: none">Hiragana chart</div>
        <div id="last-items" data-controller="last-answers"></div>
      </div>
      ${LAST_ITEMS_MENU_HTML}
    </div>`,
    options.url ?? "https://www.wanikani.com/subjects/review",
  );
  const observers = [];
  const MutationObserver = dom.window.MutationObserver;
  dom.window.MutationObserver = class extends MutationObserver {
    constructor(callback) {
      super(callback);
      observers.push(this);
    }
  };
  t.after(() => {
    for (const observer of observers) {
      observer.disconnect();
    }
    dom.window.close();
  });
  const document = dom.window.document;
  const content = document.querySelector("#information");
  const toggles = document.querySelectorAll("[data-content-id]");
  // Model the native additional-content controller's tracked panel state.
  const additionalContent = {
    currentContainer: null,
    close() {
      content.classList.remove("additional-content__content--open");
      if (this.currentContainer) {
        this.currentContainer.style.display = "none";
      }
      for (const toggle of toggles) {
        toggle.classList.remove("additional-content__item--open");
      }
      this.currentContainer = null;
    },
    toggle(event) {
      event.preventDefault();
      const toggle = event.currentTarget;
      if (toggle.classList.contains("additional-content__item--disabled")) {
        return;
      }
      const next = document.getElementById(toggle.dataset.contentId);
      const wasOpen = next === this.currentContainer;
      this.close();
      if (!wasOpen) {
        this.currentContainer = next;
        next.style.display = "block";
        content.classList.add("additional-content__content--open");
        toggle.classList.add("additional-content__item--open");
      }
    },
  };
  for (const toggle of toggles) {
    toggle.addEventListener("click", (event) =>
      additionalContent.toggle(event),
    );
  }
  let quizAudio = null;
  let readingPlayer = null;
  if (options.audio) {
    const media = (selector) => {
      const audio = document.querySelector(selector);
      let paused = true;
      Object.defineProperty(audio, "paused", { get: () => paused });
      t.mock.method(audio, "play", () => {
        paused = false;
        return Promise.resolve();
      });
      t.mock.method(audio, "pause", () => {
        paused = true;
      });
      t.mock.method(audio, "load", () => {});
      return audio;
    };
    const audio = media("#quiz-audio");
    const playButton = document.querySelector(
      ".additional-content__item--audio",
    );
    quizAudio = {
      canPlay: false,
      playing: false,
      loadAudio(sources) {
        audio.replaceChildren(...sources);
        this.canPlay = sources.length > 0;
        playButton.classList.toggle(
          "additional-content__item--disabled",
          !this.canPlay,
        );
      },
      play() {
        if (this.canPlay) {
          return audio.play().then(() => {
            this.playing = true;
          });
        }
      },
      clearSources() {
        audio.pause();
        audio.currentTime = 0;
        this.playing = false;
        this.loadAudio([]);
      },
    };
    playButton.addEventListener("click", () => quizAudio.play());
    const readingAudio = media("#reading-audio");
    readingPlayer = {
      play() {
        return readingAudio.play();
      },
      stop() {
        readingAudio.pause();
        readingAudio.currentTime = 0;
      },
    };
    document.querySelector("#reading-play").addEventListener("click", () => {
      readingPlayer.play();
    });
  }
  const model = createQueueModel(options);
  const queue = createQueueController(dom, model);
  let historyDatabase = null;
  let lastAnswers = null;
  if (options.history) {
    historyDatabase = createHistoryDatabase(options);
    dom.window.dbManager = historyDatabase;
    const historyElement = document.querySelector(
      '[data-controller="last-answers"]',
    );
    lastAnswers = {
      async renderItems() {
        const items = await historyDatabase.getRecentLogItems();
        historyElement.replaceChildren(
          ...items.map((item) => {
            const row = document.createElement("div");
            row.textContent = `${item.characters}: ${item.answer}`;
            return row;
          }),
        );
      },
    };
    await lastAnswers.renderItems();
    dom.window.addEventListener("didAnswerQuestion", ({ detail }) => {
      const { id, characters, subject_category } =
        detail.subjectWithStats.subject;
      historyDatabase.logAnswer({
        id,
        characters,
        subject_category,
        questionType: detail.questionType,
        answer: detail.answer,
        result: detail.results.action,
        complete: detail.complete,
        srs: detail.srs,
        registeredAt: new Date(0),
      });
      lastAnswers.renderItems();
    });
  }
  const input = {
    currentSubject: model.currentItem,
    currentQuestionType: model.questionType,
    quizQueueOutlet: queue,
    lastAnswer: null,
    inputChars: "",
    inputEnabled: true,
    updateQuestion({ detail }) {
      if (this.resetError) {
        throw this.resetError;
      }
      this.currentSubject = detail.subject;
      this.currentQuestionType = detail.questionType;
      document.querySelector("#user-response").value = "";
      this.inputChars = "";
    },
  };
  const statistics = {
    answeredCount: 0,
    incorrectCount: 0,
    completedCount: 0,
    remainingCount: 1,
    percentCorrectTarget: document.querySelector("#accuracy"),
    completeCountTarget: document.querySelector("#completed"),
    remainingCountTarget: document.querySelector("#remaining"),
  };
  statistics.percentCorrectTarget.innerText = "100%";
  statistics.completeCountTarget.innerText = "0";
  statistics.remainingCountTarget.innerText = "1";
  const srsContainer = document.querySelector(
    '[data-quiz-header-target="srsContainer"]',
  );
  const events = [];
  dom.window.addEventListener("didAnswerQuestion", ({ detail }) => {
    events.push(structuredClone(detail));
    statistics.answeredCount += 1;
    if (detail.results.action === "fail") {
      statistics.incorrectCount += 1;
    }
    statistics.percentCorrectTarget.innerText = `${Math.round(
      ((statistics.answeredCount - statistics.incorrectCount) * 100) /
        statistics.answeredCount,
    )}%`;
    if (detail.complete) {
      statistics.completedCount += 1;
      statistics.remainingCount -= 1;
      statistics.completeCountTarget.innerText = `${statistics.completedCount}`;
      statistics.remainingCountTarget.innerText = `${statistics.remainingCount}`;
      document.querySelector("#srs").innerText = detail.srs.newLevelText;
      srsContainer.dataset.hidden = "false";
    }
    document
      .querySelector(".additional-content__item--item-info")
      .classList.remove("additional-content__item--disabled");
    if (quizAudio) {
      const sources = [];
      if (detail.questionType === "reading") {
        const source = document.createElement("source");
        source.src = "https://example.test/quiz.wav";
        sources.push(source);
      }
      quizAudio.loadAudio(sources);
    }
  });
  dom.window.addEventListener("willShowNextQuestion", (event) => {
    input.updateQuestion(event);
    srsContainer.dataset.hidden = "true";
  });
  if (options.hideModel) {
    delete queue.quizQueue;
  }
  await loadUserscript(
    dom,
    "wk-redo-answer.js",
    stimulusGlobals((element, identifier) =>
      identifier === "quiz-input"
        ? input
        : identifier === "quiz-statistics"
          ? statistics
          : identifier === "additional-content"
            ? additionalContent
            : identifier === "quiz-audio"
              ? quizAudio
              : identifier === "audio-player"
                ? readingPlayer
                : identifier === "last-answers"
                  ? lastAnswers
                  : null,
    ),
  );
  return {
    dom,
    document,
    model,
    queue,
    input,
    statistics,
    events,
    historyDatabase,
    async answer(answer, action) {
      input.lastAnswer = answer;
      input.inputChars = [...answer];
      input.inputEnabled = false;
      document.querySelector("#user-response").value = answer;
      document
        .querySelector(".quiz-input__input-container")
        .setAttribute("correct", `${action === "pass"}`);
      input.quizQueueOutlet.submitAnswer(answer, { action });
      await flushMutationObservers();
    },
    async redo() {
      const button = document.querySelector(
        ".additional-content__item--redo-answer",
      );
      assert.equal(button.getAttribute("aria-disabled"), "false");
      button.click();
      await new Promise((resolve) => dom.window.requestAnimationFrame(resolve));
    },
    advance() {
      input.quizQueueOutlet.nextItem();
      input.inputEnabled = true;
      document
        .querySelector(".quiz-input__input-container")
        .removeAttribute("correct");
    },
  };
}

const readingFinished = {
  meaning: { complete: false, incorrect: 0 },
  reading: { complete: true, incorrect: 0 },
};

test("review feedback preserves cached answers, completion, and SRS before advancement", async (t) => {
  const review = await createReview(t, {
    stats: {
      meaning: { complete: false, incorrect: 1 },
      reading: { complete: true, incorrect: 2 },
    },
  });
  await review.answer("school year", "pass");

  assert.equal(review.statistics.completedCount, 1);
  assert.equal(review.statistics.remainingCount, 0);
  assert.equal(review.document.querySelector("#completed").innerText, "1");
  assert.equal(review.document.querySelector("#remaining").innerText, "0");
  assert.equal(review.document.querySelector("#srs").innerText, "Apprentice");
  assert.deepEqual(review.events[0].subjectWithStats.stats, {
    meaning: { complete: true, incorrect: 1 },
    reading: { complete: true, incorrect: 2 },
  });
  assert.deepEqual(review.events[0].srs, {
    wentUp: false,
    newLevelText: "Apprentice",
  });
  assert.equal(review.events[0].complete, true);
  assert.equal(
    review.model.stats.get(review.model.currentItem).meaning.complete,
    false,
  );
  assert.deepEqual(review.model.completions, []);

  review.advance();
  assert.deepEqual(review.model.completions[0].stats, {
    meaning: { complete: true, incorrect: 1 },
    reading: { complete: true, incorrect: 2 },
  });
  assert.equal(review.model.done, true);
  assert.equal(review.statistics.answeredCount, 1);
  assert.equal(review.statistics.completedCount, 1);
});

test("Redo discards a failed attempt without penalizing completion", async (t) => {
  const review = await createReview(t, { stats: readingFinished });
  await review.answer("wrong", "fail");
  assert.equal(review.statistics.percentCorrectTarget.innerText, "0%");
  assert.deepEqual(review.events[0].subjectWithStats.stats, {
    meaning: { complete: false, incorrect: 1 },
    reading: { complete: true, incorrect: 0 },
  });
  assert.equal(review.events[0].complete, false);
  assert.deepEqual(review.events[0].srs, {});

  await review.redo();
  assert.equal(review.statistics.answeredCount, 0);
  assert.equal(review.statistics.incorrectCount, 0);
  assert.equal(review.statistics.percentCorrectTarget.innerText, "100%");
  assert.equal(review.input.inputEnabled, true);
  assert.equal(review.input.lastAnswer, null);
  assert.equal(review.document.querySelector("#user-response").value, "");
  assert.equal(
    review.document.activeElement,
    review.document.querySelector("#user-response"),
  );
  assert.equal(
    review.document
      .querySelector(".quiz-input__input-container")
      .hasAttribute("correct"),
    false,
  );
  assert.equal(
    review.document
      .querySelector(".additional-content__item--item-info")
      .classList.contains("additional-content__item--disabled"),
    true,
  );

  await review.answer("school year", "pass");
  assert.equal(review.statistics.percentCorrectTarget.innerText, "100%");
  assert.deepEqual(review.events[1].srs, {
    wentUp: true,
    newLevelText: "Guru",
  });
  review.advance();
  assert.deepEqual(review.model.completions, [
    {
      subject: review.model.currentItem,
      stats: {
        meaning: { complete: true, incorrect: 0 },
        reading: { complete: true, incorrect: 0 },
      },
    },
  ]);
  assert.equal(review.statistics.answeredCount, 1);
  assert.equal(review.statistics.completedCount, 1);
});

test("Redo closes open Item Info until a replacement answer is submitted", async (t) => {
  const review = await createReview(t);
  const info = review.document.querySelector("#item-info");
  const toggle = review.document.querySelector(
    ".additional-content__item--item-info",
  );
  const content = review.document.querySelector("#information");
  await review.answer("school year", "pass");
  toggle.click();
  assert.equal(review.dom.window.getComputedStyle(info).display, "block");

  await review.redo();
  assert.equal(review.document.querySelector("#user-response").value, "");
  assert.equal(
    review.document
      .querySelector(".quiz-input__input-container")
      .hasAttribute("correct"),
    false,
  );
  assert.equal(review.dom.window.getComputedStyle(info).display, "none");
  assert.equal(
    content.classList.contains("additional-content__content--open"),
    false,
  );
  assert.equal(
    toggle.classList.contains("additional-content__item--open"),
    false,
  );
  toggle.click();
  assert.equal(review.dom.window.getComputedStyle(info).display, "none");

  await review.answer("school year", "pass");
  toggle.click();
  assert.equal(review.dom.window.getComputedStyle(info).display, "block");
  assert.equal(
    toggle.classList.contains("additional-content__item--open"),
    true,
  );
});

test("Redo stops pronunciation and Info audio until the replacement answer", async (t) => {
  const review = await createReview(t, {
    audio: true,
    questionType: "reading",
  });
  const pronunciation = review.document.querySelector(
    ".additional-content__item--audio",
  );
  const quizAudio = review.document.querySelector("#quiz-audio");
  const readingAudio = review.document.querySelector("#reading-audio");
  await review.answer("がくねん", "pass");
  pronunciation.click();
  review.document.querySelector(".additional-content__item--item-info").click();
  review.document.querySelector("#reading-play").click();
  await Promise.resolve();
  quizAudio.currentTime = 3;
  readingAudio.currentTime = 2;
  assert.equal(quizAudio.paused, false);
  assert.equal(readingAudio.paused, false);

  await review.redo();
  assert.equal(quizAudio.paused, true);
  assert.equal(quizAudio.currentTime, 0);
  assert.equal(quizAudio.querySelector("source"), null);
  assert.equal(readingAudio.paused, true);
  assert.equal(readingAudio.currentTime, 0);
  assert.equal(
    pronunciation.classList.contains("additional-content__item--disabled"),
    true,
  );
  pronunciation.click();
  await Promise.resolve();
  assert.equal(quizAudio.paused, true);

  await review.answer("がくねん", "pass");
  pronunciation.click();
  await Promise.resolve();
  assert.equal(quizAudio.paused, false);
});

test("Redo preserves an open Kana Chart instead of closing unrelated panels", async (t) => {
  const review = await createReview(t);
  const chart = review.document.querySelector("#kana-chart");
  const toggle = review.document.querySelector(
    ".additional-content__item--kana-chart",
  );
  await review.answer("school year", "pass");
  toggle.click();

  await review.redo();
  assert.equal(review.document.querySelector("#user-response").value, "");
  assert.equal(review.dom.window.getComputedStyle(chart).display, "block");
  assert.equal(
    toggle.classList.contains("additional-content__item--open"),
    true,
  );
  assert.equal(
    review.document.querySelector("#item-info").style.display,
    "none",
  );
});

test("Redo restores earlier history and keeps only the replacement attempt", async (t) => {
  const earlier = [
    {
      id: 41,
      characters: "学校",
      questionType: "meaning",
      answer: "school",
      result: "pass",
    },
    {
      id: 42,
      characters: "学年",
      questionType: "reading",
      answer: "がくねん",
      result: "pass",
    },
  ];
  const review = await createReview(t, {
    history: earlier,
    stats: readingFinished,
  });
  const history = review.document.querySelector(
    '[data-controller="last-answers"]',
  );
  await review.answer("school years", "fail");
  await waitFor(() =>
    assert.equal(history.textContent.includes("school years"), true),
  );
  await review.redo();
  await waitFor(() =>
    assert.equal(history.textContent.includes("school years"), false),
  );
  assert.deepEqual(await review.historyDatabase.getRecentLogItems(), earlier);
  assert.deepEqual(
    [...history.children].map((row) => row.textContent),
    ["学校: school", "学年: がくねん"],
  );

  await review.answer("school year", "pass");
  review.advance();
  const finalHistory = await review.historyDatabase.getRecentLogItems();
  assert.deepEqual(
    finalHistory.map(({ id, questionType, answer, result }) => ({
      id,
      questionType,
      answer,
      result,
    })),
    [
      { id: 41, questionType: "meaning", answer: "school", result: "pass" },
      { id: 42, questionType: "reading", answer: "がくねん", result: "pass" },
      {
        id: 42,
        questionType: "meaning",
        answer: "school year",
        result: "pass",
      },
    ],
  );
});

test("Redo removes its delayed log without deleting an identical replacement", async (t) => {
  let releaseWrite;
  const historyWriteGate = new Promise((resolve) => {
    releaseWrite = resolve;
  });
  const review = await createReview(t, { history: [], historyWriteGate });
  const history = review.document.querySelector(
    '[data-controller="last-answers"]',
  );
  await review.answer("school year", "pass");
  await review.redo();
  await review.answer("school year", "pass");
  releaseWrite();
  await waitFor(() => assert.equal(history.childElementCount, 1));
  assert.deepEqual(
    (await review.historyDatabase.getRecentLogItems()).map(
      ({ id, questionType, answer, result }) => ({
        id,
        questionType,
        answer,
        result,
      }),
    ),
    [
      {
        id: 42,
        questionType: "meaning",
        answer: "school year",
        result: "pass",
      },
    ],
  );
  assert.equal(history.textContent, "学年: school year");

  await review.redo();
  await waitFor(() => assert.equal(history.textContent, ""));
  assert.deepEqual(await review.historyDatabase.getRecentLogItems(), []);
});

test("Redo reverses completion counters and hides provisional SRS feedback", async (t) => {
  const review = await createReview(t, { stats: readingFinished });
  await review.answer("school year", "pass");
  assert.equal(review.statistics.completedCount, 1);
  assert.equal(review.statistics.remainingCount, 0);
  await review.redo();

  assert.equal(review.statistics.completedCount, 0);
  assert.equal(review.statistics.remainingCount, 1);
  assert.equal(review.statistics.completeCountTarget.innerText, "0");
  assert.equal(review.statistics.remainingCountTarget.innerText, "1");
  assert.equal(
    review.document.querySelector('[data-quiz-header-target="srsContainer"]')
      .dataset.hidden,
    "true",
  );
  assert.equal(
    review.document
      .querySelector(".additional-content__item--redo-answer")
      .getAttribute("aria-disabled"),
    "true",
  );

  await review.answer("wrong", "fail");
  review.advance();
  assert.deepEqual(review.model.stats.get(review.model.currentItem), {
    meaning: { complete: false, incorrect: 1 },
    reading: { complete: true, incorrect: 0 },
  });
  assert.equal(review.statistics.completedCount, 0);
  assert.deepEqual(review.model.completions, []);

  await review.answer("school year", "pass");
  assert.equal(review.statistics.percentCorrectTarget.innerText, "50%");
  assert.equal(review.statistics.completedCount, 1);
  assert.deepEqual(review.events.at(-1).srs, {
    wentUp: false,
    newLevelText: "Apprentice",
  });
  review.advance();
  assert.deepEqual(review.model.completions[0].stats, {
    meaning: { complete: true, incorrect: 1 },
    reading: { complete: true, incorrect: 0 },
  });
  assert.equal(review.statistics.answeredCount, 2);
  assert.equal(review.statistics.completedCount, 1);
});

test("incorrect feedback retains cached errors on both question types", async (t) => {
  const review = await createReview(t, {
    stats: {
      meaning: { complete: false, incorrect: 1 },
      reading: { complete: false, incorrect: 2 },
    },
  });
  await review.answer("wrong", "fail");
  assert.deepEqual(review.events[0].subjectWithStats.stats, {
    meaning: { complete: false, incorrect: 2 },
    reading: { complete: false, incorrect: 2 },
  });
  assert.equal(review.events[0].complete, false);
  assert.deepEqual(review.events[0].srs, {});
  review.advance();
  assert.deepEqual(review.model.stats.get(review.model.currentItem), {
    meaning: { complete: false, incorrect: 2 },
    reading: { complete: false, incorrect: 2 },
  });
  assert.equal(review.statistics.answeredCount, 1);
  assert.equal(review.statistics.incorrectCount, 1);
});

for (const firstQuestion of ["meaning", "reading"]) {
  test(`review completion preserves the first answer in ${firstQuestion}-first order`, async (t) => {
    const review = await createReview(t, { questionType: firstQuestion });
    await review.answer(
      firstQuestion === "meaning" ? "school year" : "がくねん",
      "pass",
    );
    assert.equal(review.events[0].complete, false);
    assert.equal(review.statistics.completedCount, 0);
    review.advance();
    const secondQuestion = firstQuestion === "meaning" ? "reading" : "meaning";
    assert.equal(review.input.currentQuestionType, secondQuestion);
    await review.answer(
      secondQuestion === "meaning" ? "school year" : "がくねん",
      "pass",
    );
    assert.equal(review.events[1].complete, true);
    assert.equal(review.statistics.completedCount, 1);
    review.advance();
    assert.deepEqual(review.model.completions[0].stats, {
      meaning: { complete: true, incorrect: 0 },
      reading: { complete: true, incorrect: 0 },
    });
    assert.equal(review.statistics.answeredCount, 2);
    assert.equal(review.statistics.completedCount, 1);
    assert.equal(review.model.done, true);
  });
}

for (const type of ["Radical", "KanaVocabulary"]) {
  test(`a ${type} completes without a reading answer`, async (t) => {
    const review = await createReview(t, {
      subject: { id: 44, type, subject_category: type, characters: "一" },
    });
    await review.answer("one", "pass");
    assert.equal(review.events[0].complete, true);
    assert.equal(review.statistics.completedCount, 1);
    assert.equal(review.statistics.remainingCount, 0);
    review.advance();
    assert.deepEqual(review.model.completions[0].stats, {
      meaning: { complete: true, incorrect: 0 },
      reading: { complete: true, incorrect: 0 },
    });
    assert.equal(review.model.done, true);
  });
}

test("feedback consumers cannot mutate the queued subject or cached statistics", async (t) => {
  const review = await createReview(t, { stats: readingFinished });
  review.dom.window.addEventListener("didAnswerQuestion", ({ detail }) => {
    detail.subjectWithStats.subject.id = 999;
    detail.subjectWithStats.subject.characters = "changed";
    detail.subjectWithStats.stats.meaning.incorrect = 99;
    detail.subjectWithStats.stats.reading.complete = false;
  });
  await review.answer("school year", "pass");
  assert.equal(review.model.currentItem.id, 42);
  assert.equal(review.model.currentItem.characters, "学年");
  assert.deepEqual(
    review.model.stats.get(review.model.currentItem),
    readingFinished,
  );
  review.advance();
  assert.equal(review.model.completions[0].subject.id, 42);
  assert.deepEqual(review.model.completions[0].stats, {
    meaning: { complete: true, incorrect: 0 },
    reading: { complete: true, incorrect: 0 },
  });
  assert.equal(review.statistics.completedCount, 1);
});

test("an unavailable queue model leaves answers native and Redo disabled", async (t) => {
  const review = await createReview(t, {
    stats: readingFinished,
    hideModel: true,
  });
  await review.answer("school year", "pass");
  assert.deepEqual(review.model.completions[0].stats, {
    meaning: { complete: true, incorrect: 0 },
    reading: { complete: true, incorrect: 0 },
  });
  assert.equal(
    review.document
      .querySelector(".additional-content__item--redo-answer")
      .getAttribute("aria-disabled"),
    "true",
  );
});

test("a disabled Redo does not discard an unsubmitted response", async (t) => {
  const review = await createReview(t);
  review.document.querySelector("#user-response").value = "school year";
  review.document
    .querySelector(".additional-content__item--redo-answer")
    .click();
  assert.equal(
    review.document.querySelector("#user-response").value,
    "school year",
  );
  assert.equal(review.statistics.answeredCount, 0);
  assert.deepEqual(review.model.stats.get(review.model.currentItem), {
    meaning: { complete: false, incorrect: 0 },
    reading: { complete: false, incorrect: 0 },
  });
});

test("a failed question reset retains the accepted answer for advancement", async (t) => {
  const review = await createReview(t, { stats: readingFinished, history: [] });
  await review.answer("school year", "pass");
  review.input.resetError = new Error("reset failed");
  t.mock.method(review.dom.window.console, "error", () => {});
  await review.redo();
  assert.equal(review.input.lastAnswer, "school year");
  assert.equal(review.input.inputEnabled, false);
  assert.equal(
    review.document
      .querySelector(".quiz-input__input-container")
      .getAttribute("correct"),
    "true",
  );
  assert.equal(review.statistics.completedCount, 1);
  assert.deepEqual(
    (await review.historyDatabase.getRecentLogItems()).map(
      ({ answer, result }) => ({ answer, result }),
    ),
    [{ answer: "school year", result: "pass" }],
  );
  review.advance();
  assert.deepEqual(review.model.completions[0].stats, {
    meaning: { complete: true, incorrect: 0 },
    reading: { complete: true, incorrect: 0 },
  });
});

test("a failed commit keeps feedback stable until advancement succeeds", async (t) => {
  const review = await createReview(t, { stats: readingFinished });
  await review.answer("school year", "pass");
  review.model.commitError = new Error("commit failed");
  assert.throws(() => review.advance(), /commit failed/);
  assert.deepEqual(review.model.completions, []);
  assert.equal(review.model.done, false);
  assert.deepEqual(
    review.model.stats.get(review.model.currentItem),
    readingFinished,
  );
  review.model.commitError = null;
  review.advance();
  assert.deepEqual(review.model.completions[0].stats, {
    meaning: { complete: true, incorrect: 0 },
    reading: { complete: true, incorrect: 0 },
  });
  assert.equal(review.statistics.answeredCount, 1);
  assert.equal(review.statistics.completedCount, 1);
  assert.equal(review.model.done, true);
});

for (const eventName of ["pagehide", "turbo:before-visit"]) {
  test(`${eventName} commits the pending review without duplicate completion`, async (t) => {
    const review = await createReview(t, { stats: readingFinished });
    await review.answer("school year", "pass");
    const target =
      eventName === "pagehide" ? review.dom.window : review.document;
    target.dispatchEvent(new review.dom.window.Event(eventName));
    target.dispatchEvent(new review.dom.window.Event(eventName));
    assert.deepEqual(review.model.completions, [
      {
        subject: review.model.currentItem,
        stats: {
          meaning: { complete: true, incorrect: 0 },
          reading: { complete: true, incorrect: 0 },
        },
      },
    ]);
    assert.equal(review.statistics.answeredCount, 1);
    assert.equal(review.statistics.completedCount, 1);
  });
}

test("replacing the queue preserves the old subject before accepting the new one", async (t) => {
  const review = await createReview(t, { stats: readingFinished });
  review.statistics.remainingCount = 2;
  await review.answer("school year", "pass");
  const nextModel = createQueueModel({
    subject: {
      id: 84,
      type: "Radical",
      subject_category: "Radical",
      characters: "一",
    },
  });
  review.input.quizQueueOutlet = createQueueController(review.dom, nextModel);
  review.input.currentSubject = nextModel.currentItem;
  review.document.body.appendChild(review.document.createElement("div"));
  await flushMutationObservers();
  assert.equal(review.model.completions[0].subject.id, 42);
  assert.deepEqual(review.model.completions[0].stats, {
    meaning: { complete: true, incorrect: 0 },
    reading: { complete: true, incorrect: 0 },
  });
  await review.answer("one", "pass");
  assert.deepEqual(nextModel.completions, []);
  review.advance();
  assert.equal(nextModel.completions[0].subject.id, 84);
  assert.deepEqual(nextModel.completions[0].stats, {
    meaning: { complete: true, incorrect: 0 },
    reading: { complete: true, incorrect: 0 },
  });
  assert.equal(review.statistics.completedCount, 2);
  assert.equal(review.statistics.remainingCount, 0);
});

test("Extra Study leaves native answer handling immediate and has no Redo control", async (t) => {
  const review = await createReview(t, {
    url: "https://www.wanikani.com/subjects/extra_study",
    stats: readingFinished,
  });
  assert.equal(
    review.document.querySelector(".additional-content__item--redo-answer"),
    null,
  );
  await review.answer("school year", "pass");
  assert.deepEqual(review.model.completions[0].stats, {
    meaning: { complete: true, incorrect: 0 },
    reading: { complete: true, incorrect: 0 },
  });
  assert.equal(review.statistics.completedCount, 1);
});

test("leaving reviews commits pending work and removes interception before Extra Study", async (t) => {
  const review = await createReview(t);
  await review.answer("school year", "pass");
  review.dom.window.history.pushState({}, "", "/subjects/extra_study");
  assert.equal(
    review.document.querySelector(".additional-content__item--redo-answer"),
    null,
  );
  assert.equal(
    review.model.stats.get(review.model.currentItem).meaning.complete,
    true,
  );
  review.advance();
  assert.equal(review.input.currentQuestionType, "reading");
  await review.answer("がくねん", "pass");
  assert.deepEqual(review.model.completions[0].stats, {
    meaning: { complete: true, incorrect: 0 },
    reading: { complete: true, incorrect: 0 },
  });
  assert.equal(review.statistics.answeredCount, 2);
  assert.equal(review.statistics.completedCount, 1);
});

for (const initialPath of ["/kanji/一", "/subjects/extra_study"]) {
  test(`entering reviews from ${initialPath} enables Redo for the new review`, async (t) => {
    const review = await createReview(t, {
      url: `https://www.wanikani.com${initialPath}`,
      stats: readingFinished,
    });
    review.dom.window.history.replaceState({}, "", "/subjects/review");
    await waitFor(() => {
      assert.ok(
        review.document.querySelector(".additional-content__item--redo-answer"),
      );
    });
    await review.answer("wrong", "fail");
    await review.redo();
    await review.answer("school year", "pass");
    review.advance();
    assert.deepEqual(review.model.completions[0].stats, {
      meaning: { complete: true, incorrect: 0 },
      reading: { complete: true, incorrect: 0 },
    });
    assert.equal(review.statistics.incorrectCount, 0);
    assert.equal(review.statistics.completedCount, 1);
  });
}
