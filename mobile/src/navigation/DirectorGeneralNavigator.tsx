/** Director General stack — Phase 0 home stub; Phase 1 adds ApprovalQueueScreen
 *  (already stubbed under screens/directorGeneral). */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RoleHomeScreen from '../screens/common/RoleHomeScreen';

const Stack = createNativeStackNavigator();

export default function DirectorGeneralNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="DgHome" component={RoleHomeScreen} options={{ title: 'Director General' }} />
    </Stack.Navigator>
  );
}
