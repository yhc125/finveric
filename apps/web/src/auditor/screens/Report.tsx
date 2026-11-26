import { useState } from "react";
import { Link } from "react-router";
import { FileText } from "lucide-react";
import { SIGNAL_KINDS, SIGNAL_LABELS, type Deployment } from "@finveric/core";
import { ledgerReadCode } from "@finveric/core/ledger";
import { OUTCOME_LABELS, type VerifyOutcome } from "@finveric/core/verify";
import { Button } from "../../shared/button.tsx";
import {
  Disclosure,
  Badge,
  DetailColumn,
  DetailRow,
  Facts,
  Notice,
  Stat,
  TableScroll,
  type Tone,
} from "../../shared/components.tsx";
import { dateTime } from "../../shared/format.ts";
import ui from "../../shared/ui.module.css";
import local from "../auditor.module.css";
import { Ratio } from "../components.tsx";
import { ledgerNotice, salePath, short } from "../format.ts";
import { buildReport, type AuditReport } from "../report.ts";
import { ReportDownloads } from "../ReportDownloads.tsx";
import type { Ledger } from "../useLedger.ts";

const s = { ...ui, ...local };
const OUTCOME_TONES: Record<VerifyOutcome, Tone> = {
  match: "success",
  mismatch: "warning",
  missing: "neutral",
};

