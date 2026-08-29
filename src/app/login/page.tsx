'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Building2, Loader2, MailCheck } from 'lucide-react';
import { MicrosoftIcon } from '@/components/shared/microsoft-icon';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get('error') === 'deactivated'
      ? 'Your account has been deactivated. Contact your admin for access.'
      : null
  );
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);

  async function handleMicrosoftSignIn() {
    setSsoLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`,
        scopes: 'email openid profile',
      },
    });
    if (error) {
      setSsoLoading(false);
      setError(error.message);
    }
    // On success the browser is redirected to Microsoft — nothing else to do here.
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`,
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMagicLinkSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          <CardTitle>Office Seat Booking</CardTitle>
          <CardDescription>Sign in to manage your seat</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={ssoLoading}
            onClick={handleMicrosoftSignIn}
          >
            {ssoLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <MicrosoftIcon className="mr-2 h-4 w-4" />
            )}
            Continue with Microsoft
          </Button>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="password">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="password">Password</TabsTrigger>
              <TabsTrigger value="magic">Magic Link</TabsTrigger>
            </TabsList>

            <TabsContent value="password">
              <form onSubmit={handlePasswordLogin} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign in
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="magic">
              {magicLinkSent ? (
                <Alert className="mt-4">
                  <MailCheck className="h-4 w-4" />
                  <AlertDescription>
                    Check <strong>{email}</strong> for a sign-in link.
                  </AlertDescription>
                </Alert>
              ) : (
                <form onSubmit={handleMagicLink} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="magic-email">Email</Label>
                    <Input
                      id="magic-email"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Send magic link
                  </Button>
                </form>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
