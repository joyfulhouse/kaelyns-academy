CREATE INDEX "program_publisher_idx" ON "program" USING btree ("publisher_id");--> statement-breakpoint
CREATE INDEX "publisher_owner_user_idx" ON "publisher" USING btree ("owner_user_id");