// GET /api/docs: 사람이 읽는 API 문서. HTML·CSS·JS를 한 응답에 넣는다(외부 파일·CDN 없음).
// Vercel 함수 번들(esbuild CJS)에 문자열로 들어간다. 디스크에서 파일을 읽지 않는다.
// 화면은 /api/openapi.json을 읽어 그린다. 색, 글자 크기, 반경은 DESIGN.md 토큰(apps/web/src/shared/theme.css)과 같다.
// 넓은 화면에서는 설명과 필드 옆에 코드 예시·직접 실행 패널을 둔다.

const STYLE = `
:root {
  color-scheme: light;
  --background: #f6f8fb;
  --card: #ffffff;
  --foreground: #182230;
  --muted-foreground: #455468;
  --muted: #eef2f7;
  --border: #e0e6ef;
  --input: #6b7684;
  --primary: #1f5bd7;
  --primary-foreground: #ffffff;
  --primary-hover: #1747b2;
  --primary-surface: #edf4ff;
  /* 메서드 색. GET 파랑(primary), POST 초록(Stripe·Scalar 관례).
     POST 초록은 성공 색(#116149, 색상 162°)과 다른 연두 계열(104°)이라 상태 배지와 구분된다. */
  --method-post: #217005;
  --method-post-surface: #eef7e9;
  --ring: #1c52bc;
  --success: #116149;
  --success-surface: #eaf6ef;
  --warning: #7a4900;
  --warning-surface: #fff3d7;
  --destructive: #a32535;
  --destructive-surface: #fff1f1;
  --selection: #dce8ff;
  --selection-foreground: #173e91;
  --scrollbar: #818b99;
  --rounded-control: 10px;
  --rounded-surface: 16px;
  /* 글자 크기와 줄 높이. apps/web/src/shared/theme.css의 --type-* 값과 같다. 이 화면은 그 파일을 가져올 수 없어 값을 옮겨 둔다. */
  --type-caption: 0.75rem;
  --type-ui: 0.875rem;
  --type-detail: 0.9375rem;
  --type-body: 1rem;
  --type-body-lg: 1.0625rem;
  --type-heading: 1.125rem;
  --type-title: 1.25rem;
  --type-title-lg: 1.5rem;
  --type-page: 1.875rem;
  --type-line-heading: 1.3;
  --type-line-body: 1.6;
  --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-family: "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  font-synthesis-style: none;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
* { box-sizing: border-box; }
html { scroll-padding-top: 16px; }
@media (prefers-reduced-motion: no-preference) {
  html { scroll-behavior: smooth; }
}
body {
  margin: 0;
  background: var(--background);
  color: var(--foreground);
  font-size: var(--type-body);
  line-height: var(--type-line-body);
  word-break: keep-all;
  overflow-wrap: break-word;
}
::selection { background: var(--selection); color: var(--selection-foreground); }
h1, h2, h3, h4, p, ul, dl, dd, pre { margin: 0; }
h1, h2, h3, h4 {
  line-height: var(--type-line-heading);
  letter-spacing: -0.01em;
  font-weight: 700;
  text-wrap: balance;
}
p { text-wrap: pretty; }
a { color: var(--primary); text-underline-offset: 3px; }
:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
a:focus-visible { border-radius: 4px; }
/* 목차와 목록에서 옮긴 초점. 제목에는 테두리를 그리지 않는다. */
main:focus, h1:focus, h2:focus, h3:focus { outline: none; }
code, pre { font-family: var(--mono); font-size: var(--type-detail); }
p code, li code, dd code, td code, th code {
  background: var(--muted);
  border-radius: 4px;
  padding: 1px 5px;
  overflow-wrap: anywhere;
}
.code-link { text-decoration: none; }
.code-link code { color: var(--primary); }
.skip {
  position: absolute;
  left: 16px;
  top: -48px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--rounded-control);
  padding: 8px 12px;
  z-index: 10;
}
.skip:focus { top: 16px; }
.sprite { position: absolute; width: 0; height: 0; overflow: hidden; }
/* 아이콘 선은 크기와 관계없이 화면 기준 2px다(DESIGN.md). */
.icon {
  width: 12px;
  height: 12px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.layout { display: grid; grid-template-columns: minmax(0, 1fr); min-height: 100vh; }
.nav {
  background: var(--card);
  border-bottom: 1px solid var(--border);
  padding: 20px 16px;
  min-width: 0;
  scrollbar-color: var(--scrollbar) var(--muted);
  scrollbar-width: thin;
}
.brand { display: flex; align-items: baseline; gap: 8px; color: var(--foreground); text-decoration: none; }
.brand strong { font-size: var(--type-heading); font-weight: 800; letter-spacing: -0.01em; }
.brand span { color: var(--muted-foreground); font-size: var(--type-detail); }
.brand-version { flex: none; font-family: var(--mono); }
.brand-version:empty { display: none; }

.search { margin-top: 16px; background: var(--card); }
.search-box { position: relative; display: flex; align-items: center; }
.search-box .icon {
  position: absolute;
  left: 12px;
  width: 16px;
  height: 16px;
  color: var(--muted-foreground);
  pointer-events: none;
}
.search input {
  width: 100%;
  min-height: 40px;
  padding: 0 40px 0 36px;
  border: 1px solid var(--input);
  border-radius: var(--rounded-control);
  background: var(--card);
  color: var(--foreground);
  font: inherit;
  font-size: var(--type-detail);
}
.search input::placeholder { color: var(--muted-foreground); opacity: 1; }
.search input:focus-visible { outline-offset: 0; }
.search kbd {
  position: absolute;
  right: 8px;
  display: none;
  min-width: 22px;
  text-align: center;
  font: 600 var(--type-caption)/1 var(--mono);
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--muted);
  color: var(--muted-foreground);
}
.search-status { margin-top: 8px; font-size: var(--type-ui); color: var(--muted-foreground); }
.search-status:empty { display: none; }

.toc { margin-top: 12px; }
.toc > summary {
  cursor: pointer;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  list-style: none;
  font-weight: 600;
  border: 1px solid var(--border);
  border-radius: var(--rounded-control);
  padding: 0 14px;
}
.toc > summary::-webkit-details-marker { display: none; }
.toc > summary::after {
  content: "";
  width: 8px;
  height: 8px;
  border-right: 2px solid var(--muted-foreground);
  border-bottom: 2px solid var(--muted-foreground);
  transform: translateY(-2px) rotate(45deg);
}
.toc[open] > summary::after { transform: translateY(2px) rotate(-135deg); }
.toc-body { padding-top: 12px; display: grid; gap: 20px; }
.toc-title {
  font-size: var(--type-ui);
  font-weight: 600;
  color: var(--muted-foreground);
  letter-spacing: 0;
  margin-bottom: 6px;
}
.toc-title a { color: inherit; text-decoration: none; }
.toc-title a[aria-current="true"] { color: var(--foreground); }
.toc-group ul { list-style: none; padding: 0; display: grid; gap: 2px; }
.toc-group li a {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 4px 8px;
  border-radius: var(--rounded-control);
  color: var(--foreground);
  text-decoration: none;
  font-size: var(--type-detail);
}
/* 지금 읽는 항목. 선택한 행과 같은 바탕과 왼쪽 3px 막대다(DESIGN.md). */
.toc-group li a[aria-current="true"] {
  background: var(--primary-surface);
  box-shadow: inset 3px 0 0 var(--primary);
  font-weight: 600;
}
.toc-group .method { min-width: 44px; text-align: center; }
.toc-group li a > span:last-child { min-inline-size: 0; }

main { width: 100%; max-width: 960px; padding: 32px 16px 80px; min-width: 0; }
h1 { font-size: var(--type-page); letter-spacing: -0.02em; }
.lead { margin-top: 12px; color: var(--muted-foreground); max-width: 72ch; }
.overview-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; margin-top: 20px; }
.overview-actions a { display: inline-flex; align-items: center; min-height: 44px; font-weight: 600; }
.overview-actions .try-send { text-decoration: none; }
.intro { margin-top: 28px; display: grid; gap: 24px; grid-template-columns: minmax(0, 1fr); }
.overview-connection, .overview-steps, .overview-details {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--rounded-surface);
}
.overview-connection { display: grid; grid-template-columns: minmax(0, 1fr); }
.overview-connection section { padding: 16px 20px; min-width: 0; }
.overview-connection section + section { border-block-start: 1px solid var(--border); }
.overview-address { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 8px; }
.overview-address code { min-width: 0; overflow-wrap: anywhere; }
.overview-address .copy { margin-inline-start: auto; }
.intro h2 { font-size: var(--type-title); margin-bottom: 8px; }
.intro p, .errors li { max-width: 72ch; }
.intro p + p { margin-top: 8px; }
.overview-steps { margin: 0; padding: 0 20px 0 44px; }
.overview-steps li { padding: 14px 0 14px 4px; }
.overview-steps li + li { border-top: 1px solid var(--border); }
.overview-steps li::marker { color: var(--primary); font-weight: 600; }
.overview-steps h3, .overview-details h2 { font-size: var(--type-body); }
.overview-steps p, .overview-details p { margin-top: 4px; }
.overview-details summary { padding: 12px 20px; min-height: 44px; cursor: pointer; font-weight: 600; }
.overview-details section { padding: 0 20px 16px; }

.status-line { margin-top: 32px; color: var(--muted-foreground); }
.status-line.error {
  color: var(--destructive);
  background: var(--destructive-surface);
  border-radius: var(--rounded-control);
  padding: 12px 16px;
}

.tag { margin-top: 56px; }
.tag > h2 { font-size: var(--type-title-lg); letter-spacing: -0.02em; }
.tag > p { margin-top: 6px; color: var(--muted-foreground); max-width: 72ch; }

/* 분류의 API 목록. 분류 제목 아래에 경로를 한 줄씩 보여 준다. */
.op-index {
  list-style: none;
  padding: 0;
  margin-top: 16px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--rounded-surface);
  overflow: hidden;
}
.op-index li + li { border-top: 1px solid var(--border); }
.op-index a {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  align-items: center;
  gap: 6px 12px;
  min-height: 44px;
  padding: 10px 16px;
  color: var(--foreground);
  text-decoration: none;
}
.op-index a:focus-visible { outline-offset: -2px; border-radius: 0; }
.op-index .method { justify-self: start; min-width: 44px; text-align: center; }
.op-index-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.op-index-summary { font-size: var(--type-detail); font-weight: 600; }
.op-index-path { font-size: var(--type-ui); color: var(--muted-foreground); overflow-wrap: anywhere; }
li code.op-index-path { background: none; padding: 0; }
.op-index .badge { grid-column: 2; justify-self: start; }

.op {
  margin-top: 20px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--rounded-surface);
  padding: 20px 16px;
  min-width: 0;
}
.op-main, .op-code { min-width: 0; }
.op-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.path { font-size: var(--type-body); font-weight: 600; overflow-wrap: anywhere; min-width: 0; }
.op-title { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-top: 10px; }
.op h3 { font-size: var(--type-heading); }
.op h3 a { color: inherit; text-decoration: none; }
.op .desc { margin-top: 6px; max-width: 72ch; }
.meta { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 12px; font-size: var(--type-ui); color: var(--muted-foreground); }
.meta div { display: flex; gap: 6px; align-items: center; min-width: 0; }
.meta dd code { font-size: var(--type-ui); }
.block { margin-top: 20px; }
.block > h4 { font-size: var(--type-detail); color: var(--muted-foreground); font-weight: 600; margin-bottom: 8px; }

/* 메서드는 종류다. 상태 색(성공·주의·실패)을 쓰지 않는다. GET 파랑, POST 초록(Stripe·Scalar 관례).
   POST 초록은 성공 색(#116149, 색상 162°)과 다른 연두 계열(104°)이라 상태 배지와 구분된다. */
.method {
  display: inline-block;
  flex-shrink: 0;
  white-space: nowrap;
  font: 600 var(--type-caption)/1 var(--mono);
  padding: 5px 8px;
  border-radius: 5px;
  background: var(--primary-surface);
  color: var(--primary);
}
.method.post {
  background: var(--method-post-surface);
  color: var(--method-post);
}
/* 필수·선택과 인증 표시는 종류다. 중립 배지에 굵기와 아이콘으로만 구분한다. */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--type-caption);
  line-height: 1;
  padding: 4px 6px;
  border-radius: 5px;
  background: var(--muted);
  color: var(--muted-foreground);
  white-space: nowrap;
}
.badge.req, .badge.auth { color: var(--foreground); font-weight: 600; }
/* 응답 상태 코드는 실제 상태다. 성공·주의·실패 색을 쓴다. */
.code-status { font: 600 var(--type-ui)/1 var(--mono); padding: 4px 6px; border-radius: 5px; white-space: nowrap; }
.code-status.ok { background: var(--success-surface); color: var(--success); }
.code-status.client { background: var(--warning-surface); color: var(--warning); }
.code-status.server { background: var(--destructive-surface); color: var(--destructive); }

.fields { list-style: none; padding: 0; border-top: 1px solid var(--border); }
.field { padding: 10px 0; border-bottom: 1px solid var(--border); min-width: 0; }
.field-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.field-name { font-weight: 600; overflow-wrap: anywhere; background: none; padding: 0; }
.type { font-family: var(--mono); font-size: var(--type-ui); color: var(--muted-foreground); overflow-wrap: anywhere; }
.field-desc { margin-top: 4px; font-size: var(--type-detail); }
.rules { margin-top: 4px; font-size: var(--type-ui); color: var(--muted-foreground); display: grid; gap: 2px; }
.rules code { font-size: var(--type-caption); }
.nested { margin-top: 8px; }
.nested > summary {
  cursor: pointer;
  font-size: var(--type-ui);
  color: var(--primary);
  min-height: 32px;
  display: inline-flex;
  align-items: center;
}
.nested > :not(summary) { margin-left: 12px; padding-left: 12px; border-left: 2px solid var(--muted); }
.note { font-size: var(--type-detail); color: var(--muted-foreground); }
.try-form { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
.try-route {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--rounded-control);
  background: var(--background);
}
.try-route code { min-width: 0; overflow-wrap: anywhere; font-size: var(--type-ui); }
.try-field { display: grid; gap: 4px; min-width: 0; font-size: var(--type-detail); }
.try-field input, .try-field textarea {
  width: 100%;
  min-height: 44px;
  padding: 8px 10px;
  border: 1px solid var(--input);
  border-radius: var(--rounded-control);
  background: var(--card);
  color: var(--foreground);
  font: var(--type-body)/1.5 var(--mono);
}
.try-field textarea { resize: vertical; }
.try-field textarea, .try-field input:not([type="password"]) { background: var(--background); }
.try-field [aria-invalid="true"] { border-color: var(--destructive); }
.try-field-note, .try-message:not(:empty) { margin-top: 4px; font-size: var(--type-ui); }
.try-message, .try-status.error { color: var(--destructive); }
.try-send {
  min-height: 44px;
  padding: 0 16px;
  border: 0;
  border-radius: var(--rounded-control);
  background: var(--primary);
  color: var(--primary-foreground);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.try-send[aria-disabled="true"] { cursor: progress; }
.try-result { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); }
.try-result-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 8px; margin-bottom: 8px; }
.try-result h4 { font-size: var(--type-detail); font-weight: 600; }
.try-result .code { max-height: 300px; white-space: pre-wrap; overflow-wrap: anywhere; }
.try-empty { padding: 12px; border-radius: var(--rounded-control); background: var(--background); }
.alt + .alt { margin-top: 16px; }
.alt-name { font-family: var(--mono); font-size: var(--type-ui); font-weight: 600; margin: 8px 0 4px; }

.response + .response { margin-top: 16px; }
.response-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 8px; }
.response-head .media { font-family: var(--mono); font-size: var(--type-ui); color: var(--muted-foreground); }
.errors { list-style: none; padding: 0; display: grid; gap: 8px; }
.errors li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; align-items: start; font-size: var(--type-detail); }
.errors + .note { margin-top: 10px; }

/* 요청 패널. 좁은 화면에서는 필드 아래에 둔다. */
.op-code { margin-top: 24px; border: 1px solid var(--border); border-radius: var(--rounded-surface); }
.op-code .workspace-tabs { margin-bottom: 0; gap: 0; background: var(--background); border-radius: var(--rounded-surface) var(--rounded-surface) 0 0; }
.workspace-tabs .tab { flex: 1 1 0; min-height: 44px; border-radius: 0; }
.workspace-tabs .tab:first-child { border-start-start-radius: var(--rounded-surface); }
.workspace-tabs .tab:last-child { border-start-end-radius: var(--rounded-surface); }
.workspace-pane { padding: 16px; }
.code-block + .code-block { margin-top: 24px; }
.code-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.code-head h4 { font-size: var(--type-detail); color: var(--muted-foreground); font-weight: 600; }
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 10px;
}
.tab {
  min-height: 36px;
  margin-bottom: -1px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--rounded-control) var(--rounded-control) 0 0;
  background: none;
  color: var(--muted-foreground);
  font: inherit;
  font-size: var(--type-ui);
  font-weight: 600;
  cursor: pointer;
}
.status-tabs .tab { font-family: var(--mono); padding: 0 10px; }
/* 고른 탭. 가로 메뉴처럼 아래 3px 막대와 옅은 파랑 바탕이다(DESIGN.md). */
.tab[aria-selected="true"] {
  color: var(--foreground);
  background: var(--primary-surface);
  box-shadow: inset 0 -3px 0 var(--primary);
}
.tab:focus-visible { outline-offset: -2px; }
.code-caption {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin-bottom: 8px;
  font-size: var(--type-ui);
}
.code-caption .media { font-family: var(--mono); color: var(--muted-foreground); }
pre.code {
  background: var(--muted);
  color: var(--foreground);
  border: 1px solid var(--border);
  border-radius: var(--rounded-control);
  padding: 14px 16px;
  overflow: auto;
  max-height: 420px;
  line-height: 1.5;
  font-size: var(--type-ui);
  tab-size: 2;
  scrollbar-color: var(--scrollbar) var(--muted);
  scrollbar-width: thin;
}
.code-note { margin-top: 8px; font-size: var(--type-ui); color: var(--muted-foreground); max-width: 72ch; }
.code-note code { font-size: var(--type-caption); }
.copy {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--input);
  border-radius: var(--rounded-control);
  background: var(--card);
  color: var(--foreground);
  font: inherit;
  font-size: var(--type-detail);
  cursor: pointer;
  white-space: nowrap;
}

/* 오류 코드 표와 경로별 오류 표. 좁은 화면에서는 행마다 칸을 위아래로 쌓는다. 표의 뜻은 role로 남긴다. */
.codes-section h3 { font-size: var(--type-title); margin-top: 32px; }
.codes-section h3 + p { margin-top: 6px; color: var(--muted-foreground); max-width: 72ch; }
.table-wrap {
  margin-top: 12px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--rounded-surface);
  overflow: hidden;
}
.codes { width: 100%; border-collapse: collapse; font-size: var(--type-detail); }
.codes th, .codes td { text-align: left; vertical-align: top; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.codes thead th { font-size: var(--type-ui); font-weight: 600; color: var(--muted-foreground); background: var(--muted); white-space: nowrap; }
.codes tbody:last-child tr:last-child > * { border-bottom: 0; }
.codes tbody th { font-weight: 400; }
.codes tbody th code { white-space: nowrap; font-weight: 600; }
/* type 묶음의 머리 행. 묶음 사이를 굵은 선으로 나눈다. */
.codes tbody + tbody tr.group > * { border-top: 2px solid var(--border); }
.codes tr.group > th { background: var(--background); }
.group-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
.group-text { margin-top: 4px; color: var(--muted-foreground); max-width: 72ch; }
.code-cell { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; }
/* 경로별 오류 표는 경로 카드 안에 있다. 칸 여백을 줄여 메시지 칸을 넓힌다. */
.block .table-wrap { margin-top: 0; }
.block .table-wrap + .note { margin-top: 10px; }
.block .codes th, .block .codes td { padding: 8px 12px; }
.block .codes tbody th code { font-size: var(--type-ui); }
.codes tbody tr:target > * { background: var(--primary-surface); }
.codes tbody tr:target > :first-child { box-shadow: inset 3px 0 0 var(--primary); }
.statuses { display: flex; flex-wrap: wrap; gap: 4px; }
.cell-label { display: none; }

.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
/* 마우스가 있는 기기에서만 hover를 쓴다. 터치 뒤에 hover가 남지 않는다. */
@media (hover: hover) {
  a:hover { color: var(--primary-hover); }
  .toc-group li a:hover { background: var(--muted); }
  .toc-group li a[aria-current="true"]:hover { background: var(--primary-surface); }
  .op-index a:hover { background: var(--muted); color: var(--foreground); }
  .op h3 a:hover { text-decoration: underline; }
  .copy:hover { background: var(--muted); }
  .try-send:hover { background: var(--primary-hover); }
  .tab:hover { color: var(--foreground); background: var(--muted); }
  .tab[aria-selected="true"]:hover { background: var(--primary-surface); }
  .code-link:hover code { text-decoration: underline; }
}
@media (hover: hover) and (pointer: fine) {
  .search kbd { display: inline-block; }
  .search input:not(:placeholder-shown) + kbd { display: none; }
}

@media (max-width: 640px) {
  /* iOS Safari가 입력할 때 화면을 확대하지 않게 한다. 누르는 요소는 44px 이상이다. */
  .search input { font-size: var(--type-body); min-height: 44px; }
  .tab, .copy { min-height: 44px; }
}
@media (max-width: 767px) {
  .codes thead {
    position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap;
  }
  .codes, .codes tbody, .codes tr, .codes th, .codes td { display: block; }
  .codes tbody tr { padding: 12px 16px; border-bottom: 1px solid var(--border); }
  .codes tbody:last-child tr:last-child { border-bottom: 0; }
  .codes tr.group { background: var(--background); }
  .codes tbody + tbody tr.group { border-top: 2px solid var(--border); }
  .codes tbody + tbody tr.group > * { border-top: 0; }
  .codes tbody th, .codes tbody td, .block .codes tbody th, .block .codes tbody td { padding: 0; border: 0; }
  .block .codes tbody tr { padding: 10px 12px; }
  .codes tbody tr > * + * { margin-top: 8px; }
  .codes tbody tr:target { background: var(--primary-surface); box-shadow: inset 3px 0 0 var(--primary); }
  .codes tbody tr:target > :first-child { box-shadow: none; }
  .cell-label { display: block; font-size: var(--type-caption); font-weight: 600; color: var(--muted-foreground); }
}
@media (min-width: 768px) {
  main { padding: 40px 40px 96px; }
  .overview-connection { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .overview-connection section + section { border-block-start: 0; border-inline-start: 1px solid var(--border); }
  .op { padding: 24px; }
  .op-index a { grid-template-columns: 52px minmax(0, 1fr) auto; }
  .op-index-text { flex-direction: row; flex-wrap: wrap; align-items: baseline; column-gap: 12px; }
  .op-index .badge { grid-column: auto; }
  .codes th:first-child { width: 1%; }
  .statuses { flex-wrap: nowrap; }
}
@media (min-width: 896px) {
  .op { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; align-items: start; }
  .op-code { margin-top: 0; }
}
@media (min-width: 1024px) {
  .layout { grid-template-columns: clamp(224px, 22vw, 288px) minmax(0, 1fr); }
  .nav {
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
    border-bottom: 0;
    border-right: 1px solid var(--border);
    padding: 28px 16px;
  }
  /* 목차가 길어도 검색 칸은 위에 남는다. 키보드로 옮긴 목차 항목이 검색 칸 뒤에 가리지 않게 한다. */
  .nav { scroll-padding-top: 96px; }
  .search { position: sticky; top: -28px; z-index: 1; margin-top: 4px; padding: 12px 0 8px; }
  .toc > summary { display: none; }
  .toc-body { padding-top: 0; }
  main { padding: 48px clamp(24px, 3vw, 48px) 120px; }
}
@media (min-width: 1200px) {
  main { max-width: 1360px; padding: 48px 48px 120px; }
  .op { gap: 32px; padding: 28px; }
}
/* 화면 높이가 넉넉할 때만 예시를 붙인다. 붙은 예시가 화면보다 길면 아래가 가려진다. */
@media (min-width: 1200px) and (min-height: 760px) {
  .op-code[data-mode="examples"] { position: sticky; top: 16px; }
  .op-code .request pre.code { max-height: 24vh; }
  .op-code .response pre.code { max-height: 27vh; }
}
`;

