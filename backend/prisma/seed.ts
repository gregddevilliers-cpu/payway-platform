import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding PayWay demo data...');

  // ── Operator ────────────────────────────────────────────
  const operator = await prisma.operator.create({
    data: {
      name: 'Gauteng Taxi Holdings',
      tradingName: 'GTH Transport',
      registrationNumber: '2019/123456/07',
      vatNumber: '4123456789',
      contactPerson: 'Sipho Ndlovu',
      contactEmail: 'sipho@gthtransport.co.za',
      contactPhone: '+27821234567',
      physicalAddress: '45 Commissioner St, Johannesburg, 2001',
      region: 'Gauteng',
      status: 'active',
      onboardedAt: new Date('2024-01-15'),
    },
  });

  // ── Users ───────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Demo1234!', 12);

  const adminUser = await prisma.user.create({
    data: {
      operatorId: operator.id,
      email: 'admin@gthtransport.co.za',
      passwordHash,
      role: 'operator_admin',
      firstName: 'Sipho',
      lastName: 'Ndlovu',
      mobileNumber: '+27821234567',
    },
  });

  const fleetManagerUser = await prisma.user.create({
    data: {
      operatorId: operator.id,
      email: 'thabo@gthtransport.co.za',
      passwordHash,
      role: 'fleet_manager',
      firstName: 'Thabo',
      lastName: 'Mokoena',
      mobileNumber: '+27839876543',
    },
  });

  // ── Cost Centres ────────────────────────────────────────
  const ccOperations = await prisma.costCentre.create({
    data: {
      operatorId: operator.id,
      name: 'Operations',
      code: 'OPS',
      description: 'Main taxi operations',
      budget: 250000,
      budgetPeriod: 'monthly',
      isActive: true,
    },
  });

  const ccSoweto = await prisma.costCentre.create({
    data: {
      operatorId: operator.id,
      name: 'Soweto Routes',
      code: 'OPS-SWT',
      description: 'Soweto and surrounding routes',
      budget: 120000,
      budgetPeriod: 'monthly',
      parentId: ccOperations.id,
      isActive: true,
    },
  });

  const ccPretoria = await prisma.costCentre.create({
    data: {
      operatorId: operator.id,
      name: 'Pretoria Routes',
      code: 'OPS-PTA',
      description: 'Pretoria and Centurion routes',
      budget: 130000,
      budgetPeriod: 'monthly',
      parentId: ccOperations.id,
      isActive: true,
    },
  });

  // ── Fleets ──────────────────────────────────────────────
  const fleetSoweto = await prisma.fleet.create({
    data: {
      operatorId: operator.id,
      name: 'Soweto Fleet',
      code: 'SWT-01',
      contactPerson: 'Thabo Mokoena',
      contactPhone: '+27839876543',
      contactEmail: 'thabo@gthtransport.co.za',
      region: 'Soweto',
      monthlyBudget: 120000,
      status: 'active',
      costCentreId: ccSoweto.id,
    },
  });

  const fleetPretoria = await prisma.fleet.create({
    data: {
      operatorId: operator.id,
      name: 'Pretoria Fleet',
      code: 'PTA-01',
      contactPerson: 'Lindiwe Dlamini',
      contactPhone: '+27841112233',
      contactEmail: 'lindiwe@gthtransport.co.za',
      region: 'Pretoria',
      monthlyBudget: 130000,
      status: 'active',
      costCentreId: ccPretoria.id,
    },
  });

  // ── Vehicles ────────────────────────────────────────────
  const vehicleData = [
    { reg: 'GP 123-456', make: 'Toyota', model: 'Quantum 2.5 D-4D', year: 2022, fuel: 'diesel', tank: 75, odo: 98500, fleet: fleetSoweto, cc: ccSoweto },
    { reg: 'GP 234-567', make: 'Toyota', model: 'Quantum 2.5 D-4D', year: 2023, fuel: 'diesel', tank: 75, odo: 52300, fleet: fleetSoweto, cc: ccSoweto },
    { reg: 'GP 345-678', make: 'Toyota', model: 'HiAce Ses\'fikile', year: 2021, fuel: 'diesel', tank: 70, odo: 135000, fleet: fleetSoweto, cc: ccSoweto },
    { reg: 'GP 456-789', make: 'Toyota', model: 'Quantum 2.5 D-4D', year: 2024, fuel: 'diesel', tank: 75, odo: 18200, fleet: fleetSoweto, cc: ccSoweto },
    { reg: 'GP 567-890', make: 'Iveco', model: 'Daily 50C15', year: 2022, fuel: 'diesel', tank: 100, odo: 87600, fleet: fleetSoweto, cc: ccSoweto },
    { reg: 'GP 678-901', make: 'Toyota', model: 'Quantum 2.5 D-4D', year: 2023, fuel: 'diesel', tank: 75, odo: 45000, fleet: fleetPretoria, cc: ccPretoria },
    { reg: 'GP 789-012', make: 'Toyota', model: 'HiAce Ses\'fikile', year: 2022, fuel: 'diesel', tank: 70, odo: 110200, fleet: fleetPretoria, cc: ccPretoria },
    { reg: 'GP 890-123', make: 'Toyota', model: 'Quantum 2.7', year: 2021, fuel: 'petrol', tank: 70, odo: 155000, fleet: fleetPretoria, cc: ccPretoria },
    { reg: 'GP 901-234', make: 'Iveco', model: 'Daily 50C15', year: 2023, fuel: 'diesel', tank: 100, odo: 34500, fleet: fleetPretoria, cc: ccPretoria },
    { reg: 'GP 012-345', make: 'Toyota', model: 'Quantum 2.5 D-4D', year: 2024, fuel: 'diesel', tank: 75, odo: 12000, fleet: fleetPretoria, cc: ccPretoria },
  ];

  const vehicles = [];
  for (const v of vehicleData) {
    const vehicle = await prisma.vehicle.create({
      data: {
        operatorId: operator.id,
        fleetId: v.fleet.id,
        registrationNumber: v.reg,
        make: v.make,
        model: v.model,
        year: v.year,
        fuelType: v.fuel,
        tankCapacity: v.tank,
        currentOdometer: v.odo,
        status: 'active',
        costCentreId: v.cc.id,
        ownershipType: v.year >= 2023 ? 'leased' : 'owned',
      },
    });
    vehicles.push(vehicle);
  }

  // ── Drivers ─────────────────────────────────────────────
  const driverData = [
    { first: 'Bongani', last: 'Mthembu', mobile: '+27821001001', fleet: fleetSoweto, pin: '1234' },
    { first: 'Mandla', last: 'Zulu', mobile: '+27821001002', fleet: fleetSoweto, pin: '2345' },
    { first: 'Johannes', last: 'Van Wyk', mobile: '+27821001003', fleet: fleetSoweto, pin: '3456' },
    { first: 'Tshepo', last: 'Mahlangu', mobile: '+27821001004', fleet: fleetSoweto, pin: '4567' },
    { first: 'Patrick', last: 'Nkosi', mobile: '+27821001005', fleet: fleetSoweto, pin: '5678' },
    { first: 'Samuel', last: 'Khumalo', mobile: '+27821001006', fleet: fleetPretoria, pin: '6789' },
    { first: 'David', last: 'Molefe', mobile: '+27821001007', fleet: fleetPretoria, pin: '7890' },
    { first: 'Pieter', last: 'Botha', mobile: '+27821001008', fleet: fleetPretoria, pin: '8901' },
    { first: 'Lucky', last: 'Sithole', mobile: '+27821001009', fleet: fleetPretoria, pin: '9012' },
    { first: 'Ernest', last: 'Mabaso', mobile: '+27821001010', fleet: fleetPretoria, pin: '0123' },
  ];

  const drivers = [];
  for (const d of driverData) {
    const driver = await prisma.driver.create({
      data: {
        operatorId: operator.id,
        fleetId: d.fleet.id,
        firstName: d.first,
        lastName: d.last,
        mobileNumber: d.mobile,
        driverPin: d.pin,
        licenceCode: 'EC',
        prdpNumber: `PRDP${Math.floor(100000 + Math.random() * 900000)}`,
        prdpExpiry: new Date('2027-06-30'),
        status: 'active',
        dailySpendLimit: 1500,
        monthlySpendLimit: 30000,
      },
    });
    drivers.push(driver);
  }

  // ── Wallet ──────────────────────────────────────────────
  await prisma.wallet.create({
    data: {
      operatorId: operator.id,
      balance: 185420.50,
      creditLimit: 50000,
      lowBalanceThreshold: 10000,
      currency: 'ZAR',
      status: 'active',
    },
  });

  // ── Fuel Transactions (last 3 months) ───────────────────
  const sites = [
    { code: 'ENG-JHB-01', name: 'Engen Soweto Highway' },
    { code: 'SHL-SWT-01', name: 'Shell Chris Hani Rd' },
    { code: 'BP-PTA-01', name: 'BP Centurion Mall' },
    { code: 'ENG-PTA-02', name: 'Engen Church St' },
    { code: 'CLT-JHB-01', name: 'Caltex Booysens' },
  ];

  const now = new Date();
  for (let daysBack = 90; daysBack >= 0; daysBack -= Math.floor(Math.random() * 3) + 1) {
    const txDate = new Date(now);
    txDate.setDate(txDate.getDate() - daysBack);

    // Each vehicle gets a fill-up roughly every 2-3 days
    const vehicleIdx = Math.floor(Math.random() * vehicles.length);
    const vehicle = vehicles[vehicleIdx];
    const driverIdx = vehicleIdx; // pair drivers with vehicles
    const driver = drivers[driverIdx];
    const site = sites[Math.floor(Math.random() * sites.length)];
    const fleet = vehicleIdx < 5 ? fleetSoweto : fleetPretoria;

    const litres = 35 + Math.random() * 40; // 35-75L
    const pricePerLitre = vehicle.fuelType === 'diesel' ? 21.40 + Math.random() * 2 : 23.50 + Math.random() * 2;
    const total = litres * pricePerLitre;

    await prisma.fuelTransaction.create({
      data: {
        operatorId: operator.id,
        fleetId: fleet.id,
        vehicleId: vehicle.id,
        driverId: driver.id,
        transactionDate: txDate,
        litresFilled: Math.round(litres * 100) / 100,
        pricePerLitre: Math.round(pricePerLitre * 10000) / 10000,
        totalAmount: Math.round(total * 100) / 100,
        fuelType: vehicle.fuelType,
        odometer: (vehicle.currentOdometer ?? 50000) + (90 - daysBack) * 150,
        siteCode: site.code,
        siteName: site.name,
        status: 'approved',
        anomalyFlags: [],
      },
    });
  }

  // ── Maintenance Records ─────────────────────────────────
  const maintTypes = ['oil_service', 'tyre_replacement', 'brake_service', 'general_service', 'wheel_alignment'];
  for (let i = 0; i < 15; i++) {
    const v = vehicles[Math.floor(Math.random() * vehicles.length)];
    const fleet = vehicleData.find((vd) => vd.reg === v.registrationNumber)!.fleet;
    const daysBack = Math.floor(Math.random() * 90);
    const serviceDate = new Date(now);
    serviceDate.setDate(serviceDate.getDate() - daysBack);
    const cost = 800 + Math.random() * 8000;
    const vatAmount = cost * 0.15;

    await prisma.maintenanceRecord.create({
      data: {
        operatorId: operator.id,
        vehicleId: v.id,
        fleetId: fleet.id,
        maintenanceType: maintTypes[Math.floor(Math.random() * maintTypes.length)],
        description: `Scheduled service at ${(v.currentOdometer ?? 50000) + (90 - daysBack) * 150} km`,
        provider: ['Toyota Sandton', 'Barloworld Motor', 'Hi-Q Soweto', 'AutoZone Centurion'][Math.floor(Math.random() * 4)],
        cost: Math.round(cost * 100) / 100,
        vatAmount: Math.round(vatAmount * 100) / 100,
        odometer: (v.currentOdometer ?? 50000) + (90 - daysBack) * 150,
        serviceDate,
        nextServiceDate: new Date(serviceDate.getTime() + 90 * 24 * 60 * 60 * 1000),
        isScheduled: Math.random() > 0.3,
        status: 'completed',
      },
    });
  }

  // ── Repair Provider ─────────────────────────────────────
  const repairProvider = await prisma.repairProvider.create({
    data: {
      operatorId: operator.id,
      name: 'AutoBody Pro Johannesburg',
      contactPerson: 'Mike Johnson',
      contactPhone: '+27114567890',
      contactEmail: 'mike@autobodypro.co.za',
      address: '123 Industrial Rd, Booysens, Johannesburg',
      specialisations: ['panel_beating', 'spray_painting', 'mechanical'],
      rating: 4.2,
      status: 'active',
    },
  });

  // ── Repair Jobs ─────────────────────────────────────────
  const repairStatuses = ['reported', 'diagnosed', 'quoted', 'in_progress', 'completed'];
  for (let i = 0; i < 6; i++) {
    const v = vehicles[Math.floor(Math.random() * vehicles.length)];
    const fleet = vehicleData.find((vd) => vd.reg === v.registrationNumber)!.fleet;
    const status = repairStatuses[Math.floor(Math.random() * repairStatuses.length)];
    const totalCost = 2000 + Math.random() * 15000;

    await prisma.repairJob.create({
      data: {
        operatorId: operator.id,
        vehicleId: v.id,
        fleetId: fleet.id,
        repairNumber: `RPR-${String(i + 1).padStart(4, '0')}`,
        repairType: ['mechanical', 'body', 'electrical', 'tyre'][Math.floor(Math.random() * 4)],
        priority: ['low', 'medium', 'high', 'critical'][Math.floor(Math.random() * 4)],
        status,
        description: [
          'Engine overheating on long routes',
          'Side panel dent from parking incident',
          'Alternator not charging battery',
          'Front brake pads worn below limit',
          'Sliding door mechanism stuck',
          'Exhaust system rattling',
        ][i],
        isDrivable: Math.random() > 0.3,
        providerId: repairProvider.id,
        totalCost: status === 'completed' ? Math.round(totalCost * 100) / 100 : null,
        labourCost: status === 'completed' ? Math.round(totalCost * 0.4 * 100) / 100 : null,
        partsCost: status === 'completed' ? Math.round(totalCost * 0.5 * 100) / 100 : null,
        vatAmount: status === 'completed' ? Math.round(totalCost * 0.15 * 100) / 100 : null,
      },
    });
  }

  // ── Incidents ───────────────────────────────────────────
  for (let i = 0; i < 4; i++) {
    const v = vehicles[Math.floor(Math.random() * vehicles.length)];
    const fleet = vehicleData.find((vd) => vd.reg === v.registrationNumber)!.fleet;
    const daysBack = Math.floor(Math.random() * 60);
    const incidentDate = new Date(now);
    incidentDate.setDate(incidentDate.getDate() - daysBack);

    await prisma.incident.create({
      data: {
        operatorId: operator.id,
        vehicleId: v.id,
        fleetId: fleet.id,
        incidentNumber: `INC-${String(i + 1).padStart(4, '0')}`,
        incidentDate,
        incidentType: ['collision', 'theft', 'vandalism', 'mechanical_failure'][i],
        description: [
          'Rear-ended at traffic light on N1',
          'Side mirror stolen overnight at rank',
          'Windscreen cracked by stones on R21',
          'Clutch failure during peak hour service',
        ][i],
        location: ['N1 South, Midrand', 'Baragwanath Taxi Rank', 'R21 Kempton Park', 'M1 Highway Johannesburg'][i],
        severity: ['moderate', 'minor', 'minor', 'major'][i],
        status: ['under_investigation', 'resolved', 'resolved', 'reported'][i],
        thirdPartyInvolved: i === 0,
        costEstimate: [15000, 2500, 4500, 8000][i],
      },
    });
  }

  // ── Vehicle Contracts ───────────────────────────────────
  for (let i = 0; i < 4; i++) {
    const v = vehicles[i]; // first 4 vehicles are leased
    const startDate = new Date('2024-01-01');
    startDate.setMonth(startDate.getMonth() + i * 2);
    const endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + 3);

    const contract = await prisma.vehicleContract.create({
      data: {
        operatorId: operator.id,
        vehicleId: v.id,
        contractType: ['lease', 'lease', 'finance', 'insurance'][i],
        provider: ['Toyota Financial Services', 'WesBank', 'Nedbank Vehicle Finance', 'Outsurance'][i],
        contractNumber: `CTR-${String(i + 1).padStart(4, '0')}`,
        startDate,
        endDate,
        monthlyAmount: [8500, 9200, 7800, 3200][i],
        totalContractValue: [306000, 331200, 280800, 115200][i],
        depositPaid: i < 3 ? [25000, 30000, 20000][i] : null,
        residualValue: i < 2 ? [85000, 92000][i] : null,
        paymentDay: 1,
        renewalType: i === 3 ? 'auto_renew' : 'fixed_term',
        renewalNoticeDays: 60,
        status: 'active',
      },
    });

    // Add a few payments per contract
    for (let m = 0; m < 6; m++) {
      const paymentDate = new Date(startDate);
      paymentDate.setMonth(paymentDate.getMonth() + m);
      if (paymentDate > now) break;

      await prisma.contractPayment.create({
        data: {
          contractId: contract.id,
          operatorId: operator.id,
          paymentDate,
          amount: contract.monthlyAmount!,
          vatAmount: Number(contract.monthlyAmount!) * 0.15,
          paymentMethod: 'debit_order',
          reference: `PAY-${contract.contractNumber}-${String(m + 1).padStart(2, '0')}`,
          status: 'completed',
        },
      });
    }
  }

  // ── Tags ────────────────────────────────────────────────
  for (let i = 0; i < 10; i++) {
    const tagNumber = `TAG-${String(i + 1).padStart(6, '0')}`;
    await prisma.tag.create({
      data: {
        operatorId: operator.id,
        tagNumber,
        vehicleId: i < vehicles.length ? vehicles[i].id : null,
        status: i < vehicles.length ? 'active' : 'unassigned',
        issuedDate: new Date('2024-06-01'),
        expiryDate: new Date('2026-12-31'),
        activatedAt: i < vehicles.length ? new Date('2024-06-15') : null,
      },
    });
  }

  console.log('');
  console.log('=== Seed complete! ===');
  console.log('');
  console.log('Login credentials:');
  console.log('  Admin:         admin@gthtransport.co.za  /  Demo1234!');
  console.log('  Fleet Manager: thabo@gthtransport.co.za  /  Demo1234!');
  console.log('');
  console.log('Data created:');
  console.log(`  1 operator, 2 users, 2 fleets, 3 cost centres`);
  console.log(`  ${vehicles.length} vehicles, ${drivers.length} drivers`);
  console.log(`  ~35 fuel transactions, 15 maintenance records`);
  console.log(`  6 repair jobs, 4 incidents, 4 contracts, 10 tags`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
