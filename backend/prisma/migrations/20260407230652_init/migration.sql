-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('INTERNO', 'EXTERNO');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('NORMAL', 'ALERTA', 'REVISADO');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SUPERVISOR');

-- CreateEnum
CREATE TYPE "RoleType" AS ENUM ('OBRA', 'CANTERA');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('PUBLICO', 'PRIVADO');

-- CreateEnum
CREATE TYPE "CompanyStack" AS ENUM ('CIUDAD_RODRIGO', 'TRANSVELEZ', 'PAXOS', 'DISMECTRA', 'PETROVELCA');

-- CreateEnum
CREATE TYPE "VehicleCompany" AS ENUM ('CIUDAD_RODRIGO', 'TRANSVELEZ');

-- CreateEnum
CREATE TYPE "PlanningStatus" AS ENUM ('PENDIENTE', 'EN_PROGRESO', 'COMPLETADO', 'CANCELADO', 'RETRASADO');

-- CreateEnum
CREATE TYPE "TransportStatus" AS ENUM ('EN_PROGRESO', 'COMPLETADO', 'CANCELADO', 'ALERTA', 'REVISADO');

-- CreateEnum
CREATE TYPE "QRCodeStatus" AS ENUM ('DISPONIBLE', 'OCUPADO');

-- CreateEnum
CREATE TYPE "UserRoleType" AS ENUM ('ADMIN', 'OBRA', 'CANTERA');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "roletype" "RoleType",
    "company" "CompanyStack",
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Owner" (
    "id" SERIAL NOT NULL,
    "ruc" TEXT NOT NULL,
    "companyname" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "province" TEXT,
    "canton" TEXT,
    "address" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" SERIAL NOT NULL,
    "vehicleid" TEXT NOT NULL,
    "qrcodeId" INTEGER,
    "plate" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL,
    "capacity" DOUBLE PRECISION NOT NULL,
    "company" "VehicleCompany",
    "drivername" TEXT,
    "driverdoc" TEXT,
    "driverphone" TEXT,
    "observation" TEXT,
    "ownerId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleQRCode" (
    "id" SERIAL NOT NULL,
    "qrcode" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" "QRCodeStatus" NOT NULL DEFAULT 'DISPONIBLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleQRCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleSequence" (
    "id" SERIAL NOT NULL,
    "prefix" TEXT NOT NULL,
    "last" INTEGER NOT NULL,

    CONSTRAINT "VehicleSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "ruc" TEXT NOT NULL,
    "companyname" TEXT NOT NULL,
    "province" TEXT,
    "canton" TEXT,
    "address" TEXT,
    "type" "ClientType" NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConstSite" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "province" TEXT,
    "canton" TEXT,
    "address" TEXT,
    "value" DOUBLE PRECISION,
    "quarryDist" DOUBLE PRECISION,
    "abscisa" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConstSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientConstSite" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "constSiteId" INTEGER NOT NULL,

    CONSTRAINT "ClientConstSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Planning" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" "PlanningStatus" NOT NULL DEFAULT 'PENDIENTE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientId" INTEGER NOT NULL,
    "constSiteId" INTEGER NOT NULL,

    CONSTRAINT "Planning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanningVehicle" (
    "id" SERIAL NOT NULL,
    "planningId" INTEGER NOT NULL,
    "vehicleId" INTEGER NOT NULL,

    CONSTRAINT "PlanningVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "userArrivalId" INTEGER,
    "vehicleId" INTEGER NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "constSiteId" INTEGER NOT NULL,
    "planningId" INTEGER,
    "userRoleType" "UserRoleType",
    "departureAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "departureM3" DOUBLE PRECISION NOT NULL,
    "departureM3Corrected" DOUBLE PRECISION,
    "departureDriverPhoto" TEXT,
    "departureVehiclePhoto" TEXT NOT NULL,
    "departurePlatePhoto" TEXT NOT NULL,
    "departureMaterialPhoto1" TEXT NOT NULL,
    "departureMaterialPhoto2" TEXT NOT NULL,
    "departureLat" DOUBLE PRECISION NOT NULL,
    "departureLng" DOUBLE PRECISION NOT NULL,
    "arrivalAt" TIMESTAMP(3),
    "arrivalM3" DOUBLE PRECISION,
    "arrivalM3Corrected" DOUBLE PRECISION,
    "abscisa" INTEGER,
    "arrivalDriverPhoto" TEXT,
    "arrivalVehiclePhoto" TEXT,
    "arrivalPlatePhoto" TEXT,
    "arrivalMaterialPhoto1" TEXT,
    "arrivalMaterialPhoto2" TEXT,
    "arrivalLat" DOUBLE PRECISION,
    "arrivalLng" DOUBLE PRECISION,
    "deviationM3" DOUBLE PRECISION,
    "status" "TransportStatus" NOT NULL DEFAULT 'EN_PROGRESO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'NORMAL',
    "reportData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyStats" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL,
    "totalDeparturesCount" INTEGER NOT NULL DEFAULT 0,
    "totalArrivalsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_document_key" ON "User"("document");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Owner_ruc_key" ON "Owner"("ruc");

-- CreateIndex
CREATE UNIQUE INDEX "Owner_document_key" ON "Owner"("document");

-- CreateIndex
CREATE UNIQUE INDEX "Owner_email_key" ON "Owner"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_vehicleid_key" ON "Vehicle"("vehicleid");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_qrcodeId_key" ON "Vehicle"("qrcodeId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_plate_key" ON "Vehicle"("plate");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_driverdoc_key" ON "Vehicle"("driverdoc");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_driverphone_key" ON "Vehicle"("driverphone");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleQRCode_qrcode_key" ON "VehicleQRCode"("qrcode");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleSequence_prefix_key" ON "VehicleSequence"("prefix");

-- CreateIndex
CREATE UNIQUE INDEX "Client_ruc_key" ON "Client"("ruc");

-- CreateIndex
CREATE UNIQUE INDEX "Client_companyname_key" ON "Client"("companyname");

-- CreateIndex
CREATE UNIQUE INDEX "ClientConstSite_clientId_constSiteId_key" ON "ClientConstSite"("clientId", "constSiteId");

-- CreateIndex
CREATE INDEX "PlanningVehicle_planningId_idx" ON "PlanningVehicle"("planningId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanningVehicle_vehicleId_key" ON "PlanningVehicle"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyStats_date_key" ON "DailyStats"("date");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_qrcodeId_fkey" FOREIGN KEY ("qrcodeId") REFERENCES "VehicleQRCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientConstSite" ADD CONSTRAINT "ClientConstSite_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientConstSite" ADD CONSTRAINT "ClientConstSite_constSiteId_fkey" FOREIGN KEY ("constSiteId") REFERENCES "ConstSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planning" ADD CONSTRAINT "Planning_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planning" ADD CONSTRAINT "Planning_constSiteId_fkey" FOREIGN KEY ("constSiteId") REFERENCES "ConstSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningVehicle" ADD CONSTRAINT "PlanningVehicle_planningId_fkey" FOREIGN KEY ("planningId") REFERENCES "Planning"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningVehicle" ADD CONSTRAINT "PlanningVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportLog" ADD CONSTRAINT "TransportLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportLog" ADD CONSTRAINT "TransportLog_userArrivalId_fkey" FOREIGN KEY ("userArrivalId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportLog" ADD CONSTRAINT "TransportLog_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportLog" ADD CONSTRAINT "TransportLog_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportLog" ADD CONSTRAINT "TransportLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportLog" ADD CONSTRAINT "TransportLog_constSiteId_fkey" FOREIGN KEY ("constSiteId") REFERENCES "ConstSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportLog" ADD CONSTRAINT "TransportLog_planningId_fkey" FOREIGN KEY ("planningId") REFERENCES "Planning"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
