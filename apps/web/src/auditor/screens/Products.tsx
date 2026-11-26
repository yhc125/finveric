import { SelectField } from "../../shared/SelectField.tsx";
import { useState } from "react";
import { useSearchParams } from "react-router";
import {
  productDisplayName,
  productDocumentHash,
  validateProduct,
  type ProductDocument,
} from "@finveric/core";
import type { LedgerProduct, LedgerSnapshot } from "@finveric/core/ledger";
import {
  Disclosure,
  Badge,
  Count,
  DetailColumn,
  DetailRow,
  Facts,
  Notice,
  TableScroll,
} from "../../shared/components.tsx";
import { dateTime } from "../../shared/format.ts";
import ui from "../../shared/ui.module.css";
import local from "../auditor.module.css";
import { ChangeList } from "../ChangeList.tsx";
import { LedgerGate } from "../components.tsx";
import { diffProducts } from "../diff.ts";
import { gradeLabel, productDocument, productName, short } from "../format.ts";
import type { Ledger } from "../useLedger.ts";

const s = { ...ui, ...local };
const yesNo = (value: boolean) => (value ? "예" : "아니요");
const attributes = (
  version: number,
  grade: number,
  complex: boolean,
  derivative: boolean,
) =>
  `v${version} · ${gradeLabel(grade)} · 고난도 ${yesNo(complex)} · 파생결합증권 ${yesNo(derivative)}`;
/** 설명서 검사를 통과한 원문만 비교한다. */
const comparable = (entry: LedgerProduct) => {
  const document = productDocument(entry);
  return document && validateProduct(document).length === 0
    ? document
    : undefined;
};

/** 상품 감사. 설명서 버전과 위험등급 이력, 등록 원문과 원장 지문을 대조한다. */
export function Products({ ledger }: { ledger: Ledger }) {
  return (
    <div className={s.page}>
      <LedgerGate ledger={ledger}>
        {(snapshot) => <ProductAudit snapshot={snapshot} />}
      </LedgerGate>
    </div>
  );
}

