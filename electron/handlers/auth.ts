import { ipcMain, app } from 'electron'
import { MicrosoftAuth, CrackAuth } from 'eml-lib'
import type { Account } from 'eml-lib'
import logger from 'electron-log/main'
import { stopGame } from '../gameState'
import * as fs from 'node:fs'
import * as path from 'node:path'

const sessionPath = path.join(app.getPath('userData'), 'session.json')

export type IAuthResponse = { success: true; account: Account } | { success: false; error: string }

export function registerAuthHandlers(mainWindow: Electron.BrowserWindow) {
  const auth = new MicrosoftAuth(mainWindow)

  ipcMain.handle('auth:login', async () => {
    try {
      const account = await auth.auth()
      fs.writeFileSync(sessionPath, JSON.stringify(account))
      return { success: true, account } as IAuthResponse
    } catch (err: any) {
      logger.error('Failed to login:', err)
      return { success: false, error: err.message ?? 'Unknown error' }
    }
  })

  ipcMain.handle('auth:loginCrack', async (_event, username: string) => {
    try {
      const account = new CrackAuth().auth(username)
      fs.writeFileSync(sessionPath, JSON.stringify(account))
      return { success: true, account } as IAuthResponse
    } catch (err: any) {
      logger.error('Failed to login with crack account:', err)
      return { success: false, error: err.message ?? 'Unknown error' }
    }
  })

  ipcMain.handle('auth:refresh', async () => {
    if (!fs.existsSync(sessionPath)) {
      return { success: false } as { success: false }
    }

    try {
      const data = fs.readFileSync(sessionPath, 'utf-8')
      const savedSession = JSON.parse(data) as Account

      if (savedSession?.meta?.type === 'crack') {
        return { success: true, account: savedSession } as IAuthResponse
      }

      if (savedSession && savedSession.uuid) {
        const valid = await auth.validate(savedSession)
        if (valid) {
          return { success: true, account: savedSession } as IAuthResponse
        }
        const account = await auth.refresh(savedSession)
        fs.writeFileSync(sessionPath, JSON.stringify(account))
        return { success: true, account } as IAuthResponse
      }
      return { success: false }
    } catch (err: any) {
      logger.error('Failed to refresh session:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('auth:logout', async () => {
    await stopGame()
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath)
    }
    return { success: true }
  })
}


