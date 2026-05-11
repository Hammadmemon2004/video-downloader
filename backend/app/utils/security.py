import re
import uuid


def safe_filename_fragment(name: str, max_len: int = 80) -> str:
    """Strip path components and dangerous chars; keep ASCII alnum + simple punctuation."""
    base = name.strip() or "download"
    base = re.sub(r"[^\w\s\-]", "", base, flags=re.ASCII)
    base = re.sub(r"\s+", "_", base).strip("_")
    if not base:
        base = "download"
    return base[:max_len]


def unique_temp_basename(prefix: str = "nexdl") -> str:
    return f"{prefix}_{uuid.uuid4().hex}"
