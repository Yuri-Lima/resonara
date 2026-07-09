import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { diskStorage } from 'multer';
import * as os from 'os';
import { CreateTakeDto } from './dto/create-take.dto';
import { ExportTakeDto } from './dto/export-take.dto';
import { PianoService } from './piano.service';

@ApiTags('piano')
@Controller('piano')
export class PianoController {
  constructor(private readonly piano: PianoService) {}

  @Get('packs')
  @ApiOperation({ summary: 'List sample packs' })
  listPacks() {
    return this.piano.listPacks();
  }

  @Get('packs/:id')
  @ApiOperation({ summary: 'Get pack manifest' })
  getPack(@Param('id') id: string) {
    return this.piano.getPack(id);
  }

  @Get('packs/:id/samples/:note')
  @ApiOperation({ summary: 'Presigned URL for a note sample' })
  sample(@Param('id') id: string, @Param('note') note: string) {
    return this.piano.getSampleUrl(id, note);
  }

  @Post('takes')
  @ApiOperation({ summary: 'Upload a piano take and start analysis' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        packId: { type: 'string' },
        label: { type: 'string' },
        midiStats: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_r, _f, cb) => cb(null, os.tmpdir()),
        filename: (_r, file, cb) =>
          cb(null, `piano-${Date.now()}-${file.originalname}`),
      }),
      limits: { fileSize: 512 * 1024 * 1024 },
    }),
  )
  createTake(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: CreateTakeDto,
  ) {
    return this.piano.createTakeFromUpload(file, {
      packId: body.packId,
      label: body.label,
      midiStats: body.midiStats,
    });
  }

  @Get('takes')
  @ApiOperation({ summary: 'List recent piano takes' })
  listTakes(@Query('limit') limit?: string) {
    return this.piano.listTakes(limit ? parseInt(limit, 10) : 30);
  }

  @Get('takes/:id')
  @ApiOperation({ summary: 'Get take' })
  getTake(@Param('id') id: string) {
    return this.piano.getTake(id);
  }

  @Get('takes/:id/analysis')
  @ApiOperation({ summary: 'Aggregated analysis (waveform, silence, LUFS)' })
  analysis(@Param('id') id: string) {
    return this.piano.getAnalysis(id);
  }

  @Post('takes/:id/analyze')
  @ApiOperation({ summary: 'Re-run analysis bundle' })
  reanalyze(@Param('id') id: string) {
    return this.piano.runAnalysis(id);
  }

  @Post('takes/:id/export')
  @ApiOperation({ summary: 'Enqueue trim/normalize/transcode export' })
  exportTake(@Param('id') id: string, @Body() dto: ExportTakeDto) {
    return this.piano.exportTake(id, dto);
  }
}
