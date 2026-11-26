// 가입 기록: 판매 건 조회, 처리 기록, 고객 증빙(증명서·원본 묶음).
import {
  fieldHex,
  isProtectedSale,
  isSuitable,
  SALE_STATUSES,
  type EvidenceReceipt,
  type OriginalAttempt,
  type OriginalBundle,
  type Trace,
} from "@finveric/core";
import type { SaleStatus, SaleView } from "@finveric/core/api";
import { CodedError } from "../errors.ts";
import type { FundService } from "../service.ts";
import type { StoredSale } from "../repositories/sales.ts";
import {
  readAttemptCount,
  readDiagnosis,
  readSale,
} from "../gateways/ledger.ts";
import { storedProduct } from "./products.ts";
import { reconcile } from "./transactions.ts";

/** 판매 건. 청약 뒤 상태는 원장에서 읽는다. 고객 번호·답변·임의값·서명 원문은 넣지 않는다. */
export async function publicSale(
  svc: FundService,
  record: StoredSale,
): Promise<SaleView> {
  const [chain, latestAttempt] = await Promise.all([
    readSale(svc, record.id),
    readAttemptCount(svc, record.customerRef),
  ]);
  const subscribed = chain.status !== 0;
  let suitable: boolean | undefined;
  let protectedSale: boolean | undefined;
  if (subscribed) {
    suitable = chain.suitable;
    protectedSale = chain.protectedSale;
  } else if (latestAttempt > 0) {
    const product = storedProduct(svc, record.productId, record.productVersion);
    const diagnosis = await readDiagnosis(
      svc,
      record.customerRef,
      latestAttempt,
    );
    suitable = isSuitable(product.document.riskGrade, diagnosis.limit);
    protectedSale = isProtectedSale(product.document, diagnosis, suitable);
  }
  const status: SaleStatus = subscribed
    ? (SALE_STATUSES[chain.status] as SaleStatus)
    : record.abandonedAt
      ? "abandoned"
      : "draft";
  const attempt = subscribed ? chain.attempt : latestAttempt;
  return {
    id: record.id,
    customerRef: record.customerRef,
    productId: record.productId,
    productVersion: record.productVersion,
    amount: record.amount,
    createdAt: record.createdAt,
    status,
    latestAttempt,
    approvalRequired: attempt >= 3,
    ...(record.approvalRequested ? { approvalRequested: true } : {}),
    ...(record.approval ? { approvedAttempt: record.approval.attempt } : {}),
    ...(suitable === undefined ? {} : { suitable, protectedSale }),
    ...(subscribed && chain.protectedSale
      ? { coolingEndsAt: Number(chain.subscribedAt) + svc.dep.coolingPeriod }
      : {}),
    settled: chain.settledAt > 0n,
    ...(subscribed ? { chain } : {}),
    submissionPending: record.traces.some(
      (trace) => trace.status === "pending" && !!trace.txHash,
    ),
    traces: record.traces,
  };
}

/** 모든 처리 기록을 시간순으로 돌려준다. 대기 중인 거래는 먼저 영수증을 대조한다. */
export async function publicTraces(svc: FundService): Promise<Trace[]> {
  await reconcile(svc);
  return svc.repository
    .traces()
    .map(({ trace }) => trace)
    .sort((a, b) => a.at.localeCompare(b.at));
}

async function subscribedRecord(
  svc: FundService,
  id: string,
  customerNo?: string,
) {
  const record = svc.find(id, customerNo);
  if (record.traces.some((t) => t.status === "pending" && t.txHash))
    await reconcile(svc);
  const chain = await readSale(svc, record.id);
  if (chain.status === 0) throw new CodedError("EXPORT_NOT_ALLOWED");
  return { record, chain };
}
const confirmedTx = (record: StoredSale, action: string) =>
  record.traces.find(
    (trace) => trace.action === action && trace.status === "confirmed",
  )?.txHash;

/** 고객 증명서. 원장 주소, 판매 ID, 상품 버전, 회차, 기준, 금액, 거래를 담는다. */
export async function receipt(
  svc: FundService,
  id: string,
  customerNo?: string,
): Promise<EvidenceReceipt> {
  const { record, chain } = await subscribedRecord(svc, id, customerNo);
  const product = storedProduct(svc, chain.productId, chain.productVersion);
  const diagnosis = await readDiagnosis(svc, record.customerRef, chain.attempt);
  const subscribeTx = confirmedTx(record, "subscribe");
  if (!subscribeTx) throw new CodedError("SUBSCRIPTION_TX_NOT_FOUND");
  const confirmTx =
    chain.status === 2 ? confirmedTx(record, "confirm") : undefined;
  return {
    format: "finveric-receipt-v5",
    saleId: id,
    chainId: svc.dep.chainId,
    ledger: svc.dep.ledger,
    customerRef: record.customerRef,
    productId: chain.productId,
    productVersion: chain.productVersion,
    documentHash: product.documentHash,
    attempt: chain.attempt,
    ruleHash: fieldHex(diagnosis.ruleHash),
    amount: chain.amount.toString(),
    subscribeTx,
    ...(confirmTx ? { confirmTx } : {}),
    issuedAt: new Date().toISOString(),
  };
}

/** 고객과 판매사가 보관하는 원본 묶음. 청약 회차까지 모든 회차의 답변·임의값과 설명서, 녹취록. */
export async function original(
  svc: FundService,
  id: string,
  customerNo?: string,
): Promise<OriginalBundle> {
  const { record, chain } = await subscribedRecord(svc, id, customerNo);
  const attempts: OriginalAttempt[] = [];
  for (let attempt = 1; attempt <= chain.attempt; attempt++) {
    const onchain = await readDiagnosis(svc, record.customerRef, attempt);
    const stored = svc.repository
      .diagnoses(record.customerRef)
      .find(
        (entry) =>
          entry.attempt === attempt &&
          entry.commitment === onchain.commitment.toString(),
      );
    if (!stored)
      throw new CodedError(
        "STORED_RECORD_MISMATCH",
        `${attempt}회차 진단 원본이 판매 기록에 없습니다.`,
      );
    attempts.push({
      attempt,
      ruleHash: stored.ruleHash,
      answers: stored.answers,
      salt: stored.salt,
    });
  }
  return {
    format: "finveric-original-v5",
    saleId: id,
    customerRef: record.customerRef,
    attempts,
    productDocument: storedProduct(svc, chain.productId, chain.productVersion)
      .document,
    ...(record.recording ? { recording: record.recording } : {}),
    explanationSeconds: chain.explanationSeconds,
  };
}
