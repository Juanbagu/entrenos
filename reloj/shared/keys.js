// Traduce los botones físicos a "arriba" / "abajo" y "corto" / "largo".
// El Bip Max tiene 2 botones. Qué código manda cada uno no está documentado por modelo,
// así que aceptamos todos los candidatos y dejamos invertirlos desde la pantalla "Probar botones".
import {
  onKey, offKey,
  KEY_UP, KEY_DOWN, KEY_SELECT, KEY_HOME, KEY_BACK, KEY_SHORTCUT,
  KEY_EVENT_CLICK, KEY_EVENT_LONG_PRESS,
} from '@zos/interaction'
import { store } from './store'

const TOP = [KEY_SELECT, KEY_HOME, KEY_UP]
const BOTTOM = [KEY_BACK, KEY_SHORTCUT, KEY_DOWN]

export function sideOf(key) {
  const m = store.keymap()
  if (m && m[String(key)]) return m[String(key)]
  if (TOP.indexOf(key) >= 0) return 'top'
  if (BOTTOM.indexOf(key) >= 0) return 'bottom'
  return null
}

// handler(side, kind) con side 'top' | 'bottom' y kind 'short' | 'long'.
// Devuelve true si la pulsación se ha usado (el sistema no hace lo suyo).
export function listenKeys(handler) {
  onKey({
    callback: (key, ev) => {
      const side = sideOf(key)
      if (!side) return false
      if (ev === KEY_EVENT_CLICK) return handler(side, 'short') !== false
      if (ev === KEY_EVENT_LONG_PRESS) return handler(side, 'long') !== false
      return true // pulsar/soltar: lo absorbemos para que no salga de la app
    },
  })
}

export function stopKeys() {
  try { offKey() } catch (e) {}
}

export const KEY_NAMES = {}
KEY_NAMES[KEY_UP] = 'UP'
KEY_NAMES[KEY_DOWN] = 'DOWN'
KEY_NAMES[KEY_SELECT] = 'SELECT'
KEY_NAMES[KEY_HOME] = 'HOME'
KEY_NAMES[KEY_BACK] = 'BACK'
KEY_NAMES[KEY_SHORTCUT] = 'SHORTCUT'
