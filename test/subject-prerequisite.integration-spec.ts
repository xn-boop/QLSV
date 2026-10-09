import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/infrastructure/database/prisma.service';
import { SubjectCycleError } from '../src/modules/catalog/subject.errors';
import { SubjectService } from '../src/modules/catalog/subject.service';

describe('subject prerequisite DAG (PostgreSQL integration)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const service = new SubjectService(prisma as unknown as PrismaService);
  const departmentIds: string[] = [];
  const subjectIds: string[] = [];

  afterAll(async () => {
    await prisma.subjectPrerequisite.deleteMany({ where: { subjectId: { in: subjectIds } } });
    await prisma.subject.deleteMany({ where: { id: { in: subjectIds } } });
    await prisma.department.deleteMany({ where: { id: { in: departmentIds } } });
    await prisma.$disconnect();
  });

  it('accepts an acyclic graph and rejects a cycle atomically', async () => {
    const department = await prisma.department.create({
      data: { code: `D_${randomUUID().slice(0, 8)}`, name: 'Catalog Test' },
    });
    departmentIds.push(department.id);
    const subjects = await Promise.all(
      ['A', 'B', 'C'].map((code) =>
        prisma.subject.create({
          data: {
            departmentId: department.id,
            code: `S_${code}_${randomUUID().slice(0, 6)}`,
            name: code,
            credits: 3,
          },
        }),
      ),
    );
    const [a, b, c] = subjects;
    if (!a || !b || !c) throw new Error('subject fixtures were not created');
    subjectIds.push(...subjects.map((subject) => subject.id));
    await service.replacePrerequisites(b.id, [a.id]);
    await service.replacePrerequisites(c.id, [b.id]);
    await expect(service.replacePrerequisites(a.id, [c.id])).rejects.toBeInstanceOf(
      SubjectCycleError,
    );
    await expect(
      prisma.subjectPrerequisite.findMany({
        orderBy: [{ subjectId: 'asc' }, { prerequisiteSubjectId: 'asc' }],
      }),
    ).resolves.toHaveLength(2);
  });
});
