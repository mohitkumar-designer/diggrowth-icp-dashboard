import { join } from "path";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8088;
const BASE_DIR = import.meta.dir;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf"
};

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/" || pathname === "") {
      pathname = "/index.html";
    }

    // Security: prevent directory traversal
    const safePath = join(BASE_DIR, pathname);
    if (!safePath.startsWith(BASE_DIR)) {
      return new Response("403 Forbidden", { status: 403 });
    }

    const file = Bun.file(safePath);
    const exists = await file.exists();
    if (!exists) {
      return new Response("404 Not Found", { status: 404 });
    }

    const ext = pathname.substring(pathname.lastIndexOf(".")).toLowerCase();
    const contentType = mimeTypes[ext] || file.type || "application/octet-stream";

    return new Response(file, {
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache"
      }
    });
  }
});

console.log(`\x1b[32m✔ DiGGrowth ICP & Competitor Analysis Dashboard is running at:\x1b[0m`);
console.log(`  ➜ Local:   http://localhost:${server.port}`);
console.log(`  ➜ Direct:  http://localhost:${server.port}/index.html\n`);
