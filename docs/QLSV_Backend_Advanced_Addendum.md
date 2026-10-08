# PHỤ LỤC BACKEND CHUYÊN SÂU — QLSV

Phiên bản phụ lục: 1.0 · Áp dụng cho bản `QLSV_Backend_Specification.docx` hiện có.

**Cách đọc:** Phần 1–23 của brief gốc vẫn là nền tảng. Phụ lục này bổ sung quy tắc triển khai và chốt những chỗ brief chưa xác định đủ để hai developer không hiểu khác nhau. Các mục ghi “cần xác nhận” là chính sách của trường, không được tự coi là quyết định đã phê duyệt. Không thay đổi kiến trúc NestJS + PostgreSQL, modular monolith, Prisma, Redis, outbox/worker và private object storage. Không triển khai frontend trong phụ lục; hợp đồng API vẫn bảo đảm frontend có thể tích hợp sau này.

## 24. Cách áp dụng, ưu tiên và định nghĩa chung

### 24.1. Quy tắc ưu tiên

1. Ràng buộc bảo mật, tính toàn vẹn và quyền dữ liệu trong phụ lục này làm rõ phần 1–23; các chức năng đã có vẫn giữ nguyên.
2. Quyết định nghiệp vụ chưa được trường xác nhận được cấu hình thành policy có phiên bản hoặc khóa tính năng; không hardcode một quy tắc có thể thay đổi.
3. Mọi trạng thái trong database là mã ổn định; API trả `code`, `message` và `requestId`, không để frontend suy luận trạng thái từ chuỗi tiếng Việt.
4. Timestamp lưu UTC, học kỳ và lịch hiển thị theo `Asia/Ho_Chi_Minh`. Mốc đăng ký được so sánh tại database với một thời điểm UTC duy nhất lấy ở đầu transaction.
5. “Hoàn thành” một tác vụ ghi nghĩa là dữ liệu nghiệp vụ, audit và outbox đã commit cùng nhau. Email, scan và export có thể hoàn thành sau, qua job theo dõi được.

### 24.2. Mã yêu cầu

Mã `QLSV-BE-xxx` liên kết nghiệp vụ, bảng dữ liệu, API và test. Các mã trong bảng truy vết ở mục 37 là tiêu chí nghiệm thu, không phải tên class trong code.

### 24.3. Quyền tối thiểu và phạm vi dữ liệu

- Quyền được kiểm tra sau xác thực và trước truy vấn. Service vẫn kiểm tra quyền/phạm vi trong transaction ngay trước ghi, vì phân công hoặc trạng thái tài khoản có thể đổi sau khi request bắt đầu.
- Với `GET` ngoài phạm vi dùng 404 khi không nên tiết lộ ID tồn tại; với hành động đã xác định tài nguyên nhưng thiếu permission dùng 403. Không để thời gian đáp ứng hay tổng đếm làm rò dữ liệu ngoài phạm vi.
- Truy vấn danh sách, tổng số, export, file download, job status và audit đều phải áp cùng scope. Không chỉ kiểm tra scope ở controller rồi cho repository truy vấn toàn bảng.
- Một Student chỉ tác động hồ sơ của chính tài khoản; các tham số `studentId` do client gửi không thể mở rộng scope. Một Lecturer chỉ tác động offering đang được phân công và đúng cờ `canGrade`/`canAttend`.
- Admin được xem toàn trường theo permission, nhưng điều chỉnh điểm sau công bố cần permission riêng, người duyệt khác người đề xuất và lý do.

## 25. Tài khoản, phiên và phục hồi quyền truy cập — QLSV-BE-101

**Luồng:** Admin tạo hồ sơ → mời tài khoản → xác minh email/đặt mật khẩu → đăng nhập → refresh/logout/reset.

1. Tạo account chỉ khi email đã chuẩn hóa chưa thuộc account khác và liên kết Student/Teacher chưa có account. Gán role Student/Lecturer chỉ khi hồ sơ đúng loại và đang hợp lệ. Kiểm tra invariant này trong transaction; unique constraint trên `users.email`, `students.user_id`, `teachers.user_id` chặn hai lời mời đồng thời.
2. Tạo user, user_roles, auth_challenge, audit và outbox email cùng transaction. Việc gửi email không nằm trong transaction. Nếu email fail, invitation vẫn tồn tại và Admin có thể gửi lại theo rate limit; job ghi trạng thái lỗi, không tạo account thứ hai.
3. Chỉ một lời mời chưa dùng còn hiệu lực cho một user/purpose. Gửi lại sẽ thu hồi challenge cũ trước khi tạo challenge mới. Tất cả token xác minh/reset/invite là byte ngẫu nhiên ≥32 byte; chỉ hash trong DB; chỉ gửi raw token qua kênh dự kiến.
4. Login trả lỗi chung khi account/mật khẩu sai. Account khóa/disable không được cấp session. Thay password, role, email đăng nhập hoặc trạng thái account phải tăng `auth_version`, thu hồi mọi session liên quan và ghi audit. Backend không chỉ tin claim quyền bên trong JWT 10 phút: mỗi request phải xác nhận `sid`, `auth_version` và account active bằng nguồn dữ liệu hiện hành hoặc cache có invalidation chắc chắn.
5. Refresh rotation dùng row lock/compare-and-swap trong transaction. Token cũ chỉ được tiêu thụ một lần; replay thu hồi session và ghi security event. Xử lý hai refresh gần đồng thời theo chính sách cố định: request thứ hai bị từ chối và buộc đăng nhập lại nếu không thể phân biệt tab hợp lệ với replay; frontend cần single-flight. Không phát lại raw refresh token từ DB.
6. `POST /auth/logout` idempotent: dù token/cookie cũ đã hết, xóa cookie và trả 204; nếu token còn hợp lệ thì thu hồi session. Reset mật khẩu thu hồi mọi session. `GET /me/sessions` không lộ token, IP gốc hoặc raw user-agent vượt nhu cầu hiển thị.
7. Rate limit account+IP ở Redis dùng TTL và giới hạn phân tán, nhưng PostgreSQL vẫn quyết định session/token. Redis mất kết nối không được làm bỏ qua bảo vệ login: auth endpoint trả 503 hoặc dùng fallback bảo thủ có giới hạn, được đo/ghi log.

