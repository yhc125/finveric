import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";
import { API_KEY_PREFIX } from "@finveric/core/api";
import { ERROR_CODES, errorBody } from "@finveric/core/errors";
import { FundService } from "./service.ts";
import { createApp } from "./app.ts";
import { channelErrorBody } from "./errors.ts";

/**
 * Vercel 라우팅은 `/api/sales`를 `/api?__path=sales`로 바꿔 함수에 전달할 수 있다.
 * 어느 형태로 와도 Fastify가 원래 API 경로를 받도록 되돌린다.
 */
export function normalizeApiUrl(url = "/") {
  const parsed = new URL(url, "http://finveric.local");
  const rest = parsed.searchParams.get("__path");
  parsed.searchParams.delete("__path");
  if (
    rest !== null &&
    (parsed.pathname === "/api" || parsed.pathname === "/api/")
  )
    parsed.pathname = `/api/${rest.replace(/^\/+/, "")}`;
  return parsed.pathname + parsed.search;
}

/** 시작 검사가 쓴 문장. RPC 오류처럼 우리가 쓰지 않은 문장은 내보내지 않는다. */
const authored = (error: unknown) =>
  error instanceof Error &&
  /^[가-힣]/.test(error.message) &&
  !error.message.includes("http")
    ? error.message
    : undefined;

let ready: Promise<FastifyInstance> | undefined;
async function start() {
  const service = new FundService();
  await service.initialize();
  const app = await createApp(service);
  await app.ready();
  return app;
}

/** 인스턴스마다 한 번 시작 검사를 한다. 실패하면 다음 요청에서 다시 시도한다. */
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  ready ??= start().catch((error) => {
    ready = undefined;
    throw error;
  });
  let app: FastifyInstance;
  try {
    app = await ready;
  } catch (error) {
    res.statusCode = ERROR_CODES.API_START_FAILED.status;
    res.setHeader("content-type", "application/json; charset=utf-8");
    if (req.headers.authorization?.startsWith(`Bearer ${API_KEY_PREFIX}`)) {
      res.end(JSON.stringify(channelErrorBody("API_START_FAILED")));
    } else {
      const body = errorBody("API_START_FAILED");
      res.end(
        JSON.stringify({ ...body, error: authored(error) ?? body.error }),
      );
    }
    return;
  }
  req.url = normalizeApiUrl(req.url);
  await new Promise<void>((resolve) => {
    res.once("finish", resolve);
    res.once("close", resolve);
    app.server.emit("request", req, res);
  });
}
