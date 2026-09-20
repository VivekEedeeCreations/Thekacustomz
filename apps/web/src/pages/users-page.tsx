import { toast } from 'sonner';
import { ROLE_LABELS, USER_ROLES, type UserRole } from '@inventory/shared';

import { PageHeader } from '@/components/page-header';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { useUpdateProfileRole } from '@/features/profile/mutations';
import { useAllProfiles } from '@/features/profile/queries';
import { formatDate, initials } from '@/lib/format';

export function UsersPage() {
  const { data: profiles, isLoading } = useAllProfiles();
  const { user: currentUser } = useAuth();
  const updateRole = useUpdateProfileRole();

  return (
    <div>
      <PageHeader title="Users" description="Manage teammate roles and access." />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-48">Role</TableHead>
                <TableHead className="w-24">Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles?.map((profile) => {
                const isSelf = profile.id === currentUser?.id;
                return (
                  <TableRow key={profile.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback>
                            {initials(profile.full_name || profile.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{profile.full_name || '—'}</p>
                          <p className="text-xs text-muted-foreground">{profile.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(profile.created_at)}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={profile.role}
                        disabled={isSelf}
                        onValueChange={(role) => {
                          updateRole.mutate(
                            { id: profile.id, role: role as UserRole },
                            {
                              onSuccess: () =>
                                toast.success(
                                  `${profile.full_name || profile.email} is now ${ROLE_LABELS[role as UserRole]}`,
                                ),
                              onError: (error) =>
                                toast.error('Could not change role', {
                                  description: error.message,
                                }),
                            },
                          );
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {USER_ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={profile.is_active}
                        disabled={isSelf}
                        onCheckedChange={(is_active) => {
                          updateRole.mutate(
                            { id: profile.id, is_active },
                            {
                              onError: (error) =>
                                toast.error('Could not update user', {
                                  description: error.message,
                                }),
                            },
                          );
                        }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