**API/DB:** Giữ các endpoint `/auth/*`, `/users`, `/me/sessions`. Cần unique index case-insensitive cho `users.email` (ví dụ normalized column), index `(user_id,purpose,used_at,expires_at)` cho challenges; `auth_sessions` có `revoked_reason` optional để hỗ trợ điều tra. Không lưu token thô trong audit/outbox/log.

**Test:** hai lời mời song song chỉ tạo một liên kết; gửi lại vô hiệu link cũ; reset thu hồi mọi phiên; token cũ replay; role bị thu hồi có hiệu lực trên request kế tiếp; Redis lỗi không mở cửa login.

## 26. Hồ sơ, lớp và lịch sử học tập — QLSV-BE-102

**Luồng:** tạo Student/Teacher → gán lớp/ngành/chương trình → chuyển lớp/đổi trạng thái → bảo tồn lịch sử.

1. Tạo Student cùng membership đầu tiên trong một transaction. Xác nhận `class.major_id = student.major_id` và `curriculum.major_id = student.major_id`; khóa class/curriculum nếu chúng có thể chuyển inactive đồng thời. Không để Student active mà chưa có membership, trừ trạng thái hồ sơ nháp nếu được bổ sung chính thức.
2. Chuyển lớp dùng transaction: khóa Student, đóng membership cũ tại `effectiveOn`, tạo membership mới bắt đầu đúng ngày đó. Dùng khoảng `[starts_on, ends_on)`. Kiểm tra lớp mới active/cùng ngành; không có khoảng chồng; không backdate qua một kỳ đã khóa nếu điều đó thay đổi số liệu lịch sử. Yêu cầu `reason`, `If-Match` Student và audit trước/sau.
3. Chuyển lớp không tự chuyển các Enrollment đang học: lớp hành chính khác lớp học phần. Nếu trường muốn chuyển ngành/chương trình, phải có workflow riêng xác định tín chỉ được công nhận, môn thay thế và học phí liên quan; phiên bản này không cho `PATCH majorId/curriculumId` khi có lịch sử.
4. Soft delete/disable không xóa Enrollment, Grade, Attendance, File hay Audit. API danh sách mặc định ẩn đối tượng đã ngừng, nhưng Admin có filter `status`; khóa đăng nhập account có liên kết nếu hồ sơ không còn được phép sử dụng.
5. Import hồ sơ phải gọi đúng cùng service validation/invariant như tạo đơn lẻ; không có đường nhập tắt bỏ qua quyền, unique hoặc audit. `student_code` và `teacher_code` không được tái sử dụng sau soft delete.

**DB:** Exclusion constraint `student_class_memberships` dùng GiST trên `student_id` và `daterange(starts_on, coalesce(ends_on, 'infinity'), '[)')`; cần PostgreSQL `btree_gist`. Ràng buộc active Student có một membership tại thời điểm hiện tại là quy tắc service + kiểm thử transaction, vì CHECK/FK đơn giản không biểu diễn được. Việc cài extension và constraint nằm trong SQL migration được review cùng Prisma migration.

**API:** Giữ CRUD hồ sơ và `/students/{id}/class-transfers`; thêm `GET /students/{id}/class-history` đã có trong brief. Transfer request `effectiveOn` là ngày học vụ, không tự diễn giải theo timezone trình duyệt. Trả 409 `CLASS_MEMBERSHIP_CONFLICT`, 422 `CLASS_MAJOR_MISMATCH` khi phù hợp.

**Test:** hai transfer cùng lúc; chuyển vào đúng ngày kết thúc lớp cũ; transfer lùi ngày; soft delete vẫn đọc được transcript theo quyền; import và POST riêng cho cùng mã cùng lúc.

## 27. Danh mục học vụ, policy và kỳ học — QLSV-BE-103

1. Department/Major/Class/Subject/Curriculum đang được tham chiếu không bị xóa vật lý. Đổi tên hiển thị được audit; đổi mã nghiệp vụ bị cấm hoặc phải có alias và migration dữ liệu riêng. Các API danh mục không được tự thay `department_id`/`major_id` khi điều đó làm sai lịch sử.
2. Cấu trúc Curriculum/Subject prerequisites phải tạo đồ thị có hướng không chu trình. Dùng transaction khóa curriculum/subject bị sửa, validate lại toàn đồ thị liên quan trước activate. Không chỉ kiểm tra `subject_id != prerequisite_subject_id`.
3. Grade scheme và grading policy đã active/đã gắn offering là immutable; chỉnh sửa bằng revision mới. Tại lúc tạo offering, tham chiếu một revision cụ thể; khi publish course result, lưu policy ID và các giá trị snapshot đã tính. Tương tự credits_snapshot đã có trong brief.
4. Học kỳ chỉ đi `draft → registration → teaching → closed`. Mọi chuyển trạng thái cần permission, `If-Match`, audit, precondition. Không đóng kỳ khi còn offering chưa kết thúc, gradebook chưa công bố hoặc job học vụ bắt buộc đang chạy, trừ override có permission riêng + lý do + báo cáo tác động. Không cho “mở lại” kỳ bằng sửa status trực tiếp.
5. Registration window dùng khoảng `[opens_at, closes_at)`; add/drop window dùng mốc riêng. Tại đúng `closes_at` không còn đăng ký thường. Nếu Admin đổi mốc đang có hiệu lực, thông báo đối tượng bị ảnh hưởng và audit. Không đặt registration close sau ngày bắt đầu kỳ nếu policy trường không cho phép; đây là policy cần xác nhận.

**DB/API:** Giữ `semesters`, `curricula`, `grade_schemes`, `grading_policies` và transitions. Bổ sung `activated_at`, `retired_at` optional cho các policy/version, `source_revision_id` optional khi sao chép revision. DB cấm update nội dung revision active qua quyền ứng dụng/service; test migration và trigger chỉ khi service không đủ bảo đảm.

