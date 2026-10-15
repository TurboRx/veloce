# ⚡ Veloce

The high-velocity, no-code Discord bot builder SaaS. Build commands, event listeners, and interactive messages visually, powered by a high-throughput Go execution engine and Next.js flow canvas.

---

## Architecture

- **`veloce-service`**: High-performance Go backend hosting the multi-tenant Discord gateway connections, flow execution engine, and REST API.
- **`veloce-web`**: Modern Next.js frontend with visual drag-and-drop workflow canvas built on React Flow (`@xyflow/react`), Radix UI, and Tailwind CSS.

---

## Quick Start (Local Development)

### 1. Prerequisites
- Go 1.25+
- Node.js 20+ & pnpm
- Docker & Docker Compose

### 2. Start Infrastructure
Start PostgreSQL and MinIO:
```bash
docker compose up -d
```

### 3. Configure Service
Copy the configuration template:
```bash
cp veloce.example.toml veloce.toml
```

### 4. Run Backend
```bash
cd veloce-service
go run main.go server
```

### 5. Run Frontend
```bash
cd veloce-web
pnpm install
pnpm dev
```

---

## License

GNU Affero General Public License v3.0 ([AGPL-3.0](LICENSE)).
