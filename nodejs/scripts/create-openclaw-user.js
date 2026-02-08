#!/usr/bin/env node

/**
 * Create OpenClaw system user in ClawDeck database
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function createOpenClawUser() {
  try {
    console.log('🔐 Creating OpenClaw system user in ClawDeck...\n')

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: { emailAddress: 'openclaw@system.local' }
    })

    if (existingUser) {
      console.log('✅ User already exists, updating settings...')

      const updated = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          agentAutoMode: true,
          agentName: 'OpenClaw System',
          agentEmoji: '🤖'
        }
      })

      console.log('\n📋 OpenClaw System User Details:')
      console.log('   ID:', updated.id.toString())
      console.log('   Email:', updated.emailAddress)
      console.log('   Agent Name:', updated.agentName)
      console.log('   Agent Emoji:', updated.agentEmoji)
      console.log('   Auto Mode:', updated.agentAutoMode)

      return updated
    }

    // Create new user
    const user = await prisma.user.create({
      data: {
        emailAddress: 'openclaw@system.local',
        agentAutoMode: true,
        agentName: 'OpenClaw System',
        agentEmoji: '🤖'
      }
    })

    console.log('\n📋 OpenClaw System User Details:')
    console.log('   ID:', user.id.toString())
    console.log('   Email:', user.emailAddress)
    console.log('   Agent Name:', user.agentName)
    console.log('   Agent Emoji:', user.agentEmoji)
    console.log('   Auto Mode:', user.agentAutoMode)
    console.log('   Created:', user.createdAt.toISOString())

    return user

  } catch (error) {
    console.error('❌ Error:', error.message)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

createOpenClawUser()
  .then(() => {
    console.log('\n✅ Phase 1.2: User creation completed')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n❌ Phase 1.2: User creation failed')
    process.exit(1)
  })
