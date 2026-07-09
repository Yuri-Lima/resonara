import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class NormalizeDto {
  @ApiPropertyOptional({
    description: 'Target integrated loudness LUFS (default -14 Spotify)',
    default: -14,
  })
  @IsOptional()
  @IsNumber()
  @Min(-70)
  @Max(-5)
  targetLufs?: number;

  @ApiPropertyOptional({ default: -1 })
  @IsOptional()
  @IsNumber()
  @Min(-9)
  @Max(0)
  truePeak?: number;

  @ApiPropertyOptional({ default: 11 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  lra?: number;

  @ApiPropertyOptional({ enum: ['spotify', 'podcast', 'ebu', 'custom'] })
  @IsOptional()
  @IsIn(['spotify', 'podcast', 'ebu', 'custom'])
  profile?: 'spotify' | 'podcast' | 'ebu' | 'custom';

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sampleRate?: number;
}
