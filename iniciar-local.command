#!/bin/bash
# Doble clic para abrir la app en tu Mac (http://localhost:5173). Cierra esta ventana para detenerla.
cd "$(dirname "$0")/app" || exit 1
( sleep 1; open "http://localhost:5173" ) &
echo "JS Logistics corriendo en http://localhost:5173 — cierra esta ventana para detenerla."
python3 -m http.server 5173 --bind 127.0.0.1
