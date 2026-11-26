import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useLocation } from "react-router";
import { BadgeCheck, ChevronLeft, FileText, LayoutGrid } from "lucide-react";
import { Button } from "../shared/button.tsx";
import { Badge, Notice, type Tone } from "../shared/components.tsx";
import { focusPageTitle, useFocusRescue } from "../shared/focus.ts";
import { HeadingTools } from "../shared/heading-tools.ts";
import ui from "../shared/ui.module.css";
import f from "./frame.module.css";
import { channel } from "./links.ts";

const TABS = [
  { path: channel.catalog, label: "상품", icon: LayoutGrid },
  { path: channel.records, label: "내 가입", icon: FileText },
  { path: channel.verify, label: "기록 확인", icon: BadgeCheck },
];
/**
 * 처리 오류를 보여 줄 자리. 동작 막대(`ActionBar`)가 있으면 막대가 주요 버튼 아래 줄에 오류를 보여 준다.
 * `attach`는 동작 막대가 그려져 있다고 알린다. 동작 막대가 없으면 Frame이 본문 맨 위에 오류 알림을 둔다.
 */
export const ErrorSlot = createContext<{
  error: string;
  attach: () => () => void;
}>({ error: "", attach: () => () => undefined });

/** 탭이 맡는 경로. 상품 상세는 상품 탭에 속한다. */
const tabOf = (pathname: string) =>
  pathname === channel.fund
    ? channel.catalog
    : pathname === channel.enroll
      ? channel.records
      : pathname;

/**
 * 증권사 앱의 틀. 최대 480px 한 열의 본문과 아래 탭 막대로 이뤄진다.
 * 화면 제목 옆에 증권사 이름과 네트워크를 표시한다. 상세 화면의 뒤로 가기는 제목 위에 둔다.
 * 탭을 옮겨도 진행 중인 가입은 그대로다(App의 신청 번호와 가입 화면의 세션 보관).
 * 화면이 바뀌면 맨 위로 가고 화면 제목에 초점을 옮긴다. 문서 제목은 "화면 · 증권사 이름"이다.
 * 오류는 떠 있지 않고 화면 흐름 안에 둔다(`ErrorSlot`). 닫기 버튼은 없다. App이 다음 처리, 경로 이동, 다시 읽기 성공 때 지운다.
 */
export function Frame({
  firm,
  title,
  back,
  network,
  error = "",
  children,
}: {
  firm: string;
  title?: string;
  back?: { to: string; label: string };
  network: { tone: Tone; text: string };
  error?: string;
  children: ReactNode;
}) {
  const { pathname, search } = useLocation();
  const current = tabOf(pathname);
  const page = title ?? TABS.find((tab) => tab.path === current)?.label;
  const main = useRef<HTMLElement>(null);
  const firstRoute = useRef(true);
  /** 그려져 있는 동작 막대 수. 0이면 오류를 본문 맨 위에 둔다. */
  const [bars, setBars] = useState(0);
  const attach = useCallback(() => {
    setBars((count) => count + 1);
    return () => setBars((count) => count - 1);
  }, []);
  const slot = useMemo(() => ({ error, attach }), [error, attach]);
  useFocusRescue(main);
  useEffect(() => {
    document.title = [page, firm].filter(Boolean).join(" · ");
  }, [page, firm]);
  // 탭이 바뀌면 맨 위에서 시작하고 화면 제목에 초점을 옮긴다.
  useEffect(() => {
    window.scrollTo(0, 0);
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    focusPageTitle(main.current, { preventScroll: true });
  }, [pathname, search]);
  return (
    <div className={f.page}>
      <a className={ui.skip} href="#content">
        본문으로 이동
      </a>
      <div className={f.app}>
        <main id="content" ref={main} className={f.main}>
          {/* 동작 막대가 없는 화면(첫 읽기 실패 등)의 오류. 떠 있지 않아 아무것도 가리지 않는다.
              알림 자리는 늘 그려 둔다. 화면 낭독기가 새로 들어온 문장을 읽는다. */}
          <div role="alert" className={f.alert}>
            {error && !bars && <Notice tone="danger">{error}</Notice>}
          </div>
          {back && (
            <Button variant="ghost" className={f.back} asChild>
              <Link to={back.to}>
                <ChevronLeft size={18} aria-hidden="true" />
                {back.label}
              </Link>
            </Button>
          )}
          <HeadingTools.Provider
            value={
              <div className={f.identity}>
                <span>{firm}</span>
                <Badge tone={network.tone}>{network.text}</Badge>
              </div>
            }
          >
            <ErrorSlot.Provider value={slot}>{children}</ErrorSlot.Provider>
          </HeadingTools.Provider>
        </main>
        <nav className={f.tabs} aria-label="앱 메뉴">
          {TABS.map((tab) => {
            const active = current === tab.path;
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={active ? f.tabActive : f.tab}
                aria-current={active ? "page" : undefined}
              >
                {/* 현재 탭은 색, 위 막대, 굵은 아이콘 선으로 함께 표시한다. */}
                <tab.icon size={22} strokeWidth={active ? 2.5 : 2} />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
