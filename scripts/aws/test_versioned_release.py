import importlib.util
import json
import pathlib
import subprocess
import tempfile
import types
import unittest
from unittest.mock import patch
import release

spec = importlib.util.spec_from_file_location('github_release', pathlib.Path(__file__).with_name('github-release.py'))
github = importlib.util.module_from_spec(spec)
spec.loader.exec_module(github)


def manifest(published=True):
    version = '0.1.0-beta.1'
    return {'schema': 2, 'account': release.ACCOUNT, 'region': release.REGION,
            'platform': 'linux/amd64', 'version': version, 'tag': version, 'gitTag': 'v' + version,
            'revision': 'a'*40, 'published': published,
            'images': {n: release.REGISTRY + '/singflow/' + n + ':' + version for n in ('backend', 'frontend')},
            'digests': {n: release.REGISTRY + '/singflow/' + n + '@sha256:' + 'b'*64 for n in ('backend', 'frontend')}}


class VersionedReleaseTests(unittest.TestCase):
    def setUp(self):
        # Unit fixtures must not inherit the release version of the checked-out app.
        temporary = tempfile.TemporaryDirectory(prefix='singflow-release-test-')
        self.addCleanup(temporary.cleanup)
        self.source = pathlib.Path(temporary.name)
        self.write_source('0.1.0-beta.1')

    def write_source(self, version):
        frontend = self.source / 'frontend'
        backend = self.source / 'backend'
        frontend.mkdir(exist_ok=True)
        backend.mkdir(exist_ok=True)
        (frontend / 'package.json').write_text(json.dumps({'version': version}))
        (frontend / 'package-lock.json').write_text(json.dumps({
            'version': version, 'packages': {'': {'version': version}}}))
        (backend / 'pom.xml').write_text(
            '<project xmlns="http://maven.apache.org/POM/4.0.0">'
            '<version>' + version + '</version></project>')

    def test_identity_and_validation(self):
        release.validate_manifest(manifest())
        for change in ({'version': '0.1.0-beta.2'}, {'gitTag': 'vother'}, {'tag': 'latest'}, {'schema': 3}):
            with self.assertRaises(ValueError):
                release.validate_manifest(manifest() | change)
        for version in ('01.0.0', '1.0.0-beta.01', '1.0', '1.0.0+metadata', ';shell'):
            self.assertFalse(release.valid_version(version))

    def test_metadata_drift_and_expected_version_stop_before_build(self):
        source = self.source
        self.assertEqual(release.source_version(source), '0.1.0-beta.1')
        with patch.object(release, 'run') as runner, patch.object(release, 'check_destinations') as destinations:
            with self.assertRaises(ValueError):
                release.build(source, 'a'*40, source/'unused.json', 'ci', expected='0.1.0-beta.9')
            for field in ('package', 'lock-root', 'lock-package', 'backend'):
                with self.subTest(field=field):
                    self.write_source('0.1.0-beta.2')
                    if field == 'backend':
                        path = source/'backend/pom.xml'
                        path.write_text(path.read_text().replace('beta.2', 'beta.3'))
                    else:
                        path = source/'frontend'/('package.json' if field == 'package' else 'package-lock.json')
                        data = json.loads(path.read_text())
                        target = data['packages'][''] if field == 'lock-package' else data
                        target['version'] = '0.1.0-beta.3'
                        path.write_text(json.dumps(data))
                    with self.assertRaises(ValueError):
                        release.build(source, 'a'*40, source/'unused.json', 'ci', reuse=True)
            runner.assert_not_called()
            destinations.assert_not_called()

    def test_version_label_must_match_not_just_the_commit(self):
        info = {'Os': 'linux', 'Architecture': 'amd64', 'Id': 'sha256:config',
                'Config': {'Labels': {'org.opencontainers.image.revision': 'a'*40,
                                      'org.opencontainers.image.version': '0.1.0-beta.2'}}}
        with patch.object(release, 'run', return_value=types.SimpleNamespace(stdout=json.dumps([info]))):
            with self.assertRaises(ValueError):
                release.inspect_local('image', 'a'*40, '0.1.0-beta.1')

    def test_complete_existing_pair_is_reused_without_rebuilding(self):
        source = self.source
        for version in ('0.1.0-beta.1', '0.1.0-beta.2', '1.0.0'):
            with self.subTest(version=version):
                self.write_source(version)
                out = source/('release-' + version + '.json')
                with patch.object(release, 'check_destinations'), patch.object(release, 'docker_login'), patch.object(release, 'existing_image', return_value={'present': True}), patch.object(release, 'inspect_local') as inspect, patch.object(release, 'run') as runner:
                    release.build(source, 'a'*40, out, 'ci', expected=version, reuse=True)
                calls = [c.args[0] for c in runner.call_args_list]
                self.assertEqual(sum(c[:2] == ['docker', 'pull'] for c in calls), 2)
                self.assertFalse(any(c[:3] == ['docker', 'buildx', 'build'] for c in calls))
                self.assertEqual(json.loads(out.read_text())['gitTag'], 'v'+version)
                self.assertEqual(inspect.call_count, 2)
                self.assertTrue(all(c.args[2] == version for c in inspect.call_args_list))

    def test_existing_wrong_commit_stops_before_building_missing_image(self):
        source = self.source
        with tempfile.TemporaryDirectory() as directory, patch.object(release, 'check_destinations'), patch.object(release, 'docker_login'), patch.object(release, 'existing_image', side_effect=[{'present': True}, None]), patch.object(release, 'inspect_local', side_effect=ValueError('wrong commit')), patch.object(release, 'run') as runner:
            with self.assertRaises(ValueError):
                release.build(source, 'a'*40, pathlib.Path(directory)/'release.json', 'ci', reuse=True)
            self.assertFalse(any(c.args[0][:3] == ['docker', 'buildx', 'build'] for c in runner.call_args_list))

    def test_conflict_in_second_repository_prevents_all_pushes(self):
        same = {'imageManifest': json.dumps({'config': {'digest': 'sha256:local'}})}
        other = {'imageManifest': json.dumps({'config': {'digest': 'sha256:other'}})}
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory)/'release.json'; path.write_text(json.dumps(manifest(False)))
            with patch.object(release, 'check_destinations'), patch.object(release, 'inspect_local', return_value='sha256:local'), patch.object(release, 'existing_image', side_effect=[same, other]), patch.object(release, 'run') as runner:
                with self.assertRaises(ValueError): release.publish(path, '')
                runner.assert_not_called()

    def test_github_rejects_unpublished_and_foreign_digests(self):
        with self.assertRaises(ValueError): github.validate_receipt(manifest(False))
        data = manifest(); data['digests']['frontend'] = 'other/image@sha256:' + 'b'*64
        with self.assertRaises(ValueError): github.validate_receipt(data)

    def test_github_does_not_replace_existing_tag(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory)/'release.json'; path.write_text(json.dumps(manifest()))
            with patch.object(github, 'api', return_value={'status': 'identical'}), patch.object(github, 'gh', return_value=json.dumps([[{'ref': 'refs/tags/v0.1.0-beta.1', 'object': {'type': 'commit', 'sha': 'c'*40}}]])) as runner:
                with self.assertRaises(ValueError): github.publish(path)
                self.assertFalse(any('--method' in c.args for c in runner.call_args_list))

    def test_github_is_idempotent_for_verified_existing_release(self):
        data=manifest()
        existing={'tag_name': data['gitTag'], 'body': github.notes(data), 'draft': False, 'prerelease': True, 'html_url': 'https://github.com/vilabrayner/singflow/releases/tag/'+data['gitTag']}
        responses=[json.dumps([[{'ref': 'refs/tags/'+data['gitTag'], 'object': {'type':'commit','sha':data['revision']}}]]), json.dumps([[existing]])]
        with tempfile.TemporaryDirectory() as directory:
            path=pathlib.Path(directory)/'release.json'; path.write_text(json.dumps(data))
            with patch.object(github,'api',return_value={'status':'ahead'}), patch.object(github,'gh',side_effect=responses) as runner:
                github.publish(path)
                self.assertEqual(runner.call_count,2)

    def test_github_creates_tag_then_prerelease_with_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            path=pathlib.Path(directory)/'release.json'; path.write_text(json.dumps(manifest()))
            with patch.object(github,'api',return_value={'status':'identical'}), patch.object(github,'gh',side_effect=['[]','[]','{}','release-url']) as runner:
                github.publish(path)
                calls=[c.args for c in runner.call_args_list]
                self.assertIn('sha='+'a'*40,calls[2]); self.assertIn('--verify-tag',calls[3])
                self.assertIn('--prerelease',calls[3]); self.assertEqual(calls[3][-1],str(path))


if __name__ == '__main__': unittest.main()
