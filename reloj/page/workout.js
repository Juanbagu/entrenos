// Sesión guiada. Botones:
//   Arriba corto  → serie hecha (o arrancar serie por tiempo, o saltar descanso)
//   Arriba largo  → siguiente ejercicio
//   Abajo corto   → ver qué viene después
//   Abajo largo   → menú en pantalla: Pausar/Continuar · Terminar · Volver
// En el descanso se pueden corregir con la pantalla las reps y el peso de la serie que acabas de hacer.
import { BasePage } from '@zeppos/zml/base-page'
import { replace } from '@zos/router'
import { setStatusBarVisible } from '@zos/ui'
import { onGesture, offGesture, GESTURE_RIGHT } from '@zos/interaction'
import { HeartRate, Vibrator, VIBRATOR_SCENE_SHORT_STRONG, VIBRATOR_SCENE_STRONG_REMINDER, VIBRATOR_SCENE_DURATION } from '@zos/sensor'
import { setPageBrightTime, resetPageBrightTime, pauseDropWristScreenOff, resetDropWristScreenOff, setWakeUpRelaunch } from '@zos/display'
import { W, H, M, C, s, text, rect, button, setText, setColor, show } from '../shared/ui'
import { store } from '../shared/store'
import * as R from '../shared/routine'
import { listenKeys, stopKeys } from '../shared/keys'

const SAVE_EVERY_MS = 15000

