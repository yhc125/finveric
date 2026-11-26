// 외부 연동: 원장(EVM) 읽기·시뮬레이션·쓰기·서명. 판매 기록은 바꾸지 않는다. 기록은 modules/transactions.ts가 남긴다.
import { setTimeout as delay } from "node:timers/promises";
import {
  BaseError,
  ContractFunctionRevertedError,
  createWalletClient,
  http,
  keccak256,
  parseEventLogs,
  type Hex,
  type TransactionReceipt,
} from "viem";
import {
  LEDGER_ERRORS,
  ledgerAbi,
  type ChainDiagnosis,
  type ChainSale,
  type LedgerError,
  type Role,
} from "@finveric/core";
import { ledgerErrorCode } from "@finveric/core/errors";
import { CodedError } from "../errors.ts";
import type { FundService } from "../service.ts";

/** 원장 연동에 필요한 실행 맥락: 역할 키, 배포 설정, RPC 클라이언트. */
export type Chain = Pick<FundService, "env" | "dep" | "client">;
export type LedgerFunction = Extract<
  (typeof ledgerAbi)[number],
  { type: "function"; stateMutability: "nonpayable" }
>["name"];

export const readChainId = (chain: Chain) => chain.client.getChainId();

/** 주소에 배포된 코드의 해시. 코드가 없으면 undefined. */
export async function readCodeHash(chain: Chain, address: Hex) {
  const code = await chain.client.getCode({ address });
  return code ? keccak256(code) : undefined;
}

const view = (chain: Chain) =>
  ({ address: chain.dep.ledger, abi: ledgerAbi }) as const;

export const readLedgerVersion = (chain: Chain) =>
  chain.client.readContract({ ...view(chain), functionName: "ledgerVersion" });
export const readCoolingPeriod = (chain: Chain) =>
  chain.client.readContract({ ...view(chain), functionName: "coolingPeriod" });

export const readSale = (chain: Chain, id: string): Promise<ChainSale> =>
  chain.client.readContract({
    ...view(chain),
    functionName: "getSale",
    args: [BigInt(id)],
  });

export const readAttemptCount = (chain: Chain, customerRef: Hex) =>
  chain.client.readContract({
    ...view(chain),
    functionName: "attemptCount",
    args: [BigInt(customerRef)],
  });

export const readDiagnosis = (
  chain: Chain,
  customerRef: Hex,
  attempt: number,
): Promise<ChainDiagnosis> =>
  chain.client.readContract({
    ...view(chain),
    functionName: "getDiagnosis",
    args: [BigInt(customerRef), attempt],
  });

/** 기준 해시의 등록 여부와 버전. */
export async function readRule(chain: Chain, ruleHash: Hex) {
  const [registered, version, registeredAt] = await chain.client.readContract({
    ...view(chain),
    functionName: "rules",
    args: [BigInt(ruleHash)],
  });
  return { registered, version, registeredAt };
}
export const readRuleCount = (chain: Chain) =>
  chain.client.readContract({ ...view(chain), functionName: "ruleCount" });

export const readLatestProductVersion = (chain: Chain, productId: Hex) =>
  chain.client.readContract({
    ...view(chain),
    functionName: "latestProductVersion",
    args: [productId],
  });
export const readProduct = (chain: Chain, productId: Hex, version: number) =>
  chain.client.readContract({
    ...view(chain),
    functionName: "getProduct",
    args: [productId, version],
  });

/** 최신 블록 시각(초). 숙려 남은 시간 계산에 쓴다. */
export async function readBlockTime(chain: Chain) {
  return Number((await chain.client.getBlock()).timestamp);
}

/**
 * 원장이 거절한 호출. 오류 이름은 원장의 사용자 정의 오류다.
 * 응답의 `type`은 `rejected`, `code`는 `LEDGER_<이름>`(이름을 모르면 `LEDGER_REJECTED`)이다.
 */
export class LedgerRejection extends CodedError {
  constructor(readonly error?: LedgerError) {
    super(ledgerErrorCode(error));
  }
}
function rejection(error: unknown) {
  if (!(error instanceof BaseError)) return undefined;
  const reverted = error.walk(
    (cause) => cause instanceof ContractFunctionRevertedError,
  ) as ContractFunctionRevertedError | null;
  if (!reverted) return undefined;
  const name = reverted.data?.errorName;
  return new LedgerRejection(
    name && name in LEDGER_ERRORS ? (name as LedgerError) : undefined,
  );
}

