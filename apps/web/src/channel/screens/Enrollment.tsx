import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  AlertTriangle,
  BadgeCheck,
  CircleCheck,
  Download,
  LoaderCircle,
} from "lucide-react";
import {
  DEMO_AMOUNT,
  isProtectedSale,
  diagnosisCounts,
  isSuitable,
  RISK_GRADE_NAMES,
  type Deployment,
  type Product,
} from "@finveric/core";
import type {
  CustomerDto,
  DiagnoseRequest,
  ReassessmentReason,
  DiagnosisDto,
  ExportKind,
  OpenSaleRequest,
  ProductEntryDto,
  RuleEntryDto,
  SaleAction,
  SaleDto,
  SubscribeRequest,
} from "@finveric/core/api";
import { Button } from "../../shared/button.tsx";
import { SelectField } from "../../shared/SelectField.tsx";
import type { api, LoadState } from "../../shared/api.ts";
import {
  Disclosure,
  Badge,
  ConfirmDialog,
  Empty,
  Heading,
  Facts,
  FieldError,
  Notice,
} from "../../shared/components.tsx";
import { dateTime, won } from "../../shared/format.ts";
import {
  activeRule,
  confirmedTrace,
  gradeName,
  limitRange,
  nowSeconds,
  productName,
  profileName,
  saleProduct,
  type Sale,
} from "../../shared/sales.ts";
import ui from "../../shared/ui.module.css";
import { useKoreanDay } from "../../shared/useKoreanDay.ts";
import local from "./channel.module.css";
import type { Run } from "../App.tsx";
import { ActionBar, PrimaryAction, StepHeader } from "../flow.tsx";
import { channel, recordPath, verifyPath } from "../links.ts";

const s = { ...ui, ...local };

type Phase =
  | "start"
  | "question"
  | "result"
  | "suitability"
  | "cards"
  | "recording"
  | "subscribe";
/** 청약 전 단계의 화면 상태. 다른 탭에 다녀오거나 새로 고침해도 같은 단계로 돌아오게 세션에 보관한다. */
type Flow = {
  phase: Phase;
  question: number;
  answers: (number | null)[];
  reassessmentReason: ReassessmentReason | "";
  card: number;
  explanationMs: number;
  cardsRead: boolean;
  higherRisk: boolean;
  consent: boolean;
};
/** 가입 단계. 진행 막대는 이 순서로 채운다. */
const STAGES = [
  "진단",
  "결과",
  "적합성",
  "설명",
  "녹취",
  "청약",
  "숙려",
  "최종 확인",
  "증명서",
] as const;
type Stage = (typeof STAGES)[number];
const progressOf = (stage: Stage, part = 0) =>
  (STAGES.indexOf(stage) + part) / (STAGES.length - 1);

const flowKey = (id: string) => `finveric-enroll:${id}`;
const saveFlow = (id: string, flow: Flow) =>
  sessionStorage.setItem(flowKey(id), JSON.stringify(flow));
function loadFlow(id: string, initial: Flow): Flow {
  try {
    const value = sessionStorage.getItem(flowKey(id));
    return value ? { ...initial, ...JSON.parse(value) } : initial;
  } catch {
    return initial;
  }
}

