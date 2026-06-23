// ==UserScript==
// @name         WaniKani Redo Answer
// @namespace    wk-redo-answer
// @version      0.1.0
// @author       Federico G. Schwindt <fgsch@lodoss.net>
// @description  Adds a Redo button to WaniKani review and extra study quizzes.
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

  function isQuizPage() {
    return /^\/subjects\/(?:review|extra_study)(?:\/|$)/.test(location.pathname);
  }

  function getRedoButton() {
    return document.querySelector(REDO_SELECTOR);
  }

  function getQuizInputController() {
    return window.Stimulus?.getControllerForElementAndIdentifier?.(
      document.querySelector(".quiz-input"),
      "quiz-input"
    );
  }

  function updateRedoButtonState() {
    const redoButton = getRedoButton();
    const inputContainer = document.querySelector(".quiz-input__input-container");

    if (!redoButton || !inputContainer) return;

    const canRedo = inputContainer.hasAttribute("correct");

    redoButton.classList.toggle(DISABLED_CLASS, !canRedo);
    redoButton.setAttribute("aria-disabled", String(!canRedo));
  }

  function resetItemInfo() {
    document
      .querySelector(".additional-content__item--item-info")
      ?.classList.add(DISABLED_CLASS);

    document
      .querySelector(".additional-content__item--item-info")
      ?.classList.remove("additional-content__item--active");

    const answerException = document.querySelector(".answer-exception");
    if (answerException) {
      answerException.classList.add("answer-exception--hidden");
      answerException.textContent = "";
    }

    const subjectInfoFrame = document.querySelector(
      "turbo-frame#subject-info, turbo-frame.subject-info"
    );

    if (subjectInfoFrame) {
      subjectInfoFrame.innerHTML = "";
    }
  }

  function redoAnswer() {
    const controller = getQuizInputController();
    if (!controller) return;

    controller.lastAnswer = null;
    controller.inputChars = [];

    document
      .querySelector(".quiz-input__input-container")
      ?.removeAttribute("correct");

    try {
      controller.updateQuestion({
        detail: {
          subject: controller.currentSubject,
          questionType: controller.currentQuestionType,
        },
      });
    } catch (error) {
      console.error("Redo failed:", error);
      return;
    }

    requestAnimationFrame(() => {
      resetItemInfo();

      const input = document.querySelector("#user-response");
      if (!input) return;

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
      if (event.key !== "Enter" && event.key !== " ") return;

      event.preventDefault();

      if (button.getAttribute("aria-disabled") !== "true") {
        redoAnswer();
      }
    });

    return li;
  }

  function injectRedoButton() {
    if (!isQuizPage()) return;
    if (getRedoButton()) return;

    const lastItemsLi = document
      .querySelector(".additional-content__item--last-items")
      ?.closest("li");

    if (!lastItemsLi) return;

    lastItemsLi.before(createRedoButton());
  }

  function run() {
    if (!isQuizPage()) return;

    injectRedoButton();
    updateRedoButtonState();
  }

  function installNavigationWatcher() {
    let previousPath = location.pathname;

    const checkPath = () => {
      if (location.pathname === previousPath) return;

      previousPath = location.pathname;
      run();
    };

    if (window.navigation && typeof window.navigation.addEventListener === "function") {
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
  }

  const observer = new MutationObserver(run);

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["correct"],
    childList: true,
    subtree: true,
  });

  installNavigationWatcher();
  run();
})();
