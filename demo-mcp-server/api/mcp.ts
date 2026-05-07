import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleMcp, createGate } from "../src/handler.js";

let gate: ReturnType<typeof createGate> | null = null;
const priceUsdc = parseFloat(process.env.PRICE_USDC ?? "0.001");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!gate) {
    try {
      gate = createGate(
        (process.env.WALLET_ADDRESS ?? "").trim(),
        priceUsdc
      );
    } catch (e) {
      console.error("[payclaw] Gate initialization failed:", e);
      res.status(500).json({ error: "Internal server error" });
      return;
    }
  }

  // Convert VercelRequest → Web API Request so handler.ts stays framework-agnostic
  const body = await new Promise<string>((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

  const safeBase = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://localhost";
  const headers = new Headers();
  for (const [key, val] of Object.entries(req.headers)) {
    if (val === undefined) continue;
    if (Array.isArray(val)) val.forEach((v) => headers.append(key, v));
    else headers.set(key, val);
  }
  const webReq = new Request(`${safeBase}${req.url}`, {
    method: req.method,
    headers,
    body: body.length > 0 ? body : undefined,
  });

  const webRes = await handleMcp(
    webReq,
    gate,
    priceUsdc
  );

  res.status(webRes.status);
  webRes.headers.forEach((value, key) => res.setHeader(key, value));
  res.send(await webRes.text());
}
