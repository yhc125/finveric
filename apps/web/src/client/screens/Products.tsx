import { SelectField } from "../../shared/SelectField.tsx";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Plus } from "lucide-react";
import {
  PRODUCT_CARD_COUNT,
  PRODUCT_TYPES,
  RISK_GRADE_NAMES,
  productDocumentHash,
  productId,
  validateProduct,
  type ProductDocument,
  type ProductType,
  type RiskGrade,
} from "@finveric/core";
import type {
  ProductEntryDto,
  RegisterProductRequest,
  RuleEntryDto,
} from "@finveric/core/api";
import { Button } from "../../shared/button.tsx";
import {
  Badge,
  ConfirmDialog,
  DetailRow,
  Facts,
  DetailColumn,
  Heading,
  Notice,
  TableScroll,
} from "../../shared/components.tsx";
import { api, type LoadState } from "../../shared/api.ts";
import ui from "../../shared/ui.module.css";
import client from "../client.module.css";
import local from "./operations.module.css";
import type { Run } from "../App.tsx";
import {
  DetailTableSkeletonRows,
  LoadingStatus,
  RegisterNotice,
} from "../components.tsx";
import { productDetailPath } from "../paths.ts";
import { ProductDetail } from "./ProductDetail.tsx";
import { activeRule, gradeName, productName } from "../../shared/sales.ts";

const s = { ...ui, ...client, ...local };
const GRADES = Object.keys(RISK_GRADE_NAMES).map(Number) as RiskGrade[];

const blankProduct = (seller: string): ProductDocument => ({
  format: "finveric-product-v5",
  code: "",
  version: 1,
  name: "",
  type: "ELS",
  issuer: "",
  seller,
  riskGrade: 3,
  complex: false,
  derivative: false,
  targetMarket: "",
  maxLoss: "",
  fee: "",
  summary: "",
  cards: Array.from({ length: PRODUCT_CARD_COUNT }, (_, index) => ({
    title: index === 0 ? "이런 분께는 맞지 않아요" : "",
    text: "",
  })),
});

/** 상품마다 등록 버전을 모은다. 최신 등록 버전을 먼저 고른다. */
function groupProducts(entries: ProductEntryDto[]) {
  const groups = new Map<string, ProductEntryDto[]>();
  for (const entry of entries) {
    const key = entry.product.id.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.values()].map((versions) => {
    versions.sort((a, b) => a.product.version - b.product.version);
    return {
      id: versions[0].product.id,
      versions,
      latest: versions.find((entry) => entry.latest) ?? versions.at(-1)!,
    };
  });
}

