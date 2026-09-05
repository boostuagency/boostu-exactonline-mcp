#!/usr/bin/env tsx
/**
 * Validate every default $select against what Exact Online really exposes.
 *
 * Modes (pick one):
 *   --metadata        fetch /api/v1/{division}/$metadata once and check every
 *                     select against the EntityType definitions (the source of
 *                     truth; covers empty collections too)
 *   --live            GET <resource>?$top=1 without $select per resource and use
 *                     the keys of the first row; collections without rows are
 *                     reported as unverifiable
 *   --fixture         offline: use test/fixtures/exact-properties.json
 *
 * Credentials for --metadata and --live, from the environment (a .env is read):
 *   EXACT_ACCESS_TOKEN                      a valid access token, or
 *   EXACT_CLIENT_ID + EXACT_CLIENT_SECRET + EXACT_REFRESH_TOKEN (the DIY set)
 *   EXACT_REGION (default be), EXACT_DIVISION (default: current division)
 *
 * --write-fixture with --live rewrites the fixture from what was observed.
 * Exits 1 on any unknown property.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ExactAuth } from "../src/api/auth.js";
import { resolveBaseUrl } from "../src/lib/region.js";
import {
  ALL_RESOURCES, collectSelectUsages, entitySetName, propertiesFromMetadata,
  propertyNamesFromRow, validateSelects, type ValidationReport,
} from "../src/lib/selectValidation.js";

function loadDotEnv(path = ".env"): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function accessToken(): Promise<string> {
  if (process.env.EXACT_ACCESS_TOKEN) return process.env.EXACT_ACCESS_TOKEN;
  const { EXACT_CLIENT_ID, EXACT_CLIENT_SECRET, EXACT_REFRESH_TOKEN } = process.env;
  if (!EXACT_CLIENT_ID || !EXACT_CLIENT_SECRET || !EXACT_REFRESH_TOKEN) {
    throw new Error("Set EXACT_ACCESS_TOKEN, or EXACT_CLIENT_ID + EXACT_CLIENT_SECRET + EXACT_REFRESH_TOKEN.");
  }
  const auth = new ExactAuth({ clientId: EXACT_CLIENT_ID, clientSecret: EXACT_CLIENT_SECRET, refreshToken: EXACT_REFRESH_TOKEN, baseUrl: base() });
  return auth.getAccessToken();
}

function base(): string {
  return resolveBaseUrl(process.env.EXACT_REGION ?? process.env.EXACT_BASE_URL);
}

async function getJson(url: string, token: string): Promise<{ status: number; body: any }> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* keep text */ }
  return { status: res.status, body };
}

async function division(token: string): Promise<number> {
  if (process.env.EXACT_DIVISION) return Number(process.env.EXACT_DIVISION);
  const { body } = await getJson(`${base()}/api/v1/current/Me?$select=CurrentDivision`, token);
  const row = Array.isArray(body?.d) ? body.d[0] : body?.d?.results?.[0];
  if (!row?.CurrentDivision) throw new Error("Could not resolve the current division; set EXACT_DIVISION.");
  return row.CurrentDivision;
}

async function fromMetadata(token: string): Promise<Record<string, string[]>> {
  const div = await division(token);
  const res = await fetch(`${base()}/api/v1/${div}/$metadata`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/xml" } });
  if (!res.ok) throw new Error(`$metadata failed: ${res.status} ${await res.text()}`);
  const sets = propertiesFromMetadata(await res.text());
  // Map each resource path onto its entity set by the last path segment.
  const byResource: Record<string, string[]> = {};
  const resources = new Set([...ALL_RESOURCES.map((d) => d.resource), "current/Me"]);
  for (const r of resources) {
    const set = sets[entitySetName(r)];
    if (set) byResource[r] = set;
  }
  return byResource;
}

async function fromLive(token: string): Promise<{ properties: Record<string, string[]>; skipped: Record<string, string> }> {
  const div = await division(token);
  const properties: Record<string, string[]> = {};
  const skipped: Record<string, string> = {};
  const resources = [...new Set([...ALL_RESOURCES.map((d) => d.resource), "current/Me"])];
  for (const r of resources) {
    const url = r === "current/Me" ? `${base()}/api/v1/current/Me?$top=1` : `${base()}/api/v1/${div}/${r}?$top=1`;
    const { status, body } = await getJson(url, token);
    if (status !== 200) { skipped[r] = `${status}: ${typeof body === "string" ? body.slice(0, 80) : JSON.stringify(body).slice(0, 80)}`; continue; }
    const rows: Record<string, unknown>[] = Array.isArray(body?.d) ? body.d : body?.d?.results ?? [];
    if (!rows.length) { skipped[r] = "no rows"; continue; }
    properties[r] = propertyNamesFromRow(rows[0]);
    // Exact allows 60 calls a minute per app and company.
    await new Promise((f) => setTimeout(f, 1100));
  }
  return { properties, skipped };
}

function print(report: ValidationReport, skipped: Record<string, string> = {}): void {
  for (const f of report.failed) console.log(`FAIL  ${f.owner}  (${f.resource})  unknown: ${f.unknown.join(", ")}`);
  for (const u of report.unverifiable) console.log(`SKIP  ${u.owner}  (${u.resource})  ${skipped[u.resource] ?? "no property set available"}`);
  console.log(`\n${report.ok.length} ok, ${report.failed.length} failed, ${report.unverifiable.length} unverifiable`);
}

async function main(): Promise<void> {
  loadDotEnv();
  const args = new Set(process.argv.slice(2));
  const usages = collectSelectUsages();
  let report: ValidationReport;
  let skipped: Record<string, string> = {};

  if (args.has("--fixture")) {
    const fx = JSON.parse(readFileSync("test/fixtures/exact-properties.json", "utf8"));
    report = validateSelects(usages, fx.verified);
    skipped = fx.unverified;
  } else if (args.has("--live")) {
    const token = await accessToken();
    const live = await fromLive(token);
    skipped = live.skipped;
    report = validateSelects(usages, live.properties);
    if (args.has("--write-fixture")) {
      const fx = { $comment: "Regenerated by scripts/validate-selects.ts --live --write-fixture", source: { region: process.env.EXACT_REGION ?? "be", division: await division(token), observed: new Date().toISOString().slice(0, 10), method: "live rows" }, verified: live.properties, unverified: live.skipped };
      writeFileSync("test/fixtures/exact-properties.json", JSON.stringify(fx, null, 1) + "\n");
      console.log("fixture written");
    }
  } else {
    const token = await accessToken();
    report = validateSelects(usages, await fromMetadata(token));
  }
  print(report, skipped);
  process.exit(report.failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
