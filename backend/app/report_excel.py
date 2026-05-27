"""
Genera reporte Excel profesional del dashboard admin (tablas, KPIs y gráficos).
"""

from __future__ import annotations

import io
from datetime import datetime, timezone

from openpyxl import Workbook
from openpyxl.chart import BarChart, PieChart, Reference
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo
from sqlalchemy.orm import Session

from . import crud

# Paleta alineada con Pedidos Mayorista
COLOR_PRIMARY = "2ECC71"
COLOR_PRIMARY_DARK = "27AE60"
COLOR_HEADER = "1E293B"
COLOR_HEADER_TEXT = "FFFFFF"
COLOR_KPI_BG = "ECFDF5"
COLOR_KPI_BORDER = "2ECC71"
COLOR_SUBTITLE = "64748B"
COLOR_ALT_ROW = "F8FAFC"


def _thin_border(color: str = "CBD5E1") -> Border:
    s = Side(style="thin", color=color)
    return Border(left=s, right=s, top=s, bottom=s)


def _style_header_row(ws, row: int, col_start: int, col_end: int) -> None:
    fill = PatternFill("solid", fgColor=COLOR_HEADER)
    font = Font(name="Calibri", bold=True, color=COLOR_HEADER_TEXT, size=11)
    for col in range(col_start, col_end + 1):
        cell = ws.cell(row=row, column=col)
        cell.fill = fill
        cell.font = font
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = _thin_border(COLOR_HEADER)


def _add_excel_table(ws, ref: str, name: str) -> None:
    tab = Table(displayName=name, ref=ref)
    tab.tableStyleInfo = TableStyleInfo(
        name="TableStyleMedium2",
        showFirstColumn=False,
        showLastColumn=False,
        showRowStripes=True,
        showColumnStripes=False,
    )
    ws.add_table(tab)


def _write_kpi_block(ws, start_row: int, start_col: int, label: str, value, unit: str = "") -> None:
    lbl = ws.cell(row=start_row, column=start_col, value=label)
    lbl.font = Font(name="Calibri", size=10, color=COLOR_SUBTITLE, bold=True)
    lbl.alignment = Alignment(horizontal="center")

    val_text = f"{value}{unit}"
    val = ws.cell(row=start_row + 1, column=start_col, value=val_text)
    val.font = Font(name="Calibri", size=18, bold=True, color=COLOR_PRIMARY_DARK)
    val.alignment = Alignment(horizontal="center")

    for r in range(start_row, start_row + 2):
        c = ws.cell(row=r, column=start_col)
        c.fill = PatternFill("solid", fgColor=COLOR_KPI_BG)
        c.border = _thin_border(COLOR_KPI_BORDER)