/** 상품 설명서 입력. 새 상품이나 기존 상품의 새 버전을 원장에 등록한다. */
function ProductForm({
  base,
  existing,
  busy,
  run,
  cancel,
  registered,
}: {
  base: ProductDocument;
  existing: ProductEntryDto[];
  busy: boolean;
  run: Run;
  cancel: () => void;
  registered: (id: string) => void;
}) {
  const newVersion = base.code !== "";
  const [doc, setDoc] = useState<ProductDocument>(() => structuredClone(base));
  // 처음 연 내용. 바뀐 것이 있을 때만 편집 취소를 묻는다.
  const [initial] = useState(() => JSON.stringify(base));
  const changed = JSON.stringify(doc) !== initial;
  const [confirmCancel, setConfirmCancel] = useState(false);
  // 빈 양식에 오류 목록을 바로 띄우지 않는다. 입력을 시작하거나 원장에 등록을 누르면 보여 준다.
  const [showErrors, setShowErrors] = useState(false);
  const edit = (change: (draft: ProductDocument) => void) => {
    setShowErrors(true);
    setDoc((current) => {
      const next = structuredClone(current);
      change(next);
      return next;
    });
  };
  const id = doc.code ? productId(doc.code) : undefined;
  const sameCode = existing.filter(
    (entry) => entry.registered && entry.product.id === id,
  );
  const version =
    Math.max(0, ...sameCode.map((entry) => entry.product.version)) + 1;
  const stale = newVersion && version > base.version + 1;
  const document = { ...doc, version };
  const errors = validateProduct(document);
  const text = (
    key: "name" | "issuer" | "seller" | "targetMarket" | "maxLoss" | "fee",
    label: string,
  ) => (
    <label className={s.field}>
      {label}
      <input
        value={doc[key]}
        maxLength={500}
        onChange={(e) =>
          edit((draft) => {
            draft[key] = e.target.value;
          })
        }
      />
    </label>
  );
  const submit = async () => {
    const entry = await run(
      "상품 설명서를 원장에 등록하고 있습니다",
      () =>
        api<ProductEntryDto>("/products", {
          document,
          ...(newVersion ? { expectedVersion: base.version } : {}),
        } satisfies RegisterProductRequest),
      newVersion
        ? "상품 설명서의 새 버전을 등록했습니다."
        : "상품을 등록했습니다.",
    );
    if (entry) registered(entry.product.id);
  };
  return (
    <div className={s.editorGrid}>
      <section className={`${s.panel} ${s.pad}`}>
        <div className={s.row}>
          <h2>
            {newVersion ? `${base.name} 새 버전 v${version}` : "새 상품 만들기"}
          </h2>
          <Button
            variant="ghost"
            blocked={busy}
            onClick={() => (changed ? setConfirmCancel(true) : cancel())}
          >
            편집 취소
          </Button>
        </div>
        <div className={s.editGrid}>
          <label className={s.field}>
            상품 코드
            <input
              value={doc.code}
              readOnly={newVersion}
              placeholder="예: ELS-2026-004"
              onChange={(e) =>
                edit((draft) => {
                  draft.code = e.target.value.toUpperCase();
                })
              }
            />
          </label>
          <SelectField
            label="상품 유형"
            value={doc.type}
            options={PRODUCT_TYPES.map((type) => ({
              value: type,
              label: type,
            }))}
            onChange={(value) =>
              edit((draft) => {
                draft.type = value as ProductType;
              })
            }
          />
          <SelectField
            label="위험등급"
            value={String(doc.riskGrade)}
            options={GRADES.map((grade) => ({
              value: String(grade),
              label: gradeName(grade),
            }))}
            onChange={(value) =>
              edit((draft) => {
                draft.riskGrade = Number(value) as RiskGrade;
              })
            }
          />
        </div>
        {!newVersion && sameCode.length > 0 && (
          <Notice>
            이미 등록한 상품 코드입니다. 이 상품의 새 버전 v{version}으로
            등록합니다.
          </Notice>
        )}
        {text("name", "상품명")}
        <div className={s.checks}>
          <label>
            <input
              type="checkbox"
              checked={doc.complex}
              onChange={(e) =>
                edit((draft) => {
                  draft.complex = e.target.checked;
                })
              }
            />
            고난도 금융투자상품
          </label>
          <label>
            <input
              type="checkbox"
              checked={doc.derivative}
              onChange={(e) =>
                edit((draft) => {
                  draft.derivative = e.target.checked;
                })
              }
            />
            파생결합증권
          </label>
        </div>
        <div className={s.editGrid}>
          {text("issuer", doc.type === "펀드" ? "운용사" : "발행사")}
          {text("seller", "판매사")}
        </div>
        {text("targetMarket", "판매대상 고객군")}
        <div className={s.editGrid}>
          {text("maxLoss", "최대 손실")}
          {text("fee", "수수료")}
        </div>
        <label className={s.field}>
          상품 요약
          <textarea
            rows={3}
            maxLength={500}
            value={doc.summary}
            onChange={(e) =>
              edit((draft) => {
                draft.summary = e.target.value;
              })
            }
          />
        </label>
        <h3 className={s.subTitle}>핵심 설명 카드 {PRODUCT_CARD_COUNT}장</h3>
        <p className={s.small}>
          고객은 가입 중에 카드를 차례로 봅니다. 첫 장에는 부적합 고객 유형과
          손실 사례를 씁니다.
        </p>
        {doc.cards.map((card, index) => (
          <fieldset key={index} className={s.questionEdit}>
            <legend>
              {index + 1}번 카드
              {index === 0 && " · 부적합 고객 유형과 손실 사례"}
            </legend>
            <label className={s.field}>
              제목
              <input
                value={card.title}
                maxLength={100}
                onChange={(e) =>
                  edit((draft) => {
                    draft.cards[index].title = e.target.value;
                  })
                }
              />
            </label>
            <label className={s.field}>
              내용
              <textarea
                rows={3}
                maxLength={1000}
                value={card.text}
                onChange={(e) =>
                  edit((draft) => {
                    draft.cards[index].text = e.target.value;
                  })
                }
              />
            </label>
          </fieldset>
        ))}
      </section>
      <aside className={s.editorAside}>
        <section className={`${s.panel} ${s.pad}`}>
          <h2>검사</h2>
          {stale ? (
            <Notice tone="warning">
              새 상품 버전이 등록됐습니다. 편집을 닫고 최신 버전을 확인한 뒤
              다시 수정하세요.
            </Notice>
          ) : !showErrors && errors.length ? (
            <Notice>
              입력하면 검사 결과를 여기에 보여 줍니다. 원장에 등록을 누르면 빠진
              항목을 모두 보여 줍니다.
            </Notice>
          ) : errors.length ? (
            <Notice tone="danger">
              <ul className={s.errorList}>
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </Notice>
          ) : (
            <Notice>검사를 통과했습니다. 원장에 등록할 수 있습니다.</Notice>
          )}
          <Facts
            rows={[
              ["버전", `v${version}`],
              ["상품 ID", <code>{id ?? "—"}</code>],
              [
                "설명서 지문",
                errors.length ? (
                  "검사 통과 뒤 계산"
                ) : (
                  <code>{productDocumentHash(document)}</code>
                ),
              ],
            ]}
          />
          <Button
            busy={busy}
            blocked={
              stale ||
              (newVersion && !changed) ||
              (showErrors && errors.length > 0)
            }
            onClick={() =>
              errors.length ? setShowErrors(true) : void submit()
            }
          >
            {newVersion ? "새 버전 등록" : "원장에 등록"}
          </Button>
          <p className={s.small}>
            원장은 설명서 원문으로 지문을 다시 계산합니다. 위험등급과
            고난도·파생 여부도 함께 기록합니다.
          </p>
        </section>
      </aside>
      <ConfirmDialog
        open={confirmCancel}
        title="편집한 내용을 버릴까요?"
        text="편집한 내용이 모두 사라집니다. 되돌릴 수 없습니다."
        confirmLabel="편집 내용 버리기"
        cancelLabel="계속 편집하기"
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => {
          setConfirmCancel(false);
          cancel();
        }}
      />
    </div>
  );
}

