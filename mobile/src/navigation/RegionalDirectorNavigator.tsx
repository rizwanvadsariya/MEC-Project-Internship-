/** Regional Director stack — only the Phase 0 home stub so far; Phase 1 adds
 *  TeamAssemblyScreen / TeamListScreen (already stubbed under screens/regionalDirector). */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RoleHomeScreen from '../screens/common/RoleHomeScreen';

const Stack = createNativeStackNavigator();

export default function RegionalDirectorNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="RdHome" component={RoleHomeScreen} options={{ title: 'Regional Director' }} />
    </Stack.Navigator>
  );
}
