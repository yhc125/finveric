import Fastify, { type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import { createHmac, timingSafeEqual } from "node:crypto";
import { json } from "@finveric/core";
import {
  API_KEY_PREFIX,
  DEMO_SESSION_PREFIX,
  type CustomerParams,
  type ErrorResponse,
  type OpenSaleRequest,
} from "@finveric/core/api";
import { ERROR_CODES, errorBody, type ErrorCode } from "@finveric/core/errors";
import { openApiOptions } from "./docs/openapi.ts";
import { channelErrorBody, CodedError } from "./errors.ts";
import { CHANNEL_TAG, tagOf } from "./docs/operations.ts";
import { FundService } from "./service.ts";
import { customerRoutes } from "./routes/customers.ts";
import { keyRoutes } from "./routes/keys.ts";
import { recordRoutes } from "./routes/records.ts";
import { registryRoutes } from "./routes/registry.ts";
import { saleRoutes } from "./routes/sales.ts";
import { systemRoutes } from "./routes/system.ts";

/** 로컬 Vite 개발 서버. 웹 한 서버가 5173 포트를 쓴다. */
const DEV_ORIGINS = [5173].flatMap((port) => [
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
]);
const configuredOrigins = (env: NodeJS.ProcessEnv) =>
  (env.WEB_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
/** POST를 받을 출처. WEB_ORIGIN은 쉼표로 여러 개를 지정할 수 있다. */
export function allowedOrigins(env: NodeJS.ProcessEnv = process.env) {
  return [...configuredOrigins(env), ...DEV_ORIGINS];
}
/** 다른 도메인의 웹을 허용하는 CORS 목록. WEB_ORIGIN을 지정하면 그 출처만 허용한다. */
export function corsOrigins(env: NodeJS.ProcessEnv = process.env) {
  const configured = configuredOrigins(env);
  return configured.length ? configured : DEV_ORIGINS;
}
const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.split(",")[0]?.trim();
/** 웹과 API를 같은 도메인에 배포하면 요청 출처가 API 주소와 같다. Vercel 프리뷰 주소도 여기에 해당한다. */
export function sameSiteOrigin(headers: Record<string, unknown>) {
  const host =
    first(headers["x-forwarded-host"] as string | undefined) ??
    first(headers.host as string | undefined);
  const proto = first(headers["x-forwarded-proto"] as string | undefined);
  return host ? `${proto ?? "http"}://${host}` : undefined;
}
/** 경로 밖에서 정하는 오류(접근 검사, Fastify·플러그인의 4xx, 없는 경로)를 보낸다. 상태는 `code`의 상태다. */
const fail = (reply: FastifyReply, code: ErrorCode) =>
  reply.code(ERROR_CODES[code].status).send(errorBody(code));
/** `Authorization: Bearer <값>`의 값. 접근 코드나 API 키다. */
const bearer = (headers: { authorization?: string }) =>
  (headers.authorization ?? "").replace(/^Bearer /, "");
const DEMO_SESSION = new RegExp(
  `^${DEMO_SESSION_PREFIX}[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`,
);
/** 공개 시연으로 쓸 수 있는 기능. 판매 ID의 소유자는 저장소를 읽은 뒤 확인한다. */
const DEMO_ROUTES = new Set([
  "GET /api/rules",
  "GET /api/products",
  "GET /api/customers/:customerNo",
  "POST /api/customers/:customerNo/diagnose",
  "GET /api/sales",
  "POST /api/sales",
  "GET /api/sales/:id",
  "GET /api/sales/:id/export/receipt",
  "GET /api/sales/:id/export/original",
  "POST /api/sales/:id/action/abandon",
  "POST /api/sales/:id/action/subscribe",
  "POST /api/sales/:id/action/confirm",
  "POST /api/sales/:id/action/withdraw",
]);
declare module "fastify" {
  interface FastifyRequest {
    demoCustomerNo?: string;
    channelKey: boolean;
  }
}
/** 접근 코드 없이 여는 경로: 상태 확인, 검증 설정, API 문서. */
export const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  "/api/health",
  "/api/config",
  "/api/openapi.json",
  "/api/docs",
]);
export async function createApp(service = new FundService()) {
  const app = Fastify({
    logger: false,
    bodyLimit: 64 * 1024,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });
  const token = process.env.DEMO_TOKEN;
  const publicChannel = process.env.FINVERIC_PUBLIC_CHANNEL === "1";
  if (token && token.length < 32)
    throw new Error("DEMO_TOKEN을 정하면 32자 이상이어야 합니다.");
  const origins = allowedOrigins();
  await app.register(cors, { origin: corsOrigins(), methods: ["GET", "POST"] });
  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    // API 키로 부르면 키마다 센다. 키가 없거나 모르는 키면 IP마다 센다.
    keyGenerator: (req) => {
      const supplied = bearer(req.headers);
      const id = supplied.startsWith(API_KEY_PREFIX)
        ? service.knownApiKeyId(supplied)
        : undefined;
      return id ? `key:${id}` : req.ip;
    },
  });
  // 경로보다 먼저 등록한다. 이후에 등록한 경로로 /api/openapi.json을 만든다.
  await app.register(swagger, openApiOptions(PUBLIC_PATHS, "integration"));
  await app.register(swagger, openApiOptions(PUBLIC_PATHS, "internal"));
  app.decorateRequest("demoCustomerNo");
  app.decorateRequest("channelKey", false);
  app.addHook("preHandler", async (req, reply) => {
    const url = req.routeOptions.url ?? "";
    const supplied = bearer(req.headers);
    if (publicChannel && DEMO_SESSION.test(supplied)) {
      // 고객 번호나 원장의 가명 ID만 알아도 다른 탭의 세션을 만들 수 없게 한다.
      const digest = createHmac("sha256", service.env.customerRefSecret)
        .update(supplied)
        .digest("hex");
      req.demoCustomerNo = `D-${digest.slice(0, 30)}`;
    }
    if (PUBLIC_PATHS.has(url) || req.method === "OPTIONS") return;
    if (req.demoCustomerNo) {
      if (!DEMO_ROUTES.has(`${req.method} ${url}`))
        return fail(reply, "DEMO_SCOPE_DENIED");
      const customerNo =
        (req.params as Partial<CustomerParams> | undefined)?.customerNo ??
        (url === "/api/sales" && req.method === "POST"
          ? (req.body as OpenSaleRequest).customerNo
          : req.demoCustomerNo);
      if (req.demoCustomerNo !== customerNo)
        return fail(reply, "DEMO_SCOPE_DENIED");
    } else if (supplied.startsWith(API_KEY_PREFIX)) {
      // API 키: 증권사 앱 서버가 쓴다. 접근 코드 설정과 관계없이 항상 확인한다.
      if (!(await service.authenticateApiKey(supplied)))
        return fail(reply, "API_KEY_INVALID");
      if (url && tagOf(req.method, url) !== CHANNEL_TAG)
        return fail(reply, "API_KEY_SCOPE_DENIED");
      req.channelKey = true;
    } else if (token) {
      // 접근 코드로 판매사 콘솔을 쓴다. 공개 시연을 끄면 증권사 앱 예시도 쓴다.
      const given = Buffer.from(supplied);
      const expected = Buffer.from(token);
      if (given.length !== expected.length || !timingSafeEqual(given, expected))
        return fail(reply, "ACCESS_CODE_INVALID");
    } else if (publicChannel && url === "/api/sales/:id/export/original") {
      // 공개 시연의 원본은 판매 건을 만든 브라우저 세션에서 제공한다.
      return fail(reply, "DEMO_SCOPE_DENIED");
    }
    if (
      req.method === "POST" &&
      req.headers.origin &&
      req.headers.origin !== sameSiteOrigin(req.headers) &&
      !origins.includes(req.headers.origin)
    )
      return fail(reply, "ORIGIN_NOT_ALLOWED");
  });
  app.setSerializerCompiler(() => (value) => json(value));
  app.addHook("preSerialization", async (_req, _reply, payload) =>
    JSON.parse(json(payload)),
  );
  app.setErrorHandler((error, req, reply) => {
    if (error && typeof error === "object" && "validation" in error)
      return fail(reply, "INVALID_REQUEST");
    // Fastify와 플러그인이 정한 4xx(잘못된 JSON 400, 본문 초과 413, 본문 형식 415, 요청 한도 429)는 상태 코드를 유지한다.
    const status = (error as { statusCode?: number } | undefined)?.statusCode;
    if (status && status >= 400 && status < 500)
      return reply
        .code(status)
        .send(
          errorBody(
            status === 429
              ? "RATE_LIMITED"
              : status === 413
                ? "BODY_TOO_LARGE"
                : status === 415
                  ? "UNSUPPORTED_MEDIA_TYPE"
                  : "INVALID_REQUEST",
          ),
        );
    const message = error instanceof Error ? error.message : "";
    // Errors from RPC providers may contain credential-bearing URLs. Only return our authored messages.
    const authored = /^[가-힣]/.test(message) && !message.includes("http");
    // 모든 오류 응답에 type과 code가 있다. 모듈은 CodedError를 던진다.
    // code가 없는 오류는 INTERNAL_ERROR다. 우리가 쓴 문장이면 그 문장을 보낸다.
    const useApiKey = bearer(req.headers).startsWith(API_KEY_PREFIX);
    const body: ErrorResponse = useApiKey
      ? channelErrorBody(
          error instanceof CodedError ? error.code : "INTERNAL_ERROR",
        )
      : !authored
        ? errorBody("INTERNAL_ERROR")
        : error instanceof CodedError
          ? error.body
          : { ...errorBody("INTERNAL_ERROR"), error: message };
    // 상태는 type으로 정한다(`ERROR_CODES`의 status). 값 검사 오류 400, 없는 대상 404, 나머지 업무 오류와 처리 실패 409.
    reply.code(ERROR_CODES[body.code].status).send(body);
  });
  app.setNotFoundHandler((_req, reply) => fail(reply, "ROUTE_NOT_FOUND"));
  // 경로는 업무별 플러그인이다. 모두 /api 아래에 등록한다.
  // 위에서 등록한 훅(접근 코드·출처 검사), 직렬화, 오류 처리를 플러그인이 물려받는다.
  await app.register(systemRoutes, {
    prefix: "/api",
    service,
    requiresToken: !!token,
    publicChannel,
  });
  for (const routes of [
    registryRoutes,
    customerRoutes,
    saleRoutes,
    recordRoutes,
    keyRoutes,
  ])
    await app.register(routes, { prefix: "/api", service });
  return app;
}
