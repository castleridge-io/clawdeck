import { test, expect } from '@playwright/test'
import { login, createBoard, deleteBoard, createTask, deleteTask, getOrCreateOrganization } from '../helpers/api'

test.describe('Boards / Kanban', () => {
  let token: string
  let userId: string
  let organizationId: string
  const createdBoardIds: string[] = []
  const createdTaskIds: string[] = []

  test.beforeAll(async ({ request }) => {
    token = await login(request)
    // Use default user ID from admin login (ID is always '1' for seeded admin user)
    userId = '1'
    // Create or get organization
    const org = await getOrCreateOrganization(request, token)
    organizationId = org.id
  })

  test.afterAll(async ({ request }) => {
    // Cleanup
    for (const id of createdTaskIds) {
      try {
        await deleteTask(request, token, id)
      } catch {
        // Ignore
      }
    }
    for (const id of createdBoardIds) {
      try {
        await deleteBoard(request, token, id)
      } catch {
        // Ignore
      }
    }
  })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /dev login/i }).click()
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 })
    await page.goto('/boards')
  })

  test('displays kanban board structure', async ({ page }) => {
    // Should show the 5 columns
    await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Up Next' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'In Progress' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'In Review' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Done' })).toBeVisible()
  })

  test('shows filter bar', async ({ page }) => {
    await expect(page.getByPlaceholder(/search tasks/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /^status$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^priority$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^assignee$/i })).toBeVisible()
  })

  test('filter by search text', async ({ page, request }) => {
    // Create a board and task
    const boardName = `Filter Board ${Date.now()}`
    const board = await createBoard(request, token, userId, organizationId, { name: boardName })
    createdBoardIds.push(board.id)

    const task1 = await createTask(request, token, board.id, { name: 'UniqueTaskAlpha' })
    const task2 = await createTask(request, token, board.id, { name: 'UniqueTaskBeta' })
    createdTaskIds.push(task1.id, task2.id)

    // Refresh
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Select the newly created board by value (id)
    // Use first() because there are multiple selects (org + board)
    const boardSelector = page.locator('select').nth(1)
    await boardSelector.selectOption(board.id)

    // Search for first task
    await page.getByPlaceholder(/search tasks/i).fill('Alpha')

    // Should show only matching task
    await expect(page.getByText('UniqueTaskAlpha')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('UniqueTaskBeta')).not.toBeVisible()
  })

  test('create task via modal', async ({ page, request }) => {
    // First create a board
    const boardName = `Task Board ${Date.now()}`
    const board = await createBoard(request, token, userId, organizationId, { name: boardName })
    createdBoardIds.push(board.id)

    await page.reload()
    await page.waitForLoadState('networkidle')

    // Select the newly created board by value (id)
    // Use nth(1) because there are multiple selects (org + board)
    const boardSelector = page.locator('select').nth(1)
    await boardSelector.selectOption(board.id)

    // Wait a moment for the board selection to take effect
    await page.waitForTimeout(500)

    // Click new task - ensure button is enabled
    const newTaskButton = page.getByRole('button', { name: /new task/i })
    await expect(newTaskButton).toBeEnabled()
    await newTaskButton.click()

    // Wait for modal to appear
    await expect(page.getByRole('heading', { name: /new task/i })).toBeVisible()

    // Fill task form using correct IDs
    const taskName = `New Task ${Date.now()}`
    await page.locator('#task-name').fill(taskName)
    await page.locator('#task-description').fill('Task description')

    // Save - use the modal's save button
    await page.locator('.modal-body button[type="submit"]').click()

    // Should show in kanban
    await expect(page.getByText(taskName)).toBeVisible({ timeout: 10000 })
  })

  test('task card is visible in kanban', async ({ page, request }) => {
    const boardName = `Card Board ${Date.now()}`
    const board = await createBoard(request, token, userId, organizationId, { name: boardName })
    createdBoardIds.push(board.id)

    const taskName = `Visible Task ${Date.now()}`
    const task = await createTask(request, token, board.id, {
      name: taskName,
      status: 'inbox',
    })
    createdTaskIds.push(task.id)

    await page.reload()

    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle')

    // Select the newly created board by value (id)
    // Use nth(1) because there are multiple selects (org + board)
    const boardSelector = page.locator('select').nth(1)
    await expect(boardSelector).toBeVisible({ timeout: 5000 })
    await boardSelector.selectOption(board.id)

    // Task should be visible
    await expect(page.getByText(taskName)).toBeVisible({ timeout: 5000 })
  })

  test('delete task', async ({ page, request }) => {
    const boardName = `Delete Task Board ${Date.now()}`
    const board = await createBoard(request, token, userId, organizationId, { name: boardName })
    createdBoardIds.push(board.id)

    const task = await createTask(request, token, board.id, {
      name: `Task To Delete ${Date.now()}`,
    })

    await page.reload()
    await page.waitForLoadState('networkidle')

    // Select the newly created board by value (id)
    // Use first() because there are multiple selects (org + board)
    const boardSelector = page.locator('select').nth(1)
    await boardSelector.selectOption(board.id)

    await expect(page.getByText(task.name)).toBeVisible({ timeout: 5000 })

    // Click on task to show actions
    await page.getByText(task.name).click()

    // Click delete (handle confirmation dialog)
    page.on('dialog', (dialog) => dialog.accept())
    await page
      .getByRole('button', { name: /delete/i })
      .first()
      .click()

    // Should be gone
    await expect(page.getByText(task.name)).not.toBeVisible({ timeout: 5000 })
  })

  test('status filter works', async ({ page, request }) => {
    const boardName = `Status Filter Board ${Date.now()}`
    const board = await createBoard(request, token, userId, organizationId, { name: boardName })
    createdBoardIds.push(board.id)

    const inboxTask = await createTask(request, token, board.id, {
      name: 'Inbox Task Filter',
      status: 'inbox',
    })
    const doneTask = await createTask(request, token, board.id, {
      name: 'Done Task Filter',
      status: 'done',
    })
    createdTaskIds.push(inboxTask.id, doneTask.id)

    await page.reload()
    await page.waitForLoadState('networkidle')

    // Select the newly created board by value (id)
    // Use first() because there are multiple selects (org + board)
    const boardSelector = page.locator('select').nth(1)
    await boardSelector.selectOption(board.id)

    // Open status filter
    await page.getByRole('button', { name: /^status$/i }).click()

    // Select only "Inbox"
    await page.locator('label', { hasText: 'Inbox' }).click()

    // Should show inbox task, not done task
    await expect(page.getByText('Inbox Task Filter')).toBeVisible({ timeout: 5000 })

    // Clear filter by clicking clear button
    const clearBtn = page.getByRole('button', { name: /clear/i })
    if (await clearBtn.isVisible()) {
      await clearBtn.click()
    }

    // Both should be visible now
    await expect(page.getByText('Done Task Filter')).toBeVisible({ timeout: 5000 })
  })

  test('shows empty state or kanban when no boards', async ({ page }) => {
    // The kanban columns structure should always be visible
    await expect(page.locator('.kanban-columns')).toBeVisible()
  })
})
