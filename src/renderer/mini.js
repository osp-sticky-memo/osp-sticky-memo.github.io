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
  // 내용에 맞게 창 너비 조절 (여백·그림자 10px 포함)
  requestAnimationFrame(() => {
    const natural = pill.scrollWidth + 10 + (titleEl.scrollWidth - titleEl.clientWidth);
    window.api.resizeMini(natural + 2);
  });
}

// ---------- 끌어서 옮기기 (드래그 영역 대신 직접 처리해야 더블클릭이 됨) ----------
let drag = null;
pill.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('.x')) return;
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

pill.addEventListener('dblclick', (e) => {
  if (e.target.closest('.x')) return;
  window.api.openFromMini(id);
});
pill.addEventListener('contextmenu', (e) => { e.preventDefault(); window.api.miniContextMenu(id); });
$('#btn-x').onclick = () => window.api.closeMini(id);
