import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  AlertTriangle,
  Check,
  FileText,
  SearchX,
  ShieldCheck,
} from "lucide-react";
import {
  computeSignals,
  SIGNAL_LABELS,
  type Deployment,
  type Signal,
  type EvidenceReceipt,
  type OriginalBundle,
} from "@finveric/core";
import type { ConfigDto, ExportResponse } from "@finveric/core/api";
import {
  ledgerReadCode,
  type LedgerDiagnosis,
  type LedgerSnapshot,
} from "@finveric/core/ledger";
import {
  CHECK_NAMES,
  isValidSaleId,
  OUTCOME_LABELS,
  type SaleVerification,
  type VerifyOutcome,
} from "@finveric/core/verify";
import { api, ApiError } from "../../shared/api.ts";
import { Button } from "../../shared/button.tsx";
import {
  Disclosure,
  AccessCodeForm,
  Badge,
  DetailColumn,
  DetailRow,
  Facts,
  FieldError,
  Notice,
  Stat,
  TableScroll,
  type Tone,
} from "../../shared/components.tsx";
import { dateTime } from "../../shared/format.ts";
import ui from "../../shared/ui.module.css";
import local from "../auditor.module.css";
import { LedgerGate } from "../components.tsx";
import { buildDisputeReport } from "../report.ts";
import { ReportDownloads } from "../ReportDownloads.tsx";
import { SelectField } from "../../shared/SelectField.tsx";
import {
  customerPath,
  gradeLabel,
  ledgerNotice,
  productName,
  profileLabel,
  REFERENCE_LABELS,
  ruleLabel,
  salePath,
  saleSignals,
  short,
  STATUS_LABELS,
  STATUS_TONES,
  won,
} from "../format.ts";
import type { Ledger } from "../useLedger.ts";

const s = { ...ui, ...local };

const OUTCOME_TONES: Record<VerifyOutcome, Tone> = {
  match: "success",
  mismatch: "warning",
  missing: "neutral",
};
const OUTCOME_TEXT: Record<VerifyOutcome, string> = {
  match: "대조한 모든 항목이 원장 기록과 같습니다.",
  mismatch: "일부 항목이 원장 기록과 다릅니다. 확인 필요 항목을 보세요.",
  missing: "지정한 원장에 이 판매 ID의 청약 기록이 없습니다.",
};
const CUSTOMER_REF = /^0x[0-9a-fA-F]{64}$/;

/** 분쟁 조회. 판매 ID는 verifySale로 단계별 대조를, 고객 가명 ID는 원장의 진단·판매 기록을 보여 준다. */
export function Disputes({
  deployment,
  ledger,
  search,
}: {
  deployment?: Deployment;
  ledger: Ledger;
  search: string;
}) {
  const params = new URLSearchParams(search);
  const customer = params.get("customer");
  const saleId = params.get("sale") ?? "";
  const byCustomer = customer !== null;
  return (
    <div className={s.page}>
      {/* 조회 방법 전환. 주요 버튼이 아니라 칩 링크로 둔다. */}
      <nav aria-label="조회 방법" className={`${s.chips} ${s.modes}`}>
        <Link
          to="/disputes"
          className={!byCustomer ? s.chipActive : undefined}
          aria-current={!byCustomer ? "page" : undefined}
        >
          판매 ID로 조회
        </Link>
        <Link
          to="/disputes?customer="
          className={byCustomer ? s.chipActive : undefined}
          aria-current={byCustomer ? "page" : undefined}
        >
          고객 가명 ID로 조회
        </Link>
      </nav>
      {byCustomer ? (
        <CustomerLookup key={customer} ledger={ledger} customerRef={customer} />
      ) : (
        <SaleLookup
          key={search}
          deployment={deployment}
          ledger={ledger}
          initialId={saleId}
          initialSource={params.get("source") === "file" ? "file" : "ledger"}
        />
      )}
    </div>
  );
}

type Source = "ledger" | "seller" | "file";
type Result = {
  deployment: Deployment;
  primary: SaleVerification;
  ledgerOnly: SaleVerification;
  snapshot: LedgerSnapshot;
  source: Source;
  hasReceipt: boolean;
  hasOriginal: boolean;
  sellerError?: string;
};

