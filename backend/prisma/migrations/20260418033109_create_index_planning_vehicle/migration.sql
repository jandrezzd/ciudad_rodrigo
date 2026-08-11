-- DropIndex
DROP INDEX "PlanningVehicle_vehicleId_key";

-- CreateIndex
CREATE INDEX "PlanningVehicle_vehicleId_idx" ON "PlanningVehicle"("vehicleId");
