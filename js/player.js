/**
 * Janison-style random CBT test player
 */
import { CBT_SPECS } from './cbt-spec.js';
import { loadOrAssembleTest, regenerateTest, clearCbtSession } from './random-cbt.js';

const ZOOM_LEVELS = [100, 125, 150];
const STORAGE_PREFIX = 'shs-player-';

const state = {
  section: null,
  test: null,
  route: 'instruction',
  questionIndex: 0,
  answers: {},
  flagged: {},
  timerSeconds: 0,
  timerInterval: null,
  timerVisible: true,
  zoomIndex: 0,
  activePassage: 0,
};

function getParams() {
  return new URLSearchParams(window.location.search);
}

function storageKey(suffix) {
  return `${STORAGE_PREFIX}${state.test?.id}-${suffix}`;
}

function answerKey(q, partId = null) {
  if (q.multiPart && partId) return `${q.number}-${partId}`;
  return String(q.number);
}

function loadSession() {
  if (!state.test) return;
  try {
    const a = sessionStorage.getItem(storageKey('answers'));
    const f = sessionStorage.getItem(storageKey('flagged'));
    if (a) state.answers = JSON.parse(a);
    if (f) state.flagged = JSON.parse(f);
  } catch {
    /* ignore */
  }
}

function saveSession() {
  if (!state.test) return;
  sessionStorage.setItem(storageKey('answers'), JSON.stringify(state.answers));
  sessionStorage.setItem(storageKey('flagged'), JSON.stringify(state.flagged));
}

function parseHash() {
  const hash = window.location.hash.slice(1) || '/instruction/1';
  const parts = hash.split('/').filter(Boolean);
  if (parts[0] === 'instruction') return { route: 'instruction', questionIndex: 0 };
  if (parts[0] === 'question') {
    const n = parseInt(parts[1], 10) || 1;
    return { route: 'question', questionIndex: Math.max(0, n - 1) };
  }
  if (parts[0] === 'finish') return { route: 'finish', questionIndex: 0 };
  return { route: 'instruction', questionIndex: 0 };
}

function setHash(route, n) {
  if (route === 'instruction') window.location.hash = '#/instruction/1';
  else if (route === 'question') window.location.hash = `#/question/${n + 1}`;
  else if (route === 'finish') window.location.hash = '#/finish';
}

function questions() {
  return state.test?.questions || [];
}

function currentQuestion() {
  return questions()[state.questionIndex];
}

