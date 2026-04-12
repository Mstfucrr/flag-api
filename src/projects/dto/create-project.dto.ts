import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsLowercase,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const ENVIRONMENTS = ['dev', 'stage', 'prod'] as const;

export class CreateProjectDto {
  @ApiProperty({ example: 'Partner mobile app' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({
    example: 'partner-mobile',
    description: 'Unique lowercase kebab-case identifier (used by SDK / clients).',
  })
  @IsString()
  @IsLowercase()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message:
      'key must be lowercase kebab-case (letters/digits, single hyphens between segments)',
  })
  key!: string;

  @ApiPropertyOptional({
    enum: ENVIRONMENTS,
    isArray: true,
    description: 'Defaults to dev, stage, prod when omitted.',
  })
  @IsOptional()
  @IsArray()
  @IsIn([...ENVIRONMENTS], { each: true })
  environments?: (typeof ENVIRONMENTS)[number][];
}
