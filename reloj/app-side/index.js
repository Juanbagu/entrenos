// Corre dentro de la app Zepp del móvil. Hace de puente entre el reloj y:
//   A) nuestra app Android, si está en marcha (servidor local en 127.0.0.1:8765), o
//   C) el texto pegado en los ajustes de la miniapp (siempre funciona).
// Los entrenos que no puedan entregarse a la app Android se guardan aquí y se reintentan.
import { BaseSideService } from '@zeppos/zml/base-side'
import { parseRoutine } from '../shared/parse'
import { normalizeRoutine } from '../shared/routine'

const LOCAL = 'http://127.0.0.1:8765'
const MAX_KEEP = 30

function readList(settings, key) {
  try {
    const v = JSON.parse(settings.getItem(key) || '[]')
    return Array.isArray(v) ? v : []
  } catch (e) {
    return []
  }
}

function merge(list, more) {
  const seen = {}
  list.forEach((x) => { seen[x.start] = true })
  more.forEach((x) => {
    if (x && typeof x.start === 'number' && !seen[x.start]) {
      seen[x.start] = true
      list.push(x)
    }
  })
  return list.slice(-MAX_KEEP)
}

AppSideService(
  BaseSideService({
    onInit() {},
    onRun() {},
    onDestroy() {},

    onRequest(req, res) {
      if (req.method === 'routine.get') {
        this.flushOutbox()
        this.getRoutine()
          .then((r) => res(null, r))
          .catch((e) => res(null, { routine: null, error: String(e && e.message ? e.message : e) }))
      } else if (req.method === 'session.save') {
        const list = (req.params && Array.isArray(req.params.sessions)) ? req.params.sessions : []
        this.saveSessions(list)
          .then((r) => res(null, r))
          .catch(() => res(null, { ok: false }))
      } else {
        res('método desconocido')
      }
    },

    getRoutine() {
      return this.fetch({ url: LOCAL + '/routine', method: 'GET', timeout: 4000 })
        .then((r) => {
          if (r && r.status === 200 && r.body) {
            const body = typeof r.body === 'string' ? JSON.parse(r.body) : r.body
            const routine = normalizeRoutine(body) // valida antes de mandarla al reloj
            this.settings.setItem('routineText', JSON.stringify(body))
            return { routine: routine, source: 'app' }
          }
          throw new Error('sin rutina en la app')
        })
        .catch(() => this.routineFromSettings())
    },

    routineFromSettings() {
      const t = this.settings.getItem('routineText')
      if (!t) return { routine: null }
      return { routine: normalizeRoutine(parseRoutine(t)), source: 'ajustes' }
    },

    saveSessions(list) {
      // Copia visible en los ajustes de la miniapp + bandeja de salida para la app Android.
      this.settings.setItem('sessions', JSON.stringify(merge(readList(this.settings, 'sessions'), list)))
      this.settings.setItem('outbox', JSON.stringify(merge(readList(this.settings, 'outbox'), list)))
      return this.flushOutbox().then((phone) => ({ ok: true, phone: phone }))
    },

    // Intenta entregar a la app Android todo lo pendiente. Devuelve true si lo ha conseguido.
    flushOutbox() {
      const outbox = readList(this.settings, 'outbox')
      if (!outbox.length) return Promise.resolve(true)
      return this.fetch({
        url: LOCAL + '/sessions',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions: outbox }),
        timeout: 4000,
      })
        .then((r) => {
          if (r && r.status === 200) {
            this.settings.setItem('outbox', '[]')
            return true
          }
          return false
        })
        .catch(() => false)
    },
  }),
)
