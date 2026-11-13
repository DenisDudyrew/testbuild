-- Per-participant hiding preserves other participants' visibility.
ALTER TABLE "message_delivery_status" ADD COLUMN "hiddenAt" TIMESTAMP(3);
