import css from './sheet.module.css'

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export interface SheetContent {
  verdict: string
  holds: boolean
  // What will be felt, in one line: the frames that took longer than one frame of time.
  felt: string
  // The whole report as plain text: this is what Copy takes.
  text: string
  file: { name: string; blob: Blob }
}

export interface Sheet {
  show(content: SheetContent): void
  close(): void
  readonly open: boolean
}

// One page with the whole pacing report as text, a button that copies it and a link that saves every frame as a file.
export function createSheet(host: HTMLElement): Sheet {
  const root = make('section', css.sheet)
  root.hidden = true
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', 'Pacing report')
  root.dataset.role = 'pacing-sheet'
  const box = make('div', css.box)
  const head = make('div', css.head)
  const copy = make('button', css.button, 'Copy the report')
  copy.type = 'button'
  copy.dataset.primary = 'yes'
  copy.dataset.role = 'sheet-copy'
  const save = make('a', css.button, 'Save every frame as a file')
  const close = make('button', css.button, 'Close')
  close.type = 'button'
  head.append(make('h1', css.title, 'Pacing report'), copy, save, close)
  const verdict = make('p', css.verdict)
  const felt = make('p', css.felt)
  felt.dataset.role = 'sheet-felt'
  const hint = make('p', css.hint, 'Copy the report and paste it into a message. It holds everything below.')
  hint.setAttribute('role', 'status')
  const text = make('pre', css.text)
  text.tabIndex = 0
  text.dataset.role = 'sheet-text'
  box.append(head, verdict, felt, hint, text)
  root.append(box)
  host.append(root)

  let url = ''
  const shut = (): void => {
    root.hidden = true
    if (url) URL.revokeObjectURL(url)
    url = ''
  }
  const select = (): void => {
    const range = document.createRange()
    range.selectNodeContents(text)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }
  copy.addEventListener('click', () => {
    const done = (): void => {
      hint.textContent = 'Copied. Paste it into a message.'
    }
    const byHand = (): void => {
      select()
      hint.textContent = 'The browser did not allow the copy. The text is selected: press Ctrl C, or Cmd C on a Mac.'
    }
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text.textContent ?? '').then(done, byHand)
    else byHand()
  })
  close.addEventListener('click', shut)
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      shut()
    }
  })

  return {
    show(content) {
      if (url) URL.revokeObjectURL(url)
      url = URL.createObjectURL(content.file.blob)
      save.href = url
      save.download = content.file.name
      verdict.textContent = content.verdict
      verdict.dataset.holds = content.holds ? 'yes' : 'no'
      felt.textContent = content.felt
      hint.textContent = 'Copy the report and paste it into a message. It holds everything below.'
      text.textContent = content.text
      text.scrollTop = 0
      root.hidden = false
      copy.focus()
    },
    close: shut,
    get open() {
      return !root.hidden
    },
  }
}
