// 스티커 메모 - 메인 프로세스
// 역할: 메모 저장, 메모 창 관리, 트레이, 알림 스케줄러, 카톡식 알림 팝업

const {
  app, BrowserWindow, Tray, Menu, ipcMain, screen, powerMonitor, nativeImage,
} = require('electron');
const path = require('path');
const store = require('./store');

const ASSETS = path.join(__dirname, '..', 'assets');
const DEFAULT_SIZE = { width: 260, height: 260 };
const NOTIFY_SIZE = { width: 340, height: 104 };
const NOTIFY_GAP = 8;
const NOTIFY_MARGIN = 12;
const NOTIFY_DURATION_MS = 8000;
const SNOOZE_MIN = 5;

const memoWindows = new Map(); // memoId -> BrowserWindow
let notifyWindows = [];        // 아래에서 위로 쌓이는 순서
let tray = null;
let schedulerTimer = null;
let isQuitting = false;

// ---------- 중복 실행 방지 ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showAllMemos());
}

// 윈도우 알림 그룹/작업표시줄 식별용
app.setAppUserModelId('com.ohsang.util.stickymemo');

app.whenReady().then(() => {
  store.load(app.getPath('userData'));

  createTray();

  const memos = store.getMemos();
  if (memos.length === 0) {
    createMemo();
  } else {
    memos.filter((m) => m.visible).forEach((m) => openMemoWindow(m.id));
  }

  startScheduler();
  powerMonitor.on('resume', checkAlarms);   // 절전 해제 시 놓친 알림 처리
  powerMonitor.on('unlock-screen', checkAlarms);
});

// 창을 다 닫아도 종료하지 않고 트레이에 상주 (리스너만 등록해두면 자동 종료 안 됨)
app.on('window-all-closed', () => {});

app.on('before-quit', () => {
  isQuitting = true;
  store.flush();
});

// ---------- 메모 창 ----------
function openMemoWindow(id) {
  const memo = store.getMemo(id);
  if (!memo) return null;

  const existing = memoWindows.get(id);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return existing;
  }

  const bounds = fitToScreen({
    x: memo.x, y: memo.y,
    width: memo.width || DEFAULT_SIZE.width,
    height: memo.height || DEFAULT_SIZE.height,
  });

  const win = new BrowserWindow({
    ...bounds,
    minWidth: 180,
    minHeight: 140,
    frame: false,
    transparent: false,
    backgroundColor: '#00000000',
    skipTaskbar: true,
    alwaysOnTop: !!memo.alwaysOnTop,
    show: false,
    icon: path.join(ASSETS, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'memo.html'), { query: { id } });
  win.once('ready-to-show', () => win.show());

  const saveBounds = debounce(() => {
    if (win.isDestroyed()) return;
    const b = win.getBounds();
    store.updateMemo(id, { x: b.x, y: b.y, width: b.width, height: b.height });
  }, 400);
  win.on('move', saveBounds);
  win.on('resize', saveBounds);

  win.on('closed', () => {
    memoWindows.delete(id);
    refreshTrayMenu();
  });

  memoWindows.set(id, win);
  store.updateMemo(id, { visible: true });
  refreshTrayMenu();
  return win;
}

function createMemo(near) {
  const wa = screen.getPrimaryDisplay().workArea;
  let x = wa.x + Math.round(wa.width / 2 - DEFAULT_SIZE.width / 2);
  let y = wa.y + Math.round(wa.height / 3 - DEFAULT_SIZE.height / 2);
  if (near) { x = near.x + 30; y = near.y + 30; }

  const memo = store.addMemo({ x, y, ...DEFAULT_SIZE });
  const win = openMemoWindow(memo.id);
  win?.webContents.once('did-finish-load', () => win.webContents.send('memo:focus-editor'));
  return memo;
}

function hideMemo(id) {
  store.updateMemo(id, { visible: false });
  const win = memoWindows.get(id);
  if (win && !win.isDestroyed()) win.close();
  refreshTrayMenu();
}

function deleteMemo(id) {
  const win = memoWindows.get(id);
  store.removeMemo(id);
  if (win && !win.isDestroyed()) win.close();
  refreshTrayMenu();
  if (store.getMemos().length === 0) {
    // 메모가 하나도 없으면 트레이에서 새로 만들 수 있으니 그대로 둠
  }
}

