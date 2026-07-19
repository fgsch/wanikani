import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertCustomProperties,
  contrastRatio,
  createDom,
  loadCatppuccinMocha,
  loadUserscript,
  parseColor,
  resolveCustomProperty,
} from "./support/userscript-harness.js";

test("Catppuccin Mocha follows a dark system preference by default", async () => {
  const dom = createDom("<main>Dashboard</main>", "https://www.wanikani.com/");

  await loadCatppuccinMocha(dom);

  const toggle = dom.window.document.querySelector(
    "#wk-catppuccin-mocha-toggle",
  );

  assert.equal(
    dom.window.document.documentElement.hasAttribute("data-wk-mocha-active"),
    true,
  );
  assert.equal(
    dom.window.document.documentElement.dataset.wkMochaMode,
    "system",
  );
  assert.equal(toggle?.textContent.trim(), "System");
  assert.equal(
    toggle?.getAttribute("aria-label"),
    "Theme: System. Click for Dark.",
  );
});

test("Catppuccin Mocha defaults to system mode when storage reads fail", async () => {
  const dom = createDom("<main>Dashboard</main>", "https://www.wanikani.com/");
  Object.defineProperty(dom.window.Storage.prototype, "getItem", {
    configurable: true,
    value() {
      throw new dom.window.DOMException("Storage denied", "SecurityError");
    },
  });

  await loadCatppuccinMocha(dom);

  assert.equal(
    dom.window.document.documentElement.dataset.wkMochaMode,
    "system",
  );
  assert.equal(
    dom.window.document.documentElement.hasAttribute("data-wk-mocha-active"),
    true,
  );
});

test("Catppuccin Mocha applies a selected mode when storage writes fail", async () => {
  const dom = createDom("<main>Dashboard</main>", "https://www.wanikani.com/");
  Object.defineProperty(dom.window.Storage.prototype, "setItem", {
    configurable: true,
    value() {
      throw new dom.window.DOMException("Storage denied", "SecurityError");
    },
  });

  await loadCatppuccinMocha(dom, false);

  const root = dom.window.document.documentElement;
  const toggle = dom.window.document.querySelector(
    "#wk-catppuccin-mocha-toggle",
  );
  toggle.click();

  assert.equal(root.dataset.wkMochaMode, "dark");
  assert.equal(root.hasAttribute("data-wk-mocha-active"), true);
  assert.equal(toggle.textContent.trim(), "Dark");
});

test("Catppuccin Mocha toggle stays in the lower-left corner in light mode", async () => {
  const dom = createDom("<main>Dashboard</main>", "https://www.wanikani.com/");

  await loadCatppuccinMocha(dom, false);

  const toggle = dom.window.document.querySelector(
    "#wk-catppuccin-mocha-toggle",
  );
  const toggleStyle = dom.window.getComputedStyle(toggle);

  assert.equal(toggleStyle.bottom, "16px");
  assert.equal(toggleStyle.left, "16px");
  assert.equal(toggleStyle.right, "auto");
});

test("Catppuccin Mocha toggle cycles through and persists manual overrides", async () => {
  const dom = createDom("<main>Dashboard</main>", "https://www.wanikani.com/");

  await loadCatppuccinMocha(dom, false);

  const root = dom.window.document.documentElement;
  const toggle = dom.window.document.querySelector(
    "#wk-catppuccin-mocha-toggle",
  );

  toggle.click();
  assert.equal(root.dataset.wkMochaMode, "dark");
  assert.equal(root.hasAttribute("data-wk-mocha-active"), true);
  assert.equal(toggle.textContent.trim(), "Dark");
  assert.equal(
    dom.window.localStorage.getItem("wk-catppuccin-mocha-mode"),
    "dark",
  );

  toggle.click();
  assert.equal(root.dataset.wkMochaMode, "light");
  assert.equal(root.hasAttribute("data-wk-mocha-active"), false);
  assert.equal(toggle.textContent.trim(), "Light");
  assert.equal(
    dom.window.localStorage.getItem("wk-catppuccin-mocha-mode"),
    "light",
  );

  toggle.click();
  assert.equal(root.dataset.wkMochaMode, "system");
  assert.equal(root.hasAttribute("data-wk-mocha-active"), false);
  assert.equal(toggle.textContent.trim(), "System");
  assert.equal(
    dom.window.localStorage.getItem("wk-catppuccin-mocha-mode"),
    "system",
  );
});