**Test:** concurrent activate và sửa prerequisites; opening thiếu scheme; publish giữ policy cũ sau khi policy mới active; đóng kỳ khi còn bảng điểm nháp bị chặn.

## 28. Mở lớp, lịch học và tài nguyên — QLSV-BE-104

**Luồng:** Admin tạo offering draft → gán lead/assistant + phòng/lịch → generate sessions → mở đăng ký → đổi/hủy lịch → hoàn tất.

1. `open` cần semester cho phép đăng ký, subject/curriculum hợp lệ, lead Lecturer active, scheme/policy active và tổng trọng số chuẩn, capacity > 0, schedule có ít nhất một buổi hợp lệ. Thực hiện kiểm tra và transition trong một transaction; `If-Match` bảo vệ sửa đồng thời.
2. Giới hạn phòng: `room.capacity >= offering.capacity`, không chỉ so số đã đăng ký. Nếu phòng đổi sau khi có sinh viên, kiểm tra capacity và overlap. Phòng/GV không được xếp hai buổi chồng nhau. Session lưu giờ UTC, rule giữ timezone học vụ để sinh lịch; generate chỉ trong khoảng kỳ và rule.
3. Sinh buổi dùng unique `(offering_id, starts_at)` và idempotency theo rule/date. Khi retry, phân biệt “đã tạo chính buổi này” với “một buổi xung đột khác”; không bỏ qua xung đột khác. Buổi đổi thủ công được đánh dấu override để lần generate sau không sửa hoặc tạo lại ngoài ý muốn.
4. Đổi lịch tương lai phải khóa offering/session, tái kiểm tra trùng phòng/GV và tất cả SV đã đăng ký. Nếu có conflict, trả danh sách rút gọn để Admin quyết định lịch khác. Buổi đã điểm danh/đã qua không sửa giờ/phòng trực tiếp; lập buổi bù mới hoặc quy trình correction có lý do. Hủy buổi đã có attendance cần correction riêng; không xóa attendance.
5. `session_teachers` cần exclusion constraint trên `teacher_id` + `tstzrange(starts_at, ends_at, '[)')` cho session không hủy. Vì trạng thái nằm ở `class_sessions`, không thể dùng partial index đơn giản qua JOIN: chọn một trong hai thiết kế được kiểm thử: đồng bộ `active` vào `session_teachers` bằng transaction/trigger, hoặc bảng reservations độc lập có trạng thái. Không tuyên bố constraint đã có khi migration chưa tạo được.
6. Room exclusion dùng `tstzrange` + `btree_gist` trên reservation rows; không dựa vào query trước insert. Hai request đặt cùng phòng vào cùng giờ phải có một request thất bại có kiểm soát (409 `ROOM_CONFLICT`). Khóa Student khi đổi lịch để tránh race với đăng ký đồng thời theo thứ tự khóa thống nhất.
7. Hủy offering có Enrollment: chặn API DELETE; dùng transition `cancelled` có lý do, xác định hoàn tác đăng ký và thông báo. Nếu đã có grade/attendance, yêu cầu Admin theo workflow riêng; không âm thầm xóa.

**API/DB:** Giữ `/offerings`, `/schedule-rules`, `/sessions`, `/rooms`. Bổ sung `class_sessions.is_manual_override BOOLEAN NN DEFAULT false`, `class_sessions.cancelled_at TIMESTAMPTZ NULL`, `class_sessions.cancel_reason TEXT NULL` khi triển khai migration. `POST /sessions/{id}/cancel` ghi audit và outbox thông báo trong cùng transaction.

**Test:** hai phòng/GV conflict concurrent; rule generate hai lần; sửa rule không ghi đè override; đổi lịch tạo conflict SV; hủy buổi không làm mất attendance; phòng capacity thấp bị chặn.

## 29. Đăng ký, hủy, rút và chuyển nhóm — QLSV-BE-105

**Luồng:** Student chọn offering → backend kiểm tra → giữ transaction đến commit → trả enrollment và sự kiện; drop/withdraw/section transfer theo mốc học vụ.

1. Kiểm tra Student active, account active, semester registration, offering open, capacity, môn trong curriculum/ngoại lệ Admin, prerequisites, số tín chỉ, lịch, môn đã đạt/học cải thiện policy. Tất cả kiểm tra đọc trong transaction sau khi khóa `students` rồi `course_offerings` theo ID; query dùng trạng thái mới nhất, không dùng cache dashboard.
2. `POST /enrollments` bắt buộc Idempotency-Key. Lưu hash payload + scope user/route; cùng key+cùng payload trả nguyên kết quả đầu tiên, cùng key+payload khác trả 409 `IDEMPOTENCY_KEY_REUSED`. TTL đề xuất 24 giờ, cần giữ ít nhất qua khoảng retry của client. Record idempotency và enrollment/audit/outbox commit cùng transaction.
3. Sĩ số tính từ enrollment `enrolled` còn hiệu lực. Không dùng counter cache làm nguồn quyết định. Khóa offering ngăn hai request tranh chỗ cuối. Tín chỉ kiểm tra tổng `credits_snapshot` enrolled trong semester khi đã khóa Student. Thứ tự khóa cố định tránh deadlock; deadlock/serialization failure có thể retry toàn transaction tối đa 3 lần với jitter, nhưng không retry lỗi 409/422.
4. Trùng môn cùng học kỳ: chỉ một enrollment `enrolled` hoặc `completed` theo subject/semester. Lượt `withdrawn` giữ lịch sử và không được đăng ký lại kỳ đó trừ workflow override đã xác nhận. `dropped` trước hạn cho phép đăng ký lại. **Cùng offering đã dropped:** unique `(student_id, offering_id)` của brief không cho INSERT mới; service phải tái kích hoạt chính row cũ trong transaction và ghi `enrollment_events` append-only. Không tạo row thứ hai hoặc bỏ constraint. Nếu chính sách trường cần nhiều vòng drop/re-enroll độc lập, phải chuyển sang attempt/registration ID mới bằng migration riêng.
5. Drop đúng hạn `[registration_open, add_drop_closes_at)`; tại cutoff không được drop thường. Khi drop, ghi `ended_at`, event và outbox; grade/attendance chưa có. Nếu đã có học tập phát sinh, chuyển sang withdrawal theo policy và giữ kết quả W. Admin can thiệp yêu cầu permission riêng + reason.
6. Section transfer chỉ cùng subject và semester. Khóa Student, source offering, target offering theo ID tăng dần; kiểm tra target còn chỗ/lịch/điều kiện, source đủ điều kiện chuyển. Nếu đã có attendance/grade, từ chối tự động và yêu cầu quy trình Admin quyết định dữ liệu nào chuyển. Drop source + activate/create target cùng transaction; một bên fail thì rollback toàn bộ.
7. `attempt_number` tính từ các lượt học có ý nghĩa (withdrawn/completed) theo policy, không tăng vì một lần drop trước hạn; có unique/index và row lock để không cấp cùng attempt khi concurrent. Điều kiện học lại và chọn kết quả GPA lấy từ grading policy revision gắn offering.
8. Sau commit tạo outbox event cho notification; email thất bại không rollback enrollment. Chỉ trả thành công khi transaction commit. Nếu client mất response, retry với cùng Idempotency-Key cho cùng kết quả.

