// 판매사 API 계약(DTO). API(apps/api)와 웹(apps/web)이 이 파일만 기준으로 쓴다.
// 요청 DTO는 같은 자리에 JSON Schema를 둔다. 스키마의 속성 이름이 DTO 필드와 다르면 타입 검사가 실패한다.
import type { Hex } from "viem";
import {
  CATEGORIES,
  LEDGER_ERRORS,
  PRODUCT_TYPES,
  ROLES,
  SALE_STATUSES,
  type ChainSale,
  type Deployment,
  type EvidenceReceipt,
  type LedgerError,
  type MockRecording,
  type OriginalAttempt,
  type OriginalBundle,
  type Product,
  type ProductDocument,
  type Role,
  type RuleDocument,
  type Trace,
} from "./index.ts";
import {
  ERROR_CODES,
  ERROR_TYPES,
  type ErrorCode,
  type ErrorType,
} from "./errors.ts";

/** API는 bigint를 문자열로 보낸다(`json()`). 응답 DTO는 이 변환을 거친 모양이다. */
export type Wire<T> = T extends bigint
  ? string
  : T extends object
    ? { [Key in keyof T]: Wire<T[Key]> }
    : T;

type Keys<T> = Extract<keyof T, string>;
/** 요청 스키마. `properties`에 DTO의 모든 필드가 있어야 하고 다른 필드는 없어야 한다. */
type ObjectSchema<T> = {
  type: "object";
  additionalProperties?: false;
  required: readonly Keys<T>[];
  properties: { [Key in Keys<T>]-?: object };
};

const SALE_ID = { type: "string", pattern: "^[1-9][0-9]{0,76}$" } as const;
const CUSTOMER_NO = {
  type: "string",
  pattern: "^[A-Za-z0-9-]{1,32}$",
} as const;
const BYTES32 = { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" } as const;
const text = (maxLength: number) =>
  ({ type: "string", minLength: 1, maxLength }) as const;

// ── 요청 DTO와 스키마 ─────────────────────────────────────────

/** `/api/sales/:id/...`의 경로 값. 판매 ID는 BN254 필드 범위의 10진수다. */
export type SaleIdParams = { id: string };
export const saleIdParamsSchema = {
  type: "object",
  required: ["id"],
  properties: { id: SALE_ID },
} as const satisfies ObjectSchema<SaleIdParams>;

/** `/api/customers/:customerNo/...`의 경로 값. 고객 번호는 판매사 시스템의 번호다(시연 C-0001). */
export type CustomerParams = { customerNo: string };
export const customerParamsSchema = {
  type: "object",
  required: ["customerNo"],
  properties: { customerNo: CUSTOMER_NO },
} as const satisfies ObjectSchema<CustomerParams>;

const ruleChoiceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["text", "score"],
  properties: {
    text: text(500),
    score: { type: "integer", minimum: 0, maximum: 15 },
    cap: { type: "integer", minimum: 1, maximum: 6 },
    elderly: { type: "boolean" },
  },
} as const satisfies ObjectSchema<
  RuleDocument["questions"][number]["choices"][number]
>;
const ruleQuestionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["category", "title", "choices"],
  properties: {
    category: { enum: CATEGORIES },
    title: text(500),
    choices: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: ruleChoiceSchema,
    },
  },
} as const satisfies ObjectSchema<RuleDocument["questions"][number]>;
export const ruleDocumentSchema = {
  type: "object",
  additionalProperties: false,
  required: ["format", "version", "name", "questions", "thresholds", "matrix"],
  properties: {
    format: { const: "finveric-rule-v5" },
    version: { type: "integer", minimum: 1, maximum: 4294967295 },
    name: text(100),
    questions: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: ruleQuestionSchema,
    },
    thresholds: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: { type: "integer", minimum: 0, maximum: 255 },
    },
    matrix: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: { type: "integer", minimum: 1, maximum: 6 },
    },
  },
} as const satisfies ObjectSchema<RuleDocument>;

/**
 * POST `/api/rules`. 진단 기준을 검사하고 원장에 다음 버전으로 등록한다.
 * `version`은 API가 다음 버전 번호로 정한다. 응답의 원문과 해시가 등록한 값이다.
 */
export type RegisterRuleRequest = { document: RuleDocument };
export const registerRuleBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["document"],
  properties: { document: ruleDocumentSchema },
} as const satisfies ObjectSchema<RegisterRuleRequest>;

