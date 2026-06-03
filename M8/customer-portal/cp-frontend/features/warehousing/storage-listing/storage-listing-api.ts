import { useQuery } from '@tanstack/vue-query'
import type { Ref } from 'vue'
import type { StorageItem } from './storage-listing.model'

export async function getStorageItems(filters: { status?: string; cargoType?: string } = {}): Promise<StorageItem[]> {
  const query = new URLSearchParams()

  if (filters.status) query.append('status', filters.status)
  if (filters.cargoType) query.append('cargoType', filters.cargoType)

  const queryString = query.toString()
  const url = `/api/storage${queryString ? `?${queryString}` : ''}`

  return await $fetch(url)
}

export const useStorageItems = (filters: Ref<{ status: string; cargoType: string }>) => {
  return useQuery({
    queryKey: ['storageItems', filters],
    queryFn: () => getStorageItems(filters.value),
    staleTime: 5 * 60 * 1000,
  })
}
