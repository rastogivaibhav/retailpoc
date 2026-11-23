-- PostgreSQL target schema. Not applied to the hosted D1 deployment.
BEGIN;
CREATE TABLE IF NOT EXISTS assurance_tenant(id text PRIMARY KEY, label text NOT NULL);
CREATE TABLE IF NOT EXISTS assurance_node(tenant_id text REFERENCES assurance_tenant(id), id text NOT NULL, kind text NOT NULL, payload jsonb NOT NULL, PRIMARY KEY(tenant_id,id));
CREATE TABLE IF NOT EXISTS assurance_edge(tenant_id text NOT NULL, id text NOT NULL, source_id text NOT NULL,destination_id text NOT NULL,payload jsonb NOT NULL,PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,source_id) REFERENCES assurance_node(tenant_id,id),FOREIGN KEY(tenant_id,destination_id) REFERENCES assurance_node(tenant_id,id));
CREATE TABLE IF NOT EXISTS assurance_commitment(tenant_id text NOT NULL,id text NOT NULL,source_id text NOT NULL,destination_id text NOT NULL,item_id text NOT NULL,due_at timestamptz NOT NULL,qty bigint NOT NULL CHECK(qty>0),payload jsonb NOT NULL,PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,source_id) REFERENCES assurance_node(tenant_id,id),FOREIGN KEY(tenant_id,destination_id) REFERENCES assurance_node(tenant_id,id));
CREATE TABLE IF NOT EXISTS assurance_dependency(tenant_id text NOT NULL,commitment_id text NOT NULL,dependency_id text NOT NULL,PRIMARY KEY(tenant_id,commitment_id,dependency_id),FOREIGN KEY(tenant_id,commitment_id) REFERENCES assurance_commitment(tenant_id,id),FOREIGN KEY(tenant_id,dependency_id) REFERENCES assurance_commitment(tenant_id,id),CHECK(commitment_id<>dependency_id));
CREATE TABLE IF NOT EXISTS assurance_observation(tenant_id text NOT NULL,id text NOT NULL,source_id text NOT NULL,source_version bigint NOT NULL,source_at timestamptz NOT NULL,observed_at timestamptz NOT NULL,payload jsonb NOT NULL,PRIMARY KEY(tenant_id,id));
CREATE TABLE IF NOT EXISTS assurance_workspace(tenant_id text PRIMARY KEY REFERENCES assurance_tenant(id),revision bigint NOT NULL,nonce text NOT NULL,snapshot jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS assurance_dependency_reverse ON assurance_dependency(tenant_id,dependency_id);
CREATE INDEX IF NOT EXISTS assurance_observation_source ON assurance_observation(tenant_id,source_id,source_at DESC);
ALTER TABLE assurance_node ENABLE ROW LEVEL SECURITY;
ALTER TABLE assurance_edge ENABLE ROW LEVEL SECURITY;
ALTER TABLE assurance_commitment ENABLE ROW LEVEL SECURITY;
ALTER TABLE assurance_dependency ENABLE ROW LEVEL SECURITY;
ALTER TABLE assurance_observation ENABLE ROW LEVEL SECURITY;
ALTER TABLE assurance_workspace ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_node ON assurance_node USING(tenant_id=current_setting('app.tenant_id',true)) WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
CREATE POLICY tenant_edge ON assurance_edge USING(tenant_id=current_setting('app.tenant_id',true)) WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
CREATE POLICY tenant_commitment ON assurance_commitment USING(tenant_id=current_setting('app.tenant_id',true)) WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
CREATE POLICY tenant_dependency ON assurance_dependency USING(tenant_id=current_setting('app.tenant_id',true)) WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
CREATE POLICY tenant_observation ON assurance_observation USING(tenant_id=current_setting('app.tenant_id',true)) WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
CREATE POLICY tenant_workspace ON assurance_workspace USING(tenant_id=current_setting('app.tenant_id',true)) WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
COMMIT;
-- An authenticated server must SET LOCAL app.tenant_id inside each transaction.
-- Run the app through a non-owner role without BYPASSRLS, and FORCE RLS before production use.
-- The D1 deployment uses server-scoped tenant queries and atomic nonce-guarded writes instead.
