# Cambio de rumbo (2026-11-21)

Ya no se copia Zepp. Lo que se construye es **una rutina por foto que te guía en el reloj**:

1. Foto de la pizarra del gimnasio o captura de otra app → rutina (ejercicios, series, repeticiones, peso, descanso).
2. La rutina llega al reloj.
3. En el gimnasio el reloj muestra el ejercicio actual; **un botón = siguiente**. Vibra al acabar el descanso.
4. Al terminar se guarda el entreno (tiempo por ejercicio, series, pulso) en **Health Connect**.

`recon.md` y `features.csv` quedan como referencia de lo que hace Zepp (historial, objetivos, retos), para fases posteriores.

## Reloj del usuario

Amazfit **Bip Max** · Zepp OS 6 (software 6.4.15.1) · API_LEVEL ≥ 4.4 · pantalla cuadrada 432 × 514 · 2 botones físicos.
**No** tiene "Workout Extension" (comprobado en el reloj), así que no se puede escribir en el historial de Entrenamientos de Zepp.

## Piezas

| pieza | dónde corre | qué hace | APIs oficiales |
| --- | --- | --- | --- |
| Miniapp del reloj | Bip Max | muestra ejercicio/serie/descanso, botones, pulso, vibración, guarda la sesión | `@zos/interaction` onKey, `@zos/sensor` HeartRate y Vibrator, `@zos/display` pantalla encendida, almacenamiento local |
| Side Service | dentro de la app Zepp del móvil | pasa la rutina al reloj y devuelve el resultado | Messaging API, Fetch API, Settings API |
| App Android propia | móvil | foto / compartir captura → IA con visión → revisar → enviar; recibir resultado → Health Connect | CameraX, intent de compartir, API de visión, Health Connect (ExerciseSessionRecord + HeartRateRecord) |

## Botones (propuesta)

- **Botón de arriba, pulsación corta**: serie hecha → empieza el descanso. En la última serie: siguiente ejercicio.
- **Botón de arriba, pulsación larga**: saltar al siguiente ejercicio.
- **Botón de abajo, pulsación corta**: pausa / continuar.
- **Botón de abajo, pulsación larga**: terminar y guardar.
- La pantalla táctil sirve para corregir reps o peso si hace falta.

## Punto por comprobar en el móvil real

Cómo pasan los datos entre nuestra app Android y el Side Service (que vive dentro de la app Zepp):
- **A (preferida, sin servidor)**: nuestra app abre un pequeño servidor local y el Side Service hace `fetch('http://127.0.0.1:…')`. Hay que probar que la app Zepp lo permite.
- **B (respaldo)**: un buzón en la nube gratuito (p. ej. Cloudflare Worker) con un código de emparejamiento.
- **C (mínimo garantizado)**: la app copia la rutina y se pega en los ajustes de la miniapp dentro de Zepp.

## Lo que hará falta del usuario

- Cuenta gratuita de desarrollador de Zepp (instalar la miniapp en el reloj por QR, sin tienda).
- Clave de API de visión para leer fotos (céntimos por foto).
- Repositorio en GitHub para guardar el proyecto.
- Activar opciones de desarrollador en Android para instalar la app de prueba.
