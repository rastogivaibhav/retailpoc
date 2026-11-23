# Pilot demo notes

Order Recovery Lab can be exercised with controlled data across all six workspace modules: Overview, Orders at risk, Recovery options, Track actions, Results, and Pilot toolkit. The built-in scenario set covers supplier delay, warehouse stock hold, and route unavailability. These records are illustrative and do not represent a customer's live operations.

Live ERP, WMS, and supplier data requires a customer-specific adapter. The connector contract is defined, but those production adapters have not been built.

Cost figures are modelled estimates based on configured rates and gross order value. They are not finance-validated P&L. Procurement and Finance must confirm the rates before a plan is approved.

Supplier expedite generates and tracks a draft message. It does not send automatically; sending is always a manual human action through an approved channel.
