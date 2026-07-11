import { Controller, Get, Header, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

@ApiTags('diagnostics')
@Controller('diagnostics')
export class DiagnosticsController {
  @Get()
  info() {
    const root = process.cwd();
    const pkg = (() => {
      try {
        return JSON.parse(
          fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
        ) as { version?: string };
      } catch {
        return {};
      }
    })();
    return {
      product: 'Resonara',
      version: pkg.version || 'unknown',
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      mode: process.env.RESONARA_LITE === '1' ? 'lite' : 'full',
      engines: {
        piper: fs.existsSync(path.join(root, 'tools/piper-venv/bin/piper')),
        kokoro: fs.existsSync(path.join(root, 'tools/kokoro-venv/bin/python')),
        whisper: fs.existsSync(path.join(root, 'tools/whisper-venv/bin/python')),
      },
      note: 'POST /diagnostics/bundle to zip local logs+versions (secrets excluded). Offline only.',
    };
  }

  @Post('bundle')
  @Header('Content-Type', 'application/json')
  bundle() {
    const script = path.join(process.cwd(), 'scripts', 'diagnostics-bundle.js');
    if (!fs.existsSync(script)) {
      return {
        ok: false,
        message:
          'Diagnostics script missing. Reinstall Resonara or run from the project root.',
      };
    }
    try {
      const out = execFileSync(process.execPath, [script], {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 60000,
        env: { ...process.env },
      });
      return JSON.parse(out);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        message: `Could not build diagnostics bundle: ${msg.split('\n')[0]}`,
      };
    }
  }
}
