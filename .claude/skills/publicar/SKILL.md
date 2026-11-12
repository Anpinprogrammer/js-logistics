---
name: publicar
description: Guarda los cambios de JS Logistics en Git, los sube a GitHub, publica la app y las reglas en Firebase y comprueba que lo publicado sea igual a lo local. Úsalo cuando Javier diga "publicar", "/publicar" o "súbelo".
---

# Publicar JS Logistics

Invocar este skill es la autorización de Javier para publicar. Sigue los pasos en orden y detente en el primero que falle: si un paso falla, no publiques a medias.

Carpeta del proyecto: `~/Proyectos/js-logistics`. Node está en `~/.local/node/bin`, así que antepón `export PATH="$HOME/.local/node/bin:$PATH"` a cada comando de node o de firebase. gh está en `~/.local/bin/gh`.

> **Patinadores:** el rol de patinador, su caja y el bloque de Caja → Patinadores existen solo en el sistema nuevo (`backend/` y `frontend/`). Este skill publica la app vieja en Firebase y no los toca ni los lleva a producción. Los cambios de patinadores se despliegan con el sistema nuevo (Render y Vercel, con `npm run db:migrar` si cambia el esquema).

## 1. Revisar antes de publicar
- Corre `git status --short` y `git diff --stat`. Si no hay cambios y HEAD ya está en `origin/main`, salta al paso 4: se publica lo que ya está guardado.
- Revisa la sintaxis: `node --check app/js/app.js`. Si `app/js/plataforma.js` cambió, revísalo como módulo: `t=$(mktemp -d) && cp app/js/plataforma.js "$t/p.mjs" && node --check "$t/p.mjs"`.
- Si `firestore.rules` cambió, compílalo sin publicar: `firebase deploy --only firestore:rules --dry-run --non-interactive`.
- Nunca subas datos del negocio. `datos-migracion/`, `respaldo-*.zip` y `*.xlsx` están en `.gitignore`: si `git status` muestra alguno de esos archivos, detente y avisa.

## 2. Guardar en Git
- Commit en español, de una línea, que diga qué cambió para el negocio (por ejemplo, "Sueldos: devolver o quitar adelantos").
- Termina el mensaje con la línea de atribución que indique el sistema. Hoy es `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## 3. Subir a GitHub
- `git push origin main`. El repositorio es privado: `javier980615-prog/js-logistics`.
- Si GitHub no responde, reintenta una vez. Si sigue fallando, publica igual en Firebase y avisa que GitHub quedó pendiente.

## 4. Publicar en Firebase
- `firebase deploy --only hosting,firestore:rules --non-interactive` (las reglas se publican siempre; si no cambiaron, no pasa nada).

## 5. Comprobar
- Compara `shasum -a 256 app/js/app.js` con `curl -s "https://js-logistics-299ce.web.app/js/app.js?v=$(date +%s)" | shasum -a 256`. Haz lo mismo con `app/js/plataforma.js` y `app/css/estilos.css` si cambiaron.
- Revisa que `git ls-remote origin main` sea igual a `git rev-parse HEAD`.

## 6. Informar a Javier
En español sencillo y en pocas líneas:
- Qué quedó publicado y el código corto del commit.
- Si lo publicado es igual a lo local y si GitHub está al día.
- Qué deben hacer los usuarios: recargar la app.
- Qué no se pudo comprobar.
