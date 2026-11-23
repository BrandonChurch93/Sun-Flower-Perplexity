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

// Waits until the page has painted, so a loading screen shows each step. A hidden tab paints nothing, so the wait gives up after a tenth of a second.
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
    const timer = setTimeout(go, 100)
    requestAnimationFrame(go)
  })
}
