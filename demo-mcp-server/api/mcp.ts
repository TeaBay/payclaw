import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleMcp, createGate } from "../src/handler.js";

let gate: ReturnType<typeof createGate> | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!gate) {
    try {
      gate = createGate(
        (process.env.WALLET_ADDRESS ?? "").trim(),
        parseFloat(process.env.PRICE_USDC ?? "0.001")
      );
    } catch (e) {
      res.status(500).send(`Server misconfigured: ${(e as Error).message}`);
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

  const webReq = new Request(`https://${req.headers.host}${req.url}`, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: body || undefined,
  });

  const webRes = await handleMcp(
    webReq,
    gate,
    parseFloat(process.env.PRICE_USDC ?? "0.001")
  );

  res.status(webRes.status);
  webRes.headers.forEach((value, key) => res.setHeader(key, value));
  res.send(await webRes.text());
}
