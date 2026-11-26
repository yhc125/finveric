// 판매사 소비자보호 담당: 상품 설명서 버전 등록과 조회, 시연 기준·상품 일괄 등록.
import type { Hex } from "viem";
import {
  DEMO_PRODUCTS,
  DEMO_RULE,
  defineProduct,
  productId,
  productText,
  validateProduct,
  type Product,
  type ProductDocument,
} from "@finveric/core";
import type { ProductEntry, RegisterResponse } from "@finveric/core/api";
import { CodedError } from "../errors.ts";
import type { FundService } from "../service.ts";
import type { StoredProduct } from "../repositories/sales.ts";
import {
  readLatestProductVersion,
  readProduct,
  readRuleCount,
} from "../gateways/ledger.ts";
import { send } from "./transactions.ts";
import { listRules, registerRule } from "./rules.ts";

/** 상품마다 모든 등록 버전을 준다. 등록하지 않은 시연 상품은 미등록으로 함께 준다. */
export async function listProducts(svc: FundService): Promise<ProductEntry[]> {
  const stored = [...svc.repository.products()].sort((a, b) =>
    a.product.id === b.product.id
      ? a.product.version - b.product.version
      : a.product.document.code.localeCompare(b.product.document.code),
  );
  const ids = [
    ...new Set([
      ...stored.map((entry) => entry.product.id),
      ...DEMO_PRODUCTS.map((product) => product.id),
    ]),
  ];
  const latest = new Map<Hex, number>(
    await Promise.all(
      ids.map(
        async (id) => [id, await readLatestProductVersion(svc, id)] as const,
      ),
    ),
  );
  const entries: ProductEntry[] = await Promise.all(
    stored.map(async ({ product, txHash }) => {
      const chain = await readProduct(svc, product.id, product.version);
      const registered = chain.documentHash === product.documentHash;
      return {
        product,
        registered,
        latest: registered && latest.get(product.id) === product.version,
        txHash,
      };
    }),
  );
  for (const product of DEMO_PRODUCTS)
    if (
      !latest.get(product.id) &&
      !stored.some((e) => e.product.id === product.id)
    )
      entries.push({ product, registered: false, latest: false });
  return entries;
}

/** 청약에 쓸 상품 버전. 원장의 최신 버전이고 원문이 판매 기록에 있어야 한다. */
export async function latestProduct(
  svc: FundService,
  id: Hex,
): Promise<Product> {
  const version = await readLatestProductVersion(svc, id);
  if (version === 0) throw new CodedError("PRODUCT_NOT_REGISTERED");
  return storedProduct(svc, id, version);
}
export function storedProduct(svc: FundService, id: Hex, version: number) {
  const entry = svc.repository
    .products()
    .find(
      ({ product }) =>
        product.id.toLowerCase() === id.toLowerCase() &&
        product.version === version,
    );
  if (!entry)
    throw new CodedError(
      "STORED_RECORD_MISMATCH",
      `원장의 상품 설명서 v${version} 원문이 판매 기록에 없습니다.`,
    );
  return entry.product;
}

/**
 * 설명서를 검사하고 그 상품의 다음 버전으로 원장에 등록한다.
 * 원장은 원문(정렬한 JSON)에서 지문을 계산한다. 위험등급·고난도·파생 여부는 원문과 같은 값을 보낸다.
 */
export async function registerProduct(
  svc: FundService,
  document: ProductDocument,
  expectedVersion?: number,
): Promise<ProductEntry> {
  const id = productId(document.code);
  const previousVersion = await readLatestProductVersion(svc, id);
  if (expectedVersion !== undefined && expectedVersion !== previousVersion)
    throw new CodedError("PRODUCT_EDIT_VERSION_CHANGED");
  const version = previousVersion + 1;
  const doc: ProductDocument = { ...document, version };
  const errors = validateProduct(doc);
  if (errors.length)
    throw new CodedError("PRODUCT_DOCUMENT_INVALID", errors.join(" "));
  const product = defineProduct(doc);
  const stored: StoredProduct = { product };
  svc.repository.addProduct(stored);
  try {
    await send(
      svc,
      "seller",
      "registerProduct",
      [id, productText(doc), doc.riskGrade, doc.complex, doc.derivative],
      {
        event: "ProductRegistered",
        match: (log) =>
          log.eventName === "ProductRegistered" &&
          log.args.productId === id &&
          log.args.version === version &&
          log.args.documentHash === product.documentHash,
        onSubmitted: (txHash) => {
          stored.txHash = txHash;
        },
      },
    );
  } catch (error) {
    const pending = svc.repository
      .traces()
      .some(
        ({ trace }) =>
          !!stored.txHash &&
          trace.txHash === stored.txHash &&
          trace.status === "pending",
      );
    if (!pending) svc.repository.removeProduct(stored);
    throw error;
  }
  return { product, registered: true, latest: true, txHash: stored.txHash };
}

/**
 * 시연 단축 동작. 기준이 하나도 없으면 시연 기준 v1을, 등록하지 않은 시연 상품을 v1로 등록한다.
 * 이미 있으면 거래를 보내지 않는다.
 */
export async function registerDemo(
  svc: FundService,
): Promise<RegisterResponse> {
  if ((await readRuleCount(svc)) === 0) await registerRule(svc, DEMO_RULE);
  for (const product of DEMO_PRODUCTS)
    if ((await readLatestProductVersion(svc, product.id)) === 0)
      await registerProduct(svc, product.document);
  return { rules: await listRules(svc), products: await listProducts(svc) };
}
