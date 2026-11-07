// 메모 저장소 - %APPDATA%/딩동메모/memos.json 에 저장
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let filePath = null;
let data = { version: 1, memos: [], settings: {} };

// 알림 설정 기본값
const NOTIFY_POSITIONS = ['bottom-right', 'top-right', 'bottom-left', 'top-left', 'top-center', 'bottom-center'];
const DEFAULT_SETTINGS = {
  notifyPosition: 'bottom-right',
  notifyDisplay: 'primary',   // primary | cursor (마우스가 있는 모니터)
  notifyMode: 'auto',         // auto: 시간이 지나면 닫힘 | manual: 확인을 눌러야 닫힘
  notifySeconds: 8,           // auto일 때 표시 시간 (3~10초)
  autoUpdate: true,           // 새 버전 자동 확인·다운로드
};
let saveTimer = null;
const listeners = [];

const COLORS = ['yellow', 'green', 'pink', 'purple', 'blue', 'gray'];

// 0.1.0까지 쓰던 앱 이름의 데이터 폴더
const LEGACY_DIR_NAMES = ['스티커 메모'];

function load(dir) {
  fs.mkdirSync(dir, { recursive: true });
  filePath = path.join(dir, 'memos.json');
  migrateLegacy(dir);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.memos)) data = parsed;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // 파일이 깨졌으면 백업해두고 새로 시작
      try { fs.copyFileSync(filePath, filePath + '.broken-' + Date.now()); } catch {}
    }
  }
}

// 새 폴더에 메모가 아직 없고 예전 이름 폴더에 있으면 복사해 옴 (원본은 남겨 둠)
function migrateLegacy(dir) {
  if (fs.existsSync(filePath)) return;
  for (const name of LEGACY_DIR_NAMES) {
    const old = path.join(path.dirname(dir), name, 'memos.json');
    try {
      if (fs.existsSync(old)) {
        fs.copyFileSync(old, filePath);
        return;
      }
    } catch {}
  }
}

function onChange(fn) { listeners.push(fn); }

function scheduleSave() {
  listeners.forEach((fn) => { try { fn(); } catch {} });
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 300);
}

// 임시 파일에 쓰고 교체해서 저장 중 꺼져도 파일이 깨지지 않게
function flush() {
  clearTimeout(saveTimer);
  if (!filePath) return;
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function getSettings() { return { ...DEFAULT_SETTINGS, ...(data.settings || {}) }; }

function updateSettings(patch) {
  const next = getSettings();
  if (NOTIFY_POSITIONS.includes(patch.notifyPosition)) next.notifyPosition = patch.notifyPosition;
  if (['primary', 'cursor'].includes(patch.notifyDisplay)) next.notifyDisplay = patch.notifyDisplay;
  if (['auto', 'manual'].includes(patch.notifyMode)) next.notifyMode = patch.notifyMode;
  if (typeof patch.autoUpdate === 'boolean') next.autoUpdate = patch.autoUpdate;
  if (patch.notifySeconds != null) {
    const n = Math.round(Number(patch.notifySeconds));
    if (Number.isFinite(n)) next.notifySeconds = Math.min(10, Math.max(3, n));
  }
  data.settings = next;
  scheduleSave();
  return next;
}

function getMemos() { return data.memos; }
function getMemo(id) { return data.memos.find((m) => m.id === id) || null; }

function addMemo(init = {}) {
  const now = Date.now();
  const memo = {
    id: crypto.randomUUID(),
    title: '',
    content: '',
    color: init.color || 'yellow',
    x: init.x, y: init.y,
    width: init.width, height: init.height,
    visible: true,
    alwaysOnTop: false,
    pinned: false,    // 목록 상단 고정
    mini: null,       // 바탕화면에 꺼내 둔 미니 메모 위치 { x, y }
    alarm: null,      // { at: ms, repeat: 'none'|'daily'|'weekdays', done: bool }
    snoozeAt: null,   // ms
    createdAt: now,
    updatedAt: now,
  };
  data.memos.push(memo);
  scheduleSave();
  return memo;
}

function updateMemo(id, patch) {
  const memo = getMemo(id);
  if (!memo) return null;
  if (patch.color && !COLORS.includes(patch.color)) delete patch.color;
  Object.assign(memo, patch);
  if ('content' in patch || 'title' in patch) memo.updatedAt = Date.now();
  scheduleSave();
  return memo;
}

function removeMemo(id) {
  data.memos = data.memos.filter((m) => m.id !== id);
  scheduleSave();
}

module.exports = { load, flush, onChange, getSettings, updateSettings, getMemos, getMemo, addMemo, updateMemo, removeMemo, COLORS };
