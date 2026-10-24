// The 5-question single-correct mastery flow for a level. Collects a
// selectedIndex per question and requires all five answered before submit, so
// gradeMastery never hits its length-mismatch throw. Finance track: disclaimer
// banner. A partial submit is blocked with inline guidance (not an error).

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { LevelId } from '../../domain/content/catalog.types';
import { useProgression } from '../context/ProgressionProvider';
import { FinanceDisclaimerBanner } from '../components/FinanceDisclaimerBanner';
import { ErrorState, LoadingState } from '../components/ScreenState';
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
    return <LoadingState label="Loading mastery check…" />;
  }
  if (status === 'error' || catalog === null) {
    return (
      <ErrorState
        message={error?.message ?? 'Could not load the mastery check.'}
        onRetry={reload}
      />
    );
  }

  const track = findTrack(catalog, trackId);
  const level = track ? findLevel(track, levelId) : null;
  if (track === null || level === null) {
    return (
      <ErrorState
        message="Mastery check not found."
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
    <ScrollView contentContainerStyle={styles.container}>
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

      <Pressable
        style={[styles.primary, !allAnswered && styles.primaryDisabled]}
        onPress={submit}
        accessibilityRole="button"
        accessibilityLabel="Submit mastery check"
        accessibilityState={{ disabled: !allAnswered }}
      >
        <Text style={styles.primaryText}>Submit</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  rule: {
    fontSize: 13,
    color: '#666',
  },
  question: {
    gap: 8,
  },
  prompt: {
    fontSize: 16,
    fontWeight: '600',
  },
  option: {
    minHeight: 48,
    justifyContent: 'center',
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  optionSelected: {
    borderColor: '#1f6feb',
    backgroundColor: '#eef4ff',
  },
  optionText: {
    fontSize: 15,
  },
  optionTextSelected: {
    color: '#1f6feb',
    fontWeight: '600',
  },
  guidance: {
    fontSize: 14,
    color: '#b00020',
  },
  primary: {
    minHeight: 56,
    backgroundColor: '#1f6feb',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  primaryDisabled: {
    backgroundColor: '#9bbcf0',
  },
  primaryText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});

export default MasteryScreen;
