"""
Deduplicación de items por distancia de Levenshtein (difflib, sin dependencias externas).
Fusiona items cuya descripción es muy similar (mismo producto, error OCR).
"""

from difflib import SequenceMatcher
from typing import Any


SIMILARITY_THRESHOLD = 0.82  # por encima de este ratio se considera duplicado


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.upper(), b.upper()).ratio()


def _merge_items(items: list[dict]) -> tuple[list[dict], list[str]]:
    """
    Fusiona items duplicados sumando cantidades.
    Devuelve (items_deduplicados, lista_de_warnings).
    """
    warnings = []
    merged: list[dict] = []
    used = [False] * len(items)

    for i, item_a in enumerate(items):
        if used[i]:
            continue
        desc_a = str(item_a.get("descripcion", "")).upper().strip()
        group = [item_a]
        used[i] = True

        for j, item_b in enumerate(items):
            if used[j] or i == j:
                continue
            desc_b = str(item_b.get("descripcion", "")).upper().strip()
            if not desc_a or not desc_b:
                continue
            sim = _similarity(desc_a, desc_b)
            if sim >= SIMILARITY_THRESHOLD:
                group.append(item_b)
                used[j] = True
                warnings.append(
                    f"dedup: '{item_a.get('descripcion')}' y '{item_b.get('descripcion')}' "
                    f"fusionados (similitud {sim:.0%})"
                )

        if len(group) == 1:
            merged.append(item_a)
        else:
            # Fusionar: suma cantidades, conserva precio del primero, descripción más larga
            total_qty = sum(float(it.get("cantidad") or 1) for it in group)
            precio = float(group[0].get("precio") or 0)
            desc_longest = max(
                (str(it.get("descripcion", "")) for it in group),
                key=len
            )
            merged.append({
                "cantidad": total_qty,
                "descripcion": desc_longest,
                "precio": precio,
            })

    return merged, warnings


def dedup_items(data: dict) -> tuple[dict, list[str]]:
    """
    Deduplica la lista de items del JSON.
    Devuelve (data_actualizado, warnings).
    """
    data = dict(data)
    items = data.get("items", [])
    if len(items) < 2:
        return data, []

    deduped, warnings = _merge_items(items)
    data["items"] = deduped
    return data, warnings
