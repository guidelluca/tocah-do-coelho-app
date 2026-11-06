import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { getSyncState, readCachedQuery } from '../services/api';

/**
 * Sincronização leve:
 * - O app pergunta ao backend "o que mudou?" (getSyncState: memória do servidor, ZERO leituras no Sheets).
 * - Só recarrega o recurso cuja versão mudou, ou a cada 2 min (para pegar edições feitas à mão na planilha).
 * - Pausa quando a aba do navegador / o app está em segundo plano.
 * - Mostra o último dado salvo na hora (sem spinner) e atualiza por trás.
 */

const SYNC_INTERVAL_MS = 15000;
const FULL_REFRESH_MS = 120000;

const entries = new Map(); // key -> { data, error, updatedAt, promise, listeners:Set, fetcher, resources, versionSeen }
let lastVersions = {};

function getEntry(key) {
  if (!entries.has(key)) entries.set(key, { data: undefined, error: null, updatedAt: 0, promise: null, listeners: new Set(), fetcher: null, resources: [], cacheQuery: '' });
  return entries.get(key);
}

function emit(entry) {
  entry.listeners.forEach((fn) => fn());
}

export async function revalidate(key) {
  const entry = getEntry(key);
  if (!entry.fetcher) return entry.data;
  if (entry.promise) return entry.promise;
  entry.promise = (async () => {
    try {
      const data = await entry.fetcher();
      entry.data = data;
      entry.error = null;
      entry.updatedAt = Date.now();
    } catch (error) {
      entry.error = error;
    } finally {
      entry.promise = null;
      emit(entry);
    }
    return entry.data;
  })();
  emit(entry);
  return entry.promise;
}

/** Recarrega tudo que depende desses recursos (ex.: depois de salvar algo). */
export function invalidateResources(...resources) {
  entries.forEach((entry, key) => {
    if (entry.listeners.size && entry.resources.some((r) => resources.includes(r))) revalidate(key);
  });
}

/** Troca o dado em memória na hora (atualização otimista). */
export function mutateResource(key, updater) {
  const entry = getEntry(key);
  entry.data = typeof updater === 'function' ? updater(entry.data) : updater;
  emit(entry);
}

/**
 * useResource('finance', getFinanceSnapshot, { resources: ['finance'], cacheQuery })
 * cacheQuery: a query do api.js usada como cache offline, para mostrar algo na hora.
 */
export function useResource(key, fetcher, { resources = [], cacheQuery = '', enabled = true } = {}) {
  const entry = getEntry(key);
  entry.fetcher = fetcher;
  entry.resources = resources;
  const [, force] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const listener = () => mounted.current && force((n) => n + 1);
    entry.listeners.add(listener);
    return () => {
      mounted.current = false;
      entry.listeners.delete(listener);
    };
  }, [entry]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      if (entry.data === undefined && cacheQuery) {
        const cached = await readCachedQuery(cacheQuery);
        if (!cancelled && cached && entry.data === undefined) {
          entry.data = cached.payload;
          entry.updatedAt = 0;
          emit(entry);
        }
      }
      if (!entry.updatedAt || Date.now() - entry.updatedAt > 5000) revalidate(key);
    })();
    return () => {
      cancelled = true;
    };
  }, [key, enabled]);

  const refresh = useCallback(() => revalidate(key), [key]);
  return {
    data: entry.data,
    error: entry.error,
    loading: entry.data === undefined && (!!entry.promise || !entry.error),
    refreshing: !!entry.promise && entry.data !== undefined,
    stale: entry.updatedAt === 0 && entry.data !== undefined,
    updatedAt: entry.updatedAt,
    refresh,
  };
}

const SyncContext = createContext({ serverWeek: '', today: '', versions: {} });

function isVisible() {
  if (Platform.OS === 'web' && typeof document !== 'undefined') return document.visibilityState !== 'hidden';
  return AppState.currentState === 'active' || AppState.currentState === undefined;
}

export function SyncProvider({ children }) {
  const [info, setInfo] = useState({ serverWeek: '', today: '', versions: {} });

  useEffect(() => {
    let timer = null;
    let lastFull = Date.now();
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      if (isVisible()) {
        try {
          const state = await getSyncState();
          const next = state?.versions || {};
          const restarted = lastVersions.__startedAt && lastVersions.__startedAt !== state?.startedAt;
          const changed = Object.keys(next).filter((k) => lastVersions[k] !== undefined && lastVersions[k] !== next[k]);
          const first = lastVersions.__startedAt === undefined;
          lastVersions = { ...next, __startedAt: state?.startedAt };
          if (restarted) invalidateResources(...Object.keys(next));
          else if (changed.length) invalidateResources(...changed);
          if (!first && Date.now() - lastFull > FULL_REFRESH_MS) {
            lastFull = Date.now();
            invalidateResources('finance', 'caixinha', 'feed', 'ratings', 'escala', 'config', 'profiles', 'likes');
          }
          setInfo((prev) => (prev.serverWeek === state?.week && prev.today === state?.today ? prev : { serverWeek: state?.week || '', today: state?.today || '', versions: next }));
        } catch {
          // offline: os hooks mostram o cache
        }
      }
      timer = setTimeout(tick, SYNC_INTERVAL_MS);
    };
    tick();

    const onVisible = () => {
      if (!isVisible()) return;
      clearTimeout(timer);
      tick();
    };
    let sub = null;
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    else sub = AppState.addEventListener('change', onVisible);

    return () => {
      stopped = true;
      clearTimeout(timer);
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      sub?.remove?.();
    };
  }, []);

  const value = useMemo(() => info, [info]);
  return createElement(SyncContext.Provider, { value }, children);
}

export function useSyncInfo() {
  return useContext(SyncContext);
}
