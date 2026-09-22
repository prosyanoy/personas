import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Redirect } from 'expo-router';

import {
  fetchResumeViaBackend,
  ingestResumeProfile,
  patchProfileFields,
  type IngestSource,
} from '@/api';
import { Glyph } from '@/components/Glyph';
import { ChatBubble, PrimaryButton, SweepIn, UserPill } from '@/components/onboarding';
import { CONNECTORS } from '@/data/mock';
import { downloadPdf, pickPdf, type LocalFile } from '@/lib/files';
import { formatTime } from '@/lib/time';
import { consentAndDownload, useLlmState } from '@/llm/model';
import { parseResume, type ParsedResume } from '@/pdf/resume';
import { useOnboarding } from '@/state/onboarding';
import { colors, font, radius, spacing } from '@/theme/tokens';

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function ConnectorsRecap() {
  const { connectors, connectorsAt } = useOnboarding();
  const selected = CONNECTORS.filter((c) => connectors.includes(c.id));
  return (
    <View style={styles.recapWrap}>
      <View style={styles.recapPill}>
        <View style={styles.recapIcons}>
          {selected.slice(0, 3).map((c) => (
            <View key={c.id} style={[styles.recapIcon, { backgroundColor: c.color }]}>
              {c.badge ? (
                <Text style={styles.recapBadge}>{c.badge[0]}</Text>
              ) : (
                <Glyph name={c.icon ?? 'check'} size={10} color={c.textOnColor ?? '#ffffff'} />
              )}
            </View>
          ))}
          <View style={[styles.recapIcon, { backgroundColor: colors.primaryContainer }]}>
            <Glyph name="check" size={9} color={colors.onPrimaryFixed} />
          </View>
        </View>
        <Text style={styles.recapText}>Selected {selected.length} connectors</Text>
        <Text style={styles.recapTime}>{connectorsAt ? formatTime(connectorsAt) : ''}</Text>
        <Glyph name="done-all" size={13} color={colors.brand} />
      </View>
    </View>
  );
}

function PasteButton({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Paste link"
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.pasteBtn, (pressed || busy) && { opacity: 0.7 }]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.brand} />
      ) : (
        <>
          <Glyph name="content-paste" size={15} color={colors.brand} />
          <Text style={styles.pasteBtnText}>Paste</Text>
        </>
      )}
    </Pressable>
  );
}

function LlmConsent() {
  const llm = useLlmState();
  const [declined, setDeclined] = useState(false);

  if (declined) return null;
  if (llm.status === 'idle') {
    return (
      <ChatBubble title="Explain matches with on-device AI?">
        <Text style={styles.consentBody}>
          Personas can explain every job match with Gemma-4, a small AI model that runs entirely on
          this phone. It downloads once (~2.5 GB over Wi-Fi is best) — your resume and match data
          never leave the device for this.
        </Text>
        <View style={styles.consentRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void consentAndDownload()}
            style={styles.consentBtn}
          >
            <Text style={styles.consentBtnText}>Download model</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setDeclined(true)}>
            <Text style={styles.consentSkip}>Not now</Text>
          </Pressable>
        </View>
      </ChatBubble>
    );
  }
  if (llm.status === 'downloading' || llm.status === 'verifying') {
    return (
      <ChatBubble title={llm.status === 'verifying' ? 'Verifying model…' : 'Downloading Gemma-4…'}>
        {llm.status === 'downloading' ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { flex: Math.max(0.05, llm.progress) }]} />
            <View style={{ flex: 1 - Math.max(0.05, llm.progress) }} />
          </View>
        ) : null}
        <Text style={styles.consentBody}>
          {llm.status === 'verifying'
            ? 'Checking the file checksum before installing.'
            : `${Math.round(llm.progress * 100)}% — the model file stays on this device.`}
        </Text>
      </ChatBubble>
    );
  }
  if (llm.status === 'ready') {
    return <ChatBubble body="On-device model ready — match explanations will be generated locally." />;
  }
  if (llm.status === 'error') {
    return (
      <ChatBubble title="Model download failed">
        <Text style={styles.consentBody}>{llm.error ?? 'Something went wrong'}</Text>
        <View style={styles.consentRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void consentAndDownload()}
            style={styles.consentBtn}
          >
            <Text style={styles.consentBtnText}>Retry</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setDeclined(true)}>
            <Text style={styles.consentSkip}>Skip</Text>
          </Pressable>
        </View>
      </ChatBubble>
    );
  }
  return null;
}

