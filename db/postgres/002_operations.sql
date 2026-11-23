-- Target migration only. Not applied to the hosted D1 database.
BEGIN;
CREATE TABLE IF NOT EXISTS operations_jobs (
 id text PRIMARY KEY, tenant_id text NOT NULL, kind text NOT NULL,
 dedupe text NOT NULL, state text NOT NULL, attempt integer NOT NULL DEFAULT 0,
 due bigint NOT NULL, lease text NOT NULL DEFAULT '', lease_until bigint NOT NULL DEFAULT 0,
 payload jsonb NOT NULL, result jsonb, error text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, UNIQUE(tenant_id,dedupe)
);
CREATE INDEX IF NOT EXISTS operations_jobs_due ON operations_jobs(state,due,lease_until);
CREATE TABLE IF NOT EXISTS operations_settings (tenant_id text PRIMARY KEY,snapshot jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS operations_members (email text PRIMARY KEY,tenant_id text NOT NULL,role text NOT NULL CHECK(role IN ('viewer','planner','approver','operator')),granted_by text NOT NULL,created_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS operations_tasks (tenant_id text NOT NULL,id text NOT NULL,assignee text NOT NULL,due timestamptz NOT NULL,status text NOT NULL,note text NOT NULL,updated_at timestamptz NOT NULL,PRIMARY KEY(tenant_id,id));
CREATE TABLE IF NOT EXISTS operations_audit (id text PRIMARY KEY,tenant_id text NOT NULL,at timestamptz NOT NULL,actor text NOT NULL,action text NOT NULL,detail text NOT NULL);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['operations_jobs','operations_settings','operations_members','operations_tasks','operations_audit'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS tenant_access ON %I',t);
  EXECUTE format('CREATE POLICY tenant_access ON %I USING (tenant_id=current_setting(''app.tenant_id'',true)) WITH CHECK (tenant_id=current_setting(''app.tenant_id'',true))',t);
 END LOOP;
END $$;
COMMIT;
-- PostgreSQL job claims require FOR UPDATE SKIP LOCKED in a server transaction.
-- Do not reuse SQLite syntax or treat this schema as an activated storage driver.
