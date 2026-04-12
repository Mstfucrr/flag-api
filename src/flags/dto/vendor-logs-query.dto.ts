import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

/** Portal `POST .../vendor-logs` ile aynı gövde şekli (flag-api doğrudan kullanımı). */
export class VendorLogsQueryDto {
  @ApiProperty({
    example: '/feature-flags-audit/logs',
    description:
      'Audit stream id. Use /feature-flags-audit/logs or /feature-flags-audit/projects/{key}',
  })
  @IsString()
  @MinLength(1)
  resourceId!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
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
    description: 'Opaque pagination cursor from previous response `next`',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
