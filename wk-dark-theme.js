// ==UserScript==
// @name         WaniKani Dark Theme
// @namespace    wk-dark-theme
// @version      0.6.0
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
      --ctp-mocha-rosewater: #f5e0dc;
      --ctp-mocha-blue: #89b4fa;
      --ctp-mocha-blue-bold: oklch(72.04% 0.1913 261.88);
      --ctp-mocha-sky: #89dceb;
      --ctp-mocha-teal: #94e2d5;
      --ctp-mocha-green: #a6e3a1;
      --ctp-mocha-pink: #f5c2e7;
      --ctp-mocha-pink-bold: oklch(81.78% 0.1552 338.3);
      --ctp-mocha-mauve: #cba6f7;
      --ctp-mocha-mauve-bold: oklch(73.99% 0.1987 306.77);
      --ctp-mocha-lavender: #b4befe;
      --ctp-mocha-text: #cdd6f4;
      --ctp-mocha-subtext-0: #a6adc8;
      --ctp-mocha-overlay-2: #9399b2;
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

      --color-radical: var(--ctp-mocha-blue-bold);
      --color-radical-dark: color-mix(in srgb, var(--ctp-mocha-blue) 35%, var(--ctp-mocha-crust));
      --color-radical-highlight: var(--ctp-mocha-sky);
      --color-radical-lowlight: var(--color-radical-dark);
      --color-radical-gradient: linear-gradient(to bottom, var(--color-radical), var(--color-radical-dark));
      --color-kanji: var(--ctp-mocha-pink-bold);
      --color-kanji-dark: color-mix(in srgb, var(--ctp-mocha-pink) 35%, var(--ctp-mocha-crust));
      --color-kanji-highlight: var(--ctp-mocha-rosewater);
      --color-kanji-lowlight: var(--color-kanji-dark);
      --color-kanji-gradient: linear-gradient(to bottom, var(--color-kanji), var(--color-kanji-dark));
      --color-vocabulary: var(--ctp-mocha-mauve-bold);
      --color-vocabulary-dark: color-mix(in srgb, var(--ctp-mocha-mauve) 35%, var(--ctp-mocha-crust));
      --color-vocabulary-highlight: var(--ctp-mocha-lavender);
      --color-vocabulary-lowlight: var(--color-vocabulary-dark);
      --color-vocabulary-gradient: linear-gradient(to bottom, var(--color-vocabulary), var(--color-vocabulary-dark));
      --color-blue: var(--color-radical);
      --color-blue-dark: var(--color-radical-dark);
      --color-blue-light: color-mix(in srgb, var(--ctp-mocha-blue) 30%, var(--wk-dark-surface-raised));
      --color-pink: var(--color-kanji);
      --color-pink-dark: var(--color-kanji-dark);
      --color-pink-light: color-mix(in srgb, var(--ctp-mocha-pink) 30%, var(--wk-dark-surface-raised));
      --color-purple: var(--color-vocabulary);
      --color-purple-dark: var(--color-vocabulary-dark);
      --color-purple-light: color-mix(in srgb, var(--ctp-mocha-mauve) 30%, var(--wk-dark-surface-raised));

      --color-text-highlight-radical-text: var(--ctp-mocha-blue);
      --color-text-highlight-radical-background: color-mix(in srgb, var(--ctp-mocha-blue) 12%, var(--wk-dark-surface-raised));
      --color-text-highlight-kanji-text: var(--ctp-mocha-pink);
      --color-text-highlight-kanji-background: color-mix(in srgb, var(--ctp-mocha-pink) 12%, var(--wk-dark-surface-raised));
      --color-text-highlight-vocabulary-text: var(--ctp-mocha-mauve);
      --color-text-highlight-vocabulary-background: color-mix(in srgb, var(--ctp-mocha-mauve) 12%, var(--wk-dark-surface-raised));
      --color-text-highlight-meaning-text: var(--wk-dark-text);
      --color-text-highlight-meaning-background: var(--wk-dark-surface-raised);
      --color-text-highlight-reading-text: var(--wk-dark-text);
      --color-text-highlight-reading-background: var(--wk-dark-surface-raised);

      --color-app-background: var(--wk-dark-background);
      --color-text: var(--wk-dark-text);
      --color-focus: var(--ctp-mocha-lavender);
      --color-title-underline: var(--wk-dark-border);
      --color-link: var(--ctp-mocha-blue);
      --color-link-hover: var(--ctp-mocha-sky);
      --color-link-active: var(--ctp-mocha-sky);
      --color-text-shadow-light: transparent;
      --color-input-text: var(--wk-dark-text);
      --color-input-background: var(--wk-dark-surface);
      --color-input-border: var(--wk-dark-border);
      --color-quiz-input-background: var(--wk-dark-surface);
      --color-quiz-input-focus: var(--ctp-mocha-lavender);
      --color-quiz-correct-background: color-mix(in srgb, var(--ctp-mocha-green) 18%, var(--wk-dark-surface));
      --color-quiz-correct-text-color: var(--wk-dark-text);
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
      --color-extra-study-button-background: var(--wk-dark-surface-raised);
      --color-extra-study-button-hover-background: var(--wk-dark-surface-hover);
      --color-extra-study-button-active-background: var(--ctp-mocha-surface-2);
      --color-extra-study-button-disabled-background: var(--wk-dark-surface);
      --color-extra-study-button-border: var(--wk-dark-border);
      --color-extra-study-button-text: var(--wk-dark-text);
      --color-extra-study-button-icon: var(--wk-dark-text-muted);
      --color-extra-study-button-remaining-text: var(--wk-dark-text-muted);
      --color-wk-panel-background: var(--wk-dark-surface);
      --color-wk-panel-content-background: var(--wk-dark-surface);
      --color-wk-panel-content-title-underline: var(--wk-dark-border);
      --color-modal-background: var(--wk-dark-surface-raised);
      --color-modal-mask: color-mix(in srgb, var(--ctp-mocha-crust) 75%, transparent);
      --color-modal-button-edge: var(--ctp-mocha-overlay-0);
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
      --color-subject-srs-progress-stage-complete-background: var(--ctp-mocha-green);
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
      --color-review-forecast-day-hover: var(--wk-dark-surface-hover);
      --color-review-forecast-day-active: var(--ctp-mocha-surface-2);
      --color-review-forecast-bar-positive: var(--ctp-mocha-green);
      --color-review-forecast-bar-positive-border: var(--ctp-mocha-green);
      --color-review-forecast-increase-positive: var(--ctp-mocha-green);
      --color-review-forecast-priority-count-inside: var(--ctp-mocha-crust);
      --color-review-forecast-bar-zero: var(--wk-dark-surface-hover);
      --color-review-forecast-bar-zero-border: var(--wk-dark-border);
      --color-level-progress-subjects-background: var(--wk-dark-surface);
      --color-level-progress-subjects-border: var(--wk-dark-border);
      --color-level-progress-item-stat-border: var(--wk-dark-border);
      --color-level-progress-item-stat-hover-background: var(--wk-dark-surface-hover);
      --color-level-progress-item-stat-active-background: var(--wk-dark-surface-raised);
      --color-level-progress-completed-bar: var(--ctp-mocha-green);
      --color-level-progress-bar: var(--wk-dark-border);
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

    html[data-wk-dark-theme="dark"] .sitemap__section-header:not(.sitemap__section-header--radicals):not(.sitemap__section-header--kanji):not(.sitemap__section-header--vocabulary):not(.sitemap__section-header--account):hover {
      border-color: var(--ctp-mocha-overlay-1);
    }

    html[data-wk-dark-theme="dark"] .sitemap__section-header:not(.sitemap__section-header--radicals):not(.sitemap__section-header--kanji):not(.sitemap__section-header--vocabulary):not(.sitemap__section-header--account):focus {
      border-color: var(--ctp-mocha-lavender);
    }

    html[data-wk-dark-theme="dark"] .sitemap__section-header--radicals:hover,
    html[data-wk-dark-theme="dark"] .sitemap__section-header--radicals:focus,
    html[data-wk-dark-theme="dark"] .sitemap__section--open .sitemap__section-header--radicals {
      border-color: var(--color-radical);
      color: var(--color-radical);
    }

    html[data-wk-dark-theme="dark"] .sitemap__section-header--kanji:hover,
    html[data-wk-dark-theme="dark"] .sitemap__section-header--kanji:focus,
    html[data-wk-dark-theme="dark"] .sitemap__section--open .sitemap__section-header--kanji {
      border-color: var(--color-kanji);
      color: var(--color-kanji);
    }

    html[data-wk-dark-theme="dark"] .sitemap__section-header--vocabulary:hover,
    html[data-wk-dark-theme="dark"] .sitemap__section-header--vocabulary:focus,
    html[data-wk-dark-theme="dark"] .sitemap__section--open .sitemap__section-header--vocabulary {
      border-color: var(--color-vocabulary);
      color: var(--color-vocabulary);
    }

    html[data-wk-dark-theme="dark"] .sitemap__expandable-chunk--radicals,
    html[data-wk-dark-theme="dark"] .sitemap__expandable-chunk--radicals:before {
      background: var(--color-radical);
    }

    html[data-wk-dark-theme="dark"] .sitemap__expandable-chunk--kanji,
    html[data-wk-dark-theme="dark"] .sitemap__expandable-chunk--kanji:before {
      background: var(--color-kanji);
    }

    html[data-wk-dark-theme="dark"] .sitemap__expandable-chunk--vocabulary,
    html[data-wk-dark-theme="dark"] .sitemap__expandable-chunk--vocabulary:before {
      background: var(--color-vocabulary);
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

    html[data-wk-dark-theme="dark"] .wk-button--quiz {
      --color-button-background: var(--ctp-mocha-teal);
      --color-button-hover-background: var(--ctp-mocha-teal);
      --color-button-active-background: color-mix(in srgb, var(--ctp-mocha-teal) 80%, var(--ctp-mocha-crust));
      --color-button-border: color-mix(in srgb, var(--ctp-mocha-teal) 65%, var(--ctp-mocha-crust));
      --color-button-hover-border: var(--color-button-border);
      --color-button-active-border: color-mix(in srgb, var(--ctp-mocha-teal) 55%, var(--ctp-mocha-crust));
      --color-button-edge: var(--color-button-border);
      --color-button-hover-edge: var(--color-button-hover-border);
      --color-button-active-edge: var(--color-button-active-border);
      --color-button-text: var(--ctp-mocha-crust);
      --color-button-hover-text: var(--ctp-mocha-crust);
      --color-button-active-text: var(--ctp-mocha-crust);
      --color-button-icon: var(--color-button-text);
      --color-button-hover-icon: var(--color-button-hover-text);
      --color-button-active-icon: var(--color-button-active-text);
      --button-outline: var(--ctp-mocha-teal);
    }

    html[data-wk-dark-theme="dark"] .lesson-container__queue .subject-character--radical .subject-character__characters-text,
    html[data-wk-dark-theme="dark"] .lesson-container__queue .subject-character--kanji .subject-character__characters-text,
    html[data-wk-dark-theme="dark"] .lesson-container__queue .subject-character--vocabulary .subject-character__characters-text {
      color: var(--ctp-mocha-crust);
    }

    html[data-wk-dark-theme="dark"] .lesson-container__queue .subject-character--recent.subject-character--radical .subject-character__characters-text {
      background-color: var(--ctp-mocha-blue);
    }

    html[data-wk-dark-theme="dark"] .lesson-container__queue .subject-character--recent.subject-character--kanji .subject-character__characters-text {
      background-color: var(--ctp-mocha-pink);
    }

    html[data-wk-dark-theme="dark"] .lesson-container__queue .subject-character--recent.subject-character--vocabulary .subject-character__characters-text {
      background-color: var(--ctp-mocha-mauve);
    }

    html[data-wk-dark-theme="dark"] .lesson-container__queue .subject-character--locked.subject-character--radical .subject-character__characters-text {
      color: var(--ctp-mocha-blue);
    }

    html[data-wk-dark-theme="dark"] .lesson-container__queue .subject-character--locked.subject-character--kanji .subject-character__characters-text {
      color: var(--ctp-mocha-pink);
    }

    html[data-wk-dark-theme="dark"] .lesson-container__queue .subject-character--locked.subject-character--vocabulary .subject-character__characters-text {
      color: var(--ctp-mocha-mauve);
    }

    html[data-wk-dark-theme="dark"] .lesson-container__queue .subject-character--burned .subject-character__characters-text {
      background-color: var(--ctp-mocha-surface-2);
      border-color: var(--ctp-mocha-overlay-1);
      color: var(--ctp-mocha-text);
    }

    html[data-wk-dark-theme="dark"] .character-header--radical,
    html[data-wk-dark-theme="dark"] .quiz-header--radical {
      background-color: var(--color-radical);
      background-image: none;
    }

    html[data-wk-dark-theme="dark"] .character-header--kanji,
    html[data-wk-dark-theme="dark"] .quiz-header--kanji {
      background-color: var(--color-kanji);
      background-image: none;
    }

    html[data-wk-dark-theme="dark"] .character-header--vocabulary,
    html[data-wk-dark-theme="dark"] .quiz-header--vocabulary {
      background-color: var(--color-vocabulary);
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

    html[data-wk-dark-theme="dark"] .level-progress-widget__info-bubble {
      --color-notification-info-background: var(--wk-dark-surface-raised);
      --color-notification-info-border: var(--ctp-mocha-blue);
      --color-notification-info-icon: var(--ctp-mocha-blue);
      --color-notification-success-background: var(--wk-dark-surface-raised);
      --color-notification-success-border: var(--ctp-mocha-green);
      --color-notification-success-icon: var(--ctp-mocha-green);
    }

    html[data-wk-dark-theme="dark"] input,
    html[data-wk-dark-theme="dark"] textarea,
    html[data-wk-dark-theme="dark"] select {
      background-color: var(--wk-dark-surface);
      border-color: var(--wk-dark-border);
      box-shadow: none;
      caret-color: var(--ctp-mocha-rosewater);
      color: var(--wk-dark-text);
    }

    html[data-wk-dark-theme="dark"] ::placeholder {
      color: var(--wk-dark-text-muted);
      opacity: 1;
    }

    html[data-wk-dark-theme="dark"] .quiz-input__question-type-container[data-question-type="meaning"] {
      background-color: var(--wk-dark-surface-raised);
      background-image: none;
      border-color: var(--wk-dark-border);
      color: var(--wk-dark-text);
    }

    html[data-wk-dark-theme="dark"] .quiz-input__question-type-container[data-question-type="reading"] {
      background-color: var(--wk-dark-surface);
      background-image: none;
      border-color: var(--wk-dark-border);
      color: var(--wk-dark-text);
    }

    html[data-wk-dark-theme="dark"] .quiz-input__input-container[correct] .quiz-input__input {
      border-color: transparent;
    }

    html[data-wk-dark-theme="dark"] .quiz-input__input-container[correct]:not([correct="false"]) .quiz-input__input {
      border-color: #a6e3a1;
    }

    html[data-wk-dark-theme="dark"] .additional-content__item {
      background-color: var(--wk-dark-surface-raised);
      border-color: var(--wk-dark-border);
      box-shadow: 2px 2px 4px color-mix(in srgb, var(--ctp-mocha-crust) 35%, transparent);
      color: var(--wk-dark-text-muted);
    }

    html[data-wk-dark-theme="dark"] .additional-content__item--disabled {
      background-color: var(--wk-dark-surface);
      box-shadow: none;
      color: var(--ctp-mocha-overlay-0);
    }

    html[data-wk-dark-theme="dark"] .additional-content__item--active {
      background-color: var(--ctp-mocha-overlay-0);
      box-shadow: none;
      color: var(--wk-dark-text);
    }

    html[data-wk-dark-theme="dark"] .additional-content__item--open::after {
      border-color: transparent transparent var(--wk-dark-border);
    }

    html[data-wk-dark-theme="dark"] ::selection {
      background-color: color-mix(in srgb, var(--ctp-mocha-overlay-2) 25%, transparent);
      color: var(--wk-dark-text);
    }

    html[data-wk-dark-theme="dark"] :focus-visible {
      outline-color: var(--ctp-mocha-lavender);
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
      outline: 3px solid var(--ctp-mocha-lavender);
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
