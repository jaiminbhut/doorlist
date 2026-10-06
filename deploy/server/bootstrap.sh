#!/usr/bin/env bash
#
# One-time setup of a fresh Ubuntu 24.04 server for Doorlist. Run it as the
# server's default `ubuntu` user (it uses sudo), with the public half of the
# deploy key that GitHub Actions will use:
#
#   ssh ubuntu@<server> 'bash -s' < deploy/server/bootstrap.sh "<deploy public key>"
#
# Safe to run again. It installs Docker, adds swap on small servers, turns on
# the firewall and automatic security updates, allows SSH keys only, and
# creates the `deploy` user that the workflow signs in as.

set -euo pipefail

deploy_key=${1:?usage: bootstrap.sh "<ssh public key for the deploy user>"}
export DEBIAN_FRONTEND=noninteractive

echo "==> System packages"
sudo apt-get update -q
sudo apt-get upgrade -y -q
sudo apt-get install -y -q ca-certificates curl rsync ufw fail2ban unattended-upgrades

echo "==> Docker Engine and Compose, from Docker's own repository"
if ! command -v docker >/dev/null; then
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  codename=$(sed -n 's/^VERSION_CODENAME=//p' /etc/os-release)
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $codename stable" |
    sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -q
  sudo apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
# Rotate container logs so they can't fill the disk.
echo '{ "log-driver": "local", "log-opts": { "max-size": "10m", "max-file": "3" } }' |
  sudo tee /etc/docker/daemon.json >/dev/null
sudo systemctl restart docker

echo "==> Swap"
memory_mb=$(awk '/MemTotal/ { print int($2 / 1024) }' /proc/meminfo)
if (( memory_mb < 3500 )) && [[ ! -f /swapfile ]]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/90-doorlist-swap.conf >/dev/null
  sudo sysctl -q -p /etc/sysctl.d/90-doorlist-swap.conf
  echo "   2 GB swap added (${memory_mb} MB of RAM)"
else
  echo "   not needed, or already there (${memory_mb} MB of RAM)"
fi

echo "==> Firewall: SSH, HTTP and HTTPS only"
sudo ufw default deny incoming >/dev/null
sudo ufw default allow outgoing >/dev/null
sudo ufw allow OpenSSH >/dev/null
sudo ufw allow 80/tcp >/dev/null
sudo ufw allow 443/tcp >/dev/null
sudo ufw allow 443/udp >/dev/null
sudo ufw --force enable >/dev/null
# SQL Server is never published on a host port; only Caddy's 80 and 443 are.

echo "==> Automatic security updates"
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' |
  sudo tee /etc/apt/apt.conf.d/20auto-upgrades >/dev/null

echo "==> SSH: keys only, no root login"
printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin no\n' |
  sudo tee /etc/ssh/sshd_config.d/90-doorlist.conf >/dev/null
sudo sshd -t
sudo systemctl reload ssh 2>/dev/null || sudo systemctl restart ssh
sudo systemctl enable --now fail2ban >/dev/null

echo "==> The deploy user"
if ! id deploy >/dev/null 2>&1; then
  sudo adduser --disabled-password --gecos "Doorlist deploys" deploy >/dev/null
fi
sudo usermod -aG docker deploy
sudo install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
printf '%s\n' "$deploy_key" | sudo tee /home/deploy/.ssh/authorized_keys >/dev/null
sudo chown deploy:deploy /home/deploy/.ssh/authorized_keys
sudo chmod 600 /home/deploy/.ssh/authorized_keys
sudo install -d -m 750 -o deploy -g deploy /opt/doorlist

echo
echo "Done. Docker $(docker --version | awk '{ print $3 }' | tr -d ,), $(docker compose version --short) compose, ${memory_mb} MB RAM."
