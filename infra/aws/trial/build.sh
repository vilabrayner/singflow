#!/bin/bash
set -euo pipefail
umask 077
cd /opt/singflow
test -f bootstrap-status
aws s3 cp s3://singflow-trial-core-artifacts-ymvpwuacaqmb/source/singflow-4af0615.tar.gz source.tar.gz --region us-east-2 --only-show-errors
install -d -m 700 app
tar -xzf source.tar.gz -C app
cd app
aws s3 cp s3://singflow-trial-core-artifacts-ymvpwuacaqmb/source/package-lock-fixed.json frontend/package-lock.json --region us-east-2 --only-show-errors
docker build -t singflow-backend:4af0615 ./backend
docker build -t singflow-frontend:4af0615 ./frontend
printf 'images-ready\n' > /opt/singflow/build-status
