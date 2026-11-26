import { useCallback, useEffect, useRef, useState } from "react";
import {
  Link,
  matchPath,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import { CUSTOMER_LEDGER_ERRORS, type Product } from "@finveric/core";
import { DEMO_SESSION_PREFIX } from "@finveric/core/api";
import type {
  ConfigDto,
  CustomerDto,
  ExportKind,
  ExportResponse,
  OpenSaleRequest,
  ProductEntryDto,
  RuleEntryDto,
  SaleAction,
  SaleDto,
} from "@finveric/core/api";
import type { ErrorCode, ErrorType } from "@finveric/core/errors";
import { Button } from "../shared/button.tsx";
import {
  api,
  ApiError,
  saveFile,
  token,
  type LoadState,
} from "../shared/api.ts";
import { AccessCodeForm, Heading } from "../shared/components.tsx";
import { DEPLOYMENT_ERROR, useDeploymentConfig } from "../shared/deployment.ts";
import { networkName } from "../shared/format.ts";
import { findProduct, latestProducts, type Sale } from "../shared/sales.ts";
import { Frame } from "./Frame.tsx";
import { channel, enrollPath, fundPath } from "./links.ts";
import { Catalog } from "./screens/Catalog.tsx";
import { CustomerVerify } from "./screens/CustomerVerify.tsx";
import { Enrollment } from "./screens/Enrollment.tsx";
import { ProductDetail } from "./screens/ProductDetail.tsx";
import { Records } from "./screens/Records.tsx";

/** 고객이 청약 또는 관리자 승인을 요청한 신청 번호. */
const DRAFT_KEY = "finveric-enrollment-sale";
const SESSION_KEY = "finveric-channel-session";

function publicChannelApi<T>(path: string, body?: unknown) {
  let credential = sessionStorage.getItem(SESSION_KEY);
  if (!credential) {
    credential = DEMO_SESSION_PREFIX + crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, credential);
  }
  return api<T>(path, body, credential);
}

const UNAVAILABLE =
  "지금은 처리하지 못했어요. 잠시 후 다시 시도해 주세요. 계속 안 되면 판매사에 문의해 주세요.";

/**
 * API 오류의 `type`별 고객 문장(해요체). 다음에 할 일을 함께 쓴다.
 * 원장 거절(`rejected`)은 원장 오류 이름으로 `CUSTOMER_LEDGER_ERRORS`에서 고른다.
 */
const CUSTOMER_MESSAGES: Readonly<
  Record<Exclude<ErrorType, "rejected"> | "offline", string>
> = {
  offline: "서버에 연결하지 못했어요. 연결을 확인하고 화면을 새로 고쳐 주세요.",
  invalid_input:
    "요청을 처리하지 못했어요. 화면을 새로 고친 뒤 다시 시도해 주세요.",
  unauthorized: "접근 코드를 확인해 주세요.",
  forbidden: "지금은 처리하지 못했어요. 계속 안 되면 판매사에 문의해 주세요.",
  not_found: "가입 기록을 찾지 못했어요. 내 가입에서 다시 골라 주세요.",
  rate_limited: "요청이 많아요. 1분 뒤 다시 시도해 주세요.",
  not_ready:
    "지금은 가입할 수 없어요. 판매사가 상품을 준비하고 있어요. 잠시 후 다시 시도해 주세요.",
  needs_diagnosis: "투자성향 진단을 먼저 해 주세요.",
  needs_higher_risk:
    "투자성향에 맞지 않는 상품이에요. 추가 위험을 확인해야 가입할 수 있어요.",
  needs_approval:
    "판매사 관리자 승인이 필요해요. 승인되면 이 화면에서 바로 청약할 수 있어요.",
  needs_recording:
    "이 상품은 가입 과정을 녹취해요. 녹취에 동의해야 가입할 수 있어요.",
  product_changed:
    "상품 설명서가 바뀌었어요. 상품을 다시 골라 새로 가입해 주세요.",
  wrong_state: "가입 상태가 바뀌었어요. 화면에서 지금 상태를 확인해 주세요.",
  limit_reached: UNAVAILABLE,
  pending:
    "요청을 보냈어요. 처리를 확인하는 데 시간이 걸리고 있어요. 잠시 후 다시 시도해 주세요.",
  unavailable: UNAVAILABLE,
};

