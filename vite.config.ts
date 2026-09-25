import fs from 'node:fs';
import path from 'node:path';
import type { Connect, Plugin } from 'vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {
  audioFilePath,
  readAudioMeta,
  readStateFile,
  writeAudioFile,
  writeStateFile,
} from './server/fieldbook-files';

const rootDir = __dirname;

const BANK_FILES = [
  { url: '/questions.json', privateRel: 'local/questions.json', sampleRel: 'public/sample/questions.json' },
  { url: '/speaking-questions.json', privateRel: 'local/speaking-questions.json', sampleRel: 'public/sample/speaking-questions.json' },
  { url: '/speaking-samples.json', privateRel: 'local/speaking-samples.json', sampleRel: 'public/sample/speaking-samples.json' },
] as const;

function contentTypeFor(filePath: string): string {
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  if (filePath.endsWith('.webp')) return 'image/webp';
  if (filePath.endsWith('.gif')) return 'image/gif';
  return 'application/octet-stream';
}

function sendFile(res: any, filePath: string): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', contentTypeFor(filePath));
  fs.createReadStream(filePath).pipe(res);
}

function resolveBankFile(privateRel: string, sampleRel: string): string | null {
  const privatePath = path.resolve(rootDir, privateRel);
  if (fs.existsSync(privatePath) && fs.statSync(privatePath).isFile()) return privatePath;
  const samplePath = path.resolve(rootDir, sampleRel);
  if (fs.existsSync(samplePath) && fs.statSync(samplePath).isFile()) return samplePath;
  return null;
}

function readRequestBody(req: Connect.IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function fieldbookStateMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    const pathname = (req.url || '').split('?')[0];
    if (pathname === '/api/state' && req.method === 'GET') {
      try {
        const payload = readStateFile(rootDir);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(payload));
      } catch {
        res.statusCode = 500;
        res.end('Could not read the study file');
      }
      return;
    }
    if (pathname === '/api/state' && req.method === 'PUT') {
      readRequestBody(req, 8 * 1024 * 1024)
        .then((body) => {
          const payload = JSON.parse(body.toString('utf8'));
          writeStateFile(rootDir, payload);
          res.statusCode = 204;
          res.end();
        })
        .catch(() => {
          res.statusCode = 400;
          res.end('Bad state');
        });
      return;
    }
    const audioMatch = pathname.match(/^\/api\/audio\/([^/]+)$/);
    if (audioMatch && (req.method === 'GET' || req.method === 'PUT')) {
      const audioId = decodeURIComponent(audioMatch[1]);
      if (!audioFilePath(rootDir, audioId)) {
        res.statusCode = 400;
        res.end('Bad audio id');
        return;
      }
      if (req.method === 'GET') {
        const meta = readAudioMeta(rootDir, audioId);
        if (!meta) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', meta.mime);
        fs.createReadStream(meta.filePath).pipe(res);
        return;
      }
      readRequestBody(req, 30 * 1024 * 1024)
        .then((body) => {
          writeAudioFile(rootDir, audioId, body, String(req.headers['content-type'] || 'audio/webm'));
          res.statusCode = 204;
          res.end();
        })
        .catch(() => {
          res.statusCode = 400;
          res.end('Bad audio');
        });
      return;
    }
    next();
  };
}

function privateBankMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    const rawUrl = req.url || '';
    const pathname = rawUrl.split('?')[0];

    for (const entry of BANK_FILES) {
      if (pathname === entry.url) {
        const filePath = resolveBankFile(entry.privateRel, entry.sampleRel);
        if (!filePath) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        sendFile(res, filePath);
        return;
      }
    }

    if (pathname.startsWith('/question-assets/')) {
      const relative = pathname.slice('/question-assets/'.length);
      if (!relative || relative.includes('..')) {
        res.statusCode = 400;
        res.end('Bad request');
        return;
      }
      const privatePath = path.resolve(rootDir, 'local', 'question-assets', relative);
      const assetsRoot = path.resolve(rootDir, 'local', 'question-assets');
      if (!privatePath.startsWith(assetsRoot + path.sep) && privatePath !== assetsRoot) {
        res.statusCode = 400;
        res.end('Bad request');
        return;
      }
      if (fs.existsSync(privatePath) && fs.statSync(privatePath).isFile()) {
        sendFile(res, privatePath);
        return;
      }
      next();
      return;
    }

    if (pathname.startsWith('/sample/')) {
      next();
      return;
    }

    next();
  };
}

function privateBankPlugin(): Plugin {
  return {
    name: 'private-bank-overlay',
    configureServer(server) {
      server.middlewares.use(fieldbookStateMiddleware());
      server.middlewares.use(privateBankMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(fieldbookStateMiddleware());
      server.middlewares.use(privateBankMiddleware());
    },
  };
}

export default defineConfig({
  plugins: [react(), privateBankPlugin()],
  server: {
    port: 8000,
    strictPort: true,
  },
  preview: {
    port: 8000,
    strictPort: true,
  },
});
