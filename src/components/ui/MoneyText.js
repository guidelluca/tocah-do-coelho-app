import { useResident } from '../../context/ResidentContext';
import { brl, MASKED, signedBrl } from '../../utils/money';
import { AppText } from './primitives';

/** Valor em R$ que respeita o "ocultar valores" (olhinho). signed: mostra +/−. */
export function MoneyText({ value, variant = 'bodyStrong', color = 'text', signed, mask = true, style, ...rest }) {
  const { valuesHidden } = useResident();
  const text = mask && valuesHidden ? MASKED : signed ? signedBrl(value) : brl(value);
  return (
    <AppText variant={variant} color={color} tabular style={style} {...rest}>
      {text}
    </AppText>
  );
}
