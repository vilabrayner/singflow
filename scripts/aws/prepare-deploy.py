#!/usr/bin/env python3
"""Prepare an SSM command JSON locally. Does not call AWS or deploy anything."""
import argparse
import importlib.util
import json
import pathlib

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--manifest', required=True, type=pathlib.Path)
parser.add_argument('--output', required=True, type=pathlib.Path)
args = parser.parse_args()
script = pathlib.Path(__file__).with_name('deploy-ec2.py')
spec = importlib.util.spec_from_file_location('deploy_ec2', script)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
data = module.validate(json.loads(args.manifest.read_text()))
payload = json.dumps({'script': script.read_text(), 'manifest': data})
bootstrap = "import json,pathlib\npayload=json.loads(" + repr(payload) + ")\nbase=pathlib.Path('/opt/singflow')\n(base/'deploy-ec2.py').write_text(payload['script'])\n(base/'requested-release.json').write_text(json.dumps(payload['manifest'],indent=2)+'\\n')\n"
command = {
    'InstanceIds': ['i-0972aeebecab607ba'], 'DocumentName': 'AWS-RunShellScript',
    'Comment': 'SingFlow deploy ' + data['revision'][:7] + ' - backup and verified ECR images',
    'Parameters': {'commands': ['set -eu', 'umask 077', "python3 - <<'PY'\n" + bootstrap + 'PY',
                                'python3 -u /opt/singflow/deploy-ec2.py /opt/singflow/requested-release.json'],
                   'executionTimeout': ['900']}, 'TimeoutSeconds': 120,
}
with args.output.open('x') as out:
    json.dump(command, out, indent=2)
    out.write('\n')
print('SSM command prepared; nothing executed: ' + str(args.output))
