import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getTaskFeed } from '../services/api';
import { useResident } from './ResidentContext';

const STORAGE_KEY = '@tocah_last_seen_feed_ts';
const NotificationContext = createContext(null);

function toMs(value) {
  const ms = new Date(String(value || '')).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function NotificationProvider({ children }) {
  const { resident } = useResident();
  const [notificationCount, setNotificationCount] = useState(0);
  const [latestFeedTs, setLatestFeedTs] = useState('');
  const [notificationItems, setNotificationItems] = useState([]);

  const refreshNotifications = useCallback(async () => {
    const data = await getTaskFeed();
    const items = Array.isArray(data?.feed) ? data.feed : [];
    const filtered = items
      .filter((item) => item?.type !== 'deleted' && item?.type !== 'comment_reply')
      .sort((a, b) => toMs(b?.ts) - toMs(a?.ts));
    const newest = filtered.reduce((acc, item) => (toMs(item?.ts) > toMs(acc) ? item.ts : acc), '');
    setLatestFeedTs(newest);

    const key = `${STORAGE_KEY}:${resident}`;
    const lastSeen = await AsyncStorage.getItem(key);
    const lastSeenMs = toMs(lastSeen);

    const unseenItems = filtered.filter((item) => {
      const itemMs = toMs(item?.ts);
      const isNew = itemMs > lastSeenMs;
      const fromOtherResident = String(item?.actor || '').trim().toUpperCase() !== String(resident || '').trim().toUpperCase();
      return isNew && fromOtherResident;
    });
    setNotificationCount(unseenItems.length);

    const topItems = filtered.slice(0, 30).map((item) => ({
      ...item,
      isUnread:
        toMs(item?.ts) > lastSeenMs &&
        String(item?.actor || '').trim().toUpperCase() !== String(resident || '').trim().toUpperCase(),
    }));
    setNotificationItems(topItems);
    return { unseen: unseenItems.length, newest, items: topItems };
  }, [resident]);

  const markNotificationsAsSeen = useCallback(async () => {
    const key = `${STORAGE_KEY}:${resident}`;
    const nowValue = latestFeedTs || new Date().toISOString();
    await AsyncStorage.setItem(key, nowValue);
    setNotificationCount(0);
    setNotificationItems((prev) => prev.map((item) => ({ ...item, isUnread: false })));
  }, [resident, latestFeedTs]);

  useEffect(() => {
    let mounted = true;
    const safeRefresh = async () => {
      try {
        await refreshNotifications();
      } catch {
        // Keep last successful notification snapshot while offline.
      }
    };
    safeRefresh();
    const timer = setInterval(safeRefresh, 12000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [refreshNotifications]);

  const value = useMemo(
    () => ({
      notificationCount,
      notificationItems,
      refreshNotifications,
      markNotificationsAsSeen,
    }),
    [notificationCount, notificationItems, refreshNotifications, markNotificationsAsSeen]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
