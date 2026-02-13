import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getBoards, getTasks, createTask, updateTask, deleteTask } from '../lib/api'

// Mock the auth module
vi.mock('../lib/auth', () => ({
  getToken: vi.fn(() => 'test-jwt-token'),
  clearToken: vi.fn(),
}))

describe('api module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetch).mockReset()
  })

  describe('getBoards', () => {
    it('fetches boards from /boards endpoint', async () => {
      const mockBoards = [{ id: '1', name: 'Board 1' }]
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockBoards }),
      } as Response)

      const result = await getBoards()

      expect(result).toEqual(mockBoards)
      expect(fetch).toHaveBeenCalledWith(
        '/api/v1/boards',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-jwt-token',
          }),
        })
      )
    })

    it('handles empty response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response)

      const result = await getBoards()

      expect(result).toEqual([])
    })
  })

  describe('getTasks', () => {
    it('fetches tasks with board_id query param', async () => {
      const mockTasks = [{ id: '1', name: 'Task 1', status: 'inbox' }]
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockTasks }),
      } as Response)

      const result = await getTasks('board-123')

      expect(result).toEqual(mockTasks)
      expect(fetch).toHaveBeenCalledWith(
        '/api/v1/tasks?board_id=board-123',
        expect.any(Object)
      )
    })
  })

  describe('createTask', () => {
    it('POSTs task data to /tasks', async () => {
      const newTask = { name: 'New Task', board_id: 'board-1', status: 'inbox' as const }
      const createdTask = { id: '1', ...newTask }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: createdTask }),
      } as Response)

      const result = await createTask(newTask)

      expect(result).toEqual(createdTask)
      expect(fetch).toHaveBeenCalledWith(
        '/api/v1/tasks',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(newTask),
        })
      )
    })
  })

  describe('updateTask', () => {
    it('PATCHes task data to /tasks/:id', async () => {
      const updates = { status: 'done' as const }
      const updatedTask = { id: '1', name: 'Task', status: 'done' }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: updatedTask }),
      } as Response)

      const result = await updateTask('1', updates)

      expect(result).toEqual(updatedTask)
      expect(fetch).toHaveBeenCalledWith(
        '/api/v1/tasks/1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updates),
        })
      )
    })
  })

  describe('deleteTask', () => {
    it('DELETEs task from /tasks/:id', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response)

      const result = await deleteTask('1')

      expect(result).toBe(true)
      expect(fetch).toHaveBeenCalledWith(
        '/api/v1/tasks/1',
        expect.objectContaining({
          method: 'DELETE',
        })
      )
    })
  })

  describe('error handling', () => {
    it('throws error with message on failure', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Bad request' }),
      } as Response)

      await expect(getBoards()).rejects.toThrow('Bad request')
    })
  })
})
