import { requireProfile } from '@/lib/auth';
import { AppShell } from '@/components/nav/app-shell';
import { RequestNotifications } from '@/components/notifications/request-notifications';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();

  return (
    <AppShell profile={profile}>
      <RequestNotifications userId={profile.id} />
      {children}
    </AppShell>
  );
}
