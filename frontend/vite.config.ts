import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// En desarrollo, /api va al backend local: el navegador ve un solo sitio y la cookie de sesión funciona con SameSite=Lax.
// En producción se hace lo mismo con una regla de reescritura (/api/* → servicio del backend). Ver README.
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
