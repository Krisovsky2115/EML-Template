import { ipcMain } from 'electron'
import { Profiles } from 'eml-lib'
import logger from 'electron-log/main'
import { ADMINTOOL_URL, DEFAULT_PROFILE_SLUG } from '../const'

export function registerProfilesHandlers() {
  ipcMain.handle('profiles:get', async () => {
    const profiles = new Profiles(ADMINTOOL_URL)

    try {
      const list = await profiles.getProfiles()
      const defaultProfile = list.find((p) => p.isDefault) ?? list.find((p) => p.slug === DEFAULT_PROFILE_SLUG)
      const sorted = defaultProfile ? [defaultProfile, ...list.filter((p) => p.slug !== defaultProfile.slug)] : list
      return sorted
    } catch (err) {
      logger.error('Failed to fetch profiles:', err)
      return null
    }
  })
}

