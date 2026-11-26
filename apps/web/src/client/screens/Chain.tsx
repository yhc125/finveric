import { useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { ExternalLink, RefreshCw } from "lucide-react";
import type { Deployment } from "@finveric/core";
import type { ProductEntryDto, TraceDto } from "@finveric/core/api";
import type { LoadState } from "../../shared/api.ts";
import { Button } from "../../shared/button.tsx";
import {
  Disclosure,
  Badge,
  Facts,
  FilterChip,
  Heading,
  Notice,
} from "../../shared/components.tsx";
import { dateTime, short } from "../../shared/format.ts";
import ui from "../../shared/ui.module.css";
import local from "./operations.module.css";
import { productName, saleProduct, type Sale } from "../../shared/sales.ts";
import {
  ledgerRejection,
  receiptEvents,
  sourceLabel,
  TRACE_GROUPS,
  traceGroup,
  traceLabel,
  traceStatus,
  type TraceGroup,
} from "../traces.ts";

const s = { ...ui, ...local };
const GROUPS = Object.keys(TRACE_GROUPS) as TraceGroup[];

/** 증명 생성 기록의 공개 신호와 생성 시간. */
function proofDetail(trace: TraceDto) {
  const detail = trace.detail as { ms?: number; publicSignals?: string[] };
  return trace.action === "증명 생성" &&
    detail &&
    typeof detail === "object" &&
    Array.isArray(detail.publicSignals)
    ? detail
    : undefined;
}

/** 증명 생성, 관리자 서명, 거래 제출, 영수증, 원장 거절을 출처별로 보여 준다. */
export function Chain({
  load,
  traces,
  sales,
  products,
  deployment,
  busy,
  refresh,
}: {
  load: LoadState;
  traces: TraceDto[];
  sales: Sale[];
  products: ProductEntryDto[];
  deployment?: Deployment;
  busy: boolean;
  refresh: () => unknown;
}) {
  const location = useLocation();
  const [group, setGroup] = useState<TraceGroup | "">("");
  const [selected, setSelected] = useState(
    new URLSearchParams(location.search).get("trace") ?? "",
  );
  const shown = traces.filter((trace) => !group || traceGroup(trace) === group);
  const log = shown.find((trace) => trace.id === selected) ?? shown.at(-1);
  const events = receiptEvents(log, deployment?.ledger);
  const eventNames = [...new Set(events.map((event) => event.eventName))];
  const sale = sales.find((entry) => entry.id === log?.saleId);
  const rejection = log && ledgerRejection(log);
  const proof = log && proofDetail(log);
  return (
    <>
      <Heading title="처리 기록">
        <Button variant="outline" busy={busy} onClick={refresh}>
          {!busy && <RefreshCw size={16} />}
          새로 고침
        </Button>
      </Heading>
      <div className={s.chips} role="group" aria-label="처리 기록 종류 필터">
        {(["", ...GROUPS] as const).map((value) => (
          <FilterChip
            key={value || "all"}
            label={value ? TRACE_GROUPS[value] : "전체"}
            count={
              traces.filter((trace) => !value || traceGroup(trace) === value)
                .length
            }
            pressed={group === value}
            onClick={() => setGroup(value)}
          />
        ))}
      </div>
      <div className={`${s.panel} ${s.logGrid}`}>
        <div className={s.logList}>
          {shown.length ? (
            shown.map((trace) => {
              const [label, tone] = traceStatus(trace);
              // 날짜와 시각을 두 줄로 쓴다. 다른 날의 기록이 섞여 보이지 않게 한다.
              const at = dateTime(trace.at);
              const cut = at.lastIndexOf(" ");
              return (
                <button
                  key={trace.id}
                  onClick={() => setSelected(trace.id)}
                  className={log?.id === trace.id ? s.logSelected : ""}
                  aria-current={log?.id === trace.id ? "true" : undefined}
                >
                  <time dateTime={trace.at}>
                    <span>{at.slice(0, cut)}</span>
                    <span>{at.slice(cut + 1)}</span>
                  </time>
                  <div>
                    <strong>{traceLabel(trace)}</strong>
                    <small>
                      {sourceLabel(trace.source)}
                      {trace.txHash ? ` · ${short(trace.txHash)}` : ""}
                    </small>
                  </div>
                  <Badge tone={tone}>{label}</Badge>
                </button>
              );
            })
          ) : (
            <div className={s.empty}>
              {load === "loading"
                ? "처리 기록을 불러오고 있습니다."
                : load === "failed" && !traces.length
                  ? "처리 기록을 불러오지 못했습니다. 연결을 확인하고 화면을 새로 고치세요."
                  : group
                    ? `${TRACE_GROUPS[group]} 기록이 없습니다.`
                    : "아직 처리 기록이 없습니다."}
            </div>
          )}
        </div>
        <section className={s.logDetail}>
          {log ? (
            <>
              <div className={s.row}>
                <h2>{traceLabel(log)}</h2>
                <Badge tone={traceStatus(log)[1]}>{traceStatus(log)[0]}</Badge>
              </div>
              <Facts
                rows={[
                  ["처리 시각", dateTime(log.at)],
                  ["출처", sourceLabel(log.source)],
                  ["원장 함수·작업", <code>{log.action}</code>],
                  ...(log.saleId
                    ? ([
                        [
                          "판매 건",
                          <>
                            {productName(saleProduct(products, sale)?.document)}{" "}
                            <code>{log.saleId}</code>
                          </>,
                        ],
                      ] as [string, ReactNode][])
                    : []),
                  ...(log.customerRef
                    ? ([["고객 가명 ID", <code>{log.customerRef}</code>]] as [
                        string,
                        ReactNode,
                      ][])
                    : []),
                  [
                    "거래 해시",
                    log.txHash ? <code>{log.txHash}</code> : "거래 없음",
                  ],
                  [
                    "블록 번호",
                    log.blockNumber ??
                      (log.txHash && log.status === "pending"
                        ? "영수증 대기"
                        : "—"),
                  ],
                  [
                    "이벤트",
                    eventNames.length ? (
                      <code>{eventNames.join(" · ")}</code>
                    ) : log.event ? (
                      <code>{log.event}</code>
                    ) : (
                      "—"
                    ),
                  ],
                  ...(proof
                    ? ([
                        [
                          "증명 생성 시간",
                          proof.ms === undefined
                            ? "—"
                            : `${proof.ms.toLocaleString("ko-KR")}ms`,
                        ],
                        ["공개 신호", `${proof.publicSignals!.length}개`],
                      ] as [string, ReactNode][])
                    : []),
                ]}
              />
              {rejection && (
                <Notice tone="warning">
                  {rejection.error && <code>{rejection.error}</code>}{" "}
                  {rejection.reason}
                </Notice>
              )}
              {deployment?.chainId === 11155111 && log.txHash && (
                <a
                  href={`https://sepolia.etherscan.io/tx/${log.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Etherscan에서 보기
                  <span className={s.srOnly}> (새 탭에서 열기)</span>
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
              )}
              <Disclosure
                label={
                  <>
                    {log.txHash && log.status === "confirmed"
                      ? "거래 영수증 JSON"
                      : "처리 응답 JSON"}
                  </>
                }
              >
                <pre>
                  {JSON.stringify(
                    log.detail ?? { status: log.status },
                    null,
                    2,
                  )}
                </pre>
              </Disclosure>
            </>
          ) : (
            <p>기록을 선택하세요.</p>
          )}
        </section>
      </div>
    </>
  );
}
