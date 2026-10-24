// Shows level-completion badges that appear ONLY when isLevelComplete is true
// (no fake/greyed "almost" badges). Shows bestCorrectCount per attempted level
// as honest history. Links to the Certificate preview. Empty state when no
// badges are earned yet.

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';

import { viewLevelProgress } from '../../domain/progression';
import { useProgression } from '../context/ProgressionProvider';
import { AppButton } from '../components/AppButton';
import { Screen } from '../components/Screen';
import { colors, radii, spacing, typography } from '../theme';
import { RootStackParamList } from '../navigation/RootNavigator';
import { findTrack } from './catalogLookup';

type Props = NativeStackScreenProps<RootStackParamList, 'Progress'>;

export function ProgressScreen({ navigation }: Props) {
  const {
    status,
    error,
    catalog,
    progression,
    selectedTrackId,
    viewRewards,
    reload,
  } = useProgression();

  if (status === 'loading') {
    return <Screen status="loading" loadingLabel="Loading progress…" />;
  }
  if (status === 'error' || catalog === null) {
    return (
      <Screen
        status="error"
        errorMessage={error?.message ?? 'Could not load your progress.'}
        onRetry={reload}
      />
    );
  }

  const track = selectedTrackId ? findTrack(catalog, selectedTrackId) : null;
  if (track === null) {
    return (
      <Screen
        status="empty"
        emptyTitle="No track selected"
        emptyDetail="Choose a track to start earning badges."
        emptyAction={
          <AppButton
            label="Choose a track"
            onPress={() => navigation.navigate('TrackSelect')}
          />
        }
      />
    );
  }

  // Badges render ONLY when the rewards ledger says the badge is earned, which
  // is tied to real completeness (both lessons + mastery). hasBadge mirrors
  // isLevelComplete's false->true edge via the append-only earnedBadges set.
  const masteredLevels = track.levels.filter((level) =>
    viewRewards.hasBadge(track.id, level.id),
  );
  const anyAttempt = track.levels.some((level) => {
    const view = viewLevelProgress(progression, level, track.id);
    return (
      view.completedLessons > 0 || view.bestCorrectCount > 0 || view.masteryPassed
    );
  });
  // Render the screen when there is ANY signal to show honestly — effort (XP /
  // streak) OR mastery OR any attempt — so a high-XP / no-mastery learner still
  // sees their effort rather than an empty state.
  const hasEffort = viewRewards.totalXp > 0 || viewRewards.streakCount > 0;

  if (masteredLevels.length === 0 && !anyAttempt && !hasEffort) {
    return (
      <Screen
        status="empty"
        emptyTitle="No badges yet"
        emptyDetail="Complete a level to earn one."
      />
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>{track.title} progress</Text>

      {/* Effort (motivation) — explicitly separated from mastery so a large XP
          total is never presented as competence. */}
      <Text style={styles.sectionLabel}>Your effort</Text>
      <View style={styles.row}>
        <Text style={styles.rowText}>Total XP</Text>
        <Text style={styles.rowValue}>{viewRewards.totalXp} XP</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowText}>Current streak</Text>
        <Text style={styles.rowValue}>
          {viewRewards.streakCount}{' '}
          {viewRewards.streakCount === 1 ? 'day' : 'days'}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowText}>Badges earned</Text>
        <Text style={styles.rowValue}>{viewRewards.earnedBadgeCount}</Text>
      </View>

      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>Levels mastered</Text>
      {masteredLevels.length === 0 ? (
        <Text style={styles.muted}>
          0 levels mastered — complete a level to earn a badge.
        </Text>
      ) : (
        masteredLevels.map((level) => (
          <View
            key={level.id}
            style={styles.badge}
            accessibilityLabel={`Badge: ${level.title} complete`}
          >
            <Text style={styles.badgeText}>{level.title} complete</Text>
          </View>
        ))
      )}

      <Text style={styles.sectionLabel}>Best mastery scores</Text>
      {track.levels.map((level) => {
        const view = viewLevelProgress(progression, level, track.id);
        return (
          <View key={level.id} style={styles.row}>
            <Text style={styles.rowText}>{level.title}</Text>
            <Text style={styles.rowValue}>
              {view.bestCorrectCount > 0 ? `${view.bestCorrectCount}/5` : '—'}
            </Text>
          </View>
        );
      })}

      <AppButton
        label="View certificate preview"
        style={styles.cta}
        onPress={() => navigation.navigate('Certificate', { trackId: track.id })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.title,
    color: colors.ink,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.inkMuted,
    marginTop: spacing.md,
    textTransform: 'uppercase',
  },
  muted: {
    ...typography.body,
    color: colors.inkMuted,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  badge: {
    backgroundColor: colors.successSoft,
    borderColor: colors.success,
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.md,
  },
  badgeText: {
    ...typography.bodyStrong,
    color: colors.success,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  rowText: {
    ...typography.body,
    color: colors.ink,
  },
  rowValue: {
    ...typography.bodyStrong,
    color: colors.ink,
  },
  cta: {
    marginTop: spacing.lg,
  },
});

export default ProgressScreen;
