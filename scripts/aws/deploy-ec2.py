#!/usr/bin/env python3
"""Run on the approved EC2 host as root with a verified published release manifest.

Does not create infrastructure, start a stopped EC2, or restore/downgrade a database.
"""
import datetime
import fcntl
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

BASE = pathlib.Path('/opt/singflow')
REGISTRY = '505828739529.dkr.ecr.us-east-2.amazonaws.com'


def run(args, **kwargs):
    return subprocess.run(args, check=True, text=True, capture_output=True, **kwargs).stdout.strip()


def validate(data):
    if (data.get('schema') != 1 or data.get('account') != '505828739529'
            or data.get('region') != 'us-east-2' or data.get('published') is not True
            or data.get('platform') != 'linux/amd64'
            or not re.fullmatch(r'[0-9a-f]{40}', data.get('revision', ''))
            or set(data.get('digests', {})) != {'backend', 'frontend'}):
        raise ValueError('Invalid published release manifest')
    for name, ref in data['digests'].items():
        if not re.fullmatch(re.escape(REGISTRY + '/singflow/' + name) + r'@sha256:[0-9a-f]{64}', ref):
            raise ValueError('Invalid pinned image reference')
    return data


def health(url, attempts=90):
    for _ in range(attempts):
        try:
            with urllib.request.urlopen(url, timeout=3) as response:
                if json.load(response).get('status') == 'UP':
                    return
        except Exception:
            pass
        time.sleep(2)
    raise ValueError('Application did not become healthy')


def rollback(created, renamed, stopped, backup):
    print('ROLLBACK: restoring previous application containers; database is not restored', flush=True)
    errors = []
    for name in reversed(created):
        try:
            run(['docker', 'rm', '-f', name])
        except Exception:
            errors.append('remove-' + name)
    for name, previous in reversed(renamed):
        try:
            run(['docker', 'rename', previous, name])
        except Exception:
            errors.append('rename-' + name)
    for name in ('backend', 'frontend'):
        if name in stopped:
            try:
                run(['docker', 'start', name])
            except Exception:
                errors.append('start-' + name)
    if not errors:
        try:
            health('http://127.0.0.1/actuator/health')
        except Exception:
            errors.append('health')
    (backup / 'rollback.json').write_text(json.dumps({'errors': errors}))
    print('ROLLBACK: ' + ('healthy' if not errors else 'needs operator attention: ' + ','.join(errors)), flush=True)


