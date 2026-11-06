// 자동 업데이트 - GitHub Releases(osp-sticky-memo/osp-sticky-memo.github.io)의 latest.yml을 보고
// 새 버전이 있으면 내려받아 두었다가, 재시작하거나 프로그램을 끌 때 설치한다.
const { app } = require('electron');

const FIRST_CHECK_DELAY_MS = 15 * 1000;       // 시작하고 15초 뒤 첫 확인
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 이후 4시간마다

let autoUpdater = null;
let timer = null;
let hooks = {};
let state = { status: 'idle', version: null, percent: 0, message: '' };
let announced = null; // 이미 알림을 띄운 버전

function setState(patch) {
  state = { ...state, ...patch };
  hooks.onStatus?.(getState());
}

function getState() {
  return { ...state, current: app.getVersion(), packaged: app.isPackaged };
}

// hooks: { isEnabled(): boolean, onStatus(state), onDownloaded(version) }
function init(h) {
  hooks = h;
  // 개발 중(npm start)에는 설치된 앱이 아니라서 업데이트를 확인하지 않음
  if (!app.isPackaged) {
    setState({ status: 'dev' });
    return;
  }
  ({ autoUpdater } = require('electron-updater'));
  autoUpdater.logger = null;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // '나중에'를 눌러도 프로그램을 끌 때 설치

  autoUpdater.on('checking-for-update', () => setState({ status: 'checking', message: '' }));
  autoUpdater.on('update-not-available', () => setState({ status: 'latest', version: null }));
  autoUpdater.on('update-available', (info) => setState({ status: 'downloading', version: info.version, percent: 0 }));
  autoUpdater.on('download-progress', (p) => setState({ status: 'downloading', percent: Math.round(p.percent || 0) }));
  autoUpdater.on('update-downloaded', (info) => {
    setState({ status: 'ready', version: info.version, percent: 100 });
    if (announced !== info.version) {
      announced = info.version;
      hooks.onDownloaded?.(info.version);
    }
  });
  autoUpdater.on('error', (err) => {
    setState({ status: 'error', message: friendlyError(err) });
  });

  reschedule();
}

function friendlyError(err) {
  const msg = String(err?.message || err || '');
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::|getaddrinfo|network/i.test(msg)) return '인터넷에 연결되지 않아 확인하지 못했어요.';
  return '업데이트를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
}

// 설정이 바뀌면 다시 호출 (자동 업데이트 켜기/끄기)
function reschedule() {
  if (!autoUpdater) return;
  clearTimeout(timer);
  clearInterval(timer);
  timer = null;
  if (!hooks.isEnabled?.()) return;
  timer = setTimeout(() => {
    check();
    timer = setInterval(check, CHECK_INTERVAL_MS);
  }, FIRST_CHECK_DELAY_MS);
}

async function check() {
  if (!autoUpdater) return getState();
  if (state.status === 'ready' || state.status === 'downloading' || state.status === 'checking') return getState();
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    setState({ status: 'error', message: friendlyError(err) });
  }
  return getState();
}

// 지금 재시작해서 설치 (조용히 설치하고 다시 실행)
function installNow() {
  if (!autoUpdater || state.status !== 'ready') return false;
  hooks.beforeInstall?.();
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
  return true;
}

module.exports = { init, check, installNow, reschedule, getState };
