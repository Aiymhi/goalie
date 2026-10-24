// Renders the lesson's practice.prompt with a free-form input and a
// reveal-answer affordance. Practice is self-checked — we do NOT pretend to
// grade free text. CTA -> Result (where the lesson is marked complete).

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';

import { MAX_PRACTICE_TEXT } from '../../domain/coaching';
import { LevelId } from '../../domain/content/catalog.types';
import { useProgression } from '../context/ProgressionProvider';
import { FinanceDisclaimerBanner } from '../components/FinanceDisclaimerBanner';
import { ErrorState, LoadingState } from '../components/ScreenState';
import { RootStackParamList } from '../navigation/RootNavigator';
import { findLesson, findLevel, findTrack, isFinanceTrack } from './catalogLookup';

type Props = NativeStackScreenProps<RootStackParamList, 'Practice'>;

export function PracticeScreen({ route, navigation }: Props) {
  const { trackId, levelId, lessonId } = route.params;
  const { status, error, catalog, reload } = useProgression();
  const [draft, setDraft] = useState('');
  const [revealed, setRevealed] = useState(false);

  if (status === 'loading') {
    return <LoadingState label="Loading practice…" />;
  }
  if (status === 'error' || catalog === null) {
    return (
      <ErrorState
        message={error?.message ?? 'Could not load practice.'}
        onRetry={reload}
      />
    );
  }

  const track = findTrack(catalog, trackId);
  const level = track ? findLevel(track, levelId) : null;
  const lesson = level ? findLesson(level, lessonId) : null;
  if (track === null || level === null || lesson === null) {
    return (
      <ErrorState
        message="Practice not found."
        onRetry={() => navigation.goBack()}
        retryLabel="Go back"
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {isFinanceTrack(track.id) && track.disclaimer ? (
        <FinanceDisclaimerBanner text={track.disclaimer} />
      ) : null}

      <Text style={styles.title}>Practice</Text>
      <Text style={styles.prompt}>{lesson.practice.prompt}</Text>

      <TextInput
        style={styles.input}
        value={draft}
        onChangeText={setDraft}
        placeholder="Write your answer here"
        accessibilityLabel="Your practice answer"
        multiline
      />
      <Text style={styles.note}>
        This practice is self-checked — your answer is not graded.
      </Text>

      {revealed ? (
        <>
          <Text style={styles.sectionLabel}>Suggested answer</Text>
          <Text style={styles.body}>{lesson.practice.answer}</Text>
        </>
      ) : (
        <Pressable
          style={styles.secondary}
          onPress={() => setRevealed(true)}
          accessibilityRole="button"
          accessibilityLabel="Reveal the suggested answer"
        >
          <Text style={styles.secondaryText}>Reveal answer</Text>
        </Pressable>
      )}

      <Pressable
        style={styles.primary}
        onPress={() =>
          navigation.navigate('Result', {
            trackId: track.id,
            levelId: level.id as LevelId,
            lessonId: lesson.id,
            // Always forward the draft (trimmed + bounded) so practice coaching
            // and hadText are grounded in what was actually written. It is
            // display/coaching-only and never persisted as raw text.
            practiceAnswer: draft.trim().slice(0, MAX_PRACTICE_TEXT),
          })
        }
        accessibilityRole="button"
        accessibilityLabel="See the explanation and continue"
      >
        <Text style={styles.primaryText}>Continue</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  prompt: {
    fontSize: 16,
    lineHeight: 22,
  },
  input: {
    minHeight: 96,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  note: {
    fontSize: 12,
    color: '#666',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginTop: 8,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  secondary: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: '#1f6feb',
    borderWidth: 1,
    borderRadius: 8,
  },
  secondaryText: {
    fontSize: 16,
    color: '#1f6feb',
    fontWeight: '600',
  },
  primary: {
    minHeight: 56,
    backgroundColor: '#1f6feb',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  primaryText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});

export default PracticeScreen;
