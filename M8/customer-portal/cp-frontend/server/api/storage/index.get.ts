import { StorageItem } from './StorageItem.model';
import { createScopedLogger } from '~/server/utils/logger';

const logger = createScopedLogger('API:storage');

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);

        const filter: any = {};

        if (query.status) {
            filter.status = query.status;
        }

        if (query.cargoType) {
            filter.cargoType = query.cargoType;
        }

        const items = await StorageItem.find(filter)
            .select('-__v')
            .sort({ arrivalDate: -1 })
            .lean();

        const mapped = items.map((item: any) => ({
            ...item,
            id: item.id,
        }));

        logger.info(`Fetched ${mapped.length} storage items`, { filters: query });

        return mapped;
    } catch (e) {
        logger.error('Failed to fetch storage items', e as Error);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to fetch storage items from database',
        });
    }
});
