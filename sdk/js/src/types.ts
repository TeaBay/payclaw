export interface PayclawConfig {
  priceUsdc: number;
  walletAddress: string;
  network?: string;
  chainId?: number;
  usdcAddress?: string;
  rpcUrl?: string;
  freshnessSeconds?: number;
  nonceCacheTtl?: number;
  nonceStore?: NonceStore;
  rateLimitRequests?: number;   // max requests per IP per window (0 = disabled, default 10)
  rateLimitWindowMs?: number;   // window in ms (default 60000)
  trustProxy?: boolean;         // trust X-Forwarded-For for rate limiting (default false)
}

export interface ResolvedConfig {
  priceUsdc: number;
  priceUnits: bigint;
  walletAddress: string;
  network: string;
  chainId: number;
  usdcAddress: string;
  rpcUrl: string;
  freshnessSeconds: number;
  nonceCacheTtl: number;
  nonceStore: NonceStore;
}

export interface NonceStore {
  has(txHash: string): Promise<boolean>;
  /** Returns true if successfully set (first time), false if already existed. */
  set(txHash: string, ttlSeconds: number): Promise<boolean>;
}

export interface X402Body {
  x402: true;
  price: string;
  currency: "USDC";
  network: string;
  recipient: string;
  chain_id: number;
  reason?: string;
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: string };
