import { ConfigService } from '@nestjs/config';
import { createThrottlerOptions } from '../../../../src/common/throttling/throttling.module';

describe('createThrottlerOptions', () => {
    it('uses feature flag service defaults', () => {
        const config = { get: jest.fn().mockReturnValue(undefined) };

        expect(createThrottlerOptions(config as unknown as ConfigService)).toEqual([{ ttl: 60_000, limit: 1_000 }]);
    });

    it('reads positive values from environment config', () => {
        const config = {
            get: jest.fn((key: string) => (key === 'THROTTLER_TTL' ? '30000' : '2500')),
        };

        expect(createThrottlerOptions(config as unknown as ConfigService)).toEqual([{ ttl: 30_000, limit: 2_500 }]);
    });
});
