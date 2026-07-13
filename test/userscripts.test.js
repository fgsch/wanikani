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
  const quizQueueController = {
    submitAnswer() {},
    nextItem() {}
  };
  const controller = { quizQueueOutlet: quizQueueController };

  await loadUserscript(dom, 'wk-redo-answer.js', {
    Stimulus: {
      getControllerForElementAndIdentifier() {
        return controller;
      }
    }
  });

  const redoButton = dom.window.document.querySelector('.additional-content__item--redo-answer');
  const inputContainer = dom.window.document.querySelector('.quiz-input__input-container');

  assert.equal(redoButton.getAttribute('aria-disabled'), 'true');

  quizQueueController.submitAnswer('answer', { action: 'pass' });
  inputContainer.setAttribute('correct', '');

  await waitFor(() => {
    assert.equal(redoButton.getAttribute('aria-disabled'), 'false');
  });
});

test('redo answer unlocks item info when the answer is submitted', async () => {
  const dom = createDom(
    `
      <div class="quiz-input">
        <div class="quiz-input__input-container">
          <input id="user-response">
        </div>
      </div>
      <ul>
        <li>
          <a class="additional-content__item additional-content__item--item-info additional-content__item--disabled"></a>
        </li>
        <li><a class="additional-content__item additional-content__item--last-items"></a></li>
      </ul>
      <turbo-frame id="subject-info"></turbo-frame>
    `,
    'https://www.wanikani.com/subjects/review'
  );
  const itemInfo = dom.window.document.querySelector(
    '.additional-content__item--item-info'
  );
  const submitCalls = [];
  let answerEventCount = 0;
  const quizQueueController = {
    currentItem: { id: 42 },
    questionType: 'meaning',
    stats: {
      get() {
        return {
          meaning: { complete: false, incorrect: 0 },
          reading: { complete: false, incorrect: 0 }
        };
      }
    },
    submitAnswer(answer, results) {
      submitCalls.push([answer, results]);
      dom.window.dispatchEvent(new dom.window.CustomEvent('didAnswerQuestion'));
    },
    nextItem() {}
  };
  const controller = { quizQueueOutlet: quizQueueController };

  await loadUserscript(dom, 'wk-redo-answer.js', {
    Stimulus: {
      getControllerForElementAndIdentifier() {
        return controller;
      }
    }
  });

  dom.window.addEventListener('didAnswerQuestion', event => {
    answerEventCount += 1;
    const subjectId = event.detail.subjectWithStats.subject.id;
    itemInfo.classList.remove('additional-content__item--disabled');
    itemInfo.setAttribute('href', `/subjects/${subjectId}`);
    dom.window.document.querySelector('#subject-info').textContent = 'Item details';
  });

  const results = { action: 'pass' };
  quizQueueController.submitAnswer('answer', results);

  assert.equal(itemInfo.classList.contains('additional-content__item--disabled'), false);
  assert.equal(itemInfo.getAttribute('href'), '/subjects/42');
  assert.equal(dom.window.document.querySelector('#subject-info').textContent, 'Item details');
  assert.deepEqual(submitCalls, []);
  assert.equal(answerEventCount, 1);

  quizQueueController.nextItem();

  assert.deepEqual(submitCalls, [['answer', results]]);
  assert.equal(answerEventCount, 1);
});

test('redo answer stays disabled when the pending-answer interface is unavailable', async () => {
  const dom = createDom(
    `
      <div class="quiz-input">
        <div class="quiz-input__input-container" correct="false">
          <input id="user-response">
        </div>
      </div>
      <ul><li><a class="additional-content__item additional-content__item--last-items"></a></li></ul>
    `,
    'https://www.wanikani.com/subjects/review'
  );

  await loadUserscript(dom, 'wk-redo-answer.js', {
    Stimulus: {
      getControllerForElementAndIdentifier() {
        return {};
      }
    }
  });

  const redoButton = dom.window.document.querySelector('.additional-content__item--redo-answer');

  assert.equal(redoButton.getAttribute('aria-disabled'), 'true');
});

