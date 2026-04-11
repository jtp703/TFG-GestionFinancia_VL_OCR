# TAREA: Crear sistema Memory Bank desde documentación existente

Eres un agente experto en gestión de contexto para proyectos de IA.
Tienes acceso completo al sistema de archivos de este proyecto.

## Contexto del proyecto

Este proyecto tiene DOS dominios diferenciados:
- `model/` — entrenamiento y experimentación de modelos ML
- `web/`   — desarrollo full-stack de una aplicación web

Existen Markdowns de documentación ya creados dispersos por el proyecto.
Tu tarea es migrar toda esa información a un sistema Memory Bank estructurado.

## Paso 0: Preparación de ramas Git (hacer ANTES de crear ningún archivo)

1. Verifica en qué rama estás actualmente
2. Comprueba si existe la rama `feature-app`:
   - Si NO existe: créala desde `main` → `git checkout -b feature-app`
   - Si existe: cámbiate a ella → `git checkout feature-app`
3. En la rama `main`, busca cualquier archivo relacionado con Claude:
   - Archivos llamados CLAUDE.md, claude.md o similares
   - Carpetas llamadas memory/, .claude/, claude/ o similares
   - Cualquier archivo .md con instrucciones dirigidas al bot
4. Si encuentras algo en `main`:
   - Muéstramelo antes de tocarlo
   - Espera mi confirmación para eliminarlo de `main`
5. Confirma que estás en `feature-app` antes de continuar al Paso 1

IMPORTANTE: Todo el trabajo de Memory Bank ocurre EXCLUSIVAMENTE en `feature-app`.
Nunca hacer commits directamente a `main`.

## Paso 1: Explorar y catalogar

1. Recorre TODOS los archivos .md del proyecto de forma recursiva
2. Lee cada archivo completamente
3. Registra la fecha de creación/modificación de cada archivo si está disponible
4. Clasifica cada uno en una de estas categorías:
   - PROGRESO: tareas completadas, issues resueltos, experimentos hechos
   - DECISIONES: por qué se eligió X sobre Y, arquitectura, tradeoffs
   - ESTILO: convenciones de código, formato, naming, commits
   - FEATURES: funcionalidades implementadas y cómo funcionan
   - BRIEF: objetivos, stack, restricciones del proyecto
   - CONTEXTO-ML: específico de entrenamiento, datasets, métricas
   - CONTEXTO-WEB: específico de frontend/backend/API
   - MIXTO: contiene info de ambos dominios (dividir al migrar)

Antes de escribir nada, muéstrame el catálogo resultante y espera confirmación.

## Paso 2: Crear la estructura de archivos

Una vez confirmado el catálogo, crea esta estructura exacta:

```
CLAUDE.md                          ← raíz: reglas globales + mapa de dominios

model/
  CLAUDE.md                        ← contexto ML: importa memory/bot/
  memory/
    bot/                           ← archivos optimizados para el bot
      experiments.md               ← runs, hiperparámetros, métricas
      datasets.md                  ← fuentes, preprocesamiento, splits
      decisions.md                 ← decisiones de arquitectura ML
      progress.md                  ← tareas ML completadas (con fechas)
      activeContext.md             ← foco actual del dominio ML
    docs/                          ← archivos legibles para el humano
      [conservar docs ML originales reorganizados]

web/
  CLAUDE.md                        ← contexto web: importa memory/bot/
  memory/
    bot/
      features.md                  ← funcionalidades implementadas
      decisions.md                 ← decisiones de arquitectura web
      style.md                     ← convenciones de código y estilo
      progress.md                  ← issues y tareas completadas (con fechas)
      activeContext.md             ← foco actual del dominio web
    docs/
      [conservar docs web originales reorganizados]
```

## Reglas de migración

FECHAS — obligatorio en todos los archivos bot/:
- Cada entrada en progress.md, experiments.md y decisions.md DEBE incluir fecha
- Formato: YYYY-MM-DD al inicio de cada entrada
- Si el MD original tiene fecha, úsala. Si no, usa la fecha de modificación del archivo.
- Si no hay ninguna fecha disponible, marca como [fecha desconocida]
- En activeContext.md, incluir "Última actualización: YYYY-MM-DD" en la primera línea

DESTILACIÓN, no copia:
- Los archivos bot/ deben ser DENSOS y CORTOS. Sin introducción, sin contexto
  redundante. Solo hechos, decisiones y estado actual.
- Formato: listas > párrafos. Fechas siempre. Verbo en pasado para hechos.
- Máximo 3-4 líneas por entrada. Si necesita más explicación, va a docs/.

NUNCA eliminar información:
- Todo lo que estaba en los MDs originales debe aparecer en algún archivo,
  ya sea en bot/ (condensado) o en docs/ (detallado).

SEPARACIÓN estricta por dominio:
- Si un MD contiene info de ambos dominios, dividirla.
- Nunca mezclar contexto ML y web en el mismo archivo bot/.

## Qué debe incluir el CLAUDE.md raíz (sección Git permanente)

Añade esta sección al CLAUDE.md raíz bajo el título "## Workflow Git":

---
## Workflow Git

Rama de trabajo: `feature-app` (base: main)
Vercel apunta a: `feature-app` — nunca a main directamente

Reglas permanentes:
- TODO el trabajo va en ramas que derivan de `feature-app`, nunca de `main`
- Nunca proponer ni ejecutar merge directo a `main`
- Formato de commits: tipo(scope): descripción
  Ejemplos: feat(web): añadir login OAuth
            fix(model): corregir split de datos en validación
            docs(memory): actualizar progress.md tras issue #23
- Al cerrar un issue o completar una feature, hacer commit de los archivos
  bot/ actualizados en el mismo commit que el código
---

## Qué debe contener cada CLAUDE.md de dominio

model/CLAUDE.md debe incluir:
- Instrucción: leer todos los archivos en model/memory/bot/ al iniciar
- Instrucción: qué archivo actualizar según el tipo de tarea completada
  · Experimento completado → experiments.md (con fecha)
  · Decisión de arquitectura → decisions.md (con fecha)
  · Tarea general → progress.md (con fecha)
  · Cambio de foco → reescribir activeContext.md (con fecha de hoy)
- Stack y herramientas ML del proyecto (extraídas de los MDs existentes)

web/CLAUDE.md debe incluir:
- Instrucción: leer todos los archivos en web/memory/bot/ al iniciar
- Instrucción: qué archivo actualizar según el tipo de tarea completada
  · Feature implementada → features.md (con fecha)
  · Issue resuelto → progress.md (con fecha)
  · Estilo acordado → style.md (sin fecha, es una regla vigente)
  · Decisión técnica → decisions.md (con fecha)
  · Cambio de foco → reescribir activeContext.md (con fecha de hoy)
- Stack web del proyecto (extraído de los MDs existentes)

## Output esperado al finalizar

1. Confirma que estás en la rama `feature-app`
2. Muestra qué encontraste en `main` relacionado con Claude y qué hiciste
3. Lista los archivos MD originales catalogados con su clasificación
4. Muestra un resumen de entradas migradas por archivo bot/ (con rango de fechas)
5. Lista cualquier información sin fecha o sin clasificación clara para que yo decida
6. Haz un commit inicial en feature-app: "chore(memory): inicializar sistema Memory Bank"
7. NO borres los archivos MD originales — muévelos a docs/ si corresponde

Empieza siempre por el Paso 0, luego muéstrame el catálogo del Paso 1
y espera mi confirmación antes de escribir ningún archivo.

> Para cualquier duda o aclaracion, pregunta antes de decidir por tu cuenta.