# Arquitectura Técnica — App de Nutrición y Rendimiento

**Versión:** 0.1 (borrador inicial)
**Autor:** Tiago — PB DevHouse
**Fecha:** Agosto 2026

---

## 1. Resumen del producto

Aplicación móvil de seguimiento nutricional y de rendimiento personal. A diferencia de las apps de conteo de calorías tradicionales, el eje del producto no es el registro pasivo sino la **recomendación contextual**: la app sabe que el usuario tiene un partido a las 18:00 y le dice qué conviene comer antes.

**Diferenciador principal:** eventos deportivos como ciudadano de primera clase del modelo de datos. De ahí salen las sugerencias pre/post evento y el análisis de fatiga acumulada.

**Horizonte:** proyecto de largo plazo, desarrollado y mantenido por una sola persona. Las decisiones de arquitectura priorizan mantenibilidad sobre velocidad inicial.

---

## 2. Decisiones de arquitectura

| Decisión | Elección | Motivo |
|---|---|---|
| Cliente móvil | Expo + dev build, TypeScript | Las librerías de salud son nativas; Expo Go no alcanza |
| Backend | Django REST Framework | Stack conocido, ORM sólido, admin gratis para operar |
| Base de datos | PostgreSQL | Relacional; los datos son fuertemente estructurados |
| Base local | SQLite (`expo-sqlite`) | Offline-first no negociable |
| Auth | JWT (`simplejwt`) + `expo-secure-store` | Estándar, sin dependencia de terceros |
| Hosting | Render (backend) + EAS (builds) | Continuidad con proyectos existentes |
| IA | Solo en backend, nunca en el cliente | Protege la API key y permite cachear y limitar costos |

### Por qué Django y no Supabase

Supabase acelera el arranque, pero este proyecto tiene lógica de dominio pesada (cálculo de TDEE, motor de reglas nutricionales, análisis de correlaciones) que termina viviendo en el servidor igual. Con un horizonte de años y un solo mantenedor, tener toda esa lógica en un lugar conocido y testeable pesa más que las semanas que ahorraría al principio.

---

## 3. Diagrama de capas

```
┌─────────────────────────────────────────────────┐
│                 App React Native                │
│                                                 │
│  UI (pantallas)                                 │
│  Estado (TanStack Query + Zustand)              │
│  Capa de persistencia local (SQLite)            │
│  Cola de sincronización                         │
│  Integraciones nativas (HealthKit / Health Conn)│
└──────────────────────┬──────────────────────────┘
                       │ HTTPS / JSON
┌──────────────────────┴──────────────────────────┐
│              API Django REST                    │
│                                                 │
│  Views / Serializers          (transporte)      │
│  Services                     (lógica dominio)  │
│    ├─ calculo_energetico                        │
│    ├─ motor_reglas                              │
│    ├─ analisis_comidas                          │
│    └─ analisis_patrones                         │
│  Models / ORM                                   │
└──────┬────────────────────────┬─────────────────┘
       │                        │
┌──────┴───────┐    ┌───────────┴─────────────────┐
│  PostgreSQL  │    │  Servicios externos         │
│              │    │  ├─ API de visión (fotos)   │
│              │    │  ├─ Open Food Facts         │
│              │    │  └─ USDA FoodData Central   │
└──────────────┘    └─────────────────────────────┘
```

---

## 4. Modelo de datos

### Núcleo

**Usuario** — extiende `AbstractUser`
```
email (único, login)
fecha_nacimiento
sexo_biologico        # necesario para Mifflin-St Jeor
altura_cm
nivel_actividad       # sedentario | ligero | moderado | alto | muy_alto
deporte_principal
objetivo              # bajar | mantener | subir | rendimiento
fecha_alta
```

**RegistroPeso** — histórico, no un campo del usuario
```
usuario (FK)
peso_kg
fecha
fuente                # manual | balanza | health_kit
```

> El peso se modela como serie temporal desde el día uno. Guardarlo como campo del perfil es un error que obliga a migrar datos más adelante.

### Nutrición

**Alimento** — catálogo, compartido entre usuarios
```
nombre
marca (nullable)
codigo_barras (nullable, indexado)
kcal_por_100g
proteina_g / carbohidratos_g / grasa_g / fibra_g   # por 100g
fuente                # open_food_facts | usda | manual | vision
verificado (bool)
```

**Comida**
```
usuario (FK)
fecha_hora
tipo                  # desayuno | almuerzo | merienda | cena | snack
foto_url (nullable)
notas
```

**ItemComida**
```
comida (FK)
alimento (FK)
cantidad_g
editado_por_usuario (bool)   # true si corrigió la estimación de la IA
```

> El flag `editado_por_usuario` no es decorativo: mide qué tan bien estima el modelo de visión y permite priorizar mejoras.

### Rendimiento

