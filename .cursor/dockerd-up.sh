#!/usr/bin/env bash
# Idempotently start the Docker daemon inside the Cloud Agent VM.
#
# Cloud Agent VMs are themselves containers, so Docker needs two tweaks to work:
#   1. fuse-overlayfs storage driver — the default overlay2 cannot stack another
#      overlay mount on top of the VM's own overlay root.
#   2. legacy iptables backend — Docker's nftables bridge rules do not install
#      cleanly here, which silently breaks container-to-container networking.
set -euo pipefail

if docker info >/dev/null 2>&1; then
  exit 0
fi

mkdir -p /etc/docker
cat >/etc/docker/daemon.json <<'JSON'
{
  "storage-driver": "fuse-overlayfs",
  "features": { "containerd-snapshotter": false }
}
JSON

update-alternatives --set iptables /usr/sbin/iptables-legacy 2>/dev/null || true
update-alternatives --set ip6tables /usr/sbin/ip6tables-legacy 2>/dev/null || true

nohup dockerd >/var/log/dockerd.log 2>&1 &

for _ in $(seq 1 60); do
  if docker info >/dev/null 2>&1; then
    echo "dockerd is ready"
    exit 0
  fi
  sleep 1
done

echo "dockerd failed to start within 60s" >&2
tail -n 40 /var/log/dockerd.log >&2 || true
exit 1
