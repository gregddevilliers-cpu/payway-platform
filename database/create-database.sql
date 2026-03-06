-- ============================================================================
-- Active Fleet Platform — MSSQL Database Creation Script
-- Target: SQL Server 2022 on Windows Server 2022 (128GB RAM)
-- ============================================================================
-- This script is idempotent — safe to run multiple times.
-- Run with: sqlcmd -S localhost -U sa -P "YourPassword" -C -i create-database.sql
-- ============================================================================

-- ─── Server-level memory configuration (128GB machine) ──────────────────────
-- Allocate 96GB to SQL Server, leave 32GB for OS + Docker + services
EXEC sp_configure 'show advanced options', 1;
RECONFIGURE;
EXEC sp_configure 'max server memory (MB)', 98304;
RECONFIGURE;
GO

-- ─── Create Database ────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'ActiveFleet')
BEGIN
    CREATE DATABASE [ActiveFleet]
    ON PRIMARY (
        NAME = N'ActiveFleet_Data',
        FILENAME = N'/var/opt/mssql/data/ActiveFleet_Data.mdf',
        SIZE = 1024MB,
        FILEGROWTH = 256MB
    )
    LOG ON (
        NAME = N'ActiveFleet_Log',
        FILENAME = N'/var/opt/mssql/data/ActiveFleet_Log.ldf',
        SIZE = 512MB,
        FILEGROWTH = 128MB
    );
    PRINT 'Database ActiveFleet created.';
END
ELSE
    PRINT 'Database ActiveFleet already exists.';
GO

USE [ActiveFleet];
GO

-- Set recovery model
ALTER DATABASE [ActiveFleet] SET RECOVERY FULL;
GO

-- ============================================================================
-- TABLES
-- ============================================================================

-- ─── Operator ───────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Operator')
CREATE TABLE [Operator] (
    [id]                 NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [name]               NVARCHAR(1000) NOT NULL,
    [tradingName]        NVARCHAR(1000) NULL,
    [registrationNumber] NVARCHAR(1000) NOT NULL,
    [vatNumber]          NVARCHAR(1000) NULL,
    [contactPerson]      NVARCHAR(1000) NOT NULL,
    [contactEmail]       NVARCHAR(1000) NOT NULL,
    [contactPhone]       NVARCHAR(1000) NOT NULL,
    [physicalAddress]    NVARCHAR(MAX)  NOT NULL,
    [region]             NVARCHAR(1000) NOT NULL,
    [status]             NVARCHAR(1000) NOT NULL DEFAULT 'active',
    [logoUrl]            NVARCHAR(MAX)  NULL,
    [onboardedAt]        DATETIME2(3)   NULL,
    [createdAt]          DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]          DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [deletedAt]          DATETIME2(3)   NULL,
    CONSTRAINT [PK_Operator] PRIMARY KEY ([id]),
    CONSTRAINT [UQ_Operator_registrationNumber] UNIQUE ([registrationNumber])
);
GO

-- ─── Insurer ────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Insurer')
CREATE TABLE [Insurer] (
    [id]            NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [operatorId]    NVARCHAR(36)   NOT NULL,
    [companyName]   NVARCHAR(1000) NOT NULL,
    [claimsPhone]   NVARCHAR(1000) NULL,
    [claimsEmail]   NVARCHAR(1000) NULL,
    [generalPhone]  NVARCHAR(1000) NULL,
    [brokerName]    NVARCHAR(1000) NULL,
    [brokerPhone]   NVARCHAR(1000) NULL,
    [brokerEmail]   NVARCHAR(1000) NULL,
    [notes]         NVARCHAR(MAX)  NULL,
    [status]        NVARCHAR(1000) NOT NULL DEFAULT 'active',
    [createdAt]     DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]     DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [deletedAt]     DATETIME2(3)   NULL,
    CONSTRAINT [PK_Insurer] PRIMARY KEY ([id]),
    CONSTRAINT [FK_Insurer_Operator] FOREIGN KEY ([operatorId]) REFERENCES [Operator]([id])
);
GO

-- ─── CostCentre ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CostCentre')
CREATE TABLE [CostCentre] (
    [id]           NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [operatorId]   NVARCHAR(36)   NOT NULL,
    [name]         NVARCHAR(1000) NOT NULL,
    [code]         NVARCHAR(1000) NOT NULL,
    [description]  NVARCHAR(MAX)  NULL,
    [budget]       DECIMAL(12,2)  NULL,
    [budgetPeriod] NVARCHAR(1000) NULL,
    [parentId]     NVARCHAR(36)   NULL,
    [isActive]     BIT            NOT NULL DEFAULT 1,
    [createdAt]    DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]    DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [deletedAt]    DATETIME2(3)   NULL,
    CONSTRAINT [PK_CostCentre] PRIMARY KEY ([id]),
    CONSTRAINT [FK_CostCentre_Operator] FOREIGN KEY ([operatorId]) REFERENCES [Operator]([id]),
    CONSTRAINT [FK_CostCentre_Parent] FOREIGN KEY ([parentId]) REFERENCES [CostCentre]([id]),
    CONSTRAINT [UQ_CostCentre_operatorId_code] UNIQUE ([operatorId], [code])
);
GO

