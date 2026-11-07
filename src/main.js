// 딩동메모 - 메인 프로세스
// 역할: 메모 저장, 메모 창 관리, 트레이, 알림 스케줄러, 카톡식 알림 팝업

const {
  app, BrowserWindow, Tray, Menu, ipcMain, screen, powerMonitor, nativeImage, shell,
} = require('electron');
const path = require('path');
const store = require('./store');
const updater = require('./updater');

const ASSETS = path.join(__dirname, '..', 'assets');
const DEFAULT_SIZE = { width: 260, height: 260 };
const NOTIFY_SIZE = { width: 340, height: 104 };
const NOTIFY_GAP = 8;
const NOTIFY_MARGIN = 12;
const SNOOZE_MIN = 5;

const memoWindows = new Map(); // memoId -> BrowserWindow
let notifyWindows = [];        // 아래에서 위로 쌓이는 순서
let listWindow = null;         // 메모 목록 창 (하나만)
let settingsWindow = null;     // 설정 창 (하나만)
const miniWindows = new Map(); // memoId -> 바탕화면 미니 메모
let tray = null;
let schedulerTimer = null;
let isQuitting = false;

// ---------- 중복 실행 방지 ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => openListWindow());
}

// 윈도우 알림 그룹/작업표시줄 식별용
app.setAppUserModelId('com.ohsang.util.dingdongmemo');

