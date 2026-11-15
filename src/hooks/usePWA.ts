import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePWA() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [swReady, setSwReady] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => setSwReady(true))
        .catch(() => setSwReady(false));
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  const promptInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const requestNotifications = async () => {
    if (typeof Notification === 'undefined') return 'denied' as NotificationPermission;
    const perm = await Notification.requestPermission();
    setNotificationPermission(perm);
    return perm;
  };

  const showLocalNotification = async (title: string, body: string, url = '/?view=reviews') => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        icon: '/icon.svg',
        badge: '/icon.svg',
        data: { url },
      });
    } else {
      new Notification(title, { body, icon: '/icon.svg' });
    }
  };

  return {
    canInstall: Boolean(installPrompt),
    promptInstall,
    notificationPermission,
    requestNotifications,
    showLocalNotification,
    swReady,
  };
}
