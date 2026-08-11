/*
  Warnings:

  - You are about to drop the column `name` on the `Planning` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[planningCode]` on the table `Planning` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `planningCode` to the `Planning` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Planning" DROP COLUMN "name",
ADD COLUMN     "planningCode" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "PlanningSequence" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlanningSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanningSequence_year_key" ON "PlanningSequence"("year");

-- CreateIndex
CREATE UNIQUE INDEX "Planning_planningCode_key" ON "Planning"("planningCode");
