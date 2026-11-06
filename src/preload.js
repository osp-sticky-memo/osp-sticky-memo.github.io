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

  // 알림 팝업
  openFromNotify: (memoId) => ipcRenderer.invoke('notify:open', memoId),
  snooze: (memoId) => ipcRenderer.invoke('notify:snooze', memoId),
  closeNotify: () => ipcRenderer.invoke('notify:close'),
});
