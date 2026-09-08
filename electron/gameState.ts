import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

let gamePid: number | null = null
let pollInterval: NodeJS.Timeout | null = null

export function getGamePid(): number | null {
  return gamePid
}

export function setGamePid(pid: number | null) {
  gamePid = pid
}

export function clearGamePid() {
  gamePid = null
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}

export async function findGamePid(): Promise<number | null> {
  try {
    const { stdout } = await execAsync('wmic process where "name=\'java.exe\' or name=\'javaw.exe\'" get ParentProcessId,ProcessId')
    const lines = stdout.split(/\r?\n/).slice(1)
    for (const line of lines) {
      const parts = line.trim().split(/\s+/)
      if (parts.length >= 2) {
        const parent = parseInt(parts[0], 10)
        const pid = parseInt(parts[1], 10)
        if (parent === process.pid && !isNaN(pid)) {
          return pid
        }
      }
    }
  } catch {}
  return null
}

export function startGameTracking(found?: (pid: number) => void) {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
  gamePid = null

  pollInterval = setInterval(async () => {
    const pid = await findGamePid()
    if (pid) {
      gamePid = pid
      if (pollInterval) {
        clearInterval(pollInterval)
        pollInterval = null
      }
      found?.(pid)
    }
  }, 500)

  setTimeout(() => {
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }
  }, 15000)
}

export async function stopGame(): Promise<void> {
  const pid = gamePid ?? (await findGamePid())
  if (!pid) return
  try {
    await execAsync(`taskkill /pid ${pid} /f /t`)
  } catch {}
  clearGamePid()
}
