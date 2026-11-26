import { test } from "node:test";
import assert from "node:assert/strict";
import { PUBLIC_PATHS } from "../apps/api/src/app.ts";
import { offlineApp } from "./offline-app.ts";
import { responseChecker } from "./openapi-check.ts";
import {
  CHANNEL_TAG,
  OPERATIONS,
  TAGS,
} from "../apps/api/src/docs/operations.ts";
import {
  ERROR_CODES,
  ERROR_TYPES,
  errorBody,
  LEDGER_ERROR_CODES,
  type ErrorCode,
  type ErrorType,
} from "@finveric/core/errors";
import { LEDGER_ERRORS, type LedgerError } from "@finveric/core";

/** 해요체 끝맺음. API 오류 문장은 합니다체(지시는 "-세요")로 쓴다. */
const HAEYO = /(어|아|에|해|예|워|돼|봐)요[.?!]|주세요/;

test("검토 사유는 정해진 코드만 받고 기존 빈 승인 요청도 허용한다", async (t) => {
  const app = await offlineApp(t);
  const approveUrl = "/api/sales/1/action/approve";
  await app.ready();
  const spec = app.internalSwagger() as any;
  assert.equal(
    spec.paths["/api/sales/{id}/action/approve"].post.requestBody.required,
    false,
  );
  for (const payload of [
    { reason: "고객 개인정보가 담긴 자유문" },
    { reason: "correction_reviewed", memo: "자유문" },
    { reviewBasis: ["unknown"] },
    { reviewBasis: ["diagnosis_history", "diagnosis_history"] },
    { reviewBasis: [] },
  ]) {
    const response = await app.inject({
      method: "POST",
      url: approveUrl,
      payload,
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().code, "INVALID_REQUEST");
    assert.doesNotMatch(response.body, /고객 개인정보|자유문/);
  }
  for (const payload of [
    undefined,
    {},
    { reason: "correction_reviewed", reviewBasis: ["diagnosis_history"] },
  ]) {
    const response = await app.inject({
      method: "POST",
      url: approveUrl,
      ...(payload ? { payload } : {}),
    });
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(response.json().code, "SALE_NOT_FOUND");
  }
  const response = await app.inject({
    method: "POST",
    url: "/api/customers/customer-1/diagnose",
    payload: {
      answers: [1],
      reassessmentReason: "고객 개인정보가 담긴 자유문",
    },
  });
  assert.equal(response.statusCode, 400, response.body);
  assert.doesNotMatch(response.body, /고객 개인정보/);
});

/** printRoutes 결과에서 `METHOD /경로` 목록을 만든다. HEAD·OPTIONS는 Fastify와 CORS가 만든 경로다. */
function registeredRoutes(tree: string) {
  const routes: string[] = [];
  const stack: string[] = [];
  for (const line of tree.split("\n")) {
    const match = /^((?:│ {3}| {4})*)(?:├── |└── )(\S+)(?: \(([^)]+)\))?$/.exec(
      line,
    );
    if (!match) continue;
    const depth = match[1].length / 4;
    stack.length = depth;
    const path = (stack[depth - 1] ?? "") + match[2];
    stack.push(path);
    for (const method of match[3]?.split(", ") ?? [])
      if (method !== "HEAD" && method !== "OPTIONS")
        routes.push(`${method} ${path}`);
  }
  return routes;
}