**Evento**
```
usuario (FK)
tipo                  # partido | entrenamiento | gimnasio | competencia
fecha_hora_inicio
duracion_estimada_min
intensidad            # baja | media | alta
completado (bool)
notas
```

**RegistroSueno**
```
usuario (FK)
fecha                 # noche que corresponde
hora_dormir / hora_despertar
duracion_min
calidad_percibida     # 1-5, opcional
fuente                # manual | health_kit | health_connect
```

**RegistroEnergia**
```
usuario (FK)
fecha
nivel                 # 1-5, subjetivo
momento               # mañana | tarde | noche
```

> Este registro es la variable dependiente de todo el análisis de patrones. Sin él, "dormiste 8h y seguís cansado" es imposible de detectar. Pedirlo cuesta un tap por día.

### Recomendaciones

**ReglaNutricional** — en base de datos, no hardcodeada
```
nombre
condicion_json        # ventana temporal, tipo de evento, intensidad
recomendacion_json    # macros objetivo, ejemplos de alimentos
prioridad
activa (bool)
```

**Sugerencia** — log de lo que la app recomendó
```
usuario (FK)
evento (FK, nullable)
tipo
contenido_json
generada_en
feedback_usuario      # util | no_util | null
```

---

## 5. Motor de recomendación pre/post evento

La lógica es determinística. La IA solo redacta y personaliza el texto final; el cálculo no depende de ella.

### Reglas base

| Ventana | Recomendación |
|---|---|
| 3–4 h antes | Comida completa. Carbohidratos altos, proteína moderada, grasa y fibra bajas |
| 1–2 h antes | Snack simple de digestión rápida (banana, tostadas con miel) |
| < 1 h antes | Líquidos o carbohidrato simple. Nada pesado |
| 0–60 min después | Ventana de recuperación: proteína + carbohidratos |
| > 2 h después | Comida normal ajustada al déficit/superávit del día |

### Flujo

```
1. Cliente pide GET /api/sugerencias/proximo-evento/
2. Backend busca el próximo Evento en las siguientes 12h
3. Calcula ventana temporal → selecciona ReglaNutricional aplicable
4. Ajusta por: objetivo del usuario, calorías ya consumidas hoy,
   intensidad del evento, horas de sueño de anoche
5. (Opcional) Pasa el resultado estructurado a la IA para redactar
   en lenguaje natural con alimentos que el usuario suele comer
6. Guarda la Sugerencia y la devuelve
```

Las reglas viven en base de datos porque se van a ajustar seguido. Cambiar un umbral no debería requerir un deploy.

### Alertas cruzadas

El mismo motor genera avisos combinando fuentes:
- Sueño corto + evento de alta intensidad próximo
- Varios días consecutivos de entrenamiento sin descanso
- Ingesta calórica muy por debajo del gasto en semana de carga

---

## 6. Análisis de comidas

Estrategia en cascada, de más barato a más caro:

```
1. Código de barras   → Open Food Facts / caché local
                        Exacto, gratis. Cobertura parcial en Argentina.
2. Búsqueda por texto → catálogo propio + USDA
                        Para alimentos genéricos y caseros.
3. Foto               → modelo de visión → JSON {alimentos[], porciones_g[]}
                        Último recurso: cuesta plata por llamada.
```

**Reglas de la vía por foto:**
- La respuesta siempre es editable. La porción es una estimación, no un dato.
- Límite diario de análisis por usuario, configurable.
- Los alimentos identificados se guardan en el catálogo para reutilizar.
- Prompt fuerza salida JSON estricta, sin markdown ni preámbulo. Parseo defensivo con try/catch.

---

## 7. Sincronización offline

Requisito duro: el registro de comidas tiene que funcionar sin señal.

**Modelo:** escritura local primero, sincronización en background.

```
Tabla local: cola_sync
  id_local (uuid generado en el cliente)
  entidad         # comida | peso | sueno | energia | evento
  operacion       # crear | actualizar | eliminar
  payload_json
  estado          # pendiente | enviando | error
  intentos
  creado_en
```

- Todo registro nace con un UUID del cliente. El servidor lo respeta como clave de idempotencia y descarta duplicados.
- Reintentos con backoff exponencial.
- Conflictos: gana la última escritura (`updated_at`). Los datos son personales y de un solo dispositivo activo, así que no justifica algo más complejo.
- La UI lee siempre de SQLite. El servidor es la fuente de verdad para la sincronización, no para el render.

---

## 8. Integración con datos de salud

| Plataforma | Librería | Notas |
|---|---|---|
| iOS | `react-native-health` | HealthKit. Requiere permisos declarados en el build |
| Android | `react-native-health-connect` | Health Connect. **Reemplazó a Google Fit** — ignorar tutoriales viejos |

Ambas rutas son opcionales. La carga manual de sueño siempre está disponible: buena parte de los usuarios no tiene reloj ni banda.

---

## 9. Seguridad y salvaguardas de producto

