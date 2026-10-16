# Deploying Veloce

Production deployment tooling and hosting infrastructure for Veloce.

Nginx serves the Next.js web application as static files (or reverse proxies to the embedded web binary), routing API requests to the high-performance Go service cluster running the Discord bot gateway and execution engine.


All public traffic arrives securely through a **Cloudflare Tunnel**, providing free SSL/TLS certificates, DDoS mitigation, and public domains without opening firewall ports.

---

## Quick Start: Free Public HTTPS Domain via Cloudflare Tunnel

To immediately publish your Veloce instance to the internet with a free SSL domain:

```bash
# 1. Start the backend service and database
docker compose up -d

# 2. Launch the Cloudflare Tunnel
./deploy/tunnel.sh 8080
```

`tunnel.sh` automatically installs `cloudflared` if not present and provides an instant public HTTPS URL (e.g. `https://xxxx.trycloudflare.com`).

To use your own free domain (e.g. `*.is-a.dev` or `*.duckdns.org` added to Cloudflare):
1. Create a Tunnel in your Cloudflare Zero Trust dashboard.
2. Add public hostnames pointing to `http://localhost:8080` (or `http://localhost:80` if using Nginx).
3. Run the persistent tunnel with your token:
   ```bash
   cloudflared tunnel run --token <YOUR_TUNNEL_TOKEN>
   ```

---

## Production Server Deployment (Nginx + Systemd)

Deploy to any Linux server or VPS (Oracle Cloud Free Tier, Hetzner, DigitalOcean, AWS):

### 1. Initial Setup
```bash
cp deploy/.env.example deploy/.env
# Set DEPLOY_HOST in deploy/.env (e.g. DEPLOY_HOST=root@your-server-ip)
```

Configure your domains and cluster counts in `deploy/config.env`, then generate the configs:
```bash
./deploy/generate.sh
```

### 2. Configure Server (Nginx & Systemd)
Installs the generated systemd unit and Nginx configuration on the remote host, running `nginx -t` validation before reloading:
```bash
./deploy/server.sh
```

### 3. Deploy the Go Backend Service
Compiles the static binary for the target server architecture (`linux/amd64` or `linux/arm64`), uploads it, executes database migrations, atomically swaps the binary, and gracefully restarts the service clusters:
```bash
./deploy/service.sh

# Rollback to the previous binary if needed:
./deploy/service.sh --rollback
```

### 4. Deploy the Next.js Frontend
Builds the static Next.js production export with Turbopack and syncs the assets to `/var/www/veloce-web`:
```bash
./deploy/web.sh
```

---

## All-in-One Container Deployment (Docker)

To run the full stack in a self-contained environment:

```bash
# Start PostgreSQL, MinIO, and Veloce in the background
docker compose up -d --build
```

The multi-stage `Dockerfile` automatically builds the Next.js static export, embeds it directly into the static Go binary, runs database migrations on startup, and exposes both the web UI and REST API on port `8080`.