-- ─── Fleet ──────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Fleet')
CREATE TABLE [Fleet] (
    [id]              NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [operatorId]      NVARCHAR(36)   NOT NULL,
    [name]            NVARCHAR(1000) NOT NULL,
    [code]            NVARCHAR(1000) NULL,
    [contactPerson]   NVARCHAR(1000) NULL,
    [contactPhone]    NVARCHAR(1000) NULL,
    [contactEmail]    NVARCHAR(1000) NULL,
    [region]          NVARCHAR(1000) NULL,
    [monthlyBudget]   DECIMAL(12,2)  NULL,
    [status]          NVARCHAR(1000) NOT NULL DEFAULT 'active',
    [costCentreId]    NVARCHAR(36)   NULL,
    [createdAt]       DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]       DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [deletedAt]       DATETIME2(3)   NULL,
    CONSTRAINT [PK_Fleet] PRIMARY KEY ([id]),
    CONSTRAINT [FK_Fleet_Operator] FOREIGN KEY ([operatorId]) REFERENCES [Operator]([id]),
    CONSTRAINT [FK_Fleet_CostCentre] FOREIGN KEY ([costCentreId]) REFERENCES [CostCentre]([id])
);
GO

-- ─── Vehicle ────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Vehicle')
CREATE TABLE [Vehicle] (
    [id]                 NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [operatorId]         NVARCHAR(36)   NOT NULL,
    [fleetId]            NVARCHAR(36)   NOT NULL,
    [registrationNumber] NVARCHAR(1000) NOT NULL,
    [vinNumber]          NVARCHAR(1000) NULL,
    [make]               NVARCHAR(1000) NOT NULL,
    [model]              NVARCHAR(1000) NOT NULL,
    [year]               INT            NOT NULL,
    [colour]             NVARCHAR(1000) NULL,
    [fuelType]           NVARCHAR(1000) NOT NULL,
    [tankCapacity]       DECIMAL(6,2)   NOT NULL,
    [currentOdometer]    INT            NULL,
    [status]             NVARCHAR(1000) NOT NULL DEFAULT 'active',
    [tagStatus]          NVARCHAR(1000) NOT NULL DEFAULT 'unassigned',
    [tagNumber]          NVARCHAR(1000) NULL,
    [costCentreId]       NVARCHAR(36)   NULL,
    [insurerId]          NVARCHAR(36)   NULL,
    [ownershipType]      NVARCHAR(1000) NULL,
    [leaseExpiry]        DATETIME2(3)   NULL,
    [createdAt]          DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]          DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [deletedAt]          DATETIME2(3)   NULL,
    CONSTRAINT [PK_Vehicle] PRIMARY KEY ([id]),
    CONSTRAINT [FK_Vehicle_Operator] FOREIGN KEY ([operatorId]) REFERENCES [Operator]([id]),
    CONSTRAINT [FK_Vehicle_Fleet] FOREIGN KEY ([fleetId]) REFERENCES [Fleet]([id]),
    CONSTRAINT [FK_Vehicle_CostCentre] FOREIGN KEY ([costCentreId]) REFERENCES [CostCentre]([id]),
    CONSTRAINT [FK_Vehicle_Insurer] FOREIGN KEY ([insurerId]) REFERENCES [Insurer]([id])
);
GO

-- ─── VehicleEquipment ───────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'VehicleEquipment')
CREATE TABLE [VehicleEquipment] (
    [id]            NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [vehicleId]     NVARCHAR(36)   NOT NULL,
    [equipmentType] NVARCHAR(1000) NOT NULL,
    [status]        NVARCHAR(1000) NOT NULL DEFAULT 'present',
    [expiryDate]    DATETIME2(3)   NULL,
    [lastChecked]   DATETIME2(3)   NULL,
    [notes]         NVARCHAR(MAX)  NULL,
    [createdAt]     DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]     DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_VehicleEquipment] PRIMARY KEY ([id]),
    CONSTRAINT [FK_VehicleEquipment_Vehicle] FOREIGN KEY ([vehicleId]) REFERENCES [Vehicle]([id]),
    CONSTRAINT [UQ_VehicleEquipment_vehicleId_equipmentType] UNIQUE ([vehicleId], [equipmentType])
);
GO

-- ─── Driver ─────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Driver')
CREATE TABLE [Driver] (
    [id]                NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [operatorId]        NVARCHAR(36)   NOT NULL,
    [fleetId]           NVARCHAR(36)   NOT NULL,
    [firstName]         NVARCHAR(1000) NOT NULL,
    [lastName]          NVARCHAR(1000) NOT NULL,
    [saIdNumber]        NVARCHAR(1000) NULL,
    [passportNumber]    NVARCHAR(1000) NULL,
    [mobileNumber]      NVARCHAR(1000) NOT NULL,
    [email]             NVARCHAR(1000) NULL,
    [driverPin]         NVARCHAR(1000) NOT NULL,
    [licenceNumber]     NVARCHAR(1000) NULL,
    [licenceCode]       NVARCHAR(1000) NULL,
    [licenceExpiry]     DATETIME2(3)   NULL,
    [prdpNumber]        NVARCHAR(1000) NULL,
    [prdpExpiry]        DATETIME2(3)   NULL,
    [status]            NVARCHAR(1000) NOT NULL DEFAULT 'active',
    [dailySpendLimit]   DECIMAL(10,2)  NULL,
    [monthlySpendLimit] DECIMAL(10,2)  NULL,
    [createdAt]         DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]         DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [deletedAt]         DATETIME2(3)   NULL,
    CONSTRAINT [PK_Driver] PRIMARY KEY ([id]),
    CONSTRAINT [FK_Driver_Operator] FOREIGN KEY ([operatorId]) REFERENCES [Operator]([id]),
    CONSTRAINT [FK_Driver_Fleet] FOREIGN KEY ([fleetId]) REFERENCES [Fleet]([id])
);
GO

