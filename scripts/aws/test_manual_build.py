"""Contract checks for publication scope; no AWS calls or application services."""
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]


class ManualBuildTests(unittest.TestCase):
    def setUp(self):
        self.template = json.loads((ROOT / 'infra/aws/pipeline/manual-build.json').read_text())
        self.resources = self.template['Resources']

    def test_no_deployment_or_secret_permissions(self):
        statements = self.resources['BuildRole']['Properties']['Policies'][0]['PolicyDocument']['Statement']
        actions = {a for s in statements for a in s['Action']}
        self.assertEqual({a.split(':')[0] for a in actions}, {'ecr', 'logs', 's3'})
        repos = next(s for s in statements if s['Sid'] == 'TwoRepositories')
        self.assertEqual({r['Fn::Sub'] for r in repos['Resource']}, {
            'arn:${AWS::Partition}:ecr:us-east-2:${AWS::AccountId}:repository/singflow/' + name
            for name in ('backend', 'frontend')})
        trust = self.resources['BuildRole']['Properties']['AssumeRolePolicyDocument']['Statement'][0]
        self.assertEqual(trust['Principal'], {'Service': 'codebuild.amazonaws.com'})
        self.assertIn('aws:SourceArn', trust['Condition']['ArnEquals'])
        self.assertIn('aws:SourceAccount', trust['Condition']['StringEquals'])

    def test_manual_source_is_pinned_before_running_repo_code(self):
        project = self.resources['BuildProject']['Properties']
        self.assertEqual(project['Source']['Type'], 'NO_SOURCE')
        self.assertNotIn('Triggers', project)
        spec = project['Source']['BuildSpec']
        self.assertIn('https://github.com/vilabrayner/singflow.git', spec)
        self.assertLess(spec.index('git rev-parse FETCH_HEAD'), spec.index('git checkout --detach'))
        self.assertLess(spec.index('git checkout --detach'), spec.index('run-release.sh'))
        self.assertIn('SOURCE_REVISION', spec)
        self.assertEqual(project['ConcurrentBuildLimit'], 1)
        self.assertEqual(project['TimeoutInMinutes'], 45)

    def test_tests_precede_publication_and_only_receipt_is_exported(self):
        script = (ROOT / 'infra/aws/pipeline/run-release.sh').read_text()
        for check in ('./mvnw -B verify', 'npm run test:config', 'npm run test:release'):
            self.assertLess(script.index(check), script.index('release.py publish'))
        self.assertIn('--reuse-published', script)
        self.assertIn('--expected-version "$EXPECTED_VERSION"', script)
        self.assertIn('base-directory: /tmp/singflow-artifacts', self.resources['BuildProject']['Properties']['Source']['BuildSpec'])
        self.assertEqual(script.count('cp '), 1)
        self.assertIn('cp /tmp/singflow-release.published.json', script)


    def test_remote_build_uses_official_registries_without_hub_login(self):
        script = (ROOT / 'infra/aws/pipeline/run-release.sh').read_text()
        hook = 'export TESTCONTAINERS_IMAGE_SUBSTITUTOR=br.tec.flowave.singflow.testsupport.PublicRegistryImageSubstitutor'
        self.assertIn(hook, script)
        self.assertLess(script.index(hook), script.index('./mvnw -B verify'))
        self.assertNotIn('TESTCONTAINERS_RYUK_DISABLED', script)
        for folder in ('backend', 'frontend'):
            bases = [line.split()[1] for line in (ROOT / folder / 'Dockerfile').read_text().splitlines() if line.startswith('FROM ')]
            self.assertTrue(bases)
            self.assertTrue(all(base.startswith('public.ecr.aws/docker/library/') for base in bases))
