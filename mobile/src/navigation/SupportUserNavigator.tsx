/** Support User stack — Phase 0 home stub + Security settings; Phase 1 adds
 *  strict view-only screens (SupportDashboardScreen already stubbed under screens/supportUser). */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RoleHomeScreen from '../screens/common/RoleHomeScreen';
import SecuritySettingsScreen from '../screens/common/SecuritySettingsScreen';
import SchemeBrowserScreen from '../screens/common/SchemeBrowserScreen';
import { stackScreenOptions } from '../theme';

const Stack = createNativeStackNavigator();

export default function SupportUserNavigator() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="SupportHome" component={RoleHomeScreen} options={{ title: 'Support User' }} />
      <Stack.Screen name="Security" component={SecuritySettingsScreen} options={{ title: 'Security' }} />
      <Stack.Screen name="Schemes" component={SchemeBrowserScreen} options={{ title: 'Scheme browser' }} />
    </Stack.Navigator>
  );
}
