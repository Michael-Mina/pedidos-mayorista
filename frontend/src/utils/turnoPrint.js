/**
 * Impresión de ticket de turno.
 *
 * Modo actual (sin impresora): abre pestaña con el ticket vía Blob URL.
 * Modo kiosk (VITE_KIOSK_SILENT_PRINT=true + Chrome --kiosk-printing):
 *   imprime en la pestaña y la cierra sin interacción en la página principal.
 *
 * Integración futura: definir window.kioskPrint(html) desde app nativa / Electron.
 */

const KIOSK_SILENT_PRINT = import.meta.env.VITE_KIOSK_SILENT_PRINT === 'true';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buildTicketHtml({ numero, sedeNombre }) {
    const safeNumero = escapeHtml(numero);
    const safeSede = escapeHtml(sedeNombre);
    const title = sedeNombre ? `Turno - ${safeSede}` : 'Turno';
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
    ${sedeNombre ? `<div class="brand">${safeSede}</div>` : ''}
    <div class="label">Su turno</div>
    <div class="number">${safeNumero}</div>
    <div class="hint">Espere a que llamen su número en pantalla</div>
  </div>
  ${autoPrintScript}
</body>
</html>`;
}

/**
 * Abre el ticket en una pestaña nueva.
 * @returns {boolean} false solo si el navegador bloqueó por completo la pestaña
 */
export function printTurnoTicket({ numero, sedeNombre = '' }) {
    const html = buildTicketHtml({ numero, sedeNombre });

    if (typeof window.kioskPrint === 'function') {
        window.kioskPrint(html);
        return true;
    }

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);

    // Sin noopener: la pestaña carga el HTML desde blob URL (compatible Brave/Chrome)
    const printWindow = window.open(blobUrl, '_blank', 'width=420,height=640');

    if (!printWindow) {
        URL.revokeObjectURL(blobUrl);
        return false;
    }

    // Revocar tras cargar para no filtrar memoria
    printWindow.addEventListener?.('load', () => {
        URL.revokeObjectURL(blobUrl);
    });
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);

    return true;
}

export default printTurnoTicket;
