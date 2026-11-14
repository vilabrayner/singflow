#!/bin/bash
set -euo pipefail
umask 077
cd /opt/singflow
test -f build-status
test "$#" -eq 1
public_url="$1"
case "$public_url" in https://singflow.flowave.tec.br|https://*.cloudfront.net) ;; *) exit 2;; esac
export TRIAL_PUBLIC_URL="$public_url"
python3 - <<'PY'
from pathlib import Path
import os,secrets
base=Path('/opt/singflow')
if not (base/'postgres.env').exists():
    db=secrets.token_urlsafe(32)
    host=secrets.token_urlsafe(24)
    (base/'postgres.env').write_text('POSTGRES_DB=singflow\nPOSTGRES_USER=singflow\nPOSTGRES_PASSWORD='+db+'\n')
    (base/'backend.env').write_text('SPRING_PROFILES_ACTIVE=prod\nDB_URL=jdbc:postgresql://postgres:5432/singflow\nDB_USERNAME=singflow\nDB_PASSWORD='+db+'\nSINGFLOW_HOST_EMAIL=vilabrayner@gmail.com\nSINGFLOW_HOST_PASSWORD='+host+'\nSINGFLOW_ADMIN_EMAIL=vilabrayner@gmail.com\nJAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=70.0\nSINGFLOW_PUBLIC_APP_URL='+os.environ['TRIAL_PUBLIC_URL']+'\n')
    (base/'test-access.txt').write_text('Conta de teste: vilabrayner@gmail.com\nSenha temporária: '+host+'\n')
    for f in ('postgres.env','backend.env','test-access.txt'):
        (base/f).chmod(0o600)
else:
    p=base/'backend.env'
    lines=p.read_text().splitlines()
    p.write_text('\n'.join('SINGFLOW_PUBLIC_APP_URL='+os.environ['TRIAL_PUBLIC_URL'] if l.startswith('SINGFLOW_PUBLIC_APP_URL=') else l for l in lines)+'\n')
PY
docker network inspect singflow >/dev/null 2>&1 || docker network create singflow >/dev/null
docker volume create singflow-postgres >/dev/null
docker run -d --name postgres --network singflow --restart unless-stopped --env-file postgres.env -v singflow-postgres:/var/lib/postgresql/data --health-cmd='pg_isready -U singflow -d singflow' --health-interval=5s --health-retries=30 --log-opt max-size=10m --log-opt max-file=2 postgres:17.6 >/dev/null
for attempt in $(seq 1 60); do
  test "$(docker inspect -f '{{.State.Health.Status}}' postgres)" = healthy && break
  sleep 2
done
test "$(docker inspect -f '{{.State.Health.Status}}' postgres)" = healthy
docker run -d --name backend --network singflow --restart unless-stopped --memory 1536m --env-file backend.env --log-opt max-size=10m --log-opt max-file=2 singflow-backend:4af0615 >/dev/null
docker run -d --name frontend --network singflow --restart unless-stopped -p 80:80 --log-opt max-size=10m --log-opt max-file=2 singflow-frontend:4af0615 >/dev/null
for attempt in $(seq 1 90); do
  if curl -fsS http://127.0.0.1/actuator/health >/opt/singflow/health.json; then
    printf 'app-ready\n' > /opt/singflow/app-status
    cat /opt/singflow/health.json
    exit 0
  fi
  sleep 2
done
echo 'Application did not reach healthy status' >&2
exit 1
