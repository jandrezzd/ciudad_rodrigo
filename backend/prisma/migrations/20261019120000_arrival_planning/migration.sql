-- AlterTable
ALTER TABLE "TransportArrival" ADD COLUMN "planningId" INTEGER;

-- AlterTable
ALTER TABLE "TransportArrivalPending" ADD COLUMN "planningId" INTEGER;

-- CreateIndex
CREATE INDEX "TransportArrival_planningId_idx" ON "TransportArrival"("planningId");

-- CreateIndex
CREATE INDEX "TransportArrivalPending_planningId_idx" ON "TransportArrivalPending"("planningId");

-- AddForeignKey
ALTER TABLE "TransportArrival" ADD CONSTRAINT "TransportArrival_planningId_fkey" FOREIGN KEY ("planningId") REFERENCES "Planning"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportArrivalPending" ADD CONSTRAINT "TransportArrivalPending_planningId_fkey" FOREIGN KEY ("planningId") REFERENCES "Planning"("id") ON DELETE SET NULL ON UPDATE CASCADE;
