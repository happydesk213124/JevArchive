//@name jevarchive
//@display-name 🏛️JevArchive 1.0.0
//@api 3.0
//@version 1.0.0
//@update-url https://raw.githubusercontent.com/happydesk213124/JevArchive/main/jevarchive.js
//@arg jev_api_key string (선택) Jev API 키. JevArchive 화면의 설정에서 넣어도 됩니다.

// ============================================================================
// JevArchive — 대화를 그대로 간직하고, 지금 필요한 장면을 꺼내 주는 장기기억 (글 쓰는 모델 없이)
//
//  기억 = 칸 줄 (보낸 뒤 뒤에서 만든다)
//    · 문장마다 종류(사건 · 행동 · 사실 · 약속 · 비밀)와 누가/누구랑/누구에게/언제/어디서/무엇을/어떻게/왜.
//      단어는 원문 그대로, 칸만 Jev가 고른다. 언제 · 어디서는 상태창으로 채운다. 칸 줄을 임베딩해 둔다
//    · 회상: 칸 줄 지문 + 글자로 후보 → Jev가 0~3점 → 고른 칸 줄(+같은 메시지 이웃)을 넣는다
//  이야기 (보낸 뒤, 뒤에서)
//    · 인물 · 관계(가까워짐/멀어짐 · 사이) · 약속 · 비밀 · 이야기 시간(상태줄)
//    · 감독 힌트(선택): 회상과 같은 Jev 호출에서 템포 · 꺼낼 약속 · 먼저 움직일 인물 · 분위기를 고른다
//  저장
//    · 원문은 Risu 채팅에 있으니 저장하지 않는다. 기기에는 벡터와 카드, 세이브 파일에는 설정과 이야기 장부(몇 KB)
// ============================================================================

(async () => {
  'use strict';

  const R = globalThis.risuai ?? globalThis.Risuai;
  const LOG = '[JevArchive]';
  const KEY = 'jevarchive_';
  const SETTINGS_KEY = 'jevarchive_settings';
  const PLACEHOLDER = /\[jevarchive\]/gi;

  // ── 프로바이더 ──
  const JEV_PRESETS = {
    openrouter: {
      label: 'OpenRouter', badge: '추천', desc: 'OpenRouter 키 하나로 Jev와 임베딩을 같이 써요.', endpoint: 'https://openrouter.ai/api/v1/systemone', model: 'typesafe/jev-1.14', keyHint: 'sk-or-v1-…', keyUrl: 'https://openrouter.ai/keys',
      models: [
        { id: 'typesafe/jev-1.14', label: 'Jev 1.14' },
        { id: '~typesafe/jev-latest', label: 'Jev 최신 (새 버전 나오면 자동으로 바뀜)' },
        { id: 'typesafe/jev-1.13', label: 'Jev 1.13 (이전 버전)' },
      ],
    },
    typesafe: {
      label: 'TypeSafe 직결', desc: 'TypeSafe 콘솔에서 받은 키를 써요.', endpoint: 'https://api.typesafe.ai/v1/systemone', model: 'jev-latest', keyHint: 'TypeSafe API 키', keyUrl: 'https://console.typesafe.ai',
      models: [
        { id: 'jev-latest', label: 'Jev 최신 (새 버전 나오면 자동으로 바뀜)' },
        { id: 'jev-1.14.0', label: 'Jev 1.14' },
        { id: 'jev-1.13.0', label: 'Jev 1.13 (이전 버전)' },
        { id: 'jev-preview', label: 'Jev 미리보기 (실험용)' },
      ],
    },
    custom: { label: '직접 입력', desc: 'System One 형식을 받는 다른 주소.', endpoint: '', model: '', keyHint: 'API 키', models: [] },
  };

  const EMBED_PRESETS = {
    openrouter: { label: 'OpenRouter', badge: 'Jev와 같은 키', desc: '키를 따로 넣을 필요가 없어요. 아주 싸요.', format: 'openai', endpoint: 'https://openrouter.ai/api/v1/embeddings', model: 'openai/text-embedding-3-small', models: ['openai/text-embedding-3-small', 'openai/text-embedding-3-large', 'qwen/qwen3-embedding-0.6b'], key: 'jev', mrl: true },
    local: { label: '무료 · API 없음', badge: '설정 없음', desc: '글자 조각으로 비슷한 정도를 계산해요. 표현이 많이 다르면 놓쳐요.', format: 'local', key: 'none' },
    openai: { label: 'OpenAI', desc: 'OpenAI 키를 써요.', format: 'openai', endpoint: 'https://api.openai.com/v1/embeddings', model: 'text-embedding-3-small', models: ['text-embedding-3-small', 'text-embedding-3-large'], key: 'own', mrl: true, keyUrl: 'https://platform.openai.com/api-keys' },
    gemini: { label: 'Google Gemini', desc: '무료 한도가 넉넉해요.', format: 'gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-embedding-001', models: ['gemini-embedding-001'], key: 'own', mrl: true, keyUrl: 'https://aistudio.google.com/apikey' },
    voyage: { label: 'Voyage AI', desc: '검색 품질이 좋은 편이에요.', format: 'openai', endpoint: 'https://api.voyageai.com/v1/embeddings', model: 'voyage-4-lite', models: ['voyage-4-lite', 'voyage-4', 'voyage-4-large'], key: 'own', keyUrl: 'https://dashboard.voyageai.com' },
    jina: { label: 'Jina AI', desc: '다국어에 강해요.', format: 'openai', endpoint: 'https://api.jina.ai/v1/embeddings', model: 'jina-embeddings-v3', models: ['jina-embeddings-v3'], key: 'own', keyUrl: 'https://jina.ai/api-dashboard' },
    ollama: { label: 'Ollama', badge: '내 컴퓨터', desc: '내 컴퓨터에서 돌려요. 무료.', format: 'ollama', endpoint: 'http://localhost:11434', model: 'bge-m3', models: ['bge-m3', 'nomic-embed-text', 'mxbai-embed-large'], key: 'none' },
    lmstudio: { label: 'LM Studio', badge: '내 컴퓨터', desc: '내 컴퓨터에서 돌려요. 무료.', format: 'openai', endpoint: 'http://localhost:1234/v1/embeddings', model: 'text-embedding-bge-m3', key: 'none' },
    custom: { label: '직접 입력', desc: 'OpenAI 형식(/embeddings)을 받는 주소.', format: 'openai', endpoint: '', model: '', key: 'own' },
  };


  const RANK_LEVELS = ['unrelated', 'background only', 'useful context', 'answers or explains the latest message'];
  const SEARCH_NEEDS = {
    none: 'nothing important is missing',
    fact: 'a specific earlier fact the latest message asks about (name, number, place, wording)',
    cause: 'the earlier promise, instruction, or motive behind the current action',
    change: 'a later update or correction to a recorded state or plan',
    knowledge: 'who learned, heard, or believes the information',
  };
  const NEED_QUERY = { fact: 'earlier record of', cause: 'earlier reason or promise behind', change: 'latest update or correction about', knowledge: 'who knows or told about' };
  const DEFAULT_NOTE = 'Earlier chat excerpts in original wording, oldest first. Later excerpts may update earlier ones; the current chat wins.';

  const VEC_BITS = 256;           // 조각마다 256칸의 부호만 저장 (32바이트). V7에서 실수 벡터와 점수 같음
  const KEEP_LEVEL = 1.5;         // Jev 점수(0~3)가 이 이상이면 넣는다
  const EMBED_BATCH = 64;
  const JEV_TIMEOUT_MS = 20000;
  const EMBED_TIMEOUT_MS = 20000;
  const LOCAL_DIMS = 384;
  const SHARDS = 16;              // 채팅마다 벡터를 16조각으로 나눠 저장 (바뀐 조각만 쓴다)
  const SAVE_DELAY = 1500;

  const DEFAULT_SETTINGS = {
    enabled: true, onboarded: false,
    jevPreset: 'openrouter', jevKey: '', jevEndpoint: '', jevModel: '',
    embedPreset: 'openrouter', embedKey: '', embedEndpoint: '', embedModel: '',
    budget: 600, candidates: 16, neighbor: 1, tailTokens: 120, indexPerSend: 100,
    story: true, cards: false, director: false, intim: false, memForm: 'sentence', jevPrice: 0.042, jevParallel: 2, sceneChars: 6000, tags: true, skipStatus: true,
    dirCards: true, dirAuto: true, dirFreq: 'normal', dirPacks: ['basic', 'romance', 'daily', 'mystery', 'fantasy', 'horror', 'custom'], dirOff: [], dirCustom: [], dirUserPacks: [],
    injectMode: 'last_user', note: DEFAULT_NOTE, showButton: true,
  };

  const stats = { jevCalls: 0, embedCalls: 0, lastError: '', lastErrorAt: 0 };

  // ── 유틸 ──
  function hashText(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  function estimateTokens(text) {
    let t = 0;
    for (const ch of text) { const c = ch.charCodeAt(0); t += c >= 0xac00 && c <= 0xd7af ? 0.8 : c >= 0x3040 && c <= 0x9fff ? 0.9 : 0.25; }
    return Math.ceil(t);
  }
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const nowMs = () => (globalThis.performance?.now?.() ?? Date.now());
  function contentOf(message) {
    const c = message?.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map(p => (typeof p === 'string' ? p : p?.text ?? '')).join('\n');
    return '';
  }
  function cleanText(text) {
    return String(text ?? '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(div|p|li|tr|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\{\{[^}]*\}\}/g, ' ')
      // 삽화 · 에셋 태그([[@inray::…::그림.webp::1024::1024]] 같은 [[…::…]])와 마크다운 그림은 기억에서 뺀다 (Risu는 화면에서만 그림으로 바꾼다)
      .replace(/\[\[[^[\]\n]{0,400}?::[^[\]\n]{0,1000}?\]\]/g, ' ')
      .replace(/!\[[^\]\n]{0,200}\]\([^)\n]{0,1000}\)/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }
  // 모델의 생각 블록 · OOC 같은 건 기억에서 뺀다
  const META_BLOCK = /<(thinking|think|thoughts?|reasoning|scratchpad|plan|planning|ooc|analysis|reflection)\b[^>]*>[\s\S]*?<\/\1>/gi;
  const stripMeta = (t) => String(t ?? '').replace(META_BLOCK, ' ').replace(/\[(?:OOC|ooc|System|SYSTEM|Note|NOTE)[^\]]*\]/g, ' ').replace(/\((?:OOC|ooc)[^)]*\)/g, ' ');
  // 코드 블록(```) 안의 글도 원문이라 남긴다 (상태창 등). 울타리 표시만 뗀다.
  const memText = (t) => cleanText(stripMeta(String(t ?? '').replace(/```[a-zA-Z0-9_-]*/g, ' ')));
  function clampNum(v, fallback, min, max) { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback; }
  function timeAgo(ts) {
    if (!ts) return '';
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 10) return '방금';
    if (s < 60) return `${s}초 전`;
    if (s < 3600) return `${Math.round(s / 60)}분 전`;
    if (s < 86400) return `${Math.round(s / 3600)}시간 전`;
    return `${Math.round(s / 86400)}일 전`;
  }
  function setError(where, error) {
    stats.lastError = `${where}: ${String(error?.message ?? error)}`;
    stats.lastErrorAt = Date.now();
    console.error(LOG, where, error);
  }
  function cleanKey(k) {
    return String(k ?? '').replace(/[\s​-‍⁠﻿]/g, ' ').trim().replace(/^["'`]+|["'`]+$/g, '').replace(/^bearer\s+/i, '').replace(/\s+/g, '');
  }
  function keyProblem(k, label) {
    if (!k) return `${label} 키가 비어 있어요.`;
    if (/[^\x21-\x7e]/.test(k)) return `${label} 키에 영문·숫자가 아닌 글자가 섞여 있어요. 키를 다시 복사해 붙여넣어 주세요.`;
    return '';
  }
  function friendlyHttpError(label, status, body) {
    const raw = String(body ?? '').slice(0, 160);
    if (status === 401) return `${label}: 키가 맞지 않아요. (${raw})`;
    if (status === 402) return `${label}: 크레딧이 부족해요. (${raw})`;
    if (status === 403) return `${label}: 이 키로는 쓸 수 없는 모델이거나 권한이 없어요. (${raw})`;
    if (status === 404) return `${label}: 주소나 모델 이름을 찾을 수 없어요. (${raw})`;
    if (status === 429) return `${label}: 요청이 너무 많아요. 잠시 뒤 다시 해 주세요. (${raw})`;
    if (status >= 500) return `${label}: 서버 쪽 문제예요. (${status} ${raw})`;
    return `${label} ${status}: ${raw}`;
  }

  // ══ 설정 ══
  let settings = { ...DEFAULT_SETTINGS };
  function sanitizeSettings(raw) {
    const s = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) };
    const str = (v) => (typeof v === 'string' ? v.trim() : '');
    const out = {
      enabled: s.enabled !== false,
      // 키를 이미 넣어 둔 사람은 시작 안내를 다시 띄우지 않는다
      onboarded: s.onboarded === true || !!cleanKey(s.jevKey),
      jevPreset: JEV_PRESETS[s.jevPreset] ? s.jevPreset : 'openrouter',
      jevKey: cleanKey(s.jevKey), jevEndpoint: str(s.jevEndpoint), jevModel: str(s.jevModel),
      embedPreset: EMBED_PRESETS[s.embedPreset] ? s.embedPreset : 'openrouter',
      embedKey: cleanKey(s.embedKey), embedEndpoint: str(s.embedEndpoint), embedModel: str(s.embedModel),
      budget: clampNum(s.budget, 600, 0, 20000),
      candidates: clampNum(s.candidates, 16, 4, 80),
      neighbor: clampNum(s.neighbor, 1, 0, 3),
      tailTokens: clampNum(s.tailTokens, 120, 0, 2000),
      indexPerSend: clampNum(s.indexPerSend, 100, 1, 5000),
      story: s.story !== false,
      cards: false,   // 칸 줄이 사건 카드를 대신한다
      director: s.director === true,
      intim: s.intim === true,
      skipStatus: s.skipStatus !== false,
      tags: s.tags !== false,
      sceneChars: clampNum(s.sceneChars, 6000, 1000, 30000),
      memPreset: ['light', 'balanced', 'rich', 'custom'].includes(s.memPreset) ? s.memPreset : null,
      memCustom: s.memCustom && typeof s.memCustom === 'object' ? { budget: clampNum(s.memCustom.budget, 600, 0, 20000), candidates: clampNum(s.memCustom.candidates, 16, 4, 80), neighbor: clampNum(s.memCustom.neighbor, 1, 0, 3), tailTokens: clampNum(s.memCustom.tailTokens, 120, 0, 4000) } : null,
      jevParallel: clampNum(s.jevParallel, 2, 1, 10),
      jevPrice: Number.isFinite(Number(s.jevPrice)) && Number(s.jevPrice) >= 0 && s.jevPrice !== '' && s.jevPrice != null ? Number(s.jevPrice) : 0.042,
      memForm: s.memForm === 'slots' ? 'slots' : 'sentence',
      dirCards: s.dirCards !== false,
      dirAuto: s.dirAuto !== false,
      dirFreq: DIR_FREQ[s.dirFreq] ? s.dirFreq : 'normal',
      dirPacks: Array.isArray(s.dirPacks) ? [...new Set(s.dirPacks.filter(x => typeof x === 'string'))].slice(0, 40) : [...DEFAULT_SETTINGS.dirPacks],
      dirOff: Array.isArray(s.dirOff) ? [...new Set(s.dirOff.filter(x => typeof x === 'string'))].slice(0, 3000) : [],
      dirCustom: sanitizeDirCards(s.dirCustom),
      dirUserPacks: sanitizeUserPacks(s.dirUserPacks),
      injectMode: s.injectMode === 'system' ? 'system' : 'last_user',
      note: typeof s.note === 'string' ? s.note.trim() : DEFAULT_NOTE,
      showButton: s.showButton !== false,
    };
    if (out.jevPreset !== 'custom') { out.jevEndpoint ||= JEV_PRESETS[out.jevPreset].endpoint; out.jevModel ||= JEV_PRESETS[out.jevPreset].model; }
    const ep = EMBED_PRESETS[out.embedPreset];
    if (out.embedPreset !== 'custom' && ep.format !== 'local') { out.embedEndpoint ||= ep.endpoint; out.embedModel ||= ep.model; }
    return out;
  }
  async function loadSettings() {
    let stored = null;
    try { stored = await R.pluginStorage.getItem(SETTINGS_KEY); } catch { }
    if (typeof stored === 'string') { try { stored = JSON.parse(stored); } catch { stored = null; } }
    settings = sanitizeSettings(stored);
    if (!settings.jevKey) {
      try { const arg = await R.getArgument('jev_api_key'); if (typeof arg === 'string' && arg.trim()) settings.jevKey = cleanKey(arg); } catch { }
    }
  }
  async function saveSettings(next) {
    const before = embedProfile();
    settings = sanitizeSettings(next);
    await R.pluginStorage.setItem(SETTINGS_KEY, { ...settings });
    try { await R.setArgument?.('jev_api_key', settings.jevKey); } catch { }
    if (embedProfile() !== before) { queryCache.clear(); await reloadVectors(); }
    await syncButton();
  }
  const ready = () => settings.enabled && !!settings.jevKey;
  // 기억 넣기 프리셋 (값이 맞으면 그 이름, 아니면 "직접")
  const MEMORY_PRESETS = {
    light: { label: '가볍게', desc: '토큰을 아껴요', budget: 400, candidates: 12, neighbor: 0, tailTokens: 80 },
    balanced: { label: '균형', desc: '추천', budget: 600, candidates: 16, neighbor: 1, tailTokens: 120 },
    rich: { label: '꼼꼼하게', desc: '더 많이 기억해요', budget: 1200, candidates: 24, neighbor: 1, tailTokens: 200 },
  };
  const presetOf = (d) => Object.entries(MEMORY_PRESETS).find(([, p]) => ['budget', 'candidates', 'neighbor', 'tailTokens'].every(k => Number(d[k]) === p[k]))?.[0] ?? 'custom';

  // ══ Jev · 임베딩 호출 ══
  const doFetch = R.nativeFetch ? (url, init) => R.nativeFetch(url, init) : (url, init) => fetch(url, init);
  async function fetchJson(url, init, timeoutMs, label) {
    let timer;
    try {
      const resp = await Promise.race([doFetch(url, init), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} 응답 시간 초과`)), timeoutMs); })]);
      if (!resp.ok) { const text = await resp.text().catch(() => ''); const err = new Error(friendlyHttpError(label, resp.status, text)); err.status = resp.status; throw err; }
      try { return await resp.json(); } catch { throw new Error(`${label} 응답을 읽지 못했어요. 주소나 형식을 확인해 주세요.`); }
    } finally { clearTimeout(timer); }
  }

  async function callJev(state, questions, cfg = settings) {
    const key = cleanKey(cfg.jevKey);
    const kp = keyProblem(key, 'Jev');
    if (kp) throw new Error(kp);
    if (!cfg.jevEndpoint || !cfg.jevModel) throw new Error('Jev 주소나 모델이 비어 있어요.');
    const t = nowMs();
    const init = { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: cfg.jevModel, state, questions }) };
    let lastError;
    for (let attempt = 0; attempt < (lastError?.status === 429 ? 4 : 2); attempt++) {
      if (attempt) await new Promise(r => setTimeout(r, 800 * 2 ** (attempt - 1) + Math.random() * 300));
      try {
        const data = await fetchJson(cfg.jevEndpoint, init, JEV_TIMEOUT_MS, 'Jev');
        const answers = data?.answers ?? data;
        noteJevUsage(data?.usage);
        if (!answers || typeof answers !== 'object') throw new Error('Jev 응답 형식이 이상해요.');
        stats.jevCalls++;
        recordCall('jev', nowMs() - t, Object.keys(questions).length);
        return answers;
      } catch (error) {
        lastError = error;
        if (!(error.status === 429 || error.status >= 500 || /시간 초과|fetch|network/i.test(String(error?.message)))) break;
      }
    }
    recordCall('jev', nowMs() - t, Object.keys(questions).length, false);
    throw lastError;
  }

  function embedConfig(cfg = settings) {
    const p = EMBED_PRESETS[cfg.embedPreset] ?? EMBED_PRESETS.local;
    const key = cleanKey(p.key === 'jev' ? (cfg.embedKey || cfg.jevKey) : cfg.embedKey);
    return { format: p.format, endpoint: cfg.embedEndpoint || p.endpoint, model: cfg.embedModel || p.model, key, needsKey: p.key === 'own' };
  }
  function embedProfile(cfg = settings) {
    const e = embedConfig(cfg);
    return e.format === 'local' ? `local:${LOCAL_DIMS}` : `${e.format}:${e.endpoint}:${e.model}`;
  }
  function normalize(v) {
    let n = 0;
    for (let i = 0; i < v.length; i++) n += v[i] * v[i];
    n = Math.sqrt(n) || 1;
    const out = new Float32Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
    return out;
  }
  function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
  const PARTICLE = /(에서|으로|에게|까지|부터|이고|이며|이었|였|은|는|이|가|을|를|의|에|로|와|과|도|야|이야)$/u;
  function hashEmbed(text) {
    const v = new Float32Array(LOCAL_DIMS);
    const add = (feat, w) => { const h = fnv(feat); v[h % LOCAL_DIMS] += (h & 0x80000000 ? -1 : 1) * w; };
    const lower = cleanText(text).toLowerCase();
    for (const raw of lower.split(/[^0-9a-z぀-鿿가-힯]+/).filter(Boolean)) { const w = raw.replace(PARTICLE, ''); if (w.length >= 2) add(`w:${w}`, 1); }
    const g = lower.replace(/[^0-9a-z぀-鿿가-힯]/g, '');
    for (let i = 0; i < g.length - 1; i++) add(`g:${g.slice(i, i + 2)}`, 0.5);
    return normalize(v);
  }
  async function embedTexts(texts, purpose, cfg = settings) {
    const e = embedConfig(cfg);
    if (e.format === 'local') return texts.map(hashEmbed);
    if (e.needsKey || e.key) { const kp = keyProblem(e.key, '임베딩'); if (kp) throw new Error(kp); }
    if (!e.endpoint || !e.model) throw new Error('임베딩 주소나 모델이 비어 있어요.');
    const out = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      const part = texts.slice(i, i + EMBED_BATCH).map(t => clip(t, 2000));
      const t0 = nowMs();
      let vectors;
      try {
        if (e.format === 'gemini') {
          const url = `${e.endpoint.replace(/\/$/, '')}/models/${encodeURIComponent(e.model)}:batchEmbedContents?key=${encodeURIComponent(e.key)}`;
          const data = await fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests: part.map(t => ({ model: `models/${e.model}`, content: { parts: [{ text: t }] }, outputDimensionality: VEC_BITS })) }) }, EMBED_TIMEOUT_MS, '임베딩');
          vectors = (data?.embeddings ?? []).map(x => x?.values);
        } else if (e.format === 'ollama') {
          const data = await fetchJson(`${e.endpoint.replace(/\/$/, '')}/api/embed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: e.model, input: part }) }, EMBED_TIMEOUT_MS, '임베딩');
          vectors = data?.embeddings ?? [];
        } else {
          const headers = { 'Content-Type': 'application/json' };
          if (e.key) headers.Authorization = `Bearer ${e.key}`;
          const data = await fetchJson(e.endpoint, { method: 'POST', headers, body: JSON.stringify({ model: e.model, input: part }) }, EMBED_TIMEOUT_MS, '임베딩');
          vectors = (data?.data ?? []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map(x => x?.embedding);
        }
        if (vectors.length !== part.length || vectors.some(v => !Array.isArray(v) || !v.length)) throw new Error('임베딩 응답 개수나 형식이 맞지 않아요.');
      } catch (error) { recordCall('embed', nowMs() - t0, part.length, false, purpose); throw error; }
      stats.embedCalls++;
      recordCall('embed', nowMs() - t0, part.length, true, purpose);
      for (const v of vectors) out.push(normalize(v));
    }
    return out;
  }

  // 벡터는 앞 512칸의 부호(1비트)만 남긴다. 질문 쪽은 실수 그대로 비교한다(비대칭).
  // MRL(앞부분만 잘라 써도 되는) 임베딩이 아니면 정확도가 조금 떨어질 수 있다.
  const qShrink = (v) => normalize(v.length > VEC_BITS ? v.subarray(0, VEC_BITS) : v);
  function toSigns(v) {
    const s = v.length > VEC_BITS ? v.subarray(0, VEC_BITS) : v;
    const o = new Int8Array(s.length);
    for (let i = 0; i < s.length; i++) o[i] = s[i] >= 0 ? 1 : -1;
    return o;
  }
  function packSigns(signs) {
    const bytes = new Uint8Array(Math.ceil(signs.length / 8));
    for (let i = 0; i < signs.length; i++) if (signs[i] > 0) bytes[i >> 3] |= 1 << (i & 7);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function unpackSigns(b64, n) {
    const bin = atob(b64);
    const o = new Int8Array(n);
    for (let i = 0; i < n; i++) o[i] = (bin.charCodeAt(i >> 3) >> (i & 7)) & 1 ? 1 : -1;
    return o;
  }
  function simSigns(q, s) {
    let t = 0;
    const n = Math.min(q.length, s.length);
    for (let i = 0; i < n; i++) t += q[i] * s[i];
    return t / Math.sqrt(n || 1);
  }

  // ══ 디버그: 단계별 시간 (메모리에만) ══
  const debugLog = [];
  const DEBUG_MAX = 40;
  let curTrace = null;
  function beginTrace(kind) { curTrace = { kind, at: Date.now(), t0: nowMs(), steps: [], calls: [], ms: 0, note: '' }; return curTrace; }
  async function timed(tr, name, fn, detail) {
    const t = nowMs();
    try { return await fn(); } finally { tr?.steps.push({ name, ms: Math.round(nowMs() - t), detail: typeof detail === 'function' ? detail() : (detail ?? '') }); }
  }
  function endTrace(tr) {
    if (!tr) return;
    tr.ms = Math.round(nowMs() - tr.t0);
    if (curTrace === tr) curTrace = null;
    debugLog.unshift(tr);
    if (debugLog.length > DEBUG_MAX) debugLog.pop();
    softRender();
  }
  function recordCall(kind, ms, size, ok = true, purpose = '') {
    curTrace?.calls.push({ kind, purpose: purpose || (kind === 'jev' ? 'Jev 채점' : '임베딩'), ms: Math.round(ms), size, ok });
  }

  // ══════════════════════════════════════════════════════════════════════
  //  채팅 · 조각 · 색인
  // ══════════════════════════════════════════════════════════════════════
  //
  // timeline: 채팅 메시지를 순서대로 { key, role, text } — 채팅을 열 때 원본을 한 번 읽고, 그 뒤로는 요청에 실린 것을 이어 붙인다.
  // chunks:   timeline을 조각낸 것 { mi(메시지 번호), pos, text, len, vec(Int8Array|null) } — 원래 순서 그대로
  // 벡터는 메시지 글의 지문(hash)으로 저장한다. 같은 글이면 같은 벡터, 글이 바뀌면 새로 계산.

  let chatKey = '';
  let chatLabel = { char: '', chat: '' };
  let timeline = [];
  let chunks = [];
  let msgStart = [];              // 메시지 번호 → 첫 조각 번호
  const postings = new Map();     // 두 글자 조각 → 조각 번호 목록
  let vecStore = new Map();       // 메시지 지문 → { n, b64: [] } (기기 저장소에서 읽은 것 + 새로 만든 것)
  let dirtyShards = new Set();
  let localStore = null;
  let saveTimer = null;
  let saveChain = Promise.resolve();
  const characterCache = { index: -1, chaId: '', name: '', firstMessage: '', alternateGreetings: [] };
  let personaCache = '';
  let identityCache = null;
  const queryCache = new Map();
  let lastRecall = null;
  let lastWindowLen = 0;
  // 마지막 요청에 Risu가 실어 보낸 첫 메시지(지문). 그 앞까지가 "Risu가 안 보낸 이전 메시지"
  // (개수로 세면 답장이 올 때마다 하나씩 어긋나서 "색인 안 됨 1개"가 계속 떴다). 기기에 저장해 다시 켜도 유지
  let windowHead = null;
  const WINHEAD_KEY = (key) => `${KEY}${key}~w`;
  function sentUpto() {
    if (windowHead) for (let i = timeline.length - 1; i >= 0; i--) if (timeline[i].key === windowHead) return i;
    return Math.max(0, timeline.length - (lastWindowLen || 0));
  }
  let backlogWarned = '';
  let busy = false;
  let job = null;

  const msgKey = (role, text) => `h:${hashText(role + '\u0000' + text)}`;
  const looseKey = (role, text) => `l:${hashText(role + '\u0000' + memText(text).replace(/[\s\p{P}\p{S}]/gu, '').slice(0, 400))}`;
  const shardOf = (k) => fnv(k) % SHARDS;

  /** 문장으로 자르고 2~4문장씩 묶는다 (짧으면 더 묶고, 길면 끊는다) */
  function chunkText(text, { minChars = 120, maxChars = 360, maxSentences = 4 } = {}) {
    const sentences = String(text).split(/(?<=[.!?。…~][”"’']?)\s+|\n+/u).map(s => s.trim()).filter(Boolean);
    const out = [];
    let cur = [], len = 0;
    for (const s of sentences) {
      if (cur.length && (len + s.length > maxChars || cur.length >= maxSentences)) { out.push(cur.join(' ')); cur = []; len = 0; }
      // 문장 하나가 너무 길면 쪼갠다
      if (s.length > maxChars * 1.5) { for (let i = 0; i < s.length; i += maxChars) out.push(s.slice(i, i + maxChars)); continue; }
      cur.push(s);
      len += s.length;
      if (len >= minChars && cur.length >= 2) { out.push(cur.join(' ')); cur = []; len = 0; }
    }
    if (cur.length) {
      const rest = cur.join(' ');
      if (out.length && rest.length < 40) out[out.length - 1] += ' ' + rest;
      else out.push(rest);
    }
    return out;
  }

  function gramsOf(text) {
    const g = new Set();
    for (const raw of String(text).toLowerCase().replace(/[^0-9a-z가-힯぀-鿿]+/g, ' ').split(' ')) {
      const w = raw.replace(PARTICLE, '');
      if (!w) continue;
      if (w.length === 1) { if (/[0-9]/.test(w)) g.add(w); continue; }
      for (let i = 0; i < w.length - 1; i++) g.add(w.slice(i, i + 2));
    }
    return g;
  }

  /** 메시지 하나를 조각내서 끝에 붙인다 */
  function appendMessage(m) {
    const mi = timeline.length;
    timeline.push(m);
    msgStart.push(chunks.length);
    const parts = chunkText(memText(m.text));
    const stored = vecStore.get(m.key);
    const fits = stored && stored.n === parts.length && stored.p === embedProfile();
    parts.forEach((text, pos) => {
      const id = chunks.length;
      const grams = gramsOf(text);
      chunks.push({ id, mi, pos, text, len: grams.size, vec: fits ? unpackSigns(stored.b64[pos], VEC_BITS) : null });
      for (const g of grams) { let p = postings.get(g); if (!p) postings.set(g, p = []); p.push(id); }
    });
  }

  function rebuildChunks() {
    const tl = timeline;
    timeline = []; chunks = []; msgStart = []; postings.clear();
    for (const m of tl) appendMessage(m);
    attachCardVecs();
    rebuildFacts();
  }

  /** 마지막 요청 이후 timeline 끝을 이번 요청과 맞춘다. 겹치는 부분은 이번 요청 글로 바꾸고(고친 메시지), 새 것은 붙인다. */
  function syncWindow(entries) {
    const TAIL = 60;
    const from = Math.max(0, timeline.length - TAIL);
    const prev = timeline.slice(from);
    const s = overlapStart(prev, entries);
    const keep = from + s;   // 여기까지는 그대로, 그 뒤는 이번 요청으로 바꾼다
    const replaced = timeline.length - keep;
    const same = replaced <= entries.length && timeline.slice(keep).every((m, i) => m.key === entries[i].key);
    if (same) { for (const e of entries.slice(replaced)) appendMessage(e); return; }
    timeline = timeline.slice(0, keep).concat(entries);
    rebuildChunks();
  }

  /**
   * 지난 목록(prev)의 뒷부분이 이번 요청(cur)의 앞부분과 겹치기 시작하는 prev 번호.
   * 꼭 맞는 곳이 먼저, 그다음 고치거나 지운 메시지가 섞인 곳(순서대로 절반 넘게 그대로), 없으면 prev.length.
   * 보낼 때마다 맨 끝은 새 메시지라 그건 겹침으로 보지 않는다(같은 요청을 다시 보내는 리롤은 꼭 맞음으로 잡힌다).
   */
  function overlapStart(prev, cur) {
    const same = (p, c) => p.key === c.key || (!!p.loose && p.loose === c.loose);
    for (let i = 0; i < prev.length; i++) {
      const L = prev.length - i;
      if (L > cur.length) continue;
      let ok = true;
      for (let k = 0; k < L && ok; k++) ok = same(prev[i + k], cur[k]);
      if (ok) return i;
    }
    const head = cur.slice(0, -1);
    for (let i = 0; i < prev.length; i++) {
      const L = prev.length - i;
      if (L < 2) break;
      if (!head.some(c => same(prev[i], c))) continue; // 겹침은 이번 요청에 있는 메시지에서 시작해야 한다
      let j = 0, hit = 0;
      for (let k = i; k < prev.length; k++) { const at = head.findIndex((c, x) => x >= j && same(prev[k], c)); if (at >= 0) { hit++; j = at + 1; } }
      if (hit >= Math.max(2, Math.ceil(L / 2))) return i;
    }
    return prev.length;
  }

  function chatEntries(messages) {
    const out = [];
    for (const m of messages) {
      if (!m || m.removable !== true || (m.role !== 'user' && m.role !== 'assistant')) continue;
      const text = contentOf(m);
      if (!text.trim()) continue;
      out.push({ role: m.role, text, key: msgKey(m.role, text), loose: looseKey(m.role, text) });
    }
    return out;
  }

  function resolveNames(text) {
    const c = characterCache.name || 'char';
    const u = personaCache || 'user';
    return String(text ?? '').replace(/\{\{\s*char\s*\}\}|<char>/gi, c).replace(/\{\{\s*user\s*\}\}|<user>/gi, u);
  }

  /** 채팅 원본(첫 인사말 + 메시지 전부)을 timeline 형태로 */
  function rawTimeline(chat) {
    if (!chat || !Array.isArray(chat.message)) return [];
    const out = [];
    const fm = Number(chat.fmIndex ?? -1);
    const greet = fm >= 0 && characterCache.alternateGreetings?.[fm] != null ? characterCache.alternateGreetings[fm] : characterCache.firstMessage;
    const push = (role, raw) => { const text = resolveNames(raw); if (text.trim()) out.push({ role, text, key: msgKey(role, text), loose: looseKey(role, text) }); };
    if (greet && String(greet).trim()) push('assistant', greet);
    for (const m of chat.message) push(m?.role === 'user' ? 'user' : 'assistant', String(m?.data ?? ''));
    return out;
  }

  async function readChatIdentity() {
    const charIndex = await R.getCurrentCharacterIndex();
    if (charIndex == null || charIndex < 0) return null;
    const chatIndex = await R.getCurrentChatIndex();
    if (identityCache && identityCache.charIndex === charIndex && identityCache.chatIndex === chatIndex) return { ...identityCache.id, cached: true };
    if (characterCache.index !== charIndex) {
      let character = null;
      try { character = R.getCharacterFromIndex ? await R.getCharacterFromIndex(charIndex) : await R.getCharacter(); } catch { }
      characterCache.index = charIndex;
      characterCache.chaId = character?.chaId ?? `idx${charIndex}`;
      characterCache.name = character?.name ?? '';
      characterCache.firstMessage = character?.firstMessage ?? '';
      characterCache.alternateGreetings = character?.alternateGreetings ?? [];
    }
    let chat = null;
    try { chat = await R.getChatFromIndex(charIndex, chatIndex); } catch { }
    const id = { key: `${characterCache.chaId}_${chat?.id || `idx${chatIndex}`}`, char: characterCache.name, chat: chat?.name ?? '' };
    identityCache = { charIndex, chatIndex, id };
    return { ...id, chatObj: chat };
  }

  async function personaName(chat) {
    try {
      const db = await R.getDatabase?.(['personas', 'selectedPersona']);
      const personas = db?.personas ?? [];
      const bound = chat?.bindedPersona ? personas.find(p => p.id === chat.bindedPersona) : null;
      return bound?.name ?? personas[db?.selectedPersona]?.name ?? '';
    } catch { return ''; }
  }

  /** 채팅이 바뀌었으면 원본을 한 번 읽고, 저장해 둔 벡터를 붙인다. 같은 채팅이면 아무것도 안 읽는다. */
  async function ensureChat() {
    const id = await readChatIdentity();
    if (!id) return false;
    chatLabel = { char: id.char, chat: id.chat };
    if (id.key === chatKey) return true;
    if (chatKey) { void flushVectors(); void flushStory(); void flushCards(); void flushFacts(); }
    chatKey = id.key;
    const persona = await personaName(id.chatObj);
    personaCache = persona && persona !== 'User' ? persona : '';
    vecStore = new Map();
    dirtyShards = new Set();
    await saveChain.catch(() => {});
    await loadVectors(chatKey);
    await loadStory(chatKey);
    await loadCards(chatKey);
    await loadFacts(chatKey);
    timeline = rawTimeline(id.chatObj);
    rebuildChunks();
    seedPeople();
    await autoRestoreFromLore(id.chatObj);
    lastRecall = null;
    lastWindowLen = 0;
    windowHead = null;
    try { windowHead = (await localStore?.getItem(WINHEAD_KEY(chatKey))) ?? null; } catch { }
    return true;
  }

  // ── 벡터 저장 (기기 저장소, 채팅마다 16조각) ──
  const shardKey = (key, s) => `${KEY}${key}~${s}`;
  async function initLocalStore() {
    try { localStore = R.getLocalPluginStorage ? await R.getLocalPluginStorage() : null; } catch { localStore = null; }
  }
  async function loadVectors(key) {
    if (!localStore) return;
    const parts = await Promise.all(Array.from({ length: SHARDS }, (_, s) => Promise.resolve().then(() => localStore.getItem(shardKey(key, s))).catch(() => null)));
    for (const part of parts) {
      if (!part || typeof part !== 'object') continue;
      for (const [k, v] of Object.entries(part)) if (v && Array.isArray(v.b64)) vecStore.set(k, v);
    }
  }
  async function reloadVectors() {
    // 임베딩 설정이 바뀌면 옛 벡터는 쓰지 않는다 (지문은 같아도 프로필이 다르다)
    for (const c of chunks) c.vec = null;
    rebuildChunks();
  }
  function scheduleSave() {
    if (!localStore || saveTimer) return;
    saveTimer = setTimeout(() => { saveTimer = null; void flushVectors(); }, SAVE_DELAY);
  }
  function flushVectors() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!localStore || !chatKey || !dirtyShards.size) return saveChain;
    const key = chatKey;
    const shards = [...dirtyShards];
    dirtyShards = new Set();
    const data = shards.map(s => {
      const obj = {};
      for (const [k, v] of vecStore) if (shardOf(k) === s) obj[k] = v;
      return [s, obj];
    });
    saveChain = saveChain.catch(() => {}).then(async () => {
      for (const [s, obj] of data) await localStore.setItem(shardKey(key, s), obj);
    }).catch(error => setError('벡터 저장', error));
    return saveChain;
  }
  async function clearVectors() {
    if (localStore && chatKey) for (let s = 0; s < SHARDS; s++) await Promise.resolve().then(() => localStore.removeItem?.(shardKey(chatKey, s))).catch(() => {});
    vecStore = new Map();
    for (const c of chunks) c.vec = null;
  }

  /** 메시지들을 임베딩한다 (조각 단위). 같은 글은 한 번만. */
  async function indexMessages(mis, purpose = '색인') {
    const prof = embedProfile();
    const todo = [];
    const seen = new Set();
    for (const mi of mis) {
      const m = timeline[mi];
      if (!m || seen.has(m.key)) continue;
      seen.add(m.key);
      const ids = msgChunkIds(mi);
      if (ids.every(id => chunks[id].vec)) continue;
      todo.push({ m, ids });
    }
    if (!todo.length) return 0;
    const flat = todo.flatMap(t => t.ids);
    const vecs = await embedTexts(flat.map(id => chunks[id].text), `${purpose} (조각 ${flat.length}개)`);
    let k = 0;
    for (const t of todo) {
      const signs = t.ids.map(() => toSigns(vecs[k++]));
      vecStore.set(t.m.key, { n: t.ids.length, p: prof, b64: signs.map(packSigns) });
      dirtyShards.add(shardOf(t.m.key));
    }
    // 같은 글의 다른 메시지(복사본)에도 붙인다
    for (const c of chunks) {
      if (c.vec) continue;
      const st = vecStore.get(timeline[c.mi].key);
      if (st && st.n === msgChunkIds(c.mi).length && st.p === prof) c.vec = unpackSigns(st.b64[c.pos], VEC_BITS);
    }
    scheduleSave();
    return todo.length;
  }
  const msgChunkIds = (mi) => { const a = msgStart[mi], b = mi + 1 < msgStart.length ? msgStart[mi + 1] : chunks.length; return Array.from({ length: b - a }, (_, i) => a + i); };
  const unindexed = (upto) => { const out = []; for (let mi = 0; mi < upto; mi++) if (msgChunkIds(mi).some(id => !chunks[id].vec)) out.push(mi); return out; };

  // ══════════════════════════════════════════════════════════════════════
  //  회상
  // ══════════════════════════════════════════════════════════════════════

  function lexScores(query, limit) {
    const q = gramsOf(query);
    const N = limit || 1;
    const acc = new Map();
    for (const g of q) {
      const p = postings.get(g);
      if (!p) continue;
      let df = 0;
      for (const id of p) if (id < limit) df++;
      if (!df) continue;
      const w = Math.log(1 + N / df);
      for (const id of p) if (id < limit) acc.set(id, (acc.get(id) ?? 0) + w);
    }
    for (const [id, s] of acc) acc.set(id, s / Math.sqrt(1 + chunks[id].len / 40));
    return acc;
  }

  /** 임베딩 · 글자 검색 순위를 RRF로 합친다. limit: 이 조각 번호 앞까지만 (Risu가 보내는 것은 빼고) */
  function retrieve(qvecs, query, exclude, k, limit) {
    const sem = [];
    if (qvecs.length) for (let id = 0; id < limit; id++) {
      const c = chunks[id];
      if (!c.vec || exclude.has(id)) continue;
      let s = -Infinity;
      qvecs.forEach((q, i) => { const v = simSigns(q, c.vec) * (i === 0 ? 1 : 0.85); if (v > s) s = v; });
      sem.push([id, s]);
    }
    sem.sort((a, b) => b[1] - a[1]);
    const viaCards = [];
    if (qvecs.length) for (let id = 0; id < limit; id++) {
      const c = chunks[id];
      if (!c.cardVecs || exclude.has(id)) continue;
      let s = -Infinity;
      for (const cv of c.cardVecs) qvecs.forEach((q, i) => { const v = simSigns(q, cv) * (i === 0 ? 1 : 0.85); if (v > s) s = v; });
      viaCards.push([id, s]);
    }
    viaCards.sort((a, b) => b[1] - a[1]);
    const lex = [...lexScores(query, limit)].filter(([id]) => !exclude.has(id)).sort((a, b) => b[1] - a[1]);
    const rrf = new Map();
    sem.slice(0, 80).forEach(([id], r) => rrf.set(id, (rrf.get(id) ?? 0) + 1 / (60 + r)));
    lex.slice(0, 80).forEach(([id], r) => rrf.set(id, (rrf.get(id) ?? 0) + 1 / (60 + r)));
    viaCards.slice(0, 40).forEach(([id], r) => rrf.set(id, (rrf.get(id) ?? 0) + 1 / (60 + r)));
    return [...rrf].sort((a, b) => b[1] - a[1]).slice(0, k).map(([id]) => chunks[id]);
  }

  function rankOf(a) {
    const pr = a?.probabilities;
    if (pr && Object.keys(pr).length) {
      let sum = 0, tot = 0;
      for (const [k, v] of Object.entries(pr)) { const lv = Number.isFinite(Number(k)) ? Number(k) : RANK_LEVELS.indexOf(k); if (lv >= 0) { sum += lv * Number(v); tot += Number(v); } }
      if (tot > 0) return sum / tot;
    }
    const sc = Number(a?.score);
    return Number.isFinite(sc) ? sc : 0;
  }

  // 심사는 번호로: 같은 설명을 후보마다 반복하지 않게, 설명과 후보 목록은 state에 한 번만 (요청 크기가 크게 준다)
  const RANK_SHORT = ['unrelated', 'background', 'useful', 'answers it'];
  async function judge(cands, state, askNeed, extra = null) {
    const q = { ...(extra ?? {}) };
    cands.forEach((c, i) => { q[`r${c.id}`] = { type: 'score', instructions: `C${i}`, criteria: RANK_SHORT }; });
    if (cands.length) state = `${state}\n\n[EARLIER RECORDS] For each Cn question, score how useful that record is for replying to the latest message: 0 unrelated, 1 background only, 2 useful context, 3 answers or explains it.\n${cands.map((c, i) => `C${i}: ${c.text}`).join('\n')}`;
    if (askNeed && cands.length) q.need = { type: 'choice', instructions: 'Which earlier record, if any, is still missing to answer the latest message?', criteria: SEARCH_NEEDS };
    if (!Object.keys(q).length) return { levels: new Map(), need: 'none', answers: {} };
    const answers = await callJev(state, q);
    const levels = new Map(cands.map(c => [c.id, rankOf(answers[`r${c.id}`])]));
    let need = 'none';
    const na = answers.need;
    if (na) {
      const pr = na.probabilities ?? {};
      need = Object.keys(pr).length ? Object.entries(pr).sort((a, b) => b[1] - a[1])[0][0] : (na.choice ?? 'none');
      if (Object.keys(pr).length && (pr[need] ?? 0) < 0.5) need = 'none';
      if (!SEARCH_NEEDS[need]) need = 'none';
    }
    return { levels, need, answers };
  }

  async function queryVecs(texts) {
    const miss = texts.filter(t => !queryCache.has(t));
    if (miss.length) {
      const vs = await embedTexts(miss, '임베딩 (질문)');
      miss.forEach((t, i) => queryCache.set(t, qShrink(vs[i])));
      if (queryCache.size > 200) queryCache.delete(queryCache.keys().next().value);
    }
    return texts.map(t => queryCache.get(t));
  }

  // ── 감독 힌트: 회상과 같은 Jev 호출에 질문 몇 개를 더 얹는다 (호출이 늘지 않는다) ──
  const PACE = { linger: 'stay in this moment: deepen emotion, sensation, or dialogue', advance: 'move the story forward to the next step', escalate: 'raise the tension or stakes', resolve: 'wrap up the current matter' };
  const MOOD = { warm: 'warm or tender', tense: 'tense or anxious', playful: 'playful or light', sad: 'sad or heavy', mysterious: 'mysterious', calm: 'calm or quiet' };
  const PACE_KO = { linger: '머무르기', advance: '진행', escalate: '고조', resolve: '마무리' };
  const MOOD_KO = { warm: '다정', tense: '긴장', playful: '가벼움', sad: '슬픔', mysterious: '미스터리', calm: '차분' };
  function directorQuestions(present, qv = [], ctx = '') {
    const q = {};
    let short = [];
    if (settings.dirCards) {
      const el = dirEligible(present);
      if (el.length) { void ensureDirVecs(allDirCards()); short = dirShortlist(el, qv, ctx); }
      Object.assign(q, genreQuestions());
      if (short.length) q.d_card = { type: 'choice', instructions: "Which scene idea would make the next reply more engaging while fitting the current situation and the user's latest message? Choose none if none of them fits naturally right now.", criteria: Object.fromEntries([...short.map(c => [c.id, `${c.name} (when: ${c.fWhen}): ${clip(c.fText, 160)}`]), ['none', 'none of these; just continue naturally']]) };
    }
    q.d_pace = { type: 'choice', instructions: 'For the next reply, what should the story do?', criteria: PACE };
    const th = openThreads().filter(t => present.includes(t.who) || (t.to && present.includes(t.to))).slice(-4);
    if (th.length) q.d_thread = { type: 'choice', instructions: 'Which open promise or plan, if any, would be natural to bring up now?', criteria: Object.fromEntries([...th.map(t => [`t${t.id}`, `${t.who}${t.to ? ` → ${t.to}` : ''}: ${t.text}`]), ['none', 'none of them now']]) };
    const npcs = present.filter(n => story.people[n]?.kind !== 'persona');
    if (npcs.length) q.d_spot = { type: 'choice', instructions: 'Which character should take the initiative in the next reply?', criteria: Object.fromEntries([...npcs.map(n => [n, n]), ['none', 'no one in particular']]) };
    q.d_mood = { type: 'choice', instructions: 'What mood fits the next reply best?', criteria: MOOD };
    return { q, th, short };
  }
  function directorFrom(answers, th, short = []) {
    const [pace, pp] = topChoice(answers.d_pace);
    const [tid, tp] = topChoice(answers.d_thread);
    const [spot, sp] = topChoice(answers.d_spot);
    const [mood, mp] = topChoice(answers.d_mood);
    const thread = tid && tid !== 'none' && tp >= 0.4 ? th.find(t => `t${t.id}` === tid) : null;
    let card = null;
    const pr = answers.d_card?.probabilities;
    const f = DIR_FREQ[settings.dirFreq] ?? DIR_FREQ.normal;
    if (pr && Object.keys(pr).length) {
      const pn = Number(pr.none ?? 0);
      const [cid, cp] = Object.entries(pr).filter(([k]) => k !== 'none').sort((a, b) => b[1] - a[1])[0] ?? [];
      if (cid && pn <= f.none && cp >= f.top && cp >= pn) card = short.find(c => c.id === cid) ?? null;
    } else {
      const [cid, cp] = topChoice(answers.d_card);
      if (cid && cid !== 'none' && cp >= 0.5) card = short.find(c => c.id === cid) ?? null;
    }
    const hint = { pace: PACE[pace] && pp >= 0.4 ? pace : null, thread: thread ?? null, spot: spot && spot !== 'none' && sp >= 0.4 ? spot : null, mood: MOOD[mood] && mp >= 0.4 ? mood : null, card: card ? { id: card.id, pack: card.pack, name: card.name, text: card.fText } : null, at: Date.now() };
    return hint.pace || hint.thread || hint.spot || hint.mood || hint.card ? hint : null;
  }
  function directorLine(h) {
    const bits = [];
    if (h.pace) bits.push(`pace=${h.pace}`);
    if (h.thread) bits.push(`bring up the open promise #${h.thread.mi + 1} (${h.thread.who}${h.thread.to ? ` → ${h.thread.to}` : ''})`);
    if (h.spot) bits.push(`spotlight: ${h.spot}`);
    if (h.mood) bits.push(`mood: ${h.mood}`);
    const line = bits.length ? `Director hint (optional; the user's direction comes first): ${bits.join('; ')}` : '';
    const scene = h.card ? `Scene idea (optional; weave it in only if it fits naturally, and never act or speak for the user): ${h.card.text}` : '';
    return [line, scene].filter(Boolean).join('\n');
  }

  /** 지금 장면에 있는 인물: 이번 요청 글에 나온 이름 + 캐릭터 */
  function presentCast(windowEntries) {
    if (!settings.story) return [];
    const text = windowEntries.map(m => m.text).join('\n');
    return [...new Set([characterCache.name, personaCache, ...peopleIn(text)].filter(n => n && story.people[n] && !story.people[n].hidden))];
  }

  /** 이야기 줄: 지금 · 관계 · 열린 약속 (짧게) */
  function storyLines(present, upto, recalled = []) {
    const out = [];
    out.ko = [];
    const clock = storyClock(upto);
    const now = [clock.d, clock.t, clock.place, clock.weather].filter(Boolean).join(' · ');
    if (now) { out.push(`Now: ${now}`); out.ko.push({ t: `지금 · ${clockLabel(clock)}`, c: 'ac' }); }
    if (!settings.story) return out;
    const rel = [];
    for (let i = 0; i < present.length; i++) for (let j = i + 1; j < present.length; j++) {
      const p = pairOf(present[i], present[j]);
      const im = settings.intim ? (p?.intim?.n ?? 0) : 0;
      if (!p || (p.co < 2 && !p.type && Math.abs(p.aff) < 2 && !im)) continue;
      rel.push({ p, w: (p.type ? 3 : 0) + Math.abs(p.aff) + Math.log2(1 + p.co) + (im ? 2 : 0) });
    }
    const relOut = [];
    relOut.ko = [];
    rel.sort((a, b) => b.w - a.w).slice(0, 4).forEach(({ p }) => {
      relOut.push(`${p.a} ↔ ${p.b}: ${[p.type ? relEn(p) : null, `${affEn(p.aff)} (${p.aff > 0 ? '+' : ''}${p.aff})`, settings.intim && p.intim?.n ? `intimate ×${p.intim.n}` : null].filter(Boolean).join(', ')}`);
      relOut.ko.push({ t: `${p.a} ↔ ${p.b} · ${[p.type ? relKo(p) : null, `${affLabel(p.aff)} ${p.aff > 0 ? '+' : ''}${p.aff}`, settings.intim && p.intim?.n ? `관계 ${p.intim.n}번` : null].filter(Boolean).join(' · ')}`, c: p.aff >= 2 ? 'warm' : p.aff <= -2 ? 'cold' : '' });
    });
    const near = (t) => present.includes(t.who) || (t.to && present.includes(t.to)) || present.some(n => nameForms(story.people[n] ?? { name: n, aliases: [] }).some(f => f.length >= 2 && String(t.text).includes(f)));
    const memOpen = settings.story ? memThreads().filter(t => t.status === 'open') : [];
    // 비밀: 숨기는 사람이 장면에 있을 때 (숨기는 사람을 모르면 글에 장면 인물이 나올 때). 화면 칩에는 내용을 안 보여 준다 (스포일러)
    const keeperNear = (t) => (t.who ? present.includes(t.who) : near(t));
    for (const t of [...openSecrets(), ...memOpen.filter(t => isSecret(t))].filter(keeperNear).sort((a, b) => a.mi - b.mi).slice(-2)) {
      const from = t.to ?? 'the others';
      if (!t.who) { out.push(`Secret (kept hidden so far): "${tagLine(t)}" — keep it hidden unless the story itself reveals it.`); out.ko.push({ t: '비밀 · 숨기는 중', c: 'sec' }); continue; }
      out.push(`Secret: ${t.who} hides from ${from}: "${tagLine(t)}" — ${from} does not know this yet. Keep it hidden unless the story itself reveals it.`);
      out.ko.push({ t: `비밀 · ${t.who} (${t.to ?? '모두'} 모르게)`, c: 'sec' });
    }
    // 인물 태그: 장면에 나온 인물만, 4명까지
    // 장면 인물 먼저, 그다음 꺼낸 기억에 나온 인물 (예: 체육관 앞 → 관장의 태그)
    if (settings.tags !== false) for (const n of [...new Set([...present, ...recalled])].filter(n => Object.keys(story.tags?.[n] ?? {}).length).slice(0, 4)) {
      const { pos, neg } = topTags(n);
      if (!pos.length && !neg.length) continue;
      const top = [...pos, ...neg].sort((x, y) => Math.abs(y[1].s) - Math.abs(x[1].s))[0];
      const fmt = (l) => l.map(([w, t]) => `${w}(${Math.abs(t.s)})`).join(', ');
      out.push(`${n} tags: ${[pos.length ? `+ ${fmt(pos)}` : '', neg.length ? `- ${fmt(neg)}` : ''].filter(Boolean).join(' · ')}${top?.[1].q ? ` (e.g. "${clip(top[1].q, 60)}")` : ''}`);
      out.ko.push({ t: `${n} · ${[pos.length ? `💚 ${pos.map(x => x[0]).join(' · ')}` : '', neg.length ? `💔 ${neg.map(x => x[0]).join(' · ')}` : ''].filter(Boolean).join(' ')}`, c: '' });
    }
    const th = [...openThreads(), ...memOpen.filter(t => !isSecret(t))].filter(near).sort((a, b) => a.mi - b.mi).slice(-3);
    for (const t of th) {
      out.push(`Open promise: ${t.who || 'someone'}${t.to ? ` → ${t.to}` : ''}: "${tagLine(t)}" (#${t.mi + 1})`);
      out.ko.push({ t: `약속 · ${t.who}${t.to ? ` → ${t.to}` : ''}: ${clip(t.text, 48)}`, c: 'gold' });
    }
    // 관계는 맨 뒤: 예산이 모자라면 관계부터 빠진다
    out.push(...relOut);
    out.ko.push(...relOut.ko);
    if ([...openThreads(), ...openSecrets()].some(t => t.tags?.some(g => g.r !== 'none') && out.some(l => l.includes(tagLine(t))))) {
      out.splice(out[0]?.startsWith('Now:') ? 1 : 0, 0, 'Slots (auto, may be rough): who/with/whom/when/where/what/how/why, X=empty');
      out.ko.splice(0, 0);
    }
    return out;
  }

  /**
   * 회상: 이번 요청에 실린 메시지보다 앞의 칸 줄에서만 찾는다.
   *  고정 → 방금 흐름(칸 줄이 아직 없으면 원문) → Jev가 고른 칸 줄(+같은 메시지 이웃). 이야기 줄과 감독 힌트는 맨 위에 짧게.
   */
  const MEM_LEGEND = 'Memory lines (auto-extracted from the original words, may be rough): kind/who/with/whom/when/where/what/how/why, X=empty; kind E=event A=action F=fact P=promise S=secret. Promise and secret lines start at who.';
  async function recall(windowEntries, tr) {
    const cfg = settings;
    const limitMi = timeline.length - windowEntries.length;
    if (cfg.budget <= 0) return { block: '', picked: [], trace: { cands: 0 } };
    const present = presentCast(windowEntries);
    const latest = memText(windowEntries[windowEntries.length - 1]?.text ?? '');
    // 장면: 뒤에서부터 메시지 통째로 sceneChars자까지. 한 메시지가 그보다 길면 앞 1/4 + 뒤 3/4
    const maxScene = cfg.sceneChars ?? 6000;
    const scene = [];
    let sceneLen = 0;
    for (let i = windowEntries.length - 1; i >= 0 && scene.length < 6; i--) {
      let t = memText(windowEntries[i].text);
      if (!t) continue;
      if (t.length > maxScene) t = `${t.slice(0, Math.round(maxScene / 4))}\n…\n${t.slice(-Math.round(maxScene * 3 / 4))}`;
      if (scene.length && sceneLen + t.length > maxScene) break;
      scene.unshift({ role: windowEntries[i].role, t });
      sceneLen += t.length;
    }
    const ctx = scene.map(m => m.t).join('\n').slice(-1500);
    const state = scene.map(m => `[${m.role === 'user' ? 'USER' : 'STORY'}]\n${m.t}`).join('\n\n');
    // 검색어: 내 메시지 + 직전 답장을 문단 묶음(700자쯤)으로 나눠 최대 4갈래 (여러 이야기가 섞인 긴 답장도 각자 찾게)
    const lastStory = [...scene].reverse().find(m => m.role !== 'user')?.t ?? '';
    const topics = [];
    { let cur = ''; for (const p of lastStory.split(/\n+/).map(x => x.trim()).filter(Boolean)) { cur = cur ? `${cur}\n${p}` : p; if (cur.length >= 700) { topics.push(cur); cur = ''; } } if (cur.length >= 150 || (!topics.length && cur)) topics.push(cur); }
    const pickTopics = topics.length <= 4 ? topics : [0, 1, 2, 3].map(k => topics[Math.round(k * (topics.length - 1) / 3)]);
    // 직전 답장이 짧으면(문단으로 나눌 게 없으면) 예전처럼 최근 흐름 한 덩어리로
    const queries = [latest.slice(0, 2000) || ctx, ...(lastStory.length >= 1200 && pickTopics.length >= 2 ? pickTopics.map(t => t.slice(0, 1500)) : [ctx || latest])].filter(Boolean);
    const hasPool = facts.some(f => f.mi < limitMi);
    let qv = [];
    if (hasPool) { try { qv = await timed(tr, '질문 임베딩', () => queryVecs(queries), () => `검색어 ${queries.length}개`); } catch (error) { setError('임베딩', error); } }
    const wantUpd = /지금|현재|아직|최신|요즘|바뀐|이제/u.test(latest);
    const nMsg = Math.max(4, Math.round(cfg.candidates / 2)), cap = cfg.candidates * 4;
    const first = hasPool ? await timed(tr, '후보 찾기', async () => retrieveBooks(qv, latest, new Set(), nMsg, cap, limitMi, wantUpd, present.filter(n => !['char', 'persona'].includes(story.people[n]?.kind))), () => `책 ${nMsg}권 · 문장 ${cap}개까지${wantUpd ? ' · 바뀐 것 먼저' : ''}`) : [];
    const dir = cfg.director && cfg.story && present.length ? directorQuestions(present, qv, ctx) : null;
    const tailRaw = [], tailSkip = new Set();
    for (let mi = limitMi - 1; mi >= 0 && tailRaw.length < 6 && cfg.tailTokens > 0; mi--) {
      if (factStore.has(timeline[mi].key)) break;
      for (const id of msgChunkIds(mi).slice().reverse()) { const c = cleanChunk(chunks[id]); if (c) tailRaw.push(c); if (tailRaw.length >= 6) break; }
    }
    let levels = new Map(), need = 'none', jevOk = true, hint = null;
    try {
      const tailAsk = {};
      for (const [k, c] of tailRaw.entries()) tailAsk[`tm${k}`] = { type: 'noul', instructions: `Is this interface text rather than the story itself — a menu of choices or suggested next actions for the user, a status window or stat sheet, a to-do list, or a dice roll? «${clip(c.text, 400)}»` };
      const r1 = await timed(tr, 'Jev 채점', () => judge(first, state, true, { ...(dir?.q ?? {}), ...tailAsk }), () => `후보 ${first.length}개${dir ? ` + 감독${dir.short.length ? ` (카드 ${dir.short.length}장)` : ''}` : ''}`);
      ({ levels, need } = r1);
      tailRaw.forEach((c, k) => { if (Number(r1.answers?.[`tm${k}`]?.noul ?? 0) >= 0.6) tailSkip.add(c.id); });
      if (dir) {
        story.dirTurn = (story.dirTurn ?? 0) + 1;
        genreFrom(r1.answers);
        hint = directorFrom(r1.answers, dir.th, dir.short);
        if (hint?.card) story.dirRecent = [...(story.dirRecent ?? []).slice(-40), { id: hint.card.id, turn: story.dirTurn }];
        story.director = hint;
        saveStory();
      }
      if (need !== 'none' && hasPool) {
        let qn = [];
        try { qn = await queryVecs([`${NEED_QUERY[need] ?? ''} ${latest}`.slice(0, 2000)]); } catch { }
        const more = retrieveBooks([...qn, ...qv.slice(0, 1)], latest, new Set(first.books ?? []), Math.ceil(nMsg / 2), Math.ceil(cap / 2), limitMi, wantUpd);
        if (more.length) {
          const r2 = await timed(tr, '2차 검색', () => judge(more, state, false), () => `${need} · ${more.length}개`);
          for (const [id, lv] of r2.levels) levels.set(id, lv);
        }
      }
    } catch (error) {
      jevOk = false;
      setError('Jev 채점', error);
      first.slice(0, 6).forEach((f, i) => levels.set(f.id, 2 - i * 0.01));
    }
    const scored = [...levels].map(([id, lv]) => ({ f: facts[id], lv })).filter(x => x.f && x.lv >= KEEP_LEVEL).sort((a, b) => b.lv - a.lv || b.f.id - a.f.id);

    // 이야기 줄은 예산의 30%까지 (형식 설명은 아래에서 한 번만)
    const recalledNames = settings.story ? [...new Set(scored.slice(0, 8).flatMap(x => peopleIn(x.f.sent ?? '')))] : [];
    const sLines = storyLines(present, timeline.length, recalledNames);
    const dLine = hint ? directorLine(hint) : '';
    const head = [...sLines.filter(l => !l.startsWith('Slots (')), ...(dLine ? [dLine] : [])];
    let headText = head.join('\n');
    while (head.length && estimateTokens(headText) > cfg.budget * 0.3) { head.splice(head.length - (dLine ? 2 : 1), 1); headText = head.join('\n'); }
    let used = estimateTokens(headText) + estimateTokens(MEM_LEGEND);

    const units = new Map();
    const factCost = (f) => estimateTokens(cfg.memForm === 'sentence' ? f.sent : f.line) + 3;
    const rawCost = (c) => estimateTokens(c.text) + 4;
    const addFact = (f, pri) => { if (!f || f.mi >= limitMi || units.has(`f${f.id}`)) return false; const k = factCost(f); if (used + k > cfg.budget) return false; units.set(`f${f.id}`, { f, pri }); used += k; return true; };
    const addRaw = (c, pri) => { if (!c || c.mi >= limitMi || units.has(`c${c.id}`)) return false; const k = rawCost(c); if (used + k > cfg.budget) return false; units.set(`c${c.id}`, { c, pri }); used += k; return true; };
    // 고정: 그 조각의 칸 줄, 아직 없으면 원문
    for (const ck of story.pins) { const c = chunkByCk(ck); if (!c) continue; const fs = factsOfChunk(c); if (fs.length) fs.forEach(f => addFact(f, 9)); else if (!factStore.has(timeline[c.mi]?.key)) addRaw(c, 9); }
    // 방금 흐름: 창 바로 앞 메시지부터. 칸 줄이 있으면 칸 줄, 아직 안 만들었으면 원문 (보낸 뒤에 만들어서 막 밀려난 건 아직 없다)
    let tail = 0;
    for (let mi = limitMi - 1; mi >= 0 && tail < cfg.tailTokens; mi--) {
      const list = factStore.has(timeline[mi].key) ? factsOfMessage(mi).slice().reverse().map(f => ['f', f]) : msgChunkIds(mi).slice().reverse().map(id => ['c', cleanChunk(chunks[id])]).filter(([, c]) => c && !tailSkip.has(c.id));
      let stop = false;
      for (const [t, u] of list) {
        const k = t === 'f' ? factCost(u) : rawCost(u);
        if (tail + k > cfg.tailTokens && tail > 0) { stop = true; break; }
        if (t === 'f' ? addFact(u, 0) : addRaw(u, 0)) tail += k;
      }
      if (stop) break;
    }
    for (const x of scored) addFact(x.f, x.lv);
    // 같은 메시지의 이웃 문장 (맥락)
    if (cfg.neighbor > 0) for (const x of scored.filter(y => y.lv >= 2)) {
      const sib = factsOfMessage(x.f.mi);
      const i = sib.indexOf(x.f);
      for (let d = 1; d <= cfg.neighbor; d++) { addFact(sib[i - d], 0.5); addFact(sib[i + d], 0.5); }
    }

    const picked = [...units.values()].map(v => (v.f ? { t: 'f', mi: v.f.mi, pos: v.f.pos, si: v.f.si, u: v.f, pri: v.pri } : { t: 'c', mi: v.c.mi, pos: v.c.pos, si: -1, u: v.c, pri: v.pri }))
      .sort((a, b) => a.mi - b.mi || a.pos - b.pos || a.si - b.si);
    const asSent = cfg.memForm === 'sentence';
    wantTags(picked.filter(p => p.t === 'f').map(p => p.u));
    const lines = picked.map(p => (p.t === 'f' ? (asSent ? `#${p.mi + 1} ${p.u.sent}` : `#${p.mi + 1} ${p.u.line}`) : `<#${p.mi + 1} ${timeline[p.mi]?.role === 'user' ? 'user' : 'char'}> ${p.u.text}`));
    const slotted = (!asSent && picked.some(p => p.t === 'f')) || head.some(l => /^(Open promise|Secret):/.test(l) && l.includes('/'));
    const note = cfg.note ? `${cfg.note}\n` : '';
    const body = [slotted ? MEM_LEGEND : '', headText, lines.length ? `${headText ? 'Memories:\n' : ''}${lines.join('\n')}` : ''].filter(Boolean).join('\n');
    const block = body && (headText || lines.length) ? `[Memory]\n${note}${body}\n[/Memory]` : '';
    const why = (p) => (p.pri === 9 ? 'pin' : p.pri === 0 ? 'tail' : p.pri === 0.5 ? 'near' : 'pick');
    return {
      block, picked,
      trace: {
        cands: first.length, kept: scored.length, need, jevOk, present, hint, storyLines: sLines, storyKo: sLines.ko ?? [],
        items: picked.map(p => ({ id: p.u.id, ck: `${timeline[p.mi]?.key ?? 'x'}:${p.pos}`, mi: p.mi, lv: Math.round((p.t === 'f' ? (levels.get(p.u.id) ?? (p.pri === 9 ? 3 : 0)) : (p.pri === 9 ? 3 : 0)) * 100) / 100, why: why(p), text: p.t === 'f' ? p.u.sent : p.u.text, fact: p.t === 'f' ? { k: p.u.k, slots: p.u.slots } : null })),
        levels: [...levels].map(([id, lv]) => ({ id, lv: Math.round(lv * 100) / 100, text: clip(facts[id]?.sent ?? '', 140), mi: (facts[id]?.mi ?? 0) + 1 })).sort((a, b) => b.lv - a.lv),
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  //  이야기 층: 인물 · 관계 · 약속 · 이야기 시간 · 고정
  // ══════════════════════════════════════════════════════════════════════
  //
  // 기억(원문 조각)과 따로, 화면과 "지금 장면" 줄에 쓰는 가벼운 장부. 채팅마다 플러그인 저장소에 몇 KB.
  // 분석은 답장이 온 뒤 뒤에서 한다 (보낼 때 느려지지 않게). Jev 호출은 한 번에 1~2번.
  //
  // people:  { 이름: { name, kind: 'char'|'persona'|'npc', aliases: [], count, first, last } }  (first/last: 메시지 번호)
  // pairs:   { "A|B": { a, b, co, aff, type, last, events: [{ mi, ck, d, at, note }] } }  (aff: -10~10)
  // threads: [{ id, text, who, to, mi, ck, status: 'open'|'done'|'dropped', at, closedMi }]
  // pins:    [ck]  — 조각 열쇠(메시지 지문:조각 번호). 항상 넣는다
  // asked:   이미 Jev에게 "사람이야?"를 물어본 낱말 (결과와 상관없이 다시 안 묻는다)

  const STORY_KEY = (key) => `${KEY}story_${key}`;
  const emptyStory = () => ({ v: 1, people: {}, pairs: {}, threads: [], pins: [], asked: [], rejected: [], notSame: [], memThreads: {}, tags: {}, tagAsked: [], analyzed: [], seq: 0, director: null, dirTurn: 0, dirRecent: [], genres: null });
  let story = emptyStory();
  let storyTimer = null;
  let storyChain = Promise.resolve();
  let storyJob = null;

  const ckOf = (c) => `${timeline[c.mi]?.key ?? 'x'}:${c.pos}`;
  const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  async function loadStory(key) {
    let s = null;
    try { s = await R.pluginStorage.getItem(STORY_KEY(key)); } catch { }
    if (typeof s === 'string') { try { s = JSON.parse(s); } catch { s = null; } }
    story = { ...emptyStory(), ...(s && typeof s === 'object' ? s : {}) };
    // 예전 방식으로 쌓인 태그: 원문 문장에서 그 단어 뒤에 조사가 붙어 있었던 것만 남긴다 (조사 없는 건 동사 · 감탄사 · 부사였다)
    if (story.tags && (story.tagV ?? 1) < 3) {
      for (const m of Object.values(story.tags)) for (const [w, t] of Object.entries(m)) if (!tagWordOk(w) || !tagNouns(t.q ?? '', 99).includes(w)) delete m[w];
      story.tagV = 3;
    }
  }
  function saveStory() {
    if (!chatKey || storyTimer) return;
    storyTimer = setTimeout(() => { storyTimer = null; void flushStory(); }, SAVE_DELAY);
  }
  function flushStory() {
    clearTimeout(storyTimer);
    storyTimer = null;
    if (!chatKey) return storyChain;
    const key = chatKey;
    const snap = JSON.parse(JSON.stringify({ ...story, analyzed: story.analyzed.slice(-4000), asked: story.asked.slice(-2000) }));
    storyChain = storyChain.catch(() => {}).then(() => R.pluginStorage.setItem(STORY_KEY(key), snap)).catch(error => setError('이야기 저장', error));
    return storyChain;
  }

  // ── 이야기 시간: 상태줄 (예: 2023-04-03 (월) ◆ 09:15 ◆ 공원 ◆ 맑음) ──
  const DATE_RE = /(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?(?:\s*\(([월화수목금토일])\))?/u;
  const TIME_RE = /(?:^|[^\d])(\d{1,2})\s*:\s*(\d{2})(?!\d)/u;
  const AMPM_RE = /(오전|오후|AM|PM|am|pm)\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/u;
  const WEATHER_WORD = /^(?:[\p{Extended_Pictographic}️]\s*)*(맑음|화창|쾌청|흐림|흐린|비|소나기|폭우|이슬비|눈|폭설|진눈깨비|안개|천둥|번개|뇌우|우박|황사|태풍|바람|강풍|구름\s*조금|구름\s*많음|sunny|clear|cloudy|rain|rainy|snow|snowy|fog|foggy|storm|windy)(?:\s*[\d.]+\s*°?C?)?$/iu;
  const STATUS_SEP = /[◆◇■□●○|│¦/·•]/u;
  const PLACE_LABEL = /(?:^|[\s\[|◆])(?:(?:📍\s*)?(?:장소|위치)\s*[:：]|📍)\s*([^\n◆|│\]]{2,24})/u;
  function parseStatus(text) {
    const out = { d: null, t: null, weather: null, place: null };
    for (const raw of String(text ?? '').split('\n')) {
      const line = raw.trim();
      if (!line || line.length > (/^[^\p{L}\p{N}]{0,4}\[/u.test(line) ? 600 : 160)) continue;   // 대괄호 상태줄은 길어도 읽는다
      const date = DATE_RE.exec(line), time = TIME_RE.exec(line), ampm = AMPM_RE.exec(line), label = PLACE_LABEL.exec(line);
      const hasSep = STATUS_SEP.test(line.replace(DATE_RE, ''));
      if (!(date || ((time || ampm) && hasSep) || (label && hasSep))) { if (label && !out.place && line.length < 40) out.place = label[1].trim(); continue; }
      if (date && !out.d) out.d = `${date[1]}-${date[2].padStart(2, '0')}-${date[3].padStart(2, '0')}`;
      if (!out.t) {
        if (ampm) { let h = +ampm[2] % 12; if (/오후|pm/i.test(ampm[1])) h += 12; out.t = `${String(h).padStart(2, '0')}:${String(ampm[3] ?? '0').padStart(2, '0')}`; }
        else if (time && +time[1] < 24 && +time[2] < 60) out.t = `${time[1].padStart(2, '0')}:${time[2]}`;
      }
      if (label && !out.place) out.place = label[1].trim();
      const cands = [];
      for (const rawSeg of line.replace(/^[^\p{L}\p{N}\[]{0,4}\[|\]$/gu, '').split(STATUS_SEP)) {
        const seg = rawSeg.trim();
        if (!seg) continue;
        const lab = /^([A-Za-z가-힣 ]{2,14})\s*[:：]\s*(.+)$/u.exec(seg);
        if (lab) {
          const k = lab[1].trim().toLowerCase(), v = lab[2].trim();
          if (/weather|날씨/.test(k)) { out.weather ??= v; continue; }
          if (/location|place|where|site|area|room|장소|위치|지역/.test(k) && !out.place && v.length >= 2 && v.length <= 40) out.place = v;
          continue;
        }
        if (!out.weather && WEATHER_WORD.test(seg)) { out.weather = WEATHER_WORD.exec(seg)[1]; continue; }
        // 이름표 없는 칸: 날짜 · 시간 · 시간대 · 짧은 영어 꼬리표(Nu, HP) · 요일은 빼고 장소 후보로 모은다
        if (seg.length < 2 || seg.length > 30 || DATE_RE.test(seg) || TIME_RE.test(seg) || AMPM_RE.test(seg) || /^[\d\s.,:%/-]+$/.test(seg)) continue;
        if (/^[A-Za-z0-9_\-\s]{1,5}$/.test(seg) || /^(오전|오후|아침|점심|낮|저녁|밤|새벽|자정|정오|morning|afternoon|evening|night|noon|midnight|dawn|day)$/i.test(seg)) continue;
        if (/^\(?[월화수목금토일]\)?(요일)?$/.test(seg) || /status|window|상태창|정보창/i.test(seg)) continue;
        const c = seg.replace(/^[\p{Extended_Pictographic}️\s]+/u, '').trim();
        if (c) cands.push(c);
      }
      // 한글(글자)이 가장 많은 후보 = 장소일 가능성이 크다
      if (!out.place && cands.length) out.place = cands.sort((a, b) => b.replace(/[^\p{L}]/gu, '').length - a.replace(/[^\p{L}]/gu, '').length)[0];
    }
    if (out.place && /[?？!！"“”]/.test(out.place)) out.place = null;
    if (out.place) out.place = clip(out.place.replace(/[\]\)]+$/, '').trim(), 28);
    return out;
  }
  /** 지금 이야기 시간: 가장 최근 메시지부터 상태줄을 찾는다 (날짜 · 시간 · 장소 · 날씨를 따로 이어 받는다) */
  function storyClock(upto = timeline.length) {
    const out = { d: null, t: null, place: null, weather: null, mi: null };
    for (let mi = upto - 1; mi >= Math.max(0, upto - 40); mi--) {
      const s = parseStatus(timeline[mi]?.text ?? '');
      if (!s.d && !s.t && !s.place && !s.weather) continue;
      out.mi ??= mi;
      out.d ??= s.d; out.t ??= s.t; out.place ??= s.place; out.weather ??= s.weather;
      if (out.d && out.t && out.place) break;
    }
    return out;
  }
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  function clockLabel(c) {
    const bits = [];
    if (c.d) { const [y, m, d] = c.d.split('-').map(Number); const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); bits.push(`${m}월 ${d}일 (${DOW[w]})`); }
    if (c.t) bits.push(c.t);
    if (c.place) bits.push(c.place);
    if (c.weather) bits.push(c.weather);
    return bits.join(' · ');
  }

  // ── 인물 ──
  const SPEAKER_LINE = /^[ \t]*(?:[-*•>]+[ \t]*)?(?:\*\*|__)?([가-힣A-Za-z][가-힣A-Za-z0-9·._ -]{0,14}?)(?:\*\*|__)?[ \t]*(?:\(([^)\n]{1,20})\))?[ \t]*(?:\*\*|__)?[ \t]*[:：][ \t]*(["“”'‘’「『][\s\S]*)$/u;
  const NAME_STOP = new Set(['이름', '직책', '날짜', '기록', '장부', '문서', '일지', '메모', '물건', '주인', '화물', '항목', '내용', '표식', '도구', '장소', '위치', '선원', '주민', '손님', '사람들', '아이', '남자', '여자', '상대', '누군가', '모두들', '자기', '본인', '그녀', '그는', '그가', '그를', '그의', '우리', '저희', '너희', '사람', '자신', '모두', '이것', '그것', '저것', '여기', '거기', '저기', '오늘', '내일', '어제', '지금', '이제', '나중', '처음', '마지막', '하나', '무엇', '누구', '어디', '언제', '정말', '그냥', '조금', '아주', '너무', '다시', '서로', '모습', '생각', '마음', '목소리', '얼굴', '시간', '이야기', '대답', '질문', '사실', '문제', '이유', '순간', '정도', '부분', '자리', '주변', '앞', '뒤', '안', '밖', '위', '아래', 'user', 'char', 'narrator', 'system', '나레이터', '시스템', '상태창']);
  const PERSON_PARTICLE = /^([가-힣]{2,4})(은|는|이|가|에게|한테|께서|와|과|의|를|을|도|아|야|씨|님)$/u;

  function personList() { return Object.values(story.people); }
  function nameForms(p) { return [p.name, ...(p.aliases ?? [])].filter(Boolean); }
  /** 글에 나온 인물 이름 (별명 포함). 한 글자 이름은 조사로 경계를 확인한다 */
  function peopleIn(text) {
    const t = String(text ?? '');
    const out = [];
    for (const p of personList()) {
      if (p.hidden) continue;
      const hit = nameForms(p).some(n => (n.length >= 2 ? t.includes(n) : new RegExp(`(^|[^가-힣])${n}(은|는|이|가|을|를|의|에게|와|과|도|야|아)`, 'u').test(t)));
      if (hit) out.push(p.name);
    }
    return out;
  }
  function addPerson(name, kind = 'npc') {
    name = String(name ?? '').trim();
    if (!name || name.length > 16 || NAME_STOP.has(name.toLowerCase()) || story.rejected.includes(name)) return null;
    for (const p of personList()) if (nameForms(p).includes(name)) return p;
    story.people[name] = { name, kind, aliases: [], count: 0, first: null, last: null };
    return story.people[name];
  }
  /** 캐릭터 · 페르소나 · 대사 줄 화자는 모델 없이 인물로 등록 */
  function seedPeople() {
    if (characterCache.name) { const p = addPerson(characterCache.name, 'char'); if (p) p.kind = 'char'; }
    if (personaCache) { const p = addPerson(personaCache, 'persona'); if (p) p.kind = 'persona'; }
  }
  function speakersIn(text) {
    const out = [];
    for (const line of String(text ?? '').split('\n')) {
      const m = SPEAKER_LINE.exec(line);
      if (m && !NAME_STOP.has(m[1].trim().toLowerCase())) { out.push(m[1].trim()); continue; }
      // 문단 가운데 대사: "… 떨렸다. 하린 (calm): "…" (문장 맨 앞 · 띄어쓰기 없는 이름만)
      for (const s of sentencesOf(line).slice(1)) {
        const k = SPEAKER_LINE.exec(s);
        const w = k?.[1].trim();
        if (w && !/\s/.test(w) && !NAME_STOP.has(w.toLowerCase())) out.push(w);
      }
    }
    return [...new Set(out)];
  }
  function nameCandidates(text) {
    const out = new Map();
    for (const raw of String(text ?? '').split(/[^가-힣]+/).filter(Boolean)) {
      const m = PERSON_PARTICLE.exec(raw);
      if (!m) continue;
      const w = m[1];
      if (NAME_STOP.has(w) || story.asked.includes(w) || story.rejected.includes(w)) continue;
      if (personList().some(p => nameForms(p).includes(w))) continue;
      out.set(w, (out.get(w) ?? 0) + 1);
    }
    return out;
  }

  // ── 관계 ──
  // 관계 종류: [한국어, Jev 설명, 방향 있으면 [앞쪽 이름, 영어 문장]]
  const REL_DEF = {
    crush: ['짝사랑', 'one-sided crush: one loves the other, who does not return it', ['짝사랑', (x, y) => `${x} has a one-sided crush on ${y}`]],
    some: ['썸', 'mutual attraction or flirting, not officially dating'],
    lovers: ['연인', 'lovers or romantic partners'],
    married: ['부부', 'married couple'],
    ex: ['전 연인', 'former lovers who broke up'],
    fwb: ['섹스 파트너', 'sexual partners without being a couple (friends with benefits)'],
    affair: ['불륜', 'secret affair (one or both is cheating on someone)'],
    childhood: ['소꿉친구', 'childhood friends'],
    bestfriends: ['절친', 'best friends'],
    friends: ['친구', 'friends'],
    acquaintances: ['아는 사이', 'acquaintances, not close'],
    strangers: ['처음 본 사이', 'strangers who just met'],
    parent: ['부모·자식', 'parent and child', ['부모', (x, y) => `${x} is ${y}'s parent`]],
    siblings: ['형제자매', 'siblings'],
    family: ['가족·친척', 'other family or relatives'],
    master_servant: ['주인·하인', 'master and servant, owner and slave or pet', ['주인', (x, y) => `${x} is ${y}'s master`]],
    boss: ['상사·부하', 'boss and subordinate, employer and employee', ['상사', (x, y) => `${x} is ${y}'s boss`]],
    mentor: ['스승·제자', 'teacher and student, mentor and apprentice', ['스승', (x, y) => `${x} is ${y}'s teacher`]],
    senior: ['선배·후배', 'senior and junior (school, club, or work)', ['선배', (x, y) => `${x} is ${y}'s senior`]],
    guardian: ['보호자·피보호자', 'guardian and the one they protect or look after', ['보호자', (x, y) => `${x} is ${y}'s guardian`]],
    colleagues: ['동료', 'colleagues, teammates, or work partners'],
    rivals: ['라이벌', 'rivals'],
    enemies: ['적', 'enemies'],
    obsession: ['집착', 'one is obsessed with or stalks the other', ['집착', (x, y) => `${x} is obsessed with ${y}`]],
  };
  const REL_GROUPS = [['연애', ['crush', 'some', 'lovers', 'married', 'ex', 'fwb', 'affair']], ['친구', ['childhood', 'bestfriends', 'friends', 'acquaintances', 'strangers']], ['가족', ['parent', 'siblings', 'family']], ['위아래', ['master_servant', 'boss', 'mentor', 'senior', 'guardian']], ['일', ['colleagues']], ['적대', ['rivals', 'enemies', 'obsession']]];
  const REL_TYPES = Object.fromEntries(Object.entries(REL_DEF).map(([k, v]) => [k, v[0]]));
  const REL_DESC = Object.fromEntries(Object.entries(REL_DEF).map(([k, v]) => [k, v[1]]));
  const relDir = (t) => REL_DEF[t]?.[2] ?? null;
  /** 모델에게 보낼 관계 (방향 있으면 누가 어느 쪽인지까지) */
  function relEn(p) { const d = relDir(p.type); return d && p.who ? d[1](p.who, p.who === p.a ? p.b : p.a) : REL_DESC[p.type]; }
  /** 화면용: "주인·하인 · 하윤이 주인" */
  function relKo(p) { const d = relDir(p.type); return d && p.who ? `${REL_TYPES[p.type]} · ${p.who}${hasBatchim(p.who) ? '이' : '가'} ${d[0]}` : (REL_TYPES[p.type] ?? ''); }
  function pairOf(a, b, create = false) {
    const k = pairKey(a, b);
    if (!story.pairs[k] && create) story.pairs[k] = { a: a < b ? a : b, b: a < b ? b : a, co: 0, aff: 0, type: null, last: null, events: [] };
    return story.pairs[k] ?? null;
  }
  // ── 관계 횟수 (설정에서 켤 때만): Jev가 70% 이상 확신할 때만 센다. 6메시지 안에서 이어지고 이야기 날짜가 같으면 같은 장면 ──
  const INTIM_P = 0.7;
  const INTIM_GAP = 6;
  function countIntim(pr, c) {
    const r = pr.intim ??= { n: 0, first: null, last: null, firstCk: null, lastCk: null, day: null };
    const day = storyClock(c.mi + 1).d;
    const same = r.last != null && Math.abs(c.mi - r.last) <= INTIM_GAP && (!day || !r.day || day === r.day);
    if (!same) { r.n++; if (r.first == null || c.mi < r.first) { r.first = c.mi; r.firstCk = ckOf(c); } }
    if (r.last == null || c.mi >= r.last) { r.last = c.mi; r.lastCk = ckOf(c); }
    r.day = day ?? r.day;
  }
  function pairsOf(name) { return Object.values(story.pairs).filter(p => p.a === name || p.b === name); }
  function affLabel(aff) { return aff >= 6 ? '아주 가까움' : aff >= 3 ? '가까움' : aff <= -6 ? '아주 나쁨' : aff <= -3 ? '나쁨' : '보통'; }
  function affEn(aff) { return aff >= 6 ? 'very close' : aff >= 3 ? 'warm' : aff <= -6 ? 'hostile' : aff <= -3 ? 'tense' : 'neutral'; }

  // ── 약속 ──
  const PROMISE_CUE = /약속|하기로|할게|해줄게|갈게|올게|하자|가자|만나자|꼭|반드시|맹세|다짐|계획|목표|다음에|내일|언젠가|기다릴게|돌아올|promise|swear|will\s|plan/u;
  // 비밀: threads에 kind: 'secret'으로 같이 둔다. who가 to(없으면 모두)에게 숨기는 것. 드러나면 status 'done'
  const SECRET_CUE = /비밀|숨기|숨겨|숨긴|감추|감춰|모르게|몰래|말하지\s*마|말하지\s*않|말\s*못|들키|들킬|정체|사실은|아무도\s*모르|아무한테도|secret|hiding|hidden/u;
  const isSecret = (t) => t.kind === 'secret';
  function openThreads() { return story.threads.filter(t => t.status === 'open' && !isSecret(t)); }
  // ── 6하원칙 칸: 문장을 어절로 나눠 어절마다 Jev가 칸을 고른다 (실제 Jev로 문장 6개 · 질문 56개에 0.7초) ──
  const ROLES = { who: 'who does it (the doer / subject)', with: 'together with whom (a companion who does it with them)', whom: 'to whom, or kept from whom (the target of the action)', when: 'when (time, date, timing)', where: 'where (place)', what: 'what is done or what it is about (object, action, the fact itself)', how: 'how (manner, means)', why: 'why (reason, purpose)', none: 'none of these (filler, ending, or connective)' };
  const ROLE_KO = { who: '누가', with: '누구랑', whom: '누구에게', when: '언제', where: '어디서', what: '무엇을', how: '어떻게', why: '왜' };
  const ROLE_ORDER = ['who', 'with', 'whom', 'when', 'where', 'what', 'how', 'why'];
  const tagWords = (text) => unquote(text).split(/\s+/).filter(Boolean).slice(0, 24);
  function groupTags(words, roleOf) {
    const out = [];
    words.forEach((w, k) => { const r = ROLES[roleOf(k)] ? roleOf(k) : 'none'; if (out.length && out[out.length - 1].r === r) out[out.length - 1].w += ` ${w}`; else out.push({ w, r }); });
    return out;
  }
  /** 모델에게 보낼 칸 줄: 누가/누구랑/누구에게/언제/어디서/무엇을/어떻게/왜 순서로 슬래시, 빈 칸은 X, 끝쪽 빈 칸은 생략 */
  function tagLine(t) {
    if (!t.tags?.some(g => g.r !== 'none')) return t.text;
    const slots = ROLE_ORDER.map(r => t.tags.filter(g => g.r === r).map(g => g.w).join(' ') || 'X');
    while (slots.length && slots[slots.length - 1] === 'X') slots.pop();
    return slots.join('/');
  }
  function openSecrets() { return story.threads.filter(t => t.status === 'open' && isSecret(t)); }

  /** 아직 이야기 분석을 안 한 메시지 (Risu가 안 보낸 것 중) */
  function storyBacklog() {
    const upto = sentUpto();
    const done = new Set(story.analyzed);
    const out = [];
    for (let mi = 0; mi < upto; mi++) if (!done.has(timeline[mi].key)) out.push(mi);
    return out;
  }

  // ── 사건 카드: "누가 → 누구에게: 무엇을 (어떻게)" ──
  // 원문을 대신하지 않는다. 쓰는 곳은 두 가지:
  //  · 인물 페이지와 "최근 일어난 일" 화면
  //  · 찾기 열쇠: 카드도 임베딩해 두고, 카드가 맞으면 그 카드가 나온 원문 조각을 후보로 올린다
  //    (대화 표현이 원문과 달라도 "하윤이 민준에게 한 약속" 같은 뜻으로 찾게). 넣는 건 여전히 원문.
  // 카드는 기기 저장소에 메시지 지문별로 둔다 (채팅마다 16조각). 다른 기기에서는 다시 만든다.
  const MANNER = { neutral: 'no particular manner', warmly: 'warmly or kindly', shyly: 'shyly or embarrassed', happily: 'happily or excitedly', angrily: 'angrily or harshly', sadly: 'sadly', coldly: 'coldly or indifferently', secretly: 'secretly or quietly', urgently: 'urgently or in a hurry', carefully: 'carefully or cautiously' };
  const MANNER_KO = { neutral: '', warmly: '다정하게', shyly: '수줍게', happily: '기쁘게', angrily: '화나서', sadly: '슬프게', coldly: '차갑게', secretly: '몰래', urgently: '급하게', carefully: '조심스럽게' };
  const CARD_MAX_SENTS = 12;
  let cardStore = new Map();      // 메시지 지문 → [{ pos, who, to, what, how, imp, vec(b64) }]
  let cardDirty = new Set();
  let cardTimer = null;
  const cardShardKey = (key, s) => `${KEY}${key}~c${s}`;

  async function loadCards(key) {
    cardStore = new Map();
    cardDirty = new Set();
    if (!localStore) return;
    const parts = await Promise.all(Array.from({ length: SHARDS }, (_, s) => Promise.resolve().then(() => localStore.getItem(cardShardKey(key, s))).catch(() => null)));
    for (const part of parts) if (part && typeof part === 'object') for (const [k, v] of Object.entries(part)) if (Array.isArray(v)) cardStore.set(k, v.map(cd => ({ ...cd, what: cleanText(cd.what) })));
  }
  function saveCards() {
    if (!localStore || cardTimer) return;
    cardTimer = setTimeout(() => { cardTimer = null; void flushCards(); }, SAVE_DELAY);
  }
  function flushCards() {
    clearTimeout(cardTimer);
    cardTimer = null;
    if (!localStore || !chatKey || !cardDirty.size) return saveChain;
    const key = chatKey;
    const data = [...cardDirty].map(s => { const obj = {}; for (const [k, v] of cardStore) if (shardOf(k) === s) obj[k] = v; return [s, obj]; });
    cardDirty = new Set();
    saveChain = saveChain.catch(() => {}).then(async () => { for (const [s, obj] of data) await localStore.setItem(cardShardKey(key, s), obj); }).catch(error => setError('카드 저장', error));
    return saveChain;
  }
  const cardText = (cd) => `${cd.who && cd.who !== 'none' ? (cd.to === 'alone' ? `${cd.who} (혼자)` : cd.to && cd.to !== 'none' && cd.to !== cd.who ? `${cd.who} → ${cd.to}` : cd.who) : '(사실)'}: ${cd.what}${cd.how && MANNER_KO[cd.how] && !String(cd.what).includes(MANNER_KO[cd.how].slice(0, 2)) ? ` (${MANNER_KO[cd.how]})` : ''}`;
  /** 메시지 번호 → 그 메시지의 카드들 (조각 번호 포함) */
  function cardsOfMessage(mi) {
    const list = cardStore.get(timeline[mi]?.key) ?? [];
    return list.map(cd => ({ ...cd, mi, text: cardText(cd) }));
  }
  /** 카드 벡터를 조각에 붙인다 (찾기 열쇠). 조각마다 카드 벡터 목록 */
  function attachCardVecs() {
    const prof = embedProfile();
    for (const c of chunks) c.cardVecs = null;
    for (let mi = 0; mi < timeline.length; mi++) {
      const list = cardStore.get(timeline[mi].key);
      if (!list?.length) continue;
      const ids = msgChunkIds(mi);
      for (const cd of list) {
        if (!cd.vec || cd.p !== prof) continue;
        const c = chunks[ids[cd.pos]];
        if (!c) continue;
        (c.cardVecs ??= []).push(unpackSigns(cd.vec, VEC_BITS));
      }
    }
  }
  const clausesOf = (s) => {
    const parts = s.split(/(?<=,)\s+|(?<=(?:[^자라다]고|며|면서|지만|는데|어서|아서|다가|려고))\s+/u).map(x => x.trim()).filter(x => x.length >= 2);
    return parts.length ? parts.slice(0, 8) : [s];
  };

  /**
   * 메시지 몇 개를 분석한다 (답장 뒤, 뒤에서):
   *  ① 인물: 대사 줄 화자(무료) + 새 이름 후보는 Jev가 "사람이야?" (호출 1)
   *  ② 나머지 한 번에 (호출 1): 문장마다 사건 카드 · 함께 나온 짝이 가까워졌나/멀어졌나 · 약속 찾기 · 열린 약속 닫기
   *  ③ 카드 임베딩 (찾기 열쇠)
   */
  async function analyzeMessages(mis) {
    if (!mis.length) return 0;
    seedPeople();
    // 뒤에서 도는 동안 채팅이 바뀌어도 원래 메시지에 기록하도록 지문을 먼저 잡아 둔다
    const keyOf = new Map(mis.map(mi => [mi, timeline[mi].key]));
    const room = chatKey;
    const moved = () => chatKey !== room;
    const runChunks = mis.flatMap(mi => msgChunkIds(mi).map(id => chunks[id]));
    for (const mi of mis) for (const n of speakersIn(timeline[mi].text)) addPerson(n);
    const cands = new Map();
    for (const c of runChunks) for (const [w, n] of nameCandidates(c.text)) cands.set(w, (cands.get(w) ?? 0) + n);
    const ask = [...cands].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w]) => w);
    // 배경 글: 조각마다 P번호. 질문은 번호로 가리킨다 (같은 글을 질문마다 또 보내지 않는다). 너무 길면 조각마다 고르게 줄인다
    const STATE_MAX = 24000;
    const pText = runChunks.map(c => cleanChunk(c)?.text ?? '');
    const perP = pText.reduce((a, t) => a + t.length, 0) > STATE_MAX ? Math.max(200, Math.floor(STATE_MAX / Math.max(1, pText.length))) : Infinity;
    const state = pText.map((t, k) => (t ? `P${k + 1}: ${perP < Infinity ? clip(t, perP) : t}` : '')).filter(Boolean).join('\n');
    const pid = (c) => `P${runChunks.indexOf(c) + 1}`;
    if (ask.length) {
      const q = {};
      const seen = (w) => { for (const c of runChunks) { const x = sentencesOf(c.text).find(t => t.includes(w)); if (x) return clip(x, 160); } return ''; };
      ask.forEach((w, i) => { q[`n${i}`] = { type: 'noul', instructions: `In «${seen(w)}», is «${w}» the proper name of a specific person or character (or a title used as their name)? Answer no for common nouns like "name", "owner", "sailor", places, objects, and groups.` }; });
      try {
        const a = await callJev(state, q);
        if (moved()) return 0;
        ask.forEach((w, i) => { story.asked.push(w); if (Number(a[`n${i}`]?.noul ?? 0) >= 0.75) addPerson(w); else story.rejected.push(w); });
      } catch (error) { setError('인물 판정', error); }
    }
    // 등장 횟수 · 함께 나온 짝 (무료)
    const pairJobs = [], threadJobs = [], cardJobs = [], secretJobs = [];
    for (const c of runChunks) {
      const names = peopleIn(c.text);
      for (const n of names) { const p = story.people[n]; p.count++; p.first ??= c.mi; p.last = Math.max(p.last ?? 0, c.mi); }
      for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
        const pr = pairOf(names[i], names[j], true);
        pr.co++;
        pr.last = Math.max(pr.last ?? 0, c.mi);
        if (pairJobs.length < 8) pairJobs.push({ pr, c, askType: !pr.lock && (!pr.type ? pr.co === 2 || pr.co % 10 === 0 : pr.co % 15 === 0), askWho: !pr.lock && !!relDir(pr.type) && !pr.who });
      }
      // 약속한 사람 후보에는 글쓴이도 (예: 내가 쓴 "약속할게."는 내 약속)
      const author = timeline[c.mi]?.role === 'user' ? personaCache : characterCache.name;
      const who = [...new Set([author, ...names].filter(n => n && story.people[n]))];
      if (who.length && PROMISE_CUE.test(c.text) && threadJobs.length < 12) threadJobs.push({ c, names: who });
      if (who.length && SECRET_CUE.test(c.text) && secretJobs.length < 12) secretJobs.push({ c, names: who });
    }
    // 사건 카드: 메시지마다 문장 몇 개 (이름이나 약속 말이 있는 문장 먼저)
    if (settings.cards) for (const mi of mis) {
      const m = timeline[mi];
      const author = m.role === 'user' ? (personaCache || 'user') : (characterCache.name || 'char');
      const cast = [...new Set([author, ...peopleIn(m.text)])].slice(0, 8);
      const ids = msgChunkIds(mi);
      const sents = [];
      ids.forEach((id, pos) => sentencesOf(stripStatus(chunks[id].text)).forEach(s => sents.push({ s, pos })));
      const ranked = sents.map((x, i) => ({ ...x, i, w: (peopleIn(x.s).length ? 2 : 0) + (PROMISE_CUE.test(x.s) ? 1 : 0) + (x.s.length > 25 ? 1 : 0) }))
        .sort((a, b) => b.w - a.w || a.i - b.i).slice(0, CARD_MAX_SENTS).sort((a, b) => a.i - b.i);
      for (const x of ranked) cardJobs.push({ mi, pos: x.pos, s: x.s, cast, author, clauses: clausesOf(x.s) });
    }
    const closeJobs = openThreads().filter(t => runChunks.some(c => { const ns = peopleIn(c.text); return ns.includes(t.who) || (t.to && ns.includes(t.to)); })).slice(0, 5);
    const revealJobs = openSecrets().filter(t => runChunks.some(c => { const ns = peopleIn(c.text); return ns.includes(t.who) || (t.to && ns.includes(t.to)); })).slice(0, 4);
    // 기억에서 온 약속 · 비밀 (약속 탭에 보이는 것)
    const lastMi = Math.max(...mis);
    const runText = runChunks.map(c => c.text).join('\n');
    const runNames = new Set(peopleIn(runText));
    const wordsOf = (t) => [...new Set(String(t).split(/\s+/).map(w => w.replace(/[^\p{L}\p{N}]/gu, '').replace(PARTICLE, '')).filter(w => w.length >= 2))];
    const touched = (t) => (t.who && runNames.has(t.who)) || (t.to && runNames.has(t.to)) || peopleIn(t.text).some(n => runNames.has(n)) || wordsOf(t.text).filter(w => runText.includes(w)).length >= 2;
    const memOpen = memThreads().filter(t => t.status === 'open' && t.mi < lastMi && touched(t));
    const memClose = memOpen.filter(t => !isSecret(t)).slice(-5);
    const memReveal = memOpen.filter(t => isSecret(t)).slice(-4);
    const q = {};
    pairJobs.forEach((j, i) => {
      q[`a${i}`] = { type: 'choice', instructions: `In this passage, how do ${j.pr.a} and ${j.pr.b} treat each other? (passage ${pid(j.c)})`, criteria: { closer: 'they grow closer, warmer, or more trusting', apart: 'tension, conflict, coldness, or distrust', none: 'no clear change or they do not really interact' } };
      if (j.askType) q[`y${i}`] = { type: 'choice', instructions: `What is the relationship between ${j.pr.a} and ${j.pr.b} in this story?`, criteria: REL_DESC };
      if (j.askType || j.askWho) q[`yw${i}`] = { type: 'choice', instructions: `Between ${j.pr.a} and ${j.pr.b}, who is on the leading side: the one with the crush or obsession, or the parent, master, boss, teacher, senior, or guardian?`, criteria: { A: j.pr.a, B: j.pr.b, none: 'neither, or they are equal' } };
      if (settings.intim) q[`x${i}`] = { type: 'noul', instructions: `In this passage, did ${j.pr.a} and ${j.pr.b} actually have sex with each other? Count only what happens now in the story, not a memory, dream, fantasy, plan, joke, or refusal. (passage ${pid(j.c)})` };
    });
    threadJobs.forEach((j, i) => {
      const sents = sentencesOf(stripStatus(j.c.text)).slice(0, 6);
      j.sents = sents;
      q[`p${i}`] = { type: 'noul', instructions: `Does someone in this passage promise, agree to, or plan a specific thing to do LATER (after this scene), that has not happened yet? Requests to do something right now, past events, and facts do not count. (passage ${pid(j.c)})` };
      q[`pw${i}`] = { type: 'choice', instructions: 'Who made that promise or has that goal?', criteria: Object.fromEntries([...j.names.map(n => [n, n]), ['unclear', 'unclear']]) };
      q[`pt${i}`] = { type: 'choice', instructions: 'Toward whom?', criteria: Object.fromEntries([...j.names.map(n => [n, n]), ['none', 'nobody in particular']]) };
      q[`ps${i}`] = { type: 'choice', instructions: 'Which sentence states that promise or plan for later?', criteria: Object.fromEntries([...sents.map((s, k) => [`s${k}`, s]), ['none', 'none of these']]) };
    });
    secretJobs.forEach((j, i) => {
      const sents = sentencesOf(stripStatus(j.c.text)).slice(0, 6);
      j.sents = sents;
      q[`s${i}`] = { type: 'noul', instructions: `Does this passage show someone deliberately keeping a specific secret from someone else (a hidden fact, identity, past, feeling, or plan)? Private thoughts nobody is hiding do not count, and a secret that is being revealed to that person right now does not count. (passage ${pid(j.c)})` };
      q[`sw${i}`] = { type: 'choice', instructions: 'Who keeps that secret?', criteria: Object.fromEntries([...j.names.map(n => [n, n]), ['unclear', 'unclear']]) };
      q[`sf${i}`] = { type: 'choice', instructions: 'From whom is it kept hidden?', criteria: Object.fromEntries([...j.names.map(n => [n, n]), ['everyone', 'everyone else'], ['unclear', 'unclear']]) };
      q[`ss${i}`] = { type: 'choice', instructions: 'Which sentence states what the secret is?', criteria: Object.fromEntries([...sents.map((s, k) => [`s${k}`, s]), ['none', 'none of these']]) };
    });
    revealJobs.forEach((t, i) => { q[`v${i}`] = { type: 'noul', instructions: `In these new passages, does this secret come out (the person it was hidden from learns it, or it is exposed)? «${t.who} hides from ${t.to ?? 'everyone'}: ${t.text}»` }; });
    closeJobs.forEach((t, i) => { q[`c${i}`] = { type: 'noul', instructions: `In these new passages, is this promise or plan fulfilled, cancelled, or no longer relevant? «${t.who}${t.to ? ` → ${t.to}` : ''}: ${t.text}»` }; });
    memClose.forEach((t, i) => { q[`cm${i}`] = { type: 'noul', instructions: `In these new passages, is this promise or plan fulfilled, cancelled, or no longer relevant? «${t.who ? `${t.who}${t.to ? ` → ${t.to}` : ''}: ` : ''}${t.text}»` }; });
    memReveal.forEach((t, i) => { q[`vm${i}`] = { type: 'noul', instructions: `In these new passages, does this secret come out (someone it was hidden from learns it, or it is exposed)? «${t.text}»` }; });
    cardJobs.forEach((j, i) => {
      const whoOpts = Object.fromEntries([...j.cast.map(c => [c, c]), ['none', 'no person acts (a fact, rule, or description)']]);
      const toOpts = Object.fromEntries([...j.cast.map(c => [c, `toward ${c}`]), ['alone', 'alone / to nobody in particular'], ['none', 'not an action toward someone']]);
      q[`k${i}_imp`] = { type: 'score', instructions: `How important is this sentence to remember later? «${j.s}»`, criteria: ['trivial', 'minor detail', 'useful fact', 'key fact, event, promise, or rule'] };
      q[`k${i}_who`] = { type: 'choice', instructions: `In «${j.s}», who performs the main action or is the subject? (${j.author} wrote this message.)`, criteria: whoOpts };
      q[`k${i}_to`] = { type: 'choice', instructions: `In «${j.s}», toward whom is that action directed?`, criteria: toOpts };
      if (j.clauses.length > 1) {
        const opts = Object.fromEntries(j.clauses.map((c, k) => [`c${k}`, c]));
        q[`k${i}_from`] = { type: 'choice', instructions: `Where does the part saying what was done begin in «${j.s}»?`, criteria: opts };
        q[`k${i}_until`] = { type: 'choice', instructions: `Where does the part saying what was done end in «${j.s}»?`, criteria: opts };
      }
      q[`k${i}_how`] = { type: 'choice', instructions: `In «${j.s}», how was it done?`, criteria: MANNER };
    });
    // ── 인물 태그: 문장마다 질문 하나 ──
    const ptagJobs = settings.story && settings.tags !== false ? tagCandidates(runChunks).slice(0, TAG_MAX) : [];
    ptagJobs.forEach((j, i) => { q[`t${i}`] = { type: 'choice', instructions: `T${i}`, criteria: j.opts }; });
    const storyState = ptagJobs.length ? `${state}\n\n${TAG_GUIDE}\n${ptagJobs.map((j, i) => `T${i} (${j.person}): ${j.s}`).join('\n')}` : state;
    const newCards = [];
    if (Object.keys(q).length) {
      try {
        const a = await callJev(storyState, q);
        if (moved()) return 0;
        pairJobs.forEach((j, i) => {
          const [ch, p] = topChoice(a[`a${i}`]);
          if (p >= 0.55 && (ch === 'closer' || ch === 'apart')) {
            const d = ch === 'closer' ? 1 : -1;
            j.pr.aff = Math.max(-10, Math.min(10, j.pr.aff + d));
            j.pr.events.push({ mi: j.c.mi, ck: ckOf(j.c), d, at: Date.now() });
            if (j.pr.events.length > 60) j.pr.events = j.pr.events.slice(-60);
          }
          if (j.askType) { const [ty, pty] = topChoice(a[`y${i}`]); if (REL_TYPES[ty] && pty >= 0.45) j.pr.type = ty; }
          if (!relDir(j.pr.type)) delete j.pr.who;
          else if (j.askType || j.askWho) { const [w, pw] = topChoice(a[`yw${i}`]); if ((w === 'A' || w === 'B') && pw >= 0.5) j.pr.who = w === 'A' ? j.pr.a : j.pr.b; }
          if (settings.intim && Number(a[`x${i}`]?.noul ?? 0) >= INTIM_P) countIntim(j.pr, j.c);
        });
        threadJobs.forEach((j, i) => {
          if (Number(a[`p${i}`]?.noul ?? 0) < 0.75) return;
          const [who] = topChoice(a[`pw${i}`]);
          const [to] = topChoice(a[`pt${i}`]);
          const [ps] = topChoice(a[`ps${i}`]);
          if (ps === 'none') return;
          const k = Number(String(ps ?? 's0').slice(1)) || 0;
          const text = clip(unquote(j.sents[k] ?? j.c.text), 160);
          if (story.threads.some(t => t.text === text)) return;
          const w = who && who !== 'unclear' ? who : (j.names[0] ?? '');
          story.threads.push({ id: ++story.seq, text, who: w, to: to && to !== 'none' && to !== w ? to : null, mi: j.c.mi, ck: ckOf(j.c), status: 'open', at: Date.now() });
        });
        closeJobs.forEach((t, i) => { if (Number(a[`c${i}`]?.noul ?? 0) >= 0.7) { t.status = 'done'; t.closedMi = mis[mis.length - 1]; } });
        revealJobs.forEach((t, i) => { if (Number(a[`v${i}`]?.noul ?? 0) >= 0.7) { t.status = 'done'; t.closedMi = mis[mis.length - 1]; } });
        ptagJobs.forEach((j, i) => {
          (story.tagAsked ??= []).push(j.h);
          const ans = a[`t${i}`];
          const pr = ans?.probabilities && Object.keys(ans.probabilities).length ? ans.probabilities : (ans?.choice ? { [ans.choice]: Number(ans.confidence ?? 1) } : {});
          Object.entries(pr).filter(([k]) => k !== 'none' && /^[pn]\d+$/.test(k)).sort((x, y) => y[1] - x[1]).filter(([, v], r) => v >= (r === 0 ? 0.45 : 0.35)).slice(0, 2)
            .forEach(([k]) => addTag(j.person, j.nouns[Number(k.slice(1))], k[0] === 'p' ? 1 : -1, j));
        });
        if ((story.tagAsked?.length ?? 0) > 4000) story.tagAsked = story.tagAsked.slice(-3000);
        const mt = (story.memThreads ??= {});
        memClose.forEach((t, i) => { if (Number(a[`cm${i}`]?.noul ?? 0) >= 0.7) mt[t.key] = 'done'; });
        memReveal.forEach((t, i) => { if (Number(a[`vm${i}`]?.noul ?? 0) >= 0.7) mt[t.key] = 'done'; });
        secretJobs.forEach((j, i) => {
          if (Number(a[`s${i}`]?.noul ?? 0) < 0.75) return;
          const [ss] = topChoice(a[`ss${i}`]);
          if (ss === 'none') return;
          const text = clip(unquote(j.sents[Number(String(ss ?? 's0').slice(1)) || 0] ?? j.c.text), 160);
          if (story.threads.some(t => t.text === text)) return;
          const [who] = topChoice(a[`sw${i}`]);
          const [from] = topChoice(a[`sf${i}`]);
          const w = who && who !== 'unclear' ? who : (j.names[0] ?? '');
          story.threads.push({ id: ++story.seq, kind: 'secret', text, who: w, to: from && from !== 'unclear' && from !== 'everyone' && from !== w ? from : null, mi: j.c.mi, ck: ckOf(j.c), status: 'open', at: Date.now() });
        });
        cardJobs.forEach((j, i) => {
          const imp = rankScore(a[`k${i}_imp`]);
          if (imp < 1) return;
          const [who] = topChoice(a[`k${i}_who`]);
          const [to] = topChoice(a[`k${i}_to`]);
          const [how, ph] = topChoice(a[`k${i}_how`]);
          let what = j.s;
          if (who && who !== 'none' && j.clauses.length > 1) {
            let x = Number(String(topChoice(a[`k${i}_from`])[0] ?? 'c0').slice(1)) || 0;
            let y = Number(String(topChoice(a[`k${i}_until`])[0] ?? `c${j.clauses.length - 1}`).slice(1));
            if (!Number.isFinite(y)) y = j.clauses.length - 1;
            if (y < x) [x, y] = [y, x];
            what = j.clauses.slice(x, y + 1).join(' ');
          }
          newCards.push({ mi: j.mi, cd: { pos: j.pos, who: who ?? 'none', to: to ?? 'none', what: clip(unquote(what), 200), how: who !== 'none' && ph >= 0.5 ? how : 'neutral', imp: Math.round(imp * 100) / 100 } });
        });
      } catch (error) { setError('이야기 분석', error); }
    }
    // 6하원칙 칸: 칸이 없는 열린 약속 · 비밀 (새로 생긴 것 먼저) 몇 개를 한 번에. 실패해도 원문으로 쓴다
    const tagJobs = story.threads.filter(t => t.status === 'open' && !t.tags).slice(-4);
    if (tagJobs.length) {
      const tq = {};
      tagJobs.forEach((t, i) => tagWords(t.text).forEach((w, k) => { tq[`w${i}_${k}`] = { type: 'choice', instructions: `In the sentence «${unquote(t.text)}», which role does the word «${w}» play?`, criteria: ROLES }; }));
      try {
        const ta = await callJev(tagJobs.map(t => unquote(t.text)).join('\n'), tq);
        if (moved()) return 0;
        tagJobs.forEach((t, i) => { t.tags = groupTags(tagWords(t.text), k => topChoice(ta[`w${i}_${k}`])[0]); });
      } catch (error) { setError('6하원칙 칸', error); }
    }
    // 카드 저장 + 찾기 열쇠(임베딩)
    if (newCards.length) {
      try {
        const vecs = await embedTexts(newCards.map(x => cardText(x.cd)), `카드 임베딩 (${newCards.length}개)`);
        const prof = embedProfile();
        newCards.forEach((x, i) => { x.cd.vec = packSigns(toSigns(vecs[i])); x.cd.p = prof; });
      } catch (error) { setError('카드 임베딩', error); }
      if (moved()) return 0;
      const byMsg = new Map();
      for (const x of newCards) { const k = keyOf.get(x.mi); if (!byMsg.has(k)) byMsg.set(k, []); byMsg.get(k).push(x.cd); }
      for (const [k, list] of byMsg) { cardStore.set(k, list); cardDirty.add(shardOf(k)); }
      attachCardVecs();
      saveCards();
    }
    for (const mi of mis) story.analyzed.push(keyOf.get(mi));
    saveStory();
    return mis.length;
  }
  function rankScore(a) {
    const p = a?.probabilities;
    if (p && Object.keys(p).length) { let s = 0, t = 0; for (const [k, v] of Object.entries(p)) { const lv = Number(k); if (Number.isFinite(lv)) { s += lv * v; t += v; } } if (t) return s / t; }
    return Number(a?.score ?? 0);
  }
  /** 카드 · 약속 문장에서 상태창 칸([날짜 ◆ 시간 ◆ 장소])은 뺀다 (원문 조각은 그대로) */
  const stripStatus = (t) => String(t).replace(/\[[^\]\n]{4,160}\]/g, (m) => { const x = parseStatus(m); return x.d || x.t || x.weather ? ' ' : m; }).trim();
  const unquote = (t) => String(t).trim().replace(/^["“”'‘’「『]+|["“”'‘’」』]+$/gu, '').trim();
  const sentencesOf = (t) => String(t).split(/(?<=[.!?。…~][”"’']?)\s+|\n+/u).map(s => s.trim()).filter(s => s.length >= 2);
  function topChoice(a) {
    const p = a?.probabilities;
    if (p && Object.keys(p).length) return Object.entries(p).sort((x, y) => y[1] - x[1])[0];
    return [a?.choice ?? null, Number(a?.confidence ?? (a?.choice ? 1 : 0))];
  }

  /** 답장 뒤 뒤에서: 새로 빠진 메시지를 몇 개씩 분석 */
  function queueStory() {
    if (storyJob || !chatKey) return;
    const ftodo = factBacklog().slice(-8).reverse();             // 칸 줄은 최근 것부터 (지금 대화와 가까운 기억이 먼저)
    const todo = settings.story ? storyBacklog().slice(0, 8) : []; // 이야기 정리는 순서대로 (관계 · 약속이 시간 순서라)
    const ttodo = tagBacklog();
    if (!ftodo.length && !todo.length && !ttodo.length) return;
    const key = chatKey;
    const tr = beginTrace('story');
    storyJob = (async () => {
      const facts1 = () => (ftodo.length ? timed(tr, '칸 줄 만들기', () => factMessages(ftodo), `메시지 ${ftodo.length}개`) : null);
      const story1 = () => (todo.length && chatKey === key ? timed(tr, '이야기 분석', () => analyzeMessages(todo), `메시지 ${todo.length}개`) : null);
      if ((settings.jevParallel ?? 2) >= 2) await Promise.all([facts1(), story1()]);
      else { await facts1(); await story1(); }
      const tl = chatKey === key ? tagBacklog() : [];
      if (tl.length) await timed(tr, '칸 나누기', () => tagLater(tl), `문장 ${tl.length}개`);
    })()
      .catch(error => setError('이야기 분석', error))
      .finally(() => { endTrace(tr); storyJob = null; if (chatKey === key) softRender(); });
  }

  /** 이야기 전체 분석 (도구 · 버튼) */
  let storyAll = null;
  function analyzeAll(onProgress) {
    if (storyAll) return Promise.reject(Object.assign(new Error('이미 분석 중이에요.'), { code: 'BUSY' }));
    const run = storyAll = (async () => {
      if (!await ensureChat()) throw new Error('채팅방을 먼저 열어 주세요.');
      while (storyJob) await storyJob.catch(() => {});
      const ftodo = factBacklog().reverse();
      const todo = settings.story ? storyBacklog() : [];
      const room = chatKey;
      const total = ftodo.length + todo.length;
      const tr = beginTrace('story');
      let done = 0;
      try {
        await timed(tr, '전부 정리', async () => {
          const par = Math.max(1, Math.min(10, settings.jevParallel ?? 2));
          let fDone = 0, sDone = 0;
          const tick = () => { done = fDone + sDone; onProgress?.(done, total); };
          const batches = [];
          for (let i = 0; i < ftodo.length; i += 8) batches.push(ftodo.slice(i, i + 8));
          let next = 0;
          const factLanes = (n) => Promise.all(Array.from({ length: Math.max(1, Math.min(n, batches.length)) }, async () => {
            while (next < batches.length && chatKey === room) { const b = batches[next++]; await factMessages(b); fDone += b.length; tick(); }
          }));
          const storyLane = async () => { for (let i = 0; i < todo.length && chatKey === room; i += 8) { const b = todo.slice(i, i + 8); await analyzeMessages(b); sDone += b.length; tick(); } };
          if (par === 1) { await factLanes(1); await storyLane(); }
          else if (!todo.length) await factLanes(par);
          else await Promise.all([factLanes(par - 1), storyLane()]);
        }, () => `${done}/${total}`);
      } finally { endTrace(tr); }
      await flushStory();
      await flushFacts();
      return new Set([...ftodo, ...todo]).size;
    })().finally(() => { storyAll = null; });
    return run;
  }

  // ── 인물 태그 ──
  const TAG_CUE = /좋아|사랑|최고|멋지|멋있|예쁘|귀엽|고마|감사|행복|기쁘|기뻐|즐거|신나|설레|반하|반했|맛있|칭찬|자랑|든든|편안|안심|대단|훌륭|잘한|잘하|좋은|싫|미워|미운|짜증|화나|화가|화났|무서|두려|겁나|겁이|역겹|징그|지겹|귀찮|불편|불안|슬프|슬퍼|우울|외로|괴롭|억울|창피|부끄|질투|실망|후회|최악|못하|서툴|약점|트라우마|♡|♥|ㅠ|ㅜ/u;
  const TAG_STOP = new Set(['것', '거', '때', '곳', '수', '일', '오늘', '지금', '정말', '진짜', '너무', '조금', '많이', '그냥', '우리', '나', '너', '저', '제', '내', '네', '그', '이', '저것', '이것', '그것', '자기', '모두', '다들', '사람', '생각', '마음', '느낌', '기분', '표정', '얼굴', '목소리', '눈', '손', '말', '듯', '뭐', '왜', '더', '또', '좀', '꼭', '다시', '같이', '함께', '아주', '매우', '그래도', '하지만', '그리고', '게다', '그러다', '마침내', '결국', '드디어', '이제', '여기', '거기', '저기']);
  const TAG_MAX = 12;
  const TAG_GUIDE = '[TAGS] Each Tn below is a sentence about the person in brackets. Pick the one thing in it that is positive (+) for that person (something they like, enjoy, are proud of or good at, or a good experience) or negative (-) (something they dislike, fear, are bad at, or a bad experience). Choose none if nothing fits.';
  /** 문장의 명사 후보 (규칙): 조사 떼고, 사람 이름 · 흔한 말 · 감정 말 · 동사 끝 같은 건 뺀다 */
  // 조사가 붙은 단어만 명사로 본다 (동사 · 형용사에는 조사가 안 붙는다): 바다를 · 흙먼지가 · 슈크림보다
  const NOUN_PARTICLE = /^(.{2,12}?)(에서는|에게는|한테는|으로는|이랑|하고|에서|에게|한테|으로|보다|처럼|까지|부터|조차|마저|을|를|이|가|은|는|의|에|와|과|랑|도|만|로|께)$/u;
  // 명사처럼 보이지만 동사 · 형용사 꼴 (예전에 쌓인 태그 정리용)
  const VERBISH = /(으며|면서|하네|래요|어요|아요|해요|네요|셔서|어서|아서|여서|는지|다니|스러운|러운|로운|다운|하는|하던|했던|있는|없는|보면|하면|하게|하고|하며|지만|니까|구나|잖아|거든|할게|줄게|했어|했지|했다|한다|였다|었다|았다|운|던|놓)$/u;
  const tagWordOk = (w) => !!w && w.length >= 2 && !/^[A-Za-z]+$/.test(w) && !VERBISH.test(w) && !TAG_STOP.has(w) && !TAG_CUE.test(w);
  /** 문장의 명사 후보 (규칙): 괄호 속 말(감정 표시 등) 빼고, 조사가 붙은 단어만, 사람 이름 · 흔한 말 · 감정 말은 뺀다 */
  function tagNouns(s, max = 5) {
    const out = [];
    const toks = String(s).replace(/\([^)]{0,40}\)/g, ' ').split(/\s+/).map(x => x.replace(/[^\p{L}\p{N}]/gu, ''));
    for (const [i, tok] of toks.entries()) {
      // 하다 동사의 앞 명사: 포기하는 · 요리하기 · 공부하는걸 → 포기 · 요리 · 공부
      const hv = /^([가-힣]{2,4})(하는|하기|하던|하는걸|하는게|하는것|하기를|하기가)$/u.exec(tok);
      if (hv) { const w = hv[1]; if (tagWordOk(w) && !peopleIn(w).length && !out.includes(w)) out.push(w); if (out.length >= max) break; continue; }
      const m = NOUN_PARTICLE.exec(tok);
      if (!m) continue;
      let w = m[1];
      // 바로 앞 낱말이 조사 없는 한글 명사 같으면 붙인다: 천둥 소리는 → 천둥 소리
      const prev = toks[i - 1] ?? '';
      if (/^[가-힣]{1,6}$/.test(prev) && !NOUN_PARTICLE.test(prev) && !/(자|다|요|고|며|서|지|게|까지|부터|는|은|을|를|의|에|가|도|만|로)$/u.test(prev) && tagWordOk(prev) && !peopleIn(prev).length && `${prev} ${w}`.length <= 14) w = `${prev} ${w}`;
      if (/^\d+$/.test(w) || !tagWordOk(w) || peopleIn(w).length) continue;
      if (!out.includes(w)) out.push(w);
      if (out.length >= max) break;
    }
    return out;
  }
  /** 이번에 물을 문장들 (감정 말 센 것 먼저) */
  function tagCandidates(runChunks) {
    const main = new Set(personList().filter(p => !p.hidden && !isTitleName(p.name) && (p.count >= 3 || p.kind === 'char' || p.kind === 'persona')).map(p => p.name));
    if (!main.size) return [];
    const asked = new Set(story.tagAsked ?? []);
    const low = new Set(facts.filter(f => (f.w ?? 3) < 1.5).map(f => unquote(f.sent)));
    const jobs = [];
    const seen = new Set();
    const known = (n) => { const p = story.people[n]; return !!p && !p.hidden && !isTitleName(p.name); };
    let speaker = null;
    let spMi = -1;
    for (const c of runChunks) {
      if (c.mi !== spMi) { speaker = null; spMi = c.mi; }
      for (const s of sentencesOf(c.text)) {
      // 화자: "세아 (shy): "…" 처럼 시작하면 따옴표가 닫힐 때까지 이어 받는다
      const sp = /^([^\s:("“]{1,12})\s*(?:\([^)]{0,20}\))?\s*:/u.exec(s);
      if (sp) speaker = peopleIn(sp[1]).find(known) ?? null;
      const cur = speaker;
      const qn = (s.match(/["“”]/g) ?? []).length;
      if (sp ? qn % 2 === 0 : qn % 2 === 1) speaker = null;
      const clean = unquote(s);
      if (clean.length < 6 || clean.length > 300 || !TAG_CUE.test(clean) || low.has(clean)) continue;
      const h = fnv(clean);
      if (asked.has(h) || seen.has(h)) continue;
      const inS = peopleIn(clean);
      // 화자 대사면 화자 (다른 인물 이야기가 아니면), 아니면 자주 나온 인물, 아니면 문장 맨 앞 주어
      const person = (cur && (sp || !inS.some(n => n !== cur)) ? cur : null) ?? inS.find(n => main.has(n)) ?? inS.find(n => known(n) && clean.startsWith(n));
      if (!person) continue;
      const nouns = tagNouns(clean);
      if (!nouns.length) continue;
      seen.add(h);
      const strength = (clean.match(new RegExp(TAG_CUE.source, 'gu')) ?? []).length;
      jobs.push({ c, s: clip(clean, 220), h, person, nouns, strength, opts: Object.fromEntries([...nouns.flatMap((w, k) => [[`p${k}`, `${w} (+)`], [`n${k}`, `${w} (-)`]]), ['none', 'nothing positive or negative for them']]) });
      }
    }
    return jobs.sort((x, y) => y.strength - x.strength);
  }
  function addTag(person, word, d, j) {
    if (!person || !word) return;
    const t = ((story.tags ??= {})[person] ??= {})[word] ??= { s: 0, n: 0 };
    t.s = Math.max(-9, Math.min(9, t.s + d));
    t.n++;
    t.last = j.c.mi;
    t.ck = ckOf(j.c);
    t.q = clip(j.s, 90);
    if (t.s === 0) delete story.tags[person][word];
  }
  /** 화면 · 모델용: 긍정 위 3개, 부정 위 2개 (점수 크기 → 최근 순) */
  function topTags(name, nPos = 3, nNeg = 2) {
    const tg = Object.entries(story.tags?.[name] ?? {}).filter(([w]) => tagWordOk(w));
    const rank = (x, y) => Math.abs(y[1].s) - Math.abs(x[1].s) || (y[1].last ?? 0) - (x[1].last ?? 0);
    return { pos: tg.filter(([, t]) => t.s > 0).sort(rank).slice(0, nPos), neg: tg.filter(([, t]) => t.s < 0).sort(rank).slice(0, nNeg), all: tg.sort(rank) };
  }

  // ── 같은 사람 같아 보이는 이름 (규칙만, Jev 없이): 끝소리 · 호칭만 다르면 제안 ──
  //  보민이 · 보민아 → 보민, 하윤누나 · 하윤 누나 → 하윤, 단풍님 → 단풍. 내가 "아니야" 한 쌍은 다시 묻지 않는다
  const NAME_TAIL = /(이|아|야|님|씨|쨩|짱|군|양|누나|누님|언니|오빠|형|형님|선배|선배님)$/;
  function sameSuggestions() {
    const ppl = personList().filter(p => !p.hidden);
    const byForm = new Map();
    for (const p of ppl) for (const n of nameForms(p)) byForm.set(n.replace(/\s+/g, ''), p.name);
    const seen = new Set(story.notSame ?? []);
    const out = [];
    const main = (n) => ['char', 'persona'].includes(story.people[n]?.kind);
    for (const p of ppl) {
      const m = p.name.replace(/\s+/g, '');
      const tail = NAME_TAIL.exec(m);
      if (!tail) continue;
      const base = byForm.get(m.slice(0, -tail[1].length));
      if (!base || base === p.name) continue;
      // 보통은 끝소리 붙은 쪽(보민이)을 기본 이름(보민)에 합친다. 끝소리 쪽이 캐릭터 · 나(페르소나)면 반대로
      let from = p.name, into = base;
      if (main(from)) { if (main(into)) continue; [from, into] = [into, from]; }
      const key = [from, into].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ from, into });
    }
    // 이름의 한 단어만 따로 잡힌 경우: 사키 → 나나미 사키, 아카네 → 세리자 아카네 (붙여 쓴 세리자아카네도 앞뒤가 같으면)
    for (const p of ppl) {
      const full = p.name.replace(/\s+/g, '');
      if (full.length < 4) continue;
      for (const q of ppl) {
        const w = q.name.replace(/\s+/g, '');
        if (q === p || w.length < 2 || full.length - w.length < 2 || !(p.name.split(/\s+/).includes(q.name) || full.startsWith(w) || full.endsWith(w))) continue;
        const short = q.name;
        if (main(short)) continue;
        const key = [short, p.name].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ from: short, into: p.name });
      }
    }
    return out;
  }
  function markNotSame(a, b) { (story.notSame ??= []).push([a, b].sort().join('|')); saveStory(); }

  // ── 사람이 직접 고치기 ──
  function mergePeople(from, into) {
    if (from === into || !story.people[from] || !story.people[into]) return;
    const a = story.people[from], b = story.people[into];
    b.aliases = [...new Set([...b.aliases, a.name, ...a.aliases])];
    b.count += a.count;
    b.first = Math.min(b.first ?? Infinity, a.first ?? Infinity);
    b.last = Math.max(b.last ?? 0, a.last ?? 0);
    delete story.people[from];
    for (const [k, p] of Object.entries(story.pairs)) {
      if (p.a !== from && p.b !== from) continue;
      delete story.pairs[k];
      const other = p.a === from ? p.b : p.a;
      if (other === into) continue;
      const q = pairOf(into, other, true);
      q.co += p.co; q.aff = Math.max(-10, Math.min(10, q.aff + p.aff)); q.type ??= p.type; if (!q.who && p.who) q.who = p.who === from ? into : p.who; q.last = Math.max(q.last ?? 0, p.last ?? 0);
      q.events = [...q.events, ...p.events].sort((x, y) => x.mi - y.mi).slice(-60);
      if (p.intim) {
        const r = q.intim ??= { n: 0, first: null, last: null, firstCk: null, lastCk: null, day: null };
        r.n += p.intim.n;
        if (p.intim.first != null && (r.first == null || p.intim.first < r.first)) { r.first = p.intim.first; r.firstCk = p.intim.firstCk; }
        if (p.intim.last != null && (r.last == null || p.intim.last > r.last)) { r.last = p.intim.last; r.lastCk = p.intim.lastCk; r.day = p.intim.day; }
      }
    }
    for (const t of story.threads) { if (t.who === from) t.who = into; if (t.to === from) t.to = into; }
    if (story.tags?.[from]) {
      const dst = (story.tags[into] ??= {});
      for (const [w, t] of Object.entries(story.tags[from])) { const d = (dst[w] ??= { s: 0, n: 0 }); d.s = Math.max(-9, Math.min(9, d.s + t.s)); d.n += t.n; if ((t.last ?? -1) > (d.last ?? -1)) Object.assign(d, { last: t.last, ck: t.ck, q: t.q }); }
      delete story.tags[from];
    }
    saveStory();
  }
  function hidePerson(name) {
    if (!story.people[name]) return;
    delete story.people[name];
    story.rejected.push(name);
    if (story.tags) delete story.tags[name];
    for (const k of Object.keys(story.pairs)) if (k.split('|').includes(name)) delete story.pairs[k];
    saveStory();
  }
  function togglePin(ck) {
    const i = story.pins.indexOf(ck);
    if (i >= 0) story.pins.splice(i, 1); else story.pins.push(ck);
    saveStory();
    return i < 0;
  }
  function chunkByCk(ck) {
    // 메시지 지문 안에도 ':'가 있어서 마지막 ':' 뒤만 조각 번호
    const s = String(ck), cut = s.lastIndexOf(':');
    const k = s.slice(0, cut), pos = Number(s.slice(cut + 1));
    for (const c of chunks) if (c.pos === pos && timeline[c.mi]?.key === k) return c;
    return null;
  }
  async function resetStory() {
    const pins = story.pins;
    story = { ...emptyStory(), pins };
    cardStore = new Map();
    cardDirty = new Set(Array.from({ length: SHARDS }, (_, s) => s));
    attachCardVecs();
    await flushCards();
    seedPeople();
    await flushStory();
  }

  /** 기억 화면 검색: 임베딩 + 글자 (Jev 없음) */
  async function searchMemory(query, k = 30) {
    const limit = chunks.length;
    if (!query.trim() || !limit) return [];
    let qv = [];
    try { qv = await queryVecs([memText(query).slice(0, 2000)]); } catch { }
    return retrieve(qv, query, new Set(), k, limit);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  연출 카드: 사람이 써 둔 연출을 Jev가 지금 장면에 맞게 고른다 (글은 모델이 만들지 않는다)
  // ══════════════════════════════════════════════════════════════════════
  //
  //  ① 조건으로 거른다: 필요한 인물({other})이 있나, 관계 온도(aff), 열린 약속, 최근에 쓴 카드는 쉰다
  //  ② 임베딩으로 지금 장면과 가까운 카드 8장만 추린다 (카드가 1000장이어도 Jev는 8장만 본다)
  //  ③ 회상과 같은 Jev 호출에서 그중 하나 또는 "없음"을 고른다 (호출이 늘지 않는다)
  //  고른 카드는 이름을 채워 "Scene idea (선택)" 한 줄로 넣는다. 사용자 지시가 늘 먼저.

  // 넣을지 말지는 "맞는 게 없음" 확률로 정한다. 맞는 카드가 둘이면 확률이 갈려서(33% / 32%) 1등 기준으로는 아무것도 안 넣게 되기 때문
  const DIR_FREQ = { rare: { none: 0.1, top: 0.4 }, normal: { none: 0.25, top: 0.15 }, often: { none: 0.45, top: 0.1 } };
  const DIR_FREQ_KO = { rare: ['가끔', '딱 맞을 때만'], normal: ['보통', '추천'], often: ['자주', '더 과감하게'] };
  const DIR_COOLDOWN = 8;   // 같은 카드는 보낸 횟수 8번 동안 쉰다
  const DIR_SHORT = 12;     // Jev에게 보여 줄 카드 수 (실험: 장르 맞춤 + 12장이 맞는 카드를 8장 · 전체보다 약 2배 더 올림)
  const dirCardOf = (pack, [id, name, when, text, opt]) => ({ id, pack, name, when, text, aff: opt?.aff ?? null, promise: !!opt?.promise });

  function sanitizeDirCards(list) {
    if (!Array.isArray(list)) return [];
    const s = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
    const seen = new Set();
    const out = [];
    for (const c of list) {
      if (!c || typeof c !== 'object') continue;
      const name = s(c.name, 40), text = s(c.text, 400);
      if (!name || !text) continue;
      let id = s(c.id, 40) || `u${fnv(`${name}|${text}`).toString(36)}`;
      while (seen.has(id)) id += 'x';
      seen.add(id);
      const affN = c.aff === null || c.aff === '' || c.aff === undefined ? NaN : Number(c.aff);
      out.push({ id, pack: /^up_[a-z0-9]{2,24}$/.test(c.pack ?? '') || DIR_PACKS[c.pack] ? c.pack : 'custom', name, when: s(c.when, 160), text, aff: Number.isFinite(affN) ? Math.max(-10, Math.min(10, Math.round(affN))) : null, promise: c.promise === true });
      if (out.length >= 2000) break;
    }
    return out;
  }
  /** 내가 만든 묶음: { id: 'up_…', name, icon } */
  function sanitizeUserPacks(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const p of list) {
      if (!p || typeof p !== 'object' || !/^up_[a-z0-9]{2,24}$/.test(p.id ?? '') || out.some(x => x.id === p.id)) continue;
      const name = typeof p.name === 'string' ? p.name.trim().slice(0, 20) : '';
      if (!name) continue;
      out.push({ id: p.id, name, icon: typeof p.icon === 'string' && p.icon.trim() ? [...p.icon.trim()].slice(0, 2).join('') : '📁' });
      if (out.length >= 40) break;
    }
    return out;
  }
  const isUserPack = (pid) => pid === 'custom' || /^up_/.test(pid ?? '');
  /** 묶음 목록: 기본 · 장르 · 내 카드 · 내가 만든 묶음 */
  function packList(cfg = settings) {
    return [...Object.entries(DIR_PACKS).map(([id, p]) => ({ id, icon: p.icon, name: p.label, desc: p.desc, mine: false })),
      { id: 'custom', icon: '✍️', name: '내 카드', desc: '내가 쓴 카드', mine: true },
      ...(cfg.dirUserPacks ?? []).map(p => ({ id: p.id, icon: p.icon, name: p.name, desc: '내가 만든 묶음', mine: true, user: true }))];
  }
  /** 켜 둔 묶음의 카드 전부 (끈 카드 빼고) */
  function allDirCards(cfg = settings, withOff = false) {
    const off = new Set(cfg.dirOff);
    const out = [];
    for (const [pid, p] of Object.entries(DIR_PACKS)) if (cfg.dirPacks.includes(pid)) for (const c of p.cards) out.push(dirCardOf(pid, c));
    out.push(...cfg.dirCustom.filter(c => cfg.dirPacks.includes(c.pack ?? 'custom')));
    return withOff ? out : out.filter(c => !off.has(c.id));
  }
  function packCards(pid, cfg = settings) {
    const mine = cfg.dirCustom.filter(c => (c.pack ?? 'custom') === pid);
    return isUserPack(pid) ? mine : [...(DIR_PACKS[pid]?.cards ?? []).map(c => dirCardOf(pid, c)), ...mine];
  }

  /** {char} {user} {other}를 이름으로. {other}가 필요한데 장면에 다른 인물이 없으면 null */
  function dirFill(card, present) {
    const card0 = characterCache.name || 'char', us = personaCache || 'user';
    // 해설자 카드(여러 인물을 연기)면 카드 이름은 사람이 아니다: 대화에 거의 안 나오면 장면의 주요 인물을 {char}로
    const npcs = present.filter(n => n !== us && n !== card0 && story.people[n] && story.people[n].kind !== 'persona' && !isTitleName(n) && !/^(남성|여성|남자|여자|소년|소녀|아이|사람|누군가|청년|노인)$/.test(n))
      .sort((a, b) => (story.people[b].count ?? 0) - (story.people[a].count ?? 0));   // 많이 나온 인물이 주인공일 가능성이 크다
    const narrator = (story.people[card0]?.count ?? 0) < 3;
    if (narrator && !npcs.length && /\{char\}/.test(card.text + card.when)) return null;
    const ch = narrator && npcs.length ? npcs[0] : card0;
    const other = npcs.find(n => n !== ch && story.people[n].kind === 'npc');
    if (/\{other\}/.test(card.text + card.when) && !other) return null;
    const names = { char: ch, user: us, other: other ?? '' };
    // 조사도 이름에 맞게: 하윤 + {가} → 하윤이, 지호 + {가} → 지호가
    const PAIRS = { 이: ['이', '가'], 가: ['이', '가'], 은: ['은', '는'], 는: ['은', '는'], 을: ['을', '를'], 를: ['을', '를'], 과: ['과', '와'], 와: ['과', '와'] };
    const batchim = (w) => { const c = String(w).slice(-1).charCodeAt(0); return c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 !== 0 : false; };
    const f = (t) => String(t).replace(/\{(char|user|other)\}(이|가|은|는|을|를|과|와)?/g, (_, k, j) => { const n = names[k]; return j ? n + PAIRS[j][batchim(n) ? 0 : 1] : n; });
    return { ...card, fText: f(card.text), fWhen: f(card.when || card.name) };
  }
  // ── 장르 자동 맞춤: 감독 호출에 질문 5개를 얹어 가끔 묻고, 맞는 장르 묶음만 쓴다 (기본 · 내 카드는 늘) ──
  const GENRES = { romance: 'romance, or romantic feelings between the main characters', daily: 'everyday slice-of-life: casual routines at home, school, or work', mystery: 'mystery, investigation, crime, or a suspense thriller', fantasy: 'fantasy or adventure: magic, quests, journeys, or monsters', horror: 'horror: fear, the supernatural, dread, or survival' };
  const GENRE_EVERY = 30;   // 보낸 횟수 30번마다 다시 확인
  function genreQuestions() {
    const g = story.genres;
    if (g && (story.dirTurn ?? 0) - (g.turn ?? 0) < GENRE_EVERY) return {};
    return Object.fromEntries(Object.entries(GENRES).map(([k, d]) => [`g_${k}`, { type: 'noul', instructions: `Is this story strongly about ${d}?` }]));
  }
  function genreFrom(answers) {
    if (!Object.keys(GENRES).some(k => answers?.[`g_${k}`])) return;
    const prev = story.genres?.p ?? null;
    const p = {};
    for (const k of Object.keys(GENRES)) { const v = Number(answers[`g_${k}`]?.noul ?? 0); p[k] = Math.round((prev ? prev[k] * 0.4 + v * 0.6 : v) * 100) / 100; }
    story.genres = { p, turn: story.dirTurn ?? 0 };
  }
  /** 이 채팅에 맞는 장르 묶음. 아직 모르면 null (전부 씀) */
  function activeGenres() {
    const p = story.genres?.p;
    if (!p) return null;
    const on = Object.keys(p).filter(k => p[k] >= 0.5);
    return on.length ? on : [Object.keys(p).sort((a, b) => p[b] - p[a])[0]];
  }
  function dirEligible(present) {
    const ch = characterCache.name, us = personaCache;
    const aff = ch && us ? (pairOf(ch, us)?.aff ?? 0) : 0;
    const turn = story.dirTurn ?? 0;
    const cool = new Set((story.dirRecent ?? []).filter(r => turn - r.turn < DIR_COOLDOWN).map(r => r.id));
    const hasPromise = openThreads().some(t => present.includes(t.who) || (t.to && present.includes(t.to)));
    const gen = settings.dirAuto ? activeGenres() : null;
    const out = [];
    for (const c of allDirCards()) {
      if (cool.has(c.id)) continue;
      if (gen && GENRES[c.pack] && !gen.includes(c.pack)) continue;
      if (c.aff != null && (c.aff >= 0 ? aff < c.aff : aff > c.aff)) continue;
      if (c.promise && !hasPromise) continue;
      const f = dirFill(c, present);
      if (f) out.push(f);
    }
    return out;
  }

  // ── 카드 임베딩: 기기 저장소에 한 번만 (임베딩 설정이 바뀌면 다시) ──
  const DIRVEC_KEY = `${KEY}dirvec`;
  let dirVec = { prof: '', map: new Map(), loaded: false };
  let dirVecJob = null;
  const dirKey = (c) => fnv(`${c.name}|${c.when}|${c.text}`).toString(36);
  const dirEmbedText = (c) => `${c.name}. ${c.when}. ${c.text}`.replace(/\{char\}/g, '캐릭터').replace(/\{user\}/g, '상대').replace(/\{other\}/g, '다른 인물');
  function ensureDirVecs(cards) {
    const prof = embedProfile();
    if (dirVec.prof !== prof) dirVec = { prof, map: new Map(), loaded: false };
    if (dirVecJob || (dirVec.loaded && cards.every(c => dirVec.map.has(dirKey(c))))) return dirVecJob;
    const run = dirVecJob = (async () => {
      if (!dirVec.loaded) {
        try { const saved = await localStore?.getItem(DIRVEC_KEY); if (saved && saved.prof === prof) for (const [k, v] of Object.entries(saved.map ?? {})) dirVec.map.set(k, v); } catch { }
        dirVec.loaded = true;
      }
      const miss = cards.filter(c => !dirVec.map.has(dirKey(c))).slice(0, 500);
      if (!miss.length) return;
      const vs = await embedTexts(miss.map(dirEmbedText), `연출 카드 임베딩 (${miss.length}개)`);
      if (dirVec.prof !== prof) return;
      miss.forEach((c, i) => dirVec.map.set(dirKey(c), packSigns(toSigns(vs[i]))));
      try { await localStore?.setItem(DIRVEC_KEY, { prof, map: Object.fromEntries(dirVec.map) }); } catch { }
    })().catch(error => setError('연출 카드 임베딩', error)).finally(() => { if (dirVecJob === run) dirVecJob = null; });
    return run;
  }
  const bigrams = (t) => { const g = new Set(); const x = String(t).toLowerCase().replace(/[^가-힣a-z0-9]/g, ''); for (let i = 0; i < x.length - 1; i++) g.add(x.slice(i, i + 2)); return g; };
  /** 지금 장면과 가까운 카드부터. 벡터가 아직 없으면 글자 겹침으로 */
  function dirShortlist(cands, qv, ctx) {
    const prof = embedProfile();
    const useVec = qv.length && dirVec.prof === prof && cands.some(c => dirVec.map.has(dirKey(c)));
    const turn = story.dirTurn ?? 0;
    const g = useVec ? null : bigrams(ctx);
    const scored = cands.map(c => {
      const jitter = (fnv(`${c.id}:${turn}`) % 1000) / 1e5;   // 같은 점수면 매번 같은 카드만 나오지 않게
      if (useVec) {
        const b = dirVec.map.get(dirKey(c));
        if (!b) return { c, s: -Infinity };
        const v = unpackSigns(b, VEC_BITS);
        return { c, s: qv.reduce((a, q, i) => a + simSigns(q, v) * (i === 0 ? 0.6 : 0.4), 0) + jitter };
      }
      let hit = 0;
      for (const x of bigrams(`${c.fWhen} ${c.fText}`)) if (g.has(x)) hit++;
      return { c, s: hit + jitter * 100 };
    });
    return scored.filter(x => x.s > -Infinity).sort((a, b) => b.s - a.s).slice(0, DIR_SHORT).map(x => x.c);
  }

  // ── 기본 연출 카드 묶음: [id, 이름, 언제, 연출, 조건] ──
  // {char}=캐릭터 {user}=사용자 {other}=장면의 다른 인물. 사용자의 행동 · 말 · 속마음은 절대 정하지 않는다.
  // 조건: aff = 캐릭터↔사용자 관계 온도가 이 이상(음수면 이 이하), promise = 열린 약속이 있을 때만
  const DIR_PACKS = {
    basic: { label: '기본', icon: '🎬', desc: '어떤 이야기에도 맞는 연출', cards: [
      ['b01', '감각 한 컷', '대화만 이어지고 주변 묘사가 부족할 때', '대사 사이에 지금 장소의 소리 · 냄새 · 빛 중 하나를 구체적으로 한 문장 넣어 장면을 붙잡는다.'],
      ['b02', '먼저 움직이기', '{char}가 묻는 말에 답만 하며 수동적일 때', '{char}가 대답에서 멈추지 않고, 자기 목적을 위한 작은 행동이나 제안을 하나 먼저 한다.'],
      ['b03', '숨은 속마음', '{char}의 말과 진짜 감정이 다를 법한 순간', '{char}의 말은 그대로 두되, 시선 · 손짓 · 말끝 같은 작은 몸짓으로 숨긴 감정이 살짝 새어 나오게 한다.'],
      ['b04', '떡밥 회수', '예전에 나왔던 물건 · 말 · 장소를 다시 꺼낼 만할 때', '앞에서 지나갔던 물건이나 말 하나를 자연스럽게 다시 등장시켜, 그때와 지금이 이어져 있음을 보여 준다.'],
      ['b05', '작은 방해', '장면이 너무 순탄하게만 흘러갈 때', '날씨 · 소음 · 지나가는 사람 같은 작은 방해가 끼어들어 흐름을 한 번 꺾는다. 큰 사건으로 키우지는 않는다.'],
      ['b06', '갈래 던지기', '다음에 무엇을 할지 정해지지 않아 이야기가 멈칫할 때', '{char}가 성격대로 두세 갈래의 다음 행동을 넌지시 꺼낸다. 고르는 건 {user}에게 맡긴다.'],
      ['b07', '시간 건너뛰기', '같은 행동이 길게 반복되거나 한 장면이 끝난 느낌일 때', '의미 없는 과정은 짧게 넘기고 "얼마 뒤" 다음 장면의 첫 순간으로 옮겨 간다.'],
      ['b08', '침묵의 무게', '감정적으로 무거운 말이 오간 직후', '{char}가 바로 대답하지 않는다. 짧은 침묵과 그 사이의 행동을 먼저 쓰고, 말은 짧게.'],
      ['b09', '의외의 면모', '{char}가 한 가지 모습으로만 반복될 때', '{char}의 평소와 살짝 다른 습관 · 취향 · 약점 하나를 자연스럽게 드러낸다. 설정과 모순되지 않게.'],
      ['b10', '대가 붙이기', '원하는 것이 너무 쉽게 손에 들어오려 할 때', '그 일이 공짜로 되지 않게, 작지만 분명한 대가나 조건을 하나 붙인다.'],
      ['b11', '조용한 인물의 한마디', '{other}가 장면에 있지만 한동안 조용할 때', '{other}가 자기 입장에서 한마디 끼어들어 장면의 공기를 살짝 바꾼다.'],
      ['b12', '기억의 메아리', '지금 상황이 예전의 어떤 일과 닮았을 때', '{char}가 비슷했던 예전 순간을 떠올리고, 그때와 달라진 점을 짧게 의식한다.'],
      ['b13', '템포 올리기', '답장이 계속 길고 느리게 늘어질 때', '이번 답장은 평소보다 짧고 빠르게. 짧은 문장과 행동 위주로 템포를 올린다.'],
      ['b14', '이 순간에 머물기', '중요한 감정의 순간인데 서둘러 넘어가려 할 때', '사건을 진행시키지 말고 이 순간에 머문다. 표정 · 숨 · 손끝의 변화를 천천히 그린다.'],
      ['b15', '되묻기', '{char}가 설명만 길게 늘어놓고 있을 때', '{char}가 설명을 줄이고, {user}에게 정말 궁금한 것 하나를 되묻는다.'],
      ['b16', '작은 오해', '관계가 너무 안정적이라 긴장이 없을 때', '{char}가 방금 일어난 일 하나를 살짝 다르게 받아들인다. 오해는 작게, 풀 여지를 남긴다.'],
      ['b17', '소품으로 말하기', '손에 쥘 만한 물건이 근처에 있을 때', '주변 물건 하나를 {char}가 만지작거리거나 쓰게 해서, 감정이나 생각을 말 대신 보여 준다.'],
      ['b18', '약속 떠올리기', '열린 약속에 얽힌 사람이 지금 장면에 있을 때', '{char}가 아직 남은 약속을 문득 떠올리고, 말이나 행동으로 슬쩍 내비친다.', { promise: true }],
      ['b19', '바깥 소식', '둘만의 장면이 길어져 세상이 멈춘 느낌일 때', '바깥에서 들려온 소식 · 소문 · 변화 하나를 전해, 세상이 계속 움직이고 있음을 보여 준다.'],
      ['b20', '몸이 먼저', '오래 걷거나 싸우거나 밤을 새운 뒤', '피로 · 배고픔 · 추위 같은 몸 상태를 {char}가 실제로 느끼고, 행동이 그 영향을 받게 한다.'],
      ['b21', '티 안 나는 배려', '{char}와 {user} 사이에 아직 거리가 있을 때', '{char}가 생색내지 않고 작은 배려 하나를 한다. 말로는 아무렇지 않은 척.'],
      ['b22', '굽히지 않기', '{char}가 너무 쉽게 동의만 하고 있을 때', '{char}가 자기 생각에서 하나는 굽히지 않는다. 이유는 성격과 사정에서 나온다.'],
      ['b23', '다음이 궁금하게', '한 장면이 마무리되어 갈 때', '답장 끝에 다음이 궁금해지는 작은 갈고리(낯선 소리, 의미심장한 한마디, 도착한 편지 등)를 남긴다.'],
      ['b24', '말투 대비', '{other}와 {char}가 같은 장면에 있을 때', '{char}와 {other}의 말투 · 태도 차이가 드러나게 짧게 주고받게 한다.'],
      ['b25', '목표로 한 걸음', '이야기가 목적 없이 흘러가고 있을 때', '{char}가 하려던 일이나 더 큰 목표를 떠올리고 그쪽으로 한 걸음 움직인다.'],
      ['b26', '사소한 실수', '{char}가 너무 완벽하게만 그려질 때', '{char}가 사소한 실수를 하나 하고, 성격대로 반응한다.'],
      ['b27', '흐르는 시간', '같은 장소에 오래 머물러 있을 때', '빛 · 날씨 · 사람들의 흐름 같은 주변이 바뀌어 시간이 흘렀음이 느껴지게 한다.'],
      ['b28', '비밀 한 조각', '{char}에게 아직 말하지 않은 사정이 있을 법할 때', '{char}가 숨기던 것의 아주 작은 단서 하나를 무심코 흘린다. 전부 밝히지는 않는다.'],
      ['b29', '반응 먼저', '방금 큰 행동이나 중요한 말이 나왔을 때', '다른 일로 넘어가기 전에, 방금 일에 대한 {char}의 즉각적이고 구체적인 반응부터 충분히 쓴다.'],
      ['b30', '숨 돌리기', '분위기가 계속 무겁거나 딱딱할 때', '{char}가 성격에 맞는 가벼운 농담이나 엉뚱한 행동으로 잠깐 숨 돌릴 틈을 만든다.'],
    ] },
    romance: { label: '로맨스', icon: '💗', desc: '설렘 · 질투 · 고백 직전', cards: [
      ['r01', '스치는 손', '둘이 가까이 붙어 있는 순간', '손이나 어깨가 우연히 스친다. {char}는 아무렇지 않은 척하지만 반응이 미세하게 늦다.', { aff: 1 }],
      ['r02', '질투', '{other}가 {user} 곁에 가까이 있을 때', '{char}가 괜히 말수가 줄거나 퉁명스러워진다. 이유는 끝까지 말하지 않는다.', { aff: 2 }],
      ['r03', '달라진 호칭', '사이가 꽤 가까워졌을 때', '{char}가 평소와 다른 호칭으로 {user}를 불러 본다. 스스로도 조금 당황한다.', { aff: 3 }],
      ['r04', '고백 직전', '감정이 무르익었지만 아직 말하지 않은 사이', '{char}가 무언가 말하려다 끝내 다른 말로 돌린다. 망설임이 보이게.', { aff: 4 }],
      ['r05', '화난 척 걱정', '{user}가 다치거나 무리하거나 위험했을 때', '{char}가 잔소리하듯 화를 내지만, 사실은 걱정하고 있다는 게 행동에서 드러난다.', { aff: 2 }],
      ['r06', '둘만의 비밀', '조용히 둘만 있는 시간', '{char}가 다른 사람에게는 말하지 않은 사소한 이야기를 {user}에게만 털어놓는다.', { aff: 2 }],
      ['r07', '무심한 선물', '특별한 날이거나 고마운 일이 있은 뒤', '{char}가 대수롭지 않은 척 작은 선물을 건넨다. 고른 이유가 {char}답다.', { aff: 2 }],
      ['r08', '한 발 물러서기', '{user} 쪽에서 적극적으로 다가올 때', '{char}가 바로 받아 주지 않고 장난스럽게 한 발 물러서며 여지를 남긴다.', { aff: 1 }],
      ['r09', '너무 가까운 거리', '대화하다 서로 거리가 좁혀졌을 때', '{char}가 거리가 너무 가까워졌음을 깨닫고 잠깐 멈춘다. 눈을 피할지 말지 망설인다.', { aff: 3 }],
      ['r10', '무방비', '밤이 깊었거나 둘 다 지쳤을 때', '{char}가 깜빡 졸거나 기대어 잠든다. 평소엔 보이지 않던 무방비한 모습.', { aff: 3 }],
      ['r11', '조심스러운 이유', '마음이 가까워졌는데 {char}가 망설일 때', '{char}가 관계에 조심스러운 이유를 조금만 내비친다. 다 말하지는 않는다.', { aff: 3 }],
      ['r12', '다음 약속', '둘이 함께할 다음 일정이 아직 없을 때', '{char}가 다음에 같이 할 일을 우회적으로 꺼낸다. 데이트라고 부르지는 않는다.', { aff: 2 }],
      ['r13', '행동으로 화해', '둘 사이에 다툼이나 서운함이 있은 뒤', '{char}가 말로 사과하는 대신 행동으로 화해의 신호를 먼저 보낸다.'],
      ['r14', '서운함', '{char}의 마음이 몰라준 것 같을 때', '{char}가 서운함을 티 내지 않으려 하지만 말끝이 짧아진다.', { aff: 1 }],
      ['r15', '들켜 버린 사이', '{other}가 함께 있고 둘이 가까운 사이일 때', '{other}가 둘 사이를 눈치채고 놀린다. {char}는 아니라고 하지만 서툴다.', { aff: 2 }],
      ['r16', '우산 하나', '비가 오거나 날씨가 궂을 때', '우산이나 피할 곳이 하나뿐인 상황이 생겨 둘이 가까이 있게 된다.', { aff: 1 }],
      ['r17', '속으로 들뜸', '둘이 처음 함께 해 보는 일이 있을 때', '{char}가 겉으론 태연하지만 속으로 들떠 있다는 게 작은 행동으로 새어 나온다.', { aff: 2 }],
      ['r18', '떠보기', '마음은 깊어졌는데 관계가 아직 애매할 때', '{char}가 장난처럼 둘이 어떤 사이인지 슬쩍 떠본다.', { aff: 4 }],
      ['r19', '몰래 바라보기', '{user}가 다른 데 집중하고 있을 때', '{char}가 {user}를 오래 바라보다가 들킬 뻔하고 황급히 시선을 돌린다.', { aff: 2 }],
      ['r20', '핑계 연락', '둘이 떨어져 있을 때', '{char}가 별일 아닌 핑계로 먼저 연락하거나 찾아온다.', { aff: 2 }],
      ['r21', '그때의 속마음', '둘의 추억이 쌓였을 때', '{char}가 둘이 처음 만났던 때를 꺼내며 그때의 속마음 하나를 고백한다.', { aff: 4 }],
      ['r22', '편 들어 주기', '{user}가 곤란하거나 부당한 대우를 받을 때', '{char}가 망설임 없이 {user} 편에 선다.', { aff: 1 }],
      ['r23', '귀여운 독점욕', '아주 가까운 사이일 때', '{char}가 {user}의 시간이나 관심을 조금 더 갖고 싶다는 걸 귀엽게 드러낸다.', { aff: 5 }],
      ['r24', '다정한 손길', '{user}가 지치거나 속상해 보일 때', '{char}가 말없이 머리를 쓰다듬거나 등을 토닥이는 등 작은 손길로 위로한다.', { aff: 3 }],
    ] },
    daily: { label: '일상', icon: '☕', desc: '소소한 하루 · 생활감', cards: [
      ['d01', '같이 먹기', '식사 시간이거나 배가 고플 때', '함께 먹는 음식을 구체적으로 그리고, {char}의 입맛이나 먹는 습관을 하나 드러낸다.'],
      ['d02', '사소한 고집', '편하게 같이 지내는 일상 장면', '리모컨, 마지막 한 조각 같은 사소한 일로 {char}가 장난스럽게 고집을 부린다.'],
      ['d03', '날씨 변수', '바깥 날씨가 바뀌었을 때', '날씨 변화가 그날의 계획이나 기분에 작은 영향을 준다.'],
      ['d04', '동네 사람', '동네나 가게, 길 위에 있을 때', '가게 주인 · 이웃 같은 동네 사람이 말을 걸어 일상의 결을 더한다.'],
      ['d05', '루틴', '아침이나 잠들기 전', '{char}의 아침 또는 밤 루틴 하나를 보여 준다. 반복되는 습관이 캐릭터를 만든다.'],
      ['d06', '작은 사고', '평온한 일상 장면이 이어질 때', '물을 쏟거나 물건을 잃어버리는 작은 사고가 생기고, 함께 수습한다.'],
      ['d07', '오늘의 계획', '할 일이 정해지지 않은 한가한 때', '{char}가 오늘이나 주말에 무엇을 할지 들뜬 얼굴로 계획을 꺼낸다.'],
      ['d08', '동물 손님', '바깥이나 창가에 있을 때', '길고양이나 새 같은 동물이 나타나 {char}가 성격대로 반응한다.'],
      ['d09', '요즘 빠진 것', '느긋하게 이야기할 여유가 있을 때', '{char}가 요즘 빠진 취미를 열심히 설명하거나 같이 해 보자고 한다.'],
      ['d10', '하루 정리', '하루가 끝나 가는 저녁이나 밤', '{char}가 오늘 있었던 일을 투덜대거나 털어놓으며 하루를 정리한다.'],
      ['d11', '집안일', '집 안에서 함께 있을 때', '청소 · 빨래 · 설거지 같은 집안일을 하며 자연스럽게 대화가 이어진다.'],
      ['d12', '옛날 사진', '방이나 서랍, 휴대폰을 정리할 때', '옛날 사진이나 물건이 나와 {char}의 과거 이야기가 조금 풀린다.'],
      ['d13', '계절 풍경', '계절감이 드러날 만한 바깥 장면', '벚꽃 · 장마 · 낙엽 · 첫눈 같은 계절의 풍경이나 작은 행사를 장면에 끌어온다.'],
      ['d14', '장보기', '음식이나 물건이 떨어졌을 때', '장을 보러 가서 {char}가 물건 고르는 기준과 고집이 드러난다.'],
      ['d15', '감기 기운', '날씨가 차거나 무리한 뒤', '{char}가 가벼운 감기 기운을 보이고 괜찮다고 우긴다.'],
      ['d16', '허둥지둥', '아침이거나 약속 시간이 다가올 때', '늦잠을 자거나 시간이 빠듯해져 허둥대는 상황이 생긴다.'],
      ['d17', '뉴스 한 토막', '집에서 쉬거나 밥을 먹을 때', '틀어 둔 TV나 휴대폰 뉴스 한 토막이 대화거리가 된다.'],
      ['d18', '새 가게', '밖을 걷거나 어디 갈지 고를 때', '근처에 새로 생긴 가게나 처음 보는 메뉴에 {char}가 호기심을 보인다.'],
      ['d19', '멍때리기', '조용하고 할 일 없는 순간', '{char}가 창밖을 보다가 엉뚱한 생각을 불쑥 말한다.'],
      ['d20', '갑작스런 칭찬', '편안한 분위기의 일상 대화', '{char}가 사소한 점을 갑자기 칭찬하고는 스스로 쑥스러워한다.'],
    ] },
    mystery: { label: '미스터리 · 스릴러', icon: '🔍', desc: '단서 · 의심 · 추격', cards: [
      ['m01', '어긋난 단서', '조사나 추적이 진행 중일 때', '새 단서가 하나 나온다. 지금까지 알던 것과 살짝 어긋나서 의문을 키우는 단서로.'],
      ['m02', '말의 틈', '{other}가 무언가를 설명하고 있을 때', '{other}의 말에 앞뒤가 맞지 않는 작은 틈이 보인다. {char}가 눈치챌지는 성격대로.'],
      ['m03', '뒤따르는 기척', '밖을 이동하고 있을 때', '누군가 뒤를 따라오는 듯한 기척이 느껴진다. 확실하지는 않게.'],
      ['m04', '시간 제한', '사건이 느슨하게 흘러갈 때', '해결해야 할 일에 기한이 생기거나 앞당겨진다.'],
      ['m05', '숨기는 것', '{other}가 함께 있을 때', '{other}가 무언가 숨기고 있다는 작은 신호를 남긴다.'],
      ['m06', '엉뚱한 방향', '단서를 쫓고 있을 때', '그럴듯하지만 사실은 엉뚱한 방향을 가리키는 증거가 나타난다.'],
      ['m07', '겁먹은 목격자', '사건 주변을 탐문할 때', '무언가를 본 사람이 나타나지만 겁을 먹고 말을 아낀다.'],
      ['m08', '익명의 경고', '진실에 가까워지고 있을 때', '익명의 경고나 위협이 도착한다. 누가 보냈는지는 밝히지 않는다.'],
      ['m09', '단서 정리', '단서가 여러 개 쌓였을 때', '{char}가 지금까지의 단서를 짧게 정리하고, 빠진 조각 하나를 짚는다.'],
      ['m10', '다녀간 흔적', '어떤 장소에 돌아왔거나 들어섰을 때', '있어야 할 물건이 사라졌거나 누군가 다녀간 흔적이 보인다.'],
      ['m11', '너무 쉬운 길', '막혔던 일이 갑자기 풀릴 때', '너무 쉬워 보이는 길이 나타난다. 의심할 만한 작은 이상한 점을 하나 남긴다.'],
      ['m12', '과거와의 연결', '사건의 배경이 궁금해질 때', '지금 사건이 예전의 다른 사건과 이어져 있을지 모른다는 연결고리가 보인다.'],
      ['m13', '정보의 값', '{other}가 정보를 쥐고 있을 때', '{other}가 정보를 주는 대신 무언가를 요구한다.'],
      ['m14', '고립', '실내에 있거나 밤일 때', '통신이 끊기거나 불이 나가 고립된다.'],
      ['m15', '추격', '정체가 드러났거나 위험이 가까워졌을 때', '갑자기 추격이 시작된다. 짧은 문장으로 긴박하게.'],
      ['m16', '지켜보던 눈', '안심하고 있던 순간', '누군가 멀리서 지켜보고 있었다는 사실을 알게 된다.'],
      ['m17', '뒤집히는 결론', '결론이 거의 난 것처럼 보일 때', '지금의 결론을 뒤흔드는 사실 하나가 드러난다.'],
      ['m18', '알리바이의 구멍', '{other}가 용의선상에 있을 때', '{other}의 알리바이에 작은 구멍이 생긴다.'],
      ['m19', '암호 쪽지', '현장이나 소지품을 살필 때', '알 수 없는 기호나 암호가 적힌 쪽지가 발견된다.'],
      ['m20', '떠보는 대화', '서로 믿기 어려운 사이가 마주했을 때', '겉으론 평범한 대화지만 서로 떠보는 긴장이 흐르게 쓴다.'],
    ] },
    fantasy: { label: '판타지 · 모험', icon: '🗡️', desc: '여정 · 마법 · 동료', cards: [
      ['f01', '갈림길', '여정 중 길을 고를 때', '길이 두 갈래로 나뉘고, 각각의 위험과 이점이 조금씩 보인다.'],
      ['f02', '습격', '이동하거나 야영하고 있을 때', '낯선 생물이 습격한다. 강하지만 대처할 수 있는 수준으로.'],
      ['f03', '힘의 대가', '마법이나 특별한 힘을 쓴 직후', '힘을 쓴 대가(피로 · 부작용 · 흔적)가 나타난다.'],
      ['f04', '낯선 풍습', '새로운 마을이나 장소에 도착했을 때', '그곳만의 풍습이나 규칙 하나를 보여 준다.'],
      ['f05', '현지의 전설', '마을 사람들과 이야기할 때', '현지인이 이 지역에 얽힌 전설이나 소문을 들려준다. 나중에 쓸모 있을지도.'],
      ['f06', '수수께끼 유물', '탐색하거나 전리품을 살필 때', '의미심장한 유물이나 아이템을 발견한다. 쓰임새는 아직 모른다.'],
      ['f07', '모닥불', '밤이 되어 쉬어야 할 때', '모닥불 앞에서 쉬며 동료끼리 속 이야기를 나눈다.'],
      ['f08', '적의 그림자', '여정이 순조로울 때', '아직 마주치지 않은 강적의 흔적이나 부하가 나타나 위협을 예고한다.'],
      ['f09', '동료의 사정', '{other}가 함께 여행하고 있을 때', '{other}가 여정에 함께하는 진짜 이유의 일부를 내비친다.'],
      ['f10', '자연의 시련', '험한 지형을 지날 때', '폭풍 · 절벽 · 늪 같은 자연의 시련이 앞을 막는다.'],
      ['f11', '새 의뢰', '마을이나 길 위에서 사람을 만났을 때', '도움을 청하는 사람이 나타나 새 의뢰나 부탁을 한다.'],
      ['f12', '떠돌이 상인', '길 위나 시장에 있을 때', '떠돌이 상인이 수상하지만 흥미로운 물건을 판다.'],
      ['f13', '고대 유적', '오래된 장소를 탐색할 때', '오래된 유적에서 읽을 수 없는 문자나 장치가 발견된다.'],
      ['f14', '각성의 조짐', '{char}가 위기에 몰렸을 때', '{char}의 능력이 예상치 못하게 반응하거나 성장의 조짐을 보인다.'],
      ['f15', '정체를 아는 자', '사람이 많은 곳에 있을 때', '{char}나 일행의 정체를 알아보는 사람이 나타난다.'],
      ['f16', '보급 문제', '긴 여정 중', '식량 · 물 · 돈이 부족해져 해결이 필요해진다.'],
      ['f17', '축제에 휘말림', '마을에 머물고 있을 때', '마을의 축제나 의식에 우연히 휘말린다.'],
      ['f18', '수상한 동료', '{other}와 함께 행동할 때', '{other}의 행동에서 의심스러운 점이 하나 보인다.'],
      ['f19', '승리의 여운', '전투나 시련을 막 넘긴 직후', '승리 뒤의 피로와 안도, 그리고 남은 상처를 차분히 그린다.'],
      ['f20', '지도 밖', '길을 잃었거나 새 길을 찾을 때', '지도에 없는 길이나 장소가 나타난다.'],
    ] },
    horror: { label: '공포', icon: '🕯️', desc: '불안 · 이상 징후 · 긴장', cards: [
      ['h01', '설명 안 되는 소리', '조용하거나 어두운 곳에 있을 때', '멀리서 설명할 수 없는 소리가 들린다. 원인은 보여 주지 않는다.'],
      ['h02', '미묘한 어긋남', '익숙한 장소에 돌아왔을 때', '무언가가 미묘하게 달라져 있다(문 위치, 사진 속 얼굴 등).'],
      ['h03', '깜빡이는 불', '실내이거나 밤일 때', '조명이 깜빡이다가 꺼진다.'],
      ['h04', '시선', '혼자거나 주변이 조용할 때', '보이지 않는 누군가가 지켜보는 감각이 든다.'],
      ['h05', '사라진 사람', '{other}가 함께 있을 때', '잠깐 눈을 뗀 사이 {other}가 보이지 않는다.'],
      ['h06', '금기', '낯선 장소를 살필 때', '하지 말라는 규칙이나 경고문이 발견된다.'],
      ['h07', '가짜 안도', '위험이 지나간 것처럼 보일 때', '한숨 돌린 직후, 아직 끝나지 않았음을 암시하는 작은 신호를 남긴다.'],
      ['h08', '몸의 공포', '긴장이 높아졌을 때', '소름 · 식은땀 · 숨 막힘 같은 몸의 공포 반응을 {char}에게 구체적으로 그린다.'],
      ['h09', '반복', '이상한 일이 한 번 있었던 뒤', '같은 일이 다시 일어난다. 이번엔 조금 다르게.'],
      ['h10', '흉내 내는 목소리', '어둡거나 일행이 흩어졌을 때', '익숙한 목소리가 있을 수 없는 곳에서 부른다.'],
      ['h11', '남겨진 기록', '버려진 장소를 뒤질 때', '누군가 남긴 일기나 메모에 섬뜩한 내용이 있다.'],
      ['h12', '숨죽이기', '무언가를 피해 숨어야 할 때', '숨을 곳이 좁고 어둡다. 소리를 내면 안 되는 긴장을 길게 끈다.'],
      ['h13', '거울 속', '거울이나 유리 근처에 있을 때', '거울이나 창에 비친 모습이 실제와 미묘하게 어긋난다.'],
      ['h14', '멈춘 시계', '시간을 확인할 때', '시계가 멈추거나 시간이 이상하게 흘러 있다.'],
      ['h15', '있으면 안 될 것', '빈 방이나 복도를 지날 때', '있어선 안 될 곳에 인형이나 아이 물건이 놓여 있다.'],
      ['h16', '냄새', '어떤 공간에 들어섰을 때', '썩은 냄새나 낯선 향이 어딘가에서 스며든다.'],
      ['h17', '일부만', '공포의 정체가 가까워졌을 때', '그 존재가 아주 일부만 모습을 드러낸다. 전체는 보여 주지 않는다.'],
      ['h18', '연락 두절', '도움이 필요할 때', '휴대폰이 터지지 않거나 바깥과 연락이 끊긴다.'],
      ['h19', '낯선 표정', '{char}가 지쳐 있거나 이상한 일을 겪은 뒤', '{char}가 순간 평소와 다른 표정이나 말을 하고, 본인은 기억하지 못한다.'],
      ['h20', '위험한 출구', '위협이 바짝 다가왔을 때', '도망칠 길이 하나 보이지만 위험을 감수해야 한다.'],
    ] },
  };

  // ══════════════════════════════════════════════════════════════════════
  //  칸 줄 기억: 문장마다 종류 + 누가/누구랑/누구에게/언제/어디서/무엇을/어떻게/왜
  // ══════════════════════════════════════════════════════════════════════
  //
  // 원문을 그대로 넣는 대신, 문장을 원문 단어 그대로 칸에 나눠 담은 "칸 줄"을 기억으로 쓴다.
  //  ① 규칙: 상태창 · 태그 빼기, 문장 나누기, 뻔한 단어는 규칙으로 칸 정하기 (이름+조사, 시간 말, ~에서, 끝말)
  //  ② Jev 한 번: 문장 종류(사건 · 행동 · 사실 · 약속 · 비밀 · 건너뜀) + 애매한 단어의 칸
  //     문장은 state에 번호로 한 번만, 질문은 "S3 w5 «단어»"처럼 짧게 (예전 방식보다 요청이 절반)
  //  ③ 언제 · 어디서가 비면 그 메시지 시점의 상태창 값으로 채운다
  //  ④ 칸 줄을 임베딩 (32바이트) → 회상 때 찾기 열쇠
  // 원문은 Risu 채팅에 있으니 저장하지 않는다. 칸 줄은 기기 저장소에 메시지 지문별로.

  const FACT_KINDS = { event: 'something happened (an event or change)', action: 'someone did something', fact: 'a fact, rule, setting, or state', promise: 'a promise or plan for later', secret: 'a secret someone keeps', skip: 'a question, small talk, filler narration, or nothing worth remembering' };
  const TAG_KINDS = new Set(['event', 'action', 'promise', 'secret']);   // 칸 나누기는 이 종류만 (사실은 문장 그대로가 낫다)
  const UPDATE_CUE = /바뀌|바꿨|변경|정정|이제는|지금은|현재|더 이상|대신|옮겼|옮긴|새로운|갱신|업데이트|최신/u;   // 바뀜 표시
  const FACT_K = { event: 'E', action: 'A', fact: 'F', promise: 'P', secret: 'S' };
  const FACT_KO = { event: '사건', action: '행동', fact: '사실', promise: '약속', secret: '비밀' };
  const SLOT_ROLES = { who: 'who', with: 'with', whom: 'whom', when: 'when', where: 'where', what: 'what', how: 'how', why: 'why', none: 'none' };
  const KIND_SHORT = { event: 'event', action: 'action', fact: 'fact', promise: 'promise', secret: 'secret', skip: 'skip' };
  const KIND_GUIDE = `[KINDS] For each Sn, pick its kind: ${Object.entries(FACT_KINDS).map(([k, d]) => `${k} = ${d}`).join('; ')}.`;
  const WORTH_SHORT = ['nothing', 'minor', 'useful', 'key'];
  const WORTH_GUIDE = '[WORTH] For each Wn, score how worth recalling Sn is in a later scene: 0 nothing to recall (a reaction, exclamation, greeting, filler, or interface text that is not the story itself: a status window or stat sheet, a to-do list, a menu of choices or suggested next actions for the user (often numbered or starting with an emoji), a dice roll, a chapter title or header line); 1 minor detail; 2 useful (who did what, a name, a feeling, a change); 3 key (an important event, fact, promise, or secret). If a line mixes interface text with a real story sentence, judge only the story part.';
  const WORTH_DROP = 0.6, WORTH_LOW = 1.5;   // 이보다 낮으면 버림 / 꺼낼 때 조금 뒤로
  const worthOf = (f) => f.w ?? 3;            // 예전에 저장한 건 점수가 없다 → 보통 취급
  const ROLE_GUIDE = '[ROLES] For each "Sn «word»", pick the role of that word in Sn: who = the doer; with = who does it together with them; whom = the target, or the one something is kept from; when; where; what = the action or the thing itself; how = manner or means; why = reason or purpose; none = filler, ending, or connective.';
  const MAX_FACT_SENTS = 120;  // 메시지 하나에서 기억으로 만들 문장 수 (긴 답장도 끝까지)
  const OLD_FACT_SENTS = 24;    // 예전 상한. v 표시가 없는 메시지는 여기까지만 만들어져 있다
  const FACT_V = 2;
  const isOldList = (list) => !list?.some(e => e.v >= FACT_V);
  // 상태창 모양 줄: [Status | Date: … | Money: …] · [Own Monster 1 | Name: … | Level: …] · |TODO: …|
  //  조각으로 나눌 때 줄이 공백으로 이어지므로 "[…|…|…] […|…|…]"처럼 여러 개가 붙은 것도 상태창 한 줄로 본다
  const STATUS_GROUP = /\[[^\]\n]*\|[^\]\n]*\|[^\]\n]*\]/g;
  const STATUS_LINE = /^\s*(?:\[[^\]\n]*\|[^\]\n]*\|[^\]\n]*\]\s*)+$|^\s*\|[^\n]*\|\s*$/;
  const isStatusLine = (t) => settings.skipStatus !== false && STATUS_LINE.test(String(t ?? ''));
  /** 원문 조각에서 상태창 줄을 뺀 것 (남는 게 없으면 null) */
  function cleanChunk(c) {
    if (!c || settings.skipStatus === false) return c;
    const text = String(c.text).replace(STATUS_GROUP, ' ').split('\n').filter(l => !STATUS_LINE.test(l)).join('\n').replace(/[ \t]{2,}/g, ' ').trim();
    return text.replace(/[^\p{L}\p{N}]/gu, '').length >= 8 ? (text === c.text ? c : { ...c, text }) : null;
  }
  const FACT_PER_CALL = 40;    // Jev 한 번에 보여 줄 문장 수
  let factStore = new Map();   // 메시지 지문 → [{ pos, si, k, s: [8칸], vec, p }]  (빈 배열 = 정리했지만 남길 게 없음)
  let factDirty = new Set();
  let factTimer = null;
  let facts = [];              // 실행 중 목록: { id, mi, key, pos, si, k, slots, line, sent, vec, grams }
  const factShardKey = (key, s) => `${KEY}${key}~f${s}`;

  async function loadFacts(key) {
    factStore = new Map();
    factDirty = new Set();
    if (!localStore) return;
    const parts = await Promise.all(Array.from({ length: SHARDS }, (_, s) => Promise.resolve().then(() => localStore.getItem(factShardKey(key, s))).catch(() => null)));
    for (const part of parts) if (part && typeof part === 'object') for (const [k, v] of Object.entries(part)) if (Array.isArray(v)) factStore.set(k, v);
  }
  function saveFacts() {
    if (!localStore || factTimer) return;
    factTimer = setTimeout(() => { factTimer = null; void flushFacts(); }, SAVE_DELAY);
  }
  function flushFacts() {
    clearTimeout(factTimer);
    factTimer = null;
    if (!localStore || !chatKey || !factDirty.size) return saveChain;
    const key = chatKey;
    const data = [...factDirty].map(s => { const obj = {}; for (const [k, v] of factStore) if (shardOf(k) === s) obj[k] = v; return [s, obj]; });
    factDirty = new Set();
    saveChain = saveChain.catch(() => {}).then(async () => { for (const [s, obj] of data) await localStore.setItem(factShardKey(key, s), obj); }).catch(error => setError('칸 줄 저장', error));
    return saveChain;
  }
  async function clearFacts() {
    factStore = new Map();
    factDirty = new Set(Array.from({ length: SHARDS }, (_, s) => s));
    rebuildFacts();
    await flushFacts();
  }

  /** 칸 줄: E/누가/누구랑/누구에게/언제/어디서/무엇을/어떻게/왜, 빈 칸은 X, 끝쪽 빈 칸은 생략 */
  function factLine(k, slots) {
    const s = slots.map(x => x || 'X');
    while (s.length && s[s.length - 1] === 'X') s.pop();
    return `${FACT_K[k] ?? 'F'}/${s.join('/')}`;
  }
  const factEmbedText = (f) => `${FACT_KO[f.k] ?? ''} ${(f.slots ?? f.s).filter(Boolean).join(' ')}`.trim();
  function sentencesOfChunk(c) { return sentencesOf(stripStatus(c.text)).slice(0, MAX_FACT_SENTS); }

  /** 저장된 칸 줄을 지금 채팅 순서에 맞게 펼친다 (조각을 다시 만들 때마다) */
  function rebuildFacts() {
    const prof = embedProfile();
    facts = [];
    for (let mi = 0; mi < timeline.length; mi++) {
      const list = factStore.get(timeline[mi].key);
      if (!list?.length) continue;
      const ids = msgChunkIds(mi);
      for (const f of list) {
        if (f.pos < 0) continue;
        const c = chunks[ids[f.pos]];
        const sent = c ? (sentencesOfChunk(c)[f.si] ?? '') : '';
        if (isStatusLine(sent)) continue;
        facts.push({ id: facts.length, mi, key: timeline[mi].key, pos: f.pos, si: f.si, k: f.k, slots: f.s, line: factLine(f.k, f.s), sent: sent || f.s.filter(Boolean).join(' '), text: sent || f.s.filter(Boolean).join(' '), upd: !!f.u, w: f.w ?? 3, untagged: f.t === 0, vec: f.vec && f.p === prof ? unpackSigns(f.vec, VEC_BITS) : null, grams: gramsOf(sent || f.s.join(' ')) });
      }
    }
  }
  const factsOfMessage = (mi) => facts.filter(f => f.mi === mi);
  const factsOfChunk = (c) => facts.filter(f => f.mi === c.mi && f.pos === c.pos);
  /** 아직 칸 줄을 안 만든 메시지 (Risu가 보낸 것은 빼고) */
  function factBacklog() {
    const upto = sentUpto();
    const out = [];
    for (let mi = 0; mi < upto; mi++) { const list = factStore.get(timeline[mi].key); if (!list || (isOldList(list) && keepableCount(mi) > OLD_FACT_SENTS)) out.push(mi); }
    return out;
  }

  // ── 규칙으로 정하는 칸 (Jev에게 안 묻는다) ──
  const TIME_WORD = /^(오늘|내일|어제|모레|그저께|지금|방금|아까|아침|점심|저녁|밤|새벽|낮|오전|오후|어젯밤|오늘밤|그날|그때|다음|지난|이번|주말|평일|매일|곧|나중)|\d+\s*(시|분|초|일|월|년|주|살)|요일|^(봄|여름|가을|겨울)/u;
  const END_WORD = /^(있었다|있다|있었어|했다|한다|였다|이었다|이다|됐다|되었다|같았다|것이다|거야|거든|있어|했어|해|요|다)[.!?…~"”']*$/u;
  const LINK_WORD = /^(그리고|그러나|하지만|그래서|그런데|그러자|그러니까|사실|사실은|역시|아마|정말|진짜|그냥|그때|또|및|혹은|또는)$/u;
  function ruleRole(w) {
    const bare = w.replace(/[.,!?…~"“”'‘’()]/g, '');
    if (!bare) return 'none';
    if (LINK_WORD.test(bare) || END_WORD.test(w)) return 'none';
    const hasName = peopleIn(bare).length > 0;
    if (hasName) {
      if (/(은|는|이|가|께서)$/.test(bare)) return 'who';
      if (/(랑|이랑|와|과|하고)$/.test(bare)) return 'with';
      if (/(에게|에게는|에게도|한테|한테는|께|을|를|몰래)$/.test(bare)) return 'whom';
    }
    if (TIME_WORD.test(bare) || /(무렵|동안|직후|직전|전에|후에|뒤에|때|때는|때마다)$/.test(bare)) return 'when';
    if (/(에서|에서는|에서도|에선|까지|으로부터|로부터)$/.test(bare) && bare.length > 2) return 'where';
    if (/(때문에|위해|위해서|위하여|탓에|덕분에|려고|으려고)$/.test(bare) && bare.length > 2) return 'why';
    if (/(히|하게|스럽게|롭게|없이|으로써|로써)$/.test(bare) && bare.length > 2 && !/에게$/.test(bare)) return 'how';
    if (/^(했다|했어|했지|했고|한다|하였다|있었다|있다|있어|었다|였다|이었다|이다|이야|거야|거든|같았다|보였다|된다|됐다|되었다|않았다|않는다|못했다|없었다|없다|말했다|물었다|답했다|대답했다)[.!?…"”']*$/u.test(w)) return 'none';
    return null;
  }
  /** Jev가 "none"이라 해도 이름 · 숫자가 든 단어는 버리지 않는다 (기억에서 빠지면 안 되는 것) */
  const mustKeep = (w) => /\d/.test(w) || peopleIn(w).length > 0;

  /**
   * 메시지 몇 개를 칸 줄로 만든다 (보낸 뒤 뒤에서). Jev 한 번에 문장 40개까지.
   * 결과는 메시지 지문별로 저장. 남길 게 없는 메시지도 빈 배열로 남겨 다시 하지 않는다.
   */
  /** 기억으로 만들 수 있는 문장 수 (너무 짧은 것 · 질문은 빼고) */
  const keepCache = new Map();   // 메시지 지문 → 수 (글이 같으면 같다)
  function keepableCount(mi) {
    const key = timeline[mi].key;
    if (keepCache.has(key)) return keepCache.get(key);
    let n = 0;
    msgChunkIds(mi).forEach(id => sentencesOfChunk(chunks[id]).forEach(s => { const clean = unquote(s); if (clean.replace(/[\s\p{P}]/gu, '').length >= 4 && !/[?？]\s*$/u.test(clean)) n++; }));
    if (keepCache.size > 5000) keepCache.clear();
    keepCache.set(key, n);
    return n;
  }
  async function factMessages(mis) {
    if (!mis.length) return 0;
    const room = chatKey;
    const keyOf = new Map(mis.map(mi => [mi, timeline[mi].key]));
    const jobs = [];   // { mi, pos, si, s, words, roles(rule) }
    const oldDone = new Map(mis.map(mi => { const l = factStore.get(timeline[mi].key); return [mi, l && isOldList(l) ? OLD_FACT_SENTS : 0]; }));
    for (const mi of mis) {
      let n = 0, seen = 0;
      msgChunkIds(mi).forEach((id, pos) => sentencesOfChunk(chunks[id]).forEach((s, si) => {
        if (n >= MAX_FACT_SENTS) return;
        const clean = unquote(s);
        if (clean.replace(/[\s\p{P}]/gu, '').length < 4) return;   // "응.", "…" 같은 건 바로 건너뜀
        if (/[?？]\s*$/u.test(clean)) return;                         // 질문은 기억이 아니다 (비슷한 질문이 후보 자리를 뺏는다)
        if (seen++ < oldDone.get(mi)) { n++; return; }
        if (isStatusLine(clean)) return;                              // 상태창 줄은 기억이 아니다               // 예전에 이미 만든 앞부분
        const words = clean.split(/\s+/).filter(Boolean).slice(0, 24);
        jobs.push({ mi, pos, si, s: clean, words, rule: words.map(ruleRole) });
        n++;
      }));
    }
    const made = new Map(mis.map(mi => [mi, []]));
    for (let i = 0; i < jobs.length; i += FACT_PER_CALL) {
      const part = jobs.slice(i, i + FACT_PER_CALL);
      const state = part.map((j, n) => `S${n}: ${j.s}`).join('\n');
      const state1 = `${KIND_GUIDE}\n${WORTH_GUIDE}\n${state}`;
      // ① 종류만
      const q1 = {};
      part.forEach((j, n) => { q1[`f${n}`] = { type: 'choice', instructions: `S${n}`, criteria: KIND_SHORT }; q1[`m${n}`] = { type: 'score', instructions: `W${n}`, criteria: WORTH_SHORT }; });
      let a = {};
      try { a = await callJev(state1, q1); } catch (error) { setError('기억 만들기', error); return 0; }
      if (chatKey !== room) return 0;
      part.forEach((j, n) => {
        j.kind = topChoice(a[`f${n}`])[0];
        j.w = a[`m${n}`] ? Math.round(rankScore(a[`m${n}`]) * 10) / 10 : 3;
        if (j.w < WORTH_DROP) j.kind = 'skip';                       // 꺼낼 일 없음 → 버림
        else if (j.kind === 'skip' && j.w >= WORTH_LOW) j.kind = 'fact'; // 잡담처럼 보여도 꺼낼 만하면 살림
      });
      // 단어 칸은 여기서 묻지 않는다 (규칙으로 정해지는 것만). 나머지는 그 기억이 쓰일 때 뒤에서 (tagLater)
      part.forEach((j, n) => {
        const kind = j.kind;
        if (!FACT_K[kind]) return;   // 건너뜀
        const slots = { who: [], with: [], whom: [], when: [], where: [], what: [], how: [], why: [] };
        j.words.forEach((w, k) => {
          let r = j.rule[k];
          if (!slots[r]) r = mustKeep(w) ? 'what' : null;
          if (r) slots[r].push(w.replace(/[.!?…]+$/u, ''));
        });
        const clock = storyClock(j.mi + 1);
        if (!slots.when.length && (clock.d || clock.t)) slots.when.push(clockLabel({ d: clock.d, t: clock.t }));
        if (!slots.where.length && clock.place) slots.where.push(clock.place);
        const s = ROLE_ORDER.map(r => slots[r].join(' '));
        made.get(j.mi).push({ v: FACT_V, pos: j.pos, si: j.si, k: kind, s, ...(j.w < 3 ? { w: j.w } : {}), ...(UPDATE_CUE.test(j.s) ? { u: 1 } : {}), ...(TAG_KINDS.has(kind) ? { t: 0 } : {}), _sent: j.s });
      });
    }
    // 칸 줄 임베딩 (찾기 열쇠)
    const all = [...made.values()].flat();
    if (all.length) {
      try {
        const vecs = await embedTexts(all.map(f => f._sent ?? factEmbedText(f)), `기억 임베딩 (${all.length}개)`);
        if (chatKey !== room) return 0;
        const prof = embedProfile();
        all.forEach((f, i) => { f.vec = packSigns(toSigns(vecs[i])); f.p = prof; });
        all.forEach(f => { delete f._sent; });
      } catch (error) { setError('칸 줄 임베딩', error); }
    }
    for (const [mi, list] of made) { const k = keyOf.get(mi); const prev = oldDone.get(mi) ? (factStore.get(k) ?? []) : []; const all = [...prev, ...list]; factStore.set(k, all.some(e => e.v >= FACT_V) ? all : [...all, { v: FACT_V, pos: -1, si: -1, k: 'none', s: [] }]); factDirty.add(shardOf(k)); }
    rebuildFacts();
    saveFacts();
    return mis.length;
  }

  // ── 칸 나누기는 필요할 때만 (보낸 뒤 뒤에서) ──
  //  ① 답장에 실제로 들어간 사건 · 행동 · 약속 · 비밀 문장  ② 화면 "최근 일어난 일"에 보일 최근 것 몇 개
  //  대부분의 문장은 한 번도 꺼내지지 않으니, 저장할 때 전부 나누는 것보다 훨씬 싸다
  const tagWanted = new Set();   // "메시지 지문|조각|문장" 열쇠
  const factKey = (f) => `${f.key}|${f.pos}|${f.si}`;
  function wantTags(list) { for (const f of list) if (f?.untagged) tagWanted.add(factKey(f)); }
  function tagBacklog(max = 12) {
    const out = [];
    const byKey = new Map(facts.map(f => [factKey(f), f]));
    for (const k of tagWanted) { const f = byKey.get(k); if (f?.untagged) out.push(f); else tagWanted.delete(k); if (out.length >= max) return out; }
    for (let i = facts.length - 1; i >= 0 && out.length < max; i--) { const f = facts[i]; if (f.untagged && (f.k === 'event' || f.k === 'action') && !out.includes(f)) { out.push(f); if (out.length >= 6) break; } }
    return out;
  }
  async function tagLater(list) {
    if (!list.length) return 0;
    const room = chatKey;
    const jobs = list.map(f => { const s = unquote(f.sent); const words = s.split(/\s+/).filter(Boolean).slice(0, 24); return { f, s, words, rule: words.map(ruleRole) }; });
    const state = `${ROLE_GUIDE}\n${jobs.map((j, n) => `S${n}: ${j.s}`).join('\n')}`;
    const q = {};
    jobs.forEach((j, n) => j.words.forEach((w, k) => { if (j.rule[k] == null) q[`g${n}_${k}`] = { type: 'choice', instructions: `S${n} «${w}»`, criteria: SLOT_ROLES }; }));
    let a = {};
    if (Object.keys(q).length) {
      try { a = await callJev(state, q); } catch (error) { setError('칸 나누기', error); return 0; }
      if (chatKey !== room) return 0;
    }
    for (const [n, j] of jobs.entries()) {
      const slots = { who: [], with: [], whom: [], when: [], where: [], what: [], how: [], why: [] };
      j.words.forEach((w, k) => {
        let r = j.rule[k] ?? topChoice(a[`g${n}_${k}`])[0];
        if (!slots[r]) r = mustKeep(w) ? 'what' : null;
        if (r) slots[r].push(w.replace(/[.!?…]+$/u, ''));
      });
      const old = j.f.slots;
      if (!slots.when.length && old[3]) slots.when.push(old[3]);
      if (!slots.where.length && old[4]) slots.where.push(old[4]);
      const entry = factStore.get(j.f.key)?.find(x => x.pos === j.f.pos && x.si === j.f.si);
      if (entry) { entry.s = ROLE_ORDER.map(r => slots[r].join(' ')); delete entry.t; factDirty.add(shardOf(j.f.key)); }
      tagWanted.delete(factKey(j.f));
    }
    rebuildFacts();
    saveFacts();
    return jobs.length;
  }

  // ── 찾기: 칸 줄 지문 + 글자 겹침을 RRF로 ──
  function retrieveFacts(qvecs, query, exclude, k, limitMi) {
    const pool = facts.filter(f => f.mi < limitMi && !exclude.has(f.id));
    const sem = qvecs.length ? pool.filter(f => f.vec).map(f => { let s = -Infinity; qvecs.forEach((q, i) => { const v = simSigns(q, f.vec) * (i === 0 ? 1 : 0.85); if (v > s) s = v; }); return [f.id, s]; }).sort((a, b) => b[1] - a[1]) : [];
    const qg = gramsOf(query);
    const lex = pool.map(f => { let hit = 0; for (const g of qg) if (f.grams.has(g)) hit++; return [f.id, hit / Math.sqrt(1 + f.grams.size / 30)]; }).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
    const rrf = new Map();
    sem.slice(0, 100).forEach(([id], r) => rrf.set(id, (rrf.get(id) ?? 0) + 1 / (60 + r)));
    lex.slice(0, 100).forEach(([id], r) => rrf.set(id, (rrf.get(id) ?? 0) + 1 / (60 + r)));
    return [...rrf].sort((a, b) => b[1] - a[1]).slice(0, k).map(([id]) => facts[id]);
  }
  /**
   * 책 단위로 꺼내기: 문장 점수로 비슷한 메시지(책)를 고르고, 그 책의 문장을 전부 후보로 (제목 줄 때문에 뽑혀도 정답 줄이 같이 Jev 앞에)
   *  wantUpd: 질문이 "지금 · 현재 · 아직"을 물으면 바뀜 표시가 있는 책을 먼저
   */
  function retrieveBooks(qvecs, query, exclude, nMsg, cap, limitMi, wantUpd = false, names = []) {
    const newest = new Map();
    for (const f of facts) if (f.mi < limitMi && (newest.get(f.sent) ?? -1) < f.mi) newest.set(f.sent, f.mi);
    const pool = facts.filter(f => f.mi < limitMi && newest.get(f.sent) === f.mi);
    if (!pool.length) return [];
    // 뜻 갈래: 검색어마다 따로 순위 (첫 번째 = 내 메시지가 조금 더 무겁다). 한 덩어리로 섞으면 여러 이야기가 든 장면에서 다 애매해진다
    const semLists = qvecs.map((q, qi) => [qi === 0 ? 1 : 0.8, pool.filter(f => f.vec).map(f => [f.id, simSigns(q, f.vec)]).sort((x, y) => y[1] - x[1]).slice(0, 120)]);
    // 이름 갈래: 지금 장면에 나온 인물마다 그 사람이 나온 옛 문장 1개만 (꺼낼 만한 것 · 최근 것), 최대 3명.
    //  많이 넣으면 그 인물 이야기가 후보를 독차지한다 (V7에서 한 문제 놓침)
    const nameList = [];
    for (const n of names.slice(0, 3)) {
      const forms = nameForms(story.people[n] ?? { name: n, aliases: [] }).filter(x => x.length >= 2);
      const best = pool.filter(f => forms.some(x => f.sent.includes(x)) && !nameList.includes(f)).sort((x, y) => (y.w ?? 3) - (x.w ?? 3) || y.mi - x.mi)[0];
      if (best) nameList.push(best);
    }
    const qg = gramsOf(query);
    const lex = pool.map(f => { let hit = 0; for (const g of qg) if (f.grams.has(g)) hit++; return [f.id, hit / Math.sqrt(1 + f.grams.size / 30)]; }).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
    const fs = new Map();
    for (const [wt, list] of semLists) list.forEach(([id], r) => fs.set(id, (fs.get(id) ?? 0) + wt / (60 + r)));
    nameList.forEach((f, r) => fs.set(f.id, (fs.get(f.id) ?? 0) + 0.6 / (60 + r)));
    lex.slice(0, 200).forEach(([id], r) => fs.set(id, (fs.get(id) ?? 0) + 1 / (60 + r)));
    for (const [id, sc] of fs) if (worthOf(facts[id]) < WORTH_LOW) fs.set(id, sc * 0.85);
    const books = new Map();
    for (const [id, sc] of fs) { const f = facts[id]; const b = books.get(f.mi) ?? { mi: f.mi, score: 0, upd: false }; b.score = Math.max(b.score, sc); books.set(f.mi, b); }
    for (const b of books.values()) { b.upd = factsOfMessage(b.mi).some(f => f.upd); if (wantUpd && b.upd) b.score *= 1.3; }
    const picked = [...books.values()].filter(b => !exclude.has(b.mi)).sort((a, b) => b.score - a.score).slice(0, nMsg);
    const out = [];
    for (const b of picked) {
      // 같은 문장이 더 최근 메시지에도 있으면 이 메시지에서는 빼고 (딸려 들어와 자리를 먹지 않게)
      const lines = factsOfMessage(b.mi).filter(f => newest.get(f.sent) === f.mi);
      const keep = lines.length <= 12 ? lines : lines.slice().sort((x, y) => (fs.get(y.id) ?? 0) - (fs.get(x.id) ?? 0)).slice(0, 12).sort((x, y) => x.id - y.id);
      for (const f of keep) { if (out.length >= cap) break; out.push(f); }
      if (out.length >= cap) break;
    }
    out.books = picked.map(b => b.mi);
    return out;
  }
  async function searchFacts(query, k = 40) {
    if (!query.trim() || !facts.length) return [];
    let qv = [];
    try { qv = await queryVecs([memText(query).slice(0, 2000)]); } catch { }
    return retrieveFacts(qv, query, new Set(), k, timeline.length);
  }

  function inject(messages, block) {
    const out = messages.map(m => ({ ...m }));
    let placed = false;
    for (const m of out) if (typeof m.content === 'string' && m.content.search(PLACEHOLDER) >= 0) m.content = m.content.replace(PLACEHOLDER, () => (placed ? '' : (placed = true, block)));
    if (placed || !block) return out;
    let last = -1;
    for (let i = out.length - 1; i >= 0; i--) if (out[i].removable === true && (out[i].role === 'user' || out[i].role === 'assistant')) { last = i; break; }
    if (settings.injectMode === 'last_user' && last >= 0 && out[last].role === 'user' && typeof out[last].content === 'string') out[last].content = `${block}\n\n${out[last].content}`;
    else if (last >= 0) out.splice(last, 0, { role: 'system', content: block });
    else out.push({ role: 'system', content: block });
    return out;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  훅
  // ══════════════════════════════════════════════════════════════════════

  async function beforeRequestHandler(messages, type) {
    if ((type !== 'model' && type !== 'main') || busy) return messages;
    busy = true;
    let tr = null;
    try {
      if (!ready() || !await ensureChat()) return messages;
      tr = beginTrace('send');
      startSendUsage();
      const entries = chatEntries(messages);
      if (!entries.length) return messages;
      syncWindow(entries);
      lastWindowLen = entries.length;
      const head = timeline[timeline.length - entries.length]?.key ?? null;
      if (head !== windowHead) { windowHead = head; try { void Promise.resolve(localStore?.setItem(WINHEAD_KEY(chatKey), head)).catch(() => {}); } catch { } }
      // 기억(칸 줄)은 보낸 뒤 뒤에서 만든다. 여기서는 찾아 넣기만
      const r = await recall(entries, tr);
      const tokens = r.block ? estimateTokens(r.block) : 0;
      tr.note = `넣은 기억 ~${tokens}토큰`;
      lastRecall = { at: Date.now(), tokens, block: r.block, ...r.trace, picked: r.picked.length, window: entries.length };
      return inject(messages, r.block);
    } catch (error) {
      setError('요청 처리', error);
      if (tr) tr.note = `오류: ${String(error?.message ?? error).slice(0, 80)}`;
      return messages;
    } finally {
      busy = false;
      endTrace(tr);
      // 이야기 정리는 보낸 직후 뒤에서 (기다리지 않음). 답장 뒤에는 아무것도 안 한다
      if (tr && ready() && chatKey) setTimeout(queueStory, 0);
    }
  }

  // 답장이 와도 할 일이 없다 (저장은 보낼 때, 빠진 것만)
  async function afterRequestHandler(content) { return content; }

  /** 지금 전부 색인: Risu가 안 보낸 메시지 전부 (보낸 적 없어도 채팅에 있는 것은 전부) */
  let processing = null;
  function indexAll(onProgress) {
    if (processing) return Promise.reject(Object.assign(new Error('이미 색인 중이에요.'), { code: 'BUSY' }));
    const run = processing = (async () => {
      if (!await ensureChat()) throw new Error('채팅방을 먼저 열어 주세요.');
      while (job && job !== run) await job.catch(() => {});
      job = run;
      const tr = beginTrace('index');
      try {
        const upto = sentUpto();
        const todo = unindexed(upto);
        let done = 0;
        await timed(tr, '지금 전부 색인', async () => {
          for (let i = 0; i < todo.length; i += 50) { await indexMessages(todo.slice(i, i + 50)); done = Math.min(todo.length, i + 50); onProgress?.(done, todo.length); }
        }, () => `메시지 ${done}/${todo.length}개`);
        await flushVectors();
        return todo.length;
      } finally { endTrace(tr); }
    })().finally(() => { if (job === run) job = null; processing = null; });
    return run;
  }

  /** 채팅을 새로 읽는다 (화면을 열 때 · 도구). 다른 채팅으로 바뀌었을 수도 있으니. */
  async function refreshChat() {
    identityCache = null;
    const id = await readChatIdentity();
    if (!id) return false;
    // 다른 채팅이면 처음부터 연다. 방금 읽은 신원 캐시에는 채팅 본문이 없어서 지워야 원본을 다시 읽는다
    if (id.key !== chatKey) { chatKey = ''; identityCache = null; return ensureChat(); }
    chatLabel = { char: id.char, chat: id.chat };
    const fresh = rawTimeline(id.chatObj);
    if (fresh.length && (fresh.length !== timeline.length || fresh.some((m, i) => m.key !== timeline[i]?.key))) { timeline = fresh; rebuildChunks(); }
    return true;
  }

  function storageStats() {
    let vecs = 0, bytes = 0;
    for (const v of vecStore.values()) { vecs += v.n; bytes += v.b64.reduce((a, s) => a + s.length, 0) + 40; }
    const upto = sentUpto();
    let factN = 0;
    for (const v of factStore.values()) { factN += v.length; bytes += v.reduce((a, f) => a + (f.vec?.length ?? 0) + f.s.join('').length * 2 + 24, 0); }
    const people = personList().filter(p => !p.hidden && p.count > 0).length;
    const fb = factBacklog();
    const left = new Set([...fb, ...(settings.story ? storyBacklog() : [])]).size;
    return { messages: timeline.length, chunks: chunks.length, indexedMsgs: upto - fb.length, sendable: upto, vecs: factN, facts: factN, kb: Math.round(bytes / 1024), people, threads: openThreads().length, secrets: openSecrets().length, cards: factN, storyLeft: left };
  }


  // ══════════════════════════════════════════════════════════════════════
  //  화면
  // ══════════════════════════════════════════════════════════════════════
  //
  // 원칙: 첫 화면은 "지금". 설정은 맨 끝. 폰은 아래 탭 + 아래에서 올라오는 시트, PC는 왼쪽 메뉴 + 오른쪽 서랍.
  // 다크 전용. 색은 뜻이 있을 때만: 분홍=가까움, 파랑=멀어짐, 금색=약속, 보라=선택·강조.

  const ui = {
    open: false, view: 'now', sheet: null, progress: '', test: {}, bound: false, draft: null, onboard: null, saved: '',
    graph: { x: 0, y: 0, k: 1 }, layout: null, layoutSig: '', search: { q: '', results: null, busy: false, pins: false }, cards: { pack: null, q: '', edit: null, newPack: false, packEdit: false }, mem: { group: 'date', folder: null, kind: 'all', role: 'all', sort: 'new', limit: 30 },
    threads: 'open', keepOpen: new Map(), saveTimer: null, peopleQ: '',
  };

  const CSS = `
:root{
  --bg:#0a0c11;--bg2:#0d1016;--s1:#12151d;--s2:#171b25;--s3:#1e2330;--line:#232938;--line2:#2e3547;
  --tx:#e8ebf2;--tx2:#a3aabb;--tx3:#6c7488;
  --ac:#8c9eff;--ac2:#6d82f5;--acbg:rgba(140,158,255,.13);--acln:rgba(140,158,255,.38);
  --warm:#ff86b0;--cold:#6cb4ff;--gold:#f4b860;--ok:#4cd0a0;--bad:#ff6b7b;
  --r:16px;--r2:12px;--r3:999px;--sh:0 10px 40px rgba(0,0,0,.45);
  --safe:env(safe-area-inset-bottom,0px);
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;height:100%;background:var(--bg);color:var(--tx);font:15px/1.55 'Pretendard','Pretendard Variable',-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Segoe UI','Noto Sans KR','Malgun Gothic',sans-serif;-webkit-font-smoothing:antialiased}
button,input,select,textarea{font:inherit;color:inherit}
button{cursor:pointer}
a{color:var(--ac)}
:focus-visible{outline:2px solid var(--ac);outline-offset:2px;border-radius:8px}
::selection{background:var(--acbg)}
.app{display:grid;grid-template-columns:1fr;height:100vh;height:100dvh;overflow:hidden}
.rail{display:none}
.main{display:flex;flex-direction:column;min-width:0;height:100%;overflow:hidden}
.top{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line);background:rgba(10,12,17,.85);backdrop-filter:blur(10px);position:relative;z-index:2}
.top h1{font-size:17px;margin:0;font-weight:700;letter-spacing:-.01em;white-space:nowrap}
.top .sub{flex:1;min-width:0;color:var(--tx3);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.iconbtn{display:inline-grid;place-items:center;width:40px;height:40px;border-radius:12px;border:1px solid transparent;background:transparent;color:var(--tx2)}
.iconbtn:hover{background:var(--s2);color:var(--tx)}
.scroll{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:16px 16px calc(96px + var(--safe))}
.wrap{max-width:1080px;margin:0 auto;display:flex;flex-direction:column;gap:14px}
.tabbar{position:fixed;left:0;right:0;bottom:0;z-index:5;display:grid;grid-template-columns:repeat(6,1fr);padding:6px 6px calc(6px + var(--safe));background:rgba(13,16,22,.92);backdrop-filter:blur(14px);border-top:1px solid var(--line)}
.tab{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 0;border:0;background:none;color:var(--tx3);font-size:11px;border-radius:12px;min-height:52px;justify-content:center;position:relative}
.tab.on{color:var(--tx)}
.tab.on svg{color:var(--ac)}
.tab .dot{position:absolute;top:6px;right:calc(50% - 16px);width:7px;height:7px;border-radius:50%;background:var(--gold)}
@media (min-width:900px){
  .app{grid-template-columns:232px 1fr}
  .rail{display:flex;flex-direction:column;gap:4px;padding:18px 12px;border-right:1px solid var(--line);background:var(--bg2)}
  .tabbar{display:none}
  .scroll{padding:24px 28px 40px}
  .brand{display:flex;align-items:center;gap:10px;padding:4px 10px 18px;font-weight:800;letter-spacing:-.02em;font-size:17px}
  .brand .logo{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;background:var(--bg3,#1b2130);font-size:17px}
  .log{padding:16px 18px}
  .log + .log{margin-top:12px}
  .log h3{margin:0;font-size:16px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .log h3 .xs{font-weight:400}
  .log ul{margin:10px 0 0;padding-left:18px;line-height:1.65}
  .log li + li{margin-top:2px}
  .navi{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;border:0;background:none;color:var(--tx2);text-align:left;font-size:14.5px;position:relative}
  .navi:hover{background:var(--s1);color:var(--tx)}
  .navi.on{background:var(--acbg);color:var(--tx)}
  .navi.on svg{color:var(--ac)}
  .navi .cnt{margin-left:auto;font-size:12px;color:var(--tx3)}
  .rail .grow{flex:1}
  .railstat{padding:12px;border:1px solid var(--line);border-radius:var(--r2);font-size:12.5px;color:var(--tx2);background:var(--s1)}
}
.card{background:var(--s1);border:1px solid var(--line);border-radius:var(--r);padding:16px}
.card.flat{background:transparent;border-style:dashed}
.ch{display:flex;align-items:center;gap:8px;margin:-2px 0 12px}
.ch h2{font-size:15px;margin:0;font-weight:700;letter-spacing:-.01em;white-space:nowrap}
.ch .meta{color:var(--tx3);font-size:12.5px;text-align:right}
.ch .sp{flex:1}
.eyebrow{font-size:12px;letter-spacing:.06em;color:var(--tx3);font-weight:600;text-transform:uppercase}
.muted{color:var(--tx2)}
.dim{color:var(--tx3)}
.small{font-size:13px}
.xs{font-size:12px}
.row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.col{display:flex;flex-direction:column;gap:8px}
.grid2{display:grid;grid-template-columns:1fr;gap:14px}
@media (min-width:760px){.grid2{grid-template-columns:1fr 1fr}}
.hero{padding:20px 18px;border-radius:20px;border:1px solid var(--line);background:radial-gradient(120% 140% at 0% 0%,rgba(140,158,255,.16),transparent 55%),radial-gradient(90% 120% at 100% 0%,rgba(255,134,176,.10),transparent 55%),var(--s1)}
.hero h1{font-size:22px;line-height:1.3;margin:6px 0 4px;letter-spacing:-.02em}
.hero .place{color:var(--tx2);font-size:14px}
.cast{display:flex;gap:10px;margin-top:14px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}
.cast::-webkit-scrollbar{display:none}
.castp{display:flex;flex-direction:column;align-items:center;gap:4px;border:0;background:none;padding:0;min-width:56px;color:var(--tx2);font-size:12px}
.av{--h:220;display:inline-grid;place-items:center;flex:none;width:44px;height:44px;border-radius:50%;background:hsl(var(--h) 45% 26%);color:hsl(var(--h) 90% 86%);font-weight:700;font-size:16px;border:1px solid hsl(var(--h) 45% 38%)}
.av.sm{width:30px;height:30px;font-size:12.5px}
.av.lg{width:64px;height:64px;font-size:24px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;padding:0 14px;border-radius:12px;border:1px solid var(--line2);background:var(--s2);color:var(--tx);font-size:14px;font-weight:600;white-space:nowrap}
.btn:hover{border-color:var(--acln)}
.btn.p{background:var(--ac);border-color:var(--ac);color:#0b0e1a}
.btn.p:hover{background:#a3b1ff}
.btn.g{background:transparent;border-color:transparent;color:var(--tx2)}
.btn.g:hover{background:var(--s2);color:var(--tx)}
.btn.d{color:var(--bad);border-color:rgba(255,107,123,.35);background:rgba(255,107,123,.06)}
.btn.sm{min-height:32px;padding:0 10px;font-size:13px;border-radius:10px}
.btn:disabled{opacity:.45;cursor:default}
.btn.block{width:100%}
.chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:var(--r3);background:var(--s2);border:1px solid var(--line);font-size:12.5px;color:var(--tx2);white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.chip.ac{background:var(--acbg);border-color:var(--acln);color:var(--tx)}
.chip.gold{background:rgba(244,184,96,.12);border-color:rgba(244,184,96,.35);color:#ffd9a0}
.chip.warm{background:rgba(255,134,176,.12);border-color:rgba(255,134,176,.35);color:#ffc2d8}
.slots{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
.slot{display:inline-flex;align-items:baseline;gap:5px;padding:3px 8px;border-radius:8px;background:var(--s2);border:1px solid var(--line);font-size:12.5px;color:var(--tx);font-weight:500}
.slot i{font-style:normal;font-size:10.5px;font-weight:700;color:var(--tx3)}
.slot.kind{font-size:11px;font-weight:800;padding:3px 7px;border-color:transparent}.slot.k-event{background:rgba(244,184,96,.16);color:#ffd9a0}.slot.k-action{background:rgba(140,158,255,.16);color:#c8d0ff}.slot.k-fact{background:rgba(76,208,160,.14);color:#a8f0d6}.slot.k-promise{background:rgba(244,184,96,.16);color:#ffd9a0}.slot.k-secret{background:rgba(180,140,255,.16);color:#dccbff}
.mem .slots{margin-top:2px}
.slot.r-who i{color:#8c9eff}.slot.r-whom i{color:#ff86b0}.slot.r-with i{color:#ffb38a}.slot.r-when i{color:#f4b860}.slot.r-where i{color:#4cd0a0}.slot.r-what i{color:#c6cbe0}.slot.r-how i{color:#6cb4ff}.slot.r-why i{color:#dccbff}
.chip.sec{background:rgba(180,140,255,.12);border-color:rgba(180,140,255,.35);color:#dccbff}
.spoil{filter:blur(6px);cursor:pointer;transition:filter .2s ease;border-radius:6px;user-select:none}
.spoil.show{filter:none;user-select:text}
.promise.secret{border-color:rgba(180,140,255,.28)}
.chip.cold{background:rgba(108,180,255,.12);border-color:rgba(108,180,255,.35);color:#bfe0ff}
.pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:var(--r3);font-size:12.5px;background:var(--s2);color:var(--tx2);border:1px solid var(--line)}
.pill i{width:8px;height:8px;border-radius:50%;background:var(--tx3);display:inline-block}
.pill.ok i{background:var(--ok)}.pill.warn i{background:var(--gold)}.pill.bad i{background:var(--bad)}
.alert{display:flex;gap:12px;align-items:center;padding:14px 16px;border-radius:var(--r);border:1px solid var(--line);background:var(--s1)}
.alert .ic{flex:none;width:36px;height:36px;border-radius:12px;display:grid;place-items:center;background:var(--s2)}
.alert.warn .ic{color:var(--gold);background:rgba(244,184,96,.12)}
.alert.bad .ic{color:var(--bad);background:rgba(255,107,123,.12)}
.alert.ac .ic{color:var(--ac);background:var(--acbg)}
.alert .t{flex:1;min-width:0}
.alert b{display:block;font-size:14.5px}
.alert .d{font-size:13px;color:var(--tx2);margin-top:2px}
@media (max-width:520px){.alert{flex-wrap:wrap}.alert .btn{width:100%}}
.film{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;padding:2px 2px 8px;margin:0 -4px;scrollbar-width:thin}
.mem{flex:none;width:min(280px,78vw);scroll-snap-align:start;text-align:left;border:1px solid var(--line);background:var(--s2);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:8px;color:var(--tx)}
.mem:hover{border-color:var(--acln)}
.mem .txt{font-size:13.5px;line-height:1.55;color:var(--tx2);display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}
@media (min-width:900px){.film{flex-wrap:wrap;overflow:visible;scroll-snap-type:none;margin:0}.film .mem{flex:1 1 240px;width:auto;max-width:calc(50% - 5px)}}
.mem .hd{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--tx3)}
.meter{height:5px;border-radius:5px;background:var(--s3);overflow:hidden;flex:1}
.meter i{display:block;height:100%;background:linear-gradient(90deg,var(--ac2),var(--ac));border-radius:5px}
.tag{font-size:11px;padding:1px 7px;border-radius:6px;background:var(--s3);color:var(--tx2)}
.tag.pin{background:rgba(244,184,96,.15);color:var(--gold)}
.tag.tail{background:rgba(76,208,160,.12);color:var(--ok)}
.list{display:flex;flex-direction:column}
.item{display:flex;align-items:center;gap:12px;padding:12px 4px;border-bottom:1px solid var(--line);background:none;border-left:0;border-right:0;border-top:0;text-align:left;width:100%;color:var(--tx)}
.item:last-child{border-bottom:0}
button.item:hover{background:rgba(255,255,255,.02)}
.item .t{flex:1;min-width:0}
.item .t b{display:block;font-size:14.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.item .t span{font-size:12.5px;color:var(--tx3)}
.promise{display:flex;gap:12px;padding:14px;border:1px solid var(--line);border-radius:14px;background:var(--s2);align-items:flex-start}
.promise .q{font-size:14.5px;line-height:1.5;margin:4px 0 6px}
.promise .who{font-size:12.5px;color:var(--gold);font-weight:600}
.promise .acts{display:flex;gap:6px;flex-direction:column}
.kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
@media (min-width:760px){.kpis{grid-template-columns:repeat(4,1fr)}}
.kpi{padding:14px;border-radius:14px;background:var(--s1);border:1px solid var(--line)}
.kpi b{display:block;font-size:22px;letter-spacing:-.02em}
.kpi span{font-size:12.5px;color:var(--tx3)}
.seg{display:flex;padding:4px;border-radius:14px;background:var(--bg2);border:1px solid var(--line);gap:4px}
.seg button{flex:1;min-height:38px;border:0;border-radius:10px;background:none;color:var(--tx2);font-weight:600;font-size:13.5px;padding:0 8px}
.seg button.on{background:var(--s3);color:var(--tx);box-shadow:0 1px 0 rgba(255,255,255,.04) inset}
.seg button small{display:block;font-weight:400;font-size:11px;color:var(--tx3)}
.field{display:flex;flex-direction:column;gap:6px;padding:12px 0;border-bottom:1px solid var(--line)}
.field:last-child{border-bottom:0}
.field label,.field .lb{font-weight:600;font-size:14px}
.field .help{font-size:12.5px;color:var(--tx3);line-height:1.5}
.field.inline{flex-direction:row;align-items:center;justify-content:space-between;gap:16px}
.field.inline>div:first-child{flex:1;min-width:0}
.inp,.sel,textarea.inp{width:100%;min-height:42px;padding:9px 12px;border-radius:12px;border:1px solid var(--line2);background:var(--bg2);color:var(--tx);outline:none}
.inp:focus,.sel:focus{border-color:var(--ac)}
textarea.inp{resize:vertical;min-height:70px;line-height:1.5}
.sw{position:relative;display:inline-block;width:48px;height:28px;flex:none}
.sw input{opacity:0;width:0;height:0;position:absolute}
.sw span{position:absolute;inset:0;border-radius:28px;background:var(--s3);border:1px solid var(--line2);transition:.18s}
.sw span::before{content:'';position:absolute;width:22px;height:22px;left:2px;top:2px;border-radius:50%;background:#cfd5e4;transition:.18s}
.sw input:checked+span{background:var(--ac);border-color:var(--ac)}
.sw input:checked+span::before{transform:translateX(20px);background:#0b0e1a}
.opts{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:6px}
.opt{text-align:left;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--bg2);display:flex;flex-direction:column;gap:3px;min-height:64px}
.opt b{font-size:14px;display:flex;align-items:center;gap:6px}
.opt span{font-size:12px;color:var(--tx3);line-height:1.4}
.opt.on{border-color:var(--ac);background:var(--acbg)}
.badge{font-size:10.5px;padding:1px 6px;border-radius:6px;background:var(--ac);color:#0b0e1a;font-weight:700}
.conn{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}
.conn:last-of-type{border-bottom:0}
.conn .t{flex:1;min-width:0}
.conn .t b{display:block;font-size:14.5px}
.conn .t span{font-size:12.5px;color:var(--tx3)}
details.more{border-top:1px solid var(--line);margin-top:8px;padding-top:4px}
details.more>summary{list-style:none;cursor:pointer;padding:10px 0;color:var(--tx2);font-size:13.5px;display:flex;align-items:center;gap:6px}
details.more>summary::-webkit-details-marker{display:none}
details.more>summary::before{content:'›';display:inline-block;transition:.15s;font-size:16px;color:var(--tx3)}
details.more[open]>summary::before{transform:rotate(90deg)}
.search{display:flex;align-items:center;gap:8px;padding:0 12px;border-radius:14px;border:1px solid var(--line2);background:var(--bg2)}
.search input{flex:1;border:0;background:none;outline:none;min-height:46px}
.search:focus-within{border-color:var(--ac)}
.snip{font-size:14px;line-height:1.6;color:var(--tx2);white-space:pre-wrap}
.snip mark{background:rgba(140,158,255,.25);color:var(--tx);border-radius:4px;padding:0 2px}
.empty{text-align:center;padding:28px 12px;color:var(--tx3)}
.empty .big{font-size:30px;margin-bottom:8px}
.empty b{display:block;color:var(--tx2);font-size:15px;margin-bottom:4px}
.graphcard{padding:0;overflow:hidden;position:relative}
.graphcard .ch{padding:14px 16px 0;margin:0}
svg.graph{display:block;width:100%;height:auto;max-height:72vh;touch-action:none;cursor:grab;user-select:none}
svg.graph:active{cursor:grabbing}
.graph .node circle{stroke-width:2}
.graph .node text{font-size:15px;font-weight:700;pointer-events:none}
.graph .node .lbl{font-size:14px;font-weight:600;fill:#c6cbe0}
.graph .node{cursor:pointer}
.legend{display:flex;gap:6px 12px;flex-wrap:wrap;align-items:center;padding:0 12px 12px 16px;font-size:12px;color:var(--tx3)}
.legend i{display:inline-block;width:18px;height:3px;border-radius:3px;vertical-align:middle;margin-right:5px}
.gtools{display:flex;gap:6px;margin-left:auto}
.gtools .iconbtn{background:rgba(23,27,37,.9);border-color:var(--line)}
.peoplegrid{display:grid;grid-template-columns:1fr;gap:14px}
@media (min-width:1100px){.peoplegrid{grid-template-columns:1.6fr 1fr}}
.relrow{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)}
.relrow:last-child{border-bottom:0}
.affbar{position:relative;height:8px;border-radius:8px;background:var(--s3);flex:1;min-width:80px}
.affbar i{position:absolute;top:0;bottom:0;border-radius:8px}
.affbar::after{content:'';position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:var(--line2)}
.step{display:flex;gap:6px;margin-bottom:14px}
.step i{flex:1;height:4px;border-radius:4px;background:var(--s3)}
.step i.on{background:var(--ac)}
.onb{max-width:640px;margin:0 auto;width:100%}
.onb h2{font-size:24px;letter-spacing:-.02em;margin:6px 0 6px}
.onb p.lead{color:var(--tx2);margin:0 0 18px}
.feat{display:flex;gap:12px;align-items:flex-start;padding:12px 0}
.feat .ic{flex:none;width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:var(--acbg);color:var(--ac)}
.sheetbg{position:fixed;inset:0;z-index:20;background:rgba(3,4,8,.55);display:flex;align-items:flex-end;justify-content:center;animation:fade .15s ease}
.sheet{width:100%;max-height:88vh;max-height:88dvh;overflow-y:auto;background:var(--s1);border:1px solid var(--line);border-radius:22px 22px 0 0;padding:8px 18px calc(22px + var(--safe));box-shadow:var(--sh);animation:up .2s ease}
.grab{width:42px;height:5px;border-radius:5px;background:var(--line2);margin:4px auto 10px}
@media (min-width:900px){
  .sheetbg{align-items:stretch;justify-content:flex-end}
  .sheet{width:440px;max-height:none;height:100%;border-radius:0;border-width:0 0 0 1px;padding:18px 22px 28px;animation:side .2s ease}
  .grab{display:none}
}
@keyframes up{from{transform:translateY(24px);opacity:.4}to{transform:none;opacity:1}}
@keyframes side{from{transform:translateX(24px);opacity:.4}to{transform:none;opacity:1}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
.sh{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.sh .t{flex:1;min-width:0}
.sh h3{margin:0;font-size:19px;letter-spacing:-.01em}
.sec{font-size:12.5px;font-weight:700;color:var(--tx3);letter-spacing:.04em;margin:18px 0 8px}
.toast{position:fixed;left:50%;bottom:calc(84px + var(--safe));transform:translateX(-50%);z-index:30;background:#f1f3fa;color:#0b0e1a;padding:10px 16px;border-radius:12px;font-size:14px;font-weight:600;box-shadow:var(--sh);max-width:calc(100vw - 32px);animation:up .18s ease}
@media (min-width:900px){.toast{bottom:28px}}
.ov{position:fixed;inset:0;z-index:40;background:rgba(3,4,8,.6);display:grid;place-items:center;padding:16px}
.dlg{background:var(--s1);border:1px solid var(--line);border-radius:18px;padding:20px;max-width:400px;width:100%;box-shadow:var(--sh)}
.progress{height:4px;border-radius:4px;background:var(--s3);overflow:hidden;margin-top:8px}
.progress i{display:block;height:100%;background:var(--ac);transition:width .2s}
.ok{color:var(--ok)}.err{color:var(--bad)}.warnc{color:var(--gold)}
.hint{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.subbox{margin:4px 0 8px;padding:12px 14px;border-radius:12px;background:var(--bg2);border:1px solid var(--line)}
.packs{display:flex;flex-wrap:wrap;gap:8px}
.pk{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 12px;border-radius:999px;border:1px solid var(--line2);background:var(--s1);color:var(--tx2);font-size:13px;font-weight:600;white-space:nowrap}
.pk small{color:var(--tx3);font-weight:500}
.pk.on{background:var(--acbg);border-color:var(--acln);color:var(--tx)}
.pk.dim{opacity:.55}
.hscroll{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}
.hscroll::-webkit-scrollbar{display:none}
.hscroll .pk{flex:none}
.dcard{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--line)}
.dcard .t{flex:1;min-width:0}
.dcard b{font-size:14px}
.dcard .when{font-size:12px;color:var(--tx3);margin:3px 0 4px}
.dcard .txt{font-size:13.5px;color:var(--tx2);line-height:1.55}
.ph{color:var(--ac);font-weight:600}
.subbox .help{font-size:12.5px;line-height:1.5;color:var(--tx3);font-weight:400}
.dcard.off b,.dcard.off .txt,.dcard.off .when{opacity:.45}
.scene{margin-top:10px;padding:12px;border-radius:12px;background:var(--acbg);border:1px solid var(--acln)}
.scene .q{font-size:14px;line-height:1.6;margin-top:8px;color:var(--tx)}
.hint .chip{display:inline-block;white-space:normal;line-height:1.45;text-align:left}
pre.raw{white-space:pre-wrap;word-break:break-word;margin:8px 0 0;padding:12px;border-radius:10px;background:var(--bg2);border:1px solid var(--line);color:var(--tx2);font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;max-height:320px;overflow:auto}
.trace{font-size:12.5px;color:var(--tx2);padding:8px 0;border-bottom:1px solid var(--line)}
.trace:last-child{border-bottom:0}
.bar{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--tx3);margin-top:4px}
.bar .meter{max-width:180px}
.mbar{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 0}
.tgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.tool{display:flex;flex-direction:column;align-items:flex-start;gap:3px;text-align:left;padding:14px;border-radius:14px;background:var(--s1,#141923);border:1px solid var(--line);color:var(--tx);font:inherit;cursor:pointer;min-width:0;transition:border-color .15s,background .15s}
.tool:hover{border-color:var(--ac)}
.tool:disabled{opacity:.55;cursor:default}
.tool.p{border-color:rgba(140,158,255,.45);background:rgba(140,158,255,.08)}
.tool .ic{font-size:20px;line-height:1;margin-bottom:6px}
.tool b{font-size:14px}
.tool span:not(.ic){font-size:12px;color:var(--tx3);line-height:1.45}
@media (max-width:520px){.tool{padding:12px}}
.bgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.tagchips{display:flex;flex-wrap:wrap;gap:6px}
.fold.off{opacity:.55}
.ctool{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border-radius:14px;background:var(--s1,#141923);border:1px solid var(--line)}
.ctool .ctl{display:flex;align-items:center;gap:8px;font-size:13.5px}
.ctool .seg.mini{padding:3px;flex:none}
.ctool .seg.mini button{min-height:30px;font-size:12.5px;padding:0 12px}
.ctool .meta{font-size:12px;color:var(--tx3);margin-left:auto}
.phs{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.phs .chip{cursor:pointer;font-family:inherit}
.fold .tg{flex:none;width:38px;height:22px;border-radius:999px;border:0;background:var(--s3);position:relative;cursor:pointer}
.fold .tg::after{content:'';position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:var(--tx3);transition:left .15s}
.fold .tg.on{background:var(--ac)}
.fold .tg.on::after{left:19px;background:#fff}
.cgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px}
.ccard{display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:14px;background:var(--s1,#141923);border:1px solid var(--line);min-width:0}
.ccard.off{opacity:.5}
.ccard .ch2{display:flex;align-items:center;gap:8px}
.ccard .ch2 b{flex:1;font-size:14px;min-width:0}
.ccard .when{font-size:12px;color:var(--tx3)}
.ccard .txt{font-size:13px;color:var(--tx2);line-height:1.55}
.ccard .acts{display:flex;gap:6px;margin-top:2px}
.composer{padding:14px;border-radius:14px;border:1px dashed rgba(140,158,255,.45);background:rgba(140,158,255,.05);margin-bottom:12px;display:flex;flex-direction:column;gap:8px}
.composer .phs{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.composer .phs .chip{cursor:pointer;font-family:inherit}
.newpack{display:flex;gap:6px;flex-wrap:wrap;padding:10px;border-radius:12px;border:1px dashed var(--line)}
.newpack .inp{min-width:0}
.tchip{display:inline-flex;align-items:center;border-radius:999px;border:1px solid var(--line);background:var(--s2);font-size:12.5px;overflow:hidden}
.tchip.pos{border-color:rgba(120,220,160,.35);background:rgba(120,220,160,.08)}
.tchip.neg{border-color:rgba(255,120,140,.35);background:rgba(255,120,140,.08)}
.tchip button{border:0;background:none;color:var(--tx);font:inherit;padding:4px 4px 4px 10px;cursor:pointer}
.tchip button b{font-weight:700;color:var(--tx3);margin-left:2px}
.tchip .x{padding:4px 9px 4px 4px;color:var(--tx3)}
.tchip .x:hover{color:var(--bad,#ff7a8a)}
.bgroup{display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:14px;background:var(--s1,#141923);border:1px solid var(--line);min-width:0}
.bgroup .bh{display:flex;gap:10px;align-items:flex-start}
.bgroup .bh .ic{font-size:20px;line-height:1.2}
.bgroup .bh b{display:block;font-size:14px}
.bgroup .bh span:not(.ic){display:block;font-size:12px;color:var(--tx3);line-height:1.45}
.bgroup .bstat{font-size:12px;color:var(--tx2);padding:6px 10px;border-radius:8px;background:var(--bg2)}
.bgroup .bacts{display:flex;gap:6px;margin-top:auto}
.bgroup .bacts .btn{flex:1;justify-content:center}
details.more.danger{margin-top:12px}
details.more.danger summary{color:var(--tx2)}
@media (max-width:620px){.bgrid{grid-template-columns:1fr}}
.fixcard{border-color:rgba(244,184,96,.35)}
.fixrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--line)}
.fixrow:last-child{border-bottom:0}
.fixrow .t{flex:1;min-width:160px;font-size:13.5px;line-height:1.5}
.fixrow .t small{display:block;color:var(--tx3);font-size:12px}
.fixrow .acts{display:flex;gap:6px;margin-left:auto;align-items:center}
.mtool{display:flex;align-items:center;gap:8px;margin:12px 0 10px;flex-wrap:wrap}
.mtool .seg{flex:1;min-width:220px}
.mtool .seg button{min-height:34px;font-size:13px}
.mx .mcont{display:none}
.mx.in .mfold{display:none}
.mx.in .mcont{display:block}
.mfold{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.fold{display:flex;align-items:center;gap:10px;text-align:left;padding:12px;border-radius:14px;background:var(--s1,#141923);border:1px solid var(--line);color:var(--tx);font:inherit;cursor:pointer;min-width:0}
.fold:hover{border-color:var(--ac)}
.fold.on{border-color:var(--ac);background:var(--s3)}
.mx:not(.in) .fold.on{border-color:var(--line);background:var(--s1,#141923)}
.fold .ic{font-size:20px;flex:none;width:28px;text-align:center}
.fold .t{flex:1;min-width:0}
.fold .t b{display:block;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fold .t span{display:block;font-size:11.5px;color:var(--tx3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fold .n{font-size:12px;color:var(--tx3);flex:none}
.crumb{display:flex;align-items:center;gap:6px;margin:2px 0 10px;font-size:13px;color:var(--tx3);flex-wrap:wrap}
.crumb button{background:none;border:0;color:var(--ac);font:inherit;cursor:pointer;padding:4px 2px}
.crumb b{color:var(--tx)}
.crumb .sp{flex:1}
.mcard{display:block;width:100%;text-align:left;padding:12px 14px;border-radius:14px;background:var(--s1,#141923);border:1px solid var(--line);color:var(--tx);font:inherit;cursor:pointer;margin-bottom:8px}
.mcard:hover{border-color:var(--ac)}
.mcard .mh{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--tx3);margin-bottom:6px;flex-wrap:wrap}
.mcard .mh b{color:var(--tx2)}
.mcard .ml{display:flex;gap:8px;align-items:baseline;font-size:13.5px;line-height:1.55;padding:2px 0}
.mcard .ml .slot{flex:none;font-size:10.5px;padding:1px 6px}
.mcard .ml.low{opacity:.55}
.mcard .ml span:last-child{min-width:0;word-break:break-all}
@media (min-width:900px){
  .mx{display:grid;grid-template-columns:270px 1fr;gap:16px;align-items:start}
  .mx .mcont,.mx.in .mcont{display:block}
  .mfold,.mx.in .mfold{display:flex;flex-direction:column;gap:6px;position:sticky;top:0;max-height:calc(100vh - 150px);overflow:auto;padding-right:2px}
  .crumb .back{display:none}
  .mx .fold.on{border-color:var(--ac);background:var(--s3)}
}
.mbar .chip{cursor:pointer;font-family:inherit}
.mbar .chip.on{background:var(--s3);color:var(--tx);border-color:var(--ac)}
.mbar .lb2{font-size:11.5px;color:var(--tx3);align-self:center;margin-right:2px;min-width:30px}
.mhead{display:flex;align-items:center;gap:8px;margin:12px 2px 8px;font-size:12.5px;color:var(--tx3)}
.mhead .sp{flex:1}
.mgrp{margin:16px 2px 8px;font-size:12.5px;font-weight:700;color:var(--tx2);display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.mgrp span{font-weight:400;color:var(--tx3)}
.mgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}
.mtile{display:flex;flex-direction:column;gap:6px;text-align:left;padding:10px 12px;border-radius:14px;background:var(--s1,#141923);border:1px solid var(--line);color:var(--tx);font:inherit;cursor:pointer;min-width:0}
.mtile:hover{border-color:var(--ac)}
.mtile .mt{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--tx3)}
.mtile .mt .sp{flex:1}
.mtile .tx{font-size:13.5px;line-height:1.55;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;word-break:break-all}
.mtile .mf{display:flex;flex-wrap:wrap;gap:4px}
.mtile .mf .slot{font-size:11px;padding:2px 6px}
.mtile.low{opacity:.62}
@media (max-width:520px){.mgrid{grid-template-columns:1fr 1fr}.mtile .tx{-webkit-line-clamp:5;font-size:13px}}
.titlewarn{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:12px;background:rgba(244,184,96,.10);border:1px solid rgba(244,184,96,.3);margin:10px 0 4px;font-size:13px;line-height:1.55}
`;


  // ── 아이콘 (선 하나짜리) ──
  const ICON = {
    now: 'M12 3l2.2 5.6L20 9.3l-4.5 3.9L17 19l-5-3.1L7 19l1.5-5.8L4 9.3l5.8-.7z',
    people: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 19v-1a4 4 0 0 0-3-3.87M16 2.13a4 4 0 0 1 0 7.75',
    promise: 'M5 21V4m0 0h11l-2 4 2 4H5',
    memory: 'M3 7h18v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM2 3h20v4H2zM10 11h4',
    settings: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
    close: 'M18 6L6 18M6 6l12 12',
    pin: 'M12 17v5M8 3h8l-1 7 4 3H5l4-3z',
    check: 'M20 6L9 17l-5-5',
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
    spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8',
    refresh: 'M21 4v6h-6M3 20v-6h6M5.5 9a8 8 0 0 1 13-3l2.5 2.5M3 14l2.5 2.5A8 8 0 0 0 18.5 15',
    plus: 'M12 5v14M5 12h14', minus: 'M5 12h14',
    alert: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    db: 'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3zM4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
    film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M16 9h4M4 15h4M16 15h4',
    clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
    news: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  };
  const icon = (n, s = 20) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON[n]}"/></svg>`;
  const hasBatchim = (w) => { const c = String(w ?? '').trim().slice(-1).charCodeAt(0); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0; };
  const josa = (w, withB, without) => `${w}${hasBatchim(w) ? withB : without}`;
  const hueOf = (name) => fnv(String(name)) % 360;
  const avatar = (name, cls = '') => `<span class="av ${cls}" style="--h:${hueOf(name)}">${escapeHtml(String(name ?? '?').trim().slice(0, 1) || '?')}</span>`;
  const kpiBox = (v, label) => `<div class="kpi"><b>${v}</b><span>${label}</span></div>`;
  const secs = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}초` : `${ms}ms`);
  const VIEWS = [['now', '지금', 'now'], ['people', '인물', 'people'], ['promises', '약속·비밀', 'promise'], ['memory', '기억', 'memory'], ['cards', '연출 카드', 'film'], ['news', '업데이트', 'news'], ['settings', '설정', 'settings']];
  const TITLES = { now: '지금', people: '인물과 관계', promises: '약속 · 비밀', memory: '기억', cards: '연출 카드', news: '업데이트 내역', settings: '설정' };
  // 업데이트 내역 (새 버전이 위)
  const CHANGELOG = [
    ['1.0.0', '2026-10-19', ['정식 출시 🎉']],
  ];
  const needsSetup = () => !settings.onboarded || !settings.jevKey;
  // 호칭만으로 잡힌 인물 (여러 사람을 이렇게 부를 수 있어 누군지 확실하지 않다)
  const TITLE_NAME = /^(누나|누님|언니|오빠|오라버니|형|형님|선배|선배님|후배|님|씨|아저씨|아줌마|이모|삼촌|선생님|쌤|주인님|주인|도련님|아가씨|마스터|언냐|자기|여보|아빠|엄마|할머니|할아버지)$/;
  const isTitleName = (n) => TITLE_NAME.test(String(n ?? '').trim());
  const pname = (n) => escapeHtml(n) + (isTitleName(n) ? '<span class="dim">(???)</span>' : '');

  // ══ 열기 · 그리기 ══
  async function openPanel(view) {
    await R.showContainer('fullscreen');
    ui.open = true;
    if (view) ui.view = view;
    ui.draft = null;
    if (needsSetup() && !ui.onboard) ui.onboard = { step: 0, d: { ...settings } };
    try { await refreshChat(); } catch (error) { setError('채팅 확인', error); }
    render();
    if (restoredNote) { toast(restoredNote); restoredNote = ''; }
  }
  /** 입력 중인 화면(설정 · 시작 안내)은 뒤에서 일이 끝나도 다시 그리지 않는다 (입력이 끊기지 않게) */
  function softRender() { if (ui.open && !ui.onboard && ui.view !== 'settings') render(); }

  // 틀은 한 번만 만든다. 이후에는 바뀐 칸만 다시 쓴다 (같은 내용이면 손대지 않음)
  function mountShell() {
    if (document.getElementById('ja-app')) return;
    document.body.innerHTML = `<style id="ja-css">${CSS}</style><div class="app" id="ja-app"><nav class="rail" id="ja-rail" aria-label="메뉴"></nav><main class="main"><header class="top" id="ja-top"></header><div class="scroll" id="sc"><div class="wrap" id="ja-wrap"></div></div></main><nav class="tabbar" id="ja-tabbar" aria-label="메뉴"></nav></div><div id="ja-sheet"></div>`;
  }
  function setHtml(el, html) { if (el && el.__html !== html) { el.innerHTML = html; el.__html = html; } }

  function render() {
    mountShell();
    const where = ui.onboard ? 'onb' : ui.view;
    const sc = document.getElementById('sc');
    const keep = sc.dataset.view === where;
    const top = sc.scrollTop;
    const xs = [...document.querySelectorAll('[data-x]')].map(el => [el.dataset.x, el.scrollLeft, el]);
    const st = storageStats();
    const view = ui.onboard ? renderOnboard() : ({ now: renderNow, people: renderPeople, promises: renderPromises, memory: renderMemory, cards: renderCards, news: renderNews, settings: renderSettings }[ui.view] ?? renderNow)(st);
    const nThreads = openCount(false) + openCount(true);
    const badge = { promises: nThreads > 0, now: !!statusAlerts(st).length, people: settings.story && fixItems().length > 0 };
    const label = escapeHtml([chatLabel.char, chatLabel.chat].filter(Boolean).join(' · '));
    setHtml(document.getElementById('ja-rail'), `<div class="brand"><span class="logo">🏛️</span>JevArchive</div>
          ${VIEWS.map(([id, lb, ic]) => `<button class="navi${ui.view === id && !ui.onboard ? ' on' : ''}" data-act="go" data-view="${id}">${icon(ic)}${lb}${id === 'people' && st.people ? `<span class="cnt">${st.people}</span>` : id === 'promises' && nThreads ? `<span class="cnt">${nThreads}</span>` : ''}</button>`).join('')}
          <div class="grow"></div>
          <div class="railstat">${statusPill(st)}<div class="xs dim" style="margin-top:8px">${label || '채팅방을 열어 주세요'}</div></div>`);
    setHtml(document.getElementById('ja-top'), `<h1>${ui.onboard ? '시작하기' : TITLES[ui.view]}</h1><span class="sub">${label}</span>${ui.saved ? `<span class="pill ok"><i></i>${escapeHtml(ui.saved)}</span>` : ''}<button class="iconbtn" data-act="close" aria-label="닫기">${icon('close')}</button>`);
    const tabbar = document.getElementById('ja-tabbar');
    tabbar.style.display = ui.onboard ? 'none' : '';
    setHtml(tabbar, ui.onboard ? '' : VIEWS.filter(([id]) => id !== 'news' || ui.view === 'news').map(([id, lb, ic]) => `<button class="tab${ui.view === id ? ' on' : ''}" data-act="go" data-view="${id}">${icon(ic, 22)}${lb}${badge[id] && ui.view !== id ? '<i class="dot"></i>' : ''}</button>`).join(''));
    sc.dataset.view = where;
    setHtml(document.getElementById('ja-wrap'), view);
    sc.scrollTop = keep ? top : 0;
    renderSheetHost();
    // 새로 만들어진 줄만 위치를 되돌린다 (그대로 있는 줄을 건드리면 넘기던 게 멈춘다)
    for (const [k, x, old] of xs) { const el = document.querySelector(`[data-x="${k}"]`); if (el && el !== old) el.scrollLeft = x; }
    bindOnce();
    bindGraph();
  }
  /** 시트: 같은 시트면 안쪽만 바꾸고 스크롤 그대로. 새로 열 때만 애니메이션 */
  function renderSheetHost() {
    const host = document.getElementById('ja-sheet');
    if (!ui.sheet) { host.innerHTML = ''; host.__key = null; return; }
    const key = `${ui.sheet.type}:${ui.sheet.name ?? ui.sheet.ck ?? ''}`;
    const inner = renderSheet();
    const sheet = host.querySelector('.sheet');
    if (sheet && host.__key === key) { const t = sheet.scrollTop; setHtml(sheet.querySelector('.sheetbody'), inner); sheet.scrollTop = t; return; }
    host.innerHTML = `<div class="sheetbg" data-act="sheet-bg"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div><div class="sheetbody"></div></div></div>`;
    setHtml(host.querySelector('.sheetbody'), inner);
    host.__key = key;
  }

  function toast(msg) {
    document.querySelector('.toast')?.remove();
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }
  function confirmDialog(msg, yes = '확인', danger = false) {
    return new Promise(resolve => {
      const ov = document.createElement('div');
      ov.className = 'ov';
      ov.innerHTML = `<div class="dlg" role="dialog" aria-modal="true"><p style="white-space:pre-wrap;margin:0 0 18px;line-height:1.6">${escapeHtml(msg)}</p><div class="row" style="justify-content:flex-end"><button class="btn g" data-c="0">취소</button><button class="btn ${danger ? 'd' : 'p'}" data-c="1">${escapeHtml(yes)}</button></div></div>`;
      ov.addEventListener('click', (e) => {
        const c = e.target.closest?.('[data-c]')?.dataset.c;
        if (c == null && e.target !== ov) return;
        e.stopPropagation();
        ov.remove();
        resolve(c === '1');
      });
      document.body.appendChild(ov);
    });
  }

  // ══ 상태 ══
  function statusPill(st) {
    if (needsSetup()) return '<span class="pill bad"><i></i>연결 필요</span>';
    if (!settings.enabled) return '<span class="pill warn"><i></i>꺼짐</span>';
    if (stats.lastError && Date.now() - stats.lastErrorAt < 10 * 60 * 1000) return '<span class="pill bad"><i></i>최근 오류</span>';
    if (st.sendable - st.indexedMsgs > 0) return `<span class="pill warn"><i></i>색인 ${st.sendable - st.indexedMsgs}개 남음</span>`;
    return '<span class="pill ok"><i></i>작동 중</span>';
  }
  function statusAlerts(st) {
    const out = [];
    if (needsSetup()) out.push({ tone: 'bad', ic: 'alert', t: 'Jev 연결이 필요해요', d: '키 하나만 넣으면 바로 기억하기 시작해요.', act: 'onboard', label: '연결하기' });
    else if (!settings.enabled) out.push({ tone: 'warn', ic: 'alert', t: 'JevArchive가 꺼져 있어요', d: '요청을 건드리지 않아요.', act: 'toggle-enabled', label: '켜기' });
    if (!needsSetup() && stats.lastError && Date.now() - stats.lastErrorAt < 10 * 60 * 1000) out.push({ tone: 'bad', ic: 'alert', t: '최근 오류', d: `${timeAgo(stats.lastErrorAt)} · ${stats.lastError} · 그래도 보내기는 멈추지 않아요.`, act: 'go-settings', label: '연결 확인' });
    if (!needsSetup() && st.storyLeft > 0) out.push({ tone: st.storyLeft > 8 ? 'warn' : 'ac', ic: 'db', t: `기억으로 정리 안 된 이전 메시지 ${st.storyLeft}개`, d: '보낼 때마다 뒤에서 8개씩 자동으로 칸 줄 기억 · 인물 · 관계 · 약속을 만들어요. 한 번에 하려면 눌러 주세요.', act: 'story-all', label: storyAll ? '정리 중…' : '지금 정리', busy: !!storyAll });
    return out;
  }
  const alertHtml = (a) => `<div class="alert ${a.tone}"><span class="ic">${icon(a.ic)}</span><div class="t"><b>${escapeHtml(a.t)}</b><div class="d">${escapeHtml(a.d)}</div></div><button class="btn ${a.tone === 'bad' ? 'p' : ''}" data-act="${a.act}"${a.busy ? ' disabled' : ''}>${escapeHtml(a.label)}</button></div>`;

  // ══ 지금 ══
  function renderNow(st) {
    const clock = storyClock(timeline.length);
    const lr = lastRecall;
    const present = lr?.present?.length ? lr.present : (settings.story ? [...new Set(timeline.slice(-3).flatMap(m => peopleIn(m.text)))] : []);
    const title = clockLabel(clock) || (chatLabel.chat || '이야기를 이어 가면 장면이 보여요');
    const items = lr?.items ?? [];
    const film = items.length ? `<div class="film" data-x="film">${items.map(it => `<button class="mem" data-act="chunk" data-ck="${escapeHtml(it.ck)}">
        <div class="hd">#${it.mi + 1} ${it.why === 'pin' ? '<span class="tag pin">고정</span>' : it.why === 'tail' ? '<span class="tag tail">방금 흐름</span>' : it.why === 'near' ? '<span class="tag">앞뒤</span>' : ''}<span class="meter"><i style="width:${Math.round(Math.min(3, it.lv) / 3 * 100)}%"></i></span></div>
        ${it.fact ? factChips(it.fact.k, it.fact.slots, it.text) : `<div class="txt">${escapeHtml(it.text)}</div>`}</button>`).join('')}</div>`
      : `<div class="empty"><div class="big">🎞️</div><b>아직 넣은 기억이 없어요</b>메시지를 보내면 이번 답장에 들어간 기억이 여기에 카드로 보여요.</div>`;
    const open = allThreads().filter(t => t.status === 'open' && !isSecret(t)).slice(-3).reverse();
    const nOpenP = openCount(false), nOpenS = openCount(true);
    const recent = [];
    for (let i = facts.length - 1; i >= 0 && recent.length < 6; i--) if (facts[i].k === 'event' || facts[i].k === 'action') recent.push(facts[i]);
    const hint = story.director;
    return `<section class="hero">
        <div class="eyebrow">지금 장면</div>
        <h1>${escapeHtml(title)}</h1>
        <div class="place">${clock.mi != null ? `상태창 기준 · #${clock.mi + 1}` : '상태창(날짜 · 시간 · 장소)이 있으면 자동으로 읽어요'}</div>
        ${present.length ? `<div class="cast">${present.map(n => `<button class="castp" data-act="person" data-name="${escapeHtml(n)}">${avatar(n)}<span>${escapeHtml(n)}</span></button>`).join('')}</div>` : ''}
      </section>
      ${statusAlerts(st).map(alertHtml).join('')}
      ${ui.progress ? `<div class="card small">${escapeHtml(ui.progress)}<div class="progress"><i style="width:${ui.progressPct ?? 30}%"></i></div></div>` : ''}
      <section class="card">
        <div class="ch"><h2>이번 답장에 넣은 기억</h2><span class="sp"></span>${lr ? `<span class="meta">${lr.tokens}토큰 · ${timeAgo(lr.at)}</span>` : ''}</div>
        ${film}
        ${lr?.storyKo?.length ? `<div class="hint">${lr.storyKo.map(l => `<span class="chip ${l.c}">${escapeHtml(l.t)}</span>`).join('')}</div>` : ''}
        ${lr ? `<div class="bar">${lr.kept ? `후보 ${lr.cands}개 중 Jev가 ${lr.kept}개를 골랐어요` : lr.cands ? `후보 ${lr.cands}개 중 지금 꼭 필요한 건 없다고 봤어요 · 방금 흐름만 넣음` : '아직 찾을 옛날 대화가 없어요'}${lr.need && lr.need !== 'none' ? ` · 빠진 근거(${escapeHtml(lr.need)})로 한 번 더 찾음` : ''}${lr.jevOk === false ? ' · <span class="err">Jev 실패, 검색 순위로 대신</span>' : ''}</div>` : ''}
        ${lr?.block ? `<details class="more"${keepOpen('raw-block', false)}><summary>모델에게 보낸 그대로 보기</summary><pre class="raw">${escapeHtml(lr.block)}</pre></details>` : ''}
      </section>
      <div class="grid2">
        <section class="card">
          <div class="ch"><h2>진행 중인 약속</h2><span class="sp"></span>${nOpenP ? `<button class="btn sm g" data-act="go" data-view="promises">모두 ${nOpenP}</button>` : ''}</div>
          ${open.length ? `<div class="col">${open.map(promiseHtml).join('')}</div>` : `<div class="empty small" style="padding:14px">${settings.story ? '아직 약속이 없어요. 대화에서 약속이나 계획이 나오면 여기 모여요.' : '이야기 기록을 켜면 약속을 모아 줘요.'}</div>`}
          ${nOpenS ? `<button class="item" data-act="go-secrets" style="margin-top:8px"><span style="font-size:18px">🤫</span><div class="t"><b>숨기는 비밀 ${nOpenS}개</b><span>내용은 가려 둬요 · 눌러서 보기</span></div></button>` : ''}
        </section>
        <section class="card">
          <div class="field inline" style="padding-top:0"><div><div class="lb">${icon('spark', 16)} 감독</div><div class="help">템포 · 분위기 · 꺼낼 약속에, 연출 카드 중 지금 장면에 맞는 걸 Jev가 골라 짧게 귀띔해요. 회상과 같은 호출이라 호출 수는 안 늘어요.</div></div>${sw('director', settings.director, 'quick')}</div>
          ${settings.director ? directorBox(hint) : ''}
        </section>
      </div>
      ${recent.length ? `<section class="card"><div class="ch"><h2>최근 일어난 일</h2><span class="sp"></span><span class="meta">칸 줄 기억</span></div><div class="list">${recent.map(f => factItem(f)).join('')}</div></section>` : ''}
      ${usageCard()}
      <div class="kpis">${kpiBox(st.messages, '채팅 메시지')}${kpiBox(st.facts ?? 0, '칸 줄 기억')}${kpiBox(st.people, '인물')}${kpiBox(`${st.kb}KB`, '이 기기에 저장')}</div>`;
  }

  function directorBox(hint) {
    const n = allDirCards().length;
    const chips = hint ? `${hint.pace ? `<span class="chip ac">템포 · ${PACE_KO[hint.pace]}</span>` : ''}${hint.mood ? `<span class="chip">분위기 · ${MOOD_KO[hint.mood]}</span>` : ''}${hint.spot ? `<span class="chip">먼저 · ${escapeHtml(hint.spot)}</span>` : ''}${hint.thread ? `<span class="chip gold">약속 · ${escapeHtml(clip(hint.thread.text, 30))}</span>` : ''}` : '';
    const scene = hint?.card ? `<div class="scene"><div class="row"><span class="chip ac">${escapeHtml(DIR_PACKS[hint.card.pack]?.icon ?? '✍️')} ${escapeHtml(hint.card.name)}</span><span class="sp"></span><button class="btn sm g" data-act="dir-off" data-id="${escapeHtml(hint.card.id)}">이 카드 그만</button></div><div class="q">${escapeHtml(hint.card.text)}</div></div>` : '';
    return `${hint ? `<div class="hint">${chips}</div>${scene}${!hint.card && settings.dirCards ? '<div class="xs dim" style="margin-top:8px">이번엔 딱 맞는 연출 카드가 없어서 안 넣었어요.</div>' : ''}` : '<div class="xs dim">다음 답장부터 보여요.</div>'}
      ${settings.dirCards ? `<div class="row" style="margin-top:10px"><button class="btn sm g" data-act="dircards">${icon('film', 16)} 연출 카드 ${n}장</button></div>` : ''}`;
  }

  /** 칸 줄을 칩으로: [사건] 누가 하윤이 · 언제 … */
  function factChips(k, slots, sent) {
    const kind = k && FACT_KO[k] ? `<span class="slot kind k-${k}">${FACT_KO[k]}</span>` : '';
    if (k === 'secret') return `<div class="slots">${kind}<span class="slot spoil" data-act="spoil" title="눌러서 보기">${escapeHtml(sent ?? slots.filter(Boolean).join(' '))}</span></div>`;
    if (!TAG_KINDS.has(k) || !slots.some(Boolean)) return `<div class="slots">${kind}<span class="slot">${escapeHtml(sent ?? slots.filter(Boolean).join(' '))}</span></div>`;
    return `<div class="slots">${kind}${ROLE_ORDER.map((r, i) => (slots[i] ? `<span class="slot r-${r}"><i>${ROLE_KO[r]}</i>${escapeHtml(slots[i])}</span>` : '')).join('')}</div>`;
  }
  function factItem(f, q = '') {
    const ck = `${timeline[f.mi]?.key ?? 'x'}:${f.pos}`;
    return `<button class="item" data-act="chunk" data-ck="${escapeHtml(ck)}" style="align-items:flex-start"><div class="t"><div class="row xs dim" style="margin-bottom:2px">#${f.mi + 1} · ${timeline[f.mi]?.role === 'user' ? '나' : escapeHtml(characterCache.name || '캐릭터')}${story.pins.includes(ck) ? ' <span class="tag pin">고정</span>' : ''}</div>${factChips(f.k, f.slots, f.sent)}${q ? `<div class="snip xs dim" style="margin-top:4px">${highlight(f.sent, q)}</div>` : ''}</div></button>`;
  }
  /** 기억 탭의 약속 · 비밀 문장을 약속 탭 줄 모양으로. 이야기 정리가 같은 메시지에서 이미 잡은 건 뺀다 */
  function memThreads() {
    const caught = new Set(story.threads.map(t => `${t.kind === 'secret' ? 's' : 'p'}:${t.mi}`));
    const st = story.memThreads ?? {};
    const out = [];
    for (const f of facts) {
      if (f.k !== 'promise' && f.k !== 'secret') continue;
      if ((f.w ?? 3) < WORTH_LOW) continue;   // 기억 탭에서 회색(가벼운 말)은 빼고
      const kind = f.k === 'secret' ? 'secret' : 'promise';
      if (caught.has(`${kind === 'secret' ? 's' : 'p'}:${f.mi}`)) continue;
      const names = peopleIn(f.sent).filter(n => !isTitleName(n));
      const me = timeline[f.mi]?.role === 'user' && personaCache ? (personList().find(p => p.kind === 'persona')?.name ?? personaCache) : null;
      const who = me ?? names[0] ?? '';
      if (!who && kind !== 'secret') continue;   // 약속은 누구 약속인지 모르면 안 넣는다 (기억 탭에는 그대로). 비밀은 누가 숨기는지 몰라도 넣는다
      const to = names.find(n => n !== who) ?? null;
      const key = factKey(f);
      out.push({ src: 'mem', key, kind, self: !to && kind !== 'secret', text: unquote(f.sent), who, to: kind === 'secret' ? null : to, mi: f.mi, ck: `${timeline[f.mi]?.key ?? 'x'}:${f.pos}`, status: st[key] ?? 'open' });
    }
    return out;
  }
  /** 약속 탭에 보이는 전부: 이야기 정리로 잡은 것 + 기억에서 온 것, 메시지 순서대로 */
  function allThreads() { return [...story.threads, ...memThreads()].sort((a, b) => a.mi - b.mi); }
  const openCount = (sec) => allThreads().filter(t => t.status === 'open' && isSecret(t) === sec).length;

  function promiseHtml(t) {
    const tAttr = t.src === 'mem' ? `data-act="fthread" data-key="${escapeHtml(t.key)}"` : `data-act="thread" data-id="${t.id}"`;
    const done = t.status !== 'open', sec = isSecret(t);
    const L = sec ? { done: '드러남', dropped: '비밀 아님', open: '다시 숨기기' } : { done: '지켜짐', dropped: '취소됨', open: '다시 열기' };
    const who = sec ? `🤫 ${escapeHtml(t.who || '누군가')} <span class="dim">(${t.to ? `${escapeHtml(t.to)} 모르게` : '모두 모르게'})</span>` : t.self ? `${escapeHtml(t.who)} <span class="dim">(혼자 다짐)</span>` : `${escapeHtml(t.who || '누군가')}${t.to ? ` → ${escapeHtml(t.to)}` : ''}`;
    const slots = t.tags?.some(g => g.r !== 'none') ? `<div class="slots">${t.tags.filter(g => g.r !== 'none').map(g => `<span class="slot r-${g.r}"><i>${ROLE_KO[g.r]}</i>${escapeHtml(g.w)}</span>`).join('')}</div>` : '';
    const text = sec ? `<span class="spoil" data-act="spoil" title="눌러서 보기 · 다시 누르면 가리기">“${escapeHtml(t.text)}”${slots}</span>` : `“${escapeHtml(t.text)}”${slots}`;
    return `<div class="promise${sec ? ' secret' : ''}">${avatar(t.who || '?', 'sm')}<div style="flex:1;min-width:0">
        <div class="who">${who}</div>
        <div class="q">${text}</div>
        <div class="row xs dim"><button class="btn sm g" data-act="chunk" data-ck="${escapeHtml(t.ck)}">#${t.mi + 1} 원문</button>${done ? `<span class="chip ${t.status === 'done' ? (sec ? 'sec' : 'ac') : ''}">${L[t.status]}${sec && t.status === 'done' && t.closedMi != null ? ` · #${t.closedMi + 1}` : ''}</span>` : ''}</div>
      </div><div class="acts">${done ? `<button class="iconbtn" ${tAttr} data-to="open" aria-label="${L.open}" title="${L.open}">${icon('refresh', 18)}</button>` : `<button class="iconbtn" ${tAttr} data-to="done" aria-label="${L.done}" title="${L.done}">${icon('check', 18)}</button><button class="iconbtn" ${tAttr} data-to="dropped" aria-label="${L.dropped}" title="${L.dropped}">${icon('close', 18)}</button>`}</div></div>`;
  }

  // ══ 인물 · 관계도 ══
  function graphData() {
    const ppl = personList().filter(p => !p.hidden && p.count > 0).sort((a, b) => b.count - a.count).slice(0, 36);
    const names = new Set(ppl.map(p => p.name));
    const edges = Object.values(story.pairs).filter(e => names.has(e.a) && names.has(e.b) && e.co > 0);
    return { ppl, edges };
  }
  const wide = () => { try { return !!globalThis.matchMedia?.('(min-width:900px)').matches; } catch { return true; } };
  const graphBox = () => (wide() ? { W: 640, H: 440 } : { W: 380, H: 460 });
  /** 힘 배치: 서로 밀고, 관계선은 당긴다. 결과는 그래프 모양이 바뀔 때만 다시 계산 */
  function layoutGraph(ppl, edges) {
    const { W, H } = graphBox(), n = ppl.length;
    const sig = `${W}x${H}|` + ppl.map(p => p.name).join(',') + '|' + edges.map(e => `${e.a}${e.b}`).join(',');
    if (ui.layout && ui.layoutSig === sig) return ui.layout;
    const prev = ui.layout ?? {};
    const pos = {};
    ppl.forEach((p, i) => {
      const a = (hueOf(p.name) / 360) * Math.PI * 2;
      pos[p.name] = prev[p.name] ? { ...prev[p.name] } : { x: W / 2 + Math.cos(a) * W * 0.22 * (0.6 + (i % 3) * 0.2), y: H / 2 + Math.sin(a) * H * 0.22 * (0.6 + (i % 3) * 0.2) };
    });
    const k = Math.sqrt((W * H) / Math.max(1, n)) * 0.55;
    let temp = W / 8;
    for (let it = 0; it < 320; it++) {
      const disp = Object.fromEntries(ppl.map(p => [p.name, { x: 0, y: 0 }]));
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const a = pos[ppl[i].name], b = pos[ppl[j].name];
        let dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const f = (k * k) / d;
        dx /= d; dy /= d;
        disp[ppl[i].name].x += dx * f; disp[ppl[i].name].y += dy * f;
        disp[ppl[j].name].x -= dx * f; disp[ppl[j].name].y -= dy * f;
      }
      for (const e of edges) {
        const a = pos[e.a], b = pos[e.b];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const f = ((d * d) / k) * (0.4 + Math.min(1, Math.log2(1 + e.co) / 4));
        disp[e.a].x -= (dx / d) * f; disp[e.a].y -= (dy / d) * f;
        disp[e.b].x += (dx / d) * f; disp[e.b].y += (dy / d) * f;
      }
      for (const p of ppl) {
        const q = pos[p.name], v = disp[p.name];
        v.x += (W / 2 - q.x) * 0.03; v.y += (H / 2 - q.y) * 0.03;
        const d = Math.max(1, Math.hypot(v.x, v.y));
        q.x += (v.x / d) * Math.min(d, temp);
        q.y += (v.y / d) * Math.min(d, temp);
      }
      temp *= 0.985;
    }
    // 화면 안으로
    const xs = ppl.map(p => pos[p.name].x), ys = ppl.map(p => pos[p.name].y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const sx = (W - 110) / Math.max(1, x1 - x0), sy = (H - 110) / Math.max(1, y1 - y0), sc = Math.min(1.6, sx, sy);
    for (const p of ppl) { const q = pos[p.name]; q.x = W / 2 + (q.x - (x0 + x1) / 2) * sc; q.y = H / 2 - 8 + (q.y - (y0 + y1) / 2) * sc; }
    ui.layout = pos;
    ui.layoutSig = sig;
    return pos;
  }
  function graphSvg() {
    const { ppl, edges } = graphData();
    if (!ppl.length) return '';
    const pos = layoutGraph(ppl, edges);
    const g = ui.graph;
    const edgeColor = (e) => (e.aff >= 2 ? 'var(--warm)' : e.aff <= -2 ? 'var(--cold)' : '#4a5168');
    const lines = edges.map(e => { const a = pos[e.a], b = pos[e.b]; return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${edgeColor(e)}" stroke-width="${(1.2 + Math.min(5, Math.log2(1 + e.co))).toFixed(1)}" stroke-opacity="${Math.min(0.95, 0.35 + e.co / 20).toFixed(2)}" stroke-linecap="round"/>`; }).join('');
    const nodes = ppl.map(p => {
      const q = pos[p.name], r = 17 + Math.min(11, Math.sqrt(p.count) * 2), h = hueOf(p.name);
      return `<g class="node" data-act="person" data-name="${escapeHtml(p.name)}" transform="translate(${q.x.toFixed(1)} ${q.y.toFixed(1)})"><circle r="${r.toFixed(1)}" fill="hsl(${h} 45% 24%)" stroke="hsl(${h} 70% ${p.kind === 'char' ? 72 : 52}%)"/><text text-anchor="middle" dy="5" fill="hsl(${h} 90% 86%)">${escapeHtml(p.name.slice(0, 1))}</text><text class="lbl" text-anchor="middle" y="${(r + 17).toFixed(1)}">${escapeHtml(clip(p.name, 8))}${isTitleName(p.name) ? '(???)' : ''}</text></g>`;
    }).join('');
    const { W, H } = graphBox();
    return `<svg class="graph" viewBox="0 0 ${W} ${H}" data-graph role="img" aria-label="인물 관계도"><g data-pan transform="translate(${g.x} ${g.y}) scale(${g.k})">${lines}${nodes}</g></svg>`;
  }
  let graphBound = null;
  function bindGraph() {
    const svg = document.querySelector('svg[data-graph]');
    if (!svg || graphBound === svg) return;
    graphBound = svg;
    const pan = svg.querySelector('[data-pan]');
    const pts = new Map();
    let start = null, moved = false, pinch = null;
    const apply = () => pan.setAttribute('transform', `translate(${ui.graph.x} ${ui.graph.y}) scale(${ui.graph.k})`);
    const toLocal = (cx, cy) => { const m = svg.getScreenCTM?.(); if (!m) return { x: cx, y: cy }; const p = new DOMPoint(cx, cy).matrixTransform(m.inverse()); return { x: p.x, y: p.y }; };
    const unit = () => 1 / (svg.getScreenCTM?.()?.a || 1);
    const zoomAt = (cx, cy, f) => {
      const g = ui.graph, k2 = Math.max(0.4, Math.min(3, g.k * f));
      g.x = cx - ((cx - g.x) * k2) / g.k; g.y = cy - ((cy - g.y) * k2) / g.k; g.k = k2;
      apply();
    };
    svg.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 1) { start = { x: e.clientX, y: e.clientY, gx: ui.graph.x, gy: ui.graph.y }; moved = false; } if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: ui.graph.k }; } });
    svg.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const c = toLocal((a.x + b.x) / 2, (a.y + b.y) / 2);
        zoomAt(c.x, c.y, (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d) * pinch.k / ui.graph.k);
        moved = true;
        return;
      }
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      if (!moved) svg.setPointerCapture?.(e.pointerId);
      moved = true;
      ui.graph.x = start.gx + dx * unit(); ui.graph.y = start.gy + dy * unit();
      apply();
    });
    const end = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) start = null; };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
    svg.addEventListener('wheel', (e) => { e.preventDefault(); const c = toLocal(e.clientX, e.clientY); zoomAt(c.x, c.y, e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
  }

  function relLabel(p) { return p.type ? relKo(p) : (p.co >= 3 ? '자주 함께' : '함께 나옴'); }
  // ── 정리할 것: 같은 사람 같아 보이는 이름 · 호칭만으로 잡힌 인물 ──
  function fixItems() {
    const pairs = sameSuggestions().map(x => ({ type: 'same', ...x }));
    const inPair = new Set(pairs.map(x => x.from));
    const titles = personList().filter(p => !p.hidden && isTitleName(p.name) && !inPair.has(p.name)).map(p => ({ type: 'title', name: p.name }));
    return [...pairs, ...titles];
  }
  function fixCard() {
    const items = fixItems();
    if (!items.length) return '';
    const others = (n) => personList().filter(p => !p.hidden && p.name !== n && !isTitleName(p.name)).sort((a, b) => b.count - a.count);
    return `<section class="card fixcard" style="margin-bottom:14px"><div class="ch"><h2>정리할 것 ${items.length}개</h2><span class="sp"></span><span class="meta">한 번 누르면 끝나요</span></div>
      ${items.map((x, i) => x.type === 'same'
        ? `<div class="fixrow">${avatar(x.from, 'sm')}<div class="t"><b>${escapeHtml(x.from)}</b> = <b>${escapeHtml(x.into)}</b>?<small>같은 사람 같아요. 합치면 ${escapeHtml(x.from)}${hasBatchim(x.from) ? '은' : '는'} ${escapeHtml(x.into)}의 다른 이름이 돼요.</small></div><div class="acts"><button class="btn sm p" data-act="fix-merge" data-from="${escapeHtml(x.from)}" data-into="${escapeHtml(x.into)}">합치기</button><button class="btn sm g" data-act="fix-no" data-a="${escapeHtml(x.from)}" data-b="${escapeHtml(x.into)}">아니야</button></div></div>`
        : `<div class="fixrow">${avatar(x.name, 'sm')}<div class="t"><b>${pname(x.name)}</b><small>호칭이라 누군지 확실하지 않아요. 여러 사람이면 숨기기, 한 사람이면 합치기.</small></div><div class="acts"><button class="btn sm d" data-act="fix-hide" data-name="${escapeHtml(x.name)}">숨기기</button><select class="sel" id="fix-in-${i}" style="width:auto;min-height:32px;padding:2px 8px;font-size:12.5px"><option value="">합칠 사람…</option>${others(x.name).map(o => `<option value="${escapeHtml(o.name)}">${escapeHtml(o.name)}</option>`).join('')}</select><button class="btn sm" data-act="fix-merge" data-from="${escapeHtml(x.name)}" data-sel="fix-in-${i}">합치기</button></div></div>`).join('')}
    </section>`;
  }

  function renderPeople() {
    const { ppl } = graphData();
    const q = ui.peopleQ.trim();
    const list = personList().filter(p => !p.hidden && (!q || nameForms(p).some(n => n.includes(q)))).sort((a, b) => b.count - a.count);
    if (!ppl.length && !list.length) return `<div class="card"><div class="empty"><div class="big">🕸️</div><b>아직 인물이 없어요</b>대화가 쌓이면 인물과 관계가 여기에 그려져요.${settings.story ? '' : '<br>설정 › 이야기에서 "인물 · 관계 · 약속 기록"을 켜 주세요.'}</div></div>${statusAlerts(storageStats()).filter(a => a.act === 'story-all').map(alertHtml).join('')}`;
    const best = (name) => pairsOf(name).sort((a, b) => b.co - a.co)[0];
    return `${fixCard()}<div class="peoplegrid">
      <section class="card graphcard">
        <div class="ch"><h2>관계도</h2><span class="sp"></span><span class="meta">끌기 · 확대 · 눌러서 자세히</span></div>
        ${graphSvg() || '<div class="empty">관계가 생기면 선으로 이어져요.</div>'}
        <div class="legend"><span><i style="background:var(--warm)"></i>가까움</span><span><i style="background:var(--cold)"></i>멀어짐</span><span><i style="background:#4a5168"></i>보통</span><span>선 굵기 = 함께 나온 횟수</span><div class="gtools"><button class="iconbtn" data-act="gzoom" data-f="1.25" aria-label="확대">${icon('plus', 18)}</button><button class="iconbtn" data-act="gzoom" data-f="0.8" aria-label="축소">${icon('minus', 18)}</button><button class="iconbtn" data-act="greset" aria-label="처음 위치">${icon('refresh', 18)}</button></div></div>
      </section>
      <section class="card">
        <div class="ch"><h2>인물 ${list.length}명</h2></div>
        <div class="search" style="margin-bottom:6px">${icon('search', 18)}<input id="pq" placeholder="이름 찾기" value="${escapeHtml(ui.peopleQ)}" autocomplete="off"></div>
        <div class="list">${list.map(p => { const b = best(p.name); const other = b ? (b.a === p.name ? b.b : b.a) : null; return `<button class="item" data-act="person" data-name="${escapeHtml(p.name)}">${avatar(p.name)}<div class="t"><b>${pname(p.name)}${p.kind === 'char' ? ' <span class="tag">캐릭터</span>' : p.kind === 'persona' ? ' <span class="tag">나</span>' : ''}</b><span>${p.count}번 등장${other ? ` · ${escapeHtml(josa(other, '과', '와'))} ${relLabel(b)}` : ''}</span></div>${b ? `<span class="chip ${b.aff >= 2 ? 'warm' : b.aff <= -2 ? 'cold' : ''}">${affLabel(b.aff)}</span>` : ''}</button>`; }).join('') || '<div class="empty small">찾는 이름이 없어요.</div>'}</div>
      </section></div>`;
  }

  // ══ 약속 ══
  function renderPromises() {
    const kind = ui.tkind ?? 'promise', sec = kind === 'secret';
    const all = allThreads().filter(t => isSecret(t) === sec).reverse();
    const open = all.filter(t => t.status === 'open'), closed = all.filter(t => t.status !== 'open');
    const show = ui.threads === 'open' ? open : closed;
    const nP = openCount(false), nS = openCount(true);
    if (sec) return `<div class="seg" role="tablist"><button class="" data-act="tkind" data-v="promise">🎗️ 약속 ${nP}</button><button class="on" data-act="tkind" data-v="secret">🤫 비밀 ${nS}</button></div>
      <div class="seg" role="tablist"><button class="${ui.threads === 'open' ? 'on' : ''}" data-act="ttab" data-v="open">숨기는 중 ${open.length}</button><button class="${ui.threads === 'closed' ? 'on' : ''}" data-act="ttab" data-v="closed">드러남 · 끝 ${closed.length}</button></div>
      ${show.length ? `<div class="xs dim" style="margin:-4px 2px 0">내용은 스포일러라 가려 둬요. 눌러야 보여요.</div><div class="col">${show.map(promiseHtml).join('')}</div>` : `<div class="card"><div class="empty"><div class="big">🤫</div><b>${ui.threads === 'open' ? '숨기는 비밀이 없어요' : '드러난 비밀이 없어요'}</b>${settings.story ? '누가 누구에게 무언가를 숨기면 Jev가 모아 두고, 그 사람이 알게 되면 "드러남"으로 닫아요. 둘이 장면에 있을 때 "아직 모름"을 짧게 귀띔해서 모델이 아는 척하지 않게 해요.' : '설정 › 이야기에서 기록을 켜 주세요.'}</div></div>`}`;
    return `<div class="seg" role="tablist"><button class="on" data-act="tkind" data-v="promise">🎗️ 약속 ${nP}</button><button class="" data-act="tkind" data-v="secret">🤫 비밀 ${nS}</button></div>
      <div class="seg" role="tablist"><button class="${ui.threads === 'open' ? 'on' : ''}" data-act="ttab" data-v="open">진행 중 ${open.length}</button><button class="${ui.threads === 'closed' ? 'on' : ''}" data-act="ttab" data-v="closed">끝남 ${closed.length}</button></div>
      ${show.length ? `<div class="col">${show.map(promiseHtml).join('')}</div>` : `<div class="card"><div class="empty"><div class="big">🎗️</div><b>${ui.threads === 'open' ? '진행 중인 약속이 없어요' : '끝난 약속이 없어요'}</b>${settings.story ? '대화에서 약속 · 계획 · 목표가 나오면 Jev가 모아 두고, 지켜지면 닫아요. 그 사람이 다시 나오면 답장에 짧게 귀띔해요.' : '설정 › 이야기에서 기록을 켜 주세요.'}</div></div>`}`;
  }

  // ══ 기억 ══
  function highlight(text, q) {
    const words = [...new Set(String(q).split(/\s+/).map(w => w.replace(PARTICLE, '')).filter(w => w.length >= 2))].slice(0, 6);
    let h = escapeHtml(text);
    for (const w of words) h = h.split(escapeHtml(w)).join(`<mark>${escapeHtml(w)}</mark>`);
    return h;
  }
  function chunkCard(c, q = '') {
    const ck = ckOf(c);
    const pinned = story.pins.includes(ck);
    const names = settings.story ? peopleIn(c.text).slice(0, 4) : [];
    return `<button class="item" data-act="chunk" data-ck="${escapeHtml(ck)}" style="align-items:flex-start"><div class="t"><div class="row xs dim" style="margin-bottom:4px">#${c.mi + 1} · ${timeline[c.mi]?.role === 'user' ? '나' : escapeHtml(characterCache.name || '캐릭터')}${pinned ? ' <span class="tag pin">고정</span>' : ''}${c.vec ? '' : ' <span class="tag">색인 전</span>'}${names.map(n => `<span class="chip" style="padding:1px 8px">${escapeHtml(n)}</span>`).join('')}</div><div class="snip" style="display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden">${highlight(c.text, q)}</div></div></button>`;
  }
  function renderNews() {
    return CHANGELOG.map(([v, date, items], i) => `<div class="card log"><h3>${v}${i === 0 ? ' <span class="pill ok"><i></i>지금 버전</span>' : ''}<span class="xs dim">${date}</span></h3><ul>${items.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul></div>`).join('');
  }

  // ══ 기억 탭: 폴더(날짜 · 장소 / 인물 / 종류) → 메시지 카드 ══
  //  PC: 왼쪽 폴더, 오른쪽 내용. 폰: 폴더 → 눌러서 안으로 (‹ 뒤로)
  const MEM_GROUPS = { date: '날짜 · 장소', person: '인물', kind: '종류' };
  const KIND_IC = { event: '⚡', action: '🏃', fact: '📄', promise: '🎗️', secret: '🤫' };
  let memClk = new Map();
  function clockOf(mi) {
    if (!memClk.has(mi)) { const c = storyClock(mi + 1); memClk.set(mi, { d: c.d ? clockLabel({ d: c.d }) : '', dt: clockLabel({ d: c.d, t: c.t }), place: c.place ?? '' }); }
    return memClk.get(mi);
  }
  function memBase(m) {
    let list = facts;
    if (m.kind !== 'all' && m.group !== 'kind') list = list.filter(f => f.k === m.kind);
    if (m.role !== 'all') list = list.filter(f => (timeline[f.mi]?.role === 'user') === (m.role === 'user'));
    return list;
  }
  const formsOf = (name) => nameForms(story.people[name] ?? { name, aliases: [] });
  function memFolders(m, list) {
    const map = new Map();
    const add = (id, label, ic, f) => { let x = map.get(id); if (!x) map.set(id, x = { id, label, ic, n: 0, msgs: new Set(), last: -1, places: new Map() }); x.n++; x.msgs.add(f.mi); x.last = Math.max(x.last, f.mi); return x; };
    if (m.group === 'date') for (const f of list) { const c = clockOf(f.mi); const x = add(c.d || '-', c.d || '날짜 없음', '📅', f); if (c.place) x.places.set(c.place, (x.places.get(c.place) ?? 0) + 1); }
    else if (m.group === 'kind') { for (const f of list) if (FACT_KO[f.k]) add(f.k, FACT_KO[f.k], KIND_IC[f.k], f); }
    else { const ppl = personList().filter(p => !p.hidden).map(p => [p.name, nameForms(p)]); for (const f of list) for (const [name, forms] of ppl) if (forms.some(n => f.sent.includes(n))) add(name, name, null, f); }
    const arr = [...map.values()];
    for (const x of arr) { const ps = [...x.places.entries()].sort((a, b) => b[1] - a[1]); x.sub = ps.length ? `${clip(ps[0][0], 22)}${ps.length > 1 ? ` 외 ${ps.length - 1}곳` : ''}` : ''; }
    if (m.group === 'date') arr.sort((a, b) => (m.sort === 'old' ? a.last - b.last : b.last - a.last));
    else arr.sort((a, b) => b.n - a.n);
    return arr;
  }
  function inFolder(m, list) {
    if (!m.folder || m.folder === '*') return list;
    if (m.group === 'kind') return list.filter(f => f.k === m.folder);
    if (m.group === 'person') { const forms = formsOf(m.folder); return list.filter(f => forms.some(n => f.sent.includes(n))); }
    return list.filter(f => (clockOf(f.mi).d || '-') === m.folder);
  }
  function msgCard(mi, list, q = '') {
    const c = clockOf(mi);
    const first = list.slice().sort((a, b) => a.pos - b.pos || a.si - b.si);
    const ck = `${timeline[mi]?.key ?? 'x'}:${first[0].pos}`;
    const pinned = first.some(f => story.pins.includes(`${timeline[mi]?.key ?? 'x'}:${f.pos}`));
    const who = timeline[mi]?.role === 'user' ? '나' : escapeHtml(characterCache.name || '캐릭터');
    return `<button class="mcard" data-act="chunk" data-ck="${escapeHtml(ck)}"><div class="mh"><b>#${mi + 1} · ${who}</b>${c.dt ? `<span>${escapeHtml(c.dt)}</span>` : ''}${c.place ? `<span>· ${escapeHtml(clip(c.place, 24))}</span>` : ''}${pinned ? '<span>📌</span>' : ''}</div>
      ${first.map(f => `<div class="ml${(f.w ?? 3) < 1.5 ? ' low' : ''}">${FACT_KO[f.k] ? `<span class="slot kind k-${f.k}">${FACT_KO[f.k]}</span>` : ''}${f.k === 'secret' ? `<span class="spoil" data-act="spoil" title="눌러서 보기 · 다시 누르면 가리기">${escapeHtml(f.sent)}</span>` : `<span>${q ? highlight(f.sent, q) : escapeHtml(f.sent)}</span>`}</div>`).join('')}</button>`;
  }
  /** 문장 목록 → 메시지 카드 (order: 'new' | 'old' | 'keep' = 들어온 순서 그대로) */
  function msgCards(list, order, limit, q = '') {
    const by = new Map();
    for (const f of list) { if (!by.has(f.mi)) by.set(f.mi, []); by.get(f.mi).push(f); }
    let mis = [...by.keys()];
    if (order === 'old') mis.sort((a, b) => a - b); else if (order === 'new') mis.sort((a, b) => b - a);
    return { total: mis.length, html: mis.slice(0, limit).map(mi => msgCard(mi, by.get(mi), q)).join('') };
  }
  function memFilterSheet() {
    const m = ui.mem;
    const counts = {};
    for (const f of facts) counts[f.k] = (counts[f.k] ?? 0) + 1;
    const chip = (k, v, label) => `<button class="chip${m[k] === v ? ' on' : ''}" data-act="mf" data-k="${k}" data-v="${escapeHtml(v)}">${label}</button>`;
    return `<div class="sh"><div class="t"><h3>필터</h3><div class="small muted">고른 조건은 폴더와 목록 모두에 적용돼요.</div></div><button class="iconbtn" data-act="sheet-close" aria-label="닫기">${icon('close')}</button></div>
      ${m.group !== 'kind' ? `<div class="sec">종류</div><div class="mbar">${chip('kind', 'all', '전체')}${Object.entries(FACT_KO).filter(([k]) => counts[k]).map(([k, ko]) => chip('kind', k, `${KIND_IC[k]} ${ko} ${counts[k]}`)).join('')}</div>` : ''}
      <div class="sec">누가 쓴 메시지</div><div class="mbar">${chip('role', 'all', '전체')}${chip('role', 'user', '나')}${chip('role', 'char', escapeHtml(characterCache.name || '캐릭터'))}</div>
      <div class="sec">순서</div><div class="mbar">${chip('sort', 'new', '최신순')}${chip('sort', 'old', '오래된순')}</div>
      <div class="row" style="margin-top:18px"><button class="btn g" data-act="mf" data-k="kind" data-v="all">종류 풀기</button><button class="btn g" data-act="mf" data-k="role" data-v="all">누가 풀기</button><button class="btn p" data-act="sheet-close" style="margin-left:auto">다 됐어요</button></div>`;
  }
  function memExplorer() {
    const m = ui.mem;
    if (!facts.length) return `<section class="card"><div class="empty"><div class="big">🏛️</div><b>아직 기억이 없어요</b>대화를 이어 가면 보낼 때마다 뒤에서 문장 기억으로 정리돼요.</div></section>`;
    const base = memBase(m);
    const folders = memFolders(m, base);
    if (m.folder && m.folder !== '*' && !folders.some(x => x.id === m.folder)) m.folder = null;
    const sel = m.folder ?? '*';
    const nFilter = (m.kind !== 'all' && m.group !== 'kind' ? 1 : 0) + (m.role !== 'all' ? 1 : 0);
    const foldBtn = (id, label, sub, n, ic) => `<button class="fold${sel === id ? ' on' : ''}" data-act="mfold" data-v="${escapeHtml(id)}"><span class="ic">${ic ?? avatar(label, 'sm')}</span><div class="t"><b>${label}</b>${sub ? `<span>${escapeHtml(sub)}</span>` : ''}</div><span class="n">${n}</span></button>`;
    const allMsgs = new Set(base.map(f => f.mi)).size;
    const fold = [foldBtn('*', '전체', `문장 ${base.length}개`, allMsgs, '🏛️'), ...folders.map(x => foldBtn(x.id, m.group === 'person' ? pname(x.label) : escapeHtml(x.label), m.group === 'date' ? x.sub : `문장 ${x.n}개`, x.msgs.size, x.ic))].join('');
    const cur = sel === '*' ? null : folders.find(x => x.id === sel);
    const curLabel = cur ? (m.group === 'person' ? pname(cur.label) : escapeHtml(cur.label)) : '전체';
    const { total, html } = msgCards(inFolder(m, base), m.sort, m.limit);
    return `<div class="mtool"><div class="seg">${Object.entries(MEM_GROUPS).map(([k, lb]) => `<button class="${m.group === k ? 'on' : ''}" data-act="mgroup" data-v="${k}">${lb}</button>`).join('')}</div><button class="btn sm g" data-act="mfilter">${icon('settings', 16)} 필터${nFilter ? ` ${nFilter}` : ''}</button></div>
      <div class="mx${m.folder ? ' in' : ''}">
        <aside class="mfold">${fold}</aside>
        <section class="mcont">
          <div class="crumb"><button class="back" data-act="mback">‹ 폴더</button><span>${MEM_GROUPS[m.group]}</span><span>›</span><b>${curLabel}</b><span class="sp"></span><span>메시지 ${total}개 · ${m.sort === 'old' ? '오래된순' : '최신순'}</span></div>
          ${html || '<div class="empty small">조건에 맞는 기억이 없어요.</div>'}
          ${total > m.limit ? `<div class="row" style="justify-content:center;margin:14px 0"><button class="btn" data-act="mmore">더 보기 (${Math.min(30, total - m.limit)}개)</button><button class="btn g" data-act="mmore" data-all="1">전부 보기</button></div>` : ''}
        </section>
      </div>`;
  }
  function renderMemory() {
    const s = ui.search;
    memClk = new Map();
    const head = `<form class="search" data-act="search-form" onsubmit="return false">${icon('search', 18)}<input id="mq" placeholder="무엇을 찾을까요? (예: 바다 약속, 하윤 비밀)" value="${escapeHtml(s.q)}" autocomplete="off" enterkeyhint="search"><button class="btn sm p" data-act="search">찾기</button></form>
      <div class="seg"><button class="${!s.pins ? 'on' : ''}" data-act="mtab" data-v="all">전체 ${facts.length}</button><button class="${s.pins ? 'on' : ''}" data-act="mtab" data-v="pins">📌 고정 ${story.pins.length}</button></div>`;
    if (s.pins) {
      const pins = story.pins.map(chunkByCk).filter(Boolean);
      return `${head}<section class="card" style="padding:4px 14px;margin-top:12px"><div class="list">${pins.length ? pins.map(c => chunkCard(c)).join('') : '<div class="empty"><div class="big">📌</div><b>고정한 기억이 없어요</b>기억을 눌러 📌 고정하면 매번 답장에 넣어요.</div>'}</div></section>`;
    }
    if (s.q.trim()) {
      const r = s.busy ? null : msgCards(s.results ?? [], 'keep', 40, s.q);
      return `${head}<div class="crumb" style="margin-top:12px"><span>찾기</span><span>›</span><b>${escapeHtml(s.q)}</b><span class="sp"></span>${r ? `<span>메시지 ${r.total}개 · 가까운 순</span>` : ''}</div>
        ${s.busy ? '<div class="empty">찾는 중…</div>' : r.html || '<div class="empty"><b>찾은 게 없어요</b>다른 말로 찾아보세요.</div>'}`;
    }
    return head + memExplorer();
  }

  // ══ 연출 카드 탭: 묶음(왼쪽 · 폰은 목록) → 카드 (오른쪽 · 폰은 눌러서) ══
  function renderCards() {
    const cfg = settings, c = ui.cards, off = new Set(cfg.dirOff);
    const packs = packList(cfg);
    if (c.pack && !packs.some(p => p.id === c.pack)) c.pack = null;
    const sel = c.pack ?? packs[0].id;
    const cur = packs.find(p => p.id === sel);
    const head = `<div class="ctool"><label class="ctl"><b>감독</b>${sw('director', cfg.director, 'quick')}</label><div class="seg mini">${Object.entries(DIR_FREQ_KO).map(([k, [t]]) => `<button class="${cfg.dirFreq === k ? 'on' : ''}" data-act="dirfreq" data-v="${k}">${t}</button>`).join('')}</div><span class="meta">켜진 카드 ${allDirCards(cfg).length}장${cfg.director ? '' : ' · 감독이 꺼져 있어요'}</span></div>`;
    const fold = packs.map(p => { const n = packCards(p.id, cfg).length, on = cfg.dirPacks.includes(p.id); return `<div class="fold${sel === p.id ? ' on' : ''}${on ? '' : ' off'}" role="button" tabindex="0" data-act="cpack" data-v="${p.id}"><span class="ic">${escapeHtml(p.icon)}</span><div class="t"><b>${escapeHtml(p.name)}</b><span>${n}장 · ${escapeHtml(p.desc)}</span></div><button class="tg${on ? ' on' : ''}" data-act="dirpack" data-v="${p.id}" aria-label="${on ? '끄기' : '켜기'}" title="${on ? '이 묶음 쓰는 중 · 누르면 끄기' : '꺼짐 · 누르면 켜기'}"></button></div>`; }).join('');
    const newPack = c.newPack
      ? `<div class="newpack"><input class="inp" id="np-icon" maxlength="2" placeholder="📁" style="width:52px;text-align:center"><input class="inp" id="np-name" maxlength="20" placeholder="묶음 이름 (예: 학원물)" style="flex:1"><button class="btn sm p" data-act="pack-create">만들기</button><button class="btn sm g" data-act="pack-new-cancel">취소</button></div>`
      : '<button class="btn g block" data-act="pack-new">+ 새 묶음</button>';
    const q = c.q.trim();
    let list = packCards(sel, cfg);
    if (q) list = list.filter(x => `${x.name} ${x.when} ${x.text}`.includes(q));
    const isMine = (x) => cfg.dirCustom.some(y => y.id === x.id);
    const cards = list.length ? `<div class="cgrid">${list.map(x => { const isOff = off.has(x.id); return `<div class="ccard${isOff ? ' off' : ''}"><div class="ch2"><b>${escapeHtml(x.name)}</b>${x.aff != null ? `<span class="tag">${x.aff >= 0 ? `가까움 ${x.aff}+` : `사이 나쁨 ${x.aff}↓`}</span>` : ''}<button class="tg-s btn sm ${isOff ? '' : 'g'}" data-act="card-toggle" data-id="${escapeHtml(x.id)}">${isOff ? '꺼짐' : '켜짐'}</button></div>${x.when ? `<div class="when">언제 · ${ph(x.when)}</div>` : ''}<div class="txt">${ph(x.text)}</div>${isMine(x) ? `<div class="acts"><span class="tag">내 카드</span><button class="btn sm g" data-act="card-edit" data-id="${escapeHtml(x.id)}">고치기</button><button class="btn sm g" data-act="card-del" data-id="${escapeHtml(x.id)}">지우기</button></div>` : ''}</div>`; }).join('')}</div>`
      : `<div class="empty small">${q ? '찾는 카드가 없어요.' : '아직 카드가 없어요. 위 [+ 카드]로 하나 써 보세요.'}</div>`;
    const packHead = c.packEdit && cur?.user
      ? `<div class="newpack" style="margin-bottom:10px"><input class="inp" id="pe-icon" maxlength="2" value="${escapeHtml(cur.icon)}" style="width:52px;text-align:center"><input class="inp" id="pe-name" maxlength="20" value="${escapeHtml(cur.name)}" style="flex:1"><button class="btn sm p" data-act="pack-save">저장</button><button class="btn sm g" data-act="pack-edit-cancel">취소</button></div>`
      : `<div class="crumb"><button class="back" data-act="cback">‹ 묶음</button><b>${escapeHtml(cur?.icon ?? '')} ${escapeHtml(cur?.name ?? '')}</b><span>· ${packCards(sel, cfg).length}장${cfg.dirPacks.includes(sel) ? '' : ' · 꺼짐'}</span><span class="sp"></span>${cur?.user ? '<button data-act="pack-edit">이름 바꾸기</button><button data-act="pack-del">지우기</button>' : ''}<button class="btn sm p" data-act="card-new">+ 카드</button></div>`;
    const io = !cur?.mine ? '' : `<details class="more"${keepOpen('dir-io', false)}><summary>가져오기 · 내보내기 (JSON)</summary>
        <div class="help" style="margin:6px 0">카드 묶음(JSON)을 붙여 넣고 가져오기를 누르면 이 묶음에 더해져요. 친구와 나눌 땐 아래 글을 복사하세요.</div>
        <textarea class="inp" id="dc-json" rows="5" spellcheck="false">${escapeHtml(JSON.stringify(packCards(sel, cfg).map(({ name, when, text, aff, promise }) => ({ name, when, text, ...(aff != null ? { aff } : {}), ...(promise ? { promise } : {}) })), null, 1))}</textarea>
        <div class="row" style="margin-top:8px"><button class="btn" data-act="dir-import">가져오기</button><button class="btn g" data-act="dir-copy">복사</button></div></details>`;
    return `${head}
      <div class="mx${c.pack ? ' in' : ''}" style="margin-top:14px">
        <aside class="mfold">${fold}${newPack}</aside>
        <section class="mcont">
          ${packHead}
          <div class="search" style="margin-bottom:10px">${icon('search', 18)}<input id="cq" placeholder="카드 찾기" value="${escapeHtml(c.q)}" autocomplete="off"></div>
          ${cards}${io}
        </section>
      </div>`;
  }

  function cardFormSheet() {
    const cfg = settings, sh = ui.sheet;
    const editing = sh.edit ? cfg.dirCustom.find(x => x.id === sh.edit) : null;
    const pk = packList(cfg).find(p => p.id === (editing?.pack ?? sh.pack));
    return `<div class="sh"><div class="t"><h3>${editing ? '카드 고치기' : '새 카드'}</h3><div class="small muted">${escapeHtml(pk?.icon ?? '')} ${escapeHtml(pk?.name ?? '내 카드')} 묶음 · 장면이 맞으면 Jev가 골라요</div></div><button class="iconbtn" data-act="sheet-close" aria-label="닫기">${icon('close')}</button></div>
      <div class="col" style="gap:8px">
        <input class="inp" id="cc-name" maxlength="40" placeholder="이름 (예: 말없는 질투)" value="${escapeHtml(editing?.name ?? '')}">
        <textarea class="inp" id="cc-text" rows="4" maxlength="400" placeholder="연출: {char}가 괜히 말수가 줄어든다. 이유는 말하지 않는다.">${escapeHtml(editing?.text ?? '')}</textarea>
        <div class="phs"><span class="xs dim">넣기</span><button class="chip" data-act="ph-insert" data-v="{char}">캐릭터</button><button class="chip" data-act="ph-insert" data-v="{user}">나</button><button class="chip" data-act="ph-insert" data-v="{other}">다른 인물</button><span class="xs dim">· 조사는 알아서 맞춰요</span></div>
        <details class="more"${keepOpen('cc-more', !!(editing?.when || editing?.aff != null))}><summary>언제 쓸지 · 조건 (선택)</summary>
          <input class="inp" id="cc-when" maxlength="160" placeholder="언제 (예: {other}가 {user} 곁에 있을 때)" value="${escapeHtml(editing?.when ?? '')}" style="margin-top:6px">
          <input class="inp" id="cc-aff" type="number" inputmode="numeric" min="-10" max="10" placeholder="가까움 조건 (예: 3 = 3 이상일 때만, 비우면 없음)" value="${editing?.aff ?? ''}" style="margin-top:6px">
        </details>
        <div class="row" style="justify-content:flex-end;gap:6px;margin-top:4px"><button class="btn g" data-act="sheet-close">취소</button><button class="btn p" data-act="card-save">${editing ? '저장' : '추가'}</button></div>
      </div>`;
  }

  // ══ 시트: 인물 · 기억 ══
  function renderSheet() {
    const s = ui.sheet;
    const inner = s.type === 'person' ? personSheet(s.name) : s.type === 'chunk' ? chunkSheet(s.ck) : s.type === 'dircards' ? dirSheet() : s.type === 'memfilter' ? memFilterSheet() : s.type === 'cardform' ? cardFormSheet() : '';
    return inner;
  }
  const PH = { char: '캐릭터', user: '나', other: '다른 인물' };
  const PH_J = { 이: ['이', '가'], 가: ['이', '가'], 은: ['은', '는'], 는: ['은', '는'], 을: ['을', '를'], 를: ['을', '를'], 과: ['과', '와'], 와: ['과', '와'] };
  const ph = (t) => escapeHtml(t).replace(/{(char|user|other)}(이|가|은|는|을|를|과|와)?/g, (_, k, j) => `<span class="ph">${PH[k]}</span>${j ? PH_J[j][hasBatchim(PH[k]) ? 0 : 1] : ''}`);
  function dirSheet() {
    const cfg = settings, pid = ui.sheet.pack ?? 'basic';
    const off = new Set(cfg.dirOff);
    const list = packCards(pid, cfg);
    const editing = pid === 'custom' && ui.sheet.edit ? cfg.dirCustom.find(c => c.id === ui.sheet.edit) : null;
    const tags = (c) => [c.aff != null ? `<span class="tag">${c.aff >= 0 ? `가까움 ${c.aff}+` : `사이 나쁨 ${c.aff}↓`}</span>` : '', c.promise ? '<span class="tag">약속 있을 때</span>' : '', /\{other\}/.test(c.text + c.when) ? '<span class="tag">다른 인물 필요</span>' : ''].join('');
    const form = pid !== 'custom' ? '' : `<div class="subbox" style="margin-bottom:12px">
        <div class="lb" style="margin-bottom:8px">${editing ? '카드 고치기' : '새 카드'}</div>
        <div class="col">
          <input class="inp" id="dc-name" maxlength="40" placeholder="이름 (예: 말없는 질투)" value="${escapeHtml(editing?.name ?? '')}">
          <input class="inp" id="dc-when" maxlength="160" placeholder="언제 (예: {other}가 {user} 곁에 있을 때)" value="${escapeHtml(editing?.when ?? '')}">
          <textarea class="inp" id="dc-text" rows="3" maxlength="400" placeholder="연출 (예: {char}가 괜히 말수가 줄어든다. 이유는 말하지 않는다.)">${escapeHtml(editing?.text ?? '')}</textarea>
          <div class="help">{char}는 캐릭터, {user}는 나, {other}는 장면의 다른 인물 이름으로 바뀌어요. 내 행동이나 말은 정하지 않게 쓰는 게 좋아요.</div>
          <div class="row"><input class="inp" id="dc-aff" type="number" inputmode="numeric" min="-10" max="10" placeholder="가까움 조건 (비우면 없음)" value="${editing?.aff ?? ''}" style="flex:1;min-width:150px"><button class="btn p" data-act="dir-save">${editing ? '저장' : '추가'}</button>${editing ? '<button class="btn g" data-act="dir-cancel">취소</button>' : ''}</div>
        </div></div>`;
    const items = list.length ? list.map(c => `<div class="dcard${off.has(c.id) ? ' off' : ''}"><div class="t"><b>${escapeHtml(c.name)}</b> ${tags(c)}<div class="when">언제 · ${ph(c.when || '—')}</div><div class="txt">${ph(c.text)}</div>${pid === 'custom' ? `<div class="row" style="margin-top:6px"><button class="btn sm g" data-act="dir-edit" data-id="${escapeHtml(c.id)}">고치기</button><button class="btn sm g" data-act="dir-del" data-id="${escapeHtml(c.id)}">지우기</button></div>` : ''}</div><label class="sw"><input type="checkbox" data-dir-toggle="${escapeHtml(c.id)}"${off.has(c.id) ? '' : ' checked'} aria-label="${escapeHtml(c.name)} 쓰기"><span></span></label></div>`).join('')
      : '<div class="empty small">아직 내 카드가 없어요. 위에서 하나 만들어 보세요.</div>';
    const io = pid !== 'custom' ? '' : `<details class="more"${keepOpen('dir-io', false)}><summary>가져오기 · 내보내기</summary>
        <div class="help" style="margin:6px 0">카드 묶음(JSON)을 붙여 넣고 가져오기를 누르면 내 카드에 더해져요. 친구와 나눌 땐 아래 글을 복사하세요.</div>
        <textarea class="inp" id="dc-json" rows="5" spellcheck="false">${escapeHtml(JSON.stringify(cfg.dirCustom.map(({ name, when, text, aff, promise }) => ({ name, when, text, ...(aff != null ? { aff } : {}), ...(promise ? { promise } : {}) })), null, 1))}</textarea>
        <div class="row" style="margin-top:8px"><button class="btn" data-act="dir-import">가져오기</button><button class="btn g" data-act="dir-copy">복사</button></div></details>`;
    return `<div class="sh"><div class="t"><h3>연출 카드</h3><div class="small muted">켠 카드 중 지금 장면에 가까운 8장을 추리고, Jev가 하나를 고르거나 안 골라요.</div></div><button class="iconbtn" data-act="sheet-close" aria-label="닫기">${icon('close')}</button></div>
      <div class="hscroll">${packChips(cfg, 'dsheet-pack', pid)}</div>
      ${cfg.dirPacks.includes(pid) ? '' : `<div class="alert warn" style="margin-bottom:10px"><div class="t"><b>이 묶음은 꺼져 있어요</b><div class="d">켜야 이 카드들을 써요.</div></div><button class="btn" data-act="dirpack" data-v="${pid}">켜기</button></div>`}
      ${form}${items}${io}`;
  }
  function personSheet(name) {
    const p = story.people[name];
    if (!p) return '<div class="empty">인물을 찾을 수 없어요.</div>';
    const rels = pairsOf(name).sort((a, b) => b.co - a.co);
    const th = story.threads.filter(t => t.who === name || t.to === name).slice().reverse().slice(0, 6);
    const acts = [];
    const forms = nameForms(story.people[name] ?? { name, aliases: [] });
    for (let i = facts.length - 1; i >= 0 && acts.length < 8; i--) if ([0, 1, 2].some(j => forms.some(n => facts[i].slots[j]?.includes(n)))) acts.push(facts[i]);
    const others = personList().filter(x => x.name !== name && !x.hidden);
    const titleWarn = isTitleName(name) ? `<div class="titlewarn"><div>「${escapeHtml(name)}」${hasBatchim(name) ? '은' : '는'} 호칭이라 누군지 확실하지 않아요. 여러 사람을 이렇게 불렀으면 <b>숨기기</b>, 한 사람이면 그 사람과 <b>합치기</b>.</div><div class="row" style="gap:6px"><button class="btn sm d" data-act="hide-person" data-name="${escapeHtml(name)}">숨기기</button>${others.length ? `<select class="sel" id="merge-in" style="flex:1;min-width:120px"><option value="">합칠 사람…</option>${others.map(o => `<option value="${escapeHtml(o.name)}">${escapeHtml(o.name)}</option>`).join('')}</select><button class="btn sm" data-act="merge" data-name="${escapeHtml(name)}">합치기</button>` : ''}</div></div>` : '';
    return `<div class="sh">${avatar(name, 'lg')}<div class="t"><h3>${pname(name)}</h3><div class="small muted">${p.kind === 'char' ? '캐릭터 · ' : p.kind === 'persona' ? '나 · ' : ''}${p.count}번 등장${p.first != null ? ` · 처음 #${p.first + 1} · 최근 #${(p.last ?? p.first) + 1}` : ''}</div>${p.aliases.length ? `<div class="hint">${p.aliases.map(a => `<span class="chip">${escapeHtml(a)}</span>`).join('')}</div>` : ''}</div><button class="iconbtn" data-act="sheet-close" aria-label="닫기">${icon('close')}</button></div>
      ${titleWarn}
      ${(() => { const { all } = topTags(name, 0, 0); return settings.tags !== false && all.length ? `<div class="sec">태그 <span class="dim xs" style="font-weight:400">눌러서 원문 · × 로 지우기</span></div><div class="tagchips">${all.slice(0, 16).map(([w, t]) => `<span class="tchip ${t.s > 0 ? 'pos' : 'neg'}"><button data-act="chunk" data-ck="${escapeHtml(t.ck ?? '')}" title="${escapeHtml(t.q ?? '')}">${t.s > 0 ? '💚' : '💔'} ${escapeHtml(w)} <b>${Math.abs(t.s)}</b></button><button class="x" data-act="tag-del" data-name="${escapeHtml(name)}" data-w="${escapeHtml(w)}" aria-label="지우기">×</button></span>`).join('')}</div>` : ''; })()}
      <div class="sec">관계</div>
      ${rels.length ? rels.map(r => { const o = r.a === name ? r.b : r.a; const w = Math.abs(r.aff) * 5; return `<div class="relrow">${avatar(o, 'sm')}<div style="flex:1;min-width:0"><div class="row" style="justify-content:space-between"><b class="small">${pname(o)}</b><select class="sel" style="width:auto;min-height:32px;padding:2px 8px;font-size:12.5px" data-act="reltype" data-a="${escapeHtml(r.a)}" data-b="${escapeHtml(r.b)}"><option value="">${r.co}번 함께</option>${REL_GROUPS.map(([g, ks]) => `<optgroup label="${g}">${ks.map(k => `<option value="${k}"${r.type === k ? ' selected' : ''}>${REL_TYPES[k]}</option>`).join('')}</optgroup>`).join('')}</select><button class="btn sm g" style="margin-left:6px" data-act="relmerge" data-from="${escapeHtml(o)}" data-into="${escapeHtml(name)}" title="같은 사람이면 합치기">합치기</button></div>
          ${relDir(r.type) ? `<div class="mbar" style="margin-top:6px"><span class="lb2">누가 ${relDir(r.type)[0]}?</span>${[r.a, r.b].map(n => `<button class="chip${r.who === n ? ' on' : ''}" data-act="relwho" data-a="${escapeHtml(r.a)}" data-b="${escapeHtml(r.b)}" data-who="${escapeHtml(n)}">${pname(n)}</button>`).join('')}</div>` : ''}
          <div class="row" style="gap:6px;margin-top:6px"><button class="iconbtn" style="width:32px;height:32px" data-act="aff" data-a="${escapeHtml(r.a)}" data-b="${escapeHtml(r.b)}" data-d="-1" aria-label="더 멀게">${icon('minus', 16)}</button><span class="affbar"><i style="${r.aff >= 0 ? `left:50%;width:${w}%;background:var(--warm)` : `right:50%;width:${w}%;background:var(--cold)`}"></i></span><button class="iconbtn" style="width:32px;height:32px" data-act="aff" data-a="${escapeHtml(r.a)}" data-b="${escapeHtml(r.b)}" data-d="1" aria-label="더 가깝게">${icon('plus', 16)}</button><span class="xs ${r.aff >= 2 ? 'warnc' : 'dim'}" style="min-width:56px;text-align:right">${affLabel(r.aff)} ${r.aff > 0 ? '+' : ''}${r.aff}</span></div>
          ${settings.intim || r.intim?.n ? `<div class="row" style="gap:6px;margin-top:6px"><span class="xs dim">관계 횟수</span><button class="iconbtn" style="width:28px;height:28px" data-act="intim" data-a="${escapeHtml(r.a)}" data-b="${escapeHtml(r.b)}" data-d="-1" aria-label="관계 횟수 −1">${icon('minus', 14)}</button><b class="small" style="min-width:18px;text-align:center">${r.intim?.n ?? 0}</b><button class="iconbtn" style="width:28px;height:28px" data-act="intim" data-a="${escapeHtml(r.a)}" data-b="${escapeHtml(r.b)}" data-d="1" aria-label="관계 횟수 +1">${icon('plus', 14)}</button>${r.intim?.firstCk ? `<button class="btn sm g" data-act="chunk" data-ck="${escapeHtml(r.intim.firstCk)}">처음 #${r.intim.first + 1}</button>` : ''}${r.intim?.lastCk && r.intim.n > 1 ? `<button class="btn sm g" data-act="chunk" data-ck="${escapeHtml(r.intim.lastCk)}">최근 #${r.intim.last + 1}</button>` : ''}</div>` : ''}
          ${r.events.length ? `<div class="xs dim" style="margin-top:4px">${r.events.slice(-4).reverse().map(ev => `<button class="btn sm g" data-act="chunk" data-ck="${escapeHtml(ev.ck)}">${ev.d > 0 ? '💗' : '💧'} #${ev.mi + 1}</button>`).join('')}</div>` : ''}</div></div>`; }).join('') : '<div class="small dim">아직 함께 나온 인물이 없어요.</div>'}
      ${th.length ? `<div class="sec">약속 · 비밀</div><div class="col">${th.map(promiseHtml).join('')}</div>` : ''}
      ${acts.length ? `<div class="sec">한 일 · 겪은 일</div><div class="list">${acts.map(f => factItem(f)).join('')}</div>` : ''}
      <div class="sec">고치기</div>
      <div class="col">
        <div class="row"><input class="inp" id="alias-in" placeholder="다른 이름(별명) 추가" style="flex:1;min-width:140px"><button class="btn" data-act="alias" data-name="${escapeHtml(name)}">추가</button></div>
        ${others.length && !titleWarn ? `<div class="row"><select class="sel" id="merge-in" style="flex:1;min-width:140px"><option value="">같은 인물로 합치기…</option>${others.map(o => `<option value="${escapeHtml(o.name)}">${escapeHtml(o.name)}</option>`).join('')}</select><button class="btn" data-act="merge" data-name="${escapeHtml(name)}">합치기</button></div>` : ''}
        ${titleWarn ? '' : `<button class="btn d" data-act="hide-person" data-name="${escapeHtml(name)}">숨기기 (인물이 아니에요)</button>`}
      </div>`;
  }
  function chunkSheet(ck) {
    const c = chunkByCk(ck);
    if (!c) return `<div class="sh"><div class="t"><h3>기억</h3></div><button class="iconbtn" data-act="sheet-close" aria-label="닫기">${icon('close')}</button></div><div class="empty">이 대화는 지금 채팅에 없어요 (지웠거나 고쳤어요).</div>`;
    const pinned = story.pins.includes(ck);
    const prev = chunks[c.id - 1], next = chunks[c.id + 1];
    const fl = factsOfChunk(c);
    const names = settings.story ? peopleIn(c.text) : [];
    const clock = parseStatus(timeline[c.mi]?.text ?? '');
    return `<div class="sh"><div class="t"><h3>#${c.mi + 1} · ${timeline[c.mi]?.role === 'user' ? '나' : escapeHtml(characterCache.name || '캐릭터')}</h3><div class="small muted">${escapeHtml(clockLabel(clock) || `${c.pos + 1}번째 조각`)}</div></div><button class="iconbtn" data-act="sheet-close" aria-label="닫기">${icon('close')}</button></div>
      ${names.length ? `<div class="hint" style="margin:0 0 12px">${names.map(n => `<button class="chip" data-act="person" data-name="${escapeHtml(n)}">${escapeHtml(n)}</button>`).join('')}</div>` : ''}
      ${prev && prev.mi === c.mi ? `<div class="snip dim small" style="margin-bottom:8px">… ${escapeHtml(clip(prev.text, 160))}</div>` : ''}
      <div class="snip" style="color:var(--tx);font-size:15px">${escapeHtml(c.text)}</div>
      ${next && next.mi === c.mi ? `<div class="snip dim small" style="margin-top:8px">${escapeHtml(clip(next.text, 160))} …</div>` : ''}
      <div class="sec">이 부분의 칸 줄 기억</div>${fl.length ? `<div class="col">${fl.map(f => factChips(f.k, f.slots, f.sent)).join('')}</div>` : `<div class="small dim">${factStore.has(timeline[c.mi]?.key) ? '남길 만한 문장이 없었어요.' : '아직 정리 전이에요. 보낼 때 뒤에서 만들어요.'}</div>`}
      <div class="row" style="margin-top:18px"><button class="btn ${pinned ? '' : 'p'} block" data-act="pin" data-ck="${escapeHtml(ck)}">${icon('pin', 18)}${pinned ? '고정 풀기' : '고정 — 매번 답장에 넣기'}</button></div>`;
  }

  // ══ 시작 안내 ══
  function renderOnboard() {
    const o = ui.onboard, d = o.d;
    const steps = `<div class="step">${[0, 1, 2, 3].map(n => `<i class="${n <= o.step ? 'on' : ''}"></i>`).join('')}</div>`;
    const nav = (back, next, label = '다음') => `<div class="row" style="justify-content:space-between;margin-top:18px">${back ? '<button class="btn g" data-act="onb-back">이전</button>' : '<span></span>'}<button class="btn p" data-act="${next}">${label}</button></div>`;
    if (o.step === 0) return `<div class="onb">${steps}<div class="eyebrow">JevArchive</div><h2>대화를 그대로 간직하고,<br>지금 필요한 장면을 꺼내 줘요</h2><p class="lead">요약하지 않아요. 원문을 버리지 않고, 답장마다 Jev가 필요한 조각만 골라 넣어요.</p>
      <div class="card">${[['film', '원문 그대로 기억', 'Risu가 못 보내는 옛날 대화를 조각으로 색인해 두고, 지금 필요한 것만 찾아 넣어요.'], ['people', '인물 · 관계 · 약속', '누가 누구와 가까워졌는지, 어떤 약속이 남았는지 알아서 정리해요.'], ['spark', '감독 힌트 (선택)', '템포 · 꺼낼 약속 · 분위기를 짧게 귀띔해서 이야기가 살아 있게.'], ['db', '가볍게', '서버 없이 플러그인 하나. 폰에서도 돼요. 원문은 Risu 채팅 그대로라 따로 저장하지 않아요.']].map(([ic, t, dsc]) => `<div class="feat"><span class="ic">${icon(ic)}</span><div><b>${t}</b><div class="small muted">${dsc}</div></div></div>`).join('')}</div>${nav(false, 'onb-next', '시작하기')}</div>`;
    if (o.step === 1) return `<div class="onb">${steps}<h2>Jev 연결</h2><p class="lead">Jev는 글을 쓰지 않고 "이 조각이 지금 필요해?"만 판단하는 아주 싼 모델이에요.</p><div class="card">${jevFields(d)}</div>${nav(true, 'onb-next')}</div>`;
    if (o.step === 2) return `<div class="onb">${steps}<h2>임베딩</h2><p class="lead">뜻이 비슷한 대화를 빠르게 찾는 데 써요. 모르겠으면 첫 번째를 고르세요.</p><div class="card">${embedFields(d)}</div>${nav(true, 'onb-next')}</div>`;
    const cur = d.memPreset ?? presetOf(d);
    return `<div class="onb">${steps}<h2>기억하는 방식</h2><p class="lead">나중에 설정에서 언제든 바꿀 수 있어요.</p>
      <div class="card"><div class="lb" style="font-weight:600;margin-bottom:8px">얼마나 넣을까요?</div>${presetSeg(cur)}
        <div class="field inline" style="margin-top:8px"><div><div class="lb">인물 · 관계 · 약속 기록</div><div class="help">보낸 뒤 뒤에서 정리해요. 보내기는 느려지지 않아요.</div></div>${sw('story', d.story)}</div>
        <div class="field inline"><div><div class="lb">감독 힌트</div><div class="help">답장마다 템포 · 분위기와 장면에 맞는 연출을 짧게 귀띔해요. 내가 이끌고 싶으면 꺼 두세요.</div></div>${sw('director', d.director)}</div></div>
      <div class="card small muted">토큰을 아끼려면 Risu 설정에서 <b>최대 컨텍스트</b>나 <b>채팅 범위</b>를 줄이세요. 줄어든 만큼 JevArchive가 옛날 대화에서 필요한 부분만 넣어요. Risu 자체 메모리(하이파 · 수파)는 꺼 두세요.</div>
      ${nav(true, 'onb-finish', '완료')}</div>`;
  }

  // ══ 설정 ══
  const opt = (field, value, cur, title, desc, badge) => `<button class="opt${cur === value ? ' on' : ''}" data-act="pick" data-field="${field}" data-value="${value}"><b>${escapeHtml(title)}${badge ? `<span class="badge">${escapeHtml(badge)}</span>` : ''}</b><span>${escapeHtml(desc ?? '')}</span></button>`;
  const sw = (field, on, mode = '') => `<label class="sw"><input type="checkbox" ${mode === 'quick' ? `data-quick="${field}"` : `data-field="${field}"`}${on ? ' checked' : ''}><span></span></label>`;
  function presetSeg(cur) {
    return `<div class="seg">${Object.entries(MEMORY_PRESETS).map(([k, p]) => `<button class="${cur === k ? 'on' : ''}" data-act="preset" data-v="${k}">${p.label}<small>${p.desc}</small></button>`).join('')}<button class="${cur === 'custom' ? 'on' : ''}" data-act="preset-custom">직접<small>숫자 고르기</small></button></div>`;
  }
  function keyHint(d) {
    const k = cleanKey(d.jevKey);
    if (!k) return '';
    const bad = keyProblem(k, 'Jev');
    if (bad) return `<div class="help err">${escapeHtml(bad)}</div>`;
    if (d.jevPreset === 'openrouter' && !/^sk-or-/.test(k)) return '<div class="help warnc">OpenRouter 키는 보통 sk-or- 로 시작해요.</div>';
    return `<div class="help">${escapeHtml(k.slice(0, 8))}…${escapeHtml(k.slice(-4))} (${k.length}자)</div>`;
  }
  function modelPicker(fieldName, preset, value) {
    const items = (preset.models ?? []).map(m => (typeof m === 'string' ? { id: m, label: m } : m));
    const known = items.some(m => m.id === value);
    const custom = !known || !items.length;
    const options = items.map(m => `<option value="${escapeHtml(m.id)}"${m.id === value ? ' selected' : ''}>${escapeHtml(m.label)}${m.id === preset.model ? ' · 기본' : ''}</option>`).join('');
    return `${items.length ? `<select class="sel" data-model-for="${fieldName}">${options}<option value="__custom"${custom ? ' selected' : ''}>직접 입력…</option></select>` : ''}
      <input class="inp" data-field="${fieldName}" placeholder="모델 이름 (예: ${escapeHtml(preset.model || 'vendor/model')})" value="${escapeHtml(value)}" style="${custom ? '' : 'display:none;'}${items.length ? 'margin-top:6px' : ''}">`;
  }
  const keepOpen = (key, def) => ` data-keep="${escapeHtml(key)}"${(ui.keepOpen.get(key) ?? def) ? ' open' : ''}`;
  function testLine(which) {
    const t = ui.test[which];
    if (!t) return '';
    if (t.running) return '<span class="small dim">확인 중…</span>';
    if (t.warn) return `<span class="small warnc">⚠️ ${escapeHtml(t.msg)}</span>`;
    return t.ok ? `<span class="small ok">✓ ${escapeHtml(t.msg)}</span>` : `<span class="small err">✕ ${escapeHtml(t.msg)}</span>`;
  }
  function jevFields(d) {
    const p = JEV_PRESETS[d.jevPreset];
    return `<div class="opts">${Object.entries(JEV_PRESETS).map(([k, v]) => opt('jevPreset', k, d.jevPreset, v.label, v.desc, v.badge)).join('')}</div>
      <div class="field"><label>API 키 ${p.keyUrl ? `<a class="xs" href="${p.keyUrl}" target="_blank" rel="noopener">키 받는 곳 ↗</a>` : ''}</label><input class="inp" type="password" autocomplete="off" data-field="jevKey" placeholder="${escapeHtml(p.keyHint ?? 'API 키')}" value="${escapeHtml(d.jevKey)}">${keyHint(d)}</div>
      <div class="field"><label>모델</label>${modelPicker('jevModel', p, d.jevModel)}</div>
      <div class="field inline"><div><label>동시 요청</label><div class="help">정리할 때 Jev에 같이 보내는 수 (1~10). 비용은 같고 클수록 빨라요.</div></div><div class="row" style="gap:6px;flex-wrap:nowrap"><button class="iconbtn" style="width:34px;height:34px" data-act="pstep" data-d="-1" aria-label="줄이기">${icon('minus', 16)}</button><input class="inp" type="number" inputmode="numeric" min="1" max="10" data-field="jevParallel" id="jev-par" value="${escapeHtml(d.jevParallel ?? 2)}" style="width:56px;text-align:center;padding:6px"><button class="iconbtn" style="width:34px;height:34px" data-act="pstep" data-d="1" aria-label="늘리기">${icon('plus', 16)}</button></div></div>
      <details class="more"${keepOpen('jev-addr', d.jevPreset === 'custom')}><summary>주소 (보통은 안 바꿔요)</summary><input class="inp" data-field="jevEndpoint" value="${escapeHtml(d.jevEndpoint)}"></details>
      <div class="row" style="margin-top:10px"><button class="btn" data-act="test-jev">연결 테스트</button>${testLine('jev')}</div>`;
  }
  function embedFields(d) {
    const p = EMBED_PRESETS[d.embedPreset];
    return `<div class="opts">${Object.entries(EMBED_PRESETS).map(([k, v]) => opt('embedPreset', k, d.embedPreset, v.label, v.desc, v.badge)).join('')}</div>
      ${p.key === 'own' ? `<div class="field"><label>임베딩 API 키 ${p.keyUrl ? `<a class="xs" href="${p.keyUrl}" target="_blank" rel="noopener">키 받는 곳 ↗</a>` : ''}</label><input class="inp" type="password" autocomplete="off" data-field="embedKey" value="${escapeHtml(d.embedKey)}"></div>` : ''}
      ${p.key === 'jev' ? '<div class="help" style="margin:8px 0">Jev에 넣은 OpenRouter 키를 같이 써요.</div>' : ''}
      ${p.format !== 'local' ? `<div class="field"><label>모델</label>${modelPicker('embedModel', p, d.embedModel)}<div class="help">바꾸면 이 기기 색인을 다시 해요.</div></div>
      <details class="more"${keepOpen('embed-addr', d.embedPreset === 'custom')}><summary>주소 (보통은 안 바꿔요)</summary><input class="inp" data-field="embedEndpoint" value="${escapeHtml(d.embedEndpoint)}"></details>` : ''}
      <div class="row" style="margin-top:10px"><button class="btn" data-act="test-embed">연결 테스트</button>${testLine('embed')}</div>`;
  }
  function packChips(cfg, act, cur) {
    const packs = packList(cfg).map(p => [p.id, p.icon, p.name, packCards(p.id, cfg).length]);
    return packs.map(([k, ic, label, n]) => `<button class="pk${(cur ? cur === k : cfg.dirPacks.includes(k)) ? ' on' : ''}${!cur || cfg.dirPacks.includes(k) ? '' : ' dim'}" data-act="${act}" data-v="${k}">${ic} ${escapeHtml(label)}<small>${n}</small></button>`).join('');
  }
  function renderSettings(st) {
    const d = ui.draft ?? (ui.draft = { ...settings });
    const num = (k, min, max) => `<input class="inp" type="number" inputmode="numeric" min="${min}" max="${max}" data-field="${k}" value="${escapeHtml(d[k])}" style="max-width:140px">`;
    const jp = JEV_PRESETS[d.jevPreset], ep = EMBED_PRESETS[d.embedPreset];
    const dot = (t) => (t?.ok ? '<span class="pill ok"><i></i>연결됨</span>' : t && !t.running && !t.ok ? '<span class="pill bad"><i></i>실패</span>' : '');
    const cur = d.memPreset ?? presetOf(d);
    const sendTraces = debugLog.slice(0, 8);
    return `<section class="card"><div class="ch"><h2>연결</h2></div>
        <details class="more" style="border:0;margin:0;padding:0"${keepOpen('conn-jev', !d.jevKey)}><summary><span style="flex:1"><b style="color:var(--tx)">Jev</b> <span class="dim">· ${escapeHtml(jp.label)} · ${escapeHtml(d.jevModel || jp.model)}</span></span>${d.jevKey ? '' : '<span class="pill bad"><i></i>키 없음</span>'}${dot(ui.test.jev)}</summary>${jevFields(d)}</details>
        <details class="more"${keepOpen('conn-embed', false)}><summary><span style="flex:1"><b style="color:var(--tx)">임베딩</b> <span class="dim">· ${escapeHtml(ep.label)}${ep.format !== 'local' ? ` · ${escapeHtml(d.embedModel || ep.model)}` : ''}</span></span>${dot(ui.test.embed)}</summary>${embedFields(d)}</details>
      </section>
      <section class="card"><div class="ch"><h2>기억 넣기</h2><span class="sp"></span><span class="meta">최대 ${d.budget}토큰 · 후보 ${d.candidates}개</span></div>
        ${presetSeg(cur)}
        <details class="more"${keepOpen('adv-mem', cur === 'custom')}><summary>직접 조절</summary>
          <div class="field inline"><div><label>기억 예산 (토큰)</label><div class="help">한 번에 넣는 기억의 최대 크기. 0이면 안 넣어요.</div></div>${num('budget', 0, 20000)}</div>
          <div class="field inline"><div><label>상태창 줄은 기억에서 빼기</label><div class="help">[상태 | 날짜 | 돈 …] 같은 줄은 기억 문장으로 안 만들고 "방금 흐름"에도 안 넣어요. 현재 상태창은 최근 대화에 이미 있어서요.</div></div>${sw('skipStatus', d.skipStatus !== false)}</div>
          <div class="field inline"><div><label>장면 길이 (글자)</label><div class="help">기억을 고를 때 최근 대화를 메시지 통째로 이만큼까지 보여 줘요. 답장이 길면 늘리세요. 길수록 정확하지만 Jev 비용이 조금 늘어요.</div></div>${num('sceneChars', 1000, 30000)}</div>
          <div class="field inline"><div><label>Jev 후보 수</label><div class="help">많으면 덜 놓치지만 Jev 비용이 늘어요.</div></div>${num('candidates', 4, 80)}</div>
          <div class="field inline"><div><label>이웃 칸 줄</label><div class="help">고른 기억과 같은 메시지의 앞뒤 문장을 몇 개씩 같이 넣을지.</div></div>${num('neighbor', 0, 3)}</div>
          <div class="field inline"><div><label>방금 흐름 (토큰)</label><div class="help">Risu가 막 안 보낸 대화 끝부분을 늘 이만큼. 아직 칸 줄이 없으면 원문으로.</div></div>${num('tailTokens', 0, 2000)}</div>
        </details>
      </section>
      <section class="card"><div class="ch"><h2>이야기</h2><span class="sp"></span><span class="meta">뒤에서 정리 · 보내기는 안 느려져요</span></div>
        <div class="field inline"><div><label>인물 태그 (💚 긍정 · 💔 부정)</label><div class="help">인물마다 좋아하는 것 · 싫어하는 것 · 좋은/나쁜 경험을 점수로 쌓고, 그 인물이 장면에 있을 때 짧게 넣어요. 이야기 정리에 질문 몇 개만 더해요.</div></div>${sw('tags', d.tags !== false)}</div>
        <div class="field inline"><div><label>인물 · 관계 · 약속 기록</label><div class="help">누가 나오는지, 누구와 가까워졌는지, 어떤 약속이 남았는지 정리해요. 메시지 몇 개마다 Jev 1~2번.</div></div>${sw('story', d.story)}</div>
        <div class="field inline"><div><label>관계 횟수 (성인)</label><div class="help">두 사람이 실제로 관계를 가진 횟수를 세요. 회상 · 꿈 · 계획 · 농담은 안 세고, 같은 장면은 한 번만. 인물 페이지에서 고칠 수 있고, 둘이 같이 나올 때만 짧게 넣어요. 이야기 정리에 질문 하나만 더해요.</div></div>${sw('intim', d.intim)}</div>
        <div class="field inline"><div><label>감독 힌트</label><div class="help">답장마다 템포 · 분위기 · 꺼낼 약속을 짧게 귀띔해요. 회상과 같은 Jev 호출이라 호출 수는 안 늘어요. 이야기를 내가 이끌고 싶으면 꺼 두세요.</div></div>${sw('director', d.director)}</div>
        ${d.director ? `<div class="subbox">
          <div class="field inline" style="padding-top:0"><div><label>연출 카드</label><div class="help">미리 써 둔 연출 중 지금 장면에 맞는 걸 Jev가 골라 한 줄 넣어요. 맞는 게 없으면 안 넣어요.</div></div>${sw('dirCards', d.dirCards)}</div>
          ${d.dirCards ? `<div class="field inline"><div><label>장르 자동 맞춤</label><div class="help">Jev가 이 채팅의 장르를 보고, 맞는 장르 묶음만 써요. 기본 · 내 카드는 늘 써요.${(() => { const g = activeGenres(); const K = { romance: '로맨스', daily: '일상', mystery: '미스터리', fantasy: '판타지', horror: '공포' }; return g ? ` 지금 이 채팅: <b>${g.map(x => K[x]).join(' · ')}</b>` : ' 몇 번 보내면 판단해요.'; })()}</div></div>${sw('dirAuto', d.dirAuto)}</div>
          <div class="lb" style="margin:6px 0 8px">얼마나 자주</div><div class="seg">${Object.entries(DIR_FREQ_KO).map(([k, [t, sub]]) => `<button class="${d.dirFreq === k ? 'on' : ''}" data-act="dirfreq" data-v="${k}">${t}<small>${sub}</small></button>`).join('')}</div>
          <div class="lb" style="margin:14px 0 8px">쓸 묶음</div><div class="packs">${packChips(d, 'dirpack')}</div>
          <div class="row" style="margin-top:12px"><button class="btn" data-act="dircards">${icon('film', 16)} 카드 보기 · 추가 (${allDirCards(d).length}장 켜짐)</button></div>` : ''}
        </div>` : ''}
      </section>
      <section class="card"><div class="ch"><h2>넣는 방식</h2></div>
        <div class="field"><label>넣는 위치</label><select class="sel" data-field="injectMode"><option value="last_user"${d.injectMode === 'last_user' ? ' selected' : ''}>최신 입력 바로 앞</option><option value="system"${d.injectMode === 'system' ? ' selected' : ''}>시스템 메시지로</option></select><div class="help">프롬프트에 <b>[jevarchive]</b>를 써 두면 그 자리에 들어가요.</div></div>
        <div class="field"><label>메인 모델에게 하는 안내</label><textarea class="inp" data-field="note" rows="2">${escapeHtml(d.note)}</textarea><div class="help">기억 블록 맨 위 한 줄. 비우면 안 넣어요.</div></div>
      </section>
      <section class="card"><div class="ch"><h2>앱</h2></div>
        <div class="field inline"><div><label>채팅 화면 바로가기</label><div class="help">채팅 화면에 버튼을 띄워요.</div></div>${sw('showButton', d.showButton)}</div>
        <div class="field"><label>Jev 가격 (100만 토큰당 달러)</label><div class="help">"지금" 탭의 예상 비용 계산에만 써요.</div><div class="row" style="gap:6px;margin-top:8px"><span class="dim">$</span><input class="inp" type="number" inputmode="decimal" step="any" min="0" data-field="jevPrice" value="${escapeHtml(d.jevPrice)}" style="max-width:110px"><button class="btn sm g" data-act="usage-reset">사용량 초기화</button></div></div>
        <div class="field inline"><div><label>JevArchive 사용</label><div class="help">끄면 요청을 건드리지 않아요.</div></div>${sw('enabled', d.enabled)}</div>
        <div class="row" style="margin-top:8px"><button class="btn g" data-act="go" data-view="news">업데이트 내역</button><button class="btn g" data-act="onboard">시작 안내 다시 보기</button><button class="btn g" data-act="settings-reset">기본값으로</button></div>
      </section>
      <section class="card"><div class="ch"><h2>정리</h2><span class="sp"></span><span class="meta">${st.storyLeft ? `남은 메시지 ${st.storyLeft}개` : '다 정리됐어요'}</span></div>
        ${ui.progress ? `<div class="small" style="margin-bottom:10px">${escapeHtml(ui.progress)}<div class="progress"><i style="width:${ui.progressPct ?? 30}%"></i></div></div>` : ''}
        <div class="tgrid">
          <button class="tool${st.storyLeft ? ' p' : ''}" data-act="story-all"${storyAll ? ' disabled' : ''}><span class="ic">🧹</span><b>${storyAll ? '정리 중…' : '지금 전부 정리'}</b><span>안 된 메시지로 기억 · 인물 · 약속을 만들어요 (Jev)</span></button>
          <button class="tool" data-act="reread"><span class="ic">🔄</span><b>채팅 다시 읽기</b><span>메시지를 고치거나 지웠는데 반영이 안 될 때</span></button>
        </div>
        <details class="more danger"${keepOpen('danger', false)}><summary>초기화 · 지우기 <span class="dim xs">되돌릴 수 없어요</span></summary>
          <div class="list">
            <div class="item"><div class="t"><b>이야기 기록 초기화</b><span>인물 · 관계 · 약속 · 비밀을 지워요. 문장 기억과 고정은 그대로.</span></div><button class="btn sm d" data-act="story-reset">초기화</button></div>
            <div class="item"><div class="t"><b>문장 기억 지우기</b><span>이 채팅의 기억을 이 기기에서 지워요. 원문은 Risu 채팅에 그대로라 다시 정리하면 돼요.</span></div><button class="btn sm d" data-act="clear">지우기</button></div>
          </div>
        </details>
      </section>
      <section class="card"><div class="ch"><h2>백업</h2></div>
        <div class="help" style="margin:-4px 0 12px">기억 · 인물 · 관계 · 약속 · 비밀을 통째로 저장하고 되살려요.</div>
        <div class="bgrid">
          <div class="bgroup">
            <div class="bh"><span class="ic">📚</span><div><b>채팅 로어북</b><span>채팅을 복사 · 이동하면 같이 따라가요</span></div></div>
            <div class="bstat">${story.backup ? `마지막 백업 ${timeAgo(story.backup.at)} · 기억 ${story.backup.n}개 · ${story.backup.kb}KB` : '아직 백업 안 했어요'}</div>
            <div class="bacts"><button class="btn sm p" data-act="lore-backup">백업</button><button class="btn sm" data-act="lore-restore">되살리기</button></div>
          </div>
          <div class="bgroup">
            <div class="bh"><span class="ic">💾</span><div><b>JSON 파일</b><span>파일로 저장해 두거나 다른 기기로 옮길 때</span></div></div>
            <div class="bstat">지금 기억 ${facts.length}개 · 인물 ${personList().filter(p => !p.hidden).length}명</div>
            <div class="bacts"><button class="btn sm" data-act="json-export">내보내기</button><label class="btn sm">가져오기<input type="file" id="ja-imp" accept=".json,application/json" style="display:none"></label></div>
          </div>
        </div>
      </section>
      <section class="card"><details class="more" style="border:0;margin:0;padding:0"${keepOpen('diag', false)}><summary><b style="color:var(--tx)">진단</b><span class="dim xs" style="margin-left:6px">단계별 걸린 시간</span></summary>
        ${sendTraces.length ? sendTraces.map(t => `<div class="trace"><div class="row" style="justify-content:space-between"><b>${t.kind === 'send' ? '보낼 때' : t.kind === 'story' ? '이야기 정리 (뒤에서)' : '색인'}</b><span class="dim">${timeAgo(t.at)} · <b style="color:var(--tx)">${secs(t.ms)}</b></span></div>${t.steps.map(x => `<div class="row" style="justify-content:space-between"><span>${escapeHtml(x.name)}${x.detail ? ` <span class="dim">· ${escapeHtml(x.detail)}</span>` : ''}</span><span>${secs(x.ms)}</span></div>`).join('')}${t.note ? `<div class="dim">${escapeHtml(t.note)}</div>` : ''}</div>`).join('') : '<div class="small dim">메시지를 보내면 쌓여요.</div>'}
        <div class="xs dim" style="margin-top:8px">Jev ${stats.jevCalls}번 · 임베딩 ${stats.embedCalls}번 (이번 실행)</div>
      </details></section>`;
  }

  // ── 설정 자동 저장: 화면 전체를 읽어 잠깐 뒤 저장. 탭을 옮기거나 닫으면 바로 ──
  function readForm(base) {
    const d = { ...base };
    for (const el of document.querySelectorAll('[data-field]')) {
      if (el.tagName === 'BUTTON') continue;
      const k = el.dataset.field;
      if (el.type === 'checkbox') d[k] = el.checked;
      else if (el.type === 'number') d[k] = el.value === '' ? base[k] : Number(el.value);
      else d[k] = el.value;
    }
    return d;
  }
  function currentDraft() {
    if (ui.onboard) return (ui.onboard.d = readForm(ui.onboard.d));
    if (ui.view === 'settings') return (ui.draft = readForm(ui.draft ?? settings));
    return settings;
  }
  function setSaved(text) {
    ui.saved = text;
    const el = document.querySelector('.top .pill.ok');
    if (el) el.lastChild.textContent = text;
    else if (text) { const h = document.querySelector('.top .sub'); if (h) h.insertAdjacentHTML('afterend', `<span class="pill ok"><i></i>${escapeHtml(text)}</span>`); }
    if (el && !text) el.remove();
    const top = document.getElementById('ja-top');
    if (top) top.__html = null;   // 직접 고쳤으니 다음 그리기 때 다시 쓰게
  }
  function scheduleSettingsSave(delay = 500) {
    if (ui.onboard || ui.view !== 'settings') return;
    ui.draft = readForm(ui.draft ?? settings);
    setSaved('저장 중…');
    clearTimeout(ui.saveTimer);
    ui.saveTimer = setTimeout(() => { void flushSettingsSave(); }, delay);
  }
  async function flushSettingsSave() {
    clearTimeout(ui.saveTimer);
    ui.saveTimer = null;
    if (!ui.draft) return;
    const before = embedProfile();
    const draft = ui.draft;
    try { await saveSettings(draft); } catch (error) { setSaved(''); toast(String(error?.message ?? error)); return; }
    if (ui.draft === draft) ui.draft = { ...settings };
    setSaved('저장됨');
    setTimeout(() => { if (ui.saved === '저장됨') setSaved(''); }, 2000);
    if (embedProfile() !== before) toast('임베딩이 바뀌었어요. 다음에 보낼 때(또는 지금 전부 색인) 다시 색인해요.');
  }
  async function patchSettings(p) {
    const inSettings = ui.view === 'settings' && !ui.onboard;
    const base = inSettings ? readForm(ui.draft ?? settings) : settings;
    const next = { ...base, ...p };
    if (inSettings) ui.draft = next;
    await saveSettings(next);
    if (inSettings && ui.draft === next) ui.draft = { ...settings };
  }
  function pickPreset(d, f, value) {
    if (f === 'jevPreset') { const p = JEV_PRESETS[value]; return { ...d, jevPreset: value, jevEndpoint: p.endpoint, jevModel: p.model }; }
    if (f === 'embedPreset') { const p = EMBED_PRESETS[value]; return { ...d, embedPreset: value, embedEndpoint: p.endpoint ?? '', embedModel: p.model ?? '' }; }
    return { ...d, [f]: value };
  }
  async function runTest(which) {
    const d = sanitizeSettings(currentDraft());
    ui.test[which] = { running: true };
    render();
    const started = Date.now();
    try {
      if (which === 'jev') {
        const a = await callJev('[STORY]\n서진은 민우에게 토요일에 바다에 가자고 약속했다.', { t: { type: 'noul', instructions: 'Did 서진 make a promise about going to the sea?' } }, d);
        const p = Number(a?.t?.noul ?? 0);
        ui.test.jev = p > 0.5 ? { ok: true, msg: `연결됨 · ${Date.now() - started}ms` } : { warn: true, msg: `연결은 됐지만 판단이 이상해요 (${Math.round(p * 100)}%). 모델을 확인해 보세요.` };
      } else {
        const [a, b, c] = await embedTexts(['토요일에 바다에 가기로 약속했다', '주말에 해변 가자고 했다', '검은 성의 기사단'], '연결 테스트', d);
        const dt = (x, y) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * y[i]; return s; };
        const near = dt(a, b), far = dt(a, c);
        ui.test.embed = near > far ? { ok: true, msg: `연결됨 · ${Date.now() - started}ms · ${a.length}차원` } : { warn: true, msg: `연결은 됐지만 뜻 구분이 약해요 (${near.toFixed(2)} / ${far.toFixed(2)}).` };
      }
    } catch (error) { ui.test[which] = { ok: false, msg: String(error?.message ?? error) }; }
    render();
  }

  // ══ 이벤트 ══
  function bindOnce() {
    if (ui.bound) return;
    ui.bound = true;
    document.body.addEventListener('click', (e) => { void onClick(e); });
    document.body.addEventListener('change', (e) => { void onChange(e); });
    document.body.addEventListener('wheel', (e) => {
      const el = e.target.closest?.('[data-x]');
      if (!el || el.scrollWidth <= el.clientWidth + 2 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const max = el.scrollWidth - el.clientWidth;
      if ((e.deltaY > 0 && el.scrollLeft >= max - 1) || (e.deltaY < 0 && el.scrollLeft <= 0)) return;
      e.preventDefault();
      // 카드가 칸에 맞춰 붙어서(스냅) 조금씩 밀면 제자리로 돌아온다 → 휠 한 번에 카드 한 장씩
      el.__acc = (el.__acc ?? 0) + e.deltaY;
      if (Math.abs(el.__acc) < 40) return;
      const step = (el.firstElementChild?.getBoundingClientRect().width ?? 260) + 10;
      el.scrollBy({ left: Math.sign(el.__acc) * step, behavior: 'smooth' });
      el.__acc = 0;
    }, { passive: false });
    // PC ↔ 폰 너비가 바뀌면 관계도를 그 모양에 맞게 다시
    let lastWide = wide();
    globalThis.addEventListener?.('resize', () => { const w = wide(); if (w !== lastWide) { lastWide = w; if (ui.view === 'people') softRender(); } });
    document.body.addEventListener('toggle', (e) => { const k = e.target?.dataset?.keep; if (k) ui.keepOpen.set(k, e.target.open); }, true);
    document.body.addEventListener('input', (e) => {
      if (e.target.id === 'cq') { ui.cards.q = e.target.value; clearTimeout(ui.cqTimer); ui.cqTimer = setTimeout(() => { const pos = e.target.selectionStart; render(); const el = document.getElementById('cq'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } }, 200); return; }
      if (e.target.id === 'pq') { ui.peopleQ = e.target.value; clearTimeout(ui.pqTimer); ui.pqTimer = setTimeout(() => { const pos = e.target.selectionStart; render(); const el = document.getElementById('pq'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } }, 200); return; }
      if (e.target.id === 'mq') { ui.search.q = e.target.value; return; }
      if (['budget', 'candidates', 'neighbor', 'tailTokens'].includes(e.target.dataset?.field)) {
        const d = ui.onboard ? (ui.onboard.d = readForm(ui.onboard.d)) : (ui.draft = readForm(ui.draft ?? settings));
        d.memPreset = 'custom';
        d.memCustom = Object.fromEntries(['budget', 'candidates', 'neighbor', 'tailTokens'].map(k => [k, Number(d[k])]));
        for (const b of document.querySelectorAll('[data-act="preset"],[data-act="preset-custom"]')) b.classList.toggle('on', b.dataset.act === 'preset-custom');
        const meta = e.target.closest('.card')?.querySelector('.ch .meta');
        if (meta) meta.textContent = `최대 ${d.budget}토큰 · 후보 ${d.candidates}개`;
      }
      if (e.target.dataset?.field && ui.view === 'settings' && !ui.onboard) scheduleSettingsSave(800);
    });
    document.body.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && ui.sheet) { ui.sheet = null; render(); }
      if (e.key === 'Enter' && e.target.id === 'mq') { e.preventDefault(); void doSearch(); }
    });
  }
  async function doSearch() {
    const q = ui.search.q;
    if (!q.trim()) { ui.search.results = null; render(); return; }
    ui.search.busy = true;
    ui.search.pins = false;
    render();
    try { ui.search.results = await searchFacts(q); } catch (error) { toast(String(error?.message ?? error)); ui.search.results = []; }
    ui.search.busy = false;
    render();
    const el = document.getElementById('mq');
    if (el && window.matchMedia?.('(min-width:900px)').matches) el.focus();
  }
  async function onChange(e) {
    const el = e.target;
    if (el.id === 'ja-imp' && el.files?.[0]) {
      try {
        const data = JSON.parse(await el.files[0].text());
        if (data?.app !== 'jevarchive' || !data.story || !data.facts) throw new Error('JevArchive 내보내기 파일이 아니에요.');
        const n = Object.values(data.facts).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0);
        if (!await confirmDialog(`파일(기억 ${n}개${data.chat?.chat ? ` · ${data.chat.chat}` : ''})로 이 채팅의 기억을 바꿀까요?\n지금 기억은 덮어써져요.`, '가져오기')) return;
        await ensureChat();
        if (storyJob) await storyJob.catch(() => {});
        applyBackup(data);
        ui.layout = null;
        render();
        toast(`가져왔어요 · 기억 ${facts.length}개`);
      } catch (error) { toast(String(error?.message ?? error)); }
      finally { el.value = ''; }
      return;
    }
    if (el.dataset?.quick) { await saveSettings({ ...settings, [el.dataset.quick]: el.checked }); ui.draft = null; toast(el.checked ? '켰어요' : '껐어요'); render(); return; }
    if (el.dataset?.act === 'reltype') { const p = pairOf(el.dataset.a, el.dataset.b); if (p) { p.type = el.value || null; p.lock = !!p.type; if (!relDir(p.type)) delete p.who; saveStory(); render(); toast(relDir(p.type) && !p.who ? `누가 ${relDir(p.type)[0]}인지 골라 주세요` : '관계를 바꿨어요 (고정)'); } return; }
    if (el.dataset?.modelFor) {
      const input = el.parentElement?.querySelector(`[data-field="${el.dataset.modelFor}"]`);
      if (!input) return;
      if (el.value === '__custom') { input.style.display = ''; input.focus(); } else { input.value = el.value; input.style.display = 'none'; }
      ui.test[el.dataset.modelFor === 'jevModel' ? 'jev' : 'embed'] = null;
      if (ui.onboard) currentDraft(); else scheduleSettingsSave();
      return;
    }
    if (el.dataset?.dirToggle) {
      const id = el.dataset.dirToggle, off = new Set(settings.dirOff);
      if (el.checked) off.delete(id); else off.add(id);
      await patchSettings({ dirOff: [...off] });
      el.closest('.dcard')?.classList.toggle('off', !el.checked);
      return;
    }
    if (el.dataset?.field) {
      if (ui.onboard) currentDraft(); else scheduleSettingsSave();
      if (!ui.onboard && ['director', 'dirCards', 'story'].includes(el.dataset.field)) render();
    }
  }
  async function leaveSettings() {
    if (ui.view === 'settings' && !ui.onboard) { ui.draft = readForm(ui.draft ?? settings); await flushSettingsSave(); ui.draft = null; }
  }
  async function onClick(e) {
    const el = e.target.closest?.('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'sheet-bg' && e.target !== el) return;
    switch (act) {
      case 'close': await leaveSettings(); ui.open = false; ui.sheet = null; await R.hideContainer(); return;
      case 'go': await leaveSettings(); ui.view = el.dataset.view; ui.sheet = null; render(); document.getElementById('sc')?.scrollTo?.(0, 0); return;
      case 'go-settings': ui.view = 'settings'; render(); return;
      case 'sheet-bg': case 'sheet-close': ui.sheet = null; render(); return;
      case 'person': ui.sheet = { type: 'person', name: el.dataset.name }; render(); return;
      case 'chunk': ui.sheet = { type: 'chunk', ck: el.dataset.ck }; render(); return;
      case 'pin': { const on = togglePin(el.dataset.ck); toast(on ? '고정했어요. 매번 답장에 넣어요.' : '고정을 풀었어요.'); render(); return; }
      case 'thread': { const t = story.threads.find(x => x.id === Number(el.dataset.id)); if (t) { t.status = el.dataset.to; saveStory(); toast(isSecret(t) ? (t.status === 'open' ? '다시 숨긴 비밀로 옮겼어요' : t.status === 'done' ? '드러난 비밀로 옮겼어요' : '비밀 목록에서 뺐어요') : t.status === 'open' ? '다시 열었어요' : t.status === 'done' ? '지켜진 약속으로 옮겼어요' : '취소된 약속으로 옮겼어요'); } render(); return; }
      case 'ttab': ui.threads = el.dataset.v; render(); return;
      case 'tkind': ui.tkind = el.dataset.v; ui.threads = 'open'; render(); return;
      case 'spoil': el.classList.toggle('show'); return;
      case 'go-secrets': await leaveSettings(); ui.view = 'promises'; ui.tkind = 'secret'; ui.threads = 'open'; ui.sheet = null; render(); document.getElementById('sc')?.scrollTo?.(0, 0); return;
      case 'mtab': ui.search.pins = el.dataset.v === 'pins'; render(); return;
      case 'cpack': Object.assign(ui.cards, { pack: el.dataset.v, edit: null, packEdit: false }); render(); document.getElementById('sc').scrollTop = 0; return;
      case 'cback': ui.cards.pack = null; render(); return;
      case 'ph-insert': {
        const ta = document.getElementById('cc-text');
        if (!ta) return;
        const a = ta.selectionStart ?? ta.value.length, b = ta.selectionEnd ?? a;
        ta.value = ta.value.slice(0, a) + el.dataset.v + ta.value.slice(b);
        ta.focus();
        ta.selectionStart = ta.selectionEnd = a + el.dataset.v.length;
        return;
      }
      case 'card-toggle': {
        const id = el.dataset.id, off = new Set(settings.dirOff);
        if (off.has(id)) off.delete(id); else off.add(id);
        const card = el.closest('.ccard');
        card?.classList.toggle('off', off.has(id));
        el.textContent = off.has(id) ? '꺼짐' : '켜짐';
        el.classList.toggle('g', !off.has(id));
        settings.dirOff = [...off];
        void patchSettings({ dirOff: [...off] });
        return;
      }
      case 'card-save': {
        const v = (id) => document.getElementById(id)?.value?.trim() ?? '';
        const card = { name: v('cc-name'), when: v('cc-when'), text: v('cc-text'), aff: v('cc-aff') };
        if (!card.name || !card.text) { toast('이름과 연출은 꼭 써 주세요.'); return; }
        const pack = ui.sheet?.pack ?? ui.cards.pack ?? 'custom';
        const editId = ui.sheet?.edit ?? null;
        const list = editId ? settings.dirCustom.map(x => (x.id === editId ? { ...x, ...card, id: editId } : x)) : [...settings.dirCustom, { ...card, pack, id: `u${Date.now().toString(36)}` }];
        await patchSettings({ dirCustom: list, dirPacks: [...new Set([...settings.dirPacks, pack])] });
        ui.sheet = null;
        render();
        toast(editId ? '고쳤어요.' : '추가했어요. 장면이 맞으면 Jev가 골라요.');
        return;
      }
      case 'card-new': ui.sheet = { type: 'cardform', pack: ui.cards.pack ?? packList()[0].id, edit: null, name: 'new' }; render(); setTimeout(() => document.getElementById('cc-name')?.focus(), 50); return;
      case 'card-edit': ui.sheet = { type: 'cardform', pack: ui.cards.pack, edit: el.dataset.id, name: el.dataset.id }; render(); return;
      case 'card-del': {
        const c = settings.dirCustom.find(x => x.id === el.dataset.id);
        if (!c || !await confirmDialog(`"${c.name}" 카드를 지울까요?`, '지우기', true)) return;
        await patchSettings({ dirCustom: settings.dirCustom.filter(x => x.id !== c.id) });
        render();
        return;
      }
      case 'pack-new': ui.cards.newPack = true; render(); document.getElementById('np-name')?.focus(); return;
      case 'pack-new-cancel': ui.cards.newPack = false; render(); return;
      case 'pack-create': {
        const name = document.getElementById('np-name')?.value?.trim() ?? '';
        if (!name) { toast('묶음 이름을 써 주세요.'); return; }
        const id = `up_${Date.now().toString(36)}`;
        await patchSettings({ dirUserPacks: [...(settings.dirUserPacks ?? []), { id, name, icon: document.getElementById('np-icon')?.value?.trim() || '📁' }], dirPacks: [...new Set([...settings.dirPacks, id])] });
        Object.assign(ui.cards, { newPack: false, pack: id, edit: null });
        ui.sheet = { type: 'cardform', pack: id, edit: null, name: 'new' };
        render();
        setTimeout(() => document.getElementById('cc-name')?.focus(), 50);
        return;
      }
      case 'pack-edit': ui.cards.packEdit = true; render(); return;
      case 'pack-edit-cancel': ui.cards.packEdit = false; render(); return;
      case 'pack-save': {
        const name = document.getElementById('pe-name')?.value?.trim() ?? '';
        if (!name) { toast('묶음 이름을 써 주세요.'); return; }
        await patchSettings({ dirUserPacks: (settings.dirUserPacks ?? []).map(p => (p.id === ui.cards.pack ? { ...p, name, icon: document.getElementById('pe-icon')?.value?.trim() || p.icon } : p)) });
        ui.cards.packEdit = false;
        render();
        return;
      }
      case 'pack-del': {
        const p = (settings.dirUserPacks ?? []).find(x => x.id === ui.cards.pack);
        if (!p) return;
        const n = settings.dirCustom.filter(c => c.pack === p.id).length;
        if (!await confirmDialog(`"${p.name}" 묶음${n ? `과 카드 ${n}장` : ''}을 지울까요?`, '지우기', true)) return;
        await patchSettings({ dirUserPacks: settings.dirUserPacks.filter(x => x.id !== p.id), dirCustom: settings.dirCustom.filter(c => c.pack !== p.id), dirPacks: settings.dirPacks.filter(x => x !== p.id) });
        ui.cards.pack = null;
        render();
        return;
      }
      case 'tag-del': { const m = story.tags?.[el.dataset.name]; if (m) { delete m[el.dataset.w]; saveStory(); render(); toast(`태그 "${el.dataset.w}"를 지웠어요.`); } return; }
      case 'relmerge': { const { from, into } = el.dataset; if (await confirmDialog(`${josa(from, '을', '를')} ${josa(into, '과', '와')} 같은 사람으로 합칠까요?\n${josa(from, '은', '는')} ${into}의 다른 이름이 되고, 관계 · 횟수도 합쳐져요.`, '합치기')) { mergePeople(from, into); ui.sheet = { type: 'person', name: into }; ui.layout = null; render(); toast(`${josa(from, '을', '를')} 합쳤어요.`); } return; }
      case 'pstep': { const inp = document.getElementById('jev-par'); if (inp) { inp.value = String(Math.max(1, Math.min(10, (Number(inp.value) || 2) + Number(el.dataset.d)))); scheduleSettingsSave(400); if (ui.onboard) ui.onboard.d = readForm(ui.onboard.d); } return; }
      case 'fthread': { const m = (story.memThreads ??= {}); if (el.dataset.to === 'open') delete m[el.dataset.key]; else m[el.dataset.key] = el.dataset.to; saveStory(); const sec = ui.tkind === 'secret'; toast(sec ? (el.dataset.to === 'open' ? '다시 숨긴 비밀로 옮겼어요' : el.dataset.to === 'done' ? '드러난 비밀로 옮겼어요' : '비밀 목록에서 뺐어요') : (el.dataset.to === 'open' ? '다시 열었어요' : el.dataset.to === 'done' ? '지켜진 약속으로 옮겼어요' : '취소된 약속으로 옮겼어요')); render(); return; }
      case 'relwho': { const p = pairOf(el.dataset.a, el.dataset.b); if (p) { p.who = el.dataset.who; p.lock = true; saveStory(); render(); } return; }
      case 'fix-merge': { const into = el.dataset.into || document.getElementById(el.dataset.sel)?.value; if (!into) { toast('합칠 사람을 고르세요'); return; } mergePeople(el.dataset.from, into); ui.layout = null; render(); toast(`${josa(el.dataset.from, '을', '를')} ${into}${hasBatchim(into) ? '과' : '와'} 합쳤어요.`); return; }
      case 'fix-no': markNotSame(el.dataset.a, el.dataset.b); render(); return;
      case 'fix-hide': hidePerson(el.dataset.name); ui.layout = null; render(); toast(`${josa(el.dataset.name, '을', '를')} 숨겼어요.`); return;
      case 'mgroup': Object.assign(ui.mem, { group: el.dataset.v, folder: null, limit: 30 }); if (el.dataset.v === 'kind') ui.mem.kind = 'all'; render(); return;
      case 'mfold': Object.assign(ui.mem, { folder: el.dataset.v, limit: 30 }); render(); document.getElementById('sc').scrollTop = 0; return;
      case 'mback': ui.mem.folder = null; render(); return;
      case 'mfilter': ui.sheet = { type: 'memfilter' }; render(); return;
      case 'mf': ui.mem[el.dataset.k] = el.dataset.v; ui.mem.limit = 30; render(); return;
      case 'mmore': ui.mem.limit = el.dataset.all ? Infinity : ui.mem.limit + 30; render(); return;
      case 'search': await doSearch(); return;
      case 'intim': { const p = pairOf(el.dataset.a, el.dataset.b); if (p) { const r = p.intim ??= { n: 0, first: null, last: null, firstCk: null, lastCk: null, day: null }; r.n = Math.max(0, r.n + Number(el.dataset.d)); saveStory(); } render(); return; }
      case 'aff': { const p = pairOf(el.dataset.a, el.dataset.b); if (p) { p.aff = Math.max(-10, Math.min(10, p.aff + Number(el.dataset.d))); saveStory(); } render(); return; }
      case 'alias': { const v = document.getElementById('alias-in')?.value?.trim(); const p = story.people[el.dataset.name]; if (v && p && !p.aliases.includes(v)) { p.aliases.push(v); saveStory(); toast(`"${v}"도 ${josa(p.name, '으로', '로')} 볼게요`); } render(); return; }
      case 'merge': { const into = document.getElementById('merge-in')?.value; if (!into) { toast('합칠 인물을 고르세요'); return; } if (await confirmDialog(`${josa(el.dataset.name, '을', '를')} ${josa(into, '과', '와')} 같은 인물로 합칠까요?\n${josa(el.dataset.name, '은', '는')} ${into}의 다른 이름이 돼요.`, '합치기')) { mergePeople(el.dataset.name, into); ui.sheet = { type: 'person', name: into }; ui.layout = null; render(); } return; }
      case 'hide-person': if (await confirmDialog(`${josa(el.dataset.name, '을', '를')} 인물 목록에서 뺄까요?\n다시 인물로 잡지 않아요.`, '빼기', true)) { hidePerson(el.dataset.name); ui.sheet = null; ui.layout = null; render(); } return;
      case 'gzoom': { const f = Number(el.dataset.f); const g = ui.graph; const k2 = Math.max(0.4, Math.min(3, g.k * f)); const { W, H } = graphBox(); g.x = W / 2 - ((W / 2 - g.x) * k2) / g.k; g.y = H / 2 - ((H / 2 - g.y) * k2) / g.k; g.k = k2; document.querySelector('[data-pan]')?.setAttribute('transform', `translate(${g.x} ${g.y}) scale(${g.k})`); return; }
      case 'greset': ui.graph = { x: 0, y: 0, k: 1 }; ui.layout = null; render(); return;
      case 'toggle-enabled': await saveSettings({ ...settings, enabled: !settings.enabled }); render(); return;
      case 'dircards': ui.sheet = null; ui.view = 'cards'; render(); document.getElementById('sc').scrollTop = 0; return;
      case 'dsheet-pack': ui.sheet = { ...ui.sheet, pack: el.dataset.v, edit: null }; render(); return;
      case 'dirfreq': {
        for (const b of el.parentElement.children) b.classList.toggle('on', b === el);
        settings.dirFreq = el.dataset.v;
        if (ui.draft) ui.draft.dirFreq = el.dataset.v;
        setSaved('저장 중…');
        void patchSettings({ dirFreq: el.dataset.v }).then(() => { setSaved('저장됨'); setTimeout(() => { if (ui.saved === '저장됨') setSaved(''); }, 1500); }, (error) => toast(String(error?.message ?? error)));
        return;
      }
      case 'dirpack': {
        const packs = new Set(settings.dirPacks);
        if (packs.has(el.dataset.v)) packs.delete(el.dataset.v); else packs.add(el.dataset.v);
        if (el.classList.contains('pk') || el.classList.contains('tg')) el.classList.toggle('on', packs.has(el.dataset.v));
        el.closest('.fold')?.classList.toggle('off', !packs.has(el.dataset.v));
        settings.dirPacks = [...packs];
        if (ui.draft) ui.draft.dirPacks = [...packs];
        setSaved('저장 중…');
        void patchSettings({ dirPacks: [...packs] }).then(() => { setSaved('저장됨'); setTimeout(() => { if (ui.saved === '저장됨') setSaved(''); }, 1500); requestAnimationFrame(() => render()); }, (error) => toast(String(error?.message ?? error)));
        return;
      }
      case 'dir-off': {
        await patchSettings({ dirOff: [...new Set([...settings.dirOff, el.dataset.id])] });
        toast('이 카드는 이제 안 써요. 연출 카드 목록에서 다시 켤 수 있어요.');
        render();
        return;
      }
      case 'dir-edit': ui.sheet = { ...ui.sheet, edit: el.dataset.id }; render(); document.querySelector('.sheet')?.scrollTo?.(0, 0); return;
      case 'dir-cancel': ui.sheet = { ...ui.sheet, edit: null }; render(); return;
      case 'dir-del': {
        const c = settings.dirCustom.find(x => x.id === el.dataset.id);
        if (!c || !await confirmDialog(`"${c.name}" 카드를 지울까요?`, '지우기', true)) return;
        await patchSettings({ dirCustom: settings.dirCustom.filter(x => x.id !== c.id) });
        render();
        return;
      }
      case 'dir-save': {
        const v = (id) => document.getElementById(id)?.value?.trim() ?? '';
        const card = { name: v('dc-name'), when: v('dc-when'), text: v('dc-text'), aff: v('dc-aff') };
        if (!card.name || !card.text) { toast('이름과 연출은 꼭 써 주세요.'); return; }
        const editId = ui.sheet.edit;
        const list = editId ? settings.dirCustom.map(x => (x.id === editId ? { ...x, ...card, id: editId } : x)) : [...settings.dirCustom, { ...card, id: `u${Date.now().toString(36)}` }];
        await patchSettings({ dirCustom: list, dirPacks: [...new Set([...settings.dirPacks, 'custom'])] });
        ui.sheet = { ...ui.sheet, edit: null };
        toast(editId ? '고쳤어요.' : '추가했어요. 장면이 맞으면 Jev가 골라요.');
        render();
        return;
      }
      case 'dir-import': {
        let data;
        try { data = JSON.parse(document.getElementById('dc-json')?.value ?? ''); } catch { toast('JSON 모양이 아니에요.'); return; }
        const incoming = sanitizeDirCards(Array.isArray(data) ? data : data?.cards);
        const have = new Set(settings.dirCustom.map(c => `${c.name}|${c.text}`));
        const intoPack = ui.view === 'cards' && ui.cards.pack ? ui.cards.pack : 'custom';
        const fresh = incoming.filter(c => !have.has(`${c.name}|${c.text}`)).map((c, i) => ({ ...c, pack: intoPack, id: `u${Date.now().toString(36)}${i}` }));
        if (!fresh.length) { toast('새로 더할 카드가 없어요.'); return; }
        await patchSettings({ dirCustom: [...settings.dirCustom, ...fresh], dirPacks: [...new Set([...settings.dirPacks, intoPack])] });
        toast(`카드 ${fresh.length}장을 더했어요.`);
        render();
        return;
      }
      case 'dir-copy': {
        const t = document.getElementById('dc-json')?.value ?? '';
        try { await navigator.clipboard.writeText(t); toast('복사했어요.'); } catch { document.getElementById('dc-json')?.select?.(); toast('글을 길게 눌러 복사해 주세요.'); }
        return;
      }
      case 'preset-custom': {
        const base = currentDraft();
        const next = { ...base, memPreset: 'custom', ...(base.memCustom ?? {}) };
        ui.keepOpen.set('adv-mem', true);
        if (ui.onboard) ui.onboard.d = next; else { ui.draft = next; void flushSettingsSave(); }
        render();
        document.querySelector('[data-keep="adv-mem"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      case 'preset': {
        const p = MEMORY_PRESETS[el.dataset.v];
        if (!p) return;
        const base = currentDraft();
        const next = { ...base, memPreset: el.dataset.v, budget: p.budget, candidates: p.candidates, neighbor: p.neighbor, tailTokens: p.tailTokens };
        if (ui.onboard) { ui.onboard.d = next; render(); return; }
        ui.draft = next;
        render();
        setSaved('저장 중…');
        await flushSettingsSave();
        return;
      }
      case 'pick': {
        const next = pickPreset(currentDraft(), el.dataset.field, el.dataset.value);
        if (ui.onboard) ui.onboard.d = next; else ui.draft = next;
        ui.test[el.dataset.field === 'jevPreset' ? 'jev' : 'embed'] = null;
        render();
        if (!ui.onboard && ui.view === 'settings') { setSaved('저장 중…'); await flushSettingsSave(); }
        return;
      }
      case 'test-jev': await runTest('jev'); return;
      case 'test-embed': await runTest('embed'); return;
      case 'onboard': await leaveSettings(); ui.onboard = { step: 0, d: { ...settings } }; render(); return;
      case 'onb-back': currentDraft(); ui.onboard.step--; render(); return;
      case 'onb-next': {
        const d = currentDraft();
        if (ui.onboard.step === 1 && !cleanKey(d.jevKey)) { toast('Jev API 키를 넣어 주세요.'); return; }
        if (ui.onboard.step === 2 && EMBED_PRESETS[d.embedPreset]?.key === 'own' && !cleanKey(d.embedKey)) { toast('임베딩 API 키를 넣거나 다른 걸 골라 주세요.'); return; }
        ui.onboard.step++;
        render();
        return;
      }
      case 'onb-finish': {
        const d = currentDraft();
        await saveSettings({ ...d, onboarded: true });
        ui.onboard = null;
        ui.view = 'now';
        render();
        const st = storageStats();
        toast(st.sendable - st.indexedMsgs > 0 ? '준비됐어요. 이전 대화가 있으면 "지금 색인"을 눌러 주세요.' : '준비됐어요. 대화를 이어 가면 기억해요.');
        return;
      }
      case 'settings-reset':
        if (await confirmDialog('키는 그대로 두고 나머지 설정을 기본값으로 돌릴까요?', '돌리기')) {
          const d = currentDraft();
          ui.draft = { ...DEFAULT_SETTINGS, jevKey: d.jevKey, embedKey: d.embedKey, onboarded: true };
          render();
          await flushSettingsSave();
        }
        return;
      case 'reread': try { await refreshChat(); toast('다시 읽었어요.'); } catch (error) { toast(String(error?.message ?? error)); } render(); return;
      case 'index-all': {
        if (processing) { toast('이미 색인 중이에요.'); return; }
        ui.progress = '색인 준비 중…'; ui.progressPct = 5;
        render();
        try {
          const n = await indexAll((done, all) => { ui.progress = `색인 중… ${done}/${all}`; ui.progressPct = Math.round(done / all * 100); softRender(); });
          ui.progress = '';
          render();
          toast(n ? `메시지 ${n}개를 색인했어요.` : '이미 다 색인돼 있어요.');
        } catch (error) { ui.progress = ''; render(); toast(String(error?.message ?? error)); }
        return;
      }
      case 'story-all': {
        if (storyAll) { toast('이미 정리 중이에요.'); return; }
        ui.progress = '이야기 정리 준비 중…'; ui.progressPct = 5;
        render();
        try {
          const n = await analyzeAll((done, all) => { ui.progress = `이야기 정리 중… ${done}/${all}`; ui.progressPct = Math.round(done / all * 100); softRender(); });
          ui.progress = '';
          ui.layout = null;
          render();
          toast(n ? `메시지 ${n}개를 정리했어요.` : '이미 다 정리돼 있어요.');
        } catch (error) { ui.progress = ''; render(); toast(String(error?.message ?? error)); }
        return;
      }
      case 'usage-reset':
        if (!await confirmDialog('Jev 사용량 기록을 지울까요?\n(오늘 · 채팅별 · 전체 모두)', '지우기', true)) return;
        resetUsage();
        await flushUsage();
        render();
        toast('사용량을 지웠어요.');
        return;
      case 'lore-backup': {
        try {
          ui.progress = '채팅 로어북에 백업하는 중…'; render();
          const b = await backupToLore();
          ui.progress = ''; render();
          toast(`백업했어요 · 기억 ${b.n}개 · 약 ${b.kb}KB`);
        } catch (error) { ui.progress = ''; render(); toast(String(error?.message ?? error)); }
        return;
      }
      case 'lore-restore': {
        await ensureChat();
        const { chat } = await currentChatObj();
        const data = await readLoreBackup(chat);
        if (!data) { toast('이 채팅 로어북에 백업이 없어요.'); return; }
        const n = Object.values(data.facts).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0);
        if (!await confirmDialog(`백업(기억 ${n}개, ${new Date(data.at).toLocaleString()})으로 이 채팅의 기억을 바꿀까요?\n지금 기억은 덮어써져요.`, '되살리기')) return;
        if (storyJob) await storyJob.catch(() => {});
        applyBackup(data);
        ui.layout = null;
        render();
        toast(`되살렸어요 · 기억 ${facts.length}개`);
        return;
      }
      case 'json-export': {
        if (!await ensureChat()) { toast('채팅방을 먼저 열어 주세요.'); return; }
        const safe = (s) => String(s || 'chat').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
        downloadJson(backupData(), `jevarchive_${safe(chatLabel.char)}_${safe(chatLabel.chat)}.json`);
        toast(`내보냈어요 · 기억 ${facts.length}개`);
        return;
      }
      case 'story-reset':
        if (!await confirmDialog('인물 · 관계 · 약속 · 사건 카드를 지울까요?\n고정한 기억과 원문 색인은 그대로예요.', '초기화', true)) return;
        await resetStory();
        ui.layout = null;
        render();
        toast('초기화했어요. 다시 정리하려면 "이야기 전체 정리"를 누르세요.');
        return;
      case 'clear':
        if (!await confirmDialog('이 채팅의 칸 줄 기억을 이 기기에서 지울까요?\n원문은 그대로고, 다시 정리하면 돼요.', '지우기', true)) return;
        await clearVectors();
        await clearFacts();
        render();
        toast('지웠어요.');
        return;
    }
  }

  // ── Jev 사용량 (응답에 오는 토큰 수를 모은다. 설정과 같은 저장소, 20초에 한 번) ──
  const USAGE_KEY = `${KEY}usage`;
  const zeroUse = () => ({ t: 0, n: 0 });
  let usage;
  function resetUsage() { usage = { total: zeroUse(), send: zeroUse(), days: {}, chats: {} }; }
  resetUsage();
  let usageTimer = null;
  const dayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  async function loadUsage() {
    try {
      let u = await R.pluginStorage.getItem(USAGE_KEY);
      if (typeof u === 'string') u = JSON.parse(u);
      if (u && typeof u === 'object' && u.total) usage = { total: u.total, send: u.send ?? zeroUse(), days: u.days ?? {}, chats: u.chats ?? {} };
    } catch { }
  }
  function flushUsage() {
    clearTimeout(usageTimer);
    usageTimer = null;
    const days = Object.keys(usage.days).sort();
    for (const k of days.slice(0, Math.max(0, days.length - 31))) delete usage.days[k];
    const chats = Object.entries(usage.chats).sort((a, b) => (b[1].at ?? 0) - (a[1].at ?? 0));
    for (const [k] of chats.slice(100)) delete usage.chats[k];
    return Promise.resolve().then(() => R.pluginStorage.setItem(USAGE_KEY, usage)).catch(() => {});
  }
  function noteJevUsage(u) {
    const t = (Number(u?.input_tokens) || 0) + (Number(u?.output_tokens) || 0);
    if (!t) return;
    const add = (b) => { b.t += t; b.n += 1; return b; };
    add(usage.total);
    add(usage.send);
    add(usage.days[dayKey()] ??= zeroUse());
    if (chatKey) add(usage.chats[chatKey] ??= zeroUse()).at = Date.now();
    if (!usageTimer) usageTimer = setTimeout(flushUsage, 20000);
  }
  function startSendUsage() { usage.send = { ...zeroUse(), at: Date.now() }; }
  const fmtTok = (t) => (t >= 1e8 ? `${(t / 1e8).toFixed(1)}억` : t >= 1e4 ? `${(t / 1e4).toFixed(t >= 1e6 ? 0 : 1)}만` : t.toLocaleString());
  const fmtUsd = (t) => { const c = t / 1e6 * (settings.jevPrice ?? 0.042); return c === 0 ? '$0' : c < 0.0001 ? '<$0.0001' : `$${c < 0.01 ? c.toFixed(4) : c < 1 ? c.toFixed(3) : c.toFixed(2)}`; };
  function usageCard() {
    const b = [['방금 답장', usage.send], ['오늘', usage.days[dayKey()] ?? zeroUse()], ['이 채팅', usage.chats[chatKey] ?? zeroUse()], ['전체', usage.total]];
    return `<section class="card"><div class="ch"><h2>Jev 사용량</h2><span class="sp"></span><span class="meta">100만 토큰당 ${settings.jevPrice ?? 0.042} 기준 · 예상</span><button class="btn sm g" data-act="usage-reset" style="margin-left:8px">초기화</button></div>
        <div class="kpis" style="margin:0">${b.map(([lb, x]) => `<div class="kpi"><b>${fmtTok(x.t)}<small class="dim" style="font-size:12px;font-weight:500"> 토큰</small></b><span>${lb} · ${fmtUsd(x.t)}${x.n ? ` · ${x.n}번` : ''}</span></div>`).join('')}</div></section>`;
  }

  // ── 채팅 로어북 백업 (누를 때만) ──
  //  @@dont_activate라 프롬프트에는 절대 안 들어간다. 채팅을 복사 · 이동하면 이 항목도 같이 가니까 기억도 따라간다.
  //  기억이 하나도 없는 채팅을 열었는데 백업 항목이 있으면 거기서 되살린다 (복사한 채팅).
  const BACKUP_TAG = 'JEVARCHIVE-BACKUP';
  const BACKUP_TITLE = 'JevArchive 기억 백업 (지우지 마세요)';
  const isBackupEntry = (l) => typeof l?.content === 'string' && l.content.includes(`\n${BACKUP_TAG} `);
  const bytesToB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
  const b64ToBytes = (b64) => { const s = atob(b64); const u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8; };
  async function packJson(json) {
    if (typeof CompressionStream === 'function') {
      try { return `gz:${bytesToB64(new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()))}`; } catch { }
    }
    return `js:${json}`;
  }
  async function unpackJson(body) {
    if (body.startsWith('js:')) return body.slice(3);
    if (!body.startsWith('gz:') || typeof DecompressionStream !== 'function') throw new Error('압축을 풀 수 없어요.');
    return await new Response(new Blob([b64ToBytes(body.slice(3))]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  }
  async function currentChatObj() {
    const charIndex = await R.getCurrentCharacterIndex();
    const chatIndex = await R.getCurrentChatIndex();
    return { charIndex, chatIndex, chat: await R.getChatFromIndex(charIndex, chatIndex) };
  }
  async function readLoreBackup(chat) {
    const entry = (chat?.localLore ?? []).find(isBackupEntry);
    if (!entry) return null;
    try {
      const lines = entry.content.split('\n');
      const at = lines.findIndex(l => l.startsWith(`${BACKUP_TAG} `));
      const data = JSON.parse(await unpackJson(lines.slice(at + 1).join('\n').trim()));
      return data && data.story && data.facts ? data : null;
    } catch (error) { setError('백업 읽기', error); return null; }
  }
  /** 백업 내용: 기억(문장 · 임베딩) + 이야기 기록. 로어북 · 파일 둘 다 이걸 쓴다 */
  function backupData() {
    const { backup, ...st } = story;
    return { app: 'jevarchive', v: 1, at: Date.now(), chat: chatLabel, story: st, facts: Object.fromEntries(factStore) };
  }
  function downloadJson(value, filename) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function backupToLore() {
    if (!await ensureChat()) throw new Error('채팅방을 먼저 열어 주세요.');
    if (storyAll) throw new Error('전부 정리 중이에요. 끝나면 다시 눌러 주세요.');
    if (storyJob) await storyJob.catch(() => {});
    const key = chatKey;
    const n = facts.length;
    const payload = await packJson(JSON.stringify(backupData()));
    const content = `@@dont_activate\n${BACKUP_TAG} 1 · 기억 ${n}개 · 인물 ${personList().length}명 · ${new Date().toLocaleString()}\n${payload}`;
    // 압축을 먼저 끝내고, 채팅을 읽자마자 바로 쓴다 (그 사이 바뀔 틈을 줄인다)
    const { charIndex, chatIndex, chat } = await currentChatObj();
    if (!chat || `${characterCache.chaId}_${chat.id || `idx${chatIndex}`}` !== key) throw new Error('채팅이 바뀌었어요. 다시 눌러 주세요.');
    const lore = Array.isArray(chat.localLore) ? [...chat.localLore] : [];
    const entry = { key: 'jevarchive-backup', secondkey: '', insertorder: 0, comment: BACKUP_TITLE, content, mode: 'normal', alwaysActive: false, selective: false, useRegex: false };
    const at = lore.findIndex(isBackupEntry);
    if (at >= 0) lore[at] = { ...lore[at], ...entry }; else lore.push(entry);
    chat.localLore = lore;
    await R.setChatToIndex(charIndex, chatIndex, chat);
    story.backup = { at: Date.now(), n, kb: Math.round(content.length / 1024) };
    saveStory();
    return story.backup;
  }
  function applyBackup(data) {
    const keep = story.backup;
    story = { ...emptyStory(), ...data.story, ...(keep ? { backup: keep } : {}) };
    factStore = new Map(Object.entries(data.facts).filter(([, v]) => Array.isArray(v)));
    factDirty = new Set(Array.from({ length: SHARDS }, (_, s) => s));
    seedPeople();
    rebuildFacts();
    saveStory();
    void flushFacts();
  }
  let restoredNote = '';
  async function autoRestoreFromLore(chat) {
    if (factStore.size || story.analyzed?.length) return;
    const data = await readLoreBackup(chat);
    if (!data) return;
    applyBackup(data);
    restoredNote = `채팅 로어북 백업에서 기억 ${facts.length}개를 되살렸어요.`;
  }

  // ── 바로가기 버튼 ──
  let buttonPartId = null;
  async function syncButton() {
    try {
      if (settings.showButton && !buttonPartId && R.registerButton) {
        const part = await R.registerButton({ name: 'Jev Archive', icon: '🏛️', iconType: 'html', location: 'action', id: 'jevarchive-gui' }, async () => { await openPanel('now'); });
        buttonPartId = part?.id ?? 'jevarchive-gui';
      } else if (!settings.showButton && buttonPartId && R.unregisterUIPart) {
        await R.unregisterUIPart(buttonPartId);
        buttonPartId = null;
      }
    } catch (error) { console.error(LOG, '바로가기 버튼 등록 실패', error); }
  }

  // ── 시작 ──
  await loadSettings();
  await loadUsage();
  await initLocalStore();
  await R.registerSetting('JevArchive', () => openPanel(), '🏛️', 'html', 'jevarchive-settings');
  if (R.registerButton) {
    for (const [location, id] of [['hamburger', 'jevarchive-side'], ['chat', 'jevarchive-chat']]) {
      try { await R.registerButton({ name: 'Jev Archive', icon: '🏛️', iconType: 'html', location, id }, async () => { await openPanel('now'); }); }
      catch (error) { console.error(LOG, '메뉴 버튼 등록 실패', error); }
    }
  }
  await R.addRisuReplacer('beforeRequest', beforeRequestHandler);
  await R.addRisuReplacer('afterRequest', afterRequestHandler);
  if (R.onUnload) {
    await R.onUnload(async () => {
      await Promise.allSettled([
        R.removeRisuReplacer('beforeRequest', beforeRequestHandler),
        R.removeRisuReplacer('afterRequest', afterRequestHandler),
        buttonPartId && R.unregisterUIPart ? R.unregisterUIPart(buttonPartId) : null,
        flushVectors(), flushStory(), flushCards(), flushFacts(), flushUsage(),
      ]);
    });
  }
  try { globalThis.addEventListener?.('pagehide', () => { void flushVectors(); void flushStory(); void flushCards(); void flushFacts(); }); } catch { }
  await syncButton();
  try { await ensureChat(); } catch { }
  console.log(LOG, '준비 완료');

  if (globalThis.__JEVARCHIVE_TEST__) {
    globalThis.__JEVARCHIVE_TEST__.x = {
      beforeRequestHandler, afterRequestHandler, indexAll, analyzeAll, ensureChat, refreshChat, flushVectors, flushStory, flushCards, saveSettings,
      chunkText, overlapStart, chatEntries, toSigns, packSigns, unpackSigns, storageStats, recall, parseStatus, storyClock, clockLabel, peopleIn, mergePeople, hidePerson, togglePin, chunkByCk, searchMemory, searchFacts,
      renderNow, renderPeople, renderPromises, renderMemory, tagCandidates, tagNouns, addTag, topTags, backupToLore, readLoreBackup, applyBackup, currentChatObj, backupData, renderSettings, renderOnboard, graphSvg, personSheet, chunkSheet, presetOf,
      getSettings: () => settings, getStory: () => story, allDirCards, dirEligible, dirSheet, directorBox, DIR_PACKS, getTimeline: () => timeline, getChunks: () => chunks, getCards: () => cardStore, getFacts: () => facts, getFactStore: () => factStore, factMessages, factBacklog, retrieveFacts, searchFacts, flushFacts, factItem, getLastRecall: () => lastRecall, debugLog: () => debugLog, ui,
      waitJob: async () => { await (job ?? Promise.resolve()); await (storyJob ?? Promise.resolve()); },
    };
  }
})();
