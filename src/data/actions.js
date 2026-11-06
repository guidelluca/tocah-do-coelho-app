import { useCallback, useState } from 'react';
import { concluirTarefa } from '../services/api';
import { useFeedback } from '../components/ui';
import { pickPhoto } from '../utils/photo';
import { invalidateResources, mutateResource } from './store';

/** Concluir a própria tarefa: foto obrigatória → grava o check → todo mundo vê "Feita". */
export function useCompleteTask(resident) {
  const { toast, toastError } = useFeedback();
  const [busy, setBusy] = useState(false);
  const complete = useCallback(async (source = 'camera', tarefaNome = '') => {
    let photo = '';
    try {
      photo = await pickPhoto({ source, size: 'proof' });
    } catch (e) {
      toastError(e);
      return false;
    }
    if (!photo) {
      toast('Precisa de uma foto para comprovar a tarefa.', 'warning');
      return false;
    }
    setBusy(true);
    try {
      const res = await concluirTarefa({ usuario: resident, tarefaNome, photoDataUrl: photo });
      mutateResource(`task:${resident}`, (prev) => ({ ...(prev || {}), concluida: true, concluidaEm: res?.ts || new Date().toISOString(), checkTs: res?.ts || '', checkHasPhoto: true }));
      toast('Tarefa concluída! Mandou bem. 🐰', 'success');
      return true;
    } catch (e) {
      if (e?.code === 'ALREADY_DONE') toast('Sua tarefa desta semana já estava concluída.', 'info');
      else toastError(e, 'Não deu para registrar a tarefa.');
      return false;
    } finally {
      setBusy(false);
      invalidateResources('feed');
    }
  }, [resident, toast, toastError]);
  return { complete, busy };
}
