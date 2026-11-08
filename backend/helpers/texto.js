export const pesos = n => "$ " + Math.round(Number(n) || 0).toLocaleString("es-CO");
export const sinTildes = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
