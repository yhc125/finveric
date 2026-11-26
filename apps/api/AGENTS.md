# API 작업 규칙

진입점은 두 개다. 로컬은 `src/index.ts`, Vercel 함수는 `src/vercel.ts`다. 두 곳 모두 `initialize()`를 먼저 호출한다.

## 계층

요청은 위에서 아래로만 흐른다. 아래 계층은 위 계층을 import하지 않는다. [결정 기록](../../docs/adr/0004-api-layers.md)

```
routes/        경로(컨트롤러): 요청 검사, FundService 호출
  ↓
service.ts     실행 맥락(배포 설정·역할 키·RPC·리포지토리), 시작 검사, 업무 입구
  ↓
modules/       업무 절차(서비스): 담당자별 절차
  ↓
repositories/  판매 기록 조회·추가·삭제·저장과 잠금     gateways/  원장(EVM)·증명(snarkjs) 연동
```

| 위치                          | 내용                                                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/app.ts`                  | Fastify 조립: 접근 코드와 API 키 확인, 공개 경로(`PUBLIC_PATHS`), 출처 검사, CORS, 키별 요청 한도, 오류 응답, API 문서, 경로 등록 |
| `src/routes/`                 | `system`(상태·설정·API 문서), `registry`(기준·상품), `customers`(진단·변경 시연), `sales`, `records`, `keys`(API 키)              |
| `src/docs/openapi.ts`         | `@fastify/swagger` 설정. 등록한 경로로 OpenAPI 3.1 문서를 만들고 인증·오류·응답을 더한다                                          |
| `src/docs/operations.ts`      | 경로별 operationId, 분류(태그), 요약, 설명, 성공 응답과 그 예시, 경로만의 오류 `code`(`errors`), 요청 예시                        |
| `src/docs/page.ts`            | `/api/docs` 화면. HTML·CSS·JS를 한 문자열로 둔다                                                                                  |
| `src/service.ts`              | `FundService`: 실행 맥락, 시작 검사. 업무 메서드는 모듈로 넘긴다                                                                  |
| `src/errors.ts`               | `CodedError`: 오류 응답에 `type`과 `code`를 싣는 오류. 모든 계층이 던진다. 문장은 core의 `ERROR_CODES`에 있다                     |
| `src/modules/rules.ts`        | 소비자보호 담당: 진단 기준 버전 등록과 조회, 최신 기준                                                                            |
| `src/modules/products.ts`     | 소비자보호 담당: 상품 설명서 버전 등록과 조회, 시연 기준·상품 일괄 등록                                                           |
| `src/modules/customers.ts`    | 판매 채널: 고객 가명 ID, 진단 회차(증명 생성 → 판매사 키로 기록)                                                                  |
| `src/modules/enrollment.ts`   | 판매 채널: 신청(초안), 중단, 청약, 숙려 뒤 최종 확인, 철회                                                                        |
| `src/modules/review.ts`       | 관리자 승인: 3회차 이상 진단한 고객의 청약 전 승인자 서명                                                                         |
| `src/modules/settlement.ts`   | 기존 업무 인프라: 모의 결제 기록                                                                                                  |
| `src/modules/records.ts`      | 판매 건 조회, 처리 기록, 고객 증빙(증명서·원본 묶음)                                                                              |
| `src/modules/demo.ts`         | 시연: 기록한 회차의 사후 변경 시도(시뮬레이션만)                                                                                  |
| `src/modules/keys.ts`         | 판매사 콘솔: API 키 발급·폐기, 키 확인, 마지막 사용 시각(1분 단위)                                                                |
| `src/modules/health.ts`       | 운영: RPC·원장·저장소 점검(`/api/health`, 실패 시 503)                                                                            |
| `src/modules/transactions.ts` | 원장 거래 처리: 시뮬레이션 → 제출 → 영수증 대조와 처리 기록                                                                       |
| `src/repositories/sales.ts`   | `SaleRepository`: 판매 건·진단 원본·등록 원문·처리 기록, 저장, 잠금(`transaction`, `read`)                                        |
| `src/repositories/store.ts`   | 저장 방식: 로컬 `FileStore`, Vercel `RedisStore`                                                                                  |
| `src/gateways/ledger.ts`      | 원장 읽기·시뮬레이션·쓰기·승인 서명·영수증. 판매 기록은 바꾸지 않는다                                                             |
| `src/gateways/proofs.ts`      | Groth16 증명 생성. 증명 키는 `FINVERIC_ZK_DIR`(기본 `circuits/build`)                                                             |

- 경로 파일은 Fastify 플러그인(`FastifyPluginAsync<{ service }>`)이다. `app.ts`가 `/api` 접두어로 등록한다. 경로 파일 안의 주소에는 `/api`를 쓰지 않는다. 접근 코드 검사, 직렬화, 오류 처리는 `app.ts`가 플러그인보다 먼저 등록하고, 플러그인이 물려받는다.
- 경로는 `FundService`만 부른다. 모듈·리포지토리·게이트웨이를 직접 부르지 않는다.
- 모듈은 판매 기록을 `svc.repository`로만 바꾼다. 원장과 증명은 `gateways/`로만 부른다. `svc.client`를 직접 쓰지 않는다.
- 게이트웨이와 리포지토리는 서로를, 그리고 모듈을 import하지 않는다.
- 요청 스키마와 요청·응답 타입은 `packages/core/src/api.ts`의 DTO를 쓴다. 경로에서 스키마를 새로 쓰지 않는다. 모듈 함수의 반환 타입도 DTO(`SaleView` 등)로 적는다.
- 모듈 함수는 첫 인자로 `FundService`를 받는다. 하위 계층은 `service.ts`를 타입으로만 import한다. 실행 시 순환 import를 만들지 않는다.
- 새 업무는 맞는 모듈에 넣는다. `FundService`에는 외부(경로, 테스트, 스크립트)가 부르는 메서드만 둔다.

## API 문서

- `GET /api/openapi.json`과 이를 읽는 `GET /api/docs`는 판매 채널 연동 계약을 제공한다. 전체 계약은 테스트가 프로세스 안에서 `app.internalSwagger()`로 읽는다. 두 문서 경로와 `/api/health`, `/api/config`는 접근 코드 없이 열린다(`PUBLIC_PATHS`).
- 경로·경로 값·요청 본문은 Fastify에 등록한 경로의 스키마에서 만든다. `@fastify/swagger`는 경로보다 먼저 등록한다.
- 경로를 추가하면 `src/docs/operations.ts`에 같은 키(`<METHOD> <Fastify 경로>`, 예: `POST /api/sales`)로 operationId, 태그, 요약, 설명, 성공 응답을 추가한다. 본문이 있으면 요청 예시도 넣는다. 그 경로만의 오류 `code`는 `errors`에 적는다. 빠지면 문서 생성과 `tests/openapi.test.ts`가 실패한다.
- 태그는 하는 일로 정한다. 증권사 앱이 고객 한 명을 처리할 때 부르면 `판매 채널 연동`, 판매사 직원이 콘솔에서 쓰면 `판매사 콘솔`, 상태 확인과 문서는 `시스템`이다.
- 연동 키로 부르는 판매 건 경로는 `channelSale()`로 응답을 만든다. 공개 명세는 `ChannelSale` 스키마를 쓴다. 증명서와 원본은 각각 `/export/receipt`, `/export/original`에 둔다. 원본은 대조용 경로다.
- 판매 건 동작은 동작마다 경로가 따로 있다(`/api/sales/:id/action/<동작>`). 동작마다 태그가 다르기 때문이다.
- 응답 스키마는 문서 전용이다. 경로의 `schema.response`에 넣지 않는다. 넣으면 응답 직렬화가 바뀌고, 문서 생성이 실패한다. 응답 스키마는 `packages/core/src/api.ts`에 두고 `operations.ts`에서 가리킨다.
- 경로마다 오류 응답은 `src/docs/openapi.ts`가 만든다. 경로만의 `code`(`operations.ts`의 `errors`)에 공통 오류를 더한다(`commonErrors()`). 공통 오류는 core의 `ERROR_CODES`에서 `common`인 `code`다: 형식(`INVALID_REQUEST`, POST의 `BODY_TOO_LARGE`·`UNSUPPORTED_MEDIA_TYPE`), 인증(공개 경로 밖), 출처(POST)·범위(판매 채널 연동 밖), 저장소와 `INTERNAL_ERROR`(공개 경로 밖), `RATE_LIMITED`(모든 경로). 경로에 붙인 `code` 목록은 `x-errors`다.
- 오류 응답의 상태는 그 경로의 `code`가 가진 상태다. 상태마다 설명에 `code` 목록을 적고, 예시는 그 상태에서 처음 나오는 `code`의 본문(`errorBody`)이다. `errors`의 순서로 예시를 고른다. `ROUTE_NOT_FOUND`(없는 경로)와 `API_START_FAILED`(Vercel 시작 실패)는 모든 주소의 오류라서 경로마다 적지 않는다. 오류 응답을 바꾸면 이 파일의 설명도 고친다.
- 오류 코드 표는 문서 루트의 `x-error-types`, `x-error-codes`, `x-ledger-errors`에 둔다. 공개 명세에는 연동 경로가 돌려줄 수 있는 값과 전체 경로에 공통인 오류만 싣는다.
- 문서 화면(`src/docs/page.ts`)의 구성은 다음과 같다.
  - 1200px 이상은 세 열이다: 목차 | 설명과 필드 | 요청·응답 예시. 예시 열은 화면 높이 760px 이상에서 경로를 읽는 동안 붙어 따라온다. 1200px보다 좁으면 예시를 필드 아래에 둔다. 1024px보다 좁으면 목차가 위로 간다.
  - 목차 위에 검색 칸이 있다. 요약, 경로, 메서드, operationId로 목차를 거른다. `/`나 Ctrl·⌘+K로 초점을 옮기고, Esc로 지운다. 결과 수는 화면 낭독기가 읽는다.
  - API 목록에는 메서드, 요약, 경로, 인증을 둔다. 경로 제목 옆에는 공개 또는 API 키 배지를 둔다.
  - 요청 예시는 curl, Node.js(`fetch`), Python(`requests`)이다. 고른 언어는 화면 전체에 적용하고 `localStorage`에 기억한다. 인증 헤더는 `$FINVERIC_API_KEY`를 읽는다. 본문은 `operations.ts`의 요청 예시다.
  - 응답 예시는 상태 코드마다 탭으로 보인다. 응답에 `example`이 있으면 그 값을 쓴다. 없으면 응답 스키마에서 만든다: `example`·`examples`, `enum[0]`, `const`, 형식(`date-time`)과 정규식, 경로 값 예시(같은 정규식), 배열은 항목 하나. 오류 응답은 그 경로의 대표 `code` 예시다. 만든 값이 업무와 어긋나면 `operations.ts`의 성공 응답에 `example`을 넣는다(예: `GET /api/health`의 503). 판매 건 응답은 모두 결과 상태의 예시(`SALE_EXAMPLES`)를 쓴다. 넣지 않으면 스키마의 첫 값이라 모든 판매 건이 `status: draft`로 보인다. 설명에는 `status: <값>`을 적는다.
  - 경로마다 "이 API의 오류" 표(HTTP 상태, `code`, 메시지)를 둔다. `x-errors`에서 공통이 아닌 `code`를 상태 순서로 보여 주고, 공통 오류는 표 아래 한 줄에 둔다. `code`는 오류 코드 표의 그 행으로 연결한다.
  - 오류 코드 표는 `x-error-types`, `x-error-codes`, `x-ledger-errors`로 그린다. 표 하나를 `type`으로 묶는다. 묶음 머리에 `type`, HTTP 상태, 뜻, 다음 행동을, 행마다 `code`, HTTP 상태, 설명, 메시지를 둔다. 공통 오류에는 "공통" 배지를 단다. 원장 오류 표(`ledgerError`, `code`, 뜻과 다음 행동)는 따로 둔다. 설명의 `### 오류 코드` 묶음은 화면에 따로 보이지 않는다. 설명 안의 `type`, `code`, `ledgerError`, operationId 이름은 그 항목으로 연결한다.
