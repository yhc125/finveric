// 리포지토리: 판매 건·진단 원본·등록 기록·처리 기록의 조회·추가·저장, 변경 작업의 잠금.
// 저장 방식(로컬 파일, Upstash Redis)은 store.ts가 맡는다. 업무 모듈은 저장 방식을 모른다.
import type { Hex } from "viem";
import type { ApproveRequest, ReassessmentReason } from "@finveric/core/api";
import {
  json,
  type MockRecording,
  type Product,
  type RuleDocument,
  type Trace,
} from "@finveric/core";
import { CodedError } from "../errors.ts";
import { FileStore, type SaleStore } from "./store.ts";

/** 서버만 보관하는 처리 기록. */
export type StoredTrace = Trace;

/** 원장에 등록한 진단 기준 원문. */
export type StoredRule = {
  document: RuleDocument;
  hash: Hex;
  version: number;
  txHash?: Hex;
};
/** 원장에 등록한 상품 설명서 버전. */
export type StoredProduct = { product: Product; txHash?: Hex };
/**
 * 진단 회차의 원본. 답변과 임의값은 공개하지 않는다. 고객 원본 묶음에만 넣는다.
 * 거래를 보내기 전에 저장한다. 그래야 영수증을 받기 전에 서버가 멈춰도 원본이 남는다.
 */
export type StoredDiagnosis = {
  customerRef: Hex;
  attempt: number;
  ruleHash: Hex;
  answers: number[];
  reassessmentReason?: ReassessmentReason;
  salt: string;
  commitment: string;
  txHash?: Hex;
  blockNumber?: string;
};
/** 판매 건. 원장 상태(청약·확정·철회·결제)는 원장에서 읽는다. 여기에는 원장 밖의 값만 둔다. */
export type StoredSale = {
  id: string;
  customerRef: Hex;
  productId: Hex;
  productVersion: number;
  amount: number;
  createdAt: string;
  abandonedAt?: string;
  approval?: { attempt: number; signature: Hex };
  approvalReviews?: (ApproveRequest & {
    attempt: number;
    reviewedAt: string;
  })[];
  explanationSeconds?: number;
  recording?: MockRecording;
  traces: StoredTrace[];
};

/** 발급한 API 키. 키 원문은 저장하지 않고 SHA-256 해시만 둔다. */
export type StoredApiKey = {
  id: string;
  name: string;
  prefix: string;
  hash: string;
  scope: "channel";
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
};

/** 처리 기록 하나와 그 기록이 속한 판매 건. 등록·진단 기록은 판매 건이 없다. */
export type TraceEntry = { trace: StoredTrace; sale?: StoredSale };

