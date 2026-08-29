'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { SignOutButton } from '@/components/nav/sign-out-button';
import { Building2, LayoutGrid, Shuffle, Activity, MapPinned, Image as ImageIcon, Database } from 'lucide-react';
import type { Profile } from '@/lib/auth';

interface Props {
  profile: Profile;
  children: React.ReactNode;
}

const EMPLOYEE_NAV = [{ href: '/dashboard', label: 'My Floor Map', icon: LayoutGrid }];

const ADMIN_NAV = [
  { href: '/admin', label: 'Overview', icon: MapPinned },
  { href: '/admin/master-data', label: 'Master Data', icon: Database },
  { href: '/admin/reassign', label: 'Reassign Seats', icon: Shuffle },
  { href: '/admin/floor-plan', label: 'Floor Layout', icon: ImageIcon },
  { href: '/admin/activity', label: 'Activity & Analytics', icon: Activity },
];

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function AppShell({ profile, children }: Props) {
  const pathname = usePathname();
  const nav = profile.role === 'ADMIN' ? ADMIN_NAV : EMPLOYEE_NAV;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Building2 className="h-4 w-4" />
              </div>
              <span className="hidden sm:inline">Seat Booking</span>
            </Link>
            <nav className="flex items-center gap-1">
              {nav.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      active
                        ? 'bg-secondary text-secondary-foreground'
                        : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden md:inline">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {profile.role === 'ADMIN' && (
              <Badge variant="secondary" className="hidden sm:inline-flex">
                Admin
              </Badge>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger className="outline-none">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">{initials(profile.full_name)}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{profile.full_name}</span>
                    <span className="text-xs font-normal text-muted-foreground">{profile.email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <SignOutButton />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="flex-1 bg-muted/20">{children}</main>
    </div>
  );
}
