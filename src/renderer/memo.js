const id = new URLSearchParams(location.search).get('id');
const $ = (s) => document.querySelector(s);

const editor = $('#editor');
const titleIn = $('#title');
const colorPanel = $('#color-panel');
const alarmPanel = $('#alarm-panel');
const deletePanel = $('#delete-panel');
const chip = $('#alarm-chip');
const chipBtn = $('#chip-btn');
const chipText = $('#chip-text');

let memo = null;
let repeat = 'none';

init();

async function init() {
  memo = await window.api.getMemo(id);
  if (!memo) return;
  editor.value = memo.content || '';
  titleIn.value = memo.title || '';
  paintHighlights(); // 링크 밑줄
  render();
  updateTitle();

  // 알림이 울려서 상태가 바뀌면 다시 그림
  window.api.onChanged((m) => {
    if (!m) return;
    memo = m;
    // 목록에서 제목을 바꾼 경우 반영 (입력 중일 땐 건드리지 않음)
    if (document.activeElement !== titleIn && titleIn.value !== (m.title || '')) {
      titleIn.value = m.title || '';
      updateTitle();
    }
    render();
  });
  window.api.onOpenAlarm(() => openAlarmPanel());
  window.api.onFocusEditor(() => titleIn.focus());

  // 1분마다 "오늘/내일" 표시 갱신
  setInterval(renderChip, 60 * 1000);
}

function render() {
  document.body.dataset.color = memo.color || 'yellow';
  $('#btn-pin').classList.toggle('on', !!memo.alwaysOnTop);
  $('#btn-alarm').classList.toggle('on', hasActiveAlarm());
  document.querySelectorAll('.swatches button').forEach((b) => {
    b.dataset.color = b.dataset.c; // 스와치는 자기 색 변수 사용
    b.classList.toggle('on', b.dataset.c === memo.color);
  });
  renderChip();
}

function hasActiveAlarm() {
  return !!(memo.snoozeAt || (memo.alarm && !memo.alarm.done));
}

function renderChip() {
  const a = memo.alarm;
  chipBtn.classList.remove('active', 'done');
  if (memo.snoozeAt) {
    chip.hidden = false;
    chipBtn.classList.add('active');
    chipText.textContent = `다시 알림 ${fmtWhen(memo.snoozeAt)}`;
    return;
  }
  if (!a) { chip.hidden = true; return; }
  chip.hidden = false;
  const rep = a.repeat === 'daily' ? ' · 매일' : a.repeat === 'weekdays' ? ' · 평일' : '';
  if (a.done) {
    chipBtn.classList.add('done');
    chipText.textContent = `${fmtWhen(a.at)} 알림 완료`;
  } else {
    chipBtn.classList.add('active');
    chipText.textContent = fmtWhen(a.at) + rep;
  }
}

// ---------- 편집 자동 저장 ----------
let saveT;
// 작업표시줄에서 메모를 구분할 수 있게 첫 줄을 창 제목으로
function updateTitle() {
  const line = titleIn.value.trim() || editor.value.split('\n').map((s) => s.trim()).find(Boolean);
  document.title = line ? (line.length > 30 ? line.slice(0, 30) + '…' : line) : '딩동메모';
}

editor.addEventListener('input', () => {
  updateTitle();
  clearTimeout(saveT);
  saveT = setTimeout(() => window.api.updateMemo(id, { content: editor.value }), 300);
});
// 제목 저장, Enter 누르면 본문으로
let titleT;
titleIn.addEventListener('input', () => {
  updateTitle();
  clearTimeout(titleT);
  titleT = setTimeout(() => window.api.updateMemo(id, { title: titleIn.value }), 300);
});
titleIn.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); editor.focus(); }
});

window.addEventListener('beforeunload', () => {
  clearTimeout(saveT);
  clearTimeout(titleT);
  window.api.updateMemo(id, { title: titleIn.value, content: editor.value });
});

