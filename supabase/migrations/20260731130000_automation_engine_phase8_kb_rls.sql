-- Automation Engine Phase 8: customer-facing Knowledge Base.
-- Reuses chat_faqs (already seeded for the bot in Phase 4 part 2) instead of
-- a second parallel content table -- one place to maintain answers, used by
-- both the bot and this browsable self-serve page.

DROP POLICY IF EXISTS "customer_read_active_chat_faqs" ON chat_faqs;
CREATE POLICY "customer_read_active_chat_faqs" ON chat_faqs FOR SELECT
  TO authenticated USING (is_active);
