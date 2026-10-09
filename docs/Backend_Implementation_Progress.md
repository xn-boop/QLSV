# QLSV Backend — Kế hoạch và tiến độ triển khai

Cập nhật gần nhất: 09/10/2026 (Asia/Bangkok)

Tài liệu nguồn:

- `docs/QLSV_Backend_Specification.docx` — đặc tả chính, mục 1–40.
- `docs/QLSV_Backend_Advanced_Addendum.md` — bản chữ để truy vết BE-101–BE-112.

Nguyên tắc: triển khai tuần tự; một nhiệm vụ chỉ hoàn thành khi code, database/API/quyền liên quan và kiểm thử phù hợp đều đạt. Các chính sách ở mục 38 của phụ lục vẫn là `CẦN XÁC NHẬN`; code tương lai phải dùng policy có phiên bản hoặc giữ tính năng tắt, không tự biến mặc định đề xuất thành quyết định production.

## Trạng thái tổng quan

| ID  | Nhiệm vụ                                                     | Dependency | Trạng thái  |
| --- | ------------------------------------------------------------ | ---------- | ----------- |
| T01 | Nền tảng NestJS và quality gates                             | Tài liệu   | DONE        |
| T02 | PostgreSQL/Redis, Prisma, migration nền tảng                 | T01        | DONE        |
| T03 | Auth, session, refresh, invitation/reset và RBAC             | T02        | IN PROGRESS |
| T04 | Khoa, ngành, môn, curriculum, policy và semester             | T03        | TODO        |
| T05 | Student, Teacher, Class và membership history                | T04        | TODO        |
| T06 | Offering, phân công, room, schedule và session               | T05        | TODO        |
| T07 | Enrollment, concurrency, idempotency, drop/withdraw/transfer | T06        | TODO        |
| T08 | Gradebook, publish/lock, adjustment, transcript và GPA       | T07        | TODO        |
| T09 | Attendance sheet, roster theo thời điểm và correction        | T07        | TODO        |
| T10 | Outbox/worker, notification, file, import và report jobs     | T03–T09    | TODO        |
| T11 | Search, dashboard, audit query và settings                   | T08–T10    | TODO        |
| T12 | Security hardening, load/recovery, deployment và UAT         | T01–T11    | TODO        |

## T01 — Nền tảng NestJS và quality gates

**Phạm vi**

- Khởi tạo NestJS + TypeScript theo modular monolith, API prefix `/api/v1`.
- Validate environment lúc khởi động; không chấp nhận cấu hình sai.
- Chuẩn hóa success/error envelope, `requestId`, validation pipe và structured logging có redact.
- Tạo `GET /api/v1/health/live` và OpenAPI.
- Thiết lập format, lint, type-check, unit test, API test và build.
- Chưa kết nối PostgreSQL/Redis và chưa tạo entity nghiệp vụ.

**Tiêu chí hoàn thành**

- App khởi động với cấu hình hợp lệ; cấu hình sai làm startup/test thất bại rõ ràng.
- Health endpoint trả success envelope + request ID; request ID hợp lệ từ client được giữ, giá trị không hợp lệ được thay.
- Route không tồn tại trả error envelope thống nhất và không lộ stack trace.
- `format:check`, `lint`, `typecheck`, `test`, `test:e2e`, `build` đều đạt.

**Kiểm thử**

- Unit test validation environment.
- E2E health, request ID và error envelope 404.

## T02 — PostgreSQL/Redis, Prisma và migration nền tảng

**Phạm vi:** Docker Compose PostgreSQL 17/Redis; Prisma; bảng user/role/permission/session/challenge/audit/outbox/idempotency; UUID/version/timestamps; SQL migration cho extension/index đặc thù; database health/readiness.

**Tiêu chí:** database mới migrate/seed được; migration chạy lặp đúng quy trình; unique/FK/check/index nền tảng tồn tại; Redis không là nguồn quyết định dữ liệu.

**Kiểm thử:** migration từ database trống, constraint integration tests trên PostgreSQL thật, readiness khi dependency up/down, lint/type/build.

## T03 — Authentication, session và authorization (BE-101/BE-110)

