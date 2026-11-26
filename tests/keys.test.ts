import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { MAX_ACTIVE_API_KEYS } from "@finveric/core/api";
import { errorBody } from "@finveric/core/errors";
import { offlineStack } from "./offline-app.ts";
import { responseChecker } from "./openapi-check.ts";

// API 키: 발급, 저장, 범위, 폐기, 요청 한도. 원장 없이 실행한다.
const ACCESS_CODE = "keys-test-token-32-characters-00000000";
const SALE = "1";
/** 판매 채널 연동 경로. 원장을 읽지 않고 판매 건이 없다는 404로 끝난다. */
const CHANNEL_URL = `/api/sales/${SALE}/export/receipt`;
const bearer = (value: string) => ({ authorization: `Bearer ${value}` });

type Request = {
  method?: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  payload?: object;
};
type Inject = ReturnType<typeof documented>["inject"];

/** 공개 연동 경로와 콘솔 내부 경로를 내부 계약과 대조한다. */
async function keysApp(t: { after: (fn: () => unknown) => void }) {
  const { app, file } = await offlineStack(t);
  await app.ready();
  const spec = app.internalSwagger();
  return { ...documented(app.inject.bind(app), spec), file };
}
function documented(
  send: (
    request: Request,
  ) => Promise<{ statusCode: number; json(): any; body: string }>,
  spec: object,
) {
  const docs = responseChecker(spec);
  const inject = async (request: Request) => {
    const res = await send(request);
    docs.check(
      request.method ?? "GET",
      request.url,
      res.statusCode,
      res.json(),
    );
    return res;
  };
  return { inject };
}