test('redo answer can reset the current quiz input through the WaniKani controller', async () => {
  const dom = createDom(
    `
      <div class="quiz-input">
        <div class="quiz-input__input-container">
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
    quizQueueOutlet: {
      submitAnswer() {},
      nextItem() {}
    },
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
  const inputContainer = dom.window.document.querySelector('.quiz-input__input-container');

  controller.quizQueueOutlet.submitAnswer('old answer', { action: 'pass' });
  inputContainer.setAttribute('correct', '');

  await waitFor(() => {
    assert.equal(redoButton.getAttribute('aria-disabled'), 'false');
  });

  redoButton.click();

  await new Promise(resolve => dom.window.requestAnimationFrame(resolve));

  const input = dom.window.document.querySelector('#user-response');
  assert.equal(controller.lastAnswer, null);
  assert.equal(controller.inputChars, '');
  assert.equal(controller.inputEnabled, true);
  assert.equal(controller.updateQuestionCalls.length, 1);
  assert.equal(controller.updateQuestionCalls[0].subject, controller.currentSubject);
  assert.equal(controller.updateQuestionCalls[0].questionType, controller.currentQuestionType);
  assert.equal(input.value, '');
  assert.equal(inputContainer.hasAttribute('correct'), false);
  assert.equal(redoButton.getAttribute('aria-disabled'), 'true');
  assert.equal(dom.window.document.querySelector('.answer-exception').textContent, '');
  assert.equal(dom.window.document.querySelector('turbo-frame#subject-info').innerHTML, '');
});

test('redo answer commits only the replacement answer when advancing', async () => {
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
  const calls = [];
  const quizQueueController = {
    submitAnswer(answer, results) {
      calls.push(['submit', answer, results]);
    },
    nextItem(questionType) {
      calls.push(['next', questionType]);
    }
  };
  const controller = {
    currentSubject: { id: 1 },
    currentQuestionType: 'meaning',
    lastAnswer: 'wrong',
    inputChars: 'wrong',
    quizQueueOutlet: quizQueueController,
    updateQuestion() {}
  };

  await loadUserscript(dom, 'wk-redo-answer.js', {
    Stimulus: {
      getControllerForElementAndIdentifier() {
        return controller;
      }
    }
  });

  const inputContainer = dom.window.document.querySelector('.quiz-input__input-container');
  const redoButton = dom.window.document.querySelector('.additional-content__item--redo-answer');
  const firstResults = { action: 'fail' };
  const replacementResults = { action: 'pass' };

  quizQueueController.submitAnswer('wrong', firstResults);
  inputContainer.setAttribute('correct', 'false');

  await waitFor(() => {
    assert.equal(redoButton.getAttribute('aria-disabled'), 'false');
  });

  redoButton.click();
  await new Promise(resolve => dom.window.requestAnimationFrame(resolve));

  quizQueueController.submitAnswer('correct', replacementResults);
  quizQueueController.nextItem('reading');

  assert.deepEqual(calls, [
    ['submit', 'correct', replacementResults],
    ['next', 'reading']
  ]);
});

test('redo answer commits a pending answer when the page exits', async () => {
  const dom = createDom(
    `
      <div class="quiz-input">
        <div class="quiz-input__input-container"><input id="user-response"></div>
      </div>
      <ul><li><a class="additional-content__item additional-content__item--last-items"></a></li></ul>
    `,
    'https://www.wanikani.com/subjects/review'
  );
  const calls = [];
  const quizQueueController = {
    submitAnswer(answer, results) {
      calls.push([answer, results]);
    },
    nextItem() {}
  };
  const controller = {
    quizQueueOutlet: quizQueueController
  };

  await loadUserscript(dom, 'wk-redo-answer.js', {
    Stimulus: {
      getControllerForElementAndIdentifier() {
        return controller;
      }
    }
  });

  const results = { action: 'pass' };
  quizQueueController.submitAnswer('answer', results);

  assert.deepEqual(calls, []);

  dom.window.dispatchEvent(new dom.window.Event('pagehide'));
  dom.window.dispatchEvent(new dom.window.Event('pagehide'));

  assert.deepEqual(calls, [['answer', results]]);
});

test('redo answer commits a pending answer before Turbo navigation', async () => {
  const dom = createDom(
    `
      <div class="quiz-input">
        <div class="quiz-input__input-container"><input id="user-response"></div>
      </div>
      <ul><li><a class="additional-content__item additional-content__item--last-items"></a></li></ul>
    `,
    'https://www.wanikani.com/subjects/review'
  );
  const calls = [];
  const quizQueueController = {
    submitAnswer(answer) {
      calls.push(answer);
    },
    nextItem() {}
  };
  const controller = { quizQueueOutlet: quizQueueController };

  await loadUserscript(dom, 'wk-redo-answer.js', {
    Stimulus: {
      getControllerForElementAndIdentifier() {
        return controller;
      }
    }
  });

  quizQueueController.submitAnswer('answer', { action: 'pass' });
  dom.window.document.dispatchEvent(new dom.window.Event('turbo:before-visit'));

  assert.deepEqual(calls, ['answer']);
});

test('redo answer moves its transaction when the queue outlet changes', async () => {
  const dom = createDom(
    `
      <div class="quiz-input"><div class="quiz-input__input-container"></div></div>
      <ul><li><a class="additional-content__item additional-content__item--last-items"></a></li></ul>
    `,
    'https://www.wanikani.com/subjects/review'
  );
  const firstCalls = [];
  const secondCalls = [];
  const firstQueue = {
    submitAnswer(answer) {
      firstCalls.push(['submit', answer]);
    },
    nextItem() {
      firstCalls.push(['next']);
    }
  };
  const secondQueue = {
    submitAnswer(answer) {
      secondCalls.push(['submit', answer]);
    },
    nextItem() {
      secondCalls.push(['next']);
    }
  };
  const controller = { quizQueueOutlet: firstQueue };

  await loadUserscript(dom, 'wk-redo-answer.js', {
    Stimulus: {
      getControllerForElementAndIdentifier() {
        return controller;
      }
    }
  });

  firstQueue.submitAnswer('first', { action: 'pass' });
  controller.quizQueueOutlet = secondQueue;
  dom.window.document.body.appendChild(dom.window.document.createElement('div'));

  await waitFor(() => {
    assert.deepEqual(firstCalls, [['submit', 'first']]);
  });

  firstQueue.submitAnswer('after uninstall', { action: 'pass' });
  secondQueue.submitAnswer('second', { action: 'pass' });

  assert.deepEqual(firstCalls, [
    ['submit', 'first'],
    ['submit', 'after uninstall']
  ]);
  assert.deepEqual(secondCalls, []);

  secondQueue.nextItem();

  assert.deepEqual(secondCalls, [
    ['submit', 'second'],
    ['next']
  ]);
});

test('redo answer reuses its transaction when the input controller changes', async () => {
  const dom = createDom(
    `
      <div class="quiz-input"><div class="quiz-input__input-container"></div></div>
      <ul><li><a class="additional-content__item additional-content__item--last-items"></a></li></ul>
    `,
    'https://www.wanikani.com/subjects/review'
  );
  const calls = [];
  const quizQueueController = {
    submitAnswer(answer) {
      calls.push(['submit', answer]);
    },
    nextItem() {
      calls.push(['next']);
    }
  };
  let controller = { quizQueueOutlet: quizQueueController };

  await loadUserscript(dom, 'wk-redo-answer.js', {
    Stimulus: {
      getControllerForElementAndIdentifier() {
        return controller;
      }
    }
  });

  quizQueueController.submitAnswer('answer', { action: 'pass' });
  controller = { quizQueueOutlet: quizQueueController };
  dom.window.document.body.appendChild(dom.window.document.createElement('div'));
  await flushMutationObservers();

  assert.deepEqual(calls, []);

  quizQueueController.nextItem();

  assert.deepEqual(calls, [
    ['submit', 'answer'],
    ['next']
  ]);
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

test('stroke order inserts a lesson tab after Radicals on kanji lessons', async () => {
  const svgText = `
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:kvg="http://kanjivg.tagaini.net" viewBox="0 0 109 109">
      <g id="kvg:kanji_5148" kvg:element="先" kvg:radical="general">
        <path id="kvg:5148-s1" d="M10 50 L90 50"></path>
        <text x="12" y="45">1</text>
      </g>
    </svg>
  `;
  const dom = createDom(
    `
      <div class="lesson-container">
        <div class="character-header character-header--kanji">
          <div class="character-header__characters" lang="ja">先</div>
        </div>
        <div class="subject-slides">
          <ul class="subject-slides__navigation-items" role="tablist">
            <li class="subject-slides__navigation-item" role="presentation">
              <a class="subject-slides__navigation-link" data-subject-slides-target="navigationItem" data-action="subject-slides#switchSlide" aria-controls="composition" aria-selected="true" role="tab" href="#composition">Radicals</a>
            </li>
            <li class="subject-slides__navigation-item" role="presentation">
              <a class="subject-slides__navigation-link" data-subject-slides-target="navigationItem" data-action="subject-slides#switchSlide" aria-controls="meaning" aria-selected="false" role="tab" href="#meaning">Meaning</a>
            </li>
          </ul>
          <div class="subject-slides__slides">
            <div class="subject-slide" id="composition" data-subject-slides-target="slide" role="tabpanel">
              <div class="subject-slide__content">
                <div class="subject-slide__sections">
                  <section class="subject-section" title="Radical Composition">
                    <h2 class="subject-section__title"><span class="subject-section__title-text">Radical Composition</span></h2>
                    <section class="subject-section__content">Radicals</section>
                  </section>
                </div>
              </div>
              <a class="subject-slide__navigation" data-action="subject-slides#switchSlide" data-subject-slides-target="nextButton" aria-label="next slide" href="#meaning">Next</a>
            </div>
            <div class="subject-slide" id="meaning" data-subject-slides-target="slide" role="tabpanel" hidden="hidden">
              <a class="subject-slide__navigation" data-action="subject-slides#switchSlide" data-subject-slides-target="prevButton" aria-label="previous slide" href="#composition">Previous</a>
              <div class="subject-slide__content"><div class="subject-slide__sections"></div></div>
            </div>
          </div>
        </div>
      </div>
    `,
    'https://www.wanikani.com/subject-lessons/-4190889689937224551/543'
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
    assert.ok(document.querySelector('#stroke-order #wk-kanjivg-stroke-order'));
  });

  const tabs = [...document.querySelectorAll('.subject-slides__navigation-link')];
  const slides = [...document.querySelectorAll('.subject-slide')];

  assert.equal(fetchedUrl, 'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/05148.svg');
  assert.deepEqual(tabs.map(tab => tab.textContent.trim()), ['Radicals', 'Stroke Order', 'Meaning']);
  assert.deepEqual(slides.map(slide => slide.id), ['composition', 'stroke-order', 'meaning']);
  assert.equal(document.querySelector('#composition [aria-label="next slide"]')?.getAttribute('href'), '#stroke-order');
  assert.equal(document.querySelector('#meaning [aria-label="previous slide"]')?.getAttribute('href'), '#stroke-order');
  assert.equal(document.querySelector('#stroke-order .wk-kanjivg-replay')?.hasAttribute('data-action'), false);
});

test('stroke order reinserts after a same-path lesson render', async () => {
  const lessonHtml = `
    <div class="lesson-container">
      <div class="character-header character-header--kanji">
        <div class="character-header__characters">先</div>
      </div>
      <div class="subject-slides">
        <ul class="subject-slides__navigation-items">
          <li><a class="subject-slides__navigation-link" href="#composition">Radicals</a></li>
          <li><a class="subject-slides__navigation-link" href="#meaning">Meaning</a></li>
        </ul>
        <div class="subject-slide" id="composition">
          <div class="subject-slide__content">
            <div class="subject-slide__sections">
              <section class="subject-section" title="Radical Composition">
                <h2><span class="subject-section__title-text">Radical Composition</span></h2>
              </section>
            </div>
          </div>
          <a class="subject-slide__navigation" aria-label="next slide" href="#meaning">Next</a>
        </div>
        <div class="subject-slide" id="meaning" hidden>
          <a class="subject-slide__navigation" aria-label="previous slide" href="#composition">Previous</a>
        </div>
      </div>
    </div>
  `;
  const svgText = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 109 109">
      <path d="M10 50 L90 50"></path>
    </svg>
  `;
  const dom = createDom(
    lessonHtml,
    'https://www.wanikani.com/subject-lessons/-4190889689937224551/543'
  );
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
    assert.ok(dom.window.document.querySelector('#stroke-order #wk-kanjivg-stroke-order'));
  });

  dom.window.document.body.innerHTML = lessonHtml;

  await waitFor(() => {
    assert.ok(dom.window.document.querySelector('#stroke-order #wk-kanjivg-stroke-order'));
  });

  assert.equal(fetchCount, 2);
});