-- ─── User ───────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'User')
CREATE TABLE [User] (
    [id]           NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [operatorId]   NVARCHAR(36)   NULL,
    [email]        NVARCHAR(1000) NOT NULL,
    [passwordHash] NVARCHAR(1000) NOT NULL,
    [role]         NVARCHAR(1000) NOT NULL DEFAULT 'operator_admin',
    [firstName]    NVARCHAR(1000) NOT NULL,
    [lastName]     NVARCHAR(1000) NOT NULL,
    [mobileNumber] NVARCHAR(1000) NULL,
    [isActive]     BIT            NOT NULL DEFAULT 1,
    [status]       NVARCHAR(1000) NOT NULL DEFAULT 'active',
    [lastLoginAt]  DATETIME2(3)   NULL,
    [createdAt]    DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]    DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [deletedAt]    DATETIME2(3)   NULL,
    CONSTRAINT [PK_User] PRIMARY KEY ([id]),
    CONSTRAINT [FK_User_Operator] FOREIGN KEY ([operatorId]) REFERENCES [Operator]([id]),
    CONSTRAINT [UQ_User_email] UNIQUE ([email])
);
GO

-- ─── Wallet ─────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Wallet')
CREATE TABLE [Wallet] (
    [id]                  NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [operatorId]          NVARCHAR(36)   NOT NULL,
    [balance]             DECIMAL(12,2)  NOT NULL DEFAULT 0,
    [creditLimit]         DECIMAL(12,2)  NOT NULL DEFAULT 0,
    [lowBalanceThreshold] DECIMAL(12,2)  NOT NULL DEFAULT 500,
    [currency]            NVARCHAR(1000) NOT NULL DEFAULT 'ZAR',
    [status]              NVARCHAR(1000) NOT NULL DEFAULT 'active',
    [createdAt]           DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]           DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_Wallet] PRIMARY KEY ([id]),
    CONSTRAINT [FK_Wallet_Operator] FOREIGN KEY ([operatorId]) REFERENCES [Operator]([id]),
    CONSTRAINT [UQ_Wallet_operatorId] UNIQUE ([operatorId])
);
GO

-- ─── WalletTransaction ──────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WalletTransaction')
CREATE TABLE [WalletTransaction] (
    [id]            NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [walletId]      NVARCHAR(36)   NOT NULL,
    [type]          NVARCHAR(1000) NOT NULL,
    [amount]        DECIMAL(12,2)  NOT NULL,
    [balanceBefore] DECIMAL(12,2)  NOT NULL,
    [balanceAfter]  DECIMAL(12,2)  NOT NULL,
    [reference]     NVARCHAR(1000) NULL,
    [description]   NVARCHAR(MAX)  NULL,
    [status]        NVARCHAR(1000) NOT NULL DEFAULT 'completed',
    [processedAt]   DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [createdAt]     DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_WalletTransaction] PRIMARY KEY ([id]),
    CONSTRAINT [FK_WalletTransaction_Wallet] FOREIGN KEY ([walletId]) REFERENCES [Wallet]([id])
);
GO

-- ─── FuelTransaction ────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'FuelTransaction')
CREATE TABLE [FuelTransaction] (
    [id]              NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [operatorId]      NVARCHAR(36)   NOT NULL,
    [fleetId]         NVARCHAR(36)   NOT NULL,
    [vehicleId]       NVARCHAR(36)   NOT NULL,
    [driverId]        NVARCHAR(36)   NOT NULL,
    [transactionDate] DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [litresFilled]    DECIMAL(8,2)   NOT NULL,
    [pricePerLitre]   DECIMAL(8,4)   NOT NULL,
    [totalAmount]     DECIMAL(10,2)  NOT NULL,
    [fuelType]        NVARCHAR(1000) NOT NULL,
    [odometer]        INT            NULL,
    [siteCode]        NVARCHAR(1000) NULL,
    [siteName]        NVARCHAR(1000) NULL,
    [status]          NVARCHAR(1000) NOT NULL DEFAULT 'approved',
    [fuelEfficiency]  DECIMAL(6,2)   NULL,
    [anomalyFlags]    NVARCHAR(MAX)  NOT NULL DEFAULT '[]',
    [createdAt]       DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]       DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_FuelTransaction] PRIMARY KEY ([id]),
    CONSTRAINT [FK_FuelTransaction_Driver] FOREIGN KEY ([driverId]) REFERENCES [Driver]([id]),
    CONSTRAINT [FK_FuelTransaction_Fleet] FOREIGN KEY ([fleetId]) REFERENCES [Fleet]([id]),
    CONSTRAINT [FK_FuelTransaction_Vehicle] FOREIGN KEY ([vehicleId]) REFERENCES [Vehicle]([id])
);
GO

-- ─── AuditLog ───────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AuditLog')
CREATE TABLE [AuditLog] (
    [id]          NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [userId]      NVARCHAR(36)   NOT NULL,
    [operatorId]  NVARCHAR(36)   NOT NULL,
    [action]      NVARCHAR(1000) NOT NULL,
    [entityType]  NVARCHAR(1000) NOT NULL,
    [entityId]    NVARCHAR(1000) NOT NULL,
    [changes]     NVARCHAR(MAX)  NULL,
    [description] NVARCHAR(MAX)  NULL,
    [ipAddress]   NVARCHAR(1000) NULL,
    [userAgent]   NVARCHAR(MAX)  NULL,
    [metadata]    NVARCHAR(MAX)  NULL,
    [createdAt]   DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_AuditLog] PRIMARY KEY ([id]),
    CONSTRAINT [FK_AuditLog_Operator] FOREIGN KEY ([operatorId]) REFERENCES [Operator]([id])
);
GO