function isQuestionAnswered(q) {
  if (q.multiPart && q.parts?.length) {
    return q.parts.every((p) => state.answers[answerKey(q, p.partId)]);
  }
  if (q.responseType === 'open' || state.section === 'writing') {
    return !!state.answers[answerKey(q)];
  }
  return !!state.answers[answerKey(q)];
}

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function startTimer() {
  if (state.timerInterval) return;
  state.timerInterval = setInterval(() => {
    if (state.timerSeconds > 0) {
      state.timerSeconds -= 1;
      updateTimerDisplay();
    } else {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
  }, 1000);
}

function updateTimerDisplay() {
  const el = document.getElementById('timer');
  if (!el) return;
  el.textContent = formatTime(state.timerSeconds);
  el.classList.toggle('warning', state.timerSeconds > 0 && state.timerSeconds <= 300);
  el.hidden = !state.timerVisible;
}

function renderInstruction() {
  const main = document.getElementById('player-main');
  const spec = state.test.spec || CBT_SPECS[state.section];
  document.getElementById('progress-bar').hidden = true;
  document.getElementById('player-footer').hidden = false;
  document.getElementById('btn-back').disabled = true;
  document.getElementById('btn-flag').hidden = true;

  const multiNote =
    spec.multiPartCount > 0
      ? `<p><strong>${spec.multiPartCount}</strong> of <strong>${spec.questionCount}</strong> questions have multiple parts.</p>`
      : '';

  main.innerHTML = `
    <div class="instruction-panel">
      <h1>${spec.label}</h1>
      <p class="cbt-badge"> ${spec.weighting * 100}% weighting (practice)</p>
      <p>${spec.instructions}</p>
      ${multiNote}
      <div class="instruction-box">
        <div>
          <h3>Next and Back</h3>
          <p>After selecting your answer(s), click <strong>Next</strong>. The test does not advance automatically.</p>
          <p>Use <strong>Back</strong> to review or change answers.</p>
          <h3>Flag feature</h3>
          <p>Flag questions you want to revisit using the progress grid.</p>
        </div>
        <div>
          <h3>Timer</h3>
          <p>You have <strong>${spec.minutes} minutes</strong> for this section.</p>
          <p>Your paper is randomly selected and stays the same until you start a new session.</p>
          <h3>Progress summary</h3>
          <p>Click the question grid to jump to any question.</p>
        </div>
      </div>
      <p><em>Paper ID: ${state.test.id}</em></p>
    </div>`;

  document.getElementById('btn-next').textContent = 'Next ▶';
}

function getPassagesForQuestion(q) {
  const refs = q.passageRefs || [];
  const all = state.test.passages || [];
  if (!refs.length) return all;
  return refs.map((id) => all.find((p) => p.id === id)).filter(Boolean);
}

function renderMcqPart(q, part, partLabel) {
  const key = answerKey(q, part.partId);
  const selected = state.answers[key];
  const opts = (part.options || [])
    .map(
      (o) => `
    <li class="option-item">
      <label class="option-label ${selected === o.key ? 'selected' : ''}">
        <input type="radio" name="${key}" value="${o.key}" ${selected === o.key ? 'checked' : ''} />
        <span class="option-key">${o.key}</span>
        <span class="option-text">${escapeHtml(o.text)}</span>
      </label>
    </li>`
    )
    .join('');
  return `
    <div class="question-part">
      ${partLabel ? `<h3 class="part-label">${partLabel}</h3>` : ''}
      <div class="question-stem">${escapeHtml(part.stem)}</div>
      <ul class="options-list">${opts}</ul>
    </div>`;
}

function bindMcqRadios(container, q, partId = null) {
  container.querySelectorAll('input[type=radio]').forEach((input) => {
    input.addEventListener('change', () => {
      const key = answerKey(q, partId);
      state.answers[key] = input.value;
      saveSession();
      const label = input.closest('.option-label');
      const list = label?.closest('.options-list');
      list?.querySelectorAll('.option-label').forEach((l) => l.classList.remove('selected'));
      label?.classList.add('selected');
      renderProgressGrid();
    });
  });
}

function renderQuestion() {
  const q = currentQuestion();
  if (!q) {
    setHash('finish');
    return renderFinish();
  }

  document.getElementById('progress-bar').hidden = false;
  document.getElementById('player-footer').hidden = false;
  document.getElementById('btn-back').disabled = state.questionIndex === 0;
  document.getElementById('btn-flag').hidden = false;
  document.getElementById('btn-flag').classList.toggle('flagged', !!state.flagged[q.number]);

  const total = questions().length;
  const partNote = q.multiPart ? ' (multiple parts)' : '';
  document.getElementById('progress-label').textContent =
    `Question ${state.questionIndex + 1} of ${total}${partNote}`;

  const isWriting = q.responseType === 'open' || state.section === 'writing';
  const passages = getPassagesForQuestion(q);
  const hasSplit = passages.length > 0 && !isWriting;

  const main = document.getElementById('player-main');

  let passageHtml = '';
  if (hasSplit) {
    const tabs = passages
      .map(
        (p, i) =>
          `<button type="button" class="passage-tab ${i === state.activePassage ? 'active' : ''}" data-tab="${i}">${escapeHtml((p.title.split(':')[0] || p.id).trim())}</button>`
      )
      .join('');
    const active = passages[state.activePassage] || passages[0];
    passageHtml = `
      <div class="passage-pane">
        <div class="passage-tabs">${tabs}</div>
        <div class="passage-title">${escapeHtml(active.title)}</div>
        <div class="passage-body">${escapeHtml(active.content)}</div>
      </div>`;
  }

  let answerHtml;
  if (isWriting) {
    const key = answerKey(q);
    answerHtml = `
      <div class="question-heading"><h2>Writing task</h2></div>
      <div class="question-stem">${formatStem(q.stem)}</div>
      ${(q.promptBullets || []).map((b) => `<p>• ${escapeHtml(b)}</p>`).join('')}
      <textarea class="writing-area" id="writing-input" placeholder="Write your response here…">${escapeHtml(state.answers[key] || '')}</textarea>`;
  } else if (q.multiPart && q.parts?.length) {
    answerHtml = `
      <div class="question-heading"><h2>Q${q.number}</h2> <span class="multipart-badge">Multiple parts</span></div>
      <p class="question-stem">${escapeHtml(q.stem)}</p>
      ${q.parts.map((p, i) => renderMcqPart(q, p, `Part ${String.fromCharCode(97 + i)}`)).join('')}`;
  } else {
    answerHtml = renderMcqPart(q, q, null);
    answerHtml = `<div class="question-heading"><h2>Q${q.number}</h2></div>${answerHtml}`;
  }

  if (hasSplit) {
    main.innerHTML = `
      <div class="split-layout" id="split-layout">
        ${passageHtml}
        <div class="question-pane">${answerHtml}</div>
      </div>`;
    main.querySelectorAll('.passage-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activePassage = parseInt(btn.dataset.tab, 10);
        renderQuestion();
      });
    });
  } else {
    main.innerHTML = `<div class="question-panel">${answerHtml}</div>`;
  }

  if (isWriting) {
    const ta = document.getElementById('writing-input');
    ta?.addEventListener('input', () => {
      state.answers[answerKey(q)] = ta.value;
      saveSession();
      renderProgressGrid();
    });
  } else if (q.multiPart) {
    q.parts.forEach((p) => bindMcqRadios(main, q, p.partId));
  } else {
    bindMcqRadios(main, q);
  }

  const isLast = state.questionIndex >= total - 1;
  document.getElementById('btn-next').textContent = isLast ? 'Finish ▶' : 'Next ▶';
  renderProgressGrid();
}

