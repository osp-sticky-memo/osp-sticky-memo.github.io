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

  // 메모 목록 창
  listMemos: () => ipcRenderer.invoke('list:get'),
  openMemo: (id) => ipcRenderer.invoke('list:open', id),
  newMemoFromList: () => ipcRenderer.invoke('list:new'),
  onListChanged: (cb) => ipcRenderer.on('list:changed', (_e, list) => cb(list)),

  // 알림 팝업
  openFromNotify: (memoId) => ipcRenderer.invoke('notify:open', memoId),
  snooze: (memoId) => ipcRenderer.invoke('notify:snooze', memoId),
  closeNotify: () => ipcRenderer.invoke('notify:close'),
});
