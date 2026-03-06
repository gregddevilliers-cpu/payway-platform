# CLAUDE_PRE_PRODUCTION.md — Final Modules Before Production

## Project Context

This is the **PayWay Platform** — a fleet management web application for BT Corp / Umanyano serving the South African taxi industry. Phase 1 and most of Phase 2 are complete. These five modules must be built before the platform goes to production.

## Critical Rules

- **Read before writing.** Before creating or editing ANY file, read the existing files in the same directory to match the patterns, naming conventions, folder structure, and coding style already in use.
- **Prisma is the ORM.** Schema lives in `backend/prisma/schema.prisma`. After any schema change, run `npx prisma migrate dev --name <description>` then `npx prisma generate`.
- **Match existing patterns exactly.** Route files, controllers, services, middleware (auth, RBAC, tenant scoping), error handling, response envelope `{ success, data, meta, errors }`, React Query hooks, page layouts, table components, form components — follow what already exists.
- **Multi-tenant.** Every query must scope to `operatorId`. Never return data across operators (unless Super Admin).
- **Soft deletes.** Use `deletedAt` timestamp, never hard delete.
- **TypeScript everywhere.** Frontend and backend.
- **Audit logging.** Log every create/update/delete to the audit trail using the existing auditService.
- **South African context.** ZAR currency (R 1,234.56), VAT rate is 15%, SAST timezone (UTC+2), SA vehicle registration formats.

---

## BUILD ORDER

1. Tag Lifecycle Management (build first — critical for fuel transaction authorisation)
2. Cost Centres (foundation for financial reporting)
3. VAT Breakdowns
4. Budget Variance Reporting (full version with cost centres)
5. Contract & Lease Tracking

---

## STEP 1 — Tag Lifecycle Management

Fuel tags are how drivers authorise transactions at forecourts. Each tag is a physical card/fob assigned to a vehicle. This module manages the full tag lifecycle: inventory, issuance, blocking, replacement, and transfer. Without this, there is no way to block a stolen tag or track which tag is on which vehicle.

### 1A — Prisma Schema

Add to `backend/prisma/schema.prisma`:

**Tag** model:
- id (UUID, primary key)
- operatorId (String, FK→Operator)
- tagNumber (String, required — the physical number printed on the tag, unique within operator)
- vehicleId (String, FK→Vehicle, optional — currently assigned vehicle, null if unassigned)
- status (String, default "unassigned" — unassigned, active, blocked, lost, expired, decommissioned)
- blockedReason (String, optional — required when status is blocked: stolen, damaged, fraud_suspected, operator_request, system_block, other)
- issuedDate (DateTime, optional — when first assigned to a vehicle)
- expiryDate (DateTime, optional — tag expiry date if applicable)
- activatedAt (DateTime, optional — when tag was set to active)
- blockedAt (DateTime, optional — when tag was blocked)
- lastUsedAt (DateTime, optional — timestamp of last fuel transaction)
- lastUsedForecourtId (String, optional — forecourt of last transaction)
- notes (String, optional)
- createdAt (DateTime)
- updatedAt (DateTime)
- deletedAt (DateTime, optional)

**TagHistory** model (immutable log of every tag event):
- id (UUID, primary key)
- tagId (String, FK→Tag)
- operatorId (String, FK→Operator)
- action (String, required — created, assigned, unassigned, activated, blocked, unblocked, transferred, replaced, lost_reported, expired, decommissioned)
- fromVehicleId (String, optional — previous vehicle for transfers)
- toVehicleId (String, optional — new vehicle for assignments/transfers)
- previousStatus (String, optional)
- newStatus (String, required)
- reason (String, optional — why the action happened)
- performedBy (String, required — user ID)
- createdAt (DateTime)

**Important:** TagHistory has NO updatedAt and NO deletedAt. It is an immutable log — entries cannot be modified or deleted.

Relations:
- Operator hasMany Tag, TagHistory
- Vehicle hasMany Tag (a vehicle could have had multiple tags over time, but only one active tag at a time)
- Tag hasMany TagHistory

Also update the existing **Vehicle** model: if there is a `tagNumber` or `tagStatus` field on Vehicle, keep it for quick reference but the Tag model is now the source of truth. Add a relation: Vehicle hasMany Tag.

Run migration: `npx prisma migrate dev --name add-tag-lifecycle`

### 1B — Tag Service

Create `backend/src/services/tagService.ts`:

- `assignTag(tagId, vehicleId, userId, prisma)` — Assign a tag to a vehicle. Validations:
  - Tag must exist and belong to same operator
  - Tag must be in status "unassigned" (not blocked/lost/expired)
  - Vehicle must not already have an active tag (query Tags where vehicleId = target and status = "active"). If it does, return an error telling the user to unassign or block the existing tag first.
  - Use a Prisma transaction: update Tag (set vehicleId, status → "active", issuedDate if first assignment, activatedAt), update Vehicle's tagStatus to "active", create TagHistory entry with action "assigned". Log to audit trail.