/**
 * `type` 문장보다 고객에게 더 분명한 `code`별 문장. 여기에 없는 `code`는 `type` 문장을 쓴다.
 * 없는 경로(`ROUTE_NOT_FOUND`)는 가입 기록 문제가 아니므로 일반 문장이다.
 */
const CUSTOMER_CODE_MESSAGES: Readonly<Partial<Record<ErrorCode, string>>> = {
  ROUTE_NOT_FOUND: UNAVAILABLE,
  SALE_ABANDONED: "중단한 가입이에요. 상품을 다시 골라 새로 가입해 주세요.",
  SALE_ALREADY_SUBSCRIBED:
    "이미 청약한 가입이에요. 내 가입에서 지금 상태를 확인해 주세요.",
};

/**
 * 오류를 고객에게 보여 줄 문장으로 바꾼다. API 응답의 `type`으로 고르고, 더 분명한 `code`가 있으면 그 문장을 쓴다.
 * API 문장(`error`)은 보이지 않는다. 모르는 `type`이나 `type`이 없는 응답은 `unavailable` 문장이다.
 * `not_found`(404)는 없는 판매 건으로 안내한다. 없는 경로는 일반 문장이다.
 * 원장·거래·영수증 같은 말과 판매사 콘솔에서만 할 수 있는 안내를 고객에게 보이지 않는다.
 * 화면이 직접 던진 오류(해요체)만 그 문장을 그대로 쓴다.
 */
function customerMessage(error: unknown) {
  if (!(error instanceof ApiError))
    return error instanceof Error && /^[가-힣]/.test(error.message)
      ? error.message
      : UNAVAILABLE;
  const { type, code, ledgerError } = error;
  if (type === "rejected")
    return ledgerError && Object.hasOwn(CUSTOMER_LEDGER_ERRORS, ledgerError)
      ? CUSTOMER_LEDGER_ERRORS[ledgerError]
      : UNAVAILABLE;
  if (code && Object.hasOwn(CUSTOMER_CODE_MESSAGES, code))
    return CUSTOMER_CODE_MESSAGES[code] ?? UNAVAILABLE;
  return type && Object.hasOwn(CUSTOMER_MESSAGES, type)
    ? CUSTOMER_MESSAGES[type]
    : UNAVAILABLE;
}

/**
 * 화면에 보여 줄 오류. 닫기 버튼 없이 지운다: 다음 처리를 시작할 때, 경로가 바뀔 때.
 * 읽기 실패(`load`)는 다음 읽기가 성공해도 지운다. 처리 실패 뒤 바로 다시 읽는 것은 지우지 않는다.
 */
type Failure = { message: string; load?: boolean };

/** 화면이 부르는 처리. 실패하면 오류를 보여 주고 undefined를 돌려준다. */
export type Run = <T>(
  name: string,
  operation?: () => Promise<T>,
) => Promise<T | undefined>;

/**
 * 증권사 앱 예시. 고객이 상품을 고르고, 가입하고, 받은 증명서로 기록을 확인한다.
 * 자료는 모두 FINVERIC API(src/shared의 api())로 읽고 쓴다. 가입 기록 확인만 브라우저가 원장과 바로 대조한다.
 */
