import goldens from '@sea-invaders/core/golden/golden-v1.json';
import { checkGoldens, type Golden, type GoldenCheck } from '@sea-invaders/core';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

const engine = (globalThis as { HermesInternal?: unknown }).HermesInternal != null ? 'hermes' : 'other';

export function SelfTestScreen() {
  const [checks, setChecks] = useState<GoldenCheck[] | null>(null);
  const [ms, setMs] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const result = checkGoldens(goldens as Golden[]);
    const elapsed = Date.now() - started;
    const passed = result.filter((c) => c.ok).length;
    console.log(
      `[selftest] engine=${engine} ${passed === result.length ? 'PASS' : 'FAIL'} ${passed}/${result.length} in ${elapsed} ms`,
    );
    for (const c of result) {
      if (!c.ok) {
        console.log(`[selftest] ${c.name} expected=${JSON.stringify(c.expected)} actual=${JSON.stringify(c.actual)}`);
      }
    }
    setMs(elapsed);
    setChecks(result);
  }, []);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Determinism self-test</Text>
      <Text style={styles.line}>Engine: {engine}</Text>
      {checks === null ? (
        <Text style={styles.line}>Running…</Text>
      ) : (
        checks.map((c) => (
          <Text key={c.name} style={[styles.line, { color: c.ok ? '#00E5A0' : '#FF6B6B' }]}>
            {c.ok ? 'PASS' : 'FAIL'} {c.name}: score {c.actual.score}, ticks {c.actual.ticks}, hash {c.actual.hash}
          </Text>
        ))
      )}
      {checks !== null && <Text style={styles.line}>{ms} ms</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000433' },
  content: { padding: 24, paddingTop: 64 },
  title: { color: '#F8E3CC', fontSize: 24, fontWeight: '800', marginBottom: 16 },
  line: { color: '#CADEF0', fontSize: 14, marginBottom: 8 },
});