test("Catppuccin Mocha restores a saved override instead of the system preference", async () => {
  const dom = createDom("<main>Dashboard</main>", "https://www.wanikani.com/");
  dom.window.localStorage.setItem("wk-catppuccin-mocha-mode", "light");

  await loadCatppuccinMocha(dom);

  const root = dom.window.document.documentElement;
  const toggle = dom.window.document.querySelector(
    "#wk-catppuccin-mocha-toggle",
  );

  assert.equal(root.dataset.wkMochaMode, "light");
  assert.equal(root.hasAttribute("data-wk-mocha-active"), false);
  assert.equal(toggle.textContent.trim(), "Light");
});

test("Catppuccin Mocha restores its control after Turbo replaces the page body", async () => {
  const dom = createDom("<main>Dashboard</main>", "https://www.wanikani.com/");

  await loadCatppuccinMocha(dom);

  dom.window.document.body.innerHTML = "<main>Kanji</main>";
  dom.window.document.dispatchEvent(new dom.window.Event("turbo:load"));

  assert.equal(
    dom.window.document.querySelectorAll("#wk-catppuccin-mocha-toggle").length,
    1,
  );
  assert.equal(
    dom.window.document.querySelectorAll("#wk-catppuccin-mocha-styles").length,
    1,
  );
  assert.equal(
    dom.window.document.documentElement.hasAttribute("data-wk-mocha-active"),
    true,
  );
});

test("Catppuccin Mocha applies at document start and adds its control when the body arrives", async () => {
  const dom = createDom("<main>Dashboard</main>", "https://www.wanikani.com/");
  dom.window.document.body.remove();

  await loadCatppuccinMocha(dom);

  assert.equal(
    dom.window.document.documentElement.hasAttribute("data-wk-mocha-active"),
    true,
  );
  assert.equal(
    dom.window.document.querySelector("#wk-catppuccin-mocha-toggle"),
    null,
  );

  dom.window.document.documentElement.append(
    dom.window.document.createElement("body"),
  );
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));

  assert.ok(dom.window.document.querySelector("#wk-catppuccin-mocha-toggle"));
});

for (const { name, html, url, selector, expected } of [
  {
    name: "Catppuccin Mocha defines its base palette",
    html: "<main>Dashboard</main>",
    url: "https://www.wanikani.com/",
    selector: ":root",
    expected: {
      "--wk-dark-background": "#1e1e2e",
      "--wk-dark-surface": "#181825",
      "--wk-dark-surface-raised": "#313244",
      "--wk-dark-surface-hover": "#45475a",
      "--wk-dark-border": "#585b70",
      "--wk-dark-text": "#cdd6f4",
      "--wk-dark-text-muted": "#a6adc8",
      "--color-link": "#89b4fa",
    },
  },
  {
    name: "Catppuccin Mocha uses palette surfaces for review forecast row interactions",
    html: `<style>
      :root {
        --color-review-forecast-day-hover: #f4f4f4;
        --color-review-forecast-day-active: #e7e9eb;
      }
    </style>
    <a class="review-forecast-widget__row" href="/review/session">Today</a>`,
    url: "https://www.wanikani.com/dashboard",
    selector: ".review-forecast-widget__row",
    expected: {
      "--color-review-forecast-day-hover": "#45475a",
      "--color-review-forecast-day-active": "#585b70",
    },
  },
  {
    name: "Catppuccin Mocha styles lesson and review counts in the global header",
    html: `<style>
      :root {
        --color-lesson-and-review-border: #cad0d6;
        --color-lesson-and-review-border-hover: #6b7079;
        --color-lesson-and-review-count-background: #6b7079;
        --color-lesson-and-review-count-zero-background: #aaa;
        --color-lesson-and-review-count-text: #fff;
      }
    </style>
    <header class="global-header"><div class="lesson-and-review-count"></div></header>`,
    url: "https://www.wanikani.com/",
    selector: ":root",
    expected: {
      "--color-lesson-and-review-border": "#585b70",
      "--color-lesson-and-review-border-hover": "#6c7086",
      "--color-lesson-and-review-count-background": "#585b70",
      "--color-lesson-and-review-count-zero-background": "#45475a",
      "--color-lesson-and-review-count-text": "#cdd6f4",
    },
  },
  {
    name: "Catppuccin Mocha uses palette colors for dashboard progress bars",
    html: `<style>
      :root {
        --color-review-forecast-bar-positive: #35a753;
        --color-review-forecast-bar-positive-border: #317442;
        --color-review-forecast-increase-positive: #317442;
        --color-review-forecast-priority-count-inside: #fff;
        --color-review-forecast-bar-zero: #f4f4f4;
        --color-review-forecast-bar-zero-border: #cad0d6;
        --color-level-progress-completed-bar: #35a753;
        --color-level-progress-bar: #cad0d6;
        --color-progress-chart-bar: #35a753;
        --color-subject-srs-progress-stage-complete-background: #08c66c;
      }
    </style>
    <section class="review-forecast-widget"></section>
    <section class="level-progress-widget"></section>`,
    url: "https://www.wanikani.com/dashboard",
    selector: ":root",
    expected: {
      "--color-review-forecast-bar-positive": "#a6e3a1",
      "--color-review-forecast-bar-positive-border": "#a6e3a1",
      "--color-review-forecast-increase-positive": "#a6e3a1",
      "--color-review-forecast-priority-count-inside": "#11111b",
      "--color-review-forecast-bar-zero": "#45475a",
      "--color-review-forecast-bar-zero-border": "#585b70",
      "--color-level-progress-completed-bar": "#a6e3a1",
      "--color-level-progress-bar": "#585b70",
      "--color-progress-chart-bar": "#a6e3a1",
      "--color-subject-srs-progress-stage-complete-background": "#a6e3a1",
    },
  },
]) {
  test(name, async () => {
    const dom = createDom(html, url);

    await loadCatppuccinMocha(dom);

    assertCustomProperties(
      dom,
      dom.window.document.querySelector(selector),
      expected,
    );
  });
}

