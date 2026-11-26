// 판매 채널: 고객 가명 ID, 투자성향 진단 회차 기록(증명 생성 → 판매사 키로 원장 기록).
import type { Hex } from "viem";
import {
  answersFit,
  customerRefFor,
  evaluateRule,
  fieldHex,
} from "@finveric/core";
import type {
  CustomerView,
  DiagnoseRequest,
  DiagnosisView,
} from "@finveric/core/api";
import { CodedError } from "../errors.ts";
import type { FundService } from "../service.ts";
import type { StoredDiagnosis } from "../repositories/sales.ts";
import { readAttemptCount, readDiagnosis } from "../gateways/ledger.ts";
import { prove, randomField } from "../gateways/proofs.ts";
import { latestRule } from "./rules.ts";
import { ensureNoPending, note, send } from "./transactions.ts";

/** 고객 번호의 가명 ID. 판매사 비밀값이 없으면 다시 만들 수 없다. */
export const customerRef = (svc: FundService, customerNo: string) =>
  customerRefFor(svc.env.customerRefSecret, customerNo);

/** 원장의 회차 기록에 판매 기록의 거래 해시와 블록을 붙인다. */
export async function diagnosisView(
  svc: FundService,
  ref: Hex,
  attempt: number,
): Promise<DiagnosisView> {
  const chain = await readDiagnosis(svc, ref, attempt);
  const stored = svc.repository
    .diagnoses(ref)
    .find(
      (entry) =>
        entry.attempt === attempt &&
        entry.commitment === chain.commitment.toString(),
    );
  const block =
    stored?.blockNumber ??
    svc.repository
      .traces()
      .find(({ trace }) => !!stored?.txHash && trace.txHash === stored.txHash)
      ?.trace.blockNumber;
  return {
    attempt,
    ruleHash: fieldHex(chain.ruleHash),
    commitment: chain.commitment,
    profile: chain.profile,
    limit: chain.limit,
    elderly: chain.elderly,
    at: Number(chain.recordedAt),
    ...(stored?.txHash ? { txHash: stored.txHash } : {}),
    ...(block ? { block: BigInt(block) } : {}),
  };
}

/** 고객 가명 ID와 원장의 모든 진단 회차. */
export async function customer(
  svc: FundService,
  customerNo: string,
): Promise<CustomerView> {
  const ref = customerRef(svc, customerNo);
  const count = await readAttemptCount(svc, ref);
  const diagnoses = await Promise.all(
    Array.from({ length: count }, (_, i) => diagnosisView(svc, ref, i + 1)),
  );
  return { number: customerNo, ref, diagnoses };
}

/**
 * 진단 한 회차. 원장의 최신 기준으로 판정하고 증명을 만든 뒤 판매사 키로 기록한다.
 * 회차 번호는 원장의 다음 회차다. 가입을 중단하고 다시 시작해도 이어진다.
 */
export async function diagnose(
  svc: FundService,
  customerNo: string,
  { answers, reassessmentReason }: DiagnoseRequest,
): Promise<DiagnosisView> {
  const ref = customerRef(svc, customerNo);
  const rule = await latestRule(svc);
  if (!answersFit(rule.document, answers))
    throw new CodedError("ANSWERS_NOT_MATCHING_RULE");
  await ensureNoPending(svc);
  const attempt = (await readAttemptCount(svc, ref)) + 1;
  const salt = randomField();
  const context = {
    chainId: svc.dep.chainId,
    ledger: svc.dep.ledger,
    customerRef: ref,
    attempt,
    ruleHash: rule.hash,
  };
  const expected = evaluateRule(rule.document, answers);
  const proofTrace = note(svc, {
    source: "Groth16 · BN254",
    action: "증명 생성",
    status: "pending",
    customerRef: ref,
  });
  let proven: Awaited<ReturnType<typeof prove>>;
  try {
    proven = await prove(rule.document, answers, salt, context);
    if (
      proven.signals.profile !== BigInt(expected.profile) ||
      proven.signals.limit !== BigInt(expected.limit) ||
      proven.signals.elderly !== (expected.elderly ? 1n : 0n)
    )
      throw new Error("증명의 판정이 서버 판정과 다릅니다.");
  } catch {
    proofTrace.status = "failed";
    svc.repository.save();
    throw new CodedError("PROOF_GENERATION_FAILED");
  }
  proofTrace.status = "confirmed";
  // 공개 신호만 남긴다. 답변·임의값·총점은 넣지 않는다.
  proofTrace.detail = {
    publicSignals: proven.publicSignals,
    protocol: "groth16",
    curve: "bn128",
    ms: proven.ms,
  };
  const stored: StoredDiagnosis = {
    customerRef: ref,
    attempt,
    ruleHash: rule.hash,
    answers: [...answers],
    ...(attempt > 1 && reassessmentReason ? { reassessmentReason } : {}),
    salt,
    commitment: proven.signals.commitment.toString(),
  };
  svc.repository.addDiagnosis(stored);
  try {
    const { receipt } = await send(
      svc,
      "seller",
      "recordDiagnosis",
      [
        BigInt(ref),
        attempt,
        BigInt(rule.hash),
        proven.signals.commitment,
        expected.profile,
        expected.limit,
        expected.elderly,
        proven.proof,
      ],
      {
        event: "DiagnosisRecorded",
        match: (log) =>
          log.eventName === "DiagnosisRecorded" &&
          log.args.customerRef === BigInt(ref) &&
          log.args.attempt === attempt &&
          log.args.commitment === proven.signals.commitment,
        customerRef: ref,
        onSubmitted: (hash) => {
          stored.txHash = hash;
        },
      },
    );
    stored.blockNumber = receipt.blockNumber.toString();
    svc.repository.save();
  } catch (error) {
    // 영수증을 기다리는 거래가 있으면 원본을 남긴다. 거절·실패면 지운다.
    const pending = svc.repository
      .traces()
      .some(
        ({ trace }) =>
          !!stored.txHash &&
          trace.txHash === stored.txHash &&
          trace.status === "pending",
      );
    if (!pending) svc.repository.removeDiagnosis(stored);
    throw error;
  }
  return diagnosisView(svc, ref, attempt);
}
