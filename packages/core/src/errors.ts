// 오류 응답의 `type`과 `code` 목록. API(apps/api), API 문서, 웹(apps/web)이 이 파일만 기준으로 쓴다.
// 문장은 판매사 개발자와 판매사 콘솔이 읽는다. 합니다체로 원인과 다음 행동을 쓴다. 고객용 문장(해요체)은 두지 않는다.
// 이 파일은 `index.ts`를 import하지 않는다. `api.ts`는 타입으로만 import한다(순환 import 방지).
import { LEDGER_ERRORS, type LedgerError } from "./abi.ts";
import type { ErrorResponse } from "./api.ts";

/**
 * 오류의 종류(`type`). 함께 오는 HTTP 상태(첫 값이 기본), 뜻(`meaning`), 다음 행동(`action`)이다.
 * 연동 앱은 `type`으로 처리 방법을 고른다. 상황 하나는 `code`(`ERROR_CODES`)가 가리킨다.
 * API 문서(`apps/api/src/docs/openapi.ts`)가 이 표를 그대로 쓴다(`x-error-types`).
 */
export const ERROR_TYPES = {
  invalid_input: {
    status: [400, 413, 415],
    meaning:
      "요청 형식이나 값이 맞지 않습니다. 400은 경로 값·본문 형식 오류와 값 검사 오류, 413은 본문 크기, 415는 본문 형식(Content-Type) 오류입니다.",
    action: "요청을 고친 뒤 다시 보냅니다.",
  },
  unauthorized: {
    status: [401],
    meaning:
      "접근 코드가 없거나 다릅니다. 또는 없는 API 키나 폐기한 API 키입니다.",
    action: "인증 헤더를 확인합니다.",
  },
  forbidden: {
    status: [403],
    meaning:
      "허용하지 않은 출처의 POST 요청입니다. 또는 API 키로 `판매 채널 연동` 밖의 경로를 불렀습니다.",
    action:
      "출처를 `WEB_ORIGIN`에 등록하거나 서버에서 부릅니다. `판매 채널 연동` 밖의 경로는 접근 코드로 부릅니다.",
  },
  not_found: {
    status: [404],
    meaning: "없는 경로이거나, 경로 값의 대상이 없습니다.",
    action: "경로와 ID를 확인합니다.",
  },
  rate_limited: {
    status: [429],
    meaning:
      "같은 API 키로, 키가 없으면 같은 IP에서 1분에 120번을 넘게 요청했습니다.",
    action: "1분 뒤 다시 요청합니다.",
  },
  not_ready: {
    status: [409],
    meaning: "진단 기준이나 상품을 아직 원장에 등록하지 않았습니다.",
    action: "판매사 콘솔에서 먼저 등록합니다.",
  },
  needs_diagnosis: {
    status: [409],
    meaning: "고객의 투자성향 진단 기록이 없습니다.",
    action: "진단을 먼저 기록합니다.",
  },
  needs_higher_risk: {
    status: [409],
    meaning: "투자성향에 맞지 않는 상품입니다.",
    action:
      "고객에게 부적합 사실을 알리고 추가 위험 확인(`higherRiskConfirmed`)을 받습니다.",
  },
  needs_approval: {
    status: [409],
    meaning: "3회차 이상 진단한 고객입니다.",
    action: "판매사 관리자 승인(`approveSale`)을 받은 뒤 청약합니다.",
  },
  needs_recording: {
    status: [409],
    meaning: "녹취 대상 상품입니다.",
    action: "고객의 녹취 동의(`recordingConsent`)를 받습니다.",
  },
  product_changed: {
    status: [409],
    meaning: "신청 뒤 상품 설명서의 새 버전이 등록됐습니다.",
    action: "이 신청을 중단하고 새 버전으로 다시 신청합니다.",
  },
  wrong_state: {
    status: [409],
    meaning: "판매 건이나 진단 회차의 현재 상태에서 할 수 없는 요청입니다.",
    action: "판매 건을 다시 읽어 상태를 확인합니다.",
  },
  limit_reached: {
    status: [409],
    meaning: "사용 중인 API 키 수가 한도에 닿았습니다.",
    action: "쓰지 않는 키를 폐기한 뒤 발급합니다.",
  },
  pending: {
    status: [409],
    meaning: "원장 거래의 영수증을 아직 받지 못했습니다.",
    action: "잠시 뒤 판매 건이나 처리 기록을 다시 읽습니다.",
  },
  unavailable: {
    status: [409, 503],
    meaning:
      "처리를 끝내지 못했습니다. RPC·저장소 연결 실패, 증명 생성 실패, 판매 기록과 원장의 불일치를 포함합니다. 503은 Vercel 함수의 시작 검사가 실패한 경우입니다.",
    action:
      "잠시 뒤 다시 요청합니다. 계속 실패하면 `code`로 원인을 확인합니다.",
  },
  rejected: {
    status: [409],
    meaning:
      "원장이 요청을 거절했습니다. `ledgerError`에 원장 오류 이름(예: `TooEarly`)이 있습니다. 이름을 모르면 `ledgerError`가 없습니다.",
    action:
      "`ledgerError`의 다음 행동을 따릅니다. 이름이 없으면 필수 기록과 현재 단계를 확인합니다.",
  },
} as const satisfies Record<
  string,
  { status: readonly number[]; meaning: string; action: string }
