import fs from 'node:fs';
import path from 'node:path';
import type { Connect, Plugin } from 'vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = __dirname;

const BANK_FILES = [
  { url: '/questions.json', privateRel: 'questions.json', sampleRel: 'public/sample/questions.json' },
  { url: '/speaking-questions.json', privateRel: 'speaking-questions.json', sampleRel: 'public/sample/speaking-questions.json' },
  { url: '/speaking-samples.json', privateRel: 'speaking-samples.json', sampleRel: 'public/sample/speaking-samples.json' },
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
      const privatePath = path.resolve(rootDir, 'question-assets', relative);
      const assetsRoot = path.resolve(rootDir, 'question-assets');
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
      server.middlewares.use(privateBankMiddleware());
    },
    configurePreviewServer(server) {
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
