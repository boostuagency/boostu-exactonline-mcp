import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ExactClient } from "./api/client.js";
import { enabledGroups, groupsFrom, isGroupEnabled } from "./lib/toolFilter.js";
import { isReadOnly, type ToolOptions } from "./lib/registerResource.js";

import { registerSystemTools } from "./tools/system.js";
import { registerRelationTools } from "./tools/relations.js";
import { registerSalesTools } from "./tools/sales.js";
import { registerPurchaseTools } from "./tools/purchase.js";
import { registerFinancialTools } from "./tools/financial.js";
import { registerReportTools } from "./tools/reports.js";
import { registerBankingTools } from "./tools/banking.js";
import { registerItemTools } from "./tools/items.js";
import { registerVatTools } from "./tools/vat.js";
import { registerDocumentTools } from "./tools/documents.js";

type Register = (server: McpServer, client: ExactClient, options?: ToolOptions) => void;

/** Group name to registrar. The keys are what EXACT_TOOLS accepts. */
const GROUPS: Record<string, Register> = {
  system: registerSystemTools,
  relations: registerRelationTools,
  sales: registerSalesTools,
  purchase: registerPurchaseTools,
  financial: registerFinancialTools,
  reports: registerReportTools,
  banking: registerBankingTools,
  items: registerItemTools,
  vat: registerVatTools,
  documents: registerDocumentTools,
};

export const GROUP_NAMES = Object.keys(GROUPS);

/**
 * Per-server overrides for the tool surface.
 *
 * Both fields default to the environment (EXACT_READ_ONLY, EXACT_TOOLS), which
 * is what a single-tenant stdio server wants. A host that builds one server per
 * tenant passes them explicitly instead: process.env is shared by every tenant
 * in the process, so it cannot say that one connection reads and another writes.
 */
export interface ServerOptions {
  /** Expose read tools only. Defaults to EXACT_READ_ONLY. */
  readOnly?: boolean;
  /**
   * Tool groups to expose, as an array or a comma-separated string. Defaults to
   * EXACT_TOOLS; null or an empty list means every group.
   */
  tools?: string[] | string | null;
}

export function createServer(client: ExactClient, options: ServerOptions = {}): McpServer {
  const readOnly = options.readOnly ?? isReadOnly();
  const enabled = options.tools === undefined ? enabledGroups() : groupsFrom(options.tools);

  const server = new McpServer({
    name: "exactonline", // client-facing id; kept stable for existing configs
    version: "1.0.0",
    description:
      "BoostU MCP server for Exact Online — relations, quotations, sales and purchase invoices, " +
      "the general ledger, banking, VAT, items and financial reports." +
      (readOnly ? " Running in read-only mode: no writes are exposed." : ""),
  });

  for (const [group, register] of Object.entries(GROUPS)) {
    if (isGroupEnabled(group, enabled)) register(server, client, { readOnly });
  }
  return server;
}
