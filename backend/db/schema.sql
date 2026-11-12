-- Esquema de JS Logistics en PostgreSQL (Supabase).
-- Sale de docs/datos.md (colecciones de Firestore). Convenciones:
--   * Dinero: pesos colombianos como BIGINT (sin decimales).
--   * Fechas: TIMESTAMPTZ. Los "días" de negocio se calculan en hora de Colombia (America/Bogota).
--   * IDs: TEXT, para conservar los IDs de Firestore al migrar. Los nuevos los genera la API.
--   * Los saldos no se guardan: se calculan (igual que hoy en la app).
-- Se puede correr varias veces: todo usa IF NOT EXISTS.

-- ---------- Personal, clientes y cuentas ----------

CREATE TABLE IF NOT EXISTS clientes (
  id          TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL,
  telefono    TEXT NOT NULL DEFAULT '',
  direccion_recogida TEXT NOT NULL DEFAULT '',
  tarifa      BIGINT NOT NULL DEFAULT 0 CHECK (tarifa >= 0),   -- domicilio por defecto
  creado      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS direccion_recogida TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS clientes_nombre_idx ON clientes (lower(nombre));

CREATE TABLE IF NOT EXISTS mensajeros (            -- "Personal"
  id          TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL,
  telefono    TEXT NOT NULL DEFAULT '',
  tipo        TEXT NOT NULL DEFAULT 'mensajero'
              CHECK (tipo IN ('mensajero', 'dueno', 'oficina', 'patinador', 'empresa')),
  tarifa      BIGINT NOT NULL DEFAULT 0 CHECK (tarifa >= 0),   -- pago por día de los tipos con pago fijo
  activo      BOOLEAN NOT NULL DEFAULT true,
  creado      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cuentas de la app. Reemplaza usuarios + admins + vinculos de Firestore.
CREATE TABLE IF NOT EXISTS usuarios (
  id           TEXT PRIMARY KEY,                   -- al migrar: el uid de Firebase Auth
  email        TEXT NOT NULL,
  nombre       TEXT NOT NULL DEFAULT '',
  rol          TEXT NOT NULL CHECK (rol IN ('admin', 'asistente', 'mensajero', 'cliente', 'patinador')),
  clave_hash   TEXT,                               -- bcrypt; NULL = debe crear su contraseña
  cliente_id   TEXT REFERENCES clientes(id) ON DELETE SET NULL,     -- rol cliente
  mensajero_id TEXT REFERENCES mensajeros(id) ON DELETE SET NULL,   -- vínculo con su ficha en Personal
  activo       BOOLEAN NOT NULL DEFAULT true,
  version_sesion INTEGER NOT NULL DEFAULT 0,       -- subirlo invalida los JWT ya emitidos
  ultimo_ingreso TIMESTAMPTZ,
  creado       TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (rol <> 'cliente' OR cliente_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_uq ON usuarios (lower(email));

-- Estado del acceso sin duplicar datos: si no tiene contraseña está pendiente de activación.
-- El token de activación no vive aquí: se guarda hasheado y con su expiración en `enlaces`.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS status TEXT GENERATED ALWAYS AS (
  CASE WHEN NOT activo THEN 'disabled'
       WHEN clave_hash IS NULL THEN 'pending_activation'
       ELSE 'active' END
) STORED;

-- Enlaces de un solo uso que se mandan por correo (activar la cuenta y reiniciar la contraseña).
-- Se guarda solo el hash del token: el token en claro viaja únicamente en el correo.
CREATE TABLE IF NOT EXISTS enlaces (
  id         TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo       TEXT NOT NULL CHECK (tipo IN ('activacion', 'clave')),
  token_hash TEXT NOT NULL UNIQUE,
  expira     TIMESTAMPTZ NOT NULL,
  usado      TIMESTAMPTZ,
  creado     TIMESTAMPTZ NOT NULL DEFAULT now(),
  creado_por TEXT REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS enlaces_usuario_idx ON enlaces (usuario_id, tipo, creado DESC);

CREATE TABLE IF NOT EXISTS cuentas (               -- cuentas internas: JS Envíos, MT Store, Base de JS
  id     TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo   TEXT NOT NULL CHECK (tipo IN ('socio', 'base')),
  creado TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Configuración ----------

-- Contadores sin huecos (el consecutivo de guías). Se sube con UPDATE ... RETURNING dentro de la transacción
-- que crea el pedido; una SEQUENCE dejaría huecos si la transacción falla.
CREATE TABLE IF NOT EXISTS contadores (
  nombre TEXT PRIMARY KEY,
  n      BIGINT NOT NULL DEFAULT 0 CHECK (n >= 0)
);
INSERT INTO contadores (nombre, n) VALUES ('guia', 0) ON CONFLICT DO NOTHING;

-- Valores sueltos: 'caja' → {"corte": "<fecha del último arqueo>"}
CREATE TABLE IF NOT EXISTS ajustes (
  clave       TEXT PRIMARY KEY,
  valor       JSONB NOT NULL,
  actualizado TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Operación ----------

CREATE TABLE IF NOT EXISTS pedidos (
  guia            TEXT PRIMARY KEY,                -- JS-00001
  n               BIGINT NOT NULL UNIQUE,
  -- aceptado: guía de una solicitud, asignada pero sin recoger (el mensajero no ha tomado la foto del paquete);
  -- pendiente: en ruta, por entregar; entregado o devuelto: cerrada. Ver la migración al final de las solicitudes.
  estado          TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('aceptado', 'pendiente', 'entregado', 'devuelto')),
  creado          TIMESTAMPTZ NOT NULL DEFAULT now(),          -- salida
  creado_por      TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  mensajero_id    TEXT REFERENCES mensajeros(id) ON DELETE RESTRICT,
  cliente_id      TEXT REFERENCES clientes(id) ON DELETE RESTRICT,   -- NULL hasta que la oficina asigna remitente
  valor_servicio  BIGINT NOT NULL DEFAULT 0 CHECK (valor_servicio >= 0),  -- domicilio
  a_cobrar        BIGINT NOT NULL DEFAULT 0 CHECK (a_cobrar >= 0),
  -- entrega o devolución
  entregado       TIMESTAMPTZ,
  destinatario    TEXT NOT NULL DEFAULT '',
  valor_cobrado   BIGINT NOT NULL DEFAULT 0 CHECK (valor_cobrado >= 0),
  metodo          TEXT NOT NULL DEFAULT '' CHECK (metodo IN ('', 'efectivo', 'transf_js', 'transf_cliente', 'devuelto')),
  cuenta_js       TEXT NOT NULL DEFAULT '' CHECK (cuenta_js IN ('', 'nequi', 'bancolombia')),
  dif_cobro       BIGINT NOT NULL DEFAULT 0,
  dif_revisada    BOOLEAN NOT NULL DEFAULT false,
  entrego_uid     TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  motivo_dev      TEXT NOT NULL DEFAULT '' CHECK (motivo_dev IN ('', 'no_contesta', 'direccion', 'rechazo', 'reprogramar', 'otro')),
  nota_dev        TEXT NOT NULL DEFAULT '',
  cobrar_dev      BOOLEAN NOT NULL DEFAULT false,
  -- prenda de cambio
  cambio          BOOLEAN NOT NULL DEFAULT false,
  cambio_recibido TIMESTAMPTZ,
  cambio_confirmo TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  -- flete pagado por el mensajero
  gasto           BIGINT NOT NULL DEFAULT 0 CHECK (gasto >= 0),
  gasto_nota      TEXT NOT NULL DEFAULT '',
  -- domicilio pagado aparte por el cliente
  domi_pagado     BOOLEAN NOT NULL DEFAULT false,
  domi_pago_medio TEXT CHECK (domi_pago_medio IN ('efectivo', 'nequi', 'bancolombia')),
  domi_pago_valor BIGINT CHECK (domi_pago_valor >= 0),
  domi_pago_fecha TIMESTAMPTZ,
  domi_pago_uid   TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  fotos_borradas  BOOLEAN NOT NULL DEFAULT false,
  actualizado     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (estado IN ('aceptado', 'pendiente') OR entregado IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS pedidos_mensajero_idx ON pedidos (mensajero_id, creado DESC);
CREATE INDEX IF NOT EXISTS pedidos_cliente_idx   ON pedidos (cliente_id, creado DESC);
CREATE INDEX IF NOT EXISTS pedidos_estado_idx    ON pedidos (estado, creado DESC);
CREATE INDEX IF NOT EXISTS pedidos_creado_idx    ON pedidos (creado DESC);

CREATE TABLE IF NOT EXISTS pedido_intentos (       -- intentos fallidos (pedidos.intentos[] en Firestore)
  id     BIGSERIAL PRIMARY KEY,
  guia   TEXT NOT NULL REFERENCES pedidos(guia) ON DELETE CASCADE,
  fecha  TIMESTAMPTZ NOT NULL DEFAULT now(),
  motivo TEXT NOT NULL CHECK (motivo IN ('no_contesta', 'direccion', 'rechazo', 'reprogramar', 'otro')),
  nota   TEXT NOT NULL DEFAULT '',
  por    TEXT REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS pedido_intentos_guia_idx ON pedido_intentos (guia, fecha);

-- Fotos y firmas: el archivo va en Supabase Storage y aquí solo la ruta.
-- tipo: mini (miniatura), salida (foto al crear la guía), entrega, firma, previa (pruebas de entregas anteriores)
CREATE TABLE IF NOT EXISTS pedido_archivos (
  id      BIGSERIAL PRIMARY KEY,
  guia    TEXT NOT NULL REFERENCES pedidos(guia) ON DELETE CASCADE,
  tipo    TEXT NOT NULL CHECK (tipo IN ('mini', 'salida', 'entrega', 'firma', 'previa')),
  ruta    TEXT NOT NULL,                           -- ruta dentro del bucket
  creado  TIMESTAMPTZ NOT NULL DEFAULT now(),
  por     TEXT REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS pedido_archivos_guia_idx ON pedido_archivos (guia, tipo);

-- ---------- Dinero ----------

CREATE TABLE IF NOT EXISTS movimientos (           -- cuenta de cada cliente
  id           TEXT PRIMARY KEY,
  cliente_id   TEXT NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  tipo         TEXT NOT NULL CHECK (tipo IN ('cargo', 'abono', 'pago_de_cliente', 'pago_a_cliente', 'compra_cliente', 'ganancia')),
  valor        BIGINT NOT NULL CHECK (valor > 0),
  medio        TEXT CHECK (medio IN ('efectivo', 'nequi', 'bancolombia')),
  nota         TEXT NOT NULL DEFAULT '',
  fecha        TIMESTAMPTZ NOT NULL DEFAULT now(),
  por_uid      TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  por_nombre   TEXT NOT NULL DEFAULT '',
  medio_antes  TEXT CHECK (medio_antes IN ('efectivo', 'nequi', 'bancolombia')),
  medio_cambio TIMESTAMPTZ,
  reverso_de   TEXT REFERENCES movimientos(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS movimientos_cliente_idx ON movimientos (cliente_id, fecha DESC);
CREATE INDEX IF NOT EXISTS movimientos_fecha_idx   ON movimientos (fecha DESC);

CREATE TABLE IF NOT EXISTS recaudos (              -- dinero que entrega un mensajero
  id           TEXT PRIMARY KEY,
  mensajero_id TEXT NOT NULL REFERENCES mensajeros(id) ON DELETE RESTRICT,
  valor        BIGINT NOT NULL CHECK (valor > 0),
  medio        TEXT NOT NULL CHECK (medio IN ('efectivo', 'nequi', 'bancolombia')),
  nota         TEXT NOT NULL DEFAULT '',
  fecha        TIMESTAMPTZ NOT NULL DEFAULT now(),
  por_uid      TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  por_nombre   TEXT NOT NULL DEFAULT '',
  medio_antes  TEXT CHECK (medio_antes IN ('efectivo', 'nequi', 'bancolombia')),
  medio_cambio TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS recaudos_mensajero_idx ON recaudos (mensajero_id, fecha DESC);

CREATE TABLE IF NOT EXISTS liquidaciones (         -- cierre de período de un mensajero
  id              TEXT PRIMARY KEY,                -- {mensajeroId}_{fecha}
  mensajero_id    TEXT NOT NULL REFERENCES mensajeros(id) ON DELETE RESTRICT,
  desde           TIMESTAMPTZ,
  fecha           TIMESTAMPTZ NOT NULL,
  dia             DATE NOT NULL,
  entregas        INTEGER NOT NULL DEFAULT 0,
  guias           TEXT[],                          -- guías del período; NULL en liquidaciones viejas (se cuentan por hora)
  efectivo        BIGINT NOT NULL DEFAULT 0,
  base            BIGINT NOT NULL DEFAULT 0,
  gastos          BIGINT NOT NULL DEFAULT 0,
  anterior        BIGINT NOT NULL DEFAULT 0,
  recibido_antes  BIGINT NOT NULL DEFAULT 0,
  entrega_final   BIGINT NOT NULL DEFAULT 0,
  recibido        BIGINT NOT NULL DEFAULT 0,
  debe            BIGINT NOT NULL DEFAULT 0,
  adelanto        BIGINT NOT NULL DEFAULT 0,
  transf_js       BIGINT NOT NULL DEFAULT 0,
  transf_cli      BIGINT NOT NULL DEFAULT 0,
  sueldo          BIGINT NOT NULL DEFAULT 0,
  en_ruta         INTEGER NOT NULL DEFAULT 0,
  ajuste          BIGINT NOT NULL DEFAULT 0,      -- ajuste manual del período (app.js lo suma al resultado)
  por_uid         TEXT REFERENCES usuarios(id) ON DELETE SET NULL
);
-- Bases creadas con versiones anteriores de este archivo (ver "Actualizar la base" en README.md):
ALTER TABLE liquidaciones ADD COLUMN IF NOT EXISTS ajuste BIGINT NOT NULL DEFAULT 0;
-- guias pasó a aceptar NULL: en la app, una liquidación sin lista de guías es de antes de que existiera la lista
-- y sus entregas se cuentan por hora (periodoMensajero). Una lista vacía con entregas solo pudo salir de una
-- importación anterior que no distinguía los dos casos.
ALTER TABLE liquidaciones ALTER COLUMN guias DROP NOT NULL;
ALTER TABLE liquidaciones ALTER COLUMN guias DROP DEFAULT;
UPDATE liquidaciones SET guias = NULL WHERE guias = '{}' AND entregas > 0;
CREATE INDEX IF NOT EXISTS liquidaciones_mensajero_idx ON liquidaciones (mensajero_id, fecha DESC);

CREATE TABLE IF NOT EXISTS cajamovs (              -- caja general y cajas de oficina
  id             TEXT PRIMARY KEY,
  tipo           TEXT NOT NULL,                    -- entra | sale | base | entrega | marca
  cat            TEXT NOT NULL CHECK (cat IN ('inicial', 'otro_entra', 'gasto', 'arriendo', 'otro', 'base', 'adelanto',
                                              'devolucion', 'sueldo', 'interna', 'oficina', 'sobrante', 'arqueo')),
  valor          BIGINT NOT NULL DEFAULT 0 CHECK (valor >= 0),
  medio          TEXT CHECK (medio IN ('efectivo', 'nequi', 'bancolombia')),
  concepto       TEXT NOT NULL DEFAULT '',
  fecha          TIMESTAMPTZ NOT NULL DEFAULT now(),
  persona_id     TEXT REFERENCES mensajeros(id) ON DELETE RESTRICT,  -- Personal
  persona_uid    TEXT REFERENCES usuarios(id) ON DELETE SET NULL,    -- cuenta del asistente (caja de oficina)
  cuenta_id      TEXT REFERENCES cuentas(id) ON DELETE RESTRICT,     -- cat = interna
  semana         TEXT,                                               -- cat = sueldo
  adelanto_id    TEXT REFERENCES cajamovs(id) ON DELETE SET NULL,    -- cat = devolucion
  devuelto       BIGINT NOT NULL DEFAULT 0,                          -- cat = adelanto
  de_liquidacion TEXT,                                               -- cat = adelanto: id de la liquidación de la que salió
  inicial        BOOLEAN NOT NULL DEFAULT false,                     -- cat = interna: saldo del empalme
  nivel          BOOLEAN NOT NULL DEFAULT false,                     -- cat = oficina: ajuste de cuenta compartida
  arqueo_id      TEXT,
  extra          JSONB NOT NULL DEFAULT '{}'::jsonb,                 -- esperado/contado/oficina de la marca de arqueo, etc.
  por_uid        TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  por_nombre     TEXT NOT NULL DEFAULT '',
  medio_antes    TEXT CHECK (medio_antes IN ('efectivo', 'nequi', 'bancolombia')),
  medio_cambio   TIMESTAMPTZ
);
-- de_liquidacion era sí/no; en la app es el id de la liquidación (para reabrirla o quitar el adelanto).
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'cajamovs' AND column_name = 'de_liquidacion') = 'boolean' THEN
    ALTER TABLE cajamovs ALTER COLUMN de_liquidacion DROP DEFAULT;
    ALTER TABLE cajamovs ALTER COLUMN de_liquidacion DROP NOT NULL;
    ALTER TABLE cajamovs ALTER COLUMN de_liquidacion TYPE TEXT
      USING (CASE WHEN de_liquidacion THEN COALESCE(NULLIF(extra->>'liquidacionId', ''), 'importado') END);
    UPDATE cajamovs SET extra = extra - 'liquidacionId' WHERE extra ? 'liquidacionId';
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS cajamovs_liquidacion_idx ON cajamovs (de_liquidacion) WHERE de_liquidacion IS NOT NULL;
CREATE INDEX IF NOT EXISTS cajamovs_fecha_idx   ON cajamovs (fecha DESC);
CREATE INDEX IF NOT EXISTS cajamovs_cat_idx     ON cajamovs (cat, fecha DESC);
CREATE INDEX IF NOT EXISTS cajamovs_persona_idx ON cajamovs (persona_id, fecha DESC);

CREATE TABLE IF NOT EXISTS jornadas (              -- días trabajados con pago fijo
  id         TEXT PRIMARY KEY,                     -- {personaId}_{AAAA-MM-DD} o {personaId}_previo_{semana}
  persona_id TEXT NOT NULL REFERENCES mensajeros(id) ON DELETE CASCADE,
  dia        DATE,
  semana     TEXT,
  valor      BIGINT NOT NULL DEFAULT 0 CHECK (valor >= 0),
  previo     BOOLEAN NOT NULL DEFAULT false,
  nota       TEXT NOT NULL DEFAULT ''
);
ALTER TABLE jornadas ADD COLUMN IF NOT EXISTS nota TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS jornadas_persona_idx ON jornadas (persona_id, dia);

-- ---------- Auditoría y recuperación ----------

CREATE TABLE IF NOT EXISTS historial (             -- una fila por cambio (en Firestore era un documento por día y persona)
  id        BIGSERIAL PRIMARY KEY,
  fecha     TIMESTAMPTZ NOT NULL DEFAULT now(),
  uid       TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  accion    TEXT NOT NULL,                         -- texto legible: "Entregó JS-00012: cobró $ 25.000…"
  tabla     TEXT,
  registro  TEXT,
  datos     JSONB
);
CREATE INDEX IF NOT EXISTS historial_fecha_idx ON historial (fecha DESC);
CREATE INDEX IF NOT EXISTS historial_uid_idx   ON historial (uid, fecha DESC);

CREATE TABLE IF NOT EXISTS papelera (              -- copia de lo borrado, para poder recuperarlo
  id       BIGSERIAL PRIMARY KEY,
  tabla    TEXT NOT NULL,
  registro TEXT NOT NULL,
  datos    JSONB NOT NULL,
  grupo    TEXT,                                   -- borrados que van juntos (un pedido y sus fotos)
  fecha    TIMESTAMPTZ NOT NULL DEFAULT now(),
  uid      TEXT REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS papelera_fecha_idx ON papelera (fecha DESC);

-- ---------- Solicitudes de envío (formulario público de la landing) ----------
-- Un visitante pide una recogida sin tener cuenta. La oficina la revisa: la acepta poniendo el valor del domicilio
-- (se le confirma al cliente por WhatsApp o desde su portal) o la rechaza; cuando el cliente está de acuerdo se asigna
-- a un mensajero y se crea la guía. Estados: pendiente → cotizada → confirmada → asignada, o rechazada.
CREATE TABLE IF NOT EXISTS solicitudes (
  id                    TEXT PRIMARY KEY,
  estado                TEXT NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente', 'cotizada', 'confirmada', 'asignada', 'rechazada')),
  nombre                TEXT NOT NULL,
  telefono              TEXT NOT NULL,
  email                 TEXT NOT NULL,
  direccion_recogida    TEXT NOT NULL,
  paquetes              INTEGER NOT NULL CHECK (paquetes BETWEEN 1 AND 100),
  peso_kg               NUMERIC(6,1) CHECK (peso_kg IS NULL OR (peso_kg > 0 AND peso_kg <= 1000)),
  destinatario_nombre   TEXT NOT NULL,
  destinatario_telefono TEXT NOT NULL DEFAULT '',
  direccion_entrega     TEXT NOT NULL,
  valor                 BIGINT CHECK (valor IS NULL OR valor >= 0),   -- domicilio que puso la oficina
  motivo_rechazo        TEXT NOT NULL DEFAULT '',
  cliente_id            TEXT REFERENCES clientes(id) ON DELETE SET NULL,
  mensajero_id          TEXT REFERENCES mensajeros(id) ON DELETE SET NULL,
  guia                  TEXT REFERENCES pedidos(guia) ON DELETE SET NULL,
  revisado_por          TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  -- true solo cuando el cliente aceptó la propuesta desde su portal (no cuando la oficina confirmó por WhatsApp).
  confirmada_por_cliente BOOLEAN NOT NULL DEFAULT false,
  creado                TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado           TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- De dónde llegó: 'publico' (formulario de la landing, sin sesión) o 'portal' (un cliente con cuenta, desde su portal;
-- en ese caso cliente_id es su ficha desde el principio).
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'publico' CHECK (origen IN ('publico', 'portal'));
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS confirmada_por_cliente BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS solicitudes_estado_idx ON solicitudes (estado, creado DESC);
CREATE INDEX IF NOT EXISTS solicitudes_creado_idx ON solicitudes (creado DESC);
CREATE INDEX IF NOT EXISTS solicitudes_origen_creado_idx ON solicitudes (origen, creado DESC);
CREATE INDEX IF NOT EXISTS solicitudes_cliente_idx ON solicitudes (cliente_id, creado DESC);
CREATE INDEX IF NOT EXISTS solicitudes_guia_idx ON solicitudes (guia) WHERE guia IS NOT NULL;

-- ---------- Estado "aceptado" (por recoger) — 2026-11-11 ----------
-- Una guía creada desde una solicitud nace "aceptado" y solo pasa a "pendiente" (en ruta) cuando el mensajero
-- la recoge y le toma la foto (POST /pedidos/:guia/recogida). Las bases creadas antes tienen los CHECK viejos:
-- se cambian una sola vez (si ya incluyen 'aceptado', no se tocan).
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
           WHERE conrelid = 'pedidos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%pendiente%'
             AND pg_get_constraintdef(oid) NOT LIKE '%aceptado%'
  LOOP
    EXECUTE format('ALTER TABLE pedidos DROP CONSTRAINT %I', c.conname);
    IF c.def LIKE '%entregado IS NOT NULL%' THEN
      ALTER TABLE pedidos ADD CONSTRAINT pedidos_check CHECK (estado IN ('aceptado', 'pendiente') OR entregado IS NOT NULL);
    ELSE
      ALTER TABLE pedidos ADD CONSTRAINT pedidos_estado_check CHECK (estado IN ('aceptado', 'pendiente', 'entregado', 'devuelto'));
    END IF;
  END LOOP;
END $$;
-- ---------- Reintentos de pedidos devueltos — 2026-11-12 ----------
-- Un devuelto nuevo queda "por_definir" hasta que el mensajero diga dónde dejó el paquete: 'cliente' (se lo devolvió),
-- 'oficina' (lo llevó a JS) o 'reintento' (hace el reintento él mismo). '' = devuelto de antes del cambio: no entra al flujo.
-- El reintento es una guía NUEVA que apunta a la original (reintento_de); la original conserva su devolución y su cobro.
-- reintento_pedido: cuándo el cliente pidió el reintento desde su portal (la oficina lo asigna a un mensajero).
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS destino_dev TEXT NOT NULL DEFAULT '' CHECK (destino_dev IN ('', 'por_definir', 'cliente', 'oficina', 'reintento'));
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS reintento_de TEXT REFERENCES pedidos(guia) ON DELETE SET NULL;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS reintento_pedido TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS pedidos_reintento_de_idx ON pedidos (reintento_de) WHERE reintento_de IS NOT NULL;

-- Datos de antes del cambio (una sola vez, marcado en ajustes): las guías que salieron de una solicitud, siguen
-- por entregar y no tienen foto de salida ni intentos nunca se recogieron con foto; pasan a "aceptado" para que el
-- mensajero las vea en "Por recoger". Si se vuelve a correr db:migrar no se repite.
DO $$
BEGIN
  INSERT INTO ajustes (clave, valor) VALUES ('migracion_aceptado', jsonb_build_object('fecha', now())) ON CONFLICT (clave) DO NOTHING;
  IF FOUND THEN
    UPDATE pedidos p SET estado = 'aceptado', actualizado = now()
    WHERE p.estado = 'pendiente'
      AND EXISTS (SELECT 1 FROM solicitudes s WHERE s.guia = p.guia)
      AND NOT EXISTS (SELECT 1 FROM pedido_archivos a WHERE a.guia = p.guia AND a.tipo = 'salida')
      AND NOT EXISTS (SELECT 1 FROM pedido_intentos i WHERE i.guia = p.guia);
  END IF;
END $$;

-- ---------- Rol patinador y su caja — 2026-11-12 ----------
-- El patinador recorre una ruta que no se registra en el sistema y recoge paquetes; en algunos puntos un cliente le
-- paga en efectivo (domicilios u otro concepto). Cada pago lo anota él mismo desde el celular y suma a su caja.
-- La cuenta (rol 'patinador') se vincula con su ficha de Personal (tipo 'patinador') por usuarios.mensajero_id.
-- Las bases creadas antes tienen el CHECK de rol sin 'patinador': se cambia una sola vez.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'usuarios'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%mensajero%'
             AND pg_get_constraintdef(oid) NOT LIKE '%patinador%'
  LOOP
    EXECUTE format('ALTER TABLE usuarios DROP CONSTRAINT %I', c.conname);
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN ('admin', 'asistente', 'mensajero', 'cliente', 'patinador'));
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS caja_patinador (        -- dinero que recibe un patinador en su ruta
  id           TEXT PRIMARY KEY,
  mensajero_id TEXT NOT NULL REFERENCES mensajeros(id) ON DELETE RESTRICT,   -- su ficha en Personal
  cliente_id   TEXT NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,     -- quién le pagó
  concepto     TEXT NOT NULL CHECK (length(concepto) BETWEEN 1 AND 80),
  valor        BIGINT NOT NULL CHECK (valor > 0),
  fecha        TIMESTAMPTZ NOT NULL DEFAULT now(),                           -- hora del servidor, no la del celular
  por_uid      TEXT REFERENCES usuarios(id) ON DELETE SET NULL
);
-- Cada pago que anota el patinador es dinero que el cliente abona a su cuenta (un `abono`, "A favor", en verde): igual
-- que cuando el mensajero entrega y cobra. No mueve la caja de JS: entra a la caja cuando el patinador se lo entrega a la
-- oficina (un `recaudo`). movimiento_id enlaza el pago con ese abono.
ALTER TABLE caja_patinador ADD COLUMN IF NOT EXISTS movimiento_id TEXT REFERENCES movimientos(id) ON DELETE SET NULL;
-- Los pagos anotados antes de este cambio no tenían abono: se crean una sola vez (marcado en ajustes, para que un abono que
-- administración borre después no se vuelva a crear al correr db:migrar otra vez).
DO $$
BEGIN
  INSERT INTO ajustes (clave, valor) VALUES ('migracion_abonos_patinador', jsonb_build_object('fecha', now())) ON CONFLICT (clave) DO NOTHING;
  IF FOUND THEN
    INSERT INTO movimientos (id, cliente_id, tipo, valor, nota, fecha, por_uid, por_nombre)
      SELECT 'pat_' || r.id, r.cliente_id, 'abono', r.valor,
             left('Recibido por ' || coalesce(nullif(u.nombre, ''), m.nombre) || ': ' || r.concepto, 300),
             r.fecha, r.por_uid, coalesce(u.nombre, m.nombre)
      FROM caja_patinador r JOIN mensajeros m ON m.id = r.mensajero_id LEFT JOIN usuarios u ON u.id = r.por_uid
      WHERE r.movimiento_id IS NULL
      ON CONFLICT (id) DO NOTHING;
    UPDATE caja_patinador r SET movimiento_id = 'pat_' || r.id
      WHERE r.movimiento_id IS NULL AND EXISTS (SELECT 1 FROM movimientos x WHERE x.id = 'pat_' || r.id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS caja_patinador_mensajero_idx ON caja_patinador (mensajero_id, fecha DESC);
CREATE INDEX IF NOT EXISTS caja_patinador_cliente_idx ON caja_patinador (cliente_id);

-- ---------- Supabase: cerrar la API pública ----------
-- Supabase expone las tablas de "public" por su Data API (PostgREST) con la anon key.
-- Toda la app pasa por Express, que se conecta con el rol dueño de las tablas (no lo afecta RLS).
-- Activar RLS sin políticas deja la Data API sin acceso a nada. En un Postgres normal no cambia nada.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['clientes', 'mensajeros', 'usuarios', 'enlaces', 'cuentas', 'contadores', 'ajustes', 'pedidos',
    'pedido_intentos', 'pedido_archivos', 'movimientos', 'recaudos', 'liquidaciones', 'cajamovs', 'jornadas',
    'historial', 'papelera', 'solicitudes', 'caja_patinador']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ---------- Índices de rendimiento (2026-11-12) ----------
-- Lista del mensajero y carga por cursor (ORDER BY n DESC con el filtro de mensajero).
CREATE INDEX IF NOT EXISTS pedidos_mensajero_n_idx ON pedidos (mensajero_id, n DESC);
-- Filtros por hora de entrega o devolución (entregadoDesde/Hasta y el filtro de día de Pedidos).
CREATE INDEX IF NOT EXISTS pedidos_entregado_idx ON pedidos (entregado DESC) WHERE entregado IS NOT NULL;
-- Guías sin remitente (contador de la oficina y filtro "Sin remitente").
CREATE INDEX IF NOT EXISTS pedidos_sin_remitente_idx ON pedidos (n DESC) WHERE cliente_id IS NULL;
