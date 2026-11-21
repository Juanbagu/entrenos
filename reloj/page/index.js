// Inicio: muestra la rutina recibida del móvil y deja empezar.
import { BasePage } from '@zeppos/zml/base-page'
import { push } from '@zos/router'
import { showToast } from '@zos/interaction'
import { setStatusBarVisible } from '@zos/ui'
import { W, H, M, C, s, text, button, setText } from '../shared/ui'
import { store, DEMO } from '../shared/store'
import { normalizeRoutine, describe } from '../shared/routine'
import { listenKeys, stopKeys } from '../shared/keys'

Page(
  BasePage({
    state: { routine: null },

    onInit() {
      this.state.routine = store.routine()
      this.syncFromPhone()
      this.flushPending()
    },

    build() {
      try { setStatusBarVisible(false) } catch (e) {}
      const top = s(24)
      this.title = text({ y: top, h: s(44), size: s(30), color: C.dim, text: 'Rutina Foto' })
      this.name = text({ y: top + s(44), h: s(56), size: s(38), text: '' })
      this.list = text({ y: top + s(104), h: s(150), size: s(24), color: C.dim, wrap: true, left: true, text: '' })
      this.status = text({ y: top + s(258), h: s(30), size: s(20), color: C.dim, text: '' })

      const session = store.session()
      const by = H - s(24) - 3 * s(84)
      if (session && session.phase !== 'done') {
        button({ y: by, text: 'Continuar sesión', color: C.pause, textColor: 0x000000, press: 0xfcd34d, onClick: () => this.start(true) })
      } else {
        button({ y: by, text: 'Empezar', color: C.work, textColor: 0x000000, press: 0x86efac, onClick: () => this.start(false) })
      }
      button({ y: by + s(84), text: 'Recibir del móvil', onClick: () => this.syncFromPhone(true) })
      button({ x: M, y: by + 2 * s(84), w: (W - 2 * M - s(12)) / 2, text: 'Botones', size: s(24), onClick: () => push({ url: 'page/keys' }) })
      button({ x: M + (W - 2 * M + s(12)) / 2, y: by + 2 * s(84), w: (W - 2 * M - s(12)) / 2, text: 'Demo', size: s(24), onClick: () => this.useDemo() })

      this.render()
      // Botón de arriba (corto) = Empezar / Continuar. El de abajo hace lo normal (salir).
      listenKeys((side, kind) => {
        if (side === 'top' && kind === 'short') {
          this.start(!!(session && session.phase !== 'done'))
          return true
        }
        return false
      })
    },

    render() {
      const r = this.state.routine
      if (!r) {
        setText(this.name, 'Sin rutina')
        setText(this.list, 'Haz la foto en el móvil y pulsa "Recibir del móvil", o prueba la Demo.')
        return
      }
      setText(this.name, r.name)
      const lines = r.exercises.slice(0, 4).map((e) => '• ' + e.name + '  ' + describe(e))
      if (r.exercises.length > 4) lines.push('… y ' + (r.exercises.length - 4) + ' más')
      setText(this.list, lines.join('\n'))
    },

    useDemo() {
      this.state.routine = normalizeRoutine(DEMO)
      store.setRoutine(this.state.routine)
      this.render()
    },

    syncFromPhone(manual) {
      setText(this.status, 'Buscando rutina en el móvil…')
      this.request({ method: 'routine.get' })
        .then((res) => {
          if (res && res.routine) {
            const r = normalizeRoutine(res.routine)
            const changed = JSON.stringify(r) !== JSON.stringify(this.state.routine)
            this.state.routine = r
            store.setRoutine(r)
            this.render()
            setText(this.status, changed ? 'Rutina nueva recibida' : 'Rutina al día')
          } else {
            setText(this.status, 'El móvil no tiene rutina')
          }
        })
        .catch(() => {
          setText(this.status, 'Sin conexión con el móvil')
          if (manual) showToast({ content: 'Abre la app Zepp en el móvil' })
        })
    },

    // Reenvía entrenos que no llegaron al móvil.
    flushPending() {
      const list = store.pending()
      if (!list.length) return
      this.request({ method: 'session.save', params: { sessions: list } })
        .then((res) => { if (res && res.ok) store.setPending([]) })
        .catch(() => {})
    },

    start(resume) {
      if (!resume && !this.state.routine) {
        showToast({ content: 'Primero recibe una rutina' })
        return
      }
      if (!resume) store.setSession(null)
      push({ url: 'page/workout' })
    },

    onDestroy() {
      stopKeys()
    },
  }),
)
