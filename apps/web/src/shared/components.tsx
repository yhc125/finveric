import {
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, type To } from "react-router";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileText,
} from "lucide-react";
import { Button } from "./button.tsx";
import { HeadingTools } from "./heading-tools.ts";
import s from "./ui.module.css";

/**
 * 상태 색. 색은 상태를 뜻할 때만 쓴다. 종류(추가·삭제, 필수 등)는 neutral로 쓴다.
 * info는 신청 상태, 처리 기록의 대기(영수증 대기), 안내다.
 */
/** 배지·알림 색. `subscribed`와 `cooling`은 판매 상태(확인 대기, 숙려 중) 전용이다. */
export type Tone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "subscribed"
  | "cooling";
const TONE_CLASSES: Record<Tone, string> = {
  neutral: "",
  info: s.info,
  success: s.success,
  warning: s.warning,
  danger: s.danger,
  subscribed: s.subscribed,
  cooling: s.cooling,
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return <span className={`${s.badge} ${TONE_CLASSES[tone]}`}>{children}</span>;
}
export function Notice({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className={`${s.notice} ${TONE_CLASSES[tone]}`}>
      <AlertTriangle size={17} />
      <div>{children}</div>
    </div>
  );
}
export function Disclosure({
  label,
  className,
  children,
}: {
  label: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <details
      className={className ? `${s.disclosure} ${className}` : s.disclosure}
    >
      <summary>
        <span>{label}</span>
        <ChevronDown size={18} aria-hidden="true" />
      </summary>
      <div className={s.disclosureContent}>{children}</div>
    </details>
  );
}
export function Heading({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  const tools = useContext(HeadingTools);
  return (
    <header className={s.heading}>
      <div className={s.headingText}>
        {/* 경로가 바뀌거나 누른 요소가 사라지면 초점을 받는다(focus.ts). */}
        <h1 tabIndex={-1}>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {(tools || children) && (
        <div className={s.headingActions}>
          {tools}
          {children}
        </div>
      )}
    </header>
  );
}

export function Skeleton({
  width = "100%",
  height = "0.75rem",
}: {
  width?: string;
  height?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={s.skeleton}
      style={{ inlineSize: width, blockSize: height }}
    />
  );
}

/** 빈 목록·없는 화면 안내. */
export function Empty({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className={s.empty}>
      <FileText size={30} aria-hidden="true" />
      <h2 tabIndex={-1}>{title}</h2>
      <p>{text}</p>
      {children}
    </div>
  );
}
/**
 * 요약 수치 카드. `.stats` 묶음 안에 둔다. 단위(`unit`)는 숫자 바로 뒤에 작게 붙인다. 숫자가 아니면(읽기 실패의 "—") 단위를 붙이지 않는다.
 * `note`는 단위가 아닌 맥락(내역, 기준)만 적는다. `to`가 있으면 카드 전체가 링크이고 오른쪽 위에 이동 표시가 붙는다.
 */
export function Stat({
  label,
  value,
  unit,
  note,
  to,
}: {
  label: string;
  value: number | string;
  unit?: string;
  note?: ReactNode;
  to?: string;
}) {
  const numeric = typeof value === "number";
  const body = (
    <>
      <span className={s.statLabel}>{label}</span>
      <strong className={s.statValue}>
        {numeric ? value.toLocaleString("ko-KR") : value}
        {numeric && unit && <span className={s.statUnit}>{unit}</span>}
      </strong>
      {note && <small className={s.statNote}>{note}</small>}
      {to && <ChevronRight className={s.statGo} size={16} aria-hidden />}
    </>
  );
  return to ? (
    <Link className={s.stat} to={to}>
      {body}
    </Link>
  ) : (
    <div className={s.stat}>{body}</div>
  );
}
/**
 * 표의 건수 칸. 오른쪽 정렬, 등폭 숫자다. 단위는 붙이지 않는다. 무엇을 센 값인지는 열 제목이 알린다.
 * 열 제목(th)에도 `numeric` 클래스를 단다. 0은 옅게 두어 값이 있는 칸이 먼저 보인다.
 * `warn`은 0이 아닐 때 주의 색과 굵기로 강조한다(예: 부적합 확정, 위험 신호). 숫자 칸에는 배지를 쓰지 않는다.
 */
export function Count({ value, warn }: { value: number; warn?: boolean }) {
  const tone = value === 0 ? s.zero : warn ? s.warnCount : "";
  return (
    <td className={tone ? `${s.numeric} ${tone}` : s.numeric}>
      {value.toLocaleString("ko-KR")}
    </td>
  );
}
/**
 * 필터 칩(`.chips` 묶음 안). 이름 뒤에 건수를 옅은 등폭 숫자로 따로 붙인다. 0건인 칩은 이름도 옅게 둔다.
 * 고른 칩은 `aria-pressed`와 진한 바탕(`chipActive`)이다. 칩 묶음마다 같은 모양을 쓴다.
 */
export function FilterChip({
  label,
  count,
  pressed,
  onClick,
  tone,
}: {
  label: string;
  count: number;
  pressed: boolean;
  onClick: () => void;
  /** 상태 필터면 그 상태 배지와 같은 색 점을 이름 앞에 둔다. */
  tone?: Tone;
}) {
  const classes = [count === 0 && s.chipEmpty, pressed && s.chipActive]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={classes || undefined}
      onClick={onClick}
    >
      {tone && (
        <span
          className={`${s.chipDot} ${TONE_CLASSES[tone] ?? ""}`}
          aria-hidden
        />
      )}
      {label}{" "}
      <span className={s.chipCount}>{count.toLocaleString("ko-KR")}</span>
    </button>
  );
}
export function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className={s.facts}>
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 상세 링크 한 개가 행 전체를 차지한다. 보조 링크는 그 위에 둔다. */
export function DetailRow({
  destination,
  current = false,
  children,
}: {
  destination?: { to: To; label: string };
  current?: boolean;
  children: ReactNode;
}) {
  const className = [destination && s.detailRow, current && s.selectedRow]
    .filter(Boolean)
    .join(" ");
  return (
    <tr className={className || undefined}>
      {children}
      <td className={s.detailRowAction}>
        {destination && (
          <Link
            className={s.detailRowLink}
            to={destination.to}
            aria-label={destination.label}
            aria-current={current || undefined}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        )}
      </td>
    </tr>
  );
}

