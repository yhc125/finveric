import { Link } from "react-router";
import type { ProductEntryDto, RuleEntryDto } from "@finveric/core/api";
import type { LoadState } from "../../shared/api.ts";
import { Button } from "../../shared/button.tsx";
import {
  Badge,
  Facts,
  DetailColumn,
  Heading,
  Stat,
  TableScroll,
  Skeleton,
} from "../../shared/components.tsx";
import { dateTime } from "../../shared/format.ts";
import ui from "../../shared/ui.module.css";
import client from "../client.module.css";
import local from "./operations.module.css";
import { StatusBadge } from "../../shared/sale-components.tsx";
import {
  FactsSkeleton,
  LoadingStatus,
  RegisterNotice,
  SaleIdText,
  SaleRow,
  DetailTableSkeletonRows,
} from "../components.tsx";
import {
  activeRule,
  awaitingApproval,
  inCooling,
  latestProducts,
  nowSeconds,
  productName,
  saleProduct,
  type Sale,
} from "../../shared/sales.ts";
import { REVIEW_SIGNALS_PATH } from "../paths.ts";

const s = { ...ui, ...client, ...local };

/** 판매사 콘솔의 첫 화면. 진행 중인 판매 건, 승인 대기, 위험 신호, 적용 기준을 요약한다. */
export function Dashboard({
  load,
  rules,
  products,
  sales,
  signalCount,
  signalLoad,
  busy,
  register,
}: {
  load: LoadState;
  rules: RuleEntryDto[];
  products: ProductEntryDto[];
  sales: Sale[];
  signalCount?: number;
  signalLoad: LoadState;
  busy: boolean;
  register: () => unknown;
}) {
  const now = nowSeconds();
  const rule = activeRule(rules);
  const selling = latestProducts(products);
  const subscribed = sales.filter((sale) => sale.status === "subscribed");
  const cooling = subscribed.filter((sale) => inCooling(sale, now)).length;
  const confirmed = sales.filter((sale) => sale.status === "confirmed");
  const approvals = sales.filter(awaitingApproval);
  const recent = [...sales]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);
  const failed = load === "failed";
  const loading = load === "loading";
  // 처음 읽기에 실패하면 0 대신 "—"를 보여 준다. 0건이라고 읽히지 않게 한다.
  const count = (value: number) => (failed ? "—" : value);
  const stats = [
    {
      label: "미확정 청약",
      value: count(subscribed.length),
      unit: "건",
      note: failed
        ? "불러오지 못했습니다"
        : `숙려 중 ${cooling}건 · 확인 대기 ${subscribed.length - cooling}건`,
      to: "/review",
    },
    {
      label: "가입 확정",
      value: count(confirmed.length),
      unit: "건",
      to: "/review",
    },
    {
      label: "관리자 승인 대기",
      value: count(approvals.length),
      unit: "건",
      to: "/review?status=approval",
    },
    {
      label: "위험 신호",
      value: signalCount ?? "—",
      unit: "건",
      note: signalLoad === "failed" ? "불러오지 못했습니다" : "원장 기록 기준",
      to: REVIEW_SIGNALS_PATH,
    },
  ];
  return (
    <>
      <Heading title="대시보드" />
      <LoadingStatus loading={loading}>
        판매 현황을 불러오고 있습니다.
      </LoadingStatus>
      {load === "ready" && !rule && !selling.length && (
        <RegisterNotice busy={busy} register={register} />
      )}
      <div className={`${s.stats} ${s.dashboardStats}`}>
        {stats.map((stat) =>
          loading ? (
            <div className={s.stat} key={stat.label} aria-hidden="true">
              <Skeleton width="6rem" height="1rem" />
              <Skeleton width="3rem" height="2rem" />
              {stat.note && <Skeleton width="9rem" height="1rem" />}
            </div>
          ) : (
            <Stat key={stat.label} {...stat} />
          ),
        )}
      </div>
      <div className={s.detailGrid}>
        <TableScroll label="최근 판매 건" as="section" className={s.panel}>
          <table aria-busy={loading || undefined}>
            <caption className={s.tableCaption}>최근 판매 건</caption>
            <thead>
              <tr>
                <th scope="col">판매 ID</th>
                <th scope="col">상품</th>
                <th scope="col">상태</th>
                <th scope="col">회차</th>
                <th scope="col">적합성</th>
                <th scope="col">기록 시각</th>
                <DetailColumn label="판매 건 상세" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <DetailTableSkeletonRows
                  widths={[
                    "6.75rem",
                    "8.5rem",
                    "2.5rem",
                    "2.25rem",
                    "2.25rem",
                    "6.25rem",
                  ]}
                />
              ) : (
                recent.map((sale) => {
                  const product = saleProduct(products, sale);
                  const attempt = sale.chain?.attempt ?? sale.latestAttempt;
                  return (
                    <SaleRow key={sale.id} saleId={sale.id}>
                      <td>
                        <SaleIdText saleId={sale.id} />
                      </td>
                      <td className={s.wrapCell}>
                        {productName(product?.document)} v{sale.productVersion}
                      </td>
                      <td>
                        <StatusBadge sale={sale} now={now} />
                      </td>
                      <td>{attempt ? `${attempt}회차` : "—"}</td>
                      <td>
                        {sale.suitable === undefined
                          ? "—"
                          : sale.suitable
                            ? "적합"
                            : "부적합"}
                      </td>
                      <td>
                        {dateTime(
                          sale.chain
                            ? Number(sale.chain.subscribedAt)
                            : sale.createdAt,
                        )}
                      </td>
                    </SaleRow>
                  );
                })
              )}
            </tbody>
          </table>
          {!loading && recent.length === 0 && (
            <p className={s.empty}>
              {load === "ready"
                ? "아직 판매 건이 없습니다."
                : "판매 건을 불러오지 못했습니다. 연결을 확인하고 화면을 새로 고치세요."}
            </p>
          )}
        </TableScroll>
        <aside className={`${s.panel} ${s.pad}`}>
          <h2>적용 기준</h2>
          {loading ? (
            <FactsSkeleton widths={["4rem", "6rem", "8rem", "4rem"]} />
          ) : (
            <>
              <Facts
                rows={[
                  [
                    "진단 기준",
                    rule ? (
                      <>
                        v{rule.version} ·{" "}
                        <Badge tone="success">원장 등록</Badge>
                      </>
                    ) : (
                      <Badge tone="warning">등록 전</Badge>
                    ),
                  ],
                  ["기준 이름", rule?.document.name ?? "—"],
                  ["기준 해시", rule ? <code>{rule.hash}</code> : "—"],
                  [
                    "판매 상품",
                    selling.length ? (
                      <>
                        {selling.length}종 ·{" "}
                        <Badge tone="success">원장 등록</Badge>
                      </>
                    ) : (
                      <Badge tone="warning">등록 전</Badge>
                    ),
                  ],
                ]}
              />
              <ul className={s.productList}>
                {selling.map(({ product }) => (
                  <li key={product.id}>
                    <span>{productName(product.document)}</span>
                    <span className={s.versionText}>v{product.version}</span>
                  </li>
                ))}
              </ul>
              <Button variant="outline" asChild>
                <Link to="/rules">진단 기준 보기</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/products">상품 관리</Link>
              </Button>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
