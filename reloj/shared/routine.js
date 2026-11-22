// Lógica pura de la sesión: sin APIs del reloj, para poder probarla con Node.
// Estado serializable (se guarda en LocalStorage para retomar si el reloj cierra la app).
//
// Una rutina tiene bloques y cada bloque, ejercicios:
//   sets    → fuerza clásica: series × reps con descanso
//   rounds  → N rondas seguidas de los ejercicios (con descanso entre rondas opcional)
//   fortime → como rounds pero cronometrado (Hyrox, 21-15-9…), con límite de tiempo opcional
//   amrap   → tantas rondas como puedas en X minutos
//   emom    → cada minuto (o cada N) un ejercicio; avanza solo
// Al normalizar, rounds/fortime se "despliegan" en unidades (un ejercicio en una ronda concreta).

export const PHASE = {
  WORK: 'work', // toca hacer una serie (o empezar el bloque)
  TIMER: 'timer', // serie por tiempo en marcha (plancha 45s…)
  REST: 'rest', // descansando (o esperando al siguiente minuto en un EMOM)
  DONE: 'done', // terminado
}

export const DEFAULT_REST_S = 90
export const LIMITS = { units: 120, sets: 20, restS: 900, timedS: 3600, name: 48, capS: 4 * 3600, rounds: 50 }
const TYPES = ['sets', 'rounds', 'fortime', 'amrap', 'emom']

// ---------- Normalización ----------

export function normalizeRoutine(r) {
  if (!r || !Array.isArray(r.exercises) || r.exercises.length === 0) {
    throw new Error('La rutina no tiene ejercicios')
  }
  const defRest = clamp(toInt(r.defaultRest, DEFAULT_REST_S), 0, LIMITS.restS)
  const srcBlocks = Array.isArray(r.blocks) && r.blocks.length ? r.blocks : [{ type: 'sets' }]

  // Agrupa ejercicios consecutivos del mismo bloque.
  const groups = []
  r.exercises.forEach(function (e) {
    let bi = toInt(e && e.block, 0)
    if (bi < 0 || bi >= srcBlocks.length) bi = 0
    const last = groups[groups.length - 1]
    if (last && last.src === bi) last.items.push(e)
    else groups.push({ src: bi, items: [e] })
  })

  const blocks = []
  const units = []
  groups.forEach(function (g) {
    const b = normBlock(srcBlocks[g.src])
    const bi = blocks.length
    blocks.push(b)
    const items = g.items.map(function (e, i) { return normExercise(e, i, b.type === 'sets' ? defRest : 0) })
    if (b.type === 'rounds' || b.type === 'fortime') {
      for (let k = 1; k <= b.rounds; k++) {
        items.forEach(function (it, i) {
          const reps = roundReps(it.reps, b, k)
          units.push(Object.assign({}, it, {
            reps: reps, timedS: timedSeconds(reps), block: bi, round: k, rounds: b.rounds,
            restAfter: i === items.length - 1 && k < b.rounds ? b.restS : 0,
          }))
        })
      }
    } else {
      items.forEach(function (it, i) {
        units.push(Object.assign({}, it, {
          sets: b.type === 'sets' ? it.sets : 1,
          block: bi, round: 0, rounds: 0,
          restAfter: b.type === 'sets' || i < items.length - 1 ? 0 : 0,
        }))
      })
    }
  })
  if (units.length > LIMITS.units) units.length = LIMITS.units
  return { name: cut(r.name || 'Rutina', LIMITS.name), blocks: blocks, exercises: units }
}

function normBlock(b) {
  b = b || {}
  const type = TYPES.indexOf(b.type) >= 0 ? b.type : 'sets'
  const capS = clamp(toInt(b.capS, 0), 0, LIMITS.capS)
  let everyS = clamp(toInt(b.everyS, 60), 10, 3600)
  return {
    name: cut(b.name || defaultBlockName(type, b), LIMITS.name),
    type: type,
    rounds: type === 'rounds' || type === 'fortime' ? clamp(toInt(b.rounds, 1), 1, LIMITS.rounds) : 1,
    capS: type === 'amrap' || type === 'emom' ? (capS || (type === 'amrap' ? 600 : everyS * 10)) : capS,
    everyS: type === 'emom' ? everyS : 0,
    restS: clamp(toInt(b.restS, 0), 0, LIMITS.restS),
    scheme: b.scheme ? cut(b.scheme, 40) : '',
  }
}

