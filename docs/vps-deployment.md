# Brewstead — deployment on the VPS

Brewstead is deployed as a Spring Boot container behind the Traefik instance already running on the VPS.

## Architecture

```text
Git push to main
      |
      v
GitHub Actions
      |
      | SSH
      v
/opt/brewstead on the VPS
      |
      v
Docker Compose
      |
      v
Spring Boot :8080
      |
      v
Traefik (external network: web)
      |
      v
https://brewstead.mjodheim.be
```

The PostgreSQL database can remain hosted remotely. Only the application runtime moves from Vercel static hosting to the VPS.

## 1. One-time VPS setup

Run on the VPS:

```bash
sudo mkdir -p /opt/brewstead
sudo chown "$USER":"$USER" /opt/brewstead

git clone https://github.com/mjodheim/mjodheim-brewstead.git /opt/brewstead
cd /opt/brewstead

cp .env.example .env
chmod 600 .env
```

Fill in `/opt/brewstead/.env` with the real database credentials:

```env
DB_URL=jdbc:postgresql://HOST:5432/DATABASE?sslmode=require
DB_USERNAME=USERNAME
DB_PASSWORD=PASSWORD
```

Do not commit this file.

Verify that the Traefik Docker network exists:

```bash
docker network inspect web
```

Then perform the first manual deployment:

```bash
cd /opt/brewstead
chmod +x scripts/deploy-vps.sh
./scripts/deploy-vps.sh
```

Inspect the application:

```bash
docker compose ps
docker compose logs -f brewstead
```

## 2. Dedicated SSH key for GitHub Actions

Create a deployment key on your workstation:

```bash
ssh-keygen -t ed25519 -C "github-actions-brewstead" -f ~/.ssh/brewstead_deploy
```

Install the public key for the VPS user:

```bash
ssh-copy-id -i ~/.ssh/brewstead_deploy.pub USER@VPS_IP
```

Test it:

```bash
ssh -i ~/.ssh/brewstead_deploy USER@VPS_IP
```

The VPS user must be able to run `docker compose` without an interactive sudo password.

## 3. GitHub Actions secrets

In GitHub:

`Repository -> Settings -> Secrets and variables -> Actions`

Create these repository secrets:

- `VPS_HOST`: VPS IP address or SSH hostname.
- `VPS_USER`: SSH user used for deployment.
- `VPS_SSH_KEY`: complete content of `~/.ssh/brewstead_deploy` (private key).
- `VPS_KNOWN_HOSTS`: trusted SSH host-key line for the VPS.

Generate the known-hosts value from a trusted machine and verify the fingerprint before saving it:

```bash
ssh-keyscan -H VPS_IP
```

Do not enable CD until the fingerprint has been checked against the VPS host key.

## 4. Enable continuous deployment

In the same GitHub Actions settings, create the repository variable:

```text
VPS_CD_ENABLED=true
```

Until this variable exists, the deployment job is intentionally skipped.

Once enabled, every push to `main` performs:

```text
git fetch origin main
git reset --hard origin/main
docker compose build --pull
docker compose up -d --remove-orphans
```

The `.env` file stays on the VPS because `git reset --hard` does not remove untracked ignored files.

## 5. DNS cutover

Keep Vercel active while validating the VPS.

When the Spring container is healthy and Traefik detects the Brewstead router, change the DNS record for:

```text
brewstead.mjodheim.be
```

from Vercel to the public IP of the VPS.

After DNS propagation, verify:

```text
https://brewstead.mjodheim.be/
https://brewstead.mjodheim.be/login
```

Only remove the Vercel domain/project after the VPS deployment has been validated.

## Useful commands

```bash
cd /opt/brewstead

docker compose ps
docker compose logs -f brewstead
docker compose restart brewstead
docker compose build --pull
docker compose up -d --remove-orphans
```
