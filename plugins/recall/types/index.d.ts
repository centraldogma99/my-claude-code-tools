export type Card = {
  id: string
  sessionId: string
  path: string
  date: string
  title: string
  from: number
  to: number
  summary: string
  decisions: string[]
  files: string[]
  open: string[]
}

export type View = {
  query: string
  status: string
  cards: Card[]
  selected: string[]
  isRecent: boolean
}

declare module 'claude-code' {
  interface PluginState {
    recall: { view: View }
  }
}
