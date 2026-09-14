/** Regional Director stack — Phase 0 home stub + Security settings; Phase 1
 *  adds TeamAssemblyScreen / TeamListScreen (already stubbed under screens/regionalDirector). */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RoleHomeScreen from '../screens/common/RoleHomeScreen';
import SecuritySettingsScreen from '../screens/common/SecuritySettingsScreen';

const Stack = createNativeStackNavigator();

export default function RegionalDirectorNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="RdHome" component={RoleHomeScreen} options={{ title: 'Regional Director' }} />
      <Stack.Screen name="Security" component={SecuritySettingsScreen} options={{ title: 'Security' }} />
    </Stack.Navigator>
  );
}
