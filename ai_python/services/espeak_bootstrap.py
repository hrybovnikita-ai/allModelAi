"""Ensure espeak-ng data is readable on Windows (non-ASCII user paths break phonemizer)."""

from __future__ import annotations

import os
import shutil
from pathlib import Path


def _path_is_ascii(path: str | Path) -> bool:
    try:
        str(path).encode("ascii")
        return True
    except UnicodeEncodeError:
        return False


def _copy_tree(src: Path, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    for item in src.iterdir():
        target = dest / item.name
        if item.is_dir():
            _copy_tree(item, target)
        else:
            if not target.exists() or target.stat().st_size != item.stat().st_size:
                shutil.copy2(item, target)


def resolve_espeak_data_path() -> str | None:
    """Return a usable espeak-ng-data directory, copying to an ASCII path when needed."""
    override = (os.environ.get("ESPEAK_DATA_PATH") or "").strip()
    if override and Path(override).is_dir():
        return str(Path(override).resolve())

    try:
        import espeakng_loader
    except ImportError:
        return None

    source = Path(espeakng_loader.get_data_path())
    if not source.is_dir():
        return None

    if _path_is_ascii(source):
        return str(source)

    # Prefer ProgramData, then C:\tmp — both avoid Cyrillic usernames.
    candidates = [
        Path(os.environ.get("PROGRAMDATA", r"C:\ProgramData")) / "allmodelai" / "espeak-ng-data",
        Path(r"C:\tmp\espeak-ng-data"),
    ]
    for dest in candidates:
        try:
            marker = dest / "phontab"
            if not marker.exists():
                _copy_tree(source, dest)
            if marker.exists() and _path_is_ascii(dest):
                return str(dest.resolve())
        except OSError:
            continue
    return str(source)


def bootstrap_espeak() -> str | None:
    """Set ESPEAK_DATA_PATH and phonemizer wrapper before Kokoro/misaki import."""
    data_path = resolve_espeak_data_path()
    if not data_path:
        return None
    os.environ["ESPEAK_DATA_PATH"] = data_path
    try:
        from phonemizer.backend.espeak.wrapper import EspeakWrapper

        EspeakWrapper.set_data_path(data_path)
    except Exception:
        pass
    return data_path
