let channel: MessageChannel | null = null
const waiting: (() => void)[] = []

export function breathe(): Promise<void> {
  if (!channel) {
    channel = new MessageChannel()
    channel.port1.onmessage = () => {
      const next = waiting.shift()
      if (next) next()
    }
  }
  return new Promise<void>((resolve) => {
    waiting.push(resolve)
    channel!.port2.postMessage(0)
  })
}

// Waits until the page has painted, so a loading screen shows each step. The first callback runs before the paint and the second after it.
// A hidden tab paints nothing, so there the wait gives up after a tenth of a second; a tab in view gets a second and a half, since a busy graphics process can hold a paint back that long.
export function paint(): Promise<void> {
  if (typeof requestAnimationFrame !== 'function') return breathe()
  return new Promise<void>((resolve) => {
    let open = true
    const go = (): void => {
      if (!open) return
      open = false
      clearTimeout(timer)
      void breathe().then(resolve)
    }
    const timer = setTimeout(go, typeof document !== 'undefined' && document.visibilityState === 'visible' ? 1500 : 100)
    requestAnimationFrame(() => requestAnimationFrame(go))
  })
}
