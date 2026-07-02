"""
=============================================================================
  GENERADOR DE TICKETS SINTÉTICOS PARA OCR
  ------------------------------------------
  Genera tickets/recibos españoles falsos renderizando HTML a imagen
  con Playwright (headless Chromium). Cero coste de API.

  Uso:
    python generate_synthetic_ticket.py                    # 1 ticket (Regla de Oro)
    python generate_synthetic_ticket.py --count 100        # 100 tickets
    python generate_synthetic_ticket.py --count 5 --seed 42

  Dependencias:
    pip install playwright Pillow numpy albumentations opencv-python-headless
    python -m playwright install chromium
=============================================================================
"""

import os
import json
import random
import argparse
import string
import math
from pathlib import Path
from datetime import datetime, timedelta

import cv2
import numpy as np
from PIL import Image
import albumentations as A

# =============================================================================
#  BASE DE DATOS DE COMERCIOS Y PRODUCTOS ESPAÑOLES
# =============================================================================

COMERCIOS = [
    # Supermercados
    {"nombre": "MERCADONA, S.A.", "cif": "A-46103834", "tipo": "supermercado"},
    {"nombre": "LIDL SUPERMERCADOS S.A.U.", "cif": "A-60195278", "tipo": "supermercado"},
    {"nombre": "ALDI SUPERMERCADOS S.L.U.", "cif": "B-91405142", "tipo": "supermercado"},
    {"nombre": "CARREFOUR ESPAÑA S.A.", "cif": "A-28425270", "tipo": "supermercado"},
    {"nombre": "DIA RETAIL ESPAÑA S.A.U.", "cif": "A-84907158", "tipo": "supermercado"},
    {"nombre": "ALCAMPO S.A.", "cif": "A-28581882", "tipo": "supermercado"},
    {"nombre": "CONSUM S.COOP.V.", "cif": "F-46078986", "tipo": "supermercado"},
    {"nombre": "EROSKI S. COOP.", "cif": "F-20025001", "tipo": "supermercado"},
    {"nombre": "HIPERCOR S.A.", "cif": "A-28851163", "tipo": "supermercado"},
    {"nombre": "BM SUPERMERCADOS S.A.", "cif": "A-48087539", "tipo": "supermercado"},
    # Restaurantes / Bares
    {"nombre": "BAR RESTAURANTE EL RINCÓN", "cif": "B-12345678", "tipo": "restaurante"},
    {"nombre": "CAFETERÍA CENTRAL S.L.", "cif": "B-87654321", "tipo": "restaurante"},
    {"nombre": "RESTAURANTE LA TASCA", "cif": "B-11223344", "tipo": "restaurante"},
    {"nombre": "BURGER KING ESPAÑA S.L.U.", "cif": "B-80012148", "tipo": "restaurante"},
    {"nombre": "McDONALD'S ESPAÑA S.L.", "cif": "B-80601856", "tipo": "restaurante"},
    {"nombre": "TELEPIZZA S.A.U.", "cif": "A-79864332", "tipo": "restaurante"},
    {"nombre": "BAR ANTONIO", "cif": "", "tipo": "restaurante"},
    {"nombre": "CERVECERÍA LA PLAZA S.L.", "cif": "B-44556677", "tipo": "restaurante"},
    # Gasolineras
    {"nombre": "REPSOL COMERCIAL PROD. PETROL. S.A.", "cif": "A-80298839", "tipo": "gasolinera"},
    {"nombre": "CEPSA ESTACIONES DE SERVICIO S.A.", "cif": "A-80618877", "tipo": "gasolinera"},
    {"nombre": "BP OIL ESPAÑA S.A.U.", "cif": "A-28003119", "tipo": "gasolinera"},
    # Tiendas varias
    {"nombre": "ZARA ESPAÑA S.A.", "cif": "A-15075062", "tipo": "ropa"},
    {"nombre": "DECATHLON ESPAÑA S.A.U.", "cif": "A-79935607", "tipo": "deporte"},
    {"nombre": "IKEA IBÉRICA S.A.", "cif": "A-28612618", "tipo": "hogar"},
    {"nombre": "LEROY MERLIN ESPAÑA S.L.U.", "cif": "B-30503058", "tipo": "bricolaje"},
    {"nombre": "FARMACIA LÓPEZ GARCÍA", "cif": "12345678A", "tipo": "farmacia"},
    {"nombre": "KIABI ESPAÑA S.A.", "cif": "A-59711970", "tipo": "ropa"},
    {"nombre": "PRIMARK TIENDAS S.L.U.", "cif": "B-84324498", "tipo": "ropa"},
    {"nombre": "MEDIA MARKT SATURN S.A.U.", "cif": "A-62623357", "tipo": "electronica"},
    {"nombre": "FNAC ESPAÑA S.A.U.", "cif": "A-80500200", "tipo": "electronica"},
]

