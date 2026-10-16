# Stage 1: Build the frontend static export
FROM node:20-alpine AS web-builder
WORKDIR /app/veloce-web

RUN corepack enable

COPY veloce-web/package.json veloce-web/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY veloce-web ./
ENV OUTPUT=export
ENV NEXT_PUBLIC_API_URL=""
RUN pnpm run build

# Stage 2: Build the Go service with embedded frontend
FROM golang:1.24-alpine AS service-builder
WORKDIR /app

RUN apk add --no-cache ca-certificates git build-base

COPY go.work go.work.sum* ./
COPY veloce-service/go.mod veloce-service/go.sum* ./veloce-service/
COPY veloce-web/go.mod veloce-web/go.sum* ./veloce-web/

COPY veloce-service ./veloce-service
COPY veloce-web/*.go ./veloce-web/
COPY --from=web-builder /app/veloce-web/out ./veloce-web/out

WORKDIR /app/veloce-service
RUN CGO_ENABLED=0 GOOS=linux go build -tags "embedweb" -ldflags="-s -w" -o /app/bin/veloce .

# Stage 3: Minimal production runtime
FROM alpine:3.20 AS runner
WORKDIR /app

RUN apk add --no-cache ca-certificates tzdata

COPY --from=service-builder /app/bin/veloce /app/veloce

EXPOSE 8080

ENV PORT=8080

CMD ["sh", "-c", "/app/veloce database migrate up && /app/veloce server"]
