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
