// 메모 내보내기·가져오기 파일 형식
//
// {
//   "app": "dingdong-memo",
//   "format": 1,
//   "exportedAt": "2026-11-20T01:00:00.000Z",
//   "memos": [{ "title", "content", "color", "pinned", "alarm", "createdAt", "updatedAt" }]
// }
//
// 창 위치·크기·바탕화면 미니 메모 위치처럼 그 PC에서만 의미 있는 값은 넣지 않는다.

const APP = 'dingdong-memo';
const FORMAT = 1;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_MEMOS = 10000;
const MAX_CONTENT = 1024 * 1024;
const COLORS = ['yellow', 'green', 'pink', 'purple', 'blue', 'gray'];
const REPEATS = ['none', 'daily', 'weekdays'];

function buildExport(memos, appVersion) {
  return {
    app: APP,
    format: FORMAT,
    appVersion,
    exportedAt: new Date().toISOString(),
    memos: memos.map((m) => ({
      title: m.title || '',
      content: m.content || '',
      color: m.color || 'yellow',
      pinned: !!m.pinned,
      alarm: m.alarm && m.alarm.at ? { at: m.alarm.at, repeat: m.alarm.repeat || 'none', done: !!m.alarm.done } : null,
      createdAt: m.createdAt || null,
      updatedAt: m.updatedAt || null,
    })),
  };
}

class BackupError extends Error {}

// 파일 내용을 검사해서 가져올 메모 목록으로. 문제가 있으면 사용자에게 보여줄 문장으로 BackupError
function parseBackup(text, byteLength) {
  if (byteLength > MAX_FILE_BYTES) throw new BackupError('파일이 너무 커요. (20MB까지)');
  let data;
  try {
    data = JSON.parse(String(text).replace(/^﻿/, ''));
  } catch {
    throw new BackupError('딩동메모 백업 파일이 아니에요. 파일 내용을 읽을 수 없어요.');
  }
  if (!data || data.app !== APP || !Array.isArray(data.memos)) throw new BackupError('딩동메모 백업 파일이 아니에요.');
  if (typeof data.format === 'number' && data.format > FORMAT) throw new BackupError('더 새 버전의 딩동메모에서 만든 파일이에요. 딩동메모를 업데이트한 뒤 다시 시도해 주세요.');
  if (data.memos.length > MAX_MEMOS) throw new BackupError(`메모가 너무 많아요. (${MAX_MEMOS.toLocaleString()}개까지)`);

  const now = Date.now();
  const memos = [];
  for (const raw of data.memos) {
    if (!raw || typeof raw !== 'object') continue;
    const title = typeof raw.title === 'string' ? raw.title.slice(0, 100) : '';
    const content = typeof raw.content === 'string' ? raw.content.slice(0, MAX_CONTENT) : '';
    if (!title.trim() && !content.trim()) continue; // 빈 메모는 건너뜀
    const time = (v) => (Number.isFinite(v) && v > 0 && v < now + 366 * 864e5 ? v : null);
    let alarm = null;
    if (raw.alarm && Number.isFinite(raw.alarm.at)) {
      const repeat = REPEATS.includes(raw.alarm.repeat) ? raw.alarm.repeat : 'none';
      // 한 번만 울리는 지난 알림은 다시 울리지 않게 완료로
      const done = !!raw.alarm.done || (repeat === 'none' && raw.alarm.at <= now);
      alarm = { at: raw.alarm.at, repeat, done };
    }
    memos.push({
      title,
      content,
      color: COLORS.includes(raw.color) ? raw.color : 'yellow',
      pinned: !!raw.pinned,
      alarm,
      createdAt: time(raw.createdAt) || now,
      updatedAt: time(raw.updatedAt) || time(raw.createdAt) || now,
    });
  }
  return { exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : null, memos };
}

// 제목과 내용이 같으면 같은 메모로 본다
function memoKey(m) {
  return `${(m.title || '').trim()}\u0000${(m.content || '').replace(/\r\n/g, '\n').trim()}`;
}

function splitDuplicates(incoming, existing) {
  const have = new Set(existing.map(memoKey));
  const fresh = [];
  const dup = [];
  for (const m of incoming) {
    const k = memoKey(m);
    if (have.has(k)) dup.push(m);
    else { fresh.push(m); have.add(k); }
  }
  return { fresh, dup };
}

// 파일 이름에 못 쓰는 글자 정리
function safeFileName(s) {
  return String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || '메모';
}

module.exports = { buildExport, parseBackup, splitDuplicates, safeFileName, BackupError };
