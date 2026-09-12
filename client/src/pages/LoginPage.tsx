import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { sound } from '@/lib/sound';
import { api, setToken, ApiError } from '@/lib/api';
import type { User } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { AuroraBars } from '@/components/unlumen-ui/aurora-bars';
import { KeyRound, LogIn, ShieldCheck, UserPlus } from 'lucide-react';

interface LoginResponse {
  token?: string;
  user?: User;
  needsPasswordSetup?: boolean;
  username?: string;
}

type CheckStatus = 'notfound' | 'deactivated' | 'pending' | 'password';

/** Two-step login (ticket 063): user ID first, then a popup card for the password. */
export function LoginPage(): ReactNode {
  const { updateUser } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [userId, setUserId] = useState('');
  const [status, setStatus] = useState<CheckStatus | null>(null);
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const finishLogin = (res: LoginResponse): void => {
    if (res.token && res.user) {
      setToken(res.token);
      updateUser(res.user);
      sound.success();
      navigate('/', { replace: true });
    }
  };

  const checkId = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api<{ status: CheckStatus; username: string }>('/api/auth/check', {
        method: 'POST',
        body: { username: userId },
      });
      setStatus(res.status);
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const login = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: { username: userId, password },
      });
      finishLogin(res);
    } catch (err) {
      sound.error();
      if (err instanceof ApiError && err.status === 401) setError(t('login.error'));
      else setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const setup = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setError(t('login.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('login.passwordMismatch'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api<LoginResponse>('/api/auth/setup-password', {
        method: 'POST',
        body: { username: userId, password: newPassword },
      });
      finishLogin(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const closeCard = (): void => {
    setStatus(null);
    setError('');
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background p-4">
      <AuroraBars
        className="absolute inset-0"
        background="#0f172a"
        colors={['#F1D8D1', '#E8B4A0', '#C96D57', '#F6F3EE', '#00000000']}
        barCount={32}
        speed={0.4}
        gap={4}
        blur={2}
      />
      <div className="absolute top-4 end-4 z-10">
        <LanguageSwitcher />
      </div>

      <Card className="relative z-10 w-full max-w-sm border-white/10 bg-card/95 shadow-2xl backdrop-blur">
        <CardContent className="p-6">
          <div className="mb-6 flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent text-base font-bold text-white">
              DV
            </div>
            <div>
              <div className="text-lg font-semibold text-foreground">{t('app.name')}</div>
              <div className="text-xs text-muted-foreground">{t('app.company')} · {t('app.project')}</div>
            </div>
          </div>

          <form onSubmit={checkId} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="userid">{t('login.userId')}</Label>
              <Input
                id="userid"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                autoComplete="username"
                placeholder={t('login.userIdPlaceholder')}
                required
              />
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
            <Button type="submit" disabled={busy} className="w-full gap-1.5">
              <ShieldCheck className="size-4" />
              {busy ? '...' : t('login.continue')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Popup card: password / create password / status */}
      <Dialog open={status !== null} onOpenChange={(o) => { if (!o) closeCard(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-md">
                {status === 'pending' ? <UserPlus className="size-5" /> : <KeyRound className="size-5" />}
              </div>
              <div className="min-w-0">
                <DialogTitle className="truncate">{userId}</DialogTitle>
                <div className="text-xs text-muted-foreground">
                  {status === 'pending' ? t('login.setupHint') : t('login.enterPassword')}
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="-mt-1 flex flex-col gap-4 px-6 pb-6">
            {status === 'password' && (
              <form onSubmit={login} className="flex flex-col gap-4">
                <div>
                  <Label htmlFor="pass">{t('login.password')}</Label>
                  <Input
                    id="pass"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    autoFocus
                    required
                  />
                </div>
                {error && <div className="text-sm text-destructive">{error}</div>}
                <Button type="submit" disabled={busy} className="w-full gap-1.5">
                  <LogIn className="size-4" />
                  {busy ? '...' : t('login.submit')}
                </Button>
              </form>
            )}

            {status === 'pending' && (
              <form onSubmit={setup} className="flex flex-col gap-4">
                <div>
                  <Label htmlFor="newpass">{t('login.newPassword')}</Label>
                  <Input
                    id="newpass"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    autoFocus
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="confirmpass">{t('login.confirmPassword')}</Label>
                  <Input
                    id="confirmpass"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>
                {error && <div className="text-sm text-destructive">{error}</div>}
                <Button type="submit" disabled={busy} className="w-full gap-1.5">
                  <LogIn className="size-4" />
                  {busy ? '...' : t('login.setupSubmit')}
                </Button>
              </form>
            )}

            {(status === 'notfound' || status === 'deactivated') && (
              <div className="flex flex-col gap-4">
                <div className="rounded-xl border border-destructive/30/60 bg-destructive/10 p-3 text-sm text-destructive dark:border-destructive/30 dark:bg-destructive/10 dark:text-destructive">
                  {status === 'notfound' ? t('login.notFound') : t('login.deactivated')}
                </div>
                <Button variant="outline" onClick={closeCard}>
                  {t('login.back')}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}