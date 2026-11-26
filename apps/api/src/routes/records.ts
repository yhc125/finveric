// 경로: 처리 기록과 고객 증빙 내려받기.
import type { FastifyPluginAsync } from "fastify";
import {
  EXPORT_KINDS,
  saleIdParamsSchema,
  type SaleIdParams,
} from "@finveric/core/api";
import type { FundService } from "../service.ts";

export const recordRoutes: FastifyPluginAsync<{
  service: FundService;
}> = async (app, { service }) => {
  app.get("/traces", async () => service.view(() => service.publicTraces()));
  app.get("/signals", async () => service.signals());
  for (const kind of EXPORT_KINDS)
    app.get<{ Params: SaleIdParams }>(
      `/sales/:id/export/${kind}`,
      { schema: { params: saleIdParamsSchema } },
      async (req, reply) => {
        const { id } = req.params;
        reply.header(
          "Content-Disposition",
          `attachment; filename="finveric-${kind}-${id.slice(0, 10)}.json"`,
        );
        reply.header("Cache-Control", "no-store");
        return service.view<unknown>(() =>
          kind === "original"
            ? service.original(id, req.demoCustomerNo)
            : service.receipt(id, req.demoCustomerNo),
        );
      },
    );
};
