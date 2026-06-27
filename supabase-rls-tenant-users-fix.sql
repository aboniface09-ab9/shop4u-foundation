-- Fix self-referential tenant_users policy.
-- The previous policy queried tenant_users to decide who can read tenant_users
-- — infinite recursion. Replace with a direct auth.uid() check.

DROP POLICY IF EXISTS tenant_users_isolation ON public.tenant_users;

-- Each user can read and manage only their own row(s).
-- Tenant owners who need to manage other users' rows should use the service role.
CREATE POLICY tenant_users_isolation ON public.tenant_users
  FOR ALL
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());