const LOCATION_CHIPS = ['Bengaluru', 'Mumbai', 'Delhi NCR', 'Hyderabad', 'Pune', 'Remote'];
const SALARY_CHIPS_LPA = [12, 18, 24, 30, 40];

function parseSalaryInput(text: string): number | null {
  const m = text.replace(/[,₹$\s]/g, '').match(/^(\d+(?:\.\d+)?)(l|lpa|lakhs?|k|cr|crores?)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = (m[2] ?? '').toLowerCase();
  if (unit === 'k') return n * 1_000;
  if (unit === 'l' || unit === 'lpa' || unit.startsWith('lakh')) return n * 100_000;
  if (unit.startsWith('cr')) return n * 10_000_000;
  return n < 1000 ? n * 100_000 : n;
}

function PreferenceQuestions({ profileId }: { profileId: string | null }) {
  const { resumeFields, updateResumeFields } = useOnboarding();
  const [locInput, setLocInput] = useState('');
  const [locDone, setLocDone] = useState(false);
  const [salaryInput, setSalaryInput] = useState(
    resumeFields?.expectedSalaryMin
      ? String(Math.round(resumeFields.expectedSalaryMin / 100_000))
      : '',
  );
  const [salaryDone, setSalaryDone] = useState(false);

  const askLocation = !!resumeFields && !resumeFields.location && !locDone;
  const askSalary = !!resumeFields && !salaryDone;

  const save = (patch: Parameters<typeof updateResumeFields>[0]) => {
    updateResumeFields(patch);
    if (profileId) patchProfileFields(profileId, patch).catch(() => {});
  };

  const submitLocation = (value: string) => {
    const v = value.trim();
    if (v.length < 2) return;
    save({ location: v });
    setLocDone(true);
  };

  const submitSalary = (text: string) => {
    const annual = parseSalaryInput(text);
    if (!annual) return;
    save({ expectedSalaryMin: annual, salaryCurrency: 'INR' });
    setSalaryDone(true);
  };

  return (
    <>
      {askLocation ? (
        <SweepIn>
        <ChatBubble title="Where should I look for openings?">
          <Text style={styles.consentBody}>
            Your resume didn't mention a city — location is one of the five match signals, so pick
            your base (or Remote).
          </Text>
          <View style={styles.chipRow}>
            {LOCATION_CHIPS.map((c) => (
              <Pressable
                key={c}
                accessibilityRole="button"
                onPress={() => submitLocation(c)}
                style={styles.answerChip}
              >
                <Text style={styles.answerChipText}>{c}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.pasteRow}>
            <TextInput
              style={styles.pasteInput}
              placeholder="Or type a city, e.g. Berlin"
              placeholderTextColor={colors.slate400}
              value={locInput}
              onChangeText={setLocInput}
              autoCapitalize="words"
              onSubmitEditing={() => submitLocation(locInput)}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => submitLocation(locInput)}
              disabled={locInput.trim().length < 2}
              style={[styles.pasteGo, locInput.trim().length < 2 && { opacity: 0.5 }]}
            >
              <Glyph name="arrow-forward" size={16} color="#ffffff" />
            </Pressable>
          </View>
        </ChatBubble>
        </SweepIn>
      ) : null}

      {locDone && resumeFields?.location ? (
        <SweepIn>
          <UserPill icon="location-outline" text={resumeFields.location} />
        </SweepIn>
      ) : null}

      {askSalary ? (
        <SweepIn delay={120}>
        <ChatBubble title="What compensation are you aiming for?">
          <Text style={styles.consentBody}>
            Used to score each posting's salary band against your expectations — it never leaves
            this device for the on-device explanations.
          </Text>
          <View style={styles.chipRow}>
            {SALARY_CHIPS_LPA.map((lpa) => (
              <Pressable
                key={lpa}
                accessibilityRole="button"
                onPress={() => submitSalary(String(lpa))}
                style={styles.answerChip}
              >
                <Text style={styles.answerChipText}>₹{lpa}L+</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.pasteRow}>
            <TextInput
              style={styles.pasteInput}
              placeholder="Or type, e.g. 18 or 18L"
              placeholderTextColor={colors.slate400}
              value={salaryInput}
              onChangeText={setSalaryInput}
              keyboardType="decimal-pad"
              onSubmitEditing={() => submitSalary(salaryInput)}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => submitSalary(salaryInput)}
              disabled={!parseSalaryInput(salaryInput)}
              style={[styles.pasteGo, !parseSalaryInput(salaryInput) && { opacity: 0.5 }]}
            >
              <Glyph name="arrow-forward" size={16} color="#ffffff" />
            </Pressable>
          </View>
        </ChatBubble>
        </SweepIn>
      ) : null}

      {salaryDone && resumeFields?.expectedSalaryMin ? (
        <SweepIn>
          <UserPill
            icon="cash-outline"
            text={`₹${Math.round(resumeFields.expectedSalaryMin / 100_000)}L+ expected`}
          />
        </SweepIn>
      ) : null}
    </>
  );
}

export function ResumeStage({ onDone }: { onDone: () => void }) {
  const { resumeFile, resumeAt, resumeFields, setResume, setProfileId, connectorsAt } = useOnboarding();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [link, setLink] = useState('');
  const [parsed, setParsed] = useState<ParsedResume | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const ingest = async (source: IngestSource, file: LocalFile, result: ParsedResume) => {
    try {
      const { id } = await ingestResumeProfile({
        source,
        fileName: file.name,
        fileSize: file.size,
        fields: result.fields,
        rawText: result.text.slice(0, 50_000),
      });
      setSavedId(id);
      setProfileId(id);
    } catch {
      setSavedId(null);
    }
  };

  const handleFile = async (source: IngestSource, file: LocalFile) => {
    const result = await parseResume(file.bytes);
    setParsed(result);
    setResume({ name: file.name, size: file.size }, result.fields);
    void ingest(source, file, result);
  };

  const run = async (source: IngestSource, fn: () => Promise<LocalFile | null>) => {
    if (busy) return;
    setBusy(source);
    setError('');
    try {
      const file = await fn();
      if (file) await handleFile(source, file);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file');
    } finally {
      setBusy(null);
    }
  };

  const fetchLink = (url: string) =>
    run('link', async () => {
      if (!/^https?:\/\//i.test(url)) throw new Error('That does not look like a link');
      try {
        return await downloadPdf(url);
      } catch {

        const bytes = await fetchResumeViaBackend(url);
        const name = decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'resume.pdf');
        return { name: name.endsWith('.pdf') ? name : 'resume.pdf', size: bytes.byteLength, bytes };
      }
    });

  const pasteFromClipboard = async () => {
    if (busy) return;
    const clip = (await Clipboard.getStringAsync()).trim();
    if (!/^https?:\/\//i.test(clip)) {
      setError('Clipboard is empty — copy a link to your resume PDF first');
      return;
    }
    await fetchLink(clip);
  };

  const parsedSummary = parsed
    ? `Parsed ${parsed.fields.title ?? 'your'} profile${
        parsed.fields.yearsExperience ? ` (${parsed.fields.yearsExperience} yrs exp)` : ''
      }${parsed.fields.location ? ` · ${parsed.fields.location}` : ''}. ${
        parsed.fields.skills.length
      } skills detected — ready to match high-alignment openings!`
    : null;

  return (
    <>
        <SweepIn delay={80}>
          <ChatBubble
            title="2. Let's add your resume for better matches."
            body="Upload your resume or paste a link to it so I can understand your skills, projects, and target seniorities."
            time={connectorsAt ? formatTime(connectorsAt) : undefined}
          />
        </SweepIn>

        <SweepIn delay={200}>
        <View style={styles.uploadArea}>
          <Pressable
            accessibilityRole="button"
            disabled={busy !== null}
            onPress={() => run('upload', pickPdf)}
            style={({ pressed }) => [styles.dropZone, pressed && { backgroundColor: colors.brand50 }]}
          >
            <View style={styles.dropLeft}>
              <View style={styles.dropIcon}>
                {busy === 'upload' ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <Glyph name="description" size={22} color={colors.brand} />
                )}
              </View>
              <View style={styles.dropText}>
                <Text style={styles.dropTitle}>
                  {busy === 'upload' ? 'Parsing resume…' : 'Upload resume PDF'}
                </Text>
                <Text style={styles.dropHint}>
                  {busy === 'upload' ? 'Extracting fields on-device' : 'Tap to browse files'}
                </Text>
              </View>
            </View>
            <View style={styles.dropAction}>
              <Glyph name="file-upload" size={17} color={colors.brand} />
            </View>
          </Pressable>

          <View style={styles.urlCard}>
            <View style={styles.urlLeft}>
              <View style={styles.urlIcon}>
                <Glyph name="link" size={20} color={colors.ink} />
              </View>
              <View style={styles.urlText}>
                <Text style={styles.urlTitle}>URL</Text>
                <Text style={styles.urlHint}>Paste link to your work, site or profile</Text>
              </View>
            </View>
            <PasteButton busy={busy === 'link'} onPress={pasteFromClipboard} />
          </View>

          {busy === 'link' ? (
            <Text style={styles.parsingNote}>Downloading and parsing your resume…</Text>
          ) : null}

          {error ? (
            <>
              <Text style={styles.error}>{error}</Text>
              <View style={styles.pasteRow}>
                <TextInput
                  style={styles.pasteInput}
                  placeholder="Or type the link manually"
                  placeholderTextColor={colors.slate400}
                  value={link}
                  onChangeText={setLink}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  onSubmitEditing={() => fetchLink(link.trim())}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => fetchLink(link.trim())}
                  disabled={busy !== null || !link.trim()}
                  style={[styles.pasteGo, (!link.trim() || busy) && { opacity: 0.5 }]}
                >
                  <Glyph name="arrow-forward" size={16} color="#ffffff" />
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
        </SweepIn>

        {resumeFile ? (
          <SweepIn>
            <View style={styles.uploadedWrap}>
              <View style={styles.uploadedPill}>
                <View style={styles.uploadedIcon}>
                  <Glyph name="description" size={18} color={colors.brand} />
                </View>
                <View style={styles.uploadedText}>
                  <Text style={styles.uploadedName} numberOfLines={1}>
                    {resumeFile.name}
                  </Text>
                  <Text style={styles.uploadedOk}>
                    Uploaded successfully · {formatSize(resumeFile.size)}
                  </Text>
                </View>
                <View style={styles.uploadedCheck}>
                  <Glyph name="check" size={12} color="#ffffff" />
                </View>
              </View>
              <View style={styles.uploadedMeta}>
                <Text style={styles.metaTime}>{resumeAt ? formatTime(resumeAt) : ''}</Text>
                <Glyph name="done-all" size={13} color={colors.brand} />
              </View>
            </View>
          </SweepIn>
        ) : null}

        {resumeFile ? (
          <SweepIn delay={120}>
            <ChatBubble body={parsedSummary ?? ''}>
              {resumeFields && resumeFields.skills.length ? (
                <View style={styles.skillRow}>
                  {resumeFields.skills.slice(0, 8).map((s) => (
                    <View key={s} style={styles.skillChip}>
                      <Text style={styles.skillChipText}>{s}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              <Text style={styles.syncNote}>
                {savedId ? 'Synced to backend ✓' : 'Saved on device (backend offline)'}
              </Text>
            </ChatBubble>
          </SweepIn>
        ) : null}

        {resumeFile ? <PreferenceQuestions profileId={savedId} /> : null}

        {resumeFile ? (
          <SweepIn delay={240}>
            <LlmConsent />
          </SweepIn>
        ) : null}

        <SweepIn delay={320} style={styles.ctaArea}>
          <PrimaryButton
            label="Continue"
            disabled={busy !== null}
            onPress={onDone}
          />
          <Text style={styles.caption}>You can always change these settings later.</Text>
        </SweepIn>
    </>
  );
}

export default function ResumeRoute() {
  return <Redirect href="/onboarding" />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  scroll: { padding: spacing.lg, gap: spacing.xxl },

  recapWrap: { alignItems: 'flex-end' },
  recapPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderTopRightRadius: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  recapIcons: { flexDirection: 'row' },
  recapIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -6,
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  recapBadge: { color: '#ffffff', fontSize: 9, fontFamily: font.bodyBold },
  recapText: { fontSize: 12, fontFamily: font.bodySemi, color: colors.ink },
  recapTime: { fontSize: 10, fontFamily: font.body, color: colors.slate500 },

  uploadArea: { marginLeft: 48, gap: spacing.md },
  dropZone: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: radius.lg,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  dropLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  dropIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropText: { flex: 1 },
  dropTitle: { fontSize: 12, fontFamily: font.bodySemi, color: colors.ink },
  dropHint: { fontSize: 11, fontFamily: font.body, color: colors.slate500, marginTop: 2 },
  dropAction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  urlCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: radius.lg,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  urlLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  urlIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  urlText: { flex: 1 },
  urlTitle: { fontSize: 12, fontFamily: font.bodySemi, color: colors.ink },
  urlHint: { fontSize: 11, fontFamily: font.body, color: colors.slate500, marginTop: 2 },
  pasteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primaryContainer,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 92,
    justifyContent: 'center',
  },
  pasteBtnText: { fontSize: 13, fontFamily: font.bodySemi, color: colors.brand },
  parsingNote: { fontSize: 11, fontFamily: font.body, color: colors.slate500 },

  pasteRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  pasteInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#ffffff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.slate200,
    paddingHorizontal: 14,
    fontSize: 13,
    fontFamily: font.body,
    color: colors.ink,
  },
  pasteGo: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { fontSize: 12, fontFamily: font.bodyMedium, color: colors.error },

  uploadedWrap: { alignItems: 'flex-end', paddingLeft: 24 },
  uploadedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.primaryContainer,
    borderRadius: radius.lg,
    borderTopRightRadius: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: 320,
  },
  uploadedIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadedText: { flexShrink: 1 },
  uploadedName: { fontSize: 12, fontFamily: font.bodySemi, color: colors.ink },
  uploadedOk: { fontSize: 11, fontFamily: font.bodyMedium, color: colors.brand, marginTop: 1 },
  uploadedCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadedMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, marginRight: 4 },
  metaTime: { fontSize: 10, fontFamily: font.body, color: colors.slate500 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  answerChip: {
    backgroundColor: colors.primaryContainer,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  answerChipText: { fontSize: 12, fontFamily: font.bodySemi, color: colors.brand },

  skillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  skillChip: {
    backgroundColor: '#ffffff',
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  skillChipText: { fontSize: 11, fontFamily: font.bodyMedium, color: colors.ink },
  syncNote: { fontSize: 10, fontFamily: font.body, color: colors.slate500, marginTop: 8 },

  consentBody: { fontSize: 12, fontFamily: font.body, color: colors.slate600, marginTop: 6, lineHeight: 17 },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 },
  consentBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  consentBtnText: { fontSize: 12, fontFamily: font.bodySemi, color: '#ffffff' },
  consentSkip: { fontSize: 12, fontFamily: font.bodyMedium, color: colors.slate500 },
  progressTrack: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    marginTop: 10,
  },
  progressFill: { backgroundColor: colors.brand, borderRadius: 3 },

  ctaArea: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg },
  caption: { fontSize: 12, fontFamily: font.body, color: colors.slate500, textAlign: 'center' },
});
