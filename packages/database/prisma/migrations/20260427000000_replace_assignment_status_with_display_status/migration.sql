-- Replace Assignment.status (AssignmentStatus) with Assignment.displayStatus (DisplayStatus).
--
-- Data preservation:
--   - displayStatus is backfilled from metadata.displayStatus when set, otherwise SCHEDULED.
--   - Any old `status` value that's not SCHEDULED (IN_PROGRESS / COMPLETED / CANCELLED) is
--     stashed in metadata.legacyStatus before the column is dropped, so the lifecycle value
--     is recoverable from JSON if ever needed.
--   - All rows are preserved; only the typed `status` column is removed.

-- 1. New enum
CREATE TYPE "DisplayStatus" AS ENUM ('SCHEDULED', 'UNSCHEDULED', 'FORECAST');

-- 2. Add new column with default
ALTER TABLE "Assignment"
  ADD COLUMN "displayStatus" "DisplayStatus" NOT NULL DEFAULT 'SCHEDULED';

-- 3. Backfill displayStatus from metadata.displayStatus where present and valid
UPDATE "Assignment"
SET "displayStatus" = (metadata->>'displayStatus')::"DisplayStatus"
WHERE metadata->>'displayStatus' IN ('SCHEDULED', 'UNSCHEDULED', 'FORECAST');

-- 4. Preserve any non-SCHEDULED lifecycle status from the old column into metadata.legacyStatus
UPDATE "Assignment"
SET metadata = metadata || jsonb_build_object('legacyStatus', "status"::text)
WHERE "status" <> 'SCHEDULED';

-- 5. Cleanup: drop now-redundant displayStatus key from metadata (column is canonical)
UPDATE "Assignment"
SET metadata = metadata - 'displayStatus'
WHERE metadata ? 'displayStatus';

-- 6. Drop old column and its index
DROP INDEX IF EXISTS "Assignment_status_idx";
ALTER TABLE "Assignment" DROP COLUMN "status";

-- 7. Add index on the new column
CREATE INDEX "Assignment_displayStatus_idx" ON "Assignment"("displayStatus");

-- 8. Drop the old enum (now unused)
DROP TYPE "AssignmentStatus";
