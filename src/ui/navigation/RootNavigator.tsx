// Owns RootStackParamList + NavigationContainer. Accepts a computed
// initialRouteName prop (decided by App.tsx from resolved persisted state);
// it does NOT call persistence itself.

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { LevelId } from '../../domain/content/catalog.types';
import { CertificateScreen } from '../screens/CertificateScreen';
import { CoursePathScreen } from '../screens/CoursePathScreen';
import { FocusScreen } from '../screens/FocusScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LessonScreen } from '../screens/LessonScreen';
import { MasteryResultScreen } from '../screens/MasteryResultScreen';
import { MasteryScreen } from '../screens/MasteryScreen';
import { PracticeScreen } from '../screens/PracticeScreen';
import { ProgressScreen } from '../screens/ProgressScreen';
import { ResultScreen } from '../screens/ResultScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { TrackSelectScreen } from '../screens/TrackSelectScreen';

export type RootStackParamList = {
  TrackSelect: undefined;
  Home: undefined;
  CoursePath: { trackId: string };
  Lesson: { trackId: string; levelId: LevelId; lessonId: string };
  Practice: { trackId: string; levelId: LevelId; lessonId: string };
  Result: { trackId: string; levelId: LevelId; lessonId: string };
  Mastery: { trackId: string; levelId: LevelId };
  // answers: the selectedIndex per question, in question order, collected by
  // the Mastery screen (all five required before submit). MasteryResult grades
  // them with gradeMastery, so they must travel with the route.
  MasteryResult: { trackId: string; levelId: LevelId; answers: number[] };
  Progress: undefined;
  Focus: undefined;
  Certificate: { trackId: string };
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator({
  initialRouteName,
}: {
  initialRouteName: keyof RootStackParamList;
}) {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={initialRouteName}>
        <Stack.Screen
          name="TrackSelect"
          component={TrackSelectScreen}
          options={{ title: 'Choose a track' }}
        />
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: 'Goalie' }}
        />
        <Stack.Screen
          name="CoursePath"
          component={CoursePathScreen}
          options={{ title: 'Course path' }}
        />
        <Stack.Screen
          name="Lesson"
          component={LessonScreen}
          options={{ title: 'Lesson' }}
        />
        <Stack.Screen
          name="Practice"
          component={PracticeScreen}
          options={{ title: 'Practice' }}
        />
        <Stack.Screen
          name="Result"
          component={ResultScreen}
          options={{ title: 'Result' }}
        />
        <Stack.Screen
          name="Mastery"
          component={MasteryScreen}
          options={{ title: 'Mastery check' }}
        />
        <Stack.Screen
          name="MasteryResult"
          component={MasteryResultScreen}
          options={{ title: 'Mastery result' }}
        />
        <Stack.Screen
          name="Progress"
          component={ProgressScreen}
          options={{ title: 'Progress' }}
        />
        <Stack.Screen
          name="Focus"
          component={FocusScreen}
          options={{ title: 'Focus' }}
        />
        <Stack.Screen
          name="Certificate"
          component={CertificateScreen}
          options={{ title: 'Certificate preview' }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: 'Settings' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default RootNavigator;
