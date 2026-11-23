# Order Recovery Lab architecture

This is a working supply-chain application for investigating delayed inbound supply and executing reviewed transfers in its own inventory ledger. It is not connected to L’Oréal or an external ERP. Controlled transactions establish reproducible engineering behaviour, not customer savings.

## Problem and implemented scope
A revised inbound arrival can leave customer orders without supply by their promised dates. The application computes uncovered demand and evaluates a transfer from another distribution centre, protecting existing reservations, quality status, market eligibility, remaining shelf life, safety stock, open source-site demand, transit time and shared lane capacity.

One owner-private workspace supports multiple SKUs and sites. Initial data contains two distribution centres and four open orders. All quantities are whole units. Money is integer GBP pence. No FX, partial pallets, packaging conversion, customs, transport calendars or automated dispatch tracking are implemented.

## Runtime
Browser → React workbench → same-origin HTTP API → domain engine → Cloudflare D1.

The hosted platform runs TypeScript on Cloudflare Workers. This implementation uses the platform's supported runtime rather than claiming an unexecuted C# service. The deterministic domain module has no cloud dependency and is exercised directly by Node tests. An optional NVIDIA Nemotron agent calls bounded investigation tools. Numeric recommendations and references are validated against this domain module; model explanations remain advisory.

The UI never calculates authoritative stock changes. All mutations are evaluated server-side. Browser storage is not used for inventory or business records.

## Persistence and consistency
A schema migration creates `workspaces(id, revision, snapshot, updated_at)`. `snapshot` is the bounded operational aggregate: input records, transfers, event trail and idempotency results. State and events update in one SQL UPDATE with `WHERE revision = expectedRevision`; zero affected rows means a concurrent update and HTTP 409. A rejected action commits no state. This simple single-workspace aggregate avoids partially committed reservations in a small demonstration. It is not a design for an unbounded multi-tenant enterprise ledger.

For scale, split stock balances, allocations, commands and journal entries into normalised tables and introduce workflow jobs and an outbox. This is future work, not implemented functionality. D1 backup and platform access are infrastructure concerns; DR and enterprise access reviews have not been completed.

## Input contract
A JSON dataset includes label, asOf date, lots, orders, inbounds, lanes and safety stock. See `examples/controlled-dataset.json`.

Lot: id, sku, site, qty, reserved, status (RELEASED/HOLD), expiry, market.
Order: id, customer, sku, site, qty, due, minShelfDays, market, unitValuePence.
Inbound: id, sku, site, qty, eta, expiry, market, status (CONFIRMED/RECEIVED).
Lane: id, from, to, days, capacity, fixedPence, unitPence.
Safety: sku, site, qty.

Orders represent remaining demand excluding any existing allocations. Lot reservations represent other commitments. Open source-site demand is conservatively protected in addition to reservations and safety. Inbound status RECEIVED means its stock must already exist in lots, so it is not counted again. The scenario planning date is fixed explicitly. Capacity is shared across the entire scenario; there is no daily schedule.

Data imports are schema checked, must contain at most 2000 records per collection and remain under the HTTP body limit. Unique IDs, dates, whole nonnegative quantities, reservation bounds and lane transit constraints are validated. No authoritative operational transfer state can be injected by import. Import/reset requires a reason and is blocked during outstanding transfers.

## Planning algorithm
1. Sort open orders by due date and ID.
2. Count already received transfer allocations for that specific order.
3. Allocate eligible unreserved destination batches using earliest expiry first.
4. Allocate confirmed inbound quantity arriving by the promise date, with eligible market and shelf life.
5. Count approved or dispatched transfer supply earmarked to the order when arrival is timely.
6. Record the remaining gap as current uncovered quantity.
7. Evaluate candidate lanes that can arrive on time. Exclude batches on hold, wrongly labelled for the market or below customer shelf-life requirements.
8. Protect source reservations, configured safety and open local demand. Share the remaining source stock and lane capacity across all proposed transfers.
9. Select at most one candidate lane per order. Calculate fixed + per-unit transport cost in integer pence.
10. Return quantity, remaining gap, evidence IDs and rejected constraints.

The lane selection is a greedy heuristic ordered by estimated full-gap cost. It does not guarantee globally optimal cost or the best partial-fill combination. Recommendations are feasible under modelled constraints, not optimality claims. No revenue is recorded as recovered. Exposure is uncovered units × supplied unit value.

