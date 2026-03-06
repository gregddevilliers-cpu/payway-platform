import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

import authRoutes from './routes/auth';
import auditLogRoutes from './routes/auditLog';
import documentRoutes from './routes/documents';
import maintenanceRoutes from './routes/maintenance';
import incidentRoutes from './routes/incidents';
import fuelTransactionRoutes from './routes/fuelTransactions';
import reportRoutes from './routes/reports';
import dashboardRoutes from './routes/dashboard';
import searchRoutes from './routes/search';
import vehicleRoutes from './routes/vehicles';
import driverRoutes from './routes/drivers';
import fleetRoutes from './routes/fleets';
import repairProviderRoutes from './routes/repair-providers';
import repairRoutes from './routes/repairs';
import importRoutes from './routes/imports';
import tagRoutes from './routes/tags';
import costCentreRoutes from './routes/costCentres';
import vatRoutes from './routes/vat';
import budgetRoutes from './routes/budget';
import contractRoutes from './routes/contracts';
import insurerRoutes from './routes/insurers';
import vehicleEquipmentRoutes from './routes/vehicleEquipment';
import handoverRoutes from './routes/handovers';
import userRoutes from './routes/users';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/api/v1/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Active Fleet API is running',
    timestamp: new Date().toISOString(),
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/audit-log', auditLogRoutes);
app.use('/api/v1/documents', documentRoutes);
app.use('/api/v1/maintenance', maintenanceRoutes);
app.use('/api/v1/incidents', incidentRoutes);
app.use('/api/v1/fuel-transactions', fuelTransactionRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1/vehicles', vehicleRoutes);
app.use('/api/v1/drivers', driverRoutes);
app.use('/api/v1/fleets', fleetRoutes);
app.use('/api/v1/repair-providers', repairProviderRoutes);
app.use('/api/v1/repairs', repairRoutes);
app.use('/api/v1/import', importRoutes);
app.use('/api/v1/tags', tagRoutes);
app.use('/api/v1/cost-centres', costCentreRoutes);
app.use('/api/v1/vat', vatRoutes);
app.use('/api/v1/budget', budgetRoutes);
app.use('/api/v1/contracts', contractRoutes);
app.use('/api/v1/insurers', insurerRoutes);
app.use('/api/v1/vehicles/:vehicleId/equipment', vehicleEquipmentRoutes);
app.use('/api/v1/handovers', handoverRoutes);
app.use('/api/v1/users', userRoutes);

// Serve uploaded files statically (per-download auth is enforced via the documents route)
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, errors: ['Route not found'] });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err);
  res.status(500).json({ success: false, errors: ['Internal server error'] });
});

app.listen(PORT, () => {
  console.log(`✅ Active Fleet API running on http://localhost:${PORT}`);
});