test("Catppuccin Mocha applies its palette to pitch accent variants", async () => {
  const dom = createDom(
    `<div class="wk-pitch-accent">
      <figure class="wk-pitch-accent-variant-1"></figure>
      <figure class="wk-pitch-accent-variant-2"></figure>
      <figure class="wk-pitch-accent-variant-3"></figure>
      <figure class="wk-pitch-accent-variant-4"></figure>
    </div>`,
    "https://www.wanikani.com/vocabulary/%E9%A3%9F%E3%81%B9%E3%82%8B",
  );

  await loadCatppuccinMocha(dom);

  const variants = dom.window.document.querySelectorAll(
    "[class^='wk-pitch-accent-variant-']",
  );
  const expected = ["#a6e3a1", "#f5c2e7", "#89b4fa", "#fab387"];

  for (const [index, variant] of variants.entries()) {
    assertCustomProperties(dom, variant, {
      "--wk-pitch-accent-color": expected[index],
    });
  }
});

test("Catppuccin Mocha adds palette accents to browser interaction states", async () => {
  const dom = createDom(
    '<a href="/subjects">Subjects</a><input value="search">',
    "https://www.wanikani.com/",
  );

  await loadCatppuccinMocha(dom);

  const root = dom.window.document.documentElement;
  const styles = dom.window.document.querySelector(
    "#wk-catppuccin-mocha-styles",
  ).textContent;

  assertCustomProperties(dom, root, {
    "--ctp-mocha-rosewater": "#f5e0dc",
    "--ctp-mocha-lavender": "#b4befe",
    "--ctp-mocha-overlay-2": "#9399b2",
    "--color-quiz-input-focus": "#b4befe",
    "--color-modal-button-edge": "#6c7086",
  });
  assert.match(styles, /::selection[^}]+--ctp-mocha-overlay-2/s);
  assert.match(
    styles,
    /input,[^{]+textarea,[^{]+select[^}]+caret-color:[^;]+--ctp-mocha-rosewater/s,
  );
  assert.doesNotMatch(styles, /a:visited[^}]+--ctp-mocha-lavender/s);
  assert.match(styles, /:focus-visible[^}]+--ctp-mocha-lavender/s);
});