## API
GET /api/workspace returns persistent state and a freshly calculated plan.
POST /api/workspace accepts JSON {action, expectedRevision, idempotencyKey, ...actionFields}.

Actions:
- delay: inboundId, eta
- approve: orderId
- dispatch: transferId
- receive: transferId
- import: dataset, reason
- reset: reason

Approval does not accept quantities or costs from the browser: these are recalculated. A repeated identical command key returns its stored result without mutation. Reusing a key for a different command returns 409. Stale revision returns 409. Validation errors return 400. Non-JSON POST returns 415. Cross-origin mutation returns 403. Database failures return 500 with no success claim. The platform owner-private gate protects the entire application; service requests rely on that platform boundary, not on arbitrary caller-supplied roles.

## Transfer lifecycle
RESERVED: source quantity remains on hand but becomes reserved.
DISPATCHED: source on hand and reservation decrease by the transfer quantity; units are counted in transit.
RECEIVED: destination batches are created with source provenance and reserved to the target order. In-transit units disappear. Replanning recognises the received allocation.

Receipt is an operator attestation against controlled inventory, not proof that a truck moved. The application preserves stock conservation across source, transit and destination. There is no external shipment or ERP confirmation.

## Security and evidence
New deployment is owner-private. Platform authentication protects browser access. Same-origin checks reject browser cross-origin actions; bodies must be JSON. All imported text is rendered through React escaping. Secrets do not enter the bundle. Actor identity comes from platform identity, with a clearly named owner-private service fallback for authorised service verification.

The snapshot includes timestamped events and UUIDs. Evidence is exportable. It is not externally attested, WORM or cryptographically tamper-proof. Separation of maker/checker roles and multi-user organisational access are not implemented. This is not production-ready for customer data.

## Verification
`node --experimental-strip-types --test tests/domain.test.mjs`
`node node_modules/typescript/bin/tsc --noEmit`
`node /path/to/sites/scripts/build-site.mjs`

Domain tests cover baseline, delay, invalid stock eligibility, safety stock, shared capacity, monetary calculation, reservation, state transitions, duplicate commands, stale commands, stock conservation, imports, restart via serialisation and 100 varied stock/capacity cases. Live API verification results are in the evidence package.

## NVIDIA investigation agent (implemented)

The workbench calls `POST /api/investigations` with a selected order, expected workspace revision and unique request ID. The server captures a revisioned input snapshot and SHA-256 fingerprint, then lets NVIDIA Nemotron 3 Super choose from four bounded tools: `inspect_order`, `inspect_supply`, `evaluate_recovery`, and `submit_recommendation`. All calls execute locally on the server against that captured workspace. They cannot approve, dispatch, receive, import data, access credentials or contact external business systems.

`submit_recommendation` requires the three evidence tools first. Decision, quantity, remaining gap and integer-pence cost must match the deterministic plan exactly. References must exist in the evidence and include the selected order and source batches. Policy `qualitative-v2` rejects digits outside observed evidence IDs in model prose: quantities, dates and arithmetic belong in validated fields. This was added after a real provider run returned a wrong arithmetic expression despite correct structured figures. Older runs remain in history, but their prose is suppressed and they cannot be reviewed as current agent proposals. Qualitative prose remains advisory and is not semantically guaranteed by numeric validation. Human approval still re-evaluates current inventory through the operational command endpoint. A revision change during inference marks the run stale.

Tool inputs, actual outputs, observed timing, provider-reported token counts, request count, model ID, actor, input fingerprint and outcome persist in `agent_runs`, separately from operational events. Raw reasoning tokens are not stored. Failures and partial traces remain inspectable. There is no deterministic or scripted fallback labelled as AI output. Six model requests, ten tools, a 90-second run deadline, per-request timeout, single-workspace lease, 10-second cooldown and 30 daily attempts bound this demo. AI input sizes are limited independently of deterministic dataset import. Cold starts and provider latency may still affect completion.

`GET/POST /api/ai-settings` exposes configuration status and accepts a replacement NVIDIA key within the owner-private site. It never returns a credential. `AI_SETTINGS_KEY`, an independent 256-bit runtime secret, protects the stored API key with AES-GCM, a random 96-bit nonce and fixed associated data. Only ciphertext, nonce and update time are in D1. A runtime `NVIDIA_API_KEY` binding can alternatively supply the credential. Neither value enters model messages, run evidence, source, or the client bundle. The provider endpoint and model are allowlisted constants. The owner-private Sites access gate protects both operational and configuration routes; this is not enterprise RBAC or maker/checker separation.