**Phạm vi:** invitation, login, Argon2id, access JWT 10 phút, refresh rotation/replay, logout, reset/verify, session list/revoke, RBAC + permission + scope primitives, CSRF/Origin/rate limit.

**Tiêu chí:** token thô không lưu/log; thay role/password khóa phiên đúng đặc tả; role Student/Lecturer yêu cầu hồ sơ; Admin cuối được bảo vệ; API/OpenAPI đầy đủ mã lỗi.

**Kiểm thử:** auth lifecycle, concurrent refresh, replay, reset một lần, account states, IDOR/scope, Redis outage fail-closed, T-20.

### Phân rã thực thi T03

| ID    | Lát chức năng                                   | Dependency | Tiêu chí chính                                                                | Kiểm thử bắt buộc                                      | Trạng thái |
| ----- | ----------------------------------------------- | ---------- | ----------------------------------------------------------------------------- | ------------------------------------------------------ | ---------- |
| T03.1 | Password policy và Argon2id                     | T02        | 12–128 Unicode, không trim, chặn common password, cost 64 MiB/3/1, salt riêng | valid/invalid, Unicode, malformed hash, rehash, salt   | DONE       |
| T03.2 | JWT config, ký và xác minh access token         | T03.1      | RS256/EdDSA key tách biệt, iss/aud/exp 10 phút, claim tối thiểu               | key/config lỗi, claim/tamper/expiry/issuer/audience    | DONE       |
| T03.3 | Permission matrix, scope primitives và guard    | T03.2      | quyền lấy từ state hiện hành, role mutation tăng auth_version                 | allow/deny, IDOR, T-20, last Admin, profile invariant  | TODO       |
| T03.4 | Invitation và account provisioning              | T03.3      | token ≥32 byte chỉ lưu hash, một challenge active, transaction + audit/outbox | concurrent invite, resend invalidation, one-time token | TODO       |
| T03.5 | Login, rate limit và tạo session                | T03.4      | lỗi chung, account state, Redis fail-closed, absolute session 7 ngày          | valid/invalid/state/rate limit/Redis outage            | TODO       |
| T03.6 | Refresh rotation và replay detection            | T03.5      | row lock/CAS, một lần, replay revoke session, không lưu raw token             | concurrent refresh, replay, rollback                   | TODO       |
| T03.7 | Logout/reset/verify/password/session management | T03.6      | logout idempotent; reset một lần; security change revoke + audit              | lifecycle, expiry, logout-all, revoke ownership        | TODO       |
| T03.8 | CSRF/Origin/CORS, contract và auth regression   | T03.7      | cookie refresh được bảo vệ; Bearer tách biệt; OpenAPI/error map đầy đủ        | CSRF/origin/CORS, auth E2E, T-18/T-20                  | TODO       |

## T04 — Danh mục học vụ và policy (BE-103)

**Phạm vi:** Department, Major, Subject/prerequisite DAG, Curriculum/revision, Semester transitions, Room catalog, GradeScheme/GradingPolicy revisions.

**Tiêu chí:** không xóa dữ liệu đang tham chiếu; policy active immutable; DAG không chu trình; transition/cutoff/If-Match/audit đúng.

**Kiểm thử:** CRUD quyền/validation, dependency conflicts, concurrent activate/edit, cycle detection, close semester preconditions.

## T05 — Hồ sơ và membership (BE-102)

**Phạm vi:** Student, Teacher, Class, account link, create + first membership atomic, class transfer `[start,end)`, soft disable và field masking.

**Tiêu chí:** Student active có đúng một membership; class/curriculum/major nhất quán; chuyển lớp không đổi enrollment; PII theo role.

**Kiểm thử:** T-01/T-02, GiST exclusion, concurrent import/API create, transfer boundary/backdate, transcript sau disable.

## T06 — Offering, lịch và tài nguyên (BE-104)

**Phạm vi:** CourseOffering, teacher assignment, schedule rules, generated/manual sessions, room/teacher reservations, transitions/cancel.

**Tiêu chí:** precondition mở lớp; không overlap phòng/GV; manual override không bị generate ghi đè; cancellation giữ lịch sử và thông báo qua outbox.

**Kiểm thử:** T-08/T-09, capacity phòng, concurrent reservations, generate retry, đổi lịch conflict Student.