async function issue(inject: Inject, name: string, code?: string) {
  const res = await inject({
    method: "POST",
    url: "/api/keys",
    headers: code ? bearer(code) : {},
    payload: { name },
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json() as { id: string; key: string; prefix: string };
}

test("API 키 원문은 발급 응답에만 있고, 저장소에는 해시만 남는다", async (t) => {
  const { inject, file } = await keysApp(t);
  const issued = await issue(inject, "증권사 앱 운영 서버");
  assert.match(issued.key, /^fvk_[A-Za-z0-9_-]{32}$/);
  assert.equal(issued.prefix, issued.key.slice(0, 12));
  assert.match(issued.id, /^key_[0-9a-f]{12}$/);

  const list = await inject({ url: "/api/keys" });
  assert.equal(list.statusCode, 200);
  const [entry] = list.json();
  assert.deepEqual(Object.keys(entry).sort(), [
    "createdAt",
    "id",
    "name",
    "prefix",
    "scope",
  ]);
  assert.equal(entry.scope, "channel");
  assert.doesNotMatch(list.body, new RegExp(issued.key));

  const stored = readFileSync(file, "utf8");
  assert.doesNotMatch(stored, new RegExp(issued.key));
  assert.match(
    stored,
    new RegExp(createHash("sha256").update(issued.key).digest("hex")),
  );
});

test("API 키는 판매 채널 연동 API만 부르고, 폐기하면 401이다", async (t) => {
  process.env.DEMO_TOKEN = ACCESS_CODE;
  t.after(() => delete process.env.DEMO_TOKEN);
  const { inject } = await keysApp(t);
  const { id, key } = await issue(inject, "운영 서버", ACCESS_CODE);

  // 판매 채널 연동: 인증과 범위를 통과하고 없는 판매 건(404)으로 끝난다.
  const channel = await inject({ url: CHANNEL_URL, headers: bearer(key) });
  assert.equal(channel.statusCode, 404);
  assert.equal(channel.json().code, "SALE_NOT_FOUND");

  // 판매사 콘솔 API는 키로 부를 수 없다. 키로 새 키를 만들 수도 없다.
  for (const request of [
    { url: "/api/keys" },
    { url: "/api/sales" },
    { url: `/api/sales/${SALE}/export/original` },
    { method: "POST" as const, url: "/api/keys", payload: { name: "x" } },
    { method: "POST" as const, url: `/api/keys/${id}/revoke` },
  ]) {
    const res = await inject({ ...request, headers: bearer(key) });
    assert.equal(res.statusCode, 403, request.url);
    assert.deepEqual(res.json(), errorBody("API_KEY_SCOPE_DENIED"));
  }

  // 접근 코드도 키도 없으면 401이다.
  const anonymous = await inject({ url: CHANNEL_URL });
  assert.equal(anonymous.statusCode, 401);
  assert.deepEqual(anonymous.json(), errorBody("ACCESS_CODE_INVALID"));

  // 마지막 사용 시각이 남는다.
  const used = (
    await inject({ url: "/api/keys", headers: bearer(ACCESS_CODE) })
  ).json();
  assert.ok(used[0].lastUsedAt, "lastUsedAt 없음");

  const revoked = await inject({
    method: "POST",
    url: `/api/keys/${id}/revoke`,
    headers: bearer(ACCESS_CODE),
  });
  assert.equal(revoked.statusCode, 200);
  assert.ok(revoked.json().revokedAt);
  const after = await inject({ url: CHANNEL_URL, headers: bearer(key) });
  assert.equal(after.statusCode, 401);
  assert.deepEqual(after.json(), errorBody("API_KEY_INVALID"));
});

test("접근 코드를 설정하지 않아도 보낸 API 키는 확인한다", async (t) => {
  const { inject } = await keysApp(t);
  const unknown = await inject({
    url: CHANNEL_URL,
    headers: bearer(`fvk_${"A".repeat(32)}`),
  });
  assert.equal(unknown.statusCode, 401);
  assert.equal(unknown.json().type, "unauthorized");
  assert.equal(unknown.json().code, "API_KEY_INVALID");
  const { key } = await issue(inject, "개발 서버");
  assert.equal(
    (await inject({ url: "/api/keys", headers: bearer(key) })).statusCode,
    403,
  );
  // 헤더가 없으면 로컬 개발처럼 열려 있다.
  assert.equal((await inject({ url: "/api/keys" })).statusCode, 200);
  // 없는 키는 폐기할 수 없다.
  const missing = await inject({
    method: "POST",
    url: `/api/keys/key_${"0".repeat(12)}/revoke`,
  });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json().code, "API_KEY_NOT_FOUND");
});

test(`사용 중인 API 키는 ${MAX_ACTIVE_API_KEYS}개까지다`, async (t) => {
  const { inject } = await keysApp(t);
  const keys = [];
  for (let i = 0; i < MAX_ACTIVE_API_KEYS; i++)
    keys.push(await issue(inject, `서버 ${i + 1}`));
  const over = await inject({
    method: "POST",
    url: "/api/keys",
    payload: { name: "하나 더" },
  });
  assert.equal(over.statusCode, 409);
  assert.equal(over.json().type, "limit_reached");
  assert.equal(over.json().code, "API_KEY_LIMIT_REACHED");
  // 문장의 한도는 core의 상수와 같아야 한다.
  assert.match(over.json().error, new RegExp(`${MAX_ACTIVE_API_KEYS}개까지`));
  await inject({ method: "POST", url: `/api/keys/${keys[0].id}/revoke` });
  await issue(inject, "하나 더");
  // 이름은 공백만으로 쓸 수 없다.
  const blank = await inject({
    method: "POST",
    url: "/api/keys",
    payload: { name: "   " },
  });
  assert.equal(blank.statusCode, 400);
  assert.equal(blank.json().code, "INVALID_REQUEST");
});

test("요청 한도는 API 키마다 센다", async (t) => {
  const { inject } = await keysApp(t);
  const first = await issue(inject, "서버 1");
  const second = await issue(inject, "서버 2");
  let last;
  for (let i = 0; i < 121; i++)
    last = await inject({ url: CHANNEL_URL, headers: bearer(first.key) });
  assert.equal(last?.statusCode, 429);
  assert.deepEqual(last?.json(), errorBody("RATE_LIMITED"));
  // 같은 IP라도 다른 키는 따로 센다.
  const other = await inject({ url: CHANNEL_URL, headers: bearer(second.key) });
  assert.equal(other.statusCode, 404);
  assert.equal(other.json().code, "SALE_NOT_FOUND");
});
