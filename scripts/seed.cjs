const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required to seed the database.');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const roles = [
  { code: 'ADMIN', name: 'Administrator' },
  { code: 'LECTURER', name: 'Lecturer' },
  { code: 'STUDENT', name: 'Student' },
];

const permissions = [
  ['audit.read', 'Read audit logs'],
  ['catalog.manage', 'Manage academic catalog'],
  ['enrollments.manage', 'Manage enrollments'],
  ['enrollments.self', 'Manage own enrollments'],
  ['grades.publish', 'Publish grades'],
  ['grades.self', 'Read own published grades'],
  ['grades.write', 'Write draft grades for assigned offerings'],
  ['notifications.manage', 'Create scoped notifications'],
  ['notifications.self', 'Read own notifications'],
  ['offerings.manage', 'Manage course offerings'],
  ['profile.self', 'Read and update own allowed profile fields'],
  ['reports.export', 'Export authorized reports'],
  ['reports.transcript.self', 'Export own transcript'],
  ['roles.manage', 'Manage account roles'],
  ['settings.manage', 'Manage application settings'],
  ['students.manage', 'Manage student profiles'],
  ['teachers.manage', 'Manage teacher profiles'],
  ['users.manage', 'Manage user accounts'],
  ['attendance.self', 'Read own attendance'],
  ['attendance.write', 'Write attendance for assigned offerings'],
];

const permissionsByRole = {
  ADMIN: permissions.map(([code]) => code),
  LECTURER: ['attendance.write', 'grades.write', 'notifications.manage', 'profile.self'],
  STUDENT: [
    'attendance.self',
    'enrollments.self',
    'grades.self',
    'notifications.self',
    'profile.self',
    'reports.transcript.self',
  ],
};

async function seed() {
  await prisma.$transaction(async (transaction) => {
    await Promise.all(
      roles.map((role) =>
        transaction.role.upsert({ where: { code: role.code }, create: role, update: {} }),
      ),
    );
    await Promise.all(
      permissions.map(([code, description]) =>
        transaction.permission.upsert({
          where: { code },
          create: { code, description },
          update: {},
        }),
      ),
    );

    const seededRoles = await transaction.role.findMany({
      where: { code: { in: roles.map((r) => r.code) } },
    });
    const seededPermissions = await transaction.permission.findMany({
      where: { code: { in: permissions.map(([code]) => code) } },
    });
    const roleByCode = new Map(seededRoles.map((role) => [role.code, role.id]));
    const permissionByCode = new Map(
      seededPermissions.map((permission) => [permission.code, permission.id]),
    );

    for (const [roleCode, permissionCodes] of Object.entries(permissionsByRole)) {
      const roleId = roleByCode.get(roleCode);
      if (!roleId) throw new Error(`Seed role ${roleCode} was not found.`);
      await transaction.rolePermission.createMany({
        data: permissionCodes.map((permissionCode) => {
          const permissionId = permissionByCode.get(permissionCode);
          if (!permissionId) throw new Error(`Seed permission ${permissionCode} was not found.`);
          return { roleId, permissionId };
        }),
        skipDuplicates: true,
      });
    }
  });
  console.log(`Seeded ${roles.length} system roles and ${permissions.length} permissions.`);
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
