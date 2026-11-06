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
