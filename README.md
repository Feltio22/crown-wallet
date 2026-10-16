# Crown Wallet — Fase 9

Base de trabajo: Fase 8. Esta fase añade el registro opcional de comisión bancaria al transferir entre cuentas propias.

## Incluido en el código
- Transferencias entre cuentas propias con importes enviado y recibido independientes.
- Comisión bancaria opcional en la moneda de la cuenta de origen.
- La comisión se guarda como un movimiento de gasto separado en la categoría `Comisiones bancarias` y conserva la tasa/equivalente histórico disponible.
- La validación de saldo comprueba el importe enviado más la comisión cuando la cuenta no permite saldo negativo.
- Al anular una transferencia, también se anula su gasto de comisión asociado para revertir ambos efectos.
- Se mantiene compatibilidad con transferencias antiguas sin comisión (`feeTransactionId` opcional).
- Persistencia local mediante AsyncStorage.

## No verificado todavía
- No se ha completado la instalación de dependencias en el entorno de trabajo; `npm install` agotó el tiempo de espera y el modo sin conexión no encontró los paquetes en caché.
- Por esa razón, no se ha podido validar el TypeScript ni ejecutar Expo/Android build.
- No existe todavía un APK confirmado ni pruebas ejecutadas en el Samsung.
- El proyecto sigue sin incluir cifrado de datos locales ni todos los módulos previstos en la especificación maestra.

## Comprobación en un entorno con acceso al registro npm
1. `npm install`
2. `npm run typecheck`
3. `npx expo-doctor`
4. `npx eas-cli build --platform android --profile preview`

El perfil `preview` de `eas.json` está configurado para producir APK instalable. La compilación en la nube requiere cuenta Expo y que el proyecto quede vinculado/configurado en EAS.

## Fase 10 — pruebas automatizadas del núcleo financiero
Se añadieron siete pruebas ejecutables con el runner integrado de Node para comprobar saldos, transferencias propias, comisiones con tasa histórica, gastos con saldo insuficiente, movimientos anulados, prioridad de tasa manual y tasas pendientes.

Resultado local: **7/7 pruebas pasaron** usando el TypeScript global disponible en el entorno. Esto valida solo `src/core/finance.ts` y esos casos; no equivale a validar la interfaz completa, instalar Expo ni compilar un APK. `npm install` sigue sin terminar en este entorno por tiempo de espera, por lo que la comprobación integral del proyecto permanece pendiente.

Para ejecutar cuando las dependencias estén instaladas: `npm test`.

## Preparación de compilación en la nube (Fase 11)

Se añadió `.github/workflows/eas-build.yml` para solicitar un APK Android desde GitHub Actions y EAS Build. El perfil `preview` genera APK para instalación directa; los perfiles ahora especifican la imagen `latest`.

**Pendiente de configuración del propietario antes de compilar:**
1. Crear/iniciar sesión en una cuenta de Expo y una de GitHub.
2. Subir el contenido de esta carpeta a un repositorio GitHub con rama `main`.
3. Configurar el proyecto EAS y su `projectId` con la cuenta Expo.
4. Crear un token de acceso de Expo y guardarlo en GitHub como secreto del repositorio `EXPO_TOKEN` (Settings → Secrets and variables → Actions).
5. Ejecutar el workflow `Crown Wallet Android APK` desde Actions o hacer push a `main`.
6. Esperar el enlace de compilación en EAS y verificar el APK antes de instalarlo.

No se incluye ningún token ni contraseña en el proyecto. Esta configuración **no demuestra aún que la compilación remota funcione**; falta enlazar las cuentas y ejecutar el primer build.