>;
export type ErrorType = keyof typeof ERROR_TYPES;

/** `type`의 기본 HTTP 상태. 값 검사 오류 400, 인증 401, 범위·출처 403, 없는 대상 404, 요청 한도 429, 나머지 409다. */
export function errorStatus(type: ErrorType): number {
  return ERROR_TYPES[type].status[0];
}

type CodeEntry = {
  type: ErrorType;
  /** `type`의 기본 상태와 다를 때만 쓴다(413, 415, 503). */
  status?: number;
  /** 응답의 `error` 기본 문장. 원인과 다음 행동이다. */
  message: string;
  /** 문서 설명. 언제 생기는지 적는다. */
  description: string;
  /** API 문서가 경로마다 자동으로 더하는 공통 오류(인증, 요청 한도, 형식, 저장소, 처리하지 못한 오류). */
  common?: true;
};

/** 원장 오류 이름(`ledgerError`)마다 `code`. `LEDGER_` 뒤에 이름을 대문자 밑줄 표기로 붙인다. */
export const LEDGER_ERROR_CODES = {
  Unauthorized: "LEDGER_UNAUTHORIZED",
  InvalidVersion: "LEDGER_INVALID_VERSION",
  InvalidState: "LEDGER_INVALID_STATE",
  InvalidProof: "LEDGER_INVALID_PROOF",
  InvalidAttempt: "LEDGER_INVALID_ATTEMPT",
  MissingRecords: "LEDGER_MISSING_RECORDS",
  TooEarly: "LEDGER_TOO_EARLY",
} as const satisfies Record<LedgerError, `LEDGER_${string}`>;

