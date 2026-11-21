// Ajustes de la miniapp dentro de la app Zepp (móvil).
// Opción sin app propia: pegar aquí la rutina como texto, una línea por ejercicio.
import { parseRoutine } from '../shared/parse'

const EJEMPLO = 'Pierna lunes\nSentadilla 4x10 60kg 90s\nPrensa 3x12 120kg 60s\nZancadas 3x10 descanso 60\nPlancha 3x45s'

AppSettingsPage({
  build(props) {
    const st = props.settingsStorage
    const raw = st.getItem('routineText') || ''
    let preview = 'Sin rutina todavía.'
    let ok = false
    if (raw) {
      try {
        const r = parseRoutine(raw)
        ok = true
        preview = r.name + ' · ' + r.exercises.length + ' ejercicios\n' +
          r.exercises.map((e) => '• ' + e.name + ': ' + e.sets + '×' + (e.reps || '—') +
            (e.weight ? ' · ' + e.weight : '') + (e.rest !== undefined ? ' · ' + e.rest + 's' : '')).join('\n')
      } catch (e) {
        preview = '⚠ ' + e.message
      }
    }

    let sessions = []
    try { sessions = JSON.parse(st.getItem('sessions') || '[]') } catch (e) {}
    const last = sessions.slice(-5).reverse().map((x) => {
      const d = new Date(x.start)
      const min = Math.round(x.activeS / 60)
      return d.toLocaleDateString() + ' · ' + x.routine + ' · ' + min + ' min · ' + x.sets + ' series' + (x.hrAvg ? ' · ♥' + x.hrAvg : '')
    })

    const card = { background: '#fff', borderRadius: '12px', padding: '12px', margin: '8px 0' }
    return View({ style: { padding: '12px 16px', background: '#f3f4f6', minHeight: '100vh' } }, [
      Text({ bold: true, paragraph: true, style: { fontSize: '20px', marginBottom: '4px' } }, 'Rutina Foto'),
      Text({ paragraph: true, style: { fontSize: '13px', color: '#6b7280' } },
        'Lo normal es enviar la rutina desde la app del móvil. Si no la tienes abierta, pega aquí la rutina (una línea por ejercicio) y en el reloj pulsa "Recibir del móvil".'),
      View({ style: card }, [
        TextInput({
          label: 'Rutina',
          multiline: true,
          rows: 8,
          placeholder: EJEMPLO,
          settingsKey: 'routineText',
        }),
        Button({ label: 'Poner ejemplo', style: { marginTop: '8px' }, onClick: () => st.setItem('routineText', EJEMPLO) }),
      ]),
      View({ style: card }, [
        Text({ bold: true, paragraph: true }, ok ? 'Lo que verá el reloj' : 'Vista previa'),
        Text({ paragraph: true, style: { whiteSpace: 'pre-line', fontSize: '14px', color: ok ? '#111827' : '#b91c1c' } }, preview),
      ]),
      View({ style: card }, [
        Text({ bold: true, paragraph: true }, 'Últimos entrenos'),
        Text({ paragraph: true, style: { whiteSpace: 'pre-line', fontSize: '14px', color: '#374151' } },
          last.length ? last.join('\n') : 'Aún no hay entrenos.'),
      ]),
    ])
  },
})