export const productDocumentSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "format",
    "code",
    "version",
    "name",
    "type",
    "issuer",
    "seller",
    "riskGrade",
    "complex",
    "derivative",
    "targetMarket",
    "maxLoss",
    "fee",
    "summary",
    "cards",
  ],
  properties: {
    format: { const: "finveric-product-v5" },
    code: { type: "string", pattern: "^[A-Z0-9][A-Z0-9-]{1,39}$" },
    version: { type: "integer", minimum: 1, maximum: 4294967295 },
    name: text(500),
    type: { enum: PRODUCT_TYPES },
    issuer: text(500),
    seller: text(500),
    riskGrade: { type: "integer", minimum: 1, maximum: 6 },
    complex: { type: "boolean" },
    derivative: { type: "boolean" },
    targetMarket: text(500),
    maxLoss: text(500),
    fee: text(500),
    summary: text(500),
    cards: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "text"],
        properties: { title: text(100), text: text(1000) },
      },
    },
  },
} as const satisfies ObjectSchema<ProductDocument>;

/**
 * POST `/api/products`. 상품 설명서를 원장에 새 버전으로 등록한다.
 * `version`은 API가 그 상품의 다음 버전 번호로 정한다.
 */
export type RegisterProductRequest = {
  document: ProductDocument;
  expectedVersion?: number;
};
export const registerProductBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["document"],
  properties: {
    document: productDocumentSchema,
    expectedVersion: { type: "integer", minimum: 1, maximum: 4_294_967_295 },
  },
} as const satisfies ObjectSchema<RegisterProductRequest>;

/** POST `/api/customers/:customerNo/diagnose`. 최신 등록 기준의 문항 순서대로 고른 선택지 번호(0부터). */
export const REASSESSMENT_REASONS = [
  "correction",
  "changed_circumstances",
  "reconfirmation",
] as const;
export type ReassessmentReason = (typeof REASSESSMENT_REASONS)[number];
export type DiagnoseRequest = {
  answers: number[];
  reassessmentReason?: ReassessmentReason;
};
export const diagnoseBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["answers"],
  properties: {
    reassessmentReason: { type: "string", enum: REASSESSMENT_REASONS },
    answers: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: { type: "integer", minimum: 0, maximum: 4 },
    },
  },
} as const satisfies ObjectSchema<DiagnoseRequest>;

/** 선택형 검토 기록은 오프체인에만 보관한다. 기존 본문 없는 승인도 허용한다. */
export const APPROVAL_REASONS = [
  "correction_reviewed",
  "circumstances_reviewed",
  "reconfirmation_reviewed",
] as const;
export const REVIEW_BASES = [
  "diagnosis_history",
  "risk_signals",
  "customer_confirmation",
] as const;
export type ApproveRequest = {
  expectedAttempt?: number;
  reason?: (typeof APPROVAL_REASONS)[number];
  reviewBasis?: (typeof REVIEW_BASES)[number][];
};
export const approveBodySchema = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {
    expectedAttempt: { type: "integer", minimum: 1, maximum: 4_294_967_295 },
    reason: { type: "string", enum: APPROVAL_REASONS },
    reviewBasis: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      uniqueItems: true,
      items: { type: "string", enum: REVIEW_BASES },
    },
  },
} as const satisfies ObjectSchema<ApproveRequest>;

/** POST `/api/sales`. 고객과 상품으로 청약 전 신청(초안)을 만든다. 원장 거래는 없다. */
export type OpenSaleRequest = { productId: Hex; customerNo: string };
export const openSaleBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["productId", "customerNo"],
  properties: { productId: BYTES32, customerNo: CUSTOMER_NO },
} as const satisfies ObjectSchema<OpenSaleRequest>;

/**
 * POST `/api/sales/:id/action/subscribe`. 고객 키로 청약 거래를 보낸다.
 * 녹취 대상이면 모의 녹취록을 만들고 지문을 기록한다. 녹취에 동의하지 않으면 거절한다.
 */
export type SubscribeRequest = {
  explanationSeconds: number;
  higherRiskConfirmed: boolean;
  recordingConsent: boolean;
};
export const subscribeBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["explanationSeconds", "higherRiskConfirmed", "recordingConsent"],
  properties: {
    explanationSeconds: { type: "integer", minimum: 1, maximum: 86400 },
    higherRiskConfirmed: { type: "boolean" },
    recordingConsent: { type: "boolean" },
  },
} as const satisfies ObjectSchema<SubscribeRequest>;

/**
 * POST `/api/sales/:id/action/<동작>`. 동작마다 경로가 따로 있다. 경로 값은 `saleIdParamsSchema`, 본문은 없다.
 * approve: 승인자 서명(3회차 이상) · abandon: 초안 중단 · confirm·withdraw: 고객 키 · settle: 인프라 키.
 */
