// Isolated loopback-only production preview for visual/performance tests. No cloud proxy.
import { createServer, request as proxyRequest } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, relative, extname, isAbsolute } from 'node:path'

const root = resolve(process.argv[2] ?? 'apps/web/dist')
const port = Number(process.argv[3] ?? 5175)
const apiPort = Number(process.argv[4] ?? 8002)
if (relative(process.cwd(), root).startsWith('..') || isAbsolute(relative(process.cwd(), root)) || !Number.isInteger(port) || !Number.isInteger(apiPort)
  || port < 1024 || port > 65535 || apiPort < 1024 || apiPort > 65535) throw new Error('Workspace root / local ports required')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' }
createServer(async (req, res) => {
  if (req.url?.startsWith('/api/')) {
    const upstream = proxyRequest({ hostname: '127.0.0.1', port: apiPort, path: req.url, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${apiPort}` } }, response => {
      res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res)
    })
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Local API unavailable') })
    req.on('aborted', () => upstream.destroy()); res.on('close', () => upstream.destroy()); req.pipe(upstream); return
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname)
    let file = resolve(root, '.' + pathname)
    if (relative(root, file).startsWith('..') || isAbsolute(relative(root, file))) { res.writeHead(403); res.end(); return }
    if (!extname(pathname) || (await stat(file)).isDirectory()) file = resolve(root, 'index.html')
    const data = await readFile(file)
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
    res.end(data)
  } catch { res.writeHead(404); res.end('Not found') }
}).listen(port, '127.0.0.1', () => console.log(`Production preview: http://127.0.0.1:${port}`))
