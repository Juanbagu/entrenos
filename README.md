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

Formato de texto (también se puede escribir a mano):

```
Pierna lunes
Sentadilla 4x10 60kg 90s
Press banca 3 x 12 @ 40 kg descanso 60
Dominadas 3xmax
Plancha 3x45s
```

## Seguridad

- La clave de la API se guarda **cifrada** con el Android Keystore y no entra en copias de seguridad ni transferencias.
- El puente con el reloj solo escucha en `127.0.0.1` (no es accesible desde la red), limita tamaños y número de conexiones,
  rechaza peticiones que vengan de una página web y valida cada entreno antes de guardarlo o escribirlo en Health Connect.
- Las fotos se reducen antes de enviarlas a la IA y no se guardan.

## Pruebas

- `cd reloj && npm test` — lógica de la sesión y lectura de texto (Node).
- `cd movil && ./gradlew testDebugUnitTest` — lectura de la respuesta de la IA y formatos.