-- ─── Notification ───────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Notification')
CREATE TABLE [Notification] (
    [id]         NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [userId]     NVARCHAR(36)   NOT NULL,
    [operatorId] NVARCHAR(36)   NULL,
    [type]       NVARCHAR(1000) NOT NULL,
    [title]      NVARCHAR(1000) NOT NULL,
    [message]    NVARCHAR(MAX)  NOT NULL,
    [isRead]     BIT            NOT NULL DEFAULT 0,
    [readAt]     DATETIME2(3)   NULL,
    [metadata]   NVARCHAR(MAX)  NULL,
    [createdAt]  DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_Notification] PRIMARY KEY ([id]),
    CONSTRAINT [FK_Notification_User] FOREIGN KEY ([userId]) REFERENCES [User]([id])
);
GO

-- ─── Document ───────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Document')
CREATE TABLE [Document] (
    [id]           NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [operatorId]   NVARCHAR(36)   NOT NULL,
    [entityType]   NVARCHAR(1000) NOT NULL,
    [entityId]     NVARCHAR(1000) NOT NULL,
    [documentType] NVARCHAR(1000) NOT NULL,
    [fileName]     NVARCHAR(1000) NOT NULL,
    [fileUrl]      NVARCHAR(MAX)  NOT NULL,
    [fileSize]     INT            NOT NULL,
    [mimeType]     NVARCHAR(1000) NOT NULL,
    [uploadedBy]   NVARCHAR(1000) NOT NULL,
    [description]  NVARCHAR(MAX)  NULL,
    [createdAt]    DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [deletedAt]    DATETIME2(3)   NULL,
    CONSTRAINT [PK_Document] PRIMARY KEY ([id]),
    CONSTRAINT [FK_Document_Operator] FOREIGN KEY ([operatorId]) REFERENCES [Operator]([id])
);
GO

-- ─── Tag ────────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Tag')
CREATE TABLE [Tag] (
    [id]                  NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [operatorId]          NVARCHAR(36)   NOT NULL,
    [tagNumber]           NVARCHAR(1000) NOT NULL,
    [vehicleId]           NVARCHAR(36)   NULL,
    [status]              NVARCHAR(1000) NOT NULL DEFAULT 'unassigned',
    [blockedReason]       NVARCHAR(MAX)  NULL,
    [issuedDate]          DATETIME2(3)   NULL,
    [expiryDate]          DATETIME2(3)   NULL,
    [activatedAt]         DATETIME2(3)   NULL,
    [blockedAt]           DATETIME2(3)   NULL,
    [lastUsedAt]          DATETIME2(3)   NULL,
    [lastUsedForecourtId] NVARCHAR(1000) NULL,
    [notes]               NVARCHAR(MAX)  NULL,
    [createdAt]           DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]           DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [deletedAt]           DATETIME2(3)   NULL,
    CONSTRAINT [PK_Tag] PRIMARY KEY ([id]),
    CONSTRAINT [FK_Tag_Operator] FOREIGN KEY ([operatorId]) REFERENCES [Operator]([id]),
    CONSTRAINT [FK_Tag_Vehicle] FOREIGN KEY ([vehicleId]) REFERENCES [Vehicle]([id]),
    CONSTRAINT [UQ_Tag_operatorId_tagNumber] UNIQUE ([operatorId], [tagNumber])
);
GO

-- ─── TagHistory ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TagHistory')
CREATE TABLE [TagHistory] (
    [id]             NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [tagId]          NVARCHAR(36)   NOT NULL,
    [operatorId]     NVARCHAR(36)   NOT NULL,
    [action]         NVARCHAR(1000) NOT NULL,
    [fromVehicleId]  NVARCHAR(36)   NULL,
    [toVehicleId]    NVARCHAR(36)   NULL,
    [previousStatus] NVARCHAR(1000) NULL,
    [newStatus]      NVARCHAR(1000) NOT NULL,
    [reason]         NVARCHAR(MAX)  NULL,
    [performedBy]    NVARCHAR(1000) NOT NULL,
    [createdAt]      DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_TagHistory] PRIMARY KEY ([id]),
    CONSTRAINT [FK_TagHistory_Tag] FOREIGN KEY ([tagId]) REFERENCES [Tag]([id]),
    CONSTRAINT [FK_TagHistory_Operator] FOREIGN KEY ([operatorId]) REFERENCES [Operator]([id])
);
GO

-- ─── ImportJob ──────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ImportJob')
CREATE TABLE [ImportJob] (
    [id]             NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [operatorId]     NVARCHAR(36)   NOT NULL,
    [uploadedBy]     NVARCHAR(1000) NOT NULL,
    [entityType]     NVARCHAR(1000) NOT NULL,
    [fileName]       NVARCHAR(1000) NOT NULL,
    [fileUrl]        NVARCHAR(MAX)  NULL,
    [columnMapping]  NVARCHAR(MAX)  NOT NULL DEFAULT '{}',
    [totalRows]      INT            NOT NULL,
    [importedCount]  INT            NOT NULL DEFAULT 0,
    [skippedCount]   INT            NOT NULL DEFAULT 0,
    [failedCount]    INT            NOT NULL DEFAULT 0,
    [errorReportUrl] NVARCHAR(MAX)  NULL,
    [status]         NVARCHAR(1000) NOT NULL DEFAULT 'pending',
    [startedAt]      DATETIME2(3)   NULL,
    [completedAt]    DATETIME2(3)   NULL,
    [createdAt]      DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]      DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [deletedAt]      DATETIME2(3)   NULL,
    CONSTRAINT [PK_ImportJob] PRIMARY KEY ([id]),
    CONSTRAINT [FK_ImportJob_Operator] FOREIGN KEY ([operatorId]) REFERENCES [Operator]([id])
);
GO

