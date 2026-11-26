import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Check, SearchX } from "lucide-react";
import type {
  Deployment,
  EvidenceReceipt,
  OriginalBundle,
} from "@finveric/core";
import type {
  createLedgerVerificationReader,
  SaleVerification,
} from "@finveric/core/verify";
import { Button } from "../../shared/button.tsx";
import {
  Disclosure,
  Badge,
  Facts,
  FieldError,
  Heading,
  Notice,
} from "../../shared/components.tsx";
import type { useDeploymentConfig } from "../../shared/deployment.ts";
import { dateTime, networkName } from "../../shared/format.ts";
import ui from "../../shared/ui.module.css";
import s from "./customer.module.css";

/** 결과 세 가지의 제목과 안내. 화면 문구는 이 셋만 쓴다. */
const OUTCOMES = {
  match: {
    badge: "일치",
    tone: "success",
    title: "가입 기록과 일치해요",
  },
  mismatch: {
    badge: "불일치",
    tone: "warning",
    title: "가입 기록과 일치하지 않아요",
  },
  missing: {
    badge: "기록 없음",
    tone: "neutral",
    title: "이 번호의 가입 기록을 찾지 못했어요",
  },
} as const;
/** 오류가 난 입력 칸. 없으면 화면 전체의 오류다. */
type Field = "id" | "receipt" | "original";
type Failure = { field?: Field; message: string; action?: "retry" | "contact" };

const REFERENCE_NAMES: Record<string, string> = {
  rule: "진단 기준 등록",
  product: "상품 설명서 등록",
  diagnosis: "진단",
  subscribe: "청약",
  confirm: "최종 확인",
  withdraw: "철회",
  settle: "결제 기록",
};

/**
 * 가입 기록 확인 화면. 고객이 증명서 번호나 파일로 가입 기록을 확인한다.
 * 판매사 API를 부르지 않고 브라우저가 지정 RPC로 원장과 대조한다(verifySale). 결과는 일치, 불일치, 기록 없음이다.
 */
