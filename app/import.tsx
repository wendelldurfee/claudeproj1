import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FORMAT_LABEL, detectFormat, type BankFormat } from '../src/core/import';
import { useLibraryStore } from '../src/store/libraryStore';
import { Badge, Button, Card, ErrorNotice, SectionTitle } from '../src/ui/components/common';
import { fontSize, monoFont, radius, spacing, useTheme } from '../src/ui/theme';

/**
 * Import screen: pick a file or paste dump text, preview what was detected, then
 * install the bank. Everything is parsed on-device; nothing is uploaded.
 */
export default function ImportScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { importFromText, lastImportWarnings } = useLibraryStore();

  const [raw, setRaw] = useState('');
  const [fileName, setFileName] = useState('');
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ code: string; count: number } | null>(null);

  let detected: BankFormat | null = null;
  let detectError: string | null = null;
  if (raw.trim().length > 0) {
    try {
      detected = detectFormat(raw, fileName);
    } catch (err) {
      detectError = (err as Error).message;
    }
  }

  const pickFile = async () => {
    setError(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', 'text/csv', 'text/comma-separated-values', '*/*'],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.[0]) return;

      const asset = picked.assets[0];
      const contents = new File(asset.uri).textSync();
      const name = asset.name ?? '';

      if (looksBinary(contents)) {
        setError(
          name.toLowerCase().endsWith('.vce')
            ? '“.vce” is a proprietary binary format this app cannot read. Open it in a VCE player, print or export the questions to text or PDF, and convert that to one of the supported text formats (dump text, JSON, GIFT, Aiken, CSV).'
            : 'That looks like a binary file, not text. Supported formats are text-based: dump text, JSON, GIFT, Aiken, CSV.',
        );
        return;
      }

      setRaw(contents);
      setFileName(name);
      setDone(null);
    } catch (err) {
      setError(`Could not read that file: ${(err as Error).message}`);
    }
  };

  const runImport = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const bank = await importFromText(raw, {
        fileName,
        code: code.trim() || undefined,
        title: title.trim() || undefined,
      });
      setDone({ code: bank.code, count: bank.questions.length });
      setRaw('');
      setFileName('');
      setCode('');
      setTitle('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{
        padding: spacing.lg,
        paddingBottom: insets.bottom + spacing.xxl,
        gap: spacing.lg,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Card style={{ gap: spacing.sm }}>
        <Text style={{ color: theme.text, fontSize: fontSize.md, fontWeight: '700' }}>
          Supported formats
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: fontSize.sm, lineHeight: 20 }}>
          Dump text (the “Question #1 / Correct Answer:” layout used by community exam sites),
          JSON banks, Moodle GIFT, Aiken, and CSV/TSV. The format is detected automatically.
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: fontSize.sm, lineHeight: 20 }}>
          Proprietary .vce binaries are not supported — export the questions to text or PDF from a
          VCE player first.
        </Text>
        <Text style={{ color: theme.textFaint, fontSize: fontSize.xs, lineHeight: 18 }}>
          Files are read on this device and never sent to a server. Use only material you have the
          right to use.
        </Text>
      </Card>

      <Button label="Choose a file" icon="folder-open-outline" variant="secondary" onPress={pickFile} />

      <View>
        <SectionTitle>Or paste the text</SectionTitle>
        <TextInput
          value={raw}
          onChangeText={(text) => {
            setRaw(text);
            setDone(null);
          }}
          multiline
          placeholder={'Question #1 Topic 1\n\nWhich port does HTTPS use?\n\nA. 80\nB. 443\n\nCorrect Answer: B'}
          placeholderTextColor={theme.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Question bank text"
          style={{
            color: theme.text,
            backgroundColor: theme.surface,
            borderColor: theme.border,
            borderWidth: StyleSheet.hairlineWidth,
            borderRadius: radius.md,
            padding: spacing.md,
            fontSize: fontSize.sm,
            fontFamily: monoFont,
            minHeight: 180,
            textAlignVertical: 'top',
          }}
        />
      </View>

      {fileName.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Ionicons name="document-text-outline" size={16} color={theme.textMuted} />
          <Text style={{ color: theme.textMuted, fontSize: fontSize.sm, flex: 1 }}>{fileName}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear file"
            onPress={() => {
              setRaw('');
              setFileName('');
            }}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={18} color={theme.textFaint} />
          </Pressable>
        </View>
      )}

      {detected && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Ionicons name="checkmark-circle" size={16} color={theme.success} />
          <Text style={{ color: theme.textMuted, fontSize: fontSize.sm }}>
            Detected: <Text style={{ color: theme.text, fontWeight: '700' }}>{FORMAT_LABEL[detected]}</Text>
          </Text>
        </View>
      )}

      {detectError && raw.trim().length > 20 && <ErrorNotice message={detectError} />}

      <View>
        <SectionTitle>Optional details</SectionTitle>
        <Card style={{ gap: spacing.md }}>
          <Field label="Exam code" placeholder="AZ-104" value={code} onChange={setCode} />
          <Field
            label="Exam title"
            placeholder="Microsoft Azure Administrator"
            value={title}
            onChange={setTitle}
          />
          <Text style={{ color: theme.textFaint, fontSize: fontSize.xs, lineHeight: 17 }}>
            Leave blank to use whatever the file declares, or what can be read from its header.
          </Text>
        </Card>
      </View>

      {error && <ErrorNotice message={error} />}

      {done && (
        <Card style={{ borderColor: theme.success, gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Ionicons name="checkmark-circle" size={20} color={theme.success} />
            <Text style={{ color: theme.text, fontSize: fontSize.md, fontWeight: '700' }}>
              Uploaded {done.code}
            </Text>
          </View>
          <Text style={{ color: theme.textMuted, fontSize: fontSize.sm }}>
            {done.count} question{done.count === 1 ? '' : 's'} added to your library.
          </Text>

          {lastImportWarnings.length > 0 && (
            <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
              <Badge label={`${lastImportWarnings.length} WARNINGS`} tone="warning" />
              {lastImportWarnings.slice(0, 6).map((warning, i) => (
                <Text key={i} style={{ color: theme.textMuted, fontSize: fontSize.xs, lineHeight: 17 }}>
                  • {warning}
                </Text>
              ))}
              {lastImportWarnings.length > 6 && (
                <Text style={{ color: theme.textFaint, fontSize: fontSize.xs }}>
                  …and {lastImportWarnings.length - 6} more.
                </Text>
              )}
            </View>
          )}

          <Button label="Back to library" icon="library-outline" onPress={() => router.replace('/')} />
        </Card>
      )}

      <Button
        label={busy ? 'Uploading…' : 'Upload Exam'}
        icon="cloud-upload-outline"
        loading={busy}
        disabled={raw.trim().length === 0 || detected === null}
        onPress={() => void runImport()}
      />
    </ScrollView>
  );
}

function looksBinary(text: string): boolean {
  const sample = text.slice(0, 8000);
  if (sample.length === 0) return false;
  if (sample.includes('')) return true;
  let control = 0;
  for (const ch of sample) {
    const code = ch.charCodeAt(0);
    if (code < 32 && ch !== '\n' && ch !== '\r' && ch !== '\t') control++;
  }
  return control / sample.length > 0.05;
}

function Field({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (text: string) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ color: theme.textMuted, fontSize: fontSize.sm }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textFaint}
        autoCapitalize="characters"
        autoCorrect={false}
        accessibilityLabel={label}
        style={{
          color: theme.text,
          backgroundColor: theme.bg,
          borderColor: theme.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          fontSize: fontSize.md,
          minHeight: 44,
        }}
      />
    </View>
  );
}
