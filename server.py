"""使用 gzip 压缩的本地静态服务器

性能优化：
- ThreadingHTTPServer：多线程并发处理，浏览器可并行下载多个资源（取代单线程 HTTPServer）
- HTTP/1.1 keep-alive：复用 TCP 连接，减少握手开销（取代默认 HTTP/1.0 短连接）
- ETag + If-None-Match 304：未改动资源返回 304（无 body），二次加载极快
- Cache-Control: no-cache：浏览器可缓存但每次验证，兼顾速度与"改代码即生效"
- gzip 压缩结果 LRU 缓存：避免对同一静态文件重复压缩
"""
import gzip
import io
import os
import re
import sys
import threading
import time
import webbrowser
from collections import OrderedDict
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = 8080
COMPRESSIBLE = {".html", ".css", ".js", ".json", ".svg", ".xml", ".txt"}
# 无扩展名的常见纯文本文件名（如 LICENSE、README 等）
COMPRESSIBLE_NAMES = {
    "license", "readme", "makefile", "dockerfile",
    "changelog", "copying", "authors", "contributors",
    "news", "todo", "install", "notice",
}

# 扩展名 -> Content-Type 映射（覆盖基类 mimetypes，确保 .js/.woff2 等类型准确）
CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".xml": "application/xml; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".eot": "application/vnd.ms-fontobject",
}

# gzip 压缩结果 LRU 缓存：(path, mtime, size) -> bytes
_GZIP_CACHE = OrderedDict()
_GZIP_CACHE_LOCK = threading.Lock()
_GZIP_CACHE_MAX = 64


class GzipHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"  # 启用 keep-alive，复用 TCP 连接

    _STATUS_RE = re.compile(r'"\s+([1-5]\d{2})\b')

    @classmethod
    def log_message(cls, fmt, *args):
        msg = fmt % args
        # 提取 HTTP 状态码，按级别着色
        m = cls._STATUS_RE.search(msg)
        if m:
            code = int(m.group(1))
            if code >= 400:
                msg = f"\033[91m{msg}\033[0m"  # 4xx/5xx 错误 → 红色
            elif code >= 300:
                msg = f"\033[93m{msg}\033[0m"  # 3xx 重定向 → 黄色
        print(msg)

    def guess_type(self, path):
        """覆盖基类：用内置映射避免依赖 mimetypes，确保 .js/.woff2 等类型准确"""
        ext = os.path.splitext(path)[1].lower()
        ct = CONTENT_TYPES.get(ext)
        if ct:
            return ct
        basename = os.path.splitext(os.path.basename(path))[0].lower()
        if ext == "" and basename in COMPRESSIBLE_NAMES:
            return "text/plain; charset=utf-8"
        return super().guess_type(path)

    def end_headers(self):
        # no-cache：允许浏览器缓存但每次验证 ETag，文件未变时 304（无 body），
        # 既加速二次加载，又能让代码改动后刷新即生效（无需手动清缓存）
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):  # noqa: N802 (stdlib override)
        try:
            self._do_get()
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            # 客户端提前关闭连接（关闭页面、取消请求等），静默忽略
            pass

    @staticmethod
    def _etag(st):
        """基于 mtime + size 生成弱 ETag，文件改动即失效"""
        return f'"{int(st.st_mtime)}-{st.st_size}"'

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
        compressible = ext in COMPRESSIBLE or (ext == "" and basename in COMPRESSIBLE_NAMES)

        # 可压缩且客户端接受 gzip：走自定义压缩路径（带 ETag/304 + 压缩缓存）
        if compressible and "gzip" in accept and os.path.isfile(path):
            st = os.stat(path)
            etag = self._etag(st)

            # 304 协商缓存：客户端缓存仍有效，直接返回 304（无 body）
            if self.headers.get("If-None-Match") == etag:
                self.send_response(304)
                self.send_header("ETag", etag)
                self.send_header("Vary", "Accept-Encoding")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return

            gz_data = self._gzip_or_cache(path, st)
            if gz_data is not None:
                self.send_response(200)
                self.send_header("Content-Type", self.guess_type(path))
                self.send_header("Content-Encoding", "gzip")
                self.send_header("Content-Length", str(len(gz_data)))
                self.send_header("ETag", etag)
                self.send_header("Vary", "Accept-Encoding")
                self.end_headers()
                self.wfile.write(gz_data)
                self._log_gzip(st, gz_data)
                return

        # 不可压缩 / 压缩无收益 / 客户端不支持 gzip / 路径无效：走基类
        # 基类自动处理 ETag/304、Content-Type、Content-Length、404
        super().do_GET()

    def _gzip_or_cache(self, path, st):
        """返回 gzip 压缩后的 bytes；若压缩无收益返回 None。结果按 (path, mtime, size) LRU 缓存。"""
        cache_key = (path, st.st_mtime, st.st_size)
        with _GZIP_CACHE_LOCK:
            data = _GZIP_CACHE.get(cache_key)
            if data is not None:
                _GZIP_CACHE.move_to_end(cache_key)  # LRU 提升
                return data
        with open(path, "rb") as fh:
            content = fh.read()
        compressed = io.BytesIO()
        with gzip.GzipFile(fileobj=compressed, mode="wb", compresslevel=6) as gz:
            gz.write(content)
        gz_data = compressed.getvalue()
        if len(gz_data) >= len(content):
            return None  # 压缩无收益（小文件或已压缩格式）
        with _GZIP_CACHE_LOCK:
            _GZIP_CACHE[cache_key] = gz_data
            while len(_GZIP_CACHE) > _GZIP_CACHE_MAX:
                _GZIP_CACHE.popitem(last=False)  # 弹出最旧
        return gz_data

    def _log_gzip(self, st, gz_data):
        orig = st.st_size
        saved = (1 - len(gz_data) / orig) * 100 if orig else 0
        print(
            f"  gzip: {orig:,} -> {len(gz_data):,} bytes "
            f"({saved:.0f}% saved) - {self.path}"
        )


def prompt_yn(message, timeout=10):
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
        # ThreadingHTTPServer：每请求一线程，浏览器可并行下载多个资源
        server = ThreadingHTTPServer(("", PORT), GzipHandler)
        url = f"http://localhost:{PORT}"
        print(f"服务已启动于 {url}（gzip + 多线程 + HTTP/1.1 keep-alive 已启用）")

        answer = prompt_yn(f"是否在浏览器打开 {url}？(y/n)")

        if answer == "y":
            print("正在打开浏览器...")  # Opening browser...
            webbrowser.open(url)
        elif answer == "n":
            print("已取消。")  # Cancelled.
        else:
            print("已超时，跳过。")  # Timed out, skipping.

        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
