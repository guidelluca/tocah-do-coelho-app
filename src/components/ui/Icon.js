import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';

/** Ícone com cor por token: <Icon name="cash" color="primary" /> ou color direta vinda de tokens. */
export function Icon({ name, size = 20, color = 'text', style }) {
  const { colors } = useTheme();
  return <MaterialCommunityIcons name={name} size={size} color={colors[color] || color} style={style} />;
}