-- ─── ImportRow ──────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ImportRow')
CREATE TABLE [ImportRow] (
    [id]                 NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [importJobId]        NVARCHAR(36)   NOT NULL,
    [rowNumber]          INT            NOT NULL,
    [rawData]            NVARCHAR(MAX)  NOT NULL,
    [mappedData]         NVARCHAR(MAX)  NOT NULL DEFAULT '{}',
    [validationErrors]   NVARCHAR(MAX)  NULL,
    [validationWarnings] NVARCHAR(MAX)  NULL,
    [duplicateOf]        NVARCHAR(1000) NULL,
    [resolution]         NVARCHAR(1000) NULL,
    [status]             NVARCHAR(1000) NOT NULL DEFAULT 'pending',
    [createdAt]          DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_ImportRow] PRIMARY KEY ([id]),
    CONSTRAINT [FK_ImportRow_ImportJob] FOREIGN KEY ([importJobId]) REFERENCES [ImportJob]([id])
);
GO

-- ─── RepairProvider ─────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'RepairProvider')
CREATE TABLE [RepairProvider] (
    [id]              NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [operatorId]      NVARCHAR(36)   NOT NULL,
    [name]            NVARCHAR(1000) NOT NULL,
    [contactPerson]   NVARCHAR(1000) NULL,
    [contactPhone]    NVARCHAR(1000) NOT NULL,
    [contactEmail]    NVARCHAR(1000) NULL,
    [address]         NVARCHAR(MAX)  NULL,
    [specialisations] NVARCHAR(MAX)  NOT NULL DEFAULT '[]',
    [rating]          DECIMAL(3,2)   NULL,
    [status]          NVARCHAR(1000) NOT NULL DEFAULT 'active',
    [createdAt]       DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]       DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [deletedAt]       DATETIME2(3)   NULL,
    CONSTRAINT [PK_RepairProvider] PRIMARY KEY ([id]),
    CONSTRAINT [FK_RepairProvider_Operator] FOREIGN KEY ([operatorId]) REFERENCES [Operator]([id])
);
GO

-- ─── RepairJob ──────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'RepairJob')
CREATE TABLE [RepairJob] (
    [id]                  NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [operatorId]          NVARCHAR(36)   NOT NULL,
    [vehicleId]           NVARCHAR(36)   NOT NULL,
    [driverId]            NVARCHAR(36)   NULL,
    [fleetId]             NVARCHAR(36)   NOT NULL,
    [incidentId]          NVARCHAR(1000) NULL,
    [repairNumber]        NVARCHAR(1000) NOT NULL,
    [repairType]          NVARCHAR(1000) NOT NULL,
    [priority]            NVARCHAR(1000) NOT NULL,
    [status]              NVARCHAR(1000) NOT NULL DEFAULT 'reported',
    [description]         NVARCHAR(MAX)  NOT NULL,
    [diagnosisNotes]      NVARCHAR(MAX)  NULL,
    [odometerAtReport]    INT            NULL,
    [isDrivable]          BIT            NOT NULL,
    [breakdownLatitude]   DECIMAL(10,7)  NULL,
    [breakdownLongitude]  DECIMAL(10,7)  NULL,
    [providerId]          NVARCHAR(36)   NULL,
    [approvedQuoteId]     NVARCHAR(1000) NULL,
    [estimatedCompletion] DATETIME2(3)   NULL,
    [actualCompletion]    DATETIME2(3)   NULL,
    [totalCost]           DECIMAL(12,2)  NULL,
    [labourCost]          DECIMAL(10,2)  NULL,
    [partsCost]           DECIMAL(10,2)  NULL,
    [towingCost]          DECIMAL(10,2)  NULL,
    [vatAmount]           DECIMAL(10,2)  NULL,
    [warrantyMonths]      INT            NULL,
    [warrantyExpiry]      DATETIME2(3)   NULL,
    [downtimeDays]        INT            NULL,
    [cancellationReason]  NVARCHAR(MAX)  NULL,
    [createdAt]           DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]           DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [deletedAt]           DATETIME2(3)   NULL,
    CONSTRAINT [PK_RepairJob] PRIMARY KEY ([id]),
    CONSTRAINT [FK_RepairJob_Operator] FOREIGN KEY ([operatorId]) REFERENCES [Operator]([id]),
    CONSTRAINT [FK_RepairJob_Vehicle] FOREIGN KEY ([vehicleId]) REFERENCES [Vehicle]([id]),
    CONSTRAINT [FK_RepairJob_Driver] FOREIGN KEY ([driverId]) REFERENCES [Driver]([id]),
    CONSTRAINT [FK_RepairJob_Fleet] FOREIGN KEY ([fleetId]) REFERENCES [Fleet]([id]),
    CONSTRAINT [FK_RepairJob_Provider] FOREIGN KEY ([providerId]) REFERENCES [RepairProvider]([id]),
    CONSTRAINT [UQ_RepairJob_repairNumber] UNIQUE ([repairNumber])
);
GO

