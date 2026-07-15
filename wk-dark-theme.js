// ==UserScript==
// @name         WaniKani Dark Theme
// @namespace    wk-dark-theme
// @version      0.2.0
// @author       Federico G. Schwindt <fgsch@lodoss.net>
// @description  Adds a neutral dark theme to WaniKani with system and manual modes.
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
  let mode = modes.includes(localStorage.getItem(STORAGE_KEY))
    ? localStorage.getItem(STORAGE_KEY)
    : "system";

  const styles = `
    html[data-wk-dark-theme="dark"] {
      color-scheme: dark;

      --wk-dark-background: #17191f;
      --wk-dark-surface: #20232b;
      --wk-dark-surface-raised: #292d37;
      --wk-dark-surface-hover: #333844;
      --wk-dark-border: #424957;
      --wk-dark-text: #e7eaf0;
      --wk-dark-text-muted: #a9b0bc;

      --color-app-background: var(--wk-dark-background);
      --color-text: var(--wk-dark-text);
      --color-title-underline: var(--wk-dark-border);
      --color-link: #70c7ff;
      --color-link-hover: #a6ddff;
      --color-link-active: #a6ddff;
      --color-text-shadow-light: transparent;
      --color-input-text: var(--wk-dark-text);
      --color-input-background: var(--wk-dark-surface);
      --color-input-border: var(--wk-dark-border);
      --color-quiz-input-background: var(--wk-dark-surface);
      --color-quiz-input-focus: #29485c;
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

      --color-global-header-background: var(--wk-dark-surface);
      --color-global-header-border: var(--wk-dark-border);
      --color-grouped-navigation-background: #1c1f26;
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
      --color-modal-mask: rgb(0 0 0 / 75%);
      --color-lesson-modal-text: var(--wk-dark-text);
      --color-new-user-modal-background: var(--wk-dark-surface-raised);
      --color-new-user-modal-text: var(--wk-dark-text);

      --color-button-primary-background: var(--wk-dark-surface-raised);
      --color-button-primary-hover-background: var(--wk-dark-surface-hover);
      --color-button-primary-active-background: #3b4250;
      --color-button-primary-border: #596170;
      --color-button-primary-text: var(--wk-dark-text);
      --color-button-primary-icon: var(--wk-dark-text-muted);
      --color-button-secondary-background: var(--wk-dark-surface-raised);
      --color-button-secondary-hover-background: var(--wk-dark-surface-hover);
      --color-button-secondary-active-background: #3b4250;
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
      --color-chip-hover-border: #596170;
      --color-chip-hover-text: var(--wk-dark-text);
      --color-chip-active-background: #596170;
      --color-chip-active-border: #707989;

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
      --color-lesson-picker-footer-background: rgb(32 35 43 / 92%);
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
      background: #292d37;
      border: 1px solid #596170;
      border-radius: 999px;
      bottom: 16px;
      box-shadow: 0 4px 16px rgb(0 0 0 / 35%);
      color: #e7eaf0;
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
      background: #333844;
    }

    #${TOGGLE_ID}:focus-visible {
      outline: 3px solid #70c7ff;
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
    localStorage.setItem(STORAGE_KEY, mode);
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
  run();
})();
