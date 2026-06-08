/**
 * Impresión de ticket de turno.
 *
 * Modo actual (sin impresora): abre pestaña con el ticket.
 * Modo kiosk (VITE_KIOSK_SILENT_PRINT=true + Chrome --kiosk-printing):
 *   imprime en la pestaña y la cierra sin interacción en la página principal.
 *
 * Integración futura: definir window.kioskPrint(html) desde app nativa / Electron.
 */

const KIOSK_SILENT_PRINT = import.meta.env.VITE_KIOSK_SILENT_PRINT === 'true';

function buildTicketHtml({ numero, sedeNombre }) {
    const title = sedeNombre ? `Turno - ${sedeNombre}` : 'Turno';
    const autoPrintScript = KIOSK_SILENT_PRINT
        ? `<script>
            window.onload = function () {
                window.focus();
                window.print();
                window.onafterprint = function () { window.close(); };
            };
          </script>`
        : '';

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
      background: #fff;
      color: #111;
    }
    .ticket {
      text-align: center;
      width: 80mm;
      max-width: 100%;
      border: 2px dashed #333;
      padding: 24px 16px;
    }
    .brand { font-size: 14px; font-weight: 700; margin-bottom: 8px; }
    .label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #555; }
    .number { font-size: 72px; font-weight: 900; line-height: 1; margin: 16px 0; }
    .hint { font-size: 12px; color: #444; line-height: 1.4; }
    @media print {
      body { padding: 0; }
      .ticket { border: none; width: 80mm; }
    }
  </style>
</head>
<body>
  <div class="ticket">
    ${sedeNombre ? `<div class="brand">${sedeNombre}</div>` : ''}
    <div class="label">Su turno</div>
    <div class="number">${numero}</div>
    <div class="hint">Espere a que llamen su número en pantalla</div>
  </div>
  ${autoPrintScript}
</body>
</html>`;
}

/**
 * @returns {boolean} false si el popup fue bloqueado
 */
export function printTurnoTicket({ numero, sedeNombre = '' }) {
    if (typeof window.kioskPrint === 'function') {
        window.kioskPrint(buildTicketHtml({ numero, sedeNombre }));
        return true;
    }

    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=420,height=640');
    if (!printWindow) {
        return false;
    }

    printWindow.document.open();
    printWindow.document.write(buildTicketHtml({ numero, sedeNombre }));
    printWindow.document.close();
    printWindow.focus();
    return true;
}

export default printTurnoTicket;