def deploy(data):
    print('PREFLIGHT: release ' + data['revision'], flush=True)
    for name in ('postgres', 'backend', 'frontend'):
        if run(['docker', 'inspect', '-f', '{{.State.Running}}', name]) != 'true':
            raise ValueError('Expected running container: ' + name)
    if run(['docker', 'inspect', '-f', '{{.State.Health.Status}}', 'postgres']) != 'healthy':
        raise ValueError('PostgreSQL is not healthy')
    for name in ('backend.env', 'postgres.env', 'runtime-config.json'):
        if not (BASE / name).is_file():
            raise ValueError('Required configuration missing: ' + name)
    config = json.loads((BASE / 'runtime-config.json').read_text())
    if config.get('apiBaseUrl') != '/api' or not config.get('primeUiLicense'):
        raise ValueError('Expected same-origin API and configured UI license')
    if shutil.disk_usage(BASE).free < 4 * 1024**3:
        raise ValueError('Less than 4 GiB disk space available')
    identity = json.loads(run(['aws', 'sts', 'get-caller-identity', '--region', 'us-east-2', '--output', 'json']))
    if identity['Account'] != data['account'] or ':assumed-role/singflow-trial-core-InstanceRole-' not in identity['Arn']:
        raise ValueError('Unexpected EC2 execution identity')
    print('DOWNLOAD: pulling both immutable image digests', flush=True)
    with tempfile.TemporaryDirectory(prefix='singflow-docker-') as docker_config:
        password = run(['aws', 'ecr', 'get-login-password', '--region', 'us-east-2'])
        run(['docker', '--config', docker_config, 'login', '--username', 'AWS', '--password-stdin', REGISTRY], input=password + '\n')
        del password
        for ref in data['digests'].values():
            run(['docker', '--config', docker_config, 'pull', ref])
    for name, ref in data['digests'].items():
        info = json.loads(run(['docker', 'image', 'inspect', ref]))[0]
        if info['Os'] != 'linux' or info['Architecture'] != 'amd64' or (info['Config'].get('Labels') or {}).get('org.opencontainers.image.revision') != data['revision']:
            raise ValueError('Image architecture or revision mismatch: ' + name)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = BASE / 'releases' / (stamp + '-' + data['revision'][:12])
    backup.mkdir(parents=True, exist_ok=False, mode=0o700)
    os.chmod(backup.parent, 0o700)
    for name in ('backend.env', 'postgres.env', 'runtime-config.json'):
        shutil.copy2(BASE / name, backup / name)
        os.chmod(backup / name, 0o600)
    previous = {name: run(['docker', 'inspect', '-f', '{{.Config.Image}}', name]) for name in ('backend', 'frontend')}
    (backup / 'requested-release.json').write_text(json.dumps(data, indent=2) + '\n')
    stopped, renamed, created = [], [], []
    try:
        print('BACKUP: stopping application writes and taking PostgreSQL dump', flush=True)
        for name in ('frontend', 'backend'):
            stopped.append(name)
            run(['docker', 'stop', '--time', '60', name])
        with (backup / 'database.dump').open('wb') as out:
            subprocess.run(['docker', 'exec', 'postgres', 'pg_dump', '-U', 'singflow', '-d', 'singflow', '-Fc'], stdout=out, stderr=subprocess.PIPE, check=True)
        if (backup / 'database.dump').stat().st_size == 0:
            raise ValueError('Database backup is empty')
        # Validate archive structure before changing application containers.
        with (backup / 'database.dump').open('rb') as source:
            subprocess.run(['docker', 'exec', '-i', 'postgres', 'pg_restore', '--list'], stdin=source, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True)
        for name in ('backend', 'frontend'):
            old = name + '-previous-' + stamp
            run(['docker', 'rename', name, old])
            renamed.append((name, old))
        print('INSTALL: starting backend and waiting for health', flush=True)
        created.append('backend')
        run(['docker', 'run', '-d', '--name', 'backend', '--network', 'singflow', '--restart', 'unless-stopped', '--memory', '1536m', '--env-file', str(BASE / 'backend.env'), '--log-opt', 'max-size=10m', '--log-opt', 'max-file=2', data['digests']['backend']])
        ip = run(['docker', 'inspect', '-f', '{{with index .NetworkSettings.Networks "singflow"}}{{.IPAddress}}{{end}}', 'backend'])
        if not re.fullmatch(r'\d+\.\d+\.\d+\.\d+', ip):
            raise ValueError('Backend address missing')
        health('http://' + ip + ':8080/actuator/health')
        print('INSTALL: starting frontend with preserved runtime configuration', flush=True)
        os.chmod(BASE / 'runtime-config.json', 0o644)  # Public UI configuration, served by nginx.
        created.append('frontend')
        run(['docker', 'run', '-d', '--name', 'frontend', '--network', 'singflow', '--restart', 'unless-stopped', '-p', '80:80', '--mount', 'type=bind,source=' + str(BASE / 'runtime-config.json') + ',target=/usr/share/nginx/html/config.json,readonly', '--log-opt', 'max-size=10m', '--log-opt', 'max-file=2', data['digests']['frontend']])
        health('http://127.0.0.1/actuator/health')
        with urllib.request.urlopen('http://127.0.0.1/config.json', timeout=10) as response:
            if json.load(response) != config:
                raise ValueError('Frontend runtime configuration differs')
        with urllib.request.urlopen('http://127.0.0.1/anfitriao', timeout=10) as response:
            if b'<app-root' not in response.read():
                raise ValueError('Frontend entry page failed verification')
        data.update(deployedAt=stamp, previousImages=previous, previousContainers=dict(renamed), backupDirectory=str(backup))
        active_tmp = BASE / 'active-release.json.tmp'
        active_tmp.write_text(json.dumps(data, indent=2) + '\n')
        active_tmp.replace(BASE / 'active-release.json')
        print('SUCCESS: release ' + data['revision'] + ' healthy; PostgreSQL and configuration preserved', flush=True)
        print('BACKUP: ' + str(backup), flush=True)
    except BaseException:
        for name in created:
            try:
                (backup / (name + '.log')).write_text(run(['docker', 'logs', '--tail', '200', name]))
            except Exception:
                pass
        rollback(created, renamed, stopped, backup)
        raise


def main():
    if len(sys.argv) != 2 or os.geteuid() != 0:
        raise ValueError('Usage as root: deploy-ec2.py published-manifest.json')
    os.umask(0o077)
    data = validate(json.loads(pathlib.Path(sys.argv[1]).read_text()))
    with (BASE / 'deployment.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        deploy(data)


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        print('FAILED: ' + (str(error) if isinstance(error, ValueError) else type(error).__name__) + '; inspect private logs on EC2', file=sys.stderr)
        sys.exit(1)
