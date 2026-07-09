import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class TranscodeDto {
  @ApiProperty({ enum: ['mp3', 'aac', 'flac', 'ogg', 'opus', 'wav'] })
  @IsIn(['mp3', 'aac', 'flac', 'ogg', 'opus', 'wav'])
  format!: 'mp3' | 'aac' | 'flac' | 'ogg' | 'opus' | 'wav';

  @ApiPropertyOptional({ description: 'CBR bitrate kbps' })
  @IsOptional()
  @IsInt()
  @Min(32)
  @Max(512)
  bitrate?: number;

  @ApiPropertyOptional({ description: 'VBR quality (MP3 0-9, Vorbis -1..10, FLAC 0-8)' })
  @IsOptional()
  @IsNumber()
  quality?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  vbr?: boolean;

  @ApiPropertyOptional({ enum: [44100, 48000, 96000] })
  @IsOptional()
  @IsInt()
  sampleRate?: number;

  @ApiPropertyOptional({ enum: [16, 24, 32] })
  @IsOptional()
  @IsIn([16, 24, 32])
  bitDepth?: 16 | 24 | 32;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2)
  channels?: number;
}
