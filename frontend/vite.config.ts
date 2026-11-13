import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// En desarrollo, /api va al backend local: el navegador ve un solo sitio y la cookie de sesión funciona con SameSite=Lax.
// En producción la app llama directo a VITE_API_URL (api.<dominio>), que es del mismo sitio que la app. Ver README.
if (process.env.VERCEL && !process.env.VITE_API_URL && process.env.VITE_DEMO !== "true") {
  console.warn("\n⚠️  Falta VITE_API_URL en este proyecto de Vercel: la app llamará a /api en su propio dominio y no encontrará el backend.\n");
}
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // Las librerías van en archivos aparte: cambian poco, así el navegador las guarda en caché entre despliegues
        // y solo vuelve a bajar el código de la app.
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            // La animación del ingreso es lo único que usa motion: en su propio archivo para no cargarla en la app.
            { name: "intro-motion", test: /node_modules[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/ },
            // SweetAlert2 se descarga con el primer aviso (lib/alertasAdmin.ts), no al abrir la app.
            { name: "avisos", test: /node_modules[\\/]sweetalert2[\\/]/ },
            // ExcelJS solo se baja al pedir un Excel en Clientes (oficina/excelClientes.ts).
            { name: "excel", test: /node_modules[\\/]exceljs[\\/]/ },
            { name: "librerias", test: /node_modules[\\/]/ }
          ]
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: { "/api": { target: process.env.VITE_API_PROXY || "http://localhost:4000", changeOrigin: false } }
  }
});
