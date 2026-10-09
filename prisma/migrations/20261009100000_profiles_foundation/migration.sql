CREATE TYPE "profile_status" AS ENUM ('active', 'inactive', 'graduated', 'withdrawn');

CREATE TABLE "departments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "majors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "department_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    CONSTRAINT "majors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "students" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "student_code" VARCHAR(30) NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "contact_email" VARCHAR(254),
    "phone" VARCHAR(20),
    "date_of_birth" DATE,
    "gender" VARCHAR(20),
    "admission_year" SMALLINT NOT NULL,
    "major_id" UUID NOT NULL,
    "status" "profile_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "students_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "students_version_check" CHECK ("version" >= 1),
    CONSTRAINT "students_admission_year_check" CHECK ("admission_year" BETWEEN 1900 AND 2200),
    CONSTRAINT "students_date_of_birth_check" CHECK ("date_of_birth" IS NULL OR "date_of_birth" <= CURRENT_DATE)
);

CREATE TABLE "teachers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "teacher_code" VARCHAR(30) NOT NULL,
    "department_id" UUID NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "contact_email" VARCHAR(254),
    "phone" VARCHAR(20),
    "academic_title" VARCHAR(100),
    "status" "profile_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "teachers_version_check" CHECK ("version" >= 1)
);

CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");
CREATE UNIQUE INDEX "majors_code_key" ON "majors"("code");
CREATE INDEX "majors_department_id_idx" ON "majors"("department_id");
CREATE UNIQUE INDEX "students_user_id_key" ON "students"("user_id");
CREATE UNIQUE INDEX "students_student_code_key" ON "students"("student_code");
CREATE UNIQUE INDEX "students_contact_email_key" ON "students"("contact_email");
CREATE INDEX "students_status_deleted_at_idx" ON "students"("status", "deleted_at");
CREATE UNIQUE INDEX "teachers_user_id_key" ON "teachers"("user_id");
CREATE UNIQUE INDEX "teachers_teacher_code_key" ON "teachers"("teacher_code");
CREATE UNIQUE INDEX "teachers_contact_email_key" ON "teachers"("contact_email");
CREATE INDEX "teachers_status_deleted_at_idx" ON "teachers"("status", "deleted_at");

ALTER TABLE "majors" ADD CONSTRAINT "majors_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "students" ADD CONSTRAINT "students_major_id_fkey" FOREIGN KEY ("major_id") REFERENCES "majors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
