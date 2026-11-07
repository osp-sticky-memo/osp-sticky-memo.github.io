// 자동 업데이트 - GitHub Releases(osp-sticky-memo/osp-sticky-memo.github.io)의 latest.yml을 보고
// 새 버전이 있으면 내려받아 두었다가, 재시작하거나 프로그램을 끌 때 설치한다.
//
// 확인 시점
//  - 켜고 15초 뒤, 이후 1시간마다
//  - 절전에서 깨어날 때·메모 목록을 열 때 (마지막 확인 후 10분이 지났으면)
//  - 설정의 '업데이트 확인' (바로)
// '나중에'로 미룬 업데이트는 하루 뒤 한 번 더 알린다.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const FIRST_CHECK_DELAY_MS = 15 * 1000;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const STALE_MS = 10 * 60 * 1000;
const REMIND_AFTER_MS = 24 * 60 * 60 * 1000;

let autoUpdater = null;
let firstTimer = null;
let intervalTimer = null;
let hooks = {};
let state = { status: 'idle', version: null, percent: 0, message: '', lastCheckAt: null };
let announcedAt = 0; // 준비된 업데이트를 마지막으로 알린 시각

// ---------- 기록 (문제 생겼을 때 %APPDATA%\딩동메모\update.log 확인용) ----------
let logFile = null;
function log(msg) {
  try {
    if (!logFile) logFile = path.join(app.getPath('userData'), 'update.log');
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 200 * 1024) fs.renameSync(logFile, logFile + '.old');
    fs.appendFileSync(logFile, `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

function setState(patch) {
  state = { ...state, ...patch };
  hooks.onStatus?.(getState());
}

function getState() {
  return { ...state, current: app.getVersion(), packaged: app.isPackaged };
}

// hooks: { isEnabled(): boolean, onStatus(state), onDownloaded(version), beforeInstall() }
function init(h) {
  hooks = h;
  // 개발 중(npm start)에는 설치된 앱이 아니라서 업데이트를 확인하지 않음
  if (!app.isPackaged) {
    setState({ status: 'dev' });
    return;
  }
  ({ autoUpdater } = require('electron-updater'));
  autoUpdater.logger = { info: (m) => log(`info ${m}`), warn: (m) => log(`warn ${m}`), error: (m) => log(`error ${m}`), debug: () => {} };
  autoUpdater.autoDownload = true;
  autoUpdater.disableWebInstaller = true;
  autoUpdater.autoInstallOnAppQuit = true; // '나중에'를 눌러도 프로그램을 끌 때 설치

  autoUpdater.on('checking-for-update', () => setState({ status: 'checking', message: '' }));
  autoUpdater.on('update-not-available', (info) => { log(`latest ${info?.version}`); setState({ status: 'latest', version: null }); });
  autoUpdater.on('update-available', (info) => { log(`available ${info.version}`); setState({ status: 'downloading', version: info.version, percent: 0 }); });
  autoUpdater.on('download-progress', (p) => setState({ status: 'downloading', percent: Math.round(p.percent || 0) }));
  autoUpdater.on('update-downloaded', (info) => {
    log(`downloaded ${info.version}`);
    setState({ status: 'ready', version: info.version, percent: 100 });
    announce();
  });
  autoUpdater.on('error', (err) => {
    log(`error ${err?.stack || err}`);
    setState({ status: 'error', message: friendlyError(err) });
  });

  log(`start v${app.getVersion()} auto=${!!hooks.isEnabled?.()}`);
  reschedule();
}

function announce() {
  announcedAt = Date.now();
  hooks.onDownloaded?.(state.version);
}

function friendlyError(err) {
  const msg = String(err?.message || err || '');
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|net::|getaddrinfo|network/i.test(msg)) return '인터넷에 연결되지 않아 확인하지 못했어요.';
  return '업데이트를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
}

// 설정이 바뀌면 다시 호출 (자동 업데이트 켜기/끄기)
function reschedule() {
  if (!autoUpdater) return;
  clearTimeout(firstTimer);
  clearInterval(intervalTimer);
  firstTimer = intervalTimer = null;
  if (!hooks.isEnabled?.()) return;
  firstTimer = setTimeout(() => check('startup'), FIRST_CHECK_DELAY_MS);
  intervalTimer = setInterval(tick, CHECK_INTERVAL_MS);
}

// 1시간마다: 새 버전 확인, 미뤄 둔 업데이트는 하루 지나면 다시 알림
function tick() {
  if (state.status === 'ready') {
    if (Date.now() - announcedAt >= REMIND_AFTER_MS) announce();
    return;
  }
  check('interval');
}

// 절전 해제·목록 열기 때: 마지막 확인 후 10분이 지났으면 확인
function checkIfStale(reason) {
  if (!autoUpdater || !hooks.isEnabled?.()) return;
  if (state.lastCheckAt && Date.now() - state.lastCheckAt < STALE_MS) return;
  check(reason);
}

async function check(reason = 'manual') {
  if (!autoUpdater) return getState();
  if (state.status === 'ready' || state.status === 'downloading' || state.status === 'checking') return getState();
  log(`check (${reason})`);
  setState({ lastCheckAt: Date.now() });
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    log(`check failed ${err?.stack || err}`);
    setState({ status: 'error', message: friendlyError(err) });
  }
  return getState();
}

// 지금 재시작해서 설치 (조용히 설치하고 다시 실행)
function installNow() {
  if (!autoUpdater || state.status !== 'ready') return false;
  log(`install ${state.version}`);
  hooks.beforeInstall?.();
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
  return true;
}

module.exports = { init, check, checkIfStale, installNow, reschedule, getState };
