/* Contraseñas con bcrypt. */
import bcrypt from "bcryptjs";

export const CLAVE_MINIMA = 10;
const RONDAS = 12;

export const hashClave = clave => bcrypt.hash(clave, RONDAS);

// Hash fijo para comparar aunque el usuario no exista: así la respuesta tarda lo mismo
// y no delata qué correos tienen cuenta.
const HASH_FALSO = bcrypt.hashSync("clave-que-no-existe-para-nadie", RONDAS);

export const compararClave = (clave, hash) => bcrypt.compare(clave, hash || HASH_FALSO);
