// Convierte texto en rutina. Acepta JSON o una línea por ejercicio, por ejemplo:
//   Sentadilla 4x10 60kg 90s
//   Press banca 3 x 12 @ 40 kg descanso 60
//   Dominadas 3xmax
//   Plancha 3x45s
// Una primera línea sin series (p. ej. "Pierna lunes") se usa como nombre de la rutina.

export function parseRoutine(text) {
  const t = String(text || '').trim()
  if (!t) throw new Error('Rutina vacía')
  if (t[0] === '{') {
    const j = JSON.parse(t)
    if (!j.exercises || !j.exercises.length) throw new Error('El JSON no tiene "exercises"')
    return j
  }
  const lines = t.split(/\r?\n/).map(function (l) { return l.trim() }).filter(Boolean)
  const exercises = []
  let name = ''
  let defaultRest
  lines.forEach(function (line) {
    const restOnly = line.match(/^descanso\s*:?\s*(\d+)\s*(s|seg|min|m)?\.?$/i)
    if (restOnly) {
      defaultRest = toSeconds(restOnly[1], restOnly[2])
      return
    }
    const ex = parseLine(line)
    if (ex) exercises.push(ex)
    else if (!name && exercises.length === 0) name = line.replace(/[:#*-]+$/, '').trim()
  })
  if (!exercises.length) throw new Error('No encontré ningún ejercicio con series (p. ej. "Sentadilla 4x10")')
  const r = { name: name || 'Rutina', exercises: exercises }
  if (defaultRest !== undefined) {
    r.defaultRest = defaultRest
    exercises.forEach(function (e) { if (e.rest === undefined) e.rest = defaultRest })
  }
  return r
}

export function parseLine(line) {
  let l = line.replace(/^[\s\-*•·\d]+[.)]\s+/, '').replace(/^[-*•·]\s*/, '')
  // series x repeticiones (4x10, 4 x 10, 4×10, 3xmax, 3x45s, 4x8-10)
  const m = l.match(/(\d+)\s*[x×*]\s*(\d+(?:\s*[-–/]\s*\d+)?\s*(?:s|seg|"|''|min)?|max|fallo|amrap)/i)
  if (!m) return null
  const sets = parseInt(m[1], 10)
  const reps = m[2].replace(/\s+/g, '').replace(/seg|"|''/i, 's')
  const before = l.slice(0, m.index).trim()
  const after = l.slice(m.index + m[0].length)
  const ex = { name: cleanName(before || 'Ejercicio'), sets: sets, reps: reps }
  const w = after.match(/@?\s*(\d+(?:[.,]\d+)?)\s*(kg|kilos?|lb|lbs)\b/i)
  if (w) ex.weight = w[1].replace(',', '.') + ' ' + (/^l/i.test(w[2]) ? 'lb' : 'kg')
  const r = after.match(/(?:descanso|rest|desc\.?)\s*:?\s*(\d+)\s*(s|seg|min|m|'|")?/i) ||
    after.match(/\b(\d+)\s*(s|seg|min|'|")(?:\b|$)/i)
  if (r) ex.rest = toSeconds(r[1], r[2])
  return ex
}

function cleanName(s) {
  return s.replace(/[:\-–@]+$/, '').replace(/\s+/g, ' ').trim()
}

function toSeconds(n, unit) {
  const v = parseInt(n, 10)
  return unit && /^(min|m|')$/i.test(unit) ? v * 60 : v
}
