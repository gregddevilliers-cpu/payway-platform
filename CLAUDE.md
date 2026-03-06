# CLAUDE.md — Phase 2 Build Instructions

## Project Context

This is the **Active Fleet Platform** — a fleet management web application for BT Corp / Umanyano serving the South African taxi industry. Phase 1 is complete (auth, vehicles, drivers, fleets, fuel log, wallet, dashboard, notifications). We are now building Phase 2.

## Phase 2 Scope — Two New Modules

### Module 1: Vehicle Repair (build first)
Full lifecycle repair management: logging repair requests, assigning providers, collecting quotes, tracking work, cost breakdown, warranty tracking. Separate from the maintenance module — repairs are unscheduled/reactive, maintenance is scheduled/preventive.

### Module 2: Bulk Import with Auto-Matching (build second)
Upload CSV/XLSX files to create vehicles, drivers, or fleets in bulk. 5-step wizard: upload → auto-match columns → validate rows → preview/resolve → import. Includes fuzzy column matching, SA ID Luhn validation, duplicate detection with skip/overwrite/merge options.

## Critical Rules

- **Read before writing.** Before creating or editing ANY file, read the existing files in the same directory to match the patterns, naming conventions, folder structure, and coding style already in use.
- **Prisma is the ORM.** All database work goes through Prisma. Schema lives in `backend/prisma/schema.prisma`. After any schema change, run `npx prisma migrate dev --name <description>` then `npx prisma generate`.
- **Match existing patterns exactly.** The Phase 1 codebase has established patterns for: route files, controllers, services, middleware (auth, RBAC, tenant scoping), error handling, response envelope format `{ success, data, meta, errors }`, React Query hooks, page layouts, table components, form components, and API client setup. Follow them.
- **Multi-tenant.** Every query must scope to `operatorId` from the authenticated user. Never return data across operators.
- **Soft deletes.** Use `deletedAt` timestamp, never hard delete.
- **TypeScript everywhere.** Both frontend and backend.
- **South African context.** ZAR currency (R 1,234.56), SA ID validation (13-digit Luhn), SA phone format (+27XXXXXXXXX), SA vehicle registration formats.

## Build Order

Follow this exact sequence. Complete each step fully before moving to the next.

---

### STEP 1 — Repair Module: Prisma Schema

Add four new models to `backend/prisma/schema.prisma`:

**RepairProvider** — id, operatorId (FK→Operator), name, contactPerson, contactPhone, contactEmail, address, specialisations (Json), rating (Decimal 3,2), status (default "active"), createdAt, updatedAt, deletedAt. Relation: Operator hasMany RepairProvider.

**RepairJob** — id, operatorId (FK→Operator), vehicleId (FK→Vehicle), driverId (FK→Driver, optional), fleetId (FK→Fleet), incidentId (String optional), repairNumber (String unique, format REP-YYYYMM-NNNN), repairType (String: mechanical/electrical/body_panel/tyre/windscreen/interior/other), priority (String: low/medium/high/critical), status (String default "reported": reported/assessed/quoted/in_progress/quality_check/completed/cancelled), description (String), diagnosisNotes (String optional), odometerAtReport (Int optional), isDrivable (Boolean), breakdownLatitude (Decimal 10,7 optional), breakdownLongitude (Decimal 10,7 optional), providerId (FK→RepairProvider optional), approvedQuoteId (String optional), estimatedCompletion (DateTime optional), actualCompletion (DateTime optional), totalCost (Decimal 12,2 optional), labourCost (Decimal 10,2 optional), partsCost (Decimal 10,2 optional), towingCost (Decimal 10,2 optional), vatAmount (Decimal 10,2 optional), warrantyMonths (Int optional), warrantyExpiry (DateTime optional), downtimeDays (Int optional), cancellationReason (String optional), createdAt, updatedAt, deletedAt. Relations: Operator/Vehicle/Driver/Fleet/RepairProvider hasMany RepairJob.

**RepairQuote** — id, repairJobId (FK→RepairJob), providerId (FK→RepairProvider), quoteNumber (String optional), lineItems (Json: array of {description, quantity, unitPrice, total}), labourTotal (Decimal 10,2), partsTotal (Decimal 10,2), totalExclVat (Decimal 12,2), vatAmount (Decimal 10,2), totalInclVat (Decimal 12,2), estimatedDays (Int optional), warrantyMonths (Int optional), validUntil (DateTime optional), documentUrl (String optional), status (String default "pending": pending/approved/rejected/expired), createdAt, updatedAt, deletedAt.

**RepairWorkLog** — id, repairJobId (FK→RepairJob), userId (String), note (String), photosJson (Json optional), partsReplaced (Json optional: array of {partName, partNumber, cost}), createdAt.

Run migration after adding models.

---

### STEP 2 — Repair Module: Backend Services

Create `backend/src/services/repairService.ts` (or follow existing service file location):

