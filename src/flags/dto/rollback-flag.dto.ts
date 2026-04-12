import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RollbackFlagDto {
  @ApiProperty({ example: 'Reverting bad rollout' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  summaryNote!: string;
}