type Snapshot = {
  sales: StoredSale[];
  systemTraces: Trace[];
  rules: StoredRule[];
  products: StoredProduct[];
  diagnoses: StoredDiagnosis[];
  apiKeys: StoredApiKey[];
};
const empty = (): Snapshot => ({
  sales: [],
  systemTraces: [],
  rules: [],
  products: [],
  diagnoses: [],
  apiKeys: [],
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseSnapshot(raw: string): Snapshot {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new CodedError("STORE_UNAVAILABLE");
  }
  if (!isRecord(data) || !Array.isArray(data.sales))
    throw new CodedError("STORE_UNAVAILABLE");

  const defaults = empty();
  // 이전 버전에서 빠진 목록은 기본값으로 채운다.
  for (const key of Object.keys(defaults)) {
    if (!Object.hasOwn(data, key)) continue;
    const records = data[key];
    if (!Array.isArray(records) || !records.every(isRecord))
      throw new CodedError("STORE_UNAVAILABLE");
  }
  return { ...defaults, ...data };
}

export class SaleRepository {
  private data: Snapshot = empty();
  private queue: Promise<unknown> = Promise.resolve();
  /** 이 인스턴스에서 대기 중이거나 실행 중인 변경 작업 수. */
  private active = 0;
  private locked = false;
  private persisting: Promise<void> = Promise.resolve();
  private persistError?: unknown;

  constructor(readonly store: SaleStore) {
    if (store instanceof FileStore) this.load(store.readSync());
  }
  get file() {
    return this.store instanceof FileStore ? this.store.file : undefined;
  }

  // ── 판매 건 ─────────────────────────────────────────────────

  /** 판매 건 목록. 최근 신청이 앞에 온다. */
  all(): readonly StoredSale[] {
    return this.data.sales;
  }
  find(id: string) {
    const record = this.data.sales.find((s) => s.id === id);
    if (!record) throw new CodedError("SALE_NOT_FOUND");
    return record;
  }
  add(record: StoredSale) {
    this.data.sales.unshift(record);
    this.save();
  }

  // ── 등록 기록과 진단 원본 ───────────────────────────────────

  rules(): readonly StoredRule[] {
    return this.data.rules;
  }
  addRule(rule: StoredRule) {
    this.data.rules.push(rule);
    this.save();
  }
  removeRule(rule: StoredRule) {
    this.data.rules = this.data.rules.filter((r) => r !== rule);
    this.save();
  }
  products(): readonly StoredProduct[] {
    return this.data.products;
  }
  addProduct(entry: StoredProduct) {
    this.data.products.push(entry);
    this.save();
  }
  removeProduct(entry: StoredProduct) {
    this.data.products = this.data.products.filter((p) => p !== entry);
    this.save();
  }
  diagnoses(customerRef?: Hex): readonly StoredDiagnosis[] {
    return customerRef
      ? this.data.diagnoses.filter(
          (d) => d.customerRef.toLowerCase() === customerRef.toLowerCase(),
        )
      : this.data.diagnoses;
  }
  addDiagnosis(diagnosis: StoredDiagnosis) {
    this.data.diagnoses.push(diagnosis);
    this.save();
  }
  removeDiagnosis(diagnosis: StoredDiagnosis) {
    this.data.diagnoses = this.data.diagnoses.filter((d) => d !== diagnosis);
    this.save();
  }

  // ── API 키 ──────────────────────────────────────────────────

  /** 발급한 API 키. 먼저 발급한 키가 앞에 온다. 필드를 바꾼 뒤에는 save()를 부른다. */
  apiKeys(): readonly StoredApiKey[] {
    return this.data.apiKeys;
  }
  addApiKey(key: StoredApiKey) {
    this.data.apiKeys.push(key);
    this.save();
  }

  // ── 처리 기록 ───────────────────────────────────────────────

  /** 처리 기록을 판매 건에, 판매 건이 없으면 등록·진단 기록에 붙인다. */
  addTrace(trace: Trace, sale?: Pick<StoredSale, "traces">) {
    (sale?.traces ?? this.data.systemTraces).push(trace);
    this.save();
  }
  /** 모든 처리 기록. 등록·진단 기록이 먼저 온다. */
  traces(): TraceEntry[] {
    return [
      ...this.data.systemTraces.map((trace) => ({ trace })),
      ...this.data.sales.flatMap((sale) =>
        sale.traces.map((trace) => ({ trace, sale })),
      ),
    ];
  }
  /** 저장소에 접근할 수 있는지 확인한다. 기록은 읽지 않는다. */
  ping() {
    return this.store.ping();
  }
  /** 제출했지만 영수증을 아직 대조하지 않은 거래가 있는지. */
  hasPendingTransaction() {
    return this.traces().some(
      ({ trace }) => trace.status === "pending" && trace.txHash,
    );
  }

  // ── 저장과 잠금 ─────────────────────────────────────────────

  private load(raw: string | undefined) {
    this.data = raw === undefined ? empty() : parseSnapshot(raw);
  }
  /**
   * 현재 상태를 저장한다. 기록의 필드를 바꾼 뒤에도 부른다.
   * 공유 저장소는 잠금 안에서만 쓴다. 조회 중 영수증 대조 결과는 메모리에만 반영한다.
   */
  save() {
    const data = json(this.data);
    if (this.store instanceof FileStore) return this.store.writeSync(data);
    if (!this.locked) return;
    this.persisting = this.persisting
      .then(() => this.store.write(data))
      .catch((error) => {
        this.persistError ??= error;
      });
  }
  private async flush() {
    await this.persisting;
    const error = this.persistError;
    this.persistError = undefined;
    if (error) throw error;
  }
  /**
   * 기록을 바꾸는 작업을 하나씩 실행한다.
   * 공유 저장소에서는 인스턴스 사이의 잠금을 잡고, 최신 기록을 읽은 뒤 실행한다.
   */
  transaction<T>(operation: () => Promise<T>): Promise<T> {
    this.active++;
    const run = () =>
      this.store.lock(async () => {
        this.locked = true;
        try {
          if (this.store.shared) this.load(await this.store.read());
          const result = await operation();
          await this.flush();
          return result;
        } catch (error) {
          // 실패 상태를 기록한 저장도 남긴다. 저장 실패보다 원래 오류를 먼저 알린다.
          await this.flush().catch(() => undefined);
          throw error;
        } finally {
          this.locked = false;
        }
      });
    const next = this.queue.then(run).finally(() => {
      this.active--;
    });
    this.queue = next.catch(() => {});
    return next;
  }
  /**
   * 조회 작업. 공유 저장소에서는 다른 인스턴스가 쓴 기록을 먼저 읽는다.
   * 이 인스턴스에서 변경 작업이 진행 중이면 메모리의 최신 상태를 그대로 쓴다.
   */
  async read<T>(operation: () => Promise<T>): Promise<T> {
    if (this.store.shared && this.active === 0) {
      const raw = await this.store.read();
      if (this.active === 0) this.load(raw);
    }
    return operation();
  }
}
