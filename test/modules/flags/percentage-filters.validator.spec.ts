import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateFlagDto } from '../../../src/features/flags/admin/dto/create-flag.dto';
import { FlagConditionRowDto } from '../../../src/features/flags/shared/dto/flag-condition.dto';
import { findPercentageFiltersError } from '../../../src/features/flags/shared/dto/percentage-filters.validator';

const pct = (value: unknown, field: unknown = 'userId') => ({ field, operator: 'percentage', value });
const condition = (filters: unknown[]) => ({ id: 'c1', active: true, filters });
const errorsOf = async (filters: unknown[]) =>
    (await validate(plainToInstance(FlagConditionRowDto, condition(filters)))).flatMap((e) =>
        Object.values(e.constraints ?? {}),
    );

describe('percentage filter validation', () => {
    it('accepts a single valid percentage filter (number or numeric string, 0..100)', async () => {
        for (const v of [0, 20, 100, 0.5, '20']) {
            expect(await errorsOf([pct(v)])).toEqual([]);
        }
    });

    it('accepts a percentage filter combined with other filters', async () => {
        expect(await errorsOf([{ field: 'plan', operator: 'eq', value: 'pro' }, pct(20)])).toEqual([]);
    });

    it('rejects more than one percentage filter in the same condition', async () => {
        const errors = await errorsOf([pct(20), pct(30, 'tenantId')]);
        expect(errors.join(' ')).toMatch(/at most one percentage filter/);
    });

    it('rejects values outside 0..100 or that are not numbers', async () => {
        for (const v of [101, -1, 'abc', '', null, undefined, Number.NaN, {}]) {
            const errors = await errorsOf([pct(v)]);
            expect(errors.join(' ')).toMatch(/between 0 and 100/);
        }
    });

    it('rejects a percentage filter without a field', async () => {
        for (const field of ['', '   ']) {
            expect((await errorsOf([pct(20, field)])).join(' ')).toMatch(/non-empty field/);
        }
    });

    it('is enforced through the create/update DTOs (nested rules)', async () => {
        const dto = plainToInstance(CreateFlagDto, {
            projectKey: 'p',
            key: 'k',
            enabled: true,
            rules: [condition([pct(20), pct(30, 'tenantId')])],
        });
        const errors = await validate(dto);
        expect(JSON.stringify(errors)).toMatch(/at most one percentage filter/);
    });

    it('findPercentageFiltersError ignores conditions without percentage filters', () => {
        expect(findPercentageFiltersError([{ field: 'a', operator: 'eq', value: 1 }])).toBeNull();
        expect(findPercentageFiltersError('not-an-array')).toBeNull();
    });
});
