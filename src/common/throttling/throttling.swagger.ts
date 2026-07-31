import { ApiTooManyRequestsResponse } from '@nestjs/swagger';

export function ApiRateLimitExceeded() {
    return ApiTooManyRequestsResponse({
        description: 'Rate limit exceeded',
        schema: {
            type: 'object',
            required: ['error', 'message'],
            properties: {
                error: {
                    type: 'string',
                    example: 'RATE_LIMIT_EXCEEDED',
                },
                message: {
                    type: 'string',
                    example: 'Rate limit exceeded. Please try again later.',
                },
            },
        },
    });
}