function defaultBlockName(type, b) {
  if (type === 'amrap') return 'AMRAP'
  if (type === 'emom') return 'EMOM'
  if (type === 'fortime') return 'For time'
  if (type === 'rounds') return toInt(b.rounds, 1) + ' rondas'
  return ''
}

function normExercise(e, i, defRest) {
  const reps = e.reps === undefined || e.reps === null ? '' : cut(e.reps, 16)
  return {
    name: cut(e.name || 'Ejercicio ' + (i + 1), LIMITS.name),
    sets: clamp(toInt(e.sets, 1), 1, LIMITS.sets),
    reps: reps,
    weight: e.weight === undefined || e.weight === null ? '' : cut(e.weight, 16),
    rest: clamp(toInt(e.rest, defRest), 0, LIMITS.restS),
    note: e.note ? cut(e.note, 80) : '',
    timedS: timedSeconds(reps),
  }
}

// Reps de una ronda concreta: "21-15-9" en la ronda 2 → "15". Si el bloque tiene esquema y el ejercicio no, usa el esquema.
function roundReps(reps, b, k) {
  const parts = String(reps || '').split('-')
  if (parts.length === b.rounds && parts.length > 1 && parts.every(isNum)) return parts[k - 1]
  if (!reps && b.scheme) {
    const sp = b.scheme.split('-')
    if (sp.length === b.rounds) return sp[k - 1]
  }
  return reps
}