# Productos categorizados por tipo de comercio
PRODUCTOS = {
    "supermercado": [
        ("LECHE ENTERA 1L", 0.89, 1.35), ("PAN DE MOLDE", 1.10, 2.20),
        ("HUEVOS CAMPEROS 6U", 1.80, 2.90), ("TOMATE FRITO BRICK", 0.85, 1.50),
        ("ACEITE OLIVA VIRGEN 1L", 5.50, 9.90), ("ARROZ REDONDO 1KG", 1.20, 2.10),
        ("PASTA MACARRONES 500G", 0.75, 1.50), ("AGUA MINERAL 1.5L", 0.35, 0.80),
        ("YOGUR NATURAL PACK 4", 1.00, 1.80), ("CEREALES MUESLI", 2.50, 4.20),
        ("JAMÓN COCIDO 200G", 1.80, 3.50), ("QUESO RALLADO 150G", 1.50, 2.80),
        ("PECHUGA POLLO 500G", 3.50, 5.90), ("FILETE TERNERA KG", 8.90, 14.50),
        ("SALMÓN FRESCO KG", 9.90, 16.50), ("MANZANA GOLDEN KG", 1.50, 2.80),
        ("PLATANO KG", 1.20, 2.30), ("TOMATE PERA KG", 1.80, 3.50),
        ("LECHUGA ICEBERG", 0.80, 1.50), ("CEBOLLA ROJA KG", 1.30, 2.50),
        ("ZANAHORIA KG", 0.90, 1.80), ("CALABACIN KG", 1.20, 2.40),
        ("PATATA SACO 3KG", 2.50, 4.50), ("PAPEL HIGIÉNICO 12R", 3.50, 6.90),
        ("DETERGENTE LÍQUIDO 2L", 4.90, 8.90), ("SUAVIZANTE 2L", 2.50, 4.50),
        ("LAVAVAJILLAS 1L", 1.50, 3.00), ("BOLSA PLÁSTICO", 0.10, 0.25),
        ("CERVEZA PACK 6", 3.50, 5.90), ("REFRESCO COLA 2L", 1.50, 2.30),
        ("GALLETAS MARÍA 800G", 1.20, 2.50), ("CHOCOLATE TABLETA", 1.50, 3.20),
        ("CAFÉ MOLIDO 250G", 2.50, 5.00), ("ZUMO NARANJA 1L", 1.20, 2.50),
        ("MANTEQUILLA 250G", 1.80, 3.50), ("NATA COCINAR 200ML", 0.85, 1.60),
        ("PIMIENTO ROJO KG", 2.50, 4.80), ("CHAMPIÑÓN LAMINADO", 1.20, 2.20),
        ("BRÓCOLI BANDEJA", 1.50, 2.50), ("ATÚN EN ACEITE 3U", 2.50, 4.50),
        ("GARBANZOS COCIDOS", 0.80, 1.50), ("LENTEJAS COCIDAS", 0.75, 1.40),
    ],
    "restaurante": [
        ("MENÚ DEL DÍA", 10.00, 16.00), ("CAÑA CERVEZA", 1.50, 3.00),
        ("COPA VINO TINTO", 2.50, 5.00), ("TINTO DE VERANO", 2.00, 3.50),
        ("AGUA MINERAL", 1.00, 2.50), ("REFRESCO", 1.80, 3.50),
        ("CAFÉ SOLO", 1.00, 1.80), ("CAFÉ CON LECHE", 1.20, 2.20),
        ("TOSTADA", 1.50, 3.50), ("PINCHO TORTILLA", 2.50, 4.00),
        ("RACIÓN JAMÓN IBÉRICO", 12.00, 22.00), ("ENSALADA MIXTA", 6.00, 10.00),
        ("CROQUETAS CASERAS 6U", 6.00, 9.50), ("PULPO A LA GALLEGA", 14.00, 22.00),
        ("PAELLA VALENCIANA", 12.00, 18.00), ("FILETE CON PATATAS", 10.00, 16.00),
        ("HAMBURGUESA COMPLETA", 8.00, 14.00), ("PIZZA MARGARITA", 7.00, 12.00),
        ("POSTRE DEL DÍA", 3.00, 6.00), ("PAN", 0.50, 1.50),
        ("CUBIERTO", 1.00, 2.50), ("SOPA DEL DÍA", 5.00, 8.00),
        ("GAMBAS AL AJILLO", 10.00, 16.00), ("CALAMARES A LA ROMANA", 8.00, 13.00),
    ],
    "gasolinera": [
        ("GASOLINA 95", 30.00, 80.00), ("GASOLINA 98", 35.00, 90.00),
        ("DIESEL A+", 30.00, 75.00), ("AGUA 50CL", 1.00, 2.50),
        ("BOLSA PATATAS", 1.50, 3.00), ("CAFÉ MÁQUINA", 1.00, 1.80),
        ("PACK CHICLES", 1.50, 2.50), ("LIMPIAPARABRISAS 1L", 3.00, 6.00),
    ],
    "ropa": [
        ("CAMISETA BÁSICA", 5.99, 15.99), ("PANTALÓN VAQUERO", 19.99, 39.99),
        ("VESTIDO", 19.99, 49.99), ("CHAQUETA", 29.99, 69.99),
        ("CALCETINES PACK 5", 4.50, 9.99), ("SUDADERA", 15.99, 35.99),
        ("CAMISA", 12.99, 29.99), ("FALDA", 9.99, 25.99),
        ("BOLSA CLIENTE", 0.10, 0.25),
    ],
    "deporte": [
        ("MANCUERNA HEX 2.5KG", 9.99, 14.99), ("ESTERILLA YOGA", 7.99, 19.99),
        ("BOTELLA AGUA DEPORTE", 4.99, 9.99), ("CAMISETA TÉCNICA", 7.99, 15.99),
        ("ZAPATILLAS RUNNING", 29.99, 69.99), ("BALÓN FÚTBOL", 9.99, 24.99),
        ("BANDA ELÁSTICA", 3.99, 8.99), ("GORRA DEPORTIVA", 5.99, 12.99),
    ],
    "hogar": [
        ("MESA AUXILIAR", 9.99, 29.99), ("ESTANTERÍA", 14.99, 49.99),
        ("COJÍN DECORATIVO", 4.99, 14.99), ("VELA PERFUMADA", 1.99, 7.99),
        ("PERCHA PACK 8", 3.99, 6.99), ("ALFOMBRILLA ENTRADA", 4.99, 12.99),
        ("CUENCO PORCELANA", 2.99, 8.99), ("LÁMPARA LED", 5.99, 19.99),
    ],
    "bricolaje": [
        ("PINTURA BLANCA 5L", 15.99, 35.99), ("BROCHAS PACK 3", 4.99, 12.99),
        ("DESTORNILLADOR SET", 8.99, 19.99), ("CINTA AISLANTE", 1.99, 4.99),
        ("TORNILLOS PACK 50", 2.99, 6.99), ("TACOS PARED PACK 20", 2.50, 5.50),
    ],
    "farmacia": [
        ("IBUPROFENO 600MG 20U", 2.50, 5.50), ("PARACETAMOL 1G 20U", 1.80, 4.00),
        ("TIRITAS SURTIDAS 20U", 2.99, 5.99), ("CREMA HIDRATANTE 50ML", 5.99, 15.99),
        ("PROTECTOR SOLAR SPF50", 8.99, 18.99), ("JARABE TOS 150ML", 5.50, 12.50),
    ],
    "electronica": [
        ("CABLE USB-C 1M", 5.99, 12.99), ("AURICULARES BLUETOOTH", 19.99, 49.99),
        ("FUNDA MÓVIL", 9.99, 19.99), ("RATÓN INALÁMBRICO", 9.99, 24.99),
        ("PENDRIVE 32GB", 6.99, 14.99), ("PILAS AA PACK 4", 2.99, 5.99),
    ],
}

