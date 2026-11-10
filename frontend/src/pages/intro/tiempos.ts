/* Línea de tiempo de "La ruta de entrega" en segundos (los cuadros de animacion-ingreso/src/Intro.tsx / 60). */
export const COLISION = 58 / 60;      // 0,967 s
export const T0 = COLISION + 58 / 60; // 1,933 s
export const FIN = 4;
export const T = {
  camaraFin: 1.333,
  telemetriaInicio: 0.1,
  telemetriaFin: 1.23,
  fondoInicio: COLISION,
  fondoFin: 1.8,
  destelloInicio: 0.933,
  destelloFin: 1.4,
  ondaFin: 2.13,
  chispasFin: 1.73,
  trazoInicio: 1.067,
  trazoFin: 1.733,
  trazoSeVa: 2.167,
  tarjetaInicio: 1.533,
  tarjetaFin: 2.3,
  placa: 1.6,
  iconoInicio: 1.7,
  iconoFin: 1.97,
  marcaFin: 1.967,
  cejaInicio: T0,
  cejaFin: 2.5,
  tituloInicio: 2.033,
  descInicio: 2.3,
  descFin: 2.7,
  campo1: 2.433,
  campo2: 2.583,
  barraInicio: 2.5,
  barraFin: 3.3,
  botonInicio: 3.3,
  textoBoton: 3.4,
  brilloInicio: 3.567,
  enlaceInicio: 3.467,
  enlaceFin: 3.767
} as const;
