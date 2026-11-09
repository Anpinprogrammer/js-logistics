# Guía para agentes de IA

Las instrucciones para cualquier agente (Claude Code, Codex, Cursor, Copilot…) están en **[CLAUDE.md](CLAUDE.md)**. Léelo completo antes de hacer cambios, y [`docs/ESTADO.md`](docs/ESTADO.md) (memoria del proyecto: decisiones, trampas y últimos cambios), y después el `CLAUDE.md` de la carpeta en la que vayas a trabajar:

- [`backend/CLAUDE.md`](backend/CLAUDE.md): API en Node.js + Express (MVC) + PostgreSQL.
- [`frontend/CLAUDE.md`](frontend/CLAUDE.md): app de oficina y mensajeros en React + TypeScript + Tailwind.

En resumen:
- Se trabaja en `backend/` y `frontend/`. `app/` y los archivos de Firebase son el sistema viejo, que sigue en producción: no se borran ni se amplían.
- Todo en español: código del dominio, textos, commits y PR.
- El servidor decide permisos y cálculos de dinero. Dinero en pesos enteros y fechas en hora de Colombia.
- Una rama y un PR por cambio. Nunca push directo a `main`.
