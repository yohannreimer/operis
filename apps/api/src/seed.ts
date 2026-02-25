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
        type: workspace.type
      }
    });
  }

  const state = await prisma.gamificationState.findFirst({
    orderBy: { lastUpdate: 'desc' }
  });

  if (!state) {
    await prisma.gamificationState.create({
      data: {}
    });
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
