"""
Tests sobre outputs reales del modelo OCR V4.
Ejecutar: python -m validators.tests
"""

import json
from validators import validate

# ── Casos de prueba ────────────────────────────────────────────────────────────

CASOS = [
    {
        "nombre": "Mercadona válido (Test A, recibo_079)",
        "input": {
            "comercio": "MERCADONA, S.A.",
            "cif": "A-46103834",
            "fecha": "16/03/2026",
            "total": 82.39,
            "items": [
                {"cantidad": "1", "descripcion": "BOLSA PLASTICO", "precio": 0.15},
                {"cantidad": "1", "descripcion": "TOMATE PERA TARRINA", "precio": 2.21},
                {"cantidad": "1", "descripcion": "LECHE ENTERA PLU", "precio": 3.50},
                {"cantidad": "1", "descripcion": "LECHE ENTRA PLU", "precio": 3.50},
            ],
        },
        "esperado": {
            "cif_warn": False,   # A-46103834 es CIF válido
            "fecha_iso": "2026-03-16",
            "abbrev_applied": True,   # LECHE ENTERA PLU → LECHE ENTERA
            "dedup_applied": True,    # LECHE ENTERA y LECHE ENTERA fusionadas
        },
    },
    {
        "nombre": "CIF inválido",
        "input": {
            "comercio": "TEST", "cif": "B12345678",
            "fecha": "01/01/2026", "total": 10.0, "items": [],
        },
        "esperado": {"cif_warn": True},
    },
    {
        "nombre": "Aritmética incorrecta",
        "input": {
            "comercio": "DIA", "cif": "",
            "fecha": "12/03/2026", "total": 99.99,
            "items": [
                {"cantidad": 1, "descripcion": "PAN", "precio": 0.50},
                {"cantidad": 1, "descripcion": "CERVEZA LATA 33 CL", "precio": 3.96},
            ],
        },
        "esperado": {"arithmetic_warn": True},
    },
    {
        "nombre": "Fecha formato texto",
        "input": {
            "comercio": "X", "cif": "", "total": 5.0,
            "fecha": "15 de marzo de 2026", "items": [],
        },
        "esperado": {"fecha_iso": "2026-03-15"},
    },
    {
        "nombre": "Fecha ISO ya correcta",
        "input": {
            "comercio": "X", "cif": "", "total": 5.0,
            "fecha": "2026-03-15", "items": [],
        },
        "esperado": {"fecha_iso": "2026-03-15"},
    },
]


def run_tests():
    passed = 0
    failed = 0

    for caso in CASOS:
        result = validate(caso["input"])
        esp = caso["esperado"]
        errors = []

        if "cif_warn" in esp:
            tiene_warn = any("nif_cif" in w for w in result["warnings"])
            if tiene_warn != esp["cif_warn"]:
                errors.append(f"cif_warn esperado={esp['cif_warn']}, obtenido={tiene_warn}")

        if "fecha_iso" in esp:
            fecha = result["normalized_json"].get("fecha")
            if fecha != esp["fecha_iso"]:
                errors.append(f"fecha esperada={esp['fecha_iso']}, obtenida={fecha}")

        if "arithmetic_warn" in esp:
            tiene_warn = any("arithmetic" in w for w in result["warnings"])
            if tiene_warn != esp["arithmetic_warn"]:
                errors.append(f"arithmetic_warn esperado={esp['arithmetic_warn']}, obtenido={tiene_warn}")

        if "abbrev_applied" in esp and esp["abbrev_applied"]:
            items = result["normalized_json"].get("items", [])
            descs = [i.get("descripcion", "") for i in items]
            if any("PLU" in d for d in descs):
                errors.append("abbrev: PLU no fue eliminado")

        if "dedup_applied" in esp and esp["dedup_applied"]:
            items = result["normalized_json"].get("items", [])
            descs = [i.get("descripcion", "").upper() for i in items]
            dupes = [d for d in descs if descs.count(d) > 1]
            if dupes:
                errors.append(f"dedup: duplicados no fusionados: {dupes}")

        if errors:
            print(f"  ❌ FAIL — {caso['nombre']}")
            for e in errors:
                print(f"       {e}")
            print(f"       warnings: {result['warnings']}")
            failed += 1
        else:
            print(f"  ✅ PASS — {caso['nombre']}")
            passed += 1

    print(f"\n{'='*50}")
    print(f"  {passed}/{passed+failed} tests pasaron")
    print(f"{'='*50}")


if __name__ == "__main__":
    run_tests()