function ProductAudit({ snapshot }: { snapshot: LedgerSnapshot }) {
  const [params, setParams] = useSearchParams();
  const ids = [...new Set(snapshot.products.map((entry) => entry.id))];
  const selectedId =
    ids.find((id) => id === params.get("product")?.toLowerCase()) ?? ids[0];
  if (!selectedId)
    return (
      <div className={`${s.panel} ${s.empty}`}>
        <h2>등록한 상품이 없습니다</h2>
        <p>판매사가 상품 설명서를 원장에 등록하면 여기에 버전이 나옵니다.</p>
      </div>
    );
  const versionsOf = (id: string) =>
    snapshot.products.filter((entry) => entry.id === id);
  const salesOf = (id: string, version?: number) =>
    snapshot.sales.filter(
      (sale) =>
        sale.productId === id &&
        (version === undefined || sale.productVersion === version),
    ).length;
  const withParams = (values: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values))
      if (value === undefined) next.delete(key);
      else next.set(key, value);
    return next;
  };
  return (
    <>
      <TableScroll as="section" label="등록 상품" className={s.panel}>
        <table>
          <caption className={s.tableCaption}>등록 상품</caption>
          <thead>
            <tr>
              <th scope="col">상품</th>
              <th scope="col">유형</th>
              <th scope="col">발행사·운용사</th>
              <th scope="col">최신 버전</th>
              <th scope="col">위험등급(최신)</th>
              <th scope="col">원문 대조</th>
              <th scope="col" className={s.numeric}>
                청약
              </th>
              <DetailColumn label="상품 선택" />
            </tr>
          </thead>
          <tbody>
            {ids.map((id) => {
              const versions = versionsOf(id);
              const latest = versions.at(-1)!;
              const document = productDocument(latest);
              const allMatch = versions.every((entry) => entry.matches);
              const name = productName(snapshot, id);
              return (
                <DetailRow
                  key={id}
                  current={id === selectedId}
                  destination={{
                    to: `?${withParams({ product: id, version: undefined, base: undefined })}`,
                    label: `${name} 선택`,
                  }}
                >
                  <td className={s.wrap}>{name}</td>
                  <td>{document?.type ?? "—"}</td>
                  <td>{document?.issuer ?? "—"}</td>
                  <td>
                    v{latest.version} · {versions.length}개 버전
                  </td>
                  <td>{gradeLabel(latest.riskGrade)}</td>
                  <td>
                    <Badge tone={allMatch ? "success" : "warning"}>
                      {allMatch ? "모든 버전 일치" : "불일치 버전 있음"}
                    </Badge>
                  </td>
                  <Count value={salesOf(id)} />
                </DetailRow>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
      <ProductDetail
        key={selectedId}
        versions={versionsOf(selectedId)}
        version={params.get("version")}
        base={params.get("base")}
        salesOf={(version) => salesOf(selectedId, version)}
        versionPath={(version) =>
          `?${withParams({ version, base: undefined })}`
        }
        setBase={(base, version) => setParams(withParams({ version, base }))}
      />
    </>
  );
}

function ProductDetail({
  versions,
  version,
  base,
  salesOf,
  versionPath,
  setBase,
}: {
  versions: LedgerProduct[];
  version: string | null;
  base: string | null;
  salesOf: (version: number) => number;
  versionPath: (version: string) => string;
  setBase: (base: string, version: string) => void;
}) {
  const [technical, setTechnical] = useState(false);
  const selected =
    versions.find((entry) => String(entry.version) === version) ??
    versions.at(-1)!;
  const document = productDocument(selected);
  const others = versions.filter(
    (entry) => entry !== selected && comparable(entry),
  );
  const previous =
    others.find((entry) => String(entry.version) === base) ??
    [...others].reverse().find((entry) => entry.version < selected.version) ??
    others.at(-1);
  const current = comparable(selected);
  return (
    <>
      <TableScroll
        as="section"
        label="설명서 버전 이력"
        className={`${s.panel} ${s.section}`}
      >
        <div className={s.panelTitle}>
          <h2>
            {document ? productDisplayName(document) : short(selected.id)} 버전
            이력
          </h2>
          <label className={s.toggle}>
            <input
              type="checkbox"
              checked={technical}
              onChange={(e) => setTechnical(e.target.checked)}
            />
            블록·거래 보기
          </label>
        </div>
        <table>
          <thead>
            <tr>
              <th scope="col">버전</th>
              <th scope="col">위험등급</th>
              <th scope="col">고난도</th>
              <th scope="col">파생결합증권</th>
              <th scope="col">설명서 지문</th>
              <th scope="col">등록 시각</th>
              <th scope="col">원문 대조</th>
              <th scope="col" className={s.numeric}>
                청약
              </th>
              {technical && <th scope="col">블록</th>}
              {technical && <th scope="col">거래 해시</th>}
              <DetailColumn label="설명서 버전 선택" />
            </tr>
          </thead>
          <tbody>
            {[...versions].reverse().map((entry) => (
              <DetailRow
                key={entry.version}
                current={entry === selected}
                destination={{
                  to: versionPath(String(entry.version)),
                  label: `설명서 v${entry.version} 선택`,
                }}
              >
                <td>v{entry.version}</td>
                <td>{gradeLabel(entry.riskGrade)}</td>
                <td>{yesNo(entry.complex)}</td>
                <td>{yesNo(entry.derivative)}</td>
                <td>
                  <code title={entry.documentHash}>
                    {short(entry.documentHash, 10, 8)}
                  </code>
                </td>
                <td>{dateTime(entry.at)}</td>
                <td>
                  <Badge tone={entry.matches ? "success" : "warning"}>
                    {entry.matches ? "지문 일치" : "불일치"}
                  </Badge>
                </td>
                <Count value={salesOf(entry.version)} />
                {technical && (
                  <td className={s.numeric}>{entry.block.toString()}</td>
                )}
                {technical && (
                  <td className={s.wrap}>
                    <code>{entry.txHash}</code>
                  </td>
                )}
              </DetailRow>
            ))}
          </tbody>
        </table>
      </TableScroll>
      <section className={`${s.panel} ${s.pad} ${s.section}`}>
        <h2>v{selected.version} 설명서 원문 대조</h2>
        <Facts
          rows={[
            ["상품 ID", <code>{selected.id}</code>],
            ["원장 설명서 지문", <code>{selected.documentHash}</code>],
            [
              "원문으로 다시 계산한 지문",
              document ? (
                <code>{productDocumentHash(document)}</code>
              ) : (
                "원문을 JSON으로 읽을 수 없습니다."
              ),
            ],
            [
              "원장 등록 속성",
              attributes(
                selected.version,
                selected.riskGrade,
                selected.complex,
                selected.derivative,
              ),
            ],
            [
              "원문 속성",
              document
                ? attributes(
                    document.version,
                    document.riskGrade,
                    document.complex,
                    document.derivative,
                  )
                : "—",
            ],
            [
              "대조 결과",
              <Badge tone={selected.matches ? "success" : "warning"}>
                {selected.matches ? "일치" : "불일치"}
              </Badge>,
            ],
          ]}
        />
        {!selected.matches && (
          <Notice tone="warning">
            등록 원문의 지문, 상품 코드, 버전, 위험등급, 고난도·파생결합증권
            표시 중 원장 값과 다른 것이 있습니다. 아래 내용은 원문을 그대로 읽은
            것입니다.
          </Notice>
        )}
        <Disclosure label="등록 원문 보기 (이벤트 ProductRegistered)">
          <pre>{selected.document}</pre>
        </Disclosure>
      </section>
      {document && <ProductDocumentView document={document} />}
      <section className={`${s.panel} ${s.pad} ${s.section}`}>
        <div className={s.row}>
          <h2>버전 사이의 차이</h2>
          {previous && (
            <SelectField
              className={s.compare}
              label="비교할 버전"
              value={String(previous.version)}
              options={others.map((entry) => ({
                value: String(entry.version),
                label: `v${entry.version}`,
              }))}
              onChange={(value) => setBase(value, String(selected.version))}
            />
          )}
        </div>
        {!current ? (
          <p className={s.intro}>원문을 읽을 수 없어 비교하지 못합니다.</p>
        ) : !previous ? (
          <p className={s.intro}>
            비교할 다른 버전이 없습니다. 판매사가 새 버전을 등록하면 차이를 보여
            줍니다.
          </p>
        ) : (
          <ChangeList
            changes={
              previous.version < selected.version
                ? diffProducts(comparable(previous)!, current)
                : diffProducts(current, comparable(previous)!)
            }
            from={`v${Math.min(previous.version, selected.version)}`}
            to={`v${Math.max(previous.version, selected.version)}`}
          />
        )}
      </section>
    </>
  );
}

function ProductDocumentView({ document }: { document: ProductDocument }) {
  return (
    <section className={`${s.panel} ${s.pad} ${s.section}`}>
      <h2>설명서 내용</h2>
      <Facts
        rows={[
          ["상품명", productDisplayName(document)],
          ["상품 코드", <code>{document.code}</code>],
          ["상품 유형", document.type],
          ["발행사·운용사", document.issuer],
          ["판매사", document.seller],
          ["위험등급", gradeLabel(document.riskGrade)],
          ["고난도 금융투자상품", yesNo(document.complex)],
          ["파생결합증권", yesNo(document.derivative)],
          ["판매대상 고객군", document.targetMarket],
          ["최대 손실", document.maxLoss],
          ["수수료", document.fee],
          ["상품 요약", document.summary],
        ]}
      />
      <h3 className={s.subhead}>핵심 설명 카드</h3>
      <div className={s.cards}>
        {(Array.isArray(document.cards) ? document.cards : []).map(
          (card, index) => (
            <div key={index}>
              <strong>
                {index + 1}. {card?.title}
              </strong>
              <p>{card?.text}</p>
            </div>
          ),
        )}
      </div>
    </section>
  );
}
