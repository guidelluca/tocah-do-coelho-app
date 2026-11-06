import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useFeed } from '../data/hooks';
import { useResident } from './ResidentContext';
import { sameName } from '../utils/text';

const STORAGE_KEY = '@tocah_last_seen_feed_ts';
const NotificationContext = createContext(null);

/** Notificações = itens do feed da semana feitos por OUTROS moradores depois da última vez que você abriu o sino. Usa o mesmo feed da aba Feed (sem requisição extra). */
export function NotificationProvider({ children }) {
  const { resident, ready } = useResident();
  const feed = useFeed('');
  const [lastSeen, setLastSeen] = useState(null);

  const items = useMemo(
    () =>
      (feed.data?.feed || [])
        .filter((item) => item?.type !== 'deleted' && item?.type !== 'comment_reply')
        .sort((a, b) => String(b.ts).localeCompare(String(a.ts))),
    [feed.data]
  );
  const newest = items[0]?.ts || '';

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      const saved = await AsyncStorage.getItem(`${STORAGE_KEY}:${resident}`).catch(() => null);
      if (cancelled) return;
      setLastSeen(saved || '');
    })();
    return () => {
      cancelled = true;
    };
  }, [resident, ready]);

  // Primeira vez neste aparelho: não acende o sino com a semana inteira.
  useEffect(() => {
    if (lastSeen === '' && newest) {
      setLastSeen(newest);
      AsyncStorage.setItem(`${STORAGE_KEY}:${resident}`, newest).catch(() => {});
    }
  }, [lastSeen, newest, resident]);

  const notificationItems = useMemo(
    () => items.slice(0, 30).map((item) => ({ ...item, isUnread: !!lastSeen && String(item.ts) > String(lastSeen) && !sameName(item.actor, resident) })),
    [items, lastSeen, resident]
  );
  const notificationCount = notificationItems.filter((x) => x.isUnread).length;

  const markNotificationsAsSeen = useCallback(async () => {
    const value = newest || new Date().toISOString();
    setLastSeen(value);
    await AsyncStorage.setItem(`${STORAGE_KEY}:${resident}`, value).catch(() => {});
  }, [newest, resident]);

  const value = useMemo(
    () => ({ notificationCount, notificationItems, markNotificationsAsSeen, refreshNotifications: feed.refresh }),
    [notificationCount, notificationItems, markNotificationsAsSeen, feed.refresh]
  );
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications precisa do NotificationProvider');
  return ctx;
}
