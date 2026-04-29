'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, MonitorSmartphone, WifiOff, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const DISMISS_KEY = 'sdpe.pwaPrompt.dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export default function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setDismissed(window.localStorage.getItem(DISMISS_KEY) === 'true');
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true);
    setIsOnline(window.navigator.onLine);
    setIsIos(/iPad|iPhone|iPod/.test(window.navigator.userAgent));

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setDismissed(false);
    };
    const onAppInstalled = () => {
      setInstallEvent(null);
      setIsStandalone(true);
    };
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const showPrompt = useMemo(
    () => !isStandalone && !dismissed && (!!installEvent || isIos),
    [dismissed, installEvent, isIos, isStandalone],
  );

  if (!showPrompt && isOnline) return null;

  async function handleInstall() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') {
      setIsStandalone(true);
    }
    setInstallEvent(null);
  }

  function handleDismiss() {
    setDismissed(true);
    if (typeof window !== 'undefined') window.localStorage.setItem(DISMISS_KEY, 'true');
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4">
      <div
        className={cn(
          'pointer-events-auto flex w-full max-w-2xl items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur',
          isOnline ? 'border-accent/40 bg-card/95' : 'border-warning/40 bg-card/95',
        )}
      >
        <div className={cn('rounded-xl p-2', isOnline ? 'bg-accent/12 text-accent' : 'bg-warning/15 text-warning')}>
          {isOnline ? <MonitorSmartphone className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">
            {isOnline ? 'Install SDPE DAG as a desktop app' : 'You are offline'}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {isOnline
              ? (isIos ? 'In Safari, choose "Add to Home Screen" from the share menu to launch in a standalone window.' : 'Browser installation enables a standalone window, icon launch, and service worker cache.')
              : 'Recently visited screens and static resources remain available via the service worker cache.'}
          </div>
        </div>
        {isOnline && installEvent ? (
          <button
            type="button"
            onClick={() => void handleInstall()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-medium text-background transition-colors hover:bg-accent/90"
          >
            <Download className="h-4 w-4" />
            Install
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 rounded-xl border border-border px-2 py-2 text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
