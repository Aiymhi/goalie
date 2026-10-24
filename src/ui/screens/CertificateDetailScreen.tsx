// Phase 6 certificate detail for a single truly-complete level. The DOMAIN
// builds the certificate data/HTML/share copy (pure); this screen performs the
// native effects (PDF generation, save, share) and renders honest state.
//
// Honesty guarantees surfaced here:
//  - buildCertificateData throws for an incomplete level, so an unearned
//    certificate can never render (this route is only reached from the list of
//    complete levels; the domain is the backstop).
//  - the completion date comes from the recorded timestamp; when none exists we
//    show "Completion date not recorded" rather than a fabricated now().
//  - Share is offered only when Sharing.isAvailableAsync() resolves true;
//    otherwise an honest "sharing unavailable" note is shown.
//  - the social post is editable + copyable with NO auto-posting and NO URL.

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import {
  buildCertificateData,
  buildCertificateHtml,
  buildSharePostText,
  CertificateData,
  CertificateError,
} from '../../domain/certificates/document';
import {
  generateCertificatePdf,
  savePdf,
  sharePdf,
  SharingUnavailableError,
} from '../certificates/pdf';
import { useProgression } from '../context/ProgressionProvider';
import { AppButton } from '../components/AppButton';
import { Screen } from '../components/Screen';
import { colors, radii, spacing, typography } from '../theme';
import { RootStackParamList } from '../navigation/RootNavigator';
import { findLevel, findTrack } from './catalogLookup';
import { isAvailableAsync } from 'expo-sharing';

type Props = NativeStackScreenProps<RootStackParamList, 'CertificateDetail'>;

