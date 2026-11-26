import assert from "node:assert/strict";
import { test } from "node:test";
import { waitForBlockTime } from "../apps/api/src/gateways/ledger.ts";

// 원장 없이 블록 시각 기다리기를 검사한다. 블록은 부를 때마다 다음 시각을 준다.
function chain(chainId: number, timestamps: number[]) {
  const seen: number[] = [];
  const fake = {
    dep: { chainId },
    client: {
      getBlock: async () => {
        const timestamp =
          timestamps[Math.min(seen.length, timestamps.length - 1)]!;
        seen.push(timestamp);
        return { timestamp: BigInt(timestamp) };
      },
    },
  } as never;
  return { fake, seen };
}
const at = 1_000n;
const after = (seconds: number) => () => (1_000 + seconds) * 1000;

test("로컬 Anvil은 블록을 기다리지 않는다", async () => {
  const { fake, seen } = chain(31337, [900]);
  await waitForBlockTime(fake, at, { now: after(5), intervalMs: 0 });
  assert.deepEqual(seen, []);
});

test("실제 시각으로 숙려 전이면 기다리지 않고 원장 판정에 맡긴다", async () => {
  const { fake, seen } = chain(11155111, [900]);
  await waitForBlockTime(fake, at, { now: after(-3), intervalMs: 0 });
  assert.deepEqual(seen, []);
});

test("숙려가 끝난 뒤에는 블록 시각이 숙려 종료를 지날 때까지 기다린다", async () => {
  const { fake, seen } = chain(11155111, [990, 998, 1_002]);
  await waitForBlockTime(fake, at, { now: after(2), intervalMs: 0 });
  assert.deepEqual(seen, [990, 998, 1_002]);
});

test("블록 시각이 이미 지났으면 한 번만 읽는다", async () => {
  const { fake, seen } = chain(11155111, [1_000]);
  await waitForBlockTime(fake, at, { now: after(12), intervalMs: 0 });
  assert.deepEqual(seen, [1_000]);
});

test("숙려가 끝난 지 30초 이상 지나면 블록을 별도로 읽지 않는다", async () => {
  const { fake, seen } = chain(11155111, [1_030]);
  await waitForBlockTime(fake, at, { now: after(30) });
  assert.deepEqual(seen, []);
});

test("제한 시간이 지나면 기다리기를 멈춘다", async () => {
  let clock = 1_002_000;
  const { fake, seen } = chain(11155111, [990]);
  await waitForBlockTime(fake, at, {
    now: () => (clock += 10_000),
    timeoutMs: 30_000,
    intervalMs: 0,
  });
  assert.ok(seen.length > 0 && seen.length <= 4);
});