// ---------- 상단 버튼 ----------
$('#btn-new').onclick = () => window.api.newMemo();
$('#btn-list').onclick = () => window.api.openList();
$('#btn-close').onclick = async () => {
  await window.api.updateMemo(id, { title: titleIn.value, content: editor.value });
  window.api.hideMemo(id);
};
$('#btn-pin').onclick = async () => { memo = await window.api.togglePin(id); render(); };
$('#btn-color').onclick = (e) => { e.stopPropagation(); togglePanel(colorPanel); };
$('#btn-alarm').onclick = () => openAlarmPanel();
$('#btn-delete').onclick = () => togglePanel(deletePanel, true);
chipBtn.onclick = () => openAlarmPanel();

document.querySelectorAll('.swatches button').forEach((b) => {
  b.onclick = async () => {
    memo = await window.api.updateMemo(id, { color: b.dataset.c });
    colorPanel.hidden = true;
    render();
  };
});
document.addEventListener('click', (e) => {
  if (!colorPanel.hidden && !colorPanel.contains(e.target)) colorPanel.hidden = true;
});

function togglePanel(panel, show) {
  const next = show ?? panel.hidden;
  [colorPanel, alarmPanel, deletePanel].forEach((p) => { p.hidden = true; });
  panel.hidden = !next;
}

// ---------- 삭제 ----------
$('#delete-cancel').onclick = () => { deletePanel.hidden = true; };
$('#delete-ok').onclick = () => window.api.deleteMemo(id);

// ---------- 알림 설정 ----------
const dateIn = $('#alarm-date');
const timeIn = $('#alarm-time');
const errEl = $('#alarm-err');

function openAlarmPanel() {
  const base = memo.alarm && !memo.alarm.done ? new Date(memo.alarm.at) : defaultTime();
  setInputs(base);
  setRepeat(memo.alarm?.repeat || 'none');
  errEl.textContent = '';
  $('#alarm-clear').style.visibility = memo.alarm || memo.snoozeAt ? 'visible' : 'hidden';
  togglePanel(alarmPanel, true);
}

// 기본값: 지금부터 1시간 뒤 정각
function defaultTime() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
}