/**
 * 역할 계정으로 원장 호출을 시뮬레이션한다. 원장이 거절하면 LedgerRejection을 던진다.
 * 거래를 보내기 전에 거절 이유(예: TooEarly)를 알려 주고, 실패 거래로 가스를 쓰지 않는다.
 * 가스도 같은 블록 기준으로 정해 요청에 넣는다.
 */
export async function simulate(
  chain: Chain,
  role: Role,
  functionName: LedgerFunction,
  args: readonly unknown[],
) {
  // 로컬 Anvil은 거래가 없으면 블록을 만들지 않는다. 최신 블록 시각이 멈춰 숙려 경과를 알 수 없다.
  // 그래서 현재 시각으로 다음 블록을 만드는 pending 기준으로 시뮬레이션한다. Sepolia는 약 12초마다 블록이 생긴다.
  const call = {
    ...view(chain),
    account: chain.env.accounts[role],
    functionName,
    args,
    ...(chain.dep.chainId === 31337 ? { blockTag: "pending" } : {}),
  } as never;
  try {
    const [{ request }, gas] = await Promise.all([
      chain.client.simulateContract(call),
      chain.client.estimateContractGas(call),
    ]);
    return { ...(request as object), gas: (gas * 6n) / 5n };
  } catch (error) {
    throw rejection(error) ?? error;
  }
}

/**
 * 원장이 판정에 쓸 블록 시각이 `at`(초)을 지날 때까지 기다린다. 숙려 뒤 최종 확인 전에 쓴다.
 * Sepolia의 최신 블록 시각은 실제 시각보다 늦을 수 있다. 숙려 종료 직후
 * 최신 블록으로 시뮬레이션하면 원장이 `TooEarly`로 거절할 수 있다.
 * 로컬 Anvil은 현재 시각 기준(pending)으로 시뮬레이션하므로 기다리지 않는다.
 * 실제 시각으로도 `at` 전이면 기다리지 않는다. 이른 확인은 원장이 그대로 거절한다.
 * `timeoutMs`가 지나면 기다리기를 멈추고 돌아간다. 이후 판정은 원장에 맡긴다.
 */
export async function waitForBlockTime(
  chain: Pick<Chain, "dep" | "client">,
  at: bigint,
  {
    timeoutMs = 30_000,
    intervalMs = 2_000,
    now = Date.now,
  }: { timeoutMs?: number; intervalMs?: number; now?: () => number } = {},
) {
  if (chain.dep.chainId === 31337) return;
  const started = now();
  const elapsed = started - Number(at) * 1000;
  // 숙려 종료 직후에만 블록을 확인한다. 그 뒤에는 바로 시뮬레이션한다.
  if (elapsed < 0 || elapsed >= timeoutMs) return;

  const controller = new AbortController();
  const options = { signal: controller.signal };
  const timeout = delay(timeoutMs, undefined, options);
  try {
    const deadline = started + timeoutMs;
    for (;;) {
      const block = await Promise.race([
        chain.client.getBlock({ blockTag: "latest" }),
        timeout,
      ]);
      if (!block || block.timestamp >= at) return;
      const remaining = deadline - now();
      if (remaining <= 0) return;
      await Promise.race([
        delay(Math.min(intervalMs, remaining), undefined, options),
        timeout,
      ]);
      if (now() >= deadline) return;
    }
  } finally {
    controller.abort();
  }
}

/** 시뮬레이션한 호출을 역할 키로 서명해 보낸다. 거래 해시를 돌려준다. */
export function submit(chain: Chain, role: Role, request: unknown) {
  const wallet = createWalletClient({
    account: chain.env.accounts[role],
    chain: chain.env.chain,
    transport: http(chain.env.rpcUrl),
  });
  return wallet.writeContract(request as never);
}

/** 승인자 키로 승인 원문 해시에 EIP-191 서명을 한다. 거래는 보내지 않는다. */
export const signApproval = (chain: Chain, digest: Hex) =>
  chain.env.accounts.approver.signMessage({ message: { raw: digest } });

export const getReceipt = (chain: Chain, hash: Hex) =>
  chain.client.getTransactionReceipt({ hash });

export const waitForReceipt = (chain: Chain, hash: Hex) =>
  chain.client.waitForTransactionReceipt({ hash, timeout: 180_000 });

/** 영수증에서 이 원장이 남긴 이벤트만 고른다. */
export function ledgerEvents(chain: Chain, receipt: TransactionReceipt) {
  return parseEventLogs({ abi: ledgerAbi, logs: receipt.logs }).filter(
    (log) => log.address.toLowerCase() === chain.dep.ledger.toLowerCase(),
  );
}
export type LedgerEvent = ReturnType<typeof ledgerEvents>[number];
