import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  CATEGORIES,
  DEMO_PRODUCTS,
  DEMO_RULE,
  FIELD,
  canonical,
  computeSignals,
  diagnosisCounts,
  customerRefFor,
  evaluateRule,
  isProtectedSale,
  ledgerAbi,
  productDocumentHash,
  ruleFields,
  ruleHash,
  validateProduct,
  validateRule,
  type RuleDocument,
} from "@finveric/core";

const clone = (doc: RuleDocument): RuleDocument => structuredClone(doc);

test("한국 날짜의 진단·재진단 횟수는 누적 회차와 구분한다", () => {
  const midnight = Date.parse("2026-11-24T00:00:00+09:00") / 1000;
  const diagnoses = [
    { attempt: 1, at: midnight - 2 },
    { attempt: 2, at: midnight - 1 },
    { attempt: 3, at: midnight },
  ];
  assert.deepEqual(diagnosisCounts(diagnoses, midnight), {
    cumulativeAttempt: 3,
    dailyDiagnoses: 1,
    dailyReassessments: 1,
  });
  assert.deepEqual(diagnosisCounts(diagnoses, midnight + 86400), {
    cumulativeAttempt: 3,
    dailyDiagnoses: 0,
    dailyReassessments: 0,
  });
  assert.deepEqual(diagnosisCounts([{ attempt: 1, at: midnight }], midnight), {
    cumulativeAttempt: 1,
    dailyDiagnoses: 1,
    dailyReassessments: 0,
  });
  assert.deepEqual(diagnosisCounts([], midnight), {
    cumulativeAttempt: 0,
    dailyDiagnoses: 0,
    dailyReassessments: 0,
  });
});
type AbiParam = {
  type: string;
  indexed?: boolean;
  components?: readonly AbiParam[];
};
type AbiEntry = {
  type: string;
  name?: string;
  inputs?: readonly AbiParam[];
  outputs?: readonly AbiParam[];
  stateMutability?: string;
};
const type = (param: AbiParam): string =>
  param.type.startsWith("tuple")
    ? `(${param.components!.map(type).join(",")})${param.type.slice(5)}`
    : param.type;

test("시연 기준 v1은 검사를 통과하고 6개 범주를 모두 담는다", () => {
  assert.deepEqual(validateRule(DEMO_RULE), []);
  assert.deepEqual(
    [...new Set(DEMO_RULE.questions.map((q) => q.category))].sort(),
    [...CATEGORIES].sort(),
  );
});

test("validateRule은 범주 누락, 범위 밖 값, 순서 위반을 찾는다", () => {
  const missing = clone(DEMO_RULE);
  missing.questions = missing.questions.filter((q) => q.category !== "연령");
  assert.match(validateRule(missing).join(), /"연령" 범주/);

  const score = clone(DEMO_RULE);
  score.questions[0].choices[0].score = 16;
  assert.match(validateRule(score).join(), /점수는 0~15/);

  const cap = clone(DEMO_RULE);
  cap.questions[1].choices[0].cap = 7;
  assert.match(validateRule(cap).join(), /추출 조건/);

  const choices = clone(DEMO_RULE);
  choices.questions[2].choices = Array.from({ length: 6 }, (_, i) => ({
    text: `선택지 ${i}`,
    score: 0,
  }));
  assert.match(validateRule(choices).join(), /선택지는 1~5개/);

  const thresholds = clone(DEMO_RULE);
  thresholds.thresholds = [5, 3, 7, 10];
  assert.match(validateRule(thresholds).join(), /등급 구간 점수/);

  const matrix = clone(DEMO_RULE);
  matrix.matrix = [6, 5, 3, 4, 1];
  assert.match(validateRule(matrix).join(), /적합성 기준/);

  const many = clone(DEMO_RULE);
  many.questions = [...many.questions, ...many.questions];
  assert.match(validateRule(many).join(), /문항은 1~10개/);
});