function formatCompletionDate(data: CertificateData): string {
  if (data.completionDateUnknown || data.completionDateEpochMs === null) {
    return 'Completion date not recorded';
  }
  const d = new Date(data.completionDateEpochMs);
  const year = `${d.getFullYear()}`.padStart(4, '0');
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function CertificateDetailScreen({ route, navigation }: Props) {
  const { trackId, levelId } = route.params;
  const {
    status,
    error,
    catalog,
    progression,
    displayName,
    completedLevels,
    reload,
  } = useProgression();

  // Whether the native share sheet is available on this platform. Null until the
  // one-time async probe resolves; Share is only offered when strictly true.
  const [shareAvailable, setShareAvailable] = useState<boolean | null>(null);
  // Transient, honest status messages for the save/share effects.
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  // The editable social post draft (seeded from the domain copy).
  const [postDraft, setPostDraft] = useState<string>('');

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const available = await isAvailableAsync();
        if (active) {
          setShareAvailable(available);
        }
      } catch {
        if (active) {
          setShareAvailable(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Resolve track + level and build the certificate data. The domain throws a
  // CertificateError for an incomplete level — caught below and rendered as an
  // honest state (never a fabricated certificate).
  const resolved = useMemo(() => {
    if (catalog === null) {
      return null;
    }
    const track = findTrack(catalog, trackId);
    if (track === null) {
      return { error: `Track "${trackId}" not found.` as const };
    }
    const level = findLevel(track, levelId);
    if (level === null) {
      return { error: `Level "${levelId}" not found.` as const };
    }
    try {
      const data = buildCertificateData(
        progression,
        track,
        level,
        displayName,
        completedLevels,
      );
      return { data, html: buildCertificateHtml(data) };
    } catch (err) {
      if (err instanceof CertificateError) {
        return { error: err.message as string };
      }
      throw err;
    }
  }, [catalog, trackId, levelId, progression, displayName, completedLevels]);

  useEffect(() => {
    if (resolved && 'data' in resolved && resolved.data) {
      setPostDraft(buildSharePostText(resolved.data));
    }
  }, [resolved]);

  const onSave = useCallback(async () => {
    if (!resolved || !('html' in resolved) || !resolved.html) {
      return;
    }
    setActionStatus('Generating PDF…');
    try {
      const uri = await generateCertificatePdf(resolved.html);
      const saved = await savePdf(uri);
      setActionStatus(`Saved to ${saved}`);
    } catch {
      setActionStatus('Could not save the certificate PDF.');
    }
  }, [resolved]);

  const onShare = useCallback(async () => {
    if (!resolved || !('html' in resolved) || !resolved.html) {
      return;
    }
    setActionStatus('Preparing to share…');
    try {
      const uri = await generateCertificatePdf(resolved.html);
      await sharePdf(uri);
      // Resolves whether the user shared or dismissed — a clean no-op either way.
      setActionStatus(null);
    } catch (err) {
      if (err instanceof SharingUnavailableError) {
        setActionStatus('Sharing is not available on this device.');
      } else {
        setActionStatus('Could not share the certificate.');
      }
    }
  }, [resolved]);

  if (status === 'loading') {
    return <Screen status="loading" loadingLabel="Loading certificate…" />;
  }
  if (status === 'error' || catalog === null) {
    return (
      <Screen
        status="error"
        errorMessage={error?.message ?? 'Could not load the certificate.'}
        onRetry={reload}
      />
    );
  }
  if (resolved === null) {
    return <Screen status="loading" loadingLabel="Loading certificate…" />;
  }
  if ('error' in resolved && resolved.error) {
    // Includes the incomplete-level case: the domain refuses, so no certificate
    // is shown — an honest message with a way back instead.
    return (
      <Screen
        status="error"
        errorMessage={resolved.error}
        onRetry={() => navigation.goBack()}
        retryLabel="Go back"
      />
    );
  }

  const data = (resolved as { data: CertificateData }).data;

  return (
    <Screen>
      <View style={styles.card}>
        <Text style={styles.brand}>GOALIE</Text>
        <Text style={styles.heading}>Certificate of Completion</Text>
        <Text style={styles.name}>{data.studentDisplayName ?? 'Learner'}</Text>
        <Text style={styles.titles}>
          {data.levelTitle} · {data.trackTitle}
        </Text>

        <Text style={styles.sectionLabel}>Skills</Text>
        {data.skills.map((skill, index) => (
          <Text key={index} style={styles.skillItem}>
            • {skill}
          </Text>
        ))}

        <Text style={styles.sectionLabel}>Completion date</Text>
        <Text style={styles.value}>{formatCompletionDate(data)}</Text>

        <Text style={styles.sectionLabel}>Reference</Text>
        <Text style={styles.reference}>{data.referenceId}</Text>

        <Text style={styles.disclaimer}>{data.disclaimer}</Text>
      </View>

      <View style={styles.actions}>
        <AppButton
          label="Save PDF"
          accessibilityLabel="Save certificate PDF"
          onPress={onSave}
        />

        {shareAvailable === true ? (
          <AppButton
            label="Share"
            accessibilityLabel="Share certificate"
            onPress={onShare}
          />
        ) : shareAvailable === false ? (
          <Text style={styles.unavailable}>
            Sharing is unavailable on this device. You can still save the PDF.
          </Text>
        ) : null}
      </View>

      {actionStatus ? <Text style={styles.status}>{actionStatus}</Text> : null}

      <View style={styles.postSection}>
        <Text style={styles.postSectionLabel}>Social post (editable)</Text>
        <Text style={styles.postHint}>
          Edit and copy this before posting. Nothing is posted automatically and
          there is no public link.
        </Text>
        <TextInput
          style={styles.postInput}
          value={postDraft}
          onChangeText={setPostDraft}
          placeholderTextColor={colors.inkFaint}
          multiline
          accessibilityLabel="Editable social post"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderColor: colors.accent,
    borderWidth: 2,
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.xs,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  brand: {
    fontSize: 12,
    letterSpacing: 3,
    color: colors.accent,
    fontWeight: '700',
  },
  heading: {
    ...typography.title,
    color: colors.ink,
    marginVertical: spacing.sm,
    textAlign: 'center',
  },
  name: {
    ...typography.heading,
    fontSize: 20,
    color: colors.ink,
    textAlign: 'center',
  },
  titles: {
    ...typography.bodyStrong,
    color: colors.accent,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  sectionLabel: {
    ...typography.label,
    color: colors.inkMuted,
    marginTop: spacing.md,
    textTransform: 'uppercase',
    alignSelf: 'flex-start',
  },
  skillItem: {
    ...typography.caption,
    color: colors.ink,
    alignSelf: 'flex-start',
  },
  value: {
    ...typography.body,
    color: colors.ink,
    alignSelf: 'flex-start',
  },
  reference: {
    ...typography.caption,
    color: colors.inkFaint,
    alignSelf: 'flex-start',
  },
  disclaimer: {
    ...typography.caption,
    color: colors.warning,
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  actions: {
    gap: spacing.md,
  },
  unavailable: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  status: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  postSection: {
    gap: spacing.sm,
  },
  postSectionLabel: {
    ...typography.label,
    color: colors.inkMuted,
    textTransform: 'uppercase',
  },
  postHint: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  postInput: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.md,
    minHeight: 100,
    ...typography.caption,
    color: colors.ink,
    backgroundColor: colors.surface,
    textAlignVertical: 'top',
  },
});

export default CertificateDetailScreen;
