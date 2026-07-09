import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class ExportTakeDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  trimSilence?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  normalize?: boolean;

  @ApiPropertyOptional({ default: -14 })
  @IsOptional()
  @IsNumber()
  @Min(-70)
  @Max(-5)
  targetLufs?: number;

  @ApiPropertyOptional({ enum: ['mp3', 'flac', 'wav', 'ogg', 'opus', 'aac'] })
  @IsOptional()
  @IsIn(['mp3', 'flac', 'wav', 'ogg', 'opus', 'aac'])
  format?: 'mp3' | 'flac' | 'wav' | 'ogg' | 'opus' | 'aac';

  @ApiPropertyOptional({ default: 192 })
  @IsOptional()
  @IsNumber()
  bitrate?: number;
}
