import test from 'node:test'
import assert from 'node:assert/strict'
import * as R from '../shared/routine.js'
import { parseRoutine } from '../shared/parse.js'

const rutina = {
  name: 'Pierna',
  exercises: [
    { name: 'Sentadilla', sets: 2, reps: '10', weight: '60 kg', rest: 60 },
    { name: 'Zancadas', sets: 1, reps: '12', rest: 30 },
  ],
}

test('serie hecha → descanso → vibra al acabar → siguiente serie', () => {
  let s = R.startSession(rutina, 0)
  s = R.primary(s, 1000)
  assert.equal(s.phase, R.PHASE.REST)
  assert.equal(s.setIdx, 1)
  assert.equal(R.restLeftS(s, 31000), 30)
  let t = R.tick(s, 30000)
  assert.equal(t.restEnded, false)
  t = R.tick(s, 61000)
  assert.equal(t.restEnded, true)
  assert.equal(t.state.phase, R.PHASE.WORK)
})

test('última serie pasa al siguiente ejercicio y la última de todas termina', () => {
  let s = R.startSession(rutina, 0)
  s = R.primary(s, 1000) // serie 1 → descanso
  s = R.primary(s, 2000) // salta descanso
  s = R.primary(s, 3000) // serie 2 (última) → Zancadas
  assert.equal(s.exIdx, 1)
  assert.equal(s.phase, R.PHASE.WORK)
  s = R.primary(s, 4000) // única serie → fin
  assert.equal(s.phase, R.PHASE.DONE)
  const sum = R.summary(s)
  assert.equal(sum.sets, 3)
  assert.equal(sum.exercises.length, 2)
  assert.equal(sum.exercises[0].skipped, false)
})

test('pulsación larga salta el ejercicio y lo marca como incompleto', () => {
  let s = R.startSession(rutina, 0)
  s = R.skipExercise(s, 5000)
  assert.equal(s.exIdx, 1)
  assert.equal(R.summary({ ...s, endedAt: 6000 }).exercises[0].skipped, true)
})

test('la pausa congela el descanso y el tiempo activo', () => {
  let s = R.startSession(rutina, 0)
  s = R.primary(s, 10000) // descanso hasta 70000
  s = R.pause(s, 20000)
  assert.equal(R.tick(s, 100000).restEnded, false)
  assert.equal(R.restLeftS(s, 999999), 50)
  s = R.resume(s, 80000) // 60 s en pausa
  assert.equal(R.restLeftS(s, 80000), 50)
  assert.equal(R.elapsedS(s, 80000), 20)
  assert.equal(R.primary(R.pause(s, 81000), 82000).phase, R.PHASE.REST) // en pausa los botones no cambian nada
})

test('terminar desde el menú cierra la sesión', () => {
  let s = R.startSession(rutina, 0)
  s = R.addHeartRate(s, 120)
  s = R.addHeartRate(s, 140)
  s = R.pause(s, 5000)
  s = R.finish(s, 9000)
  assert.equal(s.phase, R.PHASE.DONE)
  const sum = R.summary(s)
  assert.equal(sum.hrAvg, 130)
  assert.equal(sum.hrMax, 140)
  assert.equal(sum.activeS, 5)
})

test('pulso fuera de rango se ignora', () => {
  const s = R.addHeartRate(R.startSession(rutina, 0), 0)
  assert.equal(s.hr.n, 0)
})

test('texto de pizarra → rutina', () => {
  const r = parseRoutine(`Pierna lunes
1. Sentadilla 4x10 60kg 90s
- Press banca 3 x 12 @ 40 kg descanso 60
Dominadas 3xmax
Plancha 3x45s
Peso muerto 4×8-10 80 kg 2min`)
  assert.equal(r.name, 'Pierna lunes')
  assert.equal(r.exercises.length, 5)
  assert.deepEqual(r.exercises[0], { name: 'Sentadilla', sets: 4, reps: '10', weight: '60 kg', rest: 90, block: 0 })
  assert.deepEqual(r.exercises[1], { name: 'Press banca', sets: 3, reps: '12', weight: '40 kg', rest: 60, block: 0 })
  assert.equal(r.exercises[2].reps, 'max')
  assert.equal(r.exercises[3].reps, '45s')
  assert.equal(r.exercises[3].rest, undefined)
  assert.deepEqual(r.exercises[4], { name: 'Peso muerto', sets: 4, reps: '8-10', weight: '80 kg', rest: 120, block: 0 })
  const n = R.normalizeRoutine(r)
  assert.equal(n.exercises[3].rest, R.DEFAULT_REST_S)
})

