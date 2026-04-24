import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class QueryRequestLogsDto {
  @ApiProperty({ example: '/feature-flags/projects' })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  resourceId!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  descending?: boolean;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  delta?: number;

  @ApiPropertyOptional({
    description: 'Opaque cursor from previous response `next` or `prev`.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cursor?: string;
}