// 표 순서: `ERROR_TYPES`의 순서대로 묶는다. 원장 거절(`rejected`)은 아래에서 원장 오류 이름으로 만든다.
const CODES = {
  // invalid_input
  INVALID_REQUEST: {
    type: "invalid_input",
    message:
      "요청 형식이 맞지 않습니다. API 문서에서 경로 값과 본문 형식을 확인하세요.",
    description:
      "경로 값이나 본문이 스키마와 다릅니다. 본문이 올바른 JSON이 아닌 경우도 포함합니다.",
    common: true,
  },
  BODY_TOO_LARGE: {
    type: "invalid_input",
    status: 413,
    message: "본문이 64KB를 넘습니다. 본문을 줄여 다시 보내세요.",
    description: "POST 본문이 64KB를 넘습니다.",
    common: true,
  },
  UNSUPPORTED_MEDIA_TYPE: {
    type: "invalid_input",
    status: 415,
    message:
      "본문 형식이 JSON이 아닙니다. Content-Type을 application/json으로 보내세요.",
    description: "POST 본문의 `Content-Type`이 `application/json`이 아닙니다.",
    common: true,
  },
  ANSWERS_NOT_MATCHING_RULE: {
    type: "invalid_input",
    message:
      "답변이 최신 진단 기준과 맞지 않습니다. 최신 기준의 문항마다 선택지 번호 하나를 보내세요.",
    description:
      "답변 수가 최신 기준의 문항 수와 다르거나, 문항에 없는 선택지 번호가 있습니다.",
  },
  RULE_DOCUMENT_INVALID: {
    type: "invalid_input",
    message:
      "진단 기준 원문이 검사를 통과하지 못했습니다. 원문을 고친 뒤 다시 등록하세요.",
    description:
      "진단 기준 원문의 형식, 문항, 선택지, 등급 구간, 적합성 기준이 맞지 않습니다. `error` 끝에 이유를 붙입니다.",
  },
  RULE_ALREADY_REGISTERED: {
    type: "invalid_input",
    message: "이미 등록한 진단 기준입니다. 내용을 바꿔 새 버전을 만드세요.",
    description: "같은 기준 해시의 진단 기준이 원장에 이미 있습니다.",
  },
  PRODUCT_DOCUMENT_INVALID: {
    type: "invalid_input",
    message:
      "상품 설명서가 검사를 통과하지 못했습니다. 설명서를 고친 뒤 다시 등록하세요.",
    description:
      "상품 설명서의 형식, 필수 항목, 위험등급, 핵심 설명 카드가 맞지 않습니다. `error` 끝에 이유를 붙입니다.",
  },
  // unauthorized
  ACCESS_CODE_INVALID: {
    type: "unauthorized",
    message: "접근 코드가 없거나 맞지 않습니다. 접근 코드를 확인하세요.",
    description:
      "서버에 접근 코드(`DEMO_TOKEN`)를 설정했는데 `Authorization` 헤더가 없거나 값이 다릅니다.",
    common: true,
  },
  API_KEY_INVALID: {
    type: "unauthorized",
    message:
      "없거나 폐기한 API 키입니다. 판매사 콘솔에서 사용 중인 키를 확인하세요.",
    description:
      "`fvk_`로 시작하는 키를 보냈지만 발급하지 않은 키이거나 폐기한 키입니다.",
    common: true,
  },
  // forbidden
  DEMO_SCOPE_DENIED: {
    type: "forbidden",
    message:
      "현재 세션으로는 이 기록에 접근할 수 없습니다. 증권사 앱의 내 가입에서 본인의 기록을 선택하세요.",
    description:
      "공개 증권사 앱에서 허용하지 않는 기능을 요청했거나 현재 세션에 속하지 않은 기록을 요청했습니다.",
    common: true,
  },
  ORIGIN_NOT_ALLOWED: {
    type: "forbidden",
    message:
      "허용하지 않은 출처의 요청입니다. 서버의 WEB_ORIGIN에 웹 주소를 등록하세요.",
    description:
      "POST 요청의 `Origin`이 API와 같은 도메인도 아니고 `WEB_ORIGIN`에 등록한 출처도 아닙니다.",
    common: true,
  },
  API_KEY_SCOPE_DENIED: {
    type: "forbidden",
    message:
      "판매 채널 연동 API만 API 키로 부를 수 있습니다. 다른 API는 판매사 콘솔의 접근 코드로 부르세요.",
    description: "API 키로 `판매 채널 연동` 밖의 경로를 불렀습니다.",
    common: true,
  },
  // not_found
  ROUTE_NOT_FOUND: {
    type: "not_found",
    message:
      "없는 API 경로입니다. API 문서(/api/docs)에서 경로와 메서드를 확인하세요.",
    description: "등록하지 않은 경로나 메서드입니다. 모든 주소에서 생깁니다.",
    common: true,
  },
  SALE_NOT_FOUND: {
    type: "not_found",
    message: "판매 건을 찾을 수 없습니다. 판매 ID를 확인하세요.",
    description: "경로의 판매 ID가 판매 기록에 없습니다.",
  },
  SUBSCRIPTION_TX_NOT_FOUND: {
    type: "not_found",
    message:
      "판매 기록에서 확정한 청약 거래를 찾을 수 없습니다. 온체인 처리 기록에서 청약 거래를 확인하세요.",
    description:
      "원장에는 청약이 있지만 판매 기록에 확정한 청약 거래가 없어 고객 증명서를 만들 수 없습니다.",
  },
  API_KEY_NOT_FOUND: {
    type: "not_found",
    message:
      "찾을 수 없는 API 키입니다. 키 목록을 다시 읽어 키 ID를 확인하세요.",
    description: "경로의 키 ID로 발급한 API 키가 없습니다.",
  },
  // rate_limited
  RATE_LIMITED: {
    type: "rate_limited",
    message: "요청이 너무 많습니다. 1분 뒤 다시 시도하세요.",
    description:
      "같은 API 키로, 키가 없으면 같은 IP에서 1분에 120번을 넘게 요청했습니다.",
    common: true,
  },
  // not_ready
  RULE_NOT_REGISTERED: {
    type: "not_ready",
    message:
      "등록한 진단 기준이 없습니다. 판매사 콘솔에서 진단 기준을 먼저 등록하세요.",
    description: "원장에 진단 기준이 하나도 없습니다.",
  },
  PRODUCT_NOT_REGISTERED: {
    type: "not_ready",
    message:
      "원장에 등록하지 않은 상품입니다. 판매사 콘솔에서 상품을 먼저 등록하세요.",
    description: "`productId`의 설명서 버전이 원장에 없습니다.",
  },
  // needs_*, product_changed
  DIAGNOSIS_REQUIRED: {
    type: "needs_diagnosis",
    message: "투자성향 진단 기록이 없습니다. 고객의 진단을 먼저 기록하세요.",
    description: "고객의 진단 회차가 원장에 없습니다.",
  },
  HIGHER_RISK_CONFIRMATION_REQUIRED: {
    type: "needs_higher_risk",
    message:
      "투자성향에 맞지 않는 상품입니다. 고객에게 부적합 사실을 알리고 추가 위험 확인을 받아야 청약할 수 있습니다.",
    description:
      "최신 회차의 투자성향에 맞지 않는 상품인데 `higherRiskConfirmed`가 false입니다.",
  },
  APPROVAL_REQUIRED: {
    type: "needs_approval",
    message:
      "관리자 승인이 필요합니다. 3회차 이상 진단한 고객이므로 소비자보호 담당이 회차 이력을 보고 승인한 뒤 청약하세요.",
    description:
      "최신 회차가 3 이상인데 그 회차의 관리자 승인(`approveSale`)이 없습니다. 고객이 다시 진단하면 새로 승인해야 합니다.",
  },
  RECORDING_CONSENT_REQUIRED: {
    type: "needs_recording",
    message:
      "녹취 대상 상품입니다. 고객의 녹취 동의를 받아야 청약할 수 있습니다.",
    description: "녹취·숙려 대상인데 `recordingConsent`가 false입니다.",
  },
  PRODUCT_VERSION_CHANGED: {
    type: "product_changed",
    message:
      "상품 설명서가 새 버전으로 바뀌었습니다. 이 신청을 중단하고 새 버전으로 다시 신청하세요.",
    description: "신청 뒤 그 상품의 새 설명서 버전이 원장에 등록됐습니다.",
  },
  PRODUCT_EDIT_VERSION_CHANGED: {
    type: "wrong_state",
    message:
      "새 상품 버전이 등록됐습니다. 최신 버전을 확인한 뒤 다시 수정하세요.",
    description:
      "수정 요청의 expectedVersion이 원장의 최신 상품 버전과 다릅니다.",
  },
  // wrong_state
  SALE_ABANDONED: {
    type: "wrong_state",
    message: "중단한 신청입니다. 고객이 다시 가입하려면 새로 신청해야 합니다.",
    description: "중단한 신청에 청약이나 관리자 승인을 요청했습니다.",
  },
  SALE_ALREADY_SUBSCRIBED: {
    type: "wrong_state",
    message:
      "이미 청약한 신청입니다. 판매 건을 다시 읽어 현재 상태를 확인하세요.",
    description:
      "청약한 판매 건에 신청 중단이나 관리자 승인을 요청했습니다. 같은 청약 요청은 오류 없이 판매 건을 돌려줍니다.",
  },
  APPROVAL_NOT_NEEDED: {
    type: "wrong_state",
    message:
      "승인할 필요가 없는 신청입니다. 3회차 미만 진단한 고객은 승인 없이 청약할 수 있습니다.",
    description:
      "최신 회차가 3 미만인 고객의 신청에 관리자 승인을 요청했습니다.",
  },
  APPROVAL_ATTEMPT_CHANGED: {
    type: "wrong_state",
    message:
      "진단 회차가 바뀌었습니다. 판매 건을 새로고침해 최신 회차를 검토하고 승인하세요.",
    description: "승인 요청의 expectedAttempt가 원장의 최신 회차와 다릅니다.",
  },
  CONFIRM_NOT_ALLOWED: {
    type: "wrong_state",
    message:
      "청약한 신청만 최종 확인할 수 있습니다. 판매 건을 다시 읽어 현재 상태를 확인하세요.",
    description:
      "청약 전이거나 철회한 판매 건에 최종 확인을 요청했습니다. 이미 확정한 건은 오류 없이 판매 건을 돌려줍니다.",
  },
  WITHDRAW_NOT_ALLOWED: {
    type: "wrong_state",
    message:
      "최종 확인 전의 청약만 철회할 수 있습니다. 판매 건을 다시 읽어 현재 상태를 확인하세요.",
    description:
      "청약 전이거나 확정한 판매 건에 철회를 요청했습니다. 이미 철회한 건은 오류 없이 판매 건을 돌려줍니다.",
  },
  SETTLEMENT_NOT_ALLOWED: {
    type: "wrong_state",
    message:
      "최종 확인한 가입만 결제를 기록할 수 있습니다. 판매 건을 다시 읽어 현재 상태를 확인하세요.",
    description: "확정 전의 판매 건에 결제 기록을 요청했습니다.",
  },
  EXPORT_NOT_ALLOWED: {
    type: "wrong_state",
    message:
      "청약하지 않은 판매 건입니다. 청약한 뒤에 증명서와 원본을 받을 수 있습니다.",
    description: "청약 전의 판매 건에서 고객 증빙을 내려받으려 했습니다.",
  },
  ATTEMPT_NOT_RECORDED: {
    type: "wrong_state",
    message: "아직 기록하지 않은 회차입니다. 이미 기록한 회차를 고르세요.",
    description: "기록 변경 시도에 원장에 없는 진단 회차를 보냈습니다.",
  },
  // limit_reached
  API_KEY_LIMIT_REACHED: {
    type: "limit_reached",
    message:
      "사용 중인 API 키는 20개까지입니다. 쓰지 않는 키를 폐기한 뒤 발급하세요.",
    description:
      "사용 중인 API 키가 이미 20개입니다. 폐기한 키는 세지 않습니다.",
  },
  // pending
  TRANSACTION_PENDING: {
    type: "pending",
    message: "미확정 거래가 있습니다. 영수증을 확인한 뒤 다시 요청하세요.",
    description:
      "앞선 원장 거래의 영수증을 아직 받지 못했습니다. 그 영수증을 받을 때까지 원장 거래가 필요한 요청을 받지 않습니다.",
  },
  RECEIPT_PENDING: {
    type: "pending",
    message:
      "거래 영수증이 아직 없습니다. 온체인 처리 화면에서 해시를 확인하세요.",
    description:
      "이번 요청의 거래를 보냈지만 기다리는 동안 영수증을 받지 못했습니다. 거래는 처리 기록에 대기로 남습니다.",
  },
  // unavailable
  INTERNAL_ERROR: {
    type: "unavailable",
    message:
      "처리를 완료하지 못했습니다. 잠시 뒤 다시 요청하세요. 계속 실패하면 서버 연결과 온체인 처리 기록을 확인하세요.",
    description:
      "`code`를 정하지 않은 오류입니다. RPC 오류처럼 우리가 쓰지 않은 문장은 이 문장으로 바꿉니다.",
    common: true,
  },
  API_START_FAILED: {
    type: "unavailable",
    status: 503,
    message: "서버를 시작하지 못했습니다. 배포 설정과 RPC를 확인하세요.",
    description:
      "Vercel 함수가 시작 검사(배포 설정, RPC, 원장 코드)에 실패했습니다. 시작 검사의 문장이 있으면 그 문장을 보냅니다. 모든 주소에서 생깁니다.",
    common: true,
  },
  STORE_UNAVAILABLE: {
    type: "unavailable",
    message: "판매 기록 저장소에 연결하지 못했습니다. 잠시 뒤 다시 요청하세요.",
    description:
      "공유 저장소(Upstash Redis)를 읽거나 쓰지 못했습니다. Vercel처럼 공유 저장소를 쓸 때만 생깁니다.",
    common: true,
  },
  STORE_LOCK_BUSY: {
    type: "unavailable",
    message: "다른 요청을 처리하고 있습니다. 잠시 뒤 다시 요청하세요.",
    description:
      "다른 서버 인스턴스가 판매 기록 잠금을 120초 넘게 잡고 있습니다. 공유 저장소를 쓸 때만 생깁니다.",
    common: true,
  },
  STORE_LOCK_EXPIRED: {
    type: "unavailable",
    message:
      "판매 기록 잠금이 만료되었습니다. 처리 기록을 확인한 뒤 다시 요청하세요.",
    description:
      "처리하는 동안 판매 기록 잠금이 만료되어 기록을 저장하지 못했습니다. 공유 저장소를 쓸 때만 생깁니다.",
    common: true,
  },
  STORED_RECORD_MISMATCH: {
    type: "unavailable",
    message:
      "판매 기록이 원장 기록과 맞지 않습니다. 판매 기록 저장소가 같은 원장의 기록인지 확인하세요.",
    description:
      "원장에 있는 기준·상품 원문이나 진단 원본이 판매 기록에 없거나 다릅니다. `error` 끝에 빠진 기록을 붙입니다.",
  },
  PROOF_GENERATION_FAILED: {
    type: "unavailable",
    message: "진단 증명을 만들지 못했습니다. 잠시 뒤 진단을 다시 요청하세요.",
    description:
      "증명 생성이 실패했거나 증명의 판정이 서버 판정과 다릅니다. 원장 거래는 보내지 않았습니다.",
  },
  RPC_UNAVAILABLE: {
    type: "unavailable",
    message:
      "원장 시뮬레이션을 하지 못했습니다. RPC 연결을 확인한 뒤 다시 요청하세요.",
    description:
      "원장 호출을 시뮬레이션하는 동안 RPC가 원장 거절이 아닌 오류로 실패했습니다.",
  },
  TRANSACTION_NOT_SUBMITTED: {
    type: "unavailable",
    message:
      "원장 거래를 보내지 못했습니다. RPC 연결과 역할 계정의 ETH 잔액을 확인한 뒤 다시 요청하세요.",
    description:
      "시뮬레이션이나 거래 제출이 원장 거절이 아닌 이유(RPC 연결, 가스비 부족)로 실패했습니다. 거래는 보내지 않았습니다.",
  },
  RECEIPT_EVENT_MISSING: {
    type: "unavailable",
    message:
      "성공 영수증에서 이번 요청의 이벤트를 찾을 수 없습니다. 온체인 처리 기록에서 거래를 확인하세요.",
    description:
      "거래는 성공했지만 영수증에 이번 요청의 원장 이벤트가 없습니다.",
  },
} as const satisfies Record<string, CodeEntry>;