**DB/API:** Thêm `enrollment_events(id, enrollment_id, event_type, actor_user_id, reason, occurred_at, before_status, after_status, request_id)` append-only. Giữ `enrollments` và endpoint cũ. `enrollments.ended_at` phải reset `NULL` khi tái kích hoạt row dropped; event giữ đầy đủ lịch sử. Composite FK `(offering_id, subject_id, semester_id)` và partial unique được tạo trong SQL migration có test thực tế. Nếu withdrawn bị loại khỏi partial unique, service vẫn chặn tái đăng ký theo policy.

**Lỗi:** 409 `OFFERING_FULL`, `DUPLICATE_ENROLLMENT`, `SCHEDULE_CONFLICT`, `IDEMPOTENCY_KEY_REUSED`; 422 `PREREQUISITE_NOT_MET`, `CREDIT_LIMIT_EXCEEDED`, `ENROLLMENT_WINDOW_CLOSED`, `WITHDRAWAL_REQUIRED`; 412 `VERSION_CONFLICT`.

**Test:** hai người tranh chỗ cuối; một người đăng ký hai môn vượt tín chỉ cùng lúc; hai nhóm cùng môn; retry sau timeout; drop/re-enroll cùng offering; transfer concurrent với người giành chỗ; withdrawn không bị lách; transaction fail không để row/audit/outbox nửa vời.

## 30. Điểm, công bố, GPA và khiếu nại — QLSV-BE-106

**Luồng:** chọn revision scheme/policy → nhập điểm nháp → gửi → Admin trả lại/công bố/khóa → Student xem → điều chỉnh sau công bố có phê duyệt.

1. Scheme có tổng weight đúng 100. `score = NULL` nghĩa là chưa nhập, không phải 0; `absent` xử lý theo policy, `exempt` chỉ hợp lệ khi có policy rõ. Batch cập nhật tối đa 500 item, atomic. Mỗi item phải thuộc Enrollment active/completed của offering và component thuộc scheme offering.
2. `PUT /offerings/{id}/gradebook/entries` yêu cầu `If-Match` gradebook. Cùng transaction khóa gradebook, xác nhận status draft, ghi/upsert entries, tăng gradebook.version một lần, audit old/new cho từng thay đổi cần điều tra. Hai Lecturer sửa từ cùng version: một request thành công, request kia 412; không last-write-wins. Ghi nhớ actor và thời điểm.
3. Submit kiểm tra mọi Enrollment đủ điều kiện có đúng tập component bắt buộc và score/status hợp lệ. Nếu lớp có enrollment mới sau submit, cần trả gradebook về draft theo workflow có audit trước khi nhập. Publish khóa gradebook, tính toàn bộ course_results từ cùng snapshot entries/policy, ghi `published_at`, chuyển trạng thái, audit/outbox trong một transaction. Lỗi một SV rollback cả lớp; không để lớp có một phần kết quả công bố.
4. Student chỉ xem `course_results` đã published/locked. Lecturer nhìn entry của offering phân công; Lecturer mất phân công thì request tiếp theo mất quyền, dù đã mở trang trước. `GET /grades` và dashboard không suy từ grade_entries nháp.
5. Adjustment sau publish: lưu `before_data` và `proposed_data`, requester + reason; approver khác requester; phiên bản kết quả tại lúc đề xuất. Approve yêu cầu If-Match và kiểm tra result.version chưa đổi, tính lại final score/letter/grade point từ policy ID của kết quả, tăng version, ghi adjustment/audit/outbox cùng transaction. Nếu đã có adjustment khác làm result đổi, trả 409 `GRADE_ADJUSTMENT_STALE` và yêu cầu đề xuất lại. Lock không cấm workflow điều chỉnh được phê duyệt, nhưng cấm sửa trực tiếp.
6. GPA dùng `credits_snapshot` và grade point của result được công bố; mỗi subject có đúng một lượt được chọn theo retake_strategy của policy đã xác nhận. `withdrawn/incomplete` không vào mẫu số; F có vào GPA. Nếu chính sách đổi, báo cáo lịch sử giữ policy revision; việc tái tính lịch sử cần job có quyền riêng, dry run, snapshot/audit và quyết định trường.
7. Đề xuất nghiệp vụ cần thiết: **khiếu nại điểm** của Student trong 14 ngày sau publish (mốc cần trường xác nhận). Student gửi lý do/tài liệu; Lecturer phản hồi; Admin giải quyết. Khiếu nại không tự sửa điểm, không mở khóa gradebook; nếu chấp nhận thì tạo grade_adjustment hiện có. Mỗi result chỉ một appeal đang open; timeout/close có lý do và notification. Nếu trường chưa chốt thời hạn, không kích hoạt API gửi khiếu nại trong production.