## T07 — Enrollment (BE-105)

**Phạm vi:** enroll/drop/withdraw/re-enroll/section transfer, prerequisite/capacity/credit/schedule, attempt, enrollment events, idempotency, transaction retry có chọn lọc.

**Tiêu chí:** không vượt capacity/credits khi concurrent; retry client không nhân đôi; drop/re-enroll tương thích unique; transfer atomic; audit/outbox cùng transaction.

**Kiểm thử:** T-03–T-07 với barrier và PostgreSQL thật; rollback injection; deadline boundaries; permission/validation/error mapping.

## T08 — Gradebook và kết quả (BE-106)

**Phạm vi:** components/entries, atomic batch, submit/return/publish/lock, course results, grade adjustments, transcript/GPA, grade appeals sau khi policy được xác nhận.

**Tiêu chí:** NULL khác 0; publish toàn lớp atomic; optimistic concurrency; dual control adjustment; Student chỉ thấy published; policy revision giữ lịch sử.

**Kiểm thử:** T-10–T-13, score boundaries, batch rollback, publish fault injection, GPA F/W/retake, appeal scope/window.

## T09 — Attendance (BE-107)

**Phạm vi:** attendance sheets, roster theo hiệu lực enrollment tại session, batch mark, submit/lock/reopen, deadline và correction.

**Tiêu chí:** unmarked không thành absent; late/excused validation; concurrent updates không ghi đè; dashboard có completeness.

**Kiểm thử:** T-14, drop/re-enroll intervals, concurrent sheet version, cancelled session, deadline/reopen audit.

## T10 — Outbox, worker, notification, file, import và report (BE-108)

**Phạm vi:** worker lease/retry/dead-letter, idempotent consumer; recipients/read; upload quarantine/scan/download; import dry-run/atomic commit; export/report job.

**Tiêu chí:** at-least-once không nhân đôi tác động; retry chỉ lỗi tạm; file chưa ready không dùng; scope kiểm tra lại khi download; import không partial âm thầm.

**Kiểm thử:** T-15–T-17, worker crash, 429/5xx/4xx, scan fail, zip bomb limits, dry-run race, timeout retry và quyền bị thu hồi.

## T11 — Query, dashboard, audit và settings (BE-109/BE-110)

**Phạm vi:** search/filter/stable pagination, dashboard definitions, audit query, settings allowlist/version, cache invalidation và report consistency.

**Tiêu chí:** scope áp trước count/aggregate; số liệu có denominator/asOf/policy; audit append-only/redacted; cache không cấp quyền.

**Kiểm thử:** search dấu/không dấu, cursor stability, scope leakage, dashboard fixtures, audit permission/redaction, stale cache.

## T12 — Hardening, recovery và release (BE-111/BE-112)

**Phạm vi:** security review, MFA Admin, load tests, metrics/alerts, backup/restore, migration expand-contract, Docker/CI/staging, runbooks và UAT.

**Tiêu chí:** quality/security gates đạt; p95 và concurrency được đo; restore drill chứng minh RPO/RTO; release/rollback không mất dữ liệu.

**Kiểm thử:** T-18/T-19, full regression, load/lock wait, dependency outage, migration forward/rollback compatibility, Admin/Lecturer/Student UAT.

## Vấn đề/chính sách đang chờ xác nhận

- Bảng quy đổi điểm/ngưỡng đạt; chính sách học lại/cải thiện.
- Drop/withdraw cutoff, giới hạn tín chỉ và cách xử lý absent/exempt.
- Deadline điểm danh 48 giờ và khiếu nại điểm 14 ngày.
- Retention PII/audit/file và giới hạn import atomic sau thử tải.

Các mục này không chặn T01–T03 hoặc thiết kế policy revision; chúng chặn việc bật hành vi tương ứng trong production.

## Nhật ký thực hiện

### T01

