import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { isAudioMixSupported } from 'expo-video-encoder';

import { describeError, exportSettings, PipelineResult, runExportPipeline, runInvalidOptionsDemo } from './src/pipeline';

type Status = 'idle' | 'working' | 'done' | 'failed';

export default function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const player = useVideoPlayer(result?.videoUri ?? null, (instance) => {
    instance.loop = true;
    instance.play();
  });

  const appendLog = useCallback((line: string) => setLog((lines) => [...lines, line]), []);

  const startExport = useCallback(async () => {
    setStatus('working');
    setResult(null);
    setLog([]);
    try {
      const next = await runExportPipeline(appendLog);
      setResult(next);
      appendLog(`Done in ${next.elapsedMs} ms`);
      setStatus('done');
    } catch (error) {
      appendLog(`Failed: ${describeError(error)}`);
      setStatus('failed');
    }
  }, [appendLog]);

  const showValidation = useCallback(async () => {
    setValidationMessage(await runInvalidOptionsDemo());
  }, []);

  const { frameCount, fps, width, height } = exportSettings;
  const busy = status === 'working';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>expo-video-encoder</Text>
      <Text style={styles.subtitle}>
        Draws {frameCount} JPEG frames at {width}x{height} in JavaScript, encodes them at {fps} fps, then{' '}
        {isAudioMixSupported() ? 'mixes in a generated tone.' : 'plays the silent MP4 (audio mixing is iOS only).'}
      </Text>

      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={startExport}
        style={({ pressed }) => [styles.button, (pressed || busy) && styles.buttonPressed]}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Encode video</Text>}
      </Pressable>

      {result ? (
        <View style={styles.videoCard}>
          <VideoView player={player} style={styles.video} contentFit="contain" nativeControls />
          <Text style={styles.caption}>{result.hasAudio ? 'MP4 with audio' : 'Silent MP4'}</Text>
        </View>
      ) : null}

      {log.length > 0 ? (
        <View style={styles.logCard}>
          {log.map((line, index) => (
            <Text key={`${index}-${line}`} style={[styles.logLine, status === 'failed' && index === log.length - 1 && styles.errorText]}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}

      <Pressable accessibilityRole="button" onPress={showValidation} style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}>
        <Text style={styles.secondaryButtonText}>Pass an odd width</Text>
      </Pressable>
      {validationMessage ? <Text style={styles.validation}>{validationMessage}</Text> : null}

      <StatusBar style="auto" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingTop: 72,
    gap: 16,
    backgroundColor: '#fff',
    flexGrow: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 15,
    color: '#444',
    lineHeight: 21,
  },
  button: {
    backgroundColor: '#111',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  videoCard: {
    gap: 8,
  },
  video: {
    width: '100%',
    aspectRatio: exportSettings.width / exportSettings.height,
    backgroundColor: '#000',
    borderRadius: 10,
  },
  caption: {
    color: '#666',
    fontSize: 13,
  },
  logCard: {
    backgroundColor: '#f4f4f5',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  logLine: {
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontSize: 12,
    color: '#222',
  },
  errorText: {
    color: '#b91c1c',
  },
  secondaryButton: {
    borderColor: '#111',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  validation: {
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontSize: 12,
    color: '#b91c1c',
  },
});