test("기준 해시는 원문에 고정되고 키 순서와 무관하며 문구가 바뀌면 달라진다", () => {
  // 시연 기준 v1의 해시. 바뀌면 회로·core·원장 등록값이 어긋난 것이다.
  assert.equal(
    ruleHash(DEMO_RULE),
    "0x0c9959eab774718b25f3064af686b9aee7379d6934f6f147918f9b589fd55f28",
  );
  const reordered = JSON.parse(
    JSON.stringify(DEMO_RULE, Object.keys(DEMO_RULE).reverse()),
  ) as RuleDocument;
  reordered.questions = DEMO_RULE.questions;
  assert.equal(ruleHash(reordered), ruleHash(DEMO_RULE));
  const wording = clone(DEMO_RULE);
  wording.questions[0].title += " ";
  assert.notEqual(ruleHash(wording), ruleHash(DEMO_RULE));
  const threshold = clone(DEMO_RULE);
  threshold.thresholds[3] = 11;
  assert.notEqual(ruleHash(threshold), ruleHash(DEMO_RULE));
  assert.ok(BigInt(ruleHash(DEMO_RULE)) < FIELD);
});

test("ruleFields는 회로의 11묶음 176칸 순서를 따른다", () => {
  const fields = ruleFields(DEMO_RULE);
  assert.equal(fields.length, 176);
  // 1번 문항(연령): 선택지 3개, 65세 이상 (0점, 제한 없음, 고령).
  assert.deepEqual(fields.slice(0, 7), [3n, 0n, 1n, 1n, 1n, 1n, 0n]);
  // 쓰지 않는 7번 문항: 선택지 1개, (0,1,0), 나머지 0.
  assert.deepEqual(fields.slice(96, 112), [
    1n,
    0n,
    1n,
    0n,
    ...Array<bigint>(12).fill(0n),
  ]);
  assert.deepEqual(fields.slice(160, 169), [
    3n,
    5n,
    7n,
    10n,
    6n,
    5n,
    3n,
    2n,
    1n,
  ]);
  assert.deepEqual(fields.slice(170), Array<bigint>(6).fill(0n));
});

test("evaluateRule은 점수 구간, 추출 조건, 고령 표시를 함께 계산한다", () => {
  assert.deepEqual(evaluateRule(DEMO_RULE, [2, 1, 1, 0, 1, 1]), {
    score: 6,
    profile: 3,
    limit: 3,
    elderly: false,
  });
  assert.deepEqual(evaluateRule(DEMO_RULE, [2, 1, 1, 1, 1, 1]), {
    score: 7,
    profile: 4,
    limit: 2,
    elderly: false,
  });
  // 공격투자형이어도 "원금 20%까지"는 2등급까지만 권유한다.
  assert.deepEqual(evaluateRule(DEMO_RULE, [2, 2, 2, 2, 2, 1]), {
    score: 11,
    profile: 5,
    limit: 2,
    elderly: false,
  });
  assert.deepEqual(evaluateRule(DEMO_RULE, [0, 0, 0, 0, 0, 0]), {
    score: 0,
    profile: 1,
    limit: 6,
    elderly: true,
  });
  assert.equal(evaluateRule(DEMO_RULE, [2, 0, 2, 2, 2, 2]).limit, 5);
  assert.throws(() => evaluateRule(DEMO_RULE, [3, 0, 0, 0, 0, 0]));
  assert.throws(() => evaluateRule(DEMO_RULE, [0, 0, 0]));
});

