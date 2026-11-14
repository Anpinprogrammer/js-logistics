/* Rastreo público (sin sesión): los pasos de una guía y la fecha de cada uno. Ver servicios/rastreo.js. */
import * as Rastreo from "../servicios/rastreo.js";

export async function obtener(req, res) {
  res.set("Cache-Control", "no-store");
  res.json({ rastreo: await Rastreo.rastrear(req.valido.params.guia) });
}