// "45s", "45 s", "1min", "90''" → segundos. Si no es por tiempo, 0.
export function timedSeconds(reps) {
  // Ojo: "m" sola son metros ("400 m"), no minutos.
  const m = String(reps || '').trim().match(/^(\d+)\s*(s|seg|segundos|''|"|min|minutos|')$/i)
  if (!m) return 0
  const v = parseInt(m[1], 10)
  return clamp(/^(min|minutos|')$/i.test(m[2]) ? v * 60 : v, 1, LIMITS.timedS)
}

// ---------- Sesión ----------

export function startSession(routine, now) {
  const r = normalizeRoutine(routine)
  const s = {
    v: 3,
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
    blk: null, // bloque en curso
    blockLog: [], // resultados por bloque
    hr: { sum: 0, n: 0, max: 0 },
    exHr: {}, // ex -> { sum, n, max }
  }
  enterBlock(s, now)
  return s
}

function clone(s) {
  return JSON.parse(JSON.stringify(s))
}

function current(s) {
  return s.routine.exercises[s.exIdx]
}

export function blockOf(s) {
  return s.routine.blocks[current(s).block]
}

function needsStart(b) {
  return b.type === 'amrap' || b.type === 'emom' || b.type === 'fortime'
}

// Primer y último índice de unidad del bloque bi.
function blockRange(s, bi) {
  let a = -1
  let z = -1
  s.routine.exercises.forEach(function (u, i) {
    if (u.block === bi) {
      if (a < 0) a = i
      z = i
    }
  })
  return [a, z]
}

function enterBlock(s, now) {
  const bi = current(s).block
  const b = s.routine.blocks[bi]
  s.blk = { idx: bi, started: !needsStart(b), startedAt: needsStart(b) ? 0 : now, endsAt: 0, intervalEndsAt: 0, round: 1, inRound: 0, missed: 0, capped: false }
}

function startBlock(s, now) {
  const b = blockOf(s)
  s.blk.started = true
  s.blk.startedAt = now
  s.blk.endsAt = b.capS ? now + b.capS * 1000 : 0
  s.blk.intervalEndsAt = b.type === 'emom' ? now + b.everyS * 1000 : 0
  s.exStartedAt = now
}

function closeBlock(s, now) {
  if (!s.blk || s.blk.closed) return
  const b = s.routine.blocks[s.blk.idx]
  s.blk.closed = true
  if (b.type === 'sets' || !s.blk.started) return
  s.blockLog.push({
    name: b.name, type: b.type, start: s.blk.startedAt, end: now,
    timeS: Math.max(0, Math.round((now - s.blk.startedAt) / 1000)),
    rounds: b.type === 'amrap' ? s.blk.round - 1 : b.type === 'emom' ? s.blk.round : b.rounds,
    extra: b.type === 'amrap' ? s.blk.inRound : 0,
    missed: s.blk.missed,
    capped: !!s.blk.capped,
  })
}

function doneSets(s, exIdx, since) {
  return s.log.filter(function (l) { return l.ex === exIdx && l.at >= since }).length
}

function closeExercise(s, now, skipped) {
  const ex = current(s)
  const done = doneSets(s, s.exIdx, s.exStartedAt)
  s.exLog.push({ ex: s.exIdx, name: ex.name, start: s.exStartedAt, end: now, sets: done, planned: ex.sets, skipped: !!skipped || done < ex.sets })
}

// Mueve a la unidad idx (cerrando la actual). Si cambia de bloque, cierra el anterior y abre el nuevo.
function goTo(s, idx, now) {
  const prevBlock = current(s).block
  s.restEndsAt = 0
  s.timerEndsAt = 0
  s.setIdx = 0
  s.phase = PHASE.WORK
  if (idx >= s.routine.exercises.length) {
    closeBlock(s, now)
    s.phase = PHASE.DONE
    s.endedAt = now
    return s
  }
  s.exIdx = idx
  s.exStartedAt = now
  if (s.routine.exercises[idx].block !== prevBlock) {
    closeBlock(s, now)
    enterBlock(s, now)
  }
  return s
}

// Termina la unidad actual y pasa a la siguiente según el tipo de bloque.
function nextUnit(s, now, skipped) {
  const u = current(s)
  const b = blockOf(s)
  closeExercise(s, now, skipped)
  const range = blockRange(s, u.block)
  if (b.type === 'amrap') {
    if (s.exIdx === range[1]) {
      s.blk.round += 1
      s.blk.inRound = 0
      return goTo(s, range[0], now)
    }
    s.blk.inRound += 1
    return goTo(s, s.exIdx + 1, now)
  }
  if (b.type === 'emom') {
    // En un EMOM se espera al siguiente intervalo (tick lo hace avanzar).
    s.phase = PHASE.REST
    s.restEndsAt = s.blk.intervalEndsAt
    s.blk.unitDone = true
    return s
  }
  goTo(s, s.exIdx + 1, now)
  if (s.phase !== PHASE.DONE && u.restAfter > 0) {
    s.phase = PHASE.REST
    s.restEndsAt = now + u.restAfter * 1000
  }
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
  return nextUnit(s, now, false)
}

// Sale del bloque actual (por límite de tiempo o porque lo saltas) y va al siguiente.
function endBlock(s, now, capped) {
  const range = blockRange(s, current(s).block)
  if (s.phase !== PHASE.REST || !s.blk.unitDone) {
    closeExercise(s, now, true)
    if (blockOf(s).type === 'emom' && s.blk.started) s.blk.missed += 1
  }
  s.blk.capped = !!capped
  closeBlock(s, now)
  return goTo(s, range[1] + 1, now)
}

// Botón de arriba, pulsación corta.
//   Inicio de AMRAP/EMOM/For time: arranca el reloj del bloque.
//   Serie normal: la marca hecha. Serie por tiempo: arranca (u, otra vez, termina) la cuenta atrás.
//   Descanso: lo salta (en un EMOM no: hay que esperar al minuto).
export function primary(state, now) {
  const s = clone(state)
  if (s.paused || s.phase === PHASE.DONE) return s
  if (!s.blk.started) {
    startBlock(s, now)
    return s
  }
  if (s.phase === PHASE.REST) {
    if (blockOf(s).type === 'emom' && s.blk.unitDone) return s
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

// Botón de arriba, pulsación larga: siguiente ejercicio (en AMRAP/EMOM: terminar el bloque).
export function skipExercise(state, now) {
  const s = clone(state)
  if (s.paused || s.phase === PHASE.DONE) return s
  const b = blockOf(s)
  if (b.type === 'amrap' || b.type === 'emom' || !s.blk.started) return endBlock(s, now, false)
  return nextUnit(s, now, true)
}

// Se llama cada segundo. Devuelve qué ha pasado para que la pantalla vibre.
export function tick(state, now) {
  const none = { state: state, restEnded: false, timerEnded: false, blockEnded: false, intervalEnded: false }
  if (state.paused || state.phase === PHASE.DONE) return none
  const b = blockOf(state)
  if (state.blk.started && state.blk.endsAt && now >= state.blk.endsAt) {
    const s = endBlock(clone(state), state.blk.endsAt, true)
    return Object.assign({}, none, { state: s, blockEnded: true })
  }
  if (b.type === 'emom' && state.blk.started && now >= state.blk.intervalEndsAt) {
    const s = clone(state)
    const at = s.blk.intervalEndsAt
    if (!s.blk.unitDone) {
      s.blk.missed += 1
      closeExercise(s, at, true)
    }
    s.blk.unitDone = false
    const range = blockRange(s, current(s).block)
    const wrap = s.exIdx >= range[1]
    if (wrap) s.blk.round += 1
    s.exIdx = wrap ? range[0] : s.exIdx + 1
    s.setIdx = 0
    s.phase = PHASE.WORK
    s.restEndsAt = 0
    s.timerEndsAt = 0
    s.exStartedAt = at
    s.blk.intervalEndsAt = at + b.everyS * 1000
    return Object.assign({}, none, { state: s, intervalEnded: true })
  }
  if (state.phase === PHASE.REST && now >= state.restEndsAt) {
    const s = clone(state)
    s.phase = PHASE.WORK
    s.restEndsAt = 0
    return Object.assign({}, none, { state: s, restEnded: true })
  }
  if (state.phase === PHASE.TIMER && now >= state.timerEndsAt) {
    return Object.assign({}, none, { state: completeSet(clone(state), state.timerEndsAt), timerEnded: true })
  }
  return none
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
  if (s.restEndsAt) s.restEndsAt += d // nada corre en pausa
  if (s.timerEndsAt) s.timerEndsAt += d
  if (s.blk && s.blk.started) {
    s.blk.startedAt += d
    if (s.blk.endsAt) s.blk.endsAt += d
    if (s.blk.intervalEndsAt) s.blk.intervalEndsAt += d
  }
  s.paused = false
  s.pausedAt = 0
  return s
}

export function finish(state, now) {
  let s = clone(state)
  if (s.phase === PHASE.DONE) return s
  if (s.paused) s = resume(s, now)
  if (s.phase === PHASE.TIMER) s.log.push({ ex: s.exIdx, set: s.setIdx, at: now, reps: current(s).reps, weight: current(s).weight })
  if (!(s.phase === PHASE.REST && s.blk.unitDone)) closeExercise(s, now, true)
  closeBlock(s, now)
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
    const unit = String(last.reps || '').replace(/^\d+/, '') // conserva " m", " cal", "s"
    last.reps = String(clamp(base + delta, 0, 9999)) + (isNaN(n) ? '' : unit)
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

// ---------- Lo que muestra la pantalla ----------

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

export function waitingStart(state) {
  return state.phase !== PHASE.DONE && !!state.blk && !state.blk.started
}

// Línea de estado del bloque: "AMRAP 12' · ronda 3 · quedan 8:12", "Ronda 2/4", "Hyrox sim · 23:41".
export function blockLabel(state, now) {
  if (state.phase === PHASE.DONE) return ''
  const b = blockOf(state)
  const u = current(state)
  const ref = state.paused ? state.pausedAt : now
  const st = state.blk
  if (b.type === 'sets') return ''
  if (!st.started) return b.name
  if (b.type === 'amrap') return b.name + ' · ronda ' + st.round + ' · quedan ' + fmtTime(leftS(st.endsAt, state, now))
  if (b.type === 'emom') {
    const total = Math.max(1, Math.round(b.capS / b.everyS))
    const n = Math.min(total, Math.floor((ref - st.startedAt) / (b.everyS * 1000)) + 1)
    return b.name + ' · ' + n + '/' + total + ' · ' + fmtTime(leftS(st.intervalEndsAt, state, now))
  }
  const el = fmtTime(Math.max(0, Math.floor((ref - st.startedAt) / 1000)))
  const r = u.rounds > 1 ? ' · ronda ' + u.round + '/' + u.rounds : ''
  if (b.type === 'fortime') return b.name + r + ' · ' + el + (st.endsAt ? ' (cap ' + fmtTime(b.capS) + ')' : '')
  return 'Ronda ' + u.round + '/' + u.rounds
}

// Meta corta para la pantalla grande: "1000 m", "20 cal", "45s", "20", "máx".
export function targetShort(ex) {
  const r = String(ex.reps || '').trim()
  if (!r) return '—'
  if (/^max$/i.test(r)) return 'máx'
  return r
}

// Meta en texto: "20 reps", "1000 m", "20 cal", "45 s".
export function targetText(ex) {
  const r = String(ex.reps || '').trim()
  if (!r) return ''
  if (/^\d+(?:-\d+)*$/.test(r)) return r + ' reps'
  if (/^max$/i.test(r)) return 'máx. reps'
  return r.replace(/^(\d+)s$/, '$1 s')
}

export function nextLabel(state) {
  if (state.phase === PHASE.DONE) return ''
  const ex = current(state)
  const b = blockOf(state)
  if (state.setIdx < ex.sets - 1 || (state.phase === PHASE.REST && state.setIdx > 0 && !(state.blk && state.blk.unitDone))) {
    return 'Serie ' + Math.min(state.setIdx + 2, ex.sets) + '/' + ex.sets + ' de ' + ex.name
  }
  let nxIdx = state.exIdx + 1
  if (b.type === 'amrap' || b.type === 'emom') {
    const range = blockRange(state, ex.block)
    if (state.exIdx >= range[1]) nxIdx = range[0]
  }
  const nx = state.routine.exercises[nxIdx]
  if (!nx) return 'Último ejercicio'
  const nb = state.routine.blocks[nx.block]
  const pre = nx.block !== ex.block && nb.type !== 'sets' ? nb.name + ': ' : ''
  return pre + nx.name + ' · ' + describe(nx)
}

export function describe(ex) {
  let t = ex.sets > 1 ? ex.sets + ' × ' + (targetText(ex) || '—') : (targetText(ex) || '—')
  if (ex.weight) t += ' · ' + ex.weight
  return t
}

// Resumen corto de la rutina para vistas previas: una línea por bloque y ejercicio (sin repetir rondas).
export function previewLines(r) {
  const lines = []
  r.blocks.forEach(function (b, bi) {
    const units = r.exercises.filter(function (u) { return u.block === bi && (u.round || 0) <= 1 })
    if (!units.length) return
    if (b.type !== 'sets' || r.blocks.length > 1) lines.push('▸ ' + (b.name || 'Fuerza'))
    units.forEach(function (u) {
      const rep = b.scheme && !u.reps.match(/[a-z]/i) ? b.scheme : u.reps
      lines.push('• ' + u.name + '  ' + describe(Object.assign({}, u, { reps: rep })))
    })
  })
  return lines
}

// Resumen que se envía al móvil y se guarda.
export function summary(state) {
  const hr = state.hr
  const hybrid = state.routine.blocks.some(function (b) { return b.type !== 'sets' }) ||
    state.routine.exercises.some(function (e) { return / m$| cal$/.test(e.reps) })
  return {
    v: 3,
    routine: state.routine.name,
    start: state.startedAt,
    end: state.endedAt,
    activeS: elapsedS(state, state.endedAt),
    sets: state.log.length,
    hrAvg: hr.n ? Math.round(hr.sum / hr.n) : 0,
    hrMax: hr.max,
    hybrid: hybrid,
    blocks: state.blockLog.slice(0, 20),
    exercises: state.exLog.slice(0, 120).map(function (e) {
      const h = state.exHr[String(e.ex)]
      const ex = state.routine.exercises[e.ex]
      return {
        name: e.name + (ex.rounds > 1 ? ' (R' + ex.round + ')' : ''),
        start: e.start,
        end: e.end,
        sets: e.sets,
        planned: e.planned,
        reps: ex.reps,
        weight: ex.weight,
        skipped: e.skipped,
        hrAvg: h && h.n ? Math.round(h.sum / h.n) : 0,
        hrMax: h ? h.max : 0,
        done: state.log.filter(function (l) { return l.ex === e.ex && l.at >= e.start && l.at <= e.end }).map(function (l) {
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

function isNum(x) {
  return /^\d+$/.test(x)
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
