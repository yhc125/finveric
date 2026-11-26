import { useState } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  ChevronRight,
  Landmark,
  Search,
  ShieldCheck,
  TrendingUp,
  Umbrella,
} from "lucide-react";
import { PRODUCT_TYPES, type ProductType } from "@finveric/core";
import type { ProductEntryDto } from "@finveric/core/api";
import type { LoadState } from "../../shared/api.ts";
import { Button } from "../../shared/button.tsx";
import {
  Badge,
  FilterChip,
  Heading,
  Skeleton,
} from "../../shared/components.tsx";
import ui from "../../shared/ui.module.css";
import {
  gradeName,
  issuerLabel,
  latestProducts,
  productName,
  type Sale,
} from "../../shared/sales.ts";
import local from "./channel.module.css";
import { useStartEnrollment } from "../flow.tsx";
import { channel, fundPath } from "../links.ts";

const s = { ...ui, ...local };
const ICONS: Record<ProductType, [typeof TrendingUp, string]> = {
  ELS: [TrendingUp, s.symbolEls],
  펀드: [Landmark, s.symbolFund],
  ELB: [Umbrella, s.symbolElb],
};

/**
 * 상품 목록. 원장에 등록한 최신 버전만 판다.
 * 카드를 누르면 상품 상세로 간다. "가입하기"는 그 상품의 가입에 바로 들어간다.
 */
export function Catalog({
  load,
  products,
  activeDraft,
  busy,
  start,
  resume,
}: {
  load: LoadState;
  products: ProductEntryDto[];
  activeDraft?: Sale;
  busy: string;
  start: (productId: string, replace?: boolean) => unknown;
  resume: (id: string) => void;
}) {
  const enroll = useStartEnrollment(products, activeDraft, start);
  const [starting, setStarting] = useState("");
  const [type, setType] = useState<ProductType | "">("");
  const [query, setQuery] = useState("");
  // 위험등급이 높은 상품부터 보여 준다. 1등급 상품이 맨 앞에 온다.
  const selling = latestProducts(products).sort(
    (a, b) => a.product.document.riskGrade - b.product.document.riskGrade,
  );
  // 검색어에 맞는 상품. 유형 칩의 건수도 이 목록으로 센다.
  const matches = selling.filter(({ product: { document } }) =>
    `${document.name} ${document.issuer}`.includes(query.trim()),
  );
  const ofType = (value: ProductType | "") =>
    matches.filter(({ product }) => !value || product.document.type === value);
  const filtered = ofType(type);
  const initialLoading = load === "loading" && selling.length === 0;
  return (
    <>
      <Heading title="상품">
        {activeDraft && (
          <Button
            variant="outline"
            blocked={!!busy}
            onClick={() => resume(activeDraft.id)}
          >
            가입 이어하기
          </Button>
        )}
      </Heading>
      <div className={s.tools} role="search" aria-label="상품 찾기">
        <div className={s.search}>
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            aria-label="상품명 또는 발행사·운용사 검색"
            placeholder="상품명, 발행사, 운용사"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className={s.chips} role="group" aria-label="상품 유형">
          {(["", ...PRODUCT_TYPES] as const).map((value) =>
            initialLoading ? (
              <Skeleton key={value || "all"} width="3.5rem" height="2.75rem" />
            ) : (
              <FilterChip
                key={value || "all"}
                label={value || "전체"}
                count={ofType(value).length}
                pressed={type === value}
                onClick={() => setType(value)}
              />
            ),
          )}
        </div>
      </div>
      {/* 유형·검색으로 목록이 바뀌면 화면 낭독기가 상품 수를 읽는다. */}
      <p role="status" className={initialLoading ? s.srOnly : s.catalogCount}>
        {initialLoading
          ? "상품을 불러오고 있어요."
          : load === "ready"
            ? `상품 ${filtered.length}개`
            : ""}
      </p>
      <div className={s.catalog}>
        {initialLoading && (
          <div
            className={`${s.fundCard} ${s.catalogSkeleton}`}
            aria-hidden="true"
          >
            <Skeleton width="2.75rem" height="2.75rem" />
            <Skeleton width="72%" height="1.25rem" />
            <Skeleton width="90%" />
            <Skeleton height="3.5rem" />
            <Skeleton height="2.75rem" />
          </div>
        )}
        {filtered.map(({ product }) => {
          const { document } = product;
          const name = productName(document);
          const [Icon, tone] = ICONS[document.type];
          const enrollLabel = enroll.same(product.id)
            ? "가입 이어 하기"
            : "가입하기";
          return (
            <article className={s.fundCard} key={product.id}>
              <div className={s.cardTop}>
                <div className={`${s.symbol} ${tone}`}>
                  <Icon size={27} />
                </div>
                <Badge tone={document.riskGrade <= 2 ? "warning" : "info"}>
                  {gradeName(document.riskGrade)}
                </Badge>
              </div>
              <p className={s.small}>
                {document.type}
                {document.derivative && " · 파생결합증권"}
              </p>
              <div className={s.fundTitle}>
                <h2>{name}</h2>
                <ChevronRight size={18} aria-hidden="true" />
              </div>
              <p className={s.strategy}>{document.summary}</p>
              <dl className={s.parties}>
                <div>
                  <dt>{issuerLabel(document)}</dt>
                  <dd>{document.issuer}</dd>
                </div>
                <div>
                  <dt>판매사</dt>
                  <dd>{document.seller}</dd>
                </div>
              </dl>
              <dl className={s.productCosts}>
                <div>
                  <dt>수수료</dt>
                  <dd>{document.fee}</dd>
                </div>
                <div>
                  <dt>최대 손실</dt>
                  <dd>{document.maxLoss}</dd>
                </div>
              </dl>
              <Link
                to={fundPath(product.id)}
                className={s.fundCardLink}
                aria-label={`${name} 상세`}
              />
              <div className={s.cardActions}>
                <Button
                  busy={!!busy && starting === product.id}
                  blocked={!!busy && starting !== product.id}
                  aria-label={`${enrollLabel} · ${document.name}`}
                  onClick={() => {
                    setStarting(product.id);
                    enroll.request(product.id);
                  }}
                >
                  {enrollLabel}
                  <ArrowRight size={16} aria-hidden="true" data-icon="end" />
                </Button>
              </div>
            </article>
          );
        })}
      </div>
      {filtered.length === 0 && !initialLoading && (
        <div className={s.empty}>
          {load === "failed" && !selling.length ? (
            <p>상품을 불러오지 못했어요. 화면을 새로 고쳐 주세요.</p>
          ) : !selling.length ? (
            <p>
              지금 가입할 수 있는 상품이 없어요. 상품이 등록되면 여기에 보여요.
            </p>
          ) : query.trim() ? (
            <>
              <p>{`'${query.trim()}' 검색 결과가 없어요.`}</p>
              <Button variant="outline" onClick={() => setQuery("")}>
                검색 지우기
              </Button>
            </>
          ) : (
            <>
              <p>{type} 상품이 없어요.</p>
              <Button variant="outline" onClick={() => setType("")}>
                전체 상품 보기
              </Button>
            </>
          )}
        </div>
      )}
      <Link to={channel.records} className={s.help}>
        <ShieldCheck size={24} aria-hidden="true" />
        <div>
          <strong>내 가입 기록</strong>
          <p>진단, 설명 확인, 청약 기록을 증명서에서 확인할 수 있어요.</p>
        </div>
        <ChevronRight size={18} aria-hidden="true" />
      </Link>
      {enroll.dialog}
    </>
  );
}
