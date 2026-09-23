import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { getProfile } from '../../api/getProfile'

export function useDouble(): { name: string, dirty: boolean } {
  const form = useForm()
  const query = useQuery({ queryKey: ['double'], queryFn: ({ signal }) => getProfile(signal) })
  return { name: query.data ?? '', dirty: form.formState.isDirty }
}
