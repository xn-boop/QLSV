# QLSV Backend

Backend quản lý sinh viên theo kiến trúc NestJS modular monolith và đặc tả trong `docs/`.

## Yêu cầu hiện tại

- Node.js 24 LTS
- npm 11

- Docker Compose (PostgreSQL 17 và Redis 8)

## Khởi động

```bash
cp .env.example .env
npm ci
docker compose up -d
npm run db:migrate
npm run db:seed
npm run start:dev
```

- Liveness: `GET http://localhost:3000/api/v1/health/live`
- Readiness PostgreSQL/Redis: `GET http://localhost:3000/api/v1/health/ready`
- OpenAPI UI: `http://localhost:3000/api/v1/docs`
- OpenAPI JSON: `http://localhost:3000/api/v1/openapi.json`

Không commit `.env` hoặc secret. Mọi biến môi trường được kiểm tra khi ứng dụng khởi động.

## Kiểm tra chất lượng

```bash
npm run check
npm run check:db
npm audit --omit=dev
```

`npm run check` chạy tuần tự format check, lint, type-check, unit tests, E2E tests và production build. `npm run check:db` áp dụng migration có advisory lock/checksum, seed idempotent và chạy integration tests trên PostgreSQL thật. Redis/PostgreSQL chỉ bind vào localhost trong cấu hình phát triển. Tiến độ, tiêu chí hoàn thành và nhiệm vụ tiếp theo nằm tại `docs/Backend_Implementation_Progress.md`.
