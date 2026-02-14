import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function createAdmin() {
  const email = 'admin@admin.local'
  const password = 'password'
  const hashedPassword = await bcrypt.hash(password, 12)

  try {
    const user = await prisma.user.upsert({
      where: { emailAddress: email },
      update: {
        passwordDigest: hashedPassword,
        admin: true,
      },
      create: {
        emailAddress: email,
        passwordDigest: hashedPassword,
        admin: true,
        agentAutoMode: true,
      },
    })
    console.log('Admin user created/updated:', user.emailAddress, 'admin:', user.admin)
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

createAdmin()
