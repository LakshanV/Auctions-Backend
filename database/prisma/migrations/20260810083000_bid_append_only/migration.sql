-- Append-only bid ledger (docs/04, docs/07): accepted bids are never silently
-- rewritten. Reject UPDATE and DELETE on the bid table; corrections are new
-- reversal rows. Mirrors the audit_event append-only guarantee.

CREATE OR REPLACE FUNCTION singha_bid_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'bid ledger is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bid_no_update
  BEFORE UPDATE ON "bid"
  FOR EACH ROW EXECUTE FUNCTION singha_bid_append_only();

CREATE TRIGGER bid_no_delete
  BEFORE DELETE ON "bid"
  FOR EACH ROW EXECUTE FUNCTION singha_bid_append_only();
