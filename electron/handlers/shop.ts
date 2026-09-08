import { ipcMain } from 'electron'
import logger from 'electron-log/main'

const SITE_API = 'https://flugcraft.pl'

export interface IShopProduct {
  id: number
  name: string
  description: string
  image: string
  price: number
  type: number
  rankDuration: number
  rankPromo: boolean
}

export interface IPlayerLookup {
  username: string
  uuid: string
  rank?: string
  [key: string]: any
}

export function registerShopHandlers() {
  ipcMain.handle('shop:get_products', async () => {
    try {
      const res = await fetch(`${SITE_API}/api/shop/products`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return (data?.products ?? []) as IShopProduct[]
    } catch (err) {
      logger.error('Failed to fetch shop products:', err)
      return [] as IShopProduct[]
    }
  })

  ipcMain.handle('player:get_rank', async (_event, username: string) => {
    try {
      const res = await fetch(`${SITE_API}/api/players/lookup?username=${encodeURIComponent(username)}`)
      if (!res.ok) return 'default'
      const data = await res.json()
      const player = data?.player as IPlayerLookup | undefined
      return player?.rank ?? 'default'
    } catch (err) {
      logger.error('Failed to fetch player rank:', err)
      return 'default'
    }
  })
}
