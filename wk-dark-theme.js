// ==UserScript==
// @name         WaniKani Dark Theme
// @namespace    wk-dark-theme
// @version      0.5.0
// @author       Federico G. Schwindt <fgsch@lodoss.net>
// @description  Adds a Catppuccin Mocha dark theme to WaniKani with system and manual modes.
// @license      MIT
// @homepageURL  https://github.com/fgsch/wanikani
// @updateURL    https://raw.githubusercontent.com/fgsch/wanikani/main/wk-dark-theme.js
// @downloadURL  https://raw.githubusercontent.com/fgsch/wanikani/main/wk-dark-theme.js
// @match        https://www.wanikani.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  const STYLE_ID = "wk-dark-theme-styles";
  const TOGGLE_ID = "wk-dark-theme-toggle";
  const STORAGE_KEY = "wk-dark-theme-mode";
  const modes = ["system", "dark", "light"];
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const NAME = GM_info.script.name;
  const VERSION = GM_info.script.version;

  let mode = "system";

  try {
    const storedMode = localStorage.getItem(STORAGE_KEY);
    if (modes.includes(storedMode)) {
      mode = storedMode;
    }
  } catch (error) {
    void error;
  }

  const styles = `
    :root {
      --ctp-mocha-blue: #89b4fa;
      --ctp-mocha-sky: #89dceb;
      --ctp-mocha-text: #cdd6f4;
      --ctp-mocha-subtext-0: #a6adc8;
      --ctp-mocha-overlay-1: #7f849c;
      --ctp-mocha-overlay-0: #6c7086;
      --ctp-mocha-surface-2: #585b70;
      --ctp-mocha-surface-1: #45475a;
      --ctp-mocha-surface-0: #313244;
      --ctp-mocha-base: #1e1e2e;
      --ctp-mocha-mantle: #181825;
      --ctp-mocha-crust: #11111b;
    }

    html[data-wk-dark-theme="dark"] {
      color-scheme: dark;

      --wk-dark-background: var(--ctp-mocha-base);
      --wk-dark-surface: var(--ctp-mocha-mantle);
      --wk-dark-surface-raised: var(--ctp-mocha-surface-0);
      --wk-dark-surface-hover: var(--ctp-mocha-surface-1);
      --wk-dark-border: var(--ctp-mocha-surface-2);
      --wk-dark-text: var(--ctp-mocha-text);
      --wk-dark-text-muted: var(--ctp-mocha-subtext-0);

      --color-app-background: var(--wk-dark-background);
      --color-text: var(--wk-dark-text);
      --color-title-underline: var(--wk-dark-border);
      --color-link: var(--ctp-mocha-blue);
      --color-link-hover: var(--ctp-mocha-sky);
      --color-link-active: var(--ctp-mocha-sky);
      --color-text-shadow-light: transparent;
      --color-input-text: var(--wk-dark-text);
      --color-input-background: var(--wk-dark-surface);
      --color-input-border: var(--wk-dark-border);
      --color-quiz-input-background: var(--wk-dark-surface);
      --color-quiz-input-focus: var(--ctp-mocha-surface-0);
      --color-hint-background: var(--wk-dark-surface-raised);
      --color-code-background: var(--wk-dark-surface-raised);
      --color-code-border: var(--wk-dark-border);

      --color-page-header-title: var(--wk-dark-text);
      --color-page-header-subtitle: var(--wk-dark-text-muted);
      --color-page-header-description: var(--wk-dark-text-muted);
      --color-page-nav-header-icon: var(--wk-dark-text-muted);
      --color-section-header-border: var(--wk-dark-border);
      --color-setting-divider: var(--wk-dark-border);
      --color-authentication-footer-divider: var(--wk-dark-border);
      --color-subject-slide-navigation-background: var(--ctp-mocha-crust);
      --color-subject-slide-navigation-text: var(--wk-dark-text);
      --color-subject-slide-navigation-button-hover: var(--wk-dark-surface-hover);

      --color-global-header-background: var(--wk-dark-surface);
      --color-global-header-border: var(--wk-dark-border);
      --color-grouped-navigation-background: var(--ctp-mocha-crust);
      --color-grouped-navigation-link-background: var(--wk-dark-surface-raised);
      --color-grouped-navigation-link-active-background: var(--wk-dark-background);
      --color-grouped-navigation-link-active-border: var(--wk-dark-border);
      --color-grouped-navigation-link-hover-background: var(--wk-dark-surface-hover);
      --color-grouped-navigation-link-hover-text: var(--wk-dark-text);

      --color-widget-background: var(--wk-dark-surface);
      --color-widget-border: var(--wk-dark-border);
      --color-widget-divider: var(--wk-dark-border);
      --color-widget-primary-text: var(--wk-dark-text);
      --color-widget-secondary-text: var(--wk-dark-text-muted);
      --color-empty-widget-background: var(--wk-dark-surface);
      --color-wk-panel-background: var(--wk-dark-surface);
      --color-wk-panel-content-background: var(--wk-dark-surface);
      --color-wk-panel-content-title-underline: var(--wk-dark-border);
      --color-modal-background: var(--wk-dark-surface-raised);
      --color-modal-mask: color-mix(in srgb, var(--ctp-mocha-crust) 75%, transparent);
      --color-lesson-modal-text: var(--wk-dark-text);
      --color-new-user-modal-background: var(--wk-dark-surface-raised);
      --color-new-user-modal-text: var(--wk-dark-text);

      --color-button-primary-background: var(--wk-dark-surface-raised);
      --color-button-primary-hover-background: var(--wk-dark-surface-hover);
      --color-button-primary-active-background: var(--ctp-mocha-surface-2);
      --color-button-primary-border: var(--ctp-mocha-overlay-0);
      --color-button-primary-text: var(--wk-dark-text);
      --color-button-primary-icon: var(--wk-dark-text-muted);
      --color-button-secondary-background: var(--wk-dark-surface-raised);
      --color-button-secondary-hover-background: var(--wk-dark-surface-hover);
      --color-button-secondary-active-background: var(--ctp-mocha-surface-2);
      --color-button-secondary-border: var(--wk-dark-border);
      --color-button-secondary-text: var(--wk-dark-text);
      --color-button-secondary-icon: var(--wk-dark-text-muted);
      --color-button-frameless-text: var(--wk-dark-text);
      --color-button-frameless-icon: var(--wk-dark-text-muted);
      --color-button-frameless-hover-background: var(--wk-dark-surface-hover);
      --color-button-icon-only-text: var(--wk-dark-text);
      --color-button-icon-only-hover-background: var(--wk-dark-surface-hover);

      --color-chip-background: var(--wk-dark-surface-raised);
      --color-chip-border: var(--wk-dark-border);
      --color-chip-text: var(--wk-dark-text);
      --color-chip-hover-background: var(--wk-dark-surface-hover);
      --color-chip-hover-border: var(--ctp-mocha-overlay-0);
      --color-chip-hover-text: var(--wk-dark-text);
      --color-chip-active-background: var(--ctp-mocha-overlay-0);
      --color-chip-active-border: var(--ctp-mocha-overlay-1);

      --color-count-bubble-background: var(--wk-dark-surface-raised);
      --color-count-bubble-border: var(--wk-dark-border);
      --color-count-bubble-divider: var(--wk-dark-border);
      --color-count-bubble-text: var(--wk-dark-text);
      --color-count_bubble-background: var(--wk-dark-surface-raised);
      --color-count_bubble-text: var(--wk-dark-text);
      --color-progress-chart-bar-background: var(--wk-dark-border);
      --color-progress-chart-metric-text: var(--wk-dark-text-muted);
      --color-progress-chart-metric-count: var(--wk-dark-text);
      --color-progress-chart-metric-count-background: var(--wk-dark-surface-hover);
      --color-subject-srs-progress-stage-background: var(--wk-dark-border);
      --color-subject-srs-progress-text: var(--wk-dark-text-muted);

      --color-item-spread-row-background: var(--wk-dark-surface);
      --color-item-spread-row-hover-background: var(--wk-dark-surface-hover);
      --color-item-spread-row-active-background: var(--wk-dark-surface-raised);
      --color-item-spread-row-border: var(--wk-dark-border);
      --color-item-spread-row-count: var(--wk-dark-text);
      --color-item-spread-total-background: var(--wk-dark-surface-raised);
      --color-item-spread-total-border: var(--wk-dark-border);
      --color-review-forecast-header-background: var(--wk-dark-surface-raised);
      --color-review-forecast-day-header-label: var(--wk-dark-text);
      --color-level-progress-subjects-background: var(--wk-dark-surface);
      --color-level-progress-subjects-border: var(--wk-dark-border);
      --color-level-progress-item-stat-border: var(--wk-dark-border);
      --color-level-progress-item-stat-hover-background: var(--wk-dark-surface-hover);
      --color-level-progress-item-stat-active-background: var(--wk-dark-surface-raised);
      --color-subject-character-grid-header-background: var(--wk-dark-surface-raised);
      --color-subject-character-grid-header-title: var(--wk-dark-text);
      --color-subject-character-grid-header-subtitle: var(--wk-dark-text-muted);
      --color-subject-character-grid-item-background: var(--wk-dark-surface);
      --color-subject-character-grid-item-border: var(--wk-dark-border);
      --color-subject-page-header-border: var(--wk-dark-border);

      --color-dashboard-customization-menu-background: var(--wk-dark-surface-raised);
      --color-dashboard-customization-menu-border: var(--wk-dark-border);
      --color-dashboard-customization-menu-divider: var(--wk-dark-border);
      --color-dashboard-customization-menu-text: var(--wk-dark-text);
      --color-dashboard-customization-row-background: var(--wk-dark-surface);
      --color-dashboard-customization-template-background: var(--wk-dark-surface);
      --color-dashboard-customization-template-border: var(--wk-dark-border);
      --color-dashboard-customization-template-hover-background: var(--wk-dark-surface-hover);
      --color-dashboard-customization-template-selected-background: var(--wk-dark-surface-raised);
      --color-dashboard-customization-widget-container-background: var(--wk-dark-surface);

      --color-billing-plan-background: var(--wk-dark-surface);
      --color-billing-plan-border: var(--wk-dark-border);
      --color-subscription-plan-background: var(--wk-dark-surface);
      --color-subscription-plan-border: var(--wk-dark-border);
      --color-subscription-plan-divider: var(--wk-dark-border);
      --color-lesson-picker-footer-background: color-mix(in srgb, var(--ctp-mocha-mantle) 92%, transparent);
      --color-lesson-picker-footer-border: 1px solid var(--wk-dark-border);
      --color-recent-mistakes-intro-divider: var(--wk-dark-border);
    }

    html[data-wk-dark-theme="dark"],
    html[data-wk-dark-theme="dark"] body,
    html[data-wk-dark-theme="dark"] .site-content,
    html[data-wk-dark-theme="dark"] .site-container {
      background-color: var(--wk-dark-background);
      color: var(--wk-dark-text);
    }

    html[data-wk-dark-theme="dark"] .sitemap__section-header {
      color: var(--wk-dark-text);
    }

    html[data-wk-dark-theme="dark"] .subject-collocations__pattern-name {
      background-color: var(--wk-dark-surface);
    }

    html[data-wk-dark-theme="dark"] .subject-collocations__pattern-name[aria-selected="true"] {
      background-color: var(--wk-dark-surface-raised);
    }

    html[data-wk-dark-theme="dark"] .subject-collocations__pattern-name[aria-selected="true"]::after,
    html[data-wk-dark-theme="dark"] .subject-info .subject-collocations__pattern-name[aria-selected="true"]::after {
      background-color: var(--wk-dark-background);
      background-image: none;
    }

    html[data-wk-dark-theme="dark"] .subject-slide {
      background-color: var(--wk-dark-surface);
      border-color: var(--wk-dark-border);
      box-shadow: 2px 2px 4px color-mix(in srgb, var(--ctp-mocha-crust) 50%, transparent);
    }

    html[data-wk-dark-theme="dark"] .subject-info {
      background-color: var(--wk-dark-surface);
    }

    html[data-wk-dark-theme="dark"] .subject-slides__navigation-link[aria-selected="true"]::after {
      border-bottom-color: var(--wk-dark-border);
    }

    html[data-wk-dark-theme="dark"] .todays-lessons-widget--complete,
    html[data-wk-dark-theme="dark"] .reviews-widget--complete {
      --color-widget-background: var(--wk-dark-surface);
    }

    html[data-wk-dark-theme="dark"] .review-forecast-widget:not(.review-forecast-widget--loading) {
      --color-review-forecast-header-background: var(--wk-dark-surface-raised);
    }

    html[data-wk-dark-theme="dark"] input,
    html[data-wk-dark-theme="dark"] textarea,
    html[data-wk-dark-theme="dark"] select {
      background-color: var(--wk-dark-surface);
      border-color: var(--wk-dark-border);
      color: var(--wk-dark-text);
    }

    html[data-wk-dark-theme="dark"] ::placeholder {
      color: var(--wk-dark-text-muted);
      opacity: 1;
    }

    html[data-wk-dark-theme="dark"] body * {
      text-shadow: none !important;
    }

    html[data-wk-dark-theme="dark"] body *::before,
    html[data-wk-dark-theme="dark"] body *::after {
      text-shadow: none !important;
    }

    #${TOGGLE_ID} {
      all: initial;
      align-items: center;
      background: var(--ctp-mocha-surface-0);
      border: 1px solid var(--ctp-mocha-overlay-0);
      border-radius: 999px;
      bottom: 16px;
      box-shadow: 0 4px 16px color-mix(in srgb, var(--ctp-mocha-crust) 35%, transparent);
      color: var(--ctp-mocha-text);
      cursor: pointer;
      display: flex;
      font: 600 12px/1 system-ui, sans-serif;
      justify-content: center;
      min-height: 34px;
      min-width: 66px;
      padding: 0 12px;
      position: fixed;
      left: 16px;
      z-index: 2147483647;
    }

    #${TOGGLE_ID}:hover {
      background: var(--ctp-mocha-surface-1);
    }

    #${TOGGLE_ID}:focus-visible {
      outline: 3px solid var(--ctp-mocha-blue);
      outline-offset: 2px;
    }
  `;

  function installStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = styles;
    (document.head || document.documentElement).append(style);
  }

  function applyTheme() {
    document.documentElement.dataset.wkDarkThemeMode = mode;
    document.documentElement.dataset.wkDarkTheme =
      mode === "system" ? (mediaQuery.matches ? "dark" : "light") : mode;
  }

  function updateToggle(toggle) {
    const nextMode = modes[(modes.indexOf(mode) + 1) % modes.length];
    const label = `${mode[0].toUpperCase()}${mode.slice(1)}`;
    const nextLabel = `${nextMode[0].toUpperCase()}${nextMode.slice(1)}`;

    toggle.textContent = label;
    toggle.setAttribute(
      "aria-label",
      `Theme: ${label}. Click for ${nextLabel}.`,
    );
    toggle.title = `Theme: ${label} (click for ${nextLabel})`;
  }

  function selectNextMode(toggle) {
    mode = modes[(modes.indexOf(mode) + 1) % modes.length];

    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (error) {
      void error;
    }

    applyTheme();
    updateToggle(toggle);
  }

  function installToggle() {
    if (!document.body) {
      return;
    }

    const existingToggle = document.getElementById(TOGGLE_ID);
    if (existingToggle) {
      updateToggle(existingToggle);
      return;
    }

    const toggle = document.createElement("button");
    toggle.id = TOGGLE_ID;
    toggle.type = "button";
    toggle.addEventListener("click", () => selectNextMode(toggle));
    updateToggle(toggle);
    document.body.append(toggle);
  }

  function run() {
    installStyles();
    applyTheme();

    if (document.body) {
      installToggle();
    } else {
      document.addEventListener("DOMContentLoaded", installToggle, {
        once: true,
      });
    }
  }

  mediaQuery.addEventListener?.("change", () => {
    if (mode === "system") {
      applyTheme();
    }
  });
  document.addEventListener("turbo:load", run);
  console.debug(`[${NAME}] Script loaded, version ${VERSION}`);
  run();
})();
