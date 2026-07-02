"""
Validador aritmético: verifica que la suma de líneas coincide con el total.
"""

from typing import Any


TOLERANCE = 0.05  # euros — cubre redondeos en tickets largos


def validate_arithmetic(data: dict) -> list[str]:
    """
    Comprueba que sum(cantidad × precio) ≈ total.
    Devuelve lista de warnings (vacía si todo cuadra).
    """
    warnings = []

    total = data.get("total")
    items = data.get("items", [])

    if total is None:
        warnings.append("arithmetic: campo 'total' ausente o null")
        return warnings

    try:
        total_float = float(total)
    except (TypeError, ValueError):
        warnings.append(f"arithmetic: 'total' no es numérico ({total!r})")
        return warnings

    if not items:
        return warnings

    suma = 0.0
    for i, item in enumerate(items):
        try:
            cantidad = float(item.get("cantidad", 1) or 1)
            precio = float(item.get("precio", 0) or 0)
            suma += round(cantidad * precio, 4)
        except (TypeError, ValueError) as e:
            warnings.append(f"arithmetic: item[{i}] tiene valores no numéricos ({e})")

    suma = round(suma, 2)
    total_float = round(total_float, 2)
    diff = abs(suma - total_float)

    if diff > TOLERANCE:
        warnings.append(
            f"arithmetic: suma de líneas ({suma:.2f}€) ≠ total ({total_float:.2f}€) "
            f"— diferencia {diff:.2f}€"
        )

    return warnings