**Técnicas**
- API keys de IA solo en el backend, nunca en el bundle del cliente.
- JWT en `expo-secure-store`, no en `AsyncStorage`.
- HTTPS obligatorio; certificado gestionado por Render.
- Rate limiting por usuario en los endpoints de IA.
- Los datos de salud son sensibles: no loguear payloads de comidas, peso ni sueño.

**De producto (no negociables)**
- Piso duro de calorías sugeridas: nunca por debajo de ~1200 kcal (mujeres) / ~1500 kcal (hombres).
- Bloquear objetivos de peso que impliquen un IMC por debajo del rango saludable.
- Registro restringido a mayores de 18 años.
- Ritmo de pérdida de peso limitado a un máximo razonable por semana; rechazar objetivos más agresivos.
- Disclaimer visible: la app no reemplaza asesoramiento médico ni nutricional.

Son unas pocas horas de implementación y evitan un problema serio.

---

## 10. Estructura de carpetas

### Backend

```
backend/
├── config/                  # settings, urls, wsgi
├── apps/
│   ├── usuarios/            # perfil, auth, registros de peso
│   ├── nutricion/           # alimentos, comidas, items
│   ├── rendimiento/         # eventos, sueño, energía
│   ├── recomendaciones/     # reglas, motor, sugerencias
│   └── integraciones/       # open food facts, usda, visión
├── core/
│   ├── services/            # lógica de dominio pura y testeable
│   └── utils/
└── tests/
```

> Las views quedan finas: validan, delegan a `services/`, serializan. Toda la lógica de cálculo vive en funciones puras fáciles de testear sin base de datos.

### Cliente

```
app/
├── src/
│   ├── screens/
│   ├── components/
│   ├── navigation/
│   ├── api/                 # clientes HTTP, tipos compartidos
│   ├── db/                  # esquema SQLite, migraciones, cola de sync
│   ├── health/              # wrappers de HealthKit / Health Connect
│   ├── store/
│   └── utils/
└── app.json
```

---

## 11. Endpoints principales

```
POST   /api/auth/registro/
POST   /api/auth/login/
POST   /api/auth/refresh/

GET    /api/perfil/
PATCH  /api/perfil/
GET    /api/perfil/objetivos/          # TDEE y macros calculados

POST   /api/peso/
GET    /api/peso/?desde=&hasta=

GET    /api/alimentos/buscar/?q=
GET    /api/alimentos/barcode/{codigo}/
POST   /api/alimentos/analizar-foto/

GET    /api/comidas/?fecha=
POST   /api/comidas/
PATCH  /api/comidas/{id}/
DELETE /api/comidas/{id}/

GET    /api/eventos/?desde=&hasta=
POST   /api/eventos/

POST   /api/sueno/
POST   /api/energia/

GET    /api/sugerencias/proximo-evento/
GET    /api/sugerencias/hoy/
POST   /api/sugerencias/{id}/feedback/

GET    /api/dashboard/hoy/             # agregado, una sola llamada
POST   /api/sync/lote/                 # cola offline
```

---

## 12. Roadmap por fases

### Fase 1 — MVP
Objetivo: que la app sea usable a diario por una persona real.

- Auth y perfil (peso, altura, edad, actividad, deporte, objetivo)
- Cálculo de TDEE (Mifflin-St Jeor) y macros sugeridos
- Registro de comidas por código de barras y búsqueda
- Registro manual de sueño y energía diaria
- CRUD de eventos
- Dashboard del día
- Persistencia local y cola de sincronización

**No incluir en fase 1:** recetas, análisis por foto, correlaciones, notificaciones.

### Fase 2 — Contexto
- Motor de reglas pre/post evento
- Análisis de comidas por foto
- Notificaciones push contextuales
- Integración con HealthKit / Health Connect

### Fase 3 — Inteligencia
- Correlaciones sueño / nutrición / energía (requiere ~3 semanas de datos por usuario)
- Recetas y sugerencias de menú
- Ajuste automático de objetivos según progreso real
- Exportación de datos

---

## 13. Riesgos conocidos

| Riesgo | Mitigación |
|---|---|
| Costo variable del análisis por foto | Cascada barcode → texto → foto; límite diario; caché de alimentos |
| Cobertura pobre de productos argentinos en Open Food Facts | Catálogo propio que crece con los aportes de usuarios |
| Abandono por fricción de carga | Reducir el registro a la mínima cantidad de taps; el score de energía es un solo tap |
| Análisis de patrones sin datos suficientes | No mostrar la sección hasta tener 21 días; comunicar el progreso |
| Alcance creciente en un proyecto de una persona | Fases cerradas; no empezar recetas antes de que el MVP funcione |

---

## 14. Decisiones pendientes

- ¿Modelo de negocio? (gratis con límites, suscripción, pago único)
- ¿Multi-idioma desde el inicio o solo español?
- ¿Nombre y dominio?
- Proveedor concreto del modelo de visión y su costo por llamada
- ¿Versión web como complemento o solo móvil?