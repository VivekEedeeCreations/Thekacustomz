import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Menu, User as UserIcon } from 'lucide-react';
import { toast } from 'sonner';
import { ROLE_LABELS } from '@inventory/shared';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { useAuth } from '@/hooks/use-auth';
import { initials } from '@/lib/format';
import { supabase } from '@/lib/supabase';

export function Topbar({ title }: { title: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, profile, role } = useAuth();
  const navigate = useNavigate();

  const displayName = profile?.full_name || user?.email || 'Account';

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success('Signed out');
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background px-4">
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <h1 className="flex-1 truncate text-sm font-semibold sm:text-base">{title}</h1>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex items-center gap-2 px-2">
            <Avatar className="h-7 w-7">
              <AvatarFallback>{initials(displayName)}</AvatarFallback>
            </Avatar>
            <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:inline">
              {displayName}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col gap-1">
            <span className="flex items-center gap-2 font-normal text-muted-foreground">
              <UserIcon className="h-3.5 w-3.5" />
              {user?.email}
            </span>
            {role ? <Badge className="w-fit">{ROLE_LABELS[role]}</Badge> : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut}>
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
