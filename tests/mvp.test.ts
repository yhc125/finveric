import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createTestClient,
  createWalletClient,
  decodeFunctionData,
  http,
  keccak256,
  stringToHex,
  type Hex,
} from "viem";
import { groth16 } from "snarkjs";
import { environment, COOLING_PERIOD } from "../scripts/environment.ts";
import { proofKeyHash } from "../scripts/artifacts.ts";
import { ZK_FILES, zkPath } from "../scripts/root.ts";
// @ts-expect-error Portable JavaScript binary resolver.
import { foundryBinary } from "../scripts/foundry.mjs";
import { FundService } from "../apps/api/src/service.ts";
import { RedisStore } from "../apps/api/src/repositories/store.ts";
import { fakeUpstash } from "./fake-upstash.ts";
import { responseChecker } from "./openapi-check.ts";
import { createApp } from "../apps/api/src/app.ts";
import { prove } from "../apps/api/src/gateways/proofs.ts";
import { verifySale } from "@finveric/core/verify";
import { readLedger } from "@finveric/core/ledger";
import {
  buildDisputeReport,
  reportCsv,
} from "../apps/web/src/auditor/report.ts";
import {
  DEMO_CUSTOMER_NO,
  DEMO_PRODUCTS,
  DEMO_RULE,
  computeSignals,
  customerRefFor,
  diagnosisCommitment,
  ledgerAbi,
  proofInput,
  ruleHash,
  verifierAbi,
  verifierArgs,
  type Deployment,
  type EvidenceReceipt,
  type OriginalBundle,
} from "@finveric/core";
import {
  APPROVAL_REASONS,
  DEMO_SESSION_PREFIX,
  type ConfigDto,
  type CustomerDto,
  type DiagnosisDto,
  type ErrorResponse,
  type SaleDto,
} from "@finveric/core/api";
import { ERROR_CODES, type ErrorCode } from "@finveric/core/errors";

const [els, fund, elb] = DEMO_PRODUCTS;
const CUSTOMER = DEMO_CUSTOMER_NO;
// 위험중립형(3) → 적극투자형(4) → 공격투자형(5, 위험 태도 "원금 20%까지"로 2등급까지만 권유).
const ANSWERS = [
  [2, 1, 1, 0, 1, 1],
  [2, 1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2, 1],
];

/** 시연 Anvil(8545)과 겹치지 않는 빈 포트. */
const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
const revertName = (error: unknown) =>
  error instanceof BaseError
    ? (
        error.walk(
          (e) => e instanceof ContractFunctionRevertedError,
        ) as ContractFunctionRevertedError | null
      )?.data?.errorName
    : undefined;

