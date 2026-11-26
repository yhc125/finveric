import { SelectField } from "../../shared/SelectField.tsx";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { ruleHash, type RuleDocument } from "@finveric/core";
import type { LedgerRule, LedgerSnapshot } from "@finveric/core/ledger";
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
import { choiceNote, dateTime } from "../../shared/format.ts";
import ui from "../../shared/ui.module.css";
import local from "../auditor.module.css";
import { ChangeList } from "../ChangeList.tsx";
import { LedgerGate } from "../components.tsx";
import { diffRules } from "../diff.ts";
import { gradeLabel, profileLabel, short } from "../format.ts";
import type { Ledger } from "../useLedger.ts";

const s = { ...ui, ...local };

/** 기준 감사. 등록 원문으로 기준 해시를 다시 계산하고 버전 사이의 차이를 보여 준다. */
export function Rules({ ledger }: { ledger: Ledger }) {
  return (
    <div className={s.page}>
      <LedgerGate ledger={ledger}>
        {(snapshot) => <RuleAudit snapshot={snapshot} />}
      </LedgerGate>
    </div>
  );
}

function RuleAudit({ snapshot }: { snapshot: LedgerSnapshot }) {
  const [params, setParams] = useSearchParams();
  const [technical, setTechnical] = useState(false);
  const rules = snapshot.rules;
  const selected =
    rules.find((rule) => String(rule.version) === params.get("version")) ??
    rules.at(-1);
  if (!selected)
    return (
      <div className={`${s.panel} ${s.empty}`}>
        <h2>등록한 진단 기준이 없습니다</h2>
        <p>판매사가 진단 기준을 원장에 등록하면 여기에 버전이 나옵니다.</p>
      </div>
    );
  const used = (rule: LedgerRule) =>
    snapshot.diagnoses.filter((entry) => entry.ruleHash === rule.hash).length;
  const versionPath = (version: number) => {
    const next = new URLSearchParams(params);
    next.set("version", String(version));
    next.delete("base");
    return `?${next}`;
  };
  return (
    <>
      <TableScroll as="section" label="등록 버전" className={s.panel}>
        <div className={s.panelTitle}>
          <h2>등록 버전</h2>
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
              <th scope="col">이름</th>
              <th scope="col">기준 해시</th>
              <th scope="col">등록 시각</th>
              <th scope="col">원문 대조</th>
              <th scope="col" className={s.numeric}>
                사용한 진단
              </th>
              {technical && <th scope="col">블록</th>}
              {technical && <th scope="col">거래 해시</th>}
              <DetailColumn label="진단 기준 버전 선택" />
            </tr>
          </thead>
          <tbody>
            {[...rules].reverse().map((rule) => (
              <DetailRow
                key={rule.hash}
                current={rule === selected}
                destination={{
                  to: versionPath(rule.version),
                  label: `진단 기준 v${rule.version} 선택`,
                }}
              >
                <td>v{rule.version}</td>
                <td>{rule.parsed?.name ?? "원문을 읽을 수 없음"}</td>
                <td>
                  <code title={rule.hash}>{short(rule.hash, 10, 8)}</code>
                </td>
                <td>{dateTime(rule.at)}</td>
                <td>
                  <Badge tone={rule.hashMatches ? "success" : "warning"}>
                    {rule.hashMatches ? "해시 일치" : "불일치"}
                  </Badge>
                </td>
                <Count value={used(rule)} />
                {technical && (
                  <td className={s.numeric}>{rule.block.toString()}</td>
                )}
                {technical && (
                  <td className={s.wrap}>
                    <code>{rule.txHash}</code>
                  </td>
                )}
              </DetailRow>
            ))}
          </tbody>
        </table>
      </TableScroll>
      <RuleDetail
        key={selected.hash}
        rule={selected}
        rules={rules}
        base={params.get("base")}
        setBase={(version) =>
          setParams((current) => {
            const next = new URLSearchParams(current);
            next.set("version", String(selected.version));
            next.set("base", version);
            return next;
          })
        }
      />
    </>
  );
}

