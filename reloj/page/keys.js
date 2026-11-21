// Probar botones: enseña qué código manda cada botón y permite invertir arriba/abajo.
import { onKey, KEY_EVENT_CLICK, KEY_EVENT_LONG_PRESS } from '@zos/interaction'
import { back } from '@zos/router'
import { C, H, s, text, button, setText } from '../shared/ui'
import { store } from '../shared/store'
import { sideOf, stopKeys, KEY_NAMES } from '../shared/keys'

Page({
  build() {
    text({ y: s(24), h: s(44), size: s(30), color: C.dim, text: 'Probar botones' })
    this.info = text({ y: s(80), h: s(200), size: s(30), wrap: true, text: 'Pulsa un botón (corto o largo)' })
    this.lastKey = null
    button({ y: H - s(200), text: 'Invertir arriba/abajo', size: s(26), onClick: () => this.swap() })
    button({ y: H - s(110), text: 'Listo', onClick: () => back() })
    onKey({
      callback: (key, ev) => {
        if (ev !== KEY_EVENT_CLICK && ev !== KEY_EVENT_LONG_PRESS) return true
        this.lastKey = key
        const side = sideOf(key)
        setText(this.info,
          'Código: ' + key + ' (' + (KEY_NAMES[key] || '?') + ')\n' +
          (ev === KEY_EVENT_LONG_PRESS ? 'Largo' : 'Corto') + '\n' +
          'La app lo toma como: ' + (side === 'top' ? 'ARRIBA' : side === 'bottom' ? 'ABAJO' : 'nada'))
        return true
      },
    })
  },

  swap() {
    if (this.lastKey === null) {
      setText(this.info, 'Primero pulsa el botón que quieres cambiar')
      return
    }
    const m = store.keymap() || {}
    m[String(this.lastKey)] = sideOf(this.lastKey) === 'top' ? 'bottom' : 'top'
    store.setKeymap(m)
    setText(this.info, 'Cambiado. Ese botón ahora es ' + (m[String(this.lastKey)] === 'top' ? 'ARRIBA' : 'ABAJO'))
  },

  onDestroy() {
    stopKeys()
  },
})
