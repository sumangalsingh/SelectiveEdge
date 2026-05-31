/**
 * Subject landing — CBT per NSW selective specifications
 */
import { CBT_SPECS, CBT_SECTION_ORDER } from './cbt-spec.js';
import { getOrCreateSessionId, clearCbtSession, regenerateTest } from './random-cbt.js';

async function loadBank(section) {
  const res = await fetch(`data/banks/${section}.json`);
  if (!res.ok) throw new Error('Could not load question bank');
  return res.json();
}

function renderSubjectPage(sectionKey) {
  const spec = CBT_SPECS[sectionKey];
  if (!spec) return;

  document.title = `${spec.label} — SHS Practice`;
  const titleEl = document.getElementById('page-title');
  const leadEl = document.getElementById('page-lead');
  const panelEl = document.getElementById('cbt-panel');

  if (titleEl) titleEl.textContent = spec.label;
  if (leadEl) {
    leadEl.textContent = `Online test: ${spec.questionCount} question${spec.questionCount > 1 ? 's' : ''}, ${spec.minutes} minutes, ${spec.weighting * 100}% weighting.`;
  }

  loadBank(sectionKey)
    .then((bank) => {
      const pool =
        spec.responseType === 'open'
          ? bank.questionBank.filter((i) => i.stem?.length > 40)
          : bank.questionBank.filter((i) => (i.options || []).length === spec.optionCount);

      const sessionId = getOrCreateSessionId();
      const multiLine =
        spec.multiPartCount > 0
          ? `<li><strong>${spec.multiPartCount}</strong> questions include multiple parts (like the real test)</li>`
          : '';

      if (!panelEl) return;

      const enough = pool.length >= spec.questionCount;
      panelEl.innerHTML = `
        <section class="cbt-hero">
          <p>Each student receives one random paper.</p>
          <ul class="cbt-spec-list">
            <li><strong>${spec.questionCount}</strong> questions</li>
            <li><strong>${spec.minutes}</strong> minutes</li>
            <li>Format: ${spec.responseType === 'open' ? 'Open response' : `Multiple-choice (${spec.optionCount} options)`}</li>
            ${multiLine}
          </ul>
          ${
            enough
              ? `<p class="cbt-session">Session: <code>${sessionId}</code></p>
                 <div class="cbt-actions">
                   <a class="btn-start btn-start-lg" href="player.html?section=${encodeURIComponent(sectionKey)}&mode=cbt">Start ${spec.label}</a>
                   <button type="button" class="btn-secondary" id="btn-new-session">New paper</button>
                 </div>`
              : `<p class="cbt-warning">Not enough questions (${pool.length}/${spec.questionCount}).</p>`
          }
        </section>`;

      document.getElementById('btn-new-session')?.addEventListener('click', async () => {
        clearCbtSession();
        await regenerateTest(sectionKey);
        window.location.reload();
      });
    })
    .catch((err) => {
      if (panelEl) panelEl.innerHTML = `<p>Error: ${escapeHtml(err.message)}</p>`;
    });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderExamHub() {
  const el = document.getElementById('exam-hub');
  if (!el) return;

  el.innerHTML = `
    <section class="cbt-hero">
      <h2>Full practice exam</h2>
      <p>Complete each section in order.</p>
      <ol class="exam-section-list">
        ${CBT_SECTION_ORDER.map((key) => {
          const s = CBT_SPECS[key];
          return `<li>
            <strong>${s.label} (${s.questionCount} Q, ${s.minutes} min)</strong>
            <a class="btn-start" href="player.html?section=${key}&mode=cbt">Start</a>
          </li>`;
        }).join('')}
      </ol>
      <button type="button" class="btn-secondary" id="btn-clear-all-sessions">Reset all papers</button>
    </section>`;

  document.getElementById('btn-clear-all-sessions')?.addEventListener('click', () => {
    clearCbtSession();
    CBT_SECTION_ORDER.forEach((k) => {
      sessionStorage.removeItem(`cbt-assembled-${k}`);
    });
    alert('All papers cleared. Each section will draw a new paper on next start.');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const section = document.body.dataset.section;
  if (section) renderSubjectPage(section);
  if (document.body.dataset.page === 'home') renderExamHub();
});
