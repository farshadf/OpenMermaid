import { build } from 'esbuild';

export const prerender = true;

let cachedRuntime: string | undefined;

async function buildClassicRuntime(): Promise<string> {
  if (cachedRuntime) {
    return cachedRuntime;
  }

  const result = await build({
    absWorkingDir: process.cwd(),
    stdin: {
      contents: [
        "import { startRendererFrame } from './src/lib/rendering/frame-runtime';",
        'void startRendererFrame();',
      ].join('\n'),
      loader: 'ts',
      resolveDir: process.cwd(),
      sourcefile: 'openmermaid-renderer-entry.ts',
    },
    bundle: true,
    charset: 'utf8',
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    format: 'iife',
    legalComments: 'none',
    logLevel: 'silent',
    minify: true,
    platform: 'browser',
    sourcemap: false,
    target: ['es2022'],
    treeShaking: true,
    write: false,
  });

  const output = result.outputFiles[0];
  if (!output) {
    throw new Error('The isolated renderer runtime did not produce an output file.');
  }
  cachedRuntime = output.text;
  return cachedRuntime;
}

export async function GET(): Promise<Response> {
  return new Response(await buildClassicRuntime(), {
    headers: {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Content-Type': 'text/javascript; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