test("시연 상품과 녹취·숙려 대상 계산", () => {
  for (const product of DEMO_PRODUCTS) {
    assert.deepEqual(validateProduct(product.document), []);
    assert.equal(product.documentHash, productDocumentHash(product.document));
    assert.equal(canonical(product.document).includes("undefined"), false);
  }
  const [els, fund, elb] = DEMO_PRODUCTS.map((p) => p.document);
  assert.equal(isProtectedSale(els, { elderly: false }, true), true);
  assert.equal(isProtectedSale(fund, { elderly: true }, false), false);
  assert.equal(isProtectedSale(elb, { elderly: false }, true), false);
  const dls = { complex: false, derivative: true };
  assert.equal(isProtectedSale(dls, { elderly: false }, true), false);
  assert.equal(isProtectedSale(dls, { elderly: true }, true), true);
  assert.equal(isProtectedSale(dls, { elderly: false }, false), true);
});

test("상품 버전은 API와 원장의 uint32 범위 안이어야 한다", () => {
  const document = DEMO_PRODUCTS[0].document;
  for (const version of [1, 2 ** 32 - 1]) {
    assert.deepEqual(validateProduct({ ...document, version }), []);
  }
  for (const version of [0, -1, 1.5, 2 ** 32, Number.MAX_SAFE_INTEGER]) {
    assert.ok(
      validateProduct({ ...document, version }).some((error) =>
        error.startsWith("버전은"),
      ),
      `상품 버전 ${version}을 거절해야 한다`,
    );
  }
});

test("고객 가명 ID는 비밀값과 고객 번호로 정해지고 필드 범위 안이다", () => {
  const ref = customerRefFor("0x1234", "C-0001");
  assert.equal(ref, customerRefFor("0x1234", "C-0001"));
  assert.notEqual(ref, customerRefFor("0x1235", "C-0001"));
  assert.notEqual(ref, customerRefFor("0x1234", "C-0002"));
  assert.match(ref, /^0x[0-9a-f]{64}$/);
  assert.ok(BigInt(ref) < FIELD);
  assert.throws(() => customerRefFor("0x1234", "고객 1"));
});

test("위험 신호 5종을 기준값대로 계산한다", () => {
  const ref = `0x${"1".repeat(64)}` as const;
  const other = `0x${"2".repeat(64)}` as const;
  const signals = computeSignals({
    diagnoses: [
      { customerRef: ref, attempt: 1, profile: 3, at: 1_000 },
      { customerRef: ref, attempt: 2, profile: 4, at: 1_100 },
      { customerRef: ref, attempt: 3, profile: 5, at: 2_000 },
      { customerRef: other, attempt: 1, profile: 2, at: 1_000 },
    ],
    sales: [
      {
        saleId: "11",
        customerRef: ref,
        attempt: 3,
        suitable: false,
        status: "confirmed",
        explanationSeconds: 59,
      },
      {
        saleId: "12",
        customerRef: other,
        attempt: 1,
        suitable: false,
        status: "subscribed",
        explanationSeconds: 60,
      },
    ],
  });
  const kinds = signals.map((s) => `${s.kind}:${s.saleId ?? s.attempt}`).sort();
  assert.deepEqual(kinds, [
    "repeat:3",
    "rise:11",
    "shortExplanation:11",
    "shortInterval:2",
    "unsuitable:11",
  ]);
});

test(
  "core ABI가 컴파일한 원장 ABI와 같다",
  { skip: !existsSync("out/FundLedger.sol/FundLedger.json") },
  () => {
    const compiled = JSON.parse(
      readFileSync("out/FundLedger.sol/FundLedger.json", "utf8"),
    ).abi as AbiEntry[];
    // 입력·출력 타입, indexed, 상태 변경 여부까지 비교한다.
    const signature = (item: AbiEntry) =>
      JSON.stringify([
        item.type,
        item.name,
        item.inputs?.map((p) => [type(p), !!p.indexed]),
        item.outputs?.map(type) ?? null,
        item.stateMutability ?? null,
      ]);
    const expected = compiled
      .filter((item) => ["function", "event", "error"].includes(item.type))
      .map(signature)
      .sort();
    assert.deepEqual(
      (ledgerAbi as readonly AbiEntry[]).map(signature).sort(),
      expected,
    );
  },
);
