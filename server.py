"""使用 gzip 压缩的本地静态服务器"""
from typing import Any, cast
import http.server
import gzip
import os
import io

PORT = 8080
COMPRESSIBLE = {".html", ".css", ".js", ".json", ".svg", ".xml", ".txt"}


class GzipHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(fmt % args)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_GET(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            for index in ("index.html", "index.htm"):
                p = os.path.join(path, index)
                if os.path.isfile(p):
                    path = p
                    break

        ext = os.path.splitext(path)[1].lower()
        accept = self.headers.get("Accept-Encoding", "")

        if ext in COMPRESSIBLE and "gzip" in accept and os.path.isfile(path):
            with open(path, "rb") as fh:
                content = fh.read()

            compressed = io.BytesIO()
            with gzip.GzipFile(fileobj=compressed, mode="wb", compresslevel=6) as gz:
                gz.write(content)
            gz_data = compressed.getvalue()

            if len(gz_data) < len(content):
                self.send_response(200)
                self.send_content_type(ext)
                self.send_header("Content-Encoding", "gzip")
                self.send_header("Content-Length", str(len(gz_data)))
                self.send_header("Vary", "Accept-Encoding")
                self.end_headers()
                self.wfile.write(gz_data)
                print(
                    f"  gzip: {len(content):,} -> {len(gz_data):,} bytes "
                    f"({(1 - len(gz_data) / len(content)) * 100:.0f}% saved) - {self.path}"
                )
                return

        super().do_GET()

    def send_content_type(self, ext):
        mapping = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".svg": "image/svg+xml",
            ".xml": "application/xml; charset=utf-8",
            ".txt": "text/plain; charset=utf-8",
        }
        ct = mapping.get(ext)
        if ct:
            self.send_header("Content-Type", ct)


if __name__ == "__main__":
    server = http.server.HTTPServer(("", PORT), cast(Any, GzipHandler))
    print(f"Server running at http://localhost:{PORT} (gzip enabled)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")