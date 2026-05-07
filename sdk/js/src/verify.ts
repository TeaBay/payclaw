import type { ResolvedConfig, VerifyResult } from "./types.js";

// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

async function rpc(url: string, method: string, params: unknown[], retries = 3): Promise<unknown> {
  let delay = 1000;
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { result?: unknown; error?: unknown };
      if (data.error) throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
      return data.result ?? null;
    } catch (e) {
      lastErr = e;
      if (i < retries - 1) await sleep(delay);
      delay *= 2;
    }
  }
  throw new Error(`RPC failed after ${retries} retries: ${lastErr}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function decodeAddress(padded: string): string {
  return "0x" + padded.slice(-40);
}

export async function verifyPayment(txHash: string, config: ResolvedConfig): Promise<VerifyResult> {
  if (await config.nonceStore.has(txHash)) {
    return { ok: false, reason: "tx already used" };
  }

  const tx = (await rpc(config.rpcUrl, "eth_getTransactionByHash", [txHash])) as Record<string, string> | null;
  if (!tx) return { ok: false, reason: "tx not found" };

  // USDC is ERC-20 — amount is in Transfer event logs, not tx.value (which is 0).
  const receipt = (await rpc(config.rpcUrl, "eth_getTransactionReceipt", [txHash])) as {
    logs: Array<{ address: string; topics: string[]; data: string }>;
  } | null;
  if (!receipt) return { ok: false, reason: "tx receipt not found" };

  const usdcLog = receipt.logs.find(
    (log) =>
      log.topics.length >= 3 &&
      log.topics[0].toLowerCase() === TRANSFER_TOPIC &&
      log.address.toLowerCase() === config.usdcAddress.toLowerCase() &&
      decodeAddress(log.topics[2]).toLowerCase() === config.walletAddress.toLowerCase()
  );

  if (!usdcLog) return { ok: false, reason: "no USDC transfer to recipient found in tx" };

  const value = BigInt(usdcLog.data);
  if (value < config.priceUnits) {
    return { ok: false, reason: `insufficient USDC: got ${value} units, need ${config.priceUnits}` };
  }

  const block = (await rpc(config.rpcUrl, "eth_getBlockByNumber", [tx.blockNumber, false])) as {
    timestamp: string;
  } | null;
  if (!block) return { ok: false, reason: "block not found" };

  const blockTs = Number(BigInt(block.timestamp));
  const now = Math.floor(Date.now() / 1000);
  const age = Math.abs(now - blockTs);
  if (age > config.freshnessSeconds) {
    return { ok: false, reason: `tx too old: ${age}s (max ${config.freshnessSeconds}s)` };
  }

  const marked = await config.nonceStore.set(txHash, config.nonceCacheTtl);
  if (!marked) return { ok: false, reason: "tx already used (race condition)" };

  return { ok: true };
}