- Trạng thái: DONE — 09/10/2026.
- Kết quả: NestJS 11 modular monolith đã khởi động được trên Node.js 24; `/api/v1`, environment validation, Pino structured logging/redaction, request ID, response/error envelope, strict validation pipe, OpenAPI và liveness endpoint đã hoạt động.
- Tệp thay đổi: `package.json`, `package-lock.json`, cấu hình TypeScript/Nest/Jest/ESLint/Prettier/npm/git, `.env.example`, `src/`, `test/` và file tiến độ này.
- Kiểm thử: `npm run check` đạt; formatter, lint, type-check, 5 unit tests, 5 E2E tests và build đều pass. Smoke test chạy `dist/main.js` trên port 3101 và gọi `/api/v1/health/live` nhận HTTP 200 + request ID + success envelope. `npm audit --omit=dev` báo 0 lỗ hổng.
- Lỗi đã xử lý: NestJS 12 yêu cầu TypeScript 6+ không tương thích bộ test đang dùng nên pin dòng NestJS 11 hiện hành; sửa Joi CommonJS import; sửa logger request-scoped trong global filter; sửa Supertest CommonJS import. `@nestjs/swagger` pin `js-yaml@5.3.0` có advisory DoS mức vừa; npm override có phạm vi đã nâng riêng dependency này lên bản vá `5.4.3`, sau đó chạy lại audit và toàn bộ quality gates.
- Tồn đọng: readiness cho PostgreSQL/Redis chưa có đúng phạm vi T01; CORS/CSRF/auth/rate limit thuộc T03; security header production thuộc T12. `X-Powered-By` sẽ được tắt ở nhiệm vụ hardening hoặc trước khi bật môi trường public.
- Nhiệm vụ kế tiếp: T02 — PostgreSQL 17/Redis, Prisma schema nền tảng, migration và constraint integration tests.

### T02

- Trạng thái: DONE — 09/10/2026.
- Kết quả: Docker Compose chạy PostgreSQL 17.6 và Redis 8.2 chỉ trên localhost; Prisma JavaScript query engine kết nối qua adapter PostgreSQL; schema và migration nền tảng tạo 11 model cho user/RBAC/session/challenge/audit/outbox/idempotency. Migrator dùng PostgreSQL advisory lock, checksum SHA-256 và transaction cho từng migration; chạy lặp không áp dụng lại. Seed ba role `ADMIN`, `LECTURER`, `STUDENT` idempotent. `/api/v1/health/ready` chỉ trả ready khi cả PostgreSQL và Redis phản hồi.
- Tệp thay đổi: `compose.yaml`, `.env.example`, `package.json`, `package-lock.json`, `prisma/`, `scripts/`, `src/app.module.ts`, `src/config/`, `src/infrastructure/`, `src/modules/health/`, `test/`, `README.md` và file tiến độ này.
- Kiểm thử: schema validate và Prisma Client generate đạt; migration đã chạy từ database trống, lần hai báo `Applied migrations: none`; seed chạy hai lần vẫn có đúng ba system role. `npm run check` đạt format, lint, type-check, 9 unit tests, 5 E2E tests và build. `npm run check:db` đạt migration/seed và 3 integration tests trên PostgreSQL thật, gồm quan hệ/FK, transaction, unique email và check constraint. Production smoke test gọi readiness nhận HTTP 200 với `database: up`, `redis: up`. Unit test dependency lỗi xác nhận readiness trả 503 fail-closed. `npm audit --omit=dev` báo 4 high từ advisory stack exhaustion của `deepmerge-ts@7.1.5` qua Prisma CLI/config; npm xác nhận chưa có bản vá. Đường gọi này là tooling build-time, không nhận dữ liệu request của API; cần nâng ngay khi Prisma phát hành dependency đã vá.
- Lỗi đã xử lý: binary Prisma từ CDN không tải được trong môi trường cloud; chuyển query runtime sang JavaScript engine chính thức. Prisma WASM migration engine không giải mã được system type `name` của PostgreSQL 17 qua adapter; thay bằng migrator PostgreSQL có lock/checksum/transaction. Sửa client generation để giữ type đầy đủ và sửa fixture role vượt giới hạn 30 ký tự; cleanup test được ghi nhận ngay sau từng insert.
- Tồn đọng: permission matrix, token/session service và Redis fail-closed cho authorization thuộc T03. Chính sách production chưa xác nhận tiếp tục để tắt theo tài liệu; Redis không được dùng làm nguồn dữ liệu quyết định.
- Nhiệm vụ kế tiếp: T03 — triển khai authentication/session theo nhóm nhỏ, bắt đầu từ password hashing, JWT key/config và permission primitives trước khi mở endpoint login.

