// 오류 응답에 `type`과 `code`를 싣는 오류. 모든 계층이 쓸 수 있다. 이 파일은 다른 계층을 import하지 않는다.
import type { ErrorResponse } from "@finveric/core/api";
import { ERROR_CODES, errorBody, type ErrorCode } from "@finveric/core/errors";

const CHANNEL_ERROR_TEXT: Partial<
  Record<ErrorCode, { message: string; description: string }>
> = {
  INTERNAL_ERROR: {
    message:
      "처리를 완료하지 못했습니다. 기록 상태를 확인한 뒤 다시 요청하세요.",
    description: "요청을 처리하는 중 서비스 오류가 발생했습니다.",
  },
  API_START_FAILED: {
    message: "지금 서비스를 사용할 수 없습니다. 잠시 뒤 다시 요청하세요.",
    description: "서비스가 아직 요청을 받을 수 없습니다.",
  },
  ORIGIN_NOT_ALLOWED: {
    message: "허용되지 않은 출처입니다. 판매 채널 서버에서 요청하세요.",
    description: "요청 출처가 연동 설정에 등록되어 있지 않습니다.",
  },
  RECEIPT_PENDING: {
    message: "원장 거래를 제출했습니다. 판매 건 또는 진단 회차를 조회하세요.",
    description: "거래 결과를 확인 중입니다.",
  },
  RECEIPT_EVENT_MISSING: {
    message:
      "거래 결과를 확인하지 못했습니다. 판매 건 또는 진단 회차를 조회하세요.",
    description: "제출한 거래에서 요청의 결과를 확인하지 못했습니다.",
  },
  TRANSACTION_NOT_SUBMITTED: {
    message: "원장 거래를 제출하지 못했습니다. 잠시 뒤 다시 요청하세요.",
    description: "원장 거래 요청을 제출하는 중 서비스 오류가 발생했습니다.",
  },
  SUBSCRIPTION_TX_NOT_FOUND: {
    message: "증명서를 만들 수 없습니다. 청약 상태를 확인하세요.",
    description: "증명서 발급에 필요한 청약 기록을 확인하지 못했습니다.",
  },
  LEDGER_UNAUTHORIZED: {
    message:
      "권한을 확인하지 못했습니다. 청약 상태와 관리자 승인을 확인하세요.",
    description: "원장이 처리 권한 또는 관리자 승인을 확인하지 못했습니다.",
  },
};

export function channelErrorCode(code: ErrorCode): ErrorCode {
  switch (code) {
    case "STORE_UNAVAILABLE":
    case "STORE_LOCK_BUSY":
    case "STORE_LOCK_EXPIRED":
    case "STORED_RECORD_MISMATCH":
      return "INTERNAL_ERROR";
    default:
      return code;
  }
}

export function channelErrorInfo(code: ErrorCode) {
  return { ...ERROR_CODES[code], ...CHANNEL_ERROR_TEXT[code] };
}

export function channelErrorBody(code: ErrorCode): ErrorResponse {
  const externalCode = channelErrorCode(code);
  return {
    ...errorBody(externalCode),
    error: channelErrorInfo(externalCode).message,
  };
}

/**
 * 이유를 기계가 읽을 수 있는 오류. 오류 처리기(`app.ts`)가 `body`를 그대로 응답한다.
 * 문장은 `@finveric/core/errors`의 `ERROR_CODES`에 있다. `detail`은 그 문장 뒤에 붙는 바뀌는 부분이다(검사 이유, 빠진 기록).
 */
export class CodedError extends Error {
  readonly body: ErrorResponse;
  constructor(
    readonly code: ErrorCode,
    detail?: string,
  ) {
    const body = errorBody(code, detail);
    super(body.error);
    this.body = body;
  }
  get type() {
    return this.body.type;
  }
}