- 문서 화면은 외부 파일과 CDN을 쓰지 않는다. Vercel 함수 번들에 문자열로 들어간다. 색, 글자 크기(`--type-*`), 반경은 DESIGN.md 토큰을 그대로 쓴다. `apps/web/src/shared/theme.css`를 가져올 수 없으므로 값을 `STYLE`의 `:root`에 옮겨 둔다. 토큰을 바꾸면 두 곳을 함께 고친다.

## 원장 거래

- 원장 쓰기는 `transactions.send()`만 쓴다. 먼저 역할 계정으로 시뮬레이션한다. 원장이 거절하면 거래를 보내지 않고, 원장 오류 이름(예: `TooEarly`)을 처리 기록에 남긴다.
- 미확정 거래가 있으면 새 거래를 거절한다. 진단 회차 번호는 원장의 `attemptCount + 1`이다.
- 진단 원본(답변·임의값)과 등록 원문은 거래를 보내기 전에 저장한다. 원장이 거절하거나 거래가 실패하면 지운다. 영수증을 기다리는 중이면 남긴다.
- 청약 뒤 판매 건 상태는 원장에서 읽는다. 저장소에는 원장 밖의 값(초안, 승인 서명, 모의 녹취록, 진단 원본)만 둔다.
- 기준과 상품 버전 번호는 API가 원장의 다음 버전으로 정한다. 원장에는 정렬한 JSON 원문을 등록한다.