function setInputs(d) {
  dateIn.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  timeIn.value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function setRepeat(r) {
  repeat = r;
  document.querySelectorAll('#alarm-repeat button').forEach((b) => b.classList.toggle('on', b.dataset.r === r));
}
document.querySelectorAll('#alarm-repeat button').forEach((b) => { b.onclick = () => setRepeat(b.dataset.r); });

document.querySelectorAll('.quick button').forEach((b) => {
  b.onclick = () => {
    const d = new Date();
    d.setSeconds(0, 0);
    if (b.dataset.q === '10m') d.setMinutes(d.getMinutes() + 10);
    if (b.dataset.q === '30m') d.setMinutes(d.getMinutes() + 30);
    if (b.dataset.q === '1h') d.setHours(d.getHours() + 1);
    if (b.dataset.q === 'tomorrow9') { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
    setInputs(d);
    errEl.textContent = '';
  };
});

$('#alarm-cancel').onclick = () => { alarmPanel.hidden = true; };
$('#alarm-clear').onclick = async () => {
  memo = await window.api.setAlarm(id, null);
  alarmPanel.hidden = true;
  render();
};
$('#alarm-save').onclick = async () => {
  if (!dateIn.value || !timeIn.value) { errEl.textContent = '날짜와 시간을 입력하세요.'; return; }
  const at = new Date(`${dateIn.value}T${timeIn.value}:00`);
  if (isNaN(at)) { errEl.textContent = '날짜 형식이 올바르지 않아요.'; return; }

  let when = at;
  if (when.getTime() <= Date.now()) {
    if (repeat === 'none') { errEl.textContent = '지난 시간이에요. 이후 시간으로 정해주세요.'; return; }
    // 반복 알림은 다음 해당 시각으로 자동 이동
    when = rollForward(at, repeat);
  }
  if (repeat === 'weekdays') when = rollToWeekday(when);

  memo = await window.api.setAlarm(id, { at: when.getTime(), repeat });
  alarmPanel.hidden = true;
  render();
};

function rollForward(d, r) {
  const n = new Date(d);
  while (n.getTime() <= Date.now()) n.setDate(n.getDate() + 1);
  return r === 'weekdays' ? rollToWeekday(n) : n;
}
function rollToWeekday(d) {
  const n = new Date(d);
  while (n.getDay() === 0 || n.getDay() === 6) n.setDate(n.getDate() + 1);
  return n;
}

// ---------- 찾기 (Ctrl+F) ----------
const findBar = $('#find');
const findQ = $('#find-q');
const findCount = $('#find-count');
const hl = $('#hl');
let matches = [];   // [{ start, end }]
let cur = -1;
let links = [];     // [{ start, end, url }]

function openFind() {
  // 본문에서 고른 글자가 있으면 그걸로 찾기
  const sel = editor.value.slice(editor.selectionStart, editor.selectionEnd);
  if (document.activeElement === editor && sel && !sel.includes('\n') && sel.length <= 50) findQ.value = sel;
  findBar.hidden = false;
  findQ.focus();
  findQ.select();
  runFind(true);
}

function closeFind() {
  findBar.hidden = true;
  const m = matches[cur];
  matches = []; cur = -1;
  paintHighlights();
  editor.focus();
  if (m) editor.setSelectionRange(m.start, m.end); // 찾은 곳을 선택한 채로 본문으로
}

// keepNear: 지금 위치에서 가까운 것부터 (처음 열 때·글자 바꿀 때)
function runFind(keepNear) {
  const q = findQ.value;
  matches = [];
  if (q) {
    const text = editor.value.toLowerCase();
    const needle = q.toLowerCase();
    let i = text.indexOf(needle);
    while (i !== -1) { matches.push({ start: i, end: i + needle.length }); i = text.indexOf(needle, i + needle.length); }
  }
  if (!matches.length) cur = -1;
  else if (keepNear || cur < 0) {
    const from = editor.selectionStart || 0;
    cur = Math.max(0, matches.findIndex((m) => m.end > from));
  } else cur = Math.min(cur, matches.length - 1);
  paintHighlights();
  updateCount();
  revealCurrent();
}

function step(dir) {
  if (!matches.length) return;
  cur = (cur + dir + matches.length) % matches.length;
  paintHighlights();
  updateCount();
  revealCurrent();
}

function updateCount() {
  const q = findQ.value;
  findCount.classList.toggle('none', !!q && !matches.length);
  findCount.textContent = !q ? '' : matches.length ? `${cur + 1}/${matches.length}` : '없음';
  $('#find-prev').disabled = $('#find-next').disabled = matches.length < 2;
}

// textarea 뒤에 같은 글자를 투명하게 깔고, 링크 밑줄과 찾은 부분 형광펜만 그리기
function paintHighlights() {
  const text = editor.value;
  links = findLinks(text);
  hl.textContent = '';
  if (!matches.length && !links.length) return;
  // 링크·찾은 곳의 시작/끝마다 잘라서 조각마다 표시
  const cuts = new Set([0, text.length]);
  for (const r of [...links, ...matches]) { cuts.add(r.start); cuts.add(r.end); }
  const pts = [...cuts].sort((a, b) => a - b);
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1];
    const piece = text.slice(a, b);
    const li = links.findIndex((r) => r.start <= a && b <= r.end);
    const mi = matches.findIndex((r) => r.start <= a && b <= r.end);
    if (li < 0 && mi < 0) { hl.append(piece); continue; }
    const el = document.createElement(mi >= 0 ? 'mark' : 'span');
    if (mi === cur && mi >= 0) el.classList.add('cur');
    if (li >= 0) { el.classList.add('lk'); el.dataset.l = li; }
    el.textContent = piece;
    hl.appendChild(el);
  }
  hl.append('\n');
  syncHighlightBox();
}

// 스크롤바가 생기면 글자 폭이 줄어드니 같은 폭으로 맞추고, 스크롤도 같이
function syncHighlightBox() {
  const sb = editor.offsetWidth - editor.clientWidth;
  hl.style.paddingRight = `${14 + sb}px`;
  hl.scrollTop = editor.scrollTop;
}

// 지금 찾은 곳이 보이게 스크롤 (가운데쯤)
function revealCurrent() {
  const mk = hl.querySelector('mark.cur');
  if (!mk) return;
  const top = mk.offsetTop;
  const view = editor.clientHeight;
  if (top < editor.scrollTop + 8 || top + mk.offsetHeight > editor.scrollTop + view - 8) {
    editor.scrollTop = Math.max(0, top - view / 2 + mk.offsetHeight / 2);
  }
  hl.scrollTop = editor.scrollTop;
}

