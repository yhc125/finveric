// 관리자 승인: 3회차 이상 진단한 고객의 청약 전에 소비자보호 담당이 회차 이력을 보고 서명한다.
// 서명은 원장 거래 없이 보관하고, 고객의 청약 거래에 함께 담는다. 원장이 승인자 키로 확인한다.
import { approvalDigest } from "@finveric/core";
import type { ApproveRequest } from "@finveric/core/api";
import { CodedError } from "../errors.ts";
import type { FundService } from "../service.ts";
import type { StoredSale } from "../repositories/sales.ts";
import { readAttemptCount, signApproval } from "../gateways/ledger.ts";
import { ensureDraft } from "./enrollment.ts";
import { note } from "./transactions.ts";

export async function approve(
  svc: FundService,
  record: StoredSale,
  request: ApproveRequest = {},
) {
  await ensureDraft(svc, record);
  const attempt = await readAttemptCount(svc, record.customerRef);
  if (
    request.expectedAttempt !== undefined &&
    request.expectedAttempt !== attempt
  )
    throw new CodedError("APPROVAL_ATTEMPT_CHANGED");
  if (attempt < 3) throw new CodedError("APPROVAL_NOT_NEEDED");
  if (record.approval?.attempt === attempt) return;
  const previousApproval = record.approval;
  const previousReviews = record.approvalReviews;
  const previousTraceCount = record.traces.length;
  record.approval = {
    attempt,
    signature: await signApproval(
      svc,
      approvalDigest(svc.dep, record.id, record.customerRef, attempt),
    ),
  };
  // FINVERIC 자체 정책의 검토 기록. 재승인 이력은 유지하고 공개 trace에는 넣지 않는다.
  record.approvalReviews = [
    ...(previousReviews ?? []),
    {
      attempt,
      reviewedAt: new Date().toISOString(),
      ...(request.reason ? { reason: request.reason } : {}),
      ...(request.reviewBasis ? { reviewBasis: [...request.reviewBasis] } : {}),
    },
  ];
  try {
    note(
      svc,
      {
        source: "approver",
        action: "관리자 승인 서명",
        status: "confirmed",
        detail: { attempt },
      },
      record,
    );
  } catch (error) {
    // 파일 저장이 실패하면 같은 회차의 재요청이 다시 저장할 수 있어야 한다.
    record.approval = previousApproval;
    record.approvalReviews = previousReviews;
    record.traces.length = previousTraceCount;
    throw error;
  }
}
