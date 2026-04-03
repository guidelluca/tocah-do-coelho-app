import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { RESIDENTS } from '../constants/residents';

const STORAGE_KEY = '@tocah_selected_resident';
const ResidentContext = createContext(null);

export function ResidentProvider({ children }) {
  const [resident, setResident] = useState(RESIDENTS[0]);

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved && RESIDENTS.includes(saved)) setResident(saved);
    })();
  }, []);

  const selectResident = async (name) => {
    if (!RESIDENTS.includes(name)) return;
    setResident(name);
    await AsyncStorage.setItem(STORAGE_KEY, name);
  };

  const value = useMemo(() => ({ resident, selectResident, residents: RESIDENTS }), [resident]);
  return <ResidentContext.Provider value={value}>{children}</ResidentContext.Provider>;
}

export function useResident() {
  const ctx = useContext(ResidentContext);
  if (!ctx) throw new Error('useResident must be used within ResidentProvider');
  return ctx;
}