export function DetailColumn({ label }: { label: string }) {
  return (
    <th scope="col" className={s.detailRowAction}>
      <span className={s.srOnly}>{label}</span>
    </th>
  );
}
export function TransactionFacts({
  hash,
  block,
}: {
  hash: string;
  block?: string;
}) {
  return (
    <Facts
      rows={[
        ["블록 번호", block ?? "영수증 대기"],
        ["거래 해시", <code>{hash}</code>],
      ]}
    />
  );
}
/**
 * 접근 코드 입력. 비우고 누르면 `emptyMessage`를, 서버가 거절하면 `error`를 입력 칸 아래에 보여 주고
 * 입력 칸으로 초점을 옮긴다. 고객 화면은 해요체 `emptyMessage`를 넘긴다.
 * 화면은 저장한 코드가 없거나 서버가 코드를 거절했을 때만 이 폼을 보여 주고, 연결하면 숨긴다.
 * 코드를 넣기 전에는 오류 문장 없이 폼만 보여 준다.
 */
export function AccessCodeForm({
  connect,
  busy,
  error,
  emptyMessage = "접근 코드를 입력하세요.",
}: {
  connect: () => void;
  busy: boolean;
  error?: string;
  emptyMessage?: string;
}) {
  const [accessCode, setAccessCode] = useState("");
  const [empty, setEmpty] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const errorId = useId();
  const message = empty ? emptyMessage : (error ?? "");
  useEffect(() => {
    if (error) input.current?.focus();
  }, [error]);
  return (
    <form
      className={s.access}
      onSubmit={(e) => {
        e.preventDefault();
        if (!accessCode.trim()) {
          setEmpty(true);
          input.current?.focus();
          return;
        }
        sessionStorage.setItem("finveric-token", accessCode);
        connect();
      }}
    >
      <label htmlFor={inputId}>접근 코드</label>
      <input
        id={inputId}
        ref={input}
        type="password"
        value={accessCode}
        onChange={(e) => {
          setAccessCode(e.target.value);
          setEmpty(false);
        }}
        autoComplete="off"
        aria-invalid={message ? true : undefined}
        aria-describedby={errorId}
      />
      <Button busy={busy}>연결하기</Button>
      <FieldError id={errorId}>{message}</FieldError>
    </form>
  );
}

