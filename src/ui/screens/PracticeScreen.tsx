// Renders the lesson's practice.prompt with a free-form input and a
// reveal-answer affordance. Practice is self-checked — we do NOT pretend to
// grade free text. CTA -> Result (where the lesson is marked complete).

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';

import { MAX_PRACTICE_TEXT } from '../../domain/coaching';
import { LevelId } from '../../domain/content/catalog.types';
import { useProgression } from '../context/ProgressionProvider';
import { AppButton } from '../components/AppButton';
import { FinanceDisclaimerBanner } from '../components/FinanceDisclaimerBanner';
import { Screen } from '../components/Screen';
import { colors, radii, spacing, typography } from '../theme';
import { RootStackParamList } from '../navigation/RootNavigator';
import { findLesson, findLevel, findTrack, isFinanceTrack } from './catalogLookup';

type Props = NativeStackScreenProps<RootStackParamList, 'Practice'>;

export function PracticeScreen({ route, navigation }: Props) {
  const { trackId, levelId, lessonId } = route.params;
  const { status, error, catalog, reload } = useProgression();
  const [draft, setDraft] = useState('');
  const [revealed, setRevealed] = useState(false);

  if (status === 'loading') {
    return <Screen status="loading" loadingLabel="Loading practice…" />;
  }
  if (status === 'error' || catalog === null) {
    return (
      <Screen
        status="error"
        errorMessage={error?.message ?? 'Could not load practice.'}
        onRetry={reload}
      />
    );
  }

  const track = findTrack(catalog, trackId);
  const level = track ? findLevel(track, levelId) : null;
  const lesson = level ? findLesson(level, lessonId) : null;
  if (track === null || level === null || lesson === null) {
    return (
      <Screen
        status="error"
        errorMessage="Practice not found."
        onRetry={() => navigation.goBack()}
        retryLabel="Go back"
      />
    );
  }

  return (
    <Screen>
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
        placeholderTextColor={colors.inkFaint}
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
        <AppButton
          label="Reveal answer"
          variant="secondary"
          accessibilityLabel="Reveal the suggested answer"
          onPress={() => setRevealed(true)}
        />
      )}

      <AppButton
        label="Continue"
        accessibilityLabel="See the explanation and continue"
        style={styles.cta}
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
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.title,
    color: colors.ink,
  },
  prompt: {
    ...typography.body,
    color: colors.ink,
  },
  input: {
    minHeight: 96,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.md,
    ...typography.body,
    color: colors.ink,
    backgroundColor: colors.surface,
    textAlignVertical: 'top',
  },
  note: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.inkMuted,
    marginTop: spacing.sm,
    textTransform: 'uppercase',
  },
  body: {
    ...typography.body,
    color: colors.ink,
  },
  cta: {
    marginTop: spacing.sm,
  },
});

export default PracticeScreen;
