"""
Diccionario de abreviaturas para normalizar descripciones de productos en tickets españoles.
Prioridad: sufijos/palabras sueltas frecuentes en tickets de supermercado.
"""

import re


# Abreviaturas ordenadas de más específicas a más genéricas
# Clave: patrón (regex, case-insensitive) → Valor: reemplazo
_ABBREV: list[tuple[str, str]] = [
    # Sufijos de gestión interna que no aportan info al usuario
    (r"\bPLU\b", ""),
    (r"\bPVP\b", ""),
    (r"\bREF\b", ""),
    (r"\bCOD\.?\b", ""),
    (r"\bART\.?\b", ""),
    (r"\bUNI\b", ""),
    (r"\bUD\.?\b", ""),
    (r"\bUDS\.?\b", ""),

    # Formatos de envase
    (r"\bBOT\.?\b", "BOTELLA"),
    (r"\bBRK\.?\b", "BRICK"),
    (r"\bBOL\.?\b", "BOLSA"),
    (r"\bLAT\.?\b", "LATA"),
    (r"\bPAK\.?\b", "PACK"),
    (r"\bPCK\.?\b", "PACK"),
    (r"\bTRN\.?\b", "TARRINA"),
    (r"\bENV\.?\b", "ENVASE"),
    (r"\bFRAS\.?\b", "FRASCO"),
    (r"\bTET\.?\b", "TETRABRIK"),

    # Tipos de producto
    (r"\bLECHE\s+ENTRA\b", "LECHE ENTERA"),   # error OCR frecuente
    (r"\bYOG\.?\b", "YOGUR"),
    (r"\bYOGT\.?\b", "YOGUR"),
    (r"\bMANTEQ\.?\b", "MANTEQUILLA"),
    (r"\bMARG\.?\b", "MARGARINA"),
    (r"\bQUES\.?\b", "QUESO"),
    (r"\bJAM\.?\b", "JAMÓN"),
    (r"\bEMB\.?\b", "EMBUTIDO"),
    (r"\bPOLL\.?\b", "POLLO"),
    (r"\bPESC\.?\b", "PESCADO"),
    (r"\bCARN\.?\b", "CARNE"),
    (r"\bVERD\.?\b", "VERDURA"),
    (r"\bFRUT\.?\b", "FRUTA"),
    (r"\bCONG\.?\b", "CONGELADO"),
    (r"\bFRESC\.?\b", "FRESCO"),
    (r"\bECO\.?\b", "ECOLÓGICO"),
    (r"\bBIO\.?\b", "BIOLÓGICO"),
    (r"\bINT\.?\b", "INTEGRAL"),
    (r"\bSIN\s+LAC\.?\b", "SIN LACTOSA"),
    (r"\bS\.LAC\.?\b", "SIN LACTOSA"),
    (r"\bS\/G\.?\b", "SIN GLUTEN"),
    (r"\bSIN\s+GLUT\.?\b", "SIN GLUTEN"),

    # Bebidas
    (r"\bCERV\.?\b", "CERVEZA"),
    (r"\bREFR\.?\b", "REFRESCO"),
    (r"\bZUM\.?\b", "ZUMO"),
    (r"\bAGUA\s+MIN\.?\b", "AGUA MINERAL"),
    (r"\bVIN\.?\b", "VINO"),

    # Panadería / bollería
    (r"\bPAN\s+MOL\.?\b", "PAN DE MOLDE"),
    (r"\bPAN\s+TOA\.?\b", "PAN DE TOAST"),
    (r"\bBOLL\.?\b", "BOLLO"),
    (r"\bGALL\.?\b", "GALLETAS"),

    # Limpieza / higiene
    (r"\bDET\.?\b", "DETERGENTE"),
    (r"\bSUAV\.?\b", "SUAVIZANTE"),
    (r"\bFREG\.?\b", "FREGASUELOS"),
    (r"\bLEJ\.?\b", "LEJÍA"),
    (r"\bCH\.?\bGEL\.?\b", "GEL DE DUCHA"),
    (r"\bSH\.?\b", "CHAMPÚ"),
    (r"\bPAST\.?\s+DENT\.?\b", "PASTA DE DIENTES"),

    # Marcas propias frecuentes (abreviadas)
    (r"\bHACEN\.?\b", "HACENDADO"),
    (r"\bBELLAS\.?\b", "BELLAROM"),
    (r"\bDEL\s+MAR\.?\b", "DEL MAR"),

    # Adjetivos / formatos extra
    (r"\bGRAN\.?\b", "GRANDE"),
    (r"\bPEQ\.?\b", "PEQUEÑO"),
    (r"\bMED\.?\b", "MEDIANO"),
    (r"\bNAT\.?\b", "NATURAL"),
    (r"\bTRAD\.?\b", "TRADICIONAL"),
    (r"\bESP\.?\b", "ESPECIAL"),
    (r"\bSEL\.?\b", "SELECCIÓN"),
    (r"\bPREM\.?\b", "PREMIUM"),
    (r"\bCLAS\.?\b", "CLÁSICO"),
    (r"\bORIG\.?\b", "ORIGINAL"),
    (r"\bSUAV\.?\b", "SUAVE"),

    # Pesos / unidades en descripción
    (r"\bKGS?\b", "KG"),
    (r"\bGRS?\b", "GR"),
    (r"\bLTS?\b", "L"),
    (r"\bCLS?\b", "CL"),
    (r"\bMLS?\b", "ML"),
]

# Compilar una vez al importar
_COMPILED = [(re.compile(pat, re.IGNORECASE), rep) for pat, rep in _ABBREV]


def expand_abbreviations(text: str) -> str:
    """
    Expande abreviaturas en una descripción de producto.
    Elimina espacios múltiples resultantes.
    """
    for pattern, replacement in _COMPILED:
        text = pattern.sub(replacement, text)
    # Limpiar espacios dobles y extremos
    text = re.sub(r"\s{2,}", " ", text).strip()
    return text


def normalize_items_descriptions(data: dict) -> dict:
    """Aplica expand_abbreviations a todos los items del JSON."""
    data = dict(data)
    items = data.get("items", [])
    normalized = []
    for item in items:
        item = dict(item)
        if "descripcion" in item and item["descripcion"]:
            item["descripcion"] = expand_abbreviations(str(item["descripcion"]))
        normalized.append(item)
    data["items"] = normalized
    return data
