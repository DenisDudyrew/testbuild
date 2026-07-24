-- AlterTable: Add missing fields to Message
ALTER TABLE "Message" ADD COLUMN     "searchContent" TEXT;
ALTER TABLE "Message" ADD COLUMN     "deletedForUserId" TEXT;
ALTER TABLE "Message" ADD COLUMN     "forwardFromId" TEXT;

-- AlterTable: Add missing fields to ConversationParticipant
ALTER TABLE "ConversationParticipant" ADD COLUMN     "mutedUntil" TIMESTAMP(3);
ALTER TABLE "ConversationParticipant" ADD COLUMN     "draftContent" TEXT;
ALTER TABLE "ConversationParticipant" ADD COLUMN     "archivedAt" TIMESTAMP(3);
ALTER TABLE "ConversationParticipant" ADD COLUMN     "pinnedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "message_delivery_status" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_delivery_status_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "message_delivery_status_messageId_userId_key" ON "message_delivery_status"("messageId", "userId");

-- CreateIndex
CREATE INDEX "message_delivery_status_userId_status_idx" ON "message_delivery_status"("userId", "status");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_forwardFromId_fkey" FOREIGN KEY ("forwardFromId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_delivery_status" ADD CONSTRAINT "message_delivery_status_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_delivery_status" ADD CONSTRAINT "message_delivery_status_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

