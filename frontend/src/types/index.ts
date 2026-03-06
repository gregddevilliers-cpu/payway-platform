// ---------------------------------------------------------------------------
// API response envelope
// ---------------------------------------------------------------------------
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  errors?: { message: string }[];
}

// ---------------------------------------------------------------------------
// Tag types
// ---------------------------------------------------------------------------
export type TagStatus =
  | 'unassigned'
  | 'active'
  | 'blocked'
  | 'lost'
  | 'expired'
  | 'decommissioned';

export type BlockedReason =
  | 'stolen'
  | 'damaged'
  | 'fraud_suspected'
  | 'operator_request'
  | 'system_block'
  | 'other';

export type TagHistoryAction =
  | 'created'
  | 'assigned'
  | 'unassigned'
  | 'activated'
  | 'blocked'
  | 'unblocked'
  | 'transferred'
  | 'replaced'
  | 'lost_reported'
  | 'expired'
  | 'decommissioned';

export interface TagVehicle {
  id: string;
  registrationNumber: string;
  make: string;
  model: string;
  fuelType?: string;
}

export interface TagHistoryEntry {
  id: string;
  tagId: string;
  operatorId: string;
  action: TagHistoryAction;
  fromVehicleId: string | null;
  toVehicleId: string | null;
  previousStatus: string | null;
  newStatus: string;
  reason: string | null;
  performedBy: string;
  createdAt: string;
}

export interface Tag {
  id: string;
  operatorId: string;
  tagNumber: string;
  vehicleId: string | null;
  status: TagStatus;
  blockedReason: BlockedReason | null;
  issuedDate: string | null;
  expiryDate: string | null;
  activatedAt: string | null;
  blockedAt: string | null;
  lastUsedAt: string | null;
  lastUsedForecourtId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  vehicle?: TagVehicle | null;
  histories?: TagHistoryEntry[];
}

export interface TagSummary {
  total: number;
  unassigned: number;
  active: number;
  blocked: number;
  lost: number;
  expired: number;
  decommissioned: number;
}

// ---------------------------------------------------------------------------
// List query params
// ---------------------------------------------------------------------------
export interface TagListParams {
  status?: TagStatus;
  vehicleId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Cost Centre types
// ---------------------------------------------------------------------------
export interface CostCentre {
  id: string;
  operatorId: string;
  name: string;
  code: string;
  description: string | null;
  budget: number | string | null;
  budgetPeriod: string | null;
  parentId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  parent?: { id: string; name: string; code: string } | null;
  children?: { id: string; name: string; code: string; isActive: boolean }[];
  vehicles?: { id: string; registrationNumber: string; make: string; model: string }[];
  fleets?: { id: string; name: string; code: string }[];
  _count?: { vehicles: number; fleets: number };
  spend?: {
    fuelSpend: number;
    maintenanceSpend: number;
    repairSpend: number;
    totalSpend: number;
    budget: number | null;
    variance: number | null;
  };
}

export interface SpendByCostCentre {
  costCentreId: string;
  costCentreName: string;
  code: string;
  fuelSpend: number;
  maintenanceSpend: number;
  repairSpend: number;
  totalSpend: number;
  budget: number | null;
  budgetPeriod: string | null;
  variance: number | null;
}

// ---------------------------------------------------------------------------
// VAT types
// ---------------------------------------------------------------------------
export interface VatBreakdown {
  exclVat: number;
  vatAmount: number;
  inclVat: number;
}

export interface VatSummary {
  fuelVat: VatBreakdown & { transactionCount: number };
  maintenanceVat: VatBreakdown & { recordCount: number };
  repairVat: VatBreakdown & { jobCount: number };
  combined: VatBreakdown;
}

export interface VatByFleetEntry {
  fleetId: string;
  fleetName: string;
  fuel: VatBreakdown;
  maintenance: VatBreakdown;
  repair: VatBreakdown;
  total: VatBreakdown;
}

export interface VatByCostCentreEntry {
  costCentreId: string;
  costCentreName: string;
  code: string;
  fuel: VatBreakdown;
  maintenance: VatBreakdown;
  repair: VatBreakdown;
  total: VatBreakdown;
}

export interface MonthlyVatTrendEntry {
  month: number;
  year: number;
  fuelVat: number;
  maintenanceVat: number;
  repairVat: number;
  totalVat: number;
}

// ---------------------------------------------------------------------------
// Budget types
// ---------------------------------------------------------------------------
export type BudgetStatus = 'under_budget' | 'at_risk' | 'over_budget';

export interface BudgetVarianceEntry {
  entityId: string;
  entityName: string;
  budget: number;
  actualSpend: number;
  fuelSpend: number;
  maintenanceSpend: number;
  repairSpend: number;
  variance: number;
  variancePercent: number;
  status: BudgetStatus;
}

export interface BudgetForecast {
  currentSpend: number;
  projectedSpend: number;
  budget: number;
  projectedVariance: number;
  onTrack: boolean;
  daysElapsed: number;
  daysInMonth: number;
}

export interface BudgetAlert {
  entityType: 'fleet' | 'cost_centre';
  entityId: string;
  entityName: string;
  budget: number;
  currentSpend: number;
  percentConsumed: number;
  level: 'warning' | 'critical' | 'over';
}

export interface BudgetVarianceTrendEntry {
  month: number;
  year: number;
  budget: number;
  actual: number;
  variance: number;
  variancePercent: number;
}

// ---------------------------------------------------------------------------
// Contract types
// ---------------------------------------------------------------------------
export type ContractStatus = 'draft' | 'active' | 'expiring' | 'expired' | 'terminated' | 'renewed';
export type ContractType =
  | 'lease'
  | 'finance'
  | 'rental'
  | 'service_agreement'
  | 'insurance'
  | 'warranty'
  | 'other';

export interface VehicleContract {
  id: string;
  operatorId: string;
  vehicleId: string;
  contractType: ContractType;
  provider: string;
  contractNumber: string | null;
  startDate: string;
  endDate: string;
  monthlyAmount: number | string | null;
  totalContractValue: number | string | null;
  depositPaid: number | string | null;
  residualValue: number | string | null;
  escalationRate: number | string | null;
  paymentDay: number | null;
  terms: string | null;
  renewalType: string | null;
  renewalNoticeDays: number | null;
  status: ContractStatus;
  terminationReason: string | null;
  terminationDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  vehicle?: { id: string; registrationNumber: string; make: string; model: string; year?: number };
  daysRemaining?: number;
  totalPaid?: number;
  remainingBalance?: number | null;
  payments?: ContractPayment[];
}

export interface ContractPayment {
  id: string;
  contractId: string;
  operatorId: string;
  paymentDate: string;
  amount: number | string;
  vatAmount: number | string | null;
  paymentMethod: string | null;
  reference: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
}

export interface ContractSummary {
  activeContracts: number;
  totalMonthlyObligations: number;
  expiringWithin30Days: number;
  totalRemainingLiabilities: number;
  byType: Record<string, { count: number; monthlyAmount: number }>;
}

export interface ContractListParams {
  vehicleId?: string;
  contractType?: ContractType;
  status?: ContractStatus;
  provider?: string;
  expiringDays?: number;
  page?: number;
  limit?: number;
}
