-- CreateTable
CREATE TABLE "PlanningCantera" (
    "id" SERIAL NOT NULL,
    "planningId" INTEGER NOT NULL,
    "canteraId" INTEGER NOT NULL,

    CONSTRAINT "PlanningCantera_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanningCantera_canteraId_idx" ON "PlanningCantera"("canteraId");

-- CreateIndex
CREATE INDEX "PlanningCantera_planningId_idx" ON "PlanningCantera"("planningId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanningCantera_planningId_canteraId_key" ON "PlanningCantera"("planningId", "canteraId");

-- AddForeignKey
ALTER TABLE "PlanningCantera" ADD CONSTRAINT "PlanningCantera_planningId_fkey" FOREIGN KEY ("planningId") REFERENCES "Planning"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningCantera" ADD CONSTRAINT "PlanningCantera_canteraId_fkey" FOREIGN KEY ("canteraId") REFERENCES "Cantera"("id") ON DELETE CASCADE ON UPDATE CASCADE;
