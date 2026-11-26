import { SelectField } from "../../shared/SelectField.tsx";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  CATEGORIES,
  evaluateRule,
  isSuitable,
  MAX_CHOICES,
  MAX_QUESTIONS,
  MAX_SCORE,
  PROFILE_NAMES,
  RISK_GRADE_NAMES,
  canonical,
  ruleHash,
  validateRule,
  type Category,
  type RuleDocument,
} from "@finveric/core";
import type {
  ProductEntryDto,
  RegisterRuleRequest,
  RuleEntryDto,
} from "@finveric/core/api";
import { Button } from "../../shared/button.tsx";
import {
  Disclosure,
  Badge,
  ConfirmDialog,
  Facts,
  Heading,
  Notice,
  TableScroll,
} from "../../shared/components.tsx";
import { api, type LoadState } from "../../shared/api.ts";
import { choiceNote, short } from "../../shared/format.ts";
import ui from "../../shared/ui.module.css";
import client from "../client.module.css";
import local from "./operations.module.css";
import { focusElement } from "../../shared/focus.ts";
import type { Run } from "../App.tsx";
import { ProfileProducts, RegisterNotice } from "../components.tsx";
import {
  activeRule,
  latestProducts,
  limitRange,
  productName,
  profileName,
} from "../../shared/sales.ts";

const s = { ...ui, ...client, ...local };
const PROFILES = Object.keys(PROFILE_NAMES).map(Number);
const GRADES = Object.keys(RISK_GRADE_NAMES).map(Number);

/** 투자성향 단계별 점수 구간. 최고점은 문항마다 가장 높은 점수의 합이다. */
function scoreRanges(rule: RuleDocument) {
  const max = rule.questions.reduce(
    (sum, question) =>
      sum + Math.max(0, ...question.choices.map((choice) => choice.score)),
    0,
  );
  return PROFILES.map((profile) => {
    const low = profile === 1 ? 0 : rule.thresholds[profile - 2];
    const high = profile === 5 ? max : rule.thresholds[profile - 1] - 1;
    return {
      profile,
      range:
        low > Math.min(high, max)
          ? "해당 점수 없음"
          : low === Math.min(high, max)
            ? `${low}점`
            : `${low}~${Math.min(high, max)}점`,
    };
  });
}

/** 진단 기준 버전의 이름, 등록 상태, 해시, 등록 원문. 버전 이력 옆에 둔다. */
function RuleHead({ entry }: { entry: RuleEntryDto }) {
  const rule = entry.document;
  return (
    <>
      <div className={s.row}>
        <h2>{rule.name}</h2>
        <Badge tone={entry.registered ? "success" : "warning"}>
          {entry.registered ? "원장 등록" : "등록 전"}
        </Badge>
      </div>
      <Facts
        rows={[
          ["버전", `v${entry.version}`],
          ["기준 해시", <code>{entry.hash}</code>],
          ["등록 거래", entry.txHash ? <code>{entry.txHash}</code> : "—"],
          ["문항 수", `${rule.questions.length}개`],
        ]}
      />
      <Disclosure label="원장에 등록한 원문 보기">
        <pre>{canonical(rule)}</pre>
      </Disclosure>
    </>
  );
}