**DB/API mới:** `grade_appeals(id UUID PK, result_id FK, student_id FK, reason TEXT, status open/under_review/accepted/rejected/closed, created_at, resolved_at, resolved_by FK, resolution_note TEXT, version INTEGER, supporting_file_id FK NULL)`. Unique partial `(result_id)` khi status open/under_review. `POST /grades/{id}/appeals` (Student sở hữu, 201); `GET /grade-appeals` (Student cá nhân, Lecturer liên quan, Admin, 200 list); `POST /grade-appeals/{id}/respond` (Lecturer phân công, 200); `POST /grade-appeals/{id}/resolve` (Admin, 200, If-Match). Lỗi 409 `APPEAL_ALREADY_OPEN`, 422 `APPEAL_WINDOW_CLOSED`, 403 ngoài scope. Các endpoint này là mở rộng, không thay thế `/grades`/`/grade-adjustments` hiện có.

**Test:** 0 khác NULL; weight biên; nhập concurrent; batch một lỗi rollback; publish lỗi giữa chừng rollback toàn bộ; Student không thấy nháp; hai adjustment cạnh tranh; approver tự duyệt bị chặn; GPA F/W/retake; Student B không gửi appeal cho result A.

## 31. Điểm danh và lịch sử buổi học — QLSV-BE-107

1. Roster của một session lấy các Enrollment `enrolled/completed` có hiệu lực tại `session.starts_at`. Không xét chỉ trạng thái hiện tại của Student hoặc lớp hành chính; sinh viên mới đăng ký sau buổi không được thêm vào lịch sử. Nếu dữ liệu Enrollment hiện tại không đủ để xác định hiệu lực khi drop/re-enroll, dùng `enrollment_events` để tái dựng interval hiệu lực.
2. Chưa có `attendance_records` = `unmarked`, không tự tính absent. Batch PUT atomic, chỉ Lecturer `canAttend` ở buổi được phân công hoặc Admin. Buổi cancelled/không trong khoảng cho phép bị chặn. `lateMinutes` chỉ với late và phải trong thời lượng buổi; `excused` cần note/lý do.
3. 48 giờ sửa bởi Lecturer tính từ `session.ends_at`; sau đó Admin permission riêng + reason. Chỉnh record sau deadline tạo audit old/new. Không sửa trực tiếp session quá khứ để “hợp thức hóa” điểm danh.
4. Attendance denominator chỉ các buổi đã diễn ra, không cancelled, có marking hoàn tất. Nếu lớp chưa điểm danh đủ, dashboard trả `unmarkedCount` và `dataCompleteness`, không diễn giải tỷ lệ vắng/đạt là kết quả cuối.
5. API batch cần `If-Match` của session hoặc attendance sheet version. Nếu sử dụng session.version, mọi ghi attendance tăng session.version trong cùng transaction; hai người nhập đồng thời không âm thầm ghi đè.

**DB/API:** Thêm `attendance_sheets(session_id UUID PK FK, status draft/submitted/locked, version INTEGER, submitted_at TIMESTAMPTZ NULL)` sẽ rõ hơn dùng session.version; dùng version sheet trong `GET/PUT /sessions/{id}/attendance`. Không xóa `attendance_records`; đây là bảng điều phối trạng thái cho dữ liệu đã có. `POST /sessions/{id}/attendance/submit` (Lecturer canAttend, If-Match, 200); `POST /sessions/{id}/attendance/reopen` (Admin + reason, If-Match, 200). Trước khi triển khai, chọn một cách version duy nhất trong OpenAPI và migration; đề xuất chọn `attendance_sheets`.

**Test:** đăng ký sau buổi; dropped rồi đăng ký lại; concurrent mark; lateMinutes lớn hơn thời lượng; unmarked không thành absent; buổi cancelled không nhận điểm danh; reopen audit.

## 32. Thông báo, file, import và background jobs — QLSV-BE-108

### 32.1. Outbox và retry

1. API ghi dữ liệu + audit + outbox event trong cùng DB transaction. Outbox worker claim batch bằng `FOR UPDATE SKIP LOCKED` hoặc queue tương đương; lưu `attempts`, `next_attempt_at`, `processed_at`, `last_error_code` (không chứa secret). Có lease/heartbeat cho job dài; worker chết thì lease hết hạn và job được nhận lại.
2. Delivery at-least-once: consumer phải idempotent theo event ID. Notification recipient có PK `(notification_id,user_id)`; email provider nếu hỗ trợ dùng idempotency key. Không hứa exactly-once email khi provider không hỗ trợ; gửi trùng hiếm gặp phải được quan sát và giới hạn.
3. Retry chỉ lỗi tạm (timeout/429/5xx) với exponential backoff + jitter, giới hạn số lần và thời gian. Validation/permission/404 vĩnh viễn không retry. Hết retry chuyển trạng thái failed/dead-letter để Admin xử lý, không bỏ event âm thầm.
4. Thông báo published tạo recipients chốt một lần và audit; queue gửi email tách khỏi thông báo trong app. Nếu email fail, thông báo trong app vẫn hiển thị; trạng thái delivery độc lập.

### 32.2. File và quyền truy cập

