import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  ALL_RESOURCES, collectSelectUsages, entitySetName, propertiesFromMetadata,
  propertyNamesFromRow, splitSelect, validateSelects,
} from "../src/lib/selectValidation.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/exact-properties.json", import.meta.url), "utf8")) as {
  verified: Record<string, string[]>; unverified: Record<string, string>;
};

describe("default selects against the observed Exact properties", () => {
  const usages = collectSelectUsages();
  const report = validateSelects(usages, fixture.verified);

  it("covers every list tool with a default select, plus the convenience tools", () => {
    const owners = usages.map((u) => u.owner);
    expect(owners).toContain("exact_me");
    expect(owners).toContain("exact_overdue_receivables");
    expect(owners).toContain("exact_receivables_list");
    expect(usages.length).toBeGreaterThan(50);
  });

  it("has no unknown property in any verified default select", () => {
    const lines = report.failed.map((f) => `${f.owner} (${f.resource}): ${f.unknown.join(", ")}`);
    expect(lines).toEqual([]);
  });

  it("only leaves selects unverified for resources the fixture explains", () => {
    for (const u of report.unverifiable) {
      expect(fixture.unverified[u.resource], `${u.resource} is neither verified nor listed as unverified`).toBeDefined();
    }
  });

  it("pins the bugs that were live: the renamed and removed properties", () => {
    const by = Object.fromEntries(usages.map((u) => [u.owner, splitSelect(u.select)]));
    expect(by.exact_me).not.toContain("ThreadId");
    expect(by.exact_divisions_list).toEqual(expect.arrayContaining(["Hid", "IsMainDivision"]));
    expect(by.exact_divisions_list).not.toContain("HID");
    expect(by.exact_divisions_list).not.toContain("Main");
    for (const t of ["exact_receivables_list", "exact_payables_list", "exact_overdue_receivables"]) {
      expect(by[t]).toContain("CurrencyCode");
      expect(by[t]).not.toContain("Currency");
      expect(by[t]).not.toContain("Status");
    }
    expect(by.exact_transaction_lines_list).not.toContain("AmountVATDC");
    expect(by.exact_transaction_lines_list).toContain("AmountVATFC");
  });

  it("every resource in the server is either verified or explained", () => {
    for (const def of ALL_RESOURCES) {
      const known = fixture.verified[def.resource] !== undefined || fixture.unverified[def.resource] !== undefined;
      expect(known, def.resource).toBe(true);
    }
  });
});

describe("property extraction", () => {
  it("drops __metadata and deferred navigation links from a live row", () => {
    expect(propertyNamesFromRow({
      __metadata: { uri: "x" }, ID: "1", Notes: { __deferred: { uri: "y" } }, Amount: 3, Empty: null,
    })).toEqual(["ID", "Amount", "Empty"]);
  });

  it("reads entity types and sets out of an EDMX document", () => {
    const edmx = `<Schema><EntityType Name="Account"><Key/><Property Name="ID" Type="Edm.Guid"/><Property Name="Name" Type="Edm.String"/><NavigationProperty Name="BankAccounts"/></EntityType>
      <EntityType Name="Receivable"><Property Name="HID"/><Property Name="CurrencyCode"/></EntityType>
      <EntityContainer><EntitySet Name="Accounts" EntityType="Exact.Web.Api.Models.Account"/><EntitySet Name="ReceivablesList" EntityType="Exact.Web.Api.Models.Receivable"/></EntityContainer></Schema>`;
    const sets = propertiesFromMetadata(edmx);
    expect(sets.Accounts).toEqual(["ID", "Name", "BankAccounts"]);
    expect(sets.ReceivablesList).toEqual(["HID", "CurrencyCode"]);
    expect(entitySetName("read/financial/ReceivablesList")).toBe("ReceivablesList");
    expect(entitySetName("current/Me")).toBe("Me");
  });

  it("reports unknown properties per select and never counts a missing set as ok", () => {
    const r = validateSelects(
      [{ owner: "a", resource: "x/A", select: "ID,Nope" }, { owner: "b", resource: "x/B", select: "ID" }],
      { "x/A": ["ID", "Name"] },
    );
    expect(r.failed).toEqual([{ owner: "a", resource: "x/A", unknown: ["Nope"] }]);
    expect(r.unverifiable.map((u) => u.owner)).toEqual(["b"]);
    expect(r.ok).toEqual([]);
  });
});
