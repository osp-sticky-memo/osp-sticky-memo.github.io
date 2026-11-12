const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 메모 창
  getMemo: (id) => ipcRenderer.invoke('memo:get', id),
  updateMemo: (id, patch) => ipcRenderer.invoke('memo:update', id, patch),
  setAlarm: (id, alarm) => ipcRenderer.invoke('memo:set-alarm', id, alarm),
  togglePin: (id) => ipcRenderer.invoke('memo:toggle-pin', id),
  newMemo: () => ipcRenderer.invoke('memo:new'),
  hideMemo: (id) => ipcRenderer.invoke('memo:hide', id),
  deleteMemo: (id) => ipcRenderer.invoke('memo:delete', id),
  onChanged: (cb) => ipcRenderer.on('memo:changed', (_e, memo) => cb(memo)),
  onFocusEditor: (cb) => ipcRenderer.on('memo:focus-editor', () => cb()),
  openList: () => ipcRenderer.invoke('memo:open-list'),
  onOpenAlarm: (cb) => ipcRenderer.on('memo:open-alarm', () => cb()),

  // 메모 목록 창
  listMemos: () => ipcRenderer.invoke('list:get'),
  openMemo: (id) => ipcRenderer.invoke('list:open', id),
  newMemoFromList: () => ipcRenderer.invoke('list:new'),
  onListChanged: (cb) => ipcRenderer.on('list:changed', (_e, list) => cb(list)),
  showContextMenu: (id) => ipcRenderer.invoke('list:context', id),
  togglePinned: (id) => ipcRenderer.invoke('list:toggle-pinned', id),
  renameMemo: (id, title) => ipcRenderer.invoke('list:rename', id, title),
  onRename: (cb) => ipcRenderer.on('list:rename', (_e, id) => cb(id)),
  onConfirmDelete: (cb) => ipcRenderer.on('list:confirm-delete', (_e, id) => cb(id)),
  deleteFromList: (id) => ipcRenderer.invoke('list:delete', id),
  dragEnd: (id) => ipcRenderer.invoke('list:drag-end', id),

  // 바탕화면 미니 메모
  getMini: (id) => ipcRenderer.invoke('mini:get', id),
  onMiniData: (cb) => ipcRenderer.on('mini:data', (_e, d) => cb(d)),
  openFromMini: (id) => ipcRenderer.invoke('mini:open', id),
  closeMini: (id) => ipcRenderer.invoke('mini:close', id),
  miniContextMenu: (id) => ipcRenderer.invoke('mini:context', id),
  moveMini: (x, y) => ipcRenderer.send('mini:move', x, y),
  resizeMini: (id, w) => ipcRenderer.send('mini:resize', id, w),
  setMiniWidth: (id, w) => ipcRenderer.send('mini:set-width', id, w),
  resetMiniWidth: (id) => ipcRenderer.invoke('mini:reset-width', id),

  // 설정
  openSettings: () => ipcRenderer.invoke('settings:open'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  testNotify: () => ipcRenderer.invoke('settings:test'),

  // 업데이트
  getUpdateState: () => ipcRenderer.invoke('update:state'),
  openSite: () => ipcRenderer.invoke('app:open-site'),
  openUrl: (url) => ipcRenderer.invoke('app:open-url', url),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (cb) => ipcRenderer.on('update:status', (_e, s) => cb(s)),

  // 알림 팝업
  openFromNotify: (memoId) => ipcRenderer.invoke('notify:open', memoId),
  snooze: (memoId) => ipcRenderer.invoke('notify:snooze', memoId),
  closeNotify: () => ipcRenderer.invoke('notify:close'),
});
