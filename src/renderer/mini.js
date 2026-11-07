// 바탕화면 미니 메모: 제목만 보이는 작은 조각. 더블클릭 → 메모 열기, 끌어서 옮기기
const id = new URLSearchParams(location.search).get('id');
const $ = (s) => document.querySelector(s);
const pill = $('#pill');
const titleEl = $('#title');

init();

async function init() {
  const d = await window.api.getMini(id);
  if (d) render(d);
  window.api.onMiniData(render);
}

function render(d) {
  document.body.dataset.color = d.color;
  titleEl.textContent = d.title;
  titleEl.classList.toggle('empty', d.title === '빈 메모');
  $('#bell').hidden = !d.alarm;
  document.title = d.title;
  // 사용자가 길이를 정하지 않았으면 제목 길이에 맞춤 (긴 제목은 … 처리)
  if (!d.fixedWidth) requestAnimationFrame(() => window.api.resizeMini(id, naturalWidth()));
}

// 제목 전체가 보이는 너비 = 제목 외 부분 + 실제 글자 너비 + 창 여백(10)
function naturalWidth() {
  const r = document.createRange();
  r.selectNodeContents(titleEl);
  const textW = r.getBoundingClientRect().width;
  return Math.ceil(pill.offsetWidth - titleEl.clientWidth + textW + 10 + 2);
}

// ---------- 끌어서 옮기기 (드래그 영역 대신 직접 처리해야 더블클릭이 됨) ----------
let drag = null;
pill.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('.x') || e.target.closest('.grip')) return;
  drag = { sx: e.screenX, sy: e.screenY, wx: window.screenX, wy: window.screenY, moved: false };
  pill.setPointerCapture(e.pointerId);
});
pill.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.screenX - drag.sx;
  const dy = e.screenY - drag.sy;
  if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
  drag.moved = true;
  pill.classList.add('dragging');
  window.api.moveMini(drag.wx + dx, drag.wy + dy);
});
const endDrag = () => { drag = null; pill.classList.remove('dragging'); };
pill.addEventListener('pointerup', endDrag);
pill.addEventListener('pointercancel', endDrag);

// ---------- 오른쪽 끝을 끌어서 길이 조절 ----------
const grip = $('#grip');
let resize = null;
grip.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  e.stopPropagation();
  resize = { sx: e.screenX, w: window.outerWidth };
  grip.setPointerCapture(e.pointerId);
  pill.classList.add('resizing');
});
grip.addEventListener('pointermove', (e) => {
  if (!resize) return;
  window.api.setMiniWidth(id, resize.w + (e.screenX - resize.sx));
});
const endResize = () => { resize = null; pill.classList.remove('resizing'); };
grip.addEventListener('pointerup', endResize);
grip.addEventListener('pointercancel', endResize);
grip.addEventListener('dblclick', (e) => { e.stopPropagation(); window.api.resetMiniWidth(id); });

pill.addEventListener('dblclick', (e) => {
  if (e.target.closest('.x') || e.target.closest('.grip')) return;
  window.api.openFromMini(id);
});
pill.addEventListener('contextmenu', (e) => { e.preventDefault(); window.api.miniContextMenu(id); });
$('#btn-x').onclick = () => window.api.closeMini(id);