/** 진단 기준의 문항, 선택지 점수, 추출 조건, 등급 구간, 적합성 기준. 화면 너비의 패널에 둔다. */
function RuleTables({ rule }: { rule: RuleDocument }) {
  return (
    <>
      <TableScroll
        as="section"
        label="문항과 선택지"
        className={`${s.panel} ${s.spaced}`}
      >
        <table>
          <caption className={s.tableCaption}>문항과 선택지</caption>
          <thead>
            <tr>
              <th scope="col">범주</th>
              <th scope="col">질문</th>
              <th scope="col">선택지 · 점수 · 추출 조건</th>
            </tr>
          </thead>
          <tbody>
            {rule.questions.map((question, q) => (
              <tr key={q}>
                <td>{question.category}</td>
                <td className={s.wrapCell}>{question.title}</td>
                <td className={s.wrapCell}>
                  <ul className={s.choiceList}>
                    {question.choices.map((choice, o) => (
                      <li key={o}>
                        {choice.text}
                        <small>{choiceNote(choice)}</small>
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      <section className={`${s.panel} ${s.spaced}`}>
        <TableScroll label="등급 구간과 적합성 기준">
          <table>
            <caption className={s.tableCaption}>
              등급 구간과 적합성 기준
            </caption>
            <thead>
              <tr>
                <th scope="col">투자성향</th>
                <th scope="col">합계 점수</th>
                <th scope="col">권유 가능 위험등급</th>
              </tr>
            </thead>
            <tbody>
              {scoreRanges(rule).map(({ profile, range }) => (
                <tr key={profile}>
                  <th scope="row">{profileName(profile)}</th>
                  <td>{range}</td>
                  <td>{limitRange(rule.matrix[profile - 1])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
        <p className={s.tableNote}>
          추출 조건은 등급표보다 우선합니다. 추출 조건이 있는 답을 고르면
          투자성향과 관계없이 그 등급까지만 권유합니다.
        </p>
      </section>
    </>
  );
}

/** 최신 기준에서 시작해 새 버전을 편집한다. 검사·미리보기 뒤 원장에 등록한다. */
function RuleEditor({
  base,
  version,
  products,
  busy,
  run,
  cancel,
  registered,
}: {
  base: RuleDocument;
  version: number;
  products: ProductEntryDto[];
  busy: boolean;
  run: Run;
  cancel: () => void;
  registered: (version: number) => void;
}) {
  const [doc, setDoc] = useState<RuleDocument>(() => ({
    ...structuredClone(base),
    version,
    name: base.name.replace(/v\d+$/, `v${version}`),
  }));
  // 처음 연 내용. 바뀐 것이 있을 때만 편집 취소를 묻는다.
  const [initial] = useState(() => JSON.stringify(doc));
  const changed = JSON.stringify(doc) !== initial;
  const [confirmCancel, setConfirmCancel] = useState(false);
  // 오류 목록은 입력을 시작하거나 원장에 등록을 누른 뒤에 보여 준다.
  const [showErrors, setShowErrors] = useState(false);
  const [answers, setAnswers] = useState<number[]>(() =>
    base.questions.map(() => 0),
  );
  const edit = (change: (draft: RuleDocument) => void) => {
    setShowErrors(true);
    setDoc((current) => {
      const next = structuredClone(current);
      change(next);
      return next;
    });
  };
  const errors = validateRule(doc);
  const hash = useMemo(
    () => (validateRule(doc).length ? undefined : ruleHash(doc)),
    [doc],
  );
  const preview = doc.questions.map((question, q) =>
    Math.min(answers[q] ?? 0, Math.max(0, question.choices.length - 1)),
  );
  const evaluation = errors.length ? undefined : evaluateRule(doc, preview);
  const selling = latestProducts(products);
  const number = (value: string) => (value === "" ? Number.NaN : Number(value));
  const register = async () => {
    const entry = await run("진단 기준을 원장에 등록하고 있습니다", () =>
      api<RuleEntryDto>("/rules", {
        document: doc,
      } satisfies RegisterRuleRequest),
    );
    if (entry) registered(entry.version);
  };
  return (
    <div className={s.editorGrid}>
      <section className={`${s.panel} ${s.pad}`}>
        <div className={s.row}>
          <h2>새 버전 v{version} 편집</h2>
          <Button
            variant="ghost"
            onClick={() => (changed ? setConfirmCancel(true) : cancel())}
            blocked={busy}
          >
            편집 취소
          </Button>
        </div>
        <label className={s.field}>
          기준 이름
          <input
            value={doc.name}
            maxLength={100}
            onChange={(e) =>
              edit((draft) => {
                draft.name = e.target.value;
              })
            }
          />
        </label>
        {doc.questions.map((question, q) => (
          <fieldset key={q} className={s.questionEdit}>
            <legend>{q + 1}번 문항</legend>
            <div className={s.editRow}>
              <SelectField
                label="범주"
                className={ui.fieldInline}
                value={question.category}
                options={CATEGORIES.map((category) => ({
                  value: category,
                  label: category,
                }))}
                onChange={(value) =>
                  edit((draft) => {
                    draft.questions[q].category = value as Category;
                  })
                }
              />
              <label className={s.grow}>
                질문
                <input
                  id={`rule-q${q}-title`}
                  value={question.title}
                  onChange={(e) =>
                    edit((draft) => {
                      draft.questions[q].title = e.target.value;
                    })
                  }
                />
              </label>
              <Button
                variant="ghost"
                disabled={doc.questions.length <= 1}
                onClick={() => {
                  edit((draft) => {
                    draft.questions.splice(q, 1);
                  });
                  // 지운 자리의 문항(마지막이었으면 앞 문항)으로 초점을 옮긴다. 화면 처음으로 돌아가지 않는다.
                  const next = Math.min(q, doc.questions.length - 2);
                  requestAnimationFrame(() =>
                    focusElement(`rule-q${next}-title`),
                  );
                }}
                aria-label={`${q + 1}번 문항 삭제`}
              >
                <Trash2 size={16} />
                문항 삭제
              </Button>
            </div>
            <TableScroll label={`${q + 1}번 문항 선택지`}>
              <table className={s.choiceTable}>
                <thead>
                  <tr>
                    <th scope="col">선택지 문구</th>
                    <th scope="col">점수</th>
                    <th scope="col">추출 조건</th>
                    <th scope="col">고령 표시</th>
                    <th scope="col">
                      <span className={s.srOnly}>삭제</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {question.choices.map((choice, o) => {
                    const where = `${q + 1}번 문항 ${o + 1}번 선택지`;
                    return (
                      <tr key={o}>
                        <td>
                          <input
                            id={`rule-q${q}-c${o}-text`}
                            aria-label={`${where} 문구`}
                            value={choice.text}
                            onChange={(e) =>
                              edit((draft) => {
                                draft.questions[q].choices[o].text =
                                  e.target.value;
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`${where} 점수`}
                            type="number"
                            min={0}
                            max={MAX_SCORE}
                            step={1}
                            className={s.numberInput}
                            value={
                              Number.isNaN(choice.score) ? "" : choice.score
                            }
                            onChange={(e) =>
                              edit((draft) => {
                                draft.questions[q].choices[o].score = number(
                                  e.target.value,
                                );
                              })
                            }
                          />
                        </td>
                        <td>
                          <SelectField
                            label={`${where} 추출 조건`}
                            hideLabel
                            className={ui.fieldInline}
                            value={
                              choice.cap && choice.cap > 1
                                ? String(choice.cap)
                                : ""
                            }
                            options={[
                              { value: "", label: "제한 없음" },
                              ...GRADES.slice(1).map((grade) => ({
                                value: String(grade),
                                label: `${grade}등급까지`,
                              })),
                            ]}
                            onChange={(value) =>
                              edit((draft) => {
                                const target = draft.questions[q].choices[o];
                                if (value) target.cap = Number(value);
                                else delete target.cap;
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`${where} 고령 표시`}
                            type="checkbox"
                            checked={choice.elderly === true}
                            onChange={(e) =>
                              edit((draft) => {
                                const target = draft.questions[q].choices[o];
                                if (e.target.checked) target.elderly = true;
                                else delete target.elderly;
                              })
                            }
                          />
                        </td>
                        <td>
                          <Button
                            variant="ghost"
                            disabled={question.choices.length <= 1}
                            aria-label={`${where} 삭제`}
                            onClick={() => {
                              edit((draft) => {
                                draft.questions[q].choices.splice(o, 1);
                              });
                              // 지운 자리의 선택지(마지막이었으면 앞 선택지) 문구로 초점을 옮긴다.
                              const next = Math.min(
                                o,
                                question.choices.length - 2,
                              );
                              requestAnimationFrame(() =>
                                focusElement(`rule-q${q}-c${next}-text`),
                              );
                            }}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
            <Button
              variant="outline"
              blocked={question.choices.length >= MAX_CHOICES}
              onClick={() =>
                edit((draft) => {
                  draft.questions[q].choices.push({ text: "", score: 0 });
                })
              }
            >
              <Plus size={16} />
              선택지 추가 ({question.choices.length}/{MAX_CHOICES})
            </Button>
          </fieldset>
        ))}
        <Button
          variant="outline"
          blocked={doc.questions.length >= MAX_QUESTIONS}
          onClick={() =>
            edit((draft) => {
              draft.questions.push({
                category: CATEGORIES[0],
                title: "",
                choices: [{ text: "", score: 0 }],
              });
            })
          }
        >
          <Plus size={16} />
          문항 추가 ({doc.questions.length}/{MAX_QUESTIONS})
        </Button>
        <h3 className={s.subTitle}>등급 구간</h3>
        <p className={s.small}>
          투자성향 단계마다 필요한 최소 합계 점수입니다. 단계가 오를수록 같거나
          커야 합니다.
        </p>
        <div className={s.editGrid}>
          {PROFILES.slice(1).map((profile, k) => (
            <label key={profile} className={s.field}>
              {profileName(profile)} 최소 점수
              <input
                type="number"
                min={0}
                max={255}
                className={s.numberInput}
                value={Number.isNaN(doc.thresholds[k]) ? "" : doc.thresholds[k]}
                onChange={(e) =>
                  edit((draft) => {
                    draft.thresholds[k] = number(e.target.value);
                  })
                }
              />
            </label>
          ))}
        </div>
        <h3 className={s.subTitle}>적합성 기준</h3>
        <p className={s.small}>
          투자성향마다 권유할 수 있는 가장 위험한 등급입니다. 투자성향이
          오를수록 같거나 더 위험한 등급이어야 합니다.
        </p>
        <div className={s.editGrid}>
          {PROFILES.map((profile) => (
            <SelectField
              key={profile}
              label={profileName(profile)}
              value={String(doc.matrix[profile - 1])}
              options={GRADES.map((grade) => ({
                value: String(grade),
                label: limitRange(grade),
              }))}
              onChange={(value) =>
                edit((draft) => {
                  draft.matrix[profile - 1] = Number(value);
                })
              }
            />
          ))}
        </div>
      </section>
      <aside className={s.editorAside}>
        <section className={`${s.panel} ${s.pad}`}>
          <h2>검사</h2>
          {!showErrors && errors.length ? (
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
              ["기준 해시", hash ? <code>{hash}</code> : "검사 통과 뒤 계산"],
            ]}
          />
          <Button
            busy={busy}
            blocked={showErrors && errors.length > 0}
            onClick={() =>
              errors.length ? setShowErrors(true) : void register()
            }
          >
            원장에 등록
          </Button>
        </section>
        <section className={`${s.panel} ${s.pad}`}>
          <h2>고객 화면 미리보기</h2>
          <p>답을 골라 판정 결과를 확인합니다. 원장에 기록하지 않습니다.</p>
          {doc.questions.map((question, q) => (
            <SelectField
              key={q}
              label={`${q + 1}. ${question.title || "(질문 없음)"}`}
              value={String(preview[q])}
              options={question.choices.map((choice, index) => ({
                value: String(index),
                label: choice.text || `${index + 1}번 선택지`,
              }))}
              onChange={(value) =>
                setAnswers(() => {
                  const next = [...preview];
                  next[q] = Number(value);
                  return next;
                })
              }
            />
          ))}
          {evaluation ? (
            <Facts
              rows={[
                ["합계 점수", `${evaluation.score}점`],
                ["투자성향", profileName(evaluation.profile)],
                ["권유 가능 위험등급", limitRange(evaluation.limit)],
                ["고령 표시", evaluation.elderly ? "예" : "아니요"],
                [
                  "권유 가능 상품",
                  selling
                    .filter(({ product }) =>
                      isSuitable(product.document.riskGrade, evaluation.limit),
                    )
                    .map(({ product }) => productName(product.document))
                    .join(", ") || "없음",
                ],
              ]}
            />
          ) : (
            <p className={s.small}>오류를 고치면 판정 결과를 보여 줍니다.</p>
          )}
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

/** 진단 기준 버전 목록, 버전 보기, 새 버전 편집과 등록, 투자성향별 권유 가능 상품. */
export function Rules({
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
  const active = activeRule(rules);
  const [selected, setSelected] = useState<number>();
  const [editing, setEditing] = useState(false);
  const entry =
    rules.find((rule) => rule.version === selected) ?? active ?? rules.at(-1);
  const base = active ?? rules.at(-1);
  const nextVersion = (active?.version ?? 0) + 1;
  return (
    <>
      <Heading
        title="진단 기준"
        description="등록한 기준을 바꾸려면 새 버전을 등록하세요."
      >
        {!editing && base && (
          <Button blocked={busy} onClick={() => setEditing(true)}>
            <Plus size={16} />새 버전 만들기
          </Button>
        )}
      </Heading>
      {load === "ready" && !active && !products.some((p) => p.registered) && (
        <RegisterNotice busy={busy} register={register} />
      )}
      {editing && base ? (
        <RuleEditor
          base={base.document}
          version={nextVersion}
          products={products}
          busy={busy}
          run={run}
          cancel={() => setEditing(false)}
          registered={(version) => {
            setEditing(false);
            setSelected(version);
          }}
        />
      ) : (
        <>
          {/* 버전 정보와 버전 이력을 나란히 두고, 문항·등급 표는 아래 화면 너비의 패널에 둔다. */}
          <div className={s.detailGrid}>
            <section className={`${s.panel} ${s.pad}`}>
              {entry ? (
                <RuleHead entry={entry} />
              ) : (
                <p className={s.small}>
                  {load === "ready"
                    ? "진단 기준이 없습니다."
                    : load === "failed"
                      ? "진단 기준을 불러오지 못했습니다. 연결을 확인하고 화면을 새로 고치세요."
                      : "진단 기준을 불러오고 있습니다."}
                </p>
              )}
            </section>
            <aside className={`${s.panel} ${s.pad}`}>
              <h2>버전 이력</h2>
              <ul className={s.versionList}>
                {[...rules].reverse().map((rule) => (
                  <li key={`${rule.version}:${rule.hash}`}>
                    <button
                      aria-pressed={rule === entry}
                      className={rule === entry ? s.versionActive : ""}
                      onClick={() => setSelected(rule.version)}
                    >
                      <span>
                        <strong>v{rule.version}</strong> {rule.document.name}
                      </span>
                      <small>
                        <code>{short(rule.hash)}</code>
                      </small>
                      <Badge
                        tone={
                          rule === active
                            ? "success"
                            : rule.registered
                              ? "neutral"
                              : "warning"
                        }
                      >
                        {rule === active
                          ? "적용 중"
                          : rule.registered
                            ? "이전 버전"
                            : "등록 전"}
                      </Badge>
                    </button>
                  </li>
                ))}
              </ul>
              <p className={s.small}>
                진단은 원장에 등록한 최신 버전으로만 합니다. 이전 회차는 그때의
                버전으로 남습니다.
              </p>
            </aside>
          </div>
          {entry && <RuleTables rule={entry.document} />}
        </>
      )}
      <section className={`${s.panel} ${s.pad} ${s.spaced}`}>
        <h2>등급별 판매 상품</h2>
        <p>
          적용 중인 기준(v{active?.version ?? "—"})으로 투자성향마다 권유할 수
          있는 상품입니다. 권유 범위 밖의 상품은 고객이 스스로 원할 때 부적합
          사실을 알리고 추가 위험 확인을 받은 뒤 청약합니다.
        </p>
        <ProfileProducts
          rule={active?.document}
          products={latestProducts(products)}
        />
      </section>
    </>
  );
}
