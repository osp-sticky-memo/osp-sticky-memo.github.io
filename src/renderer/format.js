// 메모 창과 목록 창이 같이 쓰는 날짜 표시
function pad(n) { return String(n).padStart(2, '0'); }

function fmtWhen(ms) {
  const d = new Date(ms);
  const now = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86400000);
  const hm = `${d.getHours() < 12 ? '오전' : '오후'} ${((d.getHours() + 11) % 12) + 1}:${pad(d.getMinutes())}`;
  if (diff === 0) return `오늘 ${hm}`;
  if (diff === 1) return `내일 ${hm}`;
  if (diff === -1) return `어제 ${hm}`;
  const wd = '일월화수목금토'[d.getDay()];
  const y = d.getFullYear() !== now.getFullYear() ? `${d.getFullYear()}.` : '';
  return `${y}${d.getMonth() + 1}/${d.getDate()}(${wd}) ${hm}`;
}
