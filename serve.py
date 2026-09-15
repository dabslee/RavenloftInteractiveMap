#!/usr/bin/env python3
"""
Castle Ravenloft VTT Mapper - local server.

Run this from the folder it lives in:

    python serve.py

It serves the mapping interface at http://localhost:8731, a read-only reader
at http://localhost:8731/browse, and reads the
battlemaps straight off disk from ../References/img/map_packs. Every edit you
make in the browser is written to  castle-ravenloft-annotations.json  next to
this file. Nothing leaves your machine.

Map packs: each folder under References/img/map_packs is an interchangeable set
of battlemaps, named by the file names in map_packs/default. Drop a new folder
in beside them, put any of those file names inside, and it shows up in the pack
picker in both the editor and the reader; anything the pack leaves out falls
back to default. An optional pack.json in the folder gives it a display name.

Options:
    --port 8731      change the port
    --no-browser     don't open a browser window
    --root PATH      folder that holds References/ (default: parent folder)
"""
import argparse
import base64
import copy
import http.server
import json
import mimetypes
import os
import posixpath
import shutil
import socketserver
import sys
import threading
import time
import urllib.parse
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
ANNOTATIONS = os.path.join(HERE, "castle-ravenloft-annotations.json")
BACKUPS = os.path.join(HERE, "backups")
EXPORTS = os.path.join(HERE, "exports")

mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("application/json", ".json")

MAP_PACKS = os.path.join("References", "img", "map_packs")
DEFAULT_PACK = "default"

EMPTY = {
    "version": 1,
    "updated": None,
    "grids": {},
    "marks": {},
    "customFeatures": {},
    "hiddenFeatures": [],
    "roomStatus": {},
    "roomNotes": {},
    # links you made or refused by hand, as pairs joined by a bar; everything
    # else under "links" on a mark is worked out from the marks themselves
    "linkEdits": {"same": [], "notSame": [], "conn": [], "notConn": []},
}

_lock = threading.Lock()


def load_annotations():
    # deep copies throughout: EMPTY holds nested defaults, and handing the same
    # objects out twice would let one request's edits show up in another's
    if not os.path.exists(ANNOTATIONS):
        return copy.deepcopy(EMPTY)
    try:
        with open(ANNOTATIONS, encoding="utf-8") as fh:
            data = json.load(fh)
        for k, v in EMPTY.items():
            data.setdefault(k, copy.deepcopy(v))
        return data
    except Exception as exc:  # corrupt file: keep it, start clean
        sys.stderr.write("! could not read %s (%s); starting from empty\n"
                         % (ANNOTATIONS, exc))
        return copy.deepcopy(EMPTY)


def save_annotations(data):
    """Atomic write plus a rolling backup so a bad save can never lose work."""
    with _lock:
        data["updated"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        os.makedirs(BACKUPS, exist_ok=True)
        if os.path.exists(ANNOTATIONS):
            stamp = time.strftime("%Y%m%d-%H%M")
            bak = os.path.join(BACKUPS, "annotations-%s.json" % stamp)
            if not os.path.exists(bak):
                try:
                    shutil.copy2(ANNOTATIONS, bak)
                except Exception:
                    pass
                _trim_backups()
        tmp = ANNOTATIONS + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=1, ensure_ascii=False)
        os.replace(tmp, ANNOTATIONS)
    return data


def _trim_backups(keep=40):
    try:
        files = sorted(os.listdir(BACKUPS))
        for f in files[:-keep]:
            os.remove(os.path.join(BACKUPS, f))
    except Exception:
        pass


