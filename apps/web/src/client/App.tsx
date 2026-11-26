import { useCallback, useEffect, useRef, useState } from "react";
import { Link, matchPath, Route, Routes, useLocation } from "react-router";
import {
  Activity,
  BookOpen,
  KeyRound,
  Landmark,
  Layers,
  LayoutDashboard,
  ListChecks,
  Siren,
  Smartphone,
} from "lucide-react";
import type {
  ApiKeyDto,
  ApproveRequest,
  ConfigDto,
  CustomerDto,
  ProductEntryDto,
  RegisterDto,
  RuleEntryDto,
  SaleAction,
  SaleDto,
  TraceDto,
} from "@finveric/core/api";
import { Button } from "../shared/button.tsx";
import { api, ApiError, token, type LoadState } from "../shared/api.ts";
import { AccessCodeForm, Badge, Heading } from "../shared/components.tsx";
import { DEPLOYMENT_ERROR, useDeployment } from "../shared/deployment.ts";
import { networkName } from "../shared/format.ts";
import {
  API_DOCS_HREF,
  CHANNEL_APP_HREF,
  CHANNEL_APP_LABEL,
} from "../shared/links.ts";
import type { Sale } from "../shared/sales.ts";
import { Shell, type ExternalItem, type NavGroup } from "../shared/Shell.tsx";
import {
  PRODUCT_DETAIL_ROUTE,
  PRODUCT_LIST_PATH,
  SALE_DETAIL_ROUTE,
} from "./paths.ts";
import { ApiKeys } from "./screens/ApiKeys.tsx";
import { Chain } from "./screens/Chain.tsx";
import { Dashboard } from "./screens/Dashboard.tsx";
import { Products } from "./screens/Products.tsx";
import { Review } from "./screens/Review.tsx";
import { Rules } from "./screens/Rules.tsx";
import { SaleDetail } from "./screens/SaleDetail.tsx";
import { Signals } from "./screens/Signals.tsx";

const OPERATIONS = "판매사 업무";
/**
 * 판매사 소비자보호 담당이 쓰는 B2B 화면.
 * 고객 화면은 증권사 앱(/channel/)에 있다. 새 탭으로 연다.
 */
const groups: NavGroup[] = [
  {
    label: OPERATIONS,
    items: [
      { path: "/", label: "대시보드", icon: LayoutDashboard },
      { path: "/rules", label: "진단 기준", icon: ListChecks },
      {
        path: PRODUCT_LIST_PATH,
        label: "상품 관리",
        icon: Landmark,
        end: false,
      },
      { path: "/review", label: "판매·검토", icon: Layers, end: false },
      { path: "/signals", label: "위험 신호", icon: Siren },
      { path: "/chain", label: "처리 기록", icon: Activity },
      { path: "/keys", label: "API 키", icon: KeyRound },
    ],
  },
];
/** 사이드바 아래쪽의 새 탭 링크. */
const links: ExternalItem[] = [
  { href: CHANNEL_APP_HREF, label: CHANNEL_APP_LABEL, icon: Smartphone },
  { href: API_DOCS_HREF, label: "API 문서", icon: BookOpen },
];
function pageTitle(pathname: string) {
  if (matchPath(SALE_DETAIL_ROUTE, pathname)) return "판매 건 상세";
  if (matchPath(PRODUCT_DETAIL_ROUTE, pathname)) return "판매 상품 상세";
  for (const group of groups)
    for (const item of group.items)
      if (matchPath(item.path, pathname)) return item.label;
  return matchPath("/channel/*", pathname)
    ? CHANNEL_APP_LABEL
    : "화면을 찾을 수 없습니다";
}

/**
 * 이전 주소(/client/channel/*)를 증권사 앱(/channel/*)으로 보낸다. 쿼리를 그대로 넘긴다.
 * 공유한 링크와 이전 화면 캡처의 주소가 쓴다.
 */
function ChannelRedirect() {
  const { pathname, search, hash } = useLocation();
  const target = `/channel${pathname.slice("/channel".length) || "/"}${search}${hash}`;
  useEffect(() => {
    window.location.replace(target);
  }, [target]);
  return (
    <Heading
      title="증권사 앱으로 이동합니다"
      description="화면이 열리지 않으면 증권사 앱 열기를 선택하세요."
    >
      <Button asChild>
        <a href={target}>{CHANNEL_APP_LABEL} 열기</a>
      </Button>
    </Heading>
  );
}