1. Upload intent ràng buộc owner/purpose/size/MIME; complete kiểm tra object thật, checksum và file signature. Quarantine đến khi scan và xử lý ảnh thành công. `ready` là điều kiện để gắn hồ sơ/download. Signed URL ngắn hạn chỉ cấp sau scope check mỗi lần; không log URL.
2. File không thể được gắn hai hồ sơ trái quyền. Object storage delete thực hiện sau khi transaction gỡ tham chiếu commit; tombstone `deleting` cho phép retry. Orphan cleanup chỉ xóa object không còn được tham chiếu sau grace period; dùng job dry run/report trước production.
3. Import CSV/XLSX parse trong sandbox worker với giới hạn kích thước giải nén/row/column, chặn công thức độc hại. Dry run lưu lỗi từng hàng. Commit kiểm tra lại dữ liệu DB vì khoa/lớp/mã có thể đổi sau dry run; nếu bất kỳ hàng lỗi thì rollback toàn batch và trả báo cáo, không partial âm thầm.
4. Import 10.000 dòng có thể quá dài cho một transaction. Chọn một trong hai mode rõ ràng: mặc định `atomic` với giới hạn nhỏ được thử tải (đề xuất ≤1.000 dòng); file lớn dùng `staged` với bảng staging + validate toàn file + transaction commit được đo/giới hạn hoặc chia batch có checkpoint và báo cáo partial chính thức. Phiên bản đầu chưa hỗ trợ partial import, nên từ chối file vượt ngưỡng atomic đã đo thay vì hứa atomic 10.000 dòng khi chưa kiểm chứng.
5. Export job chốt bộ lọc và scope tại lúc tạo, kiểm tra lại quyền trước khi tạo link tải. Không để export đã tạo trở thành tệp công khai sau khi quyền user bị thu hồi; download URL cấp qua API với scope mới. CSV escape formula injection.

**DB/API:** Giữ `/notifications`, `/files`, `/imports`, `/jobs`, `/reports`. Bổ sung `outbox_events.last_error_code`, `jobs.lease_until`, `jobs.attempts`, `jobs.idempotency_key` (khi phù hợp). `GET /jobs/{id}` trả `status`, `progressPercent`, `errorCode`, `resultSummary`, `retryable`; Admin có endpoint retry job failed với reason và audit, không tạo dữ liệu trùng. Đường API upload/complete giữ nguyên.

**Test:** worker chết sau commit trước email; duplicate event; 429 có Retry-After; 4xx không retry; file scan fail; file owner khác; import dry run rồi mã trùng xuất hiện trước commit; commit timeout + retry; user bị thu hồi quyền trước download export.

## 33. Audit, dữ liệu cá nhân và phục hồi — QLSV-BE-109

1. Audit của mutation quyền, điểm, đăng ký, lịch, hồ sơ và settings là một phần transaction. Ghi actor, hành động, entity, before/after đã redact, reason, requestId, thời gian DB. Không log hash mật khẩu, token, signed URL, tài liệu, số điện thoại/địa chỉ nếu không cần so sánh nghiệp vụ.
2. Audit append-only ở quyền DB ứng dụng; endpoint chỉ đọc theo `audit.read`, filter có giới hạn thời gian/pagination. Truy cập audit và tải dữ liệu nhạy cảm tạo security event. Retention được trường/pháp lý xác nhận trước production; không áp dụng TTL xóa tự động khi chưa có policy.
3. Thiết lập backup PITR cho PostgreSQL nếu gói managed hỗ trợ, versioning/backup cho object storage. Snapshot DB và file phải có quy trình đối soát vì lưu ở hai nơi. Restore drill ở staging: khôi phục DB và file cùng mốc tương thích, chạy migration cần thiết, kiểm tra account/roster/transcript và file download theo quyền.
4. RPO/RTO 24 giờ/4 giờ của brief là mục tiêu, phải đo bằng restore drill. Mất Redis không được mất enrollment/grade/audit; outbox trong PostgreSQL có thể replay sau khi worker hoạt động. Mất object storage không làm API nghiệp vụ trả “đã upload thành công”; job scan/download báo trạng thái rõ.
5. PII export và xóa dữ liệu có yêu cầu pháp lý riêng. Hồ sơ học tập có nghĩa vụ lưu; yêu cầu “xóa” được xử lý bằng ngừng sử dụng/ẩn danh có review theo policy, không cascade xóa kết quả. Không đặt retention áp dụng mặc định cho mọi bảng.

**Test:** audit và mutation rollback cùng nhau; redaction; truy vấn audit ngoài quyền; Redis outage; outbox replay; restore drill so sánh số enrollment/result và checksum mẫu file.

## 34. Hợp đồng API, lỗi và nhất quán đọc — QLSV-BE-110

1. `/api/v1` và response envelope giữ nguyên. DTO JSON camelCase; ID UUID; timestamp ISO 8601; điểm decimal string; enum code ổn định. OpenAPI phải định nghĩa mọi role/scope, response 2xx/4xx/5xx, If-Match và Idempotency-Key. Mỗi mutation có ví dụ lỗi cụ thể.
2. `If-Match` phản ánh `version` của đúng aggregate: Student cho chuyển lớp, Offering cho lịch/status, Gradebook cho điểm, AttendanceSheet cho điểm danh, Result/Adjustment cho phê duyệt. Tăng version trên mọi mutation thuộc aggregate. 428 nếu thiếu, 412 nếu cũ; không dùng 409 để thay cho optimistic concurrency.
3. Idempotency-Key áp cho create enrollment, commit import và report job. Không dùng cho GET; không lưu response chứa token/secret. Scope key theo user+route+payload hash; record được commit cùng tác vụ. Retry khi HTTP timeout dùng lại key.
4. Response 202 nghĩa là job đã được nhận bền vững; trả `jobId` và URL status. Response 201 nghĩa là bản ghi chính đã commit. Không trả 200/201 trước khi DB commit. Job có trạng thái queued/running/succeeded/failed/cancelled và mã lỗi cho frontend xử lý sau này.
5. List/search/filter/count/dashboard/export áp scope trước khi phân trang/tổng hợp. Offset pagination có stable sort + ID tie-break; cursor dùng cho audit/notification; không cho sort tùy ý trên SQL. Search tên có dấu/không dấu có test thực tế về collation và index.
6. RequestId xuyên API → audit → outbox → worker. Log có duration, status, error code, actor ID phù hợp, không request body nhạy cảm. Metrics gồm HTTP p95, 5xx, DB pool, lock wait/deadlock, queue lag, retry/dead-letter, upload scan fail, enrollment conflicts, grade publish failures. Health/readiness chỉ trả trạng thái, không secret.
7. Auth endpoint cookie có Origin/CSRF check; protected Bearer endpoint không lấy quyền từ cookie refresh. CORS allowlist chính xác, không wildcard với credentials. Rate limit theo route/role/IP/account và giới hạn kích thước body. Security headers và HTTPS như brief gốc.

