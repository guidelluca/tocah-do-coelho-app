import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { RESIDENTS } from '../constants/residents';

const STORAGE_KEY = '@tocah_selected_resident';
const PHOTOS_STORAGE_KEY = '@tocah_resident_photos';
const ResidentContext = createContext(null);

export function ResidentProvider({ children }) {
  const [resident, setResident] = useState(RESIDENTS[0]);
  const [residentPhotos, setResidentPhotos] = useState({});

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved && RESIDENTS.includes(saved)) setResident(saved);
      const rawPhotos = await AsyncStorage.getItem(PHOTOS_STORAGE_KEY);
      if (rawPhotos) {
        try {
          const parsed = JSON.parse(rawPhotos);
          if (parsed && typeof parsed === 'object') setResidentPhotos(parsed);
        } catch {
          // Ignore invalid persisted content.
        }
      }
    })();
  }, []);

  const selectResident = async (name) => {
    if (!RESIDENTS.includes(name)) return;
    setResident(name);
    await AsyncStorage.setItem(STORAGE_KEY, name);
  };

  const setResidentPhoto = async (name, uri) => {
    if (!RESIDENTS.includes(name)) return;
    const normalized = String(uri || '').trim();
    const next = {
      ...residentPhotos,
      [name]: normalized,
    };
    setResidentPhotos(next);
    await AsyncStorage.setItem(PHOTOS_STORAGE_KEY, JSON.stringify(next));
  };

  const removeResidentPhoto = async (name) => {
    if (!RESIDENTS.includes(name)) return;
    const next = { ...residentPhotos };
    delete next[name];
    setResidentPhotos(next);
    await AsyncStorage.setItem(PHOTOS_STORAGE_KEY, JSON.stringify(next));
  };

  const getResidentPhoto = (name) => {
    const key = String(name || '').trim();
    return residentPhotos[key] || '';
  };

  const value = useMemo(
    () => ({
      resident,
      selectResident,
      residents: RESIDENTS,
      residentPhotos,
      getResidentPhoto,
      setResidentPhoto,
      removeResidentPhoto,
    }),
    [resident, residentPhotos]
  );
  return <ResidentContext.Provider value={value}>{children}</ResidentContext.Provider>;
}

export function useResident() {
  const ctx = useContext(ResidentContext);
  if (!ctx) throw new Error('useResident must be used within ResidentProvider');
  return ctx;
}
