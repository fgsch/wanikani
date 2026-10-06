// ==UserScript==
// @name         WaniKani Redo Answer
// @namespace    wk-redo-answer
// @version      0.7.1
// @author       Federico G. Schwindt <fgsch@lodoss.net>
// @description  Adds a Redo button to WaniKani standard reviews.
// @license      MIT
// @homepageURL  https://github.com/fgsch/wanikani
// @updateURL    https://raw.githubusercontent.com/fgsch/wanikani/main/wk-redo-answer.js
// @downloadURL  https://raw.githubusercontent.com/fgsch/wanikani/main/wk-redo-answer.js
// @match        https://www.wanikani.com/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const REDO_SELECTOR = ".additional-content__item--redo-answer";
  const DISABLED_CLASS = "additional-content__item--disabled";
  const MENU_CLASS = "wk-redo-answer-menu";
  const STYLE_ID = "wk-redo-answer-styles";
  const NAME = GM_info.script.name;
  const VERSION = GM_info.script.version;

  let pendingAnswerTransaction = null;

  function isReviewPage() {
    return /^\/subjects\/review(?:\/|$)/.test(location.pathname);
  }

  function getRedoButton() {
    return document.querySelector(REDO_SELECTOR);
  }

  function getQuizInputController() {
    return window.Stimulus?.getControllerForElementAndIdentifier?.(
      document.querySelector(".quiz-input"),
      "quiz-input",
    );
  }

  function pendingAnswerEventDetail(queueController, answer, results) {
    const queue = queueController.quizQueue;
    const subject = queue.currentItem;
    const questionType = queue.questionType;

    if (!subject || !questionType) {
      return null;
    }

    const subjectWithStats = JSON.parse(
      JSON.stringify({ subject, stats: queue.stats.get(subject) }),
    );
    const stats = subjectWithStats.stats;
    const passed = results.action === "pass";
    stats[questionType].complete = passed;
    if (!passed) {
      stats[questionType].incorrect += 1;
    }

    const complete = stats.meaning.complete && stats.reading.complete;
    // Native updateSRS calculates feedback without mutating the queue.
    const srs = complete ? queue.srsManager.updateSRS(subjectWithStats) : {};

    return {
      subjectWithStats,
      questionType,
      answer,
      results,
      complete,
      srs,
    };
  }

  function withoutDidAnswerQuestion(callback) {
    const dispatchEvent = window.dispatchEvent;

    window.dispatchEvent = function (event) {
      if (event?.type === "didAnswerQuestion") {
        return true;
      }
      return dispatchEvent.call(this, event);
    };

    try {
      return callback();
    } finally {
      window.dispatchEvent = dispatchEvent;
    }
  }

  function installPendingAnswerTransaction(controller) {
    if (!controller) {
      return null;
    }

    let queueController;

    try {
      queueController = controller.quizQueueOutlet;
    } catch {
      return null;
    }

    if (
      !queueController ||
      typeof queueController.submitAnswer !== "function" ||
      typeof queueController.nextItem !== "function" ||
      typeof queueController.quizQueue?.stats?.get !== "function" ||
      typeof queueController.quizQueue?.srsManager?.updateSRS !== "function"
    ) {
      return null;
    }

    if (pendingAnswerTransaction?.queueController === queueController) {
      return pendingAnswerTransaction;
    }

    pendingAnswerTransaction?.uninstall();

    const submitAnswer = queueController.submitAnswer;
    const nextItem = queueController.nextItem;
    const databaseManager = window.dbManager;
    const logAnswer = databaseManager?.logAnswer;
    let wrappedLogAnswer = null;
    let pendingAnswer = null;
    let transaction = null;

    if (
      typeof logAnswer === "function" &&
      typeof databaseManager.createTransaction === "function"
    ) {
      wrappedLogAnswer = function (item) {
        const answer = pendingAnswer;
        if (
          !isReviewPage() ||
          !answer ||
          item.id !== queueController.quizQueue.currentItem.id ||
          item.questionType !== queueController.quizQueue.questionType ||
          item.answer !== answer.answer
        ) {
          return logAnswer.call(this, item);
        }

        // Capture the exact IndexedDB key; matching answer text can erase retries.
        answer.historyLogWrite = this.createTransaction(
          {
            storeName: "answer-log",
            mode: "readwrite",
            resolveOnTransactionComplete: true,
          },
          ({ store }) => {
            const request = store.put(item);
            request.onsuccess = () => {
              answer.historyLogKey = request.result;
            };
          },
        );
        return answer.historyLogWrite;
      };
      databaseManager.logAnswer = wrappedLogAnswer;
    }

    const wrappedSubmitAnswer = (answer, results) => {
      if (!isReviewPage()) {
        return submitAnswer.call(queueController, answer, results);
      }
      const detail = pendingAnswerEventDetail(queueController, answer, results);
      if (!detail) {
        return submitAnswer.call(queueController, answer, results);
      }
      pendingAnswer = { answer, results, complete: detail.complete };
      window.dispatchEvent(new CustomEvent("didAnswerQuestion", { detail }));
    };

    const wrappedNextItem = (questionType) => {
      if (!isReviewPage()) {
        return nextItem.call(queueController, questionType);
      }
      transaction.flush();
      return nextItem.call(queueController, questionType);
    };

    transaction = {
      queueController,
      discard() {
        const discardedAnswer = pendingAnswer;
        pendingAnswer = null;
        if (discardedAnswer?.historyLogWrite) {
          discardedAnswer.historyLogWrite
            .then(() =>
              databaseManager.createTransaction(
                {
                  storeName: "answer-log",
                  mode: "readwrite",
                  resolveOnTransactionComplete: true,
                },
                ({ store }) => store.delete(discardedAnswer.historyLogKey),
              ),
            )
            .then(() =>
              window.Stimulus?.getControllerForElementAndIdentifier?.(
                document.querySelector('[data-controller~="last-answers"]'),
                "last-answers",
              )?.renderItems(),
            )
            .catch((error) => {
              console.error(
                `[${NAME}] Redo could not restore Last Answers:`,
                error,
              );
            });
        }
        return discardedAnswer;
      },
      flush() {
        if (!pendingAnswer) {
          return;
        }

        const { answer, results } = pendingAnswer;
        withoutDidAnswerQuestion(() => {
          submitAnswer.call(queueController, answer, results);
        });
        pendingAnswer = null;
      },
      hasPendingAnswer() {
        return pendingAnswer !== null;
      },
      uninstall() {
        try {
          transaction.flush();
        } finally {
          if (queueController.submitAnswer === wrappedSubmitAnswer) {
            queueController.submitAnswer = submitAnswer;
          }

          if (queueController.nextItem === wrappedNextItem) {
            queueController.nextItem = nextItem;
          }
          if (databaseManager?.logAnswer === wrappedLogAnswer) {
            databaseManager.logAnswer = logAnswer;
          }
        }
      },
    };

    queueController.submitAnswer = wrappedSubmitAnswer;
    queueController.nextItem = wrappedNextItem;

    pendingAnswerTransaction = transaction;

    return transaction;
  }

  function undoQuizStatistics({ results, complete }) {
    const statisticsElement = document.querySelector(
      '[data-controller~="quiz-statistics"]',
    );
    const statisticsController =
      window.Stimulus?.getControllerForElementAndIdentifier?.(
        statisticsElement,
        "quiz-statistics",
      );

    if (
      !statisticsController ||
      typeof statisticsController.answeredCount !== "number" ||
      typeof statisticsController.incorrectCount !== "number"
    ) {
      return;
    }

    statisticsController.answeredCount = Math.max(
      0,
      statisticsController.answeredCount - 1,
    );

    if (results.action === "fail") {
      statisticsController.incorrectCount = Math.max(
        0,
        statisticsController.incorrectCount - 1,
      );
    }

    if (complete) {
      statisticsController.completedCount -= 1;
      statisticsController.remainingCount += 1;
      statisticsController.completeCountTarget.innerText = `${statisticsController.completedCount}`;
      statisticsController.remainingCountTarget.innerText = `${statisticsController.remainingCount}`;
    }

    const percentCorrect =
      statisticsController.answeredCount === 0
        ? 100
        : Math.round(
            ((statisticsController.answeredCount -
              statisticsController.incorrectCount) *
              100) /
              statisticsController.answeredCount,
          );
    if (statisticsController.percentCorrectTarget) {
      statisticsController.percentCorrectTarget.innerText = `${percentCorrect}%`;
    }
  }

  function updateRedoButtonState() {
    const redoButton = getRedoButton();
    const inputContainer = document.querySelector(
      ".quiz-input__input-container",
    );

    if (!redoButton || !inputContainer) {
      return;
    }

    const transaction = installPendingAnswerTransaction(
      getQuizInputController(),
    );
    const canRedo =
      inputContainer.hasAttribute("correct") && transaction?.hasPendingAnswer();

    redoButton.classList.toggle(DISABLED_CLASS, !canRedo);
    redoButton.setAttribute("aria-disabled", String(!canRedo));
  }

  function resetAnswerFeedback() {
    const itemInfoToggle = document.querySelector(
      ".additional-content__item--item-info",
    );
    const additionalContentController =
      window.Stimulus?.getControllerForElementAndIdentifier?.(
        itemInfoToggle?.closest('[data-controller~="additional-content"]'),
        "additional-content",
      );
    if (additionalContentController?.currentContainer?.id === "item-info") {
      additionalContentController.close();
    }
    itemInfoToggle?.classList.add(DISABLED_CLASS);

    window.Stimulus?.getControllerForElementAndIdentifier?.(
      document.querySelector('[data-controller~="quiz-audio"]'),
      "quiz-audio",
    )?.clearSources();
    for (const element of document.querySelectorAll(
      '#item-info [data-controller~="audio-player"]',
    )) {
      window.Stimulus?.getControllerForElementAndIdentifier?.(
        element,
        "audio-player",
      )?.stop();
    }

    const answerException = document.querySelector(".answer-exception");
    if (answerException) {
      answerException.classList.add("answer-exception--hidden");
      answerException.textContent = "";
    }

    const srsContainer = document.querySelector(
      '[data-quiz-header-target~="srsContainer"]',
    );
    if (srsContainer) {
      srsContainer.dataset.hidden = "true";
    }
  }

  function redoAnswer() {
    if (!isReviewPage()) {
      return;
    }
    const controller = getQuizInputController();
    if (!controller) {
      return;
    }

    const transaction = installPendingAnswerTransaction(controller);
    const inputContainer = document.querySelector(
      ".quiz-input__input-container",
    );
    const previousState = {
      lastAnswer: controller.lastAnswer,
      inputChars: controller.inputChars,
      inputEnabled: controller.inputEnabled,
      correct: inputContainer?.getAttribute("correct"),
    };

    controller.lastAnswer = null;
    controller.inputChars = "";
    controller.inputEnabled = true;

    inputContainer?.removeAttribute("correct");

    try {
      controller.updateQuestion({
        detail: {
          subject: controller.currentSubject,
          questionType: controller.currentQuestionType,
        },
      });
    } catch (error) {
      controller.lastAnswer = previousState.lastAnswer;
      controller.inputChars = previousState.inputChars;
      controller.inputEnabled = previousState.inputEnabled;

      if (previousState.correct === null) {
        inputContainer?.removeAttribute("correct");
      } else {
        inputContainer?.setAttribute("correct", previousState.correct);
      }

      console.error(`[${NAME}] Redo failed:`, error);
      return;
    }

    const discardedAnswer = transaction?.discard();
    if (discardedAnswer) {
      undoQuizStatistics(discardedAnswer);
    }

    requestAnimationFrame(() => {
      resetAnswerFeedback();

      const input = document.querySelector("#user-response");
      if (!input) {
        return;
      }

      input.value = "";
      input.setAttribute("enabled", "true");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();

      updateRedoButtonState();
    });
  }

  function createRedoButton() {
    const li = document.createElement("li");

    li.className =
      "additional-content__menu-item additional-content__menu-item--5";

    li.innerHTML = `
      <a class="additional-content__item additional-content__item--redo-answer additional-content__item--disabled"
         title="Redo Answer"
         tabindex="0"
         role="button"
         aria-disabled="true">
        <div class="additional-content__item-text">Redo</div>
        <div class="additional-content__item-icon-container">
          <svg class="wk-icon wk-icon--redo" viewBox="0 0 512 512" aria-hidden="true">
            <use href="#wk-icon__redo"></use>
          </svg>
        </div>
      </a>
    `;

    const button = li.querySelector("a");

    button.addEventListener("click", () => {
      if (button.getAttribute("aria-disabled") !== "true") {
        redoAnswer();
      }
    });

    button.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();

      if (button.getAttribute("aria-disabled") !== "true") {
        redoAnswer();
      }
    });

    return li;
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${MENU_CLASS} > .additional-content__menu-item {
        flex: 1 1 0px;
        min-width: 0;
        width: auto;
      }
    `;
    (document.head || document.documentElement).append(style);
  }

  function injectRedoButton() {
    if (!isReviewPage()) {
      return;
    }
    if (getRedoButton()) {
      return;
    }

    const lastItemsLi = document
      .querySelector(".additional-content__item--last-items")
      ?.closest("li");

    if (!lastItemsLi) {
      return;
    }

    installStyles();
    lastItemsLi.parentElement.classList.add(MENU_CLASS);
    lastItemsLi.before(createRedoButton());
  }

  function run() {
    if (!isReviewPage()) {
      try {
        pendingAnswerTransaction?.uninstall();
        pendingAnswerTransaction = null;
      } finally {
        getRedoButton()?.closest("li")?.remove();
        document.querySelector(`.${MENU_CLASS}`)?.classList.remove(MENU_CLASS);
        document.getElementById(STYLE_ID)?.remove();
      }
      return;
    }

    installPendingAnswerTransaction(getQuizInputController());
    injectRedoButton();
    updateRedoButtonState();
  }

  function installNavigationWatcher() {
    let previousPath = location.pathname;

    const checkPath = () => {
      if (location.pathname === previousPath) {
        return;
      }

      previousPath = location.pathname;
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
      checkPath();
      return result;
    };

    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      checkPath();
      return result;
    };

    window.addEventListener("popstate", checkPath);

    window.addEventListener("pagehide", () => {
      pendingAnswerTransaction?.flush();
    });

    document.addEventListener("turbo:before-visit", () => {
      pendingAnswerTransaction?.flush();
    });
  }

  const observer = new MutationObserver(run);

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["correct"],
    childList: true,
    subtree: true,
  });

  console.debug(`[${NAME}] Script loaded, version ${VERSION}`);
  installNavigationWatcher();
  run();
})();
