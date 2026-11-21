// Corre dentro de la app Zepp del móvil. Hace de puente entre el reloj y:
//   A) nuestra app Android, si está abierta (servidor local en 127.0.0.1:8765), o
//   C) el texto pegado en los ajustes de la miniapp (siempre funciona).
import { BaseSideService } from '@zeppos/zml/base-side'
import { parseRoutine } from '../shared/parse'

const LOCAL = 'http://127.0.0.1:8765'

AppSideService(
  BaseSideService({
    onInit() {},
    onRun() {},
    onDestroy() {},

    onRequest(req, res) {
      if (req.method === 'routine.get') {
        this.getRoutine()
          .then((r) => res(null, r))
          .catch((e) => res(null, { routine: null, error: String(e && e.message ? e.message : e) }))
      } else if (req.method === 'session.save') {
        this.saveSessions((req.params && req.params.sessions) || [])
          .then((r) => res(null, r))
          .catch(() => res(null, { ok: false }))
      } else {
        res('método desconocido')
      }
    },

    getRoutine() {
      return this.fetch({ url: LOCAL + '/routine', method: 'GET', timeout: 3000 })
        .then((r) => {
          if (r && r.status === 200 && r.body) {
            const body = typeof r.body === 'string' ? JSON.parse(r.body) : r.body
            if (body && body.exercises && body.exercises.length) {
              this.settings.setItem('routineText', JSON.stringify(body))
              return { routine: body, source: 'app' }
            }
          }
          throw new Error('sin rutina en la app')
        })
        .catch(() => this.routineFromSettings())
    },

    routineFromSettings() {
      const t = this.settings.getItem('routineText')
      if (!t) return { routine: null }
      return { routine: parseRoutine(t), source: 'ajustes' }
    },

    saveSessions(list) {
      // Guardamos siempre una copia en Zepp (se ve en los ajustes de la miniapp).
      let saved = []
      try { saved = JSON.parse(this.settings.getItem('sessions') || '[]') } catch (e) {}
      const seen = {}
      saved.forEach((x) => { seen[x.start] = true })
      list.forEach((x) => { if (!seen[x.start]) saved.push(x) })
      this.settings.setItem('sessions', JSON.stringify(saved.slice(-30)))

      return this.fetch({
        url: LOCAL + '/sessions',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions: list }),
        timeout: 3000,
      })
        .then((r) => ({ ok: true, phone: !!(r && r.status === 200) }))
        .catch(() => ({ ok: true, phone: false }))
    },
  }),
)
