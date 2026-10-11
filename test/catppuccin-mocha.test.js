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
  waitFor,
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

function renderDarkLevelUpImage(uri) {
  const themedSvg = decodeURIComponent(uri.slice(uri.indexOf(",") + 1));
  const dom = createDom(themedSvg, "https://www.wanikani.com/");
  const style = dom.window.document.createElement("style");
  style.textContent = [...dom.window.document.querySelectorAll("svg style")]
    .map((node) => node.textContent)
    .join("\n");
  dom.window.document.head.append(style);

  // JSDOM cannot evaluate SVG-image media queries; Chromium covers rendering.
  const darkStyles = dom.window.document.createElement("style");
  darkStyles.textContent = [...style.sheet.cssRules]
    .filter((rule) => rule.conditionText === "(prefers-color-scheme: dark)")
    .flatMap((rule) => [...rule.cssRules].map((child) => child.cssText))
    .join("\n");
  dom.window.document.head.append(darkStyles);
  return { dom, darkStyles };
}

for (const lateBanner of [false, true]) {
  test(`Catppuccin Mocha makes responsive level-up titles readable without recoloring artwork${lateBanner ? " when the banner loads after startup" : ""}`, async (t) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1610 600">
    <defs><style>
      .artwork { fill: #ffbf59; }
      .lu-title { font-size: 54px; text-shadow: 0 1px 0 #FFF; }
    </style></defs>
    <circle class="artwork" cx="805" cy="171" r="170"/>
    <text class="lu-title" x="805" y="590">レベルアップおめでとう！</text>
  </svg>`;
    const bannerHtml = `<div class="level-up-alert__image"><picture>
    <source media="(max-width: 600px)" srcset="/level_up_image.svg?level=5&amp;size=mobile">
    <img src="/level_up_image.svg?level=5" alt="Level up banner">
  </picture></div>`;
    const dom = createDom(
      lateBanner ? "<main></main>" : bannerHtml,
      "https://www.wanikani.com/dashboard",
    );
    t.after(() => dom.window.close());
    dom.window.fetch = async () => ({ ok: true, text: async () => svg });
    await loadCatppuccinMocha(dom);

    if (lateBanner) {
      await waitFor(() => {
        assert.equal(dom.window.document.readyState, "complete");
      });
      dom.window.document.querySelector("main").innerHTML = bannerHtml;
      dom.window.document
        .querySelector("img")
        .dispatchEvent(new dom.window.Event("load"));
    }

    const source = dom.window.document.querySelector("source");
    const image = dom.window.document.querySelector("img");
    await waitFor(() => {
      assert.ok(source.srcset.startsWith("data:image/svg+xml;"));
      assert.ok(image.src.startsWith("data:image/svg+xml;"));
    });

    for (const uri of [source.srcset, image.src]) {
      const { dom: rendered, darkStyles } = renderDarkLevelUpImage(uri);
      t.after(() => rendered.window.close());

      const title = rendered.window.document.querySelector(".lu-title");
      const artwork = rendered.window.document.querySelector(".artwork");
      assert.equal(
        rendered.window.getComputedStyle(title).fill,
        "rgb(205, 214, 244)",
      );
      assert.equal(
        rendered.window.getComputedStyle(title).textShadow,
        "rgba(0, 0, 0, 0)",
      );
      assert.equal(
        rendered.window.getComputedStyle(artwork).fill,
        "rgb(255, 191, 89)",
      );
      darkStyles.remove();
      assert.equal(
        rendered.window.getComputedStyle(title).textShadow,
        "0 1px 0 #FFF",
      );
    }
  });
}

test("Catppuccin Mocha keeps the current banner readable while an older SVG request is pending", async (t) => {
  const dom = createDom(
    '<div class="level-up-alert__image"><img src="/level_up_image.svg?level=5" alt="Level up banner"></div>',
    "https://www.wanikani.com/dashboard",
  );
  let releaseEarlierImage;
  const earlierImage = new Promise((resolve) => {
    releaseEarlierImage = resolve;
  });
  t.after(async () => {
    releaseEarlierImage();
    await new Promise((resolve) => setTimeout(resolve, 0));
    dom.window.close();
  });
  dom.window.fetch = async (url) => {
    const level = url.searchParams.get("level");
    if (level === "5") {
      await earlierImage;
    }
    return {
      ok: true,
      text: async () => `<svg xmlns="http://www.w3.org/2000/svg">
        <text class="level">${level}</text>
        <text class="lu-title">レベルアップおめでとう！</text>
      </svg>`,
    };
  };
  await loadCatppuccinMocha(dom);

  const image = dom.window.document.querySelector("img");
  image.src = "/level_up_image.svg?level=6";
  image.dispatchEvent(new dom.window.Event("load"));
  await waitFor(() => {
    assert.ok(image.src.startsWith("data:image/svg+xml;"));
  });

  function assertCurrentBanner() {
    const { dom: rendered } = renderDarkLevelUpImage(image.src);
    try {
      assert.equal(
        rendered.window.document.querySelector(".level").textContent,
        "6",
      );
      assert.equal(
        rendered.window.getComputedStyle(
          rendered.window.document.querySelector(".lu-title"),
        ).fill,
        "rgb(205, 214, 244)",
      );
    } finally {
      rendered.window.close();
    }
  }
  assertCurrentBanner();
  releaseEarlierImage();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assertCurrentBanner();
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
    name: "Catppuccin Mocha uses muted palette colors for dashboard progress bars",
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
      "--color-review-forecast-bar-positive":
        "color-mix(in srgb,var(--ctp-mocha-green) 80%,var(--wk-dark-surface-raised))",
      "--color-review-forecast-bar-positive-border":
        "color-mix(in srgb,var(--ctp-mocha-green) 80%,var(--wk-dark-surface-raised))",
      "--color-review-forecast-increase-positive": "#a6e3a1",
      "--color-review-forecast-priority-count-inside": "#11111b",
      "--color-review-forecast-bar-zero": "#45475a",
      "--color-review-forecast-bar-zero-border": "#585b70",
      "--color-level-progress-completed-bar":
        "color-mix(in srgb,var(--ctp-mocha-green) 80%,var(--wk-dark-surface-raised))",
      "--color-level-progress-bar": "#585b70",
      "--color-progress-chart-bar":
        "color-mix(in srgb,var(--ctp-mocha-green) 80%,var(--wk-dark-surface-raised))",
      "--color-subject-srs-progress-stage-complete-background":
        "color-mix(in srgb,var(--ctp-mocha-green) 80%,var(--wk-dark-surface-raised))",
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

test("Catppuccin Mocha progress fills remain distinct from their tracks", () => {
  const mixSrgb = (first, second, firstWeight) =>
    first.map((channel, index) =>
      Math.round(channel * firstWeight + second[index] * (1 - firstWeight)),
    );
  const progress = mixSrgb(parseColor("#a6e3a1"), parseColor("#313244"), 0.8);
  const track = parseColor("#585b70");

  assert.ok(contrastRatio(progress, track) >= 3);
});

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

test("Catppuccin Mocha applies its palette to stroke order colors", async () => {
  const dom = createDom(
    `
      <div id="wk-kanjivg-stroke-order">
        <svg>
          <path class="wk-kanjivg-stroke-1"></path>
          <path class="wk-kanjivg-stroke-2"></path>
          <path class="wk-kanjivg-stroke-3"></path>
          <path class="wk-kanjivg-stroke-4"></path>
          <path class="wk-kanjivg-stroke-5"></path>
          <path class="wk-kanjivg-stroke-6"></path>
          <path class="wk-kanjivg-stroke-7"></path>
          <path class="wk-kanjivg-stroke-8"></path>
          <path class="wk-kanjivg-radical"></path>
          <path class="wk-kanjivg-group"></path>
          <path class="wk-kanjivg-faint"></path>
        </svg>
      </div>
    `,
    "https://www.wanikani.com/kanji/%E4%B8%80",
  );

  await loadCatppuccinMocha(dom);

  const expected = {
    "wk-kanjivg-stroke-1": "#89b4fa",
    "wk-kanjivg-stroke-2": "#a6e3a1",
    "wk-kanjivg-stroke-3": "#94e2d5",
    "wk-kanjivg-stroke-4": "#cba6f7",
    "wk-kanjivg-stroke-5": "#fab387",
    "wk-kanjivg-stroke-6": "#89dceb",
    "wk-kanjivg-stroke-7": "#f5c2e7",
    "wk-kanjivg-stroke-8": "#b4befe",
    "wk-kanjivg-radical": "#f5c2e7",
    "wk-kanjivg-group": "#94e2d5",
    "wk-kanjivg-faint": "#7f849c",
  };

  for (const [className, color] of Object.entries(expected)) {
    const path = dom.window.document.querySelector(`.${className}`);
    assertCustomProperties(dom, path, {
      "--wk-kanjivg-stroke-color": color,
    });
  }

  const mochaBackground = parseColor("#1e1e2e");
  for (const className of [
    "wk-kanjivg-stroke-1",
    "wk-kanjivg-stroke-2",
    "wk-kanjivg-stroke-3",
    "wk-kanjivg-stroke-4",
    "wk-kanjivg-stroke-5",
    "wk-kanjivg-stroke-6",
    "wk-kanjivg-stroke-7",
    "wk-kanjivg-stroke-8",
  ]) {
    const path = dom.window.document.querySelector(`.${className}`);
    const stroke = parseColor(
      resolveCustomProperty(dom, path, "--wk-kanjivg-stroke-color"),
    );
    assert.ok(contrastRatio(stroke, mochaBackground) >= 3);
  }
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

test("Catppuccin Mocha keeps answer feedback readable and restores native Light styling", async () => {
  const dom = createDom(
    `<style>
      :root {
        --colorQuizExceptionBackground: #999999;
        --colorQuizExceptionText: #ffffff;
        --colorQuizExceptionShadow: #e1e1e1;
      }
      .answer-exception {
        background-color: var(--colorQuizExceptionBackground);
        color: var(--colorQuizExceptionText);
        box-shadow: 3px 3px 0 var(--colorQuizExceptionShadow);
      }
    </style>
    <div class="answer-exception" data-item-info-target="exception">
      Need help? View the correct reading and mnemonic.
    </div>`,
    "https://www.wanikani.com/subjects/review",
  );
  const bubble = dom.window.document.querySelector(".answer-exception");
  const appearance = () => ({
    foreground: parseColor(resolveCustomProperty(dom, bubble, "color")),
    background: parseColor(
      resolveCustomProperty(dom, bubble, "background-color"),
    ),
    shadow: dom.window.getComputedStyle(bubble).boxShadow,
  });
  const nativeAppearance = appearance();

  await loadCatppuccinMocha(dom);

  const darkAppearance = appearance();
  assert.ok(
    contrastRatio(darkAppearance.foreground, darkAppearance.background) >= 4.5,
    "Answer feedback must have readable text",
  );
  assert.equal(darkAppearance.shadow, "none");

  const toggle = dom.window.document.getElementById(
    "wk-catppuccin-mocha-toggle",
  );
  toggle.click();
  toggle.click();
  assert.deepEqual(appearance(), nativeAppearance);
});

test("Catppuccin Mocha keeps native reading labels readable and restores Light styling", async () => {
  const dom = createDom(
    `<style>
      :root {
        --color-app-background: #f4f4f4;
        --color-section-subtitle: #6b7079;
      }
      body { background-color: var(--color-app-background); }
      .subject-readings__reading-title,
      .subject-subsection__subtitle {
        color: var(--color-section-subtitle);
      }
    </style>
    <h3 class="subject-readings__reading-title">On’yomi</h3>
    <h3 class="subject-subsection__subtitle">Mnemonic</h3>`,
    "https://www.wanikani.com/kanji/%E5%BE%8C",
  );
  const labels = [
    ...dom.window.document.querySelectorAll(
      ".subject-readings__reading-title, .subject-subsection__subtitle",
    ),
  ];
  const appearance = () => ({
    foregrounds: labels.map((label) =>
      parseColor(resolveCustomProperty(dom, label, "color")),
    ),
    background: parseColor(
      resolveCustomProperty(dom, dom.window.document.body, "background-color"),
    ),
  });
  const nativeAppearance = appearance();

  await loadCatppuccinMocha(dom);

  const darkAppearance = appearance();
  for (const [index, foreground] of darkAppearance.foregrounds.entries()) {
    const ratio = contrastRatio(foreground, darkAppearance.background);
    assert.ok(
      ratio >= 4.5,
      `${labels[index].className} contrast is ${ratio}, expected at least 4.5`,
    );
  }

  const toggle = dom.window.document.getElementById(
    "wk-catppuccin-mocha-toggle",
  );
  toggle.click();
  toggle.click();
  assert.deepEqual(appearance(), nativeAppearance);
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

test("Catppuccin Mocha lesson and review legends match entries and preserve other states", async () => {
  const categories = ["radical", "kanji", "vocabulary"];
  const dom = createDom(
    `<style>
        .subject-legend-character--radical { color: var(--color-blue-dark); }
        .subject-legend-character--kanji { color: var(--color-pink-dark); }
        .subject-legend-character--vocabulary { color: var(--color-purple-dark); }
        .subject-legend-character--review,
        .subject-legend-character--burned,
        .subject-character__characters-text { color: #fff; }
      </style>
      <div class="subject-legend">
        <ul class="subject-legend__items">
          ${["locked", "lesson", "review"]
            .flatMap((state) =>
              categories.map(
                (category) =>
                  `<li><div class="subject-legend-character subject-legend-character--${category} subject-legend-character--${state}">${category}-${state}</div></li>`,
              ),
            )
            .join("")}
          <li><div class="subject-legend-character subject-legend-character--group subject-legend-character--burned">Burned</div></li>
        </ul>
      </div>
      ${["recent", "unlocked"]
        .flatMap((state) =>
          categories.map(
            (category) =>
              `<div class="subject-character subject-character--${category} subject-character--${state}"><span class="subject-character__characters-text">${category}</span></div>`,
          ),
        )
        .join("")}`,
    "https://www.wanikani.com/vocabulary?difficulty=pleasant",
  );
  const { document } = dom.window;
  const color = (element) => dom.window.getComputedStyle(element).color;
  const legends = [...document.querySelectorAll(".subject-legend-character")];
  const nativeColors = legends.map(color);

  await loadCatppuccinMocha(dom);

  for (const legend of legends) {
    const category = categories.find((candidate) =>
      legend.classList.contains(`subject-legend-character--${candidate}`),
    );
    let expectedColor = "var(--ctp-mocha-text)";
    if (legend.classList.contains("subject-legend-character--locked")) {
      expectedColor = `var(--color-${category})`;
    } else if (
      legend.classList.contains("subject-legend-character--lesson") ||
      legend.classList.contains("subject-legend-character--review")
    ) {
      const state = legend.classList.contains(
        "subject-legend-character--lesson",
      )
        ? "recent"
        : "unlocked";
      expectedColor = color(
        document.querySelector(
          `.subject-character--${category}.subject-character--${state} .subject-character__characters-text`,
        ),
      );
    }
    assert.equal(color(legend), expectedColor, legend.textContent);
  }

  const toggle = document.getElementById("wk-catppuccin-mocha-toggle");
  toggle.click();
  toggle.click();
  assert.equal(document.documentElement.dataset.wkMochaMode, "light");
  assert.deepEqual(legends.map(color), nativeColors);
});

test("Catppuccin Mocha keeps lesson queue subject labels readable", async () => {
  const dom = createDom(
    `<style>
      .subject-character--radical .subject-character__characters-text {
        color: var(--color-blue-dark);
        background: #89b4fa;
      }
      .subject-character--kanji .subject-character__characters-text {
        color: var(--color-pink-dark);
        background: #f5c2e7;
      }
      .subject-character--vocabulary .subject-character__characters-text {
        color: var(--color-purple-dark);
        background: #cba6f7;
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

  for (const category of ["radical", "kanji", "vocabulary"]) {
    for (const state of ["recent", "passed"]) {
      const characters = dom.window.document.querySelector(
        `.subject-character--${category}.subject-character--${state} .subject-character__characters-text`,
      );
      const foreground = parseColor(
        resolveCustomProperty(dom, characters, "color"),
      );
      const background = parseColor(
        resolveCustomProperty(dom, characters, "background-color"),
      );
      assert.ok(
        contrastRatio(foreground, background) >= 4.5,
        `${category}-${state}`,
      );
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

  const burned = dom.window.document.querySelector(
    ".subject-character--burned .subject-character__characters-text",
  );
  assert.ok(
    contrastRatio(
      parseColor(resolveCustomProperty(dom, burned, "color")),
      parseColor(resolveCustomProperty(dom, burned, "background-color")),
    ) >= 4.5,
  );
});

test("Catppuccin Mocha keeps filled subject box characters contrasting", async () => {
  const dom = createDom(
    `<style>
      .subject-character--radical .subject-character__characters-text {
        background: #89b4fa;
        color: var(--color-blue-dark);
      }
      .subject-character--kanji .subject-character__characters-text {
        background: #f5c2e7;
        color: var(--color-pink-dark);
      }
      .subject-character--vocabulary .subject-character__characters-text {
        background: #cba6f7;
        color: var(--color-purple-dark);
      }
      .subject-character--unlocked .subject-character__characters-text,
      .subject-character--passed .subject-character__characters-text {
        color: #fff;
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

    assert.ok(
      contrastRatio(
        parseColor(resolveCustomProperty(dom, characters, "color")),
        parseColor(resolveCustomProperty(dom, characters, "background-color")),
      ) >= 4.5,
      category,
    );
  }

  const toggle = dom.window.document.querySelector(
    "#wk-catppuccin-mocha-toggle",
  );
  toggle.click();
  toggle.click();
  for (const characters of dom.window.document.querySelectorAll(
    ".subject-character__characters-text",
  )) {
    assert.deepEqual(
      parseColor(resolveCustomProperty(dom, characters, "color")),
      [255, 255, 255],
      "Light mode restores the native foreground",
    );
  }
});

test("Catppuccin Mocha keeps native lesson slides readable and restores Light styling", async () => {
  const dom = createDom(
    `<style>
      :root {
        --colorSlideBackground: #fafafa;
        --colorSlideBorder: #d4d4d4;
        --colorSlideShadow: #e3e3e3;
        --color-text: #333333;
      }
      body { color: var(--color-text); }
      .subject-slide {
        background-color: var(--colorSlideBackground);
        box-shadow: 2px 2px 4px var(--colorSlideShadow);
        border: 2px solid var(--colorSlideBorder);
      }
    </style>
    <div class="subject-slides">
      <section class="subject-slide">Lesson content</section>
    </div>`,
    "https://www.wanikani.com/subject-lessons/920088919089344908/95",
  );
  const slide = dom.window.document.querySelector(".subject-slide");
  const appearance = () => ({
    foreground: parseColor(resolveCustomProperty(dom, slide, "color")),
    background: parseColor(
      resolveCustomProperty(dom, slide, "background-color"),
    ),
  });
  const nativeAppearance = appearance();

  await loadCatppuccinMocha(dom);

  const darkAppearance = appearance();
  assert.ok(
    darkAppearance.background.every((channel) => channel < 128),
    "Lesson slides must retain a dark background",
  );
  assert.ok(
    contrastRatio(darkAppearance.foreground, darkAppearance.background) >= 4.5,
    "Lesson slides must have readable text",
  );

  const toggle = dom.window.document.getElementById(
    "wk-catppuccin-mocha-toggle",
  );
  toggle.click();
  toggle.click();
  assert.deepEqual(appearance(), nativeAppearance);
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

test("Catppuccin Mocha treats the account menu as a raised surface", async () => {
  const dom = createDom(
    `<style>
      .sitemap__expandable-chunk--account { background-color: rgb(1, 2, 3); color: rgb(4, 5, 6); }
      .sitemap__expandable-chunk--account a { color: rgb(7, 8, 9); }
      .sitemap__section-header--subsection { color: rgb(10, 11, 12); }
    </style>
    <div id="sitemap__account" class="sitemap__expandable-chunk sitemap__expandable-chunk--account">
      <div>
        <ul class="sitemap__pages">
          <li class="user-summary">
            <div class="user-summary__detail">
              <p class="user-summary__username">fgs</p>
              <ul class="user-summary__attributes">
                <li class="user-summary__attribute"><a href="/level/4">Level 4</a></li>
              </ul>
            </div>
          </li>
          <li class="sitemap__page"><a href="/users/fgs">Profile</a></li>
          <li class="sitemap__section sitemap__section--subsection">
            <h3 class="sitemap__section-header--subsection">Settings</h3>
            <ul class="sitemap__pages">
              <li class="sitemap__page"><a href="/settings/app">App</a></li>
            </ul>
          </li>
          <li class="sitemap__page sitemap__page--community"><a href="/community">Community</a></li>
        </ul>
      </div>
    </div>`,
    "https://www.wanikani.com/",
  );

  await loadCatppuccinMocha(dom);

  const menu = dom.window.document.querySelector(
    ".sitemap__expandable-chunk--account",
  );

  assert.equal(
    dom.window.getComputedStyle(menu).backgroundColor,
    "var(--wk-dark-surface-raised)",
  );
  assert.equal(dom.window.getComputedStyle(menu).color, "var(--wk-dark-text)");
  assert.equal(
    dom.window.getComputedStyle(menu.querySelector("a")).color,
    "var(--wk-dark-text)",
  );
  assert.equal(
    dom.window.getComputedStyle(
      menu.querySelector(".sitemap__section-header--subsection"),
    ).color,
    "var(--wk-dark-text-muted)",
  );
});

test("Catppuccin Mocha keeps non-neon lesson and review widgets readable before and after completion", async () => {
  const dom = createDom(
    `<style>
      :root {
        --color-widget-background: #FFFFFF;
        --color-widget-primary-text: #333333;
        --color-widget-secondary-text: #6B7079;
        --color-count-bubble-background: #FFFFFF;
        --color-count-bubble-text: var(--color-text);
      }
      .todays-lessons-widget,
      .reviews-widget {
        background-color: var(--color-widget-background);
        color: var(--color-widget-primary-text);
      }
      .todays-lessons-widget__title-text,
      .reviews-widget__title-text {
        color: var(--color-widget-primary-text);
      }
      .todays-lessons-widget__text,
      .reviews-widget__text {
        color: var(--color-widget-secondary-text);
      }
      .count-bubble {
        background-color: var(--color-count-bubble-background);
        color: var(--color-count-bubble-text);
      }
      .todays-lessons-widget--complete,
      .reviews-widget--complete {
        --color-widget-background: #E8ECF0;
      }
    </style>
    <div class="todays-lessons-widget">
      <div class="todays-lessons-widget__title">
        <div class="todays-lessons-widget__title-text">Today's Lessons</div>
        <div class="todays-lessons-widget__count-text">
          <div class="count-bubble"><span class="count-bubble__text">10</span></div>
        </div>
      </div>
      <div class="todays-lessons-widget__text"><p class="wk-text">New lessons are ready.</p></div>
    </div>
    <div class="reviews-widget">
      <div class="reviews-widget__title">
        <div class="reviews-widget__title-text">Reviews</div>
        <div class="reviews-widget__count-text">
          <div class="count-bubble"><span class="count-bubble__text">20</span></div>
        </div>
      </div>
      <div class="reviews-widget__text"><p class="wk-text">Reviews are ready.</p></div>
    </div>`,
    "https://www.wanikani.com/",
  );

  await loadCatppuccinMocha(dom);

  const assertReadable = (text, surface, label) => {
    const ratio = contrastRatio(
      parseColor(resolveCustomProperty(dom, text, "color")),
      parseColor(resolveCustomProperty(dom, surface, "background-color")),
    );
    assert.ok(
      ratio >= 4.5,
      `${label} contrast is ${ratio}, expected at least 4.5`,
    );
  };

  for (const widgetClass of ["todays-lessons-widget", "reviews-widget"]) {
    const widget = dom.window.document.querySelector(`.${widgetClass}`);
    const title = widget.querySelector(`.${widgetClass}__title-text`);
    const description = widget.querySelector("p.wk-text");
    const bubble = widget.querySelector(".count-bubble");

    assertReadable(title, widget, `${widgetClass} pending title`);
    assertReadable(description, widget, `${widgetClass} pending description`);
    assertReadable(
      bubble.querySelector(".count-bubble__text"),
      bubble,
      `${widgetClass} pending count`,
    );

    widget.classList.add(`${widgetClass}--complete`);
    bubble.remove();
    assertReadable(title, widget, `${widgetClass} completed title`);
    assertReadable(description, widget, `${widgetClass} completed description`);
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
