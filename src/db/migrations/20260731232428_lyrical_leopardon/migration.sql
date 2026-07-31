ALTER TABLE "universities" ADD COLUMN "timezone" varchar(64) DEFAULT 'Europe/Istanbul' NOT NULL;--> statement-breakpoint
ALTER TABLE "universities" ADD COLUMN "default_locale" varchar(10) DEFAULT 'tr' NOT NULL;--> statement-breakpoint
ALTER TABLE "universities" ADD COLUMN "logo_url" varchar(2048);--> statement-breakpoint
ALTER TABLE "universities" ADD COLUMN "primary_color" varchar(7);