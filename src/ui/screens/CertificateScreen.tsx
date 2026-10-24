// Builds buildCertificatePreview from REAL state and renders the fields a
// certificate would contain. Clearly labeled a PREVIEW (PDF is a later
// release). Shows only truly-earned levels. Empty state when nothing is
// complete yet.

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LevelId } from '../../domain/content/catalog.types';

import { buildCertificatePreview } from '../../domain/certificates';
import { useProgression } from '../context/ProgressionProvider';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenState';
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
    return <LoadingState label="Loading certificate preview…" />;
  }
  if (status === 'error' || catalog === null) {
    return (
      <ErrorState
        message={error?.message ?? 'Could not load the certificate preview.'}
        onRetry={reload}
      />
    );
  }

  const track = findTrack(catalog, trackId);
  if (track === null) {
    return (
      <ErrorState
        message={`Track "${trackId}" not found.`}
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
      <EmptyState
        title="Nothing to preview yet"
        detail="Complete a level to preview your certificate."
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 16,
  },
  banner: {
    backgroundColor: '#fff4e5',
    borderColor: '#d9822b',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 13,
    color: '#8a5a00',
    fontWeight: '600',
  },
  card: {
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
    gap: 4,
  },
  cardLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    textTransform: 'uppercase',
  },
  cardValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  levelItem: {
    fontSize: 15,
  },
  levelButton: {
    minHeight: 48,
    justifyContent: 'center',
  },
  levelButtonText: {
    fontSize: 15,
    color: '#1f6feb',
    fontWeight: '600',
  },
});

export default CertificateScreen;
