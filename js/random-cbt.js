/**
 * Build a random CBT paper per subject from the merged question bank.
 */
import { CBT_SPECS } from './cbt-spec.js';

const CBT_SESSION_KEY = 'cbt-student-session';
const CBT_TEST_PREFIX = 'cbt-assembled-';

/** @param {string} seed */
export function createRng(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i);
    h |= 0;
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export function getOrCreateSessionId() {
  let id = sessionStorage.getItem(CBT_SESSION_KEY);
  if (!id) {
    id = `cbt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem(CBT_SESSION_KEY, id);
  }
  return id;
}

export function clearCbtSession() {
  const keys = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (k?.startsWith(CBT_TEST_PREFIX) || k === CBT_SESSION_KEY) keys.push(k);
  }
  keys.forEach((k) => sessionStorage.removeItem(k));
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function stemKey(item) {
  return (item.stem || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 100);
}

function isValidMcq(item, optionCount) {
  if (!item.stem || item.stem.length < 8) return false;
  const opts = item.options || [];
  if (opts.length !== optionCount) return false;
  return opts.every((o) => o.key && o.text && o.text.length > 0);
}

function collectPassages(items, allPassagesFromTests) {
  const map = new Map();
  for (const item of items) {
    for (const p of item.passages || []) {
      if (p?.id && p?.content) map.set(p.id, p);
    }
  }
  for (const p of allPassagesFromTests || []) {
    if (p?.id && p?.content) map.set(p.id, p);
  }
  return [...map.values()];
}

function bankItemToPart(item, partId) {
  return {
    partId,
    stem: item.stem,
    options: item.options || [],
    correct: item.correct || null,
    bankId: item.bankId,
  };
}

function findPartner(bank, item, usedIds, rng) {
  const refs = (item.passageRefs || []).join(',');
  const candidates = bank.filter(
    (b) =>
      b.bankId !== item.bankId &&
      !usedIds.has(b.bankId) &&
      b.testId === item.testId &&
      isValidMcq(b, CBT_SPECS.reading.optionCount) &&
      (refs ? (b.passageRefs || []).join(',') === refs : true) &&
      stemKey(b) !== stemKey(item)
  );
  if (!candidates.length) {
    return bank.find(
      (b) =>
        b.bankId !== item.bankId &&
        !usedIds.has(b.bankId) &&
        isValidMcq(b, CBT_SPECS.reading.optionCount) &&
        stemKey(b) !== stemKey(item)
    );
  }
  return candidates[Math.floor(rng() * candidates.length)];
}

function applyMultiPart(questions, bank, multiPartCount, rng) {
  if (multiPartCount <= 0) return questions;

  const indices = shuffle(
    questions.map((_, i) => i).filter((i) => !questions[i].multiPart),
    rng
  ).slice(0, multiPartCount);

  const usedPartnerIds = new Set();

  for (const idx of indices) {
    const q = questions[idx];
    const primary = q._bankItem;
    if (!primary) continue;

    const partner = findPartner(bank, primary, usedPartnerIds, rng);
    if (!partner) continue;

    usedPartnerIds.add(partner.bankId);
    const parts = [bankItemToPart(primary, 'a'), bankItemToPart(partner, 'b')];

    const third = findPartner(bank, partner, usedPartnerIds, rng);
    if (third && rng() > 0.6) {
      usedPartnerIds.add(third.bankId);
      parts.push(bankItemToPart(third, 'c'));
    }

    q.multiPart = true;
    q.parts = parts;
    q.passageRefs = primary.passageRefs || q.passageRefs;
    q.stem = 'This question has multiple parts. Answer each part below.';
    q.options = [];
    q.correct = null;
    delete q._bankItem;
  }

  return questions;
}

function normalizeQuestion(item, number, spec) {
  const q = {
    number,
    stem: item.stem,
    options: item.options || [],
    correct: item.correct || null,
    promptBullets: item.promptBullets || [],
    responseType: item.responseType || spec.responseType,
    passageRefs: item.passageRefs || [],
    multiPart: false,
    parts: null,
    bankId: item.bankId,
    _bankItem: item,
  };
  return q;
}

/**
 * @param {object} bank - merged bank JSON
 * @param {string} section
 * @param {string} [sessionId]
 */
export function assembleRandomTest(bank, section, sessionId = getOrCreateSessionId()) {
  const spec = CBT_SPECS[section];
  if (!spec) throw new Error(`Unknown section: ${section}`);

  const storageKey = `${CBT_TEST_PREFIX}${section}`;
  const cached = sessionStorage.getItem(storageKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed.sessionId === sessionId && parsed.section === section) {
        return parsed;
      }
    } catch {
      /* rebuild */
    }
  }

  const rng = createRng(`${sessionId}:${section}:${bank.generatedAt || ''}`);
  let pool = (bank.questionBank || []).filter((item) => {
    if (spec.responseType === 'open') {
      const s = item.stem || '';
      return (
        s.length > 40 &&
        !/answer\s*sheet|application\s*number|Page\s+\d+\s+of/i.test(s) &&
        (item.promptBullets?.length > 0 || /Write|Imagine|email|diary/i.test(s))
      );
    }
    return isValidMcq(item, spec.optionCount);
  });

  if (pool.length < spec.questionCount) {
    pool = [...pool];
    const extra = (bank.questionBank || []).filter(
      (item) => item.stem && !pool.some((p) => p.bankId === item.bankId)
    );
    while (pool.length < spec.questionCount && extra.length) {
      pool.push(extra.shift());
    }
  }

  pool = shuffle(pool, rng);
  const selected = pool.slice(0, spec.questionCount);

  const allPassages = [];
  for (const t of bank.tests || []) {
    if (t.passages) allPassages.push(...t.passages);
  }

  let questions = selected.map((item, i) => normalizeQuestion(item, i + 1, spec));

  if (spec.multiPartCount > 0) {
    questions = applyMultiPart(questions, pool, spec.multiPartCount, rng);
  }

  questions.forEach((q) => {
    if (!q.multiPart) delete q._bankItem;
  });

  const passages = section === 'reading' ? collectPassages(selected, allPassages) : [];

  const test = {
    id: `cbt-random-${section}-${sessionId.slice(-8)}`,
    sessionId,
    section,
    mode: 'cbt',
    title: `Random ${spec.label}`,
    spec,
    minutes: spec.minutes,
    expectedQuestions: spec.questionCount,
    questionCount: questions.length,
    multiPartCount: questions.filter((q) => q.multiPart).length,
    weighting: spec.weighting,
    passages,
    questions,
    assembledAt: new Date().toISOString(),
  };

  sessionStorage.setItem(storageKey, JSON.stringify(test));
  return test;
}

export function loadOrAssembleTest(section) {
  const storageKey = `${CBT_TEST_PREFIX}${section}`;
  const cached = sessionStorage.getItem(storageKey);
  const sessionId = getOrCreateSessionId();
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed.sessionId === sessionId) return Promise.resolve(parsed);
    } catch {
      /* fetch bank */
    }
  }
  return fetch(`data/banks/${section}.json`)
    .then((r) => {
      if (!r.ok) throw new Error('Bank not found');
      return r.json();
    })
    .then((bank) => assembleRandomTest(bank, section, sessionId));
}

export function regenerateTest(section) {
  sessionStorage.removeItem(`${CBT_TEST_PREFIX}${section}`);
  return loadOrAssembleTest(section);
}