export function CustomerVerify({
  config,
  initialId,
}: {
  config: ReturnType<typeof useDeploymentConfig>;
  initialId: string;
}) {
  const { deployment, failed: configFailed, retry: retryConfig } = config;
  const [id, setId] = useState(initialId);
  const [receipt, setReceipt] = useState<EvidenceReceipt>();
  const [original, setOriginal] = useState<OriginalBundle>();
  const [result, setResult] = useState<SaleVerification>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Failure>();
  const source = useRef<{
    deployment: Deployment;
    read: ReturnType<typeof createLedgerVerificationReader>;
  }>(undefined);
  const errorIds: Record<Field, string> = {
    id: useId(),
    receipt: useId(),
    original: useId(),
  };
  const inputs = {
    id: useRef<HTMLInputElement>(null),
    receipt: useRef<HTMLInputElement>(null),
    original: useRef<HTMLInputElement>(null),
  };
  const fail = (failure: Failure) => {
    setError(failure);
    if (failure.field) inputs[failure.field].current?.focus();
  };
  /** 입력 칸의 오류 연결: 오류 문장 id와 오류 여부. */
  const fieldProps = (field: Field) => ({
    "aria-describedby": errorIds[field],
    "aria-invalid": error?.field === field ? true : undefined,
  });

  const load = async (file: File | undefined, kind: "receipt" | "original") => {
    setResult(undefined);
    setError(undefined);
    if (kind === "receipt") setReceipt(undefined);
    else setOriginal(undefined);
    if (!file) return;
    // 파일을 고른 버튼의 이름. 다른 파일을 골랐을 때 어디서 받은 파일을 골라야 하는지 알려 준다.
    const source =
      kind === "receipt" ? "'증명서 내려받기'" : "'가입 원본 내려받기'";
    try {
      if (file.size > 2_000_000)
        throw new Error("2MB 이하 파일을 골라 주세요.");
      const parsed = JSON.parse(await file.text());
      if (
        parsed?.format !== `finveric-${kind}-v5` ||
        typeof parsed.saleId !== "string"
      )
        throw new Error(
          kind === "receipt"
            ? `고른 파일은 가입 증명서가 아니에요. ${source}로 받은 파일을 골라 주세요.`
            : `고른 파일은 가입 원본이 아니에요. ${source}로 받은 파일을 골라 주세요.`,
        );
      if (kind === "receipt") {
        setReceipt(parsed);
        setId(parsed.saleId);
      } else {
        setOriginal(parsed);
        setId((current) => current || parsed.saleId);
      }
    } catch (e) {
      fail({
        field: kind,
        message:
          e instanceof Error && /^[가-힣0-9]/.test(e.message)
            ? e.message
            : `파일을 읽을 수 없어요. ${source}로 받은 파일을 골라 주세요.`,
      });
    }
  };

  const verify = async () => {
    const saleId = id.trim();
    if (loading || error?.action === "contact") return;
    if (!deployment) {
      if (configFailed) retryConfig();
      return;
    }
    // 누를 수 없게 막지 않고, 누르면 빠진 것을 알려 준다.
    if (!saleId)
      return fail({ field: "id", message: "증명서 번호를 넣어 주세요." });
    setLoading(true);
    setResult(undefined);
    setError(undefined);
    let needsConfiguration: ((error: unknown) => boolean) | undefined;
    try {
      const {
        createLedgerVerificationReader,
        isValidSaleId,
        needsLedgerConfiguration,
      } = await import("@finveric/core/verify");
      needsConfiguration = needsLedgerConfiguration;
      if (!isValidSaleId(saleId))
        return fail({
          field: "id",
          message: "증명서에 적힌 번호를 숫자로 입력해 주세요.",
        });
      if (source.current?.deployment !== deployment)
        source.current = {
          deployment,
          read: createLedgerVerificationReader(deployment),
        };
      const { verifySale } = await source.current.read();
      setResult(await verifySale(saleId, receipt, original));
    } catch (e) {
      fail(
        needsConfiguration?.(e)
          ? {
              action: "contact",
              message:
                "지금은 가입 기록을 확인할 수 없어요. 판매사에 문의해 주세요.",
            }
          : {
              action: "retry",
              message:
                "가입 기록을 불러오지 못했어요. 다시 확인해도 같은 메시지가 나오면 판매사에 문의해 주세요.",
            },
      );
    } finally {
      setLoading(false);
    }
  };

  // 내 가입 기록이나 증명서에서 번호를 넘겨 열면 설정을 받은 뒤 한 번 바로 확인한다.
  const autoChecked = useRef(false);
  useEffect(() => {
    if (!initialId || !deployment || autoChecked.current) return;
    autoChecked.current = true;
    void verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployment]);

  const outcome = result && OUTCOMES[result.outcome];
  const failed = result?.checks.filter((check) => !check.ok) ?? [];
  const loadingConfig = !deployment && !configFailed;
  const notice = configFailed
    ? "가입 기록 확인 화면을 준비하지 못했어요. 다시 불러와 주세요."
    : error && !error.field
      ? error.message
      : undefined;
  return (
    <div className={s.main}>
      <Heading
        title="기록 확인"
        description="가입할 때 받은 증명서 번호를 입력하거나 증명서 파일을 선택해 주세요."
      />
      {/* 확인 중과 결과를 화면 낭독기에 알린다. 결과 카드는 폼 아래에 그린다. */}
      <p role="status" className={ui.srOnly}>
        {loading ? "기록을 확인하고 있어요" : (outcome?.title ?? "")}
      </p>
      <form
        className={s.card}
        onSubmit={(e) => {
          e.preventDefault();
          void verify();
        }}
      >
        <label className={s.field}>
          증명서 번호
          <small>증명서에 적힌 숫자 번호예요.</small>
          <input
            ref={inputs.id}
            type="text"
            inputMode="numeric"
            value={id}
            readOnly={loading}
            {...fieldProps("id")}
            onChange={(e) => {
              setId(e.target.value);
              setResult(undefined);
              if (error?.field === "id" || error?.action === "retry")
                setError(undefined);
            }}
          />
        </label>
        <FieldError id={errorIds.id}>
          {error?.field === "id" && error.message}
        </FieldError>
        <label className={s.field}>
          가입 증명서 파일 (선택)
          <small>가입 후 내려받은 증명서예요.</small>
          <input
            ref={inputs.receipt}
            type="file"
            accept="application/json,.json"
            disabled={loading}
            {...fieldProps("receipt")}
            onChange={(e) => void load(e.target.files?.[0], "receipt")}
          />
        </label>
        <FieldError id={errorIds.receipt}>
          {error?.field === "receipt" && error.message}
        </FieldError>
        <label className={s.field}>
          가입 원본 파일 (선택)
          <small>함께 고르면 진단 답변과 설명서까지 확인해요.</small>
          <input
            ref={inputs.original}
            type="file"
            accept="application/json,.json"
            disabled={loading}
            {...fieldProps("original")}
            onChange={(e) => void load(e.target.files?.[0], "original")}
          />
        </label>
        <FieldError id={errorIds.original}>
          {error?.field === "original" && error.message}
        </FieldError>
        <div role="alert" className={s.alertSlot}>
          {notice && <Notice tone="danger">{notice}</Notice>}
        </div>
        <Button
          size="large"
          type="submit"
          busy={loading || loadingConfig}
          blocked={error?.action === "contact"}
        >
          {loading
            ? "기록을 확인하고 있어요"
            : loadingConfig
              ? "확인 화면을 준비하고 있어요"
              : configFailed
                ? "다시 불러오기"
                : error?.action === "retry"
                  ? "다시 확인하기"
                  : "확인하기"}
        </Button>
      </form>
      {result && outcome && (
        <section
          className={`${s.card} ${result.outcome === "match" ? s.match : result.outcome === "mismatch" ? s.mismatch : ""}`}
        >
          <div className={s.result}>
            <span className={s.icon}>
              {result.outcome === "match" ? (
                <Check size={22} />
              ) : result.outcome === "mismatch" ? (
                <AlertTriangle size={22} />
              ) : (
                <SearchX size={22} />
              )}
            </span>
            <div>
              <Badge tone={outcome.tone}>{outcome.badge}</Badge>
              <h2>{outcome.title}</h2>
              <p>
                {result.outcome === "match"
                  ? original
                    ? "진단 답변과 설명서까지 가입 당시 기록 그대로 보관돼 있어요."
                    : "가입 기록이 안전하게 보관돼 있어요. 원본 파일을 함께 고르면 진단 답변과 설명서도 확인할 수 있어요."
                  : result.outcome === "mismatch"
                    ? "아래 항목이 가입 당시 기록과 달라요. 받은 서류를 보관하고 판매사나 감독기관에 문의해 주세요."
                    : "증명서 번호를 다시 확인해 주세요. 번호가 맞다면 판매사나 감독기관에 문의해 주세요."}
              </p>
              {result.outcome === "mismatch" && (
                <ul className={s.items}>
                  {failed.map((check) => (
                    <li key={check.name}>{check.name}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {result.outcome !== "missing" && (
            <Disclosure className={s.tech} label="기술 정보 보기">
              <Facts
                rows={[
                  ["증명서 번호", <code>{result.saleId}</code>],
                  ["네트워크", networkName(deployment)],
                  ["원장 버전", `v${deployment?.ledgerVersion ?? "—"}`],
                  ["컨트랙트", <code>{deployment?.ledger}</code>],
                  ["확인 시각", dateTime(result.verifiedAt)],
                ]}
              />
              <ul className={s.checks}>
                {result.checks.map((check) => (
                  <li key={check.name}>
                    <span>
                      {check.name}
                      <small>{check.detail}</small>
                    </span>
                    <span>{check.ok ? "일치" : "불일치"}</span>
                  </li>
                ))}
                {result.references.map((reference) => (
                  <li key={`${reference.kind}:${reference.txHash}`}>
                    <span>
                      {REFERENCE_NAMES[reference.kind]}
                      {reference.attempt ? ` ${reference.attempt}회차` : ""} ·
                      블록 {reference.block}
                      <small>
                        <code>{reference.txHash}</code>
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            </Disclosure>
          )}
        </section>
      )}
    </div>
  );
}