/** 원장이 거절했지만 오류 이름을 모를 때. 실패한 거래 영수증도 이 `code`다. */
const LEDGER_REJECTED = {
  type: "rejected",
  message: "원장이 요청을 거절했습니다. 필수 기록과 현재 단계를 확인하세요.",
  description:
    "원장이 거절했지만 오류 이름을 알 수 없습니다. 실패한 거래 영수증도 포함합니다. `ledgerError`가 없습니다.",
} as const satisfies CodeEntry;

/** 상황 하나를 가리키는 `code`. `UPPER_SNAKE_CASE`이고 바꾸지 않는다. */
export type ErrorCode =
  | keyof typeof CODES
  | (typeof LEDGER_ERROR_CODES)[LedgerError]
  | "LEDGER_REJECTED";

/** `code` 하나의 내용. `status`는 `type`의 기본 상태이거나 그 `code`만의 상태다. */
export type ErrorCodeEntry = {
  type: ErrorType;
  status: number;
  message: string;
  description: string;
  common: boolean;
  /** 원장 거절(`LEDGER_*`)이면 원장 오류 이름. 응답의 `ledgerError`다. */
  ledgerError?: LedgerError;
};

const entry = (value: CodeEntry & { ledgerError?: LedgerError }) => ({
  type: value.type,
  status: value.status ?? errorStatus(value.type),
  message: value.message,
  description: value.description,
  common: value.common ?? false,
  ...(value.ledgerError ? { ledgerError: value.ledgerError } : {}),
});

