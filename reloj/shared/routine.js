// Lógica pura de la sesión: sin APIs del reloj, para poder probarla con Node.
// Estado serializable (se guarda en LocalStorage para retomar si el reloj cierra la app).

export const PHASE = {
  WORK: 'work', // toca hacer una serie
  TIMER: 'timer', // serie por tiempo en marcha (plancha 45s…)
  REST: 'rest', // descansando
  DONE: 'done', // terminado
}

export const DEFAULT_REST_S = 90
export const LIMITS = { exercises: 40, sets: 20, restS: 900, timedS: 3600, name: 48 }

export function normalizeRoutine(r) {
  if (!r || !Array.isArray(r.exercises) || r.exercises.length === 0) {
    throw new Error('La rutina no tiene ejercicios')
  }
  const defRest = clamp(toInt(r.defaultRest, DEFAULT_REST_S), 0, LIMITS.restS)
  return {
    name: cut(r.name || 'Rutina', LIMITS.name),
    exercises: r.exercises.slice(0, LIMITS.exercises).map(function (e, i) {
      const reps = e.reps === undefined || e.reps === null ? '' : cut(e.reps, 12)
      return {
        name: cut(e.name || 'Ejercicio ' + (i + 1), LIMITS.name),
        sets: clamp(toInt(e.sets, 1), 1, LIMITS.sets),
        reps: reps,
        weight: e.weight === undefined || e.weight === null ? '' : cut(e.weight, 16),
        rest: clamp(toInt(e.rest, defRest), 0, LIMITS.restS),
        note: e.note ? cut(e.note, 80) : '',
        timedS: timedSeconds(reps),
      }
    }),
  }
}

