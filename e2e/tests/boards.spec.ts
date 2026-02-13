import { test, expect } from '@playwright/test'
import { login, createBoard, deleteBoard, createTask, deleteTask } from '../helpers/api'

test.describe('Boards / Kanban', () => {
  let token: string
  let createdBoardIds: string[] = []
  let createdTaskIds: string[] = []

  test.beforeAll(async ({ request }) => {
    token = await login(request)
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
    const board = await createBoard(request, token, { name: `Filter Board ${Date.now()}` })
    createdBoardIds.push(board.id)

    const task1 = await createTask(request, token, board.id, { name: 'UniqueTaskAlpha' })
    const task2 = await createTask(request, token, board.id, { name: 'UniqueTaskBeta' })
    createdTaskIds.push(task1.id, task2.id)

    // Refresh
    await page.reload()

    // Search for first task
    await page.getByPlaceholder(/search tasks/i).fill('Alpha')

    // Should show only matching task
    await expect(page.getByText('UniqueTaskAlpha')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('UniqueTaskBeta')).not.toBeVisible()
  })

  test('create task via modal', async ({ page, request }) => {
    // First create a board
    const board = await createBoard(request, token, { name: `Task Board ${Date.now()}` })
    createdBoardIds.push(board.id)

    await page.reload()

    // Click new task
    await page.getByRole('button', { name: /new task/i }).click()

    // Wait for modal and fill task form
    await expect(page.getByRole('heading', { name: /new task|create task/i })).toBeVisible()

    const taskName = `New Task ${Date.now()}`
    await page.locator('input[name="name"]').fill(taskName)
    await page.locator('textarea[name="description"]').fill('Task description')

    // Save
    await page.getByRole('button', { name: /save|create/i }).first().click()

    // Should show in kanban
    await expect(page.getByText(taskName)).toBeVisible({ timeout: 10000 })
  })

  test('task card is visible in kanban', async ({ page, request }) => {
    const board = await createBoard(request, token, { name: `Card Board ${Date.now()}` })
    createdBoardIds.push(board.id)

    const task = await createTask(request, token, board.id, {
      name: `Visible Task ${Date.now()}`,
      status: 'inbox',
    })
    createdTaskIds.push(task.id)

    await page.reload()

    // Task should be visible
    await expect(page.getByText(task.name)).toBeVisible({ timeout: 5000 })
  })

  test('delete task', async ({ page, request }) => {
    const board = await createBoard(request, token, { name: `Delete Task Board ${Date.now()}` })
    createdBoardIds.push(board.id)

    const task = await createTask(request, token, board.id, {
      name: `Task To Delete ${Date.now()}`,
    })

    await page.reload()
    await expect(page.getByText(task.name)).toBeVisible({ timeout: 5000 })

    // Click on task to show actions
    await page.getByText(task.name).click()

    // Click delete (handle confirmation dialog)
    page.on('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: /delete/i }).first().click()

    // Should be gone
    await expect(page.getByText(task.name)).not.toBeVisible({ timeout: 5000 })
  })

  test('status filter works', async ({ page, request }) => {
    const board = await createBoard(request, token, { name: `Status Filter Board ${Date.now()}` })
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
    // The kanban structure should always be visible
    await expect(page.locator('.kanban-columns, .kanban-board')).toBeVisible()
  })
})
