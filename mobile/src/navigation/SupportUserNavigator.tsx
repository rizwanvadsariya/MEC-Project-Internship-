/** Support User stack — Phase 0 home stub; Phase 1 adds strict view-only
 *  screens (SupportDashboardScreen already stubbed under screens/supportUser). */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RoleHomeScreen from '../screens/common/RoleHomeScreen';

const Stack = createNativeStackNavigator();

export default function SupportUserNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="SupportHome" component={RoleHomeScreen} options={{ title: 'Support User' }} />
    </Stack.Navigator>
  );
}
