# payclaw demo MCP server

[English](#english) | [繁體中文](#繁體中文)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/F1F01XSFJ0)

---

<a name="english"></a>

A live MCP server gated by x402 payments. Each tool call costs **0.001 USDC** on Base Mainnet (real USDC required).

> ⚠️ **Production server — real charges apply.** Each `tools/call` request requires a valid USDC payment on Base Mainnet. Your AI agent must support the [x402 protocol](https://github.com/coinbase/x402) to pay automatically. Standard Claude Desktop does not pay automatically — you need an x402-aware agent framework.

**Endpoint:** `https://payclaw-mcp.vercel.app/api/mcp`

Built with [payclaw](https://pypi.org/project/payclaw/) — drop-in x402 payment middleware for MCP servers.

---

## Use with Claude Desktop

Install [mcp-remote](https://github.com/geelen/mcp-remote), then add to your Claude Desktop config:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "payclaw-demo": {
      "command": "npx",
      "args": ["mcp-remote", "https://payclaw-mcp.vercel.app/api/mcp"]
    }
  }
}
```

Restart Claude Desktop. The `search_knowledge` tool will appear.

---

## Use with Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "payclaw-demo": {
      "command": "npx",
      "args": ["mcp-remote", "https://payclaw-mcp.vercel.app/api/mcp"]
    }
  }
}
```

---

## How payment works

1. Agent calls `search_knowledge`
2. Server returns **HTTP 402** with payment details
3. Agent pays 0.001 USDC on Base Sepolia → gets tx hash
4. Agent retries with `X-Payment: <tx_hash>` header
5. Server verifies on-chain → returns result

Get free testnet USDC from [Circle faucet](https://faucet.circle.com) — select **Base Sepolia**.

---

## Available tools

| Tool | Cost | Description |
|------|------|-------------|
| `search_knowledge` | 0.001 USDC | Search the knowledge base |

---

## Build your own

Want to add x402 payments to your own MCP server? Use the payclaw SDK:

- **Python:** `pip install payclaw` → [docs](https://pypi.org/project/payclaw/)
- **JavaScript:** `npm install payclaw-x402`

---

## Support

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/F1F01XSFJ0)

---

<a name="繁體中文"></a>

# payclaw 示範 MCP 伺服器（繁體中文）

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/F1F01XSFJ0)

一個以 x402 付款把關的 MCP 伺服器。每次工具呼叫費用為 **0.001 USDC**（Base Mainnet 真實 USDC）。

> ⚠️ **正式環境 — 實際收費。** 每次 `tools/call` 請求需在 Base Mainnet 支付 USDC。你的 AI Agent 必須支援 [x402 協議](https://github.com/coinbase/x402) 才能自動付款。標準 Claude Desktop 不會自動付款 — 需要支援 x402 的 Agent 框架。

**端點：** `https://payclaw-mcp.vercel.app/api/mcp`

使用 [payclaw](https://pypi.org/project/payclaw/) 構建 — 適用於 MCP 伺服器的 x402 支付中介軟體。

---

## 在 Claude Desktop 使用

安裝 [mcp-remote](https://github.com/geelen/mcp-remote)，然後加入 Claude Desktop 設定檔：

**macOS：** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows：** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "payclaw-demo": {
      "command": "npx",
      "args": ["mcp-remote", "https://payclaw-mcp.vercel.app/api/mcp"]
    }
  }
}
```

重啟 Claude Desktop，`search_knowledge` 工具即可使用。

---

## 在 Cursor 使用

在專案的 `.cursor/mcp.json` 加入：

```json
{
  "mcpServers": {
    "payclaw-demo": {
      "command": "npx",
      "args": ["mcp-remote", "https://payclaw-mcp.vercel.app/api/mcp"]
    }
  }
}
```

---

## 付款流程

1. Agent 呼叫 `search_knowledge`
2. 伺服器返回 **HTTP 402**，附上付款資訊
3. Agent 在 Base Mainnet 支付 0.001 USDC → 取得 tx hash
4. Agent 帶上 `X-Payment: <tx_hash>` header 重試
5. 伺服器在鏈上驗證 → 返回結果

從 [Circle faucet](https://faucet.circle.com) 免費取得測試網 USDC — 選擇 **Base Sepolia**。

---

## 可用工具

| 工具 | 費用 | 說明 |
|------|------|------|
| `search_knowledge` | 0.001 USDC | 搜尋知識庫 |

---

## 自行建置

想在自己的 MCP 伺服器加入 x402 付款？使用 payclaw SDK：

- **Python：** `pip install payclaw` → [文件](https://pypi.org/project/payclaw/)
- **JavaScript：** `npm install payclaw-x402`

---

## 支持開發

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/F1F01XSFJ0)
