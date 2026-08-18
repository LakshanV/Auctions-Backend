-- DB-level invariants hardening (validation programme, transactional-integrity audit).
--
--  * D18 — at most one bid per (auction, idempotency key). NULL keys stay distinct in Postgres,
--    so ordinary keyless bids are unaffected; this backstops the in-request retry dedupe.
--  * D17 — one invoice per sale + a real FK to the authoritative Sale (referential integrity,
--    replacing a bare string id that could dangle or mis-link).
--  * D21 — AI provenance is append-only (rule 5 applied to derived AI records): ai_feedback is
--    insert-only and ai_run.output is frozen after creation (the applied/appliedBy flags may
--    still change — that is the sanctioned human APPLY action, which never rewrites the output).

-- D18
CREATE UNIQUE INDEX "bid_auction_id_idempotency_key_key" ON "bid"("auction_id", "idempotency_key");

-- D17
CREATE UNIQUE INDEX "invoice_sale_id_key" ON "invoice"("sale_id");
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- D21 — ai_feedback is append-only (mirrors the bid / ledger_entry / audit_event guarantees).
CREATE OR REPLACE FUNCTION singha_ai_feedback_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ai_feedback is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_feedback_no_update
  BEFORE UPDATE ON "ai_feedback"
  FOR EACH ROW EXECUTE FUNCTION singha_ai_feedback_append_only();

CREATE TRIGGER ai_feedback_no_delete
  BEFORE DELETE ON "ai_feedback"
  FOR EACH ROW EXECUTE FUNCTION singha_ai_feedback_append_only();

-- D21 — ai_run.output is immutable once written (a derived record, rule 3). The applied /
-- appliedBy columns MAY change (the explicit, human-authorised APPLY), but the AI output itself
-- can never be rewritten.
CREATE OR REPLACE FUNCTION singha_ai_run_output_immutable()
RETURNS trigger AS $$
BEGIN
  IF NEW.output IS DISTINCT FROM OLD.output THEN
    RAISE EXCEPTION 'ai_run.output is immutable (AI output is a derived, append-only record)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_run_output_frozen
  BEFORE UPDATE ON "ai_run"
  FOR EACH ROW EXECUTE FUNCTION singha_ai_run_output_immutable();
