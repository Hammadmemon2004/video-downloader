# NexDL API (FastAPI)

Universal social downloader backend using **yt-dlp** and **FFmpeg** (merge/remux).

## Requirements

- Python **3.10+**
- **FFmpeg** on `PATH` (required for most merged video outputs)
- Internet access for extractors

## Setup

### Windows — PowerShell

From the repo root:

```powershell
cd D:\xampp\htdocs\video-downloader\backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

If `python` is missing but `py` works, use `py -3` everywhere instead of `python`.

### Windows — Git Bash (MINGW64)

In Bash, **do not** use `cd d:\xampp\...` with backslashes (they act as escapes and break the path). Use a **Unix-style** path. Your prompt already shows you are under `/d/xampp/...`; stay in `backend` and run:

```bash
cd /d/xampp/htdocs/video-downloader/backend
py -3 -m venv .venv
source .venv/Scripts/activate
python -m pip install -r requirements.txt
```

Activation in Bash is **`source .venv/Scripts/activate`**, not `.\\.venv\\Scripts\\activate` (that is PowerShell).

### Linux / macOS

```bash
cd /path/to/video-downloader/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### “Python was not found” / “pip: command not found”

1. Install **Python 3.10+** from [python.org](https://www.python.org/downloads/) and tick **“Add python.exe to PATH”** during setup.
2. On Windows 10/11, open **Settings → Apps → Advanced app settings → App execution aliases** and turn **off** the aliases for `python.exe` and `python3.exe` if they point to the empty Microsoft Store stub (that stub prints “run without arguments to install from the Microsoft Store”).
3. Close and reopen the terminal, then run `py -3 --version` or `python --version`.

## Run

With the virtual environment **activated**:

```bash
python main.py
```

Or:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

- API docs: `http://127.0.0.1:8000/docs`
- Health: `GET /health`

## Configuration (environment)

| Variable | Description |
|----------|-------------|
| `NEXDL_MAX_DOWNLOAD_BYTES` | Max file size (default ~500 MiB) |
| `NEXDL_TEMP_DIR` | Temp download directory |
| `NEXDL_CORS_ALLOW_ALL` | `true` / `false` — when `false`, uses restricted `NEXDL_CORS_ORIGINS` |
| `NEXDL_SOCKET_TIMEOUT` | yt-dlp socket timeout (seconds) |
| `NEXDL_YTDLP_COOKIEFILE` | Path to Netscape `cookies.txt` while logged into YouTube (stops many “sign in / bot” errors) |
| `NEXDL_YTDLP_COOKIES_FROM_BROWSER` | e.g. `chrome`, `edge:Default`, or `firefox::container` — same user/machine as the API |

## Endpoints

- `POST /analyze` — metadata + dynamic `qualities` (labels from available heights / audio tiers) and `formats`
- `POST /download` — body includes `format_id` from analyze; streams file and deletes temp data after send
- `GET /health` — process + yt-dlp / FFmpeg probes

## Supported domains (pre-check)

YouTube, Instagram, TikTok, Facebook, Pinterest, X/Twitter — other hosts return `unsupported_platform` before yt-dlp.

## Notes

- YouTube often requires cookies (bot / age checks). Set `NEXDL_YTDLP_COOKIEFILE` or `NEXDL_YTDLP_COOKIES_FROM_BROWSER` as documented above.
- Set `NEXDL_CORS_ALLOW_ALL=false` in production and list explicit origins.
