// Almacenamiento en el reloj (se borra solo si se desinstala la miniapp).
import { LocalStorage } from '@zos/storage'

let ls = null
function db() {
  if (!ls) ls = new LocalStorage()
  return ls
}

function get(key, def) {
  try {
    const v = db().getItem(key)
    return v === undefined || v === null || v === '' ? def : JSON.parse(v)
  } catch (e) {
    return def
  }
}

function set(key, value) {
  try {
    if (value === null || value === undefined) db().removeItem(key)
    else db().setItem(key, JSON.stringify(value))
  } catch (e) {}
}

export const store = {
  routine: () => get('routine', null),
  setRoutine: (r) => set('routine', r),
  session: () => get('session', null),
  setSession: (s) => set('session', s),
  pending: () => get('pending', []),
  setPending: (list) => set('pending', list.slice(-20)),
  history: () => get('history', []),
  addHistory: (sum) => set('history', get('history', []).concat([sum]).slice(-10)),
  keymap: () => get('keymap', null),
  setKeymap: (k) => set('keymap', k),
}

// Rutina de ejemplo para probar los botones sin móvil.
export const DEMO = {
  name: 'Prueba',
  exercises: [
    { name: 'Sentadilla', sets: 3, reps: '10', weight: '40 kg', rest: 20 },
    { name: 'Press banca', sets: 2, reps: '8', weight: '30 kg', rest: 20 },
    { name: 'Plancha', sets: 1, reps: '30s', rest: 0 },
  ],
}
