const $ = (s) => document.querySelector(s);
const listEl = $('#list');
const emptyEl = $('#empty');
const qIn = $('#q');
const sortSel = $('#sort');

let memos = [];
let renamingId = null;

const SORT_KEY = 'list-sort';
try { const v = localStorage.getItem(SORT_KEY); if (v) sortSel.value = v; } catch {}

init();

async function init() {
  memos = await window.api.listMemos();
  render();
  window.api.onListChanged((list) => { memos = list; if (!renamingId) render(); });
  window.api.onRename((id) => startRename(id));
  qIn.focus();
}

$('#btn-new').onclick = () => window.api.newMemoFromList();
$('#btn-settings').onclick = () => window.api.openSettings();
qIn.addEventListener('input', render);
sortSel.addEventListener('change', () => {
  try { localStorage.setItem(SORT_KEY, sortSel.value); } catch {}
  render();
});
// 검색창에서 Enter → 첫 번째 메모 열기, ↓ → 목록으로
qIn.addEventListener('keydown', (e) => {
  const first = listEl.querySelector('.item');
  if (e.key === 'Enter' && first) window.api.openMemo(first.dataset.id);
  if (e.key === 'ArrowDown' && first) { e.preventDefault(); first.focus(); }
});
listEl.addEventListener('keydown', (e) => {
  const items = [...listEl.querySelectorAll('.item')];
  const i = items.indexOf(document.activeElement);
  if (i < 0) return;
  if (e.key === 'ArrowDown' && items[i + 1]) { e.preventDefault(); items[i + 1].focus(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || qIn).focus(); }
  if (e.key === 'Enter') { e.preventDefault(); window.api.openMemo(items[i].dataset.id); }
  if (e.key === 'F2') { e.preventDefault(); startRename(items[i].dataset.id); }
  if (e.key === 'Delete') { e.preventDefault(); window.api.showContextMenu(items[i].dataset.id); }
});

function activeAlarmAt(m) {
  if (m.snoozeAt) return m.snoozeAt;
  if (m.alarm && !m.alarm.done) return m.alarm.at;
  return null;
}

function firstLine(m) {
  return m.preview ? m.preview.slice(0, 60) : '';
}

function render() {
  const q = qIn.value.trim().toLowerCase();
  let rows = memos.filter((m) => !q || m.title.toLowerCase().includes(q) || m.preview.toLowerCase().includes(q));

  const s = sortSel.value;
  rows.sort((a, b) => {
    if (s === 'alarm') {
      const x = activeAlarmAt(a), y = activeAlarmAt(b);
      if (x && y) return x - y;
      if (x) return -1;
      if (y) return 1;
      return b.updatedAt - a.updatedAt;
    }
    if (s === 'created') return b.createdAt - a.createdAt;
    if (s === 'title') return (a.title || firstLine(a) || '￿').localeCompare(b.title || firstLine(b) || '￿', 'ko');
    return b.updatedAt - a.updatedAt;
  });
  // 상단 고정한 메모는 정렬과 상관없이 맨 위 (고정끼리는 위 정렬 유지)
  rows = [...rows.filter((m) => m.pinned), ...rows.filter((m) => !m.pinned)];

  $('#count').textContent = memos.length ? memos.length : '';
  listEl.textContent = '';
  emptyEl.hidden = rows.length > 0;
  $('#foot-hint').hidden = memos.length === 0;
  if (!rows.length) {
    emptyEl.textContent = memos.length ? `"${qIn.value.trim()}"에 맞는 메모가 없어요.` : '아직 메모가 없어요.\n오른쪽 위 새 메모로 시작해 보세요.';
    emptyEl.style.whiteSpace = 'pre-line';
    return;
  }

  for (const m of rows) listEl.appendChild(buildItem(m, q));
}