# ------------------------------------------------------------------ map packs
def _webp_size(path):
    """Width and height straight out of a WebP header, without an image library."""
    try:
        with open(path, "rb") as fh:
            d = fh.read(32)
        if len(d) < 30 or d[:4] != b"RIFF" or d[8:12] != b"WEBP":
            return None
        fmt = d[12:16]
        if fmt == b"VP8X":
            return (int.from_bytes(d[24:27], "little") + 1,
                    int.from_bytes(d[27:30], "little") + 1)
        if fmt == b"VP8L":
            bits = int.from_bytes(d[21:25], "little")
            return ((bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1)
        if fmt == b"VP8 ":
            return (int.from_bytes(d[26:28], "little") & 0x3FFF,
                    int.from_bytes(d[28:30], "little") & 0x3FFF)
    except Exception:
        pass
    return None


def list_map_packs(root):
    """Every folder under References/img/map_packs, with the sheets it carries.

    A pack only has to hold the sheets it actually replaces: the browser falls
    back to the default pack for anything missing, which is why each file is
    reported with its pixel size -- a sheet that is not the size the grid was
    measured against gets drawn scaled, and the editor says so.
    """
    base = os.path.join(root, *MAP_PACKS.split(os.sep))
    packs = []
    if not os.path.isdir(base):
        return {"base": MAP_PACKS.replace(os.sep, "/"), "default": DEFAULT_PACK, "packs": packs}
    for name in sorted(os.listdir(base)):
        folder = os.path.join(base, name)
        if not os.path.isdir(folder) or name.startswith("."):
            continue
        meta = {}
        manifest = os.path.join(folder, "pack.json")
        if os.path.isfile(manifest):
            try:
                with open(manifest, encoding="utf-8") as fh:
                    meta = json.load(fh) or {}
            except Exception as exc:
                sys.stderr.write("! bad %s (%s); ignoring it\n" % (manifest, exc))
        files = {}
        for f in sorted(os.listdir(folder)):
            full = os.path.join(folder, f)
            if not os.path.isfile(full) or not f.lower().endswith(
                    (".webp", ".png", ".jpg", ".jpeg")):
                continue
            size = _webp_size(full) if f.lower().endswith(".webp") else None
            files[f] = {"bytes": os.path.getsize(full),
                        "w": size[0] if size else None,
                        "h": size[1] if size else None}
        packs.append({
            "id": name,
            "name": meta.get("name") or name.replace("_", " ").title(),
            "note": meta.get("note") or "",
            "files": files,
        })
    packs.sort(key=lambda p: (p["id"] != DEFAULT_PACK, p["id"]))
    return {"base": MAP_PACKS.replace(os.sep, "/"), "default": DEFAULT_PACK, "packs": packs}


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "RavenloftVTT/1.0"
    project_root = HERE

    # -- helpers -------------------------------------------------------
    def _send(self, code, body=b"", ctype="text/plain; charset=utf-8", extra=None):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, code, obj):
        self._send(code, json.dumps(obj), "application/json; charset=utf-8")

    def _file(self, path):
        if not os.path.isfile(path):
            self._send(404, "not found: %s" % os.path.basename(path))
            return
        ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
        size = os.path.getsize(path)
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(size))
        self.send_header("Cache-Control", "no-store" if path.endswith(
            (".html", ".js", ".css", ".json")) else "max-age=86400")
        self.end_headers()
        if self.command == "HEAD":
            return
        with open(path, "rb") as fh:
            shutil.copyfileobj(fh, self.wfile)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        raw = b""
        while len(raw) < n:
            chunk = self.rfile.read(min(1 << 20, n - len(raw)))
            if not chunk:
                break
            raw += chunk
        return raw

    def log_message(self, fmt, *args):
        if "/api/" in (self.path or ""):
            sys.stderr.write("  %s %s\n" % (self.command, self.path))

    # -- routes --------------------------------------------------------
    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/":
            return self._file(os.path.join(HERE, "index.html"))
        if path in ("/browse", "/browse/"):
            return self._file(os.path.join(HERE, "browse.html"))
        if path == "/api/annotations":
            return self._json(200, load_annotations())
        if path == "/api/map-packs":
            return self._json(200, list_map_packs(self.project_root))
        if path == "/api/info":
            return self._json(200, {
                "root": self.project_root,
                "annotations": ANNOTATIONS,
                "exports": EXPORTS,
            })
        if path.startswith("/maps/"):
            rel = urllib.parse.unquote(path[len("/maps/"):])
            return self._file(self._safe(self.project_root, rel))
        if path.startswith("/app/") or path in ("/index.html",):
            rel = path.lstrip("/")
            if rel.startswith("app/"):
                rel = rel[4:]
            return self._file(self._safe(HERE, rel))
        for name in ("app.js", "app.css", "browse.html", "browse.js", "browse.css",
                     "castle-data.json", "favicon.ico"):
            if path == "/" + name:
                return self._file(os.path.join(HERE, name))
        self._send(404, "not found")

    def do_PUT(self):
        path = urllib.parse.urlparse(self.path).path
        if path != "/api/annotations":
            return self._send(404, "not found")
        try:
            data = json.loads(self._body().decode("utf-8"))
        except Exception as exc:
            return self._json(400, {"error": str(exc)})
        if not isinstance(data, dict):
            return self._json(400, {"error": "expected an object"})
        saved = save_annotations(data)
        self._json(200, {"ok": True, "updated": saved["updated"]})

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        if path != "/api/export":
            return self._send(404, "not found")
        try:
            payload = json.loads(self._body().decode("utf-8"))
            name = os.path.basename(payload["filename"])
            os.makedirs(EXPORTS, exist_ok=True)
            dest = os.path.join(EXPORTS, name)
            if "base64" in payload:
                blob = base64.b64decode(payload["base64"])
                with open(dest, "wb") as fh:
                    fh.write(blob)
            else:
                with open(dest, "w", encoding="utf-8") as fh:
                    fh.write(payload["text"])
        except Exception as exc:
            return self._json(400, {"error": str(exc)})
        sys.stderr.write("  wrote %s\n" % dest)
        self._json(200, {"ok": True, "path": dest})

    @staticmethod
    def _safe(base, rel):
        rel = posixpath.normpath("/" + rel.replace("\\", "/")).lstrip("/")
        full = os.path.normpath(os.path.join(base, *rel.split("/")))
        if not full.startswith(os.path.normpath(base)):
            raise ValueError("path escapes root")
        return full


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    ap = argparse.ArgumentParser(description="Castle Ravenloft VTT mapper")
    ap.add_argument("--port", type=int, default=8731)
    ap.add_argument("--root", default=os.path.dirname(HERE),
                    help="folder containing References/ (default: parent of this script)")
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()

    root = os.path.abspath(args.root)
    Handler.project_root = root
    img = os.path.join(root, "References", "img")
    if not os.path.isdir(img):
        sys.stderr.write(
            "! No References/img folder under %s\n"
            "  Put this script's folder inside your Ravenloft folder, or pass --root.\n" % root)
    packs = list_map_packs(root)["packs"]
    if not packs:
        sys.stderr.write(
            "! No map packs under %s\n"
            "  The battlemaps belong in map_packs/default inside References/img.\n"
            % os.path.join(root, *MAP_PACKS.split(os.sep)))

    url = "http://localhost:%d/" % args.port
    print("Castle Ravenloft VTT mapper")
    print("  maps from   : %s" % os.path.join(root, *MAP_PACKS.split(os.sep)))
    print("  map packs   : %s" % (", ".join(
        "%s (%d sheets)" % (p["id"], len(p["files"])) for p in packs) or "none found"))
    print("  saving to   : %s" % ANNOTATIONS)
    print("  exports to  : %s" % EXPORTS)
    print("  open        : %s" % url)
    print("  stop        : Ctrl+C")
    if not args.no_browser:
        threading.Timer(0.7, lambda: webbrowser.open(url)).start()
    try:
        Server(("127.0.0.1", args.port), Handler).serve_forever()
    except KeyboardInterrupt:
        print("\nstopped.")


if __name__ == "__main__":
    main()