Page(
  BasePage({
    state: { st: null, menu: false, peekUntil: 0, savedAt: 0 },

    onInit() {
      const saved = store.session()
      if (saved && saved.phase !== R.PHASE.DONE && saved.routine) {
        this.state.st = saved
      } else {
        const routine = store.routine()
        try {
          this.state.st = R.startSession(routine, Date.now())
        } catch (e) {
          this.state.st = null // sin rutina válida: build() vuelve al inicio
          return
        }
        this.save()
      }
    },

    build() {
      if (!this.state.st) {
        replace({ url: 'page/index' })
        return
      }
      try { setStatusBarVisible(false) } catch (e) {}
      // Pantalla encendida durante la sesión y, si se apaga, volver aquí al despertar.
      try { setPageBrightTime({ brightTime: 2147483000 }) } catch (e) {}
      try { pauseDropWristScreenOff({ duration: 0 }) } catch (e) {}
      try { setWakeUpRelaunch({ relaunch: true }) } catch (e) {}

      this.vib = new Vibrator()
      const y0 = s(18)
      this.clock = text({ x: M, y: y0, w: (W - 2 * M) / 2, h: s(40), size: s(26), color: C.dim, left: true })
      this.hr = text({ x: W / 2, y: y0, w: W / 2 - M, h: s(40), size: s(26), color: C.danger, right: true })
      this.counter = text({ y: y0 + s(44), h: s(32), size: s(22), color: C.dim })
      this.exName = text({ y: y0 + s(80), h: s(120), size: s(44), wrap: true })
      this.big = text({ y: y0 + s(204), h: s(110), size: s(92), color: C.work })
      this.detail = text({ y: y0 + s(314), h: s(44), size: s(30) })
      this.next = text({ y: H - s(110), h: s(80), size: s(24), color: C.dim, wrap: true })

      // Corrección de la última serie (solo en el descanso)
      const py = y0 + s(360)
      this.lastLbl = text({ y: py, h: s(34), size: s(22), color: C.dim })
      const gap = s(8)
      const bw = Math.floor((W - 2 * M - 3 * gap) / 4)
      const bh = s(60)
      const mk = (i, label, field, d) => button({
        x: M + i * (bw + gap), y: py + s(38), w: bw, h: bh, text: label, size: s(24),
        onClick: () => this.adjust(field, d),
      })
      this.adjButtons = [mk(0, '−rep', 'reps', -1), mk(1, '+rep', 'reps', 1), mk(2, '−kg', 'weight', -1), mk(3, '+kg', 'weight', 1)]
      this.adjWidgets = [this.lastLbl].concat(this.adjButtons)

      // Menú (abajo largo)
      this.menuBg = rect({ color: 0x000000 })
      this.menuTitle = text({ y: s(40), h: s(50), size: s(30), color: C.dim, text: 'Menú' })
      const mh = s(96)
      const my = s(110)
      this.btnPause = button({ y: my, h: mh, text: 'Pausar', color: C.pause, textColor: 0x000000, press: 0xfcd34d, size: s(34), onClick: () => this.togglePause() })
      this.btnEnd = button({ y: my + mh + s(20), h: mh, text: 'Terminar', color: C.danger, textColor: 0x000000, press: 0xfca5a5, size: s(34), onClick: () => this.end() })
      this.btnBack = button({ y: my + 2 * (mh + s(20)), h: mh, text: 'Volver', size: s(34), onClick: () => this.closeMenu() })
      this.menuWidgets = [this.menuBg, this.menuTitle, this.btnPause, this.btnEnd, this.btnBack]
      this.showMenu(false)

      // Resumen final
      this.doneBg = rect({ color: 0x000000 })
      this.doneTitle = text({ y: s(30), h: s(56), size: s(38), color: C.work, text: '¡Hecho!' })
      this.doneText = text({ y: s(96), h: s(260), size: s(28), wrap: true })
      this.doneStatus = text({ y: s(360), h: s(36), size: s(22), color: C.dim })
      this.doneBtn = button({ y: H - s(110), text: 'Salir', onClick: () => this.exit() })
      this.doneWidgets = [this.doneBg, this.doneTitle, this.doneText, this.doneStatus, this.doneBtn]
      this.doneWidgets.forEach((w) => show(w, false))

      listenKeys((side, kind) => this.onButton(side, kind))
      // Evita salir sin querer deslizando el dedo (o el brazo) durante la sesión.
      try {
        onGesture({ callback: (g) => g === GESTURE_RIGHT && !this.finished })
      } catch (e) {}

      this.heart = new HeartRate()
      this.onHr = () => {
        const bpm = this.heart.getCurrent()
        if (!this.state.st || this.finished) return
        this.state.st = R.addHeartRate(this.state.st, bpm)
        if (bpm > 0) setText(this.hr, '♥ ' + bpm)
      }
      try { this.heart.onCurrentChange(this.onHr) } catch (e) {}

      this.timer = setInterval(() => this.onTick(), 1000)
      this.render()
      if (this.state.st.phase === R.PHASE.DONE) this.finishScreen()
    },

    onButton(side, kind) {
      const now = Date.now()
      const st = this.state.st
      if (st.phase === R.PHASE.DONE) {
        if (side === 'top' && kind === 'short') this.exit()
        return true
      }
      if (this.state.menu) {
        // En el menú: arriba = pausar/continuar, abajo = volver. Terminar solo tocando la pantalla.
        if (kind === 'short' && side === 'top') this.togglePause()
        else if (kind === 'short' && side === 'bottom') this.closeMenu()
        return true
      }
      if (side === 'bottom' && kind === 'long') {
        this.openMenu()
        return true
      }
      if (st.paused) {
        if (side === 'top' && kind === 'short') this.togglePause()
        return true
      }
      if (side === 'top' && kind === 'short') {
        const next = R.primary(st, now)
        this.update(next)
        if (next.exIdx !== st.exIdx) this.buzz(VIBRATOR_SCENE_DURATION)
        else this.buzz(VIBRATOR_SCENE_SHORT_STRONG)
      } else if (side === 'top' && kind === 'long') {
        this.update(R.skipExercise(st, now))
        this.buzz(VIBRATOR_SCENE_DURATION)
      } else if (side === 'bottom' && kind === 'short') {
        this.state.peekUntil = now + 4000
        this.render()
      }
      return true
    },

    onTick() {
      if (!this.state.st || this.finished) return
      const t = R.tick(this.state.st, Date.now())
      if (t.restEnded || t.timerEnded) {
        this.update(t.state)
        this.buzz(VIBRATOR_SCENE_STRONG_REMINDER)
      } else {
        if (Date.now() - this.state.savedAt > SAVE_EVERY_MS) this.save() // guarda también el pulso
        this.render()
      }
    },

    adjust(field, delta) {
      if (this.state.st.phase !== R.PHASE.REST) return
      this.update(R.adjustLast(this.state.st, field, delta))
    },

    update(st) {
      this.state.st = st
      this.save()
      if (st.phase === R.PHASE.DONE) this.finishScreen()
      else this.render()
    },

    save() {
      this.state.savedAt = Date.now()
      store.setSession(this.state.st)
    },

    buzz(mode) {
      try { this.vib.stop(); this.vib.start({ mode: mode }) } catch (e) {}
    },

    render() {
      const st = this.state.st
      if (!st || st.phase === R.PHASE.DONE || this.finished) return
      const now = Date.now()
      const ex = st.routine.exercises[st.exIdx]
      setText(this.clock, R.fmtTime(R.elapsedS(st, now)))
      setText(this.counter, 'Ejercicio ' + (st.exIdx + 1) + ' de ' + st.routine.exercises.length)
      setText(this.exName, ex.name)

      const peek = now < this.state.peekUntil
      let showAdjust = false
      if (st.paused) {
        setText(this.big, 'PAUSA')
        setColor(this.big, C.pause)
        setText(this.detail, 'Arriba: continuar')
      } else if (st.phase === R.PHASE.REST) {
        setText(this.big, R.fmtTime(R.restLeftS(st, now)))
        setColor(this.big, C.rest)
        setText(this.detail, 'Descanso · luego serie ' + (st.setIdx + 1) + '/' + ex.sets)
        showAdjust = !peek
      } else if (st.phase === R.PHASE.TIMER) {
        setText(this.big, R.fmtTime(R.timerLeftS(st, now)))
        setColor(this.big, C.work)
        setText(this.detail, 'Serie ' + (st.setIdx + 1) + '/' + ex.sets + ' · arriba: terminar')
      } else {
        setText(this.big, 'Serie ' + (st.setIdx + 1) + '/' + ex.sets)
        setColor(this.big, C.work)
        const what = ex.timedS ? ex.reps + ' · arriba: empezar' : (ex.reps ? ex.reps + ' reps' : '')
        setText(this.detail, what + (ex.weight ? ' · ' + ex.weight : ''))
      }

      this.adjWidgets.forEach((w) => show(w, showAdjust))
      show(this.next, !showAdjust)
      if (showAdjust) {
        const last = R.lastSet(st)
        setText(this.lastLbl, 'Hecho: ' + (last.reps || '—') + ' reps' + (last.weight ? ' · ' + last.weight : ''))
      } else {
        setColor(this.next, peek ? C.text : C.dim)
        setText(this.next, (peek ? 'DESPUÉS: ' : 'Después: ') + R.nextLabel(st))
      }
    },

    openMenu() {
      this.state.menu = true
      setText(this.btnPause, this.state.st.paused ? 'Continuar' : 'Pausar')
      this.showMenu(true)
      this.buzz(VIBRATOR_SCENE_SHORT_STRONG)
    },

    closeMenu() {
      this.state.menu = false
      this.showMenu(false)
      this.render()
    },

    showMenu(v) {
      this.menuWidgets.forEach((w) => show(w, v))
    },

    togglePause() {
      const now = Date.now()
      this.update(this.state.st.paused ? R.resume(this.state.st, now) : R.pause(this.state.st, now))
      if (this.state.menu) this.closeMenu()
    },

    end() {
      this.state.menu = false
      this.showMenu(false)
      this.update(R.finish(this.state.st, Date.now()))
    },

    finishScreen() {
      if (this.finished) return
      this.finished = true
      this.adjWidgets.forEach((w) => show(w, false))
      const sum = R.summary(this.state.st)
      store.addHistory(sum)
      store.setSession(null)
      const lines = [
        'Tiempo: ' + R.fmtTime(sum.activeS),
        'Series: ' + sum.sets,
        'Ejercicios: ' + sum.exercises.filter((e) => e.sets > 0).length + '/' + sum.exercises.length,
      ]
      if (sum.hrAvg) lines.push('Pulso: ' + sum.hrAvg + ' media · ' + sum.hrMax + ' máx')
      setText(this.doneText, lines.join('\n'))
      setText(this.doneStatus, 'Enviando al móvil…')
      this.doneWidgets.forEach((w) => show(w, true))
      this.buzz(VIBRATOR_SCENE_DURATION)
      try { resetPageBrightTime() } catch (e) {}

      const pending = store.pending().concat([sum])
      store.setPending(pending)
      this.request({ method: 'session.save', params: { sessions: pending } })
        .then((res) => {
          if (res && res.ok) {
            store.setPending([])
            setText(this.doneStatus, res.phone ? 'Guardado en el móvil ✓' : 'Guardado; pasará a la app del móvil al abrirla')
          } else {
            setText(this.doneStatus, 'Guardado en el reloj; se enviará luego')
          }
        })
        .catch(() => setText(this.doneStatus, 'Guardado en el reloj; se enviará luego'))
    },

    exit() {
      replace({ url: 'page/index' })
    },

    onDestroy() {
      stopKeys()
      try { offGesture() } catch (e) {}
      if (this.timer) clearInterval(this.timer)
      try { this.heart.offCurrentChange(this.onHr) } catch (e) {}
      try { this.vib.stop() } catch (e) {}
      try { resetPageBrightTime() } catch (e) {}
      try { resetDropWristScreenOff() } catch (e) {}
      try { setWakeUpRelaunch({ relaunch: false }) } catch (e) {}
      if (this.state.st && this.state.st.phase !== R.PHASE.DONE) this.save()
    },
  }),
)
