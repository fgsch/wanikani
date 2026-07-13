# WaniKani Userscripts

Small userscripts for improving WaniKani study and review pages.

## Scripts

### WaniKani Dark Theme

Adds a neutral near-black theme across WaniKani while preserving the existing radical, kanji, vocabulary, and quiz-state colors. It follows the system color scheme by default; use the control in the lower-left corner to cycle through **System**, **Dark**, and **Light** modes.

Install:
<https://raw.githubusercontent.com/fgsch/wanikani/main/wk-dark-theme.js>

### WaniKani Redo Answer

Adds a **Redo** control to WaniKani review and extra study quizzes so you can reset the current quiz input when you realize you made a mistake.

Install:
<https://raw.githubusercontent.com/fgsch/wanikani/main/wk-redo-answer.js>

### WaniKani Stroke Order

Adds animated KanjiVG stroke order to WaniKani kanji subject pages and lessons, including radical and component group views.

Install:
<https://raw.githubusercontent.com/fgsch/wanikani/main/wk-stroke-order.js>

## Installation

Install a userscript manager such as Tampermonkey or Violentmonkey, then open one of the install links above and accept the script installation prompt.

## Development

Install dependencies and run the full check suite:

```sh
make check
```

Run only the tests:

```sh
make test
```

Run only syntax checks:

```sh
make check-syntax
```

## License

MIT. See [LICENSE](LICENSE).
