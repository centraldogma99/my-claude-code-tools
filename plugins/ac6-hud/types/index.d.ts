export type Sortie = { usedPercent: number | null; arms: number; seconds: number }

declare module 'claude-code' {
  interface PluginState {
    'ac6-hud': {
      sorties: Sortie[]
      weapons: Record<string, number>
    }
  }
}
