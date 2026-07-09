import {
  Controller,
  Get,
  NotFoundException,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { createReadStream, existsSync } from 'fs';
import { Request, Response } from 'express';
import { StorageService } from './storage.service';

@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  /** Lite-mode object fetch: /storage/<bucket>/<key...> */
  @Get('*')
  async getObject(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!this.storage.isLite()) {
      throw new NotFoundException('Local storage path only in lite mode');
    }
    // req.path is like /storage/audio-originals/id/original/file.mp3
    const raw = (req.path || '').replace(/^\/storage\/?/, '');
    const slash = raw.indexOf('/');
    if (slash < 0) throw new NotFoundException('Invalid storage path');
    const bucket = decodeURIComponent(raw.slice(0, slash));
    const key = raw
      .slice(slash + 1)
      .split('/')
      .map(decodeURIComponent)
      .join('/');
    const local = this.storage.resolveLocalPath(bucket, key);
    if (!local || !existsSync(local)) {
      throw new NotFoundException(`Object not found: ${bucket}/${key}`);
    }
    res.set({ 'Content-Type': 'application/octet-stream' });
    return new StreamableFile(createReadStream(local));
  }
}
