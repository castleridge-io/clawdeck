import { useState } from 'react'
import './Header.css'

export default function Header({ stats, selectedBoard, onBoardChange, boards, agents, onNewTask }) {
  const [showBoardSelector, setShowBoardSelector] = useState(false)

  const agent = selectedBoard
    ? agents.find((a) => selectedBoard.name.includes(a.name)) || {
        emoji: '📋',
        name: 'Unknown',
        color: 'gray',
      }
    : null

  return (
    <header className='header'>
      <div className='header-container'>
        <div className='header-brand'>
          <span className='header-emoji'>🚀</span>
          <div>
            <h1>ClawDeck</h1>
            <p className='header-subtitle'>OpenClaw Task Management</p>
          </div>
        </div>

        <div className='header-stats'>
          <div className='stat'>
            <span className='stat-value'>{stats.totalBoards}</span>
            <span className='stat-label'>Boards</span>
          </div>
          <div className='stat'>
            <span className='stat-value'>{stats.totalTasks}</span>
            <span className='stat-label'>Tasks</span>
          </div>
          <div className='stat'>
            <span className='stat-value'>{stats.inProgress}</span>
            <span className='stat-label'>Active</span>
          </div>
          <div className='stat'>
            <span className='stat-value'>{stats.done}</span>
            <span className='stat-label'>Done</span>
          </div>
        </div>

        <div className='header-actions'>
          {selectedBoard && (
            <>
              <div className='board-selector'>
                <button
                  className='board-selector-button'
                  onClick={() => setShowBoardSelector(!showBoardSelector)}
                >
                  {agent && <span className='board-selector-emoji'>{agent.emoji}</span>}
                  <span>{selectedBoard.name}</span>
                  <svg
                    className='board-selector-arrow'
                    fill='none'
                    viewBox='0 0 24 24'
                    stroke='currentColor'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M19 9l-7 7-7-7'
                    />
                  </svg>
                </button>

                {showBoardSelector && (
                  <div className='board-dropdown'>
                    {boards.map((board) => {
                      const boardAgent = agents.find((a) => board.name.includes(a.name)) || {
                        emoji: '📋',
                        color: 'gray',
                      }
                      return (
                        <button
                          key={board.id}
                          onClick={() => {
                            onBoardChange(board)
                            setShowBoardSelector(false)
                          }}
                          className={`board-dropdown-item ${selectedBoard.id === board.id ? 'active' : ''}`}
                        >
                          <span className='board-dropdown-emoji'>{boardAgent.emoji}</span>
                          <span>{board.name}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <button className='new-task-button' onClick={onNewTask}>
                <svg fill='none' viewBox='0 0 24 24' stroke='currentColor' className='w-5 h-5'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M12 4v16m8-8H4'
                  />
                </svg>
                New Task
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
