/* Se carga con `node --import` antes de los scripts de base (db:migrar, db:importar, db:demo).
   Le dice a config/db.js que use DATABASE_URL_MIGRACIONES (si existe) en vez de DATABASE_URL. */
process.env.JSL_CONEXION = "migraciones";