test("공개 OpenAPI는 판매 채널 연동 경로와 API 키 인증만 설명한다", async (t) => {
  const app = await offlineApp(t);
  const response = await app.inject({ url: "/api/openapi.json" });
  assert.equal(response.statusCode, 200, response.body);
  assert.match(response.headers["content-type"] as string, /application\/json/);
  const spec = response.json();
  assert.match(spec.openapi, /^3\.1\.\d+$/);
  assert.match(spec.info.version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(
    spec.servers.map((server: { url: string }) => server.url),
    ["https://finveric.vercel.app"],
  );
  assert.match(spec.info.description, /샌드박스/);
  assert.match(spec.info.description, /연동 순서/);
  assert.deepEqual(
    spec.tags.map((tag: { name: string }) => tag.name),
    [CHANNEL_TAG],
  );
  assert.deepEqual(Object.keys(spec.components.securitySchemes), ["apiKey"]);
  const visible = Object.entries<Record<string, any>>(spec.paths).flatMap(
    ([path, item]) =>
      Object.entries(item).map(([method, operation]) => {
        assert.deepEqual(operation.security, [{ apiKey: [] }]);
        return `${method.toUpperCase()} ${path.replace(/\{(\w+)\}/g, ":$1")}`;
      }),
  );
  assert.deepEqual(
    visible.sort(),
    [
      "GET /api/rules",
      "GET /api/products",
      "GET /api/customers/:customerNo",
      "POST /api/customers/:customerNo/diagnose",
      "POST /api/sales",
      "GET /api/sales/:id",
      "POST /api/sales/:id/action/subscribe",
      "POST /api/sales/:id/action/confirm",
      "POST /api/sales/:id/action/withdraw",
      "POST /api/sales/:id/action/abandon",
      "GET /api/sales/:id/export/receipt",
    ].sort(),
  );
  assert.doesNotMatch(
    JSON.stringify(spec),
    /approveSale|simulateTamper|listApiKeys|issueApiKey|revokeApiKey|SIGNALS_UNAVAILABLE|DEMO_SCOPE_DENIED|ACCESS_CODE_INVALID|STORE_LOCK|Upstash|Vercel|OriginalBundle|demoCustomer/,
  );
  const schemas = spec.components.schemas;
  assert.equal(schemas.ApiKey, undefined);
  assert.equal(schemas.ChainSale, undefined);
  assert.equal(schemas.Trace, undefined);
  for (const field of ["traces", "chain", "settled"])
    assert.equal(schemas.ChannelSale.properties[field], undefined);
  const receipt = spec.paths["/api/sales/{id}/export/receipt"].get;
  assert.equal(
    receipt.responses[200].content["application/json"].schema.$ref,
    "#/components/schemas/EvidenceReceipt",
  );
});

test("내부 OpenAPI가 등록한 모든 경로를 분류와 operationId로 설명한다", async (t) => {
  const app = await offlineApp(t);
  await app.ready();
  const spec = app.internalSwagger() as any;

  assert.match(spec.openapi, /^3\.1\.\d+$/);
  assert.equal(spec.info.title, "FINVERIC API");
  assert.ok(spec.info.version);
  assert.deepEqual(
    spec.servers.map((s: { url: string }) => s.url),
    ["/"],
  );
  const tagNames = TAGS.map((tag) => tag.name);
  assert.deepEqual(
    spec.tags.map((tag: { name: string }) => tag.name),
    tagNames,
  );
  assert.deepEqual(spec.components.securitySchemes.accessCode, {
    type: "http",
    scheme: "bearer",
    description: spec.components.securitySchemes.accessCode.description,
  });

  const documented = new Map<string, any>();
  for (const [path, item] of Object.entries<Record<string, any>>(spec.paths))
    for (const [method, op] of Object.entries(item))
      documented.set(
        `${method.toUpperCase()} ${path.replace(/\{(\w+)\}/g, ":$1")}`,
        op,
      );

  // 등록한 경로 = 문서의 경로 = operations.ts의 항목.
  const routes = registeredRoutes(app.printRoutes({ commonPrefix: false }));
  assert.ok(routes.length >= 20, routes.join("\n"));
  assert.deepEqual([...documented.keys()].sort(), [...routes].sort());
  assert.deepEqual(Object.keys(OPERATIONS).sort(), [...routes].sort());

  const ids = new Set<string>();
  const refs: string[] = [];
  JSON.stringify(spec, (key, value) => {
    if (key === "$ref") refs.push(value);
    return value;
  });
  for (const ref of refs) {
    const target = ref
      .replace(/^#\//, "")
      .split("/")
      .reduce((node: any, part) => node?.[part], spec);
    assert.ok(target, `풀리지 않는 $ref: ${ref}`);
  }
  for (const [key, op] of documented) {
    assert.ok(op.operationId, key);
    assert.ok(!ids.has(op.operationId), `operationId 중복: ${op.operationId}`);
    ids.add(op.operationId);
    assert.equal(op.tags.length, 1, key);
    assert.ok(tagNames.includes(op.tags[0]), `${key}: ${op.tags[0]}`);
    assert.match(op.summary, /[가-힣]/, key);
    assert.match(op.description, /[가-힣]/, key);
    const success = Object.keys(op.responses).filter((code) =>
      code.startsWith("2"),
    );
    assert.ok(success.length, `${key}: 성공 응답 없음`);
    for (const code of success)
      assert.ok(op.responses[code].content, `${key} ${code}: 응답 스키마 없음`);
    const path = key.split(" ")[1];
    const channel = op.tags[0] === "판매 채널 연동";
    if (PUBLIC_PATHS.has(path)) assert.deepEqual(op.security, [], key);
    else {
      // 판매 채널 연동 API만 API 키를 받는다.
      assert.deepEqual(
        op.security,
        channel ? [{ accessCode: [] }, { apiKey: [] }] : [{ accessCode: [] }],
        key,
      );
      assert.ok(op.responses[401], `${key}: 401 없음`);
    }
    if ((key.startsWith("POST ") || !channel) && !PUBLIC_PATHS.has(path))
      assert.ok(op.responses[403], `${key}: 403 없음`);
    if (op.requestBody) {
      const body = op.requestBody.content["application/json"];
      assert.ok(body.schema.properties, `${key}: 요청 스키마 없음`);
      assert.ok(body.example, `${key}: 요청 예시 없음`);
      assert.ok(op.responses[400], `${key}: 400 없음`);
    }
  }
  // 요청 스키마는 core의 스키마에서 온다(같은 제약이 문서에 있다).
  assert.equal(
    documented.get("POST /api/customers/:customerNo/diagnose").requestBody
      .content["application/json"].schema.properties.answers.items.maximum,
    4,
  );
  assert.equal(
    documented.get("GET /api/sales/:id").parameters[0].schema.pattern,
    "^[1-9][0-9]{0,76}$",
  );
  assert.equal(
    documented.get("GET /api/health").responses[503].content["application/json"]
      .schema.$ref,
    "#/components/schemas/Health",
  );
  assert.equal(
    documented.get("GET /api/sales/:id").responses[200].content[
      "application/json"
    ].schema.$ref,
    "#/components/schemas/Sale",
  );
  // 모든 오류 응답에 type과 code가 있다. 둘 다 core의 목록에서 고른다.
  const errorSchema = spec.components.schemas.Error;
  assert.deepEqual(errorSchema.required, ["error", "type", "code"]);
  assert.deepEqual(errorSchema.properties.type.enum, Object.keys(ERROR_TYPES));
  assert.deepEqual(errorSchema.properties.code.enum, Object.keys(ERROR_CODES));
  // 경로마다 오류 응답은 그 경로의 code(x-errors)에서 만든다. 예시는 그 상태의 첫 code다.
  const confirm = documented.get("POST /api/sales/:id/action/confirm");
  assert.equal(
    confirm.responses[409].content["application/json"].schema.$ref,
    "#/components/schemas/Error",
  );
  assert.deepEqual(
    confirm.responses[409].content["application/json"].example,
    errorBody("LEDGER_TOO_EARLY"),
  );
  for (const [key, op] of documented) {
    const codes: ErrorCode[] = op["x-errors"];
    assert.ok(Array.isArray(codes), `${key}: x-errors 없음`);
    assert.equal(new Set(codes).size, codes.length, `${key}: code 중복`);
    const statuses = new Set(codes.map((code) => ERROR_CODES[code].status));
    for (const [status, response] of Object.entries<any>(op.responses)) {
      if (Number(status) < 400 || op.operationId === "getHealth") continue;
      assert.ok(statuses.has(Number(status)), `${key} ${status}: code 없음`);
      const example = response.content["application/json"].example;
      assert.equal(
        ERROR_CODES[example.code as ErrorCode].status,
        Number(status),
      );
      assert.ok(codes.includes(example.code), `${key} ${status}: 예시 code`);
      assert.deepEqual(example, errorBody(example.code), `${key} ${status}`);
      for (const code of codes.filter(
        (c) => ERROR_CODES[c].status === Number(status),
      ))
        assert.ok(
          response.description.includes(`\`${code}\``),
          `${key} ${status}: 설명에 ${code} 없음`,
        );
    }
    for (const status of statuses)
      assert.ok(op.responses[status], `${key}: ${status} 응답 없음`);
  }
  for (const type of Object.keys(ERROR_TYPES) as ErrorType[])
    assert.ok(
      spec.info.description.includes(
        `\`${type}\` (${ERROR_TYPES[type].status.join("·")})`,
      ),
      `API 설명에 ${type} 없음`,
    );
  for (const code of Object.keys(ERROR_CODES))
    assert.ok(
      spec.info.description.includes(`\`${code}\``),
      `API 설명에 ${code} 없음`,
    );
  // 문서 화면의 오류 코드 표는 x- 확장에서 읽는다. core의 표와 같아야 한다.
  assert.deepEqual(
    spec["x-error-types"],
    (Object.keys(ERROR_TYPES) as ErrorType[]).map((type) => ({
      type,
      status: [...ERROR_TYPES[type].status],
      meaning: ERROR_TYPES[type].meaning,
      action: ERROR_TYPES[type].action,
    })),
  );
  assert.deepEqual(
    spec["x-error-codes"],
    (Object.keys(ERROR_CODES) as ErrorCode[]).map((code) => ({
      code,
      ...ERROR_CODES[code],
    })),
  );
  assert.deepEqual(
    spec["x-ledger-errors"],
    (Object.keys(LEDGER_ERRORS) as LedgerError[]).map((name) => ({
      name,
      code: LEDGER_ERROR_CODES[name],
      meaning: LEDGER_ERRORS[name],
    })),
  );
  for (const { type, meaning, action } of spec["x-error-types"]) {
    for (const text of [meaning, action]) {
      assert.match(text, /[가-힣]/, type);
      assert.doesNotMatch(text, HAEYO, type);
    }
    assert.match(action, /다\.$/, `${type}: 다음 행동은 문장으로 끝난다`);
  }
  // code의 문장은 원인과 다음 행동(합니다체, 지시는 "-세요")이다. 설명은 문장으로 끝난다.
  for (const { code, message, description } of spec["x-error-codes"]) {
    for (const text of [message, description]) {
      assert.match(text, /[가-힣]/, code);
      assert.doesNotMatch(text, HAEYO, code);
    }
    // 오류 처리기는 한글로 시작하는 문장만 그대로 보낸다(app.ts).
    assert.match(message, /^[가-힣]/, `${code}: 한글로 시작`);
    assert.match(message, /(다|세요)\.$/, `${code}: 문장`);
    assert.ok(message.split(". ").length >= 2, `${code}: 원인과 다음 행동`);
    assert.match(description, /다\.$/, `${code}: 설명`);
  }
});

test("성공 응답 예시는 응답 스키마와 맞고, 판매 건 예시는 설명에 적은 상태다", async (t) => {
  const app = await offlineApp(t);
  await app.ready();
  const spec = app.internalSwagger() as any;
  const docs = responseChecker(spec);
  const sales: string[] = [];
  for (const [path, item] of Object.entries<any>(spec.paths))
    for (const [method, op] of Object.entries<any>(item))
      for (const [status, response] of Object.entries<any>(op.responses)) {
        const media = response.content?.["application/json"];
        if (Number(status) >= 300 || media?.example === undefined) continue;
        // 문서에 없는 필드가 있어도 실패한다(openapi-check.ts).
        docs.check(method, path, Number(status), media.example);
        if (media.schema.$ref !== "#/components/schemas/Sale") continue;
        // 문서 화면은 예시가 없으면 스키마의 첫 값(draft)을 보여 준다. 판매 건 응답은 모두 예시가 있어야 한다.
        const expected = /status: (\w+)/.exec(response.description)?.[1];
        assert.ok(expected, `${op.operationId}: 설명에 status 없음`);
        assert.equal(media.example.status, expected, op.operationId);
        sales.push(op.operationId);
      }
  const saleResponses = Object.values<any>(spec.paths).flatMap((item) =>
    Object.values<any>(item).filter(
      (op) =>
        op.responses[200]?.content?.["application/json"]?.schema.$ref ===
        "#/components/schemas/Sale",
    ),
  );
  assert.equal(sales.length, saleResponses.length);
  assert.ok(sales.length >= 8, sales.join(", "));
});

test("오류 code는 이름이 하나뿐이고, 공통 오류이거나 어떤 경로의 문서에 있다", async (t) => {
  const app = await offlineApp(t);
  await app.ready();
  const spec = app.internalSwagger() as any;
  const codes = Object.keys(ERROR_CODES) as ErrorCode[];
  for (const code of codes)
    assert.match(code, /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/, code);
  assert.equal(new Set(codes).size, codes.length);
  // 원장 거절은 LEDGER_ + 원장 오류 이름(대문자 밑줄 표기)이다.
  for (const name of Object.keys(LEDGER_ERRORS) as LedgerError[]) {
    const code = LEDGER_ERROR_CODES[name];
    assert.equal(
      code,
      `LEDGER_${name.replace(/(?<!^)([A-Z])/g, "_$1").toUpperCase()}`,
    );
    assert.equal(ERROR_CODES[code].type, "rejected");
    assert.equal(ERROR_CODES[code].ledgerError, name);
    assert.deepEqual(errorBody(code).ledgerError, name);
  }
  assert.equal(errorBody("LEDGER_REJECTED").ledgerError, undefined);
  // 상태는 type의 기본 상태다. 413, 415, 503만 type의 다른 상태를 쓴다.
  for (const code of codes) {
    const { type, status } = ERROR_CODES[code];
    assert.ok(
      (ERROR_TYPES[type].status as readonly number[]).includes(status),
      `${code}: ${type}에 없는 상태 ${status}`,
    );
  }
  const documented = new Set<string>();
  for (const item of Object.values<Record<string, any>>(spec.paths))
    for (const op of Object.values<any>(item))
      for (const code of op["x-errors"]) documented.add(code);
  for (const code of codes)
    assert.ok(
      ERROR_CODES[code].common || documented.has(code),
      `${code}: 어느 경로의 문서에도 없고 공통 오류도 아니다`,
    );
  // 경로만의 오류 목록(operations.ts)에는 공통 오류를 적지 않는다. 문서 생성이 더한다.
  for (const [key, operation] of Object.entries(OPERATIONS))
    for (const code of operation.errors ?? [])
      assert.ok(!ERROR_CODES[code].common, `${key}: 공통 오류 ${code}`);
  // detail은 기본 문장 뒤에 붙는다.
  assert.equal(
    errorBody("RULE_DOCUMENT_INVALID", "기준 이름을 쓰세요.").error,
    `${ERROR_CODES.RULE_DOCUMENT_INVALID.message} 기준 이름을 쓰세요.`,
  );
});

test("API 문서 화면은 외부 파일 없이 한 HTML로 열린다", async (t) => {
  const app = await offlineApp(t);
  const page = await app.inject({ url: "/api/docs" });
  assert.equal(page.statusCode, 200);
  assert.match(page.headers["content-type"] as string, /^text\/html/);
  assert.match(page.body, /^<!doctype html>/);
  assert.match(page.body, /<html lang="ko">/);
  assert.match(page.body, /fetch\("openapi\.json"/);
  // 외부 스크립트·스타일·글꼴을 읽지 않는다.
  assert.doesNotMatch(page.body, /<(script|link|img)[^>]+(src|href)=/);
  assert.doesNotMatch(page.body, /https?:\/\//);
  // 화면 문구에 시연·모의·테스트용을 쓰지 않는다(DESIGN.md). 데이터는 문서에서 읽는다.
  assert.doesNotMatch(page.body, /시연|모의|테스트용/);
  // 오류 코드 표와 경로별 오류 표는 x- 확장으로 그린다. 요청 예시는 인증 값을 환경 변수에서 읽는다.
  assert.match(page.body, /x-error-types/);
  assert.match(page.body, /x-error-codes/);
  assert.match(page.body, /x-ledger-errors/);
  assert.match(page.body, /x-errors/);
  assert.match(page.body, /FINVERIC_API_KEY/);
  assert.doesNotMatch(page.body, /FINVERIC_ACCESS_CODE/);
});

test("접근 코드를 설정해도 상태 확인·설정·API 문서는 열리고 나머지는 401이다", async (t) => {
  process.env.DEMO_TOKEN = "docs-test-token-32-characters-0000000";
  t.after(() => delete process.env.DEMO_TOKEN);
  const app = await offlineApp(t);
  for (const url of ["/api/openapi.json", "/api/docs", "/api/config"])
    assert.equal((await app.inject({ url })).statusCode, 200, url);
  assert.equal((await app.inject({ url: "/api/rules" })).statusCode, 401);
  assert.equal(
    (await app.inject({ url: "/api/openapi.json?download=1" })).statusCode,
    200,
  );
  const missing = await app.inject({
    method: "POST",
    url: "/api/sales/1/action/unknown",
    headers: { authorization: `Bearer ${process.env.DEMO_TOKEN}` },
    payload: {},
  });
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(missing.json(), errorBody("ROUTE_NOT_FOUND"));
});

/** 응답의 상태 코드, `code`, `type`을 확인한다. 문장은 우리가 쓴 합니다체 문장이다. */
function assertError(
  response: { statusCode: number; json(): any; body: string },
  status: number,
  code: ErrorCode,
) {
  assert.equal(response.statusCode, status, response.body);
  assert.equal(ERROR_CODES[code].status, status, code);
  const body = response.json();
  assert.equal(body.code, code, response.body);
  assert.equal(body.type, ERROR_CODES[code].type, response.body);
  assert.match(body.error, /^[가-힣]/, response.body);
  assert.doesNotMatch(body.error, HAEYO, response.body);
  assert.deepEqual(Object.keys(body).sort(), ["code", "error", "type"]);
}

test("Fastify·플러그인·접근 검사의 오류도 원래 상태 코드와 code를 보낸다", async (t) => {
  process.env.DEMO_TOKEN = "docs-test-token-32-characters-0000000";
  t.after(() => delete process.env.DEMO_TOKEN);
  const app = await offlineApp(t);
  const auth = { authorization: `Bearer ${process.env.DEMO_TOKEN}` };
  const post = (headers: Record<string, string>, payload: string) =>
    app.inject({ method: "POST", url: "/api/sales", headers, payload });
  const json = { ...auth, "content-type": "application/json" };

  // 잘못된 JSON 400, 스키마 400, 본문 초과 413, 본문 형식 415.
  assertError(await post(json, "{"), 400, "INVALID_REQUEST");
  assertError(await post(json, "{}"), 400, "INVALID_REQUEST");
  assertError(
    await post(json, JSON.stringify({ name: "x".repeat(70_000) })),
    413,
    "BODY_TOO_LARGE",
  );
  assertError(
    await post({ ...auth, "content-type": "application/xml" }, "<x/>"),
    415,
    "UNSUPPORTED_MEDIA_TYPE",
  );
  // 접근 코드 401, API 키 401, 허용하지 않은 출처 403, API 키 범위 403, 없는 경로 404.
  assertError(
    await app.inject({ url: "/api/sales" }),
    401,
    "ACCESS_CODE_INVALID",
  );
  assertError(
    await app.inject({
      url: "/api/sales",
      headers: { authorization: `Bearer fvk_${"A".repeat(32)}` },
    }),
    401,
    "API_KEY_INVALID",
  );
  assertError(
    await post(
      { ...json, origin: "https://other.example" },
      JSON.stringify({
        productId: `0x${"1".repeat(64)}`,
        customerNo: "C-0001",
      }),
    ),
    403,
    "ORIGIN_NOT_ALLOWED",
  );
  assertError(
    await app.inject({ url: "/api/nothing", headers: auth }),
    404,
    "ROUTE_NOT_FOUND",
  );
  // 없는 판매 건은 404 SALE_NOT_FOUND다(원장을 읽기 전에 끝난다).
  assertError(
    await app.inject({ url: "/api/sales/1/export/receipt", headers: auth }),
    404,
    "SALE_NOT_FOUND",
  );
  // 요청 한도 429. 같은 IP의 요청을 센다.
  let last;
  for (let i = 0; i < 121; i++)
    last = await app.inject({ url: "/api/openapi.json" });
  assertError(last!, 429, "RATE_LIMITED");
});

test("우리가 쓰지 않은 오류는 RPC 문장을 숨기고 INTERNAL_ERROR로 보낸다", async (t) => {
  // offline 스택의 RPC는 닫힌 포트다. 원장을 읽는 경로는 viem 오류로 끝난다.
  const app = await offlineApp(t);
  const failed = await app.inject({ url: "/api/rules" });
  assertError(failed, 409, "INTERNAL_ERROR");
  assert.deepEqual(failed.json(), errorBody("INTERNAL_ERROR"));
  assert.doesNotMatch(failed.body, /127\.0\.0\.1|http/);
});
