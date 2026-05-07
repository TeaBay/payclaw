// Vercel Edge Function entry point
import { handleMcp } from "../src/handler.js";

export const runtime = "edge";

export default async function handler(req: Request): Promise<Response> {
  const walletAddress = process.env.WALLET_ADDRESS ?? "";
  const priceUsdc = parseFloat(process.env.PRICE_USDC ?? "0.001");
  return handleMcp(req, walletAddress, priceUsdc);
}
