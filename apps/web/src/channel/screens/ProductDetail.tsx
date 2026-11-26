import { AlertTriangle } from "lucide-react";
import { DEMO_AMOUNT, type Product } from "@finveric/core";
import type { ProductEntryDto } from "@finveric/core/api";
import type { LoadState } from "../../shared/api.ts";
import {
  Disclosure,
  Facts,
  Heading,
  Notice,
} from "../../shared/components.tsx";
import { won } from "../../shared/format.ts";
import { ExplanationCards } from "../../shared/sale-components.tsx";
import {
  gradeName,
  issuerLabel,
  productName,
  type Sale,
} from "../../shared/sales.ts";
import ui from "../../shared/ui.module.css";
import local from "./channel.module.css";
import { ActionBar, PrimaryAction, useStartEnrollment } from "../flow.tsx";

const s = { ...ui, ...local };

/**
 * 상품 상세. 원금 손실 가능성, 판매대상 고객군, 부적합 고객 유형을 먼저 보여 준다.
 * 아래 주요 동작으로 이 상품의 가입에 바로 들어간다. 다른 상품의 청약 전 가입이 있으면 중단할지 먼저 묻는다.
 */
export function ProductDetail({
  load,
  product,
  products,
  activeDraft,
  busy,
  start,
}: {
  load: LoadState;
  product?: Product;
  products: ProductEntryDto[];
  activeDraft?: Sale;
  busy: string;
  start: (productId: string, replace?: boolean) => unknown;
}) {
  const enroll = useStartEnrollment(products, activeDraft, start);
  if (!product)
    return (
      <>
        <Heading title="상품 상세" />
        <div className={s.empty}>
          <p role="status">
            {load === "ready"
              ? "상품을 찾을 수 없어요. 상품 목록에서 다시 골라 주세요."
              : load === "failed"
                ? "상품을 불러오지 못했어요. 화면을 새로 고쳐 주세요."
                : "상품을 불러오고 있어요."}
          </p>
        </div>
      </>
    );
  const { document } = product;
  const sameDraft = enroll.same(product.id);
  const [warning, ...rest] = document.cards;
  return (
    <>
      <Heading title={productName(document)} description={document.summary} />
      <Notice tone="warning">
        원금 손실이 날 수 있어요. 최대 손실: {document.maxLoss}
      </Notice>
      <div className={s.firstCard}>
        <AlertTriangle size={18} />
        <div>
          <strong>{warning.title}</strong>
          <p>{warning.text}</p>
        </div>
      </div>
      <Facts
        rows={[
          ["상품 유형", document.type],
          ["위험등급", gradeName(document.riskGrade)],
          [issuerLabel(document), document.issuer],
          ["판매사", document.seller],
          ["판매대상 고객군", document.targetMarket],
          ["수수료", document.fee],
          ["설명서", `v${product.version}`],
          [
            "가입 금액",
            won(activeDraft && sameDraft ? activeDraft.amount : DEMO_AMOUNT),
          ],
        ]}
      />
      {document.complex && (
        <Notice>
          고난도 금융투자상품이에요. 가입 과정을 녹취하고, 청약 뒤 숙려기간이
          지나야 최종 확인할 수 있어요.
        </Notice>
      )}
      <Disclosure label="핵심 설명 더 보기">
        <ExplanationCards cards={[warning, ...rest]} />
      </Disclosure>
      <p className={s.small}>
        가입 순서: 투자성향 진단 → 적합성 확인 → 핵심 설명 → 청약 → 최종 확인
      </p>
      {enroll.replaces(product.id) && (
        <Notice>
          {productName(enroll.draftProduct?.document)} 가입을 진행하고 있어요.
          이 상품으로 시작하면 진행 중인 가입은 중단돼요.
        </Notice>
      )}
      <ActionBar busy={busy}>
        <PrimaryAction
          label={sameDraft ? "진행 중인 가입 이어 하기" : "이 상품 가입하기"}
          busy={!!busy}
          onClick={() => enroll.request(product.id)}
        />
      </ActionBar>
      {enroll.dialog}
    </>
  );
}