test("Catppuccin Mocha replaces light quiz chrome with palette surfaces", async () => {
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

  await loadCatppuccinMocha(dom);

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

test("Catppuccin Mocha replaces the Kana Chart light palette", async () => {
  const dom = createDom(
    `<style>
      .additional-content__content { background-color: #fafafa; border: 2px solid #d4d4d4; box-shadow: 2px 2px 4px #e3e3e3; }
      .kana-chart__tab:not(.kana-chart__tab--selected) { border-bottom: 2px solid #e0e0e0; color: #999; }
      .kana-chart__tab--selected { border: 2px solid #e0e0e0; }
      .kana-chart__backspace, .kana-chart__character { background-color: #eee; color: #333; }
      .kana-chart__character-romaji { color: #999; }
    </style>
    <div class="additional-content__content additional-content__content--open">
      <div class="kana-chart">
        <div class="kana-chart__tabs">
          <button class="kana-chart__tab kana-chart__tab--selected">あ</button>
          <button class="kana-chart__tab">か</button>
          <button class="kana-chart__backspace">Backspace</button>
        </div>
        <button class="kana-chart__character">
          <span class="kana-chart__character-kana">あ</span>
          <span class="kana-chart__character-romaji">a</span>
        </button>
      </div>
    </div>`,
    "https://www.wanikani.com/subjects/review",
  );

  await loadCatppuccinMocha(dom);

  const panel = dom.window.document.querySelector(
    ".additional-content__content",
  );
  const selectedTab = dom.window.document.querySelector(
    ".kana-chart__tab--selected",
  );
  const inactiveTab = dom.window.document.querySelector(
    ".kana-chart__tab:not(.kana-chart__tab--selected)",
  );
  const backspace = dom.window.document.querySelector(".kana-chart__backspace");
  const character = dom.window.document.querySelector(".kana-chart__character");
  const romaji = dom.window.document.querySelector(
    ".kana-chart__character-romaji",
  );

  assert.equal(
    dom.window.getComputedStyle(panel).backgroundColor,
    "var(--wk-dark-surface)",
  );
  assert.equal(
    dom.window.getComputedStyle(panel).borderColor,
    "rgb(88, 91, 112)",
  );
  assert.equal(dom.window.getComputedStyle(panel).boxShadow, "none");
  assert.equal(
    dom.window.getComputedStyle(selectedTab).backgroundColor,
    "var(--wk-dark-surface-raised)",
  );
  assert.equal(
    dom.window.getComputedStyle(inactiveTab).color,
    "var(--wk-dark-text-muted)",
  );
  for (const key of [backspace, character]) {
    const styles = dom.window.getComputedStyle(key);
    assert.equal(styles.backgroundColor, "var(--wk-dark-surface-raised)");
    assert.equal(styles.color, "var(--wk-dark-text)");
  }
  assert.equal(
    dom.window.getComputedStyle(romaji).color,
    "var(--wk-dark-text-muted)",
  );
});

test("Catppuccin Mocha replaces the legacy Help dropdown colors", async () => {
  const dom = createDom(
    `<style>
      .sitemap__expandable-chunk--help { background: #333; color: #e5e5e5; }
      .sitemap__page--subject { border-bottom: 1px solid rgba(255, 255, 255, .2); }
      .sitemap__page--subject a { color: #fff; }
    </style>
    <div class="sitemap__section sitemap__section--open">
      <div class="sitemap__expandable-chunk sitemap__expandable-chunk--help">
        <ul class="sitemap__pages">
          <li class="sitemap__page sitemap__page--subject">
            <a href="/faq">Knowledge Guide</a>
          </li>
          <li class="sitemap__page sitemap__page--subject">
            <a class="button--chat" href="/contact">Chat with Us</a>
          </li>
        </ul>
      </div>
    </div>`,
    "https://www.wanikani.com/",
  );

  await loadCatppuccinMocha(dom);

  const panel = dom.window.document.querySelector(
    ".sitemap__expandable-chunk--help",
  );
  const row = dom.window.document.querySelector(".sitemap__page--subject");
  const link = row.querySelector("a");
  const styles = dom.window.document.querySelector(
    "#wk-catppuccin-mocha-styles",
  ).textContent;

  assert.equal(
    dom.window.getComputedStyle(panel).backgroundColor,
    "var(--wk-dark-surface-raised)",
  );
  assert.equal(dom.window.getComputedStyle(panel).color, "var(--wk-dark-text)");
  assert.equal(
    dom.window.getComputedStyle(row).borderBottomColor,
    "rgb(88, 91, 112)",
  );
  assert.equal(dom.window.getComputedStyle(link).color, "var(--wk-dark-text)");
  assert.match(
    styles,
    /\.sitemap__expandable-chunk--help::before\s*\{[^}]*background-color:[^;]+--wk-dark-surface-raised/s,
  );
  assert.match(
    styles,
    /\.sitemap__page--subject a:hover,[^{]+\.button--chat:focus\s*\{[^}]*background-color:[^;]+--wk-dark-surface-hover/s,
  );
});

test("Catppuccin Mocha replaces the legacy Levels dropdown colors", async () => {
  const dom = createDom(
    `<style>
      .sitemap__expandable-chunk--levels { background: #666; }
      .sitemap__group-header { color: rgba(255, 255, 255, .5); }
      .sitemap__pages--levels .sitemap__page a {
        background-color: rgba(255, 255, 255, .1);
        color: #fff;
      }
      .sitemap__page--current-level a { border: 2px solid rgba(255, 255, 255, .5); }
    </style>
    <div class="sitemap__section sitemap__section--open">
      <div class="sitemap__expandable-chunk sitemap__expandable-chunk--levels">
        <h3 class="sitemap__group-header">Pleasant</h3>
        <ul class="sitemap__pages sitemap__pages--levels">
          <li class="sitemap__page"><a href="/level/1">01</a></li>
          <li class="sitemap__page sitemap__page--current-level"><a href="/level/4">04</a></li>
        </ul>
      </div>
    </div>`,
    "https://www.wanikani.com/",
  );

  await loadCatppuccinMocha(dom);

  const panel = dom.window.document.querySelector(
    ".sitemap__expandable-chunk--levels",
  );
  const heading = dom.window.document.querySelector(".sitemap__group-header");
  const link = dom.window.document.querySelector(".sitemap__page a");
  const styles = dom.window.document.querySelector(
    "#wk-catppuccin-mocha-styles",
  ).textContent;

  assert.equal(
    dom.window.getComputedStyle(panel).backgroundColor,
    "var(--wk-dark-surface-raised)",
  );
  assert.equal(
    dom.window.getComputedStyle(heading).color,
    "var(--wk-dark-text-muted)",
  );
  assert.equal(
    dom.window.getComputedStyle(link).backgroundColor,
    "var(--wk-dark-surface-hover)",
  );
  assert.equal(dom.window.getComputedStyle(link).color, "var(--wk-dark-text)");
  assert.match(
    styles,
    /\.sitemap__expandable-chunk--levels::before\s*\{[^}]*background-color:[^;]+--wk-dark-surface-raised/s,
  );
  assert.match(
    styles,
    /\.sitemap__pages--levels \.sitemap__page a:hover,[^{]+a:focus\s*\{[^}]*background-color:[^;]+--ctp-mocha-surface-2/s,
  );
  assert.match(
    styles,
    /\.sitemap__page--current-level a,[^{]+a:focus\s*\{[^}]*border-color:[^;]+--ctp-mocha-lavender/s,
  );
});

test("Catppuccin Mocha uses deliberate quiz input borders without light shadows", async () => {
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

  await loadCatppuccinMocha(dom);

  const inputs = dom.window.document.querySelectorAll(".quiz-input__input");

  for (const [index, input] of inputs.entries()) {
    input.focus();
    assert.equal(
      dom.window.getComputedStyle(input).borderColor,
      ["rgb(166, 227, 161)", "rgb(243, 139, 168)", "rgb(180, 190, 254)"][index],
    );
    assert.equal(dom.window.getComputedStyle(input).boxShadow, "none");
  }
});

test("Catppuccin Mocha uses palette colors for correct quiz answers", async () => {
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

  await loadCatppuccinMocha(dom);

  const root = dom.window.document.documentElement;

  assertCustomProperties(dom, root, {
    "--color-quiz-correct-background":
      "color-mix(in srgb,var(--ctp-mocha-green) 18%,var(--wk-dark-surface))",
    "--color-quiz-correct-text-color": "#cdd6f4",
  });
});

test("Catppuccin Mocha replaces light Extra Study controls with palette colors", async () => {
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

  await loadCatppuccinMocha(dom);

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

test("Catppuccin Mocha replaces light collocation pattern backgrounds", async () => {
  const dom = createDom(
    `<style>
      .subject-collocations__pattern-name { background-color: #e0e0e0; border: 1px solid transparent; }
    </style>
    <div class="subject-collocations">
      <a class="subject-collocations__pattern-name" aria-selected="true">〜の字</a>
      <a class="subject-collocations__pattern-name" aria-selected="false">字を〜</a>
    </div>`,
    "https://www.wanikani.com/vocabulary/%E5%AD%97",
  );

  await loadCatppuccinMocha(dom);

  const patterns = dom.window.document.querySelectorAll(
    ".subject-collocations__pattern-name",
  );

  assert.equal(
    dom.window.getComputedStyle(patterns[0]).backgroundColor,
    "var(--wk-dark-surface-hover)",
  );
  assert.equal(
    dom.window.getComputedStyle(patterns[1]).backgroundColor,
    "var(--wk-dark-surface-raised)",
  );
  assert.deepEqual(
    [...patterns].map((pattern) => {
      const styles = dom.window.getComputedStyle(pattern);
      return [styles.borderWidth, styles.borderStyle, styles.borderColor];
    }),
    [
      ["1px", "solid", "rgb(180, 190, 254)"],
      ["1px", "solid", "rgb(88, 91, 112)"],
    ],
  );
});

test("Catppuccin Mocha keeps mnemonic highlights readable", async () => {
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

  await loadCatppuccinMocha(dom);

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

test("Catppuccin Mocha keeps subject legend characters readable", async () => {
  const dom = createDom(
    `<style>
      .subject-legend-character--radical { color: var(--color-blue-dark); }
      .subject-legend-character--kanji { color: var(--color-pink-dark); }
      .subject-legend-character--vocabulary { color: var(--color-purple-dark); }
      .subject-legend-character--review,
      .subject-legend-character--burned { color: #fff; }
    </style>
    <div class="subject-legend">
      <ul class="subject-legend__items">
        ${["locked", "lesson", "review"]
          .flatMap((state) =>
            ["radical", "kanji", "vocabulary"].map(
              (category) =>
                `<li><div class="subject-legend-character subject-legend-character--${category} subject-legend-character--${state}">${category}-${state}</div></li>`,
            ),
          )
          .join("")}
        <li><div class="subject-legend-character subject-legend-character--group subject-legend-character--burned">Burned</div></li>
      </ul>
    </div>`,
    "https://www.wanikani.com/level/4",
  );

  await loadCatppuccinMocha(dom);

  for (const character of dom.window.document.querySelectorAll(
    ".subject-legend-character",
  )) {
    const category = ["radical", "kanji", "vocabulary"].find((candidate) =>
      character.classList.contains(`subject-legend-character--${candidate}`),
    );
    const expectedColor = character.classList.contains(
      "subject-legend-character--locked",
    )
      ? `var(--color-${category})`
      : "var(--ctp-mocha-text)";
    assert.equal(
      dom.window.getComputedStyle(character).color,
      expectedColor,
      character.textContent,
    );
  }
});

test("Catppuccin Mocha keeps lesson queue subject labels readable", async () => {
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

  await loadCatppuccinMocha(dom);

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
      assert.equal(styles.color, "var(--ctp-mocha-text)");
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
      `var(--color-${category})`,
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

test("Catppuccin Mocha keeps subject characters readable across states", async () => {
  const dom = createDom(
    `<style>
      .subject-character--radical .subject-character__characters-text {
        color: var(--color-blue-dark);
      }
      .subject-character--kanji .subject-character__characters-text {
        color: var(--color-pink-dark);
      }
      .subject-character--vocabulary .subject-character__characters-text {
        color: var(--color-purple-dark);
      }
      .subject-character--passed .subject-character__characters-text,
      .subject-character--unlocked .subject-character__characters-text,
      .subject-character--burned .subject-character__characters-text {
        color: #fff;
      }
    </style>
    <div class="subject-character-grid">
      ${["radical", "kanji", "vocabulary"]
        .flatMap((category) =>
          ["base", "locked", "recent", "passed", "unlocked", "burned"].map(
            (state) =>
              `<span class="subject-character subject-character--${category}${
                state === "base" ? "" : ` subject-character--${state}`
              }"><span class="subject-character__characters-text">${category}-${state}</span></span>`,
          ),
        )
        .join("")}
    </div>`,
    "https://www.wanikani.com/kanji/%E5%B9%B4",
  );

  await loadCatppuccinMocha(dom);

  const themeStyles = dom.window.document.querySelector(
    "#wk-catppuccin-mocha-styles",
  ).textContent;
  assert.match(
    themeStyles,
    /html\[data-wk-mocha-active\] \.subject-character__characters-text\s*\{\s*color:\s*var\(--ctp-mocha-text\) !important;/,
  );

  for (const character of dom.window.document.querySelectorAll(
    ".subject-character",
  )) {
    const category = ["radical", "kanji", "vocabulary"].find((candidate) =>
      character.classList.contains(`subject-character--${candidate}`),
    );
    const expectedColor = character.classList.contains(
      "subject-character--locked",
    )
      ? `var(--color-${category})`
      : "var(--ctp-mocha-text)";
    assert.equal(
      dom.window.getComputedStyle(
        character.querySelector(".subject-character__characters-text"),
      ).color,
      expectedColor,
      character.textContent,
    );
  }
});

test("Catppuccin Mocha keeps filled subject box characters contrasting", async () => {
  const dom = createDom(
    `<style>
      .subject-character--radical .subject-character__characters-text {
        background: var(--color-blue);
        color: var(--color-blue-dark);
      }
      .subject-character--kanji .subject-character__characters-text {
        background: var(--color-pink);
        color: var(--color-pink-dark);
      }
      .subject-character--vocabulary .subject-character__characters-text {
        background: var(--color-purple);
        color: var(--color-purple-dark);
      }
      .subject-character--unlocked .subject-character__characters-text,
      .subject-character--passed .subject-character__characters-text {
        color: var(--color-white);
      }
    </style>
    <section class="subject-section subject-section--components">
      <span class="subject-character subject-character--radical subject-character--unlocked">
        <span class="subject-character__characters-text">Leader</span>
      </span>
      <div class="subject-character-grid">
        <span class="subject-character subject-character--kanji subject-character--unlocked">
          <span class="subject-character__characters-text">年</span>
        </span>
      </div>
      <span class="subject-character subject-character--vocabulary subject-character--unlocked subject-character--expandable">
        <span class="subject-character__characters-text">先</span>
      </span>
    </section>`,
    "https://www.wanikani.com/kanji/%E5%B9%B4",
  );

  await loadCatppuccinMocha(dom);

  for (const category of ["radical", "kanji", "vocabulary"]) {
    const characters = dom.window.document.querySelector(
      `.subject-character--${category} .subject-character__characters-text`,
    );

    assert.equal(
      dom.window.getComputedStyle(characters).color,
      "var(--ctp-mocha-text)",
    );
  }
});

test("Catppuccin Mocha replaces the light expandable subject frame", async () => {
  const dom = createDom(
    `<span class="subject-character subject-character--vocabulary subject-character--unlocked subject-character--expandable">
      <span class="subject-character__characters">
        <span class="subject-character__characters-text">北アメリカ</span>
      </span>
    </span>`,
    "https://www.wanikani.com/vocabulary/%E5%8C%97%E3%82%A2%E3%83%A1%E3%83%AA%E3%82%AB",
  );

  await loadCatppuccinMocha(dom);

  const styles = dom.window.document.querySelector(
    "#wk-catppuccin-mocha-styles",
  ).textContent;
  const frameRule = styles.match(
    /\.subject-character--expandable \.subject-character__characters:hover::before\s*\{([^}]*)\}/s,
  )?.[1];

  assert.ok(frameRule);
  assert.match(
    frameRule,
    /background-color:\s*var\(--wk-dark-surface-raised\)/,
  );
  assert.match(frameRule, /border:\s*1px solid #585b70/);
  assert.match(frameRule, /box-shadow:[^;]+--ctp-mocha-crust/);
});

test("Catppuccin Mocha replaces the light subject lesson slide", async () => {
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

  await loadCatppuccinMocha(dom);

  const slide = dom.window.document.querySelector(".subject-slide");
  const slideStyles = dom.window.getComputedStyle(slide);

  assert.equal(slideStyles.backgroundColor, "var(--wk-dark-surface)");
});

test("Catppuccin Mocha uses its teal for the lesson Quiz button", async () => {
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

  await loadCatppuccinMocha(dom);

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

test("Catppuccin Mocha colors lesson and quiz headers by subject category", async () => {
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

  await loadCatppuccinMocha(dom);

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

test("Catppuccin Mocha replaces the light review item info background", async () => {
  const dom = createDom(
    `<style>
      .subject-info { background-color: #fafafa; }
    </style>
    <turbo-frame class="subject-info" id="subject-info">
      <section class="subject-section">Item information</section>
    </turbo-frame>`,
    "https://www.wanikani.com/subjects/review",
  );

  await loadCatppuccinMocha(dom);

  const itemInfo = dom.window.document.querySelector("#subject-info");

  assert.equal(
    dom.window.getComputedStyle(itemInfo).backgroundColor,
    "var(--wk-dark-surface)",
  );
});

test("Catppuccin Mocha keeps sitemap section headers readable", async () => {
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

  await loadCatppuccinMocha(dom);

  const root = dom.window.document.documentElement;
  const sectionHeader = dom.window.document.querySelector(
    ".sitemap__section-header",
  );
  const computedColor = dom.window.getComputedStyle(sectionHeader).color;
  const foreground = parseColor(
    computedColor.startsWith("var(")
      ? resolveCustomProperty(dom, sectionHeader, computedColor.slice(4, -1))
      : computedColor,
  );
  const background = parseColor(
    resolveCustomProperty(dom, root, "--color-global-header-background"),
  );

  assert.ok(contrastRatio(foreground, background) >= 4.5);
});

test("Catppuccin Mocha gives generic sitemap headers visible interaction borders", async () => {
  const dom = createDom(
    `<header class="global-header">
      <button class="sitemap__section-header">Levels</button>
      <button class="sitemap__section-header">Help</button>
      <button class="sitemap__section-header sitemap__section-header--radicals">Radicals</button>
    </header>`,
    "https://www.wanikani.com/recent-unlocks",
  );

  await loadCatppuccinMocha(dom);

  const styles = dom.window.document.querySelector(
    "#wk-catppuccin-mocha-styles",
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

test("Catppuccin Mocha colors category sitemap headers and menus", async () => {
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

  await loadCatppuccinMocha(dom);

  const styles = dom.window.document.querySelector(
    "#wk-catppuccin-mocha-styles",
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

test("Catppuccin Mocha keeps completed lesson and review widgets readable", async () => {
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

  await loadCatppuccinMocha(dom);

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

test("Catppuccin Mocha keeps review forecast header text readable", async () => {
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

  await loadCatppuccinMocha(dom);

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
    const foreground = parseColor(resolveCustomProperty(dom, header, property));

    assert.ok(contrastRatio(foreground, background) >= 4.5);
  }
});

test("Catppuccin Mocha uses palette surfaces for level progress notifications", async () => {
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

  await loadCatppuccinMocha(dom);

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

test("Catppuccin Mocha disables text shadows globally", async () => {
  const dom = createDom(
    `<style>
      .subject-readings-with-audio { text-shadow: 0 1px 0 #fff !important; }
    </style>
    <div class="subject-readings-with-audio">Kyoko (Tokyo accent, female)</div>`,
    "https://www.wanikani.com/vocabulary/%E9%A3%9F%E3%81%B9%E3%82%8B",
  );

  await loadCatppuccinMocha(dom);

  const audioDetails = dom.window.document.querySelector(
    ".subject-readings-with-audio",
  );
  assert.equal(
    dom.window.getComputedStyle(audioDetails).textShadow,
    "rgba(0, 0, 0, 0)",
  );

  dom.window.document.documentElement.removeAttribute("data-wk-mocha-active");
  assert.equal(
    dom.window.getComputedStyle(audioDetails).textShadow,
    "0 1px 0 #fff",
  );
});

test("Catppuccin Mocha uses bold subject colors and a restrained incorrect quiz state", async () => {
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
        --color-quiz-incorrect-text-color: #fff;
        --color-quiz-incorrect-text-shadow: 1px 1px 0 rgba(0, 0, 0, .2);
      }
    </style>`,
    "https://www.wanikani.com/",
  );

  await loadCatppuccinMocha(dom);

  const root = dom.window.document.documentElement;
  const expected = {
    "--color-radical": "oklch(72.04%0.1913 261.88)",
    "--color-kanji": "oklch(81.78%0.1552 338.3)",
    "--color-vocabulary": "oklch(73.99%0.1987 306.77)",
    "--color-blue": "oklch(72.04%0.1913 261.88)",
    "--color-pink": "oklch(81.78%0.1552 338.3)",
    "--color-purple": "oklch(73.99%0.1987 306.77)",
    "--color-quiz-incorrect-background":
      "color-mix(in srgb,var(--ctp-mocha-red) 18%,var(--wk-dark-surface))",
    "--color-quiz-incorrect-text-color": "#cdd6f4",
    "--color-quiz-incorrect-text-shadow": "transparent",
  };

  assertCustomProperties(dom, root, expected);
});

test("Catppuccin Mocha responds when the system preference changes", async () => {
  const dom = createDom("<main>Dashboard</main>", "https://www.wanikani.com/");
  let preferenceChanged;
  const preference = {
    matches: false,
    addEventListener(_event, listener) {
      preferenceChanged = listener;
    },
  };

  await loadUserscript(dom, "wk-catppuccin-mocha.js", {
    matchMedia() {
      return preference;
    },
  });

  assert.equal(
    dom.window.document.documentElement.hasAttribute("data-wk-mocha-active"),
    false,
  );

  preference.matches = true;
  preferenceChanged();

  assert.equal(
    dom.window.document.documentElement.hasAttribute("data-wk-mocha-active"),
    true,
  );
});
