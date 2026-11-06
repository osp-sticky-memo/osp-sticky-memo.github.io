// 메모 저장소 - %APPDATA%/스티커 메모/memos.json 에 저장
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let filePath = null;
let data = { version: 1, memos: [] };
let saveTimer = null;

const COLORS = ['yellow', 'green', 'pink', 'purple', 'blue', 'gray'];

function load(dir) {
  fs.mkdirSync(dir, { recursive: true });
  filePath = path.join(dir, 'memos.json');
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

function scheduleSave() {
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

function getMemos() { return data.memos; }
function getMemo(id) { return data.memos.find((m) => m.id === id) || null; }

function addMemo(init = {}) {
  const now = Date.now();
  const memo = {
    id: crypto.randomUUID(),
    content: '',
    color: init.color || 'yellow',
    x: init.x, y: init.y,
    width: init.width, height: init.height,
    visible: true,
    alwaysOnTop: false,
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
  if ('content' in patch) memo.updatedAt = Date.now();
  scheduleSave();
  return memo;
}

function removeMemo(id) {
  data.memos = data.memos.filter((m) => m.id !== id);
  scheduleSave();
}

module.exports = { load, flush, getMemos, getMemo, addMemo, updateMemo, removeMemo, COLORS };
