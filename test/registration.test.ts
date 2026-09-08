import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const registered: string[] = [];
type Handler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: { text: string }[] }>;
const handlers = new Map<string, Handler>();
let serverInfo: { description?: string } = {};
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => {
  return {
    McpServer: class {
      constructor(opts: { description?: string }) {
        serverInfo = opts;
      }
      tool(name: string, _description?: string, _schema?: unknown, handler?: Handler) {
        registered.push(name);
        if (handler) handlers.set(name, handler);
      }
    },
  };
});

/** Re-import server.ts with a clean module cache so env changes take effect. */
async function register(options?: unknown): Promise<string[]> {
  vi.resetModules();
  registered.length = 0;
  handlers.clear();
  serverInfo = {};
  const { createServer } = await import("../src/server.js");
  createServer({} as never, options as never);
  return [...registered];
}

describe("createServer", () => {
  beforeEach(() => {
    delete process.env.EXACT_TOOLS;
    delete process.env.EXACT_READ_ONLY;
  });
  afterEach(() => {
    delete process.env.EXACT_TOOLS;
    delete process.env.EXACT_READ_ONLY;
  });

  it("registers a tool from every group by default", async () => {
    const tools = await register();
    for (const name of [
      "exact_me",
      "exact_divisions_list",
      "exact_request",
      "exact_record_delete",
      "exact_accounts_list",
      "exact_contacts_create",
      "exact_sales_invoices_list",
      "exact_sales_invoice_print",
      "exact_quotation_accept",
      "exact_purchase_entries_list",
      "exact_gl_accounts_list",
      "exact_transaction_lines_list",
      "exact_reporting_balance_list",
      "exact_receivables_list",
      "exact_overdue_receivables",
      "exact_bank_entry_lines_list",
      "exact_items_list",
      "exact_vat_codes_list",
      "exact_documents_list",
      "exact_document_attachment_add",
    ]) {
      expect(tools).toContain(name);
    }
  });

  it("generates list, create and update for a writable resource", async () => {
    const tools = await register();
    expect(tools).toContain("exact_accounts_list");
    expect(tools).toContain("exact_accounts_create");
    expect(tools).toContain("exact_accounts_update");
  });

  it("folds reading one record into the list tool instead of a separate get", async () => {
    const tools = await register();
    expect(tools.filter((t) => t.endsWith("_get"))).toEqual([]);
  });

  it("offers a single generic delete rather than one per collection", async () => {
    const tools = await register();
    expect(tools).toContain("exact_record_delete");
    expect(tools.filter((t) => t.endsWith("_delete"))).toEqual(["exact_record_delete"]);
  });

  it("exposes read-only report resources without write tools", async () => {
    const tools = await register();
    expect(tools).toContain("exact_receivables_list");
    expect(tools).not.toContain("exact_receivables_create");
    expect(tools).not.toContain("exact_transaction_lines_create");
  });

  it("honours EXACT_TOOLS to restrict groups", async () => {
    process.env.EXACT_TOOLS = "reports";
    const tools = await register();
    expect(tools).toContain("exact_receivables_list");
    expect(tools).not.toContain("exact_accounts_list");
    expect(tools).not.toContain("exact_me");
  });

  it("drops every write tool when EXACT_READ_ONLY is set", async () => {
    process.env.EXACT_READ_ONLY = "true";
    const tools = await register();
    expect(tools).toContain("exact_accounts_list");
    expect(tools).not.toContain("exact_accounts_create");
    expect(tools).not.toContain("exact_accounts_update");
    expect(tools).not.toContain("exact_record_delete");
    expect(tools).not.toContain("exact_sales_invoice_print");
    expect(tools).not.toContain("exact_document_attachment_add");
  });

  it("registers no duplicate tool names", async () => {
    const tools = await register();
    expect(new Set(tools).size).toBe(tools.length);
  });
});

/**
 * A host that serves several tenants from one process cannot express the tool
 * surface through process.env, so createServer takes it as options. These pin
 * that the options win over the environment in both directions.
 */
describe("createServer options", () => {
  beforeEach(() => {
    delete process.env.EXACT_TOOLS;
    delete process.env.EXACT_READ_ONLY;
  });
  afterEach(() => {
    delete process.env.EXACT_TOOLS;
    delete process.env.EXACT_READ_ONLY;
  });

  it("readOnly true drops every write tool even with the environment unset", async () => {
    const tools = await register({ readOnly: true });
    expect(tools).toContain("exact_accounts_list");
    expect(tools).not.toContain("exact_accounts_create");
    expect(tools).not.toContain("exact_accounts_update");
    expect(tools).not.toContain("exact_record_delete");
    expect(tools).not.toContain("exact_sales_invoice_print");
    expect(tools).not.toContain("exact_document_attachment_add");
  });

  it("readOnly false restores the write tools even when EXACT_READ_ONLY is set", async () => {
    process.env.EXACT_READ_ONLY = "true";
    const tools = await register({ readOnly: false });
    expect(tools).toContain("exact_accounts_create");
    expect(tools).toContain("exact_record_delete");
  });

  it("omitting readOnly leaves the environment in charge", async () => {
    process.env.EXACT_READ_ONLY = "true";
    expect(await register({})).not.toContain("exact_accounts_create");
    expect(await register()).not.toContain("exact_accounts_create");
  });

  it("announces read-only mode in the server description", async () => {
    await register({ readOnly: true });
    expect(serverInfo.description).toContain("read-only");
    await register({ readOnly: false });
    expect(serverInfo.description).not.toContain("read-only");
  });

  it("tools restricts the groups, and null means every group", async () => {
    process.env.EXACT_TOOLS = "system";
    const reports = await register({ tools: ["reports"] });
    expect(reports).toContain("exact_receivables_list");
    expect(reports).not.toContain("exact_accounts_list");

    const all = await register({ tools: null });
    expect(all).toContain("exact_accounts_list");
    expect(all).toContain("exact_receivables_list");
  });

  it("refuses a write method through the exact_request escape hatch when read-only", async () => {
    await register({ readOnly: true });
    const request = handlers.get("exact_request")!;
    const res = await request({ resource: "crm/Accounts", method: "POST", body: { Name: "x" } });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("read-only");
  });
});
