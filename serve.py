#!/usr/bin/env python3
"""
Castle Ravenloft VTT Mapper - local server.

Run this from the folder it lives in:

    python serve.py

It serves the mapping interface at http://localhost:8731, a read-only reader
at http://localhost:8731/browse, and reads the
battlemaps straight off disk from ../References/img. Every edit you make in
the browser is written to  castle-ravenloft-annotations.json  next to this
file. Nothing leaves your machine.

Options:
    --port 8731      change the port
    --no-browser     don't open a browser window
    --root PATH      folder that holds References/ (default: parent folder)
"""
import argparse
import base64
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

EMPTY = {
    "version": 1,
    "updated": None,
    "grids": {},
    "marks": {},
    "customFeatures": {},
    "hiddenFeatures": [],
    "roomStatus": {},
    "roomNotes": {},
}

_lock = threading.Lock()


def load_annotations():
    if not os.path.exists(ANNOTATIONS):
        return dict(EMPTY)
    try:
        with open(ANNOTATIONS, encoding="utf-8") as fh:
            data = json.load(fh)
        for k, v in EMPTY.items():
            data.setdefault(k, v)
        return data
    except Exception as exc:  # corrupt file: keep it, start clean
        sys.stderr.write("! could not read %s (%s); starting from empty\n"
                         % (ANNOTATIONS, exc))
        return dict(EMPTY)


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

    url = "http://localhost:%d/" % args.port
    print("Castle Ravenloft VTT mapper")
    print("  maps from   : %s" % img)
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
