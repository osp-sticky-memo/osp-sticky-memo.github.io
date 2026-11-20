// 내보내기·가져오기 화면 (설정 창·메모 목록 창 공용)
// window.BackupUI.exportAll(), .pickImport(), .enableDrop()
(function () {
  const ICON_IN = '<svg viewBox="0 0 16 16"><path d="M8 2.5v7.5M4.8 7 8 10.2 11.2 7M3 11.5v1.5h10v-1.5"/></svg>';
  const ICON_ERR = '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.8"/><path d="M8 5v3.4M8 10.8v.1"/></svg>';

  document.body.insertAdjacentHTML('beforeend', `
    <div class="bk-overlay" id="bk-overlay" hidden>
      <div class="bk-card" role="dialog" aria-modal="true" aria-labelledby="bk-title">
        <div class="bk-icon" id="bk-icon"></div>
        <h2 id="bk-title"></h2>
        <p class="bk-sub" id="bk-sub"></p>
        <ul class="bk-list" id="bk-list"></ul>
        <label class="bk-dup" id="bk-dup" hidden><input type="checkbox" id="bk-dup-check"><span id="bk-dup-text"></span></label>
        <p class="bk-note" id="bk-note"></p>
        <div class="bk-actions">
          <button class="bk-ghost" id="bk-cancel">취소</button>
          <button class="bk-primary" id="bk-ok"></button>
        </div>
      </div>
    </div>
    <div class="bk-toast" id="bk-toast" role="status" hidden></div>
    <div class="bk-drop" id="bk-drop" hidden>백업 파일을 여기에 놓으면<br>메모를 가져와요</div>`);

  const $ = (s) => document.getElementById(s);
  const overlay = $('bk-overlay');
  let current = null; // 보고 있는 가져오기 미리보기
  let onOk = null;
  let returnFocus = null;

  function toast(msg, isErr) {
    const t = $('bk-toast');
    t.textContent = msg;
    t.classList.toggle('err', !!isErr);
    t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { t.hidden = true; }, 3200);
  }

  function open() {
    returnFocus = document.activeElement;
    overlay.hidden = false;
  }
  function close() {
    overlay.hidden = true;
    if (current) window.api.cancelBackup();
    current = null;
    onOk = null;
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
  }

  function showError(message) {
    $('bk-icon').className = 'bk-icon err';
    $('bk-icon').innerHTML = ICON_ERR;
    $('bk-title').textContent = '가져올 수 없어요';
    $('bk-sub').textContent = message;
    $('bk-list').textContent = '';
    $('bk-dup').hidden = true;
    $('bk-note').textContent = '';
    $('bk-cancel').hidden = true;
    $('bk-ok').textContent = '확인';
    $('bk-ok').disabled = false;
    onOk = close;
    open();
    $('bk-ok').focus();
  }

  function exportedText(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return ` · ${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} 내보냄`;
  }

  function showPreview(r) {
    current = r;
    $('bk-icon').className = 'bk-icon';
    $('bk-icon').innerHTML = ICON_IN;
    $('bk-cancel').hidden = false;
    $('bk-sub').textContent = `${r.file}${exportedText(r.exportedAt)}`;

    const list = $('bk-list');
    list.textContent = '';
    for (const p of r.preview) {
      const li = document.createElement('li');
      li.dataset.color = p.color;
      li.textContent = p.title;
      list.appendChild(li);
    }
    const shownFrom = r.fresh || r.dup;
    if (shownFrom > r.preview.length) {
      const li = document.createElement('li');
      li.className = 'more';
      li.textContent = `외 ${shownFrom - r.preview.length}개`;
      list.appendChild(li);
    }

    const dupCheck = $('bk-dup-check');
    dupCheck.checked = false;
    $('bk-dup').hidden = !r.dup;
    $('bk-dup-text').textContent = `이미 있는 메모 ${r.dup}개도 한 번 더 가져오기`;

    const paint = () => {
      const n = r.fresh + (dupCheck.checked ? r.dup : 0);
      $('bk-title').textContent = r.fresh ? `메모 ${r.fresh}개를 가져올까요?` : '모두 이미 있는 메모예요';
      $('bk-note').textContent = r.dup
        ? (r.fresh ? `같은 제목·내용의 메모 ${r.dup}개는 이미 있어서 건너뛰어요.` : '같은 제목·내용의 메모가 이미 다 있어요.')
        : '가져온 메모는 메모 목록에 추가돼요. 지금 있는 메모는 그대로예요.';
      $('bk-ok').textContent = n ? `가져오기 (${n})` : '가져오기';
      $('bk-ok').disabled = !n;
    };
    dupCheck.onchange = paint;
    paint();

    onOk = async () => {
      const token = r.token;
      const includeDup = dupCheck.checked;
      current = null; // 닫을 때 취소 요청이 가지 않게
      overlay.hidden = true;
      const res = await window.api.importBackup(token, includeDup);
      toast(res.message, !res.ok);
      if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
    };
    open();
    $('bk-ok').disabled ? $('bk-cancel').focus() : $('bk-ok').focus();
  }

  function handleResult(r) {
    if (!r || r.canceled) return;
    if (!r.ok) showError(r.message);
    else showPreview(r);
  }

  $('bk-cancel').onclick = close;
  $('bk-ok').onclick = () => onOk && onOk();
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', (e) => {
    if (overlay.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  }, true);

  // 내보내기 결과(목록 우클릭 '이 메모 내보내기')
  window.api.onBackupToast((r) => { if (r && !r.canceled) toast(r.message, !r.ok); });

  async function exportAll() {
    const r = await window.api.exportMemos(null);
    if (r && !r.canceled) toast(r.message, !r.ok);
  }

  async function pickImport() {
    handleResult(await window.api.pickBackup());
  }

  // 창에 백업 파일을 끌어다 놓으면 가져오기
  function enableDrop() {
    const drop = $('bk-drop');
    let depth = 0;
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; depth++; drop.hidden = false; });
    window.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) drop.hidden = true; });
    window.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    window.addEventListener('drop', async (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      drop.hidden = true;
      const file = e.dataTransfer.files[0];
      if (!file) return;
      handleResult(await window.api.readBackup(file));
    });
  }

  window.BackupUI = { exportAll, pickImport, enableDrop, toast };
})();
