---
version: alpha
name: FINVERIC · 핀베릭
description: 진입 화면, 판매사 콘솔, 증권사 앱, 처리 로그, 감독기관 대조 화면의 디자인 기준
colors:
  background: "#F6F8FB"
  card: "#FFFFFF"
  foreground: "#182230"
  muted-foreground: "#455468"
  muted: "#EEF2F7"
  border: "#E0E6EF"
  input: "#6B7684"
  primary: "#1F5BD7"
  primary-foreground: "#FFFFFF"
  primary-hover: "#1747B2"
  ring: "#1C52BC"
  success: "#116149"
  success-surface: "#EAF6EF"
  warning: "#7A4900"
  warning-surface: "#FFF3D7"
  destructive: "#A32535"
  destructive-surface: "#FFF1F1"
  status-subscribed: "#6D28D9"
  status-subscribed-surface: "#F3EEFF"
  status-cooling: "#0E7490"
  status-cooling-surface: "#E0F5FA"
  primary-surface: "#EDF4FF"
  product-fund: "#0B777C"
  product-fund-surface: "#EAF5F5"
  product-elb: "#7566AD"
  product-elb-surface: "#F0EFFA"
  selection: "#DCE8FF"
  selection-foreground: "#173E91"
  scrollbar: "#818B99"
  method-post: "#217005"
  method-post-surface: "#EEF7E9"
  shadow: "#1822302E"
  overlay: "#18223073"
typography:
  display:
    fontFamily: "Noto Sans KR, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: 2.25rem
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: -0.02em
  page-title:
    fontFamily: "Noto Sans KR, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: 1.875rem
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: -0.02em
  title-lg:
    fontFamily: "Noto Sans KR, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: 1.5rem
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: -0.02em
  title:
    fontFamily: "Noto Sans KR, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: 1.25rem
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: -0.01em
  heading:
    fontFamily: "Noto Sans KR, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: 1.125rem
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: -0.01em
  body-lg:
    fontFamily: "Noto Sans KR, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: 1.0625rem
    fontWeight: 400
    lineHeight: 1.6
  body:
    fontFamily: "Noto Sans KR, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.6
  detail:
    fontFamily: "Noto Sans KR, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: 0.9375rem
    fontWeight: 400
    lineHeight: 1.6
  ui:
    fontFamily: "Noto Sans KR, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.6
  caption:
    fontFamily: "Noto Sans KR, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: 0.75rem
    fontWeight: 400
    lineHeight: 1.6
  identifier:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: 0.75rem
    fontWeight: 400
    lineHeight: 1.6
rounded:
  control: 10px
  surface: 16px
  action: 18px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
components:
  customer-primary-button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.action}"
    height: 56px
  customer-primary-button-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.primary-foreground}"
  console-input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    height: 44px
  risk-alert:
    backgroundColor: "{colors.warning-surface}"
    textColor: "{colors.warning}"
  status-pending:
    backgroundColor: "{colors.primary-surface}"
    textColor: "{colors.primary}"
  status-subscribed:
    backgroundColor: "{colors.status-subscribed-surface}"
    textColor: "{colors.status-subscribed}"
  status-cooling:
    backgroundColor: "{colors.status-cooling-surface}"
    textColor: "{colors.status-cooling}"
  status-confirmed:
    backgroundColor: "{colors.success-surface}"
    textColor: "{colors.success}"
  status-failed:
    backgroundColor: "{colors.destructive-surface}"
    textColor: "{colors.destructive}"
---

## Overview

서비스명은 **핀베릭(FINVERIC)**이다. 화면의 브랜드 영역에는 `FINVERIC`을 표시한다. 설명에는 `판매 기록 검증`을 쓴다.

FINVERIC 화면의 사용자는 기관이다. 판매사의 소비자보호 담당은 client 페이지(판매사 콘솔)에서 진단 기준, 상품, 판매 건, 위험 신호를 본다. 감독기관은 auditor 페이지에서 같은 판매 ID로 원본과 처리 근거를 대조한다. 고객 화면은 판매 채널(`/channel/`)에 둔다. 이 화면은 증권사 앱에서 고객이 상품을 확인하고 가입하고, 받은 증명서로 기록을 확인하는 화면을 재현한다. 화면의 업무 규칙은 [PRD](docs/prd.md)를 따른다.

화면은 밝은 배경과 짙은 글자를 공유한다. 고객의 질문과 확인 절차는 Toss를 참고한다. 상품 정보는 삼성자산운용을 참고한다. 판매사 콘솔은 Linear, 처리 로그는 Stripe, 감독기관 대조와 가입 기록 확인은 TradeTrust의 패턴을 참고한다.

### 레퍼런스 고정

