import { SelectField } from "../../shared/SelectField.tsx";
import { useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { diagnosisCounts } from "@finveric/core";
import type {
  CustomerDto,
  ApproveRequest,
  ProductEntryDto,
  SaleAction,
} from "@finveric/core/api";
import type { LoadState } from "../../shared/api.ts";
import { Button } from "../../shared/button.tsx";
import {
  Badge,
  Empty,
  Facts,
  Notice,
  type Tone,
  Skeleton,
} from "../../shared/components.tsx";
import { focusElement } from "../../shared/focus.ts";
import { dateTime, won } from "../../shared/format.ts";
import { StatusBadge } from "../../shared/sale-components.tsx";
import {
  awaitingApproval,
  nowSeconds,
  productName,
  profileName,
  saleProduct,
  type Sale,
} from "../../shared/sales.ts";
import ui from "../../shared/ui.module.css";
import { useKoreanDay } from "../../shared/useKoreanDay.ts";
import {
  DetailHeading,
  DiagnosisTable,
  FactsSkeleton,
  LoadingStatus,
} from "../components.tsx";
import { traceLabel, traceStatus } from "../traces.ts";
import local from "./operations.module.css";

const s = { ...ui, ...local };

function approvalText(sale: Sale) {
  if (sale.status === "abandoned") return "—";
  const attempt = sale.chain?.attempt ?? sale.latestAttempt;
  if (!sale.approvalRequired) return `대상 아님 · ${attempt || 0}회차`;
  if (sale.chain) return sale.chain.approved ? `승인 · ${attempt}회차` : "없음";
  return sale.approvedAttempt === sale.latestAttempt
    ? `승인 · ${attempt}회차`
    : sale.approvedAttempt
      ? `다시 필요 · ${sale.approvedAttempt}회차 승인 뒤 ${attempt}회차 진단`
      : `필요 · ${attempt}회차`;
}

function SaleDetailSkeleton() {
  return (
    <div aria-hidden="true">
      <div className={s.reviewGrid}>
        <div className={`${s.panel} ${s.pad}`}>
          <div className={s.row}>
            <Skeleton width="56%" height="1.25rem" />
            <Skeleton width="3rem" height="1.25rem" />
          </div>
          <FactsSkeleton
            widths={[
              "76%",
              "68%",
              "6rem",
              "7rem",
              "3rem",
              "5rem",
              "8rem",
              "3rem",
              "5rem",
              "4rem",
            ]}
          />
        </div>
        <div className={s.stack}>
          <div className={`${s.panel} ${s.pad} ${s.detailSkeletonCard}`}>
            <Skeleton width="6rem" height="1.25rem" />
            <Skeleton width="75%" />
            <FactsSkeleton widths={["7rem"]} />
            <Skeleton width="7.5rem" height="2.5rem" />
          </div>
          <div className={`${s.panel} ${s.pad}`}>
            <Skeleton width="5.5rem" height="1.25rem" />
            <FactsSkeleton widths={["50%", "45%", "52%"]} />
          </div>
        </div>
      </div>
      <div
        className={`${s.panel} ${s.pad} ${s.spaced} ${s.detailSkeletonCard}`}
      >
        <Skeleton width="5rem" height="1.25rem" />
        <Skeleton width="55%" />
      </div>
    </div>
  );
}

/** 판매 건의 회차 이력과 필수 확인, 관리자 승인, 타임라인. */
export function SaleDetail({
  load,
  sales,
  products,
  customer,
  busy,
  action,
}: {
  load: LoadState;
  sales: Sale[];
  products: ProductEntryDto[];
  customer?: CustomerDto;
  busy: boolean;
  action: (
    id: string,
    name: SaleAction,
    label: string,
    done?: string,
    body?: ApproveRequest,
  ) => Promise<unknown>;
}) {
  const { saleId } = useParams();
  const koreanDay = useKoreanDay();
  const sale = sales.find((entry) => entry.id === saleId);
  const reviewContext = `${saleId}:${sale?.latestAttempt}`;
  const [review, setReview] = useState<{
    context?: string;
    request: ApproveRequest;
  }>({ request: {} });
  const approvalRequest =
    review.context === reviewContext ? review.request : {};
  const updateReview = (change: ApproveRequest) =>
    setReview({
      context: reviewContext,
      request: { ...approvalRequest, ...change },
    });
  const { search } = useLocation();
  const heading = (
    <>
      <DetailHeading
        title="판매 건 상세"
        backTo={{ pathname: "/review", search }}
        backLabel="판매 건 목록"
      />
      <LoadingStatus loading={load === "loading"}>
        판매 건을 불러오고 있습니다.
      </LoadingStatus>
    </>
  );

  if (!sale)
    return (
      <>
        {heading}
        {load === "loading" ? (
          <SaleDetailSkeleton />
        ) : load === "failed" ? (
          <Empty
            title="판매 건을 불러오지 못했습니다"
            text="연결을 확인하고 화면을 새로 고치세요."
          />
        ) : (
          <Empty
            title="판매 건을 찾을 수 없습니다"
            text="판매 건 목록에서 다른 기록을 선택하세요."
          />
        )}
      </>
    );

  const now = nowSeconds();
  const product = saleProduct(products, sale);
  const knownCustomer =
    !!customer && customer.ref.toLowerCase() === sale.customerRef.toLowerCase();
  const diagnoses = knownCustomer ? customer.diagnoses : [];
  const counts = diagnosisCounts(diagnoses, koreanDay);
  const usedAttempt = sale.chain?.attempt;
  const usedDiagnosis = diagnoses.find(
    (diagnosis) => diagnosis.attempt === (usedAttempt ?? sale.latestAttempt),
  );
  const timeline = [
    ...diagnoses.map((diagnosis) => ({
      key: `d${diagnosis.attempt}`,
      at: diagnosis.at * 1000,
      label: `진단 ${diagnosis.attempt}회차 기록 · ${profileName(diagnosis.profile)}`,
      status: ["완료", "success"] as [string, Tone],
    })),
    ...sale.traces
      .filter((trace) => trace.action !== "recordDiagnosis")
      .map((trace) => ({
        key: trace.id,
        at: Date.parse(trace.at),
        label: traceLabel(trace),
        status: traceStatus(trace),
      })),
  ].sort((a, b) => a.at - b.at);

  return (
    <>
      {heading}
      {/* 판매 건 기록(왼쪽)과 승인·타임라인(오른쪽)을 비슷한 높이로 나란히 둔다. 진단 회차 표는 아래 화면 너비의 줄에 둔다. */}
      <div className={s.reviewGrid}>
        <section className={`${s.panel} ${s.pad}`}>
          <div className={s.row}>
            <h2>
              {productName(product?.document)} v{sale.productVersion}
            </h2>
            <StatusBadge sale={sale} now={now} />
          </div>
          <Facts
            rows={[
              ["판매 ID", <code>{sale.id}</code>],
              ["고객 가명 ID", <code>{sale.customerRef}</code>],
              ["청약 금액", won(sale.amount)],
              [
                sale.chain ? "청약 회차" : "최신 회차",
                `${usedAttempt ?? sale.latestAttempt}회차 · ${profileName(usedDiagnosis?.profile)}`,
              ],
              [
                "적합성",
                sale.suitable === undefined
                  ? "진단 전"
                  : sale.suitable
                    ? "적합"
                    : sale.chain
                      ? `부적합 · 추가 위험 확인 ${sale.chain.higherRiskConfirmed ? "기록" : "없음"}`
                      : "부적합 · 추가 위험 확인 필요",
              ],
              [
                "녹취·숙려 대상",
                sale.protectedSale === undefined
                  ? "—"
                  : sale.protectedSale
                    ? sale.chain
                      ? `대상 · 녹취 지문 ${/^0x0+$/.test(sale.chain.recordingHash) ? "없음" : "기록"}`
                      : "대상"
                    : "대상 아님",
              ],
              [
                "숙려 종료",
                sale.coolingEndsAt ? dateTime(sale.coolingEndsAt) : "—",
              ],
              [
                "설명 확인 시간",
                sale.chain ? `${sale.chain.explanationSeconds}초` : "청약 전",
              ],
              ["관리자 승인", approvalText(sale)],
              [
                "결제 기록",
                sale.settled
                  ? "기록"
                  : sale.status === "confirmed"
                    ? "대기"
                    : "—",
              ],
            ]}
          />
          {awaitingApproval(sale) && (
            <Notice tone="warning">
              {sale.latestAttempt}회차 진단한 고객입니다. 회차 이력과 위험
              신호를 확인한 뒤 승인하세요. 승인은 이 판매 ID와 최신 회차에
              묶입니다.
            </Notice>
          )}
        </section>
        <div className={s.stack}>
          <section className={`${s.panel} ${s.pad}`}>
            {/* 승인하면 버튼이 사라진다. 초점은 이 제목으로 옮긴다. */}
            <h2 id="approval-title" tabIndex={-1}>
              관리자 승인
            </h2>
            <p>
              FINVERIC 자체 내부통제 정책에 따라 누적 3회차 이상 진단한 고객의
              청약은 소비자보호 담당의 승인이 필요합니다. 일별 횟수와 별개이며
              법정 횟수 기준이 아닙니다.
            </p>
            {knownCustomer && (
              <p>
                오늘 진단 {counts.dailyDiagnoses}회 · 그중 재진단{" "}
                {counts.dailyReassessments}회 (한국 시간)
              </p>
            )}
            <Facts rows={[["승인 상태", approvalText(sale)]]} />
            {awaitingApproval(sale) && (
              <div className={s.stack}>
                <SelectField
                  label="승인 사유 (선택)"
                  value={approvalRequest.reason ?? ""}
                  blocked={busy}
                  options={[
                    { value: "", label: "선택하지 않음" },
                    {
                      value: "correction_reviewed",
                      label: "응답 정정 사유 검토",
                    },
                    {
                      value: "circumstances_reviewed",
                      label: "상황 변경 사유 검토",
                    },
                    {
                      value: "reconfirmation_reviewed",
                      label: "재확인 사유 검토",
                    },
                  ]}
                  onChange={(value) =>
                    updateReview({
                      reason: (value || undefined) as ApproveRequest["reason"],
                    })
                  }
                />
                <fieldset>
                  <legend>검토 근거 (선택)</legend>
                  {(
                    [
                      ["diagnosis_history", "진단 회차 이력"],
                      ["risk_signals", "위험 신호"],
                      ["customer_confirmation", "고객 확인 자료"],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={value} className={s.field}>
                      <input
                        type="checkbox"
                        checked={
                          approvalRequest.reviewBasis?.includes(value) ?? false
                        }
                        aria-disabled={busy}
                        onChange={(event) => {
                          if (busy) return;
                          const basis = (
                            approvalRequest.reviewBasis ?? []
                          ).filter((item) => item !== value);
                          if (event.target.checked) basis.push(value);
                          updateReview({
                            reviewBasis: basis.length ? basis : undefined,
                          });
                        }}
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
                <p className={s.small}>
                  선택한 사유·근거와 승인 시각은 오프체인에 보관합니다. 검토
                  사실 자체를 증명하지는 않습니다.
                </p>
              </div>
            )}
            {awaitingApproval(sale) && (
              <Button
                busy={busy}
                onClick={async () => {
                  const approved = await action(
                    sale.id,
                    "approve",
                    "관리자 승인 서명을 만들고 있습니다",
                    "관리자 승인을 기록했습니다.",
                    { ...approvalRequest, expectedAttempt: sale.latestAttempt },
                  );
                  if (approved) focusElement("approval-title");
                }}
              >
                회차 이력을 확인하고 승인
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link to="/chain">처리 근거 보기</Link>
            </Button>
          </section>
          <section className={`${s.panel} ${s.pad}`}>
            <h2>타임라인</h2>
            <ol className={s.timeline}>
              {timeline.map((item) => (
                <li key={item.key}>
                  <time>{dateTime(new Date(item.at).toISOString())}</time>
                  <span className={s.timelineLabel}>{item.label}</span>
                  <Badge tone={item.status[1]}>{item.status[0]}</Badge>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
      {knownCustomer ? (
        <section className={`${s.panel} ${s.spaced}`}>
          <DiagnosisTable
            diagnoses={diagnoses}
            used={usedAttempt}
            caption="진단 회차"
          />
        </section>
      ) : (
        <section className={`${s.panel} ${s.pad} ${s.spaced}`}>
          <h2>진단 회차</h2>
          <p>
            이 판매 건의 고객 번호를 연결하지 않아 진단 회차를 표시하지
            않습니다.
          </p>
        </section>
      )}
    </>
  );
}