**Lỗi mở rộng:** `CLASS_MEMBERSHIP_CONFLICT`, `ROOM_CONFLICT`, `TEACHER_CONFLICT`, `ATTENDANCE_SHEET_LOCKED`, `GRADE_ADJUSTMENT_STALE`, `APPEAL_ALREADY_OPEN`, `IDEMPOTENCY_KEY_REUSED`, `JOB_RETRY_EXHAUSTED`; cùng format lỗi mục 10. Dùng 409 cho conflict, 412 cho version cũ, 422 cho policy/validation. Không trả 500 khi unique/exclusion constraint dự kiến bị vi phạm: map sang lỗi nghiệp vụ và vẫn ghi log kỹ thuật.

## 35. Migration, tương thích và triển khai theo giai đoạn — QLSV-BE-111

1. Không sửa/xóa bảng cũ trong phụ lục; triển khai bằng migration cộng thêm. Các trường optional mới và bảng `enrollment_events`, `attendance_sheets`, `grade_appeals` được tạo trước khi code phụ thuộc vào chúng. Backfill dữ liệu hiện có (nếu có) với job idempotent rồi mới thêm NOT NULL/index/constraint. Vì repository hiện chỉ có brief, đây là kế hoạch triển khai tương lai, chưa khẳng định migration đã chạy.
2. Prisma schema mô tả quan hệ/index thông thường. `btree_gist`, exclusion constraint, partial unique index và composite FK cần SQL migration được review. CI tạo PostgreSQL mới, chạy toàn migration rồi thử insert dữ liệu sai và race; không chỉ kiểm tra Prisma validate.
3. Expand → deploy code tương thích cũ/mới → backfill/verify → bật tính năng theo module → contract. Không drop field cho đến khi app/worker cũ dừng. Khi rollback code, dữ liệu mới vẫn an toàn và worker cũ không tiêu thụ event version không biết. Outbox event có `schema_version` và consumer xử lý version được hỗ trợ.
4. Release job migration chạy một lần; backup trước migration rủi ro. Sau deploy smoke test login, danh mục, enrollment giả trên staging, nhập/công bố điểm staging, health/queue. Không tạo hoặc thay đổi điểm thật trong production smoke test.
5. Tính năng mới đề xuất ở phụ lục được xếp theo ưu tiên: P0 trước vận hành thật = constraint/concurrency/idempotency/audit/outbox/permissions/recovery; P1 = attendance sheet và grade appeal sau khi trường xác nhận chính sách; P2 = waitlist, học phí và tích hợp SIS ngoài phạm vi hiện tại. Không thêm waitlist một cách ngầm định vì nó làm thay đổi capacity/notification/ưu tiên đăng ký.

## 36. Ma trận kiểm thử nghiệp vụ nâng cao — QLSV-BE-112

| ID | Tình huống | Kết quả phải chứng minh |
|---|---|---|
| T-01 | Hai admin tạo cùng student_code | Một commit; bên kia 409; không account/membership rác |
| T-02 | Hai transfer cùng Student | Một version thắng; lịch sử không chồng; request còn lại 412/409 |
| T-03 | Hai Student tranh chỗ cuối | Một enrollment commit, một OFFERING_FULL |
| T-04 | Một Student đăng ký hai môn vượt tín chỉ đồng thời | Không vượt maxCredits |
| T-05 | Drop rồi đăng ký lại cùng offering | Tái kích hoạt row, event đủ, không vi phạm unique |
| T-06 | Retry POST enrollment sau mất response | Cùng key cùng kết quả, không nhân đôi audit/outbox |
| T-07 | Chuyển nhóm target full giữa chừng | Toàn bộ transaction rollback, source còn nguyên |
| T-08 | Hai admin xếp cùng phòng/GV chồng giờ | Một request bị 409 do DB constraint |
| T-09 | Generate session lặp và manual override | Không trùng, không ghi đè override |
| T-10 | Hai Lecturer sửa gradebook cùng version | Một thành công, một 412, điểm không bị mất |
| T-11 | Publish lỗi ở result cuối | Không course_result nào công bố; gradebook vẫn trạng thái cũ |
| T-12 | Adjustment duyệt sau khi result đã đổi | 409 stale; không ghi đè điểm mới |
| T-13 | Student xem điểm nháp/SV khác | Không trả dữ liệu; 404/403 đúng policy |
| T-14 | Đăng ký sau buổi học rồi xem điểm danh | Không tạo attendance quá khứ |
| T-15 | Worker chết sau claim outbox | Lease hết hạn, retry idempotent, không mất event |
| T-16 | Import dry run hợp lệ, mã bị tạo trước commit | Commit từ chối/rollback toàn batch |
| T-17 | User mất quyền sau khi report tạo | Không lấy được signed URL mới |
| T-18 | Redis lỗi khi login/đăng ký | Login fail-closed/fallback bảo thủ; đăng ký vẫn dựa PostgreSQL |
| T-19 | Restore staging từ backup | Đối soát account, enrollment, result, file mẫu và RPO/RTO |
| T-20 | JWT còn hạn sau khi role bị thu hồi | Request kế tiếp không còn quyền |

Test concurrency dùng PostgreSQL thật, barrier để các request thực sự tranh lock; không thay bằng mock hoặc SQLite. Test outbox dùng fake provider có thể kiểm soát timeout/429/5xx. API test xác minh cả response/status/audit/DB sau rollback. OpenAPI contract test bảo đảm endpoint mới/headers/error code đúng tài liệu. Load test đo lock wait và p95, không chỉ số request thành công.

## 37. Truy vết nghiệp vụ → dữ liệu → API → bảo mật → test

