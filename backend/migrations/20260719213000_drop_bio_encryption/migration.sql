-- Add bio column back as plain text
ALTER TABLE "User" ADD COLUMN "bio" TEXT;

-- Drop bioEncrypted column
ALTER TABLE "User" DROP COLUMN "bioEncrypted";
