// Vercel Edge Function entry point
import { handleMcp, createGate } from "../src/handler.js";

export const runtime = "edge";

// Gate is created once per edge instance — nonce store persists across requests
let gate: ReturnType<typeof createGate> | null = null;

export default async function handler(req: Request): Promise<Response> {
  const walletAddress = process.env.WALLET_ADDRESS ?? "";
  const priceUsdc = parseFloat(process.env.PRICE_USDC ?? "0.001");

  if (!gate) {
    try {
      gate = createGate(walletAddress, priceUsdc);
    } catch (e) {
      return new Response(`Server misconfigured: ${(e as Error).message}`, { status: 500 });
    }
  }

  return handleMcp(req, gate, priceUsdc);
}