/** 판매 상품과 설명서 버전 등록, 버전 이력, 투자성향별 권유 가능 상품. */
export function Products({
  load,
  rules,
  products,
  busy,
  run,
  register,
}: {
  load: LoadState;
  rules: RuleEntryDto[];
  products: ProductEntryDto[];
  busy: boolean;
  run: Run;
  register: () => unknown;
}) {
  const navigate = useNavigate();
  const { productId: selected } = useParams();
  const groups = groupProducts(products);
  const [form, setForm] = useState<ProductDocument>();
  const group = groups.find(
    (entry) => entry.id.toLowerCase() === selected?.toLowerCase(),
  );
  const loading = load === "loading";
  const anyRegistered = products.some((entry) => entry.registered);
  const seller =
    products.find((entry) => entry.registered)?.product.document.seller ?? "";
  const rule = activeRule(rules);

  if (form)
    return (
      <>
        <Heading
          title={selected ? "상품 수정" : "새 상품 만들기"}
          description={
            selected ? "수정한 설명서는 새 버전으로 등록합니다." : undefined
          }
        />
        <ProductForm
          base={form}
          existing={products}
          busy={busy}
          run={run}
          cancel={() => setForm(undefined)}
          registered={(id) => {
            setForm(undefined);
            if (selected?.toLowerCase() !== id.toLowerCase())
              navigate(productDetailPath(id));
          }}
        />
      </>
    );

  if (selected)
    return (
      <ProductDetail
        load={load}
        latest={group?.latest}
        versions={group?.versions ?? []}
        busy={busy}
        onEdit={setForm}
      />
    );

  return (
    <>
      <Heading
        title="상품 관리"
        description="상품 상세에서 설명서를 수정하고 버전 이력을 확인할 수 있습니다."
      >
        <Button blocked={busy} onClick={() => setForm(blankProduct(seller))}>
          <Plus size={16} />새 상품 만들기
        </Button>
      </Heading>
      <LoadingStatus loading={loading}>상품을 불러오고 있습니다.</LoadingStatus>
      {load === "ready" && !anyRegistered && !rule && (
        <RegisterNotice busy={busy} register={register} />
      )}
      <section className={s.panel} aria-busy={loading || undefined}>
        <TableScroll label="판매 상품">
          <table>
            <caption className={s.tableCaption}>판매 상품</caption>
            <thead>
              <tr>
                <th scope="col">상품</th>
                <th scope="col">유형</th>
                <th scope="col">위험등급</th>
                <th scope="col">속성</th>
                <th scope="col">최신 버전</th>
                <th scope="col">원장 등록</th>
                <DetailColumn label="판매 상품 상세" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <DetailTableSkeletonRows
                  widths={["15rem", "5rem", "5rem", "8rem", "5rem", "4rem"]}
                />
              ) : (
                groups.map(({ id, latest, versions }) => {
                  const { document } = latest.product;
                  const name = productName(document);
                  return (
                    <DetailRow
                      key={id}
                      destination={{
                        to: productDetailPath(id),
                        label: `${name} · 판매 상품 상세`,
                      }}
                    >
                      <td className={s.wrapCell}>
                        <strong>{name}</strong>
                      </td>
                      <td>{document.type}</td>
                      <td>{gradeName(document.riskGrade)}</td>
                      <td>
                        {[
                          document.complex && "고난도",
                          document.derivative && "파생결합증권",
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </td>
                      <td>
                        v{latest.product.version}
                        {versions.length > 1 && ` · ${versions.length}개 버전`}
                      </td>
                      <td>
                        <Badge tone={latest.registered ? "success" : "warning"}>
                          {latest.registered ? "등록" : "등록 전"}
                        </Badge>
                      </td>
                    </DetailRow>
                  );
                })
              )}
            </tbody>
          </table>
        </TableScroll>
        {!loading &&
          (groups.length === 0 ? (
            <p className={s.empty}>
              {load === "ready"
                ? "등록한 상품이 없습니다."
                : "상품을 불러오지 못했습니다. 연결을 확인하고 화면을 새로 고치세요."}
            </p>
          ) : (
            <p className={s.tableNote}>
              상품을 선택하면 설명서와 버전 이력을 확인할 수 있습니다. 청약에는
              최신 등록 버전을 씁니다.
            </p>
          ))}
      </section>
      {rule && (
        <Link to="/rules" className={s.tableNote}>
          진단 기준에서 투자성향별 권유 가능 상품 확인하기
        </Link>
      )}
    </>
  );
}
