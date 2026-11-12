import "./DashboardSkeleton.css";

const BARRAS = [45, 70, 55, 90, 65, 80, 50, 75, 95, 60, 85, 70, 40, 65];

function Linea({ ancho = "70%" }: { ancho?: string }) {
  return <span className="ds-linea" style={{ width: ancho }} />;
}

function Filas({ cantidad }: { cantidad: number }) {
  return <div className="ds-filas">{Array.from({ length: cantidad }, (_, i) => (
    <div className="ds-fila" key={i}><Linea ancho="42%" /><Linea ancho="25%" /></div>
  ))}</div>;
}

/** Misma distribución y cortes que el panel real; no depende de datos ni de la sesión. */
export function DashboardSkeleton() {
  return <div className="dashboard-skeleton" role="status" aria-busy="true" aria-label="Cargando panel de control">
    <div className="ds-contenido" aria-hidden="true">
      <div className="ds-cabecera">
        <div><Linea ancho="14rem" /><Linea ancho="11rem" /></div>
        <div className="ds-accion"><Linea ancho="100%" /></div>
      </div>
      <div className="ds-kpis">{[0, 1, 2, 3].map(i => (
        <div className="ds-tarjeta ds-kpi" key={i}>
          <Linea ancho="75%" /><div className="ds-valor"><Linea ancho="60%" /></div><Linea ancho="90%" />
        </div>
      ))}</div>
      <div className="ds-grid">
        <div className="ds-tarjeta ds-c5 ds-pedidos">
          <Linea ancho="55%" />
          <div className="ds-dona-contenido">
            <div className="ds-dona"><Linea ancho="30%" /></div>
            <div className="ds-leyenda">{[0, 1, 2].map(i => <Linea key={i} ancho="6rem" />)}</div>
          </div>
        </div>
        <div className="ds-tarjeta ds-c7"><Linea ancho="60%" /><Filas cantidad={7} /></div>
      </div>
      <div className="ds-grid">
        <div className="ds-tarjeta ds-c7"><Linea ancho="65%" />
          <div className="ds-barras">{BARRAS.map((altura, i) => <span key={i} style={{ height: `${altura}%` }} />)}</div>
        </div>
        <div className="ds-tarjeta ds-c5"><Linea ancho="25%" /><Filas cantidad={9} /></div>
      </div>
      <div className="ds-grid">
        <div className="ds-tarjeta ds-c7"><Linea ancho="45%" /><Filas cantidad={7} /></div>
        <div className="ds-tarjeta ds-c5"><Linea ancho="65%" /><Filas cantidad={6} /></div>
      </div>
    </div>
  </div>;
}

