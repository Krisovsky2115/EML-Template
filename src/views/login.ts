import { setUser, setView } from '../state'
import { auth, skin } from '../ipc'
import { Dialog } from './dialog'
import { DEFAULT_SKIN } from '../shared'
import logger from 'electron-log/renderer'
import type { Account } from 'eml-lib'

const NICK_REGEX = /^[a-zA-Z0-9_]{3,16}$/

async function finishLogin(account: Account) {
  if (account.meta.type === 'crack') {
    // Skin API doesn't support crack accounts — fall back to the default skin
    setUser(account, { skins: [{ ...DEFAULT_SKIN }], capes: [], avatar: null })
  } else {
    const [__, skins, capes, avatar] = await Promise.all([
      skin.reload(account),
      skin.getSkin(),
      skin.getCape(),
      skin.getAvatar()
    ])
    setUser(account, { skins, capes, avatar })
  }
  setView('home')
}

export function initLogin() {
  const btn = document.getElementById('btn-login-ms') as HTMLButtonElement | null
  const crackBtn = document.getElementById('btn-login-crack') as HTMLButtonElement | null
  const crackInput = document.getElementById('input-crack-nick') as HTMLInputElement | null

  btn?.addEventListener('click', async () => {
    const originalText = btn.innerHTML

    btn.disabled = true
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Logowanie...'

    try {
      const session = await auth.login()

      if (session.success) {
        await finishLogin(session.account)
      } else {
        logger.error(session.error)
        await Dialog.show('Logowanie nieudane', [{ text: 'OK', type: 'ok' }])
      }
    } catch (err) {
      logger.error(err)
      await Dialog.show('Wystąpił błąd podczas logowania.', [{ text: 'OK', type: 'ok' }])
    } finally {
      btn.disabled = false
      btn.innerHTML = originalText
    }
  })

  crackInput?.addEventListener('input', () => {
    if (crackBtn) crackBtn.disabled = !NICK_REGEX.test(crackInput.value.trim())
  })

  crackInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && crackBtn && !crackBtn.disabled) crackBtn.click()
  })

  crackBtn?.addEventListener('click', async () => {
    const username = crackInput?.value.trim() ?? ''
    if (!NICK_REGEX.test(username)) return

    const originalText = crackBtn.innerHTML
    crackBtn.disabled = true
    crackBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Logowanie...'

    try {
      const session = await auth.loginCrack(username)

      if (session.success) {
        await finishLogin(session.account)
      } else {
        logger.error(session.error)
        await Dialog.show('Logowanie nieudane — sprawdź nick.', [{ text: 'OK', type: 'ok' }])
      }
    } catch (err) {
      logger.error(err)
      await Dialog.show('Wystąpił błąd podczas logowania.', [{ text: 'OK', type: 'ok' }])
    } finally {
      crackBtn.disabled = false
      crackBtn.innerHTML = originalText
    }
  })
}
