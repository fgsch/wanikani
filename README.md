# WaniKani Userscripts

Small userscripts for improving WaniKani.

## Scripts

### WaniKani Catppuccin Mocha

Applies the [Catppuccin Mocha](https://github.com/catppuccin/catppuccin) palette across WaniKani with coordinated colors and readable contrast. It follows the system color scheme by default; use the control in the lower-left corner to cycle through **System**, **Dark**, and **Light** modes.

![The 食べる vocabulary page in Light mode on the left and Catppuccin Mocha on the right](docs/screenshots/catppuccin-mocha.png)

Install:
<https://raw.githubusercontent.com/fgsch/wanikani/main/wk-catppuccin-mocha.js>

### WaniKani Redo Answer

Adds a **Redo** control to WaniKani so you can reopen a submitted answer and replace it before advancing.

![A submitted quiz answer with the Redo control available](docs/screenshots/redo-answer.png)

Install:
<https://raw.githubusercontent.com/fgsch/wanikani/main/wk-redo-answer.js>

### WaniKani Stroke Order

Adds animated stroke-order diagrams to kanji content on WaniKani. Diagrams include optional radical and component group views and are retrieved from [KanjiVG](https://kanjivg.tagaini.net/) on GitHub.

![Stroke-order diagrams with playback controls and component groups](docs/screenshots/stroke-order.png)

Install:
<https://raw.githubusercontent.com/fgsch/wanikani/main/wk-stroke-order.js>

### WaniKani Pitch Accent

Adds compact pitch-pattern diagrams from [OJAD](https://www.gavo.t.u-tokyo.ac.jp/ojad/eng/pages/home) to WaniKani reading information. Japanese terms and readings are sent to this third-party service to retrieve pitch-accent data.

![Pitch-accent diagrams for そのほか and そのた alongside their audio controls](docs/screenshots/pitch-accent.png)

Install:
<https://raw.githubusercontent.com/fgsch/wanikani/main/wk-pitch-accent.js>

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

Run only lint checks:

```sh
make lint
```

## Credits

WaniKani Catppuccin Mocha uses the [Catppuccin](https://github.com/catppuccin/catppuccin) color palette, copyright (c) 2021 Catppuccin and licensed under the [MIT License](https://github.com/catppuccin/catppuccin/blob/main/LICENSE).

## License

MIT. See [LICENSE](LICENSE).