-- ─── RepairQuote ────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'RepairQuote')
CREATE TABLE [RepairQuote] (
    [id]             NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [repairJobId]    NVARCHAR(36)   NOT NULL,
    [providerId]     NVARCHAR(36)   NOT NULL,
    [quoteNumber]    NVARCHAR(1000) NULL,
    [lineItems]      NVARCHAR(MAX)  NOT NULL DEFAULT '[]',
    [labourTotal]    DECIMAL(10,2)  NOT NULL,
    [partsTotal]     DECIMAL(10,2)  NOT NULL,
    [totalExclVat]   DECIMAL(12,2)  NOT NULL,
    [vatAmount]      DECIMAL(10,2)  NOT NULL,
    [totalInclVat]   DECIMAL(12,2)  NOT NULL,
    [estimatedDays]  INT            NULL,
    [warrantyMonths] INT            NULL,
    [validUntil]     DATETIME2(3)   NULL,
    [documentUrl]    NVARCHAR(MAX)  NULL,
    [status]         NVARCHAR(1000) NOT NULL DEFAULT 'pending',
    [createdAt]      DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]      DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [deletedAt]      DATETIME2(3)   NULL,
    CONSTRAINT [PK_RepairQuote] PRIMARY KEY ([id]),
    CONSTRAINT [FK_RepairQuote_RepairJob] FOREIGN KEY ([repairJobId]) REFERENCES [RepairJob]([id]),
    CONSTRAINT [FK_RepairQuote_Provider] FOREIGN KEY ([providerId]) REFERENCES [RepairProvider]([id])
);
GO

-- ─── RepairWorkLog ──────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'RepairWorkLog')
CREATE TABLE [RepairWorkLog] (
    [id]            NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [repairJobId]   NVARCHAR(36)   NOT NULL,
    [userId]        NVARCHAR(1000) NOT NULL,
    [note]          NVARCHAR(MAX)  NOT NULL,
    [photosJson]    NVARCHAR(MAX)  NULL,
    [partsReplaced] NVARCHAR(MAX)  NULL,
    [createdAt]     DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_RepairWorkLog] PRIMARY KEY ([id]),
    CONSTRAINT [FK_RepairWorkLog_RepairJob] FOREIGN KEY ([repairJobId]) REFERENCES [RepairJob]([id])
);
GO

-- ─── Incident ───────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Incident')
CREATE TABLE [Incident] (
    [id]                   NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [operatorId]           NVARCHAR(36)   NOT NULL,
    [vehicleId]            NVARCHAR(36)   NOT NULL,
    [driverId]             NVARCHAR(36)   NULL,
    [fleetId]              NVARCHAR(36)   NOT NULL,
    [incidentNumber]       NVARCHAR(1000) NOT NULL,
    [incidentDate]         DATETIME2(3)   NOT NULL,
    [incidentType]         NVARCHAR(1000) NOT NULL,
    [description]          NVARCHAR(MAX)  NOT NULL,
    [location]             NVARCHAR(MAX)  NULL,
    [latitude]             DECIMAL(10,7)  NULL,
    [longitude]            DECIMAL(10,7)  NULL,
    [policeCaseNumber]     NVARCHAR(1000) NULL,
    [insuranceClaimNumber] NVARCHAR(1000) NULL,
    [claimStatus]          NVARCHAR(1000) NULL,
    [claimAmount]          DECIMAL(12,2)  NULL,
    [payoutAmount]         DECIMAL(12,2)  NULL,
    [costEstimate]         DECIMAL(12,2)  NULL,
    [downtimeStart]        DATETIME2(3)   NULL,
    [downtimeEnd]          DATETIME2(3)   NULL,
    [downtimeDays]         INT            NULL,
    [thirdPartyInvolved]   BIT            NOT NULL DEFAULT 0,
    [thirdPartyDetails]    NVARCHAR(MAX)  NULL,
    [severity]             NVARCHAR(1000) NOT NULL,
    [status]               NVARCHAR(1000) NOT NULL DEFAULT 'reported',
    [notes]                NVARCHAR(MAX)  NULL,
    [createdAt]            DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]            DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [deletedAt]            DATETIME2(3)   NULL,
    CONSTRAINT [PK_Incident] PRIMARY KEY ([id]),
    CONSTRAINT [FK_Incident_Operator] FOREIGN KEY ([operatorId]) REFERENCES [Operator]([id]),
    CONSTRAINT [FK_Incident_Vehicle] FOREIGN KEY ([vehicleId]) REFERENCES [Vehicle]([id]),
    CONSTRAINT [FK_Incident_Driver] FOREIGN KEY ([driverId]) REFERENCES [Driver]([id]),
    CONSTRAINT [FK_Incident_Fleet] FOREIGN KEY ([fleetId]) REFERENCES [Fleet]([id]),
    CONSTRAINT [UQ_Incident_incidentNumber] UNIQUE ([incidentNumber])
);
GO

