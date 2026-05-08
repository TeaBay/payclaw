import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleMcp, createGate } from "../src/handler.js";

export const config = { api: { bodyParser: false } };

let gate: ReturnType<typeof createGate> | null = null;
const priceUsdc = parseFloat(process.env.PRICE_USDC ?? "0.001");
if (!Number.isFinite(priceUsdc) || priceUsdc <= 0) {
  throw new Error("PRICE_USDC must be a positive number");
}

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

  const MAX_REQUEST_BYTES = 256 * 1024;
  const contentLength = parseInt(req.headers["content-length"] ?? "0", 10);
  if (contentLength > MAX_REQUEST_BYTES) {
    res.status(413).json({ error: "request body too large" });
    return;
  }

  // Convert VercelRequest → Web API Request so handler.ts stays framework-agnostic
  const body = await new Promise<string>((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        req.destroy(new Error("request body too large"));
        return;
      }
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  }).catch(() => null);

  if (body === null) {
    res.status(413).json({ error: "request body too large" });
    return;
  }

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
