import { StorageItem } from './StorageItem.model';
import { createScopedLogger } from '~/server/utils/logger';

const logger = createScopedLogger('API:storage:detail');

export default defineEventHandler(async (event) => {
    try {
        const id = getRouterParam(event, 'id');

        if (!id) {
            throw createError({
                statusCode: 400,
                statusMessage: 'Item ID is required',
            });
        }

        const item = await StorageItem.findOne({ id })
            .select('-__v')
            .lean();

        if (!item) {
            logger.warn(`Storage item not found: ${id}`);
            throw createError({
                statusCode: 404,
                statusMessage: 'Storage item not found',
            });
        }

        logger.info(`Fetched storage item: ${id}`);

        // Map MongoDB document to include id field (using requestNumber)
        return {
            ...item,
            id: item.id,
        };
    } catch (e) {
        if ((e as any).statusCode) {
            throw e;
        }
        logger.error('Failed to fetch storage item', e as Error);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to fetch storage item from database',
        });
    }
});
