import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FinancesScreen } from '../screens/FinancesScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { FeedScreen } from '../screens/FeedScreen';
import { NildeScreen } from '../screens/NildeScreen';
import { useThemeMode } from '../context/ThemeContext';
import { darkTheme, lightTheme } from '../constants/theme';

const Tab = createBottomTabNavigator();

export function AppNavigator() {
  const { isDark } = useThemeMode();
  const colors = isDark ? darkTheme : lightTheme;
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 78,
          paddingBottom: 10,
          paddingTop: 8,
          marginHorizontal: 10,
          marginBottom: 10,
          borderRadius: 16,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontWeight: '700', fontSize: 11 },
        tabBarIcon: ({ color, size }) => {
          const map = { Inicio: 'home-outline', Financas: 'cash-multiple', Tarefas: 'clipboard-list-outline', Nilde: 'rabbit', Feed: 'message-text-outline' };
          return <MaterialCommunityIcons name={map[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Inicio" component={HomeScreen} />
      <Tab.Screen name="Financas" component={FinancesScreen} />
      <Tab.Screen name="Tarefas" component={TasksScreen} />
      <Tab.Screen name="Nilde" component={NildeScreen} />
      <Tab.Screen name="Feed" component={FeedScreen} />
    </Tab.Navigator>
  );
}
