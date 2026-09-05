import { describe, it, expect, vi } from "vitest";
import { registerResource, type ResourceDef } from "../src/lib/registerResource.js";
import type { ExactClient } from "../src/api/client.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

type Handler = (p: Record<string, unknown>) => Promise<unknown>;

/** Capture the handler registerResource hands to the server for one tool. */
function capture(def: ResourceDef, listMock: ReturnType<typeof vi.fn>): Handler {
  const handlers: Record<string, Handler> = {};
  const server = {
    tool: (name: string, _desc: string, _schema: unknown, handler: Handler) => {
      handlers[name] = handler;
    },
  } as unknown as McpServer;
  const client = { list: listMock, get: vi.fn() } as unknown as ExactClient;
  registerResource(server, client, def);
  return handlers[`exact_${def.name}_list`];
}

const def: ResourceDef = {
  name: "accounts",
  resource: "crm/Accounts",
  label: "accounts",
  ops: ["list"],
  defaultSelect: "ID,Code,Name",
};

describe("generated list tool paging", () => {
  it("sends no top when the caller leaves it out, so Exact pages with __next", async () => {
    const list = vi.fn().mockResolvedValue({ data: [] });
    const handler = capture(def, list);
    await handler({});
    expect(list).toHaveBeenCalledTimes(1);
    const query = list.mock.calls[0][1] as Record<string, unknown>;
    expect(query.top).toBeUndefined();
    expect("top" in query ? query.top : undefined).toBeUndefined();
    expect(query.select).toBe("ID,Code,Name");
  });

  it("passes top through when the caller caps the result", async () => {
    const list = vi.fn().mockResolvedValue({ data: [] });
    const handler = capture(def, list);
    await handler({ top: 1 });
    const query = list.mock.calls[0][1] as Record<string, unknown>;
    expect(query.top).toBe(1);
  });

  it("forwards the skiptoken from a previous page", async () => {
    const list = vi.fn().mockResolvedValue({ data: [] });
    const handler = capture(def, list);
    await handler({ skiptoken: "guid'abc'" });
    const query = list.mock.calls[0][1] as Record<string, unknown>;
    expect(query.skiptoken).toBe("guid'abc'");
    expect(query.top).toBeUndefined();
  });

  it("prefers the caller's select over the default", async () => {
    const list = vi.fn().mockResolvedValue({ data: [] });
    const handler = capture(def, list);
    await handler({ select: "ID" });
    const query = list.mock.calls[0][1] as Record<string, unknown>;
    expect(query.select).toBe("ID");
  });
});
