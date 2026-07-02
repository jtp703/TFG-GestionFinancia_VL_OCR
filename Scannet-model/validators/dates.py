"""
Normalizador de fechas a ISO 8601 (YYYY-MM-DD).
Soporta los formatos más comunes en tickets españoles sin dependencias externas.
Si dateparser está instalado se usa como fallback.
"""

import re
from datetime import datetime
from typing import Optional


_MESES_ES = {
    "ene": 1, "enero": 1,
    "feb": 2, "febrero": 2,
    "mar": 3, "marzo": 3,
    "abr": 4, "abril": 4,
    "may": 5, "mayo": 5,
    "jun": 6, "junio": 6,
    "jul": 7, "julio": 7,
    "ago": 8, "agosto": 8,
    "sep": 9, "sept": 9, "septiembre": 9,
    "oct": 10, "octubre": 10,
    "nov": 11, "noviembre": 11,
    "dic": 12, "diciembre": 12,
    # inglés por si acaso
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}


def _try_parse(text: str) -> Optional[datetime]:
    """Intenta parsear con los patrones más comunes en tickets españoles."""
    text = text.strip()

    # DD/MM/YYYY o DD-MM-YYYY o DD.MM.YYYY
    m = re.fullmatch(r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})", text)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return datetime(y, mo, d)
        except ValueError:
            pass

    # YYYY-MM-DD (ya es ISO)
    m = re.fullmatch(r"(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})", text)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return datetime(y, mo, d)
        except ValueError:
            pass

    # DD/MM/YY
    m = re.fullmatch(r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})", text)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        y += 2000 if y < 50 else 1900
        try:
            return datetime(y, mo, d)
        except ValueError:
            pass

    # DD de Mes de YYYY  /  DD Mes YYYY
    m = re.fullmatch(
        r"(\d{1,2})\s+(?:de\s+)?([a-záéíóúüñ]+)\.?\s+(?:de\s+)?(\d{4})",
        text, re.IGNORECASE
    )
    if m:
        d = int(m.group(1))
        mes_str = m.group(2).lower().rstrip(".")
        y = int(m.group(3))
        mo = _MESES_ES.get(mes_str)
        if mo:
            try:
                return datetime(y, mo, d)
            except ValueError:
                pass

    return None


def _try_dateparser(text: str) -> Optional[datetime]:
    try:
        import dateparser
        dt = dateparser.parse(text, languages=["es", "en"])
        return dt
    except ImportError:
        return None


def normalize_date(fecha: str) -> dict:
    """
    Normaliza una fecha al formato ISO 8601.

    Devuelve:
        {
            "iso": "YYYY-MM-DD" | None,
            "fecha_original": str,
            "warning": str | None
        }
    """
    if not fecha:
        return {"iso": None, "fecha_original": fecha, "warning": "dates: fecha ausente o vacía"}

    dt = _try_parse(str(fecha))
    if dt is None:
        dt = _try_dateparser(str(fecha))

    if dt is None:
        return {
            "iso": None,
            "fecha_original": str(fecha),
            "warning": f"dates: no se pudo parsear '{fecha}'"
        }

    return {
        "iso": dt.strftime("%Y-%m-%d"),
        "fecha_original": str(fecha),
        "warning": None
    }


def validate_and_normalize_date(data: dict) -> tuple[dict, list[str]]:
    """
    Normaliza el campo 'fecha' del JSON y devuelve (data_actualizado, warnings).
    Añade 'fecha_original' y sustituye 'fecha' por ISO si se pudo parsear.
    """
    warnings = []
    data = dict(data)

    fecha_raw = data.get("fecha", "")
    result = normalize_date(str(fecha_raw) if fecha_raw else "")

    if result["warning"]:
        warnings.append(result["warning"])

    data["fecha_original"] = result["fecha_original"]
    if result["iso"]:
        data["fecha"] = result["iso"]

    return data, warnings
