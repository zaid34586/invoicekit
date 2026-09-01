-- The notifications table (audience/recipient_user_id) already existed and
-- is used by Admin and Staff layouts, but no customer (a plain
-- authenticated user, not staff) could ever read a notification addressed
-- to them -- there was no policy for audience='user' at all. This is what
-- powers admin-granted-plan notices reaching the customer's own bell icon.

DROP POLICY IF EXISTS "user_read_own_notifications" ON notifications;
CREATE POLICY "user_read_own_notifications" ON notifications FOR SELECT TO authenticated
  USING (audience = 'user' AND recipient_user_id = auth.uid());

DROP POLICY IF EXISTS "user_update_own_notifications" ON notifications;
CREATE POLICY "user_update_own_notifications" ON notifications FOR UPDATE TO authenticated
  USING (audience = 'user' AND recipient_user_id = auth.uid())
  WITH CHECK (audience = 'user' AND recipient_user_id = auth.uid());