/**
 * 모든 `code`의 `type`, HTTP 상태, 기본 문장(합니다체), 문서 설명. `type` 순서로 묶어 둔다.
 * 원장 거절은 `LEDGER_ERRORS`로 만든다. 같은 문장을 다른 곳에 다시 쓰지 않는다.
 */
export const ERROR_CODES = Object.fromEntries([
  ...Object.entries(CODES).map(([code, value]) => [code, entry(value)]),
  ...(Object.keys(LEDGER_ERRORS) as LedgerError[]).map((name) => [
    LEDGER_ERROR_CODES[name],
    entry({
      type: "rejected",
      message: `원장이 요청을 거절했습니다. ${LEDGER_ERRORS[name]}`,
      description: `원장이 \`${name}\` 오류로 거절했습니다. \`ledgerError\`는 \`${name}\`입니다.`,
      ledgerError: name,
    }),
  ]),
  ["LEDGER_REJECTED", entry(LEDGER_REJECTED)],
]) as Readonly<Record<ErrorCode, ErrorCodeEntry>>;

/** 원장 오류 이름의 `code`. 이름을 모르면 `LEDGER_REJECTED`다. */
export function ledgerErrorCode(name?: LedgerError): ErrorCode {
  return name ? LEDGER_ERROR_CODES[name] : "LEDGER_REJECTED";
}

/**
 * `code`의 오류 응답 본문. `detail`이 있으면 기본 문장 뒤에 붙인다(검사 이유, 빠진 기록 같은 바뀌는 부분).
 * 원장 거절이면 `ledgerError`를 넣는다.
 */
export function errorBody(code: ErrorCode, detail?: string): ErrorResponse {
  const { type, message, ledgerError } = ERROR_CODES[code];
  return {
    error: detail ? `${message} ${detail}` : message,
    type,
    code,
    ...(ledgerError ? { ledgerError } : {}),
  };
}
