import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FalloApi } from "./api/cliente";
import { ProveedorSesion } from "./auth/Sesion";
import { ProveedorAvisos } from "./components/Avisos";
import App from "./App";
import "./index.css";

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
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
        <ProveedorAvisos>
          <ProveedorSesion>
            <App />
          </ProveedorSesion>
        </ProveedorAvisos>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
