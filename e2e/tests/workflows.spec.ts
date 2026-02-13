import { test, expect } from '@playwright/test'
import { login, createWorkflow, deleteWorkflow, getWorkflows } from '../helpers/api'

test.describe('Workflows', () => {
  let token: string
  const createdWorkflowIds: string[] = []

  test.beforeAll(async ({ request }) => {
    token = await login(request)
  })

  test.afterAll(async ({ request }) => {
    // Cleanup any created workflows
    for (const id of createdWorkflowIds) {
      try {
        await deleteWorkflow(request, token, id)
      } catch {
        // Ignore cleanup errors
      }
    }
  })

  test.beforeEach(async ({ page }) => {
    // Login via UI
    await page.goto('/')
    await page.getByRole('button', { name: /dev login/i }).click()
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 })

    // Navigate to workflows page
    await page.goto('/workflows')
    await expect(page.getByRole('heading', { name: 'Workflows' })).toBeVisible()
  })

  test('displays workflows page', async ({ page }) => {
    await expect(page.getByRole('button', { name: /create workflow/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /import yaml/i })).toBeVisible()
  })

  test('create workflow with basic info', async ({ page, request }) => {
    const workflowName = `Test Workflow ${Date.now()}`

    // Click create button
    await page.getByRole('button', { name: /create workflow/i }).click()

    // Wait for modal and fill in the form
    await expect(page.getByRole('heading', { name: /create workflow/i })).toBeVisible()
    await page.locator('input').filter({ hasText: '' }).first().fill(workflowName)
    await page.locator('textarea').first().fill('E2E test workflow')

    // Save
    await page.getByRole('button', { name: /^create$/i }).click()

    // Should show the workflow in the list
    await expect(page.getByText(workflowName)).toBeVisible({ timeout: 5000 })

    // Verify via API
    const workflows = await getWorkflows(request, token)
    const created = workflows.find((w) => w.name === workflowName)
    expect(created).toBeDefined()
    if (created) {
      createdWorkflowIds.push(created.id)
    }
  })

  test('create workflow with steps', async ({ page, request }) => {
    const workflowName = `Workflow With Steps ${Date.now()}`

    await page.getByRole('button', { name: /create workflow/i }).click()
    await expect(page.getByRole('heading', { name: /create workflow/i })).toBeVisible()

    // Fill name
    await page.locator('input').filter({ hasText: '' }).first().fill(workflowName)

    // Add a step
    await page.getByRole('button', { name: /add step/i }).click()

    // Fill step details (the step should be expanded by default)
    await page.getByLabel('Step ID').fill('step-1')
    await page.getByLabel('Name').fill('First Step')
    await page.getByLabel('Agent ID').fill('test-agent')
    await page.getByLabel('Input Template').fill('Process this: {{task}}')
    await page.getByLabel('Expects').fill('result')

    // Save
    await page.getByRole('button', { name: /^create$/i }).click()

    // Verify
    await expect(page.getByText(workflowName)).toBeVisible({ timeout: 5000 })

    // Verify via API
    const workflows = await getWorkflows(request, token)
    const created = workflows.find((w) => w.name === workflowName)
    expect(created).toBeDefined()
    if (created) {
      createdWorkflowIds.push(created.id)
    }
  })

  test('edit existing workflow', async ({ page, request }) => {
    // Create a workflow via API first
    const workflow = await createWorkflow(request, token, {
      name: `Edit Test ${Date.now()}`,
      description: 'Original description',
    })
    createdWorkflowIds.push(workflow.id)

    // Refresh page
    await page.reload()
    await expect(page.getByText(workflow.name)).toBeVisible({ timeout: 5000 })

    // Click edit in the row
    const row = page.locator('tr', { hasText: workflow.name })
    await row.getByRole('button', { name: /edit/i }).click()

    // Wait for modal
    await expect(page.getByRole('heading', { name: /edit workflow/i })).toBeVisible()

    // Update description
    const descInput = page.getByLabel('Description')
    await descInput.fill('Updated description')

    // Save
    await page.getByRole('button', { name: /save/i }).click()

    // Verify update
    await expect(page.getByText(workflow.name)).toBeVisible({ timeout: 5000 })
  })

  test('delete workflow', async ({ page, request }) => {
    // Create a workflow via API first
    const workflow = await createWorkflow(request, token, {
      name: `Delete Test ${Date.now()}`,
      description: 'To be deleted',
    })

    // Refresh page
    await page.reload()
    await expect(page.getByText(workflow.name)).toBeVisible({ timeout: 5000 })

    // Setup dialog handler
    page.on('dialog', (dialog) => dialog.accept())

    // Click delete in the row
    const row = page.locator('tr', { hasText: workflow.name })
    await row.getByRole('button', { name: /delete/i }).click()

    // Should be removed from the list
    await expect(page.getByText(workflow.name)).not.toBeVisible({ timeout: 5000 })

    // Verify via API
    const workflows = await getWorkflows(request, token)
    expect(workflows.find((w) => w.id === workflow.id)).toBeUndefined()
  })

  test('delete workflow returns 204 and works correctly', async ({ page, request }) => {
    // This test specifically verifies the 204 response handling
    const workflow = await createWorkflow(request, token, {
      name: `204 Test ${Date.now()}`,
    })

    await page.reload()
    await expect(page.getByText(workflow.name)).toBeVisible({ timeout: 5000 })

    // Delete via API directly to verify 204
    const response = await request.delete(
      `${process.env.API_URL || 'http://localhost:4333'}/api/v1/workflows/${workflow.id}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    )

    // Should return 204 No Content
    expect(response.status()).toBe(204)

    // Verify workflow is gone
    const workflows = await getWorkflows(request, token)
    expect(workflows.find((w) => w.id === workflow.id)).toBeUndefined()
  })

  test('import workflow from YAML', async ({ page, request }) => {
    const workflowName = `YAML Import ${Date.now()}`

    await page.getByRole('button', { name: /import yaml/i }).click()

    // Wait for modal
    await expect(page.getByRole('heading', { name: /import.*yaml/i })).toBeVisible()

    // Fill in YAML
    const yamlInput = `name: ${workflowName}
description: Imported from YAML
steps:
  - step_id: step1
    name: First Step
    agent_id: architect
    input_template: |
      Design this: {{task}}
    expects: design
    type: single`

    await page.locator('textarea').fill(yamlInput)

    // Import
    await page.getByRole('button', { name: /import/i }).click()

    // Should show the workflow
    await expect(page.getByText(workflowName)).toBeVisible({ timeout: 5000 })

    // Verify via API
    const workflows = await getWorkflows(request, token)
    const created = workflows.find((w) => w.name === workflowName)
    expect(created).toBeDefined()
    if (created) {
      createdWorkflowIds.push(created.id)
    }
  })

  test('run workflow button exists', async ({ page, request }) => {
    const workflow = await createWorkflow(request, token, {
      name: `Run Test ${Date.now()}`,
      steps: [
        {
          stepId: 'step1',
          name: 'Test Step',
          agentId: 'test-agent',
          inputTemplate: 'Test',
          expects: 'result',
          type: 'single',
          position: 0,
        },
      ],
    })
    createdWorkflowIds.push(workflow.id)

    await page.reload()
    await expect(page.getByText(workflow.name)).toBeVisible({ timeout: 5000 })

    // Run button should exist in the row
    const row = page.locator('tr', { hasText: workflow.name })
    await expect(row.getByRole('button', { name: /run/i })).toBeVisible()
  })
})