## 기록과 잠금

- 기록을 바꾸는 요청은 `service.exclusive()` 안에서 실행한다. 로컬은 프로세스 안의 큐로, Vercel은 Redis 잠금으로 한 번에 하나만 실행한다.
- 조회 요청은 `service.view()`로 감싼다. Vercel에서는 다른 인스턴스가 쓴 기록을 먼저 읽는다.
- 공유 저장소에서 `save()`는 잠금 안에서만 기록을 쓴다. 잠금 밖의 변경은 메모리에만 남는다. 조회 경로에서 반드시 저장해야 하는 상태를 만들지 않는다.
- 저장 방식은 `src/repositories/store.ts`다. 로컬은 `FileStore`, Vercel은 `RedisStore`다. Vercel에서 Redis 설정이 없으면 시작을 거절한다. 저장 방식을 바꿔도 모듈은 고치지 않는다.

## 인증과 API 키

[결정 기록](../../docs/adr/0008-api-keys.md)

- 접근 코드(`DEMO_TOKEN`)는 선택이다. 서버에 설정했을 때만 검사한다. 배포(Sepolia)도 같다. 설정하지 않으면 모든 경로를 연다. 설정하면 32자 이상이어야 하고, 판매사 콘솔과 증권사 앱 예시가 입력 칸을 보여 준다.
- API 키(`fvk_` + 32자)는 증권사 앱 서버가 쓴다. 보내면 접근 코드 설정과 관계없이 항상 확인한다. 없는 키와 폐기한 키는 401이다.
- API 키의 범위는 `src/docs/operations.ts`의 분류다. `판매 채널 연동`(`CHANNEL_TAG`) 경로만 부른다. 다른 경로는 403이다. 경로의 분류를 바꾸면 키로 부를 수 있는지도 바뀐다.
- 키 원문은 발급 응답에만 넣는다. 저장소에는 SHA-256 해시와 앞 12자만 둔다. 로그와 처리 기록에 키 원문을 넣지 않는다.
- 키 확인은 `service.authenticateApiKey()`다. 저장소를 먼저 읽어 다른 인스턴스의 발급·폐기를 반영한다. 마지막 사용 시각은 1분이 지났을 때만 잠금 안에서 쓴다.
- 요청 한도는 아는 키면 키마다, 아니면 IP마다 센다(`keyGenerator`). 메모리의 키만 보므로 저장소를 읽지 않는다.