export const SALE_ACTIONS = [
  "approve",
  "abandon",
  "confirm",
  "withdraw",
  "settle",
] as const;
export type SaleAction = (typeof SALE_ACTIONS)[number];

/** POST `/api/demo/tamper`. 이미 기록한 회차를 다시 쓰는 거래를 시뮬레이션한다. 거래는 보내지 않는다. */
export type TamperRequest = { customerNo: string; attempt: number };
export const tamperBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["customerNo", "attempt"],
  properties: {
    customerNo: CUSTOMER_NO,
    attempt: { type: "integer", minimum: 1, maximum: 4294967295 },
  },
} as const satisfies ObjectSchema<TamperRequest>;

/** GET `/api/sales/:id/export/:kind`. 청약한 건의 고객 증빙. 증명서의 confirmTx는 확정 뒤에 들어간다. */
export const EXPORT_KINDS = ["receipt", "original"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];
export type ExportParams = SaleIdParams & { kind: ExportKind };
export const exportParamsSchema = {
  type: "object",
  required: ["id", "kind"],
  properties: { id: SALE_ID, kind: { enum: EXPORT_KINDS } },
} as const satisfies ObjectSchema<ExportParams>;

// ── 응답 DTO ─────────────────────────────────────────────────
// `...View`는 서버가 만드는 값(bigint 포함), `...Dto`는 웹이 받는 값이다.

/** 의존성 하나의 점검 결과. 실패 이유는 우리가 쓴 문장만 담는다. */
export type HealthCheck = { ok: boolean; ms: number; error?: string };

/**
 * GET `/api/health`. RPC 연결과 체인 ID, 원장 코드, 판매 기록 저장소를 점검한다.
 * 모두 정상이면 200, 하나라도 실패하면 503이다. 접근 코드 없이 열린다.
 */
export type HealthResponse = {
  ok: boolean;
  network: string;
  chainId: number;
  ledger: Hex;
  checks: { rpc: HealthCheck; ledger: HealthCheck; store: HealthCheck };
};

/** GET `/api/config`. 검증 설정과 시연 고객. 접근 코드 없이 열린다. */
export type ConfigResponse = {
  deployment: Deployment;
  requiresToken: boolean;
  publicChannel?: boolean;
  demoCustomer: { number: string; ref: Hex };
};
export type ConfigDto = Wire<ConfigResponse>;

/** GET `/api/traces`. 증명 생성·거래 제출·영수증·원장 거절 기록. */
export type TraceDto = Wire<Trace>;

/**
 * 진단 기준 버전 하나. GET `/api/rules`는 등록한 버전을 버전 순서로 준다.
 * 아직 아무 기준도 없으면 시연 기준 v1을 `registered: false`로 함께 준다.
 */
export type RuleEntry = {
  document: RuleDocument;
  hash: Hex;
  version: number;
  registered: boolean;
  txHash?: Hex;
};
export type RuleEntryDto = Wire<RuleEntry>;

/**
 * 상품 버전 하나. GET `/api/products`는 상품마다 모든 등록 버전을 준다. `latest`가 청약에 쓰는 버전이다.
 * 등록하지 않은 시연 상품은 `registered: false`로 함께 준다.
 */
export type ProductEntry = {
  product: Product;
  registered: boolean;
  latest: boolean;
  txHash?: Hex;
};
export type ProductEntryDto = Wire<ProductEntry>;

/** POST `/api/register`. 시연 기준과 시연 상품을 없을 때만 등록한다. 등록 뒤 목록을 준다. */
export type RegisterResponse = { rules: RuleEntry[]; products: ProductEntry[] };
export type RegisterDto = Wire<RegisterResponse>;

/** 진단 회차 하나. 값은 원장에서 읽는다. `at`은 블록 시각(초)이다. 답변·임의값·총점은 넣지 않는다. */
export type DiagnosisView = {
  attempt: number;
  ruleHash: Hex;
  commitment: bigint;
  profile: number;
  limit: number;
  elderly: boolean;
  at: number;
  txHash?: Hex;
  block?: bigint;
};
export type DiagnosisDto = Wire<DiagnosisView>;

/** GET `/api/customers/:customerNo`. 고객 가명 ID와 모든 진단 회차. */
export type CustomerView = {
  number: string;
  ref: Hex;
  diagnoses: DiagnosisView[];
};
export type CustomerDto = Wire<CustomerView>;

/** 판매 건 상태. draft·abandoned는 원장 밖의 초안, 나머지는 원장 상태다. */
export const SALE_VIEW_STATUSES = [
  "draft",
  "abandoned",
  "subscribed",
  "confirmed",
  "withdrawn",
] as const;
export type SaleStatus = (typeof SALE_VIEW_STATUSES)[number];

