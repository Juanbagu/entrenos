import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseRoutine } from '../shared/parse.js'

// Casos compartidos con la app Android (movil/…/ParserTest.kt): los dos lectores deben dar lo mismo.
const cases = JSON.parse(readFileSync(new URL('../../shared/fixtures/parse-cases.json', import.meta.url)))

for (const c of cases) {
  test('lector: ' + c.case, () => {
    const r = parseRoutine(c.text)
    assert.equal(r.name, c.name)
    assert.equal(r.blocks.length, c.blocks.length, 'bloques: ' + JSON.stringify(r.blocks))
    c.blocks.forEach((b, i) => {
      for (const k of Object.keys(b)) assert.equal(r.blocks[i][k], b[k], `bloque ${i}.${k}`)
    })
    assert.equal(r.exercises.length, c.exercises.length, 'ejercicios: ' + JSON.stringify(r.exercises.map((e) => e.name)))
    c.exercises.forEach((e, i) => {
      const got = r.exercises[i]
      for (const k of Object.keys(e)) assert.equal(got[k] === undefined ? '' : got[k], e[k], `ejercicio ${i} (${got.name}).${k}`)
      if (!('sets' in e)) assert.equal(got.sets, 1, `ejercicio ${i}.sets`)
    })
  })
}