-- ─── MaintenanceRecord ──────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'MaintenanceRecord')
CREATE TABLE [MaintenanceRecord] (
    [id]                  NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [operatorId]          NVARCHAR(36)   NOT NULL,
    [vehicleId]           NVARCHAR(36)   NOT NULL,
    [fleetId]             NVARCHAR(36)   NOT NULL,
    [maintenanceType]     NVARCHAR(1000) NOT NULL,
    [description]         NVARCHAR(MAX)  NOT NULL,
    [provider]            NVARCHAR(1000) NULL,
    [cost]                DECIMAL(12,2)  NULL,
    [vatAmount]           DECIMAL(10,2)  NULL,
    [odometer]            INT            NULL,
    [serviceDate]         DATETIME2(3)   NOT NULL,
    [nextServiceDate]     DATETIME2(3)   NULL,
    [nextServiceOdometer] INT            NULL,
    [isScheduled]         BIT            NOT NULL DEFAULT 0,
    [status]              NVARCHAR(1000) NOT NULL DEFAULT 'completed',
    [notes]               NVARCHAR(MAX)  NULL,
    [createdAt]           DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]           DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [deletedAt]           DATETIME2(3)   NULL,
    CONSTRAINT [PK_MaintenanceRecord] PRIMARY KEY ([id]),
    CONSTRAINT [FK_MaintenanceRecord_Operator] FOREIGN KEY ([operatorId]) REFERENCES [Operator]([id]),
    CONSTRAINT [FK_MaintenanceRecord_Vehicle] FOREIGN KEY ([vehicleId]) REFERENCES [Vehicle]([id]),
    CONSTRAINT [FK_MaintenanceRecord_Fleet] FOREIGN KEY ([fleetId]) REFERENCES [Fleet]([id])
);
GO

-- ─── MaintenanceSchedule ────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'MaintenanceSchedule')
CREATE TABLE [MaintenanceSchedule] (
    [id]                  NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [operatorId]          NVARCHAR(36)   NOT NULL,
    [vehicleId]           NVARCHAR(36)   NOT NULL,
    [maintenanceType]     NVARCHAR(1000) NOT NULL,
    [intervalMonths]      INT            NULL,
    [intervalKm]          INT            NULL,
    [lastServiceDate]     DATETIME2(3)   NULL,
    [lastServiceOdometer] INT            NULL,
    [nextDueDate]         DATETIME2(3)   NULL,
    [nextDueOdometer]     INT            NULL,
    [isActive]            BIT            NOT NULL DEFAULT 1,
    [createdAt]           DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]           DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_MaintenanceSchedule] PRIMARY KEY ([id]),
    CONSTRAINT [FK_MaintenanceSchedule_Operator] FOREIGN KEY ([operatorId]) REFERENCES [Operator]([id]),
    CONSTRAINT [FK_MaintenanceSchedule_Vehicle] FOREIGN KEY ([vehicleId]) REFERENCES [Vehicle]([id])
);
GO

-- ─── VehicleHandover ────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'VehicleHandover')
CREATE TABLE [VehicleHandover] (
    [id]                 NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [operatorId]         NVARCHAR(36)   NOT NULL,
    [vehicleId]          NVARCHAR(36)   NOT NULL,
    [driverId]           NVARCHAR(36)   NULL,
    [fleetId]            NVARCHAR(36)   NULL,
    [handoverNumber]     NVARCHAR(1000) NOT NULL,
    [handoverType]       NVARCHAR(1000) NOT NULL,
    [handoverDatetime]   DATETIME2(3)   NOT NULL,
    [odometerReading]    INT            NULL,
    [fuelLevel]          NVARCHAR(1000) NULL,
    [exteriorCondition]  NVARCHAR(1000) NULL,
    [interiorCondition]  NVARCHAR(1000) NULL,
    [damageNotes]        NVARCHAR(MAX)  NULL,
    [equipmentChecklist] NVARCHAR(MAX)  NULL,
    [driverSignature]    NVARCHAR(MAX)  NULL,
    [managerSignature]   NVARCHAR(MAX)  NULL,
    [photos]             NVARCHAR(MAX)  NULL,
    [notes]              NVARCHAR(MAX)  NULL,
    [latitude]           DECIMAL(10,7)  NULL,
    [longitude]          DECIMAL(10,7)  NULL,
    [createdAt]          DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]          DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [deletedAt]          DATETIME2(3)   NULL,
    CONSTRAINT [PK_VehicleHandover] PRIMARY KEY ([id]),
    CONSTRAINT [FK_VehicleHandover_Operator] FOREIGN KEY ([operatorId]) REFERENCES [Operator]([id]),
    CONSTRAINT [FK_VehicleHandover_Vehicle] FOREIGN KEY ([vehicleId]) REFERENCES [Vehicle]([id]),
    CONSTRAINT [FK_VehicleHandover_Driver] FOREIGN KEY ([driverId]) REFERENCES [Driver]([id]),
    CONSTRAINT [FK_VehicleHandover_Fleet] FOREIGN KEY ([fleetId]) REFERENCES [Fleet]([id]),
    CONSTRAINT [UQ_VehicleHandover_handoverNumber] UNIQUE ([handoverNumber])
);
GO

