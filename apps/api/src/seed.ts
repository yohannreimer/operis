import { prisma } from './db.js';

async function main() {
  const defaults = [
    { name: 'Pessoal', type: 'pessoal' as const },
    { name: 'Geral', type: 'geral' as const }
  ];

  for (const workspace of defaults) {
    await prisma.workspace.upsert({
      where: {
        id: `00000000-0000-0000-0000-${workspace.type === 'pessoal' ? '000000000001' : '000000000002'}`
      },
      update: {
        name: workspace.name,
        type: workspace.type
      },
      create: {
        id: `00000000-0000-0000-0000-${workspace.type === 'pessoal' ? '000000000001' : '000000000002'}`,
        name: workspace.name,
        type: workspace.type,
        clerkUserId: 'legacy'
      }
    });
  }

  const state = await prisma.gamificationState.findFirst({
    orderBy: { lastUpdate: 'desc' }
  });

  if (!state) {
    await prisma.gamificationState.create({
      data: { clerkUserId: 'legacy' }
    });
  }

  // Seed UserPhone from environment variables
  const defaultPhone = process.env.DEFAULT_PHONE_NUMBER;
  const whatsappClerkUserId = process.env.WHATSAPP_CLERK_USER_ID;

  if (defaultPhone && whatsappClerkUserId) {
    const normalizedPhone = defaultPhone.replace(/\D/g, '');
    await prisma.userPhone.upsert({
      where: { clerkUserId: whatsappClerkUserId },
      update: { phoneNumber: normalizedPhone },
      create: {
        clerkUserId: whatsappClerkUserId,
        phoneNumber: normalizedPhone,
      },
    });
    console.log(`UserPhone seeded: ${normalizedPhone} → ${whatsappClerkUserId}`);
  } else {
    console.log('Skipping UserPhone seed: DEFAULT_PHONE_NUMBER or WHATSAPP_CLERK_USER_ID not set.');
  }

  console.log('Seed concluído com workspaces padrão.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
