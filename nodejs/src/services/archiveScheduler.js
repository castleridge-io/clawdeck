// Archive Scheduler Service
// Automatically archives completed tasks after a configured delay

import { prisma } from '../db/prisma.js'
import { wsManager } from '../websocket/manager.js'

const ARCHIVE_DELAY_HOURS = parseInt(process.env.ARCHIVE_DELAY_HOURS || '24', 10)
const SCHEDULER_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

// Helper function to check if archiving is enabled
function isArchiveEnabled() {
  return process.env.ARCHIVE_ENABLED !== 'false'
}

class ArchiveScheduler {
  constructor() {
    this.intervalId = null
    this.isRunning = false
  }

  start() {
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

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      this.isRunning = false
      console.log('Archive scheduler stopped')
    }
  }

  async run() {
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
            lt: cutoffDate
          }
        },
        include: {
          board: {
            select: {
              userId: true
            }
          }
        }
      })

      if (tasksToArchive.length === 0) {
        return
      }

      console.log(`Archiving ${tasksToArchive.length} task(s) completed before ${cutoffDate.toISOString()}`)

      for (const task of tasksToArchive) {
        await this.archiveTask(task)
      }

      console.log(`Successfully archived ${tasksToArchive.length} task(s)`)
    } catch (error) {
      console.error('Error in archive scheduler:', error)
    }
  }

  async archiveTask(task) {
    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: {
        archived: true,
        archivedAt: new Date(),
        archiveScheduled: false,
        archiveScheduledAt: null
      }
    })

    // Record activity
    await prisma.taskActivity.create({
      data: {
        taskId: task.id,
        userId: task.board?.userId || null,
        action: 'archived',
        actorType: 'system',
        fieldName: 'archived',
        oldValue: 'false',
        newValue: 'true',
        source: 'scheduler'
      }
    })

    // Broadcast WebSocket event
    const taskData = this.taskToJson(updatedTask)
    wsManager.broadcastTaskEvent(task.board?.userId, 'task_archived', taskData)
  }

  taskToJson(task) {
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
      updated_at: task.updatedAt.toISOString()
    }
  }

  // Schedule a task for immediate archiving (override delay)
  async scheduleImmediateArchive(taskId) {
    const task = await prisma.task.findUnique({
      where: { id: BigInt(taskId) },
      include: {
        board: {
          select: {
            userId: true
          }
        }
      }
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

    await this.archiveTask(task)

    // Fetch the updated task to return
    const updatedTask = await prisma.task.findUnique({
      where: { id: BigInt(taskId) }
    })

    return this.taskToJson(updatedTask)
  }
}

// Singleton instance
export const archiveScheduler = new ArchiveScheduler()
