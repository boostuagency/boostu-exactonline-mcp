/**
 * Cross-check every default $select against the property names Exact
 * actually exposes. OData property names are case-sensitive and a single
 * unknown one makes the whole request fail with 400, so a typo in a default
 * silently breaks a tool for everyone. The names come from either the
 * $metadata document or a live row; see scripts/validate-selects.ts.
 */

import type { ResourceDef } from "./registerResource.js";
import { RESOURCES as banking } from "../tools/banking.js";
import { RESOURCES as documents } from "../tools/documents.js";
import { RESOURCES as financial } from "../tools/financial.js";
import { RESOURCES as items } from "../tools/items.js";
import { RESOURCES as purchase } from "../tools/purchase.js";
import { RESOURCES as relations } from "../tools/relations.js";
import { RESOURCES as reports, OVERDUE_SELECT } from "../tools/reports.js";
import { RESOURCES as sales } from "../tools/sales.js";
import { RESOURCES as system, ME_SELECT } from "../tools/system.js";
import { RESOURCES as vat } from "../tools/vat.js";

/** One $select the server sends by default, and the resource it targets. */
export interface SelectUsage {
  /** Tool or label that owns the select, for the report. */
  owner: string;
  resource: string;
  select: string;
}

export const ALL_RESOURCES: ResourceDef[] = [
  ...system, ...relations, ...sales, ...purchase, ...financial,
  ...reports, ...banking, ...items, ...vat, ...documents,
];

/** Every default select the server can send, including the convenience tools' inline ones. */
export function collectSelectUsages(defs: ResourceDef[] = ALL_RESOURCES): SelectUsage[] {
  const usages: SelectUsage[] = [];
  for (const def of defs) {
    if (def.defaultSelect) usages.push({ owner: `exact_${def.name}_list`, resource: def.resource, select: def.defaultSelect });
  }
  usages.push({ owner: "exact_me", resource: "current/Me", select: ME_SELECT });
  usages.push({ owner: "exact_overdue_receivables", resource: "read/financial/ReceivablesList", select: OVERDUE_SELECT });
  return usages;
}

export function splitSelect(select: string): string[] {
  return select.split(",").map((s) => s.trim()).filter(Boolean);
}

export interface Finding {
  owner: string;
  resource: string;
  /** Properties in the select that the resource does not have. */
  unknown: string[];
}

export interface ValidationReport {
  /** Selects checked against a known property set and found clean. */
  ok: SelectUsage[];
  /** Selects with at least one unknown property. */
  failed: Finding[];
  /** Selects whose resource has no known property set, so nothing could be checked. */
  unverifiable: SelectUsage[];
}

/**
 * Compare selects against a map of resource path to its property names.
 * A resource missing from the map is reported as unverifiable, never as ok.
 */
export function validateSelects(usages: SelectUsage[], properties: Record<string, string[]>): ValidationReport {
  const report: ValidationReport = { ok: [], failed: [], unverifiable: [] };
  for (const u of usages) {
    const known = properties[u.resource];
    if (!known) { report.unverifiable.push(u); continue; }
    const set = new Set(known);
    const unknown = splitSelect(u.select).filter((p) => !set.has(p));
    if (unknown.length) report.failed.push({ owner: u.owner, resource: u.resource, unknown });
    else report.ok.push(u);
  }
  return report;
}

/** Keys of a live row, minus OData bookkeeping and deferred navigation links. */
export function propertyNamesFromRow(row: Record<string, unknown>): string[] {
  return Object.entries(row)
    .filter(([k, v]) => k !== "__metadata" && !(v && typeof v === "object" && "__deferred" in (v as object)))
    .map(([k]) => k);
}

/**
 * Pull entity types and entity sets out of an EDMX ($metadata) document with
 * plain regexes: the document is large but regular, and this avoids an XML
 * dependency. Returns property names keyed by entity-set name.
 */
export function propertiesFromMetadata(edmx: string): Record<string, string[]> {
  const types: Record<string, string[]> = {};
  const typeRe = /<EntityType\s+Name="([^"]+)"[^>]*>([\s\S]*?)<\/EntityType>/g;
  for (const m of edmx.matchAll(typeRe)) {
    const props = [...m[2].matchAll(/<(?:Property|NavigationProperty)\s+Name="([^"]+)"/g)].map((p) => p[1]);
    types[m[1]] = props;
  }
  const sets: Record<string, string[]> = {};
  const setRe = /<EntitySet\s+Name="([^"]+)"\s+EntityType="([^"]+)"/g;
  for (const m of edmx.matchAll(setRe)) {
    const typeName = m[2].split(".").pop()!;
    if (types[typeName]) sets[m[1]] = types[typeName];
  }
  return sets;
}

/** The entity-set name a resource path maps to in $metadata: its last segment. */
export function entitySetName(resource: string): string {
  return resource.split("/").filter(Boolean).pop()!;
}
