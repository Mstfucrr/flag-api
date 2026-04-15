import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

export class EvaluateFlagsBodyDto {
  @ApiProperty({
    type: [String],
    example: ['show_live_support_chat'],
    description: 'Flag keys to evaluate',
  })
  @IsArray()
  @IsString({ each: true })
  flagKeys!: string[];

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { accountId: '9742948' },
    description: 'Runtime evaluation context',
  })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}