// 문자열 안의 스크립트. 템플릿 리터럴 문법(백틱, 달러+중괄호)은 쓰지 않는다.
const SCRIPT = String.raw`
(function () {
  "use strict";
  var TICK = String.fromCharCode(96);
  var statusLine = document.getElementById("status");
  var live = document.getElementById("live");
  var searchInput = document.getElementById("search");
  var searchStatus = document.getElementById("search-status");
  var tocWrap = document.getElementById("toc-wrap");
  var toc = document.getElementById("toc");
  var nav = document.querySelector(".nav");
  var wide = window.matchMedia("(min-width: 1024px)");
  var own = Object.prototype.hasOwnProperty;

  var LANGUAGE_KEY = "finveric-docs-language";
  var LANGUAGES = [
    { key: "curl", label: "curl" },
    { key: "node", label: "Node.js" },
    { key: "python", label: "Python" },
  ];
  var AUTH_LABELS = { open: "공개", key: "API 키" };
  var CREDENTIALS = { key: "FINVERIC_API_KEY" };
  var CREDENTIAL_NOTES = {
    open: "인증 헤더 없이 부릅니다.",
    key: tick("FINVERIC_API_KEY") + "는 판매사 콘솔에서 발급한 API 키입니다. 키는 " + tick("fvk_") + "로 시작합니다.",
  };
  // 스키마에 예시가 없을 때 쓰는 값.
  var ISO_TIME = "2026-11-13T06:04:05.000Z";
  var UNIX_TIME = 1794549845;
  var BY_NAME = { chainId: 31337, ms: 12, coolingPeriod: 60, explanationSeconds: 180 };

  var language = "curl";
  try {
    var saved = localStorage.getItem(LANGUAGE_KEY);
    if (LANGUAGES.some(function (item) { return item.key === saved; })) language = saved;
  } catch (e) {}
  var targets = {}; // 백틱 안의 이름(type, code, ledgerError, operationId) → 문서 안 주소
  var requests = []; // 언어 탭이 있는 요청 예시
  var hasCodes = false; // 문서에 x-error-codes가 있으면 오류 코드 표를 그린다.
  var catalog = {}; // code → x-error-codes의 항목(type, status, message, description, common)
  var codeOrder = {}; // code → 오류 코드 표의 순서
  var resize = "ResizeObserver" in window
    ? new ResizeObserver(function (entries) { entries.forEach(function (entry) { fit(entry.target); }); })
    : null;

  function tick(text) { return TICK + text + TICK; }
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs)
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === "class") el.className = value;
        else el.setAttribute(key, value === true ? "" : String(value));
      });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) return child.forEach(function (c) { add(el, c); });
    el.appendChild(typeof child === "string" || typeof child === "number"
      ? document.createTextNode(String(child)) : child);
  }
  function icon(name) {
    var holder = document.createElement("span");
    holder.innerHTML = '<svg class="icon" aria-hidden="true" focusable="false"><use href="#i-' + name + '"></use></svg>';
    return holder.firstChild;
  }
  // 백틱으로 감싼 부분만 code로 바꾼다. 오류 코드, 원장 오류 이름, operationId는 그 항목으로 연결한다.
  function inline(text) {
    return String(text).split(TICK).map(function (part, i) {
      if (!(i % 2)) return part;
      return own.call(targets, part)
        ? h("a", { href: targets[part], class: "code-link" }, h("code", null, part))
        : h("code", null, part);
    }).filter(function (part) { return part !== ""; });
  }
  function blocks(markdown) {
    return String(markdown || "").split(/\n\n+/).map(function (block) {
      if (/^\d+\. /.test(block)) {
        return h("ol", { class: "overview-steps" }, block.split("\n").map(function (line) {
          var step = line.replace(/^\d+\. /, "");
          var titled = /^\*\*(.+?)\*\* (.*)$/.exec(step);
          return h("li", null, titled ? h("h3", null, titled[1]) : null,
            h("p", null, inline(titled ? titled[2] : step)));
        }));
      }
      if (/^- /.test(block))
        return h("ul", null, block.split("\n").map(function (line) {
          return h("li", null, inline(line.replace(/^- /, "")));
        }));
      return h("p", null, inline(block));
    });
  }
  // "### 제목"으로 나눈 묶음. 첫 묶음은 제목이 없다.
  function sections(markdown) {
    var groups = [{ title: "", text: [] }];
    String(markdown || "").split(/\n\n+/).forEach(function (block) {
      if (block.indexOf("### ") === 0) groups.push({ title: block.slice(4), text: [] });
      else groups[groups.length - 1].text.push(block);
    });
    return groups.map(function (g) { return { title: g.title, text: g.text.join("\n\n") }; });
  }
  function firstSentence(text) {
    var match = /^.*?다\./.exec(String(text || ""));
    return match ? match[0] : String(text || "");
  }

  function pointer(spec, ref) {
    return ref.replace(/^#\//, "").split("/").reduce(function (node, key) {
      return node ? node[key.replace(/~1/g, "/").replace(/~0/g, "~")] : undefined;
    }, spec);
  }
  function resolve(spec, node) {
    for (var i = 0; node && node.$ref && i < 10; i++) node = pointer(spec, node.$ref);
    return node;
  }
  function refName(ref) { return ref.split("/").pop(); }

  function typeLabel(spec, s) {
    if (!s) return "임의 JSON";
    if (s.$ref) return refName(s.$ref);
    if (s.oneOf) return s.oneOf.map(function (x) { return typeLabel(spec, x); }).join(" | ");
    if (s.const !== undefined) return JSON.stringify(s.const);
    if (s.enum) return "enum";
    if (s.type === "array") return typeLabel(spec, s.items) + "[]";
    if (Array.isArray(s.type)) return s.type.join(" | ");
    return s.type || "임의 JSON";
  }
  function range(min, max, unit) {
    if (min === undefined && max === undefined) return null;
    if (min !== undefined && max !== undefined)
      return min === max ? min + unit : min + "–" + max + unit;
    return min !== undefined ? min + unit + " 이상" : max + unit + " 이하";
  }
  function rules(s) {
    var out = [];
    if (!s) return out;
    if (s.enum) out.push(["값", s.enum.map(function (v) { return JSON.stringify(v); }).join(", ")]);
    if (s.pattern) out.push(["형식", s.pattern]);
    if (s.format) out.push(["형식", s.format]);
    var r = range(s.minimum, s.maximum, "");
    if (r) out.push(["범위", r]);
    var l = range(s.minLength, s.maxLength, "자");
    if (l) out.push(["길이", l]);
    var n = range(s.minItems, s.maxItems, "개");
    if (n) out.push(["항목 수", n]);
    return out;
  }
  function rulesView(spec, s) {
    var list = rules(s);
    if (s && s.type === "array") {
      var items = resolve(spec, s.items);
      if (items && !items.properties)
        rules(items).forEach(function (rule) { list.push(["항목 " + rule[0], rule[1]]); });
    }
    if (!list.length) return null;
    return h("div", { class: "rules" }, list.map(function (rule) {
      return h("div", null, rule[0] + ": ", h("code", null, rule[1]));
    }));
  }

  function hasFields(spec, s) {
    var t = resolve(spec, s);
    if (!t) return false;
    if (t.properties || t.oneOf) return true;
    return t.type === "array" && hasFields(spec, t.items);
  }
  function schemaView(spec, schema, seen) {
    var name = schema && schema.$ref ? refName(schema.$ref) : null;
    if (name) {
      if (seen.indexOf(name) >= 0) return h("p", { class: "note" }, name + "와 같습니다.");
      seen = seen.concat(name);
    }
    var s = resolve(spec, schema);
    if (!s) return null;
    if (s.oneOf)
      return h("div", null,
        h("p", { class: "note" }, "다음 가운데 하나입니다."),
        s.oneOf.map(function (alt) {
          return h("div", { class: "alt" },
            h("p", { class: "alt-name" }, typeLabel(spec, alt)),
            schemaView(spec, alt, seen));
        }));
    if (s.type === "array") {
      if (hasFields(spec, s.items))
        return h("div", null,
          h("p", { class: "note" }, typeLabel(spec, s.items) + " 배열입니다. 항목 필드:"),
          schemaView(spec, s.items, seen));
      return h("div", null, h("p", { class: "note" }, typeLabel(spec, s) + " 배열입니다."), rulesView(spec, s));
    }
    if (s.properties) return fields(spec, s, seen);
    return h("div", null,
      h("p", { class: "note" }, typeLabel(spec, s) + (s.description ? " · " + s.description : "")),
      rulesView(spec, s));
  }
  function fields(spec, s, seen) {
    var required = s.required || [];
    return h("ul", { class: "fields" }, Object.keys(s.properties).map(function (key) {
      var prop = s.properties[key];
      var target = resolve(spec, prop) || {};
      var description = prop.description || target.description;
      var must = required.indexOf(key) >= 0;
      return h("li", { class: "field" },
        h("div", { class: "field-head" },
          h("code", { class: "field-name" }, key),
          h("span", { class: "type" }, typeLabel(spec, prop)),
          h("span", { class: must ? "badge req" : "badge" }, must ? "필수" : "선택")),
        description ? h("p", { class: "field-desc" }, inline(description)) : null,
        rulesView(spec, target),
        hasFields(spec, prop)
          ? h("details", { class: "nested" },
              h("summary", null, typeLabel(spec, prop) + " 필드 보기"),
              schemaView(spec, prop, seen))
          : null);
    }));
  }

  function media(response) {
    var content = response && response.content;
    if (!content) return null;
    var type = Object.keys(content)[0];
    var item = content[type] || {};
    var example = item.example;
    if (example === undefined && item.examples) {
      var first = item.examples[Object.keys(item.examples)[0]];
      if (first) example = first.value;
    }
    return { type: type, schema: item.schema, example: example };
  }
  function statusClass(code) {
    var n = Number(code);
    return n < 300 ? "ok" : n < 500 ? "client" : "server";
  }
  // 경로별 오류 표: 이 경로만의 code는 표로, 공통 오류는 그 아래 한 줄로 보여 준다. code는 오류 코드 표로 연결한다.
  function codeLink(code) {
    return h("a", { href: "#code-" + code, class: "code-link" }, h("code", null, code));
  }
  function operationErrorsView(codes) {
    var known = codes.filter(function (code) { return own.call(catalog, code); });
    var sorted = known.slice().sort(function (a, b) {
      return catalog[a].status - catalog[b].status || codeOrder[a] - codeOrder[b];
    });
    var specific = sorted.filter(function (code) { return !catalog[code].common; });
    var common = sorted.filter(function (code) { return catalog[code].common; });
    return h("div", { class: "block" }, h("h4", null, "이 API의 오류"),
      specific.length
        ? table("이 API의 오류", ["HTTP 상태", "code", "메시지"], specific.map(function (code) {
            var item = catalog[code];
            return {
              cells: [
                h("span", { class: "code-status " + statusClass(item.status) }, String(item.status)),
                codeLink(code),
                item.message,
              ],
            };
          }), 1)
        : h("p", { class: "note" }, "이 API만의 오류는 없습니다."),
      common.length
        ? h("p", { class: "note" }, "공통 오류: ",
            common.map(function (code, i) { return [i ? ", " : null, codeLink(code)]; }),
            ". 뜻과 다음 행동은 ", h("a", { href: "#error-codes", class: "jump" }, "오류 코드 표"), "에 있습니다.")
        : null);
  }
  function responsesView(spec, op) {
    var success = [];
    var other = [];
    Object.keys(op.responses || {}).forEach(function (code) {
      var response = resolve(spec, op.responses[code]);
      var body = media(response);
      if (Number(code) < 300) {
        success.push(h("div", { class: "response" },
          h("div", { class: "response-head" },
            h("span", { class: "code-status ok" }, code),
            h("span", null, response.description),
            body ? h("span", { class: "media" }, body.type) : null),
          body ? schemaView(spec, body.schema, []) : null));
      } else {
        other.push(h("li", null,
          h("span", { class: "code-status " + statusClass(code) }, code),
          h("span", null, inline(response.description))));
      }
    });
    return [
      h("div", { class: "block" }, h("h4", null, "응답"), success),
      hasCodes && op["x-errors"]
        ? operationErrorsView(op["x-errors"])
        : other.length
        ? h("div", { class: "block" }, h("h4", null, "오류 응답"),
            h("ul", { class: "errors" }, other),
            hasCodes
              ? h("p", { class: "note" }, h("code", null, "code"), "마다 뜻과 다음 행동은 ", h("a", { href: "#error-codes", class: "jump" }, "오류 코드 표"), "에 있습니다.")
              : null)
        : null,
    ];
  }

  // ── 응답 예시: 스키마에서 만든다 ─────────────────────────────
  // 같은 이름의 필드는 같은 값이 되도록 이름으로 씨앗을 정한다.
  function seeded(text) {
    var state = 2166136261;
    for (var i = 0; i < text.length; i++) {
      state ^= text.charCodeAt(i);
      state = Math.imul(state, 16777619);
    }
    return function () {
      state = (state + 0x6d2b79f5) | 0;
      var t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function charClass(body) {
    var list = [];
    for (var i = 0; i < body.length; i++) {
      if (body[i + 1] === "-" && i + 2 < body.length) {
        for (var c = body.charCodeAt(i); c <= body.charCodeAt(i + 2); c++) list.push(String.fromCharCode(c));
        i += 2;
      } else list.push(body[i] === "\\" ? body[++i] : body[i]);
    }
    // 16진수는 소문자만 쓴다(해시와 주소처럼 보인다).
    if (list.indexOf("a") >= 0 && list.indexOf("A") >= 0 && list.indexOf("g") < 0)
      list = list.filter(function (ch) { return ch < "A" || ch > "F"; });
    return list;
  }
  // 단순한 정규식(문자, [문자 묶음], \d·\w·\S, {n}·{n,m}·+·*·?)에 맞는 값을 만든다. 묶음과 |는 다루지 않는다.
  function fromPattern(pattern, seed) {
    if (/[()|]/.test(pattern)) return null;
    var source = pattern.replace(/^\^/, "").replace(/\$$/, "");
    var rand = seeded(seed + pattern);
    var word = charClass("A-Za-z0-9");
    var out = "";
    for (var i = 0; i < source.length;) {
      var chars;
      if (source[i] === "[") {
        var end = source.indexOf("]", i + 1);
        if (end < 0) return null;
        chars = charClass(source.slice(i + 1, end));
        i = end + 1;
      } else if (source[i] === "\\") {
        var escaped = source[i + 1];
        chars = escaped === "d" ? charClass("0-9") : /[wS]/.test(escaped) ? word : [escaped];
        i += 2;
      } else if (source[i] === ".") {
        chars = word;
        i++;
      } else {
        chars = [source[i]];
        i++;
      }
      var min = 1, max = 1;
      if (source[i] === "{") {
        var close = source.indexOf("}", i);
        var bounds = source.slice(i + 1, close).split(",");
        min = Number(bounds[0]);
        max = bounds.length === 1 ? min : bounds[1] === "" ? min + 8 : Number(bounds[1]);
        i = close + 1;
      } else if (source[i] === "+") { max = 9; i++; }
      else if (source[i] === "*") { min = 0; max = 8; i++; }
      else if (source[i] === "?") { min = 0; i++; }
      var count = min === max ? min : Math.min(max, Math.max(min, 8));
      for (var k = 0; k < count; k++) out += chars[Math.floor(rand() * chars.length)];
    }
    return out;
  }
  function decimal(key) {
    if (/At$/.test(key)) return String(UNIX_TIME);
    if (/block/i.test(key)) return "128";
    if (/amount/i.test(key)) return "10000000";
    return fromPattern("^[1-9][0-9]{75}$", key);
  }
  function textValue(s, key, ctx) {
    if (s.format === "date-time") return ISO_TIME;
    if (s.format === "date") return ISO_TIME.slice(0, 10);
    if (s.pattern) {
      if (own.call(ctx.patterns, s.pattern)) return ctx.patterns[s.pattern];
      if (s.pattern === "^[0-9]+$") return decimal(key);
      var made = fromPattern(s.pattern, key);
      if (made !== null) return made;
    }
    return "string";
  }
  function numberValue(s, key, index, type) {
    if (/^at$|At$/.test(key)) return UNIX_TIME;
    if (/amount/i.test(key)) return 10000000;
    if (own.call(BY_NAME, key)) return BY_NAME[key];
    var low = s.minimum !== undefined ? s.minimum : s.exclusiveMinimum !== undefined ? s.exclusiveMinimum + 1 : 1;
    var value = Math.max(low, type === "integer" ? 1 : 0) + index;
    return s.maximum !== undefined ? Math.min(value, s.maximum) : value;
  }
  function sample(spec, schema, key, seen, index, ctx) {
    if (!schema) return null;
    if (schema.$ref) {
      var name = refName(schema.$ref);
      if (seen.indexOf(name) >= 0 || seen.length > 8) return {};
      seen = seen.concat(name);
    }
    var s = resolve(spec, schema);
    if (!s) return null;
    if (s.example !== undefined) return s.example;
    if (Array.isArray(s.examples) && s.examples.length) return s.examples[0];
    if (s.const !== undefined) return s.const;
    if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];
    var alternatives = s.oneOf || s.anyOf;
    if (alternatives && alternatives.length) return sample(spec, alternatives[0], key, seen, index, ctx);
    var type = Array.isArray(s.type)
      ? s.type.filter(function (t) { return t !== "null"; })[0]
      : s.type;
    if (!type) type = s.properties ? "object" : s.items ? "array" : null;
    if (type === "object") {
      var out = {};
      Object.keys(s.properties || {}).forEach(function (name) {
        out[name] = sample(spec, s.properties[name], name, seen, 0, ctx);
      });
      return out;
    }
    if (type === "array") {
      var item = resolve(spec, s.items) || {};
      var simple = !(item.properties || item.oneOf || item.type === "object" || item.type === "array");
      // 배열은 항목 하나를 보여 준다. 단순 값 배열은 최소 개수(6개까지)를 채운다.
      var count = simple ? Math.min(Math.max(s.minItems || 1, 1), 6) : 1;
      var list = [];
      for (var i = 0; i < count; i++) list.push(sample(spec, s.items, key, seen, i, ctx));
      return list;
    }
    if (type === "string") return textValue(s, key, ctx);
    if (type === "integer" || type === "number") return numberValue(s, key, index, type);
    if (type === "boolean") return true;
    if (type === "null") return null;
    return {};
  }
  function responseExample(spec, ctx, op, status) {
    var response = resolve(spec, op.responses[status]) || {};
    var body = media(response);
    var caption = Number(status) < 300 ? response.description : firstSentence(response.description);
    if (!body) return { caption: caption, type: null, text: "본문이 없습니다." };
    var value = body.example !== undefined ? body.example : sample(spec, body.schema, "", [], 0, ctx);
    var json = /json/.test(body.type);
    return {
      caption: caption,
      type: body.type,
      text: typeof value === "string" && !json ? value : JSON.stringify(value, null, 2),
    };
  }

  // ── 요청 예시: curl, Node.js(fetch), Python(requests) ─────────
  function shellQuote(text) { return "'" + String(text).replace(/'/g, "'\\''") + "'"; }
  function indent(text, pad) { return String(text).split("\n").join("\n" + pad); }
  function pyLiteral(value, pad) {
    if (value === null || value === undefined) return "None";
    if (value === true) return "True";
    if (value === false) return "False";
    if (typeof value === "number") return String(value);
    if (typeof value === "string") return JSON.stringify(value);
    var inner = pad + "    ";
    if (Array.isArray(value))
      return value.length
        ? "[\n" + value.map(function (v) { return inner + pyLiteral(v, inner) + ",\n"; }).join("") + pad + "]"
        : "[]";
    var keys = Object.keys(value);
    return keys.length
      ? "{\n" + keys.map(function (k) { return inner + JSON.stringify(k) + ": " + pyLiteral(value[k], inner) + ",\n"; }).join("") + pad + "}"
      : "{}";
  }
  function authOf(op) {
    return op.security && op.security.length ? "key" : "open";
  }
  function requestPayload(method, op) {
    var body = op.requestBody && media(op.requestBody);
    if (body && body.example !== undefined) return body.example;
    // POST는 본문이 없어도 빈 JSON을 보낸다.
    return body || method === "post" ? {} : undefined;
  }
  function requestSnippets(base, path, method, op, auth) {
    var params = op.parameters || [];
    var url = base + path.replace(/\{(\w+)\}/g, function (_, name) {
      var p = params.filter(function (x) { return x.name === name; })[0];
      return encodeURIComponent(p && p.example !== undefined ? p.example : name);
    });
    var payload = requestPayload(method, op);
    var variable = CREDENTIALS[auth] || null;
    var success = Object.keys(op.responses || {}).filter(function (code) { return Number(code) < 300; })[0];
    var successBody = success ? media(op.responses[success]) : null;
    var asText = successBody && !/json/.test(successBody.type);
    var verb = method.toUpperCase();

    var curl = ["curl" + (method === "get" ? "" : " -X " + verb) + " " + shellQuote(url)];
    if (variable) curl.push('  -H "Authorization: Bearer $' + variable + '"');
    if (payload !== undefined) {
      curl.push("  -H 'Content-Type: application/json'");
      curl.push("  -d " + shellQuote(JSON.stringify(payload, null, 2)));
    }

    var headers = [];
    if (variable) headers.push("Authorization: " + TICK + "Bearer $" + "{process.env." + variable + "}" + TICK + ",");
    if (payload !== undefined) headers.push('"Content-Type": "application/json",');
    var options = [];
    if (method !== "get") options.push('method: "' + verb + '",');
    if (headers.length) options.push("headers: {\n    " + headers.join("\n    ") + "\n  },");
    if (payload !== undefined) options.push("body: JSON.stringify(" + indent(JSON.stringify(payload, null, 2), "  ") + "),");
    var node = "const response = await fetch(" + JSON.stringify(url) +
      (options.length ? ", {\n  " + options.join("\n  ") + "\n}" : "") + ");\n" +
      (asText ? "const html = await response.text();" : "const data = await response.json();");

    var args = [JSON.stringify(url)];
    if (variable) args.push('headers={"Authorization": f"Bearer {os.environ[' + "'" + variable + "'" + ']}"}');
    if (payload !== undefined) args.push("json=" + pyLiteral(payload, "    "));
    var python = (variable ? "import os\n\nimport requests\n\n" : "import requests\n\n") +
      "response = requests." + method +
      (args.length === 1 ? "(" + args[0] + ")" : "(\n    " + args.join(",\n    ") + ",\n)") + "\n" +
      (asText ? "html = response.text" : "data = response.json()");

    return { curl: curl.join(" \\\n"), node: node, python: python };
  }

  // ── 조작 요소 ─────────────────────────────────────────────────
  function copyButton(read, label) {
    var button = h("button", { type: "button", class: "copy", "aria-label": label + " 복사" }, "복사");
    var timer;
    button.addEventListener("click", function () {
      var fail = function () { live.textContent = "복사하지 못했습니다. 직접 선택해 복사하세요."; };
      if (!navigator.clipboard) return fail();
      navigator.clipboard.writeText(read()).then(function () {
        button.textContent = "복사했습니다";
        live.textContent = label + "를 복사했습니다.";
        clearTimeout(timer);
        timer = setTimeout(function () { button.textContent = "복사"; }, 1500);
      }, fail);
    });
    return button;
  }
  // 탭: 화살표·Home·End로 옮기면 바로 고른다. 고른 탭만 Tab 순서에 있다.
  function tabs(idBase, labelledBy, items, onSelect, className) {
    var list = h("div", { role: "tablist", "aria-labelledby": labelledBy, class: "tabs " + (className || "") });
    var panel = h("div", { role: "tabpanel", id: idBase + "-panel" });
    var buttons = items.map(function (item) {
      var button = h("button", {
        type: "button", role: "tab", class: "tab", id: idBase + "-" + item.key, "aria-controls": (item.panel || panel).id,
      }, item.label);
      button.addEventListener("click", function () { onSelect(item.key, button); });
      return button;
    });
    list.addEventListener("keydown", function (e) {
      var i = buttons.indexOf(document.activeElement);
      if (i < 0) return;
      var n = buttons.length;
      var next = e.key === "ArrowRight" ? (i + 1) % n
        : e.key === "ArrowLeft" ? (i - 1 + n) % n
        : e.key === "Home" ? 0
        : e.key === "End" ? n - 1 : -1;
      if (next < 0) return;
      e.preventDefault();
      buttons[next].focus();
      onSelect(items[next].key, buttons[next]);
    });
    add(list, buttons);
    return {
      list: list,
      panel: panel,
      mark: function (key) {
        buttons.forEach(function (button, i) {
          var item = items[i];
          var on = item.key === key;
          button.setAttribute("aria-selected", on ? "true" : "false");
          button.tabIndex = on ? 0 : -1;
          var target = item.panel || panel;
          if (item.panel) target.hidden = !on;
          if (on) target.setAttribute("aria-labelledby", button.id);
        });
      },
    };
  }
  // 넘치는 예시만 이름이 있는 영역이 되고 Tab 초점을 받는다. 초점을 옮긴 뒤 화살표로 스크롤한다.
  function fit(pre) {
    if (!pre.isConnected) return;
    var over = pre.scrollWidth > pre.clientWidth + 1 || pre.scrollHeight > pre.clientHeight + 1;
    if (over) {
      pre.tabIndex = 0;
      pre.setAttribute("role", "region");
      pre.setAttribute("aria-label", pre.getAttribute("data-label"));
    } else if (document.activeElement !== pre) {
      pre.removeAttribute("tabindex");
      pre.removeAttribute("role");
      pre.removeAttribute("aria-label");
    }
  }
  function codeBox(label) {
    var code = h("code");
    var pre = h("pre", { class: "code", "data-label": label }, code);
    if (resize) resize.observe(pre);
    return { pre: pre, code: code };
  }
  function runnerField(id, label, input, note) {
    var message = h("p", { id: id + "-error", class: "try-message", role: "alert" });
    input.setAttribute("aria-describedby", (note ? id + "-note " : "") + message.id);
    return {
      input: input,
      element: h("div", null, h("label", { class: "try-field" }, h("span", null, label), input),
        note ? h("p", { id: id + "-note", class: "note try-field-note" }, note) : null, message),
      error: function (text) {
        message.textContent = text;
        if (text) {
          input.setAttribute("aria-invalid", "true");
          input.focus();
        } else input.removeAttribute("aria-invalid");
      },
    };
  }
  function requestRunner(ctx, path, method, op, id, auth, keySlot) {
    var send = h("button", { type: "submit", class: "try-send" }, "요청 보내기");
    var status = h("p", { class: "note try-status", role: "status" });
    var empty = h("p", { class: "note try-empty" }, "요청을 보내면 응답이 여기에 표시됩니다.");
    var result = codeBox(op.summary + " 실제 응답 본문");
    result.pre.hidden = true;
    var fields = (op.parameters || []).filter(function (p) { return p.in === "path"; }).map(function (p) {
      var input = h("input", { type: "text", required: true, placeholder: p.example, spellcheck: "false", autocapitalize: "off" });
      var field = runnerField(id + "-path-" + p.name, p.description || p.name, input);
      field.name = p.name;
      return field;
    });
    var payload = requestPayload(method, op);
    var editor = op.requestBody ? runnerField(id + "-body", "요청 본문 (JSON)",
      h("textarea", { rows: 6, required: true, spellcheck: "false", autocapitalize: "off" })) : null;
    if (editor) editor.input.value = JSON.stringify(payload, null, 2);
    var url = h("code");
    function pathValue(field) { return field.input.value.trim(); }
    function validPath(value) { return value && value !== "." && value !== ".."; }
    function executionPath() {
      return path.replace(/\{(\w+)\}/g, function (token, name) {
        var field = fields.find(function (item) { return item.name === name; });
        var value = field && pathValue(field);
        return validPath(value) ? encodeURIComponent(value) : token;
      });
    }
    function showUrl() {
      url.replaceChildren(location.origin);
      add(url, pathParts(executionPath()));
    }
    fields.forEach(function (field) { field.input.addEventListener("input", showUrl); });
    showUrl();

    var form = h("form", { class: "try-form", autocomplete: "off", novalidate: true },
      h("div", { class: "try-route" },
        h("span", { class: "sr-only" }, "실행 주소 "),
        h("span", { class: "method " + method }, method.toUpperCase()), url),
      keySlot,
      fields.map(function (field) { return field.element; }),
      editor && editor.element,
      method === "post" ? h("p", { class: "note" }, "성공하면 이 서버의 기록이 바뀔 수 있습니다.") : null,
      send);
    var title = id + "-live-response";
    var responsePanel = h("section", { class: "try-result", "aria-labelledby": title },
      h("div", { class: "try-result-head" }, h("h4", { id: title }, "실제 응답"), status), empty, result.pre);

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (send.getAttribute("aria-disabled") === "true") return;
      var keyField = auth === "key" ? ctx.keyField : null;
      if (keyField) keyField.error("");
      fields.forEach(function (field) { field.error(""); });
      if (editor) editor.error("");
      status.classList.remove("error");
      status.textContent = "";
      empty.hidden = false;
      result.pre.hidden = true;
      result.code.textContent = "";
      var headers = { Accept: "application/json" };
      if (keyField) {
        var key = keyField.input.value.trim();
        if (!/^fvk_[A-Za-z0-9_-]+$/.test(key)) {
          keyField.error("fvk_로 시작하는 API 키를 입력하세요.");
          return;
        }
        headers.Authorization = "Bearer " + key;
      }
      var invalid = fields.find(function (field) { return !validPath(pathValue(field)); });
      if (invalid) {
        invalid.error("경로 값을 확인해 주세요.");
        return;
      }
      var body = editor ? editor.input.value : payload === undefined ? undefined : JSON.stringify(payload);
      if (editor) {
        try { JSON.parse(body); }
        catch (error) {
          editor.error("요청 본문을 올바른 JSON으로 입력하세요.");
          return;
        }
      }
      if (body !== undefined) headers["Content-Type"] = "application/json";
      send.setAttribute("aria-disabled", "true");
      send.setAttribute("aria-busy", "true");
      send.textContent = "보내는 중…";
      empty.hidden = true;
      status.textContent = "응답을 기다리고 있습니다.";
      try {
        var response = await fetch(location.origin + executionPath(), {
          method: method.toUpperCase(), headers: headers, body: body,
          credentials: "omit", mode: "same-origin", redirect: "error",
        });
        var text = await response.text();
        if ((response.headers.get("Content-Type") || "").includes("json")) {
          try { text = JSON.stringify(JSON.parse(text), null, 2); } catch (error) {}
        }
        result.code.textContent = text;
        result.pre.hidden = !text;
        fit(result.pre);
        status.replaceChildren(h("span", { class: "code-status " + statusClass(response.status) }, "HTTP " + response.status));
        if (!text) status.append(" · 본문 없음");
      } catch (error) {
        status.classList.add("error");
        status.textContent = "응답을 받지 못했습니다. 서버 연결을 확인해 주세요.";
      } finally {
        send.removeAttribute("aria-disabled");
        send.removeAttribute("aria-busy");
        send.textContent = "요청 보내기";
      }
    });
    return [form, responsePanel];
  }
  function showRequest(entry) {
    entry.tabs.mark(language);
    entry.box.code.textContent = entry.snippets[language];
    fit(entry.box.pre);
  }
  // 언어는 화면 전체에 적용하고 기억한다. 누른 예시가 화면에서 움직이지 않게 스크롤을 맞춘다.
  function setLanguage(key, button) {
    var anchor = button && button.closest(".op");
    var before = anchor ? anchor.getBoundingClientRect().top : 0;
    language = key;
    try { localStorage.setItem(LANGUAGE_KEY, key); } catch (e) {}
    requests.forEach(showRequest);
    if (anchor) {
      var shift = anchor.getBoundingClientRect().top - before;
      if (Math.abs(shift) > 0.5) window.scrollBy({ top: shift, behavior: "instant" });
    }
  }

  function codePanel(spec, ctx, path, method, op, id, auth) {
    var requestTitle = id + "-request";
    var request = {
      snippets: requestSnippets(ctx.base, path, method, op, auth),
      box: codeBox(op.summary + " 요청 예시"),
      tabs: tabs(id + "-lang", requestTitle, LANGUAGES, setLanguage),
    };
    add(request.tabs.panel, request.box.pre);
    requests.push(request);
    showRequest(request);

    var responseTitle = id + "-response";
    var statuses = Object.keys(op.responses || {});
    var current = statuses.filter(function (code) { return Number(code) < 300; })[0] || statuses[0];
    var response = codeBox(op.summary + " 응답 예시");
    var caption = h("p", { class: "code-caption" });
    var responseTabs = tabs(id + "-status", responseTitle,
      statuses.map(function (code) { return { key: code, label: code }; }),
      function (key) { current = key; showResponse(); }, "status-tabs");
    var shown = null;
    function showResponse() {
      responseTabs.mark(current);
      shown = responseExample(spec, ctx, op, current);
      caption.replaceChildren(
        h("span", { class: "code-status " + statusClass(current) }, current),
        h("span", null, inline(shown.caption || "")));
      if (shown.type) caption.append(h("span", { class: "media" }, shown.type));
      response.code.textContent = shown.text;
      fit(response.pre);
    }
    add(responseTabs.panel, [caption, response.pre]);
    showResponse();

    return h("div", { id: id + "-examples", role: "tabpanel", class: "workspace-pane" },
      h("div", { class: "code-block request" },
        h("div", { class: "code-head" },
          h("h4", { id: requestTitle }, "요청 예시"),
          copyButton(function () { return request.snippets[language]; }, "요청 예시")),
        request.tabs.list,
        request.tabs.panel,
        h("p", { class: "code-note" }, inline(CREDENTIAL_NOTES[auth]))),
      h("div", { class: "code-block response" },
        h("div", { class: "code-head" },
          h("h4", { id: responseTitle }, "응답 예시"),
          copyButton(function () { return shown ? shown.text : ""; }, "응답 예시")),
        responseTabs.list,
        responseTabs.panel));
  }

  function operationPanel(spec, ctx, path, method, op, id, auth) {
    var examples = codePanel(spec, ctx, path, method, op, id, auth);
    var keySlot = auth === "key" ? h("div") : null;
    var runner = h("div", { id: id + "-run", role: "tabpanel", class: "workspace-pane" },
      requestRunner(ctx, path, method, op, id, auth, keySlot));
    var modes = tabs(id + "-mode", id + "-title", [
      { key: "examples", label: "코드 예시", panel: examples },
      { key: "run", label: "직접 실행", panel: runner },
    ], select, "workspace-tabs");
    var workspace = h("div", { class: "op-code" }, modes.list, examples, runner);
    function showMode(mode) {
      modes.mark(mode);
      workspace.dataset.mode = mode;
    }
    function closeRunner() { showMode("examples"); }
    function select(mode) {
      if (workspace.dataset.mode === mode) return;
      var before = workspace.getBoundingClientRect().top;
      if (mode === "run") {
        if (ctx.closeRunner) ctx.closeRunner();
        // 한 번 입력한 연동 키를 현재 실행 탭에서 쓴다.
        if (keySlot) keySlot.replaceChildren(ctx.keyField.element);
        ctx.closeRunner = closeRunner;
      } else ctx.closeRunner = null;
      showMode(mode);
      var shift = workspace.getBoundingClientRect().top - before;
      if (Math.abs(shift) > 0.5) window.scrollBy({ top: shift, behavior: "instant" });
    }
    showMode("examples");
    return workspace;
  }

  // 좁은 화면에서 경로를 "/" 뒤에서 줄바꿈한다.
  function pathParts(path) {
    return path.split("/").map(function (part, i) {
      return i ? [h("wbr"), "/" + part] : part;
    });
  }
  function authBadge(auth) {
    return h("span", { class: "badge auth" },
      h("span", { class: "sr-only" }, "인증: "),
      auth === "open" ? null : icon("lock"),
      AUTH_LABELS[auth]);
  }

  function operationView(spec, ctx, item) {
    var op = item.op;
    var path = item.path;
    var method = item.method;
    var id = "op-" + op.operationId;
    var auth = authOf(op);
    var params = op.parameters || [];
    var body = op.requestBody && media(op.requestBody);
    return h("section", { class: "op", id: id, "aria-labelledby": id + "-title", "data-spy": "" },
      h("div", { class: "op-main" },
        h("div", { class: "op-head" },
          h("span", { class: "method " + method.toLowerCase() }, method.toUpperCase()),
          h("code", { class: "path" }, pathParts(path))),
        h("div", { class: "op-title" },
          h("h3", { id: id + "-title" }, h("a", { href: "#" + id }, op.summary || path)),
          authBadge(auth)),
        op.description ? h("p", { class: "desc" }, inline(op.description)) : null,
        h("dl", { class: "meta" },
          h("div", null, h("dt", null, "operationId"), h("dd", null, h("code", null, op.operationId)))),
        params.length
          ? h("div", { class: "block" }, h("h4", null, "경로 값"),
              h("ul", { class: "fields" }, params.map(function (p) {
                return h("li", { class: "field" },
                  h("div", { class: "field-head" },
                    h("code", { class: "field-name" }, p.name),
                    h("span", { class: "type" }, typeLabel(spec, p.schema)),
                    h("span", { class: p.required ? "badge req" : "badge" }, p.required ? "필수" : "선택")),
                  p.description ? h("p", { class: "field-desc" }, inline(p.description)) : null,
                  rulesView(spec, p.schema),
                  p.example !== undefined ? h("div", { class: "rules" }, h("div", null, "예: ", h("code", null, String(p.example)))) : null);
              })))
          : null,
        body
          ? h("div", { class: "block" }, h("h4", null, "요청 본문 · " + body.type), schemaView(spec, body.schema, []))
          : null,
        responsesView(spec, op)),
      operationPanel(spec, ctx, path, method, op, id, auth));
  }

  function tagView(spec, ctx, group, i) {
    var id = "tag-" + i;
    return h("section", { class: "tag", id: id, "aria-labelledby": id + "-title", "data-spy": "" },
      h("h2", { id: id + "-title" }, group.tag.name),
      group.tag.description ? h("p", null, inline(group.tag.description)) : null,
      h("ul", { class: "op-index", "aria-label": group.tag.name + " API 목록" }, group.ops.map(function (item) {
        return h("li", null, h("a", { href: "#op-" + item.op.operationId, class: "jump" },
          h("span", { class: "method " + item.method.toLowerCase() }, item.method.toUpperCase()),
          h("span", { class: "op-index-text" },
            h("span", { class: "op-index-summary" }, item.op.summary),
            h("code", { class: "op-index-path" }, pathParts(item.path))),
          authBadge(authOf(item.op))));
      })),
      group.ops.map(function (item) { return operationView(spec, ctx, item); }));
  }

  // 표 하나. rows의 행마다 cells를 칸으로 둔다. head번째 칸이 행 제목(th)이다.
  // groups를 주면 묶음마다 tbody를 만들고, 묶음 머리 행(group)을 먼저 둔다.
  function table(caption, headers, rows, head, groups) {
    head = head || 0;
    function row(item) {
      return h("tr", { role: "row", id: item.id }, item.cells.map(function (cell, i) {
        if (i === head) return h("th", { scope: "row", role: "rowheader" }, cell);
        return h("td", { role: "cell" }, h("span", { class: "cell-label", "aria-hidden": "true" }, headers[i]), cell);
      }));
    }
    var bodies = (groups || [{ rows: rows }]).map(function (group) {
      return h("tbody", { role: "rowgroup" },
        group.head
          ? h("tr", { role: "row", class: "group", id: group.id },
              h("th", { scope: "rowgroup", role: "rowheader", colspan: headers.length }, group.head))
          : null,
        group.rows.map(row));
    });
    return h("div", { class: "table-wrap" },
      h("table", { class: "codes", role: "table" },
        h("caption", { class: "sr-only" }, caption),
        h("thead", { role: "rowgroup" },
          h("tr", { role: "row" }, headers.map(function (name) {
            return h("th", { scope: "col", role: "columnheader" }, name);
          }))),
        bodies));
  }
  function statusBadges(list) {
    return h("span", { class: "statuses" }, list.map(function (status) {
      return h("span", { class: "code-status " + statusClass(status) }, String(status));
    }));
  }
  // 오류 코드 표: type마다 묶는다. 묶음 머리에 type, HTTP 상태, 뜻, 다음 행동을, 행마다 code를 둔다.
  function errorCodesView(types, codes, ledger) {
    var groups = types.map(function (item) {
      return {
        id: "type-" + item.type,
        head: [
          h("span", { class: "group-head" }, h("code", null, item.type), statusBadges(item.status || [])),
          h("p", { class: "group-text" }, inline(item.meaning)),
          h("p", { class: "group-text" }, inline("다음 행동: " + item.action)),
        ],
        rows: codes.filter(function (code) { return code.type === item.type; }).map(function (code) {
          return {
            id: "code-" + code.code,
            cells: [
              h("span", { class: "code-cell" }, h("code", null, code.code), code.common ? h("span", { class: "badge" }, "공통") : null),
              statusBadges([code.status]),
              inline(code.description),
              code.message,
            ],
          };
        }),
      };
    }).filter(function (group) { return group.rows.length; });
    return h("section", { class: "tag codes-section", id: "error-codes", "aria-labelledby": "error-codes-title", "data-spy": "" },
      h("h2", { id: "error-codes-title" }, "오류 코드"),
      h("p", null, inline("모든 오류 응답에 " + tick("type") + "과 " + tick("code") + "가 있습니다. " + tick("type") + "은 오류의 종류이고 HTTP 상태를 정합니다. 연동 앱은 " + tick("type") + "으로 처리 방법을 고르고, 더 자세히 나눌 때 " + tick("code") + "를 씁니다. 원장이 거절하면 " + tick("ledgerError") + "도 옵니다.")),
      h("p", null, inline("경로마다 생길 수 있는 " + tick("code") + "는 그 경로의 “이 API의 오류”에 있습니다. 공통 표시가 있는 " + tick("code") + "는 인증, 형식, 요청 한도, 저장소처럼 여러 경로에 같은 오류입니다.")),
      h("h3", { id: "error-codes-code" }, h("code", null, "type"), "과 ", h("code", null, "code")),
      table("type별 code 목록", ["code", "HTTP 상태", "설명", "메시지"], null, 0, groups),
      ledger.length
        ? [
            h("h3", { id: "error-codes-ledger" }, h("code", null, "ledgerError")),
            h("p", null, inline(tick("type") + "이 " + tick("rejected") + "일 때 원장 오류 이름입니다. 원장이 이름을 알리지 않으면 이 필드가 없고 " + tick("code") + "는 " + tick("LEDGER_REJECTED") + "입니다.")),
            table("ledgerError 목록", ["ledgerError", "code", "뜻과 다음 행동"], ledger.map(function (item) {
              return {
                id: "ledger-" + item.name,
                cells: [h("code", null, item.name), item.code ? codeLink(item.code) : "—", inline(item.meaning)],
              };
            })),
          ]
        : null);
  }

  function overview(base, parts, hasErrorCodes) {
    var actions = document.getElementById("overview-actions");
    var start = targets.listRules ? h("a", { href: targets.listRules, class: "try-send" }, "첫 요청 실행") : null;
    if (start) start.addEventListener("click", function (e) {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      var tab = document.getElementById("op-listRules-mode-run");
      if (tab) tab.click();
    });
    add(actions, [start, hasErrorCodes ? h("a", { href: "#error-codes", class: "jump" }, "오류 코드") : null]);

    var byTitle = {};
    parts.slice(1).forEach(function (part) { byTitle[part.title] = part.text; });
    var connection = h("div", { class: "overview-connection" },
      h("section", null, h("h2", null, "기본 주소"),
        h("div", { class: "overview-address" }, h("code", null, base), copyButton(function () { return base; }, "기본 주소")),
        blocks(byTitle["기본 주소"])),
      h("section", null, h("h2", null, "API 키"), blocks(byTitle["API 키"])));
    var workflow = h("section", null, h("h2", null, "연동 순서"), blocks(byTitle["연동 순서"]));
    var details = h("details", { class: "overview-details" }, h("summary", null, "샌드박스 조건과 값 형식"),
      ["샌드박스 조건", "값 형식"].map(function (title) {
        return h("section", null, h("h2", null, title), blocks(byTitle[title]));
      }));
    document.getElementById("intro").replaceChildren(connection, workflow, details);
  }

  // ── 목차 검색 ───────────────────────────────────────────────
  function visibleLinks() {
    return Array.prototype.filter.call(toc.querySelectorAll("li a"), function (a) {
      return !a.parentNode.hidden && !a.closest(".toc-group").hidden;
    });
  }
  var announce;
  function filter() {
    var words = searchInput.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    var count = 0;
    Array.prototype.forEach.call(toc.querySelectorAll(".toc-group"), function (group) {
      var shown = 0;
      Array.prototype.forEach.call(group.querySelectorAll("li"), function (li) {
        var text = li.getAttribute("data-search") || "";
        var match = words.every(function (word) { return text.indexOf(word) >= 0; });
        li.hidden = !match;
        if (match) shown++;
      });
      group.hidden = !shown;
      count += shown;
    });
    if (words.length && !wide.matches) tocWrap.open = true;
    clearTimeout(announce);
    // 화면 낭독기가 글자마다 읽지 않게 잠시 기다렸다가 결과 수를 바꾼다.
    announce = setTimeout(function () {
      searchStatus.textContent = !words.length ? "" : count ? "검색 결과 " + count + "개" : "맞는 항목이 없습니다.";
    }, 250);
  }
  function focusSearch() {
    searchInput.focus();
    searchInput.select();
  }
  searchInput.addEventListener("input", filter);
  searchInput.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && searchInput.value) {
      e.preventDefault();
      searchInput.value = "";
      filter();
    } else if (e.key === "Enter" || e.key === "ArrowDown") {
      var first = visibleLinks()[0];
      if (!first) return;
      e.preventDefault();
      if (e.key === "Enter") first.click();
      else first.focus();
    }
  });
  document.addEventListener("keydown", function (e) {
    var t = e.target;
    var typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      focusSearch();
    } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      focusSearch();
    }
  });

  // 목차와 분류 목록의 링크는 이동한 뒤 그 제목에 초점을 옮긴다. 좁은 화면에서는 목차를 닫는다.
  function jump(e) {
    var link = e.target.closest && e.target.closest("a[href^='#']");
    if (!link || !(toc.contains(link) || link.classList.contains("jump"))) return;
    if (toc.contains(link) && !wide.matches) tocWrap.open = false;
    var target = document.getElementById(decodeURIComponent(link.getAttribute("href").slice(1)));
    var heading = target && (target.matches("h1, h2, h3") ? target : target.querySelector("h1, h2, h3"));
    if (!heading) return;
    heading.tabIndex = -1;
    setTimeout(function () { heading.focus({ preventScroll: true }); }, 0);
  }
  document.addEventListener("click", jump);

  // 지금 읽는 항목을 목차에 표시한다. 목차가 스크롤되면 그 항목이 보이게 한다.
  // 화면 위쪽 띠에 걸친 항목 가운데 문서에서 가장 뒤의 것이다. 분류 안의 경로가 분류보다 뒤에 있다.
  function spy() {
    if (!("IntersectionObserver" in window)) return;
    var items = Array.prototype.slice.call(document.querySelectorAll("[data-spy]"));
    var linkFor = {};
    Array.prototype.forEach.call(toc.querySelectorAll("li a, .toc-title a"), function (a) {
      var id = decodeURIComponent(a.getAttribute("href").slice(1));
      if (!linkFor[id]) linkFor[id] = a;
    });
    var seen = {};
    var current = null;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { seen[entry.target.id] = entry.isIntersecting; });
      var pick = items.filter(function (el) { return seen[el.id]; }).pop();
      if (!pick || pick.id === current) return;
      if (current && linkFor[current]) linkFor[current].removeAttribute("aria-current");
      current = pick.id;
      var link = linkFor[current];
      if (!link) return;
      link.setAttribute("aria-current", "true");
      if (!wide.matches || nav.contains(document.activeElement) || !link.offsetParent) return;
      var box = nav.getBoundingClientRect();
      var spot = link.getBoundingClientRect();
      if (spot.top < box.top + 96 || spot.bottom > box.bottom - 24)
        nav.scrollTop += spot.top - (box.top + box.height / 2);
    }, { rootMargin: "-16px 0px -65% 0px" });
    items.forEach(function (el) { observer.observe(el); });
  }

  function render(spec) {
    var base = new URL((spec.servers && spec.servers[0] && spec.servers[0].url) || "/", location.href).href.replace(/\/$/, "");
    var info = spec.info || {};
    var parts = sections(info.description);
    var types = spec["x-error-types"] || [];
    var codes = spec["x-error-codes"] || [];
    var ledger = spec["x-ledger-errors"] || [];

    var groups = (spec.tags || []).map(function (tag) { return { tag: tag, ops: [] }; });
    var keyInput = h("input", { type: "password", autocomplete: "off", required: true,
      placeholder: "fvk_…", spellcheck: "false", autocapitalize: "off" });
    var ctx = { base: base, patterns: {}, closeRunner: null,
      keyField: runnerField("request-key", "연동 API 키", keyInput, "이 페이지에서만 사용합니다.") };
    Object.keys(spec.paths || {}).forEach(function (path) {
      Object.keys(spec.paths[path]).forEach(function (method) {
        var op = spec.paths[path][method];
        var name = (op.tags || [])[0];
        var group = groups.filter(function (g) { return g.tag.name === name; })[0];
        if (!group) { group = { tag: { name: name || "기타" }, ops: [] }; groups.push(group); }
        group.ops.push({ path: path, method: method, op: op });
        targets[op.operationId] = "#op-" + op.operationId;
        // 경로 값 예시는 같은 형식의 응답 필드에도 쓴다(판매 ID, 고객 번호, API 키 ID).
        (op.parameters || []).forEach(function (p) {
          if (p.schema && p.schema.pattern && p.example !== undefined) ctx.patterns[p.schema.pattern] = String(p.example);
        });
      });
    });
    groups = groups.filter(function (g) { return g.ops.length; });
    hasCodes = codes.length > 0;
    types.forEach(function (item) { targets[item.type] = "#type-" + item.type; });
    codes.forEach(function (item, i) {
      targets[item.code] = "#code-" + item.code;
      catalog[item.code] = item;
      codeOrder[item.code] = i;
    });
    ledger.forEach(function (item) { targets[item.name] = "#ledger-" + item.name; });

    var lead = document.getElementById("lead");
    lead.replaceChildren.apply(lead, inline(parts[0].text));
    document.getElementById("version").textContent = info.version || "";
    overview(base, parts, hasCodes);

    var guide = [h("li", { "data-search": "개요" }, h("a", { href: "#overview" }, "개요"))];
    if (codes.length) guide.push(h("li", { "data-search": "오류 코드 type code ledgererror" }, h("a", { href: "#error-codes" }, "오류 코드")));
    toc.replaceChildren.apply(toc, [
      h("div", { class: "toc-group" }, h("ul", null, guide)),
    ].concat(groups.map(function (g, i) {
      return h("div", { class: "toc-group" },
        h("p", { class: "toc-title", id: "toc-" + i }, h("a", { href: "#tag-" + i }, g.tag.name)),
        h("ul", { "aria-labelledby": "toc-" + i }, g.ops.map(function (item) {
          var text = [item.method, item.path, item.op.summary, item.op.operationId].join(" ").toLowerCase();
          return h("li", { "data-search": text }, h("a", { href: "#op-" + item.op.operationId },
            h("span", { class: "method " + item.method.toLowerCase() }, item.method.toUpperCase()),
            h("span", null, item.op.summary)));
        })));
    })));

    var operations = document.getElementById("operations");
    operations.replaceChildren.apply(operations, groups.map(function (g, i) { return tagView(spec, ctx, g, i); })
      .concat(codes.length ? errorCodesView(types, codes, ledger) : []));
    statusLine.hidden = true;
    if (searchInput.value) filter();
    spy();
    if (location.hash) {
      var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) target.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }

  tocWrap.open = wide.matches;
  wide.addEventListener("change", function (e) { if (e.matches) tocWrap.open = true; });

  fetch("openapi.json", { headers: { Accept: "application/json" } })
    .then(function (response) {
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    })
    .then(render)
    .catch(function () {
      statusLine.className = "status-line error";
      statusLine.textContent = "API 문서를 불러오지 못했습니다. 잠시 뒤 새로고침하세요.";
    });
})();
`;

