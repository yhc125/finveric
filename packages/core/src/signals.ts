// 위험 신호. 판매사 화면과 감독기관 화면이 같은 원장 이벤트로 같은 신호를 계산한다.
import type { Hex } from "viem";

/** 한 고객의 전체 회차로 계산한다. 한국 날짜의 횟수는 누적 승인 조건을 초기화하지 않는다. */
export function diagnosisCounts(
  diagnoses: readonly { attempt: number; at: number }[],
  now: number,
) {
  const koreanDay = (seconds: number) =>
    Math.floor((seconds + 9 * 3600) / 86400);
  const today = diagnoses.filter((d) => koreanDay(d.at) === koreanDay(now));
  return {
    cumulativeAttempt: diagnoses.reduce(
      (max, d) => Math.max(max, d.attempt),
      0,
    ),
    dailyDiagnoses: today.length,
    dailyReassessments: today.filter((d) => d.attempt > 1).length,
  };
}

export type SignalKind =
  "repeat" | "rise" | "unsuitable" | "shortExplanation" | "shortInterval";
export type Signal = {
  kind: SignalKind;
  customerRef: Hex;
  saleId?: string;
  attempt?: number;
  detail: string;
};

/** 신호 기준값. 시연용 가정이다(PRD 위험 신호). */
export const SIGNAL_THRESHOLDS = {
  repeatAttempts: 3,
  shortExplanationSeconds: 60,
  shortIntervalSeconds: 600,
} as const;
export const SIGNAL_LABELS: Readonly<Record<SignalKind, string>> = {
  repeat: "재진단 반복",
  rise: "결과 상승 뒤 청약",
  unsuitable: "부적합 가입",
  shortExplanation: "짧은 설명 확인",
  shortInterval: "짧은 간격 재진단",
};
export const SIGNAL_KINDS = Object.keys(SIGNAL_LABELS) as SignalKind[];

/** 신호 계산에 필요한 진단 기록. `at`은 블록 시각(초)이다. */
export type SignalDiagnosis = {
  customerRef: Hex;
  attempt: number;
  profile: number;
  at: number;
};
export type SignalSale = {
  saleId: string;
  customerRef: Hex;
  attempt: number;
  suitable: boolean;
  status: "subscribed" | "confirmed" | "withdrawn";
  explanationSeconds: number;
};

export function computeSignals({
  diagnoses,
  sales,
}: {
  diagnoses: readonly SignalDiagnosis[];
  sales: readonly SignalSale[];
}): Signal[] {
  const signals: Signal[] = [];
  const byCustomer = new Map<string, SignalDiagnosis[]>();
  for (const diagnosis of diagnoses) {
    const key = diagnosis.customerRef.toLowerCase();
    byCustomer.set(key, [...(byCustomer.get(key) ?? []), diagnosis]);
  }
  for (const list of byCustomer.values()) {
    list.sort((a, b) => a.attempt - b.attempt);
    const last = list.at(-1)!;
    if (list.length >= SIGNAL_THRESHOLDS.repeatAttempts)
      signals.push({
        kind: "repeat",
        customerRef: last.customerRef,
        attempt: last.attempt,
        detail: `진단 ${list.length}회`,
      });
    for (const [index, diagnosis] of list.entries()) {
      const previous = list[index - 1];
      if (!previous || previous.attempt !== diagnosis.attempt - 1) continue;
      const gap = diagnosis.at - previous.at;
      if (gap < SIGNAL_THRESHOLDS.shortIntervalSeconds)
        signals.push({
          kind: "shortInterval",
          customerRef: diagnosis.customerRef,
          attempt: diagnosis.attempt,
          detail: `${previous.attempt}회차 뒤 ${Math.max(0, Math.round(gap))}초 만에 ${diagnosis.attempt}회차 진단`,
        });
    }
  }
  for (const sale of sales) {
    const list = byCustomer.get(sale.customerRef.toLowerCase()) ?? [];
    const used = list.find((d) => d.attempt === sale.attempt);
    const previous = list.find((d) => d.attempt === sale.attempt - 1);
    const base = {
      customerRef: sale.customerRef,
      saleId: sale.saleId,
      attempt: sale.attempt,
    };
    if (used && previous && used.profile > previous.profile)
      signals.push({
        kind: "rise",
        ...base,
        detail: `투자성향 ${previous.profile}단계 → ${used.profile}단계 회차로 청약`,
      });
    if (sale.status === "confirmed" && !sale.suitable)
      signals.push({
        kind: "unsuitable",
        ...base,
        detail: "부적합 상태로 청약하고 확정",
      });
    if (sale.explanationSeconds < SIGNAL_THRESHOLDS.shortExplanationSeconds)
      signals.push({
        kind: "shortExplanation",
        ...base,
        detail: `설명 확인 ${sale.explanationSeconds}초`,
      });
  }
  return signals;
}
