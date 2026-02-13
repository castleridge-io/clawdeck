import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding ClawDeck database...');

  // Create dev admin user (for easy dev login)
  const devPassword = await bcrypt.hash('admin', 10);

  const devUser = await prisma.user.upsert({
    where: { emailAddress: 'admin' },
    update: {},
    create: {
      emailAddress: 'admin',
      passwordDigest: devPassword,
      admin: true,
      agentAutoMode: false,
      agentName: 'Admin',
      agentEmoji: '🔧'
    }
  });

  console.log(`✅ Dev user created/updated: ${devUser.emailAddress} (ID: ${devUser.id})`);

  // Create OpenClaw system user
  const hashedPassword = await bcrypt.hash('openclaw', 10);

  const user = await prisma.user.upsert({
    where: { emailAddress: 'openclaw@system.local' },
    update: {},
    create: {
      emailAddress: 'openclaw@system.local',
      passwordDigest: hashedPassword,
      admin: true,
      agentAutoMode: false
    }
  });

  console.log(`✅ User created/updated: ${user.emailAddress} (ID: ${user.id})`);

  // Create API token
  const tokenValue = 'oc-sys-6e07444c51f93cb9ab69282a06878195-b3032039';

  const token = await prisma.apiToken.upsert({
    where: { token: tokenValue },
    update: {},
    create: {
      token: tokenValue,
      userId: user.id,
      name: 'OpenClaw Migration Token',
      lastUsedAt: new Date()
    }
  });

  console.log(`✅ API token created: ${token.token.substring(0, 20)}...`);

  // Create agent boards
  const agents = [
    { id: 'jarvis-leader', icon: '👔', name: 'Jarvis Leader', color: 'purple' },
    { id: 'dave-engineer', icon: '👨‍💻', name: 'Dave Engineer', color: 'blue' },
    { id: 'sally-designer', icon: '👩‍🎨', name: 'Sally Designer', color: 'pink' },
    { id: 'mike-qa', icon: '🧪', name: 'Mike QA', color: 'green' },
    { id: 'richard', icon: '📚', name: 'Richard', color: 'yellow' },
    { id: 'nolan', icon: '⚙️', name: 'Nolan', color: 'gray' },
    { id: 'elsa', icon: '📢', name: 'Elsa', color: 'orange' }
  ];

  for (const agent of agents) {
    const boardId = parseInt(agent.id === 'elsa' ? '46' : agent.id === 'nolan' ? '45' : agent.id === 'richard' ? '44' : agent.id === 'mike-qa' ? '43' : agent.id === 'sally-designer' ? '42' : agent.id === 'dave-engineer' ? '41' : '40');

    await prisma.board.upsert({
      where: { id: boardId },
      update: {},
      create: {
        id: boardId,
        name: `${agent.name} Board`,
        icon: agent.icon,
        color: agent.color,
        userId: user.id,
        position: agents.indexOf(agent)
      }
    });
    console.log(`✅ Board created: ${agent.name} Board (ID: ${boardId})`);
  }

  console.log('🎉 Seeding complete!');
}

seed()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