function showAllMemos() {
  const memos = store.getMemos();
  if (memos.length === 0) { createMemo(); return; }
  memos.forEach((m) => openMemoWindow(m.id));
}

function pushToMemo(id) {
  const win = memoWindows.get(id);
  if (win && !win.isDestroyed()) win.webContents.send('memo:changed', store.getMemo(id));
}

// 모니터 구성이 바뀌어 화면 밖에 있으면 안쪽으로
function fitToScreen(b) {
  const displays = screen.getAllDisplays();
  const visible = b.x != null && b.y != null && displays.some((d) => {
    const a = d.workArea;
    return b.x + 40 > a.x && b.x < a.x + a.width - 40 && b.y >= a.y - 10 && b.y < a.y + a.height - 40;
  });
  if (visible) return b;
  const wa = screen.getPrimaryDisplay().workArea;
  return {
    width: b.width, height: b.height,
    x: wa.x + Math.round(wa.width / 2 - b.width / 2),
    y: wa.y + Math.round(wa.height / 3 - b.height / 2),
  };
}

// ---------- 트레이 ----------
function createTray() {
  const img = nativeImage.createFromPath(path.join(ASSETS, 'tray.png'));
  tray = new Tray(img);
  tray.setToolTip('스티커 메모');
  tray.on('click', showAllMemos);
  tray.on('double-click', () => createMemo());
  refreshTrayMenu();
}

