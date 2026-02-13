// Archive Scheduler Service
// Automatically archives completed tasks after a configured delay

import { prisma } from '../db/prisma.js'
import { wsManager } from '../websocket/manager.js'
import type { Task, Board, Prisma } from '@prisma/client'

const ARCHIVE_DELAY_HOURS = parseInt(process.env.ARCHIVE_DELAY_HOURS || '24', 10)
const SCHEDULER_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

// Helper function to check if archiving is enabled
function isArchiveEnabled (): boolean {
  return process.env.ARCHIVE_ENABLED !== 'false'
}

interface TaskWithBoard extends Task {
  board: { userId: bigint } | null
}

interface TaskJson {
  id: string
  name: string
  description: string | null
  status: string
  priority: string
  position: number | null
  board_id: string
  user_id: string | undefined
  completed: boolean
  completed_at: string | null
  archived: boolean
  archived_at: string | null
  created_at: string
  updated_at: string
}

class ArchiveScheduler {
  private intervalId: NodeJS.Timeout | null = null
  private isRunning: boolean = false

  start (): void {
    if (this.isRunning) {
      console.log('Archive scheduler already running')
      return
    }

    if (!isArchiveEnabled()) {
      console.log('Archive scheduler disabled (ARCHIVE_ENABLED=false)')
      return
    }

    console.log(`Archive scheduler started - Archiving tasks after ${ARCHIVE_DELAY_HOURS} hours`)
    this.isRunning = true

    // Run immediately on start, then on interval
    this.run()

    this.intervalId = setInterval(() => {
      this.run()
    }, SCHEDULER_INTERVAL_MS)
  }

  stop (): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      this.isRunning = false
      console.log('Archive scheduler stopped')
    }
  }

  async run (): Promise<void> {
    try {
      const cutoffDate = new Date()
      cutoffDate.setHours(cutoffDate.getHours() - ARCHIVE_DELAY_HOURS)

      // Find tasks that should be archived:
      // - Status is 'done'
      // - Not already archived
      // - Completed before the cutoff date
      const tasksToArchive = await prisma.task.findMany({
        where: {
          status: 'done',
          archived: false,
          completedAt: {
            lt: cutoffDate,
          },
        },
        include: {
          board: {
            select: {
              userId: true,
            },
          },
        },
      })

      if (tasksToArchive.length === 0) {
        return
      }

      console.log(
        `Archiving ${tasksToArchive.length} task(s) completed before ${cutoffDate.toISOString()}`
      )

      for (const task of tasksToArchive) {
        await this.archiveTask(task as TaskWithBoard)
      }

      console.log(`Successfully archived ${tasksToArchive.length} task(s)`)
    } catch (error) {
      console.error('Error in archive scheduler:', error)
    }
  }

  async archiveTask (task: TaskWithBoard): Promise<void> {
    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: {
        archived: true,
        archivedAt: new Date(),
        archiveScheduled: false,
        archiveScheduledAt: null,
      },
    })

    // Record activity
    await prisma.taskActivity.create({
      data: {
        taskId: task.id,
        userId: task.board?.userId ?? null,
        action: 'archived',
        actorType: 'system',
        fieldName: 'archived',
        oldValue: 'false',
        newValue: 'true',
        source: 'scheduler',
      },
    })

    // Broadcast WebSocket event
    const taskData = this.taskToJson(updatedTask)
    wsManager.broadcastTaskEvent(task.board?.userId ?? null, 'task_archived', taskData)
  }

  taskToJson (task: Task): TaskJson {
    return {
      id: task.id.toString(),
      name: task.name,
      description: task.description,
      status: task.status,
      priority: task.priority,
      position: task.position,
      board_id: task.boardId.toString(),
      user_id: task.userId?.toString(),
      completed: task.completed,
      completed_at: task.completedAt?.toISOString() ?? null,
      archived: task.archived,
      archived_at: task.archivedAt?.toISOString() ?? null,
      created_at: task.createdAt.toISOString(),
      updated_at: task.updatedAt.toISOString(),
    }
  }

  // Schedule a task for immediate archiving (override delay)
  async scheduleImmediateArchive (taskId: string | bigint): Promise<TaskJson> {
    const task = await prisma.task.findUnique({
      where: { id: BigInt(taskId) },
      include: {
        board: {
          select: {
            userId: true,
          },
        },
      },
    })

    if (!task) {
      throw new Error('Task not found')
    }

    if (task.status !== 'done') {
      throw new Error('Only completed tasks can be archived')
    }

    if (task.archived) {
      throw new Error('Task is already archived')
    }

    await this.archiveTask(task as TaskWithBoard)

    // Fetch the updated task to return
    const updatedTask = await prisma.task.findUnique({
      where: { id: BigInt(taskId) },
    })

    if (!updatedTask) {
      throw new Error('Task not found after archive')
    }

    return this.taskToJson(updatedTask)
  }
}

// Singleton instance
export const archiveScheduler = new ArchiveScheduler()
