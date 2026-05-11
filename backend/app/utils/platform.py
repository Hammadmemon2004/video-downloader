from enum import Enum
from urllib.parse import urlparse


class Platform(str, Enum):
    YOUTUBE = "youtube"
    INSTAGRAM = "instagram"
    TIKTOK = "tiktok"
    FACEBOOK = "facebook"
    PINTEREST = "pinterest"
    X = "x"
    UNKNOWN = "unknown"


def detect_platform(url: str) -> Platform:
    host = (urlparse(url).netloc or "").lower()
    if host.startswith("www."):
        host = host[4:]

    if "youtube.com" in host or "youtu.be" in host or "m.youtube.com" in host:
        return Platform.YOUTUBE
    if "instagram.com" in host:
        return Platform.INSTAGRAM
    if "tiktok.com" in host or "vm.tiktok.com" in host or "vt.tiktok.com" in host:
        return Platform.TIKTOK
    if (
        "facebook.com" in host
        or "fb.com" in host
        or "fb.watch" in host
        or "m.facebook.com" in host
    ):
        return Platform.FACEBOOK
    if "pinterest.com" in host or "pin.it" in host:
        return Platform.PINTEREST
    if "twitter.com" in host or "x.com" in host or "mobile.twitter.com" in host:
        return Platform.X

    return Platform.UNKNOWN


def is_supported_url(url: str) -> bool:
    return detect_platform(url) != Platform.UNKNOWN
