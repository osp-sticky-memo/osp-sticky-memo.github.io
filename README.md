# 딩동메모

시간을 정해두면 카카오톡처럼 화면 우측 하단에 "딩동" 알림이 뜨는 윈도우용 스티커형 메모 프로그램.

> 0.1.0까지는 이름이 "스티커 메모"였어요. Windows 기본 앱 Sticky Notes의 한국어 이름과 겹쳐서 0.1.1부터 딩동메모로 바꿨어요.

## 실행

```bash
npm install
npm start
```

설치 파일 만들기 (윈도우에서 실행):

```bash
npm run dist
```

`dist/` 폴더에 `DingDongMemo-Setup-<버전>.exe`가 생겨요.

## 배포 (새 버전 올리기)

1. `package.json`의 `version`을 올려요 (예: `0.1.1`).
2. 같은 버전으로 태그를 달아 push해요.
   ```bash
   git tag v0.1.1 && git push origin v0.1.1
   ```
3. GitHub Actions(`Release`)가 Windows에서 설치 파일을 빌드해 [Releases](https://github.com/osp-sticky-memo/osp-sticky-memo.github.io/releases)에 올려요.
4. [다운로드 페이지](https://osp-sticky-memo.github.io/)(이 저장소의 `index.html`)의 다운로드 주소·버전·업데이트 내역을 새 버전으로 바꿔요.

## 다운로드 페이지

`index.html`과 `web/` 폴더가 GitHub Pages(https://osp-sticky-memo.github.io/)로 배포되는 소개·다운로드 페이지예요. 디자인은 ohsangplay.com과 같은 스타일(`web/style.css`)을 쓰고, ohsangplay.com 홈에는 이 페이지로 가는 카드만 있어요.

## 기능

- **메모 창**: 테두리 없는 스티커 창. 상단 바를 끌어서 이동, 모서리로 크기 조절. 위치·크기·내용 자동 저장
- **제목**: 메모마다 맨 위에 제목을 붙일 수 있음 (없으면 본문 첫 줄로 표시)
- **메모 목록**: 트레이 클릭·트레이 메뉴 `메모 목록 열기`·메모의 목록 버튼으로 열기. 제목/내용 검색, 정렬(최근 수정·알림 가까운 순·만든 순·제목순), 클릭하면 그 메모 열기
- **상단 버튼**: `+` 새 메모 · ☰ 메모 목록 · ⏰ 알림 · 📌 항상 위 · 🎨 색상(6가지) · 🗑 삭제 · ✕ 닫기(트레이에서 다시 열기)
- **알림 설정**: 날짜·시간 지정, 빠른 선택(+10분/+30분/+1시간/내일 9시), 반복(한 번/매일/평일)
- **알림 팝업**: 우측 하단에서 슬라이드로 등장, 여러 개면 위로 쌓임, 8초 뒤 자동으로 사라짐(마우스 올리면 멈춤), 띵동 알림음
  - 본문 클릭 → 해당 메모 열기
  - `5분 뒤` → 5분 뒤 다시 알림
  - PC가 절전 중이라 놓친 알림은 깨어날 때 "놓친 알림"으로 표시되고 자동으로 안 사라짐
- **트레이**: 클릭 → 메모 목록, 더블클릭 → 새 메모, 우클릭 메뉴에 새 메모 / 메모 목록 열기 / 윈도우 시작 시 자동 실행 / 알림 테스트 / 종료
- 창을 다 닫아도 트레이에 남아서 알림이 계속 동작. 중복 실행 방지

## 구조

```
src/
  main.js            메인 프로세스: 창 관리, 트레이, 알림 스케줄러, 알림 팝업 배치
  store.js           memos.json 저장 (임시 파일 → 교체 방식으로 안전하게)
  preload.js         렌더러에 노출하는 API
  renderer/
    theme.css        메모 색상 팔레트
    format.js        날짜 표시 (메모 창·목록 창 공용)
    memo.html/css/js 메모 창
    list.html/css/js 메모 목록 창
    notify.html/css/js 알림 팝업
assets/              앱·트레이 아이콘
```

데이터 위치: `%APPDATA%\딩동메모\memos.json` (예전 `스티커 메모` 폴더의 메모는 처음 실행 때 자동으로 옮겨와요)

## 조절할 만한 값 (src/main.js 상단)

- `NOTIFY_DURATION_MS` 알림이 떠 있는 시간
- `SNOOZE_MIN` 다시 알림 간격
- `NOTIFY_SIZE` 알림 팝업 크기