/** 판매 건. 고객 번호·답변·임의값·서명 원문은 넣지 않는다. */
export type SaleView = {
  id: string;
  customerRef: Hex;
  productId: Hex;
  productVersion: number;
  amount: number;
  createdAt: string;
  status: SaleStatus;
  /** 이 고객의 원장 최신 회차. 0이면 진단 전이다. */
  latestAttempt: number;
  /** 최신 회차가 3 이상이면 청약에 관리자 승인이 필요하다. */
  approvalRequired: boolean;
  /** 승인 서명을 만든 회차. 최신 회차와 같아야 청약할 수 있다. */
  approvedAttempt?: number;
  /** 청약 전에는 최신 회차로 계산한 예상 값, 청약 뒤에는 원장 값. 진단 전이면 없다. */
  suitable?: boolean;
  protectedSale?: boolean;
  /** 녹취·숙려 대상을 청약했으면 최종 확인이 가능한 시각(초). */
  coolingEndsAt?: number;
  settled: boolean;
  /** 원장 getSale 결과. 청약 뒤에만 있다. */
  chain?: ChainSale;
  /** 제출했지만 영수증을 아직 확인하지 않은 거래가 있다. */
  submissionPending: boolean;
  traces: Trace[];
};
export type SaleDto = Wire<SaleView>;

/** POST `/api/demo/tamper`의 결과. 원장이 거절하면 `rejected: true`와 오류 이름을 준다. */
export type TamperResponse = {
  rejected: boolean;
  error?: LedgerError;
  reason: string;
  customerRef: Hex;
  attempt: number;
};

/** 내보내기 종류별 응답. */
export type ExportResponse = {
  receipt: EvidenceReceipt;
  original: OriginalBundle;
};

/**
 * 오류 응답. `error`는 우리가 쓴 한국어 문장이다(합니다체). 원인과 다음 행동을 적는다.
 * `type`은 오류의 종류다. HTTP 상태와 연동 앱의 처리 방법을 정한다. `code`는 상황 하나를 가리킨다.
 * 두 값은 모든 오류 응답에 있다. 목록은 `@finveric/core/errors`의 `ERROR_TYPES`, `ERROR_CODES`다.
 * `ledgerError`는 `type`이 `rejected`이고 원장 오류 이름을 알 때만 있다.
 */
export type ErrorResponse = {
  error: string;
  type: ErrorType;
  code: ErrorCode;
  ledgerError?: LedgerError;
};

// ── 응답 스키마(문서 전용) ────────────────────────────────────
// OpenAPI 문서(`/api/openapi.json`)와 응답 대조 검사에만 쓴다. Fastify 경로의 `schema.response`에 넣지 않는다.
// 넣으면 fast-json-stringify가 응답을 직렬화한다. 스키마에 없는 필드가 빠지고 bigint 변환(`json()`)을 거치지 않는다.
// `description`은 연동 개발자가 읽는 문서 문구다. 합니다체로 쓴다.

type OptionalKeys<T> = {
  [Key in Keys<T>]-?: {} extends Pick<T, Key> ? Key : never;
}[Keys<T>];
/** 응답 DTO 하나의 JSON Schema. `title`이 OpenAPI 문서의 스키마 이름이다. */
export type ResponseSchema = {
  type: "object";
  title: string;
  description: string;
  required: string[];
  properties: Record<string, object>;
};
/**
 * 응답 DTO의 스키마를 만든다. `properties`에는 DTO의 모든 필드를, `optional`에는 DTO의 선택 필드를 적는다.
 * 필드가 빠지거나 남으면 타입 검사가 실패한다. `required`는 선택 필드를 뺀 나머지다.
 */
function responseSchema<T>(
  title: string,
  description: string,
  properties: { [Key in Keys<T>]-?: object },
  optional: { [Key in OptionalKeys<T>]-?: true },
): ResponseSchema {
  return {
    type: "object",
    title,
    description,
    required: Object.keys(properties).filter((key) => !(key in optional)),
    properties,
  };
}

