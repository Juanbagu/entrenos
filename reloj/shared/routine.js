// Lógica pura de la sesión: sin APIs del reloj, para poder probarla con Node.
// Estado serializable (se guarda en LocalStorage para retomar si el reloj cierra la app).

export const PHASE = {
  WORK: 'work', // haciendo una serie
  REST: 'rest', // descansando
  DONE: 'done', // terminado
}

export const DEFAULT_REST_S = 90

export function normalizeRoutine(r) {
  if (!r || !Array.isArray(r.exercises) || r.exercises.length === 0) {
    throw new Error('La rutina no tiene ejercicios')
  }
  const defRest = toInt(r.defaultRest, DEFAULT_REST_S)
  return {
    name: String(r.name || 'Rutina'),
    exercises: r.exercises.map(function (e, i) {
      const sets = Math.max(1, toInt(e.sets, 1))
      return {
        name: String(e.name || 'Ejercicio ' + (i + 1)).trim(),
        sets: sets,
        reps: e.reps === undefined || e.reps === null ? '' : String(e.reps),
        weight: e.weight === undefined || e.weight === null ? '' : String(e.weight),
        rest: Math.max(0, toInt(e.rest, defRest)),
        note: e.note ? String(e.note) : '',
      }
    }),
  }
}

export function startSession(routine, now) {
  const r = normalizeRoutine(routine)
  return {
    v: 1,
    routine: r,
    phase: PHASE.WORK,
    exIdx: 0,
    setIdx: 0, // serie actual (0 = primera)
    restEndsAt: 0,
    startedAt: now,
    endedAt: 0,
    paused: false,
    pausedAt: 0,
    pausedTotal: 0,
    exStartedAt: now,
    log: [], // { ex, set, at } por cada serie hecha
    exLog: [], // { ex, name, start, end, sets, skipped }
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

function closeExercise(s, now, skipped) {
  const ex = current(s)
  const done = s.log.filter(function (l) { return l.ex === s.exIdx }).length
  s.exLog.push({ ex: s.exIdx, name: ex.name, start: s.exStartedAt, end: now, sets: done, planned: ex.sets, skipped: !!skipped })
}

function nextExercise(s, now, skipped) {
  closeExercise(s, now, skipped)
  if (s.exIdx >= s.routine.exercises.length - 1) {
    s.phase = PHASE.DONE
    s.endedAt = now
    return s
  }
  s.exIdx += 1
  s.setIdx = 0
  s.exStartedAt = now
  s.phase = PHASE.WORK
  s.restEndsAt = 0
  return s
}

// Botón de arriba, pulsación corta.
// En serie: la marca hecha. Si quedan series → descanso; si era la última → siguiente ejercicio.
// En descanso: salta el descanso.
export function primary(state, now) {
  const s = clone(state)
  if (s.paused || s.phase === PHASE.DONE) return s
  if (s.phase === PHASE.REST) {
    s.phase = PHASE.WORK
    s.restEndsAt = 0
    return s
  }
  const ex = current(s)
  s.log.push({ ex: s.exIdx, set: s.setIdx, at: now })
  if (s.setIdx < ex.sets - 1) {
    s.setIdx += 1
    if (ex.rest > 0) {
      s.phase = PHASE.REST
      s.restEndsAt = now + ex.rest * 1000
    }
    return s
  }
  return nextExercise(s, now, false)
}

// Botón de arriba, pulsación larga: saltar al siguiente ejercicio.
export function skipExercise(state, now) {
  const s = clone(state)
  if (s.paused || s.phase === PHASE.DONE) return s
  const ex = current(s)
  const done = s.log.filter(function (l) { return l.ex === s.exIdx }).length
  return nextExercise(s, now, done < ex.sets)
}

// Se llama cada segundo. Devuelve { state, restEnded } para que la pantalla vibre.
export function tick(state, now) {
  if (state.paused || state.phase !== PHASE.REST || now < state.restEndsAt) {
    return { state: state, restEnded: false }
  }
  const s = clone(state)
  s.phase = PHASE.WORK
  s.restEndsAt = 0
  return { state: s, restEnded: true }
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
  const d = now - s.pausedAt
  s.pausedTotal += d
  if (s.phase === PHASE.REST) s.restEndsAt += d // el descanso no corre en pausa
  s.paused = false
  s.pausedAt = 0
  return s
}

export function finish(state, now) {
  let s = clone(state)
  if (s.phase === PHASE.DONE) return s
  if (s.paused) s = resume(s, now)
  closeExercise(s, now, true)
  s.phase = PHASE.DONE
  s.endedAt = now
  return s
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

export function restLeftS(state, now) {
  if (state.phase !== PHASE.REST) return 0
  const ref = state.paused ? state.pausedAt : now
  return Math.max(0, Math.ceil((state.restEndsAt - ref) / 1000))
}

export function elapsedS(state, now) {
  const end = state.endedAt || (state.paused ? state.pausedAt : now)
  return Math.max(0, Math.floor((end - state.startedAt - state.pausedTotal) / 1000))
}

export function nextLabel(state) {
  const ex = current(state)
  if (state.phase !== PHASE.DONE && state.setIdx < ex.sets - 1) {
    return 'Serie ' + (state.setIdx + 2) + '/' + ex.sets + ' de ' + ex.name
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
    v: 1,
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

function pad(n) {
  return n < 10 ? '0' + n : String(n)
}

function toInt(v, def) {
  const n = parseInt(v, 10)
  return isNaN(n) ? def : n
}
