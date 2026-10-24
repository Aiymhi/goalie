// The 5-question single-correct mastery flow for a level. Collects a
// selectedIndex per question and requires all five answered before submit, so
// gradeMastery never hits its length-mismatch throw. Finance track: disclaimer
// banner. A partial submit is blocked with inline guidance (not an error).

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LevelId } from '../../domain/content/catalog.types';
import { useProgression } from '../context/ProgressionProvider';
import { AppButton } from '../components/AppButton';
import { FinanceDisclaimerBanner } from '../components/FinanceDisclaimerBanner';
import { Screen } from '../components/Screen';
import {
  colors,
  MIN_TOUCH_TARGET,
  radii,
  spacing,
  typography,
} from '../theme';
import { RootStackParamList } from '../navigation/RootNavigator';
import { findLevel, findTrack, isFinanceTrack } from './catalogLookup';

type Props = NativeStackScreenProps<RootStackParamList, 'Mastery'>;

export function MasteryScreen({ route, navigation }: Props) {
  const { trackId, levelId } = route.params;
  const { status, error, catalog, reload } = useProgression();
  // -1 means "unanswered".
  const [answers, setAnswers] = useState<number[]>([]);
  const [showGuidance, setShowGuidance] = useState(false);

  if (status === 'loading') {
    return <Screen status="loading" loadingLabel="Loading mastery check…" />;
  }
  if (status === 'error' || catalog === null) {
    return (
      <Screen
        status="error"
        errorMessage={error?.message ?? 'Could not load the mastery check.'}
        onRetry={reload}
      />
    );
  }

  const track = findTrack(catalog, trackId);
  const level = track ? findLevel(track, levelId) : null;
  if (track === null || level === null) {
    return (
      <Screen
        status="error"
        errorMessage="Mastery check not found."
        onRetry={() => navigation.goBack()}
        retryLabel="Go back"
      />
    );
  }

  const questions = level.mastery.questions;
  // Lazily initialize the answers array to -1 per question.
  const current =
    answers.length === questions.length
      ? answers
      : questions.map(() => -1);

  const select = (questionIndex: number, optionIndex: number) => {
    const next = [...current];
    next[questionIndex] = optionIndex;
    setAnswers(next);
  };

  const allAnswered = current.every((a) => a >= 0);

  const submit = () => {
    if (!allAnswered) {
      setShowGuidance(true);
      return;
    }
    navigation.navigate('MasteryResult', {
      trackId: track.id,
      levelId: level.id as LevelId,
      answers: current,
    });
  };

  return (
    <Screen>
      {isFinanceTrack(track.id) && track.disclaimer ? (
        <FinanceDisclaimerBanner text={track.disclaimer} />
      ) : null}

      <Text style={styles.title}>{level.title} mastery check</Text>
      <Text style={styles.rule}>{level.mastery.passRule}</Text>

      {questions.map((question, qi) => (
        <View key={question.id} style={styles.question}>
          <Text style={styles.prompt}>
            {qi + 1}. {question.prompt}
          </Text>
          {question.options.map((option, oi) => {
            const selected = current[qi] === oi;
            return (
              <Pressable
                key={oi}
                style={[styles.option, selected && styles.optionSelected]}
                onPress={() => select(qi, oi)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={option}
              >
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}

      {showGuidance && !allAnswered ? (
        <Text style={styles.guidance}>
          Answer all five questions before submitting.
        </Text>
      ) : null}

      <AppButton
        label="Submit"
        accessibilityLabel="Submit mastery check"
        disabled={!allAnswered}
        style={styles.cta}
        onPress={submit}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.title,
    color: colors.ink,
  },
  rule: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  question: {
    gap: spacing.sm,
  },
  prompt: {
    ...typography.bodyStrong,
    color: colors.ink,
  },
  option: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  optionSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  optionText: {
    ...typography.body,
    color: colors.ink,
  },
  optionTextSelected: {
    color: colors.accent,
    fontWeight: '600',
  },
  guidance: {
    ...typography.body,
    color: colors.danger,
  },
  cta: {
    marginTop: spacing.sm,
  },
});

export default MasteryScreen;