const INTEGER = { type: "integer" } as const;
const BOOLEAN = { type: "boolean" } as const;
const STRING = { type: "string" } as const;
const ADDRESS = { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" } as const;
const DECIMAL = {
  type: "string",
  pattern: "^[0-9]+$",
  description: "원장의 uint256 값. 10진수 문자열입니다.",
} as const;
const UNIX_SECONDS = {
  type: "integer",
  minimum: 0,
  description: "블록 시각(Unix 초)",
} as const;
const ISO_TIME = { type: "string", format: "date-time" } as const;
const SALE_ID_VALUE = { ...SALE_ID, description: "판매 ID(10진수)" } as const;
const CUSTOMER_REF = {
  ...BYTES32,
  description: "고객 가명 ID. 고객 번호와 판매사 비밀값으로 만듭니다.",
} as const;
const arrayOf = (items: object) => ({ type: "array", items }) as const;

export const errorResponseSchema = responseSchema<ErrorResponse>(
  "Error",
  "오류 응답",
  {
    error: {
      type: "string",
      description:
        "원인과 다음 행동을 적은 한국어 문장(합니다체). 판매사 개발자와 콘솔이 읽습니다. 고객 화면에는 `type`과 `code`로 고른 문장을 보여 줍니다.",
    },
    type: {
      enum: Object.keys(ERROR_TYPES),
      description:
        "오류의 종류. HTTP 상태를 정합니다. 연동 앱은 이 값으로 처리 방법을 고릅니다. 값마다 뜻과 다음 행동은 오류 코드 표에 있습니다.",
    },
    code: {
      enum: Object.keys(ERROR_CODES),
      description:
        "상황 하나를 가리키는 값(`UPPER_SNAKE_CASE`). 값은 바뀌지 않습니다. 경로마다 생길 수 있는 값은 그 경로의 오류 표에 있습니다.",
    },
    ledgerError: {
      enum: Object.keys(LEDGER_ERRORS),
      description:
        "원장 오류 이름(예: `TooEarly`). `type`이 `rejected`이고 이름을 알 때만 있습니다.",
    },
  },
  { ledgerError: true },
);

const healthCheckSchema = responseSchema<HealthCheck>(
  "HealthCheck",
  "의존성 하나의 점검 결과",
  {
    ok: BOOLEAN,
    ms: { type: "number", minimum: 0, description: "점검에 걸린 시간(ms)" },
    error: { type: "string", description: "실패 이유" },
  },
  { error: true },
);
export const healthResponseSchema = responseSchema<HealthResponse>(
  "Health",
  "RPC, 원장, 판매 기록 저장소 점검 결과",
  {
    ok: { type: "boolean", description: "세 점검이 모두 정상이면 true" },
    network: { enum: ["local", "sepolia"] },
    chainId: INTEGER,
    ledger: ADDRESS,
    checks: responseSchema<HealthResponse["checks"]>(
      "HealthChecks",
      "점검 항목별 결과",
      {
        rpc: healthCheckSchema,
        ledger: healthCheckSchema,
        store: healthCheckSchema,
      },
      {},
    ),
  },
  {},
);

const deploymentSchema = responseSchema<Wire<Deployment>>(
  "Deployment",
  "공개 검증 설정. 감독기관과 고객은 이 원장 주소와 코드 지문으로 기록을 대조합니다.",
  {
    ledgerVersion: { const: 5 },
    proofKeyHash: {
      type: "string",
      pattern: "^[0-9a-f]{64}$",
      description: "증명 키(zkey)의 sha256",
    },
    chainId: { enum: [31337, 11155111] },
    ledger: ADDRESS,
    verifier: ADDRESS,
    blockNumber: { ...DECIMAL, description: "원장을 배포한 블록 번호" },
    rpcUrl: { type: "string", description: "공개 RPC 주소" },
    coolingPeriod: {
      type: "integer",
      minimum: 0,
      description: "녹취·숙려 대상의 최소 숙려 시간(초)",
    },
    roles: responseSchema<Deployment["roles"]>(
      "Roles",
      "역할별 계정 주소",
      Object.fromEntries(ROLES.map((role) => [role, ADDRESS])) as Record<
        Role,
        object
      >,
      {},
    ),
    verifierCodeHash: BYTES32,
    ledgerCodeHash: BYTES32,
  },
  {},
);
export const configResponseSchema = responseSchema<ConfigDto>(
  "Config",
  "검증 설정과 기본 고객",
  {
    deployment: deploymentSchema,
    requiresToken: {
      type: "boolean",
      description: "true면 판매사 콘솔이 접근 코드를 확인합니다.",
    },
    publicChannel: {
      type: "boolean",
      description: "true면 증권사 앱에서 탭별 가입 세션을 사용할 수 있습니다.",
    },
    demoCustomer: responseSchema<ConfigDto["demoCustomer"]>(
      "DemoCustomer",
      "기본 고객 번호와 가명 ID",
      { number: CUSTOMER_NO, ref: CUSTOMER_REF },
      {},
    ),
  },
  { publicChannel: true },
);

const ruleDocumentResponse = {
  title: "RuleDocument",
  description: "진단 기준 원문. 원장에는 정렬한 JSON 원문으로 등록합니다.",
  ...ruleDocumentSchema,
};
const productDocumentResponse = {
  title: "ProductDocument",
  description:
    "상품 설명서 원문. 지문(documentHash)은 정렬한 JSON 원문으로 계산합니다.",
  ...productDocumentSchema,
};
export const ruleEntrySchema = responseSchema<RuleEntryDto>(
  "RuleEntry",
  "진단 기준 버전 하나",
  {
    document: ruleDocumentResponse,
    hash: { ...BYTES32, description: "기준 해시" },
    version: INTEGER,
    registered: {
      type: "boolean",
      description: "false면 아직 원장에 등록하지 않은 기본 기준입니다.",
    },
    txHash: { ...BYTES32, description: "등록 거래 해시" },
  },
  { txHash: true },
);
const productSchema = responseSchema<Wire<Product>>(
  "Product",
  "상품 설명서 버전",
  {
    id: { ...BYTES32, description: "상품 ID. 상품 코드의 keccak256입니다." },
    version: INTEGER,
    document: productDocumentResponse,
    documentHash: { ...BYTES32, description: "설명서 지문" },
  },
  {},
);
export const productEntrySchema = responseSchema<ProductEntryDto>(
  "ProductEntry",
  "상품 버전 하나",
  {
    product: productSchema,
    registered: {
      type: "boolean",
      description: "false면 아직 원장에 등록하지 않은 기본 상품입니다.",
    },
    latest: {
      type: "boolean",
      description: "true면 청약에 쓰는 최신 버전입니다.",
    },
    txHash: { ...BYTES32, description: "등록 거래 해시" },
  },
  { txHash: true },
);
export const registerResponseSchema = responseSchema<RegisterDto>(
  "Register",
  "등록 뒤의 기준과 상품 목록",
  { rules: arrayOf(ruleEntrySchema), products: arrayOf(productEntrySchema) },
  {},
);

export const diagnosisSchema = responseSchema<DiagnosisDto>(
  "Diagnosis",
  "원장에 기록한 진단 회차. 답변, 임의값, 총점은 넣지 않습니다.",
  {
    attempt: { type: "integer", minimum: 1, description: "진단 회차" },
    ruleHash: { ...BYTES32, description: "진단에 쓴 기준 해시" },
    commitment: {
      ...DECIMAL,
      description:
        "답변·임의값·원장·고객 가명 ID·회차·기준에 묶인 커밋먼트(10진수)",
    },
    profile: {
      type: "integer",
      minimum: 1,
      maximum: 5,
      description: "투자성향 등급",
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 6,
      description: "권유할 수 있는 가장 위험한 상품 위험등급(1이 가장 위험)",
    },
    elderly: { type: "boolean", description: "고령 투자자 여부" },
    at: UNIX_SECONDS,
    txHash: { ...BYTES32, description: "기록 거래 해시" },
    block: { ...DECIMAL, description: "기록 블록 번호" },
  },
  { txHash: true, block: true },
);
export const customerSchema = responseSchema<CustomerDto>(
  "Customer",
  "고객 가명 ID와 모든 진단 회차",
  {
    number: { ...CUSTOMER_NO, description: "요청한 고객 번호" },
    ref: CUSTOMER_REF,
    diagnoses: arrayOf(diagnosisSchema),
  },
  {},
);

export const traceSchema = responseSchema<TraceDto>(
  "Trace",
  "처리 기록 하나. 증명 생성, 거래 제출, 영수증, 원장 거절을 남깁니다.",
  {
    id: STRING,
    at: ISO_TIME,
    source: {
      type: "string",
      description: "처리한 주체(예: seller, customer)",
    },
    action: { type: "string", description: "작업 이름(예: subscribe)" },
    status: { enum: ["pending", "confirmed", "failed"] },
    saleId: SALE_ID_VALUE,
    customerRef: CUSTOMER_REF,
    txHash: { ...BYTES32, description: "거래 해시" },
    blockNumber: { ...DECIMAL, description: "블록 번호" },
    event: { type: "string", description: "원장 이벤트 이름" },
    detail: { description: "영수증, 원장 오류 이름 같은 세부 값" },
  },
  {
    saleId: true,
    customerRef: true,
    txHash: true,
    blockNumber: true,
    event: true,
    detail: true,
  },
);
const chainSaleSchema = responseSchema<Wire<ChainSale>>(
  "ChainSale",
  "원장 getSale 결과. uint256 값은 10진수 문자열입니다.",
  {
    customerRef: { ...DECIMAL, description: "고객 가명 ID(10진수)" },
    productId: BYTES32,
    recordingHash: {
      ...BYTES32,
      description: "녹취록 지문. 녹취 대상이 아니면 0입니다.",
    },
    amount: { ...DECIMAL, description: "가입 금액(원)" },
    productVersion: INTEGER,
    attempt: { type: "integer", description: "청약에 쓴 진단 회차" },
    explanationSeconds: { type: "integer", description: "설명 시간(초)" },
    suitable: BOOLEAN,
    protectedSale: { type: "boolean", description: "녹취·숙려 대상" },
    higherRiskConfirmed: BOOLEAN,
    approved: { type: "boolean", description: "관리자 승인 서명 확인" },
    status: {
      type: "integer",
      minimum: 0,
      maximum: SALE_STATUSES.length - 1,
      description: SALE_STATUSES.map((s, i) => `${i}: ${s}`).join(", "),
    },
    subscribedAt: { ...DECIMAL, description: "청약 시각(Unix 초)" },
    confirmedAt: { ...DECIMAL, description: "확정 시각(Unix 초)" },
    withdrawnAt: { ...DECIMAL, description: "철회 시각(Unix 초)" },
    settledAt: { ...DECIMAL, description: "결제 기록 시각(Unix 초)" },
  },
  {},
);
export const saleSchema = responseSchema<SaleDto>(
  "Sale",
  "판매 건. 고객 번호, 답변, 임의값, 서명 원문은 넣지 않습니다.",
  {
    id: SALE_ID_VALUE,
    customerRef: CUSTOMER_REF,
    productId: BYTES32,
    productVersion: INTEGER,
    amount: { type: "integer", description: "가입 금액(원)" },
    createdAt: ISO_TIME,
    status: {
      enum: SALE_VIEW_STATUSES,
      description:
        "draft는 청약 전 진행 중, abandoned는 청약 전 중단(둘 다 원장 밖). subscribed는 청약을 원장에 기록했고 최종 확인을 기다린다(녹취·숙려 대상은 coolingEndsAt까지 숙려 중). confirmed는 가입 확정, withdrawn은 철회다.",
    },
    latestAttempt: {
      type: "integer",
      minimum: 0,
      description: "이 고객의 원장 최신 회차. 0이면 진단 전입니다.",
    },
    approvalRequired: {
      type: "boolean",
      description: "최신 회차가 3 이상이면 청약 전에 관리자 승인이 필요합니다.",
    },
    approvedAttempt: {
      type: "integer",
      description: "승인 서명을 만든 회차",
    },
    suitable: {
      type: "boolean",
      description:
        "청약 전에는 최신 회차로 계산한 예상 값, 청약 뒤에는 원장 값",
    },
    protectedSale: { type: "boolean", description: "녹취·숙려 대상" },
    coolingEndsAt: {
      ...UNIX_SECONDS,
      description:
        "최종 확인이 가능한 시각(Unix 초). 녹취·숙려 대상만 있습니다.",
    },
    settled: { type: "boolean", description: "결제 기록 여부" },
    chain: chainSaleSchema,
    submissionPending: {
      type: "boolean",
      description: "제출했지만 영수증을 아직 확인하지 않은 거래가 있으면 true",
    },
    traces: arrayOf(traceSchema),
  },
  {
    approvedAttempt: true,
    suitable: true,
    protectedSale: true,
    coolingEndsAt: true,
    chain: true,
  },
);

export const tamperResponseSchema = responseSchema<TamperResponse>(
  "TamperResult",
  "기록한 회차를 다시 쓰는 거래의 시뮬레이션 결과. 거래는 보내지 않습니다.",
  {
    rejected: { type: "boolean", description: "원장이 거절했으면 true" },
    error: { enum: Object.keys(LEDGER_ERRORS), description: "원장 오류 이름" },
    reason: STRING,
    customerRef: CUSTOMER_REF,
    attempt: INTEGER,
  },
  { error: true },
);

export const receiptSchema = responseSchema<EvidenceReceipt>(
  "EvidenceReceipt",
  "고객 증명서. 가입 기록 확인과 감독기관 조회가 원장과 대조합니다.",
  {
    format: { const: "finveric-receipt-v5" },
    saleId: SALE_ID_VALUE,
    chainId: INTEGER,
    ledger: ADDRESS,
    customerRef: CUSTOMER_REF,
    productId: BYTES32,
    productVersion: INTEGER,
    documentHash: BYTES32,
    attempt: INTEGER,
    ruleHash: BYTES32,
    amount: { ...DECIMAL, description: "가입 금액(원)" },
    subscribeTx: BYTES32,
    confirmTx: {
      ...BYTES32,
      description: "확정 거래 해시. 확정 뒤에만 있습니다.",
    },
    issuedAt: ISO_TIME,
  },
  { confirmTx: true },
);
export const originalSchema = responseSchema<OriginalBundle>(
  "OriginalBundle",
  "고객과 판매사가 보관하는 원본 묶음. 청약 회차까지 모든 회차의 답변과 임의값을 담습니다.",
  {
    format: { const: "finveric-original-v5" },
    saleId: SALE_ID_VALUE,
    customerRef: CUSTOMER_REF,
    attempts: arrayOf(
      responseSchema<OriginalAttempt>(
        "OriginalAttempt",
        "진단 회차 하나의 원본",
        {
          attempt: INTEGER,
          ruleHash: BYTES32,
          answers: arrayOf({ type: "integer", minimum: 0 }),
          salt: { type: "string", description: "커밋먼트 임의값" },
        },
        {},
      ),
    ),
    productDocument: productDocumentResponse,
    recording: responseSchema<MockRecording>(
      "Recording",
      "녹취록. 지문은 recordingHash입니다.",
      { name: STRING, text: STRING },
      {},
    ),
    explanationSeconds: INTEGER,
  },
  { recording: true },
);

// ── API 키 ──────────────────────────────────────────────────
// 증권사 앱 서버가 `판매 채널 연동` API를 부를 때 쓰는 키. 판매사 콘솔에서 발급하고 폐기한다.

/** API 키 원문의 접두어. 접근 코드와 구분한다. */
export const API_KEY_PREFIX = "fvk_";
export const DEMO_SESSION_PREFIX = "fvd_";
/** 동시에 쓸 수 있는 API 키 수. 폐기한 키는 세지 않는다. */
export const MAX_ACTIVE_API_KEYS = 20;
/** API 키로 부를 수 있는 범위. 지금은 `판매 채널 연동` API 하나다. */
export type ApiKeyScope = "channel";

/** `POST /api/keys` 본문. 이름은 키를 쓰는 곳을 알아보는 용도다. */
export type IssueApiKeyRequest = { name: string };
export const issueApiKeyBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["name"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 40, pattern: "\\S" },
  },
} as const satisfies ObjectSchema<IssueApiKeyRequest>;

