# Active Fleet Platform — Project README

> **Fleet Management Web Application**
> BT Corp / Umanyano · Version 3.0 · March 2026
> _Confidential — For Development Use Only_

---

## What Is This Project?

Active Fleet is a **web application** for managing vehicles, drivers, fuel spending, and fleet operations — built for the South African taxi and fleet industry.

Think of it like a dashboard where fleet managers can:
- See how much fuel each vehicle is using
- Track driver licences and compliance dates
- Monitor wallet balances and spending limits
- Get alerts when something needs attention

---

## Tech Stack (What You'll Be Building With)

| Layer | Technology | What It Does |
|-------|-----------|--------------|
| Frontend (what users see) | React 18 + TypeScript | Builds the UI |
| Routing & SSR | Next.js | Handles pages and navigation |
| Styling | Tailwind CSS | Makes it look good |
| Backend (server) | Node.js + Express | Handles business logic and APIs |
| Database | PostgreSQL 15 | Stores all the data |
| Cache / Sessions | Redis | Fast temporary storage |
| File Storage | MinIO / S3 | Stores uploaded documents and photos |
| Background Jobs | BullMQ | Runs scheduled tasks (reports, alerts) |
| Real-time | Socket.io | Live notifications |

---

## Project Structure (Recommended)

```
activefleet-platform/
├── frontend/               # Next.js app (what users see)
│   ├── src/
│   │   ├── app/            # Pages (Next.js App Router)
│   │   ├── components/     # Reusable UI pieces
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Helpers and utilities
│   │   └── types/          # TypeScript type definitions
│   └── public/             # Static files (images, icons)
│
├── backend/                # Node.js API server
│   ├── src/
│   │   ├── routes/         # API endpoints (vehicles, drivers, etc.)
│   │   ├── controllers/    # Business logic per module
│   │   ├── middleware/      # Auth, validation, rate limiting
│   │   ├── models/         # Database models
│   │   ├── services/       # Reusable service functions
│   │   └── jobs/           # Background tasks (BullMQ)
│   └── prisma/             # Database schema and migrations
│
├── docker-compose.yml      # Runs all services locally
└── README.md               # This file
```

---

## User Roles (Who Uses the App)

| Role | What They Can Do |
|------|-----------------|
| **Super Admin** (BT Corp) | Everything — manages all operators |
| **Operator Admin** | Manages their own fleets, vehicles, drivers |
| **Fleet Manager** | Day-to-day: vehicles, drivers, fuel logs |
| **Driver** | View own profile and fuel history only |

---

## Core Modules (What You're Building)

1. **Dashboard** — KPI cards, charts, alerts panel
2. **Vehicle Management** — Add/edit/view vehicles with compliance tracking
3. **Driver Management** — Add/edit/view drivers with licence tracking
4. **Fleet Management** — Group vehicles and drivers, set budgets
5. **Fuel Log & Transactions** — Track every fuel transaction with anomaly detection
6. **Wallet & Payments** — Manage operator wallet, top-ups via EFT/Ozow/PayFast
7. **Reports & Analytics** — 10 standard reports, exportable to PDF/Excel
8. **Notifications & Alerts** — In-app, email, and SMS alerts
9. **Audit Trail** — Immutable log of every action in the system
10. **User Management** — Invite users, assign roles, manage 2FA

---

## Delivery Phases

| Phase | Weeks | Focus |
|-------|-------|-------|
| **Phase 1** | 1–12 | Core platform: auth, vehicles, drivers, fuel log, wallet, dashboard |
| **Phase 2** | 13–20 | Reports, maintenance, incidents, tags, forecourts |
| **Phase 3** | 21–28 | Accounting integrations, geofencing, WhatsApp, cost centres |
| **Phase 4** | 29–40 | Mobile apps, white-labelling, telematics, ML anomaly detection |

---

## Key Business Rules to Know

- **SA ID validation** — must pass Luhn check digit algorithm (see Appendix 12.2 in spec)
- **Spending limits** — transactions are **declined** if driver/vehicle limits are exceeded
- **Anomaly detection** — flags double fills, overfills, fuel type mismatches, off-hours, geofence violations
- **Multi-tenancy** — every operator's data is isolated using PostgreSQL Row-Level Security
- **Soft deletes** — nothing is permanently deleted; records get a `deleted_at` timestamp
- **Currency** — South African Rand (ZAR), displayed as `R 1,234.56`
- **Timezone** — all times stored in UTC, displayed in SAST (UTC+2)

---

## Important Links

- 📄 Full Technical Spec: `Technical_Spec_v3.docx`
- 📋 Setup Instructions: `GETTING_STARTED.md`
- 🔐 Security requirements: Section 6 of the spec
- 📊 Data model: Section 4 of the spec
- 🗺️ API endpoints: Section 5 of the spec

---

## Questions?

Start with `GETTING_STARTED.md` — it walks you through setting up your local environment step by step.
