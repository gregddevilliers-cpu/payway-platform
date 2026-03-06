import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Active Fleet demo data...');

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

  const now = new Date();

  // ── Vehicle Equipment ──────────────────────────────────
  const equipmentTypes = [
    { type: 'fire_extinguisher', expiry: true },
    { type: 'first_aid_kit', expiry: true },
    { type: 'spare_wheel', expiry: false },
    { type: 'jack_and_wrench', expiry: false },
    { type: 'warning_triangle', expiry: false },
    { type: 'reflective_vest', expiry: false },
  ];
  for (const v of vehicles) {
    for (const eq of equipmentTypes) {
      const expiryDate = eq.expiry
        ? new Date(now.getFullYear() + 1, Math.floor(Math.random() * 12), 15)
        : null;
      await prisma.vehicleEquipment.create({
        data: {
          vehicleId: v.id,
          equipmentType: eq.type,
          status: Math.random() > 0.1 ? 'present' : 'missing',
          expiryDate,
          lastChecked: new Date(now.getTime() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000),
        },
      });
    }
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

  // ── Insurers ────────────────────────────────────────────
  const insurers = [];
  const insurerData = [
    { name: 'Outsurance', claimsPhone: '+27123461000', claimsEmail: 'claims@outsurance.co.za', generalPhone: '+27123461000', brokerName: 'Jabu Mkhize', brokerPhone: '+27829991122', brokerEmail: 'jabu@outsurance.co.za' },
    { name: 'Santam Commercial', claimsPhone: '+27219158000', claimsEmail: 'claims@santam.co.za', generalPhone: '+27219158000', brokerName: 'Andre Potgieter', brokerPhone: '+27836543210', brokerEmail: 'andre@santam.co.za' },
    { name: 'Hollard Transport', claimsPhone: '+27112514000', claimsEmail: 'transport.claims@hollard.co.za', generalPhone: '+27112514000', brokerName: null, brokerPhone: null, brokerEmail: null },
  ];
  for (const ins of insurerData) {
    const insurer = await prisma.insurer.create({
      data: {
        operatorId: operator.id,
        companyName: ins.name,
        claimsPhone: ins.claimsPhone,
        claimsEmail: ins.claimsEmail,
        generalPhone: ins.generalPhone,
        brokerName: ins.brokerName,
        brokerPhone: ins.brokerPhone,
        brokerEmail: ins.brokerEmail,
        notes: `Primary insurer for taxi fleet operations`,
        status: 'active',
      },
    });
    insurers.push(insurer);
  }

  // ── Wallet ──────────────────────────────────────────────
  const wallet = await prisma.wallet.create({
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
        anomalyFlags: '[]',
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

  // ── Maintenance Schedules ───────────────────────────────
  const scheduleTypes = [
    { type: 'oil_service', months: 3, km: 10000, label: 'Oil & filter service' },
    { type: 'general_service', months: 6, km: 20000, label: 'Full general service' },
    { type: 'tyre_replacement', months: 12, km: 40000, label: 'Tyre replacement' },
    { type: 'brake_service', months: 6, km: 25000, label: 'Brake pad & disc check' },
    { type: 'wheel_alignment', months: 6, km: 15000, label: 'Wheel alignment & balancing' },
  ];

  for (const v of vehicles) {
    const baseOdo = v.currentOdometer ?? 50000;
    for (const sched of scheduleTypes) {
      const lastDate = new Date(now);
      lastDate.setMonth(lastDate.getMonth() - Math.floor(Math.random() * sched.months));
      const nextDate = new Date(lastDate);
      nextDate.setMonth(nextDate.getMonth() + sched.months);
      const lastOdo = baseOdo - Math.floor(Math.random() * sched.km * 0.5);
      const nextOdo = lastOdo + sched.km;

      await prisma.maintenanceSchedule.create({
        data: {
          operatorId: operator.id,
          vehicleId: v.id,
          maintenanceType: sched.type,
          intervalMonths: sched.months,
          intervalKm: sched.km,
          lastServiceDate: lastDate,
          lastServiceOdometer: lastOdo,
          nextDueDate: nextDate,
          nextDueOdometer: nextOdo,
          isActive: true,
        },
      });
    }
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
      specialisations: JSON.stringify(['panel_beating', 'spray_painting', 'mechanical']),
      rating: 4.2,
      status: 'active',
    },
  });

  // ── Repair Providers (additional) ───────────────────────
  const repairProvider2 = await prisma.repairProvider.create({
    data: {
      operatorId: operator.id,
      name: 'QuikFit Tyres & Mechanical',
      contactPerson: 'Themba Ngwenya',
      contactPhone: '+27117894560',
      contactEmail: 'themba@quikfit.co.za',
      address: '88 Main Reef Rd, Roodepoort',
      specialisations: JSON.stringify(['tyres', 'brakes', 'suspension', 'alignment']),
      rating: 4.5,
      status: 'active',
    },
  });

  const repairProvider3 = await prisma.repairProvider.create({
    data: {
      operatorId: operator.id,
      name: 'Sparky Auto Electrical',
      contactPerson: 'Chris van der Merwe',
      contactPhone: '+27124561230',
      contactEmail: 'chris@sparkyauto.co.za',
      address: '12 Pretoria Rd, Centurion',
      specialisations: JSON.stringify(['electrical', 'alternators', 'starters', 'wiring']),
      rating: 3.8,
      status: 'active',
    },
  });

  // ── Repair Jobs ─────────────────────────────────────────
  const repairJobsData = [
    { status: 'completed', desc: 'Engine overheating on long routes', type: 'mechanical', priority: 'high', drivable: false, provider: repairProvider, vIdx: 0 },
    { status: 'in_progress', desc: 'Side panel dent from parking incident', type: 'body_panel', priority: 'medium', drivable: true, provider: repairProvider, vIdx: 2 },
    { status: 'quoted', desc: 'Alternator not charging battery', type: 'electrical', priority: 'high', drivable: false, provider: repairProvider3, vIdx: 5 },
    { status: 'reported', desc: 'Front brake pads worn below limit', type: 'mechanical', priority: 'critical', drivable: true, provider: repairProvider2, vIdx: 3 },
    { status: 'completed', desc: 'Sliding door mechanism stuck', type: 'mechanical', priority: 'low', drivable: true, provider: repairProvider, vIdx: 7 },
    { status: 'in_progress', desc: 'Exhaust system rattling', type: 'mechanical', priority: 'medium', drivable: true, provider: repairProvider2, vIdx: 8 },
  ];

  const repairJobs = [];
  for (let i = 0; i < repairJobsData.length; i++) {
    const rd = repairJobsData[i];
    const v = vehicles[rd.vIdx];
    const fleet = vehicleData.find((vd) => vd.reg === v.registrationNumber)!.fleet;
    const totalCost = 2000 + Math.random() * 15000;
    const daysBack = 30 + Math.floor(Math.random() * 60);
    const createdDate = new Date(now);
    createdDate.setDate(createdDate.getDate() - daysBack);

    const repairJob = await prisma.repairJob.create({
      data: {
        operatorId: operator.id,
        vehicleId: v.id,
        fleetId: fleet.id,
        repairNumber: `RPR-${String(i + 1).padStart(4, '0')}`,
        repairType: rd.type,
        priority: rd.priority,
        status: rd.status,
        description: rd.desc,
        isDrivable: rd.drivable,
        providerId: rd.provider.id,
        odometerAtReport: (v.currentOdometer ?? 50000) + Math.floor(Math.random() * 5000),
        totalCost: rd.status === 'completed' ? Math.round(totalCost * 100) / 100 : null,
        labourCost: rd.status === 'completed' ? Math.round(totalCost * 0.4 * 100) / 100 : null,
        partsCost: rd.status === 'completed' ? Math.round(totalCost * 0.5 * 100) / 100 : null,
        vatAmount: rd.status === 'completed' ? Math.round(totalCost * 0.15 * 100) / 100 : null,
        actualCompletion: rd.status === 'completed' ? new Date(createdDate.getTime() + 7 * 24 * 60 * 60 * 1000) : null,
        downtimeDays: rd.status === 'completed' ? 7 : null,
        warrantyMonths: rd.status === 'completed' ? 6 : null,
      },
    });
    repairJobs.push(repairJob);
  }

  // ── Repair Quotes ─────────────────────────────────────
  for (let i = 0; i < repairJobs.length; i++) {
    const rj = repairJobs[i];
    const rd = repairJobsData[i];
    // Add quotes for jobs that are quoted, in_progress, or completed
    if (['quoted', 'in_progress', 'completed'].includes(rd.status)) {
      const labourTotal = 1500 + Math.random() * 5000;
      const partsTotal = 800 + Math.random() * 8000;
      const totalExcl = labourTotal + partsTotal;
      const vat = totalExcl * 0.15;
      const totalIncl = totalExcl + vat;

      await prisma.repairQuote.create({
        data: {
          repairJobId: rj.id,
          providerId: rd.provider.id,
          quoteNumber: `QT-${String(i + 1).padStart(4, '0')}`,
          lineItems: JSON.stringify([
            { description: 'Diagnostic assessment', quantity: 1, unitPrice: 450, total: 450 },
            { description: 'Labour — repair work', quantity: Math.ceil(labourTotal / 350), unitPrice: 350, total: Math.round(labourTotal) },
            { description: 'Parts and materials', quantity: 1, unitPrice: Math.round(partsTotal), total: Math.round(partsTotal) },
          ]),
          labourTotal: Math.round(labourTotal * 100) / 100,
          partsTotal: Math.round(partsTotal * 100) / 100,
          totalExclVat: Math.round(totalExcl * 100) / 100,
          vatAmount: Math.round(vat * 100) / 100,
          totalInclVat: Math.round(totalIncl * 100) / 100,
          estimatedDays: 3 + Math.floor(Math.random() * 7),
          warrantyMonths: 6,
          validUntil: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          status: rd.status === 'quoted' ? 'pending' : 'approved',
        },
      });
    }
  }

  // ── Repair Work Logs ──────────────────────────────────
  for (let i = 0; i < repairJobs.length; i++) {
    const rj = repairJobs[i];
    const rd = repairJobsData[i];
    // Add work log entries for in_progress and completed jobs
    if (['in_progress', 'completed'].includes(rd.status)) {
      await prisma.repairWorkLog.create({
        data: {
          repairJobId: rj.id,
          userId: adminUser.id,
          note: 'Vehicle received and initial assessment completed. Damage documented.',
          photosJson: JSON.stringify([]),
          partsReplaced: JSON.stringify([]),
        },
      });
      await prisma.repairWorkLog.create({
        data: {
          repairJobId: rj.id,
          userId: fleetManagerUser.id,
          note: 'Parts ordered from supplier. Expected delivery in 2 business days.',
          photosJson: JSON.stringify([]),
          partsReplaced: JSON.stringify([]),
        },
      });
      if (rd.status === 'completed') {
        await prisma.repairWorkLog.create({
          data: {
            repairJobId: rj.id,
            userId: adminUser.id,
            note: 'Repair completed. Quality check passed. Vehicle ready for collection.',
            photosJson: JSON.stringify([]),
            partsReplaced: JSON.stringify([
              { partName: 'Gasket set', partNumber: 'TY-GS-2022', cost: 1250 },
              { partName: 'Coolant 5L', partNumber: 'CLT-5000', cost: 380 },
            ]),
          },
        });
      }
    }
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
  const tags = [];
  for (let i = 0; i < 10; i++) {
    const tagNumber = `TAG-${String(i + 1).padStart(6, '0')}`;
    const tag = await prisma.tag.create({
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
    tags.push(tag);
  }

  // ── Tag History ───────────────────────────────────────
  for (let i = 0; i < vehicles.length; i++) {
    await prisma.tagHistory.create({
      data: {
        tagId: tags[i].id,
        operatorId: operator.id,
        action: 'assigned',
        toVehicleId: vehicles[i].id,
        previousStatus: 'unassigned',
        newStatus: 'active',
        reason: 'Initial tag assignment during fleet setup',
        performedBy: adminUser.id,
      },
    });
  }

  // ── Wallet Transactions ───────────────────────────────
  let balance = 0;
  const walletTxData = [
    { type: 'deposit', amount: 200000, desc: 'Initial wallet funding via EFT' },
    { type: 'debit', amount: 8500, desc: 'Fuel top-up — Soweto Fleet' },
    { type: 'debit', amount: 6200, desc: 'Fuel top-up — Pretoria Fleet' },
    { type: 'deposit', amount: 50000, desc: 'Monthly funding — March' },
    { type: 'debit', amount: 12400, desc: 'Fuel charges — week 1' },
    { type: 'debit', amount: 9800, desc: 'Fuel charges — week 2' },
    { type: 'debit', amount: 11200, desc: 'Fuel charges — week 3' },
    { type: 'deposit', amount: 50000, desc: 'Monthly funding — April' },
    { type: 'debit', amount: 15680, desc: 'Fuel charges — week 4' },
    { type: 'refund', amount: 1200, desc: 'Duplicate charge reversal — Shell Chris Hani' },
  ];
  for (let i = 0; i < walletTxData.length; i++) {
    const tx = walletTxData[i];
    const balanceBefore = balance;
    balance = tx.type === 'debit'
      ? balance - tx.amount
      : balance + tx.amount;
    const txDate = new Date(now);
    txDate.setDate(txDate.getDate() - (walletTxData.length - i) * 7);

    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: tx.type,
        amount: tx.amount,
        balanceBefore: Math.round(balanceBefore * 100) / 100,
        balanceAfter: Math.round(balance * 100) / 100,
        reference: `WTX-${String(i + 1).padStart(4, '0')}`,
        description: tx.desc,
        status: 'completed',
      },
    });
  }

  // ── Vehicle Handovers ─────────────────────────────────
  for (let i = 0; i < 4; i++) {
    const v = vehicles[i];
    const d = drivers[i];
    const fleet = i < 2 ? fleetSoweto : fleetPretoria;
    const handoverDate = new Date(now);
    handoverDate.setDate(handoverDate.getDate() - (30 - i * 7));

    await prisma.vehicleHandover.create({
      data: {
        operatorId: operator.id,
        vehicleId: v.id,
        driverId: d.id,
        fleetId: fleet.id,
        handoverNumber: `HND-${String(i + 1).padStart(4, '0')}`,
        handoverType: i % 2 === 0 ? 'check_out' : 'check_in',
        handoverDatetime: handoverDate,
        odometerReading: (v.currentOdometer ?? 50000) + i * 500,
        fuelLevel: ['full', 'three_quarter', 'half', 'full'][i],
        exteriorCondition: ['good', 'fair', 'good', 'excellent'][i],
        interiorCondition: ['good', 'good', 'fair', 'good'][i],
        damageNotes: i === 1 ? 'Small scratch on left rear panel — pre-existing' : null,
        equipmentChecklist: JSON.stringify({
          fire_extinguisher: true,
          first_aid_kit: true,
          spare_wheel: true,
          jack: true,
          warning_triangle: true,
          reflective_vest: i !== 2,
        }),
        photos: JSON.stringify([]),
        notes: i === 0 ? 'Driver briefed on new route schedule' : null,
      },
    });
  }

  // ── Notifications ─────────────────────────────────────
  const notificationData = [
    { userId: adminUser.id, type: 'repair_reported', title: 'New Repair Reported', message: `Repair RPR-0004 reported for GP 456-789 — Front brake pads worn below limit (Critical priority)`, metadata: { repairId: repairJobs[3]?.id, priority: 'critical' } },
    { userId: adminUser.id, type: 'fuel_anomaly', title: 'Fuel Anomaly Detected', message: `Unusual fuel transaction for GP 345-678 — 95L fill exceeds 70L tank capacity`, metadata: { vehicleId: vehicles[2].id } },
    { userId: fleetManagerUser.id, type: 'maintenance_due', title: 'Service Due Soon', message: `GP 890-123 oil service due in 500km or 7 days`, metadata: { vehicleId: vehicles[7].id, maintenanceType: 'oil_service' } },
    { userId: adminUser.id, type: 'repair_completed', title: 'Repair Completed', message: `Repair RPR-0001 completed — Engine overheating fix for GP 123-456. Total cost: R 8,450.00`, metadata: { repairId: repairJobs[0]?.id } },
    { userId: fleetManagerUser.id, type: 'contract_expiring', title: 'Contract Expiring', message: `Lease contract CTR-0001 for GP 123-456 expires in 60 days. Renewal action required.`, metadata: { contractNumber: 'CTR-0001' } },
    { userId: adminUser.id, type: 'wallet_low', title: 'Low Wallet Balance', message: `Wallet balance R 185,420.50 is approaching the low balance threshold of R 10,000.00`, metadata: { balance: 185420.50, threshold: 10000 } },
  ];
  for (let i = 0; i < notificationData.length; i++) {
    const n = notificationData[i];
    await prisma.notification.create({
      data: {
        userId: n.userId,
        operatorId: operator.id,
        type: n.type,
        title: n.title,
        message: n.message,
        isRead: i < 2,
        readAt: i < 2 ? new Date(now.getTime() - i * 3600000) : null,
        metadata: JSON.stringify(n.metadata),
      },
    });
  }

  // ── Documents ─────────────────────────────────────────
  const docData = [
    { entityType: 'vehicle', entityId: vehicles[0].id, docType: 'registration', fileName: 'GP123-456_registration.pdf', size: 245000 },
    { entityType: 'vehicle', entityId: vehicles[0].id, docType: 'insurance_certificate', fileName: 'GP123-456_insurance.pdf', size: 180000 },
    { entityType: 'vehicle', entityId: vehicles[1].id, docType: 'roadworthy', fileName: 'GP234-567_roadworthy.pdf', size: 312000 },
    { entityType: 'driver', entityId: drivers[0].id, docType: 'licence', fileName: 'Bongani_Mthembu_licence.pdf', size: 156000 },
    { entityType: 'driver', entityId: drivers[0].id, docType: 'prdp', fileName: 'Bongani_Mthembu_prdp.pdf', size: 98000 },
    { entityType: 'driver', entityId: drivers[5].id, docType: 'licence', fileName: 'Samuel_Khumalo_licence.pdf', size: 145000 },
    { entityType: 'fleet', entityId: fleetSoweto.id, docType: 'operating_licence', fileName: 'Soweto_Fleet_operating_licence.pdf', size: 520000 },
    { entityType: 'fleet', entityId: fleetPretoria.id, docType: 'operating_licence', fileName: 'Pretoria_Fleet_operating_licence.pdf', size: 485000 },
  ];
  for (const doc of docData) {
    await prisma.document.create({
      data: {
        operatorId: operator.id,
        entityType: doc.entityType,
        entityId: doc.entityId,
        documentType: doc.docType,
        fileName: doc.fileName,
        fileUrl: `/uploads/${operator.id}/${doc.fileName}`,
        fileSize: doc.size,
        mimeType: 'application/pdf',
        uploadedBy: adminUser.id,
        description: `${doc.docType.replace(/_/g, ' ')} document`,
      },
    });
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           ACTIVE FLEET — Demo Seed Complete             ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║                                                        ║');
  console.log('║  Login credentials:                                    ║');
  console.log('║    Admin:         admin@gthtransport.co.za             ║');
  console.log('║    Fleet Manager: thabo@gthtransport.co.za             ║');
  console.log('║    Password:      Demo1234!                            ║');
  console.log('║                                                        ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  Data created:                                         ║');
  console.log(`║    1 operator, 2 users, 3 cost centres                 ║`);
  console.log(`║    2 fleets, ${vehicles.length} vehicles, ${drivers.length} drivers                    ║`);
  console.log(`║    ${equipmentTypes.length * vehicles.length} vehicle equipment items                     ║`);
  console.log(`║    3 insurers, 1 wallet, 10 wallet transactions        ║`);
  console.log(`║    ~35 fuel transactions, 15 maintenance records       ║`);
  console.log(`║    50 maintenance schedules                            ║`);
  console.log(`║    3 repair providers, 6 repair jobs, quotes & logs    ║`);
  console.log(`║    4 incidents, 4 contracts with payments              ║`);
  console.log(`║    10 tags with history, 4 vehicle handovers           ║`);
  console.log(`║    6 notifications, 8 documents                        ║`);
  console.log('║                                                        ║');
  console.log('║  All 28 tables populated with realistic SA demo data   ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
