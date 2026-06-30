"""使用 gzip 压缩的本地静态服务器"""
import gzip
import http.server
import io
import os
import re
import sys
import time
import webbrowser

PORT = 8080
COMPRESSIBLE = {".html", ".css", ".js", ".json", ".svg", ".xml", ".txt"}
# 无扩展名的常见纯文本文件名（如 LICENSE、README 等）
COMPRESSIBLE_NAMES = {
    "license", "readme", "makefile", "dockerfile",
    "changelog", "copying", "authors", "contributors",
    "news", "todo", "install", "notice",
}


class GzipHandler(http.server.SimpleHTTPRequestHandler):
    _STATUS_RE = re.compile(r'"\s+([1-5]\d{2})\b')

    @classmethod
    def log_message(cls, fmt, *args):
        msg = fmt % args
        # 提取 HTTP 状态码，按级别着色
        m = cls._STATUS_RE.search(msg)
        if m:
            code = int(m.group(1))
            if code >= 400:
                # 4xx/5xx 错误 → 红色
                msg = f"\033[91m{msg}\033[0m"
            elif code >= 300:
                # 3xx 重定向 → 黄色警告
                msg = f"\033[93m{msg}\033[0m"
        print(msg)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_GET(self):  # noqa: N802 (stdlib override)
        try:
            self._do_get()
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            # 客户端提前关闭连接（关闭页面、取消请求等），静默忽略
            pass

    def _do_get(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            for index in ("index.html", "index.htm"):
                p = os.path.join(path, index)
                if os.path.isfile(p):
                    path = p
                    break

        ext = os.path.splitext(path)[1].lower()
        basename = os.path.splitext(os.path.basename(path))[0].lower()
        accept = self.headers.get("Accept-Encoding", "")

        # 判断是否需要压缩：扩展名在可压缩列表中，或文件名（无扩展名）在已知文本文件列表中
        compressible = ext in COMPRESSIBLE or (ext == "" and basename in COMPRESSIBLE_NAMES)

        if compressible and "gzip" in accept and os.path.isfile(path):
            with open(path, "rb") as fh:
                content = fh.read()

            compressed = io.BytesIO()
            with gzip.GzipFile(fileobj=compressed, mode="wb", compresslevel=6) as gz:
                gz.write(content)
            gz_data = compressed.getvalue()

            if len(gz_data) < len(content):
                self.send_response(200)
                self.send_content_type(ext, basename)
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

    def send_content_type(self, ext, basename=""):
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
        # 无扩展名但在已知文本文件列表中 → 作为纯文本发送
        if ct is None and ext == "" and basename in COMPRESSIBLE_NAMES:
            ct = "text/plain; charset=utf-8"
        if ct:
            self.send_header("Content-Type", ct)


def prompt_yn(message, timeout=5):
    """显示提示并实时倒计时，超时内等待单字符输入，返回 'y'/'n'/None（超时）"""
    if sys.platform == "win32":
        import msvcrt

        def try_read():
            if not msvcrt.kbhit():
                return None
            key = msvcrt.getwch()
            if key == "\x03":
                raise KeyboardInterrupt
            return key
    else:
        import select

        def try_read():
            if not select.select([sys.stdin], [], [], 0.0)[0]:
                return None
            return sys.stdin.read(1)

    start = time.time()
    last_remain = None
    chars = []
    while True:
        remain = timeout - int(time.time() - start)
        if remain < 0:
            remain = 0
        if remain != last_remain:
            print(f"\r{message} ({remain}s): ", end="", flush=True)
            last_remain = remain
        if remain <= 0:
            print()
            return None

        ch = try_read()
        if ch is None:
            time.sleep(0.05)
            continue
        if ch in ("\r", "\n"):
            continue
        chars.append(ch)
        print(ch, end="", flush=True)
        return "".join(chars).strip().lower()


if __name__ == "__main__":
    try:
        server = http.server.HTTPServer(
            ("", PORT),
            lambda request, client_address, srv: GzipHandler(request, client_address, srv),
        )
        url = f"http://localhost:{PORT}"
        print(f"服务已启动于 {url}（gzip 已启用）") #Server running at {url} (gzip enabled)

        answer = prompt_yn(f"是否在浏览器打开 {url}？(y/n)") #Open {url} in browser?

        if answer == "y":
            print("正在打开浏览器...") #Opening browser...
            webbrowser.open(url)
        elif answer == "n":
            print("已取消。") #Cancelled.
        else:
            print("已超时，跳过。") #Timed out, skipping.

        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")