function SaleLookup({
  deployment,
  ledger,
  initialId,
  initialSource,
}: {
  deployment?: Deployment;
  ledger: Ledger;
  initialId: string;
  initialSource: Source;
}) {
  const [id, setId] = useState(initialId);
  const [source, setSource] = useState<Source>(initialSource);
  const [receipt, setReceipt] = useState<EvidenceReceipt>();
  const [original, setOriginal] = useState<OriginalBundle>();
  const [files, setFiles] = useState<
    Partial<Record<"receipt" | "original", string>>
  >({});
  const [checked, setResult] = useState<Result>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(false);
  /** 판매 ID 입력 칸의 오류. 비었거나 형식이 다르면 누를 때 알려 준다. */
  const [idError, setIdError] = useState("");
  const idInput = useRef<HTMLInputElement>(null);
  const idErrorId = useId();
  const [tokenRequired, setTokenRequired] = useState(false);
  const autoRun = useRef(false);
  const saleId = id.trim();
  const result = checked?.deployment === deployment ? checked : undefined;
  const sales = [...(ledger.snapshot?.sales ?? [])].reverse();

  const load = async (file: File | undefined, kind: "receipt" | "original") => {
    if (!file) return;
    setResult(undefined);
    setError("");
    setRetry(false);
    if (kind === "receipt") setReceipt(undefined);
    else setOriginal(undefined);
    setFiles((current) => ({ ...current, [kind]: undefined }));
    if (file.size > 2_000_000) {
      setError("2MB 이하 JSON 파일을 선택하세요.");
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      return setError(
        "파일을 읽을 수 없습니다. 내려받은 JSON 파일을 선택하세요.",
      );
    }
    if (
      parsed?.format !== `finveric-${kind}-v5` ||
      typeof parsed.saleId !== "string"
    )
      return setError(
        kind === "receipt"
          ? "가입 증명서 파일(finveric-receipt-v5)을 선택하세요."
          : "원본 묶음 파일(finveric-original-v5)을 선택하세요.",
      );
    const other = kind === "receipt" ? original : receipt;
    if (other && other.saleId !== parsed.saleId)
      return setError("같은 판매 건의 증명서와 원본을 선택하세요.");
    if (kind === "receipt") setReceipt(parsed);
    else setOriginal(parsed);
    setId((current) => current.trim() || parsed.saleId);
    setFiles((current) => ({ ...current, [kind]: file.name }));
  };

  const verify = async () => {
    if (loading || !deployment || ledger.needsConfiguration) return;
    // 누를 수 없게 막지 않고, 누르면 빠진 것을 입력 칸 아래에 알려 준다.
    const invalid = !saleId
      ? "판매 ID를 입력하세요."
      : !isValidSaleId(saleId)
        ? "판매 ID는 10진수 숫자입니다. 원장의 판매 건에서 선택할 수도 있습니다."
        : "";
    setIdError(invalid);
    if (invalid) {
      idInput.current?.focus();
      return;
    }
    setLoading(true);
    setResult(undefined);
    setError("");
    setRetry(false);
    try {
      const read = await ledger.reload();
      if (!read.ok) {
        setRetry(!read.needsConfiguration);
        return;
      }
      const { snapshot } = read;
      let evidence = source === "file" ? receipt : undefined;
      let witness = source === "file" ? original : undefined;
      let sellerError: string | undefined;
      if (source === "seller") {
        const originalNotice =
          "원본 답변까지 대조하려면 증권사 앱에서 받은 원본 파일을 선택하세요.";
        try {
          // 접근 코드 없는 공개 시연에서는 서버가 원본 다운로드를 거절한다(DEMO_SCOPE_DENIED).
          // 거절될 요청을 보내지 않아 브라우저 콘솔에 오류를 남기지 않는다.
          const config = await api<ConfigDto>("/config");
          const originalOpen = !(config.publicChannel && !config.requiresToken);
          if (!originalOpen) sellerError = originalNotice;
          [evidence, witness] = await Promise.all([
            api<ExportResponse["receipt"]>(`/sales/${saleId}/export/receipt`),
            originalOpen
              ? api<ExportResponse["original"]>(
                  `/sales/${saleId}/export/original`,
                ).catch((error: unknown) => {
                  if (!(
                    error instanceof ApiError &&
                    error.code === "DEMO_SCOPE_DENIED"
                  ))
                    throw error;
                  sellerError = originalNotice;
                  return undefined;
                })
              : undefined,
          ]);
          setTokenRequired(false);
        } catch (error) {
          const needsCode =
            error instanceof ApiError && error.code === "ACCESS_CODE_INVALID";
          setTokenRequired(needsCode);
          sellerError = needsCode
            ? "판매사 제출 자료를 받으려면 접근 코드를 입력하세요. 원장 기록만 대조했습니다."
            : "판매사 제출 자료를 불러오지 못해 원장 기록만 대조했습니다. 파일이 있으면 직접 선택해 대조할 수 있습니다.";
        }
      }
      const ledgerOnly = await read.verifySale(
        saleId,
        undefined,
        undefined,
        "hapnida",
      );
      const primary =
        evidence || witness
          ? await read.verifySale(saleId, evidence, witness, "hapnida")
          : ledgerOnly;
      setResult({
        deployment,
        primary,
        ledgerOnly,
        snapshot,
        source,
        hasReceipt: !!evidence,
        hasOriginal: !!witness,
        sellerError,
      });
    } catch (e) {
      setRetry(true);
      setError(
        ledgerNotice(
          "원장 기록을 대조하지 못했습니다. 다시 대조하세요.",
          ledgerReadCode(e),
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  // 다른 화면에서 판매 ID로 들어오면 원장만 바로 대조한다.
  useEffect(() => {
    if (
      autoRun.current ||
      !deployment ||
      !initialId ||
      initialSource !== "ledger"
    )
      return;
    autoRun.current = true;
    void verify();
    // verify는 처음 렌더의 값(초기 판매 ID, 원장만)을 쓴다. 한 번만 실행한다.
  }, [deployment, initialId, initialSource]);

  return (
    <>
      <div className={s.verifyGrid}>
        <form
          className={`${s.panel} ${s.pad}`}
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <h2>조회할 판매 건</h2>
          <SelectField
            clearable
            label="원장의 판매 건에서 선택"
            placeholder={
              !ledger.snapshot
                ? ledger.error
                  ? "원장을 읽지 못했습니다"
                  : "원장을 읽고 있습니다"
                : sales.length
                  ? "판매 건을 선택하세요"
                  : "원장에 판매 건이 없습니다"
            }
            value={saleId}
            disabled={loading}
            options={sales.map((sale) => ({
              value: sale.saleId,
              label: productName(
                ledger.snapshot,
                sale.productId,
                sale.productVersion,
              ),
              reference: short(sale.saleId),
              status: {
                label: STATUS_LABELS[sale.status],
                tone: STATUS_TONES[sale.status],
              },
            }))}
            onChange={(value) => {
              setId(value);
              setIdError("");
              setResult(undefined);
              setError("");
              setRetry(false);
            }}
          />
          <label className={s.field}>
            판매 ID
            <input
              ref={idInput}
              className={s.breakWord}
              value={id}
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              readOnly={loading}
              aria-invalid={idError ? true : undefined}
              aria-describedby={idErrorId}
              onChange={(e) => {
                setId(e.target.value);
                setIdError("");
                setResult(undefined);
                setError("");
                setRetry(false);
              }}
              placeholder="판매 ID(10진수)를 입력하세요"
            />
          </label>
          <FieldError id={idErrorId}>{idError}</FieldError>
          <fieldset className={s.sources}>
            <legend>함께 대조할 자료</legend>
            {(
              [
                [
                  "ledger",
                  "원장만",
                  "판매사 자료 없이 원장 기록만 대조합니다.",
                ],
                [
                  "seller",
                  "판매사 제출 자료 불러오기",
                  "판매사가 보관한 증명서와 원본을 가져옵니다.",
                ],
                [
                  "file",
                  "파일 선택",
                  "보관 중인 증명서나 원본 파일을 선택합니다.",
                ],
              ] as const
            ).map(([value, label, hint]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="source"
                  value={value}
                  checked={source === value}
                  disabled={loading}
                  onChange={() => {
                    setSource(value);
                    setResult(undefined);
                    setError("");
                    setRetry(false);
                  }}
                />
                <span>
                  {label}
                  <small>{hint}</small>
                </span>
              </label>
            ))}
          </fieldset>
          {source === "file" && (
            <>
              <label className={s.upload}>
                가입 증명서 (finveric-receipt-v5)
                <input
                  type="file"
                  accept="application/json,.json"
                  disabled={loading}
                  onChange={(e) => void load(e.target.files?.[0], "receipt")}
                />
                {files.receipt && (
                  <span className={`${s.small} ${s.breakWord}`}>
                    {files.receipt}
                  </span>
                )}
              </label>
              <label className={s.upload}>
                원본 묶음 (finveric-original-v5)
                <input
                  type="file"
                  accept="application/json,.json"
                  disabled={loading}
                  onChange={(e) => void load(e.target.files?.[0], "original")}
                />
                {files.original && (
                  <span className={`${s.small} ${s.breakWord}`}>
                    {files.original}
                  </span>
                )}
              </label>
            </>
          )}
          {source === "seller" && tokenRequired && (
            <AccessCodeForm connect={() => void verify()} busy={loading} />
          )}
          <Button
            type="submit"
            busy={loading}
            blocked={!deployment || ledger.needsConfiguration}
          >
            {loading ? (
              "원장과 대조하는 중"
            ) : (
              <>
                {retry ? "다시 대조하기" : "원장과 대조하기"}
                <ShieldCheck size={16} data-icon="end" />
              </>
            )}
          </Button>
          {source === "file" && (receipt || original) && (
            <Button
              variant="ghost"
              type="button"
              blocked={loading}
              onClick={() => {
                setReceipt(undefined);
                setOriginal(undefined);
                setFiles({});
                setResult(undefined);
              }}
            >
              선택한 파일 비우기
            </Button>
          )}
        </form>
        <section className={`${s.panel} ${s.pad}`}>
          {/* 대조 중과 결과를 화면 낭독기에 짧게 알린다. 오류 자리는 늘 그려 둔다. */}
          <p role="status" className={s.srOnly}>
            {loading
              ? "원장과 대조하고 있습니다."
              : result
                ? `대조를 마쳤습니다. 결과: ${OUTCOME_LABELS[result.primary.outcome]}`
                : ""}
          </p>
          <div role="alert">
            {(error || ledger.error) && (
              <Notice tone="danger">{error || ledger.error}</Notice>
            )}
          </div>
          {result ? (
            <SaleSummary result={result} files={files} />
          ) : (
            !(error || ledger.error) && (
              <>
                <h2>대조 결과</h2>
                <p className={s.intro}>
                  {loading
                    ? "판매 기록을 원장과 대조하고 있습니다."
                    : "판매 건을 고르거나 판매 ID를 입력한 뒤 원장과 대조하기를 누르세요."}
                </p>
              </>
            )
          )}
        </section>
      </div>
      {/* 판매 건 기록과 진단 회차 표는 화면 너비의 줄에 둔다. 조회 영역 옆에 길게 쌓이지 않는다. */}
      {result && <SaleDetails result={result} deployment={deployment} />}
    </>
  );
}

/** 대조 결과 요약: 결과, 원장·제출 자료 대조, 항목별 결과. 조회 영역 옆 패널에 둔다. */
function SaleSummary({
  result,
  files,
}: {
  result: Result;
  files: Partial<Record<"receipt" | "original", string>>;
}) {
  const { primary, ledgerOnly, snapshot } = result;
  const sale = primary.sale;
  const outcome = primary.outcome;
  const hasEvidence = result.hasReceipt || result.hasOriginal;
  // 제출 자료 대조: 원장만으로 통과한 항목이 자료를 넣고 실패하지 않았고, 증명서·원본 항목이 통과했다.
  const evidenceOk = primary.checks.every(
    (check) =>
      check.ok ||
      ledgerOnly.checks.find((entry) => entry.name === check.name)?.ok ===
        false,
  );
  const fileNames = [files.receipt, files.original].filter(Boolean).join(", ");
  return (
    <>
      <div className={s.outcome}>
        {outcome === "match" ? (
          <ShieldCheck className={s.successIcon} />
        ) : outcome === "mismatch" ? (
          <AlertTriangle className={s.warningIcon} />
        ) : (
          <SearchX className={s.neutralIcon} />
        )}
        <div>
          <Badge tone={OUTCOME_TONES[outcome]}>{OUTCOME_LABELS[outcome]}</Badge>
          <h2>
            {sale
              ? productName(snapshot, sale.productId, sale.productVersion)
              : "판매 기록 없음"}
          </h2>
          <p>{OUTCOME_TEXT[outcome]}</p>
          <p>
            판매 ID <code>{primary.saleId}</code>
          </p>
        </div>
      </div>
      {result.sellerError && (
        <Notice tone="warning">{result.sellerError}</Notice>
      )}
      {outcome !== "missing" && (
        <div className={s.split}>
          <div>
            <strong>원장 기록과 가입 조건</strong>
            <Badge
              tone={ledgerOnly.outcome === "match" ? "success" : "warning"}
            >
              {ledgerOnly.outcome === "match" ? "검증 완료" : "확인 필요"}
            </Badge>
            <small>
              판매 기록, 상품 버전, 진단 기준·회차와 증명, 필수 확인, 숙려를
              원장으로 대조했습니다.
            </small>
          </div>
          <div>
            <strong>제출 자료 대조</strong>
            <Badge
              tone={
                !hasEvidence ? "neutral" : evidenceOk ? "success" : "warning"
              }
            >
              {!hasEvidence ? "자료 없음" : evidenceOk ? "일치" : "불일치"}
            </Badge>
            <small>
              {!hasEvidence
                ? "증명서나 원본을 넣으면 원장 기록과 대조합니다."
                : result.source === "seller"
                  ? result.hasOriginal
                    ? "판매사에서 받은 증명서와 원본을 원장 기록과 대조했습니다."
                    : "판매사에서 받은 증명서를 원장 기록과 대조했습니다."
                  : `선택한 파일을 원장 기록과 대조했습니다. ${fileNames}`}
            </small>
          </div>
        </div>
      )}
      <h3 className={s.subhead}>항목별 결과</h3>
      {Object.values(CHECK_NAMES).map((name) => {
        const check = primary.checks.find((entry) => entry.name === name);
        if (!check) {
          if (outcome === "missing") return null;
          const needs =
            name === CHECK_NAMES.original
              ? "원본 묶음을 넣으면 모든 회차의 답변을 원장 기록과 대조하고 판정을 다시 계산합니다."
              : name === CHECK_NAMES.receipt
                ? "증명서를 넣으면 증명서의 판매 ID, 상품 버전, 회차, 금액, 거래를 원장과 대조합니다."
                : "이 항목은 확인하지 않았습니다.";
          return (
            <div className={s.checkResult} key={name}>
              <FileText className={s.neutralIcon} />
              <div>
                <strong>{name}</strong>
                <p>{needs}</p>
              </div>
              <Badge>자료 없음</Badge>
            </div>
          );
        }
        const absent = outcome === "missing" && !check.ok;
        return (
          <div className={s.checkResult} key={name}>
            {check.ok ? (
              <Check className={s.successIcon} />
            ) : absent ? (
              <SearchX className={s.neutralIcon} />
            ) : (
              <AlertTriangle className={s.warningIcon} />
            )}
            <div>
              <strong>{check.name}</strong>
              <p>{check.detail}</p>
            </div>
            <Badge tone={check.ok ? "success" : absent ? "neutral" : "warning"}>
              {check.ok ? "일치" : absent ? "기록 없음" : "확인 필요"}
            </Badge>
          </div>
        );
      })}
      <ReportDownloads
        getReport={() =>
          buildDisputeReport(result.deployment, snapshot, primary, ledgerOnly, {
            mode: result.source,
            receipt: result.hasReceipt,
            original: result.hasOriginal,
            notice: result.sellerError,
          })
        }
      />
    </>
  );
}

/**
 * 대조 결과의 기록: 판매 건 기록, 위험 신호, 대조에 쓴 원장, 진단 회차.
 * 두 열 패널과 화면 너비의 표 패널로 둔다.
 */
function SaleDetails({
  result,
  deployment,
}: {
  result: Result;
  deployment?: Deployment;
}) {
  const { primary, snapshot } = result;
  const sale = primary.sale;
  const signals = sale ? saleSignals(computeSignals(snapshot), sale) : [];
  const ledgerPanel = (
    <section className={`${s.panel} ${s.pad}`}>
      <h2>대조에 쓴 원장</h2>
      <Facts
        rows={[
          [
            "네트워크",
            primary.chainId === 11155111
              ? "Sepolia (11155111)"
              : "Anvil (31337)",
          ],
          ["RPC", <code>{deployment?.rpcUrl}</code>],
          ["원장 컨트랙트", <code>{deployment?.ledger}</code>],
          ["Verifier", <code>{deployment?.verifier}</code>],
          ["대조 시각", dateTime(primary.verifiedAt)],
        ]}
      />
      {primary.references.length > 0 && (
        <Disclosure
          label={
            <>
              블록·거래 근거 보기 (
              {primary.references.length.toLocaleString("ko-KR")}건)
            </>
          }
        >
          <TableScroll label="블록·거래 근거">
            <table>
              <thead>
                <tr>
                  <th scope="col">기록</th>
                  <th scope="col" className={s.numeric}>
                    블록
                  </th>
                  <th scope="col">거래 해시</th>
                </tr>
              </thead>
              <tbody>
                {primary.references.map((reference, index) => (
                  <tr key={index}>
                    <td>
                      {REFERENCE_LABELS[reference.kind]}
                      {reference.attempt ? ` ${reference.attempt}회차` : ""}
                    </td>
                    <td className={s.numeric}>{reference.block}</td>
                    <td className={s.wrap}>
                      <code>{reference.txHash}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </Disclosure>
      )}
    </section>
  );
  if (!sale) return <div className={s.section}>{ledgerPanel}</div>;
  return (
    <>
      <div className={`${s.columns} ${s.section}`}>
        <section className={`${s.panel} ${s.pad}`}>
          <h2>판매 건 기록</h2>
          <Facts
            rows={[
              [
                "상품",
                <Link to={`/products?product=${sale.productId}`}>
                  {productName(snapshot, sale.productId, sale.productVersion)} v
                  {sale.productVersion}
                </Link>,
              ],
              [
                "고객 가명 ID",
                <Link to={customerPath(sale.customerRef)}>
                  <code title={sale.customerRef}>
                    {short(sale.customerRef, 10, 8)}
                  </code>
                </Link>,
              ],
              ["청약 회차", `${sale.attempt}회차`],
              [
                "적합 여부",
                sale.suitable ? (
                  "적합"
                ) : (
                  <Badge tone="warning">부적합 · 추가 위험 확인</Badge>
                ),
              ],
              ["녹취·숙려 대상", sale.protectedSale ? "대상" : "대상 아님"],
              [
                "관리자 승인",
                sale.attempt >= 3
                  ? sale.approved
                    ? "승인 기록 있음"
                    : "승인 기록 없음"
                  : "대상 아님(3회차 미만)",
              ],
              ["설명 확인 시간", `${sale.explanationSeconds}초`],
              ["청약 금액", won(sale.amount)],
              [
                "상태",
                <Badge tone={STATUS_TONES[sale.status]}>
                  {STATUS_LABELS[sale.status]}
                </Badge>,
              ],
              ["청약 시각", dateTime(sale.subscribed.at)],
              [
                sale.withdrawn ? "철회 시각" : "확정 시각",
                dateTime((sale.withdrawn ?? sale.confirmed)?.at),
              ],
            ]}
          />
        </section>
        <div className={s.stack}>
          <section className={`${s.panel} ${s.pad}`}>
            <h2>위험 신호</h2>
            <SignalList
              signals={signals}
              empty="이 판매 건에 해당하는 위험 신호가 없습니다."
            />
          </section>
          {ledgerPanel}
        </div>
      </div>
      <DiagnosisPanel
        diagnoses={primary.diagnoses}
        snapshot={snapshot}
        saleAttempt={sale.attempt}
        title="이 고객 가명 ID의 진단 회차"
      />
    </>
  );
}

/** 위험 신호 목록. 신호 종류는 주의 배지, 근거는 옅은 글자다. */
function SignalList({
  signals,
  empty,
  showSale,
}: {
  signals: readonly Signal[];
  empty: string;
  showSale?: boolean;
}) {
  return signals.length ? (
    <ul className={s.choices}>
      {signals.map((signal, index) => (
        <li key={index}>
          <Badge tone="warning">{SIGNAL_LABELS[signal.kind]}</Badge>
          <span className={s.small}>
            {signal.detail}
            {showSale && signal.saleId ? ` · 판매 ${short(signal.saleId)}` : ""}
          </span>
        </li>
      ))}
    </ul>
  ) : (
    <p className={s.small}>{empty}</p>
  );
}

/** 진단 회차 표. 열이 여섯 개(블록·거래를 켜면 여덟 개)라 화면 너비의 패널에 둔다. */
function DiagnosisPanel({
  diagnoses,
  snapshot,
  saleAttempt,
  title,
}: {
  diagnoses: LedgerDiagnosis[];
  snapshot: LedgerSnapshot;
  saleAttempt?: number;
  title: string;
}) {
  const [technical, setTechnical] = useState(false);
  return (
    <TableScroll
      as="section"
      label={title}
      className={`${s.panel} ${s.section}`}
    >
      <div className={s.panelTitle}>
        <h2>{title}</h2>
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
            <th scope="col">회차</th>
            <th scope="col">투자성향</th>
            <th scope="col">권유 가능 최고 위험등급</th>
            <th scope="col">고령 표시</th>
            <th scope="col">기준</th>
            <th scope="col">블록 시각</th>
            {technical && (
              <th scope="col" className={s.numeric}>
                블록
              </th>
            )}
            {technical && <th scope="col">거래 해시</th>}
          </tr>
        </thead>
        <tbody>
          {diagnoses.map((diagnosis) => (
            <tr
              key={diagnosis.attempt}
              className={
                diagnosis.attempt === saleAttempt ? s.selectedRow : undefined
              }
            >
              <td>
                {diagnosis.attempt}회차{" "}
                {diagnosis.attempt === saleAttempt && (
                  <Badge tone="subscribed">청약 회차</Badge>
                )}
              </td>
              <td>{profileLabel(diagnosis.profile)}</td>
              <td>{gradeLabel(diagnosis.limit)}까지</td>
              <td>{diagnosis.elderly ? "고령" : "—"}</td>
              <td>{ruleLabel(snapshot, diagnosis.ruleHash)}</td>
              <td>{dateTime(diagnosis.at)}</td>
              {technical && (
                <td className={s.numeric}>{diagnosis.block.toString()}</td>
              )}
              {technical && (
                <td className={s.wrap}>
                  <code>{diagnosis.txHash}</code>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {diagnoses.length === 0 && (
        <p className={s.panelNote}>원장에 진단 기록이 없습니다.</p>
      )}
    </TableScroll>
  );
}

function CustomerLookup({
  ledger,
  customerRef,
}: {
  ledger: Ledger;
  customerRef: string;
}) {
  const navigate = useNavigate();
  const [value, setValue] = useState(customerRef);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const snapshot = ledger.snapshot;
  const known = snapshot
    ? [
        ...new Set(
          [...snapshot.diagnoses, ...snapshot.sales].map(
            (entry) => entry.customerRef,
          ),
        ),
      ]
    : [];
  const submit = (ref: string) => {
    const next = ref.trim();
    if (!CUSTOMER_REF.test(next)) {
      setError(
        next
          ? "고객 가명 ID는 0x로 시작하는 64자리 16진수입니다."
          : "고객 가명 ID를 입력하세요.",
      );
      input.current?.focus();
      return;
    }
    setError("");
    navigate(customerPath(next.toLowerCase()));
  };
  const valid = !!customerRef && CUSTOMER_REF.test(customerRef);
  return (
    <>
      <div className={s.verifyGrid}>
        <form
          className={`${s.panel} ${s.pad}`}
          onSubmit={(e) => {
            e.preventDefault();
            submit(value);
          }}
        >
          <h2>조회할 고객</h2>
          <SelectField
            clearable
            label="원장의 고객 가명 ID에서 선택"
            placeholder={
              !snapshot
                ? ledger.error
                  ? "원장을 읽지 못했습니다"
                  : "원장을 읽고 있습니다"
                : known.length
                  ? "고객 가명 ID를 선택하세요"
                  : "원장에 고객 기록이 없습니다"
            }
            value={value.toLowerCase()}
            options={known.map((ref) => ({
              value: ref,
              label: short(ref, 10, 8),
            }))}
            onChange={(ref) => {
              setValue(ref);
              if (ref) submit(ref);
            }}
          />
          <label className={s.field}>
            고객 가명 ID
            <input
              ref={input}
              className={s.breakWord}
              value={value}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
              aria-describedby={errorId}
              onChange={(e) => {
                setValue(e.target.value);
                setError("");
              }}
              placeholder="0x로 시작하는 64자리 16진수"
            />
          </label>
          <FieldError id={errorId}>{error}</FieldError>
          <Button type="submit">
            원장에서 조회하기
            <ShieldCheck size={16} data-icon="end" />
          </Button>
          <p className={s.small}>
            원장에는 고객 가명 ID와 진단 결과가 기록됩니다. 고객 번호와 상세
            답변은 판매사가 보관합니다.
          </p>
        </form>
        <section className={`${s.panel} ${s.pad}`}>
          <LedgerGate ledger={ledger}>
            {(snapshot) =>
              valid ? (
                <CustomerRecord snapshot={snapshot} customerRef={customerRef} />
              ) : (
                <>
                  <h2>고객 기록</h2>
                  <p className={s.intro}>
                    고객 가명 ID를 고르거나 입력하세요. 그 고객의 모든 진단
                    회차와 판매 건을 원장에서 보여 줍니다.
                  </p>
                </>
              )
            }
          </LedgerGate>
        </section>
      </div>
      {/* 진단 회차와 판매 건 표는 화면 너비의 줄에 둔다. */}
      {valid && ledger.snapshot && (
        <CustomerTables snapshot={ledger.snapshot} customerRef={customerRef} />
      )}
    </>
  );
}

/** 고객 가명 ID 하나의 진단 회차, 판매 건, 위험 신호. */
function customerRecord(snapshot: LedgerSnapshot, customerRef: string) {
  const ref = customerRef.toLowerCase();
  const diagnoses = snapshot.diagnoses
    .filter((entry) => entry.customerRef.toLowerCase() === ref)
    .sort((a, b) => a.attempt - b.attempt);
  const sales = snapshot.sales.filter(
    (entry) => entry.customerRef.toLowerCase() === ref,
  );
  const signals = computeSignals(snapshot).filter(
    (signal) => signal.customerRef.toLowerCase() === ref,
  );
  return {
    diagnoses,
    sales,
    signals,
    found: diagnoses.length > 0 || sales.length > 0,
  };
}

/** 고객 기록 요약: 결과, 요약 수치(진단, 판매 건, 위험 신호), 위험 신호 목록. 조회 영역 옆 패널에 둔다. */
function CustomerRecord({
  snapshot,
  customerRef,
}: {
  snapshot: LedgerSnapshot;
  customerRef: string;
}) {
  const { diagnoses, sales, signals, found } = customerRecord(
    snapshot,
    customerRef,
  );
  return (
    <>
      <div className={s.outcome}>
        {found ? (
          <ShieldCheck className={s.successIcon} />
        ) : (
          <SearchX className={s.neutralIcon} />
        )}
        <div>
          <Badge tone={found ? "info" : "neutral"}>
            {found ? "원장 기록 있음" : OUTCOME_LABELS.missing}
          </Badge>
          <h2>고객 기록</h2>
          <p>
            고객 가명 ID <code>{customerRef}</code>
          </p>
        </div>
      </div>
      {found ? (
        <>
          <div className={`${s.stats} ${s.recordStats} ${s.section}`}>
            <Stat label="진단" value={diagnoses.length} unit="회" />
            <Stat label="판매 건" value={sales.length} unit="건" />
            <Stat label="위험 신호" value={signals.length} unit="건" />
          </div>
          <h3 className={s.subhead}>위험 신호</h3>
          <SignalList
            signals={signals}
            empty="이 고객의 위험 신호가 없습니다."
            showSale
          />
        </>
      ) : (
        <p className={s.intro}>
          이 고객 가명 ID의 진단·판매 기록이 지정한 원장에 없습니다.
        </p>
      )}
    </>
  );
}

/** 고객의 진단 회차와 판매 건 표. 기록이 없으면 그리지 않는다. */
function CustomerTables({
  snapshot,
  customerRef,
}: {
  snapshot: LedgerSnapshot;
  customerRef: string;
}) {
  const { diagnoses, sales, found } = customerRecord(snapshot, customerRef);
  if (!found) return null;
  return (
    <>
      <DiagnosisPanel
        diagnoses={diagnoses}
        snapshot={snapshot}
        title="진단 회차"
      />
      <TableScroll
        as="section"
        label="판매 건"
        className={`${s.panel} ${s.section}`}
      >
        <table>
          <caption className={s.tableCaption}>판매 건</caption>
          <thead>
            <tr>
              <th scope="col">판매 ID</th>
              <th scope="col">상품</th>
              <th scope="col">청약 회차</th>
              <th scope="col">적합</th>
              <th scope="col">상태</th>
              <th scope="col">청약 시각</th>
              <DetailColumn label="판매 건 대조" />
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <DetailRow
                key={sale.saleId}
                destination={{
                  to: salePath(sale.saleId),
                  label: `판매 건 대조 · ${short(sale.saleId)}`,
                }}
              >
                <td>
                  <code title={sale.saleId}>{short(sale.saleId)}</code>
                </td>
                <td className={s.wrap}>
                  {productName(snapshot, sale.productId, sale.productVersion)} v
                  {sale.productVersion}
                </td>
                <td>{sale.attempt}회차</td>
                <td>
                  {sale.suitable ? (
                    "적합"
                  ) : (
                    <Badge tone="warning">부적합</Badge>
                  )}
                </td>
                <td>
                  <Badge tone={STATUS_TONES[sale.status]}>
                    {STATUS_LABELS[sale.status]}
                  </Badge>
                </td>
                <td>{dateTime(sale.subscribed.at)}</td>
              </DetailRow>
            ))}
          </tbody>
        </table>
        {sales.length === 0 && (
          <p className={s.panelNote}>
            청약 기록이 없습니다. 가입을 중단해도 진단 회차는 원장에 남습니다.
          </p>
        )}
      </TableScroll>
    </>
  );
}
