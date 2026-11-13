CREATE TABLE "Upload" (
  "id" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "ownerId" TEXT,
  "originalName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "purpose" TEXT NOT NULL DEFAULT 'unattached',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Upload_filename_key" ON "Upload"("filename");
CREATE INDEX "Upload_ownerId_idx" ON "Upload"("ownerId");
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Existing files and URLs are preserved; legacy access is resolved from post/profile/message references.
