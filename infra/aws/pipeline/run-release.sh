#!/usr/bin/env bash
# Runs only in disposable CodeBuild infrastructure; never on the karaoke EC2.
set -euo pipefail
: "${CODEBUILD_SRC_DIR:?CodeBuild source directory required}"
: "${SOURCE_REVISION:?Set the full main commit SHA before starting the build}"
: "${EXPECTED_VERSION:?Set the expected release version}"
[[ "$SOURCE_REVISION" =~ ^[0-9a-f]{40}$ ]]
[[ "${AWS_DEFAULT_REGION:-}" == "us-east-2" ]]
cd "$CODEBUILD_SRC_DIR"
[[ "$(git rev-parse HEAD)" == "$SOURCE_REVISION" ]]
export CI=true
if [[ "$(node -p 'process.versions.node')" != "$(cat .nvmrc)" ]]; then
  n "$(cat .nvmrc)"
  hash -r
fi
if ! docker info >/dev/null 2>&1; then
  nohup /usr/local/bin/dockerd --host=unix:///var/run/docker.sock >/tmp/dockerd.log 2>&1 &
  timeout 30 sh -c 'until docker info >/dev/null 2>&1; do sleep 1; done'
fi
python3 -c 'import pathlib,sys; sys.path.insert(0,"scripts/aws"); import release; print("Release version:", release.source_version(pathlib.Path("."), __import__("os").environ["EXPECTED_VERSION"]))'
python3 -m unittest discover -s scripts/aws -p 'test_*.py'
cd backend
./mvnw -B verify
cd ../frontend
npm ci
npm run format:check
npm run test:config
npm run build
npx playwright install --with-deps chromium
npm test
cd ..
git diff --exit-code
python3 scripts/aws/release.py build-source --source "$CODEBUILD_SRC_DIR" --revision "$SOURCE_REVISION" --expected-version "$EXPECTED_VERSION" --reuse-published --profile "" --output /tmp/singflow-release.json
python3 scripts/aws/release.py publish --profile "" --manifest /tmp/singflow-release.json
mkdir -p /tmp/singflow-artifacts
cp /tmp/singflow-release.published.json /tmp/singflow-artifacts/release.published.json