/**
 * 입력 칸의 오류 문장. 늘 그려 두어 문장이 생기면 화면 낭독기가 바로 읽는다(`role="alert"`).
 * 입력 칸에는 `aria-describedby`로 이 id를 잇고, 오류가 있으면 `aria-invalid`를 단다.
 */
export function FieldError({
  id,
  children,
}: {
  id: string;
  children?: ReactNode;
}) {
  return (
    <p id={id} role="alert" className={s.fieldError}>
      {children}
    </p>
  );
}

/**
 * 가로로 스크롤하는 표의 틀(`.tableWrap`). 가려진 내용이 있는 가장자리에 그림자를 그린다.
 * 표가 넘칠 때만 이름(`label`)이 있는 영역이 되고 Tab 초점을 받는다. 초점을 옮긴 뒤 화살표로 스크롤한다.
 * `label`은 표 제목(caption)과 같은 글로 쓴다. 패널 자체가 스크롤하면 `as="section"`과 `className`에 패널을 준다.
 */
export function TableScroll({
  label,
  as: Tag = "div",
  className,
  children,
}: {
  label: string;
  as?: "div" | "section";
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  // 표 내용(열 켜기, 자료 읽기)이 바뀌면 다시 잰다. 같은 값이면 다시 그리지 않는다.
  useEffect(() => {
    const element = ref.current;
    if (element) setOverflows(element.scrollWidth > element.clientWidth + 1);
  });
  // 화면 너비가 바뀌면 다시 잰다.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setOverflows(element.scrollWidth > element.clientWidth + 1),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <Tag
      ref={ref}
      className={className ? `${s.tableWrap} ${className}` : s.tableWrap}
      {...(overflows
        ? { tabIndex: 0, role: "region", "aria-label": label }
        : {})}
    >
      {children}
    </Tag>
  );
}

/**
 * 되돌릴 수 없는 동작이나 작업을 버리는 동작 전에 묻는 가운데 창.
 * 안전한 선택(`cancelLabel`)이 주요 버튼이고 처음 초점을 받는다. Esc는 안전한 선택과 같다.
 * 버튼을 누르면 창을 바로 닫고 나서 처리를 부른다. 초점이 창을 연 버튼으로 먼저 돌아간다.
 * 증권사 앱 예시는 `size="large"` 버튼을 쓴다.
 */
export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  size,
}: {
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  size?: "default" | "large";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const safe = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const textId = useId();
  /** 창을 닫은 뒤 처리를 부른다. 처리가 창을 연 버튼을 없애도(처리 중 숨김) 초점이 창 안에 남지 않는다. */
  const closeThen = (next: () => void) => () => {
    ref.current?.close();
    next();
  };
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      // 처음 초점은 안전한 선택에 둔다. showModal 전에 autofocus를 달아 초점이 위험한 버튼을 거치지 않게 한다.
      safe.current?.setAttribute("autofocus", "");
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={s.dialog}
      aria-labelledby={titleId}
      aria-describedby={textId}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      <p id={textId}>{text}</p>
      <div className={s.dialogActions}>
        <Button variant="outline" size={size} onClick={closeThen(onConfirm)}>
          {confirmLabel}
        </Button>
        <Button ref={safe} size={size} onClick={closeThen(onCancel)}>
          {cancelLabel}
        </Button>
      </div>
    </dialog>
  );
}
