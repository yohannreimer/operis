-- CreateEnum
CREATE TYPE "HabitType" AS ENUM ('binary', 'quantitative', 'vice');

-- CreateEnum
CREATE TYPE "HabitLifeArea" AS ENUM ('corpo', 'mente', 'trabalho', 'relacoes', 'financas', 'crescimento');

-- CreateEnum
CREATE TYPE "HabitFrequency" AS ENUM ('daily', 'weekly', 'monthly', 'specific_days');

-- CreateEnum
CREATE TYPE "HabitStatus" AS ENUM ('ativo', 'pausado', 'arquivado');

-- AlterTable
ALTER TABLE "commitments" ALTER COLUMN "recurrence_days" DROP DEFAULT;

-- CreateTable
CREATE TABLE "habits" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "lifeArea" "HabitLifeArea" NOT NULL,
    "type" "HabitType" NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "frequencyType" "HabitFrequency" NOT NULL,
    "frequencyTarget" INTEGER NOT NULL DEFAULT 1,
    "specificDays" "RecurrenceDay"[],
    "unit" TEXT,
    "dailyTarget" DOUBLE PRECISION,
    "xpPerCompletion" INTEGER NOT NULL DEFAULT 10,
    "status" "HabitStatus" NOT NULL DEFAULT 'ativo',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "habits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habit_logs" (
    "id" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "habit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habit_xp_events" (
    "id" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "lifeArea" "HabitLifeArea" NOT NULL,
    "xp" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "habit_xp_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "habit_logs_habitId_date_idx" ON "habit_logs"("habitId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "habit_logs_habitId_date_key" ON "habit_logs"("habitId", "date");

-- CreateIndex
CREATE INDEX "habit_xp_events_habitId_idx" ON "habit_xp_events"("habitId");

-- CreateIndex
CREATE INDEX "habit_xp_events_lifeArea_idx" ON "habit_xp_events"("lifeArea");

-- CreateIndex
CREATE INDEX "habit_xp_events_date_idx" ON "habit_xp_events"("date");

-- CreateIndex
CREATE INDEX "habit_xp_events_notified_idx" ON "habit_xp_events"("notified");

-- AddForeignKey
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "habits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habit_xp_events" ADD CONSTRAINT "habit_xp_events_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "habits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
