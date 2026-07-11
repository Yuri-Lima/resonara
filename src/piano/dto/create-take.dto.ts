import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateTakeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  packId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ description: 'Optional MIDI stats JSON string' })
  @IsOptional()
  @IsString()
  midiStats?: string;
}
