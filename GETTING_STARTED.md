# Getting Started — Active Fleet Platform

Welcome! This guide will walk you through setting up the Active Fleet project on your computer from scratch. Take it one step at a time.

---

## Before You Begin — Install These Tools

You'll need to install the following. Click each link for the official installer:

| Tool | Why You Need It | Download |
|------|----------------|----------|
| **Node.js 20 LTS** | Runs JavaScript on your computer | https://nodejs.org |
| **Docker Desktop** | Runs the database and Redis locally | https://www.docker.com/products/docker-desktop |
| **Git** | Version control (you already have this ✅) | — |
| **VS Code** | Code editor (recommended) | https://code.visualstudio.com |

> 💡 **Tip:** After installing Node.js, open a terminal and type `node -v`. If you see a version number like `v20.x.x`, it worked!

---

## Step 1 — Set Up Your Git Repository

Open a terminal (Command Prompt, PowerShell, or Terminal on Mac) and run:

```bash
# Create a new folder for the project
mkdir activefleet-platform
cd activefleet-platform

# Initialise a git repository
git init

# Create a .gitignore file so you don't accidentally commit secrets
curl -o .gitignore https://raw.githubusercontent.com/github/gitignore/main/Node.gitignore
```

Then copy your `README.md` and `GETTING_STARTED.md` into this folder.

```bash
git add .
git commit -m "Initial commit: project setup"
```

---

## Step 2 — Set Up Docker (Database & Redis)

Create a file called `docker-compose.yml` in your project root:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    container_name: activefleet_db
    environment:
      POSTGRES_USER: activefleet
      POSTGRES_PASSWORD: activefleet_local_password
      POSTGRES_DB: activefleet_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    container_name: activefleet_redis
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

Then start the services:

```bash
docker compose up -d
```

> 💡 The `-d` flag means "run in the background". To stop them later: `docker compose down`

---

## Step 3 — Create the Backend (API Server)

```bash
# Create the backend folder
mkdir backend
cd backend

# Initialise a Node.js project
npm init -y

# Install core dependencies
npm install express typescript ts-node @types/node @types/express
npm install prisma @prisma/client
npm install bcrypt jsonwebtoken dotenv cors helmet
npm install @types/bcrypt @types/jsonwebtoken --save-dev
npm install nodemon --save-dev

# Initialise TypeScript
npx tsc --init

# Initialise Prisma (database ORM)
npx prisma init
```

Create a `.env` file in the `backend/` folder:

```env
DATABASE_URL="postgresql://activefleet:activefleet_local_password@localhost:5432/activefleet_dev"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="change-this-to-a-long-random-string-in-production"
JWT_REFRESH_SECRET="change-this-too"
PORT=3001
NODE_ENV=development
```

> ⚠️ **Never commit your `.env` file to git.** Make sure `.env` is in your `.gitignore`.

---

## Step 4 — Set Up the Database Schema

Open `backend/prisma/schema.prisma` and replace the contents with your first model. Here's a starter for the Operator entity from the spec:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Operator {
  id                 String    @id @default(uuid())
  name               String
  tradingName        String?
  registrationNumber String    @unique
  vatNumber          String?
  contactPerson      String
  contactEmail       String
  contactPhone       String
  physicalAddress    String
  region             String
  status             String    @default("active") // active, suspended, deactivated
  logoUrl            String?
  onboardedAt        DateTime?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
  deletedAt          DateTime?

  fleets   Fleet[]
  vehicles Vehicle[]
  drivers  Driver[]
}

model Fleet {
  id            String    @id @default(uuid())
  operatorId    String
  name          String
  code          String?
  contactPerson String?
  contactPhone  String?
  contactEmail  String?
  region        String?
  monthlyBudget Decimal?  @db.Decimal(12, 2)
  status        String    @default("active")
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  operator Operator  @relation(fields: [operatorId], references: [id])
  vehicles Vehicle[]
  drivers  Driver[]
}

model Vehicle {
  id                 String    @id @default(uuid())
  operatorId         String
  fleetId            String
  registrationNumber String
  vinNumber          String?
  make               String
  model              String
  year               Int
  colour             String?
  fuelType           String    // petrol, diesel, electric, hybrid, gas
  tankCapacity       Decimal   @db.Decimal(6, 2)
  currentOdometer    Int?
  status             String    @default("active")
  tagStatus          String    @default("unassigned")
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
  deletedAt          DateTime?

  operator Operator @relation(fields: [operatorId], references: [id])
  fleet    Fleet    @relation(fields: [fleetId], references: [id])
}

