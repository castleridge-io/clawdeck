import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function seed () {
  console.log('🌱 Seeding ClawDeck database...')

  // Create dev admin user (for easy dev login)
  const devPassword = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD || 'changeme', 10)

  const devUser = await prisma.user.upsert({
    where: { emailAddress: 'admin' },
    update: {},
    create: {
      emailAddress: 'admin',
      passwordDigest: devPassword,
      admin: true,
      agentAutoMode: false,
      agentName: 'Admin',
      agentEmoji: '🔧',
    },
  })

  console.log(`✅ Dev user created/updated: ${devUser.emailAddress} (ID: ${devUser.id})`)

  // Create OpenClaw system user
  const openclawPassword = await bcrypt.hash(process.env.SEED_OPENCLAW_PASSWORD || 'changeme', 10)

  const user = await prisma.user.upsert({
    where: { emailAddress: 'openclaw@system.local' },
    update: {},
    create: {
      emailAddress: 'openclaw@system.local',
      passwordDigest: openclawPassword,
      admin: true,
      agentAutoMode: false,
    },
  })

  console.log(`✅ User created/updated: ${user.emailAddress} (ID: ${user.id})`)

  // Create API token (use env var or generate random token)
  const tokenValue = process.env.SEED_API_TOKEN || `oc-sys-${crypto.randomUUID()}`

  const token = await prisma.apiToken.upsert({
    where: { token: tokenValue },
    update: {},
    create: {
      token: tokenValue,
      userId: user.id,
      name: 'OpenClaw Migration Token',
      lastUsedAt: new Date(),
    },
  })

  console.log(`✅ API token created: ${token.token.substring(0, 20)}...`)

  // Create agent boards
  const agents = [
    { id: 'jarvis-leader', icon: '👔', name: 'Jarvis Leader', color: 'purple' },
    { id: 'dave-engineer', icon: '👨‍💻', name: 'Dave Engineer', color: 'blue' },
    { id: 'sally-designer', icon: '👩‍🎨', name: 'Sally Designer', color: 'pink' },
    { id: 'mike-qa', icon: '🧪', name: 'Mike QA', color: 'green' },
    { id: 'richard', icon: '📚', name: 'Richard', color: 'yellow' },
    { id: 'nolan', icon: '⚙️', name: 'Nolan', color: 'gray' },
    { id: 'elsa', icon: '📢', name: 'Elsa', color: 'orange' },
  ]

  for (const agentData of agents) {
    // Create or update agent
    const agent = await prisma.agent.upsert({
      where: { slug: agentData.id },
      update: {
        name: agentData.name,
        emoji: agentData.icon,
        color: agentData.color,
      },
      create: {
        name: agentData.name,
        slug: agentData.id,
        emoji: agentData.icon,
        color: agentData.color,
        description: `${agentData.name} agent board`,
        position: agents.indexOf(agentData),
      },
    })

    // Create or update board linked to agent
    const board = await prisma.board.upsert({
      where: { id: 40 + agents.indexOf(agentData) },
      update: {
        name: `${agentData.name} Board`,
        icon: agentData.icon,
        color: agentData.color,
        agentId: agent.id,
      },
      create: {
        id: 40 + agents.indexOf(agentData),
        name: `${agentData.name} Board`,
        icon: agentData.icon,
        color: agentData.color,
        userId: user.id,
        agentId: agent.id,
        position: agents.indexOf(agentData),
      },
    })
    console.log(
      `✅ Agent & Board created: ${agentData.name} (Agent ID: ${agent.id}, Board ID: ${board.id})`
    )
  }

  // Create default workflows
  const defaultWorkflows = [
    {
      name: 'feature-development',
      description: 'Design, implement, and review a new feature',
      steps: [
        {
          stepId: 'design',
          name: 'Design Phase',
          agentId: 'architect',
          inputTemplate:
            'Design the following feature:\n\nTask: {{task}}\n\nProvide a detailed technical design document including:\n1. Overview\n2. Architecture\n3. Implementation approach\n4. API changes\n5. Database changes (if any)\n6. Testing strategy',
          expects: 'design_document',
          type: 'single',
          position: 0,
        },
        {
          stepId: 'implement',
          name: 'Implementation Phase',
          agentId: 'developer',
          inputTemplate:
            'Implement the following design:\n\nDesign Document:\n{{design_document}}\n\nOriginal Task: {{task}}\n\nWrite clean, well-tested code following the design specifications.',
          expects: 'implementation',
          type: 'single',
          position: 1,
        },
        {
          stepId: 'review',
          name: 'Code Review',
          agentId: 'reviewer',
          inputTemplate:
            'Review the following implementation:\n\nImplementation:\n{{implementation}}\n\nDesign Document:\n{{design_document}}\n\nProvide feedback on code quality, adherence to design, and any potential improvements.',
          expects: 'approval',
          type: 'approval',
          position: 2,
        },
      ],
    },
    {
      name: 'bug-fix',
      description: 'Investigate, fix, and verify a bug',
      steps: [
        {
          stepId: 'investigate',
          name: 'Investigation',
          agentId: 'investigator',
          inputTemplate:
            'Investigate the following bug:\n\nBug Report: {{task}}\n\n1. Reproduce the issue\n2. Identify the root cause\n3. Document findings\n4. Propose a fix strategy',
          expects: 'investigation_report',
          type: 'single',
          position: 0,
        },
        {
          stepId: 'fix',
          name: 'Fix Implementation',
          agentId: 'developer',
          inputTemplate:
            'Fix the bug based on the investigation:\n\nInvestigation Report:\n{{investigation_report}}\n\nOriginal Bug: {{task}}\n\nImplement a fix that addresses the root cause without introducing regressions.',
          expects: 'fix_implementation',
          type: 'single',
          position: 1,
        },
        {
          stepId: 'verify',
          name: 'Verification',
          agentId: 'qa',
          inputTemplate:
            'Verify the bug fix:\n\nFix Implementation:\n{{fix_implementation}}\n\nOriginal Bug: {{task}}\n\n1. Confirm the fix resolves the reported issue\n2. Check for any regressions\n3. Verify edge cases\n4. Report verification results',
          expects: 'verification_report',
          type: 'single',
          position: 2,
        },
      ],
    },
    {
      name: 'content-review',
      description: 'Single-step approval workflow for content review',
      steps: [
        {
          stepId: 'review',
          name: 'Content Review',
          agentId: 'reviewer',
          inputTemplate:
            'Review the following content:\n\nContent: {{task}}\n\nCheck for:\n1. Accuracy\n2. Completeness\n3. Quality\n4. Brand guidelines compliance\n\nApprove or request changes.',
          expects: 'approval',
          type: 'approval',
          position: 0,
        },
      ],
    },
  ]

  for (const workflowData of defaultWorkflows) {
    const existingWorkflow = await prisma.workflow.findFirst({
      where: { name: workflowData.name },
    })

    if (existingWorkflow) {
      // Delete existing steps and recreate
      await prisma.workflowStep.deleteMany({
        where: { workflowId: existingWorkflow.id },
      })

      await prisma.workflow.update({
        where: { id: existingWorkflow.id },
        data: {
          description: workflowData.description,
        },
      })

      // Create new steps
      for (const step of workflowData.steps) {
        await prisma.workflowStep.create({
          data: {
            workflowId: existingWorkflow.id,
            stepId: step.stepId,
            name: step.name,
            agentId: step.agentId,
            inputTemplate: step.inputTemplate,
            expects: step.expects,
            type: step.type,
            position: step.position,
          },
        })
      }
      console.log(`✅ Workflow updated: ${workflowData.name}`)
    } else {
      // Create new workflow
      const workflow = await prisma.workflow.create({
        data: {
          name: workflowData.name,
          description: workflowData.description,
          config: {},
        },
      })

      // Create steps
      for (const step of workflowData.steps) {
        await prisma.workflowStep.create({
          data: {
            workflowId: workflow.id,
            stepId: step.stepId,
            name: step.name,
            agentId: step.agentId,
            inputTemplate: step.inputTemplate,
            expects: step.expects,
            type: step.type,
            position: step.position,
          },
        })
      }
      console.log(`✅ Workflow created: ${workflowData.name}`)
    }
  }

  console.log('🎉 Seeding complete!')
}

seed()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