for (const subjectType of ['radical', 'vocabulary']) {
  test(`stroke order does not run on ${subjectType} lessons`, async () => {
    const dom = createDom(
      `
        <div class="lesson-container">
          <div class="character-header character-header--${subjectType}">
            <div class="character-header__characters" lang="ja">先</div>
          </div>
          <div class="subject-slide" id="composition"></div>
        </div>
      `,
      'https://www.wanikani.com/subject-lessons/-4190889689937224551/543'
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
    assert.equal(dom.window.document.querySelector('#stroke-order'), null);
  });
}

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

test('dark theme follows a dark system preference by default', async () => {
  const dom = createDom('<main>Dashboard</main>', 'https://www.wanikani.com/');

  await loadUserscript(dom, 'wk-dark-theme.js', {
    matchMedia() {
      return {
        matches: true,
        addEventListener() {}
      };
    }
  });

  const toggle = dom.window.document.querySelector('#wk-dark-theme-toggle');

  assert.equal(dom.window.document.documentElement.dataset.wkDarkTheme, 'dark');
  assert.equal(dom.window.document.documentElement.dataset.wkDarkThemeMode, 'system');
  assert.equal(toggle?.textContent.trim(), 'System');
  assert.equal(toggle?.getAttribute('aria-label'), 'Theme: System. Click for Dark.');
});

test('dark theme toggle stays in the lower-left corner in light mode', async () => {
  const dom = createDom('<main>Dashboard</main>', 'https://www.wanikani.com/');

  await loadUserscript(dom, 'wk-dark-theme.js', {
    matchMedia() {
      return {
        matches: false,
        addEventListener() {}
      };
    }
  });

  const toggle = dom.window.document.querySelector('#wk-dark-theme-toggle');
  const toggleStyle = dom.window.getComputedStyle(toggle);

  assert.equal(toggleStyle.bottom, '16px');
  assert.equal(toggleStyle.left, '16px');
  assert.equal(toggleStyle.right, 'auto');
});

test('dark theme toggle cycles through and persists manual overrides', async () => {
  const dom = createDom('<main>Dashboard</main>', 'https://www.wanikani.com/');

  await loadUserscript(dom, 'wk-dark-theme.js', {
    matchMedia() {
      return {
        matches: false,
        addEventListener() {}
      };
    }
  });

  const root = dom.window.document.documentElement;
  const toggle = dom.window.document.querySelector('#wk-dark-theme-toggle');

  toggle.click();
  assert.equal(root.dataset.wkDarkThemeMode, 'dark');
  assert.equal(root.dataset.wkDarkTheme, 'dark');
  assert.equal(toggle.textContent.trim(), 'Dark');
  assert.equal(dom.window.localStorage.getItem('wk-dark-theme-mode'), 'dark');

  toggle.click();
  assert.equal(root.dataset.wkDarkThemeMode, 'light');
  assert.equal(root.dataset.wkDarkTheme, 'light');
  assert.equal(toggle.textContent.trim(), 'Light');
  assert.equal(dom.window.localStorage.getItem('wk-dark-theme-mode'), 'light');

  toggle.click();
  assert.equal(root.dataset.wkDarkThemeMode, 'system');
  assert.equal(root.dataset.wkDarkTheme, 'light');
  assert.equal(toggle.textContent.trim(), 'System');
  assert.equal(dom.window.localStorage.getItem('wk-dark-theme-mode'), 'system');
});

test('dark theme restores a saved override instead of the system preference', async () => {
  const dom = createDom('<main>Dashboard</main>', 'https://www.wanikani.com/');
  dom.window.localStorage.setItem('wk-dark-theme-mode', 'light');

  await loadUserscript(dom, 'wk-dark-theme.js', {
    matchMedia() {
      return {
        matches: true,
        addEventListener() {}
      };
    }
  });

  const root = dom.window.document.documentElement;
  const toggle = dom.window.document.querySelector('#wk-dark-theme-toggle');

  assert.equal(root.dataset.wkDarkThemeMode, 'light');
  assert.equal(root.dataset.wkDarkTheme, 'light');
  assert.equal(toggle.textContent.trim(), 'Light');
});

test('dark theme restores its control after Turbo replaces the page body', async () => {
  const dom = createDom('<main>Dashboard</main>', 'https://www.wanikani.com/');

  await loadUserscript(dom, 'wk-dark-theme.js', {
    matchMedia() {
      return {
        matches: true,
        addEventListener() {}
      };
    }
  });

  dom.window.document.body.innerHTML = '<main>Kanji</main>';
  dom.window.document.dispatchEvent(new dom.window.Event('turbo:load'));

  assert.equal(dom.window.document.querySelectorAll('#wk-dark-theme-toggle').length, 1);
  assert.equal(dom.window.document.querySelectorAll('#wk-dark-theme-styles').length, 1);
  assert.equal(dom.window.document.documentElement.dataset.wkDarkTheme, 'dark');
});

test('dark theme applies at document start and adds its control when the body arrives', async () => {
  const dom = createDom('<main>Dashboard</main>', 'https://www.wanikani.com/');
  dom.window.document.body.remove();

  await loadUserscript(dom, 'wk-dark-theme.js', {
    matchMedia() {
      return {
        matches: true,
        addEventListener() {}
      };
    }
  });

  assert.equal(dom.window.document.documentElement.dataset.wkDarkTheme, 'dark');
  assert.equal(dom.window.document.querySelector('#wk-dark-theme-toggle'), null);

  dom.window.document.documentElement.append(dom.window.document.createElement('body'));
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

  assert.ok(dom.window.document.querySelector('#wk-dark-theme-toggle'));
});

test('dark theme uses a lighter neutral surface palette', async () => {
  const dom = createDom('<main>Dashboard</main>', 'https://www.wanikani.com/');

  await loadUserscript(dom, 'wk-dark-theme.js', {
    matchMedia() {
      return {
        matches: true,
        addEventListener() {}
      };
    }
  });

  const styles = dom.window.getComputedStyle(dom.window.document.documentElement);

  assert.equal(styles.getPropertyValue('--wk-dark-background').trim(), '#17191f');
  assert.equal(styles.getPropertyValue('--wk-dark-surface').trim(), '#20232b');
  assert.equal(styles.getPropertyValue('--wk-dark-surface-raised').trim(), '#292d37');
  assert.equal(styles.getPropertyValue('--wk-dark-surface-hover').trim(), '#333844');
  assert.equal(styles.getPropertyValue('--wk-dark-border').trim(), '#424957');
});

test('dark theme preserves WaniKani subject and quiz-state colors', async () => {
  const dom = createDom(
    `<style>
      :root {
        --color-radical: #00aaff;
        --color-kanji: #ff00aa;
        --color-vocabulary: #aa00ff;
        --color-quiz-correct-background: #88cc00;
        --color-quiz-incorrect-background: #ff0033;
      }
    </style>`,
    'https://www.wanikani.com/'
  );

  await loadUserscript(dom, 'wk-dark-theme.js', {
    matchMedia() {
      return {
        matches: true,
        addEventListener() {}
      };
    }
  });

  const rootStyles = dom.window.getComputedStyle(dom.window.document.documentElement);

  assert.equal(rootStyles.getPropertyValue('--color-radical').trim(), '#00aaff');
  assert.equal(rootStyles.getPropertyValue('--color-kanji').trim(), '#ff00aa');
  assert.equal(rootStyles.getPropertyValue('--color-vocabulary').trim(), '#aa00ff');
  assert.equal(rootStyles.getPropertyValue('--color-quiz-correct-background').trim(), '#88cc00');
  assert.equal(rootStyles.getPropertyValue('--color-quiz-incorrect-background').trim(), '#ff0033');
});

test('dark theme responds when the system preference changes', async () => {
  const dom = createDom('<main>Dashboard</main>', 'https://www.wanikani.com/');
  let preferenceChanged;
  const preference = {
    matches: false,
    addEventListener(_event, listener) {
      preferenceChanged = listener;
    }
  };

  await loadUserscript(dom, 'wk-dark-theme.js', {
    matchMedia() {
      return preference;
    }
  });

  assert.equal(dom.window.document.documentElement.dataset.wkDarkTheme, 'light');

  preference.matches = true;
  preferenceChanged();

  assert.equal(dom.window.document.documentElement.dataset.wkDarkTheme, 'dark');
});
