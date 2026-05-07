// Cloudflare Workers entry point
import { handleMcp } from "./handler.js";

export interface Env {
  WALLET_ADDRESS: string;
  PRICE_USDC: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    return handleMcp(req, env.WALLET_ADDRESS, parseFloat(env.PRICE_USDC || "0.001"));
  },
};