function refreshTrayMenu() {
  if (!tray) return;
  const memos = store.getMemos();
  const memoItems = memos.slice(0, 15).map((m) => ({
    label: `${m.alarm ? '⏰ ' : ''}${memoTitle(m)}`,
    click: () => openMemoWindow(m.id),
  }));

  const loginEnabled = app.getLoginItemSettings().openAtLogin;
  const menu = Menu.buildFromTemplate([
    { label: '새 메모', click: () => createMemo() },
    { label: '모든 메모 보이기', click: showAllMemos },
    { type: 'separator' },
    ...(memoItems.length ? memoItems : [{ label: '메모 없음', enabled: false }]),
    { type: 'separator' },
    {
      label: '윈도우 시작 시 자동 실행',
      type: 'checkbox',
      checked: loginEnabled,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { label: '알림 테스트', click: () => showNotification({ id: null, content: '알림이 이렇게 표시돼요.\n클릭하면 메모가 열려요.', color: 'yellow' }, { test: true }) },
    { type: 'separator' },
    { label: '종료', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

function memoTitle(m) {
  const line = (m.content || '').split('\n').map((s) => s.trim()).find(Boolean);
  if (!line) return '(빈 메모)';
  return line.length > 24 ? line.slice(0, 24) + '…' : line;
}

// ---------- 알림 스케줄러 ----------
function startScheduler() {
  checkAlarms();
  // 1초마다 시각 비교만 하는 가벼운 체크 (절전 등으로 타이머가 밀려도 놓치지 않음)
  schedulerTimer = setInterval(checkAlarms, 1000);
}

function checkAlarms() {
  const now = Date.now();
  for (const memo of store.getMemos()) {
    const due = nextDueTime(memo);
    if (due == null || due > now) continue;

    const late = now - due > 60 * 1000; // 1분 넘게 지난 건 '놓친 알림'
    showNotification(memo, { late, dueAt: due });

    if (memo.snoozeAt && memo.snoozeAt <= now) {
      store.updateMemo(memo.id, { snoozeAt: null });
    } else if (memo.alarm) {
      const next = advanceAlarm(memo.alarm, now);
      store.updateMemo(memo.id, { alarm: next });
    }
    pushToMemo(memo.id);
    refreshTrayMenu();
  }
}

function nextDueTime(memo) {
  const times = [];
  if (memo.snoozeAt) times.push(memo.snoozeAt);
  if (memo.alarm && !memo.alarm.done && memo.alarm.at) times.push(memo.alarm.at);
  return times.length ? Math.min(...times) : null;
}

// 반복 알림이면 다음 시각으로, 1회면 완료 처리
function advanceAlarm(alarm, now) {
  if (alarm.repeat === 'none' || !alarm.repeat) {
    return { ...alarm, done: true };
  }
  let at = new Date(alarm.at);
  do {
    at.setDate(at.getDate() + 1);
    if (alarm.repeat === 'weekdays') {
      while (at.getDay() === 0 || at.getDay() === 6) at.setDate(at.getDate() + 1);
    }
  } while (at.getTime() <= now);
  return { ...alarm, at: at.getTime(), done: false };
}

// ---------- 카톡식 알림 팝업 ----------
function showNotification(memo, opts = {}) {
  const win = new BrowserWindow({
    width: NOTIFY_SIZE.width,
    height: NOTIFY_SIZE.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,     // 작업 중인 창의 포커스를 뺏지 않음
    show: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');

  const payload = {
    memoId: memo.id,
    content: memo.content || '',
    color: memo.color || 'yellow',
    late: !!opts.late,
    test: !!opts.test,
    dueAt: opts.dueAt || Date.now(),
    duration: NOTIFY_DURATION_MS,
    snoozeMin: SNOOZE_MIN,
  };
  win.loadFile(path.join(__dirname, 'renderer', 'notify.html'), {
    query: { data: JSON.stringify(payload) },
  });

  notifyWindows.push(win);
  layoutNotifications();
  win.once('ready-to-show', () => win.showInactive());

  win.on('closed', () => {
    notifyWindows = notifyWindows.filter((w) => w !== win);
    layoutNotifications();
  });
}

// 우측 하단부터 위로 쌓기 (작업표시줄 위치는 workArea가 알아서 반영)
function layoutNotifications() {
  const wa = screen.getPrimaryDisplay().workArea;
  notifyWindows.forEach((w, i) => {
    if (w.isDestroyed()) return;
    const x = wa.x + wa.width - NOTIFY_SIZE.width - NOTIFY_MARGIN;
    const y = wa.y + wa.height - NOTIFY_MARGIN - (NOTIFY_SIZE.height + NOTIFY_GAP) * (i + 1) + NOTIFY_GAP;
    w.setBounds({ x, y, width: NOTIFY_SIZE.width, height: NOTIFY_SIZE.height });
  });
}

// ---------- IPC ----------
ipcMain.handle('memo:get', (_e, id) => store.getMemo(id));

ipcMain.handle('memo:update', (_e, id, patch) => {
  const allowed = {};
  for (const k of ['content', 'color']) if (k in patch) allowed[k] = patch[k];
  const m = store.updateMemo(id, allowed);
  if ('content' in allowed) refreshTrayMenu();
  return m;
});

ipcMain.handle('memo:set-alarm', (_e, id, alarm) => {
  // alarm: { at: number(ms), repeat: 'none'|'daily'|'weekdays' } | null
  const value = alarm ? { at: alarm.at, repeat: alarm.repeat || 'none', done: false } : null;
  const m = store.updateMemo(id, { alarm: value, snoozeAt: null });
  refreshTrayMenu();
  return m;
});

ipcMain.handle('memo:toggle-pin', (e, id) => {
  const memo = store.getMemo(id);
  const on = !memo.alwaysOnTop;
  BrowserWindow.fromWebContents(e.sender)?.setAlwaysOnTop(on);
  return store.updateMemo(id, { alwaysOnTop: on });
});

ipcMain.handle('memo:new', (e) => {
  const b = BrowserWindow.fromWebContents(e.sender)?.getBounds();
  createMemo(b);
});
ipcMain.handle('memo:hide', (_e, id) => hideMemo(id));
ipcMain.handle('memo:delete', (_e, id) => deleteMemo(id));

ipcMain.handle('notify:open', (e, memoId) => {
  if (memoId) openMemoWindow(memoId);
  BrowserWindow.fromWebContents(e.sender)?.close();
});
ipcMain.handle('notify:snooze', (e, memoId) => {
  if (memoId) {
    store.updateMemo(memoId, { snoozeAt: Date.now() + SNOOZE_MIN * 60 * 1000 });
    pushToMemo(memoId);
  }
  BrowserWindow.fromWebContents(e.sender)?.close();
});
ipcMain.handle('notify:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());

// ---------- util ----------
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
