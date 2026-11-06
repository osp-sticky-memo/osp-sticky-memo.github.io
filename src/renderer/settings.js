const $ = (s) => document.querySelector(s);
const POS_LABEL = {
  'top-left': '좌측 상단', 'top-center': '위 가운데', 'top-right': '우측 상단',
  'bottom-left': '좌측 하단', 'bottom-center': '아래 가운데', 'bottom-right': '우측 하단',
};

let settings = null;
let savedT;

init();

async function init() {
  settings = await window.api.getSettings();
  $('#displays').hidden = !(settings.displayCount > 1);
  render();
}

function render() {
  document.querySelectorAll('.slot').forEach((b) => {
    const on = b.dataset.pos === settings.notifyPosition;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  $('#pos-label').textContent = POS_LABEL[settings.notifyPosition];

  document.querySelectorAll('[data-display]').forEach((b) => b.classList.toggle('on', b.dataset.display === settings.notifyDisplay));

  document.querySelectorAll('.choice').forEach((b) => {
    const on = b.dataset.mode === settings.notifyMode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  });

  const manual = settings.notifyMode === 'manual';
  $('#seconds').value = settings.notifySeconds;
  $('#seconds').disabled = manual;
  $('#duration').classList.toggle('off', manual);
  $('#sec-value').textContent = manual ? '확인할 때까지' : `${settings.notifySeconds}초`;

  $('#login').checked = !!settings.openAtLogin;
  $('#auto-update').checked = settings.autoUpdate !== false;
}

// ---------- 업데이트 ----------
function renderUpdate(u) {
  $('#ver').textContent = u.current;
  const st = $('#up-status');
  const btn = $('#btn-update');
  st.className = 'up-status';
  btn.className = 'small-btn';
  btn.disabled = false;
  btn.textContent = '업데이트 확인';
  $('#up-bar').hidden = true;
  switch (u.status) {
    case 'dev': st.textContent = '개발 모드에서는 업데이트를 확인하지 않아요.'; btn.disabled = true; break;
    case 'checking': st.textContent = '새 버전을 확인하는 중…'; btn.disabled = true; break;
    case 'latest': st.textContent = '최신 버전이에요.'; st.classList.add('ok'); break;
    case 'downloading':
      st.textContent = `새 버전 ${u.version || ''} 받는 중… ${u.percent || 0}%`;
      $('#up-bar').hidden = false;
      $('#up-fill').style.width = `${u.percent || 0}%`;
      btn.disabled = true;
      break;
    case 'ready':
      st.textContent = `새 버전 ${u.version} 준비 완료`;
      st.classList.add('ready');
      btn.textContent = '재시작해서 업데이트';
      btn.classList.add('primary');
      break;
    case 'error': st.textContent = u.message; st.classList.add('err'); break;
    default: st.textContent = '';
  }
  btn.dataset.status = u.status;
}

$('#btn-update').onclick = async () => {
  if ($('#btn-update').dataset.status === 'ready') window.api.installUpdate();
  else renderUpdate(await window.api.checkUpdate());
};
window.api.onUpdateStatus(renderUpdate);
window.api.getUpdateState().then(renderUpdate);
$('#auto-update').addEventListener('change', (e) => save({ autoUpdate: e.target.checked }));

async function save(patch) {
  const next = await window.api.setSettings(patch);
  settings = { ...settings, ...next, ...('openAtLogin' in patch ? { openAtLogin: patch.openAtLogin } : {}) };
  render();
  $('#saved').textContent = '저장했어요';
  clearTimeout(savedT);
  savedT = setTimeout(() => { $('#saved').textContent = ''; }, 1500);
}

document.querySelectorAll('.slot').forEach((b) => { b.onclick = () => save({ notifyPosition: b.dataset.pos }); });
document.querySelectorAll('[data-display]').forEach((b) => { b.onclick = () => save({ notifyDisplay: b.dataset.display }); });
document.querySelectorAll('.choice').forEach((b) => { b.onclick = () => save({ notifyMode: b.dataset.mode }); });

// 슬라이더는 끄는 동안 숫자만 바꾸고, 놓으면 저장
$('#seconds').addEventListener('input', (e) => { $('#sec-value').textContent = `${e.target.value}초`; });
$('#seconds').addEventListener('change', (e) => save({ notifySeconds: Number(e.target.value) }));

$('#login').addEventListener('change', (e) => save({ openAtLogin: e.target.checked }));
$('#btn-test').onclick = () => window.api.testNotify();
