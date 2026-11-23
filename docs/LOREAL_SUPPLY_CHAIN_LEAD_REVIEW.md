# Supply-chain lead review: Order Recovery Lab

## Executive assessment

Order Recovery Lab has a credible first product wedge: help a planner investigate an exception that threatens a customer commitment, see the affected upstream dependencies, compare feasible recovery choices, and preserve a reviewable decision trail. That is relevant to a beauty company because packaging availability, manufacturing capacity, batch release, remaining shelf life, market eligibility, and retailer or e-commerce due dates can interact.

The current product is a controlled operational prototype, not a L’Oréal-ready control tower. Its deterministic planner and controlled execution ledger are real application behaviour. The displayed operational evidence is example data, and ERPNext is an optional adapter rather than a validated L’Oréal connection. The workbench must not be positioned as live L’Oréal inventory, a production autonomous agent, or an enterprise-wide supply-chain intelligence tower.

## What is useful today

- A planner can model supplier, factory, distribution-centre, and customer nodes in one dependency network.
- The deterministic engine accounts for batch status, availability date, expiry and shelf life, market labels, reservations, safety stock, route capacity, and production capacity.
- Supplier, warehouse, and transport disruptions can be applied as explicit evidence events; the plan is recomputed from records rather than taking a model-generated quantity as fact.
- Fast and lower-cost schedules can be compared with move-level estimates, shared route charges, capacity usage, remaining gaps, and evidence IDs.
- Review, approval, controlled execution, and receipt verification are distinct states. Stale evidence and past arrivals are gated from review and approval.
- A bounded AI investigation can inspect application tools and return an advisory recommendation that is checked against the deterministic engine. The model cannot approve or execute a transfer.

## Product gaps before an enterprise pilot

### 1. Prove the source-to-decision chain with customer systems

The UI and API evidence must identify the source record, extraction time, owner system, and mapping rule for each order, batch, reservation, route, and production constraint. The current source landscape calls SAP and several other enterprise systems contract-only; the sample editor is not an ERP feed. Before a customer pilot, agree a read-only interface for the selected ERP, WMS, TMS, MES, and supplier signal, then validate it against the customer's real master data and permissions.

### 2. Establish a safe operating boundary

Pilot in shadow or recommendation mode first. A named planner must review the exact records, assumptions, affected customer commitments, and unresolved evidence. A different named approver must authorise any operational draft. Dispatch, ERP document submission, and physical receipt must each require their own explicit authority and matching evidence. The controlled adapter is valuable for testing code paths, but it is not proof of a real warehouse movement.

### 3. Expand the planning model only when the pilot needs it

The current model is deliberately bounded: at most two inputs per recipe, a small network and short horizon, whole units, GBP-only costs, and simplified timing. A customer's production release needs may require multi-level bills of material, pallet and case conversions, minimum order quantities, supplier lead-time distributions, calendars and shifts, changeovers, batch genealogy, quality release, regional labelling, multi-currency costing, and transport cut-offs. These should be requirements from one chosen pilot process, not claims inferred from this demo.

### 4. Make recommendations immediately actionable

For each affected commitment, show a plain-language exception, what changed, why each source is eligible, the chosen and rejected alternatives, service and cost trade-offs, expected arrival, latest safe action, accountable owner, and evidence freshness. Present customer service exposure separately from purchase, production, and replenishment gaps. Keep an explicit “not enough evidence” outcome instead of smoothing uncertainty into a score.

### 5. Demonstrate operational value with a measured pilot

Select one market, one plant-to-DC flow, a small group of products, and one exception class such as late packaging inbound. Record a baseline and the same measures during the pilot: time from alert to decision, customer units recovered by promise date, expedite cost, planner touch time, and recommendations accepted or rejected. Use customer-verified source data and publish sample size, exclusions, and calculation rules. Do not call modelled avoided loss realised savings.

## Test dataset included with this release

`examples/beauty-network-validation.json` is an illustrative, synthetic beauty distribution network. It contains a primary and contingency packaging source, two material inputs, a filling line with a maintenance day, two distribution centres, retail and online commitments, a held batch, a market-restricted batch, a short-life batch, and normal and express routes.

Open **Settings → Orders and stock → Load validation dataset**. The fixture's scenario dates are shifted to the current date when loaded. In public mode, select **Preview and recalculate** to run it temporarily. In an authenticated workspace, loading changes the editor draft; **Save and recalculate** persists that dataset to the workspace, so do not select it when you intend a temporary test.

The supplier-delay, warehouse-hold, and route-unavailable controls reuse the validated event path against the test fixture. The dataset is not L’Oréal data, is not connected to an ERP, and does not demonstrate customer-specific rules.

## Lead recommendation

Offer a controlled technical evaluation of one source-to-destination exception flow, with customer-owned read-only evidence and a planner in the loop. The current application is strong enough to show the decision-engine mechanics and evidence boundary. It needs verified system adapters, true multi-user maker-checker access, customer-specific planning rules, and operator-tested workflows before it can be proposed as an operational product.
