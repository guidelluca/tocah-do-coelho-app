import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { RESIDENTS } from '../constants/residents';
import { getProfiles, queryFor, setProfilePhoto } from '../services/api';
import { invalidateResources, mutateResource, useResource } from '../data/store';
import { norm } from '../utils/text';

const STORAGE_KEY = '@tocah_selected_resident';
const HIDE_VALUES_KEY = '@tocah_hide_values';
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
  const getResidentPhoto = useCallback((name) => {
    const key = RESIDENTS.find((r) => norm(r) === norm(name));
    return (key && photoMap[key]?.photoDataUrl) || '';
  }, [photoMap]);

  /** Salva a foto (data URL já reduzida) na planilha: todo mundo passa a ver. Vazio remove. */
  const updateMyPhoto = useCallback(async (photoDataUrl) => {
    mutateResource('profiles', (prev) => {
      const next = { ...(prev?.profiles || {}) };
      if (photoDataUrl) next[resident] = { photoDataUrl, updatedAt: new Date().toISOString() };
      else delete next[resident];
      return { ...(prev || {}), profiles: next };
    });
    try {
      return await setProfilePhoto({ nome: resident, photoDataUrl });
    } finally {
      invalidateResources('profiles');
    }
  }, [resident]);

  const value = useMemo(
    () => ({ ready, resident, hasChosen, selectResident, residents: RESIDENTS, getResidentPhoto, updateMyPhoto, valuesHidden, toggleValuesHidden }),
    [ready, resident, hasChosen, selectResident, getResidentPhoto, updateMyPhoto, valuesHidden, toggleValuesHidden]
  );
  return <ResidentContext.Provider value={value}>{children}</ResidentContext.Provider>;
}

export function useResident() {
  const ctx = useContext(ResidentContext);
  if (!ctx) throw new Error('useResident precisa do ResidentProvider');
  return ctx;
}
