import type { ProductEntryDto } from "@finveric/core/api";
import type { ProductDocument } from "@finveric/core";
import { Pencil } from "lucide-react";
import type { LoadState } from "../../shared/api.ts";
import { Button } from "../../shared/button.tsx";
import { Badge, Empty, Skeleton } from "../../shared/components.tsx";
import { ExplanationCards } from "../../shared/sale-components.tsx";
import { gradeName, productName } from "../../shared/sales.ts";
import ui from "../../shared/ui.module.css";
import {
  DetailHeading,
  FactsSkeleton,
  LoadingStatus,
  ProductFacts,
} from "../components.tsx";
import { PRODUCT_LIST_PATH } from "../paths.ts";
import local from "./operations.module.css";

const s = { ...ui, ...local };

function ProductDetailSkeleton() {
  return (
    <div aria-hidden="true">
      <div className={s.detailGrid}>
        <div className={`${s.panel} ${s.pad} ${s.detailSkeletonCard}`}>
          <div className={s.row}>
            <Skeleton width="55%" height="1.25rem" />
            <Skeleton width="3.5rem" height="1.25rem" />
          </div>
          <Skeleton width="78%" />
          <FactsSkeleton
            widths={[
              "7rem",
              "5rem",
              "5rem",
              "9rem",
              "6rem",
              "6rem",
              "64%",
              "8rem",
              "5rem",
            ]}
          />
        </div>
        <div className={`${s.panel} ${s.pad} ${s.detailSkeletonCard}`}>
          <Skeleton width="5rem" height="1.25rem" />
          <FactsSkeleton widths={["7rem", "6rem"]} />
          <Skeleton height="2.75rem" />
        </div>
      </div>
      <div
        className={`${s.panel} ${s.pad} ${s.spaced} ${s.detailSkeletonCard}`}
      >
        <Skeleton width="7rem" height="1.25rem" />
        <Skeleton width="65%" />
      </div>
    </div>
  );
}

/** 판매 상품의 최신 설명서, 등록 버전 이력과 핵심 설명 카드. */
export function ProductDetail({
  load,
  latest,
  versions,
  busy,
  onEdit,
}: {
  load: LoadState;
  latest?: ProductEntryDto;
  versions: ProductEntryDto[];
  busy: boolean;
  onEdit: (document: ProductDocument) => void;
}) {
  const heading = (
    <>
      <DetailHeading
        title="판매 상품 상세"
        backTo={PRODUCT_LIST_PATH}
        backLabel="판매 상품 목록"
      >
        {latest?.registered && (
          <Button
            blocked={busy}
            onClick={() => onEdit(latest.product.document)}
          >
            <Pencil size={16} aria-hidden="true" />
            상품 수정
          </Button>
        )}
      </DetailHeading>
      <LoadingStatus loading={load === "loading"}>
        상품을 불러오고 있습니다.
      </LoadingStatus>
    </>
  );

  if (!latest)
    return (
      <>
        {heading}
        {load === "loading" ? (
          <ProductDetailSkeleton />
        ) : load === "failed" ? (
          <Empty
            title="상품을 불러오지 못했습니다"
            text="연결을 확인하고 화면을 새로 고치세요."
          />
        ) : (
          <Empty
            title="상품을 찾을 수 없습니다"
            text="판매 상품 목록에서 다른 상품을 선택하세요."
          />
        )}
      </>
    );

  const { document, version } = latest.product;
  return (
    <>
      {heading}
      <div className={s.detailGrid}>
        <section className={`${s.panel} ${s.pad}`}>
          <div className={s.row}>
            <h2>
              {productName(document)} v{version}
            </h2>
            <Badge tone={latest.registered ? "success" : "warning"}>
              {latest.registered ? "원장 등록" : "등록 전"}
            </Badge>
          </div>
          <p className={s.lead}>{document.summary}</p>
          <ProductFacts document={document} />
        </section>
        <aside className={`${s.panel} ${s.pad}`}>
          <h2>버전 이력</h2>
          <ul className={s.versionList}>
            {[...versions].reverse().map((entry) => (
              <li key={entry.product.version}>
                <div>
                  <span>
                    <strong>v{entry.product.version}</strong>{" "}
                    {gradeName(entry.product.document.riskGrade)}
                  </span>
                  <small>
                    설명서 지문 <code>{entry.product.documentHash}</code>
                  </small>
                  <small>
                    등록 거래 {entry.txHash ? <code>{entry.txHash}</code> : "—"}
                  </small>
                  <Badge
                    tone={
                      entry.latest
                        ? "success"
                        : entry.registered
                          ? "neutral"
                          : "warning"
                    }
                  >
                    {entry.latest
                      ? "판매 중"
                      : entry.registered
                        ? "이전 버전"
                        : "등록 전"}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
          <p className={s.small}>
            새 버전을 등록하면 다음 청약부터 새 설명서를 씁니다. 청약한 판매
            건은 그때의 버전으로 남습니다.
          </p>
        </aside>
      </div>
      <section className={`${s.panel} ${s.pad} ${s.spaced}`}>
        <h2>핵심 설명 카드</h2>
        <ExplanationCards cards={document.cards} />
      </section>
    </>
  );
}
