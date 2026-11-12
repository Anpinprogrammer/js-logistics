import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FalloApi } from "./api/cliente";
import { ProveedorSesion } from "./auth/Sesion";
import App from "./App";
import "./index.css";

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      // 30 s: al ir y volver entre pestañas no se repite la consulta de una página que se acaba de traer.
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // Los errores 4xx no se reintentan (permiso, datos inválidos, no existe); los de red, hasta 2 veces.
      retry: (n, e) => n < 2 && !(e instanceof FalloApi && e.status >= 400 && e.status < 500)
    }
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <ProveedorSesion>
          <App />
        </ProveedorSesion>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