model Driver {
  id               String    @id @default(uuid())
  operatorId       String
  fleetId          String
  firstName        String
  lastName         String
  saIdNumber       String?
  passportNumber   String?
  mobileNumber     String
  email            String?
  driverPin        String    // stored hashed
  licenceNumber    String?
  licenceCode      String?
  licenceExpiry    DateTime?
  prdpNumber       String?
  prdpExpiry       DateTime?
  status           String    @default("active")
  dailySpendLimit  Decimal?  @db.Decimal(10, 2)
  monthlySpendLimit Decimal? @db.Decimal(10, 2)
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  deletedAt        DateTime?

  operator Operator @relation(fields: [operatorId], references: [id])
  fleet    Fleet    @relation(fields: [fleetId], references: [id])
}
```

Run the migration to create these tables in your database:

```bash
npx prisma migrate dev --name init
```

---

## Step 5 — Create the Frontend (Next.js App)

Go back to your project root:

```bash
cd ..

# Create a Next.js app
npx create-next-app@latest frontend --typescript --tailwind --app --src-dir

cd frontend

# Install extra libraries you'll need
npm install @tanstack/react-query axios zustand recharts
npm install lucide-react
```

---

## Step 6 — Create a Basic API Route (Test It Works)

In `backend/src/`, create a file `index.ts`:

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/v1/health', (req, res) => {
  res.json({ success: true, message: 'Active Fleet API is running' });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
```

Add a start script to `backend/package.json`:

```json
"scripts": {
  "dev": "nodemon --exec ts-node src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js"
}
```

Start the backend:

```bash
cd backend
npm run dev
```

Open your browser and visit: **http://localhost:3001/api/v1/health**

You should see: `{ "success": true, "message": "Active Fleet API is running" }`

🎉 Your backend is working!

---

## Step 7 — Commit Your Progress

```bash
cd ..  # Go back to project root
git add .
git commit -m "feat: project scaffold - backend API, database schema, frontend"
```

---

## Recommended Build Order (Phase 1)

Work through these in order — each one builds on the last:

- [ ] 1. Authentication (login, JWT tokens, password hashing)
- [ ] 2. User model and RBAC middleware
- [ ] 3. Operator CRUD API
- [ ] 4. Fleet CRUD API
- [ ] 5. Vehicle CRUD API + list view UI
- [ ] 6. Driver CRUD API + list view UI
- [ ] 7. Fuel transactions list + filters UI
- [ ] 8. Dashboard KPI cards
- [ ] 9. Wallet balance + EFT top-up
- [ ] 10. In-app notifications

---

## How to Use Claude Effectively

Since you're using Claude to help build this, here are prompts that work well:

**For building a new API endpoint:**
> "Using the Active Fleet spec, build the `GET /api/v1/vehicles` endpoint in Express with TypeScript. It should support pagination, filtering by fleet_id and status, and sorting. Use Prisma for the database query."

**For building a UI component:**
> "Build a Vehicle list page in Next.js with TypeScript and Tailwind. Show columns: Registration, Make/Model, Year, Fleet, Status. Include a search bar and status filter dropdown."

**For business logic:**
> "Write a TypeScript function that validates a South African ID number using the Luhn algorithm as described in the Active Fleet spec."

**For fixing errors:**
> "I'm getting this error: [paste error]. Here's my code: [paste code]. What's wrong?"

---

## Useful Commands Reference

| Command | What It Does |
|---------|-------------|
| `docker compose up -d` | Start database and Redis |
| `docker compose down` | Stop database and Redis |
| `npx prisma studio` | Open a visual database browser |
| `npx prisma migrate dev` | Apply new database changes |
| `npx prisma generate` | Regenerate Prisma client after schema changes |
| `git status` | See what files have changed |
| `git add .` | Stage all changes |
| `git commit -m "message"` | Save a snapshot of your code |
| `git log --oneline` | See your commit history |

---

## If Something Goes Wrong

**"Cannot connect to database"**
→ Make sure Docker Desktop is running, then: `docker compose up -d`

**"Module not found"**
→ Run `npm install` in the folder where the error occurs

**"Port already in use"**
→ Change the port number in your `.env` file

**"Prisma client is not generated"**
→ Run `npx prisma generate` in the backend folder

---

Good luck! Build one module at a time, commit often, and don't hesitate to ask Claude for help with specific pieces. 🚀