CIUDADES = [
    "Madrid", "Barcelona", "Valencia", "Sevilla", "Málaga", "Almería",
    "Zaragoza", "Bilbao", "Murcia", "Alicante", "Córdoba", "Granada",
    "Valladolid", "Palma de Mallorca", "Cádiz", "Marbella", "Huelva",
    "Jaén", "Tarragona", "Girona", "Salamanca", "Burgos", "Toledo",
]

METODOS_PAGO = [
    "VISA ****1234", "MASTERCARD ****5678", "EFECTIVO", "TARJETA DÉBITO",
    "VISA ****9012", "MASTERCARD ****3456", "CONTACTLESS", "BIZUM",
    "TARJETA CRÉDITO", "AMERICAN EXPRESS ****7890",
]


# =============================================================================
#  GENERADOR DE DATOS ALEATORIOS
# =============================================================================

def generate_random_date(start_year=2024, end_year=2026):
    """Genera una fecha aleatoria en formato DD/MM/YYYY."""
    start = datetime(start_year, 1, 1)
    end = datetime(end_year, 12, 31)
    delta = end - start
    random_day = start + timedelta(days=random.randint(0, delta.days))
    return random_day.strftime("%d/%m/%Y")


def generate_random_time():
    """Genera una hora aleatoria en formato HH:MM."""
    hour = random.randint(7, 23)
    minute = random.randint(0, 59)
    return f"{hour:02d}:{minute:02d}"


