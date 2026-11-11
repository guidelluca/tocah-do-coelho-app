import { useCallback, useState } from 'react';
import { avaliarEntrega, concluirTarefa, entregarTarefa } from '../services/api';
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

/** Entrega da tarefa com foto (uma vez por semana; vale a semana passada até quarta). Retorna a foto escolhida para confirmar. */
export function useEntregarTarefa(resident) {
  const { toast, toastError } = useFeedback();
  const [busy, setBusy] = useState(false);
  const escolherFoto = useCallback(async (source = 'camera') => {
    try {
      const photo = await pickPhoto({ source, size: 'proof' });
      if (!photo) toast('Precisa de uma foto da tarefa feita.', 'warning');
      return photo || '';
    } catch (e) {
      toastError(e);
      return '';
    }
  }, [toast, toastError]);
  const enviar = useCallback(async ({ ciclo, photoDataUrl }) => {
    setBusy(true);
    try {
      const res = await entregarTarefa({ usuario: resident, ciclo, photoDataUrl });
      toast(res?.atrasoDias ? `Tarefa entregue com ${res.atrasoDias} dia${res.atrasoDias > 1 ? 's' : ''} de atraso.` : 'Tarefa entregue no prazo! Mandou bem. 🐰', 'success');
      return true;
    } catch (e) {
      if (e?.code === 'ALREADY_DONE') toast('Essa semana já estava entregue.', 'info');
      else toastError(e, 'Não deu para entregar a tarefa.');
      return false;
    } finally {
      setBusy(false);
      invalidateResources('avaliacao', 'feed', 'escala');
    }
  }, [resident, toast, toastError]);
  return { escolherFoto, enviar, busy };
}

/** Avaliar uma entrega (casa e, se tiver, banheirão) de uma vez. */
export function useAvaliarEntrega(resident) {
  const { toast, toastError } = useFeedback();
  const [busyTarget, setBusyTarget] = useState('');
  const avaliar = useCallback(async ({ ciclo, target, notas, comentario }) => {
    setBusyTarget(target);
    try {
      for (const [categoria, nota] of Object.entries(notas)) {
        try {
          await avaliarEntrega({ actor: resident, target, ciclo, nota, comentario: categoria === 'casa' ? comentario : '', categoria });
        } catch (e) {
          if (e?.code !== 'ALREADY_RATED') throw e;
        }
      }
      toast('Avaliação enviada (anônima).', 'success');
      return true;
    } catch (e) {
      toastError(e, 'Não deu para enviar a avaliação.');
      return false;
    } finally {
      setBusyTarget('');
      invalidateResources('avaliacao', 'ratings');
    }
  }, [resident, toast, toastError]);
  return { avaliar, busyTarget };
}