function scoreQuestion(q) {
  let scorable = 0;
  let score = 0;
  const details = [];

  if (q.multiPart && q.parts?.length) {
    for (const p of q.parts) {
      const ans = state.answers[answerKey(q, p.partId)];
      if (p.correct) {
        scorable += 1;
        const ok = ans === p.correct;
        if (ok) score += 1;
        details.push({ partId: p.partId, ans, correct: p.correct, ok });
      }
    }
  } else if (q.responseType !== 'open' && q.correct) {
    scorable = 1;
    const ans = state.answers[answerKey(q)];
    const ok = ans === q.correct;
    if (ok) score = 1;
    details.push({ ans, correct: q.correct, ok });
  }

  return { scorable, score, details };
}

function renderFinish() {
  document.getElementById('progress-bar').hidden = true;
  document.getElementById('player-footer').hidden = true;
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }

  const qs = questions();
  let totalScore = 0;
  let totalScorable = 0;
  const review = qs.map((q) => {
    const { scorable, score, details } = scoreQuestion(q);
    totalScorable += scorable;
    totalScore += score;
    const answered = isQuestionAnswered(q);
    let status = 'unanswered';
    if (q.responseType === 'open') status = answered ? 'answered' : 'unanswered';
    else if (scorable && score === scorable && scorable > 0) status = 'correct';
    else if (scorable && answered) status = 'incorrect';
    else if (answered) status = 'answered';
    return { q, details, status, scorable, score };
  });

  const pct = totalScorable ? Math.round((totalScore / totalScorable) * 100) : null;
  const spec = state.test.spec || CBT_SPECS[state.section];

  const main = document.getElementById('player-main');
  main.innerHTML = `
    <div class="finish-panel">
      <h1>Section complete</h1>
      <p><strong>${spec.label}</strong></p>
      ${pct !== null ? `<p class="result-row"><span>Score (items with known answers)</span><strong>${totalScore} / ${totalScorable} (${pct}%)</strong></p>` : '<p>Writing is not auto-marked. MCQ items without published answers are excluded from scoring.</p>'}
      <p>Answered: ${qs.filter(isQuestionAnswered).length} / ${qs.length} questions</p>
      <p class="test-card-meta">Section weighting in the real test: ${spec.weighting * 100}%</p>
      <h2>Review</h2>
      <div class="review-list">
        ${review
          .map(({ q, details, status }) => {
            const cls = status;
            let detailHtml = '';
            if (q.multiPart) {
              detailHtml = details
                .map(
                  (d) =>
                    `<p>Part ${d.partId}: yours <strong>${d.ans || '—'}</strong>${d.correct ? ` · correct <strong>${d.correct}</strong>` : ''}</p>`
                )
                .join('');
            } else if (q.correct && q.responseType !== 'open') {
              const d = details[0];
              detailHtml = `<p>Yours <strong>${d?.ans || '—'}</strong> · Correct <strong>${q.correct}</strong></p>`;
            } else if (q.responseType === 'open') {
              const len = (state.answers[answerKey(q)] || '').length;
              detailHtml = `<p><em>Response saved (${len} characters)</em></p>`;
            }
            const stemPreview = q.multiPart
              ? `Question ${q.number} (${q.parts.length} parts)`
              : escapeHtml((q.stem || '').slice(0, 120));
            return `<div class="review-item ${cls}"><strong>Q${q.number}</strong><p>${stemPreview}</p>${detailHtml}</div>`;
          })
          .join('')}
      </div>
      <p style="margin-top:2rem;display:flex;flex-wrap:wrap;gap:0.5rem">
        <a href="index.html" class="btn-start">Home</a>
        <a href="${state.section}.html" class="btn-start">${spec.label}</a>
        <button type="button" class="btn-start" id="btn-new-paper" style="border:none">New paper</button>
      </p>
    </div>`;

  document.getElementById('btn-new-paper')?.addEventListener('click', async () => {
    sessionStorage.removeItem(storageKey('answers'));
    sessionStorage.removeItem(storageKey('flagged'));
    await regenerateTest(state.section);
    window.location.href = `player.html?section=${encodeURIComponent(state.section)}&mode=cbt`;
  });
}

