#!/usr/bin/env bash
# Regenerates nginx config and systemd unit, installs them on remote server,
# and reloads nginx.
source "$(dirname "$0")/common.sh"

"$ROOT/deploy/generate.sh"

echo "Copying server configs to $DEPLOY_HOST..."
scp "$ROOT/deploy/nginx.conf" "$DEPLOY_HOST:/tmp/veloce-nginx.conf"
scp "$ROOT/deploy/veloce-service@.service" "$DEPLOY_HOST:/tmp/veloce-service@.service"

ssh -t "$DEPLOY_HOST" "set -e
  $REMOTE_SUDO

  \$S install -m 644 /tmp/veloce-service@.service /etc/systemd/system/veloce-service@.service
  \$S systemctl daemon-reload

  enabled=\$(ls /etc/systemd/system/multi-user.target.wants/ 2>/dev/null | grep '^veloce-service@' | sort | xargs || true)
  wanted=\$(for i in \$(seq 0 $((CLUSTER_COUNT - 1))); do echo veloce-service@\$i.service; done | sort | xargs)
  if [ \"\$enabled\" != \"\$wanted\" ]; then
    echo \"Clusters changed from '\$enabled' to '\$wanted', updating service units...\"
    if [ -n \"\$enabled\" ]; then \$S systemctl disable --now \$enabled; fi
    \$S systemctl enable --now \$wanted
  fi

  rm -f /tmp/veloce-nginx.conf.prev
  if [ -f '$NGINX_CONF_PATH' ]; then \$S cp '$NGINX_CONF_PATH' /tmp/veloce-nginx.conf.prev; fi
  \$S install -m 644 /tmp/veloce-nginx.conf '$NGINX_CONF_PATH'
  
  echo 'Testing nginx configuration...'
  if ! \$S nginx -t; then
    echo 'Invalid nginx config, rolling back...'
    if [ -f /tmp/veloce-nginx.conf.prev ]; then
      \$S cp /tmp/veloce-nginx.conf.prev '$NGINX_CONF_PATH'
    else
      \$S rm '$NGINX_CONF_PATH'
    fi
    exit 1
  fi

  echo 'Reloading nginx...'
  \$S systemctl reload nginx
  rm -f /tmp/veloce-nginx.conf /tmp/veloce-nginx.conf.prev /tmp/veloce-service@.service
  echo 'Server configuration updated and nginx reloaded successfully'"
