// Builds buildCertificatePreview from REAL state and renders the fields a
// certificate would contain. Clearly labeled a PREVIEW (PDF is a later
// release). Shows only truly-earned levels. Empty state when nothing is
// complete yet.

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LevelId } from '../../domain/content/catalog.types';

import { buildCertificatePreview } from '../../domain/certificates';
import { useProgression } from '../context/ProgressionProvider';
import { Screen } from '../components/Screen';
import { colors, MIN_TOUCH_TARGET, radii, spacing, typography } from '../theme';
import { RootStackParamList } from '../navigation/RootNavigator';
import { findTrack } from './catalogLookup';

type Props = NativeStackScreenProps<RootStackParamList, 'Certificate'>;

// Level id -> human label (fallback to the raw id if unknown).
function levelLabel(levelId: string): string {
  switch (levelId) {
    case 'beginner':
      return 'Beginner';
    case 'intermediate':
      return 'Intermediate';
    case 'advanced':
      return 'Advanced';
    default:
      return levelId;
  }
}

export function CertificateScreen({ route, navigation }: Props) {
  const { trackId } = route.params;
  const { status, error, catalog, progression, displayName, reload } =
    useProgression();

  if (status === 'loading') {
    return <Screen status="loading" loadingLabel="Loading certificate preview…" />;
  }
  if (status === 'error' || catalog === null) {
    return (
      <Screen
        status="error"
        errorMessage={error?.message ?? 'Could not load the certificate preview.'}
        onRetry={reload}
      />
    );
  }

  const track = findTrack(catalog, trackId);
  if (track === null) {
    return (
      <Screen
        status="error"
        errorMessage={`Track "${trackId}" not found.`}
        onRetry={() => navigation.goBack()}
        retryLabel="Go back"
      />
    );
  }

  const preview = buildCertificatePreview(
    progression,
    track,
    displayName,
    Date.now(),
  );

  if (preview.completedLevels.length === 0) {
    return (
      <Screen
        status="empty"
        emptyTitle="Nothing to preview yet"
        emptyDetail="Complete a level to preview your certificate."
      />
    );
  }

  return (
    <Screen>
      <Text style={styles.banner}>
        Preview — not an official certificate; full PDF in a later release.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Track</Text>
        <Text style={styles.cardValue}>{preview.trackTitle}</Text>

        <Text style={styles.cardLabel}>Name</Text>
        <Text style={styles.cardValue}>{preview.displayName ?? '—'}</Text>

        <Text style={styles.cardLabel}>Completed levels</Text>
        {preview.completedLevels.map((levelId) => (
          <Pressable
            key={levelId}
            style={styles.levelButton}
            onPress={() =>
              navigation.navigate('CertificateDetail', {
                trackId,
                levelId: levelId as LevelId,
              })
            }
            accessibilityRole="button"
            accessibilityLabel={`View certificate for ${levelLabel(levelId)}`}
          >
            <Text style={styles.levelButtonText}>
              • {levelLabel(levelId)} — view certificate
            </Text>
          </Pressable>
        ))}

        <Text style={styles.cardLabel}>Track complete</Text>
        <Text style={styles.cardValue}>
          {preview.trackComplete ? 'Yes' : 'Not yet'}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.md,
    ...typography.label,
    color: colors.warning,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  cardLabel: {
    ...typography.label,
    color: colors.inkMuted,
    marginTop: spacing.sm,
    textTransform: 'uppercase',
  },
  cardValue: {
    ...typography.bodyStrong,
    color: colors.ink,
  },
  levelButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
  levelButtonText: {
    ...typography.bodyStrong,
    color: colors.accent,
  },
});

export default CertificateScreen;
