import { ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

/** Bir koşuldaki (`filters[]`) `percentage` filtrelerinin kurallara uygunluğunu kontrol eder. */
export function findPercentageFiltersError(filters: unknown): string | null {
    if (!Array.isArray(filters)) {
        return null;
    }
    const percentageFilters = filters.filter(
        (f): f is Record<string, unknown> =>
            typeof f === 'object' && f !== null && (f as { operator?: unknown }).operator === 'percentage',
    );
    if (percentageFilters.length === 0) {
        return null;
    }
    if (percentageFilters.length > 1) {
        // İki yüzde filtresi AND ile kesişim alır (%20 × %20 ≈ %4): beklenen davranış değil.
        return 'a condition may contain at most one percentage filter';
    }
    const [filter] = percentageFilters;
    if (typeof filter.field !== 'string' || filter.field.trim() === '') {
        return 'a percentage filter requires a non-empty field (e.g. userId, restoranId)';
    }
    const raw = filter.value;
    const percent = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        return 'a percentage filter value must be a number between 0 and 100';
    }
    return null;
}

@ValidatorConstraint({ name: 'percentageFilters', async: false })
export class PercentageFiltersConstraint implements ValidatorConstraintInterface {
    validate(filters: unknown): boolean {
        return findPercentageFiltersError(filters) === null;
    }

    defaultMessage(args: ValidationArguments): string {
        return `${args.property}: ${findPercentageFiltersError(args.value) ?? 'invalid percentage filter'}`;
    }
}