## 오류와 비밀 값

- 응답 오류는 우리가 쓴 한국어 문장만 내보낸다. RPC와 Redis 오류에는 주소와 토큰이 들어갈 수 있다. 오류 처리기는 한글로 시작하고 `http`가 없는 문장만 그대로 내보낸다. `API 키는…`처럼 영문으로 시작하는 문장은 일반 오류 문장으로 바뀐다.
- 모든 오류 응답은 `{ error, type, code, ledgerError? }`다(`ErrorResponse`). `type`은 오류의 종류(16가지)이고 HTTP 상태를 정한다. `code`는 상황 하나를 가리키는 `UPPER_SNAKE_CASE` 값이고 바꾸지 않는다. 목록은 `packages/core/src/errors.ts`(`@finveric/core/errors`)의 `ERROR_TYPES`(상태, 뜻, 다음 행동)와 `ERROR_CODES`(`type`, 상태, 기본 문장, 문서 설명, 공통 여부)다. 이 문장을 다른 곳에 다시 쓰지 않는다. 연동 앱과 증권사 앱 예시는 `type`(필요하면 `code`)으로 고객 문장을 고른다. 판매사 콘솔은 `error`를 그대로 보여 준다.
- `error` 문장은 합니다체로 쓴다. 판매사 개발자와 콘솔 담당이 읽는다. 원인과 다음 행동을 함께 쓴다. 예: "투자성향에 맞지 않는 상품입니다. 고객에게 부적합 사실을 알리고 추가 위험 확인을 받아야 청약할 수 있습니다." 고객용 문장(해요체)은 API에 두지 않는다.
- 모듈, 리포지토리, 게이트웨이는 `CodedError(code, detail?)`(`src/errors.ts`)를 던진다. `type`과 문장은 `ERROR_CODES`에서 온다. `detail`은 기본 문장 뒤에 붙는 바뀌는 부분이다(검사 이유, 회차 번호, 빠진 기록). 오류 처리기(`app.ts`)가 `CodedError`의 본문을 그대로 응답한다.
  - 상황마다 `code`가 하나다. 예: 중단한 신청의 청약은 `SALE_ABANDONED`, 청약한 신청의 중단은 `SALE_ALREADY_SUBSCRIBED`, 없는 판매 건은 `SALE_NOT_FOUND`.
  - `pending`: 앞선 원장 거래의 영수증이 아직 없다(`TRANSACTION_PENDING`), 이번 거래의 영수증 대기(`RECEIPT_PENDING`).
  - `unavailable`: 저장소(`STORE_*`), 판매 기록과 원장의 불일치(`STORED_RECORD_MISMATCH`), 증명 생성(`PROOF_GENERATION_FAILED`), RPC(`RPC_UNAVAILABLE`), 거래 제출 실패(`TRANSACTION_NOT_SUBMITTED`), 영수증의 이벤트 누락(`RECEIPT_EVENT_MISSING`).
  - `rejected`: 원장이 거절했다(`LedgerRejection`). `code`는 `LEDGER_` + 원장 오류 이름(대문자 밑줄 표기, 예: `LEDGER_TOO_EARLY`)이고 `ledgerError`에 이름(예: `TooEarly`)을 넣는다. 이름을 모르면 `LEDGER_REJECTED`이고 `ledgerError`가 없다. 문장은 core의 `LEDGER_ERRORS`(합니다체)로 만든다.
