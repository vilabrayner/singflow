-- Read-only checks against the singflow database AFTER starting the backend.
SELECT current_database() AS database, current_user AS connected_user;
SELECT installed_rank, version, description, success
FROM public.flyway_schema_history ORDER BY installed_rank;
SELECT tablename FROM pg_tables WHERE schemaname = 'singflow' ORDER BY tablename;
-- Never select password hashes or credentials in diagnostics.
SELECT count(*) AS provisioned_hosts FROM singflow.host_accounts;
