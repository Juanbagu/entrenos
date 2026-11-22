import test from 'node:test'
import assert from 'node:assert/strict'
import * as R from '../shared/routine.js'
import { parseRoutine } from '../shared/parse.js'

const MIN = 60000

test('rondas: se despliegan y descansan entre rondas', () => {
  let s = R.startSession(parseRoutine('3 rondas:\n400m run\n15 wall balls 9kg\nDescanso 1\''), 0)
  assert.equal(s.routine.exercises.length, 6)
  assert.equal(s.blk.started, true) // las rondas no necesitan "empezar"
  assert.equal(R.blockLabel(s, 0), 'Ronda 1/3')
  s = R.primary(s, 1000) // carrera hecha
  assert.equal(s.exIdx, 1)
  s = R.primary(s, 2000) // wall balls → fin de ronda 1 → descanso 60 s
  assert.equal(s.phase, R.PHASE.REST)
  assert.equal(s.exIdx, 2)
  assert.equal(R.restLeftS(s, 2000), 60)
  assert.equal(R.blockLabel(s, 2000), 'Ronda 2/3')
})

test('21-15-9: cada ronda con sus repeticiones y cronometrado', () => {
  let s = R.startSession(parseRoutine('21-15-9:\nThrusters 43kg\nPull-ups'), 0)
  assert.deepEqual(s.routine.exercises.map((e) => e.reps), ['21', '21', '15', '15', '9', '9'])
  assert.equal(R.waitingStart(s), true)
  s = R.primary(s, 5000) // arranca el crono
  assert.equal(R.waitingStart(s), false)
  for (let i = 0; i < 6; i++) s = R.primary(s, 5000 + (i + 1) * MIN)
  assert.equal(s.phase, R.PHASE.DONE)
  const b = R.summary(s).blocks[0]
  assert.equal(b.type, 'fortime')
  assert.equal(b.timeS, 360)
  assert.equal(b.capped, false)
})

test('Hyrox: For time con límite corta el bloque y vibra', () => {
  let s = R.startSession(parseRoutine('For time (cap 20)\n1km run\n1000m ski\n1km run\n100 wall balls 6kg'), 0)
  s = R.primary(s, 0)
  s = R.primary(s, 4 * MIN) // carrera
  const t = R.tick(s, 20 * MIN)
  assert.equal(t.blockEnded, true)
  assert.equal(t.state.phase, R.PHASE.DONE)
  const sum = R.summary(t.state)
  assert.equal(sum.blocks[0].capped, true)
  assert.equal(sum.hybrid, true)
  assert.equal(sum.exercises[1].skipped, true)
})

test('AMRAP: da vueltas, cuenta rondas + extra y termina a su hora', () => {
  let s = R.startSession(parseRoutine('AMRAP 5\'\n10 burpees\n12 cal row\n6 pull ups'), 0)
  s = R.primary(s, 0) // empezar
  assert.match(R.blockLabel(s, 0), /AMRAP 5' · ronda 1 · quedan 5:00/)
  let now = 0
  for (let i = 0; i < 7; i++) s = R.primary(s, (now += 30000)) // 2 rondas + 1 ejercicio
  assert.equal(s.blk.round, 3)
  assert.equal(s.exIdx, 1)
  assert.match(R.nextLabel(s), /pull ups/)
  const t = R.tick(s, 5 * MIN)
  assert.equal(t.blockEnded, true)
  const b = R.summary(t.state).blocks[0]
  assert.equal(b.rounds, 2)
  assert.equal(b.extra, 1)
})

test('AMRAP: pulsación larga lo termina antes', () => {
  let s = R.startSession(parseRoutine('AMRAP 10\n5 burpees\n\nSentadilla 3x5 80kg'), 0)
  s = R.primary(s, 0)
  s = R.skipExercise(s, 2 * MIN)
  assert.equal(s.routine.exercises[s.exIdx].name, 'Sentadilla')
  assert.equal(R.summary(R.finish(s, 3 * MIN)).blocks[0].timeS, 120)
})

test('EMOM: espera al minuto, avanza solo y cuenta los que no da tiempo', () => {
  let s = R.startSession(parseRoutine('EMOM 4\n12 KB swings 24kg\n200m ski'), 0)
  s = R.primary(s, 0) // empezar
  s = R.primary(s, 20000) // swings hechos en 20 s
  assert.equal(s.phase, R.PHASE.REST)
  assert.equal(R.restLeftS(s, 20000), 40)
  assert.equal(R.primary(s, 25000).phase, R.PHASE.REST) // no se puede saltar la espera
  let t = R.tick(s, MIN)
  assert.equal(t.intervalEnded, true)
  s = t.state
  assert.equal(s.routine.exercises[s.exIdx].name, 'SkiErg')
  assert.equal(s.phase, R.PHASE.WORK)
  t = R.tick(s, 2 * MIN) // el ski no se terminó → cuenta como fallado y vuelve a swings
  s = t.state
  assert.equal(s.blk.missed, 1)
  assert.equal(s.routine.exercises[s.exIdx].name, 'KB swings')
  s = R.tick(R.tick(s, 3 * MIN).state, 4 * MIN).state
  assert.equal(s.phase, R.PHASE.DONE)
  const b = R.summary(s).blocks[0]
  assert.equal(b.type, 'emom')
  assert.equal(b.missed, 3)
})

test('la pausa congela también los relojes de bloque', () => {
  let s = R.startSession(parseRoutine('AMRAP 10\n5 burpees'), 0)
  s = R.primary(s, 0)
  s = R.pause(s, MIN)
  assert.equal(R.tick(s, 30 * MIN).blockEnded, false)
  s = R.resume(s, 3 * MIN) // 2 min parados
  assert.equal(R.tick(s, 11 * MIN).blockEnded, false)
  assert.equal(R.tick(s, 12 * MIN).blockEnded, true)
})

test('textos de pantalla', () => {
  const ex = (reps, sets = 1, weight = '') => ({ reps, sets, weight })
  assert.equal(R.targetText(ex('20')), '20 reps')
  assert.equal(R.targetText(ex('1000 m')), '1000 m')
  assert.equal(R.targetText(ex('15 cal')), '15 cal')
  assert.equal(R.targetText(ex('45s')), '45 s')
  assert.equal(R.describe(ex('10', 4, '60 kg')), '4 × 10 reps · 60 kg')
  assert.equal(R.targetShort(ex('max')), 'máx')
})

test('"400 m" son metros, no minutos; "2min" y "45s" sí son tiempo', () => {
  assert.equal(R.timedSeconds('400 m'), 0)
  assert.equal(R.timedSeconds('1000 m'), 0)
  assert.equal(R.timedSeconds('2min'), 120)
  assert.equal(R.timedSeconds("2'"), 120)
  assert.equal(R.timedSeconds('45s'), 45)
})

test('vista previa: un renglón por bloque y ejercicio, sin repetir rondas', () => {
  const r = R.normalizeRoutine(parseRoutine('Back squat 5x5 100kg\n\n21-15-9:\nThrusters 43kg\nPull-ups'))
  assert.deepEqual(R.previewLines(r), [
    '▸ Fuerza', '• Back squat  5 × 5 reps · 100 kg', '▸ 21-15-9', '• Thrusters  21-15-9 reps · 43 kg', '• Pull-ups  21-15-9 reps',
  ])
})
