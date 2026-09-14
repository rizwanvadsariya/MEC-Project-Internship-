/** Director General stack — Phase 0 home stub + Security settings; Phase 1
 *  adds ApprovalQueueScreen (already stubbed under screens/directorGeneral). */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RoleHomeScreen from '../screens/common/RoleHomeScreen';
import SecuritySettingsScreen from '../screens/common/SecuritySettingsScreen';
import { stackScreenOptions } from '../theme';

const Stack = createNativeStackNavigator();

export default function DirectorGeneralNavigator() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="DgHome" component={RoleHomeScreen} options={{ title: 'Director General' }} />
      <Stack.Screen name="Security" component={SecuritySettingsScreen} options={{ title: 'Security' }} />
    </Stack.Navigator>
  );
}
