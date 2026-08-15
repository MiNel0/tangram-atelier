import argparse
import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


class LibraryStore:
    def __init__(self, path):
        self.path = Path(path)
        self.lock = threading.Lock()

    def _read(self):
        try:
            records = json.loads(self.path.read_text(encoding="utf-8"))
            return records if isinstance(records, list) else []
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            return []

    def read(self):
        with self.lock:
            return self._read()

    def _write(self, records):
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(self.path)

    def upsert(self, record):
        if not isinstance(record, dict) or not isinstance(record.get("id"), str) or not isinstance(record.get("project"), dict):
            raise ValueError("Invalid record")
        with self.lock:
            records = [item for item in self._read() if item.get("id") != record["id"]]
            records.append(record)
            records.sort(key=lambda item: item.get("updatedAt", 0), reverse=True)
            self._write(records[:100])

    def delete(self, record_id):
        with self.lock:
            self._write([item for item in self._read() if item.get("id") != record_id])


class TangramHandler(SimpleHTTPRequestHandler):
    store = None

    def _json(self, status, value):
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if urlsplit(self.path).path == "/api/library":
            self._json(200, self.store.read())
        else:
            super().do_GET()

    def do_POST(self):
        if urlsplit(self.path).path != "/api/library":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 5 * 1024 * 1024:
                raise ValueError()
            record = json.loads(self.rfile.read(length))
            self.store.upsert(record)
            self._json(200, {"ok": True})
        except (ValueError, json.JSONDecodeError):
            self._json(400, {"error": "Sauvegarde invalide"})

    def do_DELETE(self):
        path = urlsplit(self.path).path
        if not path.startswith("/api/library/"):
            self.send_error(404)
            return
        self.store.delete(unquote(path.removeprefix("/api/library/")))
        self._json(200, {"ok": True})

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    TangramHandler.store = LibraryStore(root / "tangram-library.json")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(TangramHandler, directory=root))
    print(f"Tangram Atelier : http://127.0.0.1:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
