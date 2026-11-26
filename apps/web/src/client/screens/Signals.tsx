import { useLocation, useSearchParams } from "react-router";
import { SIGNAL_KINDS, SIGNAL_LABELS, SIGNAL_THRESHOLDS } from "@finveric/core";
import type { ProductEntryDto, SignalDto } from "@finveric/core/api";
import type { LoadState } from "../../shared/api.ts";
import { Button } from "../../shared/button.tsx";
import {
  Disclosure,
  Badge,
  Facts,
  FilterChip,
  DetailColumn,
  Notice,
  TableScroll,
  Skeleton,
} from "../../shared/components.tsx";
import { short } from "../../shared/format.ts";
import ui from "../../shared/ui.module.css";
import client from "../client.module.css";
import local from "./operations.module.css";
import { productName, saleProduct, type Sale } from "../../shared/sales.ts";
import {
  LoadingStatus,
  SaleIdText,
  SaleRow,
  DetailTableSkeletonRows,
} from "../components.tsx";

const s = { ...ui, ...client, ...local };

/** 원장 기록(진단 회차, 청약·확정)으로 계산한 위험 신호 5종. 감독기관 화면과 같은 계산이다. */
export function Signals({
  load,
  sales,
  products,
  signals,
  refresh,
}: {
  load: LoadState;
  sales: Sale[];
  products: ProductEntryDto[];
  signals: SignalDto[];
  refresh: () => unknown;
}) {
  const { search } = useLocation();
  const [params, setParams] = useSearchParams();
  const kind = SIGNAL_KINDS.find((value) => value === params.get("kind")) ?? "";
  const setKind = (value: string) =>
    setParams(value ? { view: "signals", kind: value } : { view: "signals" }, {
      replace: true,
    });
  const loading = load === "loading";
  const shown = signals.filter((signal) => !kind || signal.kind === kind);
  /** 신호에 판매 ID가 없으면(재진단 반복, 짧은 간격 재진단) 그 고객의 가장 최근 판매 건을 연다. */
  const saleFor = (customerRef: string, saleId?: string) =>
    sales.find((sale) => sale.id === saleId) ??
    [...sales]
      .filter(
        (sale) => sale.customerRef.toLowerCase() === customerRef.toLowerCase(),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return (
    <>
      {load === "failed" && (
        <Notice tone="warning">
          <p>위험 신호를 새로 불러오지 못했습니다.</p>
          <Button variant="outline" onClick={refresh}>
            다시 읽기
          </Button>
        </Notice>
      )}
      <LoadingStatus loading={loading}>
        위험 신호를 불러오고 있습니다.
      </LoadingStatus>
      <div className={s.chips} role="group" aria-label="위험 신호 종류 필터">
        {(["", ...SIGNAL_KINDS] as const).map((value) =>
          loading ? (
            <Skeleton key={value || "all"} width="6rem" height="2.5rem" />
          ) : (
            <FilterChip
              key={value || "all"}
              label={value ? SIGNAL_LABELS[value] : "전체"}
              count={
                signals.filter((signal) => !value || signal.kind === value)
                  .length
              }
              pressed={kind === value}
              onClick={() => setKind(value)}
            />
          ),
        )}
      </div>
      <div
        className={`${s.panel} ${s.salesTable}`}
        aria-busy={loading || undefined}
      >
        <p className={s.tableNote}>
          위험 신호 목록 · 판매 건을 열어 회차 이력을 확인합니다.
        </p>
        <TableScroll label="위험 신호 목록">
          <table>
            <caption className={s.srOnly}>위험 신호 목록</caption>
            <thead>
              <tr>
                <th scope="col">신호</th>
                <th scope="col">고객 가명 ID</th>
                <th scope="col">판매 ID</th>
                <th scope="col">상품</th>
                <th scope="col">회차</th>
                <th scope="col">근거</th>
                <DetailColumn label="판매 건 상세" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <DetailTableSkeletonRows
                  widths={["5rem", "8rem", "8rem", "12rem", "3rem", "15rem"]}
                />
              ) : (
                shown.map((signal, index) => {
                  const sale = saleFor(signal.customerRef, signal.saleId);
                  return (
                    <SaleRow
                      key={`${signal.kind}:${signal.saleId ?? signal.customerRef}:${index}`}
                      saleId={sale?.id}
                      search={search}
                      label={
                        sale &&
                        `판매 건 상세 · ${SIGNAL_LABELS[signal.kind]} · ${short(sale.id)}`
                      }
                    >
                      <td>
                        <Badge tone="warning">
                          {SIGNAL_LABELS[signal.kind]}
                        </Badge>
                      </td>
                      <td>
                        <code title={signal.customerRef}>
                          {short(signal.customerRef)}
                        </code>
                      </td>
                      <td>
                        {signal.saleId ? (
                          <SaleIdText saleId={signal.saleId} />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={s.wrapCell}>
                        {signal.saleId
                          ? productName(saleProduct(products, sale)?.document)
                          : "—"}
                      </td>
                      <td>{signal.attempt ? `${signal.attempt}회차` : "—"}</td>
                      <td>{signal.detail}</td>
                    </SaleRow>
                  );
                })
              )}
            </tbody>
          </table>
        </TableScroll>
        {!loading &&
          shown.length === 0 &&
          (load === "ready" && kind ? (
            <div className={s.empty}>
              <p>{SIGNAL_LABELS[kind]} 신호가 없습니다.</p>
              <Button variant="outline" onClick={() => setKind("")}>
                전체 보기
              </Button>
            </div>
          ) : (
            <p className={s.empty}>
              {load === "ready"
                ? "표시할 위험 신호가 없습니다."
                : "위험 신호를 계산할 자료를 불러오지 못했습니다. 연결을 확인하고 화면을 새로 고치세요."}
            </p>
          ))}
      </div>
      <Disclosure label="위험 신호 표시 기준">
        <Facts
          rows={[
            [
              SIGNAL_LABELS.repeat,
              `같은 고객이 ${SIGNAL_THRESHOLDS.repeatAttempts}회 이상 진단했습니다.`,
            ],
            [
              SIGNAL_LABELS.rise,
              "직전 진단보다 투자성향이 오른 회차에 청약했습니다.",
            ],
            [SIGNAL_LABELS.unsuitable, "부적합 상태에서 가입을 확정했습니다."],
            [
              SIGNAL_LABELS.shortExplanation,
              `설명을 확인한 시간이 ${SIGNAL_THRESHOLDS.shortExplanationSeconds}초보다 짧습니다.`,
            ],
            [
              SIGNAL_LABELS.shortInterval,
              `이전 진단 후 ${SIGNAL_THRESHOLDS.shortIntervalSeconds / 60}분 안에 다시 진단했습니다.`,
            ],
          ]}
        />
      </Disclosure>
    </>
  );
}