/** 1초마다 지금 시각(초)을 갱신한다. 숙려 남은 시간 표시에 쓴다. */
function useNow(active: boolean) {
  const [now, setNow] = useState(nowSeconds);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(nowSeconds()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}
/** 문장 안에 쓰는 권유 가능 위험등급. limit은 권유할 수 있는 가장 위험한 등급이다. 예: "6등급", "2~6등급". */
const limitPhrase = (limit: number) =>
  limit >= 6 ? "6등급" : `${limit}~6등급`;
/** 문장 안에 쓰는 위험등급. 예: "1등급(매우 높은 위험)". */
const gradePhrase = (grade: number) =>
  `${grade}등급(${RISK_GRADE_NAMES[grade] ?? "위험등급 확인 필요"})`;

/** 확인란이나 답을 기다리는 주요 버튼을 눌렀을 때 보여 주는 안내의 id와 확인란 안내. */
const GATE_HINT = "enroll-gate-hint";
const CHECK_HINT = "위 확인란을 체크하면 계속할 수 있어요.";

const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

/** 한 단계의 화면. 주요 동작은 action 하나다. */
type Step = {
  stage: Stage;
  part?: number;
  label: string;
  title: string;
  badge?: ReactNode;
  back?: () => void;
  content: ReactNode;
  action: ReactNode;
};

/**
 * 가입 절차. 증권사 앱에서 고객이 보는 화면이다.
 * 진단(회차마다 원장 기록) → 결과 → 적합성 → 핵심 설명 카드 5장 → 녹취 동의 → 청약 → 숙려 → 최종 확인 → 증명서.
 * 단계마다 머리글(이전, 단계, 진행 막대), 제목, 내용, 아래 주요 동작 하나를 둔다.
 */
export function Enrollment({
  load,
  sale,
  preparation,
  rules,
  products,
  customer,
  deployment,
  busy,
  run,
  request,
  openSale,
  action,
  abandon,
  refresh,
  refreshSale,
  download,
  finish,
}: {
  load: LoadState;
  sale?: Sale;
  preparation?: Product;
  rules: RuleEntryDto[];
  products: ProductEntryDto[];
  customer?: CustomerDto;
  deployment?: Deployment;
  busy: string;
  run: Run;
  request: typeof api;
  openSale: (
    product: Product,
    intent: NonNullable<OpenSaleRequest["intent"]>,
  ) => Promise<Sale>;
  action: (id: string, name: SaleAction, label: string) => unknown;
  abandon: () => unknown;
  refresh: () => unknown;
  refreshSale: (id: string) => unknown;
  download: (id: string, kind: ExportKind) => unknown;
  finish: () => void;
}) {
  const rule = activeRule(rules)?.document;
  const diagnoses = customer?.diagnoses ?? [];
  const [flow, setFlow] = useState<Flow>(() =>
    loadFlow(sale?.id ?? "", {
      phase: diagnoses.length ? "start" : "question",
      question: 0,
      answers: [],
      reassessmentReason: "",
      card: 0,
      explanationMs: 0,
      cardsRead: false,
      higherRisk: false,
      consent: false,
    }),
  );
  const [confirm, setConfirm] = useState<"stop" | "withdraw">();
  const reassessmentHint = useId();
  const koreanDay = useKoreanDay();
  const { reassessmentReason } = flow;
  const update = (change: Partial<Flow>) =>
    setFlow((current) => ({ ...current, ...change }));
  useEffect(() => {
    if (sale?.status === "draft") saveFlow(sale.id, flow);
    else if (sale) sessionStorage.removeItem(flowKey(sale.id));
  }, [flow, sale]);
  // 핵심 설명을 본 시간은 청약을 준비하는 동안 화면에서 잰다.
  const cardStart = useRef<number | undefined>(undefined);
  const flowRef = useRef(flow);
  flowRef.current = flow;
  useEffect(() => {
    if (flow.phase !== "cards" || (sale && sale.status !== "draft")) return;
    cardStart.current ??= Date.now();
    return () => {
      if (cardStart.current === undefined) return;
      const spent = Date.now() - cardStart.current;
      cardStart.current = undefined;
      const current = flowRef.current;
      if (current.phase === "cards" && sale)
        saveFlow(sale.id, {
          ...current,
          explanationMs: current.explanationMs + spent,
        });
    };
  }, [flow.phase, sale?.status, sale?.id]);
  const leaveCards = (change: Partial<Flow>) => {
    const spent = cardStart.current ? Date.now() - cardStart.current : 0;
    cardStart.current = undefined;
    update({ ...change, explanationMs: flow.explanationMs + spent });
  };
  const product = sale ? saleProduct(products, sale) : preparation;
  const latest = diagnoses.at(-1);
  const subscribed = sale?.status === "subscribed";
  const now = useNow(subscribed && sale?.coolingEndsAt !== undefined);
  const coolingLeft =
    subscribed && sale.coolingEndsAt
      ? Math.max(0, sale.coolingEndsAt - now)
      : 0;
  const waitingApproval =
    sale?.status === "draft" &&
    flow.phase === "subscribe" &&
    sale.approvalRequired &&
    sale.approvedAttempt !== sale.latestAttempt;
  // 관리자 승인을 기다리는 동안 판매 건을 다시 읽는다. 승인은 판매사 콘솔(다른 탭)이 API로 기록한다.
  useEffect(() => {
    if (!waitingApproval || !sale) return;
    const id = sale.id;
    const timer = setInterval(() => void refreshSale(id), 3000);
    return () => clearInterval(timer);
  }, [waitingApproval, sale?.id, refreshSale]);

  // 단계가 바뀌면 화면 맨 위에서 시작하고, 새 단계 제목으로 초점을 옮긴다.
  const stepKey = [
    sale?.id,
    sale?.status,
    flow.phase,
    flow.question,
    flow.card,
    coolingLeft > 0,
  ].join(":");
  const titleRef = useRef<HTMLHeadingElement>(null);
  const firstStep = useRef(true);
  // 확인란·답을 기다리는 주요 버튼을 누르면 안내를 보이고 그 입력으로 초점을 옮긴다.
  const [gateHint, setGateHint] = useState(false);
  const gateRef = useRef<HTMLInputElement>(null);
  const explainGate = () => {
    setGateHint(true);
    gateRef.current?.focus();
  };
  useEffect(() => {
    setGateHint(false);
    window.scrollTo(0, 0);
    // 처음 화면(새로 고침, 탭 이동)은 Frame이 초점을 정한다.
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    titleRef.current?.focus({ preventScroll: true });
  }, [stepKey]);

  if (!product)
    return (
      <>
        <Heading title="가입" />
        <Empty
          title={
            load === "loading"
              ? "가입 정보를 불러오고 있어요"
              : load === "failed" && !sale
                ? "가입 정보를 불러오지 못했어요"
                : sale
                  ? "가입 상품을 확인하지 못했어요"
                  : "진행 중인 가입이 없어요"
          }
          text={
            load === "failed" && !sale
              ? "화면을 새로 고쳐 주세요."
              : "상품을 고르면 투자성향 진단부터 시작해요."
          }
        >
          <Button asChild>
            <Link to={channel.catalog}>상품 보러 가기</Link>
          </Button>
        </Empty>
      </>
    );

  const { document } = product;
  const isBusy = !!busy;
  const suitable = latest ? isSuitable(document.riskGrade, latest.limit) : true;
  const protectedSale = latest
    ? isProtectedSale(document, latest, suitable)
    : document.complex;
  const counts = diagnosisCounts(diagnoses, koreanDay);
  const dailyCount = `${counts.dailyDiagnoses}회 · 그중 재진단 ${counts.dailyReassessments}회`;
  const nextAttempt = counts.cumulativeAttempt + 1;
  const explanationSeconds = Math.min(
    86400,
    Math.max(1, Math.round(flow.explanationMs / 1000)),
  );
  const subscribeTx = confirmedTrace(sale, "subscribe");
  const confirmTx = confirmedTrace(sale, "confirm");
  const amount = sale?.amount ?? DEMO_AMOUNT;
  const preSubscribe = !sale || sale.status === "draft";

  const diagnose = async (answers: (number | null)[]) => {
    if (!customer || answers.some((answer) => answer === null)) return;
    const result = await run("투자성향을 진단하고 기록하고 있어요", () =>
      request<DiagnosisDto>(
        `/customers/${encodeURIComponent(customer.number)}/diagnose`,
        {
          answers: answers as number[],
          ...(nextAttempt > 1 && reassessmentReason
            ? { reassessmentReason }
            : {}),
        } satisfies DiagnoseRequest,
      ),
    );
    if (result)
      update({
        phase: "result",
        answers: [],
        reassessmentReason: "",
        higherRisk: false,
        consent: false,
        cardsRead: false,
      });
  };
  const restart = () => {
    update({
      phase: "question",
      question: 0,
      answers: rule ? rule.questions.map(() => null) : [],
      reassessmentReason: "",
      higherRisk: false,
      consent: false,
      cardsRead: false,
    });
  };
  const lastCard = document.cards.length - 1;
  const toCardsEnd = () =>
    update({ phase: protectedSale ? "recording" : "cards", card: lastCard });

  let step: Step;
  if (sale?.status === "confirmed") {
    step = {
      stage: "증명서",
      label: "증명서",
      title: "가입이 확정됐어요",
      badge: <Badge tone="success">가입 확정</Badge>,
      content: (
        <>
          <p className={s.intro}>
            가입 기록이 안전하게 보관됐어요. 증명서 번호로 언제든 기록을 확인할
            수 있어요.
          </p>
          <div className={s.certificate}>
            <div className={s.certificateHead}>
              <BadgeCheck size={20} />
              가입 증명서
            </div>
            <Facts
              rows={[
                ["증명서 번호", <code>{sale.id}</code>],
                ["상품", productName(document)],
                ["설명서 버전", `v${sale.productVersion}`],
                [
                  "진단 회차",
                  `${sale.chain?.attempt ?? sale.latestAttempt}회차`,
                ],
                ["가입 금액", won(sale.amount)],
                [
                  "최종 확인",
                  dateTime(Number(sale.chain?.confirmedAt ?? 0) || undefined),
                ],
              ]}
            />
          </div>
          <div className={s.secondary}>
            <Button variant="outline" asChild>
              <Link to={verifyPath(sale.id)}>가입 기록 확인하기</Link>
            </Button>
            <Button
              variant="outline"
              blocked={isBusy}
              onClick={() => download(sale.id, "receipt")}
            >
              <Download size={16} />
              증명서 내려받기
            </Button>
            <Button variant="outline" asChild onClick={finish}>
              <Link to={channel.catalog}>다른 상품 보기</Link>
            </Button>
          </div>
          <Disclosure label="기술 정보 보기">
            <Facts
              rows={[
                [
                  "청약 기록",
                  subscribeTx ? (
                    <code>{subscribeTx.txHash}</code>
                  ) : (
                    "영수증 대기"
                  ),
                ],
                ["청약 블록", subscribeTx?.blockNumber ?? "—"],
                [
                  "최종 확인 기록",
                  confirmTx ? <code>{confirmTx.txHash}</code> : "영수증 대기",
                ],
                ["최종 확인 블록", confirmTx?.blockNumber ?? "—"],
              ]}
            />
          </Disclosure>
        </>
      ),
      action: (
        <PrimaryAction
          label="내 가입 기록 보기"
          to={recordPath(sale.id)}
          busy={isBusy}
        />
      ),
    };
  } else if (sale?.status === "withdrawn") {
    step = {
      stage: "최종 확인",
      label: "철회",
      title: "청약을 철회했어요",
      badge: <Badge tone="danger">철회</Badge>,
      content: (
        <p className={s.intro}>
          최종 확인 전에 철회해서 가입하지 않았어요. 철회 기록도 함께 보관돼요.
        </p>
      ),
      action: (
        <PrimaryAction
          label="다른 상품 보기"
          to={channel.catalog}
          onClick={finish}
        />
      ),
    };
  } else if (sale?.status === "abandoned") {
    step = {
      stage: "진단",
      label: "중단",
      title: "가입을 중단했어요",
      badge: <Badge>중단</Badge>,
      content: (
        <p className={s.intro}>
          진단 기록은 남아요. 다시 가입할 때 최근 진단 결과로 이어 가거나 다시
          진단할 수 있어요.
        </p>
      ),
      action: (
        <PrimaryAction
          label="상품 보러 가기"
          to={channel.catalog}
          onClick={finish}
        />
      ),
    };
  } else if (subscribed) {
    const ends = sale.coolingEndsAt;
    const cooling = coolingLeft > 0;
    step = {
      stage: cooling ? "숙려" : "최종 확인",
      label: cooling ? "숙려기간" : "최종 확인",
      title: cooling
        ? "가입 요청을 받았어요"
        : "마지막으로 가입 의사를 확인해요",
      badge: (
        <Badge tone={cooling ? "cooling" : "subscribed"}>
          {cooling ? "숙려 중" : "확인 대기"}
        </Badge>
      ),
      content: (
        <>
          {ends && cooling ? (
            <>
              <p className={s.intro}>
                숙려기간이 지나야 최종 확인할 수 있고, 최종 확인 전에는 언제든
                철회할 수 있어요.
              </p>
              <div className={s.countdown} role="timer" aria-live="off">
                <span>최종 확인까지</span>
                <strong>{clock(coolingLeft)}</strong>
                <small>{dateTime(ends)}부터 확인할 수 있어요</small>
              </div>
            </>
          ) : ends ? (
            <p className={s.intro}>
              숙려기간이 끝났어요. 최종 확인 전에는 언제든 철회할 수 있어요.
            </p>
          ) : (
            <p className={s.intro}>
              숙려 대상이 아니에요. 아래 내용을 확인하고 가입을 확정해 주세요.
            </p>
          )}
          <div className={s.firstCard}>
            <AlertTriangle size={18} />
            <div>
              <strong>위험을 다시 알려 드려요</strong>
              <p>
                {gradePhrase(document.riskGrade)} 상품이에요. 최대 손실:{" "}
                {document.maxLoss}
              </p>
              <p>{document.cards[0]?.text}</p>
            </div>
          </div>
          <Facts
            rows={[
              ["상품", productName(document)],
              ["가입 금액", won(sale.amount)],
              [
                "적합성",
                sale.suitable ? "적합" : "부적합 · 본인 판단으로 가입",
              ],
            ]}
          />
          <div className={s.secondary}>
            <Button
              variant="outline"
              blocked={isBusy || sale.submissionPending}
              onClick={() => setConfirm("withdraw")}
            >
              청약 철회하기
            </Button>
          </div>
        </>
      ),
      action: (
        <PrimaryAction
          label={
            cooling ? "숙려기간이 끝나면 확인할 수 있어요" : "확인하고 가입하기"
          }
          blocked={cooling || sale.submissionPending}
          busy={isBusy}
          onClick={() =>
            action(sale.id, "confirm", "최종 확인을 기록하고 있어요")
          }
        />
      ),
    };
  } else if (!rule) {
    step = {
      stage: "진단",
      label: "투자성향 진단",
      title: "아직 진단을 시작할 수 없어요",
      content: (
        <Notice tone="warning">
          아직 투자성향 진단 기준이 없어요. 판매사가 기준을 등록하면 가입할 수
          있어요.
        </Notice>
      ),
      action: <PrimaryAction label="상품 보러 가기" to={channel.catalog} />,
    };
  } else if (flow.phase === "start" && latest) {
    step = {
      stage: "진단",
      label: "투자성향 진단",
      title: "최근 투자성향 진단 결과가 있어요",
      content: (
        <>
          <Facts
            rows={[
              ["투자성향", profileName(latest.profile)],
              ["권유 가능 위험등급", limitRange(latest.limit)],
              ["누적 진단 회차", `${latest.attempt}회차`],
              ["오늘 진단 · 한국 시간", dailyCount],
              ["진단 시각", dateTime(latest.at)],
            ]}
          />
          <p className={s.small}>
            다시 진단하면 {nextAttempt}회차로 기록돼요. 이전 회차 기록도 그대로
            남아요.
          </p>
          <div className={s.secondary}>
            <Button variant="outline" blocked={isBusy} onClick={restart}>
              다시 진단하기
            </Button>
          </div>
        </>
      ),
      action: (
        <PrimaryAction
          label="이 결과로 계속하기"
          busy={isBusy}
          onClick={() => update({ phase: "result" })}
        />
      ),
    };
  } else if (flow.phase === "question" || !latest) {
    const total = rule.questions.length;
    const q = Math.min(flow.question, total - 1);
    const question = rule.questions[q];
    const answers = rule.questions.map(
      (_, index) => flow.answers[index] ?? null,
    );
    const last = q + 1 === total;
    step = {
      stage: "진단",
      part: q / total,
      label: `진단 ${q + 1}/${total}`,
      title: question.title,
      back:
        q > 0
          ? () => update({ question: q - 1 })
          : latest
            ? () => update({ phase: "start" })
            : undefined,
      content: (
        <>
          <p className={s.small}>
            {nextAttempt > 1
              ? `누적 진단 ${nextAttempt}회차 · 재진단`
              : "투자성향 진단"}{" "}
            · 답변은 판매사가 보관하고, 진단 결과는 고칠 수 없게 기록돼요.
          </p>
          {nextAttempt > 1 && q === 0 && (
            <div className={s.field}>
              <SelectField
                label="재진단 사유 (선택)"
                className={s.field}
                value={reassessmentReason}
                blocked={isBusy}
                options={[
                  { value: "", label: "선택하지 않음" },
                  { value: "correction", label: "잘못 입력한 답변 정정" },
                  { value: "changed_circumstances", label: "투자 상황 변경" },
                  { value: "reconfirmation", label: "기존 응답 재확인" },
                ]}
                aria-describedby={reassessmentHint}
                onChange={(value) =>
                  update({
                    reassessmentReason: value as ReassessmentReason | "",
                  })
                }
              />
              <span className={s.small} id={reassessmentHint}>
                사유 유형은 판매사가 별도로 보관해요. 진단 결과에는 공개하지
                않아요.
              </span>
            </div>
          )}
          <fieldset
            className={s.choices}
            disabled={isBusy}
            aria-describedby={GATE_HINT}
          >
            <legend className={s.srOnly}>{question.title}</legend>
            {question.choices.map((choice, o) => (
              <label className={s.choice} key={o}>
                <input
                  ref={o === 0 ? gateRef : undefined}
                  type="radio"
                  name={`question-${q}`}
                  checked={answers[q] === o}
                  onChange={() => {
                    setGateHint(false);
                    update({
                      answers: answers.map((value, index) =>
                        index === q ? o : value,
                      ),
                    });
                  }}
                />
                {choice.text}
              </label>
            ))}
          </fieldset>
          <FieldError id={GATE_HINT}>
            {gateHint && answers[q] === null
              ? "답을 하나 고르면 계속할 수 있어요."
              : ""}
          </FieldError>
        </>
      ),
      action: last ? (
        <PrimaryAction
          label="진단 결과 보기"
          busy={isBusy}
          blocked={answers.some((answer) => answer === null)}
          onClick={() => void diagnose(answers)}
          explain={() => {
            // 빠진 답이 이 문항이 아니면 그 문항으로 돌아간다.
            const missing = answers.findIndex((answer) => answer === null);
            if (missing !== q) update({ question: missing });
            else explainGate();
          }}
          describedBy={GATE_HINT}
        />
      ) : (
        <PrimaryAction
          label="다음"
          blocked={answers[q] === null}
          onClick={() => update({ question: q + 1, answers })}
          explain={explainGate}
          describedBy={GATE_HINT}
        />
      ),
    };
  } else if (flow.phase === "result") {
    step = {
      stage: "결과",
      label: "진단 결과",
      title: `투자성향은 ${profileName(latest.profile)}이에요`,
      content: (
        <>
          <Facts
            rows={[
              ["권유 가능 위험등급", limitRange(latest.limit)],
              ["이 상품의 위험등급", gradeName(document.riskGrade)],
              [
                "누적 진단 회차",
                `${latest.attempt}회차${latest.attempt > 1 ? " · 재진단" : ""}`,
              ],
              ["오늘 진단 · 한국 시간", dailyCount],
              ...(latest.elderly
                ? ([["고령 투자자", "보호 절차를 함께 적용해요"]] as [
                    string,
                    ReactNode,
                  ][])
                : []),
              ["진단 시각", dateTime(latest.at)],
            ]}
          />
          {latest.attempt >= 3 && (
            <Notice>
              FINVERIC의 내부 확인 기준에 따라 누적 3회차부터 판매사 관리자가
              진단 이력을 검토해요. 청약 단계에서 승인을 기다려요.
            </Notice>
          )}
          <div className={s.secondary}>
            <Button variant="outline" blocked={isBusy} onClick={restart}>
              다시 진단하기
            </Button>
          </div>
        </>
      ),
      action: (
        <PrimaryAction
          label="다음"
          busy={isBusy}
          onClick={() => update({ phase: "suitability" })}
        />
      ),
    };
  } else if (flow.phase === "suitability") {
    step = suitable
      ? {
          stage: "적합성",
          label: "적합성 확인",
          title: "이 상품은 투자성향에 맞아요",
          badge: <Badge tone="success">적합</Badge>,
          back: () => update({ phase: "result" }),
          content: (
            <Facts
              rows={[
                ["투자성향", profileName(latest.profile)],
                ["권유 가능 위험등급", limitRange(latest.limit)],
                ["이 상품", gradeName(document.riskGrade)],
                ["판매대상 고객군", document.targetMarket],
              ]}
            />
          ),
          action: (
            <PrimaryAction
              label="핵심 설명 보기"
              onClick={() => update({ phase: "cards", card: 0 })}
            />
          ),
        }
      : {
          stage: "적합성",
          label: "적합성 확인",
          title: "이 상품은 권유하지 않아요",
          badge: <Badge tone="warning">부적합</Badge>,
          back: () => update({ phase: "result" }),
          content: (
            <>
              <Notice tone="warning">
                {`${profileName(latest.profile)} 고객님께는 ${limitPhrase(latest.limit)} 상품만 권유해요. 이 상품은 ${gradePhrase(document.riskGrade)}이라 투자성향에 맞지 않아요.`}
              </Notice>
              <Facts
                rows={[
                  ["판매대상 고객군", document.targetMarket],
                  ["최대 손실", document.maxLoss],
                ]}
              />
              <label className={s.choice}>
                <input
                  ref={gateRef}
                  type="checkbox"
                  checked={flow.higherRisk}
                  aria-describedby={GATE_HINT}
                  onChange={(e) => {
                    setGateHint(false);
                    update({ higherRisk: e.target.checked });
                  }}
                />
                투자성향에 맞지 않는다는 안내를 받았어요. 권유 없이 제 판단으로
                가입을 이어 갈게요.
              </label>
              <FieldError id={GATE_HINT}>
                {gateHint && !flow.higherRisk ? CHECK_HINT : ""}
              </FieldError>
            </>
          ),
          action: (
            <PrimaryAction
              label="추가 위험을 확인하고 계속하기"
              blocked={!flow.higherRisk}
              onClick={() => update({ phase: "cards", card: 0 })}
              explain={explainGate}
              describedBy={GATE_HINT}
            />
          ),
        };
  } else if (flow.phase === "cards") {
    const index = Math.min(flow.card, lastCard);
    const card = document.cards[index];
    const last = index === lastCard;
    step = {
      stage: "설명",
      part: index / document.cards.length,
      label: `핵심 설명 ${index + 1}/${document.cards.length}`,
      title: card.title,
      back: () =>
        index === 0
          ? leaveCards({ phase: "suitability" })
          : update({ card: index - 1 }),
      content: (
        <>
          <div className={index === 0 ? s.firstCard : s.explainCard}>
            {index === 0 && <AlertTriangle size={18} />}
            <p>{card.text}</p>
          </div>
          {last && (
            <>
              <label className={s.choice}>
                <input
                  ref={gateRef}
                  type="checkbox"
                  checked={flow.cardsRead}
                  aria-describedby={GATE_HINT}
                  onChange={(e) => {
                    setGateHint(false);
                    update({ cardsRead: e.target.checked });
                  }}
                />
                핵심 설명 {document.cards.length}장을 모두 읽고 이해했어요.
              </label>
              <FieldError id={GATE_HINT}>
                {gateHint && !flow.cardsRead ? CHECK_HINT : ""}
              </FieldError>
            </>
          )}
        </>
      ),
      action: last ? (
        <PrimaryAction
          label="설명을 확인했어요"
          blocked={!flow.cardsRead}
          onClick={() =>
            leaveCards({ phase: protectedSale ? "recording" : "subscribe" })
          }
          explain={explainGate}
          describedBy={GATE_HINT}
        />
      ) : (
        <PrimaryAction
          label="다음 설명"
          onClick={() => update({ card: index + 1 })}
        />
      ),
    };
  } else if (flow.phase === "recording") {
    step = {
      stage: "녹취",
      label: "녹취 동의",
      title: "가입 과정을 녹취해요",
      badge: <Badge tone="info">녹취 대상</Badge>,
      back: () => update({ phase: "cards", card: lastCard }),
      content: (
        <>
          <p className={s.intro}>
            {document.complex
              ? "고난도 금융투자상품이라 녹취해요."
              : "고령 고객이나 투자성향에 맞지 않는 고객이 파생결합증권에 가입하면 녹취해요."}{" "}
            녹취에 동의하지 않으면 가입할 수 없어요. 녹취 파일은 판매사가
            보관하고, 가입 기록에는 파일의 지문만 남아요.
          </p>
          <label className={s.choice}>
            <input
              ref={gateRef}
              type="checkbox"
              checked={flow.consent}
              aria-describedby={GATE_HINT}
              onChange={(e) => {
                setGateHint(false);
                update({ consent: e.target.checked });
              }}
            />
            녹취에 동의해요.
          </label>
          <FieldError id={GATE_HINT}>
            {gateHint && !flow.consent ? CHECK_HINT : ""}
          </FieldError>
        </>
      ),
      action: (
        <PrimaryAction
          label="다음"
          blocked={!flow.consent}
          onClick={() => update({ phase: "subscribe" })}
          explain={explainGate}
          describedBy={GATE_HINT}
        />
      ),
    };
  } else {
    const approvalRequired = sale?.approvalRequired ?? latest.attempt >= 3;
    const approved = !!sale && sale.approvedAttempt === sale.latestAttempt;
    const requested =
      sale?.approvalRequested || sale?.approvedAttempt !== undefined;
    const requestApproval =
      approvalRequired && !requested && !sale?.submissionPending;
    const awaitingApproval = approvalRequired && !requestApproval && !approved;
    const submit = () =>
      run(
        requestApproval
          ? "관리자 승인을 요청하고 있어요"
          : "청약을 기록하고 있어요",
        async () => {
          const application =
            sale && !requestApproval
              ? sale
              : await openSale(
                  product,
                  requestApproval ? "requestApproval" : "subscribe",
                );
          if (application.id !== sale?.id) saveFlow(application.id, flow);
          if (
            requestApproval ||
            (application.approvalRequired &&
              application.approvedAttempt !== application.latestAttempt)
          )
            return;
          await request<SaleDto>(`/sales/${application.id}/action/subscribe`, {
            explanationSeconds,
            higherRiskConfirmed: !suitable && flow.higherRisk,
            recordingConsent: protectedSale && flow.consent,
          } satisfies SubscribeRequest);
        },
      );
    step = {
      stage: "청약",
      label: "청약",
      title: "청약 내용을 확인해 주세요",
      back: isBusy ? undefined : toCardsEnd,
      content: (
        <>
          {approvalRequired && (
            <div aria-live="polite">
              {requestApproval ? (
                <Notice>
                  {latest.attempt}회차 진단을 받았어요. 청약하려면 판매사에
                  관리자 승인을 요청해 주세요.
                </Notice>
              ) : approved ? (
                <div className={`${s.approval} ${s.approvalDone}`}>
                  <CircleCheck size={22} />
                  <div>
                    <strong>관리자 승인을 받았어요</strong>
                    <p>이제 청약할 수 있어요.</p>
                  </div>
                </div>
              ) : (
                <div className={s.approval}>
                  <LoaderCircle size={22} className={s.spin} />
                  <div>
                    <strong>판매사 관리자가 진단 이력을 확인하고 있어요</strong>
                    <p>
                      {latest.attempt}번째 진단이라 판매사 관리자 승인 뒤에
                      청약할 수 있어요. 승인되면 이 화면이 바로 바뀌어요. 다른
                      탭에 다녀와도 괜찮아요.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
          <Facts
            rows={[
              ["상품", productName(document)],
              ["설명서", `v${product.version}`],
              ["가입 금액", won(amount)],
              [
                "투자성향",
                `${profileName(latest.profile)} · ${latest.attempt}회차`,
              ],
              ["적합성", suitable ? "적합" : "부적합 · 본인 판단으로 가입"],
              ["핵심 설명 확인", `${explanationSeconds}초`],
              ["녹취", protectedSale ? "동의" : "대상 아님"],
              [
                "숙려기간",
                protectedSale
                  ? `청약 뒤 ${deployment?.coolingPeriod ?? "—"}초`
                  : "대상 아님",
              ],
            ]}
          />
        </>
      ),
      action: (
        <PrimaryAction
          label={
            requestApproval
              ? "관리자 승인 요청하기"
              : awaitingApproval
                ? "승인을 기다리고 있어요"
                : "청약하기"
          }
          busy={isBusy}
          blocked={awaitingApproval || sale?.submissionPending}
          onClick={() => void submit()}
        />
      ),
    };
  }

  return (
    <div>
      <Heading title="가입" />
      <StepHeader
        label={step.label}
        progress={progressOf(step.stage, step.part)}
        caption={`${productName(document)} · ${won(amount)}`}
        back={isBusy ? undefined : step.back}
        stop={preSubscribe && !isBusy ? () => setConfirm("stop") : undefined}
      />
      <div className={s.stepHead}>
        {step.badge}
        <h2 ref={titleRef} tabIndex={-1} className={s.stepTitle}>
          {step.title}
        </h2>
      </div>
      {sale?.submissionPending && (
        <Notice>
          기록을 확인하고 있어요.{" "}
          <button className={s.linkButton} onClick={() => void refresh()}>
            다시 확인하기
          </button>
        </Notice>
      )}
      {step.content}
      <Disclosure
        className={s.flowFoot}
        label={<>내 진단 기록 {diagnoses.length}회</>}
      >
        <ol className={s.attempts}>
          {diagnoses.map((diagnosis) => (
            <li key={diagnosis.attempt}>
              <span>{diagnosis.attempt}회차</span>
              <span>{profileName(diagnosis.profile)}</span>
              <small>{dateTime(diagnosis.at)}</small>
            </li>
          ))}
        </ol>
        {sale && (
          <p className={s.small}>
            가입 신청 번호 <code>{sale.id}</code>
          </p>
        )}
      </Disclosure>
      <ActionBar busy={busy}>{step.action}</ActionBar>
      <ConfirmDialog
        open={confirm === "stop"}
        title="가입을 중단할까요?"
        text={
          latest
            ? "여기까지 입력한 내용은 사라져요. 완료한 진단 결과는 다음 가입 때 다시 쓸 수 있어요."
            : "여기까지 입력한 내용은 사라져요."
        }
        confirmLabel="중단하기"
        cancelLabel="계속 가입하기"
        size="large"
        onCancel={() => setConfirm(undefined)}
        onConfirm={() => {
          setConfirm(undefined);
          void abandon();
        }}
      />
      <ConfirmDialog
        open={confirm === "withdraw"}
        title="청약을 철회할까요?"
        text="철회하면 이 상품에 가입하지 않아요. 철회 기록도 함께 보관돼요."
        confirmLabel="철회하기"
        cancelLabel="돌아가기"
        size="large"
        onCancel={() => setConfirm(undefined)}
        onConfirm={() => {
          setConfirm(undefined);
          if (sale) void action(sale.id, "withdraw", "청약을 철회하고 있어요");
        }}
      />
    </div>
  );
}
