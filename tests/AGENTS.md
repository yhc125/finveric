# 검사 작업 규칙

- 통합 검사는 빈 포트에 띄운 Anvil과 `.local/test-*` 임시 디렉터리를 쓴다. 시연용 Anvil(8545)과 `.local/`의 기록을 바꾸지 않는다.
- 증명 키는 `FINVERIC_ZK_DIR`(기본 `circuits/build`)에서 읽는다. 시연 키와 다른 키로 검사하려면 같은 변수로 `npm run zk:setup`을 먼저 실행한다.
- 실제 회로, 증명, EVM으로 검사한다. Verifier stub은 Foundry 검사에서만 쓴다.
- `mvp.test.ts`: 등록, 회차, 승인, 청약, 숙려, 독립 검증, 위험 신호, 저장소, 복구. 원장 가스 사용량을 `# gas` 진단 출력으로 남긴다.
- `openapi.test.ts`: API 문서(`/api/openapi.json`, `/api/docs`)와 등록한 경로를 대조한다. 원장 없이 실행한다. `openapi-check.ts`는 실제 응답을 문서의 응답 스키마와 대조하는 도우미다. `mvp.test.ts`가 모든 응답에 쓴다.
- `keys.test.ts`: API 키 발급, 저장, 범위, 폐기, 요청 한도. `offline-app.ts`(원장 없이 띄우는 API)를 쓴다. `openapi.test.ts`도 같은 도우미를 쓴다.
- `core.test.ts`: 기준 검사·해시·판정, 상품, 고객 가명 ID, 위험 신호, core ABI 대조. ABI 대조는 `out/`의 Foundry 산출물이 있어야 실행한다.
- `ledger-wait.test.ts`: 숙려 뒤 최종 확인 전의 블록 시각 기다리기. 가짜 RPC 클라이언트로 원장 없이 실행한다.
- 공유 저장소 검사는 `fake-upstash.ts`를 쓴다. 실제 Upstash에 연결하지 않는다.
- `npm test`는 `*.test.ts`만 실행한다. 도우미 파일에는 다른 이름을 쓴다.
