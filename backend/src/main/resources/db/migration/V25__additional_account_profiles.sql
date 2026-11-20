CREATE TABLE singflow.account_profiles (
 email varchar(254) NOT NULL REFERENCES singflow.host_accounts(email),
 role varchar(16) NOT NULL CHECK (role IN ('HOST','MUSICIAN','PARTICIPANT')),
 PRIMARY KEY(email,role)
);

-- Keep the original profile authoritative for backwards compatibility and registrations.
CREATE FUNCTION singflow.account_roles(account_email text) RETURNS text[]
LANGUAGE sql STABLE AS $$
 SELECT coalesce(array_agg(role ORDER BY role), ARRAY[]::text[]) FROM (
   SELECT role::text FROM singflow.host_accounts WHERE email=account_email
   UNION SELECT role::text FROM singflow.account_profiles WHERE email=account_email
 ) profiles
$$;
CREATE FUNCTION singflow.has_account_role(account_email text, account_role text) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT account_role=ANY(singflow.account_roles(account_email)) $$;
