# 🦁 Guía para levantar la App de Rendimiento — ¡Hola Valen!

Esta guía tiene el paso a paso exacto para que puedas clonar, instalar y levantar la app en tu máquina y probarla en tu celular o emulador sin vueltas.

---

## 1. Requisitos previos

Asegurate de tener instalado en tu computadora:

1. **Node.js**: Versión 18 o superior (recomendado Node 20 LTS).
   - Verificá en tu terminal con: `node -v`
2. **Package Manager**: El proyecto usa **pnpm**, pero también podés usar **npm**.
   - Si no tenés pnpm: `npm install -g pnpm`
3. **Git**: Para clonar y actualizar el repositorio.
4. **En tu celular (opción más rápida para probar):**
   - Instalate la app **Expo Go** desde Google Play Store (Android) o App Store (iOS).

---

## 2. Instalación paso a paso

Abrí una terminal en la raíz del proyecto y ejecutá:

```bash
# 1. Entrar a la carpeta frontend
cd frontend

# 2. Instalar dependencias
pnpm install
# (Si no usás pnpm, podés usar: npm install)
```

---

## 3. Levantar la aplicación

Una vez terminada la instalación, iniciá el servidor de desarrollo de Expo:

```bash
# Dentro de la carpeta frontend:
pnpm start
# o también: npx expo start
```

En la terminal se va a abrir un menú interactivo con un **código QR grande**.

---

## 4. Cómo abrir la app

### Opción A: En tu celular físico con Expo Go (Recomendada)
1. Conectá tu celular a **la misma red Wi-Fi** que tu computadora.
2. Abrí la app **Expo Go**:
   - **En Android:** tocá "Scan QR code" y escaneá el QR de la terminal.
   - **En iOS:** abrí la app Cámara nativa del iPhone, apuntá al QR y tocá la notificación de Expo Go.
3. **¿No te conecta o estás en redes Wi-Fi distintas / datos móviles?**
   Levantalo con modo túnel ejecutando:
   ```bash
   npx expo start --tunnel
   ```
   *(La primera vez te puede pedir instalar `@expo/ngrok`, dale que sí)*.

### Opción B: En Emulador Android o Simulador iOS
Con el servidor corriendo, presioná en la misma terminal:
- Presioná `a` para abrir en el emulador de **Android**.
- Presioná `i` para abrir en el simulador de **iOS** (solo en Mac con Xcode).
- Presioná `w` para abrir en el navegador **Web** (para vistas rápidas).

---

## 5. Base de datos y datos de prueba

- **No necesitás instalar Postgres ni configurar bases externas:**
  La app corre con arquitectura *offline-first* usando **SQLite local (`expo-sqlite`)** directamente en el dispositivo/emulador.
- Al arrancar la app por primera vez, se ejecutan automáticamente las migraciones y se cargan las semillas de alimentos argentinos (~800 alimentos con porciones y macros ya calibrados).
- Si querés verificar la base de datos local y los tests de scripts, podés correr:
  ```bash
  # Dentro de frontend/
  node scripts/probar-db.mjs
  ```

---

## 6. Estructura rápida del proyecto

Para ubicarte rápido en el código:

- `frontend/app/`: Pantallas y navegación (usamos **Expo Router** basado en sistema de archivos):
  - `(tabs)/index.tsx`: **Dashboard principal** (saludo del León mascota con consejos según eventos y macros, resumen de calorías, macros del día y lista de comidas).
  - `(tabs)/agenda.tsx`: Calendario y próximos entrenamientos/partidos.
  - `(tabs)/comidas.tsx`: Historial de comidas registradas.
  - `(tabs)/perfil.tsx`: Datos del usuario, peso y objetivos.
  - `comida/nueva.tsx`: Flujo para buscar alimentos, seleccionar porción y registrar comidas.
  - `comida/[id].tsx`: Detalle y edición de una comida registrada.
  - `evento/temporizador.tsx`: Temporizador de descansos/intervalos para entrenar.
  - `onboarding/`: Cuestionario inicial de peso, altura, deporte y objetivo.
- `frontend/src/features/mascota/`:
  - `MascotaLeon.tsx`: Componente visual del león con el saludo y la card de consejo.
  - `logicaConsejos.ts`: Motor que decide qué consejo darle al usuario (ej. si falta poco para un partido, sugiere carbohidratos; si es de noche y falta proteína, avisa; etc.).
- `frontend/src/db/`:
  - `schema.ts`: Definición de tablas locales.
  - `queries/`: Consultas SQLite (`comidas.ts`, `perfil.ts`, `eventos.ts`, `alimentos.ts`).
  - `seeds/`: Base de datos inicial de alimentos argentinos.
- `frontend/src/ui/`:
  - `theme.ts`: Tokens oficiales de diseño (paleta crema/marino/ámbar, tipografías, espaciados, sombras).
  - `Pantalla.tsx`, `Boton.tsx`, `Input.tsx`: Componentes base de la UI.

---

## 7. Atajos y soluciones a problemas comunes

- **Limpiar caché de Expo si algo se traba o no refleja cambios:**
  ```bash
  npx expo start -c
  ```
- **Recargar la app en el celular:**
  Agitá el celular para abrir el menú de desarrollo de Expo y tocá **Reload** (o presioná `r` en la terminal de la compu).
- **Error de dependencias al instalar:**
  Asegurate de borrar `node_modules` y correr `pnpm install` o `npm install` limpio.

Cualquier duda que tengas, avisale a Tiago y lo vemos juntos. ¡A meterle! 🚀
