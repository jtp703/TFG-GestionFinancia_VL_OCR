"""
Pipeline principal de validación y normalización.
Entrada: dict con el JSON extraído por el modelo OCR.
Salida:  {"valid": bool, "warnings": list[str], "normalized_json": dict}
"""

from .arithmetic import validate_arithmetic
from .nif_cif import validate_cif_field
from .dates import validate_and_normalize_date
from .abbreviations import normalize_items_descriptions
from .dedup import dedup_items


def validate(data: dict) -> dict:
    """
    Ejecuta todos los validadores en orden y devuelve el resultado normalizado.

    Orden:
      1. Normalizar fechas  (modifica data)
      2. Expandir abreviaturas (modifica data)
      3. Deduplicar items   (modifica data)
      4. Validar aritmética (solo lectura)
      5. Validar CIF/NIF    (solo lectura)
    """
    warnings: list[str] = []

    # 1. Fechas
    data, w = validate_and_normalize_date(data)
    warnings.extend(w)

    # 2. Abreviaturas
    data = normalize_items_descriptions(data)

    # 3. Dedup items
    data, w = dedup_items(data)
    warnings.extend(w)

    # 4. Aritmética
    w = validate_arithmetic(data)
    warnings.extend(w)

    # 5. CIF/NIF
    w = validate_cif_field(data)
    warnings.extend(w)

    # Determinar si el resultado es válido (sin errores críticos)
    # Se considera válido aunque haya warnings — solo inválido si hay errores de parseo
    critical = [w for w in warnings if any(
        kw in w for kw in ["no es numérico", "no se pudo parsear", "no tiene formato"]
    )]
    valid = len(critical) == 0

    return {
        "valid": valid,
        "warnings": warnings,
        "normalized_json": data,
    }
