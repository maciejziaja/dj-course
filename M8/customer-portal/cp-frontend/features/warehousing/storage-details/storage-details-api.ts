import { useQuery } from '@tanstack/vue-query'
import type { StorageItem } from '~/features/warehousing/storage-listing/storage-listing.model'

// Fetch single storage item by ID
export async function getStorageItemDetails(id: string): Promise<StorageItem> {
  return await $fetch(`/api/storage/${id}`)
}

// Composable using TanStack Query
export function useStorageItemDetails(id: string) {
  return useQuery({
    queryKey: ['storage', 'details', id],
    queryFn: () => getStorageItemDetails(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000
  })
} 