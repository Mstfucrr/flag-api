import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { FlagConditionRowDto } from './flag-condition.dto';

export class UpdateFlagDto {
  @ApiPropertyOptional({
    type: String,
    maxLength: 2000,
    description: 'Human-readable flag description',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Master enabled switch for the flag',
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    type: [FlagConditionRowDto],
    description: 'OR-conditions; each condition’s filters are AND-combined',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FlagConditionRowDto)
  rules?: FlagConditionRowDto[];
}
