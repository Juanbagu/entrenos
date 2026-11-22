// Inicio: muestra la rutina recibida del móvil y deja empezar.
import { BasePage } from '@zeppos/zml/base-page'
import { push, replace } from '@zos/router'
import { showToast } from '@zos/interaction'
import { setStatusBarVisible } from '@zos/ui'
import { W, H, M, C, s, text, button, setText } from '../shared/ui'
import { store, DEMO } from '../shared/store'
import { normalizeRoutine, previewLines, PHASE } from '../shared/routine'
import { listenKeys, stopKeys } from '../shared/keys'

function activeSession() {
  const ss = store.session()
  return ss && ss.phase !== PHASE.DONE && ss.routine ? ss : null
}

Page(
  BasePage({
    state: { routine: null },

    onInit() {
      this.state.routine = store.routine()
    },

    build() {
      try { setStatusBarVisible(false) } catch (e) {}
      const top = s(24)
      text({ y: top, h: s(44), size: s(30), color: C.dim, text: 'Rutina Foto' })
      this.name = text({ y: top + s(44), h: s(56), size: s(38), text: '' })
      this.list = text({ y: top + s(104), h: s(150), size: s(24), color: C.dim, wrap: true, left: true, text: '' })
      this.status = text({ y: top + s(258), h: s(30), size: s(20), color: C.dim, text: '' })

      const by = H - s(24) - 3 * s(84)
      const resuming = !!activeSession()
      this.mainBtn = resuming
        ? button({ y: by, text: 'Continuar sesión', color: C.pause, textColor: 0x000000, press: 0xfcd34d, onClick: () => this.start() })
        : button({ y: by, text: 'Empezar', color: C.work, textColor: 0x000000, press: 0x86efac, onClick: () => this.start() })
      button({ y: by + s(84), text: 'Recibir del móvil', onClick: () => this.syncFromPhone(true) })
      const half = (W - 2 * M - s(12)) / 2
      button({ x: M, y: by + 2 * s(84), w: half, text: 'Botones', size: s(24), onClick: () => push({ url: 'page/keys' }) })
      button({ x: M + half + s(12), y: by + 2 * s(84), w: half, text: 'Demo', size: s(24), onClick: () => this.useDemo() })

      this.render()
      // Botón de arriba (corto) = Empezar / Continuar. El de abajo hace lo normal (salir).
      listenKeys((side, kind) => {
        if (side === 'top' && kind === 'short') {
          this.start()
          return true
        }
        return false
      })

      if (!resuming) this.syncFromPhone(false)
      this.flushPending()
    },

    render() {
      const r = this.state.routine
      if (!r) {
        setText(this.name, 'Sin rutina')
        setText(this.list, 'Haz la foto en el móvil y pulsa «Recibir del móvil», o prueba la Demo.')
        return
      }
      setText(this.name, r.name)
      const all = previewLines(r)
      const lines = all.slice(0, 5)
      if (all.length > 5) lines.push('… y ' + (all.length - 5) + ' líneas más')
      setText(this.list, lines.join('\n'))
    },

    useDemo() {
      if (activeSession()) {
        showToast({ content: 'Termina antes la sesión en curso' })
        return
      }
      this.state.routine = normalizeRoutine(DEMO)
      store.setRoutine(this.state.routine)
      this.render()
    },

    syncFromPhone(manual) {
      if (activeSession()) {
        if (manual) showToast({ content: 'Termina antes la sesión en curso' })
        return
      }
      setText(this.status, 'Buscando rutina en el móvil…')
      this.request({ method: 'routine.get' }, { timeout: 15000 })
        .then((res) => {
          if (res && res.routine) {
            const r = normalizeRoutine(res.routine)
            const changed = JSON.stringify(r) !== JSON.stringify(this.state.routine)
            this.state.routine = r
            store.setRoutine(r)
            this.render()
            setText(this.status, changed ? 'Rutina nueva recibida ✓' : 'Rutina al día ✓')
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
      setText(this.status, list.length + ' entreno(s) sin enviar…')
      this.request({ method: 'session.save', params: { sessions: list } }, { timeout: 15000 })
        .then((res) => {
          if (res && res.ok) {
            store.setPending([])
            setText(this.status, 'Entrenos enviados ✓')
          }
        })
        .catch(() => {})
    },

    start() {
      if (!activeSession() && !this.state.routine) {
        showToast({ content: 'Primero recibe una rutina' })
        return
      }
      // replace: al terminar volvemos a un inicio nuevo y el botón atrás sale de la app.
      replace({ url: 'page/workout' })
    },

    onDestroy() {
      stopKeys()
    },
  }),
)
