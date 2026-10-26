export type Pin = { text: string }

declare module 'claude-code' {
  interface PluginState {
    pin: { pins: Shaped<Pin[]> }
  }
}