AI tables (`ai_settings`, `agent_runs`, `agent_control`) are created idempotently by the server at first use. Credentials are independent of dataset reset/import. Key rotation requires re-saving the provider key if the encryption secret is rotated; no automatic encryption-key migration or enterprise secret rotation is claimed. Data import/reset preserves investigation history; revisions identify historical runs.

## Changed-input demonstration datasets

- `examples/constrained-beauty.json`: first order 420 units, source on-hand 360, lane capacity 80, inbound delayed. SO-1001: shortage 340, transfer 80, residual 260, transport £61.
- `examples/no-recovery-beauty.json`: same dataset but the eligible source batch is on quality hold. SO-1001: shortage 340, transfer 0, escalation required.
- `examples/beauty-network-validation.json`: larger illustrative network with primary/contingency packaging supply, filling-line maintenance, multiple DCs, retail and online demand, quality/market/shelf-life exclusions, and finite normal/express routes. The sample editor shifts its scenario dates to the current date when this fixture is loaded. See `docs/LOREAL_SUPPLY_CHAIN_LEAD_REVIEW.md` for scope and pilot-readiness assessment.

These are explicitly controlled fixtures. They are downloadable from Data & boundaries and pass the same dataset validation and planning code as imported data.

## ERPNext connector and WMS simulator (2026-10-19)

The owner-private `Connections` view calls `/api/erpnext` and `/api/wms-simulator` through the existing Sites access boundary. No app connector is available for ERPNext; this integration uses the user's ERPNext API credentials directly over HTTPS.

ERPNext configuration is encrypted in D1 with AES-GCM under the existing runtime credential-protection secret, using a separate associated-data namespace. Plaintext credentials are not returned to the browser after saving or passed to the NVIDIA model. A connection is saved only after API-user authentication and Company read succeed. This release allows one-level `*.frappe.cloud` site origins only, rejects paths, ports and userinfo, and refuses HTTP redirects. A Frappe Cloud account alone does not establish an ERPNext connection.

Source inspection reads Company, Warehouse, Item, Sales Order, Bin and Batch independently, reports permission failures per type, and caps each list at 100 records with a truncation flag. Bin quantities are aggregate warehouse quantities; no batch quantity inference is made. These reads do not replace the planning dataset. Automatic order, commitment, market, quality and batch-stock mapping remains future work requiring the actual site's schema and business rules.

An explicit owner action can export one approved RESERVED internal transfer as a draft ERPNext Stock Entry (Material Transfer). The owner attests that the selected ERP item, stock UOM, warehouses and batches correspond to the approved internal records. The server checks current workspace revision, company/leaf warehouses, enabled stock item, source batch identity/expiry and exact approved quantities. Serialized items are refused. Batched items use ERPNext's serial/batch fields; exact compatibility and site customisations still require live validation. No submission API is exposed. Creating a draft does not reserve or move ERP stock and is not evidence of physical movement.

D1 reserves a unique export slot per internal transfer before the remote POST. Duplicate calls return the existing job. A timeout or unexpected provider response records UNKNOWN and does not retry the write. Reconciliation reads the named Stock Entry, or looks up its exact remarks marker if its name was not confirmed. It verifies company, item, quantities, warehouses, batch and marker before accepting docstatus. Zero or multiple matches require manual review. A submitted Stock Entry confirms an ERP document state only; the app ledger and physical receipt remain independent. There is no distributed transaction between ERPNext and D1 and no claim of exactly-once external execution.

WMS simulator events have the explicit source `WMS_SIMULATOR`. A standalone 100-unit controlled request or a copy of an approved internal transfer can be exercised. Valid paths are NEW → PICK_ACCEPTED → DISPATCHED → RECEIVED, NEW → PICK_REJECTED, or an accepted/dispatched pick → DISCREPANCY. Short observations require a discrepancy. D1 compare-and-set revisions and event IDs reject stale commands and changed duplicate payloads. Simulator events persist in separate tables and cannot mutate ERPNext or the operational inventory ledger.

Verification: 21 new integration unit tests use isolated transport stubs for ERP HTTP behavior and actual domain functions for mapping and simulator validation. They establish contract behavior, not a live ERP integration. The original 34 tests continue to pass. Live ERP authentication, reads, draft creation and reconciliation remain unverified until the user's actual site URL and API credentials are configured.
