-- End-of-game reports, one per party generation. Never deleted by the app.
CREATE TABLE IF NOT EXISTS `game_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`generation` integer NOT NULL,
	`room` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `game_reports_finished_at` ON `game_reports` (`finished_at`);