function buildItem(m, q) {
  const li = document.createElement('li');
  // 안에 고정 버튼이 들어가므로 button 대신 포커스 가능한 div
  const btn = document.createElement('div');
  btn.className = 'item' + (m.pinned ? ' pinned' : '');
  btn.tabIndex = 0;
  btn.setAttribute('role', 'button');
  btn.dataset.id = m.id;
  btn.dataset.color = m.color || 'yellow';
  btn.onclick = () => window.api.openMemo(m.id);
  btn.oncontextmenu = (e) => { e.preventDefault(); btn.focus(); window.api.showContextMenu(m.id); };

  // 목록 밖으로 끌어 놓으면 바탕화면에 미니 메모로 꺼내기
  btn.draggable = true;
  btn.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', m.title || firstLine(m) || '메모');
    const ghost = makeGhost(m);
    e.dataTransfer.setDragImage(ghost, 18, 16);
    btn.classList.add('dragging');
  });
  btn.addEventListener('dragend', () => {
    btn.classList.remove('dragging');
    document.getElementById('drag-ghost')?.remove();
    window.api.dragEnd(m.id);
  });

  const sw = document.createElement('span');
  sw.className = 'swatch';

  const body = document.createElement('span');
  body.className = 'body';

  // 제목 줄: 제목이 없으면 본문 첫 부분을 흐리게
  const t = document.createElement('span');
  t.className = 't';
  const tt = document.createElement('span');
  const hasTitle = !!m.title;
  if (!hasTitle) t.classList.add('untitled');
  setHighlighted(tt, hasTitle ? m.title : (firstLine(m) || '빈 메모'), q);
  tt.className = 'tt';
  t.appendChild(tt);
  if (m.mini) {
    const b = document.createElement('span');
    b.className = 'badge soft';
    b.textContent = '바탕화면';
    b.title = '바탕화면에 미니 메모로 꺼내 둔 메모';
    t.appendChild(b);
  }
  if (m.alwaysOnTop) {
    const b = document.createElement('span');
    b.className = 'badge soft';
    b.textContent = '항상 위';
    t.appendChild(b);
  }
  if (m.open) {
    const b = document.createElement('span');
    b.className = 'badge';
    b.textContent = '열려 있음';
    t.appendChild(b);
  }
  body.appendChild(t);

  // 미리보기: 제목이 있을 때만 (없으면 제목 줄이 이미 본문)
  if (hasTitle && m.preview) {
    const p = document.createElement('span');
    p.className = 'p';
    p.style.display = 'block';
    setHighlighted(p, m.preview, q);
    body.appendChild(p);
  }

  const meta = document.createElement('span');
  meta.className = 'meta';
  const at = activeAlarmAt(m);
  if (at || (m.alarm && m.alarm.done)) {
    const a = document.createElement('span');
    a.className = 'alarm' + (at ? '' : ' done');
    a.innerHTML = '<svg viewBox="0 0 16 16"><circle cx="8" cy="9" r="5"/><path d="M8 6.5V9l1.8 1.2"/></svg>';
    const rep = !m.snoozeAt && m.alarm?.repeat === 'daily' ? ' · 매일' : !m.snoozeAt && m.alarm?.repeat === 'weekdays' ? ' · 평일' : '';
    a.append(at ? fmtWhen(at) + rep : '알림 완료');
    meta.appendChild(a);
  }
  const u = document.createElement('span');
  u.textContent = `수정 ${fmtWhen(m.updatedAt)}`;
  meta.appendChild(u);
  body.appendChild(meta);

  // 상단 고정 버튼
  const pin = document.createElement('button');
  pin.className = 'pin' + (m.pinned ? ' on' : '');
  pin.title = m.pinned ? '상단 고정 해제' : '목록 상단에 고정';
  pin.setAttribute('aria-pressed', m.pinned ? 'true' : 'false');
  pin.innerHTML = '<svg viewBox="0 0 16 16"><path d="M10.5 2.5 13.5 5.5 11 8l-.5 3-5-5 3-.5zM6 10 2.5 13.5"/></svg>';
  pin.onclick = (e) => { e.stopPropagation(); window.api.togglePinned(m.id); };
  pin.onkeydown = (e) => e.stopPropagation();

  btn.append(sw, body, pin);
  li.appendChild(btn);
  return li;
}

// ---------- 목록에서 제목 바로 바꾸기 ----------
function startRename(id) {
  const item = listEl.querySelector(`.item[data-id="${CSS.escape(id)}"]`);
  const m = memos.find((x) => x.id === id);
  if (!item || !m) return;
  renamingId = id;
  const t = item.querySelector('.t');
  const input = document.createElement('input');
  input.className = 'rename';
  input.maxLength = 100;
  input.value = m.title;
  input.placeholder = '제목 입력';
  t.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    renamingId = null;
    if (save && input.value.trim() !== m.title) window.api.renameMemo(id, input.value.trim());
    else render();
  };
  input.onclick = (e) => e.stopPropagation();
  input.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  };
  input.onblur = () => finish(true);
}

// 검색어 부분을 <mark>로 (텍스트 노드로만 만들어서 안전하게)
function setHighlighted(el, text, q) {
  el.textContent = '';
  if (!q) { el.textContent = text; return; }
  const lower = text.toLowerCase();
  let i = 0;
  while (i < text.length) {
    const j = lower.indexOf(q, i);
    if (j < 0) { el.append(text.slice(i)); break; }
    if (j > i) el.append(text.slice(i, j));
    const mk = document.createElement('mark');
    mk.textContent = text.slice(j, j + q.length);
    el.appendChild(mk);
    i = j + q.length;
  }
}

// 끌 때 커서에 붙는 모양: 바탕화면에 생길 미니 메모처럼
function makeGhost(m) {
  document.getElementById('drag-ghost')?.remove();
  const g = document.createElement('div');
  g.id = 'drag-ghost';
  g.className = 'ghost';
  g.dataset.color = m.color || 'yellow';
  const st = document.createElement('span');
  st.className = 'ghost-stripe';
  const tx = document.createElement('span');
  tx.textContent = m.title || firstLine(m) || '빈 메모';
  g.append(st, tx);
  document.body.appendChild(g);
  return g;
}