/** `/api/keys/:id/...`의 경로 값. */
export type ApiKeyParams = { id: string };
const API_KEY_ID = { type: "string", pattern: "^key_[0-9a-f]{12}$" } as const;
export const apiKeyParamsSchema = {
  type: "object",
  required: ["id"],
  properties: { id: API_KEY_ID },
} as const satisfies ObjectSchema<ApiKeyParams>;

/** 발급한 API 키. 키 원문과 해시는 담지 않는다. */
export type ApiKeyDto = {
  id: string;
  name: string;
  /** 키 앞부분(접두어 포함 12자). 목록에서 키를 알아본다. */
  prefix: string;
  scope: ApiKeyScope;
  createdAt: string;
  /** 마지막으로 인증한 시각. 1분 단위로 기록한다. */
  lastUsedAt?: string;
  revokedAt?: string;
};
/** 발급 응답. 키 원문(`key`)은 이 응답에만 한 번 나온다. */
export type IssuedApiKeyDto = ApiKeyDto & { key: string };

const apiKeyProperties = {
  id: { ...API_KEY_ID, description: "API 키 ID" },
  name: STRING,
  prefix: {
    type: "string",
    description: "키 앞부분(접두어 포함 12자)",
  },
  scope: {
    type: "string",
    enum: ["channel"],
    description: "부를 수 있는 범위. `channel`은 `판매 채널 연동` API입니다.",
  },
  createdAt: ISO_TIME,
  lastUsedAt: {
    ...ISO_TIME,
    description: "마지막으로 인증한 시각(1분 단위)",
  },
  revokedAt: ISO_TIME,
} as const;
export const apiKeySchema = responseSchema<ApiKeyDto>(
  "ApiKey",
  "발급한 API 키. 키 원문은 담지 않습니다.",
  apiKeyProperties,
  { lastUsedAt: true, revokedAt: true },
);
export const issuedApiKeySchema = responseSchema<IssuedApiKeyDto>(
  "IssuedApiKey",
  "발급한 API 키와 키 원문. 원문은 이 응답에만 한 번 나옵니다.",
  {
    ...apiKeyProperties,
    key: {
      type: "string",
      pattern: "^fvk_[A-Za-z0-9_-]{32}$",
      description:
        "키 원문. `Authorization: Bearer <키>`로 보냅니다. 서버는 해시만 보관합니다.",
    },
  },
  { lastUsedAt: true, revokedAt: true },
);