- `code`가 없는 오류는 오류 처리기가 `INTERNAL_ERROR`로 보낸다. 우리가 쓴 문장이면 그 문장을, 아니면 `INTERNAL_ERROR`의 기본 문장을 보낸다.
- 경로 밖의 오류도 `code`를 쓴다(`errorBody`): 접근 코드 `ACCESS_CODE_INVALID`·API 키 `API_KEY_INVALID`(401), 범위 `API_KEY_SCOPE_DENIED`·출처 `ORIGIN_NOT_ALLOWED`(403), 없는 경로 `ROUTE_NOT_FOUND`(404), Fastify와 플러그인의 4xx(`INVALID_REQUEST`, `BODY_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `RATE_LIMITED`). Vercel 시작 검사 실패는 `API_START_FAILED`(503)다(`src/vercel.ts`).
- `code`를 더하거나 바꾸면 core의 `ERROR_CODES`, 그 `code`를 낼 수 있는 경로의 `errors`(`operations.ts`), 이 파일을 함께 고친다. 고객 문장이 `type` 문장보다 분명해야 하면 증권사 앱 예시의 `CUSTOMER_CODE_MESSAGES`(`apps/web/src/channel/App.tsx`)에도 더한다. `type`을 더하면 `customerMessage()`의 `type` 표에 더한다.
- HTTP 상태는 `type`으로 정한다(`errorStatus`). `ERROR_CODES`의 `status`는 `type`의 기본 상태다. 값 검사 오류(`invalid_input`)는 400, 없는 판매 건·API 키·청약 거래(`not_found`)는 404, 나머지 업무 오류와 처리 실패(`unavailable`)는 409다. 다른 상태를 쓰는 `code`는 세 개다: `BODY_TOO_LARGE` 413, `UNSUPPORTED_MEDIA_TYPE` 415, `API_START_FAILED` 503. Fastify와 플러그인이 정한 4xx(잘못된 JSON 400, 본문 초과 413, 본문 형식 415, 요청 한도 429)는 상태 코드를 유지한다. 없는 경로는 404다.
- 공개 조회와 로그에 답변·총점·임의값·고객 번호·개인키·승인 서명을 넣지 않는다. 고객은 가명 ID로만 표시한다.
- 고객 가명 ID 비밀값은 `CUSTOMER_REF_SECRET`이다. 없으면 판매사 키에서 만든다. 비밀값을 바꾸면 같은 고객의 회차가 이어지지 않는다.

## 파일과 배포

- 실행 중 읽는 파일의 경로는 `scripts/root.ts`의 `fromRoot()`로 만든다. 증명 키는 `zkPath()`로 만든다. Vercel 함수는 함수 디렉터리를 기준으로 읽는다.
- 새로 읽는 파일이 생기면 `scripts/build-vercel.mjs`에서 함수 디렉터리에 복사한다.
- 증명 키를 바꾸면 Verifier와 원장을 다시 배포한다. 키 지문이 배포 설정과 다르면 API가 시작을 거절한다.
- 한 요청은 Vercel 함수 최대 실행 시간 300초 안에 끝나야 한다. Sepolia 영수증 대기도 포함한다.

## 검사

- `tests/mvp.test.ts`: 실제 회로·EVM·API·독립 검증, 위험 신호, 공유 저장소 인스턴스, 재시작 복구.
- `tests/store.test.ts`: 잠금, 만료, 오류 노출, 출처, Vercel 주소 변환.
- `tests/openapi.test.ts`: 문서가 등록한 모든 경로를 operationId·태그로 설명하는지, 공개 경로, 문서 화면, 오류 코드 표(`x-error-types`·`x-error-codes`·`x-ledger-errors`), 경로별 오류(`x-errors`)와 예시, 성공 응답 예시(응답 스키마와 맞는지, 판매 건 예시의 `status`가 설명과 같은지), `code` 이름(하나뿐, `UPPER_SNAKE_CASE`, 공통이거나 어떤 경로의 문서에 있음), 4xx 상태 코드와 `type`·`code`.
- `tests/keys.test.ts`: API 키 발급·저장(해시만), 범위(403), 폐기(401), 개수 제한, 키별 요청 한도. 모든 응답을 문서의 응답 스키마와 대조한다.
- `tests/mvp.test.ts`는 실제 응답을 내부 계약과 대조한다(`tests/openapi-check.ts`). 계약에 없는 필드도 실패다. 오류의 `code`가 경로의 `x-errors`에 없거나 `type`·상태가 오류 코드 표와 달라도 실패다.
- 함수 번들: `NETWORK=local npm run build:vercel` 뒤 임시 디렉터리에서 로컬 Anvil로 번들 핸들러를 호출해 확인한다.
