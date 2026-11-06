const data = JSON.parse(new URLSearchParams(location.search).get('data') || '{}');
const $ = (s) => document.querySelector(s);

const card = $('#card');
const progress = $('#progress');

document.body.dataset.color = data.color || 'yellow';

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
snoozeBtn.onclick = () => leave(() => window.api.snooze(data.memoId));

// ---------- 자동 닫힘 (마우스 올리면 멈춤) ----------
// 놓친 알림은 자동으로 사라지지 않게 해서 확인하도록
let remaining = data.duration;
let last = performance.now();
let hovering = false;
card.addEventListener('mouseenter', () => { hovering = true; });
card.addEventListener('mouseleave', () => { hovering = false; last = performance.now(); });

if (data.late) {
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