test(
  "실제 회로·EVM·API·독립 검증으로 v5 판매 절차 전체를 검증한다",
  { timeout: 300_000 },
  async (t) => {
    // 새로 받은 저장소에는 .local이 없다.
    mkdirSync(".local", { recursive: true, mode: 0o700 });
    const directory = mkdtempSync(".local/test-");
    const port = await freePort();
    const node = spawn(
      foundryBinary("anvil"),
      ["--port", String(port), "--silent"],
      { stdio: "ignore" },
    );
    const env = {
      ...environment("local"),
      rpcUrl: `http://127.0.0.1:${port}`,
    };
    const client = createPublicClient({
      chain: env.chain,
      transport: http(env.rpcUrl, { timeout: 5000, retryCount: 0 }),
      pollingInterval: 50,
    });
    const anvil = createTestClient({
      mode: "anvil",
      chain: env.chain,
      transport: http(env.rpcUrl),
    });
    const wallet = createWalletClient({
      account: env.accounts.deployer,
      chain: env.chain,
      transport: http(env.rpcUrl),
    });
    t.after(() => {
      node.kill("SIGTERM");
      rmSync(directory, { recursive: true, force: true });
    });
    for (let i = 0; i < 100; i++) {
      try {
        await client.getChainId();
        break;
      } catch {
        if (i === 99) throw new Error("테스트 Anvil을 시작할 수 없습니다.");
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    const deploy = async (name: string, args: unknown[] = []) => {
      const artifact = JSON.parse(
        readFileSync(`out/${name}.sol/${name}.json`, "utf8"),
      );
      const hash = await wallet.deployContract({
        abi: artifact.abi,
        bytecode: artifact.bytecode.object,
        args,
      });
      const mined = await client.waitForTransactionReceipt({ hash });
      assert.equal(mined.status, "success");
      return mined.contractAddress!;
    };
    const verifier = await deploy("Groth16Verifier");
    const roles = Object.fromEntries(
      Object.entries(env.accounts).map(([r, a]) => [r, a.address]),
    ) as Deployment["roles"];
    const ledger = await deploy("FundLedger", [
      verifier,
      roles.seller,
      roles.approver,
      roles.customer,
      roles.infrastructure,
      BigInt(COOLING_PERIOD),
    ]);
    const dep: Deployment = {
      ledgerVersion: 5,
      proofKeyHash: proofKeyHash(),
      chainId: 31337,
      ledger,
      verifier,
      roles,
      blockNumber: "0",
      rpcUrl: env.rpcUrl,
      coolingPeriod: COOLING_PERIOD,
      ledgerCodeHash: keccak256((await client.getCode({ address: ledger }))!),
      verifierCodeHash: keccak256(
        (await client.getCode({ address: verifier }))!,
      ),
    };
    const service = new FundService({
      env,
      dep,
      file: directory + "/sales.json",
    });
    await service.initialize();
    const app = await createApp(service);
    t.after(() => app.close());
    // 공개 연동 경로와 콘솔 내부 경로를 모두 내부 계약과 대조한다.
    await app.ready();
    const documented = responseChecker(app.internalSwagger());
    const call = async (path: string, body?: object) => {
      const method = body === undefined ? "GET" : "POST";
      const response = await app.inject({
        method,
        url: "/api" + path,
        ...(body === undefined ? {} : { payload: body }),
      });
      documented.check(
        method,
        "/api" + path,
        response.statusCode,
        response.json(),
      );
      return response;
    };
    const request = async <T = any>(path: string, body?: object) => {
      const response = await call(path, body);
      assert.equal(response.statusCode, 200, response.body);
      return response.json() as T;
    };
    /**
     * 거절 응답의 상태 코드, `code`, `type`을 확인한다. 연동 앱은 문장 대신 `type`과 `code`로 안내를 고른다.
     * `type`과 상태는 core의 오류 목록(`ERROR_CODES`)과 같아야 한다.
     */
    const rejectBody = async (
      path: string,
      status: number,
      code: ErrorCode,
      body?: object,
    ) => {
      const response = await call(path, body);
      assert.equal(response.statusCode, status, response.body);
      assert.equal(ERROR_CODES[code].status, status, code);
      const failure = response.json() as ErrorResponse;
      assert.equal(failure.code, code, response.body);
      assert.equal(failure.type, ERROR_CODES[code].type, response.body);
      return failure;
    };
    const reject = async (
      path: string,
      status: number,
      code: ErrorCode,
      body?: object,
    ) => (await rejectBody(path, status, code, body)).error;
    const blockNumber = () => client.getBlockNumber({ cacheTime: 0 });
    const diagnose = (answers: number[]) =>
      request<DiagnosisDto>(`/customers/${CUSTOMER}/diagnose`, { answers });
    const action = (id: string, name: string, body: object = {}) =>
      request<SaleDto>(`/sales/${id}/action/${name}`, body);
    const ref = customerRefFor(env.customerRefSecret, CUSTOMER);
    const gas: Record<string, bigint> = {};
    const gasOf = async (hash?: Hex) =>
      (await client.getTransactionReceipt({ hash: hash! })).gasUsed;
    const seller = createWalletClient({
      account: env.accounts.seller,
      chain: env.chain,
      transport: http(env.rpcUrl),
    });
    const simulateSeller = (args: readonly unknown[]) =>
      client
        .simulateContract({
          address: ledger,
          abi: ledgerAbi,
          account: env.accounts.seller,
          functionName: "recordDiagnosis",
          args: args as never,
        })
        .then(
          () => undefined,
          (error: unknown) => revertName(error),
        );

    await t.test(
      "기준 등록 전 진단·신청과 형식이 틀린 입력을 거절한다",
      async () => {
        assert.match(
          await reject(
            `/customers/${CUSTOMER}/diagnose`,
            409,
            "RULE_NOT_REGISTERED",
            {
              answers: ANSWERS[0],
            },
          ),
          /진단 기준을 먼저 등록/,
        );
        await reject("/sales", 409, "PRODUCT_NOT_REGISTERED", {
          productId: els.id,
          customerNo: CUSTOMER,
        });
        await reject(
          `/customers/${CUSTOMER}/diagnose`,
          400,
          "INVALID_REQUEST",
          {
            answers: [5],
          },
        );
        await reject(`/customers/C_0001/diagnose`, 400, "INVALID_REQUEST", {
          answers: [0],
        });
        await reject("/sales", 400, "INVALID_REQUEST", {
          productId: "0x01",
          customerNo: CUSTOMER,
        });
        await reject("/sales/123", 404, "SALE_NOT_FOUND");
        const rules = await request("/rules");
        assert.equal(rules.length, 1);
        assert.equal(rules[0].registered, false);
        assert.equal(rules[0].hash, ruleHash(DEMO_RULE));
        const config = await request("/config");
        assert.deepEqual(config.demoCustomer, { number: CUSTOMER, ref });
        assert.equal(config.deployment.coolingPeriod, COOLING_PERIOD);
      },
    );

    const beforeRegister = await blockNumber();
    await t.test("시연 기준 v1과 상품 3종을 한 번만 등록한다", async () => {
      const registered = await request("/register", {});
      assert.equal(await blockNumber(), beforeRegister + 4n);
      assert.deepEqual(
        registered.rules.map((r: { registered: boolean }) => r.registered),
        [true],
      );
      assert.equal(registered.products.length, 3);
      for (const product of DEMO_PRODUCTS) {
        const version = await client.readContract({
          address: ledger,
          abi: ledgerAbi,
          functionName: "latestProductVersion",
          args: [product.id],
        });
        assert.equal(version, 1);
        const stored = await client.readContract({
          address: ledger,
          abi: ledgerAbi,
          functionName: "getProduct",
          args: [product.id, 1],
        });
        assert.equal(stored.documentHash, product.documentHash);
        assert.equal(stored.riskGrade, product.document.riskGrade);
      }
      const [registeredAt, version] = await client.readContract({
        address: ledger,
        abi: ledgerAbi,
        functionName: "rules",
        args: [BigInt(ruleHash(DEMO_RULE))],
      });
      assert.equal(registeredAt, true);
      assert.equal(version, 1);
      await request("/register", {});
      assert.equal(await blockNumber(), beforeRegister + 4n);
      // 감독기관은 등록 원문으로 해시를 다시 계산한다.
      const snapshot = await readLedger(dep, client);
      assert.equal(snapshot.rules.length, 1);
      assert.ok(snapshot.rules[0].hashMatches);
      assert.ok(snapshot.products.every((p) => p.matches));
    });

    await t.test(
      "새 설명서 버전은 다음 버전 번호로 쌓이고 이전 버전을 남긴다",
      async () => {
        // 새 버전을 등록하기 전에 만든 신청은 청약할 수 없다(product_changed).
        const stale = await request<SaleDto>("/sales", {
          productId: fund.id,
          customerNo: "C-0002",
        });
        const entry = await request("/products", {
          document: {
            ...fund.document,
            fee: "총보수 연 0.80%(가상)",
            version: 9,
          },
        });
        assert.equal(entry.product.version, 2);
        const salesBefore = (await request<SaleDto[]>("/sales")).length;
        await reject("/sales", 409, "PRODUCT_VERSION_CHANGED", {
          productId: fund.id,
          customerNo: CUSTOMER,
          expectedVersion: 1,
        });
        assert.equal((await request<SaleDto[]>("/sales")).length, salesBefore);
        await reject("/products", 409, "PRODUCT_EDIT_VERSION_CHANGED", {
          document: fund.document,
          expectedVersion: 1,
        });
        await reject(
          `/sales/${stale.id}/action/subscribe`,
          409,
          "PRODUCT_VERSION_CHANGED",
          {
            explanationSeconds: 60,
            higherRiskConfirmed: false,
            recordingConsent: false,
          },
        );
        const products = await request("/products");
        const fundVersions = products.filter(
          (p: { product: { id: string } }) => p.product.id === fund.id,
        );
        assert.deepEqual(
          fundVersions.map(
            (p: { product: { version: number }; latest: boolean }) => [
              p.product.version,
              p.latest,
            ],
          ),
          [
            [1, false],
            [2, true],
          ],
        );
        await reject("/products", 400, "INVALID_REQUEST", {
          document: {
            ...fund.document,
            cards: fund.document.cards.slice(0, 4),
          },
        });
        await reject("/products", 400, "INVALID_REQUEST", {
          document: { ...fund.document, riskGrade: 7 },
        });
      },
    );

    await t.test(
      "규칙 밖 선택지와 등록 기준과 다른 값으로는 증명을 만들 수 없다",
      async () => {
        const ctx = {
          chainId: 31337,
          ledger,
          customerRef: ref,
          attempt: 1,
          ruleHash: ruleHash(DEMO_RULE),
        };
        const base = proofInput(DEMO_RULE, ANSWERS[0], "123", ctx);
        const attempts = [
          // 3지선다 문항에 4번째 선택지.
          { ...base, answers: ["3", ...base.answers.slice(1)] },
          // 선택지 범위 밖(5).
          { ...base, answers: ["5", ...base.answers.slice(1)] },
          // 쓰지 않는 문항에 답.
          { ...base, answers: [...base.answers.slice(0, 9), "1"] },
          // 기준 값을 바꾸고 원래 기준 해시를 쓴다.
          { ...base, threshold: ["0", "0", "0", "0"] },
          // 커밋먼트 바꿔치기.
          { ...base, commitment: "1" },
        ];
        for (const input of attempts)
          await assert.rejects(() =>
            groth16.fullProve(
              input,
              zkPath(ZK_FILES.wasm),
              zkPath(ZK_FILES.zkey),
              undefined,
              undefined,
              { singleThread: true },
            ),
          );
        await reject(
          `/customers/${CUSTOMER}/diagnose`,
          400,
          "ANSWERS_NOT_MATCHING_RULE",
          { answers: [3, 0, 0, 0, 0, 0] },
        );
        await reject(
          `/customers/${CUSTOMER}/diagnose`,
          400,
          "ANSWERS_NOT_MATCHING_RULE",
          { answers: [0, 0, 0] },
        );
        assert.equal(
          (await request<CustomerDto>(`/customers/${CUSTOMER}`)).diagnoses
            .length,
          0,
        );
      },
    );

    await t.test("등록하지 않은 기준의 증명은 원장이 거절한다", async () => {
      const draft = structuredClone(DEMO_RULE);
      draft.name = "등록하지 않은 기준";
      const hash = ruleHash(draft);
      const proven = await prove(draft, ANSWERS[0], "99", {
        chainId: 31337,
        ledger,
        customerRef: ref,
        attempt: 1,
        ruleHash: hash,
      });
      const { profile, limit, elderly, commitment } = proven.signals;
      assert.equal(
        await simulateSeller([
          BigInt(ref),
          1,
          BigInt(hash),
          commitment,
          Number(profile),
          Number(limit),
          elderly === 1n,
          proven.proof,
        ]),
        "InvalidVersion",
      );
    });

    let abandonedId = "";
    let saleId = "";
    let firstTx: Hex | undefined;
    await t.test(
      "진단 회차가 가입 중단 뒤에도 같은 고객 가명 ID로 1, 2, 3 이어진다",
      async () => {
        const draft = await request<SaleDto>("/sales", {
          productId: els.id,
          customerNo: CUSTOMER,
        });
        abandonedId = draft.id;
        assert.equal(draft.status, "draft");
        assert.equal(draft.customerRef, ref);
        assert.equal(draft.latestAttempt, 0);
        await reject("/sales", 409, "DIAGNOSIS_REQUIRED", {
          productId: els.id,
          customerNo: CUSTOMER,
          intent: "subscribe",
        });
        assert.deepEqual(await request("/sales?scope=work"), []);
        const subscribeBody = {
          explanationSeconds: 60,
          higherRiskConfirmed: true,
          recordingConsent: true,
        };
        await reject(
          `/sales/${draft.id}/action/subscribe`,
          409,
          "DIAGNOSIS_REQUIRED",
          subscribeBody,
        );
        const first = await diagnose(ANSWERS[0]);
        assert.deepEqual(
          [first.attempt, first.profile, first.limit, first.elderly],
          [1, 3, 3, false],
        );
        firstTx = first.txHash;
        gas.recordDiagnosis = await gasOf(first.txHash);
        // 3회차 미만이면 관리자 승인 대상이 아니다.
        await reject("/sales", 409, "APPROVAL_NOT_NEEDED", {
          productId: els.id,
          customerNo: CUSTOMER,
          intent: "requestApproval",
        });
        await reject(
          `/sales/${draft.id}/action/approve`,
          409,
          "APPROVAL_NOT_NEEDED",
          {},
        );
        const abandoned = await action(draft.id, "abandon");
        assert.equal(abandoned.status, "abandoned");
        await reject(
          `/sales/${draft.id}/action/subscribe`,
          409,
          "SALE_ABANDONED",
          subscribeBody,
        );

        const sale = await request<SaleDto>("/sales", {
          productId: els.id,
          customerNo: CUSTOMER,
        });
        saleId = sale.id;
        assert.notEqual(sale.id, draft.id);
        assert.equal(sale.latestAttempt, 1);
        assert.equal(sale.suitable, false);
        assert.equal(sale.protectedSale, true);
        const second = await request<DiagnosisDto>(
          `/customers/${CUSTOMER}/diagnose`,
          {
            answers: ANSWERS[1],
            reassessmentReason: "correction",
          },
        );
        const third = await diagnose(ANSWERS[2]);
        // 진단 회차가 늘어도 기존 초안은 승인 대기가 되지 않는다.
        assert.deepEqual(await request("/sales?scope=work"), []);
        const approvalRequest = await request<SaleDto>("/sales", {
          productId: els.id,
          customerNo: CUSTOMER,
          expectedVersion: 1,
          intent: "requestApproval",
        });
        assert.equal(approvalRequest.approvalRequested, true);
        const work = await request<SaleDto[]>("/sales?scope=work");
        assert.deepEqual(
          work.map((sale) => sale.id),
          [approvalRequest.id],
        );
        await action(approvalRequest.id, "abandon");
        assert.deepEqual(await request("/sales?scope=work"), []);
        assert.equal(
          service.repository.diagnoses(ref).find((d) => d.attempt === 2)
            ?.reassessmentReason,
          "correction",
        );
        assert.equal(
          service.repository.diagnoses(ref).find((d) => d.attempt === 3)
            ?.reassessmentReason,
          undefined,
        );
        assert.deepEqual(
          [second.attempt, second.profile, second.limit],
          [2, 4, 2],
        );
        assert.deepEqual(
          [third.attempt, third.profile, third.limit],
          [3, 5, 2],
        );
        const customer = await request<CustomerDto>(`/customers/${CUSTOMER}`);
        assert.equal(customer.ref, ref);
        assert.deepEqual(
          customer.diagnoses.map((d) => [d.attempt, d.profile]),
          [
            [1, 3],
            [2, 4],
            [3, 5],
          ],
        );
        // 커밋먼트는 답변·임의값·원장·고객 가명 ID·회차·기준에 묶인다.
        for (const stored of service.repository.diagnoses(ref)) {
          const expected = diagnosisCommitment(stored.answers, stored.salt, {
            chainId: 31337,
            ledger,
            customerRef: ref,
            attempt: stored.attempt,
            ruleHash: stored.ruleHash,
          });
          assert.equal(
            customer.diagnoses[stored.attempt - 1].commitment,
            expected.toString(),
          );
        }
        assert.equal(
          await client.readContract({
            address: ledger,
            abi: ledgerAbi,
            functionName: "attemptCount",
            args: [BigInt(ref)],
          }),
          3,
        );
      },
    );

    await t.test(
      "사후 변경 시도는 원장이 InvalidAttempt로 거절하고 거래를 보내지 않는다",
      async () => {
        const before = await blockNumber();
        const result = await request("/demo/tamper", {
          customerNo: CUSTOMER,
          attempt: 2,
        });
        assert.equal(result.rejected, true);
        assert.equal(result.error, "InvalidAttempt");
        assert.match(result.reason, /회차/);
        await reject("/demo/tamper", 409, "ATTEMPT_NOT_RECORDED", {
          customerNo: CUSTOMER,
          attempt: 9,
        });
        assert.equal(await blockNumber(), before);
        const recorded = await request<CustomerDto>(`/customers/${CUSTOMER}`);
        assert.equal(recorded.diagnoses[1].profile, 4);
      },
    );

    await t.test(
      "증명은 다른 고객 가명 ID·회차·원장에 재사용할 수 없다",
      async () => {
        const tx = await client.getTransaction({ hash: firstTx! });
        const decoded = decodeFunctionData({ abi: ledgerAbi, data: tx.input });
        if (decoded.functionName !== "recordDiagnosis")
          assert.fail("진단 기록 거래가 아닙니다.");
        const [, attempt, rule, commitment, profile, limit, elderly, proof] =
          decoded.args;
        const another = customerRefFor(env.customerRefSecret, "C-0002");
        assert.equal(
          await simulateSeller([
            BigInt(another),
            attempt,
            rule,
            commitment,
            profile,
            limit,
            elderly,
            proof,
          ]),
          "InvalidProof",
        );
        // 같은 고객의 다음 회차(4)로 1회차 증명을 다시 쓴다.
        assert.equal(
          await simulateSeller([
            BigInt(ref),
            4,
            rule,
            commitment,
            profile,
            limit,
            elderly,
            proof,
          ]),
          "InvalidProof",
        );
        const signals = [
          BigInt(profile),
          BigInt(limit),
          elderly ? 1n : 0n,
          commitment,
          31337n,
          BigInt(ledger),
          BigInt(ref),
          BigInt(attempt),
          rule,
        ] as const;
        const verify = (values: readonly bigint[]) =>
          client.readContract({
            address: verifier,
            abi: verifierAbi,
            functionName: "verifyProof",
            args: [...verifierArgs(proof), values as never],
          });
        assert.equal(await verify(signals), true);
        for (let index = 0; index < signals.length; index++) {
          const modified = [...signals];
          modified[index] =
            index < 3 ? (modified[index] + 1n) % 6n : modified[index] + 1n;
          assert.equal(await verify(modified), false, `공개 신호 ${index}`);
        }
        // 판매사가 아닌 계정은 기록할 수 없다.
        await assert.rejects(
          seller.writeContract({
            address: ledger,
            abi: ledgerAbi,
            functionName: "recordDiagnosis",
            args: [
              BigInt(another),
              1,
              rule,
              commitment,
              profile,
              limit,
              elderly,
              proof,
            ],
            account: env.accounts.customer,
          }),
        );
      },
    );

    await t.test(
      "3회차 청약은 관리자 승인, 부적합은 추가 위험 확인, 녹취 대상은 녹취 동의가 필요하다",
      async () => {
        const before = await blockNumber();
        const body = {
          explanationSeconds: 180,
          higherRiskConfirmed: true,
          recordingConsent: true,
        };
        assert.match(
          await reject(
            `/sales/${saleId}/action/subscribe`,
            409,
            "APPROVAL_REQUIRED",
            body,
          ),
          /관리자 승인/,
        );
        await reject(
          `/sales/${saleId}/action/approve`,
          409,
          "APPROVAL_ATTEMPT_CHANGED",
          { expectedAttempt: 2, reason: "circumstances_reviewed" },
        );
        assert.equal(service.find(saleId).approvalReviews, undefined);
        const approved = await action(saleId, "approve", {
          expectedAttempt: 3,
          reason: "correction_reviewed",
          reviewBasis: ["diagnosis_history", "risk_signals"],
        });
        const reviews = structuredClone(service.find(saleId).approvalReviews!);
        assert.equal(reviews.length, 1);
        assert.equal(reviews[0].attempt, 3);
        assert.equal(reviews[0].reason, "correction_reviewed");
        assert.deepEqual(reviews[0].reviewBasis, [
          "diagnosis_history",
          "risk_signals",
        ]);
        assert.ok(Number.isFinite(Date.parse(reviews[0].reviewedAt)));
        await action(saleId, "approve", { reason: "circumstances_reviewed" });
        assert.deepEqual(
          service.find(saleId).approvalReviews,
          reviews,
          "중복 요청은 승인 근거를 덮어쓰지 않는다",
        );
        assert.equal(approved.approvalRequired, true);
        assert.equal(approved.approvedAttempt, 3);
        assert.deepEqual(
          (await request<SaleDto[]>("/sales?scope=work")).map(
            (sale) => sale.id,
          ),
          [saleId],
        );
        assert.match(
          await reject(
            `/sales/${saleId}/action/subscribe`,
            409,
            "HIGHER_RISK_CONFIRMATION_REQUIRED",
            { ...body, higherRiskConfirmed: false },
          ),
          /추가 위험 확인/,
        );
        assert.match(
          await reject(
            `/sales/${saleId}/action/subscribe`,
            409,
            "RECORDING_CONSENT_REQUIRED",
            { ...body, recordingConsent: false },
          ),
          /녹취/,
        );
        await reject(
          `/sales/${saleId}/action/subscribe`,
          400,
          "INVALID_REQUEST",
          {
            ...body,
            explanationSeconds: 0,
          },
        );
        assert.equal(await blockNumber(), before);
        const subscribed = await action(saleId, "subscribe", body);
        assert.equal(subscribed.status, "subscribed");
        assert.equal(subscribed.suitable, false);
        assert.equal(subscribed.protectedSale, true);
        assert.equal(subscribed.chain?.attempt, 3);
        assert.equal(subscribed.chain?.approved, true);
        assert.equal(subscribed.chain?.higherRiskConfirmed, true);
        assert.equal(
          subscribed.coolingEndsAt,
          Number(subscribed.chain!.subscribedAt) + COOLING_PERIOD,
        );
        const original = await request<OriginalBundle>(
          `/sales/${saleId}/export/original`,
        );
        assert.equal(
          subscribed.chain?.recordingHash,
          keccak256(stringToHex(original.recording!.text)),
        );
        gas.subscribe = await gasOf(
          subscribed.traces.find((trace) => trace.action === "subscribe")
            ?.txHash,
        );
      },
    );

    await t.test(
      "숙려기간 전 최종 확인은 원장이 TooEarly로 거절하고 지난 뒤 확정한다",
      async () => {
        const before = await blockNumber();
        const tooEarly = await rejectBody(
          `/sales/${saleId}/action/confirm`,
          409,
          "LEDGER_TOO_EARLY",
          {},
        );
        assert.match(tooEarly.error, /숙려기간/);
        // 연동 앱은 문장 대신 type, code, 원장 오류 이름으로 고객 안내를 고른다.
        assert.equal(tooEarly.type, "rejected");
        assert.equal(tooEarly.ledgerError, "TooEarly");
        assert.equal(await blockNumber(), before);
        const traces = await request("/traces");
        assert.equal(
          traces.find(
            (trace: { action: string; status: string }) =>
              trace.action === "confirm" && trace.status === "failed",
          )?.detail.error,
          "TooEarly",
        );
        await anvil.increaseTime({ seconds: COOLING_PERIOD });
        await anvil.mine({ blocks: 1 });
        const confirmed = await action(saleId, "confirm");
        assert.equal(confirmed.status, "confirmed");
        gas.confirm = await gasOf(
          confirmed.traces.find(
            (trace) =>
              trace.action === "confirm" && trace.status === "confirmed",
          )?.txHash,
        );
        // 확정한 건은 철회할 수 없다. 같은 확인 요청은 거래를 다시 보내지 않는다.
        await reject(
          `/sales/${saleId}/action/withdraw`,
          409,
          "WITHDRAW_NOT_ALLOWED",
          {},
        );
        const repeated = await blockNumber();
        await action(saleId, "confirm");
        assert.equal(await blockNumber(), repeated);
      },
    );

    let bondId = "";
    await t.test(
      "적합한 ELB는 녹취·숙려 없이 바로 확정하고 모의 결제를 한 번만 기록한다",
      async () => {
        const bond = await request<SaleDto>("/sales", {
          productId: elb.id,
          customerNo: CUSTOMER,
        });
        bondId = bond.id;
        assert.equal(bond.suitable, true);
        assert.equal(bond.protectedSale, false);
        await reject(
          `/sales/${bond.id}/action/settle`,
          409,
          "SETTLEMENT_NOT_ALLOWED",
          {},
        );
        await action(bond.id, "approve");
        const subscribed = await action(bond.id, "subscribe", {
          explanationSeconds: 45,
          higherRiskConfirmed: false,
          recordingConsent: false,
        });
        assert.equal(subscribed.chain?.protectedSale, false);
        assert.equal(subscribed.chain?.recordingHash, `0x${"0".repeat(64)}`);
        assert.equal(subscribed.coolingEndsAt, undefined);
        assert.equal((await action(bond.id, "confirm")).status, "confirmed");
        const settled = await action(bond.id, "settle");
        assert.equal(settled.settled, true);
        const before = await blockNumber();
        await action(bond.id, "settle");
        assert.equal(await blockNumber(), before);

        // 숙려 중 철회.
        const withdrawn = await request<SaleDto>("/sales", {
          productId: els.id,
          customerNo: CUSTOMER,
        });
        await action(withdrawn.id, "approve");
        await action(withdrawn.id, "subscribe", {
          explanationSeconds: 120,
          higherRiskConfirmed: true,
          recordingConsent: true,
        });
        assert.equal(
          (await action(withdrawn.id, "withdraw")).status,
          "withdrawn",
        );
        await reject(
          `/sales/${withdrawn.id}/action/confirm`,
          409,
          "CONFIRM_NOT_ALLOWED",
          {},
        );
      },
    );

    await t.test(
      "판매사 API 없이 원장과 대조한다: 원본은 일치, 바꾼 사본은 불일치, 없는 판매 ID는 기록 없음",
      async () => {
        const original = await request<OriginalBundle>(
          `/sales/${saleId}/export/original`,
        );
        const receipt = await request<EvidenceReceipt>(
          `/sales/${saleId}/export/receipt`,
        );
        assert.equal(receipt.format, "finveric-receipt-v5");
        assert.equal(original.format, "finveric-original-v5");
        assert.ok(receipt.confirmTx);
        assert.deepEqual(
          original.attempts.map((a) => a.attempt),
          [1, 2, 3],
        );
        const verified = await verifySale(dep, saleId, receipt, original);
        assert.equal(
          verified.outcome,
          "match",
          JSON.stringify(verified.checks),
        );
        assert.deepEqual(
          verified.checks.map((c) => c.name),
          [
            "판매 기록",
            "상품 설명서 버전",
            "진단 기준 원문",
            "진단 회차",
            "원본 답변 대조",
            "적합성·필수 확인",
            "숙려·최종 확인",
            "증명서 대조",
          ],
        );
        assert.deepEqual(
          verified.diagnoses.map((d) => d.attempt),
          [1, 2, 3],
        );
        assert.ok(
          verified.references.some(
            (r) => r.kind === "confirm" && r.txHash === receipt.confirmTx,
          ),
        );

        const failing = async (
          name: string,
          changedReceipt: EvidenceReceipt,
          changedOriginal: OriginalBundle,
        ) => {
          const result = await verifySale(
            dep,
            saleId,
            changedReceipt,
            changedOriginal,
          );
          assert.equal(result.outcome, "mismatch", name);
          assert.deepEqual(
            result.checks.filter((c) => !c.ok).map((c) => c.name),
            [name],
          );
          return result;
        };
        const answer = structuredClone(original);
        answer.attempts[1].answers[0] = 1;
        const mismatch = await failing("원본 답변 대조", receipt, answer);
        const [ledgerOnly, snapshot] = await Promise.all([
          verifySale(dep, saleId),
          readLedger(dep, client),
        ]);
        const report = buildDisputeReport(dep, snapshot, mismatch, ledgerOnly, {
          mode: "file",
          receipt: true,
          original: true,
        });
        assert.equal(report.comparison?.ledgerOnly.outcome, "match");
        assert.equal(report.comparison?.verifiedAt, mismatch.verifiedAt);
        assert.equal(report.sales[0].outcome, "mismatch");
        assert.deepEqual(report.sales[0].checks, mismatch.checks);
        assert.equal(report.source.sellerApi, false);
        assert.doesNotMatch(
          JSON.stringify(report),
          /"(answers|salt|recording)"/,
        );
        assert.match(reportCsv(report), /불일치,원본 답변 대조/);
        const document = structuredClone(original);
        document.productDocument.cards[0].text =
          document.productDocument.cards[0].text.replace("50%", "5%");
        await failing("상품 설명서 버전", receipt, document);
        const recording = structuredClone(original);
        recording.recording!.text += " ";
        await failing("적합성·필수 확인", receipt, recording);
        await failing("증명서 대조", { ...receipt, amount: "1" }, original);
        await failing("증명서 대조", { ...receipt, attempt: 2 }, original);

        const missing = await verifySale(dep, "1");
        assert.equal(missing.outcome, "missing");
        assert.match(missing.checks[0].detail, /없어요\.$/);
        // 감독기관 화면과 보고서는 합니다체로 받는다.
        const formal = await verifySale(dep, "1", undefined, undefined, {
          voice: "hapnida",
        });
        assert.match(formal.checks[0].detail, /없습니다\.$/);
        assert.equal((await verifySale(dep, abandonedId)).outcome, "missing");
        const bond = await verifySale(dep, bondId);
        assert.equal(bond.outcome, "match", JSON.stringify(bond.checks));
        assert.equal(bond.sale?.settlement !== undefined, true);
        await assert.rejects(() => verifySale(dep, "0x12"));
        await assert.rejects(() =>
          verifySale({ ...dep, ledger: roles.seller }, saleId),
        );
      },
    );

    await t.test("위험 신호를 원장 이벤트만으로 계산한다", async () => {
      const snapshot = await readLedger(dep, client);
      assert.equal(snapshot.diagnoses.length, 3);
      assert.equal(snapshot.sales.length, 3);
      const signals = computeSignals(snapshot);
      const kinds = (kind: string) =>
        signals
          .filter((s) => s.kind === kind)
          .map((s) => s.saleId ?? s.attempt);
      assert.deepEqual(kinds("repeat"), [3]);
      assert.deepEqual(kinds("shortInterval"), [2, 3]);
      assert.equal(kinds("rise").length, 3);
      assert.deepEqual(kinds("unsuitable"), [saleId]);
      assert.deepEqual(kinds("shortExplanation"), [bondId]);
      assert.ok(signals.every((s) => s.customerRef === ref));
      assert.deepEqual(await request("/signals"), signals);

      // 기본 고객과 판매 건이 없는 다른 고객도 함께 집계한다.
      const anotherRef = customerRefFor(env.customerRefSecret, "C-0003");
      for (const answers of ANSWERS.slice(0, 2))
        await request("/customers/C-0003/diagnose", { answers });
      const all = await request<typeof signals>("/signals");
      assert.ok(all.some((signal) => signal.customerRef === ref));
      assert.ok(
        all.some(
          (signal) =>
            signal.customerRef === anotherRef &&
            signal.kind === "shortInterval" &&
            signal.saleId === undefined,
        ),
      );
    });

    await t.test(
      "공개 조회와 로그에 답변·임의값·총점·고객 번호·개인키가 없다",
      async () => {
        for (const path of ["/sales", "/traces"]) {
          const data = JSON.stringify(await request(path));
          assert.doesNotMatch(
            data,
            /"(answers|salt|score|privateKey|signature|approvalReviews|reviewBasis|reviewedAt|reassessmentReason)"/,
          );
          for (const reason of APPROVAL_REASONS)
            assert.ok(!data.includes(JSON.stringify(reason)));
          assert.doesNotMatch(data, new RegExp(CUSTOMER));
        }
        const customer = JSON.stringify(
          await request(`/customers/${CUSTOMER}`),
        );
        assert.doesNotMatch(
          customer,
          /"(answers|salt|score|reassessmentReason)"/,
        );
      },
    );

    await t.test(
      "판매 채널 연동 경로의 실제 응답이 API 문서의 응답 스키마와 같다",
      async () => {
        await request<SaleDto>(`/sales/${saleId}`);
        const spec = (await app.inject({ url: "/api/openapi.json" })).json();
        const channel = Object.values<Record<string, any>>(spec.paths)
          .flatMap((item) => Object.values<any>(item))
          .filter((op) => op.tags[0] === "판매 채널 연동")
          .map((op) => `${op.operationId} 200`);
        assert.equal(channel.length, 11, channel.join(", "));
        const missing = channel.filter((key) => !documented.covered.has(key));
        assert.deepEqual(missing, [], "대조하지 않은 판매 채널 연동 응답");
        // 오류 응답도 문서의 형식과 같다.
        for (const key of ["diagnoseCustomer 400", "subscribeSale 409"])
          assert.ok(documented.covered.has(key), key);

        const { key } = await request<{ key: string }>("/keys", {
          name: "판매 채널 계약 검사",
        });
        const channelDocs = responseChecker(spec);
        const headers = { authorization: `Bearer ${key}` };
        for (const path of [
          `/api/sales/${saleId}`,
          `/api/sales/${saleId}/export/receipt`,
        ]) {
          const response = await app.inject({ url: path, headers });
          assert.equal(response.statusCode, 200);
          channelDocs.check("GET", path, 200, response.json());
        }
        const opened = await app.inject({
          method: "POST",
          url: "/api/sales",
          headers,
          payload: {
            productId: els.id,
            customerNo: CUSTOMER,
            intent: "requestApproval",
          },
        });
        assert.equal(opened.statusCode, 200);
        channelDocs.check("POST", "/api/sales", 200, opened.json());
        const cancelPath = `/api/sales/${opened.json().id}/action/abandon`;
        const cancelled = await app.inject({
          method: "POST",
          url: cancelPath,
          headers,
        });
        assert.equal(cancelled.statusCode, 200);
        channelDocs.check("POST", cancelPath, 200, cancelled.json());
      },
    );

    await t.test(
      "여러 서버 인스턴스가 같은 저장소를 써도 기록을 잃지 않는다",
      async () => {
        const upstash = fakeUpstash();
        const instance = () =>
          new FundService({
            env,
            dep,
            store: new RedisStore({
              url: "https://example.upstash.io",
              token: "test-token",
              key: "finveric:shared-test",
              fetch: upstash.fetch,
            }),
          });
        const [a, b, reader] = [instance(), instance(), instance()];
        await a.initialize();
        // 등록 원문은 공유 저장소에 없다. 같은 원장에 등록한 원문을 옮긴다.
        await a.exclusive(async () => {
          for (const rule of service.repository.rules())
            a.repository.addRule(rule);
          for (const product of service.repository.products())
            a.repository.addProduct(product);
        });
        const [first, second] = await Promise.all([
          a.exclusive(() =>
            a.open({ productId: els.id, customerNo: "C-0100" }),
          ),
          b.exclusive(() =>
            b.open({ productId: elb.id, customerNo: "C-0101" }),
          ),
        ]);
        const seen = await reader.view(async () =>
          reader.sales.map((sale) => sale.id),
        );
        assert.deepEqual(new Set(seen), new Set([first.id, second.id]));
        const before = upstash.values.get("finveric:shared-test:sales")?.value;
        await reader.view(() => reader.publicTraces());
        assert.equal(
          upstash.values.get("finveric:shared-test:sales")?.value,
          before,
        );
      },
    );

    await t.test(
      "health는 RPC·원장·저장소를 점검하고 하나라도 실패하면 503이다",
      async () => {
        const healthy = await app.inject({ url: "/api/health" });
        assert.equal(healthy.statusCode, 200, healthy.body);
        const body = healthy.json();
        documented.check("GET", "/api/health", 200, body);
        assert.equal(body.ok, true);
        for (const name of ["rpc", "ledger", "store"])
          assert.equal(body.checks[name].ok, true, name);
        const broken = new FundService({
          env: { ...env, rpcUrl: "http://127.0.0.1:1" },
          dep,
          file: directory + "/health.json",
        });
        const brokenApp = await createApp(broken);
        try {
          const failed = await brokenApp.inject({ url: "/api/health" });
          assert.equal(failed.statusCode, 503, failed.body);
          documented.check("GET", "/api/health", 503, failed.json());
          assert.equal(failed.json().checks.rpc.ok, false);
          assert.equal(failed.json().checks.store.ok, true);
          assert.doesNotMatch(failed.body, /127\.0\.0\.1:1|http/);
        } finally {
          await brokenApp.close();
        }
      },
    );

    await t.test(
      "서버 재시작 뒤 대기 기록을 영수증으로 복구하고 거래를 다시 보내지 않는다",
      async () => {
        const record = service.find(bondId);
        const trace = record.traces.find(
          (item) => item.action === "confirm" && item.status === "confirmed",
        );
        assert.ok(trace);
        trace.status = "pending";
        service.save();
        const before = await blockNumber();
        const recovered = new FundService({ env, dep, file: service.file });
        await recovered.initialize();
        assert.equal(
          recovered.repository.diagnoses(ref).find((d) => d.attempt === 2)
            ?.reassessmentReason,
          "correction",
        );
        assert.deepEqual(
          recovered.find(saleId).approvalReviews,
          service.find(saleId).approvalReviews,
        );
        assert.equal(
          recovered
            .find(bondId)
            .traces.find((item) => item.txHash === trace.txHash)?.status,
          "confirmed",
        );
        assert.equal(
          (await recovered.action(bondId, "confirm")).status,
          "confirmed",
        );
        assert.equal(await blockNumber(), before);
      },
    );

    await t.test(
      "외부 시연의 접근 코드가 없으면 고객 원본을 내려받을 수 없다",
      async () => {
        process.env.DEMO_TOKEN = "test-token-32-characters-minimum-12345";
        const gated = await createApp(service);
        try {
          assert.equal(
            (
              await gated.inject({
                url: `/api/sales/${saleId}/export/original`,
              })
            ).statusCode,
            401,
          );
          assert.equal(
            (
              await gated.inject({
                url: `/api/sales/${saleId}/export/original`,
                headers: { authorization: `Bearer ${process.env.DEMO_TOKEN}` },
              })
            ).statusCode,
            200,
          );
        } finally {
          delete process.env.DEMO_TOKEN;
          await gated.close();
        }
      },
    );

    await t.test(
      "공개 시연은 콘솔을 열고 가입 원본을 자기 고객의 세션에만 제공한다",
      async () => {
        process.env.FINVERIC_PUBLIC_CHANNEL = "1";
        const publicApp = await createApp(service);
        try {
          const session = (suffix: string) => ({
            authorization: `Bearer ${DEMO_SESSION_PREFIX}00000000-0000-4000-8000-00000000000${suffix}`,
          });
          const first = session("1");
          const second = session("2");
          const cfg = async (headers: typeof first) =>
            (
              await publicApp.inject({ url: "/api/config", headers })
            ).json<ConfigDto>();
          const [a, b] = await Promise.all([cfg(first), cfg(second)]);
          assert.equal(a.publicChannel, true);
          assert.equal(a.requiresToken, false);
          for (const url of [
            "/api/keys",
            `/api/sales/${saleId}/export/receipt`,
          ]) {
            const response = await publicApp.inject({ url });
            assert.equal(response.statusCode, 200, response.body);
          }
          const original = await publicApp.inject({
            url: `/api/sales/${saleId}/export/original`,
          });
          assert.equal(original.statusCode, 403, original.body);
          assert.equal(original.json().code, "DEMO_SCOPE_DENIED");
          assert.notEqual(a.demoCustomer.ref, b.demoCustomer.ref);
          assert.notEqual(a.demoCustomer.number, CUSTOMER);
          const open = (customerNo: string) =>
            publicApp.inject({
              method: "POST",
              url: "/api/sales",
              headers: first,
              payload: { productId: elb.id, customerNo },
            });
          const foreign = await open(b.demoCustomer.number);
          assert.equal(foreign.statusCode, 403, foreign.body);
          const created = await open(a.demoCustomer.number);
          assert.equal(created.statusCode, 200, created.body);
          const id = created.json<SaleDto>().id;
          const list = async (headers: typeof first) =>
            (await publicApp.inject({ url: "/api/sales", headers })).json<
              SaleDto[]
            >();
          assert.deepEqual(
            (await list(first)).map((sale) => sale.id),
            [id],
          );
          assert.deepEqual(await list(second), []);
          for (const url of [
            `/api/sales/${id}`,
            `/api/sales/${saleId}/export/original`,
          ]) {
            const response = await publicApp.inject({ url, headers: second });
            assert.equal(response.statusCode, 404, response.body);
          }
          const attempt = await publicApp.inject({
            method: "POST",
            url: `/api/customers/${b.demoCustomer.number}/diagnose`,
            headers: first,
            payload: { answers: ANSWERS[0] },
          });
          assert.equal(attempt.statusCode, 403, attempt.body);
          const approve = await publicApp.inject({
            method: "POST",
            url: `/api/sales/${id}/action/approve`,
            headers: first,
            payload: {},
          });
          assert.equal(approve.statusCode, 403, approve.body);
          assert.equal(
            (await publicApp.inject({ url: "/api/keys", headers: first }))
              .statusCode,
            403,
          );
        } finally {
          delete process.env.FINVERIC_PUBLIC_CHANNEL;
          await publicApp.close();
        }
      },
    );

    t.diagnostic(
      `gas recordDiagnosis=${gas.recordDiagnosis} subscribe=${gas.subscribe} confirm=${gas.confirm}`,
    );
  },
);
