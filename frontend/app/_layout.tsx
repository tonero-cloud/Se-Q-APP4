import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  Alert,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  AppState,
  AppStateStatus,
  Vibration,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { startQueueProcessor } from '../utils/offlineQueue';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type NotificationData = {
  type?: 'panic' | 'report' | 'general' | 'chat';
  event_id?: string;
  report_id?: string;
  conversation_id?: string;
};

// ─── PIN Overlay ────────────────────────────────────────────────────────────
function PinOverlay({ onSuccess }: { onSuccess: () => void }) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '']);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);

  const handleKey = useCallback(
    async (key: string) => {
      if (key === '⌫') {
        setDigits(prev => {
          const d = [...prev];
          for (let i = 3; i >= 0; i--) {
            if (d[i] !== '') { d[i] = ''; break; }
          }
          return d;
        });
        if (error) setError('');
        return;
      }

      const newDigits = [...digits];
      const idx = newDigits.findIndex(v => v === '');
      if (idx === -1) return;
      newDigits[idx] = key;
      setDigits(newDigits);

      if (newDigits.every(v => v !== '')) {
        const entered = newDigits.join('');
        const stored = await AsyncStorage.getItem('security_pin');
        const correct = stored || '1234';
        if (entered === correct) {
          setError('');
          onSuccess();
        } else {
          Vibration.vibrate([0, 100, 50, 100]);
          const newAttempts = attempts + 1;
          setAttempts(newAttempts);
          setError(`Incorrect PIN. ${Math.max(0, 3 - newAttempts)} attempt(s) left.`);
          setDigits(['', '', '', '']);
        }
      }
    },
    [digits, attempts, error, onSuccess]
  );

  return (
    <View style={pinStyles.overlay}>
      <View style={pinStyles.card}>
        <Text style={pinStyles.lockIcon}>🔒</Text>
        <Text style={pinStyles.title}>Enter PIN to Continue</Text>
        <Text style={pinStyles.subtitle}>
          App was backgrounded — enter your PIN to resume
        </Text>
        <View style={pinStyles.dots}>
          {digits.map((d, i) => (
            <View key={i} style={[pinStyles.dot, d !== '' && pinStyles.dotFilled]} />
          ))}
        </View>
        {error ? <Text style={pinStyles.error}>{error}</Text> : null}
        <View style={pinStyles.keypad}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => (
            <TouchableOpacity
              key={i}
              style={[pinStyles.key, k === '' && pinStyles.keyEmpty]}
              onPress={() => k && handleKey(k)}
              disabled={!k}
              activeOpacity={0.7}
            >
              <Text style={[pinStyles.keyText, k === '⌫' && { fontSize: 20 }]}>{k}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={pinStyles.hint}>Default PIN: 1234  ·  Change in Settings</Text>
      </View>
    </View>
  );
}

// ─── Inner app (router hooks are safe here) ─────────────────────────────────
function AppContent() {
  const router = useRouter();
  const segments = useSegments();
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const queueCleanup = useRef<(() => void) | null>(null);
  const isInitialized = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const [pinRequired, setPinRequired] = useState(false);
  const [pinReady, setPinReady] = useState(false);

  // Offline queue
  useEffect(() => {
    if (!isInitialized.current) {
      isInitialized.current = true;
      queueCleanup.current = startQueueProcessor();
    }
    return () => { queueCleanup.current?.(); queueCleanup.current = null; };
  }, []);

  // PIN on app return — fires whenever app comes back to foreground
  useEffect(() => {
    const settle = setTimeout(() => setPinReady(true), 600);

    const sub = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      const wasBackground =
        appStateRef.current === 'background' || appStateRef.current === 'inactive';
      const nowActive = nextState === 'active';

      if (wasBackground && nowActive) {
        const token = await AsyncStorage.getItem('auth_token');
        if (token) {
          const currentRoute = segments.join('/');
          const isPublic =
            currentRoute.includes('auth/') ||
            currentRoute.includes('admin/login') ||
            currentRoute === '';
          if (!isPublic) {
            setPinRequired(true);
          }
        }
      }
      appStateRef.current = nextState;
    });

    return () => { clearTimeout(settle); sub.remove(); };
  }, [segments]);

  // Panic state restoration — resume panic screen if panic was active when app closed
  useEffect(() => {
    const restore = async () => {
      try {
        const panicActive = await AsyncStorage.getItem('panic_active');
        const activePanic = await AsyncStorage.getItem('active_panic');
        const token = await AsyncStorage.getItem('auth_token');
        if ((panicActive === 'true' || !!activePanic) && token) {
          const currentRoute = segments.join('/');
          if (!currentRoute.includes('panic') && !currentRoute.includes('auth/')) {
            setTimeout(() => {
              try { router.push('/civil/panic-active'); } catch (_) {}
            }, 1200);
          }
        }
      } catch (_) {}
    };
    restore();
  }, []); // intentionally only on mount

  // Push notification listeners
  useEffect(() => {
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data as NotificationData;
      if (data?.type === 'panic') {
        Alert.alert(
          '🚨 EMERGENCY ALERT',
          notification.request.content.body || 'Panic alert nearby!',
          [
            { text: 'View', onPress: () => { try { router.push('/security/panics'); } catch (_) {} } },
            { text: 'Dismiss', style: 'cancel' },
          ]
        );
      }
    });
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as NotificationData;
      try {
        if (data?.type === 'panic') router.push('/security/panics');
        else if (data?.type === 'report') router.push('/security/reports');
        else if (data?.type === 'chat' && data?.conversation_id)
          router.push(`/security/chat/${data.conversation_id}` as any);
      } catch (_) {}
    });
    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  const handlePinSuccess = useCallback(() => setPinRequired(false), []);

  return (
    <>
      <Slot />
      {pinReady && pinRequired && <PinOverlay onSuccess={handlePinSuccess} />}
    </>
  );
}

// ─── Root layout ─────────────────────────────────────────────────────────────
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: '#0F172A' }}>
        <AppContent />
      </View>
    </SafeAreaProvider>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const pinStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.97)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  card: {
    width: '90%',
    maxWidth: 360,
    alignItems: 'center',
    backgroundColor: '#0A0F1E',
    borderRadius: 24,
    paddingVertical: 36,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  lockIcon: { fontSize: 44, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 6 },
  subtitle: { fontSize: 13, color: '#64748B', textAlign: 'center', marginBottom: 28, lineHeight: 19 },
  dots: { flexDirection: 'row', gap: 16, marginBottom: 14 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#334155', backgroundColor: 'transparent' },
  dotFilled: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  error: { color: '#EF4444', fontSize: 13, marginBottom: 10 },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', width: 252, gap: 10, marginTop: 10, marginBottom: 20 },
  key: { width: 74, height: 74, borderRadius: 37, backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center' },
  keyEmpty: { backgroundColor: 'transparent' },
  keyText: { fontSize: 24, fontWeight: '600', color: '#fff' },
  hint: { fontSize: 11, color: '#334155', textAlign: 'center' },
});
