// 경로: 진단 기준과 상품 설명서 버전 등록·조회, 시연 기준·상품 일괄 등록.
import type { FastifyPluginAsync } from "fastify";
import {
  registerProductBodySchema,
  registerRuleBodySchema,
  type RegisterProductRequest,
  type RegisterRuleRequest,
} from "@finveric/core/api";
import type { FundService } from "../service.ts";

export const registryRoutes: FastifyPluginAsync<{
  service: FundService;
}> = async (app, { service }) => {
  app.get("/rules", async () => service.view(() => service.rules()));
  app.post<{ Body: RegisterRuleRequest }>(
    "/rules",
    { schema: { body: registerRuleBodySchema } },
    async (req) =>
      service.exclusive(() => service.registerRule(req.body.document)),
  );
  app.get("/products", async () => service.view(() => service.products()));
  app.post<{ Body: RegisterProductRequest }>(
    "/products",
    { schema: { body: registerProductBodySchema } },
    async (req) =>
      service.exclusive(() =>
        service.registerProduct(req.body.document, req.body.expectedVersion),
      ),
  );
  app.post("/register", async () =>
    service.exclusive(() => service.register()),
  );
};