function renderProgressGrid() {
  const grid = document.getElementById('progress-grid');
  if (!grid) return;
  grid.innerHTML = questions()
    .map((q, i) => {
      const classes = ['progress-cell'];
      if (isQuestionAnswered(q)) classes.push('answered');
      if (state.flagged[q.number]) classes.push('flagged');
      if (q.multiPart) classes.push('multipart');
      if (i === state.questionIndex) classes.push('current');
      return `<button type="button" class="${classes.join(' ')}" data-q="${i}" title="${q.multiPart ? 'Multiple parts' : ''}">${q.number}${q.multiPart ? '*' : ''}</button>`;
    })
    .join('');

  grid.querySelectorAll('.progress-cell').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.questionIndex = parseInt(btn.dataset.q, 10);
      document.getElementById('progress-dialog').close();
      setHash('question', state.questionIndex);
    });
  });
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatStem(stem) {
  return escapeHtml(stem).replace(/\n\n/g, '</p><p>').replace(/^/, '<p>').replace(/$/, '</p>');
}

function navigate(route, index) {
  state.route = route;
  state.questionIndex = index;
  state.activePassage = 0;
  if (route === 'instruction') renderInstruction();
  else if (route === 'question') renderQuestion();
  else if (route === 'finish') renderFinish();
}

