// Convierte texto en rutina. Acepta JSON o texto libre (pizarra, captura, escrito a mano), por ejemplo:
//
//   Pierna lunes                 ← título
//   Sentadilla 4x10 60kg 90s     ← fuerza: series × reps, peso, descanso
//   4 rondas:                    ← bloque por rondas
//   1km run
//   20 wall balls 6kg
//   AMRAP 12'                    ← bloque AMRAP (12 minutos)
//   10 burpees
//   15 cal bike
//   EMOM 10 / E2MOM 16           ← cada minuto (o cada 2) durante 10 (o 16) minutos
//   21-15-9 thrusters 43kg, pull ups
//   For time (cap 20')
//
// Formato de salida (lo entienden el reloj y la app del móvil):
//   { name, defaultRest?, blocks: [{ name, type, rounds, capS, everyS, restS }],
//     exercises: [{ name, sets, reps, weight, rest?, note?, block }] }
// type: 'sets' (fuerza clásica) | 'rounds' | 'amrap' | 'emom' | 'fortime'
// reps es la meta como texto: "10", "8-10", "max", "21-15-9", "1000 m", "20 cal", "45s".

const ABBR = {
  wb: 'Wall balls', bbj: 'Burpee broad jumps', sbl: 'Sandbag lunges', fc: 'Farmers carry',
  t2b: 'Toes to bar', ttb: 'Toes to bar', c2b: 'Chest to bar', hspu: 'Handstand push-ups',
  du: 'Double unders', dus: 'Double unders', mu: 'Muscle-ups', pu: 'Pull-ups', kbs: 'Kettlebell swings',
  ohs: 'Overhead squat', pc: 'Power clean', psn: 'Power snatch', 'c&j': 'Clean & jerk', cj: 'Clean & jerk',
  dl: 'Peso muerto', bs: 'Back squat', fs: 'Front squat', ab: 'Air bike', ski: 'SkiErg', bike: 'Bike',
  row: 'Remo', run: 'Carrera', rdl: 'Peso muerto rumano', gtoh: 'Ground to overhead', btn: 'Burpee to target',
}