/** 보고서. 범위 안의 판매 건을 브라우저에서 독립 검증하고 JSON·CSV로 내려받는다. */
export function Report({
  deployment,
  ledger,
}: {
  deployment?: Deployment;
  ledger: Ledger;
}) {
  const [generated, setReport] = useState<{
    deployment: Deployment;
    report: AuditReport;
  }>();
  const [progress, setProgress] = useState<[number, number]>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(false);
  const [loading, setLoading] = useState(false);
  const busy = loading && !!progress && progress[0] < progress[1];
  const confirmed = ledger.snapshot?.sales.filter(
    (sale) => sale.status === "confirmed",
  ).length;
  const report =
    generated?.deployment === deployment ? generated?.report : undefined;
  const build = async () => {
    if (loading || !deployment || ledger.needsConfiguration || confirmed === 0)
      return;
    setLoading(true);
    setReport(undefined);
    setError("");
    setProgress(undefined);
    setRetry(false);
    try {
      const read = await ledger.reload();
      if (!read.ok) {
        setRetry(!read.needsConfiguration);
        return;
      }
      const report = await buildReport(deployment, read, (done, total) =>
        setProgress([done, total]),
      );
      setReport({ deployment, report });
    } catch (e) {
      setRetry(true);
      setError(
        ledgerNotice(
          "판매 건을 대조하지 못해 보고서를 만들지 못했습니다. 보고서를 다시 만드세요.",
          ledgerReadCode(e),
        ),
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className={s.page}>
      <div className={s.verifyGrid}>
        <form
          className={`${s.panel} ${s.pad}`}
          onSubmit={(e) => {
            e.preventDefault();
            void build();
          }}
        >
          <h2>가입 확정 전체</h2>
          <p className={s.intro}>
            {confirmed === undefined
              ? "원장을 읽으면 건수를 표시합니다."
              : confirmed === 0
                ? "원장에 가입을 확정한 판매 건이 없습니다."
                : `원장에서 가입을 확정한 ${confirmed.toLocaleString("ko-KR")}건을 대조합니다.`}
          </p>
          <Button
            type="submit"
            busy={loading}
            blocked={
              !deployment ||
              ledger.needsConfiguration ||
              confirmed === undefined ||
              confirmed === 0
            }
          >
            {loading ? (
              progress ? (
                `${progress[0]}/${progress[1]}건 대조 중`
              ) : (
                "원장을 읽는 중"
              )
            ) : (
              <>
                {retry ? "보고서 다시 만들기" : "보고서 만들기"}
                <FileText size={16} data-icon="end" />
              </>
            )}
          </Button>
          <p className={s.small}>
            한 건을 대조하거나 제출 자료를 확인하려면{" "}
            <Link to="/disputes">분쟁 조회</Link>에서 확인하세요.
          </p>
        </form>
        <section className={`${s.panel} ${s.pad}`}>
          {/* 만드는 중과 끝남을 화면 낭독기에 짧게 알린다. 오류 자리는 늘 그려 둔다. */}
          <p role="status" className={s.srOnly}>
            {loading
              ? "보고서를 만들고 있습니다."
              : report
                ? "보고서를 만들었습니다. JSON과 CSV로 내려받을 수 있습니다."
                : ""}
          </p>
          <div role="alert">
            {(error || ledger.error) && (
              <Notice tone="danger">{error || ledger.error}</Notice>
            )}
          </div>
          {report ? (
            <ReportSummary report={report} />
          ) : (
            !(error || ledger.error) && (
              <>
                <h2>보고서 미리보기</h2>
                <p className={s.intro}>
                  {busy
                    ? "판매 건마다 원장 기록을 대조하고 있습니다."
                    : "보고서 만들기를 누르면 일괄 대조 결과를 표시합니다."}
                </p>
              </>
            )
          )}
        </section>
      </div>
      {/* 열이 많은 표는 화면 너비의 줄에 둔다. 1440px에서 옆으로 스크롤하지 않는다. */}
      {report && <ReportTable report={report} />}
    </div>
  );
}

/** 보고서 요약: 대조 결과 수치, 일치 비율, 원장 요약. 오른쪽 패널에 둔다. */
function ReportSummary({ report }: { report: AuditReport }) {
  const { summary, source } = report;
  const total = report.sales.length;
  return (
    <>
      <div className={s.row}>
        <h2>보고서 미리보기</h2>
        <ReportDownloads getReport={() => report} />
      </div>
      <div className={`${s.stats} ${s.reportStats}`}>
        <Stat label="대조한 판매 건" value={total} unit="건" />
        {(["match", "mismatch", "missing"] as const).map((outcome) => (
          <Stat
            key={outcome}
            label={OUTCOME_LABELS[outcome]}
            value={summary.verified[outcome]}
            unit="건"
          />
        ))}
      </div>
      <Ratio
        label="일치 비율"
        part={summary.verified.match}
        whole={total}
        note={`대조한 판매 건 ${total}건 중 원장 기록과 일치한 ${summary.verified.match}건`}
        inPad
      />
      <Facts
        rows={[
          ["범위", `가입 확정 전체 · ${total}건`],
          [
            "원장 요약",
            `기준 ${summary.rules}개 버전 · 상품 설명서 ${summary.productVersions}개 버전 · 진단 ${summary.diagnoses}회 · 고객 가명 ID ${summary.customers}명`,
          ],
          [
            "원장 전체 판매 건",
            `가입 확정 ${summary.sales.confirmed}건 · 숙려 중·확인 대기 ${summary.sales.subscribed}건 · 철회 ${summary.sales.withdrawn}건`,
          ],
          [
            "위험 신호",
            SIGNAL_KINDS.map(
              (kind) =>
                `${SIGNAL_LABELS[kind]} ${summary.signals[SIGNAL_LABELS[kind]] ?? 0}건`,
            ).join(" · "),
          ],
          ["만든 시각", dateTime(report.generatedAt)],
        ]}
      />
      <Disclosure
        className={s.technicalDetails}
        label="대조에 사용한 원장 정보"
      >
        <Facts
          rows={[
            ["원장 주소", <code>{source.ledger}</code>],
            ["마지막 조회 블록", source.latestBlock],
            ["연결 주소(RPC)", <code>{source.rpcUrl}</code>],
          ]}
        />
      </Disclosure>
    </>
  );
}

/** 판매 건별 대조 결과. 열이 여덟 개라 화면 너비의 패널에 둔다. */
function ReportTable({ report }: { report: AuditReport }) {
  return (
    <TableScroll
      as="section"
      label="판매 건별 대조 결과"
      className={`${s.panel} ${s.section}`}
    >
      <table>
        <caption className={s.tableCaption}>판매 건별 대조 결과</caption>
        <thead>
          <tr>
            <th scope="col">판매 ID</th>
            <th scope="col">상품</th>
            <th scope="col">회차</th>
            <th scope="col">적합</th>
            <th scope="col">상태</th>
            <th scope="col">대조 결과</th>
            <th scope="col">확인 필요 항목</th>
            <th scope="col">위험 신호</th>
            <DetailColumn label="판매 건 대조" />
          </tr>
        </thead>
        <tbody>
          {report.sales.map((sale) => {
            const failed = sale.checks.filter((check) => !check.ok);
            return (
              <DetailRow
                key={sale.saleId}
                destination={{
                  to: salePath(sale.saleId),
                  label: `판매 건 대조 · ${short(sale.saleId)}`,
                }}
              >
                <td>
                  <code title={sale.saleId}>{short(sale.saleId)}</code>
                </td>
                <td className={s.wrap}>
                  {sale.product
                    ? `${sale.product} v${sale.productVersion}`
                    : "—"}
                </td>
                <td>{sale.attempt ? `${sale.attempt}회차` : "—"}</td>
                <td>
                  {sale.outcome === "missing"
                    ? "—"
                    : sale.suitable
                      ? "적합"
                      : "부적합"}
                </td>
                <td>{sale.status}</td>
                <td>
                  <Badge tone={OUTCOME_TONES[sale.outcome]}>
                    {sale.outcomeLabel}
                  </Badge>
                </td>
                <td className={s.wrap}>
                  {failed.length
                    ? failed.map((check) => check.name).join(", ")
                    : "—"}
                </td>
                <td className={s.wrap}>
                  {sale.signals.length ? sale.signals.join(", ") : "—"}
                </td>
              </DetailRow>
            );
          })}
        </tbody>
      </table>
      {report.sales.length === 0 && (
        <p className={s.panelNote}>범위 안에 판매 건이 없습니다.</p>
      )}
    </TableScroll>
  );
}