- `generateRepairNumber()` — Query DB for latest repair number this month, increment. Format: REP-YYYYMM-NNNN. Start at 0001 if none exist.
- `validateStatusTransition(current, next)` — Valid transitions: reported→assessed, assessed→quoted, quoted→in_progress, in_progress→quality_check, quality_check→completed, any→cancelled. Return boolean.
- `handleStatusChange(repairJob, newStatus, prisma)` — Side effects in a Prisma transaction:
  - → in_progress: set vehicle.status = "maintenance"
  - → completed: set vehicle.status = "active", calculate downtimeDays, calculate warrantyExpiry (actualCompletion + warrantyMonths)
  - → cancelled: revert vehicle.status to "active" if currently "maintenance", require cancellationReason
- `checkWarrantyRecurrence(vehicleId, repairType, prisma)` — Find completed repairs on same vehicle with same type where warrantyExpiry > now. Return the repair if found (flags potential warranty claim).

---

### STEP 3 — Repair Module: API Routes

Create routes for repair providers and repair jobs following existing route patterns:

**Repair Providers** (`/api/v1/repair-providers`):
- GET / — List with pagination, search by name, filter by status
- POST / — Create (name + contactPhone required)
- GET /:id — Detail with repair count and average rating
- PATCH /:id — Update
- DELETE /:id — Soft delete

**Repairs** (`/api/v1/repairs`):
- GET / — List with pagination, filters (fleetId, vehicleId, status, priority, repairType, providerId, date range), include related vehicle/driver/provider/fleet
- POST / — Create repair request. Required: vehicleId, repairType, priority, description, isDrivable. Auto-generate repairNumber. Auto-populate fleetId/operatorId from vehicle.
- GET /:id — Full detail with vehicle, driver, fleet, provider, quotes, work log entries
- PATCH /:id — Update. Handle status transitions using repairService.handleStatusChange(). Validate transitions with validateStatusTransition().
- POST /:id/quotes — Submit quote (providerId, lineItems, totals required)
- PATCH /:id/quotes/:quoteId — Approve/reject. On approve: set repair's approvedQuoteId + providerId, change status to "quoted"
- POST /:id/work-log — Add entry (note required)
- GET /:id/work-log — List entries, newest first
- POST /export — Export to CSV with same filters as list
- GET on existing vehicles route: /api/v1/vehicles/:id/repairs — Repair history for a vehicle

Register all routes in the main app entry point.

---

### STEP 4 — Repair Module: Frontend Pages

Create three pages matching existing frontend patterns:

**Repair List** (`/repairs`):
- Filter bar: status dropdown, priority dropdown, fleet dropdown, search input
- Table columns: Repair Number, Vehicle (reg), Type, Provider, Status, Priority, Reported Date, Est. Completion, Total Cost
- Colour-coded status badges: reported=gray, assessed=blue, quoted=yellow, in_progress=orange, quality_check=purple, completed=green, cancelled=red
- Priority badges: low=gray, medium=blue, high=orange, critical=red
- Rows clickable → /repairs/[id]
- "Log Repair" button → /repairs/new

**New Repair** (`/repairs/new`):
- Multi-step form (reuse existing step pattern if available):
  1. Vehicle & Driver — searchable vehicle dropdown, auto-fill driver/fleet/odometer
  2. Issue Details — type dropdown, priority dropdown, description textarea, odometer, isDrivable toggle
  3. Evidence — drag-and-drop file upload, max 10 files
  4. Review & Submit — summary, submit button
- POST to /api/v1/repairs, redirect to detail page

**Repair Detail** (`/repairs/[id]`):
- Header: repair number + status badge + priority badge + vehicle reg
- Tabbed layout:
  - Overview — all fields in card layout, status timeline
  - Quotes — quote cards with approve/reject buttons on pending quotes
  - Work Log — chronological entries, "Add Update" form
  - Costs — breakdown table (labour, parts, towing, VAT, total), quote vs actual comparison
  - Documents — file grid with preview/download

**Vehicle Detail Update** — Add a "Repairs" tab to the existing vehicle detail page showing repair history table + "Log Repair" button.

---

### STEP 5 — Bulk Import: Prisma Schema

Add two models:

**ImportJob** — id, operatorId (FK→Operator), uploadedBy (String), entityType (String: vehicle/driver/fleet), fileName, fileUrl, columnMapping (Json), totalRows (Int), importedCount (Int default 0), skippedCount (Int default 0), failedCount (Int default 0), errorReportUrl (String optional), status (String default "pending": pending/validating/previewing/importing/completed/failed), startedAt (DateTime optional), completedAt (DateTime optional), createdAt, updatedAt, deletedAt.

**ImportRow** — id, importJobId (FK→ImportJob), rowNumber (Int), rawData (Json), mappedData (Json), validationErrors (Json optional), validationWarnings (Json optional), duplicateOf (String optional), resolution (String optional: skip/overwrite/merge), status (String default "pending": pending/valid/error/warning/skipped/imported), createdAt.

Run migration.

---

### STEP 6 — Bulk Import: Auto-Match Engine

Install xlsx package: `npm install xlsx` (in backend folder).

Create `backend/src/config/importAliases.ts` — Export alias dictionaries mapping each database field to an array of common column header variations for vehicle, driver, and fleet entities. For example registrationNumber maps to ["registration", "reg number", "reg no", "licence plate", "number plate", "plate number"]. Cover all fields from the Prisma schema with at least 3-5 aliases each. All alias values lowercase.

