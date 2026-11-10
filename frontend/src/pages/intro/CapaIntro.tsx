/* Capa decorativa de "La ruta de entrega". No recibe clics; el formulario real queda debajo y se puede usar. */
import { useLayoutEffect, useState } from "react";
import { LazyMotion, domAnimation, m } from "motion/react";
import { COLISION, T } from "./tiempos";

type Caja = { x: number; y: number; w: number; h: number };
type Geo = { ancho: number; alto: number; tarjeta: Caja; badge: Caja; boton: Caja };

const porDefecto = (): Geo => ({
  ancho: window.innerWidth, alto: window.innerHeight,
  tarjeta: { x: (window.innerWidth - 416) / 2, y: 140, w: 416, h: 620 },
  badge: { x: (window.innerWidth - 112) / 2, y: 176, w: 112, h: 112 },
  boton: { x: (window.innerWidth - 344) / 2, y: 628, w: 344, h: 56 }
});

function caja(el: Element | null, def: Caja): Caja {
  const r = el?.getBoundingClientRect();
  if (!r) return def;
  // El badge empieza con scale(0) y la tarjeta con scale(.965): se usa el tamaño de layout y el centro pintado.
  const w = (el as HTMLElement).offsetWidth || r.width, h = (el as HTMLElement).offsetHeight || r.height;
  return { x: r.left + r.width / 2 - w / 2, y: r.top + r.height / 2 - h / 2, w, h };
}

function medir(): Geo {
  const d = porDefecto();
  return {
    ancho: window.innerWidth, alto: window.innerHeight,
    tarjeta: caja(document.querySelector("[data-intro-card]"), d.tarjeta),
    badge: caja(document.querySelector("[data-intro-badge]"), d.badge),
    boton: caja(document.querySelector("[data-intro-button]"), d.boton)
  };
}

/** Dos rutas que llegan al badge, con la misma forma en computador y celular. */
function rutas(g: Geo): [string, string] {
  const { ancho: w, alto: h, badge: b } = g;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  return [
    `M ${-0.03 * w} ${h * 0.91} C ${w * 0.2} ${h * 0.82}, ${w * 0.2} ${h * 0.45}, ${w * 0.36} ${h * 0.42} S ${w * 0.46} ${h * 0.27}, ${cx} ${cy}`,
    `M ${w * 1.03} ${h * 0.1} C ${w * 0.85} ${h * 0.17}, ${w * 0.82} ${h * 0.55}, ${w * 0.67} ${h * 0.5} S ${w * 0.55} ${h * 0.27}, ${cx} ${cy}`
  ];
}

const CHISPAS = Array.from({ length: 22 }, (_, i) => {
  const a = (i / 22) * Math.PI * 2 + (i % 3) * 0.17;
  const d = 90 + ((i * 73) % 260);
  return { a, d, blanca: i % 3 === 0 };
});
const TELEMETRIA = ["CALI · 3.4516° N · 76.5320° W", "DESPACHANDO 2 RUTAS…"];

