const data = JSON.parse(new URLSearchParams(location.search).get('data') || '{}');
const $ = (s) => document.querySelector(s);

const card = $('#card');
const progress = $('#progress');

document.body.dataset.color = data.color || 'yellow';
document.body.dataset.pos = data.position || 'bottom-right';
const manual = data.mode === 'manual';
document.body.classList.toggle('manual', manual);
// 확인 모드: X 대신 확인 버튼 (확인을 눌러야 닫힘)
$('#btn-x').hidden = manual;
$('#btn-ok').hidden = !manual;

const text = (data.content || '').trim();
const contentEl = $('#content');
if (data.title) {
  // 제목은 굵게 한 줄, 본문은 그 아래 한 줄
  const b = document.createElement('strong');
  b.className = 'ntitle';
  b.textContent = data.title;
  contentEl.append(b);
  if (text) contentEl.append('\n' + text);
} else {
  contentEl.textContent = text || '(빈 메모)';
  contentEl.classList.toggle('empty', !text);
}

const d = new Date(data.dueAt);
const hm = `${d.getHours() < 12 ? '오전' : '오후'} ${((d.getHours() + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, '0')}`;
const timeEl = $('#time');
timeEl.textContent = data.late ? `놓친 알림 ${hm}` : hm;
timeEl.classList.toggle('late', !!data.late);

const snoozeBtn = $('#btn-snooze');
snoozeBtn.textContent = `${data.snoozeMin}분 뒤`;
snoozeBtn.hidden = !data.memoId;

// ---------- 동작 ----------
let closing = false;
function leave(fn) {
  if (closing) return;
  closing = true;
  card.classList.add('leaving');
  setTimeout(fn, 200);
}

$('#open-area').onclick = () => leave(() => window.api.openFromNotify(data.memoId));
$('#btn-x').onclick = () => leave(() => window.api.closeNotify());
$('#btn-ok').onclick = () => leave(() => window.api.closeNotify());

// 업데이트 준비 알림: [지금 재시작] [나중에]
if (data.update) {
  document.body.classList.add('update');
  contentEl.textContent = '';
  const b = document.createElement('strong');
  b.className = 'ntitle';
  b.textContent = `새 버전 ${data.update} 준비 완료`;
  contentEl.append(b, '\n지금 재시작하면 바로 적용돼요. 나중에 하면 프로그램을 끌 때 설치돼요.');
  contentEl.classList.remove('empty');
  timeEl.textContent = '업데이트';
  timeEl.classList.remove('late');
  $('#open-area').onclick = null;
  $('#open-area').style.cursor = 'default';
  const ok = $('#btn-ok');
  ok.textContent = '지금 재시작';
  ok.onclick = () => window.api.installUpdate();
  snoozeBtn.hidden = false;
  snoozeBtn.textContent = '나중에';
  snoozeBtn.onclick = () => leave(() => window.api.closeNotify());
}
snoozeBtn.onclick = () => leave(() => window.api.snooze(data.memoId));

// ---------- 자동 닫힘 (마우스 올리면 멈춤) ----------
// 확인 모드이거나 놓친 알림이면 자동으로 사라지지 않음
let remaining = data.duration;
let last = performance.now();
let hovering = false;
card.addEventListener('mouseenter', () => { hovering = true; });
card.addEventListener('mouseleave', () => { hovering = false; last = performance.now(); });

if (data.late || manual) {
  progress.hidden = true;
} else {
  requestAnimationFrame(function tick(now) {
    if (!hovering) remaining -= now - last;
    last = now;
    progress.style.transform = `scaleX(${Math.max(0, remaining / data.duration)})`;
    if (remaining <= 0) return leave(() => window.api.closeNotify());
    requestAnimationFrame(tick);
  });
}

// ---------- 알림음 (띵-동) ----------
try {
  const ctx = new AudioContext();
  [[880, 0], [660, 0.16]].forEach(([freq, t]) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start(ctx.currentTime + t);
    o.stop(ctx.currentTime + t + 0.4);
  });
} catch {}