def generate_random_cif():
    """Genera un CIF/NIF español aleatorio."""
    letter = random.choice("ABCDEFGH")
    number = random.randint(10000000, 99999999)
    return f"{letter}{number}"


def generate_random_phone():
    """Genera un teléfono español aleatorio."""
    prefix = random.choice(["91", "93", "95", "96", "98"])
    number = random.randint(1000000, 9999999)
    return f"{prefix} {number}"


def generate_random_address(ciudad):
    """Genera una dirección española aleatoria."""
    calles = ["Calle Mayor", "Av. de la Constitución", "C/ Gran Vía",
              "Pl. de España", "C/ del Carmen", "Av. de Andalucía",
              "C/ Real", "Paseo de la Castellana", "C/ Alcalá",
              "Av. del Mediterráneo", "C/ San Fernando", "C/ Larios"]
    calle = random.choice(calles)
    numero = random.randint(1, 150)
    cp = random.randint(10000, 52999)
    return f"{calle}, {numero}\n{cp:05d} {ciudad}"


def generate_ticket_data():
    """
    Genera los datos completos de un ticket aleatorio.
    Devuelve (ticket_data, ground_truth_json).
    """
    comercio = random.choice(COMERCIOS)
    tipo = comercio["tipo"]
    ciudad = random.choice(CIUDADES)

    # Seleccionar productos
    productos_disponibles = PRODUCTOS.get(tipo, PRODUCTOS["supermercado"])
    num_items = random.randint(1, min(15, len(productos_disponibles)))
    items_seleccionados = random.sample(productos_disponibles, num_items)

    # A veces duplicar un item (comprar 2 del mismo)
    items_ticket = []
    for nombre, precio_min, precio_max in items_seleccionados:
        precio = round(random.uniform(precio_min, precio_max), 2)
        items_ticket.append({"descripcion": nombre, "precio": precio})
        # 15% probabilidad de comprar 2
        if random.random() < 0.15:
            items_ticket.append({"descripcion": nombre, "precio": precio})

    # A veces añadir un descuento
    if random.random() < 0.25 and len(items_ticket) > 2:
        desc_item = random.choice(items_ticket)
        descuento = round(desc_item["precio"] * random.uniform(0.05, 0.20), 2)
        items_ticket.append({
            "descripcion": f"(DTO){desc_item['descripcion'][:20]}",
            "precio": -descuento
        })

    total = round(sum(item["precio"] for item in items_ticket), 2)

    fecha = generate_random_date()
    hora = generate_random_time()
    metodo_pago = random.choice(METODOS_PAGO)
    direccion = generate_random_address(ciudad)
    telefono = generate_random_phone()

    # Ground truth (lo que el modelo debe extraer)
    ground_truth = {
        "comercio": comercio["nombre"],
        "cif": comercio["cif"],
        "fecha": fecha,
        "total": total,
        "items": items_ticket
    }

    # Datos extra para renderizar el ticket (no van en el ground truth)
    ticket_data = {
        **ground_truth,
        "hora": hora,
        "direccion": direccion,
        "telefono": telefono,
        "metodo_pago": metodo_pago,
        "ciudad": ciudad,
        "tipo": tipo,
        "num_factura": f"{random.choice(string.ascii_uppercase)}{random.randint(1000, 99999):05d}",
    }

    return ticket_data, ground_truth


