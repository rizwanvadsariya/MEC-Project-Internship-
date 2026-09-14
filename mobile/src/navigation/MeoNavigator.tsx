/** Lead MEO stack — Phase 0 home stub; Phase 1 adds VisitFormScreen /
 *  PhotoCaptureScreen / IssueReportScreen (already stubbed under screens/meo). */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RoleHomeScreen from '../screens/common/RoleHomeScreen';

const Stack = createNativeStackNavigator();

export default function MeoNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="MeoHome" component={RoleHomeScreen} options={{ title: 'Lead MEO' }} />
    </Stack.Navigator>
  );
}
