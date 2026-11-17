#!/usr/bin/env python3
"""Create a GitHub prerelease from an ECR-verified receipt. Never builds or deploys."""
import argparse
import json
import pathlib
import subprocess
import tempfile
import release

REPOSITORY = 'vilabrayner/singflow'


def gh(*args):
    return subprocess.run(['gh', *args], check=True, text=True, capture_output=True).stdout.strip()


def api(path):
    return json.loads(gh('api', path))


def validate_receipt(data):
    release.validate_manifest(data)
    if data['schema'] != 2 or data.get('published') is not True or set(data.get('digests', {})) != {'backend', 'frontend'}:
        raise ValueError('A verified, versioned ECR receipt is required')
    for name, value in data['digests'].items():
        import re
        if not re.fullmatch(re.escape(release.REGISTRY + '/singflow/' + name) + r'@sha256:[0-9a-f]{64}', value):
            raise ValueError('Invalid pinned ECR image')
    return data


def notes(data):
    return ('SingFlow ' + data['version'] + '\n\n'
            + 'Commit: `' + data['revision'] + '`\n\n'
            + '| Imagem | Digest publicado |\n| --- | --- |\n'
            + ''.join('| ' + name + ' | `' + value + '` |\n' for name, value in data['digests'].items())
            + '\nImagens publicadas no ECR. A implantação na EC2 é uma etapa separada.\n')


def publish(path):
    data = validate_receipt(json.loads(path.read_text()))
    base = 'repos/' + REPOSITORY
    comparison = api(base + '/compare/' + data['revision'] + '...main')
    if comparison.get('status') not in ('identical', 'ahead'):
        raise ValueError('Release commit must belong to main')
    pages = json.loads(gh('api', '--paginate', '--slurp', base + '/git/matching-refs/tags/' + data['gitTag']))
    refs = [item for page in pages for item in page if item['ref'] == 'refs/tags/' + data['gitTag']]
    if refs:
        obj = refs[0]['object']
        for _ in range(5):
            if obj['type'] != 'tag':
                break
            obj = api(base + '/git/tags/' + obj['sha'])['object']
        if obj['type'] != 'commit' or obj['sha'] != data['revision']:
            raise ValueError('Git tag already identifies another commit; never overwrite it')
    pages = json.loads(gh('api', '--paginate', '--slurp', base + '/releases?per_page=100'))
    existing = next((item for page in pages for item in page if item['tag_name'] == data['gitTag']), None)
    if existing:
        body = existing.get('body') or ''
        if (data['revision'] not in body or any(value not in body for value in data['digests'].values())
                or existing.get('draft') or existing.get('prerelease') != ('-' in data['version'])):
            raise ValueError('Existing GitHub release differs; review it instead of overwriting')
        if not refs:
            raise ValueError('Existing release has no matching Git tag')
        print('Existing GitHub release verified: ' + existing['html_url'])
        return
    if not refs:
        gh('api', '--method', 'POST', base + '/git/refs', '-f', 'ref=refs/tags/' + data['gitTag'], '-f', 'sha=' + data['revision'])
    with tempfile.TemporaryDirectory(prefix='singflow-notes-') as directory:
        note = pathlib.Path(directory) / 'notes.md'
        note.write_text(notes(data))
        args = ['release', 'create', data['gitTag'], '--repo', REPOSITORY, '--verify-tag',
                '--target', data['revision'], '--title', 'SingFlow ' + data['version'], '--notes-file', str(note)]
        if '-' in data['version']:
            args += ['--prerelease', '--latest=false']
        args += [str(path)]
        print(gh(*args))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True, type=pathlib.Path)
    args = parser.parse_args()
    try:
        publish(args.manifest.resolve())
    except (ValueError, subprocess.CalledProcessError, OSError) as error:
        parser.exit(1, 'GitHub release stopped: ' + (str(error) if isinstance(error, ValueError) else 'external operation failed') + '\n')
