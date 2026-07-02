"""
Validador de NIF/CIF español con checksum.
"""

import re


# Letras de control NIF (índice = DNI mod 23)
_NIF_LETRAS = "TRWAGMYFPDXBNJZSQVHLCKE"

# Letras válidas para el primer carácter de un CIF
_CIF_LETRAS_INICIO = "ABCDEFGHJKLMNPQRSUVW"

# Tabla de suma de dígitos para CIF
_CIF_TABLA = [0, 2, 4, 6, 8, 1, 3, 5, 7, 9]


def _strip_cif(cif: str) -> str:
    return re.sub(r"[-.\s]", "", cif).upper().strip()


def validate_nif(nif: str) -> bool:
    """Valida un NIF español (8 dígitos + letra)."""
    nif = _strip_cif(nif)
    if not re.fullmatch(r"\d{8}[A-Z]", nif):
        return False
    numero = int(nif[:8])
    letra_esperada = _NIF_LETRAS[numero % 23]
    return nif[-1] == letra_esperada


def validate_cif(cif: str) -> bool:
    """Valida un CIF español (letra + 7 dígitos + dígito/letra de control)."""
    cif = _strip_cif(cif)
    if not re.fullmatch(r"[A-Z]\d{7}[A-Z0-9]", cif):
        return False
    if cif[0] not in _CIF_LETRAS_INICIO:
        return False

    digits = cif[1:8]
    suma_pares = sum(int(d) for d in digits[1::2])
    suma_impares = sum(_CIF_TABLA[int(d)] for d in digits[0::2])
    total = (suma_pares + suma_impares) % 10
    control_numerico = (10 - total) % 10

    control_letra = chr(ord("A") + control_numerico)
    control_digito = str(control_numerico)
    ultimo = cif[-1]

    # Organizaciones de tipo A,B,E,H deben tener dígito; P,Q,S,W deben tener letra
    tipo = cif[0]
    if tipo in "ABEH":
        return ultimo == control_digito
    elif tipo in "PQSW":
        return ultimo == control_letra
    else:
        return ultimo in (control_digito, control_letra)


def validate_cif_field(data: dict) -> list[str]:
    """
    Valida el campo cif/nif del JSON extraído.
    Devuelve lista de warnings.
    """
    warnings = []
    cif = data.get("cif", "")
    if not cif:
        return warnings  # ausente es tolerable — muchos tickets no lo muestran

    cif_clean = _strip_cif(str(cif))
    if not cif_clean:
        return warnings

    es_nif = re.fullmatch(r"\d{8}[A-Z]", cif_clean)
    es_cif = re.fullmatch(r"[A-Z]\d{7}[A-Z0-9]", cif_clean)

    if es_nif:
        if not validate_nif(cif_clean):
            warnings.append(f"nif_cif: NIF '{cif}' tiene letra de control incorrecta")
    elif es_cif:
        if not validate_cif(cif_clean):
            warnings.append(f"nif_cif: CIF '{cif}' tiene dígito de control incorrecto")
    else:
        warnings.append(f"nif_cif: '{cif}' no tiene formato NIF (8D+L) ni CIF (L+7D+C)")

    return warnings
