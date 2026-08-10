-- Append-only audit log (docs/04, docs/15): audit_event is business evidence.
-- Reject UPDATE and DELETE at the database so no application path — and no
-- ordinary admin — can rewrite or erase audit history. New rows only.

CREATE OR REPLACE FUNCTION singha_audit_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_event is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_event_no_update
  BEFORE UPDATE ON "audit_event"
  FOR EACH ROW EXECUTE FUNCTION singha_audit_append_only();

CREATE TRIGGER audit_event_no_delete
  BEFORE DELETE ON "audit_event"
  FOR EACH ROW EXECUTE FUNCTION singha_audit_append_only();