Create `backend/src/services/importMatchingService.ts`:
- `autoMatchColumns(headers, entityType)` — For each header: normalise (lowercase, trim), check exact match against field names + aliases, then fuzzy match using Levenshtein. Return array of { sourceColumn, targetField, confidence (0-100), autoMatched }.
- `levenshteinDistance(a, b)` — Write the algorithm directly, no external library.
- `similarityScore(a, b)` — (1 - distance / maxLength) * 100.
- `inferFieldFromData(columnData, entityType)` — Pattern detection fallback: 13-digit SA ID, +27 phone, email with @, dates, 17-char VIN, SA reg plate patterns.

---

### STEP 7 — Bulk Import: Validation Service

Create `backend/src/services/importValidationService.ts`:
- `validateRow(data, entityType, operatorId, prisma)` → { valid, errors[], warnings[] }
  - Vehicles: registrationNumber required + unique, VIN 17 chars, make/model required, year 1900–currentYear+1, fuelType in enum, tankCapacity 1–999
  - Drivers: firstName/lastName required, SA ID Luhn check (13 digits, valid DOB, check digit), mobile SA format, email format, licenceCode in enum, spend limits positive
  - Dates: parse DD/MM/YYYY, YYYY-MM-DD, ISO 8601. Warn if expiry dates in past.
  - Foreign keys: if fleetId given as name string, look up by name within operator
- `validateSaId(idNumber)` — Full SA ID validation: length, DOB, Luhn check digit
- `detectDuplicate(data, entityType, operatorId, prisma)` — Check key fields (reg number for vehicles, SA ID or mobile for drivers). Return existing record ID or null.
- `parseDateFlexible(value)` — Try multiple date formats, return Date or null.

---

### STEP 8 — Bulk Import: API Routes

Create `backend/src/routes/imports.ts`:
- POST /api/v1/import/upload — Multipart upload (.csv/.xlsx, max 10MB, max 5000 rows). Parse with xlsx package. Run autoMatchColumns. Create ImportJob + ImportRow records. Return job ID + mapping.
- GET /api/v1/import/:id/mapping — Return current mapping with confidence scores + available target fields
- PATCH /api/v1/import/:id/mapping — Save corrected mapping, re-apply to all rows
- POST /api/v1/import/:id/validate — Validate all rows, detect duplicates, update row statuses, return summary counts
- GET /api/v1/import/:id/preview — Paginated rows with filter by status
- PATCH /api/v1/import/:id/rows/:rowNumber — Inline edit + re-validate single row
- POST /api/v1/import/:id/execute — Import in Prisma transaction. Handle skip/overwrite/merge per row. Update counts. Generate error report CSV.
- GET /api/v1/import/:id/report — Download error report CSV
- GET /api/v1/import/history — Paginated list of past imports
- GET /api/v1/import/templates/:entityType — Generate + download CSV template with headers and 2 example rows

Handle file uploads with multer (install if not present: `npm install multer @types/multer`).
Register all routes.

---

### STEP 9 — Bulk Import: Frontend Pages

**Import History** (`/import`):
- "New Import" button, table of past imports (file name, entity type, status badge, rows, imported, failed, date)

**Import Wizard** (`/import/new`) — 5-step wizard using React state:
1. Upload — entity type dropdown, drag-and-drop file upload, "Download Template" link
2. Map Columns — two-column layout: source headers ↔ target field dropdowns, confidence indicators (green ≥80%, yellow 50-80%, red <50%), required fields highlighted
3. Review Data — summary cards (total/valid/errors/warnings/duplicates), filterable table, inline cell editing, duplicate resolution dropdowns (skip/overwrite/merge)
4. Confirm — final summary counts, "Import" button with progress indicator
5. Results — success/failure counts, "Download Report" + "Import Another" + "View Records" buttons

---

### STEP 10 — Integration

Wire both modules into the existing app:
- **Sidebar/Navigation**: Add "Repairs" (wrench icon) near Vehicles, "Import" (upload icon) in a Tools section
- **Dashboard**: Add "Vehicles in Repair" KPI card (count of vehicles with status "maintenance")
- **RBAC**: Add permissions — Super Admin + Op Admin get all, Fleet Manager gets all except fleet import, Driver gets own-vehicle repair create/read only
- **Notifications**: Trigger on new repair reported, repair overdue, quote approved, repair completed, import completed

---

## Tech Decisions

- File upload: use multer middleware for multipart handling
- CSV/XLSX parsing: use the `xlsx` npm package (handles both formats)
- Fuzzy matching: implement Levenshtein directly, no external library needed
- Background processing: if imports with 5000 rows are slow, move validation + execution to a BullMQ job. For now, synchronous is fine.
- Auto-generated repair numbers: query-and-increment in a transaction to avoid race conditions

## Testing

After each module, write integration tests covering:
- Repair: CRUD, status transitions, vehicle status sync, invalid transitions rejected, warranty calculation
- Import: upload + auto-match, validation catches errors, inline edit + re-validate, execute creates correct records, duplicate handling works