app.whenReady().then(() => {
  store.load(app.getPath('userData'));
  // 메모가 바뀌면 목록 창과 미니 메모 갱신
  store.onChange(debounce(() => { broadcastList(); refreshMinis(); }, 150));

  createTray();

  const memos = store.getMemos();
  if (memos.length === 0) {
    createMemo();
  } else {
    memos.filter((m) => m.visible).forEach((m) => openMemoWindow(m.id));
    memos.filter((m) => m.mini).forEach((m) => openMiniWindow(m.id));
  }

  startScheduler();
  // 절전 해제 시 놓친 알림 처리, 업데이트도 오래됐으면 확인
  powerMonitor.on('resume', () => { checkAlarms(); updater.checkIfStale('resume'); });
  powerMonitor.on('unlock-screen', () => { checkAlarms(); updater.checkIfStale('unlock'); });

  let lastUpdateStatus = null;
  updater.init({
    isEnabled: () => store.getSettings().autoUpdate,
    onStatus: (s) => {
      for (const w of [settingsWindow, listWindow]) if (w && !w.isDestroyed()) w.webContents.send('update:status', s);
      if (s.status !== lastUpdateStatus) { lastUpdateStatus = s.status; refreshTrayMenu(); }
    },
    onDownloaded: (version) => showNotification({ id: null, color: 'yellow' }, { update: version }),
    beforeInstall: () => { isQuitting = true; store.flush(); },
  });
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
    skipTaskbar: false, // 작업표시줄에 표시 (메모 창들은 딩동메모 아이콘 하나로 묶임)
    title: memoTitle(memo, '딩동메모'),
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
    broadcastList();
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
  const mini = miniWindows.get(id);
  store.removeMemo(id);
  if (win && !win.isDestroyed()) win.close();
  if (mini && !mini.isDestroyed()) mini.close();
  refreshTrayMenu();
  if (store.getMemos().length === 0) {
    // 메모가 하나도 없으면 트레이에서 새로 만들 수 있으니 그대로 둠
  }
}

// ---------- 메모 목록 창 ----------
function openListWindow() {
  updater.checkIfStale('list');
  if (listWindow && !listWindow.isDestroyed()) {
    if (listWindow.isMinimized()) listWindow.restore();
    listWindow.show();
    listWindow.focus();
    return listWindow;
  }
  const wa = screen.getPrimaryDisplay().workArea;
  const width = 380;
  const height = Math.min(600, wa.height - 80);
  listWindow = new BrowserWindow({
    width, height,
    x: wa.x + wa.width - width - 40,
    y: wa.y + Math.round((wa.height - height) / 2),
    minWidth: 300,
    minHeight: 360,
    title: '딩동메모 - 메모 목록',
    autoHideMenuBar: true,
    backgroundColor: '#fbf8f3',
    show: false,
    icon: path.join(ASSETS, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  listWindow.setMenu(null);
  listWindow.loadFile(path.join(__dirname, 'renderer', 'list.html'));
  listWindow.once('ready-to-show', () => listWindow.show());
  listWindow.on('closed', () => { listWindow = null; });
  return listWindow;
}

// 목록 창에 보낼 요약 (본문 전체 대신 미리보기만)
function listSummary() {
  return store.getMemos().map((m) => ({
    id: m.id,
    title: (m.title || '').trim(),
    preview: (m.content || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    color: m.color,
    alarm: m.alarm,
    snoozeAt: m.snoozeAt,
    updatedAt: m.updatedAt || m.createdAt,
    createdAt: m.createdAt,
    pinned: !!m.pinned,
    alwaysOnTop: !!m.alwaysOnTop,
    mini: !!m.mini,
    open: memoWindows.has(m.id),
  }));
}

// ---------- 목록에서 메모 고치기 (우클릭 메뉴) ----------
const COLOR_NAMES = { yellow: '노랑', green: '초록', pink: '분홍', purple: '보라', blue: '파랑', gray: '회색' };

// 메모 창을 열고, 화면이 준비되면 메시지를 보냄
function openMemoAnd(id, channel) {
  const win = openMemoWindow(id);
  if (!win) return;
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', () => win.webContents.send(channel));
  else win.webContents.send(channel);
}

function setAlwaysOnTop(id, on) {
  const win = memoWindows.get(id);
  if (win && !win.isDestroyed()) win.setAlwaysOnTop(on);
  store.updateMemo(id, { alwaysOnTop: on });
  pushToMemo(id);
}

function setAlarm(id, at, repeat = 'none') {
  store.updateMemo(id, { alarm: at ? { at, repeat, done: false } : null, snoozeAt: null });
  pushToMemo(id);
}

function quickTime(kind) {
  const d = new Date();
  d.setSeconds(0, 0);
  if (kind === '10m') d.setMinutes(d.getMinutes() + 10);
  if (kind === '30m') d.setMinutes(d.getMinutes() + 30);
  if (kind === '1h') d.setHours(d.getHours() + 1);
  if (kind === 'tomorrow9') { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
  return d.getTime();
}


function showListContextMenu(id, sender) {
  const m = store.getMemo(id);
  if (!m) return;
  const parent = BrowserWindow.fromWebContents(sender);
  const isOpen = memoWindows.has(id);
  const hasAlarm = !!(m.snoozeAt || (m.alarm && !m.alarm.done));
  const repeat = m.alarm && !m.alarm.done ? (m.alarm.repeat || 'none') : null;

  const menu = Menu.buildFromTemplate([
    { label: isOpen ? '메모로 가기' : '메모 열기', click: () => openMemoWindow(id) },
    { type: 'separator' },
    { label: m.pinned ? '상단 고정 해제' : '목록 상단에 고정', click: () => store.updateMemo(id, { pinned: !m.pinned }) },
    { label: '제목 바꾸기', click: () => sender.send('list:rename', id) },
    {
      label: '색상',
      submenu: store.COLORS.map((c) => ({
        label: COLOR_NAMES[c], type: 'radio', checked: m.color === c,
        click: () => { store.updateMemo(id, { color: c }); pushToMemo(id); },
      })),
    },
    {
      label: '알림',
      submenu: [
        { label: '10분 뒤', click: () => setAlarm(id, quickTime('10m')) },
        { label: '30분 뒤', click: () => setAlarm(id, quickTime('30m')) },
        { label: '1시간 뒤', click: () => setAlarm(id, quickTime('1h')) },
        { label: '내일 오전 9시', click: () => setAlarm(id, quickTime('tomorrow9')) },
        { type: 'separator' },
        { label: '시간 직접 설정…', click: () => openMemoAnd(id, 'memo:open-alarm') },
        ...(repeat ? [
          { type: 'separator' },
          { label: '한 번만', type: 'radio', checked: repeat === 'none', click: () => setAlarm(id, m.alarm.at, 'none') },
          { label: '매일 반복', type: 'radio', checked: repeat === 'daily', click: () => setAlarm(id, m.alarm.at, 'daily') },
          { label: '평일 반복', type: 'radio', checked: repeat === 'weekdays', click: () => setAlarm(id, nextWeekday(m.alarm.at), 'weekdays') },
        ] : []),
        ...(hasAlarm ? [{ type: 'separator' }, { label: '알림 해제', click: () => setAlarm(id, null) }] : []),
      ],
    },
    { label: '항상 위에 표시', type: 'checkbox', checked: !!m.alwaysOnTop, click: () => setAlwaysOnTop(id, !m.alwaysOnTop) },
    m.mini
      ? { label: '바탕화면에서 미니 메모 치우기', click: () => closeMini(id) }
      : { label: '바탕화면에 미니 메모로 꺼내기', click: () => openMiniWindow(id, screen.getCursorScreenPoint()) },
    { type: 'separator' },
    ...(isOpen ? [{ label: '메모 창 닫기', click: () => hideMemo(id) }] : []),
    // 삭제 확인은 목록 창 안의 딩동메모 스타일 확인 창으로
    { label: '삭제…', click: () => sender.send('list:confirm-delete', id) },
  ]);
  menu.popup({ window: parent });
}

function nextWeekday(ms) {
  const d = new Date(ms);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.getTime();
}

// ---------- 바탕화면 미니 메모 (목록에서 끌어내면 제목만 작게 표시) ----------
const MINI_H = 44;      // 그림자 여백 포함 창 높이
const MINI_MIN_W = 90;       // 사용자가 줄일 수 있는 최소 너비
const MINI_AUTO_MAX_W = 300; // 자동으로 맞출 때 최대 너비
const MINI_MAX_W = 800;      // 사용자가 늘릴 수 있는 최대 너비

function miniData(m) {
  return {
    id: m.id,
    fixedWidth: !!m.mini?.width,
    // 미니 메모는 제목 전체를 보내고, 좁으면 화면에서 … 처리
    title: (m.title || '').trim() || (m.content || '').split('\n').map((x) => x.trim()).find(Boolean) || '빈 메모',
    color: m.color || 'yellow',
    alarm: !!(m.snoozeAt || (m.alarm && !m.alarm.done)),
  };
}

// at: 놓은 화면 좌표(커서). 없으면 저장된 위치로 복원
function openMiniWindow(id, at) {
  const m = store.getMemo(id);
  if (!m) return null;
  const existing = miniWindows.get(id);
  const width = existing && !existing.isDestroyed() ? existing.getBounds().width : (m.mini?.width || 180);

  let x, y;
  if (at) { x = at.x - 18; y = at.y - Math.round(MINI_H / 2); }
  else if (m.mini) { x = m.mini.x; y = m.mini.y; }
  ({ x, y } = clampToDisplay({ x, y, width, height: MINI_H }, at));

  if (existing && !existing.isDestroyed()) {
    existing.setPosition(x, y);
    existing.showInactive();
    store.updateMemo(id, { mini: { ...(m.mini || {}), x, y } });
    return existing;
  }

  const win = new BrowserWindow({
    x, y, width, height: MINI_H,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    title: m.title || '딩동메모',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.loadFile(path.join(__dirname, 'renderer', 'mini.html'), { query: { id } });
  win.once('ready-to-show', () => win.showInactive());

  const savePos = debounce(() => {
    if (win.isDestroyed() || !store.getMemo(id)) return;
    const b = win.getBounds();
    store.updateMemo(id, { mini: { ...(store.getMemo(id).mini || {}), x: b.x, y: b.y } });
  }, 300);
  win.on('move', savePos);
  win.on('closed', () => miniWindows.delete(id));

  miniWindows.set(id, win);
  store.updateMemo(id, { mini: { ...(m.mini || {}), x, y } });
  return win;
}

function closeMini(id) {
  const win = miniWindows.get(id);
  if (store.getMemo(id)) store.updateMemo(id, { mini: null });
  if (win && !win.isDestroyed()) win.close();
}

// 놓은 지점(또는 창 위치)이 있는 모니터 안으로 들어오게
function clampToDisplay(b, point) {
  const d = screen.getDisplayNearestPoint(point || { x: b.x ?? 0, y: b.y ?? 0 });
  const wa = d.workArea;
  if (b.x == null || b.y == null) return { x: wa.x + wa.width - b.width - 40, y: wa.y + 40 };
  return {
    x: Math.round(Math.min(Math.max(b.x, wa.x), wa.x + wa.width - b.width)),
    y: Math.round(Math.min(Math.max(b.y, wa.y), wa.y + wa.height - b.height)),
  };
}

// 사용자가 정한 길이를 지우고 제목 길이에 맞추기
function resetMiniWidth(id) {
  const m = store.getMemo(id);
  if (!m?.mini) return;
  const { width, ...rest } = m.mini;
  store.updateMemo(id, { mini: rest });
}

function setMiniWidth(win, w, max) {
  const b = win.getBounds();
  const width = Math.round(Math.min(max, Math.max(MINI_MIN_W, w)));
  if (width !== b.width) win.setBounds({ ...clampToDisplay({ x: b.x, y: b.y, width, height: MINI_H }), width, height: MINI_H });
  return width;
}

function refreshMinis() {
  for (const [id, win] of miniWindows) {
    if (win.isDestroyed()) continue;
    const m = store.getMemo(id);
    if (!m) { win.close(); continue; }
    win.webContents.send('mini:data', miniData(m));
  }
}

function showMiniContextMenu(id, sender) {
  const m = store.getMemo(id);
  if (!m) return;
  Menu.buildFromTemplate([
    { label: '메모 열기', click: () => openMemoWindow(id) },
    { label: '메모 목록 열기', click: () => openListWindow() },
    { type: 'separator' },
    ...(m.mini?.width ? [{ label: '길이 자동으로 맞추기', click: () => resetMiniWidth(id) }] : []),
    { label: '바탕화면에서 치우기', click: () => closeMini(id) },
  ]).popup({ window: BrowserWindow.fromWebContents(sender) });
}

function broadcastList() {
  if (listWindow && !listWindow.isDestroyed()) listWindow.webContents.send('list:changed', listSummary());
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
  tray.setToolTip('딩동메모');
  // 클릭·더블클릭 모두 메모 목록만 열기 (새 메모는 목록이나 메뉴에서)
  tray.on('click', () => openListWindow());
  tray.on('double-click', () => openListWindow());
  refreshTrayMenu();
}

function refreshTrayMenu() {
  if (!tray) return;
  const loginEnabled = app.getLoginItemSettings().openAtLogin;
  const up = updater.getState();
  const menu = Menu.buildFromTemplate([
    ...(up.status === 'ready' ? [
      { label: `재시작해서 업데이트 (${up.version})`, click: () => updater.installNow() },
      { type: 'separator' },
    ] : []),
    { label: '새 메모', click: () => createMemo() },
    { label: '메모 목록 열기', click: () => openListWindow() },
    { type: 'separator' },
    {
      label: '윈도우 시작 시 자동 실행',
      type: 'checkbox',
      checked: loginEnabled,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { label: '알림 미리보기', click: testNotification },
    { label: '설정…', click: openSettingsWindow },
    ...(up.packaged && up.status !== 'ready' ? [{ label: '업데이트 확인', click: () => { openSettingsWindow(); updater.check(); } }] : []),
    { type: 'separator' },
    { label: '종료', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

// 제목이 있으면 제목, 없으면 본문 첫 줄
function memoTitle(m, empty = '(빈 메모)') {
  const line = (m.title || '').trim() || (m.content || '').split('\n').map((s) => s.trim()).find(Boolean);
  if (!line) return empty;
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
  const settings = store.getSettings();
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
    title: (memo.title || '').trim(),
    content: memo.content || '',
    color: memo.color || 'yellow',
    late: !!opts.late,
    test: !!opts.test,
    dueAt: opts.dueAt || Date.now(),
    update: opts.update || null,
    mode: opts.update ? 'manual' : settings.notifyMode,
    duration: settings.notifySeconds * 1000,
    position: settings.notifyPosition,
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

// 설정한 위치에 알림 쌓기 (작업표시줄 위치는 workArea가 알아서 반영)
// 아래쪽이면 위로, 위쪽이면 아래로 쌓임
function layoutNotifications() {
  const { notifyPosition, notifyDisplay } = store.getSettings();
  const display = notifyDisplay === 'cursor'
    ? screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    : screen.getPrimaryDisplay();
  const wa = display.workArea;
  const [v, h] = notifyPosition.split('-'); // top|bottom, left|right|center
  const W = NOTIFY_SIZE.width, H = NOTIFY_SIZE.height;

  let x = wa.x + wa.width - W - NOTIFY_MARGIN;
  if (h === 'left') x = wa.x + NOTIFY_MARGIN;
  if (h === 'center') x = wa.x + Math.round((wa.width - W) / 2);

  notifyWindows.forEach((w, i) => {
    if (w.isDestroyed()) return;
    const step = (H + NOTIFY_GAP) * i;
    const y = v === 'top'
      ? wa.y + NOTIFY_MARGIN + step
      : wa.y + wa.height - NOTIFY_MARGIN - H - step;
    w.setBounds({ x, y, width: W, height: H });
  });
}

// ---------- 설정 창 ----------
function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  const wa = screen.getPrimaryDisplay().workArea;
  settingsWindow = new BrowserWindow({
    width: 420,
    height: Math.min(900, wa.height - 40),
    minWidth: 380,
    minHeight: 480,
    title: '딩동메모 - 설정',
    autoHideMenuBar: true,
    backgroundColor: '#fbf8f3',
    show: false,
    icon: path.join(ASSETS, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWindow.setMenu(null);
  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

function testNotification() {
  showNotification({
    id: null,
    title: '알림 미리보기',
    content: '지금 설정한 위치와 방식으로 알림이 이렇게 떠요.',
    color: 'yellow',
  }, { test: true });
}

// ---------- IPC ----------
ipcMain.handle('memo:get', (_e, id) => store.getMemo(id));

ipcMain.handle('memo:update', (_e, id, patch) => {
  const allowed = {};
  for (const k of ['title', 'content', 'color']) if (k in patch) allowed[k] = patch[k];
  if (typeof allowed.title === 'string') allowed.title = allowed.title.slice(0, 100);
  return store.updateMemo(id, allowed);
});

ipcMain.handle('list:get', () => listSummary());
ipcMain.handle('list:open', (_e, id) => { openMemoWindow(id); });
ipcMain.handle('list:new', () => { createMemo(); });
ipcMain.handle('list:context', (e, id) => showListContextMenu(id, e.sender));
ipcMain.handle('list:delete', (_e, id) => deleteMemo(id));
ipcMain.handle('list:toggle-pinned', (_e, id) => {
  const m = store.getMemo(id);
  if (m) store.updateMemo(id, { pinned: !m.pinned });
});
ipcMain.handle('list:rename', (_e, id, title) => {
  store.updateMemo(id, { title: String(title || '').slice(0, 100) });
  pushToMemo(id);
});
ipcMain.handle('memo:open-list', () => { openListWindow(); });

// 목록에서 끌기를 끝냈을 때: 커서가 목록 창 밖이면 그 자리에 미니 메모
ipcMain.handle('list:drag-end', (_e, id) => {
  if (!listWindow || listWindow.isDestroyed() || !store.getMemo(id)) return false;
  const p = screen.getCursorScreenPoint();
  const b = listWindow.getBounds();
  const inside = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
  if (inside) return false;
  openMiniWindow(id, p);
  return true;
});

ipcMain.handle('mini:get', (_e, id) => { const m = store.getMemo(id); return m ? miniData(m) : null; });
ipcMain.handle('mini:open', (_e, id) => { openMemoWindow(id); });
ipcMain.handle('mini:close', (_e, id) => closeMini(id));
ipcMain.handle('mini:context', (e, id) => showMiniContextMenu(id, e.sender));
ipcMain.on('mini:move', (e, x, y) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win && Number.isFinite(x) && Number.isFinite(y)) win.setPosition(Math.round(x), Math.round(y));
});
// 제목 길이에 맞춘 자동 너비 (사용자가 길이를 정했으면 무시)
ipcMain.on('mini:resize', (e, id, w) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const m = store.getMemo(id);
  if (!win || !m || !Number.isFinite(w) || m.mini?.width) return;
  setMiniWidth(win, w, MINI_AUTO_MAX_W);
});
// 사용자가 오른쪽 끝을 끌어서 길이 조절
ipcMain.on('mini:set-width', (e, id, w) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const m = store.getMemo(id);
  if (!win || !m || !Number.isFinite(w)) return;
  const width = setMiniWidth(win, w, MINI_MAX_W);
  const b = win.getBounds();
  store.updateMemo(id, { mini: { ...(m.mini || {}), x: b.x, y: b.y, width } });
});
ipcMain.handle('mini:reset-width', (_e, id) => resetMiniWidth(id));

ipcMain.handle('settings:open', () => openSettingsWindow());
ipcMain.handle('settings:get', () => ({ ...store.getSettings(), openAtLogin: app.getLoginItemSettings().openAtLogin, displayCount: screen.getAllDisplays().length }));
ipcMain.handle('settings:set', (_e, patch) => {
  if (typeof patch.autoUpdate === 'boolean') setImmediate(() => updater.reschedule());
  if (typeof patch.openAtLogin === 'boolean') {
    app.setLoginItemSettings({ openAtLogin: patch.openAtLogin });
    refreshTrayMenu();
  }
  const s = store.updateSettings(patch);
  layoutNotifications(); // 떠 있는 알림도 새 위치로
  return s;
});
ipcMain.handle('settings:test', () => testNotification());

ipcMain.handle('update:state', () => updater.getState());
ipcMain.handle('app:open-site', () => shell.openExternal('https://ohsangplay.com/'));
ipcMain.handle('update:check', () => updater.check());
ipcMain.handle('update:install', (e) => {
  const ok = updater.installNow();
  if (!ok) BrowserWindow.fromWebContents(e.sender)?.close?.();
  return ok;
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