function bindControls() {
  document.getElementById('exit-home-btn')?.addEventListener('click', () => {
    // 1. Create a background overlay container
    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'custom-confirm-modal';
    modalOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
    `;

    // 2. Create the Modal Box structure
    modalOverlay.innerHTML = `
        <div style="
            background: #ffffff;
            width: 400px;
            border-radius: 6px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            overflow: hidden;
            font-family: Arial, sans-serif;
        ">
            <div style="
                background: #d9534f; 
                color: white; 
                padding: 12px 16px; 
                font-weight: bold; 
                font-size: 16px;
            ">
                ⚠️ Warning
            </div>
            
            <div style="padding: 20px 16px; color: #333333; font-size: 14px; line-height: 1.5;">
                Are you sure to end the test and exit?
            </div>
            
            <div style="
                padding: 12px 16px; 
                background: #f5f5f5; 
                text-align: right; 
                border-top: 1px solid #e5e5e5;
            ">
                <button id="modal-cancel" style="
                    background: #d9534f; 
                    color: white; 
                    border: none;  
                    padding: 6px 14px; 
                    border-radius: 4px; 
                    margin-right: 8px; 
                    cursor: pointer;
                    font-size: 14px;
                ">Cancel</button>
                
                <button id="modal-ok" style="
                    background: #ffffff; 
                    border: 1px solid #ccc; 
                    padding: 6px 14px; 
                    border-radius: 4px; 
                    cursor: pointer;
                    font-size: 14px;
                ">OK</button>
            </div>
        </div>
    `;

    document.body.appendChild(modalOverlay);

    document.getElementById('modal-ok').addEventListener('click', () => {
        modalOverlay.remove();
        window.location.href = '/'; 
    });

    document.getElementById('modal-cancel').addEventListener('click', () => {
        modalOverlay.remove();
    });
  }); 
  
  document.getElementById('btn-next')?.addEventListener('click', () => {
    if (state.route === 'instruction') {
      startTimer();
      setHash('question', 0);
      return;
    }
    if (state.route === 'question') {
      if (state.questionIndex < questions().length - 1) {
        setHash('question', state.questionIndex + 1);
      } else {
        setHash('finish');
      }
    }
  });

  document.getElementById('btn-back')?.addEventListener('click', () => {
    if (state.route === 'question' && state.questionIndex > 0) {
      setHash('question', state.questionIndex - 1);
    } else if (state.route === 'question') {
      setHash('instruction');
    }
  });

  document.getElementById('btn-flag')?.addEventListener('click', () => {
    const q = currentQuestion();
    if (!q) return;
    state.flagged[q.number] = !state.flagged[q.number];
    if (!state.flagged[q.number]) delete state.flagged[q.number];
    saveSession();
    document.getElementById('btn-flag').classList.toggle('flagged', !!state.flagged[q.number]);
    renderProgressGrid();
  });

  document.getElementById('btn-progress')?.addEventListener('click', () => {
    renderProgressGrid();
    document.getElementById('progress-dialog').showModal();
  });

  document.getElementById('btn-close-progress')?.addEventListener('click', () => {
    document.getElementById('progress-dialog').close();
  });

  document.getElementById('btn-timer-toggle')?.addEventListener('click', () => {
    state.timerVisible = !state.timerVisible;
    updateTimerDisplay();
    document.getElementById('btn-timer-toggle').textContent = state.timerVisible ? 'Hide time' : 'Show time';
  });

  document.getElementById('btn-zoom')?.addEventListener('click', () => {
    state.zoomIndex = (state.zoomIndex + 1) % ZOOM_LEVELS.length;
    const z = ZOOM_LEVELS[state.zoomIndex];
    document.body.className = `player-body zoom-${z}`;
    document.getElementById('btn-zoom').textContent = `${z}%`;
  });

  window.addEventListener('hashchange', () => {
    const { route, questionIndex } = parseHash();
    navigate(route, questionIndex);
  });
}

function confirmExit() {
  const userConfirmed = confirm('Are you sure to end the test and exit?');
  
  if (userConfirmed) {
      window.location.href = '/'; 
  }
}

async function init() {
  const params = getParams();
  const section = params.get('section');
  const mode = params.get('mode') || 'cbt';

  if (!section) {
    document.getElementById('player-main').innerHTML =
      '<p style="padding:2rem">Missing subject. <a href="index.html">Return home</a></p>';
    return;
  }

  state.section = section;

  try {
    if (mode === 'cbt' || !params.get('test')) {
      state.test = await loadOrAssembleTest(section);
    } else {
      const res = await fetch(`data/banks/${section}.json`);
      const bank = await res.json();
      state.test = bank.tests.find((t) => t.id === params.get('test'));
      if (!state.test) throw new Error('Test not found');
    }
  } catch (e) {
    document.getElementById('player-main').innerHTML =
      `<p style="padding:2rem">Could not load test: ${escapeHtml(e.message)}</p>`;
    return;
  }

  document.title = `${state.test.title} — Test Player`;
  state.timerSeconds = (state.test.minutes || 40) * 60;
  updateTimerDisplay();
  loadSession();
  bindControls();

  const { route, questionIndex } = parseHash();
  navigate(route, questionIndex);
}

init();
