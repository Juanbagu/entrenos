# Mapa de reconocimiento: Zepp (Android)

Alcance: entrenamientos (historial, detalle, registro con el móvil, estadísticas y récords), objetivos y retos, y una función nueva que Zepp no tiene: **añadir un entrenamiento a partir de una foto**.
Para: uso personal del autor. Sin pagos, sin tienda, sin cuentas de terceros.
Fuente de datos: Health Connect (cualquier reloj o app que escriba en él, incluida la propia Zepp) + sensores del móvil (GPS, podómetro).
Plataforma: Android nativa (Kotlin + Jetpack Compose).
Fecha: 2026-11-21

## Fuentes

| # | fuente | URL | notas |
| --- | --- | --- | --- |
| 1 | ficha de Google Play (ES) | https://play.google.com/store/apps/details?id=com.huami.watch.hmwatchmanager&hl=es | Zepp, Inc. 4,4 ★ con ~1,43 M valoraciones. Contiene anuncios y compras (Zepp Aura Premium). Describe: foto de comida → macros, salud, sueño, corazón, entrenos (ritmo, distancia, velocidad, registros de fuerza, recuperación), tienda de esferas. |
| 2 | ficha del App Store (ES) | https://apps.apple.com/es/app/zepp/id1127269366 | 4,4 ★ con ~69 mil reseñas. Mismo texto que Play. |
| 3 | ayuda: sincronizar con Strava / Google Fit / Apple Health | https://support.amazfit.com/en/faq/421 | Solo exterior con GPS (correr, caminar, bici) va a Strava; interior, natación y sin GPS no. Retrasos de hasta 24 h. |
| 4 | ayuda: Zepp Coach | https://support.amazfit.com/en/amazfit_bip_6/docs/OdNDdxzc8oSzv5xKACDc1pWsnfo | Plan de entrenamiento desde la tarjeta de Inicio; ajustes del plan arriba a la derecha. |
| 5 | manual de usuario (Active) | https://support.amazfit.com/en/amazfit_active/files/user-manual.pdf.pdf | Objetivos en Perfil > Mis objetivos (pasos, calorías, tiempo quemando grasa, de pie); avisos al alcanzar el objetivo; módulo Entrenamiento con historial sincronizado. |
| 6 | Amazfit: entrenamiento de fuerza | https://us.amazfit.com/pages/strength-training | Plantillas de fuerza creadas en la app, 25 ejercicios detectados, series, repeticiones, descansos, grupos musculares trabajados. |
| 7 | Amazfit blog: fuerza en Strava | https://us.amazfit.com/blogs/blog/strava-expands-strength-training-amazfit-connects-the-system | Ejercicios, series, repeticiones, peso y mapa muscular. |
| 8 | Zepp: tecnología (PAI, carga, VO₂max) | https://huami.com/technology | Carga por EPOC, carga semanal = suma 7 días, análisis post-entreno (VO₂max, efecto, recuperación). |
| 9 | Amazfit manual (Active 2): retos e insignias | ficha de tiendas (#1, #2) | "Gana insignias y únete a retos". No hay página de ayuda detallada. |
| 10 | TechRadar: reseña Active 2 | https://www.techradar.com/health-fitness/smartwatches/i-ditched-all-my-strength-training-plans-for-a-usd99-smartwatch-heres-what-happened | Queja: crear 3×15 de press banca obliga a "intervalos" de 15 repeticiones repetidos 3 veces. Confuso. |
| 11 | Health Connect: tipos de datos | https://developer.android.com/health-and-fitness/health-connect/data-types | ExerciseSessionRecord (con ruta y segmentos), HeartRateRecord, StepsRecord, DistanceRecord, Speed, Active/TotalCalories, ElevationGained, PlannedExerciseSessionRecord… |

No se ha usado ninguna cuenta de Zepp, ni código, APIs privadas o tráfico de red de la app. Las pantallas se infieren de la ayuda pública y de la ficha de las tiendas; no hay capturas guardadas en `screens/` todavía (se pueden añadir capturas de tu propio móvil si tienes Zepp instalada).

## Núcleo (core loop)

Ver lo que has entrenado, sin importar de qué reloj venga, y sentir que avanzas hacia una meta: entreno → resumen → progreso en objetivos y retos.

## Pantallas

| ID | pantalla | cómo se llega | propósito | componentes clave | estados |
| --- | --- | --- | --- | --- | --- |
| S01 | Bienvenida y permisos | primer arranque | explicar fuentes y pedir Health Connect, ubicación, actividad física, cámara | Stepper, PermissionCard, Button | sin Health Connect instalado, permiso denegado, concedido |
| S02 | Inicio (Hoy) | pestaña Inicio | anillos de objetivos del día, último entreno, racha, reto activo | GoalRing, WorkoutCard, StreakBadge, ChallengeCard, FAB "+" | vacío (sin datos), cargando, con datos, sin permiso |
| S03 | Historial de entrenamientos | pestaña Entrenos | lista por semana / mes / todo, filtro por tipo, totales arriba | SegmentedControl, FilterChips, WorkoutRow, SummaryHeader | vacío, cargando, lista, filtro sin resultados |
| S04 | Detalle de entrenamiento | tocar un entreno | resumen, mapa de ruta, gráficas de FC/ritmo/altitud, zonas de FC, parciales; en fuerza, ejercicios y series; foto adjunta | StatGrid, RouteMap, LineChart, ZoneBar, SplitTable, SetTable, PhotoThumb, Menú (editar, borrar, compartir) | con GPS, sin GPS, sin FC, fuerza, importado de foto, de Health Connect (solo lectura parcial) |
| S05 | Elegir tipo de entreno | FAB "+" → Registrar ahora | elegir actividad y objetivo de la sesión | SportGrid, GoalPicker | — |
| S06 | Entreno en curso | S05 → Empezar | tiempo, distancia, ritmo, FC (si hay sensor), mapa, pausar/parar | BigMetric, RouteMap, PauseButton, LockOverlay | buscando GPS, en marcha, pausa automática, sin señal, batería baja |
| S07 | Resumen al terminar | S06 → Parar | ver resultados, añadir notas y sensación, guardar o descartar | StatGrid, RPEPicker, TextArea, Button | guardado, descartado, nuevo récord |
| S08 | Añadir entreno manual | FAB "+" → Manual | rellenar tipo, fecha, duración, distancia, calorías, series | Form, DateTimePicker, NumberField, SetEditor | validación, guardado |
| S09 | Añadir desde foto | FAB "+" → Foto | hacer foto o elegir de la galería (pantalla de cinta/bici/remo, captura de otra app, rutina escrita) | CameraView, GalleryPicker, TipCard | sin permiso de cámara, procesando, ilegible |
| S10 | Revisar datos de la foto | S09 → procesar | ver los campos leídos con su confianza, corregir y guardar | PhotoPreview, Form con campos marcados (dudoso), SetEditor | todo leído, parcial, nada leído (pasa a manual), duplicado detectado |
| S11 | Estadísticas | pestaña Progreso | totales por semana/mes/año, gráfico de barras, por tipo de deporte | SegmentedControl, BarChart, StatGrid | vacío, con datos |
| S12 | Récords personales | Progreso → Récords | mejor 1 km, 5 km, 10 km, más largo, más peso por ejercicio… | RecordRow, Badge | sin récords, con récords, récord nuevo |
| S13 | Objetivos | pestaña Objetivos | objetivos diarios (pasos, calorías, minutos activos) y semanales (entrenos, distancia, por deporte) | GoalRow, ProgressBar, Toggle | sin objetivos, en curso, cumplido |
| S14 | Crear / editar objetivo | S13 → + o tocar | tipo, métrica, valor, periodo, aviso | Form, Stepper numérico, Toggle | — |
| S15 | Retos | Objetivos → Retos | retos activos, disponibles y completados (personales) | ChallengeCard, Tabs | vacío, activo, completado, caducado |
| S16 | Detalle de reto | tocar reto | progreso, días restantes, reglas, historial | ProgressBar, Calendar heatmap, Button (unirse/abandonar) | no empezado, en curso, conseguido, fallado |
| S17 | Logros / insignias | Perfil → Logros | insignias ganadas y por ganar | BadgeGrid | bloqueada, desbloqueada |
| S18 | Ajustes y perfil | pestaña Perfil | datos personales (edad, peso, FC máx.), zonas de FC, unidades, fuentes (Health Connect), avisos, exportar/importar, borrar datos | ListItem, Toggle, Dialog | Health Connect desconectado |
| S19 | Plantillas de fuerza | Perfil → Plantillas o S05 → Fuerza | crear rutinas con ejercicios × series × repeticiones × peso | ExerciseList, SetEditor | vacío, con plantillas |

## Flujos

```
F01 Primer arranque y conectar Health Connect
    S01 -> (diálogo de Health Connect) -> S02
    clics del camino feliz: 4
    casos límite: Health Connect no instalado (Android < 14), usuario deniega algún permiso, sin datos previos

F02 Ver un entreno grabado con el reloj (Amazfit vía Zepp → Health Connect, u otra marca)
    S02 (tarjeta último entreno) -> S04
    clics: 1
    casos límite: llega con retraso, sin ruta, sin FC, duplicado del mismo entreno desde dos apps

F03 Registrar un entreno con el móvil
    S02 -> S05 -> S06 -> S07 -> S04
    clics: 4 (+, tipo, empezar, parar/guardar)
    casos límite: sin GPS en interior, app matada en segundo plano, llamada entrante, batería baja

F04 Añadir un entreno desde una foto  (función nueva)
    S02 -> S09 -> S10 -> S04
    clics: 4 (+, foto, disparar, guardar)
    casos límite: foto borrosa o con reflejos, unidades mezcladas (mi/km), varias sesiones en una foto,
                  rutina escrita a mano, foto de otra app en otro idioma, entreno ya existente (duplicado)

F05 Añadir un entreno a mano
    S02 -> S08 -> S04
    clics: 3 + campos

F06 Poner un objetivo y recibir el aviso al cumplirlo
    S13 -> S14 -> (guardar) -> S13 ... notificación -> S02
    clics: 4
    casos límite: objetivo cambiado a mitad de periodo, zona horaria, día sin datos

F07 Unirse a un reto y completarlo
    S15 -> S16 (unirse) ... entrenos ... -> S16 (conseguido) -> S17
    clics: 2 para unirse
    casos límite: reto caducado, entreno borrado que bajaba el progreso

F08 Consultar progreso y récords
    S11 -> S12 -> S04
    clics: 2

F09 Exportar o borrar mis datos
    S18 -> exportar (GPX/CSV/JSON) o borrar todo
    clics: 3
```

## Componentes

| componente | variantes | estados | se usa en |
| --- | --- | --- | --- |
| Button | principal, secundario, texto, peligro | normal, pulsado, foco, desactivado, cargando | todas |
| FAB "+" con menú | registrar ahora, manual, foto | cerrado, abierto | S02, S03 |
| WorkoutCard / WorkoutRow | grande (Inicio), fila (lista) | normal, pulsado, origen (reloj, móvil, foto, manual) | S02, S03 |
| StatGrid / BigMetric | 2, 3 o 4 columnas; gigante en curso | con valor, sin dato (—) | S04, S06, S07 |
| RouteMap | estático, en vivo | cargando, sin ruta | S04, S06 |
| LineChart / BarChart | FC, ritmo, altitud; barras semana/mes/año | vacío, con datos, tocado (tooltip) | S04, S11 |
| ZoneBar | 5 zonas de FC | — | S04 |
| SetTable / SetEditor | lectura, edición | fila nueva, fila dudosa (de foto) | S04, S08, S10, S19 |
| GoalRing / ProgressBar | anillo, barra | 0 %, en curso, cumplido | S02, S13, S16 |
| ChallengeCard | activo, disponible, completado | — | S02, S15 |
| Badge | récord, logro | bloqueado, desbloqueado | S12, S17 |
| SegmentedControl / FilterChips | — | seleccionado | S03, S11 |
| Form fields | texto, número, fecha/hora, selector | normal, error, dudoso (amarillo, de foto) | S08, S10, S14 |
| CameraView / PhotoPreview | cámara, galería | sin permiso, procesando | S09, S10 |
| PermissionCard | Health Connect, ubicación, cámara, notificaciones | pendiente, concedido, denegado | S01, S18 |
| Toast / Snackbar | info, deshacer | — | todas |
| Dialog | confirmar, peligro | — | S04, S18 |
| Bottom navigation | Inicio, Entrenos, Progreso, Objetivos, Perfil | seleccionado | global |

## Modelo de datos inferido

Todo local en el móvil (Room / SQLite). Sin servidor: es para ti.

```
Workout      id, sport_type, start_at, end_at, duration_s, distance_m, active_kcal,
             avg_hr, max_hr, avg_pace_s_per_km, elevation_gain_m, rpe (1-10), notes,
             source (health_connect | phone | photo | manual), source_app (p.ej. com.huami...),
             health_connect_id (nullable, para no duplicar), photo_id (nullable)
             evidencia: S04 (Play: ritmo, distancia, velocidad, recuperación), Health Connect ExerciseSessionRecord
             confianza: alta

Sample       workout_id, t, heart_rate, speed, cadence, altitude      (series para gráficas)
             evidencia: S04, HeartRateRecord/SpeedRecord        confianza: alta

RoutePoint   workout_id, t, lat, lon, alt
             evidencia: S04, ExerciseRoute de Health Connect    confianza: alta

Lap          workout_id, index, distance_m, duration_s, avg_hr      (parciales por km)
             evidencia: S04, ExerciseLap                        confianza: media

Exercise     id, name, muscle_groups[]
StrengthSet  workout_id, exercise_id, set_index, reps, weight_kg, rest_s
             evidencia: Amazfit fuerza (#6, #7)                 confianza: alta

Template     id, name, items[{exercise_id, sets, reps, weight_kg}]
             evidencia: plantillas de fuerza (#6)               confianza: alta

PhotoImport  id, uri, taken_at, kind (pantalla_maquina | captura_app | rutina_escrita),
             raw_text, extracted (json), confidence (json por campo), status (revisado | descartado)
             evidencia: función nueva (no existe en Zepp)       confianza: diseño propio

Goal         id, metric (steps | active_kcal | active_min | workouts | distance | duration),
             sport_type (nullable), target, period (day | week | month), notify, active
             evidencia: manual "Mis objetivos" (#5)             confianza: alta

Challenge    id, title, rule (metric, target, sport_type), start_at, end_at, status
             evidencia: ficha "únete a retos" (#1)              confianza: media (sin detalle público)

Badge        id, kind, title, earned_at (nullable)
PersonalRecord  id, kind (fastest_1k | fastest_5k | longest | heaviest_lift…), exercise_id, value, workout_id, set_at
             evidencia: no confirmado en Zepp                   confianza: suposición (lo añadimos igualmente)

Profile      birth_year, sex, weight_kg, height_cm, max_hr, rest_hr, hr_zones[5], units
             evidencia: zonas de FC (#6), datos de perfil       confianza: alta
```

Relaciones: Workout 1-n Sample, Workout 1-n RoutePoint, Workout 1-n Lap, Workout 1-n StrengthSet, Exercise 1-n StrengthSet, Workout 0-1 PhotoImport, Goal y Challenge se calculan sobre Workout + pasos/calorías diarios de Health Connect, PersonalRecord n-1 Workout.

## Matriz de funciones

Ver `features.csv`. Must: 21, should: 12, could: 8, skip: 9. (50 filas; `parity.py` arranca en 0 / 100.)

## Fuera de alcance (no se puede o no se debe copiar)

- **Conexión directa con relojes Amazfit** (protocolo Bluetooth privado), actualizar firmware, esferas y Zepp Store de miniapps. Los datos del Amazfit llegan igual: Zepp los escribe en Health Connect.
- **PAI, Zepp Coach, Zepp Aura**: algoritmos y marcas propias de Zepp. Podemos hacer una puntuación de actividad y una carga de entrenamiento *propias*, con otro nombre y una fórmula pública (p. ej. TRIMP).
- **Retos con otros usuarios / comunidad**: es una app personal, sin red social. Los retos serán tuyos.
- **Sueño, salud cardíaca, estrés, SpO₂, nutrición por foto**: existen en Zepp pero no están en este alcance. Health Connect los tiene, se pueden añadir después.
- **Datos médicos**: nada de diagnósticos; solo mostrar datos.

## Tamaño

Pantallas 19, flujos 9, entidades 12.
Partes difíciles:
1. **Foto → entreno**: leer pantallas de máquinas y rutinas escritas de forma fiable. Opción A: OCR en el móvil (ML Kit, gratis, sin red) + reglas; opción B: un modelo con visión (p. ej. la API de Claude) para casos difíciles, con tu propia clave. Siempre con revisión del usuario (S10).
2. **Registro GPS en segundo plano**: servicio en primer plano, que Android no mate la app, pausa automática, batería.
3. **Health Connect**: permisos, sincronización incremental, evitar duplicados (el mismo entreno puede llegar de Zepp y de otra app), qué escribir de vuelta.

Tamaño: **M** (unas semanas de trabajo), empezando por una franja vertical: Health Connect → historial → detalle → foto.
