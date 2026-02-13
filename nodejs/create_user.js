import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function createUser () {
  const hashedPassword = await bcrypt.hash('openclaw', 10)

  const user = await prisma.user.upsert({
    where: { emailAddress: 'openclaw@system.local' },
    update: {},
    create: {
      emailAddress: 'openclaw@system.local',
      passwordDigest: hashedPassword,
      admin: true,
      agentAutoMode: false,
    },
  })

  console.log('User created:', user.id, user.emailAddress)

  const token = await prisma.apiToken.upsert({
    where: { token: 'oc-sys-6e07444c51f93cb9ab69282a06878195-b3032039' },
    update: {},
    create: {
      token: 'oc-sys-6e07444c51f93cb9ab69282a06878195-b3032039',
      userId: user.id,
      name: 'OpenClaw Migration Token',
      lastUsedAt: new Date(),
    },
  })

  console.log('API Token created:', token.id)

  // Create 7 boards
  const agents = [
    { id: 40, icon: '👔', name: 'Jarvis Leader', color: 'purple' },
    { id: 41, icon: '👨‍💻', name: 'Dave Engineer', color: 'blue' },
    { id: 42, icon: '👩‍🎨', name: 'Sally Designer', color: 'pink' },
    { id: 43, icon: '🧪', name: 'Mike QA', color: 'green' },
    { id: 44, icon: '📚', name: 'Richard', color: 'yellow' },
    { id: 45, icon: '⚙️', name: 'Nolan', color: 'gray' },
    { id: 46, icon: '📢', name: 'Elsa', color: 'orange' },
  ]

  for (const agent of agents) {
    await prisma.board.upsert({
      where: { id: agent.id },
      update: {},
      create: {
        id: agent.id,
        name: `${agent.name} Board`,
        icon: agent.icon,
        color: agent.color,
        userId: user.id,
        position: agents.indexOf(agent),
      },
    })
    console.log('Board created:', agent.name)
  }

  await prisma.$disconnect()
  console.log('Done!')
}

createUser().catch(console.error)
