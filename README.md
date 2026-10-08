# QLSV Backend

Backend quản lý sinh viên theo kiến trúc NestJS modular monolith và đặc tả trong `docs/`.

## Yêu cầu hiện tại

- Node.js 24 LTS
- npm 11

PostgreSQL và Redis sẽ được bổ sung trong nhiệm vụ T02. Nhiệm vụ T01 chỉ cần Node.js.

## Khởi động

```bash
cp .env.example .env
npm ci
npm run start:dev
```

- Liveness: `GET http://localhost:3000/api/v1/health/live`
- OpenAPI UI: `http://localhost:3000/api/v1/docs`
- OpenAPI JSON: `http://localhost:3000/api/v1/openapi.json`

Không commit `.env` hoặc secret. Mọi biến môi trường được kiểm tra khi ứng dụng khởi động.

## Kiểm tra chất lượng

```bash
npm run check
npm audit --omit=dev
```

`npm run check` chạy tuần tự format check, lint, type-check, unit tests, E2E tests và production build. Tiến độ, tiêu chí hoàn thành và nhiệm vụ tiếp theo nằm tại `docs/Backend_Implementation_Progress.md`.