// "45s", "45 s", "1min", "90''" → segundos. Si no es por tiempo, 0.
export function timedSeconds(reps) {
  const m = String(reps || '').trim().match(/^(\d+)\s*(s|seg|segundos|''|"|min|m|')$/i)
  if (!m) return 0
  const v = parseInt(m[1], 10)
  return clamp(/^(min|m|')$/i.test(m[2]) ? v * 60 : v, 1, LIMITS.timedS)
}

export function startSession(routine, now) {
  const r = normalizeRoutine(routine)
  return {
    v: 2,
    routine: r,
    phase: PHASE.WORK,
    exIdx: 0,
    setIdx: 0, // serie actual (0 = primera)
    restEndsAt: 0,
    timerEndsAt: 0,
    startedAt: now,
    endedAt: 0,
    paused: false,
    pausedAt: 0,
    pausedTotal: 0,
    exStartedAt: now,
    log: [], // { ex, set, at, reps, weight } por cada serie hecha
    exLog: [], // { ex, name, start, end, sets, planned, skipped }
    hr: { sum: 0, n: 0, max: 0 },
    exHr: {}, // ex -> { sum, n, max }
  }
}

function clone(s) {
  return JSON.parse(JSON.stringify(s))
}

function current(s) {
  return s.routine.exercises[s.exIdx]
}

function doneSets(s, exIdx) {
  return s.log.filter(function (l) { return l.ex === exIdx }).length
}

function closeExercise(s, now, skipped) {
  const ex = current(s)
  s.exLog.push({ ex: s.exIdx, name: ex.name, start: s.exStartedAt, end: now, sets: doneSets(s, s.exIdx), planned: ex.sets, skipped: !!skipped })
}

function nextExercise(s, now, skipped) {
  closeExercise(s, now, skipped)
  s.restEndsAt = 0
  s.timerEndsAt = 0
  if (s.exIdx >= s.routine.exercises.length - 1) {
    s.phase = PHASE.DONE
    s.endedAt = now
    return s
  }
  s.exIdx += 1
  s.setIdx = 0
  s.exStartedAt = now
  s.phase = PHASE.WORK
  return s
}

// Marca la serie actual como hecha y decide qué viene: descanso, siguiente ejercicio o fin.
function completeSet(s, now) {
  const ex = current(s)
  s.log.push({ ex: s.exIdx, set: s.setIdx, at: now, reps: ex.reps, weight: ex.weight })
  s.timerEndsAt = 0
  if (s.setIdx < ex.sets - 1) {
    s.setIdx += 1
    if (ex.rest > 0) {
      s.phase = PHASE.REST
      s.restEndsAt = now + ex.rest * 1000
    } else {
      s.phase = PHASE.WORK
    }
    return s
  }
  return nextExercise(s, now, false)
}

// Botón de arriba, pulsación corta.
//   Serie normal: la marca hecha.
//   Serie por tiempo: la primera pulsación arranca la cuenta atrás; otra la da por terminada antes.
//   Descanso: lo salta.
export function primary(state, now) {
  const s = clone(state)
  if (s.paused || s.phase === PHASE.DONE) return s
  if (s.phase === PHASE.REST) {
    s.phase = PHASE.WORK
    s.restEndsAt = 0
    return s
  }
  const ex = current(s)
  if (s.phase === PHASE.WORK && ex.timedS > 0) {
    s.phase = PHASE.TIMER
    s.timerEndsAt = now + ex.timedS * 1000
    return s
  }
  return completeSet(s, now)
}

// Botón de arriba, pulsación larga: saltar al siguiente ejercicio.
export function skipExercise(state, now) {
  const s = clone(state)
  if (s.paused || s.phase === PHASE.DONE) return s
  return nextExercise(s, now, doneSets(s, s.exIdx) < current(s).sets)
}

// Se llama cada segundo. Devuelve qué ha pasado para que la pantalla vibre.
export function tick(state, now) {
  if (state.paused) return { state: state, restEnded: false, timerEnded: false }
  if (state.phase === PHASE.REST && now >= state.restEndsAt) {
    const s = clone(state)
    s.phase = PHASE.WORK
    s.restEndsAt = 0
    return { state: s, restEnded: true, timerEnded: false }
  }
  if (state.phase === PHASE.TIMER && now >= state.timerEndsAt) {
    return { state: completeSet(clone(state), state.timerEndsAt), restEnded: false, timerEnded: true }
  }
  return { state: state, restEnded: false, timerEnded: false }
}

export function pause(state, now) {
  const s = clone(state)
  if (s.paused || s.phase === PHASE.DONE) return s
  s.paused = true
  s.pausedAt = now
  return s
}

export function resume(state, now) {
  const s = clone(state)
  if (!s.paused) return s
  const d = Math.max(0, now - s.pausedAt)
  s.pausedTotal += d
  if (s.phase === PHASE.REST) s.restEndsAt += d // el descanso no corre en pausa
  if (s.phase === PHASE.TIMER) s.timerEndsAt += d
  s.paused = false
  s.pausedAt = 0
  return s
}

export function finish(state, now) {
  let s = clone(state)
  if (s.phase === PHASE.DONE) return s
  if (s.paused) s = resume(s, now)
  if (s.phase === PHASE.TIMER) s.log.push({ ex: s.exIdx, set: s.setIdx, at: now, reps: current(s).reps, weight: current(s).weight })
  closeExercise(s, now, true)
  s.phase = PHASE.DONE
  s.endedAt = now
  return s
}

// Corrige repeticiones o peso de la última serie hecha (durante el descanso).
// field: 'reps' | 'weight'; delta: +1/-1 (reps) o +1/-1 pasos de peso (2,5 kg o 5 lb).
export function adjustLast(state, field, delta) {
  if (!state.log.length) return state
  const s = clone(state)
  const last = s.log[s.log.length - 1]
  if (field === 'reps') {
    const n = parseInt(last.reps, 10)
    const base = isNaN(n) ? 0 : n
    last.reps = String(clamp(base + delta, 0, 999))
  } else if (field === 'weight') {
    const w = parseWeight(last.weight)
    const step = w.unit === 'lb' ? 5 : 2.5
    const v = Math.max(0, Math.round((w.value + delta * step) * 10) / 10)
    last.weight = v === 0 ? '' : fmtNum(v) + ' ' + w.unit
  }
  return s
}

export function lastSet(state) {
  return state.log.length ? state.log[state.log.length - 1] : null
}

export function parseWeight(t) {
  const m = String(t || '').replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(kg|lb)?/i)
  if (!m) return { value: 0, unit: 'kg' }
  return { value: parseFloat(m[1]), unit: m[2] && /lb/i.test(m[2]) ? 'lb' : 'kg' }
}

export function addHeartRate(state, bpm) {
  if (!bpm || bpm < 30 || bpm > 240 || state.phase === PHASE.DONE || state.paused) return state
  const s = clone(state)
  s.hr.sum += bpm
  s.hr.n += 1
  if (bpm > s.hr.max) s.hr.max = bpm
  const k = String(s.exIdx)
  const e = s.exHr[k] || { sum: 0, n: 0, max: 0 }
  e.sum += bpm
  e.n += 1
  if (bpm > e.max) e.max = bpm
  s.exHr[k] = e
  return s
}

function leftS(endsAt, state, now) {
  const ref = state.paused ? state.pausedAt : now
  return Math.max(0, Math.ceil((endsAt - ref) / 1000))
}

export function restLeftS(state, now) {
  return state.phase === PHASE.REST ? leftS(state.restEndsAt, state, now) : 0
}

export function timerLeftS(state, now) {
  return state.phase === PHASE.TIMER ? leftS(state.timerEndsAt, state, now) : 0
}

export function elapsedS(state, now) {
  const end = state.endedAt || (state.paused ? state.pausedAt : now)
  return Math.max(0, Math.floor((end - state.startedAt - state.pausedTotal) / 1000))
}

export function nextLabel(state) {
  if (state.phase === PHASE.DONE) return ''
  const ex = current(state)
  if (state.setIdx < ex.sets - 1 || state.phase === PHASE.REST) {
    return 'Serie ' + Math.min(state.setIdx + 2, ex.sets) + '/' + ex.sets + ' de ' + ex.name
  }
  const nx = state.routine.exercises[state.exIdx + 1]
  return nx ? nx.name + ' · ' + describe(nx) : 'Último ejercicio'
}

export function describe(ex) {
  let t = ex.sets + ' × ' + (ex.reps || '—')
  if (ex.weight) t += ' · ' + ex.weight
  return t
}

// Resumen que se envía al móvil y se guarda.
export function summary(state) {
  const hr = state.hr
  return {
    v: 2,
    routine: state.routine.name,
    start: state.startedAt,
    end: state.endedAt,
    activeS: elapsedS(state, state.endedAt),
    sets: state.log.length,
    hrAvg: hr.n ? Math.round(hr.sum / hr.n) : 0,
    hrMax: hr.max,
    exercises: state.exLog.map(function (e) {
      const h = state.exHr[String(e.ex)]
      const ex = state.routine.exercises[e.ex]
      return {
        name: e.name,
        start: e.start,
        end: e.end,
        sets: e.sets,
        planned: e.planned,
        reps: ex.reps,
        weight: ex.weight,
        skipped: e.skipped,
        hrAvg: h && h.n ? Math.round(h.sum / h.n) : 0,
        hrMax: h ? h.max : 0,
        done: state.log.filter(function (l) { return l.ex === e.ex }).map(function (l) {
          return { reps: l.reps, weight: l.weight }
        }),
      }
    }),
  }
}

export function fmtTime(totalS) {
  const m = Math.floor(totalS / 60)
  const s = totalS % 60
  if (m >= 60) {
    const h = Math.floor(m / 60)
    return h + ':' + pad(m % 60) + ':' + pad(s)
  }
  return m + ':' + pad(s)
}

function fmtNum(v) {
  return v % 1 === 0 ? String(v) : String(v).replace('.', ',')
}

function pad(n) {
  return n < 10 ? '0' + n : String(n)
}

function cut(v, n) {
  return String(v).replace(/\s+/g, ' ').trim().slice(0, n)
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

function toInt(v, def) {
  const n = parseInt(v, 10)
  return isNaN(n) ? def : n
}
