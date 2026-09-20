import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { FlagConditionRowDto } from '../../shared/dto/flag-condition.dto';

export class CreateFlagDto {
    @ApiProperty({
        example: 'portal-client-a',
        description: 'Portal project key — flags are isolated per project',
    })
    @IsString()
    @MinLength(1)
    @MaxLength(128)
    projectKey!: string;

    @ApiProperty({ example: 'new-checkout', maxLength: 128 })
    @IsString()
    @MinLength(1)
    @MaxLength(128)
    key!: string;

    @ApiPropertyOptional({ example: 'Rollout description' })
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    description?: string;

    @ApiProperty({ example: true })
    @IsBoolean()
    enabled!: boolean;

    @ApiProperty({ type: [FlagConditionRowDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => FlagConditionRowDto)
    rules!: FlagConditionRowDto[];
}
