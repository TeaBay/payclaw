// Cloudflare Workers entry point
import { handleMcp, createGate } from "./handler.js";

export interface Env {
  WALLET_ADDRESS: string;
  PRICE_USDC: string;
}

// Gate is created once per worker instance — nonce store persists across requests
let gate: ReturnType<typeof createGate> | null = null;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (!gate) {
      try {
        gate = createGate(env.WALLET_ADDRESS, parseFloat(env.PRICE_USDC || "0.001"));
      } catch (e) {
        console.error("[payclaw] Gate initialization failed:", e);
        return Response.json({ error: "Internal server error" }, { status: 500 });
      }
    }
    return handleMcp(req, gate, parseFloat(env.PRICE_USDC || "0.001"));
  },
};
