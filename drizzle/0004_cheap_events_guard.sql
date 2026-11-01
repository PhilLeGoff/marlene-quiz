-- 0002's guard compared every old event with every new one on each write, so writes slowed
-- quadratically as events piled up (about 1 s per write at 800 events). Each event is already
-- copied to the immutable score_events table, so a constant-time check that the list never
-- shrinks is enough here.
DROP TRIGGER IF EXISTS party_events_append_only;
--> statement-breakpoint
CREATE TRIGGER party_events_append_only BEFORE UPDATE ON parties
WHEN coalesce(json_array_length(NEW.data,'$.events'),0) < coalesce(json_array_length(OLD.data,'$.events'),0)
BEGIN SELECT RAISE(ABORT,'score history is append-only'); END;
