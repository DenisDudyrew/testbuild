-- Add encryption columns (nullable first)
ALTER TABLE "User" ADD COLUMN "emailEncrypted" TEXT;
ALTER TABLE "User" ADD COLUMN "emailHash" TEXT;
ALTER TABLE "User" ADD COLUMN "bioEncrypted" TEXT;

-- Enable pgcrypto for sha256
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Backfill existing data (temporary encrypted values — app will re-encrypt on next access)
UPDATE "User" SET "emailEncrypted" = "email" WHERE "emailEncrypted" IS NULL;
UPDATE "User" SET "emailHash" = encode(digest(lower(trim("email")), 'sha256'), 'hex') WHERE "emailHash" IS NULL;
UPDATE "User" SET "bioEncrypted" = "bio" WHERE "bioEncrypted" IS NULL AND "bio" IS NOT NULL;

-- Now make them NOT NULL
ALTER TABLE "User" ALTER COLUMN "emailEncrypted" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "emailHash" SET NOT NULL;

-- Drop old columns
ALTER TABLE "User" DROP COLUMN "bio";
ALTER TABLE "User" DROP COLUMN "email";

-- Create unique index on emailHash
CREATE UNIQUE INDEX "User_emailHash_key" ON "User"("emailHash");