| Yêu cầu | Bảng/ràng buộc chính | API hiện có hoặc bổ sung | Quyền và bảo vệ | Test |
|---|---|---|---|---|
| BE-101 Tài khoản | users, sessions, challenges, auth_version | /auth/*, /users, /me/sessions | Admin cấp; self session; CSRF/rate limit | T-01, T-20 + auth tests mục 19 |
| BE-102 Hồ sơ/chuyển lớp | students, memberships, GiST exclusion | /students, /class-transfers | Admin sửa; Student self; If-Match | T-01, T-02 |
| BE-103 Policy/học kỳ | curricula, prerequisites, policy revisions | /curricula, /semesters/transitions | Admin permission, audit | Activate/close tests mục 27 |
| BE-104 Offering/lịch | offerings, session/room/teacher reservation | /offerings, /schedule-rules, /sessions | Admin, If-Match, audit | T-08, T-09 |
| BE-105 Đăng ký | enrollments, enrollment_events, idempotency_records, unique | /enrollments/* | Student self/Admin riêng; key + transaction | T-03 đến T-07 |
| BE-106 Điểm/khiếu nại | gradebooks, entries, results, adjustments, appeals | /gradebook, /grades, /grade-appeals | Lecturer assigned; Admin dual control; Student self | T-10 đến T-13 |
| BE-107 Điểm danh | sessions, attendance_sheets, records | /sessions/{id}/attendance* | Lecturer canAttend/Admin; If-Match | T-14 + concurrent sheet |
| BE-108 Job/file/import | outbox, jobs, files, import_rows | /notifications, /files, /imports, /jobs | Owner/scope; lease/retry; scan | T-15 đến T-17 |
| BE-109 Audit/recovery | audit_logs, backups, object storage | /audit-logs, vận hành restore | audit.read, redact, DB append-only | T-19 |
| BE-110 API/security | versions, requestId, rate limit | /api/v1 + OpenAPI | Auth/CSRF/scope/error map | T-18, T-20 + contract |
| BE-111 Migration | SQL migrations, schema_version | release job | Quyền deploy; backup/rollback | Migration/restore tests |

## 38. Quyết định cần trường xác nhận trước khi bật production

| Quyết định | Mặc định đề xuất | Tác động nếu thay đổi |
|---|---|---|
| Thang điểm và ngưỡng đạt | Bảng mục 8, ≥4/10 | Policy bands, GPA, báo cáo lịch sử |
| Môn học lại/cải thiện | Chọn điểm cao nhất | Prerequisite, transcript, GPA |
| Drop/withdraw deadline | Theo semester; cutoff loại trừ | Enrollment states, kết quả W |
| Giới hạn tín chỉ | `semesters.max_credits` | Đăng ký concurrent |
| Vắng/miễn thi | Không tự coi NULL=0; cần policy | Publish và kết quả |
| Attendance deadline | Lecturer 48 giờ | Sheet/reopen/audit |
| Thời hạn khiếu nại điểm | 14 ngày sau publish | API appeal/notification |
| Retention PII/audit/file | Chờ chính sách trường/pháp lý | Backup, xóa/ẩn danh, storage |
| Import tối đa atomic | ≤1.000 dòng trước khi thử tải | Worker, transaction, UX import sau này |

Các quyết định này không chặn việc thiết kế/migration/test P0. Tính năng có policy chưa chốt phải giữ ở draft hoặc tắt bằng setting/feature flag có kiểm soát; không tự dùng giá trị mặc định ở production khi ảnh hưởng điểm hoặc quyền lợi sinh viên.

## 39. Checklist nghiệm thu phụ lục

- [ ] 23 phần gốc còn nguyên nội dung và sơ đồ.
- [ ] Các trạng thái, cutoff và quyền scope có test ở service, API và DB.
- [ ] Race capacity/tín chỉ/phòng/GV/điểm có test PostgreSQL thật.
- [ ] Enrollment dropped tái kích hoạt được mà không phá unique; lịch sử có events.
- [ ] Publish điểm, grade adjustment, transfer, import atomic như đặc tả.
- [ ] If-Match và Idempotency-Key có trong OpenAPI và test.
- [ ] Audit/outbox cùng transaction, worker retry/idempotent và dead-letter quan sát được.
- [ ] File chưa ready không được dùng; import dry run/commit kiểm tra lại dữ liệu.
- [ ] Phục hồi DB/file và mục tiêu RPO/RTO được đo ở staging.
- [ ] Chính sách trường ở mục 38 được xác nhận trước khi bật nghiệp vụ tương ứng trong production.

## 40. Nhật ký bổ sung và làm rõ so với brief gốc

| Phần gốc | Nội dung được bổ sung/làm rõ | Loại thay đổi |
|---|---|---|
| 2, 6 | Scope kiểm tra ở truy vấn và trong transaction; thu hồi role/session có hiệu lực trên request kế tiếp; refresh replay và Redis outage | Làm rõ thực thi, không đổi role |
| 4, 5 | Membership exclusion, reservation phòng/GV, event đăng ký, attendance sheet, grade appeal và outbox lease | Bổ sung schema; giữ bảng cũ |
| 7, 10 | If-Match gắn đúng aggregate, Idempotency-Key, mã lỗi cụ thể, 202/job status và API appeal/attendance sheet | Mở rộng hợp đồng, không bỏ endpoint cũ |
| 8, 9 | Cutoff đóng/mở, drop/re-enroll cùng row, transfer atomic, điểm NULL/0, quyền chỉnh sửa sau công bố và roster theo thời điểm | Làm rõ ngoại lệ/validation |
| 13, 14 | File quarantine, import hai bước với giới hạn atomic đo được, audit cùng transaction, redaction và phục hồi backup | Làm rõ vận hành và lỗi |
| 15, 18, 21 | Outbox at-least-once, worker lease/retry/dead-letter, migration expand/contract, rollout ưu tiên P0–P2 | Mở rộng chi tiết kiến trúc hiện có |
| 19, 22 | Ma trận race, rollback, quyền, restore và truy vết BE-101–BE-112 | Bổ sung tiêu chí nghiệm thu |

Các hướng React/Next.js, frontend contract, deployment, công nghệ và roadmap trong 23 phần gốc được giữ nguyên để dùng ở các giai đoạn sau. Phụ lục chỉ đặt thêm điều kiện backend cần hoàn thành trước khi dữ liệu thật được dùng.