test('descanso general y JSON', () => {
  const r = parseRoutine('Descanso 75s\nRemo 3x10')
  assert.equal(r.exercises[0].rest, 75)
  const j = parseRoutine('{"name":"X","exercises":[{"name":"A","sets":2,"reps":5}]}')
  assert.equal(j.exercises[0].name, 'A')
  assert.throws(() => parseRoutine('hola'))
})

test('el reloj entiende lo que genera la app del móvil (JSON y texto)', () => {
  const desdeMovil = { name: 'Pierna', defaultRest: 90, exercises: [
    { name: 'Sentadilla', sets: 4, reps: '10', weight: '60 kg', rest: 90 },
    { name: 'Prensa', sets: 3, reps: '12', rest: 90, note: 'por pierna' }] }
  const n = R.normalizeRoutine(desdeMovil)
  assert.equal(n.exercises[1].weight, '')
  assert.equal(n.exercises[1].note, 'por pierna')
  const t = parseRoutine('Pierna\nSentadilla 4x10 60kg 90s\nPrensa 3x12 90s')
  assert.deepEqual(t.exercises[0], { name: 'Sentadilla', sets: 4, reps: '10', weight: '60 kg', rest: 90, block: 0 })
  assert.deepEqual(t.exercises[1], { name: 'Prensa', sets: 3, reps: '12', rest: 90, block: 0 })
})

test('serie por tiempo: arriba arranca la cuenta atrás y al acabar vibra y pasa a descanso', () => {
  let s = R.startSession({ name: 'Core', exercises: [{ name: 'Plancha', sets: 2, reps: '45s', rest: 30 }] }, 0)
  assert.equal(s.routine.exercises[0].timedS, 45)
  s = R.primary(s, 1000)
  assert.equal(s.phase, R.PHASE.TIMER)
  assert.equal(R.timerLeftS(s, 11000), 35)
  s = R.pause(s, 11000)
  s = R.resume(s, 21000) // 10 s de pausa no cuentan
  assert.equal(R.tick(s, 46000).timerEnded, false)
  const t = R.tick(s, 56000)
  assert.equal(t.timerEnded, true)
  assert.equal(t.state.phase, R.PHASE.REST)
  assert.equal(t.state.log.length, 1)
})

test('serie por tiempo: pulsar otra vez la termina antes', () => {
  let s = R.startSession({ name: 'Core', exercises: [{ name: 'Plancha', sets: 1, reps: '1min' }] }, 0)
  assert.equal(s.routine.exercises[0].timedS, 60)
  s = R.primary(R.primary(s, 0), 20000)
  assert.equal(s.phase, R.PHASE.DONE)
})

test('corregir reps y peso de la última serie durante el descanso', () => {
  let s = R.startSession(rutina, 0)
  s = R.primary(s, 1000)
  s = R.adjustLast(s, 'reps', -2)
  s = R.adjustLast(s, 'weight', +1)
  assert.deepEqual(R.lastSet(s), { ex: 0, set: 0, at: 1000, reps: '8', weight: '62,5 kg' })
  s = R.adjustLast(s, 'weight', +1)
  assert.equal(R.lastSet(s).weight, '65 kg')
  const sinPeso = R.adjustLast(R.primary(R.startSession({ name: 'x', exercises: [{ name: 'Dominadas', sets: 2, reps: 'max' }] }, 0), 1), 'reps', 1)
  assert.equal(R.lastSet(sinPeso).reps, '1')
  s = R.finish(s, 9000)
  assert.deepEqual(R.summary(s).exercises[0].done, [{ reps: '8', weight: '65 kg' }])
})

test('límites: rutinas enormes o valores absurdos se recortan', () => {
  const big = { name: 'x'.repeat(200), exercises: Array.from({ length: 100 }, (_, i) => ({ name: 'E' + i, sets: 999, rest: -5 })) }
  const n = R.normalizeRoutine(big)
  assert.equal(n.exercises.length, 100)
  assert.equal(R.normalizeRoutine({ name: 'x', blocks: [{ type: 'rounds', rounds: 50 }], exercises: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] }).exercises.length, R.LIMITS.units)
  assert.equal(n.exercises[0].sets, R.LIMITS.sets)
  assert.equal(n.exercises[0].rest, 0)
  assert.equal(n.name.length, R.LIMITS.name)
  assert.throws(() => R.normalizeRoutine({ exercises: [] }))
  assert.throws(() => R.normalizeRoutine(null))
})
