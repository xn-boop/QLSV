CREATE TABLE "subjects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "department_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "credits" SMALLINT NOT NULL,
    "description" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subjects_credits_check" CHECK ("credits" BETWEEN 1 AND 10),
    CONSTRAINT "subjects_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "subject_prerequisites" (
    "subject_id" UUID NOT NULL,
    "prerequisite_subject_id" UUID NOT NULL,
    CONSTRAINT "subject_prerequisites_pkey" PRIMARY KEY ("subject_id", "prerequisite_subject_id"),
    CONSTRAINT "subject_prerequisites_not_self_check" CHECK ("subject_id" <> "prerequisite_subject_id")
);

CREATE UNIQUE INDEX "subjects_code_key" ON "subjects"("code");
CREATE INDEX "subjects_department_status_idx" ON "subjects"("department_id", "status");
CREATE INDEX "subject_prerequisites_prerequisite_idx" ON "subject_prerequisites"("prerequisite_subject_id");
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subject_prerequisites" ADD CONSTRAINT "subject_prerequisites_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subject_prerequisites" ADD CONSTRAINT "subject_prerequisites_prerequisite_subject_id_fkey" FOREIGN KEY ("prerequisite_subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
