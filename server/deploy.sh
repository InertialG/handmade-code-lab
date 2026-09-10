#!/bin/sh
# 部署到 Passenger 托管的节点（如 serv00）。用法：server/deploy.sh user@host domains/xxx/public_nodejs
set -eu
HOST=$1
DIR=$2
cd "$(dirname "$0")/.."
(cd web && VITE_SERVER_REPORT=1 BASE_PATH=/ npm run build)
tar czf - package.json server web/src web/dist | ssh "$HOST" "mkdir -p '$DIR/tmp' && tar xzf - -C '$DIR' \
  && rm -rf '$DIR/public' && cp -R '$DIR/web/dist' '$DIR/public' \
  && printf \"import './server/app.js';\n\" > '$DIR/app.js' && touch '$DIR/tmp/restart.txt'"
echo "deployed to $HOST:$DIR"