정보 순서, 상태 표시, 조작 방식은 Ilbie의 커뮤니티 참고 자료인 Toss Tech Design Skill v2를 따른다. 사용자가 화면에서 먼저 할 일을 앞에 둔다. 확인에 필요한 정보는 동작 가까이에 모은다. 원장처럼 가끔 보는 기술 정보는 도움말이나 상세에 둔다. 상태는 글자와 색으로 함께 표시한다. 색, 크기, 모서리 값은 FINVERIC의 기준이며 위 YAML에서 확인한다. [Toss Tech Design Skill v2](https://github.com/Ilbie/Toss-Design-Skill/blob/af3d3dd54eab795b300967d98d64a2a94deeec86/SKILL.md), [토스 컬러 시스템](https://toss.tech/article/tds-color-system-update), [복잡한 제품의 정보 순서](https://toss.tech/article/mydoc)

기본 출처는 oh-my-design 커밋 `888d0358a4984671dfe103a22ce32a34284d77b2`의 Toss 레퍼런스다. 아카이브는 공개 자료를 바탕으로 디자인을 재구성했다. 적용 규칙은 이 파일을 기준으로 한다. 원본은 커밋으로 고정한 업스트림 링크로 확인한다. oh-my-design은 MIT 라이선스다. [업스트림 원본](https://github.com/kwakseongjae/oh-my-design/blob/888d0358a4984671dfe103a22ce32a34284d77b2/web/references/toss/DESIGN.md)

보조 레퍼런스도 같은 커밋을 쓴다. 상품 요약은 [토스증권](https://github.com/kwakseongjae/oh-my-design/blob/888d0358a4984671dfe103a22ce32a34284d77b2/web/references/toss-securities/DESIGN.md)을 참고한다. 처리 정보는 [Vercel Geist](https://github.com/kwakseongjae/oh-my-design/blob/888d0358a4984671dfe103a22ce32a34284d77b2/web/references/vercel/DESIGN.md)를 참고한다. 감독기관 조회는 [KRDS](https://github.com/kwakseongjae/oh-my-design/blob/888d0358a4984671dfe103a22ce32a34284d77b2/web/references/krds/DESIGN.md)를 참고한다.

## Colors

YAML의 색상을 [shadcn/ui 테마 변수](https://ui.shadcn.com/docs/theming)에 연결한다. 기본 동작과 링크에 파랑을 쓴다. 성공·주의·실패에는 해당 색과 상태 이름을 함께 쓴다. 얇은 구분선에는 `border`를 쓴다. 입력 테두리에는 `input`을 쓰고 키보드 포커스에는 `ring`을 쓴다.

- 판매 상태 색은 모든 페이지에서 같고 상태마다 다르다. 신청은 파랑(`primary`), 승인 대기는 주황(`warning`, 직원이 처리할 일), 숙려 중은 청록(`status-cooling`), 확인 대기는 보라(`status-subscribed`), 확정은 초록(`success`), 철회는 빨강(`destructive`), 중단은 회색(중립)이다. 진행 순서에서 이웃한 상태는 색상이 겹치지 않는다. 상태 이름에 행동 이름(청약)을 쓰지 않는다. 청약을 기록하고 최종 확인을 기다리는 상태는 확인 대기다. 숙려 대상은 숙려 중을 지나 확인 대기가 된다. 감독기관 화면은 원장 상태만 보므로 둘을 합쳐 숙려 중·확인 대기로 쓴다. 상태 필터 칩은 이 시간 순서로 둔다. 색은 늘 상태 이름과 함께 쓴다. 상태 필터 칩은 이름 앞에 같은 색 점을 둔다. 영수증 대기 같은 처리 기록의 대기는 파랑이다.
- 상태 색은 상태에만 쓴다. 종류(추가·삭제·변경, 필수·선택, GET·POST, 공개·인증)는 중립 배지와 글자로 구분한다. 삭제한 값은 취소선, 추가한 값은 굵은 글자다.
- `Badge`와 `Notice`의 `tone`은 `neutral`, `info`, `success`, `warning`, `danger`, `subscribed`, `cooling` 일곱 가지다(`apps/web/src/shared/components.tsx`의 `Tone`). `subscribed`와 `cooling`은 확인 대기와 숙려 중 상태에만 쓴다. 판매 상태의 `tone`은 `apps/web/src/shared/sales.ts`의 `STATUS_TONES`에서 가져온다. 색 이름(`blue` 등)은 쓰지 않는다.
- 선택한 행과 고른 기록은 `primary-surface` 바탕에 더해 왼쪽 3px `primary` 막대로 표시한다. 현재 메뉴도 같은 막대를 쓴다. 가로 메뉴(640px 이하)에서는 아래 막대, 증권사 앱의 탭 막대에서는 위 막대다. 색만으로 상태를 나타내지 않는다.

`primary-surface`는 선택한 행, 현재 메뉴, 파란 배지, 처리 중·대기 상자의 바탕이다. `product-fund`, `product-elb`와 각 `-surface`는 증권사 앱의 상품 유형 기호에만 쓴다. 펀드 기호는 `success`와 색상이 겹치지 않는 청록이다. ELS 기호는 `primary`를 쓴다. `selection`은 끌어서 고른 글자, `scrollbar`는 스크롤 막대에 쓴다. `scrollbar`는 `muted` 바탕에서 3:1 이상이다. `shadow`는 떠 있는 요소(콘솔의 오류 알림, 아래 동작 막대)와 표 스크롤 가장자리의 그림자, `overlay`는 확인 창 뒤의 덮개다. `method-post`와 `method-post-surface`는 API 문서의 POST 배지에만 쓴다. GET은 `primary`(파랑), POST는 `method-post`(초록)다. Stripe·Scalar 관례를 따른다. POST 초록은 `success`와 색상이 다른 연두 계열이고, 상태 배지에는 쓰지 않는다. 메서드에는 상태 색을 쓰지 않는다. 색 값은 `apps/web/src/shared/theme.css`의 `:root`에만 둔다. API 문서만 쓰는 메서드 색은 `apps/api/src/docs/page.ts`의 `:root`에 둔다.

## Typography

고객 화면 제목은 질문이나 현재 상태를 한 문장으로 쓴다. 본문과 표는 왼쪽에 정렬한다. 해시와 원장 주소에는 `identifier`를 쓴다. 블록 번호는 등폭 숫자로 정렬한다.

글자 크기는 YAML의 10단계만 쓴다. CSS 변수는 `apps/web/src/shared/theme.css`의 `--type-*`이고 단위는 rem이다. 새 크기를 만들지 않는다. 최소 크기는 12px(`caption`)다.

- 제목(h1–h3) 줄 높이는 1.3이다. 24px 이상의 큰 수치(요약 수치, 남은 시간)는 1.2다. 본문은 1.6이다. 줄 높이도 `--type-line-*` 변수만 쓴다.
- 패널 제목(h2)과 패널 안 표의 제목(`caption.tableCaption`, `apps/web/src/shared`)은 같은 크기(`title`, 20px)다. 페이지마다 제목 크기를 바꾸지 않는다.
- 알림(`Notice`)은 `detail`(15px)이다. 버튼, 메뉴, 칩, 링크 같은 조작 요소는 `ui`(14px) 이상이다. 좁은 화면에서도 글자를 줄이지 않는다.
- 값을 줄여 `title`로만 전체를 보여 주지 않는다. 터치와 키보드로는 `title`을 볼 수 없다. 해시와 ID는 전체를 `code`로 쓰고 줄을 바꾼다. 같은 화면이나 링크한 화면에 전체 값이 있을 때만 `short()`로 줄인다.
- 제목 자간은 24px 이상에서 -0.02em이고, 그보다 작으면 -0.01em이다. 본문 자간은 0이다.
- 640px 이하에서 입력 글자는 16px다. iOS Safari가 입력할 때 화면을 확대하지 않게 한다.
- 제목은 `text-wrap: balance`, 문단은 `text-wrap: pretty`를 쓴다. 문단 폭은 72ch까지다.
- 바뀌는 수치(남은 시간, 요약 수치, 금액, 블록 번호)는 등폭 숫자(`tabular-nums`)로 쓴다. 배지와 단계 표시는 줄을 바꾸지 않는다.
- 숫자와 단위는 한 덩어리로 읽힌다. 단위를 숫자 아래 줄에 두지 않는다. "2건", "3회", "1명", "60초", "10,000,000원", "100%"처럼 쓴다. 건수는 `toLocaleString("ko-KR")`로 쓴다. 한 개념에는 한 단위만 쓴다(고객 가명 ID는 "명", 버전은 "개 버전").
- 요약 수치(큰 숫자)는 `Stat`을 쓴다. 단위는 같은 기준선에 작고 옅게 붙인다. 아래 작은 줄(`note`)에는 내역이나 기준만 쓰고 단위만 쓰지 않는다. 다른 화면으로 가는 카드는 `to`로 오른쪽 위에 이동 표시를 붙인다.
- 비율은 감독기관의 비율 줄 하나로 쓴다. 이름, 큰 백분율, 막대, 한 줄 근거(분모와 분자의 건수)다(`apps/web/src/auditor/components.tsx`의 `Ratio`).
- 시각은 표, 타임라인, 처리 기록 모두 본문 글꼴의 등폭 숫자로 쓴다. 고정폭 글꼴(`identifier`)은 해시, 주소, ID에만 쓴다.
- 버전("v1")은 배지가 아니라 글자다. 이름 옆에 붙으면 옅은 글자, 버전 목록의 항목 이름이면 굵은 글자다.
- 날짜와 시각은 `apps/web/src/shared/format.ts`의 `dateTime` 하나로 쓴다. 한국 시간(Asia/Seoul), 연도 포함, 24시간제다. 예: `2026. 11. 13. 15:04:05`.
- 글꼴은 시스템 한글 글꼴이다. 웹 글꼴을 내려받지 않는다. 가짜 기울임만 막는다(`font-synthesis-style: none`). 글자 다듬기는 `antialiased`다.
- 브랜드 글자(`FINVERIC`)는 굵기 800, 자간 -0.01em이다. 진입 화면, 사이드 메뉴, API 문서가 같다.
- API 문서(`apps/api/src/docs/page.ts`)는 `theme.css`를 가져올 수 없다. 같은 `--type-*` 값을 그 파일의 `:root`에 옮겨 둔다. 토큰을 바꾸면 두 곳을 함께 고친다.
- Tailwind 이름(`--text-*`, `--font-*`, `--leading-*`, `--tracking-*`)은 변수 이름에 쓰지 않는다. `theme.css`가 tailwindcss를 가져오기 때문이다.

## Layout

- 웹은 페이지 네 개다. 진입 화면(`/`)은 서비스 제목과 역할 카드 2개(판매사 콘솔, 감독기관)를 먼저 보여 준다. 카드 전체를 선택하면 해당 화면이 열린다. API 문서, 증권사 앱, 연결된 원장 상태는 그 아래에 둔다. [결정 기록](docs/adr/0006-seller-console-and-single-web-app.md), [0007](docs/adr/0007-openapi-and-channel-sample-app.md)
- client의 메뉴는 판매사 업무만 둔다. 대시보드, 진단 기준, 상품 관리, 판매·검토, 위험 신호, 처리 기록, API 키다. 첫 화면은 대시보드다.
- 사이드바 하단에는 다른 페이지로 가는 링크만 둔다. **처음 화면**은 같은 탭으로, **증권사 앱**과 **API 문서**는 새 탭으로 연다. 새 탭 링크에는 바깥 링크 아이콘을 붙인다. 사이드바에 설명 문장을 두지 않는다.
- client와 auditor는 서로 링크하지 않는다. 사이드 메뉴의 브랜드(`FINVERIC`)와 "처음 화면" 항목이 같은 탭에서 진입 화면으로 간다.
- auditor의 메뉴는 대시보드, 분쟁 조회, 기준 감사, 상품 감사, 위험 신호, 보고서다. 첫 화면은 대시보드다. 모든 자료는 지정 RPC의 원장에서 읽는다. 좁은 화면에서는 같은 메뉴를 상단에 배치한다.
- 판매사와 감독기관의 본문은 `background`, 사이드 메뉴와 카드는 `card`를 쓴다.
- 기관과 증권사 앱은 메뉴나 탭 이름을 본문 제목으로 쓴다. 상세 화면은 항목 이름이나 상세 화면 이름을 제목으로 쓴다. 네트워크 배지와 화면 동작은 제목 오른쪽에 둔다. 감독기관은 그 위치에 원장 조회 정보와 다시 읽기를 둔다. 한 줄에 담기 어려우면 도구를 아래 줄 오른쪽에 둔다.
- 모든 페이지는 같은 토큰과 컴포넌트를 쓴다. 공통 요소는 `apps/web/src/shared`에 둔다.
- 사이드바는 화면 높이에 맞추고, 메뉴가 길면 사이드바 안에서 스크롤한다. 가로로 스크롤하는 표의 설명 문장은 표 위 문단(`tableNote`)에 두고, `<caption>`에는 화면 낭독기용 짧은 제목만 둔다.
- 640px 이하에서 사이드 메뉴는 위쪽 가로 메뉴가 된다. 메뉴는 화면 끝까지 넓히고 뒤쪽 끝을 흐리게 한다. 경로가 바뀌면 현재 항목을 보이는 곳으로 스크롤한다. 아래쪽 링크는 DOM 순서대로 메뉴 아래 줄에 둔다.
- 가로로 스크롤하는 표는 `TableScroll`(`apps/web/src/shared`)에 넣는다. 가려진 내용이 있는 가장자리에 그림자를 그린다. 표가 넘칠 때만 이름이 있는 영역이 되고 Tab 초점을 받는다. 초점을 옮긴 뒤 화살표로 스크롤한다.
- 위험 신호 화면의 조회 안내와 선택한 신호 조건은 필터 바로 아래에 둔다.
- 표는 1440×900에서 패널 안에 들어가야 한다. 옆으로 스크롤하지 않는다. 열이 다섯 개 이상이거나 긴 글자 칸이 있는 표는 반쪽 열이 아니라 화면 너비의 줄에 둔다. 긴 글자 칸은 줄을 바꾼다(`wrap`, `wrapCell`). 그보다 좁은 화면에서는 `TableScroll`이 넘침을 알린다.
- 나란한 패널은 높이가 비슷한 것끼리 둔다. 한쪽이 많이 길면 긴 내용(표, 설명 카드)을 아래 화면 너비의 패널로 뺀다. 패널 사이와 그리드 안의 간격은 24px다. 패널끼리 붙지 않는다.
- 콘솔(`Shell`)의 오류 알림과 처리 중 줄은 화면을 내려도 위 16px에 붙는다. 오류 알림에는 닫기 버튼이 없다. 상태 줄(`role="status"`)은 늘 그려 둔다. 처리 중에는 처리 이름을 보인다. 회전 표시는 누른 버튼에만 둔다. 처리가 끝나면 결과 문장("API 키를 폐기했습니다.")을 화면 낭독기만 읽는다.
- 경로가 바뀌면 맨 위로 가고 화면 제목(`Heading`의 `h1`, `tabIndex=-1`)에 초점을 옮긴다. 문서 제목도 바꾼다. 콘솔은 `화면 · 판매사 콘솔 · FINVERIC`, 감독기관은 `화면 · 감독기관 · FINVERIC`, 증권사 앱은 `화면 · 증권사 이름`이다. 진입 화면의 제목은 고정이다.
- 증권사 앱(`/channel/`)은 휴대폰 앱 모양이다. 넓은 화면에서도 최대 480px 한 열을 가운데에 둔다. 좌우 여백은 24px다. 제목 오른쪽에 증권사 이름과 네트워크 배지를 표시한다. 상품 상세와 가입 기록 상세의 뒤로 가기는 제목 위 왼쪽에 둔다. 맨 아래에 탭 막대(상품, 가입, 내 가입, 기록 확인)를 둔다.
- 상품 탭은 검색, 유형 필터, 결과 수, 카드 목록 순서다. 검색과 필터를 한 영역에 둔다. 상품 카드에는 상품 유형, 위험등급, 발행사·운용사, 판매사를 표시한다. 수수료와 최대 손실은 한 영역에 나란히 둔다. 고난도 상품은 이름 앞에 `고난도 금융투자상품`을 붙인다. 상품 카드 전체를 선택하면 상세 화면을 연다. **가입하기**는 바로 가입을 시작한다. 상세 화면에서 판매대상 고객군을 확인한다.
- 고객 가입 순서는 진단(한 화면에 한 문항) → 결과 → 적합성 확인 → 핵심 설명 카드 5장 → 녹취 동의(대상만) → 청약 → 숙려 → 최종 확인 → 증명서다. 설명 카드의 첫 장은 부적합 고객 유형과 손실 사례다. 숙려 화면은 남은 시간과 위험·최대 손실을 다시 보여 준다. 청약 전에는 언제든 가입을 중단할 수 있고, 진단 회차는 원장에 남는다.
- 가입 단계 화면은 위에 단계 머리(이전, 단계와 진행률, 중단)를 고정한다. 단계가 바뀌면 화면 맨 위로 가고 새 단계 제목에 초점을 옮긴다. 주요 동작은 단계마다 하나이고 아래 동작 막대에 둔다. 보조 동작은 본문 안의 외곽선 버튼으로 둔다.
- 동작 막대는 화면 높이가 넉넉할 때만 붙인다. 640px 이하·높이 560px 이상에서는 탭 막대 바로 위에 고정한다. 641px 이상·높이 481px 이상에서는 본문 끝에 두고, 스크롤하면 탭 막대 위에 붙는다(sticky). 그 밖에는 본문 끝에 둔다.
- 높이 480px 이하(가로로 든 휴대폰, 400% 확대)에서는 단계 머리, 동작 막대, 탭 막대를 붙이지 않는다. 붙은 요소가 화면을 덮으면 본문이 보이지 않는다.
- 붙은 요소의 높이만큼 `html`에 `scroll-padding`을 둔다. 키보드로 옮긴 초점이 머리글, 동작 막대, 탭 막대 뒤에 가리지 않는다. 높이는 글자 크기 설정(rem)을 따른다(`frame.module.css`, `flow.module.css`).
- 처리 중에는 주요 버튼 안에 진행 표시를 두고 누름을 무시한다. 버튼 모양은 그대로다. 버튼 아래 한 줄에 진행 중인 처리를 적는다.
- 증권사 앱의 오류는 떠 있지 않고 화면 흐름 안에 둔다. 동작 막대가 있는 화면은 주요 버튼 아래 그 줄에 주의 아이콘과 `destructive` 글자로 쓴다(`role="alert"`). 고객이 방금 누른 곳이다. 동작 막대가 없는 화면(첫 읽기 실패 등)은 본문 맨 위에 `Notice tone="danger"`를 둔다. 아무것도 가리지 않는다.
- 중단, 청약 철회, 다른 상품의 청약 전 가입을 버리는 시작은 가운데 확인 창으로 묻는다. 안전한 선택을 주요 버튼으로 두고 초점을 준다. 버튼을 누르면 창을 먼저 닫고 처리한다. 초점이 창을 연 버튼으로 돌아간다. 탭 이동은 묻지 않고 진행 단계를 그대로 둔다.
- 관리자 승인을 기다리는 청약 단계는 파란 안내 상자와 진행 표시를 보여 준다. 진행 표시는 상자에만 둔다. 주요 버튼은 흐린 모양으로 막아 둔다. 승인되면 새로 고침 없이 **청약하기**가 열린다. 고객이 직접 눌러야 청약한다.
- 판매사 대시보드는 요약 수치 4개(진행 중·숙려 중 청약, 가입 확정, 관리자 승인 대기, 위험 신호), 최근 판매 건, 적용 기준을 보여 준다. 감독기관 대시보드는 상태별 판매 건 수, 진단 회차, 고객 가명 ID 수, 상품·위험등급별 분포, 재진단·부적합 비율, 최근 원장 이벤트를 보여 준다. 판매·검토 목록은 상태별 판매 건을 보여 준다. 판매사 대시보드와 판매·검토 목록에서 판매 건의 행을 선택하면 상세 화면으로 간다. 상세 화면에서 진단 회차, 관리자 승인, 타임라인을 본다. 처리 기록는 같은 판매 ID의 로그 목록과 상세 응답을 나란히 둔다. 분쟁 조회는 판매 ID나 고객 가명 ID로 찾는 영역과 항목별 결과를 보여 준다. 원장만 대조한 결과와 제출 자료를 넣은 결과를 따로 표시한다. 좁은 화면에서는 영역을 위아래로 배치한다.
- 기록 확인 탭의 결과는 `일치`, `불일치`, `기록 없음` 세 상태만 쓴다. 블록체인 용어를 숨기고, 블록 번호와 해시는 "기술 정보 보기"에 접어 둔다. 불일치는 주황색 경고 색과 아이콘, 글자로 함께 표시한다.

## Elevation & Depth

여백과 얇은 구분선으로 영역을 나눈다. 상태 표시는 글자와 옅은 배경을 쓴다. 원장 조회 정보 도움말처럼 본문 위에 뜨는 요소에는 `shadow`를 쓴다.

## Shapes

반경은 세 단계다. CSS 변수는 `--rounded-control`, `--rounded-surface`, `--rounded-action`이다(`theme.css`).

- `control`(10px): 버튼, 입력, 칩, 메뉴 항목, 파일 선택 버튼, 패널 안의 작은 상자(알림, 설명 카드, 편집 묶음).
- `surface`(16px): 패널, 카드, 요약 수치 카드. 증권사 앱의 상품 카드, 기록 확인 카드, 가입 기록 카드, 증명서도 같다.
- `action`(18px): 고객 화면의 주요 버튼(`Button size="large"`)과 확인 창.
- 배지와 상태 표시는 5px 하나를 쓴다. API 문서의 메서드, 상태 코드 배지도 같다.
- 떠 있는 상자의 바깥 반경은 안쪽 반경 + 안쪽 여백 + 테두리다(콘솔의 오류 알림).

모바일 선택 영역의 높이는 최소 44px로 잡는다.

## Interaction

- hover 스타일은 `@media (hover: hover)` 안에만 둔다. 터치 기기에서 누른 뒤 hover가 남지 않는다.
- 버튼(`apps/web/src/shared/button.tsx`)은 누를 수 없는 상태가 세 가지다.
  - 처리 중(`busy`): `aria-busy`와 `aria-disabled`를 단다. 모양은 그대로 두고 안에 회전 표시를 넣는다. 커서는 `progress`다.
  - 아직 누를 수 없음(`blocked`): 확인란, 숙려, 승인 대기, 다른 처리 중일 때다. `aria-disabled`만 단다. `muted` 바탕, `border` 테두리, `muted-foreground` 글자다. 확인란이나 답을 기다리는 버튼은 누르면 이유를 그 입력 아래에 보이고 그 입력으로 초점을 옮긴다(`onBlockedClick`).
  - `disabled`: 정말 쓸 수 없고 초점이 그 위에 없을 때만 쓴다(예: 사용 중인 API 키가 20개). 모양은 `blocked`와 같다.
  - 누른 버튼에 네이티브 `disabled`를 쓰지 않는다. 초점이 문서 처음으로 떨어지고 Tab 순서에서 빠진다. 처리 중인 입력은 `readOnly`로 둔다.
- 오류에는 닫기 버튼을 두지 않는다. 오류는 다음 처리를 시작할 때, 경로가 바뀔 때 사라진다. 읽기 실패의 오류는 다시 읽기에 성공해도 사라진다.
- 빈 입력은 버튼을 막지 않는다. 누르면 입력 칸 아래 오류 문장(`FieldError`, `role="alert"`)으로 알리고 그 입력으로 초점을 옮긴다. 입력 칸에는 `aria-invalid`와 `aria-describedby`를 단다.
- 상세로 가거나 대조 대상을 고르는 표는 행 전체가 선택 영역이다. 행 끝 화살표와 키보드 초점 테두리로 이동 동작을 알린다. 판매 ID는 다른 칸과 같은 글자색으로 표시한다.
- 분쟁 조회의 선택 목록에서 판매 건은 상품명, 판매 ID, 상태를 함께 보여 준다. 화살표 키로 목록을 이동하고 Enter로 선택한다. Esc로 닫으면 선택을 연 버튼으로 초점이 돌아간다.
- 판매 건 상세와 판매 상품 상세의 목록 버튼은 제목 위 왼쪽에 둔다.
- 감독기관에서 원장을 읽는 동안 상단의 다시 읽기 버튼 안에 회전 표시를 둔다. 도움말 아이콘은 마지막 조회 블록과 한국 시간으로 환산한 조회 시각을 보여 준다. 마우스를 올리거나 키보드 초점을 옮기거나 터치하면 열리고, Esc를 누르거나 바깥을 누르면 닫힌다.
- 판매사 콘솔의 대시보드, 판매·검토, 판매 건 상세, 위험 신호, 판매 상품 목록과 상세는 처음 자료를 읽는 동안 표와 패널 모양의 스켈레톤을 표시한다.
- 감독기관은 원장을 처음 읽는 동안 패널에 스켈레톤을 표시한다. 증권사 앱 상품 탭은 상품을 처음 불러오는 동안 유형 칩과 카드 모양의 스켈레톤을 표시한다. 화면 낭독기에는 로딩 상태를 알린다.
- 누른 버튼이 처리 뒤에 사라지면 초점을 그 구역의 제목(`tabIndex=-1`)으로 옮긴다. 예: 관리자 승인 뒤 "관리자 승인", API 키 폐기 뒤 "발급한 키". 따로 정하지 않은 경우에는 `useFocusRescue`(`apps/web/src/shared/focus.ts`)가 화면 제목으로 옮긴다. 초점이 문서 처음(body)에 남지 않는다.
- 버튼을 누르는 동안 0.96으로 줄인다. 움직임을 줄이는 설정에서는 줄이지 않는다. 그 설정에서 회전 표시는 돌지 않고 천천히 깜박인다.
- 새 탭 링크는 바깥 링크 아이콘(14px, `aria-hidden`)과 화면 낭독기용 글자 ` (새 탭에서 열기)`(`srOnly`)를 함께 둔다. 글자는 아이콘 앞에 둔다.
- 버튼 뒤에 붙은 아이콘에는 `data-icon="end"`를 단다. 오른쪽 여백이 14px로 줄어 글자와 아이콘이 가운데에 보인다.
- 아이콘 선은 크기와 관계없이 화면 기준 2px다(`vector-effect: non-scaling-stroke`). 사이드 메뉴 아이콘은 16px다. 증권사 앱의 현재 탭 아이콘만 선이 2.5px다.
- 강제 색상 모드에서도 경계가 보이도록 확인 창과 아래 동작 막대에 투명 테두리를 둔다. 진행 막대는 시스템 색으로 그린다.

## Components

| 화면           | shadcn/ui 구성과 표시 규칙                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 상품 목록      | `Card`, `Button`, `Badge` 패턴으로 상품과 탐색 동작을 구분한다. 발행사·운용사와 판매사의 역할을 각각 표시한다.                                                                                                                                                                                                                                                                                                                     |
| 상품 수정      | 판매 상품 상세의 **상품 수정**으로 최신 설명서를 연다. **새 버전 등록**을 누르면 수정한 설명서를 원장에 등록한다. |
| 고객 가입      | 위험 안내와 부적합 안내는 `Alert`를 쓴다. 진단은 `Field`와 `RadioGroup`을 쓴다. 추가 위험 확인과 녹취 동의는 각각 `Checkbox`를 쓴다. 단계 머리는 `StepHeader`, 주요 버튼은 `PrimaryAction`, 아래 동작 막대는 `ActionBar`, 확인 창은 `ConfirmDialog`다(`apps/web/src/shared/components.tsx`). 청약과 최종 확인은 서로 다른 단계의 주요 버튼이다. 숙려 중에는 남은 시간을 표시하고, 남은 시간이 끝날 때까지 최종 확인 버튼을 막는다. |
| 진단 기준      | 버전 목록, 선택한 버전의 문항·선택지(점수, 추출 조건, 고령 표시), 점수 구간, 등급별 권유 가능 위험등급을 표로 보여 준다. 편집기는 처음 입력하거나 **원장에 등록**을 누른 뒤부터 오류를 표시한다. 미리보기에서 답을 골라 투자성향과 권유 가능 위험등급을 확인한다. 바꾼 내용이 있으면 **편집 취소** 전에 `ConfirmDialog`로 묻는다. 상품 편집기도 같다.                                                                              |
| 기준·상품 감사 | 버전마다 원장 해시와 원문으로 다시 계산한 해시를 나란히 둔다. 일치 여부를 상태 `Badge`와 글자로 표시한다. 버전 사이의 차이는 추가·삭제·변경 목록으로 보여 준다. 차이의 종류는 중립 `Badge`다.                                                                                                                                                                                                                                      |
| 처리 기록      | `Trace`에 시각, 출처, 작업 이름, 결과를 표시한다. 기록을 받으면 시간순으로 한 줄씩 추가한다. 증권사 API, 원장 상태, 거래 영수증, 컨트랙트 이벤트를 구분한다. 거래 해시는 제출 후 표시한다. 영수증을 받으면 펼쳐서 JSON을 확인할 수 있다. 대기와 거래 실행 실패는 서로 다른 상태로 표시한다.                                                                                                                                        |
| 분쟁 조회      | 조회 방법(판매 ID, 고객 가명 ID)은 칩 링크로 바꾼다. 원장의 판매 건에서 고르거나 판매 ID를 입력한다. 대조 자료는 원장만, 판매사 제출 자료, 파일 중에서 고른다. 판매 기록, 상품 설명서 버전, 진단 기준 원문, 진단 회차, 원본 답변 대조, 적합성·필수 확인, 숙려·최종 확인, 증명서 대조를 항목별로 표시한다. 거래 해시와 블록은 접어 둔다.                                                                                            |
| 선택 목록      | `SelectField`를 쓴다. 목록은 누른 칸에 붙여 열고, 선택 표시와 키보드 초점을 구분한다. 판매 건에는 상품 이름 아래에 ID와 상태를 표시한다.                                                                                                                                                                                                                                                                                           |
| 펼침 영역      | `Disclosure`를 쓴다. 제목 행 전체로 열고 닫으며 화살표 방향으로 열린 상태를 알린다.                                                                                                                                                                                                                                                                                                                                                |
| 위험 신호      | 신호 종류를 `Badge`(주의 색)와 이름으로 함께 표시한다. 종류별 필터 칩과 판매 건 목록을 둔다. 판매 건을 열면 판매·검토 화면에서 회차 이력을 본다.                                                                                                                                                                                                                                                                                   |
| 기록 확인      | 증명서 번호 `Input`, 파일 선택 두 개, `확인하기` 버튼을 한 카드에 둔다. 결과 카드는 상태 `Badge`, 제목 한 문장, 다음 행동 안내를 보여 준다.                                                                                                                                                                                                                                                                                        |
| 표의 숫자      | 건수 열은 `Count`(`apps/web/src/shared/components.tsx`)를 쓴다. 오른쪽 정렬, 등폭 숫자이고 열 제목도 같은 쪽에 맞춘다(`numeric`). 단위는 붙이지 않고 열 제목이 무엇을 센 값인지 알린다. 0은 옅게 둔다. 주의할 건수(부적합 확정, 위험 신호)는 배지가 아니라 주의 색 굵은 글자다. 금액 칸은 "원"을 붙인다. 회차("3회차")는 순서라 왼쪽에 둔다.                                                                                       |
| 필터 칩        | 건수가 있는 칩은 `FilterChip`을 쓴다. 이름 뒤에 건수를 옅은 등폭 숫자로 따로 둔다. 0건인 칩은 이름도 옅다. 고른 칩은 진한 바탕 그대로다. 판매·검토, 위험 신호(콘솔·감독기관), 처리 기록, 상품 찾기의 칩이 같은 모양이다.                                                                                                                                                                                                           |
| 배지           | 배지에는 상태 이름(확정, 중단, 일치, 원장 등록 등)만 쓴다. 건수, 점수, 회차, 버전, 시각은 배지에 넣지 않고 글자로 쓴다.                                                                                                                                                                                                                                                                                                            |

## Do's and Don'ts

- 고객 문구는 해요체로 쓴다. 가입 단계와 결과 제목에는 `가입 요청을 받았어요`, `마지막으로 가입 의사를 확인해요`, `가입이 확정됐어요`처럼 현재 상태를 적는다. 진입 화면, 판매사 콘솔, 감독기관 화면은 기관이 읽으므로 합니다체로 쓴다. 독립 검증의 검사 설명도 화면의 말투를 따른다(`verifySale`의 `voice`).
- 오류 문구는 읽는 사람에 맞추고, 원인과 다음 행동을 함께 쓴다. API 오류 문장(`error`)과 판매사 콘솔·감독기관 화면은 합니다체다. 고객 화면은 API 문장을 보여 주지 않고, 오류의 `type`(더 분명한 문장이 필요하면 `code`)으로 고른 해요체 문장을 쓴다. 고객 문장에는 원장 용어와 판매사 콘솔에서만 할 수 있는 안내를 쓰지 않는다.
- 가입 확정은 지정한 원장에서 성공 영수증, 같은 판매 ID의 이벤트, 상태를 대조한 뒤 표시한다. 결제 기록은 별도 상태로 표시한다. 단순 파일 지문 일치와 가입 조건 검증 완료를 구분한다.
- 실제 서비스 화면으로 만든다. 메뉴, 제목, 상태, 안내에는 사용자가 하는 일을 적는다. 화면 문구에 `시연`, `모의`, `테스트용`을 쓰지 않는다. 발표용 조작 버튼을 두지 않는다. 네트워크 배지(`Anvil 테스트 원장`, `Sepolia 테스트넷`)는 연결한 환경을 알리므로 표시한다. 원장에 등록한 기준·상품 이름과 설명은 대조할 수 있도록 원문을 표시한다.
- 제목 아래에는 조회 방법이나 내려받기 형식처럼 다음 행동에 필요한 안내만 둔다. 원장 연결 정보, 보고서의 대조 근거, 위험 신호 표시 기준은 펼침 영역에서 확인한다.
- 디자인 규칙을 변경할 때 이 파일과 해당 UI를 함께 수정한다. 레퍼런스 버전을 바꿀 때는 커밋 링크를 갱신한다.