- `unassignTag(tagId, userId, reason, prisma)` — Remove tag from vehicle. Transaction: update Tag (set vehicleId → null, status → "unassigned"), update Vehicle's tagStatus to "unassigned", create TagHistory. Log to audit.

- `blockTag(tagId, reason, userId, prisma)` — Block a tag. Reason is required (must be one of: stolen, damaged, fraud_suspected, operator_request, system_block, other). Transaction: update Tag (status → "blocked", blockedReason, blockedAt), update Vehicle's tagStatus to "blocked" if tag was assigned, create TagHistory. Log to audit. Send a notification to the fleet manager and operator admin.

- `unblockTag(tagId, userId, prisma)` — Reactivate a blocked tag. Only allowed if the tag was blocked (not lost/decommissioned). Transaction: update Tag (status → "active", clear blockedReason and blockedAt), update Vehicle's tagStatus, create TagHistory. Log to audit.

- `reportLost(tagId, userId, prisma)` — Mark tag as lost. Automatically blocks it. Transaction: update Tag (status → "lost"), update Vehicle tagStatus, create TagHistory. Log to audit. Send critical notification.

- `replaceTag(oldTagId, newTagId, userId, prisma)` — Replace one tag with another on the same vehicle. Transaction: block old tag (reason: "replaced"), assign new tag to the same vehicle, create TagHistory entries for both. Log to audit.

- `transferTag(tagId, fromVehicleId, toVehicleId, userId, prisma)` — Move a tag from one vehicle to another. Transaction: unassign from old vehicle, assign to new vehicle, create TagHistory with fromVehicleId and toVehicleId. Log to audit.

- `checkTagExpiry(prisma)` — Query all tags where expiryDate < today and status is still "active". Set them to "expired". Create TagHistory entries. Return count of expired tags. This should be called by a scheduled job (or manually for now).

- `getTagForTransaction(tagNumber, operatorId, prisma)` — Used during fuel transactions. Look up the tag by tagNumber. Verify status is "active". Return the tag with its vehicleId, or throw an error if tag is blocked/lost/expired/unassigned. This is the authorisation gate.

### 1C — Tag API Routes

Create `backend/src/routes/tags.ts`:

- GET /api/v1/tags — List all tags for the operator. Support: pagination, filter by status, vehicleId, search by tagNumber. Include vehicle (registrationNumber, make, model) in response. Sort by createdAt desc.
- POST /api/v1/tags — Create a new tag in inventory (status: unassigned). Required: tagNumber. Validate tagNumber is unique within operator.
- GET /api/v1/tags/:id — Tag detail with current vehicle info and full tag history.
- PATCH /api/v1/tags/:id — Update tag fields (notes, expiryDate). Not for status changes — use the action endpoints below.
- DELETE /api/v1/tags/:id — Soft delete. Only allowed if status is "unassigned" or "decommissioned".

Action endpoints (each one calls the corresponding tagService function):
- POST /api/v1/tags/:id/assign — Body: { vehicleId }. Assign tag to vehicle.
- POST /api/v1/tags/:id/unassign — Body: { reason? }. Remove from vehicle.
- POST /api/v1/tags/:id/block — Body: { reason }. Block the tag. Reason required.
- POST /api/v1/tags/:id/unblock — Reactivate a blocked tag.
- POST /api/v1/tags/:id/report-lost — Mark as lost (auto-blocks).
- POST /api/v1/tags/:id/replace — Body: { newTagId }. Replace with another tag.
- POST /api/v1/tags/:id/transfer — Body: { toVehicleId }. Move to another vehicle.
- POST /api/v1/tags/:id/decommission — Permanently retire the tag.

- GET /api/v1/tags/:id/history — Full history for a tag, newest first.
- GET /api/v1/vehicles/:id/tags — All tags (current and historical) for a vehicle. Add this to the existing vehicles routes if cleaner.

- GET /api/v1/tags/summary — Summary stats: total tags, active, unassigned, blocked, lost, expired. Used by dashboard.
- POST /api/v1/tags/export — Export tags to CSV with current filters.
- POST /api/v1/tags/bulk-action — Body: { ids: [], action: "block" | "decommission", params: { reason? } }. Apply action to multiple tags.

