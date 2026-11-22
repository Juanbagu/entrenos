# Rutina Foto

Haz una foto de la pizarra del gimnasio (o comparte una captura) y tu Amazfit te guía la rutina: un botón para cada serie, descanso con vibración, y el entreno guardado en Health Connect.

| carpeta | qué es |
| --- | --- |
| `reloj/` | miniapp Zepp OS para el reloj (probada para Amazfit Bip Max, Zepp OS 6) |
| `movil/` | app Android: foto → rutina con Claude, envío al reloj, entrenos → Health Connect |
| `replica/` | investigación de Zepp y plan |

## Botones en el reloj

| botón | corto | largo |
| --- | --- | --- |
| **arriba** | serie hecha (o saltar descanso) | siguiente ejercicio |
| **abajo** | ver qué viene después | menú en pantalla: **Pausar/Continuar · Terminar · Volver** |

- **Series por tiempo** (`45s`, `1min`): arriba arranca la cuenta atrás; vibra al acabar. Otra pulsación la termina antes.
- **En el descanso** puedes tocar **−rep / +rep / −kg / +kg** para apuntar lo que de verdad hiciste en esa serie.
- Deslizar hacia la derecha no saca de la sesión (para no salir sin querer).
- Si el móvil no está a mano, el entreno se queda guardado y se reenvía solo.

En el menú: arriba = pausar/continuar, abajo = volver. *Terminar* solo tocando la pantalla, para no terminar sin querer.
Si los botones salen al revés, en la miniapp: **Botones** → pulsa el botón → **Invertir arriba/abajo**.

## Instalar la app del móvil

1. Pasa `RutinaFoto.apk` al móvil y ábrelo (Android pedirá permitir instalar desde esa app).
2. Abre **Rutina Foto → Ajustes** y pega tu clave de la API de Claude (console.anthropic.com → API Keys). Se queda solo en el móvil.
3. En **Entrenos**, pulsa «Permitir guardar en Health Connect».

Compilar: `cd movil && ./gradlew assembleDebug` (necesita Android SDK 36).

## Instalar la miniapp en el reloj

Necesita una cuenta gratuita de desarrollador de Zepp (console.zepp.com, entrando con tu cuenta de Zepp).

1. En console.zepp.com crea una miniapp llamada "Rutina Foto" y copia su **App ID** en `reloj/app.json` (`app.appId`).
2. En el ordenador: `npm i -g @zeppos/zeus-cli`, luego en `reloj/`: `npm install`, `zeus login`, `zeus preview`.
3. En el móvil: app Zepp → Perfil → Ajustes → Acerca de → toca el logo de Zepp 7 veces → aparece **Modo desarrollador** → **Escanear** el QR que muestra `zeus preview`.

## Cómo se usa

1. Móvil: **Hacer foto** (o compartir una captura con Rutina Foto) → revisa → **Enviar al reloj**.
2. Reloj: **Rutina Foto → Recibir del móvil → Empezar** (o botón de arriba).
3. Al terminar, el entreno llega al móvil y se guarda en Health Connect.

### Si el reloj no recibe la rutina

La miniapp le pide la rutina a nuestra app a través de la app Zepp (servidor local `127.0.0.1:8765`). Si la app Zepp no lo permitiera:
**Copiar como texto (para Zepp)** en el móvil → app Zepp → Perfil → Rutina Foto → Ajustes → pega en «Rutina». El reloj la lee de ahí.

Formato de texto (también se puede escribir o pegar con el botón **Texto**):

```
Híbrido jueves
Back squat 5x5 100kg 2'

4 rondas:
1km run
20 wall balls 9kg
15 cal bike
Descanso 1'

21-15-9:
Thrusters 43kg
Pull-ups
Time cap 10'

AMRAP 12'
10 burpees
12 cal row
6 pull ups

E2MOM 16: 8 power cleans 70kg
```

| se escribe | se entiende |
| --- | --- |
| `Sentadilla 4x10 60kg 90s` | fuerza: 4 series de 10 con 60 kg y 90 s de descanso |
| `1km run`, `Row 1000m`, `50m sled push @ 152kg` | distancia (en metros) y peso |
| `20 cal bike`, `15/12 cal AB` | calorías (si hay dos cifras, la primera) |
| `Plancha 1:00`, `45s hollow`, `2' plank` | por tiempo (cuenta atrás en el reloj) |
| `200m farmers carry 2x24kg`, `100 WB 6/4kg` | pesos dobles y hombre/mujer |
| `4 rondas`, `5 RFT`, `x3` | rondas (RFT = cronometradas) |
| `21-15-9`, `For time (cap 20)`, `Time cap 10'` | por tiempo con esquema y límite |
| `AMRAP 12'` | tantas rondas como puedas; el reloj cuenta las rondas |
| `EMOM 10`, `E2MOM 16`, `Cada 3' x 5` | cada minuto (o cada N); el reloj avanza solo |
| `HYROX SIM` + estaciones | For time completo (8 × carrera + estación) |
| WB, BBJ, SBL, FC, T2B, C2B, HSPU, DU, Ski, Row, Run, AB… | se traducen al nombre completo |

### En el reloj, con bloques

- **AMRAP / EMOM / For time** empiezan con **arriba** («¡Listo!») y muestran arriba el reloj del bloque: rondas y tiempo que queda (AMRAP), minuto e intervalo (EMOM) o tiempo transcurrido y límite (For time/Hyrox).
- En el **EMOM**, al terminar el ejercicio pulsas arriba y esperas; al empezar el minuto vibra y pasa al siguiente. Si no te da tiempo, cuenta como no completado.
- **Arriba largo** en un AMRAP/EMOM termina el bloque; en el resto, pasa al siguiente ejercicio.
- El resumen guarda el resultado de cada bloque (rondas del AMRAP, tiempo del For time o del Hyrox, minutos fallados del EMOM) y en Health Connect se registra como entreno de intervalos (HIIT).

### Lectura de fotos

- **Captura** (o compartir una imagen con la app): se lee **en el móvil, sin internet y gratis**. Si no sale bien, «Leer con IA».
- **Hacer foto** (pizarra, papel, letra a mano): se lee **con IA** si tienes clave; si no, en el móvil.
- **Texto**: pega el entreno (de WhatsApp, notas…) y se lee en el móvil.

## Seguridad

- La clave de la API se guarda **cifrada** con el Android Keystore y no entra en copias de seguridad ni transferencias.
- El puente con el reloj solo escucha en `127.0.0.1` (no es accesible desde la red), limita tamaños y número de conexiones,
  rechaza peticiones que vengan de una página web y valida cada entreno antes de guardarlo o escribirlo en Health Connect.
- Las fotos se reducen antes de enviarlas a la IA y no se guardan.

## Pruebas

- `cd reloj && npm test` — lógica de la sesión y lectura de texto (Node).
- `cd movil && ./gradlew testDebugUnitTest` — lectura de la respuesta de la IA y formatos.
