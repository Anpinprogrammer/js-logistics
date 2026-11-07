import { Titulo } from "../components/ui";

/** Secciones que todavía no tienen API en el backend. */
export default function Proximamente({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <>
      <Titulo>{titulo}</Titulo>
      <div className="caja p-6 text-center">
        <p className="font-semibold">En construcción</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-suave">{detalle}</p>
      </div>
    </>
  );
}
