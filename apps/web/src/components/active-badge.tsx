import { Badge } from '@/components/ui/badge';

export function ActiveBadge({ active }: { active: boolean }) {
  return <Badge variant={active ? 'success' : 'secondary'}>{active ? 'Active' : 'Inactive'}</Badge>;
}