**Permissions:**
- Super Admin: full access
- Operator Admin: full access within their operator
- Fleet Manager: full access within their fleet(s)
- Driver: no access (drivers don't manage tags)

Register all routes.

### 1D — Integrate Tags into Fuel Transactions

Find the existing fuel transaction creation endpoint or service. Update it:
- When a fuel transaction comes in with a tagNumber, call `getTagForTransaction(tagNumber, operatorId)` first.
- If the tag is not active, reject the transaction with a clear error message (e.g. "Tag BT-00451 is blocked: stolen").
- If the tag is active, use the tag's vehicleId to populate the transaction's vehicleId (this ensures the transaction is linked to the correct vehicle even if someone passes wrong data).
- After a successful transaction, update the tag's `lastUsedAt` and `lastUsedForecourtId`.

### 1E — Tag Frontend Pages

**Tag Inventory Page** (`/tags`):
- Filter bar: status dropdown, vehicle search, search by tag number
- Table columns: Tag Number, Vehicle (reg), Status, Issued Date, Expiry Date, Last Used, Last Forecourt
- Status badges: unassigned=gray, active=green, blocked=red, lost=red with strikethrough, expired=orange, decommissioned=gray with strikethrough
- Each row clickable → detail view
- "Add Tag" button → modal form (tag number + optional expiry date)
- Bulk action bar: select multiple → Block All / Decommission All

**Tag Detail Page** (`/tags/[id]`):
- Header: tag number + status badge
- Overview card: all tag fields, assigned vehicle info (if any)
- Action buttons based on current status:
  - If unassigned: "Assign to Vehicle" button → modal with vehicle searchable dropdown
  - If active: "Unassign", "Block", "Report Lost", "Transfer" buttons
  - If blocked: "Unblock", "Replace" buttons
  - If lost: "Replace" button
- Each action button opens a confirmation modal. Block and Report Lost require a reason.
- Tag History timeline: chronological list of all events with date, action, user, vehicle, reason. Use a vertical timeline component with colour-coded icons per action type.

**Vehicle Detail Page Update:**
- Add a "Tags" tab showing:
  - Current active tag (highlighted) with status badge
  - Tag history for this vehicle
  - "Assign Tag" button if no active tag
  - Quick action buttons: Block, Replace, Transfer

---

## STEP 2 — Cost Allocation & Cost Centres

Cost centres let operators allocate fuel, maintenance, and repair spend to departments, routes, or divisions for internal accounting.

### 2A — Prisma Schema

**CostCentre** model:
- id (UUID, primary key)
- operatorId (String, FK→Operator)
- name (String, required — e.g. "Northern Route", "Executive Fleet", "Maintenance Dept")
- code (String, required — short code e.g. "NR-001", unique within operator)
- description (String, optional)
- budget (Decimal 12,2, optional — monthly or annual budget in ZAR)
- budgetPeriod (String, optional — monthly, quarterly, annual)
- parentId (String, FK→CostCentre, optional — for hierarchical cost centres, e.g. "Transport" → "Northern Route")
- isActive (Boolean, default true)
- createdAt (DateTime)
- updatedAt (DateTime)
- deletedAt (DateTime, optional)

Relations:
- Operator hasMany CostCentre
- CostCentre can self-reference (parentId → CostCentre) for hierarchy
- CostCentre hasMany children CostCentre

Now link cost centres to existing entities. Add a `costCentreId` field (String, FK→CostCentre, optional) to these existing models — read each model in the schema first to find the right place to add it:
- **Vehicle** — so every vehicle can be assigned to a cost centre
- **Fleet** — so an entire fleet can default to a cost centre
- **FuelTransaction** — so each transaction records which cost centre it's allocated to
- **MaintenanceRecord** — if this model exists from the maintenance module
- **RepairJob** — if this model exists from the repair module

When a fuel transaction is created, auto-populate costCentreId from the vehicle's costCentreId. If the vehicle doesn't have one, fall back to the fleet's costCentreId. If neither has one, leave it null.

Run migration: `npx prisma migrate dev --name add-cost-centres`

### 2B — Cost Centre Service

Create `backend/src/services/costCentreService.ts`:

- `getSpendByCostCentre(operatorId, dateFrom, dateTo, prisma)` — Aggregate total spend per cost centre within the date range. Include: fuel spend (sum of FuelTransaction.totalCost), maintenance spend (sum of MaintenanceRecord.cost if exists), repair spend (sum of RepairJob.totalCost if exists). Return: { costCentreId, costCentreName, code, fuelSpend, maintenanceSpend, repairSpend, totalSpend, budget, variance }.

- `getCostCentreHierarchy(operatorId, prisma)` — Return cost centres as a tree structure. Top-level centres with their children nested. Include spend totals for each node.

- `autoAssignCostCentre(vehicleId, prisma)` — Look up the vehicle's costCentreId. If null, look up the fleet's costCentreId. Return the resolved costCentreId or null.

### 2C — Cost Centre API Routes

Create `backend/src/routes/costCentres.ts`:

- GET /api/v1/cost-centres — List all cost centres for the operator. Support: flat list (default) or tree structure (?format=tree). Include current spend totals. Filter by isActive.
- POST /api/v1/cost-centres — Create. Required: name, code. Validate code is unique within operator.
- GET /api/v1/cost-centres/:id — Detail with spend breakdown (fuel, maintenance, repair), budget vs actual, assigned vehicles list, assigned fleets list.
- PATCH /api/v1/cost-centres/:id — Update. Log to audit.
- DELETE /api/v1/cost-centres/:id — Soft delete. Only if no active vehicles/fleets are assigned (or reassign them first).
- GET /api/v1/cost-centres/:id/transactions — All fuel transactions allocated to this cost centre, paginated.
- GET /api/v1/cost-centres/spend-summary — Spend by cost centre for a date range (?dateFrom, ?dateTo). Used by reports and dashboard.

Register routes. Add audit logging.

### 2D — Cost Centre Frontend

**Cost Centres Page** (`/cost-centres`):
- Table: Name, Code, Budget (ZAR), Current Spend (ZAR), Variance (ZAR and %), Vehicles Assigned, Status
- Variance column: green if under budget, red if over budget
- Expandable rows for hierarchical centres (show children indented)
- "Add Cost Centre" button → modal form (name, code, description, budget, budget period, parent cost centre dropdown)
- Click row → detail page

**Cost Centre Detail** (`/cost-centres/[id]`):
- Overview card: name, code, description, budget, period
- Spend breakdown cards: Fuel Spend, Maintenance Spend, Repair Spend, Total Spend
- Budget vs Actual progress bar (green under, red over)
- Tabs:
  - Transactions — fuel transactions for this cost centre (table)
  - Vehicles — list of vehicles assigned to this cost centre with reassign/remove buttons
  - Fleets — list of fleets assigned
  - Audit Log — AuditLogPanel

**Vehicle Form Update:** Add a "Cost Centre" dropdown to the vehicle add/edit form. Populate from GET /api/v1/cost-centres.

**Fleet Form Update:** Add a "Cost Centre" dropdown to the fleet add/edit form.

---

## STEP 3 — VAT Breakdowns

South African VAT is currently 15%. This step ensures VAT is properly calculated, stored, and displayed across all financial areas.

### 3A — VAT Configuration

Create `backend/src/config/vatConfig.ts`:

```typescript
export const VAT_CONFIG = {
  rate: 0.15,                    // 15% — SA VAT rate
  rateDisplay: "15%",
  effectiveFrom: "2018-04-01",   // Current rate effective date
  
  // Helper functions
  calculateVatInclusive: (totalInclVat: number) => {
    // Extract VAT from a VAT-inclusive amount
    const vatAmount = totalInclVat - (totalInclVat / (1 + 0.15));
    const exclVat = totalInclVat - vatAmount;
    return { exclVat: round2(exclVat), vatAmount: round2(vatAmount), inclVat: round2(totalInclVat) };
  },
  
  calculateVatExclusive: (totalExclVat: number) => {
    // Add VAT to a VAT-exclusive amount
    const vatAmount = totalExclVat * 0.15;
    const inclVat = totalExclVat + vatAmount;
    return { exclVat: round2(totalExclVat), vatAmount: round2(vatAmount), inclVat: round2(inclVat) };
  },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
```

Export these so they can be used anywhere VAT calculations are needed.

### 3B — Update Existing Models for VAT

Read the existing Prisma schema. For each financial model, ensure these fields exist. Add them if missing:

**FuelTransaction** — should already have `vatAmount` and `totalCost`. If not:
- Add `amountExclVat` (Decimal 10,2, optional)
- Add `vatAmount` (Decimal 10,2, optional)
- Ensure `totalCost` represents the VAT-inclusive total

**WalletTransaction** (if exists) — add if missing:
- `vatAmount` (Decimal 10,2, optional)

**MaintenanceRecord** (if exists) — add if missing:
- `costExclVat` (Decimal 12,2, optional)
- `vatAmount` (Decimal 10,2, optional)
- `costInclVat` (Decimal 12,2, optional)

**RepairJob** (if exists) — should already have `vatAmount`. Check it exists.

**RepairQuote** (if exists) — should already have VAT fields. Check they exist.

Run migration if any fields were added: `npx prisma migrate dev --name add-vat-fields`

### 3C — VAT Service

Create `backend/src/services/vatService.ts`:

- `calculateTransactionVat(totalCost)` — For fuel transactions where total is VAT-inclusive (which is standard at SA fuel pumps). Returns { exclVat, vatAmount, inclVat }.

- `getVatSummary(operatorId, dateFrom, dateTo, prisma)` — Aggregate VAT across all transaction types for a period. Returns:
  ```
  {
    fuelVat: { totalExclVat, totalVat, totalInclVat, transactionCount },
    maintenanceVat: { totalExclVat, totalVat, totalInclVat, recordCount },
    repairVat: { totalExclVat, totalVat, totalInclVat, jobCount },
    combined: { totalExclVat, totalVat, totalInclVat }
  }
  ```

- `getVatByFleet(operatorId, dateFrom, dateTo, prisma)` — Same as above but broken down by fleet.

- `getVatByCostCentre(operatorId, dateFrom, dateTo, prisma)` — Same but by cost centre.

- `getMonthlyVatTrend(operatorId, monthsBack, prisma)` — Monthly VAT totals for the last N months. Returns array of { month, year, fuelVat, maintenanceVat, repairVat, totalVat }.

### 3D — Integrate VAT into Existing Flows

Update the fuel transaction creation endpoint/service:
- When a fuel transaction is created with `totalCost`, auto-calculate and store `amountExclVat` and `vatAmount` using `calculateTransactionVat()`.
- If the transaction already has vatAmount provided (from the forecourt integration), use the provided value instead of calculating.

Update the maintenance record creation endpoint (if exists):
- If `cost` is provided without VAT breakdown, calculate and populate `costExclVat`, `vatAmount`, `costInclVat`.
- If `costExclVat` is provided, calculate upward to get `vatAmount` and `costInclVat`.

### 3E — VAT API Routes

Add to existing reports routes or create `backend/src/routes/vat.ts`:

- GET /api/v1/vat/summary — VAT summary for a date range. Query params: dateFrom, dateTo, fleetId (optional), costCentreId (optional).
- GET /api/v1/vat/by-fleet — VAT breakdown by fleet for a date range.
- GET /api/v1/vat/by-cost-centre — VAT breakdown by cost centre for a date range.
- GET /api/v1/vat/trend — Monthly VAT trend. Query param: months (default 12).
- POST /api/v1/vat/export — Export VAT report to CSV or Excel. Body: { format, dateFrom, dateTo, groupBy: "fleet" | "cost_centre" | "month" }.

Register routes.

### 3F — VAT Frontend

**VAT Report Page** (`/reports/vat` or add as a section within existing reports):
- Date range picker at top
- Summary cards: Total Excl. VAT, Total VAT, Total Incl. VAT (all in ZAR)
- Breakdown toggle: By Fleet | By Cost Centre | Monthly Trend
- By Fleet view: table showing each fleet's VAT breakdown
- By Cost Centre view: table showing each cost centre's VAT breakdown
- Monthly Trend view: bar chart with stacked bars (fuel VAT, maintenance VAT, repair VAT) per month
- Export button: CSV, Excel

**Update existing financial displays:**
- Fuel Transaction Detail: show Amount Excl. VAT, VAT (15%), Total Incl. VAT instead of just "Total Cost"
- Fuel Transaction List: add a "VAT" column (optional — can be toggled via column visibility)
- Maintenance Detail (if exists): show cost breakdown with VAT
- Repair Detail (if exists): ensure quotes and final costs show VAT breakdown
- Wallet Transaction History: show VAT where applicable (on fuel debits)

---

## STEP 4 — Budget Variance Reporting (Full Version with Cost Centres)

This builds on the basic budget tracking from fleet monthly budgets and extends it with cost centre budgets, multi-period analysis, and forecasting.

### 4A — Budget Service

Create `backend/src/services/budgetService.ts`:

- `getFleetBudgetVariance(operatorId, dateFrom, dateTo, prisma)` — For each fleet with a monthlyBudget set:
  - Calculate actual spend (fuel + maintenance + repair) in the period
  - Return: { fleetId, fleetName, budget, actualSpend, variance (budget - actual), variancePercent, status ("under_budget" | "at_risk" | "over_budget") }
  - Status logic: under_budget = spent < 75% of budget, at_risk = 75-100%, over_budget = > 100%

- `getCostCentreBudgetVariance(operatorId, dateFrom, dateTo, prisma)` — Same but for cost centres that have budgets. Adjust date range based on budgetPeriod (monthly, quarterly, annual).

- `getVarianceTrend(entityType, entityId, monthsBack, prisma)` — Monthly budget vs actual for a fleet or cost centre over the last N months. Returns array of { month, year, budget, actual, variance, variancePercent }.

- `getBudgetForecast(entityType, entityId, prisma)` — Simple forecast based on current month's spend pace:
  - daysElapsed = days since start of month
  - daysInMonth = total days in month
  - projectedSpend = (actualSpendSoFar / daysElapsed) * daysInMonth
  - Return: { currentSpend, projectedSpend, budget, projectedVariance, onTrack: boolean }

- `getBudgetAlerts(operatorId, prisma)` — Return all fleets and cost centres where:
  - Spend has exceeded 75% of budget (warning)
  - Spend has exceeded 90% of budget (critical)
  - Spend has exceeded 100% of budget (over)
  - Include projected overspend based on forecast
  Used by dashboard alerts and notifications.

### 4B — Budget API Routes

Add to existing reports routes or create `backend/src/routes/budget.ts`:

- GET /api/v1/budget/fleet-variance — Fleet budget variance for a date range. Query: dateFrom, dateTo. Returns all fleets with budget data.
- GET /api/v1/budget/cost-centre-variance — Cost centre budget variance. Query: dateFrom, dateTo.
- GET /api/v1/budget/trend/:entityType/:entityId — Monthly variance trend for a fleet or cost centre. Query: months (default 6).
- GET /api/v1/budget/forecast/:entityType/:entityId — Current month forecast.
- GET /api/v1/budget/alerts — All budget alerts across the operator.
- POST /api/v1/budget/export — Export budget variance report. Body: { format, dateFrom, dateTo, scope: "fleets" | "cost_centres" }.

Register routes.

### 4C — Budget Frontend

**Budget Variance Page** (`/reports/budget`):
- Toggle: By Fleet | By Cost Centre
- Date range picker (defaults to current month)
- Summary cards at top: Total Budget, Total Spend, Total Variance, Fleets/Centres Over Budget (count)

- **By Fleet view:**
  - Table: Fleet Name, Monthly Budget (ZAR), Actual Spend (ZAR), Variance (ZAR), Variance %, Status badge, Forecast
  - Status badges: under_budget=green, at_risk=orange, over_budget=red
  - Each row has a small inline progress bar showing spend vs budget (green fills, turns orange at 75%, red at 100%)
  - Click a fleet row to expand and see:
    - Monthly trend chart (line chart: budget line vs actual spend bars, last 6 months)
    - Current month forecast card
    - Spend breakdown: fuel, maintenance, repair

- **By Cost Centre view:**
  - Same table layout but for cost centres
  - Budget column adjusts label based on budgetPeriod (Monthly / Quarterly / Annual)
  - Same expandable detail with trend chart

- Export button: CSV, Excel, PDF

**Dashboard Integration:**
- Update the dashboard alerts panel to include budget alerts from GET /api/v1/budget/alerts
- If a fleet is over budget, show it as a warning/critical alert
- Add a "Budget Status" KPI card to the dashboard: count of fleets on track vs at risk vs over budget

**Fleet Detail Page Update:**
- Add a "Budget" section to the fleet detail page showing:
  - Current month: budget vs spend progress bar
  - Forecast card
  - 6-month trend mini-chart

---

## STEP 5 — Contract & Lease Tracking

Track vehicle ownership details, lease/finance agreements, contract renewals, and associated costs.

### 5A — Prisma Schema

**VehicleContract** model:
- id (UUID, primary key)
- operatorId (String, FK→Operator)
- vehicleId (String, FK→Vehicle)
- contractType (String, required — lease, finance, rental, service_agreement, insurance, warranty, other)
- provider (String, required — leasing company, financier, rental agency, insurer name)
- contractNumber (String, optional — reference number)
- startDate (DateTime, required)
- endDate (DateTime, required)
- monthlyAmount (Decimal 12,2, optional — monthly payment in ZAR)
- totalContractValue (Decimal 14,2, optional — total value over the contract term)
- depositPaid (Decimal 12,2, optional — initial deposit/down payment)
- residualValue (Decimal 12,2, optional — balloon payment / residual at end of lease)
- escalationRate (Decimal 5,2, optional — annual escalation percentage)
- paymentDay (Int, optional — day of month payment is due, 1-31)
- terms (String, optional — key terms or conditions, free text)
- renewalType (String, optional — auto_renew, manual_renew, fixed_term)
- renewalNoticeDays (Int, optional — days before end date to send renewal notice, e.g. 90)
- status (String, default "active" — draft, active, expiring, expired, terminated, renewed)
- terminationReason (String, optional)
- terminationDate (DateTime, optional)
- notes (String, optional)
- createdAt (DateTime)
- updatedAt (DateTime)
- deletedAt (DateTime, optional)

**ContractPayment** model (track individual payments against a contract):
- id (UUID, primary key)
- contractId (String, FK→VehicleContract)
- operatorId (String, FK→Operator)
- paymentDate (DateTime, required)
- amount (Decimal 12,2, required — ZAR)
- vatAmount (Decimal 10,2, optional)
- paymentMethod (String, optional — eft, debit_order, card, cash, other)
- reference (String, optional — payment reference)
- status (String, default "completed" — pending, completed, failed, reversed)
- notes (String, optional)
- createdAt (DateTime)

Relations:
- Operator hasMany VehicleContract
- Vehicle hasMany VehicleContract
- VehicleContract hasMany ContractPayment

Also update the existing **Vehicle** model — the spec already has `ownershipType` (owned, leased, financed, rented) and `leaseExpiry` fields. Keep those for quick reference, but VehicleContract is now the detailed source of truth. If `ownershipType` or `leaseExpiry` don't exist on the Vehicle model, add them.

Run migration: `npx prisma migrate dev --name add-contract-tracking`

### 5B — Contract Service

Create `backend/src/services/contractService.ts`:

- `getExpiringContracts(operatorId, daysAhead, prisma)` — Find all active contracts expiring within N days. Return with vehicle info and days remaining. Used for alerts.

- `getExpiredContracts(operatorId, prisma)` — Find all contracts past endDate that are still status "active" (should be "expired"). Auto-update their status. Return the list.

- `calculateContractCosts(vehicleId, dateFrom, dateTo, prisma)` — Sum all contract payments for a vehicle in a date range. Group by contract type. Return: { leasePayments, financePayments, insurancePayments, totalContractCost }.

- `getContractRenewalsDue(operatorId, prisma)` — Find contracts where: endDate minus renewalNoticeDays is within the next 30 days AND renewalType is not "fixed_term". These need renewal decisions.

- `getTotalContractLiabilities(operatorId, prisma)` — Sum of remaining payments across all active contracts. For each contract: (months remaining) × monthlyAmount. Return total fleet-wide.

- `syncVehicleFields(contractId, prisma)` — When a contract is created/updated, sync the Vehicle model's quick-reference fields: update ownershipType based on contractType (lease→leased, finance→financed, rental→rented), update leaseExpiry from endDate if it's a lease. Use a Prisma transaction.

### 5C — Contract API Routes

Create `backend/src/routes/contracts.ts`:

- GET /api/v1/contracts — List all contracts. Support: pagination, filter by vehicleId, contractType, status, provider, expiring within N days. Include vehicle (registrationNumber, make, model). Sort by endDate asc (soonest expiry first by default).
- POST /api/v1/contracts — Create contract. Required: vehicleId, contractType, provider, startDate, endDate. Auto-populate operatorId from vehicle. Call syncVehicleFields() after creation. Log to audit.
- GET /api/v1/contracts/:id — Detail with vehicle info, payment history, remaining value calculations.
- PATCH /api/v1/contracts/:id — Update. Call syncVehicleFields() after update. Log to audit.
- DELETE /api/v1/contracts/:id — Soft delete. Log to audit.
- POST /api/v1/contracts/:id/terminate — Terminate a contract early. Required: terminationReason. Set terminationDate, status → "terminated". Log to audit.
- POST /api/v1/contracts/:id/renew — Renew a contract. Creates a new contract record linked to the same vehicle, with startDate = old endDate + 1 day. Old contract status → "renewed". Log to audit.

- GET /api/v1/contracts/:id/payments — List payments for a contract.
- POST /api/v1/contracts/:id/payments — Record a payment. Required: paymentDate, amount.

- GET /api/v1/vehicles/:id/contracts — All contracts (current and historical) for a vehicle.
- GET /api/v1/contracts/expiring — Contracts expiring within N days (?days=30). Used by dashboard alerts.
- GET /api/v1/contracts/renewals-due — Contracts needing renewal decisions.
- GET /api/v1/contracts/summary — Fleet-wide summary: total active contracts by type, total monthly obligations, total liabilities.
- POST /api/v1/contracts/export — Export to CSV.

Register routes. Add audit logging.

### 5D — Contract Frontend

**Contracts Page** (`/contracts`):
- Filter bar: contract type dropdown, status dropdown, vehicle search, provider search, "Expiring within" dropdown (30/60/90 days)
- Table: Vehicle (reg), Contract Type badge, Provider, Start Date, End Date, Monthly Amount (ZAR), Status badge, Days Remaining
- Status badges: draft=gray, active=green, expiring=orange (within 90 days of end), expired=red, terminated=gray-strikethrough, renewed=blue
- Days Remaining column: green if > 90 days, orange if 30-90, red if < 30, "EXPIRED" in red if past
- Click row → detail page
- "Add Contract" button → new form
- Summary cards at top: Total Active Contracts, Total Monthly Obligations (ZAR), Contracts Expiring Within 30 Days, Total Remaining Liabilities (ZAR)

**Add/Edit Contract Form** (`/contracts/new` and `/contracts/[id]/edit`):
- Vehicle searchable dropdown
- Contract type dropdown (lease, finance, rental, service_agreement, insurance, warranty, other)
- Provider name input
- Contract number input (optional)
- Start date and end date pickers
- Monthly amount (ZAR input)
- Total contract value (optional)
- Deposit paid (optional)
- Residual / balloon value (optional — show only for lease/finance types)
- Escalation rate % (optional)
- Payment day of month (optional, 1-31)
- Renewal type dropdown (auto_renew, manual_renew, fixed_term)
- Renewal notice days (optional, number input)
- Terms textarea (optional)
- Notes textarea (optional)
- Document upload (contract document, using DocumentsPanel pattern)

**Contract Detail** (`/contracts/[id]`):
- Header: contract type badge + status badge + vehicle reg
- Overview card: all contract fields
- Financial summary card: monthly amount, total value, deposit, residual, total paid to date, remaining balance
- Contract timeline: visual bar showing start → today → end with progress indicator
- Tabs:
  - Payments — table of all payments (date, amount, method, reference, status). "Record Payment" button → modal form. Running total.
  - Documents — DocumentsPanel
  - Audit Log — AuditLogPanel
- Action buttons:
  - If active: "Terminate" (opens modal with reason), "Renew" (creates new contract)
  - If expiring: highlighted "Renew" button

**Vehicle Detail Page Update:**
- Add a "Contracts" tab showing:
  - Active contracts list with key details
  - Expired/terminated contracts in a collapsed section
  - "Add Contract" button
  - Total monthly contract obligations for this vehicle

**Dashboard Integration:**
- Add to alerts panel: contracts expiring within 30 days (warning), expired contracts still marked active (critical), renewals due (info)

---

## Integration Checklist

After all 5 steps are complete:

1. **Navigation/Sidebar:**
   - Tags (tag icon) — under Vehicles or Fleet Operations
   - Cost Centres (building icon) — under Finance/Admin
   - VAT Report — under Reports
   - Budget Variance — under Reports
   - Contracts (file-text icon) — under Vehicles or Finance

2. **Dashboard Updates:**
   - Tag summary KPI card: Active Tags / Total Tags
   - Budget status KPI card or alert entries
   - Contract expiry alerts in alerts panel

3. **Reports Module Update (if reports page exists):**
   - Add "Cost Allocation" report card → links to cost centre spend view
   - Add "VAT Report" card → links to VAT breakdown page
   - Add "Budget Variance" card → links to budget variance page
   - Add "Contract Summary" report → fleet-wide contract overview

4. **Permissions:**
   - Tags: Super Admin + Op Admin + Fleet Manager full, Driver none
   - Cost Centres: Super Admin + Op Admin full, Fleet Manager read-only, Driver none
   - VAT Reports: Super Admin + Op Admin + Fleet Manager (scoped), Driver none
   - Budget: Super Admin + Op Admin + Fleet Manager (own fleets), Driver none
   - Contracts: Super Admin + Op Admin full CRUD, Fleet Manager read + create, Driver none

5. **Notifications — add triggers:**
   - Tag blocked → fleet manager + op admin (critical)
   - Tag reported lost → fleet manager + op admin (critical)
   - Tag expiring 30 days → fleet manager (warning)
   - Budget 75% consumed → fleet manager (warning)
   - Budget 90% consumed → fleet manager + op admin (warning)
   - Budget exceeded → fleet manager + op admin (critical)
   - Contract expiring 90 days → fleet manager (info)
   - Contract expiring 30 days → fleet manager + op admin (warning)
   - Contract expired → op admin (critical)
   - Renewal decision due → fleet manager + op admin (warning)

---

## Useful Commands

| Command | What It Does |
|---------|-------------|
| `npx prisma migrate dev --name description` | Create + apply migration |
| `npx prisma generate` | Regenerate Prisma client |
| `npx prisma studio` | Visual database browser |
| `docker compose up -d` | Start database + Redis |
| `git add . && git commit -m "message"` | Save progress |

## Troubleshooting

**Tag number already exists error** → tagNumber must be unique within operator. Use a composite unique constraint: `@@unique([operatorId, tagNumber])` in the Prisma schema.

**Cost centre hierarchy not displaying** → Make sure the `parentId` self-relation is correct in Prisma: `parent CostCentre? @relation("CostCentreHierarchy", fields: [parentId], references: [id])` and `children CostCentre[] @relation("CostCentreHierarchy")`.

**VAT calculations off by a cent** → Always round to 2 decimal places using `Math.round(n * 100) / 100` after every calculation. Do not chain calculations without rounding intermediates.

**Budget period mismatch** → When calculating cost centre budget variance, check the `budgetPeriod` field. Monthly budgets compare to one month of spend. Quarterly budgets compare to 3 months. Annual budgets compare to 12 months. Adjust the date range query accordingly.

**Contract sync not updating vehicle** → Make sure `syncVehicleFields()` runs inside the same Prisma transaction as the contract create/update. Check the mapping: lease→"leased", finance→"financed", rental→"rented", everything else leaves ownershipType unchanged.
