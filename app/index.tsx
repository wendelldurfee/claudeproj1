import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { readinessBand, readinessScore, summariseAttempts, READINESS_LABEL } from '../src/core/stats';
import type { SessionState } from '../src/core/types';
import { getResumableSession, listAttempts } from '../src/db/repositories';
import { useLibraryStore } from '../src/store/libraryStore';
import { Badge, Button, Card, EmptyState, ProgressBar, SectionTitle } from '../src/ui/components/common';
import { confirm } from '../src/ui/components/DialogHost';
import { fontSize, radius, spacing, useTheme } from '../src/ui/theme';

/** Home screen: installed banks, readiness per bank, and any resumable attempt. */
export default function LibraryScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { banks, loading, refresh, remove } = useLibraryStore();

  const [readiness, setReadiness] = useState<Record<string, number>>({});
  const [resumable, setResumable] = useState<SessionState | null>(null);

  const load = useCallback(async () => {
    await refresh();
    const attempts = await listAttempts(undefined, 500);
    setResumable(await getResumableSession());

    const scores: Record<string, number> = {};
    for (const bank of useLibraryStore.getState().banks) {
      const stats = summariseAttempts(bank.id, attempts);
      scores[bank.id] = readinessScore(stats, bank.totalQuestions, bank.passingScore);
    }
    setReadiness(scores);
  }, [refresh]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refresh on return so scores update after finishing an exam.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const confirmRemove = async (bankId: string, title: string) => {
    const ok = await confirm({
      title: 'Delete bank?',
      message: `"${title}" and its attempt history will be permanently removed from this device.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) {
      await remove(bankId);
      await load();
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{
        padding: spacing.lg,
        paddingBottom: insets.bottom + spacing.xxl,
        gap: spacing.lg,
      }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.textMuted} />}
    >
      {resumable && (
        <Card style={{ borderColor: theme.primary, gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Ionicons name="play-circle" size={20} color={theme.primary} />
            <Text style={{ color: theme.text, fontSize: fontSize.md, fontWeight: '700', flex: 1 }}>
              Attempt in progress
            </Text>
            <Badge label={resumable.config.mode.toUpperCase()} tone="info" />
          </View>
          <Text style={{ color: theme.textMuted, fontSize: fontSize.sm }}>
            {resumable.items.length} questions · question {resumable.currentIndex + 1} of{' '}
            {resumable.items.length}
          </Text>
          <Button
            label="Resume exam"
            icon="arrow-forward"
            onPress={() => router.push(`/session/${resumable.id}`)}
          />
        </Card>
      )}

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button
          label="Import bank"
          icon="cloud-download-outline"
          onPress={() => router.push('/import')}
          style={{ flex: 1 }}
        />
        <Button
          label="Statistics"
          icon="stats-chart-outline"
          variant="secondary"
          onPress={() => router.push('/stats')}
          style={{ flex: 1 }}
        />
      </View>

      <View>
        <SectionTitle>Installed exams</SectionTitle>

        {banks.length === 0 ? (
          <Card>
            <EmptyState
              icon="library-outline"
              title="No question banks yet"
              message="Import a dump file, GIFT, Aiken, CSV or JSON bank to get started."
              action={<Button label="Import a bank" icon="add" onPress={() => router.push('/import')} />}
            />
          </Card>
        ) : (
          <View style={{ gap: spacing.md }}>
            {banks.map((bank) => {
              const score = readiness[bank.id] ?? 0;
              const band = readinessBand(score);
              const tone =
                band === 'ready' ? 'success' : band === 'not-ready' ? 'danger' : 'warning';

              return (
                <Pressable
                  key={bank.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${bank.code}, ${bank.title}`}
                  onPress={() => router.push(`/exam/${bank.id}`)}
                  onLongPress={() => void confirmRemove(bank.id, bank.title)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                >
                  <Card style={{ gap: spacing.md }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
                      <View style={{ flex: 1, gap: spacing.xs }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                          <Text style={{ color: theme.primary, fontSize: fontSize.sm, fontWeight: '800' }}>
                            {bank.code}
                          </Text>
                          {bank.vendor && (
                            <Text style={{ color: theme.textFaint, fontSize: fontSize.xs }}>
                              {bank.vendor}
                            </Text>
                          )}
                        </View>
                        <Text style={{ color: theme.text, fontSize: fontSize.lg, fontWeight: '700' }}>
                          {bank.title}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={theme.textFaint} />
                    </View>

                    <View style={{ flexDirection: 'row', gap: spacing.lg }}>
                      <Meta icon="help-circle-outline" label={`${bank.totalQuestions} questions`} />
                      <Meta icon="time-outline" label={`${bank.timeLimitMinutes} min`} />
                      <Meta icon="trophy-outline" label={`Pass ${bank.passingScore}%`} />
                    </View>

                    <View style={{ gap: spacing.xs }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ color: theme.textMuted, fontSize: fontSize.xs, flex: 1 }}>
                          Readiness
                        </Text>
                        <Badge label={`${READINESS_LABEL[band]} · ${score}%`} tone={tone} />
                      </View>
                      <ProgressBar
                        fraction={score / 100}
                        color={
                          band === 'ready'
                            ? theme.success
                            : band === 'not-ready'
                              ? theme.danger
                              : theme.warning
                        }
                      />
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/settings')}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          padding: spacing.md,
          borderRadius: radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.border,
        }}
      >
        <Ionicons name="settings-outline" size={18} color={theme.textMuted} />
        <Text style={{ color: theme.textMuted, fontSize: fontSize.md, flex: 1 }}>Settings</Text>
        <Ionicons name="chevron-forward" size={16} color={theme.textFaint} />
      </Pressable>

      <Text
        style={{
          color: theme.textFaint,
          fontSize: fontSize.xs,
          textAlign: 'center',
          lineHeight: 17,
        }}
      >
        Tip: long-press a bank to delete it.
      </Text>
    </ScrollView>
  );
}

function Meta({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
      <Ionicons name={icon} size={14} color={theme.textFaint} />
      <Text style={{ color: theme.textMuted, fontSize: fontSize.xs }}>{label}</Text>
    </View>
  );
}
