import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

async function loadUserscript(dom, filename, globals = {}) {
  Object.assign(dom.window, globals);

  const source = await readFile(new URL(`../${filename}`, import.meta.url), 'utf8');
  dom.window.eval(source);
}

async function flushMutationObservers() {
  await Promise.resolve();
}

async function waitFor(assertion, { attempts = 20 } = {}) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  throw lastError;
}

function createDom(html, url) {
  return new JSDOM(html, {
    url,
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
}

test('redo answer inserts a disabled redo control before last items', async () => {
  const dom = createDom(
    `
      <div class="quiz-input">
        <div class="quiz-input__input-container">
          <input id="user-response">
        </div>
      </div>
      <ul>
        <li><a class="additional-content__item additional-content__item--item-info"></a></li>
        <li><a class="additional-content__item additional-content__item--last-items"></a></li>
      </ul>
    `,
    'https://www.wanikani.com/subjects/review'
  );

  await loadUserscript(dom, 'wk-redo-answer.js');

  const redoButton = dom.window.document.querySelector('.additional-content__item--redo-answer');
  const lastItems = dom.window.document.querySelector('.additional-content__item--last-items');

  assert.ok(redoButton);
  assert.equal(redoButton.getAttribute('aria-disabled'), 'true');
  assert.ok(
    redoButton.closest('li').compareDocumentPosition(lastItems.closest('li')) &
      dom.window.Node.DOCUMENT_POSITION_FOLLOWING
  );
});

test('redo answer does not insert a control outside quiz pages', async () => {
  const dom = createDom(
    `
      <ul>
        <li><a class="additional-content__item additional-content__item--last-items"></a></li>
      </ul>
    `,
    'https://www.wanikani.com/kanji/%E4%B8%80'
  );

  await loadUserscript(dom, 'wk-redo-answer.js');

  assert.equal(dom.window.document.querySelector('.additional-content__item--redo-answer'), null);
});

test('redo answer activates after navigating into a quiz page', async () => {
  const dom = createDom(
    '<main><h2>Meaning</h2></main>',
    'https://www.wanikani.com/kanji/%E4%B8%80'
  );

  await loadUserscript(dom, 'wk-redo-answer.js');

  dom.window.document.body.innerHTML = `
    <div class="quiz-input">
      <div class="quiz-input__input-container">
        <input id="user-response">
      </div>
    </div>
    <ul>
      <li><a class="additional-content__item additional-content__item--last-items"></a></li>
    </ul>
  `;
  dom.window.history.pushState({}, '', '/subjects/review');

  await waitFor(() => {
    assert.ok(dom.window.document.querySelector('.additional-content__item--redo-answer'));
  });
});

test('redo answer updates when WaniKani marks an answer correct', async () => {
  const dom = createDom(
    `
      <div class="quiz-input">
        <div class="quiz-input__input-container">
          <input id="user-response">
        </div>
      </div>
      <ul>
        <li><a class="additional-content__item additional-content__item--last-items"></a></li>
      </ul>
    `,
    'https://www.wanikani.com/subjects/review'
  );

  await loadUserscript(dom, 'wk-redo-answer.js');

  const redoButton = dom.window.document.querySelector('.additional-content__item--redo-answer');
  const inputContainer = dom.window.document.querySelector('.quiz-input__input-container');

  assert.equal(redoButton.getAttribute('aria-disabled'), 'true');

  inputContainer.setAttribute('correct', '');

  await waitFor(() => {
    assert.equal(redoButton.getAttribute('aria-disabled'), 'false');
  });
});

test('redo answer can reset the current quiz input through the WaniKani controller', async () => {
  const dom = createDom(
    `
      <div class="quiz-input">
        <div class="quiz-input__input-container" correct>
          <input id="user-response" value="old answer">
        </div>
      </div>
      <div class="answer-exception">Close enough</div>
      <turbo-frame id="subject-info">Subject details</turbo-frame>
      <ul>
        <li>
          <a class="additional-content__item additional-content__item--item-info additional-content__item--active"></a>
        </li>
        <li><a class="additional-content__item additional-content__item--last-items"></a></li>
      </ul>
    `,
    'https://www.wanikani.com/subjects/review'
  );
  const controller = {
    currentSubject: { id: 1 },
    currentQuestionType: 'meaning',
    lastAnswer: 'old answer',
    inputChars: ['o'],
    updateQuestionCalls: [],
    updateQuestion(event) {
      this.updateQuestionCalls.push(event.detail);
    }
  };

  await loadUserscript(dom, 'wk-redo-answer.js', {
    Stimulus: {
      getControllerForElementAndIdentifier() {
        return controller;
      }
    }
  });

  const redoButton = dom.window.document.querySelector('.additional-content__item--redo-answer');
  redoButton.click();

  await new Promise(resolve => dom.window.requestAnimationFrame(resolve));

  const input = dom.window.document.querySelector('#user-response');
  const inputContainer = dom.window.document.querySelector('.quiz-input__input-container');

  assert.equal(controller.lastAnswer, null);
  assert.deepEqual(Array.from(controller.inputChars), []);
  assert.equal(controller.updateQuestionCalls.length, 1);
  assert.equal(controller.updateQuestionCalls[0].subject, controller.currentSubject);
  assert.equal(controller.updateQuestionCalls[0].questionType, controller.currentQuestionType);
  assert.equal(input.value, '');
  assert.equal(inputContainer.hasAttribute('correct'), false);
  assert.equal(redoButton.getAttribute('aria-disabled'), 'true');
  assert.equal(dom.window.document.querySelector('.answer-exception').textContent, '');
  assert.equal(dom.window.document.querySelector('turbo-frame#subject-info').innerHTML, '');
});

test('stroke order inserts a KanjiVG section and navigation link on kanji pages', async () => {
  const svgText = `
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:kvg="http://kanjivg.tagaini.net" viewBox="0 0 109 109">
      <g id="kvg:kanji_4e00" kvg:element="一" kvg:radical="general">
        <path id="kvg:4e00-s1" d="M10 50 L90 50"></path>
        <text x="12" y="45">1</text>
      </g>
    </svg>
  `;
  const dom = createDom(
    `
      <nav><ul><li><a class="wk-nav__item" href="#meaning"><span class="wk-nav__item-text">Meaning</span></a></li></ul></nav>
      <main>
        <h2>Radical Combination</h2>
        <section>Radicals</section>
        <h2 id="meaning">Meaning</h2>
      </main>
    `,
    'https://www.wanikani.com/kanji/%E4%B8%80'
  );
  let fetchedUrl = null;

  dom.window.SVGElement.prototype.getTotalLength = () => 100;

  await loadUserscript(dom, 'wk-stroke-order.js', {
    GM: {
      xmlHttpRequest({ url, onload }) {
        fetchedUrl = url;
        onload({ status: 200, responseText: svgText });
      }
    }
  });

  const document = dom.window.document;

  await waitFor(() => {
    assert.equal(document.querySelector('#stroke-order')?.textContent, 'Stroke Order');
  });

  assert.equal(fetchedUrl, 'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/04e00.svg');
  assert.ok(document.querySelector('#wk-kanjivg-stroke-order svg.wk-kanjivg-main'));
  assert.equal(document.querySelector('a[href="#stroke-order"]')?.textContent, 'Stroke Order');
  assert.equal(document.querySelector('.wk-kanjivg-credit a')?.href, 'https://kanjivg.tagaini.net/');
});

test('stroke order sanitizes fetched SVG before insertion', async () => {
  const svgText = `
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:kvg="http://kanjivg.tagaini.net" viewBox="0 0 109 109" onload="alert(1)">
      <script>alert(1)</script>
      <foreignObject><div>unsafe</div></foreignObject>
      <a href="javascript:alert(1)">
        <g id="kvg:kanji_4e00" kvg:element="一" kvg:radical="general" onclick="alert(1)">
          <path id="kvg:4e00-s1" d="M10 50 L90 50" onmouseover="alert(1)"></path>
          <text x="12" y="45">1</text>
        </g>
      </a>
    </svg>
  `;
  const dom = createDom(
    `
      <nav><ul><li><a class="wk-nav__item" href="#meaning"><span class="wk-nav__item-text">Meaning</span></a></li></ul></nav>
      <main>
        <h2>Radical Combination</h2>
        <h2 id="meaning">Meaning</h2>
      </main>
    `,
    'https://www.wanikani.com/kanji/%E4%B8%80'
  );

  dom.window.SVGElement.prototype.getTotalLength = () => 100;

  await loadUserscript(dom, 'wk-stroke-order.js', {
    GM: {
      xmlHttpRequest({ onload }) {
        onload({ status: 200, responseText: svgText });
      }
    }
  });

  await waitFor(() => {
    assert.ok(dom.window.document.querySelector('#wk-kanjivg-stroke-order svg'));
  });

  const insertedSvg = dom.window.document.querySelector('#wk-kanjivg-stroke-order svg');

  assert.equal(insertedSvg.hasAttribute('onload'), false);
  assert.equal(insertedSvg.querySelector('script'), null);
  assert.equal(insertedSvg.querySelector('foreignObject'), null);
  assert.equal(insertedSvg.querySelector('[onclick]'), null);
  assert.equal(insertedSvg.querySelector('[onmouseover]'), null);
  assert.equal(insertedSvg.querySelector('a[href]'), null);
});

test('stroke order can reinsert after navigating away and back to a kanji page', async () => {
  const svgText = `
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:kvg="http://kanjivg.tagaini.net" viewBox="0 0 109 109">
      <g id="kvg:kanji_4e00" kvg:element="一" kvg:radical="general">
        <path id="kvg:4e00-s1" d="M10 50 L90 50"></path>
        <text x="12" y="45">1</text>
      </g>
    </svg>
  `;
  const kanjiPage = `
    <nav><ul><li><a class="wk-nav__item" href="#meaning"><span class="wk-nav__item-text">Meaning</span></a></li></ul></nav>
    <main>
      <h2>Radical Combination</h2>
      <h2 id="meaning">Meaning</h2>
    </main>
  `;
  const dom = createDom(kanjiPage, 'https://www.wanikani.com/kanji/%E4%B8%80');
  let fetchCount = 0;

  dom.window.SVGElement.prototype.getTotalLength = () => 100;

  await loadUserscript(dom, 'wk-stroke-order.js', {
    GM: {
      xmlHttpRequest({ onload }) {
        fetchCount += 1;
        onload({ status: 200, responseText: svgText });
      }
    }
  });

  await waitFor(() => {
    assert.ok(dom.window.document.querySelector('#wk-kanjivg-stroke-order'));
  });

  dom.window.history.pushState({}, '', '/vocabulary/%E4%B8%80');
  dom.window.document.body.innerHTML = '<main><h2>Meaning</h2></main>';

  await new Promise(resolve => setTimeout(resolve, 0));

  await waitFor(() => {
    assert.equal(dom.window.document.querySelector('#wk-kanjivg-stroke-order'), null);
  });

  dom.window.history.pushState({}, '', '/kanji/%E4%B8%80');
  dom.window.document.body.innerHTML = kanjiPage;

  await new Promise(resolve => setTimeout(resolve, 0));

  await waitFor(() => {
    assert.ok(dom.window.document.querySelector('#wk-kanjivg-stroke-order'));
    assert.equal(fetchCount, 2);
  });
});

test('stroke order does not duplicate SVG ids in generated figures', async () => {
  const svgText = `
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:kvg="http://kanjivg.tagaini.net" viewBox="0 0 109 109">
      <g id="kvg:kanji_4e00" kvg:element="一" kvg:radical="general">
        <path id="kvg:4e00-s1" d="M10 50 L90 50"></path>
        <text id="kvg:4e00-t1" x="12" y="45">1</text>
      </g>
    </svg>
  `;
  const dom = createDom(
    `
      <nav><ul><li><a class="wk-nav__item" href="#meaning"><span class="wk-nav__item-text">Meaning</span></a></li></ul></nav>
      <main>
        <h2>Radical Combination</h2>
        <h2 id="meaning">Meaning</h2>
      </main>
    `,
    'https://www.wanikani.com/kanji/%E4%B8%80'
  );

  dom.window.SVGElement.prototype.getTotalLength = () => 100;

  await loadUserscript(dom, 'wk-stroke-order.js', {
    GM: {
      xmlHttpRequest({ onload }) {
        onload({ status: 200, responseText: svgText });
      }
    }
  });

  await waitFor(() => {
    assert.ok(dom.window.document.querySelector('#wk-kanjivg-stroke-order svg'));
  });

  const ids = [...dom.window.document.querySelectorAll('#wk-kanjivg-stroke-order [id]')].map(
    element => element.id
  );

  assert.equal(new Set(ids).size, ids.length);
});

test('stroke order does not run on non-kanji pages', async () => {
  const dom = createDom(
    '<main><h2>Meaning</h2></main>',
    'https://www.wanikani.com/vocabulary/%E4%B8%80'
  );
  let fetchCount = 0;

  await loadUserscript(dom, 'wk-stroke-order.js', {
    GM: {
      xmlHttpRequest() {
        fetchCount += 1;
      }
    }
  });

  await flushMutationObservers();

  assert.equal(fetchCount, 0);
  assert.equal(dom.window.document.querySelector('#wk-kanjivg-stroke-order'), null);
});

test('stroke order does not repeatedly fetch a failed KanjiVG file', async () => {
  const dom = createDom(
    `
      <main>
        <h2>Radical Combination</h2>
        <h2>Meaning</h2>
      </main>
    `,
    'https://www.wanikani.com/kanji/%E4%B8%80'
  );
  let fetchCount = 0;

  dom.window.console.warn = () => {};

  await loadUserscript(dom, 'wk-stroke-order.js', {
    GM: {
      xmlHttpRequest({ onload }) {
        fetchCount += 1;
        onload({ status: 404, responseText: 'Not found' });
      }
    }
  });

  await waitFor(() => {
    assert.equal(fetchCount, 1);
  });

  dom.window.document.body.appendChild(dom.window.document.createElement('div'));
  dom.window.document.body.appendChild(dom.window.document.createElement('div'));

  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(fetchCount, 1);
});
