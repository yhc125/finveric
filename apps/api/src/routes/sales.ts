// 경로: 판매 건 조회, 신청(초안), 승인·중단·청약·최종 확인·철회·모의 결제.
// 요청 형식은 packages/core/src/api.ts의 DTO와 스키마를 따른다.
import type { FastifyPluginAsync } from "fastify";
import {
  openSaleBodySchema,
  approveBodySchema,
  type ApproveRequest,
  SALE_ACTIONS,
  saleIdParamsSchema,
  subscribeBodySchema,
  type OpenSaleRequest,
  type SaleIdParams,
  type SubscribeRequest,
} from "@finveric/core/api";
import type { FundService } from "../service.ts";

export const saleRoutes: FastifyPluginAsync<{ service: FundService }> = async (
  app,
  { service },
) => {
  app.get("/sales", async (req) =>
    service.view(() => service.publicSales(req.demoCustomerNo)),
  );
  app.get<{ Params: SaleIdParams }>(
    "/sales/:id",
    { schema: { params: saleIdParamsSchema } },
    async (req) =>
      service.view(() =>
        service.publicSale(service.find(req.params.id, req.demoCustomerNo)),
      ),
  );
  app.post<{ Body: OpenSaleRequest }>(
    "/sales",
    { schema: { body: openSaleBodySchema } },
    async (req) => service.exclusive(() => service.open(req.body)),
  );
  app.post<{ Params: SaleIdParams; Body: SubscribeRequest }>(
    "/sales/:id/action/subscribe",
    { schema: { params: saleIdParamsSchema, body: subscribeBodySchema } },
    async (req) =>
      service.exclusive(() =>
        service.subscribe(req.params.id, req.body, req.demoCustomerNo),
      ),
  );
  // 동작마다 경로를 따로 둔다. API 문서에서 동작별로 설명과 분류(판매 채널·판매사 콘솔)가 다르다.
  app.post<{ Params: SaleIdParams; Body: ApproveRequest }>(
    "/sales/:id/action/approve",
    {
      preValidation: async (req) => {
        if (req.body === undefined) req.body = {};
      },
      schema: { params: saleIdParamsSchema, body: approveBodySchema },
    },
    async (req) =>
      service.exclusive(() =>
        service.action(req.params.id, "approve", req.demoCustomerNo, req.body),
      ),
  );
  for (const action of SALE_ACTIONS.filter((action) => action !== "approve"))
    app.post<{ Params: SaleIdParams }>(
      `/sales/:id/action/${action}`,
      { schema: { params: saleIdParamsSchema } },
      async (req) =>
        service.exclusive(() =>
          service.action(req.params.id, action, req.demoCustomerNo),
        ),
    );
};
