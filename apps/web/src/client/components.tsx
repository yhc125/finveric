// client 페이지의 여러 화면이 함께 쓰는 표시 요소.
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, type To } from "react-router";
import {
  isSuitable,
  PROFILE_NAMES,
  type ProductDocument,
  type RuleDocument,
} from "@finveric/core";
import type { DiagnosisDto } from "@finveric/core/api";
import { Button } from "../shared/button.tsx";
import {
  DetailRow,
  Facts,
  Heading,
  Notice,
  TableScroll,
  Skeleton,
} from "../shared/components.tsx";
import { dateTime, short } from "../shared/format.ts";
import {
  gradeName,
  issuerLabel,
  limitRange,
  productName,
  profileName,
  type ProductEntry,
} from "../shared/sales.ts";
import ui from "../shared/ui.module.css";
import local from "./client.module.css";
import { saleReviewPath } from "./paths.ts";

const s = { ...ui, ...local };
const PROFILES = Object.keys(PROFILE_NAMES).map(Number);

export function SaleIdText({ saleId }: { saleId: string }) {
  return <code title={saleId}>{short(saleId)}</code>;
}

export function DetailHeading({
  title,
  backTo,
  backLabel,
  children,
}: {
  title: string;
  backTo: To;
  backLabel: string;
  children?: ReactNode;
}) {
  return (
    <>
      <div className={s.detailBack}>
        <Button variant="outline" asChild>
          <Link to={backTo}>
            <ArrowLeft size={16} aria-hidden="true" />
            {backLabel}
          </Link>
        </Button>
      </div>
      <Heading title={title}>{children}</Heading>
    </>
  );
}

export function SaleRow({
  saleId,
  search,
  label,
  children,
}: {
  saleId?: string;
  search?: string;
  label?: string;
  children: ReactNode;
}) {
  return (
    <DetailRow
      destination={
        saleId
          ? {
              to: { pathname: saleReviewPath(saleId), search },
              label: label ?? `판매 건 상세 · ${short(saleId)}`,
            }
          : undefined
      }
    >
      {children}
    </DetailRow>
  );
}

export function LoadingStatus({
  loading,
  children,
}: {
  loading: boolean;
  children: string;
}) {
  return (
    <p className={s.srOnly} role="status">
      {loading ? children : ""}
    </p>
  );
}

export function DetailTableSkeletonRows({
  widths,
  rows = 4,
}: {
  widths: readonly string[];
  rows?: number;
}) {
  return Array.from({ length: rows }, (_, row) => (
    <tr key={row} aria-hidden="true" className={s.skeletonRow}>
      {widths.map((width, column) => (
        <td key={column}>
          <Skeleton width={width} />
        </td>
      ))}
      <td className={s.detailRowAction} />
    </tr>
  ));
}

export function FactsSkeleton({ widths }: { widths: readonly string[] }) {
  return (
    <div className={s.facts} aria-hidden="true">
      {widths.map((width, index) => (
        <div key={index} className={s.skeletonFact}>
          <Skeleton width="5rem" />
          <Skeleton width={width} />
        </div>
      ))}
    </div>
  );
}

/** 아무 기준·상품도 등록하지 않았을 때 보여 주는 기본 등록 안내. */
export function RegisterNotice({
  busy,
  register,
}: {
  busy: boolean;
  register: () => unknown;
}) {
  return (
    <div className={s.registerNotice}>
      <Notice tone="warning">
        아직 원장에 등록한 진단 기준과 상품이 없습니다. 기본 진단 기준과 상품
        3종을 한 번에 등록할 수 있습니다.
      </Notice>
      <Button busy={busy} onClick={register}>
        상품·진단 기준 등록
      </Button>
    </div>
  );
}

/** 상품 설명서의 속성. 판매사 화면에서 쓴다. */
export function ProductFacts({ document }: { document: ProductDocument }) {
  return (
    <Facts
      rows={[
        ["상품 코드", <code>{document.code}</code>],
        ["상품 유형", document.type],
        ["위험등급", gradeName(document.riskGrade)],
        [
          "속성",
          [
            document.complex ? "고난도" : "고난도 아님",
            document.derivative ? "파생결합증권" : "파생결합증권 아님",
          ].join(" · "),
        ],
        [issuerLabel(document), document.issuer],
        ["판매사", document.seller],
        ["판매대상 고객군", document.targetMarket],
        ["최대 손실", document.maxLoss],
        ["수수료", document.fee],
      ]}
    />
  );
}

/**
 * 투자성향별 권유 가능 상품. 적합성 기준(투자성향별 권유 가능 최고 위험등급)으로 나눈다.
 * 고객이 추출 조건 답변을 고르면 권유 범위가 더 좁아질 수 있다.
 */
export function ProfileProducts({
  rule,
  products,
}: {
  rule?: RuleDocument;
  products: ProductEntry[];
}) {
  if (!rule) return <p className={s.small}>진단 기준을 등록하면 표시합니다.</p>;
  return (
    <TableScroll label="투자성향별 권유 가능 상품">
      <table>
        <thead>
          <tr>
            <th scope="col">투자성향</th>
            <th scope="col">권유 가능 위험등급</th>
            <th scope="col">권유 가능 상품</th>
            <th scope="col">추가 위험 확인이 필요한 상품</th>
          </tr>
        </thead>
        <tbody>
          {PROFILES.map((profile) => {
            const limit = rule.matrix[profile - 1];
            const names = (suitable: boolean) =>
              products
                .filter(
                  ({ product }) =>
                    isSuitable(product.document.riskGrade, limit) === suitable,
                )
                .map(({ product }) => productName(product.document))
                .join(", ") || "—";
            return (
              <tr key={profile}>
                <td>
                  <strong>{profileName(profile)}</strong>
                </td>
                <td>{limitRange(limit)}</td>
                <td className={s.wrapCell}>{names(true)}</td>
                <td className={s.wrapCell}>{names(false)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableScroll>
  );
}

/** 고객 가명 ID의 진단 회차. 청약에 쓴 회차를 강조한다. `caption`은 패널 제목과 같은 크기의 표 제목이다. */
export function DiagnosisTable({
  diagnoses,
  used,
  caption,
}: {
  diagnoses: DiagnosisDto[];
  used?: number;
  caption?: string;
}) {
  return (
    <TableScroll label={caption ?? "진단 회차"}>
      <table>
        {caption && <caption className={s.tableCaption}>{caption}</caption>}
        <thead>
          <tr>
            <th scope="col">누적 회차</th>
            <th scope="col">투자성향</th>
            <th scope="col">권유 가능 위험등급</th>
            <th scope="col">고령</th>
            <th scope="col">기록 시각</th>
            <th scope="col">거래</th>
          </tr>
        </thead>
        <tbody>
          {diagnoses.map((diagnosis) => (
            <tr
              key={diagnosis.attempt}
              className={diagnosis.attempt === used ? s.selectedRow : ""}
            >
              <td>
                <strong>
                  {diagnosis.attempt}회차
                  {diagnosis.attempt === used && " · 청약"}
                </strong>
              </td>
              <td>{profileName(diagnosis.profile)}</td>
              <td>{limitRange(diagnosis.limit)}</td>
              <td>{diagnosis.elderly ? "고령" : "—"}</td>
              <td>{dateTime(diagnosis.at)}</td>
              <td className={s.wrapCell}>
                <code>{diagnosis.txHash}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}
