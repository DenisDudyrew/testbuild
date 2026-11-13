-- CreateTable
CREATE TABLE "message_edit_history" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "oldContent" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_edit_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_edit_history_messageId_idx" ON "message_edit_history"("messageId");

-- AddForeignKey
ALTER TABLE "message_edit_history" ADD CONSTRAINT "message_edit_history_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

