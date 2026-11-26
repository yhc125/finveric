import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  ExternalLink,
  Landmark,
  Layers,
  Store,
} from "lucide-react";
import type { HealthResponse } from "@finveric/core/api";
import { api, ApiError } from "../shared/api.ts";
import { Disclosure, Badge } from "../shared/components.tsx";
import { useDeployment } from "../shared/deployment.ts";
import { networkName } from "../shared/format.ts";
import {
  API_DOCS_HREF,
  CHANNEL_APP_HREF,
  CHANNEL_APP_LABEL,
} from "../shared/links.ts";
import ui from "../shared/ui.module.css";
import s from "./entry.module.css";

const roles = [
  {
    href: "/client/",
    icon: Store,
    title: "판매사 콘솔",
    text: "진단 기준과 상품을 관리하고 판매 건, 승인 요청, 위험 신호를 검토합니다.",
  },
  {
    href: "/auditor/",
    icon: Landmark,
    title: "감독기관 화면",
    text: "판매 과정과 판매사가 제출한 자료를 원장 기록과 대조합니다.",
  },
];
/** 역할 카드 아래의 보조 링크. 새 탭으로 연다. */
const extras = [
  { href: API_DOCS_HREF, label: "API 문서" },
  { href: CHANNEL_APP_HREF, label: CHANNEL_APP_LABEL },
];

/** 사이트 루트(/)의 진입 화면. 역할을 고르고 연결된 원장 상태를 본다. 기관이 읽으므로 합니다체로 쓴다. */
export function Entry() {
  const [configFailed, setConfigFailed] = useState(false);
  const deployment = useDeployment(
    useCallback(() => setConfigFailed(true), []),
  );
  const [health, setHealth] = useState<"loading" | "ok" | "fail" | "down">(
    "loading",
  );
  useEffect(() => {
    // 점검이 실패하면 API가 503을 돌려준다. 서버에 닿지 못하면 type이 offline이다.
    api<HealthResponse>("/health")
      .then((result) => setHealth(result.ok ? "ok" : "fail"))
      .catch((e: unknown) =>
        setHealth(
          e instanceof ApiError && e.type !== "offline" ? "fail" : "down",
        ),
      );
  }, []);
  return (
    <main className={s.page}>
      <div className={s.brand}>
        <span>
          <Layers size={20} />
        </span>
        FINVERIC
      </div>
      <section className={s.intro} aria-labelledby="entry-title">
        <h1 id="entry-title" className={s.title} tabIndex={-1}>
          금융상품 판매 기록 검증
        </h1>
        <nav className={s.roles} aria-label="역할 선택">
          {roles.map((role) => (
            <a key={role.href} className={s.role} href={role.href}>
              <span className={s.roleIcon}>
                <role.icon size={22} aria-hidden="true" />
              </span>
              <span className={s.roleBody}>
                <strong>{role.title}</strong>
                <span>{role.text}</span>
              </span>
              <ArrowRight className={s.go} size={20} aria-hidden="true" />
            </a>
          ))}
        </nav>
      </section>
      <ul className={s.extras} aria-label="증권사 앱과 API 문서">
        {extras.map((extra) => (
          <li key={extra.href}>
            <a href={extra.href} target="_blank" rel="noreferrer">
              {extra.label}
              <span className={ui.srOnly}> (새 탭에서 열기)</span>
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
      <section className={s.ledger} aria-labelledby="ledger-title">
        <h2 id="ledger-title">연결된 원장</h2>
        <dl>
          <div>
            <dt>상태</dt>
            <dd>
              <Badge
                tone={
                  health === "ok"
                    ? "success"
                    : health === "loading"
                      ? "neutral"
                      : "warning"
                }
              >
                {health === "ok"
                  ? "정상"
                  : health === "loading"
                    ? "확인 중"
                    : health === "fail"
                      ? "확인 필요"
                      : "API 연결 안 됨"}
              </Badge>
            </dd>
          </div>
          <div>
            <dt>네트워크</dt>
            <dd>
              {deployment
                ? networkName(deployment)
                : configFailed
                  ? "설정을 읽지 못함"
                  : "설정 대기"}
            </dd>
          </div>
        </dl>
        {deployment && (
          <Disclosure className={s.connection} label="원장 연결 정보">
            <dl>
              <div>
                <dt>원장 버전</dt>
                <dd>{`v${deployment.ledgerVersion}`}</dd>
              </div>
              <div>
                <dt>원장 주소</dt>
                <dd>
                  <code>{deployment.ledger}</code>
                </dd>
              </div>
            </dl>
          </Disclosure>
        )}
      </section>
      <p className={s.foot}>
        기존 판매 시스템에 기록 검증 기능을 더합니다. 상세 응답은 별도 보관하고,
        공통 기준·설명서와 가명 ID·판정 결과는 원장에 기록합니다.
      </p>
    </main>
  );
}