-- ─── VehicleContract ────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'VehicleContract')
CREATE TABLE [VehicleContract] (
    [id]                 NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [operatorId]         NVARCHAR(36)   NOT NULL,
    [vehicleId]          NVARCHAR(36)   NOT NULL,
    [contractType]       NVARCHAR(1000) NOT NULL,
    [provider]           NVARCHAR(1000) NOT NULL,
    [contractNumber]     NVARCHAR(1000) NULL,
    [startDate]          DATETIME2(3)   NOT NULL,
    [endDate]            DATETIME2(3)   NOT NULL,
    [monthlyAmount]      DECIMAL(12,2)  NULL,
    [totalContractValue] DECIMAL(14,2)  NULL,
    [depositPaid]        DECIMAL(12,2)  NULL,
    [residualValue]      DECIMAL(12,2)  NULL,
    [escalationRate]     DECIMAL(5,2)   NULL,
    [paymentDay]         INT            NULL,
    [terms]              NVARCHAR(MAX)  NULL,
    [renewalType]        NVARCHAR(1000) NULL,
    [renewalNoticeDays]  INT            NULL,
    [dailyKmLimit]       INT            NULL,
    [monthlyKmLimit]     INT            NULL,
    [totalKmLimit]       INT            NULL,
    [excessKmRate]       DECIMAL(10,2)  NULL,
    [kmAtStart]          INT            NULL,
    [status]             NVARCHAR(1000) NOT NULL DEFAULT 'active',
    [terminationReason]  NVARCHAR(MAX)  NULL,
    [terminationDate]    DATETIME2(3)   NULL,
    [notes]              NVARCHAR(MAX)  NULL,
    [createdAt]          DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]          DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [deletedAt]          DATETIME2(3)   NULL,
    CONSTRAINT [PK_VehicleContract] PRIMARY KEY ([id]),
    CONSTRAINT [FK_VehicleContract_Operator] FOREIGN KEY ([operatorId]) REFERENCES [Operator]([id]),
    CONSTRAINT [FK_VehicleContract_Vehicle] FOREIGN KEY ([vehicleId]) REFERENCES [Vehicle]([id])
);
GO

-- ─── ContractPayment ────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ContractPayment')
CREATE TABLE [ContractPayment] (
    [id]            NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
    [contractId]    NVARCHAR(36)   NOT NULL,
    [operatorId]    NVARCHAR(36)   NOT NULL,
    [paymentDate]   DATETIME2(3)   NOT NULL,
    [amount]        DECIMAL(12,2)  NOT NULL,
    [vatAmount]     DECIMAL(10,2)  NULL,
    [paymentMethod] NVARCHAR(1000) NULL,
    [reference]     NVARCHAR(1000) NULL,
    [status]        NVARCHAR(1000) NOT NULL DEFAULT 'completed',
    [notes]         NVARCHAR(MAX)  NULL,
    [createdAt]     DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_ContractPayment] PRIMARY KEY ([id]),
    CONSTRAINT [FK_ContractPayment_Contract] FOREIGN KEY ([contractId]) REFERENCES [VehicleContract]([id]),
    CONSTRAINT [FK_ContractPayment_Operator] FOREIGN KEY ([operatorId]) REFERENCES [Operator]([id])
);
GO

-- ============================================================================
-- INDEXES (matching Prisma schema composite indexes)
-- ============================================================================

-- Vehicle indexes
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Vehicle_operatorId_status')
    CREATE INDEX [IX_Vehicle_operatorId_status] ON [Vehicle]([operatorId], [status]);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Vehicle_operatorId_fleetId')
    CREATE INDEX [IX_Vehicle_operatorId_fleetId] ON [Vehicle]([operatorId], [fleetId]);
GO

-- Driver indexes
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Driver_operatorId_fleetId')
    CREATE INDEX [IX_Driver_operatorId_fleetId] ON [Driver]([operatorId], [fleetId]);
GO

-- AuditLog indexes
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AuditLog_operatorId_entity')
    CREATE INDEX [IX_AuditLog_operatorId_entity] ON [AuditLog]([operatorId], [entityType], [entityId], [createdAt]);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AuditLog_userId_createdAt')
    CREATE INDEX [IX_AuditLog_userId_createdAt] ON [AuditLog]([userId], [createdAt]);
GO

-- Document indexes
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Document_operatorId_entity')
    CREATE INDEX [IX_Document_operatorId_entity] ON [Document]([operatorId], [entityType], [entityId]);
GO

-- RepairJob indexes
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_RepairJob_operatorId_status')
    CREATE INDEX [IX_RepairJob_operatorId_status] ON [RepairJob]([operatorId], [status]);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_RepairJob_operatorId_vehicleId')
    CREATE INDEX [IX_RepairJob_operatorId_vehicleId] ON [RepairJob]([operatorId], [vehicleId]);
GO

-- ImportJob indexes
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ImportJob_operatorId_status')
    CREATE INDEX [IX_ImportJob_operatorId_status] ON [ImportJob]([operatorId], [status]);
GO

-- ImportRow indexes
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ImportRow_importJobId_status')
    CREATE INDEX [IX_ImportRow_importJobId_status] ON [ImportRow]([importJobId], [status]);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ImportRow_importJobId_rowNumber')
    CREATE INDEX [IX_ImportRow_importJobId_rowNumber] ON [ImportRow]([importJobId], [rowNumber]);
GO

-- ============================================================================
-- Prisma migrations table (used by prisma migrate deploy)
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = '_prisma_migrations')
CREATE TABLE [_prisma_migrations] (
    [id]                  NVARCHAR(36)   NOT NULL,
    [checksum]            NVARCHAR(64)   NOT NULL,
    [finished_at]         DATETIME2(3)   NULL,
    [migration_name]      NVARCHAR(255)  NOT NULL,
    [logs]                NVARCHAR(MAX)  NULL,
    [rolled_back_at]      DATETIME2(3)   NULL,
    [started_at]          DATETIME2(3)   NOT NULL DEFAULT GETUTCDATE(),
    [applied_steps_count] INT            NOT NULL DEFAULT 0,
    CONSTRAINT [PK_prisma_migrations] PRIMARY KEY ([id])
);
GO

PRINT '';
PRINT '============================================================';
PRINT ' Active Fleet database created successfully!';
PRINT ' Tables: 28 + _prisma_migrations';
PRINT ' Server memory: 96GB allocated to SQL Server';
PRINT '============================================================';
GO
