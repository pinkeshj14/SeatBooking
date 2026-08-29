'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { LogOut } from 'lucide-react';

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <DropdownMenuItem onClick={handleSignOut} className="text-red-600 focus:text-red-600">
      <LogOut className="mr-2 h-4 w-4" />
      Sign out
    </DropdownMenuItem>
  );
}
