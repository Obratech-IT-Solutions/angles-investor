const SOUND_SRC = '/sounds/ka-ching.mp3'

let shared: HTMLAudioElement | null = null
let loadPromise: Promise<HTMLAudioElement> | null = null
let inFlight: Promise<boolean> | null = null

function getAudio() {
  if (!shared) {
    shared = new Audio(SOUND_SRC)
    shared.preload = 'auto'
    shared.volume = 1
    shared.setAttribute('playsinline', 'true')
  }
  return shared
}

function waitUntilReady(): Promise<HTMLAudioElement> {
  const audio = getAudio()
  if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return Promise.resolve(audio)
  }
  if (!loadPromise) {
    loadPromise = new Promise((resolve) => {
      const done = () => {
        audio.removeEventListener('canplaythrough', done)
        audio.removeEventListener('loadeddata', done)
        resolve(audio)
      }
      audio.addEventListener('canplaythrough', done, { once: true })
      audio.addEventListener('loadeddata', done, { once: true })
      try {
        audio.load()
      } catch {
        /* ignore */
      }
      window.setTimeout(() => resolve(audio), 2000)
    })
  }
  return loadPromise
}

/** Preload on app start / landing mount. */
export function preloadKaChing() {
  void waitUntilReady()
}

/**
 * Play cash-register ka-ching.
 * Returns whether playback actually started.
 */
export async function playKaChing(): Promise<boolean> {
  if (inFlight) return inFlight

  inFlight = (async () => {
    const a = await waitUntilReady()
    try {
      a.pause()
      a.currentTime = 0
    } catch {
      /* ignore seek errors */
    }

    try {
      await a.play()
      return true
    } catch {
      // Important: failed autoplay must NOT leave a "playing" lock
      return false
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/** Call from a tap/click handler — browsers always allow this. */
export function unlockAndPlayKaChing(): Promise<boolean> {
  return playKaChing()
}

type LandingSoundOptions = {
  onPlayed?: () => void
  onNeedsGesture?: () => void
}

/**
 * Play when the landing page is shown.
 * Tries autoplay immediately, and also on the first user gesture if blocked.
 */
export function playKaChingOnLandingOpen(options: LandingSoundOptions = {}): () => void {
  let cancelled = false
  let done = false
  preloadKaChing()

  const finish = () => {
    if (done) return
    done = true
    window.removeEventListener('pointerdown', onGesture, true)
    window.removeEventListener('keydown', onGesture, true)
    window.removeEventListener('touchstart', onGesture, true)
    document.removeEventListener('visibilitychange', onVisible)
    if (!cancelled) options.onPlayed?.()
  }

  const tryPlay = () => {
    if (cancelled || done) return
    void playKaChing().then((ok) => {
      if (ok) finish()
    })
  }

  const onGesture = () => {
    tryPlay()
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible') tryPlay()
  }

  // Listeners first — so a quick tap is never missed while audio loads
  window.addEventListener('pointerdown', onGesture, true)
  window.addEventListener('keydown', onGesture, true)
  window.addEventListener('touchstart', onGesture, true)
  document.addEventListener('visibilitychange', onVisible)

  // Immediate + short retries (covers late audio load / media engagement)
  tryPlay()
  const t1 = window.setTimeout(tryPlay, 250)
  const t2 = window.setTimeout(tryPlay, 800)
  const t3 = window.setTimeout(tryPlay, 1600)

  return () => {
    cancelled = true
    window.clearTimeout(t1)
    window.clearTimeout(t2)
    window.clearTimeout(t3)
    window.removeEventListener('pointerdown', onGesture, true)
    window.removeEventListener('keydown', onGesture, true)
    window.removeEventListener('touchstart', onGesture, true)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
