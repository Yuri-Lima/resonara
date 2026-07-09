import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, Min } from 'class-validator';

export class TrimDto {
  @ApiProperty({ description: 'Start time in seconds' })
  @IsNumber()
  @Min(0)
  start!: number;

  @ApiPropertyOptional({ description: 'End time in seconds' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  end?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  fadeIn?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  fadeOut?: number;

  @ApiPropertyOptional({
    enum: ['linear', 'exponential', 'logarithmic', 'quarter-sine'],
  })
  @IsOptional()
  @IsIn(['linear', 'exponential', 'logarithmic', 'quarter-sine'])
  fadeCurve?: 'linear' | 'exponential' | 'logarithmic' | 'quarter-sine';
}
