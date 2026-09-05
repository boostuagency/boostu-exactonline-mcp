# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Every list tool returned `{"data": []}`.** Exact answers a bare array (`{"d": [...]}`)
  whenever `$top` is sent and the `results` / `__next` envelope only without it; the client
  read `d.results` and the list tools always sent `$top`. The client now reads both shapes,
  `next_skiptoken` comes from `__next` only, and `$top` is sent only when the caller passes
  `top`.
- **Default `select` lists named properties Exact does not have**, so calls failed with 400.
  Every default was validated against the live API; the renamed and removed fields per tool
  are listed in the pull request that fixed them
  (boostuagency/boostu-exactonline-mcp#2). Notable renames: `HID` → `Hid` and `Main` →
  `IsMainDivision` on divisions, `Currency` → `CurrencyCode` on the receivables and payables
  reports, `ReportingPeriod` / `ReportingYear` → `FinancialPeriod` / `FinancialYear` on
  general journal entries, `AmountVATDC` → `AmountVATFC` on transaction lines.
- `validate.mjs` no longer assumes the `results` envelope when listing divisions.

### Added

- `scripts/validate-selects.ts` (`npm run validate:selects`): checks every default `select`
  against `$metadata`, the live API or the checked-in fixture and exits 1 on any unknown
  property.
- `scripts/smoke-list-tools.ts` (`npm run smoke:list`): calls every `*_list` tool with
  `top: 1` over MCP and reports ok / HTTP error / empty per tool.
- `test/fixtures/exact-properties.json`: the property names observed on the live API, used by
  the tests to pin every default select.

### Changed

- The `top` argument is documented as a cap for a one-off answer that disables paging; leave
  it out to page through everything 60 at a time.

## [1.0.0] — 2026-09-02

Initial public release: an MCP server for the core of an Exact Online administration,
aimed at small and medium businesses.

### Added

- **OAuth2 with rotation handled properly.** Exact invalidates each refresh token the moment
  it is exchanged, so rotations are persisted to `EXACT_TOKEN_STORE` and concurrent refreshes
  are collapsed into a single in-flight request.
- **Every Exact region.** `EXACT_REGION` accepts `be`, `nl`, `de`, `fr`, `uk`, `es`, `com`, or
  a full base URL.
- **Multi-division support.** The current division is resolved once from `current/Me` and
  cached; `EXACT_DIVISION` pins it, and every tool takes a `division` argument so one
  connection can serve several companies.
- **147 tools across ten groups**: `system`, `relations`, `sales`, `purchase`, `financial`,
  `reports`, `banking`, `items`, `vat`, `documents`.
- **Pre-aggregated financial reports**: receivables, payables, aging on both sides,
  outstanding totals, profit and loss, revenue, journal status and VAT returns, plus a
  convenience `exact_overdue_receivables` that filters and sums what is past due.
- **Action tools** for the steps that are not plain CRUD: `exact_sales_invoice_print` books,
  prints and optionally emails an invoice; `exact_quotation_accept` and
  `exact_quotation_reject` move a quotation along; `exact_document_attachment_add` uploads a
  file.
- **Escape hatches**: `exact_request` reaches any Exact resource without a dedicated tool, and
  `exact_record_delete` removes a record from any collection.
- **Read-only mode.** `EXACT_READ_ONLY=true` registers no write tool at all, including the
  escape hatches.
- **Selectable tool groups** via `EXACT_TOOLS`.
- **Rate-limit awareness.** `X-RateLimit-*` headers are read on every response, surfaced by
  `exact_rate_limit_status`, and quoted back in the error message on a 429.
- **OAuth helper scripts**: `get-refresh-token.mjs`, `exchange-code.mjs`, `validate.mjs` and
  `test-mcp.mjs`.
- **Docker image** that boots without credentials so MCP introspection works before setup.
- Documentation: an authentication guide, a resource manifest with Exact's field conventions,
  and a Dutch practical guide for small businesses.

### Design notes

- Reading one record is the list tool with an `id` argument rather than a separate `_get`
  tool, and deleting is one generic tool rather than one per collection. Exact has enough
  near-identical collections that the alternative produced 227 tools, too many for an
  assistant to hold in context.
- Every resource declares a default `select`, so responses stay small unless the caller asks
  for more.

[Unreleased]: https://github.com/boostuagency/boostu-exactonline-mcp/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/boostuagency/boostu-exactonline-mcp/releases/tag/v1.0.0
