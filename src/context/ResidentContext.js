import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { RESIDENTS } from '../constants/residents';
import { getProfiles, queryFor, setProfilePhoto } from '../services/api';
import { invalidateResources, mutateResource, useResource } from '../data/store';
import { norm } from '../utils/text';
import { legacyUriToAvatar } from '../utils/photo';

const STORAGE_KEY = '@tocah_selected_resident';
const HIDE_VALUES_KEY = '@tocah_hide_values';
/** Onde o app antigo guardava as fotos de perfil (só no aparelho). */
const LEGACY_PHOTOS_KEY = '@tocah_resident_photos';
const LEGACY_MIGRATED_KEY = '@tocah_resident_photos_migrated';
const ResidentContext = createContext(null);

/**
 * Morador "logado" (sem login, escolhido no aparelho) + fotos de perfil COMPARTILHADAS (aba Perfis).
 * hasChosen=false na primeira abertura: o app pergunta "Quem é você?".
 */
export function ResidentProvider({ children }) {
  const [resident, setResident] = useState(RESIDENTS[0]);
  const [hasChosen, setHasChosen] = useState(true);
  const [ready, setReady] = useState(false);
  const [valuesHidden, setValuesHidden] = useState(false);
  const profiles = useResource('profiles', getProfiles, { resources: ['profiles'], cacheQuery: queryFor('getProfiles') });

  useEffect(() => {
    (async () => {
      try {
        const [saved, hidden] = await Promise.all([AsyncStorage.getItem(STORAGE_KEY), AsyncStorage.getItem(HIDE_VALUES_KEY)]);
        if (saved && RESIDENTS.includes(saved)) setResident(saved);
        else setHasChosen(false);
        setValuesHidden(hidden === '1');
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const selectResident = useCallback(async (name) => {
    if (!RESIDENTS.includes(name)) return;
    setResident(name);
    setHasChosen(true);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, name);
    } catch {
      // segue sem persistir
    }
  }, []);

  const toggleValuesHidden = useCallback(() => {
    setValuesHidden((prev) => {
      AsyncStorage.setItem(HIDE_VALUES_KEY, prev ? '0' : '1').catch(() => {});
      return !prev;
    });
  }, []);

  const photoMap = profiles.data?.profiles || {};

  // Migração: sobe para a planilha as fotos que o app antigo deixou salvas neste aparelho
  // (só para quem ainda não tem foto na planilha). Roda uma vez por aparelho.
  const migrating = useRef(false);
  useEffect(() => {
    if (migrating.current || !profiles.updatedAt) return;
    migrating.current = true;
    (async () => {
      try {
        if (await AsyncStorage.getItem(LEGACY_MIGRATED_KEY)) return;
        const raw = await AsyncStorage.getItem(LEGACY_PHOTOS_KEY);
        const legacy = raw ? JSON.parse(raw) : {};
        let pending = false;
        for (const [name, uri] of Object.entries(legacy || {})) {
          const key = RESIDENTS.find((r) => norm(r) === norm(name));
          if (!key || !uri || photoMap[key]?.photoDataUrl) continue;
          const data = await legacyUriToAvatar(uri);
          if (!data) continue;
          try {
            await setProfilePhoto({ nome: key, photoDataUrl: data });
          } catch {
            pending = true;
          }
        }
        if (!pending) await AsyncStorage.setItem(LEGACY_MIGRATED_KEY, new Date().toISOString());
        invalidateResources('profiles');
      } catch {
        // sem foto antiga ou formato inválido: nada a migrar
      } finally {
        migrating.current = false;
      }
    })();
  }, [profiles.updatedAt]);
  const getResidentPhoto = useCallback((name) => {
    const key = RESIDENTS.find((r) => norm(r) === norm(name));
    return (key && photoMap[key]?.photoDataUrl) || '';
  }, [photoMap]);

  /** Salva a foto (data URL já reduzida) de QUALQUER morador na planilha: todo mundo passa a ver. Vazio remove. */
  const updatePhoto = useCallback(async (name, photoDataUrl) => {
    const key = RESIDENTS.find((r) => norm(r) === norm(name));
    if (!key) throw new Error('Morador inválido.');
    mutateResource('profiles', (prev) => {
      const next = { ...(prev?.profiles || {}) };
      if (photoDataUrl) next[key] = { photoDataUrl, updatedAt: new Date().toISOString() };
      else delete next[key];
      return { ...(prev || {}), profiles: next };
    });
    try {
      return await setProfilePhoto({ nome: key, photoDataUrl });
    } finally {
      invalidateResources('profiles');
    }
  }, []);

  const updateMyPhoto = useCallback((photoDataUrl) => updatePhoto(resident, photoDataUrl), [resident, updatePhoto]);

  const value = useMemo(
    () => ({ ready, resident, hasChosen, selectResident, residents: RESIDENTS, getResidentPhoto, updatePhoto, updateMyPhoto, valuesHidden, toggleValuesHidden }),
    [ready, resident, hasChosen, selectResident, getResidentPhoto, updatePhoto, updateMyPhoto, valuesHidden, toggleValuesHidden]
  );
  return <ResidentContext.Provider value={value}>{children}</ResidentContext.Provider>;
}

export function useResident() {
  const ctx = useContext(ResidentContext);
  if (!ctx) throw new Error('useResident precisa do ResidentProvider');
  return ctx;
}
