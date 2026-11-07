/* Valida body, query y params con esquemas de Zod. Lo validado (ya limpio y con tipos) queda en
   req.valido.body / req.valido.query / req.valido.params; los campos que no estén en el esquema se descartan. */
import { invalido } from "../helpers/errores.js";

export const validar = esquemas => (req, _res, next) => {
  req.valido = {};
  for (const parte of ["params", "query", "body"]) {
    if (!esquemas[parte]) continue;
    const r = esquemas[parte].safeParse(req[parte] ?? {});
    if (!r.success) {
      const detalles = r.error.issues.map(i => ({ campo: i.path.join("."), mensaje: i.message }));
      throw invalido("Hay datos inválidos en la solicitud", detalles);
    }
    req.valido[parte] = r.data;
  }
  next();
};