/**
 * 화면이 부르는 처리. 실패하면 오류를 보여 주고 undefined를 돌려준다.
 * done을 주면 끝난 뒤 상태 줄에 넣어 화면 낭독기가 읽는다.
 */
export type Run = <T>(
  name: string,
  operation?: () => Promise<T>,
  done?: string,
) => Promise<T | undefined>;

/**
 * 화면에 보여 줄 오류. 닫기 버튼 없이 지운다: 다음 처리를 시작할 때, 경로가 바뀔 때.
 * 읽기 실패(`load`)는 다음 읽기가 성공해도 지운다. 처리 실패 뒤 바로 다시 읽는 것은 지우지 않는다.
 */
type Failure = { message: string; load?: boolean };

export function App() {
  const location = useLocation();
  const [failure, setFailure] = useState<Failure>();
  const showError = useCallback(
    (message: string) => setFailure({ message }),
    [],
  );
  const deployment = useDeployment(showError, DEPLOYMENT_ERROR.institution);
  const [config, setConfig] = useState<ConfigDto>();
  const configRef = useRef<ConfigDto>(undefined);
  const [rules, setRules] = useState<RuleEntryDto[]>([]);
  const [products, setProducts] = useState<ProductEntryDto[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [traces, setTraces] = useState<TraceDto[]>([]);
  const [customer, setCustomer] = useState<CustomerDto>();
  const [apiKeys, setApiKeys] = useState<ApiKeyDto[]>([]);
  const [load, setLoad] = useState<LoadState>("loading");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  /** 서버가 접근 코드를 거절했을 때 입력 칸 아래에 보여 줄 문장. */
  const [accessError, setAccessError] = useState("");
  /** 접근 코드 입력 칸을 보여 줄지. 저장한 코드가 없거나 서버가 거절했을 때만 보인다. 연결하면 숨긴다. */
  const [needsCode, setNeedsCode] = useState(() => !token());
  const noteAccess = (e: unknown) => {
    const rejected = e instanceof ApiError && e.status === 401;
    if (rejected) setNeedsCode(true);
    // 코드를 넣기 전에는 오류 문장 없이 입력 칸만 보여 준다.
    setAccessError(rejected && token() ? "접근 코드를 다시 확인하세요." : "");
  };

  const reload = useCallback(async () => {
    const current = configRef.current ?? (await api<ConfigDto>("/config"));
    if (!configRef.current) {
      configRef.current = current;
      setConfig(current);
    }
    const [newRules, newProducts, newSales, newTraces, newCustomer, newKeys] =
      await Promise.all([
        api<RuleEntryDto[]>("/rules"),
        api<ProductEntryDto[]>("/products"),
        api<SaleDto[]>("/sales"),
        api<TraceDto[]>("/traces"),
        api<CustomerDto>(
          `/customers/${encodeURIComponent(current.demoCustomer.number)}`,
        ),
        api<ApiKeyDto[]>("/keys"),
      ]);
    setRules(newRules);
    setProducts(newProducts);
    setSales(newSales);
    setTraces(newTraces);
    setCustomer(newCustomer);
    setApiKeys(newKeys);
    setLoad("ready");
    setNeedsCode(false);
    // 읽기에 성공하면 앞선 읽기 실패의 오류를 지운다. 처리 실패의 오류는 그대로 둔다.
    setFailure((current) => (current?.load ? undefined : current));
  }, []);
  /** 화면을 막지 않고 다시 읽는다. */
  const refresh = useCallback(() => reload().catch(() => undefined), [reload]);
  useEffect(() => {
    reload().catch((e: Error) => {
      // 접근 코드를 아직 넣지 않았으면 오류가 아니다. 입력 칸만 보여 준다.
      if (!(e instanceof ApiError && e.status === 401 && !token()))
        setFailure({ message: e.message, load: true });
      noteAccess(e);
      // 처음 읽기에 실패하면 빈 표가 "불러오고 있습니다"에 머물지 않게 한다.
      setLoad((current) => (current === "loading" ? "failed" : current));
    });
  }, [reload]);
  // 고객은 다른 탭(증권사 앱)에서 가입한다. 이 탭으로 돌아오면 판매 건을 다시 읽는다.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh]);
  // 오래 걸리는 처리(증명 생성, 거래 영수증) 중에도 처리 기록을 갱신한다.
  // 처리 기록만 읽는다. 전체를 2초마다 다시 읽으면 분당 180번이라 요청 한도(120번)를 넘는다.
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(
      () =>
        void api<TraceDto[]>("/traces")
          .then(setTraces)
          .catch(() => undefined),
      2000,
    );
    return () => clearInterval(timer);
  }, [busy]);
  // 화면을 옮기면 앞 화면의 오류를 지운다.
  const route = location.pathname + location.search;
  useEffect(() => {
    setFailure(undefined);
  }, [route]);

  const run: Run = async (name, operation, done) => {
    if (busy) return undefined;
    setBusy(name);
    setFailure(undefined);
    setNotice("");
    try {
      const result = await operation?.();
      await reload();
      setAccessError("");
      if (done) setNotice(done);
      return result;
    } catch (e) {
      setFailure({
        message:
          e instanceof Error
            ? e.message
            : "처리를 완료하지 못했습니다. 잠시 뒤 다시 시도하세요.",
      });
      noteAccess(e);
      await refresh();
      return undefined;
    } finally {
      setBusy("");
    }
  };
  const register = () =>
    run(
      "기본 진단 기준과 상품을 원장에 등록하고 있습니다",
      () => api<RegisterDto>("/register", {}),
      "기본 진단 기준과 상품을 원장에 등록했습니다.",
    );
  const action = (
    id: string,
    name: SaleAction,
    label: string,
    done?: string,
    body: ApproveRequest = {},
  ) =>
    run(label, () => api<SaleDto>(`/sales/${id}/action/${name}`, body), done);

  return (
    <Shell
      home="/"
      entryHref="/"
      groups={groups}
      links={links}
      app="판매사 콘솔"
      title={pageTitle(location.pathname)}
      headingTools={
        <Badge tone={deployment ? "success" : "warning"}>
          {networkName(deployment)}
        </Badge>
      }
      error={failure?.message}
      notice={notice}
      busy={busy}
    >
      {config?.requiresToken && needsCode && (
        <AccessCodeForm
          connect={() => void run("연결하고 있습니다", reload, "연결했습니다.")}
          busy={!!busy}
          error={accessError}
        />
      )}
      <Routes>
        <Route
          path="/"
          element={
            <Dashboard
              load={load}
              rules={rules}
              products={products}
              sales={sales}
              customer={customer}
              busy={!!busy}
              register={register}
            />
          }
        />
        <Route
          path="/rules"
          element={
            <Rules
              load={load}
              rules={rules}
              products={products}
              busy={!!busy}
              run={run}
              register={register}
            />
          }
        />
        <Route
          path={`${PRODUCT_DETAIL_ROUTE}?`}
          element={
            <Products
              key={location.pathname}
              load={load}
              rules={rules}
              products={products}
              busy={!!busy}
              run={run}
              register={register}
            />
          }
        />
        <Route
          path="/review"
          element={<Review load={load} sales={sales} products={products} />}
        />
        <Route
          path={SALE_DETAIL_ROUTE}
          element={
            <SaleDetail
              load={load}
              sales={sales}
              products={products}
              customer={customer}
              busy={!!busy}
              action={action}
            />
          }
        />
        <Route
          path="/signals"
          element={
            <Signals
              load={load}
              sales={sales}
              products={products}
              customer={customer}
            />
          }
        />
        <Route
          path="/chain"
          element={
            <Chain
              load={load}
              traces={traces}
              sales={sales}
              products={products}
              deployment={config?.deployment}
              busy={!!busy}
              refresh={() => run("처리 기록을 다시 읽고 있습니다", reload)}
            />
          }
        />
        <Route
          path="/keys"
          element={
            <ApiKeys keys={apiKeys} load={load} busy={!!busy} run={run} />
          }
        />
        <Route path="/channel/*" element={<ChannelRedirect />} />
        <Route
          path="*"
          element={
            <Heading
              title="화면을 찾을 수 없습니다"
              description="메뉴에서 화면을 다시 골라 주세요."
            >
              <Button asChild>
                <Link to="/">대시보드로 가기</Link>
              </Button>
            </Heading>
          }
        />
      </Routes>
    </Shell>
  );
}