function RuleDetail({
  rule,
  rules,
  base,
  setBase,
}: {
  rule: LedgerRule;
  rules: LedgerRule[];
  base: string | null;
  setBase: (version: string) => void;
}) {
  const document = rule.parsed;
  const others = rules.filter((entry) => entry !== rule && entry.parsed);
  const previous =
    others.find((entry) => String(entry.version) === base) ??
    [...others].reverse().find((entry) => entry.version < rule.version) ??
    others.at(-1);
  return (
    <>
      <section className={`${s.panel} ${s.pad} ${s.section}`}>
        <h2>
          v{rule.version} · {document?.name ?? "원문을 읽을 수 없음"}
        </h2>
        <Facts
          rows={[
            ["원장 기준 해시", <code>{rule.hash}</code>],
            [
              "원문으로 다시 계산한 해시",
              document ? (
                <code>{ruleHash(document)}</code>
              ) : (
                "원문이 정렬한 JSON이 아니거나 검사를 통과하지 못했습니다."
              ),
            ],
            [
              "대조 결과",
              <Badge tone={rule.hashMatches ? "success" : "warning"}>
                {rule.hashMatches ? "일치" : "불일치"}
              </Badge>,
            ],
            ["등록 시각", dateTime(rule.at)],
          ]}
        />
        {!rule.hashMatches && (
          <Notice tone="warning">
            이 버전의 등록 원문으로 다시 계산한 기준 해시가 원장 값과 다릅니다.
            이 기준으로 기록한 진단은 분쟁 조회에서 불일치로 나옵니다.
          </Notice>
        )}
        <Disclosure label="등록 원문 보기 (이벤트 RuleRegistered)">
          <pre>{rule.document}</pre>
        </Disclosure>
      </section>
      {document && <RuleDocumentView document={document} />}
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
              onChange={setBase}
            />
          )}
        </div>
        {!document ? (
          <p className={s.intro}>원문을 읽을 수 없어 비교하지 못합니다.</p>
        ) : !previous ? (
          <p className={s.intro}>비교할 다른 버전이 없습니다.</p>
        ) : (
          <ChangeList
            changes={
              previous.version < rule.version
                ? diffRules(previous.parsed!, document)
                : diffRules(document, previous.parsed!)
            }
            from={`v${Math.min(previous.version, rule.version)}`}
            to={`v${Math.max(previous.version, rule.version)}`}
          />
        )}
      </section>
    </>
  );
}

/** 합계 점수의 최댓값. 문항마다 가장 높은 선택지 점수를 더한다. */
const maxScore = (document: RuleDocument) =>
  document.questions.reduce(
    (sum, question) =>
      sum + Math.max(...question.choices.map((choice) => choice.score)),
    0,
  );

function RuleDocumentView({ document }: { document: RuleDocument }) {
  const top = maxScore(document);
  const bands = [1, 2, 3, 4, 5].map((profile) => {
    const lower = profile === 1 ? 0 : document.thresholds[profile - 2];
    const upper = profile === 5 ? top : document.thresholds[profile - 1] - 1;
    return {
      profile,
      range:
        upper < lower || lower > top
          ? "해당 없음"
          : lower === upper
            ? `${lower}점`
            : `${lower}~${upper}점`,
      limit: document.matrix[profile - 1],
    };
  });
  return (
    <>
      <TableScroll
        as="section"
        label="문항과 선택지"
        className={`${s.panel} ${s.section}`}
      >
        <div className={s.panelTitle}>
          <h2>문항과 선택지</h2>
        </div>
        <p className={s.panelNote}>
          문항 {document.questions.length}개 · 합계 최고 {top}점. 추출 조건은
          등급표보다 우선합니다.
        </p>
        <table>
          <thead>
            <tr>
              <th scope="col">번호</th>
              <th scope="col">범주</th>
              <th scope="col">질문</th>
              <th scope="col">선택지 · 점수 · 추출 조건 · 고령 표시</th>
            </tr>
          </thead>
          <tbody>
            {document.questions.map((question, q) => (
              <tr key={q}>
                <td>{q + 1}</td>
                <td>{question.category}</td>
                <td className={s.wrap}>{question.title}</td>
                <td className={s.wrap}>
                  <ol className={s.choices}>
                    {question.choices.map((choice, o) => (
                      <li key={o}>
                        <span>
                          {o + 1}. {choice.text}
                        </span>
                        <span className={s.small}>{choiceNote(choice)}</span>
                      </li>
                    ))}
                  </ol>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      <TableScroll
        as="section"
        label="등급 구간과 적합성 기준"
        className={`${s.panel} ${s.section}`}
      >
        <div className={s.panelTitle}>
          <h2>등급 구간과 적합성 기준</h2>
        </div>
        <p className={s.panelNote}>
          투자성향은 넘은 구간 수로 정합니다. 권유 가능 최고 위험등급은 적합성
          기준과 고른 선택지의 추출 조건 중 가장 보수적인 값입니다.
        </p>
        <table>
          <thead>
            <tr>
              <th scope="col">투자성향</th>
              <th scope="col">합계 점수</th>
              <th scope="col">권유 가능 최고 위험등급</th>
              <th scope="col">권유 가능 범위</th>
            </tr>
          </thead>
          <tbody>
            {bands.map((band) => (
              <tr key={band.profile}>
                <td>
                  {band.profile}. {profileLabel(band.profile)}
                </td>
                <td>{band.range}</td>
                <td>{gradeLabel(band.limit)}</td>
                <td>{band.limit === 6 ? "6등급" : `${band.limit}~6등급`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </>
  );
}
