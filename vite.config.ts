import fs from 'node:fs';
import path from 'node:path';
import type { Connect, Plugin } from 'vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
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
  if (filePath.endsWith('.mp3')) return 'audio/mpeg';
  if (filePath.endsWith('.wav')) return 'audio/wav';
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

    // Private authorized content is served only by the development server.
    // It never becomes part of dist or the public repository.
    if (pathname === '/data/exam-catalog.json' || pathname.startsWith('/data/exam-sections/') || pathname.startsWith('/exam-assets/')) {
      let relative: string;
      try {
        relative = pathname === '/data/exam-catalog.json' ? 'metadata.json'
          : pathname.startsWith('/data/exam-sections/') ? `sections/${decodeURIComponent(pathname.slice('/data/exam-sections/'.length)).replaceAll(':', '_')}`
          : `assets/${decodeURIComponent(pathname.slice('/exam-assets/'.length))}`;
      } catch { res.statusCode = 400; res.end('Bad request'); return; }
      const contentBank = ['local/exam-bank-final-v4', 'local/exam-bank-final', 'local/exam-bank-aligned', 'local/exam-bank'].find(directory => fs.existsSync(path.resolve(rootDir, directory, 'catalog.json'))) || 'local/exam-bank';
      const bankRoot = path.resolve(rootDir, pathname.startsWith('/exam-assets/') ? 'local/exam-bank' : contentBank);
      const filePath = path.resolve(bankRoot, relative);
      if (!filePath.startsWith(bankRoot + path.sep)) { res.statusCode = 400; res.end('Bad request'); return; }
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const size = fs.statSync(filePath).size;
        const range = req.headers.range;
        res.setHeader('Content-Type', contentTypeFor(filePath));
        res.setHeader('Accept-Ranges', 'bytes');
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          const start = match?.[1] ? Number(match[1]) : Math.max(0, size - Number(match?.[2]));
          const end = match?.[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
          if (!match || !Number.isFinite(start) || start < 0 || start > end || start >= size) { res.statusCode = 416; res.setHeader('Content-Range', `bytes */${size}`); res.end(); return; }
          res.statusCode = 206; res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`); res.setHeader('Content-Length', end - start + 1);
          fs.createReadStream(filePath, { start, end }).pipe(res);
        } else { res.statusCode = 200; res.setHeader('Content-Length', size); fs.createReadStream(filePath).pipe(res); }
        return;
      }
      if (pathname !== '/data/exam-catalog.json') { res.statusCode = 404; res.end('Not found'); return; }
    }

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
      server.middlewares.use(privateBankMiddleware());
    },
    configurePreviewServer(server) {
      // Preview mirrors production: no private exam content overlay.
      server.middlewares.use((req, res, next) => req.url?.startsWith('/data/exam-') || req.url?.startsWith('/exam-assets/') ? next() : privateBankMiddleware()(req, res, next));
    },
  };
}

// Audit rationales and old dictionary credits are authoring data; edit detection
// needs the original editable fields only. Current sense credits stay complete.
function curriculumRuntimePlugin(): Plugin {
  return {
    name:'curriculum-runtime-fields', apply:'build', enforce:'pre',
    transform(code,id) {
      if(!/\/groupCurriculum(?:Common|Repairs|ModernDefaults|Source|Topics[A-C])\.json$/.test(id.replaceAll('\\','/'))) return;
      const fields=['id','definition','example','pos','collocations','usage','synonyms','antonyms','distinctions','distinctionTask','wordFamily','register'];
      const rows=JSON.parse(code).map(({term:_term,reason:_reason,originalSense,...row}:Record<string,any>)=>({
        ...row,
        ...(originalSense?.id===row.sense.id ? {originalSense:Object.fromEntries(fields.filter(field=>originalSense[field]!==undefined).map(field=>[field,originalSense[field]]))} : {}),
      }));
      return {code:JSON.stringify(rows),map:null};
    },
  };
}

export default defineConfig({
  plugins: [react(), privateBankPlugin(), curriculumRuntimePlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/wavesurfer.js')) return 'audio';
          if (id.includes('node_modules/@supabase/')) return 'supabase';
          if (id.includes('node_modules/motion') || id.includes('node_modules/framer-motion')) return 'motion';
          if (id.includes('node_modules/@radix-ui/')) return 'radix';
        },
      },
    },
  },
  server: {
    port: 8000,
    strictPort: true,
  },
  preview: {
    port: 8000,
    strictPort: true,
  },
});
