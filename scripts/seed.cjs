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

async function seed() {
  await prisma.$transaction(
    roles.map((role) =>
      prisma.role.upsert({
        where: { code: role.code },
        create: role,
        update: {},
      }),
    ),
  );
  console.log(`Seeded system roles: ${roles.map((role) => role.code).join(', ')}.`);
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
