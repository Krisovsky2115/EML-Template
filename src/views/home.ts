import { setView, getUser } from '../state'
import { game, news, server, settings, profiles, shop, player } from '../ipc'
import { Dialog } from './dialog'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import logger from 'electron-log/renderer'

marked.use({
  renderer: {
    link(link) {
      const href = link.href ?? '#'
      const titleAttr = link.title ? ` title="${link.title}"` : ''
      return `<a href="${href}" target="_blank" rel="noopener noreferrer"${titleAttr}>${link.text}</a>`
    }
  }
})

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
}

const formatBytes = (bytes: number) => {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

const formatEta = (seconds: number) => {
  if (!isFinite(seconds) || seconds <= 0) return ''
  if (seconds < 60) return `~${Math.ceil(seconds)} s`
  const m = Math.floor(seconds / 60)
  const s = Math.ceil(seconds % 60)
  return `~${m} min ${s} s`
}

const SHOP_URL = 'https://flugcraft.pl/shop'

const RANKS: Record<string, { label: string; color: string }> = {
  default: { label: 'Gracz', color: '#c9d3ca' },
  mieszkaniec: { label: 'Mieszkaniec', color: '#c9d3ca' },
  cesarz: { label: 'Cesarz', color: '#ffde59' },
  vip: { label: 'VIP', color: '#7ed957' },
  svip: { label: 'SVIP', color: '#7ed957' },
  mvp: { label: 'MVP', color: '#ffde59' },
  sponsor: { label: 'Sponsor', color: '#ffde59' },
  support: { label: 'Support', color: '#90caf9' },
  mod: { label: 'Moderator', color: '#90caf9' },
  moderator: { label: 'Moderator', color: '#90caf9' },
  admin: { label: 'Administrator', color: '#7ed957' },
  'head-admin': { label: 'Head-Admin', color: '#ffde59' },
  superadmin: { label: 'Head-Admin', color: '#ffde59' },
  wlasciciel: { label: 'Właściciel', color: '#ffde59' },
  root: { label: 'ROOT', color: '#ffde59' }
}

const getRank = (rank: string | undefined) => RANKS[(rank ?? 'default').toLowerCase()] ?? RANKS.default

const parseNews = (rawContent: string) =>
  DOMPurify.sanitize(marked.parse(rawContent) as string, {
    ADD_ATTR: ['target']
  })

const backgroundColor = (color: string) => {
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, 0.1)`
}

export function initHome() {
  const body = document.body
  const playBtn = document.getElementById('btn-play')
  const settingsBtn = document.getElementById('btn-settings')
  const progressContainer = document.getElementById('launch-progress-container')
  const progressBar = document.getElementById('launch-progress-bar')
  const progressLabel = document.getElementById('launch-progress-label')
  const progressPercent = document.getElementById('launch-progress-percent')
  const statusDot = document.getElementById('server-status-dot')
  const statusText = document.getElementById('server-status-text')
  const playerCount = document.getElementById('player-count')
  const newsList = document.getElementById('news-list')
  const profileSelector = document.getElementById('profile-selector')
  const profileDropdown = document.getElementById('profile-dropdown')
  const currentProfileName = document.getElementById('current-profile-name')
  const progressSpeed = document.getElementById('launch-progress-speed')
  const shopList = document.getElementById('shop-list')
  const rankBadge = document.querySelector('.rank-badge') as HTMLElement | null

  let selectedProfile: any = null
  let allProfiles: any[] = []
  let totalToDownload = 0
  let totalDownloadedByType: { type: string; size: number }[] = []
  let statusInterval: ReturnType<typeof setInterval> | null = null
  let statusPingInFlight = false
  let lastSpeedSample: { time: number; downloaded: number } | null = null
  let isGameRunning = false

  const loadProfiles = async () => {
    const result = await profiles.get()
    allProfiles = Array.isArray(result) ? result : []
    if (allProfiles.length > 0) {
      selectProfile(allProfiles[0])
    }
  }

  const renderDropdown = () => {
    if (!profileDropdown) return
    profileDropdown.innerHTML = allProfiles
      .map(
        (p) => `
      <div class="profile-option ${selectedProfile?.id === p.id ? 'active' : ''}" data-id="${p.id}">
        ${p.name}
      </div>
    `
      )
      .join('')

    profileDropdown.querySelectorAll('.profile-option').forEach((opt) => {
      opt.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id
        const profile = allProfiles.find((p) => p.id === id)
        if (profile) selectProfile(profile)
        profileSelector?.classList.remove('open')
      })
    })
  }

  const selectProfile = (profile: any) => {
    selectedProfile = profile
    if (currentProfileName && profile) currentProfileName.innerText = profile.name
    renderDropdown()
    updateServerStatus()
    updatePlayButtonLabel()
  }

  const updateServerStatus = async () => {
    if (statusPingInFlight) return
    statusPingInFlight = true
    if (statusDot) {
      statusDot.classList.remove('online', 'offline')
      statusDot.classList.add('pinging')
    }
    if (statusText) statusText.innerHTML = 'Sprawdzanie...'
    if (playerCount) playerCount.innerHTML = ''

    try {
      const status = selectedProfile ? await server.getStatus(selectedProfile.ip, selectedProfile.port || 25565) : null

      if (status) {
        if (statusDot) {
          statusDot.classList.remove('pinging', 'offline')
          statusDot.classList.add('online')
        }
        if (statusText) statusText.innerHTML = 'Serwer online'

        if (playerCount) {
          playerCount.innerHTML = `<i class="fa-fw fa-solid fa-users"></i>&nbsp;&nbsp;${status.players.online.toLocaleString('pl-PL')} / ${status.players.max.toLocaleString('pl-PL')}`
        }
      } else {
        if (statusDot) {
          statusDot.classList.remove('pinging', 'online')
          statusDot.classList.add('offline')
        }
        if (statusText) statusText.innerHTML = 'Serwer offline'
        if (playerCount) playerCount.innerHTML = ''
      }
    } finally {
      statusPingInFlight = false
    }
  }

  const loadNews = async () => {
    if (!newsList) return
    newsList.innerHTML = Array.from({ length: 3 })
      .map(
        () => `
      <article class="news-article skeleton">
        <div class="skeleton-line" style="width: 40%; height: 12px;"></div>
        <div class="skeleton-line" style="width: 75%; height: 24px;"></div>
        <div class="skeleton-line" style="width: 100%; height: 90px;"></div>
        <div class="skeleton-line" style="width: 90%; height: 12px;"></div>
        <div class="skeleton-line" style="width: 60%; height: 12px;"></div>
      </article>
    `
      )
      .join('')
    const feed = await news.getNews()

    newsList.innerHTML = ''

    if (!feed || feed.length === 0) {
      newsList.innerHTML = '<div style="text-align:center; color: #888;">Brak aktualności.</div>'
      return
    }

    feed.forEach((item: any) => {
      let tagsHTML = ''
      item.tags.forEach((tag: any) => {
        tagsHTML += `<span class="tag" style="color: ${tag.color}; background-color: ${backgroundColor(tag.color)}">${tag.name}</span>`
      })
      const articleHTML = `
        <article class="news-article">
          <div class="article-meta">
            <div class="author">
              <img src="https://minotar.net/helm/${item.author.username}/24" alt="Author" />
              <span>${item.author.username ?? 'Admin Team'}</span>
            </div>
            <span class="separator">•</span>
            <span class="date">${formatDate(item.createdAt)}</span>
            <span class="separator">•</span>
            <div class="tags-container">${tagsHTML}</div>
          </div>

          <h3>${item.title}</h3>
          
          ${item.image ? `<img src="${item.image}" alt="News Image" onerror="this.style.display='none'"/>` : ''}

          <div class="article-content">
            ${parseNews(item.content)}
          </div>
        </article>
      `

      newsList.insertAdjacentHTML('beforeend', articleHTML)
    })
  }

  const loadShop = async () => {
    if (!shopList) return
    shopList.innerHTML = Array.from({ length: 3 })
      .map(() => '<div class="shop-item"><div class="skeleton-line" style="width: 50px; height: 40px;"></div><div class="shop-item-details"><div class="skeleton-line" style="width: 70%; height: 12px;"></div><div class="skeleton-line" style="width: 40%; height: 11px; margin-top: 5px;"></div></div></div>')
      .join('')

    const products = await shop.getProducts()
    shopList.innerHTML = ''

    if (!products.length) {
      shopList.innerHTML = '<div class="shop-empty">Nie udało się załadować oferty.</div>'
      return
    }

    products.forEach((p) => {
      const item = document.createElement('a')
      item.className = 'shop-item'
      item.href = SHOP_URL
      item.target = '_blank'
      item.rel = 'noopener noreferrer'
      item.title = p.description || p.name
      item.innerHTML = `
        <img src="${p.image}" class="shop-item-image" alt="${p.name}" onerror="this.style.display='none'" />
        <div class="shop-item-details">
          <span class="item-name">${p.name}${p.rankPromo ? ' <span class="item-promo">PROMO</span>' : ''}</span>
          <span class="item-price">${p.price} zł${p.rankDuration ? ` / ${p.rankDuration} dni` : ''}</span>
        </div>
        <i class="fa-solid fa-arrow-up-right-from-square shop-item-link"></i>
      `
      shopList.appendChild(item)
    })
  }

  const loadRank = async () => {
    const user = getUser()
    if (!rankBadge || !user?.name) return
    const rank = getRank(await player.getRank(user.name))
    rankBadge.innerText = rank.label
    rankBadge.style.color = rank.color
    rankBadge.style.borderColor = `${rank.color}55`
    rankBadge.style.backgroundColor = `${rank.color}14`
  }

  loadProfiles()
  updateServerStatus()
  loadNews()
  loadShop()
  loadRank()

  if (statusInterval) clearInterval(statusInterval)
  statusInterval = setInterval(updateServerStatus, 60000)

  const setIndeterminate = (active: boolean) => {
    if (!progressBar || !progressPercent) return

    if (active) {
      progressBar.classList.add('indeterminate')
      progressPercent.style.display = 'none'
      if (progressSpeed) progressSpeed.innerText = ''
    } else {
      progressBar.classList.remove('indeterminate')
      progressPercent.style.display = 'block'
    }
  }

  const setProgressText = (text: string) => {
    if (!progressLabel) return
    progressLabel.classList.remove('error')
    progressLabel.innerText = text
  }

  settingsBtn?.addEventListener('click', () => {
    setView('settings')
  })

  let playAction: 'server' | 'game' = 'server'

  const canConnect = () => playAction === 'server' && !!selectedProfile?.ip

  const updatePlayButtonLabel = () => {
    if (!playBtn || isGameRunning) return
    playBtn.innerText = canConnect() ? 'Połącz z serwerem' : 'Graj'
  }

  const refreshPlayAction = async () => {
    const s = await settings.get()
    playAction = s.playAction ?? 'server'
    updatePlayButtonLabel()
  }

  refreshPlayAction()
  window.addEventListener('settings:saved', refreshPlayAction)

  const setButtonRunning = () => {
    isGameRunning = true
    if (playBtn) {
      playBtn.innerText = 'Stop'
      playBtn.style.background = '#f04747'
      playBtn.style.color = '#fff'
      playBtn.style.display = 'block'
    }
    if (progressContainer) progressContainer.classList.add('hidden')
  }

  const setButtonStopped = () => {
    isGameRunning = false
    if (playBtn) {
      playBtn.style.background = ''
      playBtn.style.color = ''
      playBtn.style.display = 'block'
      updatePlayButtonLabel()
    }
    if (progressContainer) progressContainer.classList.add('hidden')
  }

  const launchGame = async () => {
    const connectToServer = canConnect()

    const user = getUser()
    if (!user) return

    const config = await settings.get()

    if (config.memory.min < 4) {
      const playAnyway = await Dialog.show(
        `Paczka zaleca minimum 4 GB RAM. Przy ustawionych ${config.memory.min} GB gra może działać niestabilnie.`,
        [
          { text: 'Zamknij', type: 'cancel' },
          { text: 'Graj mimo to', type: 'ok' }
        ],
        'Niski poziom pamięci RAM'
      )
      if (playAnyway !== true) return
    }

    setIndeterminate(true)
    totalToDownload = 0
    totalDownloadedByType = []
    lastSpeedSample = null
    if (playBtn) playBtn.style.display = 'none'
    if (progressContainer) progressContainer.classList.remove('hidden')
    if (progressBar) progressBar.style.width = '0%'
    if (progressPercent) progressPercent.innerText = '0%'
    if (progressLabel) {
      progressLabel.classList.remove('error')
      progressLabel.innerText = 'Przygotowanie...'
    }
    if (progressSpeed) progressSpeed.innerText = ''

    const message = `
Gotowość do uruchomienia gry z ustawieniami:
      
👤 Konto: ${user.name}
🧠 RAM: ${config.memory.min} - ${config.memory.max}
☕️ Java: ${config.java}
🖥️ Rozdzielczość okna: ${config.resolution.width}x${config.resolution.height}
🚀 Akcja po uruchomieniu: ${config.launcherAction}
    `

    logger.log(message)
    game.launch({
      account: user,
      settings: config,
      profileSlug: selectedProfile?.slug,
      connectToServer,
      server: connectToServer && selectedProfile?.ip
        ? { ip: selectedProfile.ip, port: selectedProfile?.port }
        : undefined
    })
  }

  playBtn?.addEventListener('click', (e) => {
    e.stopPropagation()
    if (isGameRunning) {
      game.stop()
      return
    }
    launchGame()
  })

  profileSelector?.querySelector('.selected-profile')?.addEventListener('click', () => {
    profileSelector.classList.toggle('open')
  })

  body.addEventListener('click', (e) => {
    if (profileSelector && !profileSelector.contains(e.target as Node)) {
      profileSelector.classList.remove('open')
    }
  })

  body.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      profileSelector?.classList.remove('open')
    }
  })

  game.launchComputeDownload(() => {
    setIndeterminate(true)
    setProgressText('Przygotowanie pobierania...')
    if (progressPercent) progressPercent.innerText = ''
  })
  game.launchDownload((download) => {
    setIndeterminate(false)
    totalToDownload = download.total.size
    setProgressText('Pobieranie plików...')
  })
  game.downloadProgress((progress) => {
    if (!totalDownloadedByType.find((t) => t.type === progress.type)) {
      totalDownloadedByType.push({ type: progress.type, size: progress.downloaded.size })
    } else {
      totalDownloadedByType[totalDownloadedByType.findIndex((t) => t.type === progress.type)].size = progress.downloaded.size
    }
    if (progressBar && progressLabel && progressPercent) {
      const downloadedSum = totalDownloadedByType.reduce((acc, curr) => acc + curr.size, 0)
      const percent = Math.min((downloadedSum / totalToDownload) * 100, 100)
      progressBar.style.width = `${percent}%`
      setProgressText(`Pobieranie ${progress.type === 'JAVA' ? 'Javy' : 'plików gry'}...`)
      progressPercent.innerText = `${Math.round(percent)}%`

      const now = Date.now()
      if (lastSpeedSample) {
        const dt = (now - lastSpeedSample.time) / 1000
        const dBytes = downloadedSum - lastSpeedSample.downloaded
        if (dt >= 0.5 && dBytes > 0 && progressSpeed) {
          const speed = dBytes / dt
          const remaining = Math.max(totalToDownload - downloadedSum, 0)
          const eta = remaining > 0 ? formatEta(remaining / speed) : ''
          progressSpeed.innerText = `${formatBytes(speed)}/s${eta ? ` • pozostało ${eta}` : ''}`
          lastSpeedSample = { time: now, downloaded: downloadedSum }
        }
      } else {
        lastSpeedSample = { time: now, downloaded: downloadedSum }
      }
    }
  })
  game.launchInstallLoader(() => {
    setIndeterminate(true)
    setProgressText('Wypakowywanie plików...')
    if (progressPercent) progressPercent.innerText = ''
  })
  game.launchExtractNatives(() => {
    setIndeterminate(true)
    setProgressText('Wypakowywanie plików...')
  })
  game.launchCopyAssets(() => {
    setIndeterminate(true)
    setProgressText('Wypakowywanie plików...')
    });
    // Listen for launcher errors and display them
    game.launchError((payload) => {
        const msg = payload?.message ?? String(payload);
        logger.error(`Launcher error: ${msg}`);
        setIndeterminate(false);
        if (progressBar) progressBar.style.width = '0%';
        if (progressSpeed) progressSpeed.innerText = '';
        if (progressLabel) {
            progressLabel.classList.add('error');
            progressLabel.innerText = `Błąd: ${msg}`;
        }
        if (playBtn) playBtn.style.display = 'block';
        if (progressContainer) progressContainer.classList.remove('hidden');
    });
  game.launchPatchLoader(() => {
    setIndeterminate(true)
    setProgressText('Finalizowanie...')
  })
  game.launchLaunch(() => {
    setIndeterminate(true)
    setProgressText('Uruchamianie gry...')
  })
  game.running(setButtonRunning)
  game.stopped(setButtonStopped)
}