export function parseRoutine(text) {
  const t = String(text || '').trim()
  if (!t) throw new Error('Rutina vacía')
  if (t[0] === '{') {
    const j = JSON.parse(t)
    if (!j.exercises || !j.exercises.length) throw new Error('El JSON no tiene "exercises"')
    return j
  }
  const lines = t.split(/\r?\n/).map((l) => l.replace(/\t/g, ' ').trim())
  const out = { name: '', blocks: [], exercises: [] }
  let block = null // bloque actual explícito (rondas, amrap…)
  let defaultRest

  const newBlock = (b) => {
    out.blocks.push(Object.assign({ name: '', type: 'sets', rounds: 1, capS: 0, everyS: 0, restS: 0 }, b))
    block = out.blocks[out.blocks.length - 1]
    return block
  }
  const currentBlockIndex = () => {
    if (!block) newBlock({ type: 'sets' })
    return out.blocks.length - 1
  }

  for (const raw of lines) {
    if (!raw) { // línea en blanco: se cierra un bloque explícito
      if (block && block.type !== 'sets') block = null
      continue
    }
    // Quita viñetas y numeración: "- ", "• ", "1. ", "2) ", "A) ", "b. "
    let line = raw.replace(/^[-*•·]\s*/, '').replace(/^(?:\(?[a-z]\)|[a-z][.)]|\d{1,2}[.)])\s+/i, '')

    // Descanso general ("Descanso 90s", "Rest 2'") o descanso entre rondas dentro de un bloque.
    const restOnly = line.match(/^(?:descanso|desc\.?|rest|recuperaci[oó]n)\s*(?:entre\s+\w+)?\s*:?\s*(\d+(?::\d\d)?)\s*(s|seg|min|m|'|")?\.?$/i)
    if (restOnly) {
      const secs = toSeconds(restOnly[1], restOnly[2] || (restOnly[1].includes(':') ? '' : 's'))
      if (block && block.type !== 'sets') block.restS = secs
      else defaultRest = secs
      continue
    }

    // Cabeceras de bloque (pueden llevar ejercicios en la misma línea tras ":" o separados por "+").
    const head = parseHeader(line)
    if (head) {
      if (head.capOnly) {
        if (block) block.capS = head.capS
        else if (out.blocks.length) out.blocks[out.blocks.length - 1].capS = head.capS
        continue
      }
      newBlock(head.block)
      if (head.title && !out.name && !out.exercises.length) out.name = head.title
      line = head.rest
      if (!line) continue
    }

    const parts = splitItems(line)
    let any = false
    const inBlock = !!(block && block.type !== 'sets')
    for (const p of parts) {
      const ex = parseItem(p, inBlock)
      if (!ex) continue
      ex.block = currentBlockIndex()
      out.exercises.push(ex)
      any = true
    }
    if (any) continue

    // Línea sin ejercicio reconocible.
    const label = cleanName(line.replace(/[:#*=]+$/, ''))
    if (!label) continue
    if (block && block.type !== 'sets') {
      // Dentro de rondas/AMRAP/EMOM un nombre suelto es un ejercicio ("Burpees", "Pull-ups").
      out.exercises.push({ name: expandName(label), sets: 1, reps: '', block: currentBlockIndex() })
    } else if (!out.name && out.exercises.length === 0) {
      out.name = label
    } else {
      newBlock({ type: 'sets', name: label }) // sección: "Fuerza", "Metcon", "Parte B"
    }
  }

  if (!out.exercises.length) throw new Error('No encontré ningún ejercicio (p. ej. "Sentadilla 4x10" o "1km run")')
  // Quita bloques vacíos y reindexa.
  const used = out.blocks.map((_, i) => out.exercises.some((e) => e.block === i))
  const map = []
  let k = 0
  out.blocks = out.blocks.filter((b, i) => { map[i] = k; if (used[i]) { k++; return true } return false })
  out.exercises.forEach((e) => { e.block = map[e.block] })
  out.name = out.name || guessName(out)
  if (defaultRest !== undefined) {
    out.defaultRest = defaultRest
    out.exercises.forEach((e) => { if (e.rest === undefined && out.blocks[e.block].type === 'sets') e.rest = defaultRest })
  }
  return out
}

// Cabeceras: "4 rondas", "5 RFT", "x4", "AMRAP 12'", "EMOM 10", "E2MOM 16", "Cada 3' x 5", "For time", "21-15-9", "Time cap 20'".
export function parseHeader(line) {
  const l = line.trim()
  let m
  const after = (re) => l.replace(re, '').replace(/^[\s:,.\-–]+/, '').trim()

  if ((m = l.match(/^(?:time\s*cap|tc|cap|l[ií]mite)\s*:?\s*(\d+(?::\d\d)?)\s*(min|m|'|s)?\.?$/i))) {
    return { capOnly: true, capS: toSeconds(m[1], m[2] || 'min') }
  }
  if ((m = l.match(/^amrap\s*(?:de\s*)?(\d+(?::\d\d)?)\s*(min(?:utos)?|m|'|s)?/i))) {
    return { block: { type: 'amrap', name: 'AMRAP ' + m[1] + "'", capS: toSeconds(m[1], m[2] || 'min') }, rest: after(/^amrap\s*(?:de\s*)?\d+(?::\d\d)?\s*(min(?:utos)?|m|'|s)?/i) }
  }
  if ((m = l.match(/^e(\d*)mom\s*(?:x\s*)?(\d+)\s*(min(?:utos)?|m|'|rondas?|rounds?)?/i))) {
    const every = (parseInt(m[1], 10) || 1) * 60
    const n = parseInt(m[2], 10)
    const capS = m[3] && /^r/i.test(m[3]) ? n * every : n * 60
    return { block: { type: 'emom', name: (m[1] ? 'E' + m[1] : 'E') + 'MOM ' + Math.round(capS / 60) + "'", everyS: every, capS: capS }, rest: after(/^e\d*mom\s*(?:x\s*)?\d+\s*(min(?:utos)?|m|'|rondas?|rounds?)?/i) }
  }
  if ((m = l.match(/^(?:every|cada)\s*(\d+(?::\d\d)?)\s*(min(?:utos)?|m|'|s)?\s*(?:x|por)\s*(\d+)/i))) {
    const every = toSeconds(m[1], m[2] || 'min')
    const n = parseInt(m[3], 10)
    return { block: { type: 'emom', name: 'Cada ' + Math.round(every / 60) + "' x" + n, everyS: every, capS: every * n }, rest: after(/^(?:every|cada)\s*\d+(?::\d\d)?\s*(min(?:utos)?|m|'|s)?\s*(?:x|por)\s*\d+/i) }
  }
  if ((m = l.match(/^(\d+)\s*(?:rondas?|rounds?|rft|vueltas?|series)\b(?:\s*(?:for\s*time|por\s*tiempo|de|of))?/i)) || (m = l.match(/^x\s*(\d+)\s*(?:rondas?|rounds?)?\s*:?$/i))) {
    const n = parseInt(m[1], 10)
    const ft = /rft|for\s*time|por\s*tiempo/i.test(m[0])
    return { block: { type: ft ? 'fortime' : 'rounds', name: n + ' rondas', rounds: n }, rest: after(new RegExp('^' + escapeRe(m[0]))) }
  }
  if ((m = l.match(/^(\d+(?:\s*-\s*\d+){1,9})(?:\s*(?:reps?|repeticiones))?(?:\s*(?:for\s*time|por\s*tiempo))?\s*(?::|$|\s+(?=[a-záéíóúñ]))/i))) {
    const scheme = m[1].replace(/\s+/g, '')
    // "8-10 sentadilla" sería un rango de reps, no un esquema: exige al menos 3 números o que siga ":" / fin de línea.
    if (scheme.split('-').length >= 3 || /:\s*$/.test(m[0]) || l.trim() === m[1]) {
      return { block: { type: 'fortime', name: scheme, rounds: scheme.split('-').length, scheme: scheme }, rest: after(new RegExp('^' + escapeRe(m[0]))) }
    }
  }
  if ((m = l.match(/^(?:for\s*time|por\s*tiempo|ft)\b\s*(?:\(?\s*(?:cap|tc|time\s*cap)\s*(\d+)\s*(min|m|')?\s*\)?)?/i))) {
    return { block: { type: 'fortime', name: 'For time', rounds: 1, capS: m[1] ? toSeconds(m[1], m[2] || 'min') : 0 }, rest: after(new RegExp('^' + escapeRe(m[0]))) }
  }
  if ((m = l.match(/^(?:hyrox)(?:\s*(sim(?:ulaci[oó]n)?|half|medio|full|completo))?\s*:?\s*$/i))) {
    const title = 'Hyrox' + (m[1] ? ' ' + m[1].toLowerCase() : '')
    return { block: { type: 'fortime', name: title, rounds: 1 }, rest: '', title: title }
  }
  return null
}

function splitItems(line) {
  // "1km run + 20 wall balls", "10 burpees, 15 cal bike" (no corta pesos "6/4kg" ni decimales "2,5kg")
  return line.split(/\s+\+\s+|\s*;\s*|,\s+(?=\d|[a-záéíóú])/i).map((s) => s.trim()).filter(Boolean)
}

// Un ejercicio. Devuelve null si la línea no tiene nada medible ni es claramente un ejercicio.
// lenient: dentro de rondas/AMRAP/EMOM se acepta un nombre con peso pero sin meta ("Thrusters 43kg").
export function parseItem(text, lenient) {
  let l = ' ' + text.replace(/[×]/g, 'x').replace(/(\d),(\d)/g, '$1.$2') + ' '
  const ex = { name: '', sets: 1, reps: '' }
  let found = false
  const take = (re, fn) => {
    const m = l.match(re)
    if (!m) return false
    fn(m)
    l = l.slice(0, m.index) + ' ' + l.slice(m.index + m[0].length)
    return true
  }

  // Peso: "60kg", "@ 40 kg", "2x24kg", "6/4 kg", "24/16kg", "100 lb"
  take(/@?\s*(?:(\d+)\s*x\s*)?(\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?)\s*(kg|kgs|kilos?|lb|lbs)\b/i, (m) => {
    ex.weight = (m[1] ? m[1] + '×' : '') + m[2].replace('.', ',') + ' ' + (/^l/i.test(m[3]) ? 'lb' : 'kg')
  })
  // Descanso explícito: "descanso 90", "rest 2'", "r: 60s"
  take(/(?:descanso|desc\.?|rest)\s*:?\s*(\d+(?::\d\d)?)\s*(s|seg|min|m|'|")?/i, (m) => {
    ex.rest = toSeconds(m[1], m[2] || (m[1].includes(':') ? '' : 's'))
  })
  // Series × meta: "4x10", "3 x 12", "3xmax", "4x400m", "2x25m", "5x20 cal", "3x45s", "4x8-10"
  const hasSets = take(/\b(\d+)\s*x\s*(\d+(?:\.\d+)?\s*(?:km|k|m|mts|metros|cal|cals|kcal|s|seg|"|''|min)?(?:\s*-\s*\d+)?|max|m[aá]x|fallo|amrap)(?![a-z])/i, (m) => {
    ex.sets = parseInt(m[1], 10)
    ex.reps = normTarget(m[2])
    found = true
  })
  // También "x20" / "x 20" al final como reps: "Wall balls x100"
  if (!hasSets) {
    take(/(?:^|\s)x\s*(\d+)\b(?!\s*(?:kg|lb))/i, (m) => { ex.reps = m[1]; found = true })
  }
  if (!ex.reps) {
    // Distancia: "1km", "1 k", "1000m", "500 metros"
    if (take(/\b(\d+(?:\.\d+)?)\s*(km|k|m|mts|metros)\b(?!\s*(?:in|min))/i, (m) => { ex.reps = normTarget(m[1] + m[2]); found = true })) {
      // ok
    } else if (take(/\b(\d+)(?:\/\d+)?\s*(cal|cals|kcal|calor[ií]as)\b/i, (m) => { ex.reps = m[1] + ' cal'; found = true })) {
      // ok
    } else if (take(/\b(\d+):(\d\d)\b/, (m) => { ex.reps = (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) + 's'; found = true })) {
      // "1:00 plank"
    } else if (take(/\b(\d+)\s*(min(?:utos)?|')(?!\w)/i, (m) => { ex.reps = parseInt(m[1], 10) * 60 + 's'; found = true })) {
      // "2' plank"
    } else if (take(/\b(\d+)\s*(s|seg|segundos|"|'')(?!\w)/i, (m) => { ex.reps = m[1] + 's'; found = true })) {
      // "45s plancha"
    } else if (take(/^\s*(\d+(?:\s*-\s*\d+)*)\s+(?=[a-záéíóúñ])/i, (m) => { ex.reps = m[1].replace(/\s+/g, ''); found = true })) {
      // "20 wall balls", "21-15-9 thrusters"
    } else if (take(/\b(max|m[aá]x|fallo|amrap)\b/i, () => { ex.reps = 'max'; found = true })) {
      // "Dominadas max"
    }
  }
  // En fuerza, un tiempo que sobra tras "4x10" es el descanso: "Sentadilla 4x10 60kg 90s".
  if (hasSets && ex.rest === undefined) {
    take(/\b(\d+)\s*(s|seg|min|'|")(?!\w)/i, (m) => { ex.rest = toSeconds(m[1], m[2]) })
  }
  const name = cleanName(l)
  if (!found && !(lenient && ex.weight && name)) return null
  ex.name = expandName(name || 'Ejercicio')
  if (/^(rondas?|rounds?|vueltas?)$/i.test(ex.name)) return null
  return ex
}

// Normaliza la meta: "1km" → "1000 m", "400m" → "400 m", "20cal" → "20 cal", "45 seg" → "45s", "2min" → "120s".
export function normTarget(t) {
  const s = String(t).trim().toLowerCase().replace(/\s+/g, '')
  let m
  if ((m = s.match(/^(\d+(?:\.\d+)?)(km|k)$/))) return Math.round(parseFloat(m[1]) * 1000) + ' m'
  if ((m = s.match(/^(\d+)(m|mts|metros)$/))) return m[1] + ' m'
  if ((m = s.match(/^(\d+)(cal|cals|kcal)$/))) return m[1] + ' cal'
  if ((m = s.match(/^(\d+)(s|seg|"|'')$/))) return m[1] + 's'
  if ((m = s.match(/^(\d+)min$/))) return parseInt(m[1], 10) * 60 + 's'
  if (/^(m[aá]x|fallo|amrap)$/.test(s)) return 'max'
  return s
}

function expandName(name) {
  const key = name.toLowerCase().replace(/[.]/g, '')
  if (ABBR[key]) return ABBR[key]
  // Abreviaturas sueltas dentro del nombre: "DB snatch", "KB swings" se quedan; "WB" → "Wall balls".
  return name.split(' ').map((w) => (w.length <= 4 && ABBR[w.toLowerCase()] && w === w.toUpperCase() ? ABBR[w.toLowerCase()] : w)).join(' ')
}

function guessName(r) {
  const t = r.blocks.map((b) => b.type)
  if (t.indexOf('amrap') >= 0 || t.indexOf('emom') >= 0 || t.indexOf('fortime') >= 0 || t.indexOf('rounds') >= 0) return 'Híbrido'
  return 'Rutina'
}

function cleanName(s) {
  return s.replace(/[@:–\-|]+\s*$/, '').replace(/^\s*[@:–\-|.)]+/, '').replace(/\s+/g, ' ').trim()
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function toSeconds(n, unit) {
  const str = String(n)
  if (str.includes(':')) {
    const [a, b] = str.split(':').map((x) => parseInt(x, 10))
    return a * 60 + b
  }
  const v = parseInt(str, 10)
  return unit && /^(min|minutos|m|')$/i.test(unit) ? v * 60 : v
}
