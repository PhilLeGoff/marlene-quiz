-- Enforce append-only score history even when the aggregate state is replaced.
CREATE TRIGGER score_events_no_update BEFORE UPDATE ON score_events BEGIN SELECT RAISE(ABORT,'score events are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER score_events_no_delete BEFORE DELETE ON score_events BEGIN SELECT RAISE(ABORT,'score events are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER party_events_append_only BEFORE UPDATE ON parties
WHEN EXISTS (SELECT 1 FROM json_each(OLD.data,'$.events') old_event WHERE NOT EXISTS (SELECT 1 FROM json_each(NEW.data,'$.events') new_event WHERE json_extract(new_event.value,'$.id')=json_extract(old_event.value,'$.id') AND new_event.value=old_event.value))
BEGIN SELECT RAISE(ABORT,'score history is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER party_score_audit AFTER UPDATE ON parties BEGIN
INSERT OR IGNORE INTO score_events(id,data) SELECT json_extract(value,'$.id'),value FROM json_each(NEW.data,'$.events');
END;
