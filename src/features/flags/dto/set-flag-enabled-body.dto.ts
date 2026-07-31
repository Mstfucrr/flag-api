import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/** PATCH body for `PATCH /projects/:projectKey/flags/:flagKey/enabled` */
export class SetFlagEnabledBodyDto {
    @ApiProperty({
        example: true,
        description: 'Target on/off state for the flag',
    })
    @IsBoolean()
    enabled!: boolean;
}