editor.addEventListener('scroll', () => { hl.scrollTop = editor.scrollTop; });
editor.addEventListener('input', () => { if (!findBar.hidden) runFind(false); });
new ResizeObserver(() => { if (matches.length) syncHighlightBox(); }).observe(editor);

findQ.addEventListener('input', () => runFind(true));
findQ.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
  if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
});
$('#find-next').onclick = () => step(1);
$('#find-prev').onclick = () => step(-1);
$('#find-close').onclick = closeFind;

document.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && key === 'f') { e.preventDefault(); openFind(); }
  else if (e.key === 'F3') { e.preventDefault(); if (findBar.hidden) openFind(); else step(e.shiftKey ? -1 : 1); }
  else if (e.key === 'Escape' && !findBar.hidden) { e.preventDefault(); closeFind(); }
});

// ---------- 링크 열기 ----------
// http(s)://, www. 로 시작하는 주소. 한글이나 공백에서 끊고, 끝의 문장부호는 뺀다
const URL_RE = /\b(?:https?:\/\/|www\.)[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+/gi;
function findLinks(text) {
  const out = [];
  for (const m of text.matchAll(URL_RE)) {
    let raw = m[0];
    while (/[.,;:!?'")\]]$/.test(raw)) {
      // 괄호는 주소 안에 여는 괄호가 있으면 살림 (위키 주소 등)
      if (raw.endsWith(')') && (raw.match(/\(/g) || []).length >= (raw.match(/\)/g) || []).length) break;
      raw = raw.slice(0, -1);
    }
    if (raw.length < 8) continue;
    const url = /^www\./i.test(raw) ? `https://${raw}` : raw;
    out.push({ start: m.index, end: m.index + raw.length, url });
  }
  return out;
}

// 마우스 위치에 있는 링크 (뒤에 깔린 밑줄 조각의 위치로 판단)
function linkAt(x, y) {
  for (const el of hl.querySelectorAll('.lk')) {
    for (const r of el.getClientRects()) {
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return links[Number(el.dataset.l)];
    }
  }
  return null;
}

function openLink(l) { if (l) window.api.openUrl(l.url); }

let hover = null;
function paintHover(ctrl) {
  editor.classList.toggle('over-link', !!hover && ctrl);
  editor.title = hover ? 'Ctrl+클릭하면 브라우저로 열기' : '';
}
editor.addEventListener('mousemove', (e) => { hover = linkAt(e.clientX, e.clientY); paintHover(e.ctrlKey || e.metaKey); });
editor.addEventListener('mouseleave', () => { hover = null; paintHover(false); });
window.addEventListener('keydown', (e) => { if (e.key === 'Control' || e.key === 'Meta') paintHover(true); });
window.addEventListener('keyup', (e) => { if (e.key === 'Control' || e.key === 'Meta') paintHover(false); });
editor.addEventListener('mousedown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.button !== 0) return;
  const l = linkAt(e.clientX, e.clientY);
  if (!l) return;
  e.preventDefault();
  openLink(l);
});

// 커서가 링크 안에 있으면 아래에 '링크 열기' 버튼
const linkChip = $('#link-chip');
const linkChipText = $('#link-chip-text');
let chipLink = null;
function updateLinkChip() {
  const p = editor.selectionStart;
  const focused = document.activeElement === editor;
  chipLink = focused && editor.selectionStart === editor.selectionEnd
    ? links.find((l) => p >= l.start && p <= l.end) || null
    : null;
  linkChip.hidden = !chipLink;
  if (chipLink) linkChipText.textContent = chipLink.url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}
['click', 'keyup', 'focus'].forEach((ev) => editor.addEventListener(ev, updateLinkChip));
editor.addEventListener('input', () => { paintHighlights(); updateLinkChip(); });
editor.addEventListener('blur', () => setTimeout(updateLinkChip, 150));
linkChip.addEventListener('mousedown', (e) => e.preventDefault()); // 눌러도 본문 포커스 유지
linkChip.addEventListener('click', () => openLink(chipLink));