def build_dashboard_report(
    db: Session,
    *,
    sede_ids: list[int] | None,
    date_from,
    date_to,
    period_label: str,
    sede_label: str,
) -> tuple[bytes, str]:
    data = crud.gather_dashboard_report_data(db, sede_ids, date_from, date_to)
    wb = Workbook()

    # --- Hoja Dashboard ---
    ws = wb.active
    ws.title = "Dashboard"
    ws.sheet_view.showGridLines = False

    ws.merge_cells("A1:H1")
    title = ws["A1"]
    title.value = "PEDIDOS MAYORISTA — Reporte operativo"
    title.font = Font(name="Calibri", size=18, bold=True, color=COLOR_HEADER_TEXT)
    title.fill = PatternFill("solid", fgColor=COLOR_PRIMARY_DARK)
    title.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 36

    generated = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")
    ws["A3"] = "Generado:"
    ws["B3"] = generated
    ws["A4"] = "Periodo:"
    ws["B4"] = period_label
    ws["A5"] = "Sedes:"
    ws["B5"] = sede_label
    for r in (3, 4, 5):
        ws.cell(row=r, column=1).font = Font(bold=True, color=COLOR_SUBTITLE)
        ws.cell(row=r, column=2).font = Font(color="0F172A")

    _write_kpi_block(ws, 7, 1, "PEDIDOS TOTALES", data["total_pedidos"])
    _write_kpi_block(ws, 7, 3, "KG PROMEDIO / PEDIDO", data["avg_kg"], " kg")
    _write_kpi_block(ws, 7, 5, "MAYORISTAS", data["mayoristas_count"])
    _write_kpi_block(ws, 7, 7, "CIUDADES", data["ciudades_count"])

    chart_row = 11
    use_estado = bool(data["orders_by_estado"])
    chart_rows = data["orders_by_estado"] if use_estado else data["sede_orders"]
    chart_title = "Pedidos por estado" if use_estado else "Pedidos por sede"

    ws.cell(row=chart_row, column=1, value=chart_title.upper())
    ws.cell(row=chart_row, column=1).font = Font(size=12, bold=True, color=COLOR_HEADER)

    header_r = chart_row + 1
    ws.cell(row=header_r, column=1, value="Categoría")
    ws.cell(row=header_r, column=2, value="Cantidad")
    _style_header_row(ws, header_r, 1, 2)

    data_start = header_r + 1
    for i, row in enumerate(chart_rows):
        r = data_start + i
        ws.cell(row=r, column=1, value=row["name"])
        ws.cell(row=r, column=2, value=row["count"])
        if i % 2 == 1:
            for c in (1, 2):
                ws.cell(row=r, column=c).fill = PatternFill("solid", fgColor=COLOR_ALT_ROW)

    if chart_rows:
        data_end = data_start + len(chart_rows) - 1
        _add_excel_table(ws, f"A{header_r}:B{data_end}", "TablaResumen")

        bar = BarChart()
        bar.type = "col"
        bar.style = 10
        bar.title = chart_title
        bar.y_axis.title = "Pedidos"
        bar.x_axis.title = "Categoría"
        bar.height = 12
        bar.width = 18
        bar.varyColors = True
        data_ref = Reference(ws, min_col=2, min_row=header_r, max_row=data_end)
        cats = Reference(ws, min_col=1, min_row=data_start, max_row=data_end)
        bar.add_data(data_ref, titles_from_data=True)
        bar.set_categories(cats)
        ws.add_chart(bar, f"D{chart_row}")

    cuts_start = data_start + len(chart_rows) + 3 if chart_rows else chart_row + 3
    ws.cell(row=cuts_start, column=1, value="TOP CORTES (KG)")
    ws.cell(row=cuts_start, column=1).font = Font(size=12, bold=True, color=COLOR_HEADER)

    cuts_header = cuts_start + 1
    ws.cell(row=cuts_header, column=1, value="Corte")
    ws.cell(row=cuts_header, column=2, value="Total kg")
    _style_header_row(ws, cuts_header, 1, 2)

    cuts_data_start = cuts_header + 1
    for i, cut in enumerate(data["top_cuts"]):
        r = cuts_data_start + i
        ws.cell(row=r, column=1, value=cut["name"])
        ws.cell(row=r, column=2, value=round(cut["total_kg"], 2))
        if i % 2 == 1:
            for c in (1, 2):
                ws.cell(row=r, column=c).fill = PatternFill("solid", fgColor=COLOR_ALT_ROW)

    if data["top_cuts"]:
        cuts_end = cuts_data_start + len(data["top_cuts"]) - 1
        _add_excel_table(ws, f"A{cuts_header}:B{cuts_end}", "TablaCortes")

        pie = PieChart()
        pie.title = "Distribución por corte (kg)"
        pie.height = 12
        pie.width = 14
        pie_data = Reference(ws, min_col=2, min_row=cuts_header, max_row=cuts_end)
        pie_labels = Reference(ws, min_col=1, min_row=cuts_data_start, max_row=cuts_end)
        pie.add_data(pie_data, titles_from_data=True)
        pie.set_categories(pie_labels)
        ws.add_chart(pie, f"D{cuts_start}")

    ws.column_dimensions["A"].width = 28
    ws.column_dimensions["B"].width = 16
    for col in range(3, 9):
        ws.column_dimensions[get_column_letter(col)].width = 14

    # --- Hoja Detalle pedidos ---
    ws2 = wb.create_sheet("Detalle pedidos")
    ws2.sheet_view.showGridLines = False
    headers = ["Nº pedido", "Fecha", "Sede", "Mayorista", "Cliente", "Estado", "Kg total"]
    for col, h in enumerate(headers, 1):
        ws2.cell(row=1, column=col, value=h)
    _style_header_row(ws2, 1, 1, len(headers))

    for i, p in enumerate(data["pedidos"]):
        r = i + 2
        kg = sum(d.cantidad_kg or 0 for d in (p.detalles or []))
        estado = p.estado.value if hasattr(p.estado, "value") else str(p.estado)
        ws2.cell(row=r, column=1, value=p.numero_pedido or p.id)
        ts = p.timestamp.strftime("%d/%m/%Y %H:%M") if p.timestamp else ""
        ws2.cell(row=r, column=2, value=ts)
        ws2.cell(row=r, column=3, value=p.sede.nombre if p.sede else "")
        ws2.cell(row=r, column=4, value=p.mayorista.username if p.mayorista else "")
        ws2.cell(row=r, column=5, value=p.cliente_nombre or "")
        ws2.cell(row=r, column=6, value=crud._ESTADO_LABELS.get(estado, estado))
        ws2.cell(row=r, column=7, value=round(kg, 2))
        if i % 2 == 1:
            for c in range(1, 8):
                ws2.cell(row=r, column=c).fill = PatternFill("solid", fgColor=COLOR_ALT_ROW)

    if data["pedidos"]:
        last = len(data["pedidos"]) + 1
        _add_excel_table(ws2, f"A1:G{last}", "TablaPedidos")

    for col, w in enumerate([14, 18, 22, 16, 24, 14, 12], 1):
        ws2.column_dimensions[get_column_letter(col)].width = w

    # --- Hoja Filtros aplicados ---
    ws3 = wb.create_sheet("Filtros")
    ws3["A1"] = "Parámetro"
    ws3["B1"] = "Valor"
    _style_header_row(ws3, 1, 1, 2)
    rows_meta = [
        ("Aplicación", "Pedidos Mayorista"),
        ("Periodo", period_label),
        ("Sedes incluidas", sede_label),
        ("Fecha desde", str(date_from) if date_from else "—"),
        ("Fecha hasta", str(date_to) if date_to else "—"),
        ("Total pedidos", data["total_pedidos"]),
        ("Kg total (top cortes)", round(data["total_kg"], 2)),
    ]
    for i, (k, v) in enumerate(rows_meta, 2):
        ws3.cell(row=i, column=1, value=k)
        ws3.cell(row=i, column=2, value=v)
    ws3.column_dimensions["A"].width = 24
    ws3.column_dimensions["B"].width = 40

    buffer = io.BytesIO()
    wb.save(buffer)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"reporte_pedidos_mayorista_{stamp}.xlsx"
    return buffer.getvalue(), filename