// 아이콘(lucide와 같은 모양). 선은 화면 기준 2px다.
const SPRITE = `<svg class="sprite" aria-hidden="true" focusable="false">
<symbol id="i-lock" viewBox="0 0 24 24"><rect width="18" height="11" x="3" y="11" rx="2" vector-effect="non-scaling-stroke"/><path d="M7 11V7a5 5 0 0 1 10 0v4" vector-effect="non-scaling-stroke"/></symbol>
<symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" vector-effect="non-scaling-stroke"/><path d="m21 21-4.3-4.3" vector-effect="non-scaling-stroke"/></symbol>
</svg>`;

/** GET /api/docs 응답 본문. */
export const DOCS_PAGE = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FINVERIC API 문서</title>
<meta name="description" content="FINVERIC 판매 기록 검증 API 참조 문서">
<style>${STYLE}</style>
</head>
<body>
${SPRITE}
<a class="skip" href="#main">본문으로 이동</a>
<div class="layout">
  <aside class="nav" aria-label="API 목차">
    <a class="brand" href="#main">
      <strong>FINVERIC</strong><span>API 문서</span><small class="badge brand-version" id="version"></small>
    </a>
    <div class="search" role="search">
      <label class="sr-only" for="search">API 검색</label>
      <div class="search-box">
        <svg class="icon" aria-hidden="true" focusable="false"><use href="#i-search"></use></svg>
        <input id="search" type="search" placeholder="API 검색" autocomplete="off" spellcheck="false"
          aria-describedby="search-hint search-status" aria-controls="toc" aria-keyshortcuts="/ Control+K Meta+K">
        <kbd aria-hidden="true">/</kbd>
      </div>
      <p class="sr-only" id="search-hint">요약, 경로, 메서드, operationId로 목차를 거릅니다. 단축키는 / 또는 Ctrl+K입니다. Esc로 지웁니다.</p>
      <p class="search-status" id="search-status" aria-live="polite"></p>
    </div>
    <details class="toc" id="toc-wrap" open>
      <summary>목차</summary>
      <nav class="toc-body" id="toc" aria-label="경로 목록"></nav>
    </details>
  </aside>
  <main id="main" tabindex="-1">
    <section id="overview" data-spy aria-labelledby="overview-title">
      <header>
        <h1 id="overview-title">FINVERIC API 문서</h1>
        <p class="lead" id="lead">판매 채널 서버의 샌드박스 연동 API입니다.</p>
        <div class="overview-actions" id="overview-actions"></div>
      </header>
      <div class="intro" id="intro"></div>
    </section>
    <p class="status-line" id="status" role="status">API 문서를 불러오고 있습니다.</p>
    <div id="operations"></div>
    <p class="sr-only" id="live" aria-live="polite"></p>
  </main>
</div>
<script>${SCRIPT}</script>
</body>
</html>
`;