### T03.1

- Trạng thái: DONE — 09/10/2026.
- Kết quả: thêm `AuthModule` và `PasswordHasherService`; policy đếm Unicode code point, giữ nguyên chuỗi không trim/normalize, giới hạn 12–128, từ chối control character và mật khẩu phổ biến/dễ đoán bằng dictionary offline. Hash dùng Argon2id 64 MiB, 3 iterations, parallelism 1, hash 32 byte và salt do thư viện sinh; verify malformed hash trả `false`, có `needsRehash` để nâng cost sau này.
- Tệp thay đổi: `package.json`, `package-lock.json`, `src/app.module.ts`, `src/modules/auth/` và file tiến độ này.
- Kiểm thử: unit test xác nhận tham số encoded hash, salt riêng, đúng/sai password, không trim, Unicode boundary, mọi nhánh policy, malformed hash và rehash. Benchmark cục bộ Argon2id đạt khoảng 156 ms/hash, nằm trong mục tiêu 100–300 ms của đặc tả. `npm run check` đạt formatter, lint, type-check, 17 unit tests, 5 E2E tests và build; `npm run check:db` đạt 3 integration tests. Audit vẫn chỉ còn advisory Prisma tooling đã ghi ở T02.
- Lỗi đã xử lý: test ban đầu giả định thứ tự tham số encoded `m,t,p` trong khi thư viện xuất `m,p,t`; assertion được đổi sang kiểm tra tập tham số. Chuỗi lặp của common password được zxcvbn phân loại `repeat`, nên policy dùng score 0–1 để bao phủ cả dictionary và biến thể lặp/tuần tự dễ đoán.
- Tồn đọng: chưa tạo JWT, endpoint hoặc thay đổi session/database; các phần này nằm ở T03.2–T03.8.
- Nhiệm vụ kế tiếp: T03.2 — cấu hình khóa bất đối xứng và service ký/xác minh access JWT 10 phút với claim tối thiểu.

### T03.2

- Trạng thái: DONE — 09/10/2026.
- Kết quả: thêm `AccessTokenService` dùng JWT RS256 với cặp RSA ≥2048 bit; service ký access token 10 phút và chỉ đưa các claim bắt buộc `sub`, `sid`, `authVersion`, `iss`, `aud`, `iat`, `exp`, `jti`. Config bắt buộc private/public key, issuer và audience; khóa được parse lúc khởi động, kiểm tra type/modulus và chứng minh public/private khớp trước khi phục vụ request. Đặc tả không chốt thuật toán cụ thể; chọn RS256 vì tương thích rộng với validator và client trong khi vẫn dùng cặp khóa tách biệt.
- Tệp thay đổi: `.env.example`, `README.md`, `package.json`, `package-lock.json`, `test/jest-setup.ts`, `test/jwt-fixtures.ts`, `src/config/`, `src/modules/auth/` và file tiến độ này.
- Kiểm thử: xác nhận claim/TTL, chữ ký RS256, token bị tamper, expired, sai issuer và sai algorithm đều bị từ chối; test PEM escaped newline, private key sai và public/private không khớp. `npm run check` đạt formatter, lint, type-check, 25 unit tests, 5 E2E tests và build; `npm run check:db` đạt migration/seed và 3 integration tests PostgreSQL.
- Lỗi đã xử lý: type của custom JWT claim từ thư viện là `unknown`; service kiểm tra runtime trước khi chuyển thành `authVersion` để không tin dữ liệu token chưa xác thực. Audit vẫn chỉ báo advisory Prisma tooling không có bản vá đã ghi ở T02, không có advisory mới từ JWT dependency.
- Tồn đọng: service token chưa xác minh session/account/RBAC theo trạng thái hiện hành; đây là điều kiện bắt buộc của T03.3 và các endpoint login/refresh chưa được mở.
- Nhiệm vụ kế tiếp: T03.3 — permission matrix, principal lấy từ PostgreSQL và guard/scope để JWT còn hạn không vượt qua việc thu hồi role (T-20).