export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const verifying = !!matchPath(channel.verify, location.pathname);
  const [failure, setFailure] = useState<Failure>();
  const deploymentConfig = useDeploymentConfig();
  const { deployment, failed: deploymentFailed } = deploymentConfig;
  const [config, setConfig] = useState<ConfigDto>();
  const configRef = useRef<ConfigDto>(undefined);
  const [rules, setRules] = useState<RuleEntryDto[]>([]);
  const [products, setProducts] = useState<ProductEntryDto[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [customer, setCustomer] = useState<CustomerDto>();
  const [load, setLoad] = useState<LoadState>("loading");
  const [draftId, setDraftId] = useState(
    sessionStorage.getItem(DRAFT_KEY) ?? "",
  );
  const [busy, setBusy] = useState("");
  /** 서버가 접근 코드를 거절했을 때 입력 칸 아래에 보여 줄 문장. */
  const [accessError, setAccessError] = useState("");
  /** 접근 코드 입력 칸을 보여 줄지. 저장한 코드가 없거나 서버가 거절했을 때만 보인다. 연결하면 숨긴다. */
  const [needsCode, setNeedsCode] = useState(() => !token());
  const params = new URLSearchParams(location.search);
  const noteAccess = (e: unknown) => {
    const rejected = e instanceof ApiError && e.status === 401;
    if (rejected) setNeedsCode(true);
    // 코드를 넣기 전에는 오류 문장 없이 입력 칸만 보여 준다.
    setAccessError(
      rejected && token() ? "접근 코드를 다시 확인해 주세요." : "",
    );
  };

  const request = useCallback(
    <T,>(path: string, body?: unknown) =>
      (configRef.current?.publicChannel ? publicChannelApi : api)<T>(
        path,
        body,
      ),
    [],
  );
  const reload = useCallback(async () => {
    let current = configRef.current;
    if (!current) {
      current = await api<ConfigDto>("/config");
      if (current.publicChannel)
        current = await publicChannelApi<ConfigDto>("/config");
      configRef.current = current;
      setConfig(current);
    }
    const [newRules, newProducts, newSales, newCustomer] = await Promise.all([
      request<RuleEntryDto[]>("/rules"),
      request<ProductEntryDto[]>("/products"),
      request<SaleDto[]>("/sales"),
      request<CustomerDto>(
        `/customers/${encodeURIComponent(current.demoCustomer.number)}`,
      ),
    ]);
    setRules(newRules);
    setProducts(newProducts);
    setSales(newSales);
    setCustomer(newCustomer);
    setLoad("ready");
    setNeedsCode(false);
    // 읽기에 성공하면 앞선 읽기 실패의 오류를 지운다. 처리 실패의 오류는 그대로 둔다.
    setFailure((current) => (current?.load ? undefined : current));
  }, [request]);
  /** 화면을 막지 않고 다시 읽는다. 승인 대기·숙려 화면이 쓴다. */
  const refresh = useCallback(() => reload().catch(() => undefined), [reload]);
  /**
   * 판매 건 하나만 다시 읽는다. 승인 대기처럼 몇 초마다 확인하는 화면이 쓴다.
   * 전체를 다시 읽으면 요청 4번이라 요청 한도(분당 120번)를 빨리 쓴다.
   */
  const refreshSale = useCallback(
    (id: string) =>
      request<SaleDto>(`/sales/${id}`)
        .then((next) =>
          setSales((list) =>
            list.map((sale) => (sale.id === next.id ? next : sale)),
          ),
        )
        .catch(() => undefined),
    [request],
  );
  useEffect(() => {
    if (verifying) return;
    reload().catch((e: unknown) => {
      // 접근 코드를 아직 넣지 않았으면 오류가 아니다. 입력 칸만 보여 준다.
      if (!(e instanceof ApiError && e.status === 401 && !token()))
        setFailure({ message: customerMessage(e), load: true });
      noteAccess(e);
      // 처음 읽기에 실패하면 빈 화면이 "불러오고 있어요"에 머물지 않게 한다.
      setLoad((current) => (current === "loading" ? "failed" : current));
    });
  }, [reload, verifying]);
  // 관리자 승인은 판매사 콘솔(다른 탭)에서 한다. 이 탭으로 돌아오면 다시 읽는다.
  useEffect(() => {
    if (verifying) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh, verifying]);
  // 화면을 옮기면 앞 화면의 오류를 지운다.
  const route = location.pathname + location.search;
  useEffect(() => {
    setFailure(undefined);
  }, [route]);
  useEffect(() => {
    if (!verifying && deploymentFailed)
      setFailure({ message: DEPLOYMENT_ERROR.customer });
  }, [deploymentFailed, verifying]);

  const run: Run = async (name, operation) => {
    if (busy) return undefined;
    setBusy(name);
    setFailure(undefined);
    try {
      const result = await operation?.();
      await reload();
      setAccessError("");
      return result;
    } catch (e) {
      setFailure({ message: customerMessage(e) });
      noteAccess(e);
      await refresh();
      return undefined;
    } finally {
      setBusy("");
    }
  };
  const setDraft = (id: string) => {
    setDraftId(id);
    if (id) sessionStorage.setItem(DRAFT_KEY, id);
    else sessionStorage.removeItem(DRAFT_KEY);
  };
  const ownSales = sales.filter(
    (sale) => sale.customerRef.toLowerCase() === customer?.ref.toLowerCase(),
  );
  const draft = ownSales.find((sale) => sale.id === draftId);
  const ongoing = ownSales.filter(
    (sale) =>
      sale.status === "subscribed" ||
      (sale.status === "draft" &&
        (sale.approvalRequested ||
          sale.submissionPending ||
          sale.approvedAttempt !== undefined)),
  );
  const activeDraft =
    ongoing.find((sale) => sale.id === draftId) ??
    ongoing.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const preparing = params.has("product");
  const preparation = preparing
    ? findProduct(
        products,
        params.get("product") ?? "",
        Number(params.get("version")),
      )
    : undefined;
  const matchingDraft =
    draft?.productId === preparation?.id &&
    draft?.productVersion === preparation?.version
      ? draft
      : undefined;
  const enrollment = preparing ? matchingDraft : (draft ?? activeDraft);
  const resume = (id: string) => {
    setDraft(id);
    navigate(channel.enroll);
  };
  /**
   * 상품의 가입에 들어간다. 같은 상품의 가입이 진행 중이면 그 단계로 돌아간다.
   * 다른 상품의 청약 전 가입은 replace일 때만 중단한다(화면이 먼저 묻는다). 청약한 가입은 내 가입 기록에 남는다.
   */
  const start = (productId: string, replace = false) => {
    if (activeDraft?.productId.toLowerCase() === productId.toLowerCase())
      return resume(activeDraft.id);
    const product = findProduct(products, productId);
    if (!product) return;
    const prepare = () => {
      setDraft("");
      navigate(enrollPath(product.id, product.version));
    };
    if (activeDraft?.status === "draft" && replace)
      return run("가입을 중단하고 있어요", async () => {
        await request<SaleDto>(`/sales/${activeDraft.id}/action/abandon`, {});
        return true;
      }).then((stopped) => {
        if (stopped) prepare();
      });
    if (activeDraft?.status !== "draft") prepare();
  };
  const openSale = async (
    product: Product,
    intent: NonNullable<OpenSaleRequest["intent"]>,
  ) => {
    if (!customer)
      throw new Error("고객 정보를 새로 불러온 뒤 다시 시도해 주세요.");
    const sale = await request<SaleDto>("/sales", {
      productId: product.id,
      customerNo: customer.number,
      expectedVersion: product.version,
      intent,
    } satisfies OpenSaleRequest);
    // 청약에 실패해도 같은 신청 번호로 다시 시도한다.
    setSales((list) => [...list, sale]);
    setDraft(sale.id);
    return sale;
  };
  const action = (id: string, name: SaleAction, label: string) =>
    run(label, () => request<SaleDto>(`/sales/${id}/action/${name}`, {}));
  const abandon = () => {
    if (!enrollment && preparation) return navigate(fundPath(preparation.id));
    if (enrollment?.status === "draft")
      return run("가입을 중단하고 있어요", async () => {
        await request<SaleDto>(`/sales/${enrollment.id}/action/abandon`, {});
        navigate(fundPath(enrollment.productId));
      });
  };
  // 중단한 가입의 신청 번호는 가입 화면 밖에서 지운다.
  useEffect(() => {
    if (draft?.status === "abandoned" && location.pathname !== channel.enroll) {
      setDraftId("");
      sessionStorage.removeItem(DRAFT_KEY);
    }
  }, [draft?.status, location.pathname]);
  const download = (id: string, kind: ExportKind) =>
    run("파일을 준비하고 있어요", async () => {
      const value = await request<ExportResponse[ExportKind]>(
        `/sales/${id}/export/${kind}`,
      );
      saveFile(value, `finveric-${kind}-${id.slice(0, 10)}.json`);
    });

  // 화면에 표시하는 증권사 이름은 판매 중인 상품의 판매사다.
  const firm =
    latestProducts(products)[0]?.product.document.seller ??
    products[0]?.product.document.seller ??
    "증권사";
  const recordId = params.get("sale") ?? "";
  const header =
    location.pathname === channel.fund
      ? {
          title: "상품 상세",
          back: { to: channel.catalog, label: "상품 목록으로" },
        }
      : location.pathname === channel.enroll
        ? { title: "가입" }
        : location.pathname === channel.records && recordId
          ? {
              title: "가입 기록",
              back: { to: channel.records, label: "가입 기록 목록으로" },
            }
          : {};
  return (
    <Frame
      firm={firm}
      {...header}
      network={{
        tone: deployment ? "success" : "warning",
        text:
          verifying && deploymentFailed
            ? "연결 확인 필요"
            : networkName(deployment),
      }}
      error={verifying ? undefined : failure?.message}
    >
      {!verifying &&
        config?.requiresToken &&
        !config.publicChannel &&
        needsCode && (
          <AccessCodeForm
            connect={() => void run("연결하고 있어요", reload)}
            busy={!!busy}
            error={accessError}
            emptyMessage="접근 코드를 입력해 주세요."
          />
        )}
      <Routes>
        <Route
          path={channel.catalog}
          element={
            <Catalog
              load={load}
              products={products}
              activeDraft={activeDraft}
              busy={busy}
              start={start}
              resume={resume}
            />
          }
        />
        <Route
          path={channel.fund}
          element={
            <ProductDetail
              load={load}
              product={findProduct(products, params.get("product") ?? "")}
              products={products}
              activeDraft={activeDraft}
              busy={busy}
              start={start}
            />
          }
        />
        <Route
          path={channel.enroll}
          element={
            !enrollment && !preparation && load === "ready" ? (
              <Navigate to={channel.catalog} replace />
            ) : (
              <Enrollment
                key={
                  preparation
                    ? `${preparation.id}:${preparation.version}`
                    : (enrollment?.id ?? "empty")
                }
                load={load}
                sale={enrollment}
                preparation={preparation}
                rules={rules}
                products={products}
                customer={customer}
                deployment={config?.deployment}
                busy={busy}
                run={run}
                request={request}
                openSale={openSale}
                action={action}
                abandon={abandon}
                refresh={refresh}
                refreshSale={refreshSale}
                download={download}
                finish={() => setDraft("")}
              />
            )
          }
        />
        <Route
          path={channel.records}
          element={
            <Records
              load={load}
              sales={ownSales}
              activeDraft={activeDraft}
              products={products}
              customer={customer}
              selected={recordId}
              busy={busy}
              download={download}
              resume={resume}
            />
          }
        />
        <Route
          path={channel.verify}
          element={
            <CustomerVerify
              key={params.get("sale") ?? ""}
              config={deploymentConfig}
              initialId={params.get("sale") ?? ""}
            />
          }
        />
        <Route
          path="*"
          element={
            <Heading
              title="화면을 찾을 수 없어요"
              description="아래 메뉴에서 화면을 다시 골라 주세요."
            >
              <Button asChild>
                <Link to={channel.catalog}>상품 보러 가기</Link>
              </Button>
            </Heading>
          }
        />
      </Routes>
    </Frame>
  );
}
