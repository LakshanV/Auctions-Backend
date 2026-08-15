-- CreateTable
CREATE TABLE "logistics_booking" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "origin_node_code" TEXT NOT NULL,
    "destination_node_code" TEXT NOT NULL,
    "transport_mode" TEXT NOT NULL,
    "incoterm" TEXT NOT NULL,
    "freight_arranger" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "provider" TEXT NOT NULL,
    "booked_by_customer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logistics_booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_shipment" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BOOKED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logistics_shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_shipment_event" (
    "id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT,
    "note" TEXT,
    "location_code" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logistics_shipment_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "logistics_booking_quote_id_key" ON "logistics_booking"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_shipment_booking_id_key" ON "logistics_shipment"("booking_id");

-- CreateIndex
CREATE INDEX "logistics_shipment_event_shipment_id_idx" ON "logistics_shipment_event"("shipment_id");

-- AddForeignKey
ALTER TABLE "logistics_booking" ADD CONSTRAINT "logistics_booking_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "logistics_quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_shipment" ADD CONSTRAINT "logistics_shipment_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "logistics_booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_shipment_event" ADD CONSTRAINT "logistics_shipment_event_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "logistics_shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

