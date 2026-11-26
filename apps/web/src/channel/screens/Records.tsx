import { Link } from "react-router";
import { ChevronRight, Download } from "lucide-react";
import type {
  CustomerDto,
  ExportKind,
  ProductEntryDto,
} from "@finveric/core/api";
import type { LoadState } from "../../shared/api.ts";
import { Button } from "../../shared/button.tsx";
import {
  Disclosure,
  Empty,
  Facts,
  Heading,
  Notice,
} from "../../shared/components.tsx";
import { dateTime, won } from "../../shared/format.ts";
import { StatusBadge } from "../../shared/sale-components.tsx";
import {
  confirmedTrace,
  inCooling,
  nowSeconds,
  productName,
  profileName,
  saleProduct,
  type Sale,
} from "../../shared/sales.ts";
import ui from "../../shared/ui.module.css";
import local from "./channel.module.css";
import { ActionBar, PrimaryAction } from "../flow.tsx";
import { channel, recordPath, verifyPath } from "../links.ts";

const s = { ...ui, ...local };

/**
 * 고객이 청약한 가입 기록. 목록에서 하나를 고르면(?sale=) 상세를 연다.
 * 상세에서 증명서와 원본을 내려받고, 가입 기록 확인 화면으로 간다.
 */
export function Records({
  load,
  sales,
  products,
  customer,
  selected,
  busy,
  download,
  resume,
}: {
  load: LoadState;
  sales: Sale[];
  products: ProductEntryDto[];
  customer?: CustomerDto;
  selected: string;
  busy: string;
  download: (id: string, kind: ExportKind) => unknown;
  resume: (id: string) => void;
}) {
  const now = nowSeconds();
  const records = sales
    .filter((sale) => !!sale.chain)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (selected) {
    const sale = records.find((entry) => entry.id === selected);
    return sale ? (
      <>
        <Heading title={productName(saleProduct(products, sale)?.document)} />
        <RecordDetail
          sale={sale}
          customer={customer}
          now={now}
          busy={busy}
          download={download}
          resume={resume}
        />
      </>
    ) : (
      <>
        <Heading title="가입 기록" />
        <Empty
          title={
            load === "ready"
              ? "가입 기록을 찾지 못했어요"
              : load === "failed"
                ? "가입 기록을 불러오지 못했어요"
                : "가입 기록을 불러오고 있어요"
          }
          text={
            load === "failed"
              ? "화면을 새로 고쳐 주세요."
              : "목록에서 가입 기록을 다시 골라 주세요."
          }
        >
          <Button asChild>
            <Link to={channel.records}>가입 기록 목록 보기</Link>
          </Button>
        </Empty>
      </>
    );
  }
  return (
    <>
      <Heading title="내 가입" />
      {records.length ? (
        <ul className={s.recordList} aria-label="가입 기록 목록">
          {records.map((record) => (
            <li key={record.id}>
              <Link to={recordPath(record.id)}>
                <span>
                  <strong>
                    {productName(saleProduct(products, record)?.document)}
                  </strong>
                  <span className={s.recordMeta}>
                    <StatusBadge sale={record} now={now} />
                    <small>
                      {won(record.amount)} · {dateTime(record.createdAt)}
                    </small>
                  </span>
                </span>
                <ChevronRight size={20} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty
          title={
            load === "ready"
              ? "아직 가입 기록이 없어요"
              : load === "failed"
                ? "가입 기록을 불러오지 못했어요"
                : "가입 기록을 불러오고 있어요"
          }
          text={
            load === "failed"
              ? "화면을 새로 고쳐 주세요."
              : "상품을 고르고 진단부터 청약까지 마치면 여기에 기록이 생겨요."
          }
        >
          <Button asChild>
            <Link to={channel.catalog}>상품 보러 가기</Link>
          </Button>
        </Empty>
      )}
    </>
  );
}

function RecordDetail({
  sale,
  customer,
  now,
  busy,
  download,
  resume,
}: {
  sale: Sale;
  customer?: CustomerDto;
  now: number;
  busy: string;
  download: (id: string, kind: ExportKind) => unknown;
  resume: (id: string) => void;
}) {
  const diagnosis = customer?.diagnoses.find(
    (entry) => entry.attempt === sale.chain?.attempt,
  );
  const subscribeTx = confirmedTrace(sale, "subscribe");
  const confirmTx = confirmedTrace(sale, "confirm");
  return (
    <div className={s.stack}>
      <section className={`${s.panel} ${s.pad}`}>
        <StatusBadge sale={sale} now={now} />
        <Facts
          rows={[
            ["증명서 번호", <code>{sale.id}</code>],
            ["설명서 버전", `v${sale.productVersion}`],
            ["가입 금액", won(sale.amount)],
            [
              "투자성향",
              `${profileName(diagnosis?.profile)} · ${sale.chain?.attempt}회차 진단`,
            ],
            [
              "적합성",
              sale.chain?.suitable ? "적합" : "부적합 · 본인 판단으로 가입",
            ],
            ["핵심 설명 확인", `${sale.chain?.explanationSeconds}초`],
            [
              "녹취·숙려",
              sale.chain?.protectedSale ? "대상 · 녹취 동의" : "대상 아님",
            ],
            ["청약", dateTime(Number(sale.chain?.subscribedAt ?? 0))],
            [
              "최종 확인",
              sale.status === "confirmed"
                ? dateTime(Number(sale.chain?.confirmedAt ?? 0))
                : sale.status === "withdrawn"
                  ? "철회"
                  : "대기",
            ],
            [
              "결제 기록",
              sale.settled
                ? "완료"
                : sale.status === "confirmed"
                  ? "대기"
                  : "—",
            ],
          ]}
        />
        {inCooling(sale, now) && (
          <Notice>
            숙려기간이에요. {dateTime(sale.coolingEndsAt)}부터 최종 확인할 수
            있어요.
          </Notice>
        )}
        <Disclosure label="기술 정보 보기">
          <Facts
            rows={[
              [
                "청약 기록",
                subscribeTx ? <code>{subscribeTx.txHash}</code> : "—",
              ],
              [
                "최종 확인 기록",
                confirmTx ? <code>{confirmTx.txHash}</code> : "—",
              ],
              ["고객 가명 ID", <code>{sale.customerRef}</code>],
            ]}
          />
        </Disclosure>
      </section>
      <section className={`${s.panel} ${s.pad}`}>
        <h2>가입 서류</h2>
        <p>가입 기록을 확인하거나 서류를 내려받을 수 있어요.</p>
        {sale.status === "subscribed" && (
          <Button variant="outline" asChild>
            <Link to={verifyPath(sale.id)}>가입 기록 확인하기</Link>
          </Button>
        )}
        <Button
          variant="outline"
          blocked={!!busy}
          onClick={() => download(sale.id, "receipt")}
        >
          <Download size={16} />
          증명서 내려받기
        </Button>
        <Button
          variant="outline"
          blocked={!!busy}
          onClick={() => download(sale.id, "original")}
        >
          <Download size={16} />
          가입 원본 내려받기
        </Button>
        <Notice>
          가입 원본에는 진단 답변이 담겨 있어요. 본인만 볼 수 있는 곳에 보관해
          주세요.
        </Notice>
      </section>
      <ActionBar busy={busy}>
        {sale.status === "subscribed" ? (
          <PrimaryAction
            label="최종 확인하러 가기"
            busy={!!busy}
            onClick={() => resume(sale.id)}
          />
        ) : (
          <PrimaryAction
            label="가입 기록 확인하기"
            to={verifyPath(sale.id)}
            busy={!!busy}
          />
        )}
      </ActionBar>
    </div>
  );
}
