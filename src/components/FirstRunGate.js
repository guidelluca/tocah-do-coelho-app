import { useResident } from '../context/ResidentContext';
import { ResidentSheet } from './ResidentSheet';

/** Na primeira abertura do app neste aparelho, pergunta quem é o morador. */
export function FirstRunGate() {
  const { ready, hasChosen } = useResident();
  return <ResidentSheet visible={ready && !hasChosen} firstRun onClose={() => {}} />;
}
