Crypto Sentinel - Vercel-ready package

Instrucciones:

- El frontend está en /public (Vercel servirá los archivos estáticos desde la raíz).
- Las rutas API están en /api (serverless functions). Endpoints implementados:
  - GET /api/dashboard
  - GET|PUT /api/config
  - POST /api/telegram/token
  - POST /api/telegram/pair
  - POST /api/telegram/test

Persistencia:
- Para persistir configuraciones y el token de Telegram la app puede usar la API de GitHub.
- Configura las variables de entorno en Vercel:
  - GITHUB_TOKEN: token con permisos `repo`
  - GITHUB_REPO: owner/repo (ej. agustin-senatore/crypto-sentinel)
  - GITHUB_BRANCH: rama (por defecto: main)
  - SETTINGS_PATH: ruta al archivo de settings en el repo (por defecto: data/settings.json)

Si GITHUB_TOKEN no está provisto, la app intentará guardar localmente (útil solo para pruebas locales; no persistirá en Vercel).

Desplegar en Vercel:
1. Crea un repo en GitHub con el contenido de la carpeta `webhosting` (puedes subir toda la carpeta y usar esa carpeta como root) o sube al repo raíz y configura Vercel para servir desde la raíz.
2. En Vercel añade las variables de entorno indicadas.
3. Deploy.

Notas:
- Vercel functions son efímeras: si no configuras GITHUB_TOKEN, los cambios no se conservarán entre despliegues.
- Telegram requiere que guardes el token y que luego pinches el botón "Vincular" después de abrir tu bot y enviar /start.
