import { Link, useLocation, useSearchParams } from "react-router";
import { ExternalLink } from "lucide-react";
import type { ProductEntryDto, SignalDto } from "@finveric/core/api";
import type { LoadState } from "../../shared/api.ts";
import { Button } from "../../shared/button.tsx";
import {
  Badge,
  Empty,
  FilterChip,
  DetailColumn,
  Heading,
  TableScroll,
  Skeleton,
} from "../../shared/components.tsx";
import { dateTime } from "../../shared/format.ts";
import ui from "../../shared/ui.module.css";
import client from "../client.module.css";
import local from "./operations.module.css";
import { CHANNEL_APP_HREF, CHANNEL_APP_LABEL } from "../../shared/links.ts";
import { StatusBadge } from "../../shared/sale-components.tsx";
import { REVIEW_SIGNALS_PATH } from "../paths.ts";
import { Signals } from "./Signals.tsx";
import {
  LoadingStatus,
  SaleIdText,
  SaleRow,
  DetailTableSkeletonRows,
} from "../components.tsx";
import {
  awaitingApproval,
  nowSeconds,
  productName,
  saleProduct,
  WORK_STATUS_KEYS,
  STATUS_LABELS,
  STATUS_TONES,
  statusKey,
  type Sale,
  type StatusKey,
} from "../../shared/sales.ts";

const s = { ...ui, ...client, ...local };

const yesNo = (value?: boolean, yes = "예", no = "아니요") =>
  value === undefined ? "—" : value ? yes : no;

export function Review({
  load,
  sales,
  products,
  signals,
  signalLoad,
  refreshSignals,
}: {
  load: LoadState;
  sales: Sale[];
  products: ProductEntryDto[];
  signals: SignalDto[];
  signalLoad: LoadState;
  refreshSignals: () => unknown;
}) {
  const [params] = useSearchParams();
  const showingSignals = params.get("view") === "signals";
  return (
    <>
      <Heading title="판매·검토" />
      <nav
        aria-label="판매 검토 메뉴"
        className={`${s.chips} ${s.reviewModes}`}
      >
        <Link
          to="/review"
          className={!showingSignals ? s.chipActive : undefined}
          aria-current={!showingSignals ? "page" : undefined}
        >
          판매 건
        </Link>
        <Link
          to={REVIEW_SIGNALS_PATH}
          className={showingSignals ? s.chipActive : undefined}
          aria-current={showingSignals ? "page" : undefined}
        >
          위험 신호
        </Link>
      </nav>
      {showingSignals ? (
        <Signals
          load={signalLoad}
          sales={sales}
          products={products}
          signals={signals}
          refresh={refreshSignals}
        />
      ) : (
        <SaleList load={load} sales={sales} products={products} />
      )}
    </>
  );
}

/** 판매 건 목록과 상태별 필터. */
function SaleList({
  load,
  sales,
  products,
}: {
  load: LoadState;
  sales: Sale[];
  products: ProductEntryDto[];
}) {
  const now = nowSeconds();
  const { search } = useLocation();
  const [params, setParams] = useSearchParams();
  const status = params.get("status");
  const filter = WORK_STATUS_KEYS.find((key) => key === status) ?? "";
  const setFilter = (key: StatusKey | "") =>
    setParams(key ? { status: key } : {}, { replace: true });
  const ordered = [...sales].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const count = (key: StatusKey | "") =>
    ordered.filter((sale) => !key || statusKey(sale, now) === key).length;
  const shown = ordered.filter(
    (sale) => !filter || statusKey(sale, now) === filter,
  );
  const loading = load === "loading";
  return (
    <>
      <LoadingStatus loading={loading}>
        판매 건을 불러오고 있습니다.
      </LoadingStatus>
      <div className={s.chips} role="group" aria-label="판매 건 상태 필터">
        {(["", ...WORK_STATUS_KEYS] as const).map((key) =>
          loading ? (
            <Skeleton key={key || "all"} width="5.25rem" height="2.5rem" />
          ) : (
            <FilterChip
              key={key || "all"}
              label={key ? STATUS_LABELS[key] : "전체"}
              count={count(key)}
              pressed={filter === key}
              onClick={() => setFilter(key)}
              tone={key ? STATUS_TONES[key] : undefined}
            />
          ),
        )}
      </div>
      <div
        className={`${s.panel} ${s.salesTable}`}
        aria-busy={loading || undefined}
      >
        <TableScroll label="판매 건 목록">
          <table>
            <caption className={s.srOnly}>판매 건 목록</caption>
            <thead>
              <tr>
                <th scope="col">판매 ID</th>
                <th scope="col">상품</th>
                <th scope="col">상태</th>
                <th scope="col">회차</th>
                <th scope="col">적합성</th>
                <th scope="col">녹취·숙려</th>
                <th scope="col">관리자 승인</th>
                <th scope="col">기록 시각</th>
                <DetailColumn label="판매 건 상세" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <DetailTableSkeletonRows
                  rows={5}
                  widths={[
                    "7.5rem",
                    "11rem",
                    "2.75rem",
                    "4rem",
                    "2.5rem",
                    "2.75rem",
                    "3.25rem",
                    "7.25rem",
                  ]}
                />
              ) : (
                shown.map((record) => {
                  const attempt = record.chain?.attempt ?? record.latestAttempt;
                  return (
                    <SaleRow key={record.id} saleId={record.id} search={search}>
                      <td>
                        <SaleIdText saleId={record.id} />
                      </td>
                      <td className={s.wrapCell}>
                        {productName(saleProduct(products, record)?.document)} v
                        {record.productVersion}
                      </td>
                      <td>
                        <StatusBadge sale={record} now={now} />
                      </td>
                      <td>
                        {attempt
                          ? `${attempt}회차${attempt > 1 ? " · 재진단" : ""}`
                          : "—"}
                      </td>
                      <td>{yesNo(record.suitable, "적합", "부적합")}</td>
                      <td>{yesNo(record.protectedSale, "대상", "—")}</td>
                      <td>
                        {awaitingApproval(record) ? (
                          <Badge tone="warning">승인 필요</Badge>
                        ) : record.chain?.approved ||
                          (record.status === "draft" &&
                            record.approvedAttempt === record.latestAttempt) ? (
                          "승인"
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {dateTime(
                          record.chain
                            ? Number(record.chain.subscribedAt)
                            : record.createdAt,
                        )}
                      </td>
                    </SaleRow>
                  );
                })
              )}
            </tbody>
          </table>
        </TableScroll>
        {!loading &&
          shown.length === 0 &&
          (load === "ready" && filter ? (
            <div className={s.empty}>
              <p>{STATUS_LABELS[filter]} 상태의 판매 건이 없습니다.</p>
              <Button variant="outline" onClick={() => setFilter("")}>
                전체 보기
              </Button>
            </div>
          ) : load === "ready" ? (
            <Empty
              title="아직 판매 건이 없습니다"
              text="고객이 관리자 승인을 요청하거나 청약을 제출하면 여기에 표시됩니다."
            >
              <Button variant="outline" asChild>
                <a href={CHANNEL_APP_HREF} target="_blank" rel="noreferrer">
                  {CHANNEL_APP_LABEL} 열기
                  <span className={s.srOnly}> (새 탭에서 열기)</span>
                  <ExternalLink size={14} aria-hidden="true" data-icon="end" />
                </a>
              </Button>
            </Empty>
          ) : (
            <p className={s.empty}>
              판매 건을 불러오지 못했습니다. 연결을 확인하고 화면을 새로
              고치세요.
            </p>
          ))}
      </div>
    </>
  );
}
