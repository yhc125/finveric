import { matchPath, Navigate, Route, Routes, useLocation } from "react-router";
import {
  FileDown,
  LayoutDashboard,
  ListChecks,
  Package,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Badge, Heading } from "../shared/components.tsx";
import { useDeploymentConfig } from "../shared/deployment.ts";
import { networkName } from "../shared/format.ts";
import { Shell, type NavGroup } from "../shared/Shell.tsx";
import { LedgerTools } from "./components.tsx";
import { Dashboard } from "./screens/Dashboard.tsx";
import { Disputes } from "./screens/Disputes.tsx";
import { Products } from "./screens/Products.tsx";
import { Report } from "./screens/Report.tsx";
import { Rules } from "./screens/Rules.tsx";
import { Signals } from "./screens/Signals.tsx";
import { useLedger } from "./useLedger.ts";

/** 감독기관 화면(B2G). 모든 원장 기록은 지정 RPC에서 읽는다. 판매사 API에는 GET만 보낸다. */
const PAGES: {
  path: string;
  label: string;
  icon: LucideIcon;
  description?: string;
}[] = [
  { path: "/", label: "대시보드", icon: LayoutDashboard },
  {
    path: "/disputes",
    label: "분쟁 조회",
    icon: ShieldCheck,
    description:
      "판매 기록을 대조하거나 고객의 진단·판매 이력을 조회할 수 있습니다.",
  },
  { path: "/rules", label: "기준 감사", icon: ListChecks },
  { path: "/products", label: "상품 감사", icon: Package },
  { path: "/signals", label: "위험 신호", icon: TriangleAlert },
  {
    path: "/report",
    label: "보고서",
    icon: FileDown,
    description: "판매 기록 대조 결과를 JSON 또는 CSV로 내려받을 수 있습니다.",
  },
];
const groups: NavGroup[] = [{ label: "감독기관", items: PAGES }];

/**
 * 감독기관 화면의 오류는 각 화면이 해당 영역에 표시한다.
 * 화면의 오류는 다음 대조·다시 읽기를 시작할 때, 경로가 바뀌어 화면이 바뀔 때 사라진다.
 */
export function App() {
  const location = useLocation();
  const config = useDeploymentConfig();
  const { deployment } = config;
  const ledger = useLedger(config);
  const params = new URLSearchParams(location.search);
  // 이전 분쟁 조회 주소(/?sale=…, /?source=file)는 분쟁 조회로 보낸다.
  const legacy =
    location.pathname === "/" && (params.has("sale") || params.has("source"));
  const legacyReport = location.pathname === "/report" && !!params.get("sale");
  const path = legacy || legacyReport ? "/disputes" : location.pathname;
  const page = PAGES.find((entry) => matchPath(entry.path, path)) ?? PAGES[0];
  return (
    <Shell
      home="/"
      entryHref="/"
      groups={groups}
      app="감독기관"
      title={page.label}
    >
      <Heading title={page.label} description={page.description}>
        <Badge
          tone={
            deployment && !ledger.needsConfiguration ? "success" : "warning"
          }
        >
          {ledger.needsConfiguration
            ? "원장 설정 확인 필요"
            : networkName(deployment)}
        </Badge>
        <LedgerTools ledger={ledger} />
      </Heading>
      <Routes>
        <Route
          path="/"
          element={
            legacy ? (
              <Navigate to={`/disputes${location.search}`} replace />
            ) : (
              <Dashboard deployment={deployment} ledger={ledger} />
            )
          }
        />
        <Route
          path="/disputes"
          element={
            <Disputes
              deployment={deployment}
              ledger={ledger}
              search={location.search}
            />
          }
        />
        <Route path="/rules" element={<Rules ledger={ledger} />} />
        <Route path="/products" element={<Products ledger={ledger} />} />
        <Route path="/signals" element={<Signals ledger={ledger} />} />
        <Route
          path="/report"
          element={
            legacyReport ? (
              <Navigate to={`/disputes${location.search}`} replace />
            ) : (
              <Report deployment={deployment} ledger={ledger} />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