# =============================================================================
#  PLANTILLAS HTML PARA RENDERIZAR TICKETS
# =============================================================================

def get_thermal_style():
    """Estilo de impresora térmica clásica (mayoría de supermercados)."""
    fonts = [
        "'Courier New', Courier, monospace",
        "'Lucida Console', Monaco, monospace",
        "'Consolas', monospace",
    ]
    font = random.choice(fonts)
    font_size = random.choice(["12px", "13px", "14px"])
    line_height = random.choice(["1.3", "1.4", "1.5"])

    # Variaciones de "papel térmico"
    bg_colors = ["#faf8f0", "#f5f2e8", "#f0ede3", "#fdfcf8", "#f8f5eb", "#edeae0"]
    text_colors = ["#1a1a1a", "#2a2a2a", "#333333", "#0d0d0d", "#1f1f1f"]

    return {
        "font_family": font,
        "font_size": font_size,
        "line_height": line_height,
        "bg_color": random.choice(bg_colors),
        "text_color": random.choice(text_colors),
        "width": random.randint(280, 380),
        "padding": random.randint(12, 25),
        "letter_spacing": random.choice(["0px", "0.3px", "0.5px", "1px"]),
    }


def render_ticket_html(ticket_data, style):
    """
    Renderiza un ticket como HTML con aspecto de ticket térmico real.
    """
    items_html = ""
    for item in ticket_data["items"]:
        desc = item["descripcion"]
        precio = item["precio"]
        # Truncar descripción si es muy larga (como en tickets reales)
        max_desc_len = random.randint(20, 30)
        if len(desc) > max_desc_len:
            desc = desc[:max_desc_len]

        if precio < 0:
            precio_str = f"-{abs(precio):.2f}"
        else:
            precio_str = f"{precio:.2f}"

        items_html += f"""
        <div class="item-row">
            <span class="item-desc">{desc}</span>
            <span class="item-price">{precio_str} €</span>
        </div>"""

    # Separadores variados
    sep_chars = random.choice(["─", "-", "=", "━", "·"])
    sep_len = style["width"] // 8
    separator = sep_chars * sep_len

    # Cabecera: a veces centrada, a veces alineada izquierda
    header_align = random.choice(["center", "center", "center", "left"])

    # Mostrar u ocultar ciertos campos (variabilidad)
    show_cif = ticket_data["cif"] != "" and random.random() > 0.1
    show_phone = random.random() > 0.4
    show_address = random.random() > 0.3
    show_factura = random.random() > 0.5
    show_iva = random.random() > 0.4
    show_metodo_pago = random.random() > 0.3
    show_num_articulos = random.random() > 0.5

    # Calcular IVA (21% general en España)
    total = ticket_data["total"]
    base_iva = round(total / 1.21, 2)
    cuota_iva = round(total - base_iva, 2)

    # Header info
    header_html = f'<div class="comercio">{ticket_data["comercio"]}</div>'
    if show_cif and ticket_data["cif"]:
        header_html += f'<div class="info">CIF: {ticket_data["cif"]}</div>'
    if show_address:
        addr = ticket_data["direccion"].replace("\n", "<br>")
        header_html += f'<div class="info">{addr}</div>'
    if show_phone:
        header_html += f'<div class="info">Tel: {ticket_data["telefono"]}</div>'

    # Footer info
    footer_html = ""
    if show_iva:
        footer_html += f"""
        <div class="separator">{separator}</div>
        <div class="iva-section">
            <div class="item-row">
                <span>BASE IMPONIBLE</span>
                <span>{base_iva:.2f} €</span>
            </div>
            <div class="item-row">
                <span>IVA 21%</span>
                <span>{cuota_iva:.2f} €</span>
            </div>
        </div>"""

    if show_metodo_pago:
        footer_html += f"""
        <div class="separator">{separator}</div>
        <div class="info" style="text-align: left;">
            PAGO: {ticket_data["metodo_pago"]}
        </div>"""

    if show_num_articulos:
        num_arts = len([i for i in ticket_data["items"] if i["precio"] >= 0])
        footer_html += f'<div class="info" style="text-align: left;">Nº Artículos: {num_arts}</div>'

    # Generar HTML completo
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
    <meta charset="UTF-8">
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        body {{
            background: {style["bg_color"]};
            display: flex;
            justify-content: center;
            padding: 20px;
        }}
        .ticket {{
            width: {style["width"]}px;
            padding: {style["padding"]}px;
            font-family: {style["font_family"]};
            font-size: {style["font_size"]};
            line-height: {style["line_height"]};
            color: {style["text_color"]};
            letter-spacing: {style["letter_spacing"]};
            background: {style["bg_color"]};
        }}
        .header {{
            text-align: {header_align};
            margin-bottom: 8px;
        }}
        .comercio {{
            font-weight: bold;
            font-size: 1.1em;
            margin-bottom: 4px;
            text-transform: uppercase;
        }}
        .info {{
            font-size: 0.85em;
            opacity: 0.8;
            margin-bottom: 2px;
        }}
        .fecha-hora {{
            display: flex;
            justify-content: space-between;
            margin: 6px 0;
            font-size: 0.9em;
        }}
        .separator {{
            text-align: center;
            margin: 6px 0;
            overflow: hidden;
            opacity: 0.6;
            font-size: 0.8em;
            letter-spacing: -1px;
        }}
        .item-row {{
            display: flex;
            justify-content: space-between;
            margin: 2px 0;
            gap: 8px;
        }}
        .item-desc {{
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }}
        .item-price {{
            white-space: nowrap;
            text-align: right;
            min-width: 60px;
        }}
        .total-section {{
            margin-top: 4px;
        }}
        .total-row {{
            display: flex;
            justify-content: space-between;
            font-weight: bold;
            font-size: 1.15em;
            margin-top: 4px;
        }}
        .iva-section {{
            font-size: 0.85em;
            opacity: 0.85;
        }}
        .footer {{
            margin-top: 10px;
            text-align: center;
            font-size: 0.8em;
            opacity: 0.7;
        }}
    </style>
    </head>
    <body>
        <div class="ticket">
            <div class="header">
                {header_html}
            </div>

            <div class="separator">{separator}</div>

            <div class="fecha-hora">
                <span>{ticket_data["fecha"]}</span>
                <span>{ticket_data["hora"]}</span>
            </div>
            {"<div class='info'>Factura: " + ticket_data["num_factura"] + "</div>" if show_factura else ""}

            <div class="separator">{separator}</div>

            <div class="items-section">
                {items_html}
            </div>

            <div class="separator">{separator}</div>

            <div class="total-section">
                <div class="total-row">
                    <span>TOTAL</span>
                    <span>{total:.2f} €</span>
                </div>
            </div>

            {footer_html}

            <div class="footer">
                <br>GRACIAS POR SU COMPRA
                {f"<br>{ticket_data['ciudad']}" if random.random() > 0.5 else ""}
            </div>
        </div>
    </body>
    </html>
    """
    return html


# =============================================================================
#  POST-PROCESAMIENTO: HACER QUE PAREZCA FOTOGRAFIADO
# =============================================================================

def apply_photo_effect(image_path: str):
    """
    Aplica efectos sutiles a la imagen renderizada para que parezca una 
    fotografía real de un ticket, no un screenshot limpio.
    """
    image = cv2.imread(image_path)
    if image is None:
        return
    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    # Pipeline de efectos suaves (no tan agresivos como en augmentación)
    transform = A.Compose([
        # Ligera rotación (como al sostener el ticket en la mano)
        A.Rotate(
            limit=(-8, 8),
            border_mode=cv2.BORDER_CONSTANT,
            fill=240,
            p=0.7
        ),
        # Perspectiva sutil
        A.Perspective(
            scale=(0.02, 0.06),
            border_mode=cv2.BORDER_CONSTANT,
            fill=240,
            p=0.5
        ),
        # Ruido muy ligero
        A.GaussNoise(
            std_range=(0.01, 0.04),
            p=0.6
        ),
        # Ligera variación de brillo
        A.RandomBrightnessContrast(
            brightness_limit=(-0.15, 0.1),
            contrast_limit=(-0.1, 0.1),
            p=0.5
        ),
        # Compresión JPEG (como si se enviara por WhatsApp)
        A.ImageCompression(
            quality_range=(50, 90),
            p=0.4
        ),
        # Sombra muy sutil
        A.RandomShadow(
            shadow_roi=(0, 0, 1, 1),
            num_shadows_limit=(1, 2),
            shadow_dimension=5,
            p=0.3
        ),
    ])

    result = transform(image=image_rgb)
    aug_bgr = cv2.cvtColor(result['image'], cv2.COLOR_RGB2BGR)
    cv2.imwrite(image_path, aug_bgr, [cv2.IMWRITE_JPEG_QUALITY, 90])


# =============================================================================
#  GENERADOR PRINCIPAL
# =============================================================================

async def generate_single_ticket(page, output_dir: Path, index: int, apply_effects: bool = True):
    """
    Genera UN ticket completo: imagen + datos JSON.
    Returns: (filename, ground_truth_dict)
    """
    # 1. Generar datos aleatorios
    ticket_data, ground_truth = generate_ticket_data()

    # 2. Generar HTML con estilo aleatorio
    style = get_thermal_style()
    html = render_ticket_html(ticket_data, style)

    # 3. Renderizar HTML en el navegador
    await page.set_content(html)
    await page.wait_for_load_state("networkidle")

    # Ajustar viewport al contenido del ticket
    ticket_element = await page.query_selector(".ticket")
    if ticket_element:
        box = await ticket_element.bounding_box()
        if box:
            # Añadir margen alrededor del ticket
            margin = random.randint(15, 50)
            await page.set_viewport_size({
                "width": int(box["width"] + 2 * margin + box["x"] * 2),
                "height": int(box["height"] + 2 * margin + box["y"])
            })

    # 4. Capturar screenshot
    filename = f"ticket_sintetico_{index:04d}.jpg"
    filepath = output_dir / filename

    # Capturar como PNG temporalmente para calidad
    png_path = output_dir / f"_temp_{index}.png"
    await page.screenshot(path=str(png_path), full_page=True)

    # Convertir a JPG
    img = Image.open(png_path).convert("RGB")
    img.save(str(filepath), "JPEG", quality=95)
    png_path.unlink()  # Borrar el temporal

    # 5. Aplicar efectos de "foto real" (opcional)
    if apply_effects:
        apply_photo_effect(str(filepath))

    return filename, ground_truth


async def run_generation(output_dir: str, count: int, apply_effects: bool, seed: int = None):
    """Ejecuta la generación completa de N tickets."""
    from playwright.async_api import async_playwright

    if seed is not None:
        random.seed(seed)
        np.random.seed(seed)

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    print(f"\n🚀 Iniciando generación de {count} ticket(s) sintético(s)...")
    print(f"📁 Directorio de salida: {output_path}\n")

    entries = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.set_viewport_size({"width": 500, "height": 800})

        for i in range(1, count + 1):
            filename, ground_truth = await generate_single_ticket(
                page, output_path, i, apply_effects
            )
            entries.append({
                "image_path": filename,
                "ground_truth": json.dumps(ground_truth, ensure_ascii=False)
            })
            print(f"  ✅ [{i}/{count}] {filename} "
                  f"({ground_truth['comercio'][:30]}, {len(ground_truth['items'])} items, "
                  f"total: {ground_truth['total']:.2f}€)")

        await browser.close()

    # Guardar JSONL
    jsonl_path = output_path / "dataset_synthetic.jsonl"
    with open(jsonl_path, 'w', encoding='utf-8') as f:
        for entry in entries:
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')

    print(f"\n{'='*60}")
    print(f"  ✅ COMPLETADO")
    print(f"  📊 Tickets generados: {count}")
    print(f"  📄 JSONL guardado en:  {jsonl_path}")
    print(f"  📁 Directorio salida:  {output_path}")
    print(f"{'='*60}\n")


# =============================================================================
#  PUNTO DE ENTRADA
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description='Generador de tickets sintéticos españoles (HTML → Imagen)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos de uso:
  python generate_synthetic_ticket.py                    # 1 ticket (Regla de Oro)
  python generate_synthetic_ticket.py --count 100        # 100 tickets
  python generate_synthetic_ticket.py --count 5 --seed 42
  python generate_synthetic_ticket.py --no-effects       # Sin efectos foto
        """
    )
    parser.add_argument(
        '--output', '-o',
        default=str(Path(__file__).parent / 'output_synthetic'),
        help='Directorio de salida (default: ./output_synthetic)'
    )
    parser.add_argument(
        '--count', '-n',
        type=int,
        default=1,
        help='Número de tickets a generar (default: 1 - Regla de Oro)'
    )
    parser.add_argument(
        '--seed', '-s',
        type=int,
        default=None,
        help='Semilla aleatoria para reproducibilidad'
    )
    parser.add_argument(
        '--no-effects',
        action='store_true',
        help='Omitir efectos de "foto real" en las imágenes'
    )

    args = parser.parse_args()

    print("=" * 60)
    print("  🎫 GENERADOR DE TICKETS SINTÉTICOS")
    print("=" * 60)
    print(f"  📁 Output:   {args.output}")
    print(f"  📊 Count:    {args.count}")
    print(f"  📷 Effects:  {'No' if args.no_effects else 'Sí (simula foto real)'}")
    if args.seed is not None:
        print(f"  🎲 Seed:     {args.seed}")

    import asyncio
    asyncio.run(run_generation(
        output_dir=args.output,
        count=args.count,
        apply_effects=not args.no_effects,
        seed=args.seed
    ))


if __name__ == '__main__':
    main()