export default function CapaIntro() {
  const [g, setG] = useState<Geo>(porDefecto);

  useLayoutEffect(() => {
    const actualizar = () => setG(medir());
    actualizar();
    window.addEventListener("resize", actualizar);
    return () => window.removeEventListener("resize", actualizar);
  }, []);

  const cx = g.badge.x + g.badge.w / 2, cy = g.badge.y + g.badge.h / 2;
  const [ruta1, ruta2] = rutas(g);
  const diagonal = Math.hypot(g.ancho, g.alto);
  const chico = g.ancho < 800;
  const radioOnda = diagonal * 0.55;

  return <LazyMotion features={domAnimation} strict>
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {/* Fondo nocturno que se abre al choque; debajo está el login real. */}
      <m.div className="absolute inset-0 bg-[#03060a]"
        initial={{ opacity: 1 }} animate={{ opacity: 0 }}
        transition={{ delay: 1.45, duration: 0.35, ease: "easeOut" }} />

      <m.div className="absolute inset-0" style={{ transformOrigin: `${cx}px ${cy}px` }}
        initial={{ scale: 1.12 }} animate={{ scale: 1 }}
        transition={{ duration: T.camaraFin, ease: [0.65, 0, 0.25, 1] }}>
        <m.div className="absolute inset-0"
          animate={{ x: [0, 3, -4, 2, 0], y: [0, -3, 2, -2, 0] }}
          transition={{ delay: COLISION, duration: 0.23, ease: "linear" }}>

          {/* Rutas y mensajeros */}
          <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${g.ancho} ${g.alto}`} fill="none">
            <defs>
              <linearGradient id="introEstela" x1="0" x2="1">
                <stop offset="0" stopColor="#0284c7" stopOpacity="0" />
                <stop offset=".72" stopColor="#38bdf8" stopOpacity=".9" />
                <stop offset="1" stopColor="#e0f2fe" />
              </linearGradient>
              {/* Las rutas pasan por detrás de la tarjeta, como en la referencia. */}
              <mask id="introFueraTarjeta">
                <rect width="100%" height="100%" fill="white" />
                <rect x={g.tarjeta.x} y={g.tarjeta.y} width={g.tarjeta.w} height={g.tarjeta.h} rx="24" fill="black" />
              </mask>
            </defs>
            <g mask="url(#introFueraTarjeta)">
              <path d={ruta1} stroke="rgba(56,189,248,.12)" strokeWidth="1.2" strokeDasharray="4 10" />
              <path d={ruta2} stroke="rgba(56,189,248,.12)" strokeWidth="1.2" strokeDasharray="4 10" />
              <m.path d={ruta1} stroke="url(#introEstela)" strokeWidth="3" strokeLinecap="round"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ delay: 0.05, duration: COLISION - 0.05, ease: [0.4, 0, 0.7, 0.95] }} />
              <m.path d={ruta2} stroke="url(#introEstela)" strokeWidth="3" strokeLinecap="round"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ delay: 0.1, duration: COLISION - 0.1, ease: [0.4, 0, 0.7, 0.95] }} />
            </g>
          </svg>
          {[ruta1, ruta2].map((d, i) => <m.div key={i} className="absolute size-2.5 rounded-full bg-white"
            style={{ offsetPath: `path("${d}")`, boxShadow: "0 0 18px 6px rgba(56,189,248,.9)" } as React.CSSProperties}
            initial={{ offsetDistance: "0%", opacity: 0 }} animate={{ offsetDistance: "100%", opacity: [0, 1, 1] }}
            transition={{ delay: 0.05 + i * 0.05, duration: COLISION - 0.05 - i * 0.05, ease: [0.4, 0, 0.7, 0.95] }} />)}

          {/* Telemetría */}
          <m.div className="absolute font-mono text-[10px] leading-[1.8] tracking-[0.18em] text-[#7dd3fc]/75 sm:text-[12px]"
            style={{ left: chico ? 20 : 40, bottom: chico ? 28 : 36 }}
            initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.23, times: [0, 0.05, 0.79, 1], ease: "linear" }}>
            {TELEMETRIA.map((t, i) => <m.div key={t} initial={{ clipPath: "inset(0 100% 0 0)" }}
              animate={{ clipPath: "inset(0 0% 0 0)" }}
              transition={{ delay: 0.13 + i * 0.24, duration: 0.37, ease: "linear" }}>{t}</m.div>)}
          </m.div>

          {/* Destello del choque */}
          <m.div className="absolute rounded-full" style={{
            left: cx - (chico ? 320 : 520), top: cy - (chico ? 320 : 520),
            width: (chico ? 320 : 520) * 2, height: (chico ? 320 : 520) * 2,
            background: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(186,230,253,.85) 18%, rgba(56,189,248,.35) 40%, transparent 70%)",
            mixBlendMode: "screen"
          }} initial={{ scale: 0.12, opacity: 0 }}
            animate={{ scale: [0.12, 1], opacity: [0, 1, 0] }}
            transition={{ delay: T.destelloInicio, duration: 0.47, times: [0, 0.2, 1], ease: "easeOut" }} />

          {/* Onda expansiva */}
          <m.div className="absolute rounded-full border-2 border-sky-300/90" style={{
            left: cx - radioOnda, top: cy - radioOnda, width: radioOnda * 2, height: radioOnda * 2,
            boxShadow: "0 0 40px 6px rgba(56,189,248,.45), inset 0 0 40px 6px rgba(56,189,248,.25)"
          }} initial={{ scale: 0, opacity: 1 }} animate={{ scale: 1, opacity: 0 }}
            transition={{ delay: COLISION, duration: 1.16, ease: "easeOut" }} />

          {/* Chispas */}
          {CHISPAS.map((c, i) => {
            const x = cx + Math.cos(c.a) * c.d, y = cy + Math.sin(c.a) * c.d;
            const cola = 18;
            return <m.line key={i} x1={cx} y1={cy} x2={cx} y2={cy}
              stroke={c.blanca ? "#fff" : "#7dd3fc"} strokeWidth="2" strokeLinecap="round"
              initial={{ opacity: 1 }} animate={{ x1: x, y1: y, x2: x - Math.cos(c.a) * cola, y2: y - Math.sin(c.a) * cola, opacity: 0 }}
              transition={{ delay: COLISION, duration: 0.76, ease: "easeOut" }} />;
          })}
        </m.div>
      </m.div>

      {/* Trazo del borde de la tarjeta */}
      <svg className="absolute overflow-visible" style={{ left: g.tarjeta.x, top: g.tarjeta.y }}
        width={g.tarjeta.w} height={g.tarjeta.h} fill="none">
        {(() => {
          const w = g.tarjeta.w, h = g.tarjeta.h, r = 24, mit = w / 2;
          const izquierda = `M ${mit} 1 H ${r} A ${r} ${r} 0 0 0 1 ${r} V ${h - r} A ${r} ${r} 0 0 0 ${r} ${h - 1} H ${mit}`;
          const derecha = `M ${mit} 1 H ${w - r} A ${r} ${r} 0 0 1 ${w - 1} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h - 1} H ${mit}`;
          return [izquierda, derecha].map((d, i) => <m.path key={i} d={d}
            stroke="#7dd3fc" strokeWidth="2" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 6px rgba(125,211,252,.9))" }}
            initial={{ pathLength: 0, opacity: 1 }} animate={{ pathLength: 1, opacity: [1, 1, 0] }}
            transition={{ delay: T.trazoInicio, duration: 1.1, times: [0, 0.6, 1], ease: [0.65, 0, 0.25, 1] }} />);
        })()}
      </svg>

      {/* La marca blanca nace del choque y se encoge hasta el badge */}
      <m.img src="/marca-blanca.png" alt="" className="absolute select-none"
        style={{ left: cx - g.badge.w / 2, top: cy - g.badge.h / 2, width: g.badge.w, height: g.badge.h,
          filter: "drop-shadow(0 0 18px rgba(125,211,252,.9))" }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, chico ? 2.1 : 2.3, chico ? 2.1 : 2.3, 1, 1], opacity: [0, 1, 1, 1, 0] }}
        transition={{ delay: COLISION, duration: 1, times: [0, 0.18, 0.6, 0.78, 1], ease: "easeOut" }} />

      {/* Barra "CARGANDO RUTA" que luego es el botón real */}
      <m.div className="absolute" style={{ left: g.boton.x, top: g.boton.y, width: g.boton.w, height: g.boton.h }}
        initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ delay: T.barraInicio, duration: 0.85, times: [0, 0.05, 0.88, 1], ease: "linear" }}>
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-sky-400/15" />
        <m.div className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-gradient-to-r from-[#0284c7] to-[#22d3ee]"
          initial={{ width: "0%" }} animate={{ width: "100%" }}
          transition={{ delay: T.barraInicio, duration: 0.8, ease: [0.3, 0, 0.2, 1] }} />
        <span className="absolute inset-x-0 top-1/2 -translate-y-[22px] font-mono text-[11px] tracking-[0.12em] text-sky-300/85">CARGANDO RUTA</span>
        <span className="absolute right-0 top-1/2 -translate-y-[22px] font-mono text-[11px] tracking-[0.12em] text-sky-300/85">100%</span>
      </m.div>
    </div>
  </LazyMotion>;
}
