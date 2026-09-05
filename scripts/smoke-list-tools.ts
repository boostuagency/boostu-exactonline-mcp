#!/usr/bin/env tsx
/**
 * Call every *_list tool with top=1 and report, per tool: ok, an HTTP error
 * from Exact, or empty. Listing is a GET, so nothing here writes, whatever
 * create or update siblings a tool has.
 *
 * Against a hosted tenant:   MCP_URL=https://exact-mcp.boostu.be/t/<token>/mcp npm run smoke:list
 * Against the local server:  set the DIY EXACT_* variables and run without MCP_URL;
 *                            the script starts `node dist/index.js` over stdio.
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function loadDotEnv(path = ".env"): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

type Outcome = { tool: string; status: "ok" | "empty" | "error"; detail?: string };

async function main(): Promise<void> {
  loadDotEnv();
  const client = new Client({ name: "smoke-list-tools", version: "1.0.0" });
  const transport = process.env.MCP_URL
    ? new StreamableHTTPClientTransport(new URL(process.env.MCP_URL))
    : new StdioClientTransport({ command: "node", args: ["dist/index.js"], env: process.env as Record<string, string> });
  await client.connect(transport);

  const { tools } = await client.listTools();
  const listTools = tools.map((t) => t.name).filter((n) => /^exact_.+_list$/.test(n)).sort();

  const outcomes: Outcome[] = [];
  for (const tool of listTools) {
    try {
      const res = await client.callTool({ name: tool, arguments: { top: 1 } });
      const text = (res.content as { type: string; text?: string }[]).map((c) => c.text ?? "").join("");
      if (res.isError) {
        const m = text.match(/:\s(\d{3})\s/);
        outcomes.push({ tool, status: "error", detail: m ? `HTTP ${m[1]}` : text.slice(0, 100) });
      } else {
        let rows = -1;
        try { const j = JSON.parse(text); rows = Array.isArray(j?.data) ? j.data.length : -1; } catch { /* not a list envelope */ }
        outcomes.push({ tool, status: rows === 0 ? "empty" : "ok", detail: rows >= 0 ? `${rows} row(s)` : undefined });
      }
    } catch (e) {
      outcomes.push({ tool, status: "error", detail: (e as Error).message.slice(0, 100) });
    }
    // Exact allows 60 calls a minute per app and company.
    await new Promise((f) => setTimeout(f, 1100));
  }
  await client.close();

  for (const o of outcomes) console.log(`${o.status.padEnd(6)} ${o.tool}${o.detail ? `  ${o.detail}` : ""}`);
  const count = (s: Outcome["status"]) => outcomes.filter((o) => o.status === s).length;
  console.log(`\n${count("ok")} ok, ${count("empty")} empty, ${count("error")} error, ${outcomes.length} tools`);
  process.exit(count("error") ? 1 : 0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
