import importlib.util
import json
import pathlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('deploy_ec2', pathlib.Path(__file__).with_name('deploy-ec2.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def manifest():
    return {'schema': 1, 'account': '505828739529', 'region': 'us-east-2', 'published': True,
            'platform': 'linux/amd64', 'revision': 'a' * 40,
            'digests': {n: m.REGISTRY + '/singflow/' + n + '@sha256:' + 'b' * 64 for n in ('backend', 'frontend')}}


class DeploymentTests(unittest.TestCase):
    def test_rejects_unpublished_wrong_account_and_mutable_images(self):
        for change in ({'published': False}, {'account': '111111111111'}, {'platform': 'linux/arm64'}, {'revision': 'main'}, {'digests': {'backend': 'nginx:latest', 'frontend': 'nginx:latest'}}):
            with self.assertRaises(ValueError):
                m.validate(manifest() | change)

    def test_failed_download_never_stops_the_running_app(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = pathlib.Path(tmp)
            for f in ('backend.env', 'postgres.env'):
                (base / f).write_text('EXAMPLE=preserved\n')
            (base / 'runtime-config.json').write_text(json.dumps({'apiBaseUrl': '/api', 'primeUiLicense': 'test'}))
            calls = []

            def fake(args, **kwargs):
                calls.append(args)
                if args[:3] == ['docker', 'inspect', '-f']:
                    return 'healthy' if args[-1] == 'postgres' and 'Health' in args[3] else 'true'
                if args[:3] == ['aws', 'sts', 'get-caller-identity']:
                    return json.dumps({'Account': '505828739529', 'Arn': 'arn:aws:sts::505828739529:assumed-role/singflow-trial-core-InstanceRole-test/session'})
                if 'pull' in args:
                    raise subprocess.CalledProcessError(1, args)
                return ''

            with patch.object(m, 'BASE', base), patch.object(m, 'run', side_effect=fake), patch.object(m.shutil, 'disk_usage') as disk:
                disk.return_value.free = 10 * 1024**3
                with self.assertRaises(subprocess.CalledProcessError):
                    m.deploy(manifest())
            self.assertFalse(any('stop' in a or 'rename' in a for a in calls))
            self.assertFalse((base / 'active-release.json').exists())

    def test_rollback_removes_new_then_restores_previous_pair_without_database_restore(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(m, 'run') as run, patch.object(m, 'health'):
            m.rollback(['backend', 'frontend'], [('backend', 'backend-old'), ('frontend', 'frontend-old')], ['frontend', 'backend'], pathlib.Path(tmp))
            self.assertEqual([c.args[0] for c in run.call_args_list], [
                ['docker', 'rm', '-f', 'frontend'], ['docker', 'rm', '-f', 'backend'],
                ['docker', 'rename', 'frontend-old', 'frontend'], ['docker', 'rename', 'backend-old', 'backend'],
                ['docker', 'start', 'backend'], ['docker', 'start', 'frontend']])
            self.assertEqual(json.loads((pathlib.Path(tmp) / 'rollback.json').read_text()), {'errors': []})

    def test_rollback_reports_failed_restoration(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(m, 'run', side_effect=RuntimeError), patch.object(m, 'health'):
            m.rollback([], [], ['backend'], pathlib.Path(tmp))
            self.assertEqual(json.loads((pathlib.Path(tmp) / 'rollback.json').read_text()), {'errors': ['start-backend']})


if __name__ == '__main__':
    unittest.main()
