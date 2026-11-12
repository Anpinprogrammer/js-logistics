/* Logotipo de WhatsApp para los botones y enlaces que abren un chat. Toma el color del texto
   (fill="currentColor") y el tamaño lo pone el CSS de cada botón (por ejemplo `.jsl .btn>svg`),
   o `className` cuando se usa fuera de la app interna. */

interface WhatsAppIconProps {
  className?: string;
}

export function WhatsAppIcon({ className }: WhatsAppIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" className={className}>
      <path d="M12.031 2c-5.516 0-9.969 4.453-9.969 9.969 0 1.758.459 3.475 1.331 4.988L2 22l5.188-1.359a9.927 9.927 0 0 0 4.843 1.258h.004c5.515 0 9.968-4.453 9.968-9.969 0-2.663-1.037-5.167-2.921-7.05A9.903 9.903 0 0 0 12.031 2zm5.822 14.266c-.246.693-1.432 1.326-1.99 1.41-.51.076-1.156.108-1.865-.117-.43-.137-.982-.32-1.69-.626-2.976-1.285-4.92-4.281-5.069-4.479-.148-.198-1.21-1.61-1.21-3.071 0-1.461.766-2.179 1.038-2.476.272-.297.594-.371.792-.371.198 0 .396.002.569.01.183.009.428-.07.67.512.247.594.841 2.055.915 2.204.074.148.124.322.025.52-.099.198-.148.322-.297.495-.148.173-.312.387-.445.52-.149.148-.304.309-.13.606.173.297.769 1.269 1.652 2.056 1.135 1.012 2.092 1.326 2.389 1.474.297.149.47.124.643-.074.173-.198.742-.866.94-1.163.198-.297.396-.247.668-.148.272.099 1.732.817 2.029.965.297.149.495.223.569.347.074.123.074.717-.172 1.41z" />
    </svg>
  );
}
