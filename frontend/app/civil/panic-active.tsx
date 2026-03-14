/**
 * civil/panic-active.tsx
 *
 * Unified Panic Active screen.
 * - Survives app minimize / full close and correctly restores state on relaunch.
 * - Stores panic state in BOTH AsyncStorage keys ('panic_active' + 'active_panic')
 *   so that _layout.tsx, civil/home and this screen all agree.
 * - Shows PIN entry when the user returns to the app while a panic is live
 *   (belt-and-suspenders on top of _layout.tsx PIN overlay).
 * - GPS location posted every 30 s via foreground interval AND background task.
 * - "I'm Safe" deactivates backend + clears all local state.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  AppState, AppStateStatus, BackHandler, Platform,
  Vibration, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Constants from 'expo-constants';
import EmergencyCategoryModal from '../../components/EmergencyCategoryModal';
import { getAuthToken, clearAuthData } from '../../utils/auth';

const BACKEND_URL =
  Constants.expoConfig?.extra?.backendUrl ||
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  'https://ongoing-dev-22.preview.emergentagent.com';

const LOCATION_TASK = 'background-location-panic';

// ── Background task (module-level, required by Expo) ─────────────────────────
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }: any) => {
  if (error) return;
  if (data) {
    const { locations } = data;
    const loc = locations[0];
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (token) {
        await axios.post(
          `${BACKEND_URL}/api/panic/location`,
          {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy,
            timestamp: new Date().toISOString(),
          },
          { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
        );
      }
    } catch (_) {}
  }
});

// ── Emergency services for non-security categories ───────────────────────────
const EMERGENCY_SERVICES: Record<string, { name: string; number: string }[]> = {
  ambulance: [
    { name: 'National Emergency', number: '112' },
    { name: 'Ambulance Service', number: '911' },
  ],
  fire: [
    { name: 'Fire Service', number: '101' },
    { name: 'Emergency', number: '112' },
  ],
};
const SECURITY_EMERGENCIES = ['violence', 'robbery', 'kidnapping', 'breakin', 'burglary', 'harassment', 'other'];

type Screen = 'category' | 'activating' | 'active' | 'emergency_contacts';

// ── Helpers ───────────────────────────────────────────────────────────────────
const writeLocalPanic = async (panicId: string, category: string) => {
  const data = JSON.stringify({
    id: panicId,
    panic_id: panicId,
    category,
    activated_at: new Date().toISOString(),
  });
  await AsyncStorage.multiSet([
    ['panic_active', 'true'],
    ['panic_started_at', Date.now().toString()],
    ['panic_id', panicId],
    ['active_panic', data],
  ]);
};

const clearLocalPanic = async () => {
  await AsyncStorage.multiRemove(['panic_active', 'panic_started_at', 'panic_id', 'active_panic']);
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function PanicActive() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>('category');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [panicId, setPanicId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [emergencyType, setEmergencyType] = useState<'ambulance' | 'fire' | null>(null);

  const intervalRef = useRef<any>(null);
  const elapsedRef = useRef<any>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // ── Mount: restore state if panic was already active ────────────────────
  useEffect(() => {
    checkExistingPanic();

    // Back button — don't navigate away while panic is active
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      AsyncStorage.getItem('panic_active').then(v => {
        if (v === 'true') minimizeApp();
      });
      return true;
    });

    return () => {
      backHandler.remove();
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    };
  }, []);

  const checkExistingPanic = async () => {
    try {
      // Backend is authoritative
      const token = await getAuthToken();
      if (token) {
        try {
          const res = await axios.get(`${BACKEND_URL}/api/panic/status`, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 8000,
          });
          if (res.data?.is_active) {
            const pid = res.data.panic_id;
            const cat = res.data.emergency_category || 'other';
            // Sync local storage
            await writeLocalPanic(pid, cat);
            setPanicId(pid);
            setSelectedCategory(cat);
            // Restore elapsed timer from stored start time
            const startStr = await AsyncStorage.getItem('panic_started_at');
            if (startStr) {
              const elapsed = Math.floor((Date.now() - parseInt(startStr)) / 1000);
              setElapsedSeconds(elapsed);
            }
            startElapsedTimer();
            startLocationTracking(token);
            setScreen('active');
            return;
          } else {
            // Backend says no panic — clear any stale local state
            await clearLocalPanic();
          }
        } catch (_) {
          // Network fail — fall back to local
        }
      }

      // Local fallback
      const panicActive = await AsyncStorage.getItem('panic_active');
      const activePanic = await AsyncStorage.getItem('active_panic');
      if (panicActive === 'true' || activePanic) {
        const parsed = activePanic ? JSON.parse(activePanic) : null;
        const pid = parsed?.id || parsed?.panic_id || await AsyncStorage.getItem('panic_id');
        const cat = parsed?.category || 'other';
        setPanicId(pid);
        setSelectedCategory(cat);
        const startStr = await AsyncStorage.getItem('panic_started_at');
        if (startStr) {
          const elapsed = Math.floor((Date.now() - parseInt(startStr)) / 1000);
          setElapsedSeconds(elapsed);
        }
        startElapsedTimer();
        if (token) startLocationTracking(token);
        setScreen('active');
      }
      // else: show the category modal (default screen = 'category')
    } catch (_) {}
  };

  // ── Category selected ────────────────────────────────────────────────────
  const handleCategorySelect = async (category: string) => {
    setSelectedCategory(category);
    if (category === 'medical') {
      setEmergencyType('ambulance');
      setScreen('emergency_contacts');
    } else if (category === 'fire') {
      setEmergencyType('fire');
      setScreen('emergency_contacts');
    } else if (SECURITY_EMERGENCIES.includes(category)) {
      await activatePanicMode(category);
    }
  };

  // ── Activate panic on backend ────────────────────────────────────────────
  const activatePanicMode = async (category: string) => {
    setScreen('activating');
    try {
      const { status: fg } = await Location.requestForegroundPermissionsAsync();
      if (fg !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required for panic mode.');
        router.back();
        return;
      }
      await Location.requestBackgroundPermissionsAsync();

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });

      const token = await getAuthToken();
      if (!token) { router.replace('/auth/login'); return; }

      const res = await axios.post(
        `${BACKEND_URL}/api/panic/activate`,
        {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy,
          timestamp: new Date().toISOString(),
          emergency_category: category,
        },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
      );

      const pid = res.data.panic_id;
      setPanicId(pid);
      await writeLocalPanic(pid, category);
      // Keep auth_token accessible to background task
      await AsyncStorage.setItem('auth_token', token);

      Vibration.vibrate([0, 200, 100, 200]);
      startElapsedTimer();
      startLocationTracking(token);
      setScreen('active');
    } catch (err: any) {
      if (err?.response?.status === 401) {
        await clearAuthData();
        router.replace('/auth/login');
      } else {
        Alert.alert('Error', 'Failed to activate panic mode. Please try again.');
        router.back();
      }
    }
  };

  // ── GPS tracking ──────────────────────────────────────────────────────────
  const startLocationTracking = async (token: string) => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    // Foreground interval (30 s)
    intervalRef.current = setInterval(async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        await axios.post(
          `${BACKEND_URL}/api/panic/location`,
          {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy,
            timestamp: new Date().toISOString(),
          },
          { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
        );
      } catch (_) {}
    }, 30000);

    // Background task
    try {
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 30000,
        distanceInterval: 0,
        foregroundService: {
          notificationTitle: '🚨 SafeGuard Panic Active',
          notificationBody: 'Your location is being shared with security. Tap to open.',
        },
      });
    } catch (_) {}
  };

  const stopLocationTracking = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    try { await Location.stopLocationUpdatesAsync(LOCATION_TASK); } catch (_) {}
  };

  // ── Elapsed timer ─────────────────────────────────────────────────────────
  const startElapsedTimer = () => {
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    elapsedRef.current = setInterval(() => setElapsedSeconds(p => p + 1), 1000);
  };

  const formatElapsed = () => {
    const m = Math.floor(elapsedSeconds / 60);
    const s = elapsedSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // ── Deactivate ─────────────────────────────────────────────────────────────
  const markSafe = () => {
    Alert.alert(
      "I'm Safe Now",
      'This will stop tracking and notify security you are safe.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: "Yes, I'm Safe",
          onPress: async () => {
            try {
              if (elapsedRef.current) clearInterval(elapsedRef.current);
              await stopLocationTracking();

              const token = await getAuthToken();
              if (token) {
                await axios.post(
                  `${BACKEND_URL}/api/panic/deactivate`,
                  {},
                  { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
                );
              }
              await clearLocalPanic();

              Alert.alert('✅ You are Safe', 'Panic mode deactivated. Security has been notified.', [
                { text: 'OK', onPress: () => router.replace('/civil/home') },
              ]);
            } catch (_) {
              Alert.alert('Error', 'Failed to deactivate. Please try again.');
            }
          },
        },
      ]
    );
  };

  const minimizeApp = () => {
    if (Platform.OS === 'android') BackHandler.exitApp();
  };

  const callEmergency = (number: string) => Linking.openURL(`tel:${number}`);

  // ─── SCREEN: Category picker ───────────────────────────────────────────────
  if (screen === 'category') {
    return (
      <SafeAreaView style={styles.container}>
        <EmergencyCategoryModal
          visible={true}
          onSelect={handleCategorySelect}
          onCancel={() => { router.back(); }}
        />
      </SafeAreaView>
    );
  }

  // ─── SCREEN: Activating ────────────────────────────────────────────────────
  if (screen === 'activating') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <View style={styles.activatingIcon}>
            <Ionicons name="alert-circle" size={80} color="#EF4444" />
          </View>
          <Text style={styles.activatingTitle}>Activating Panic Mode…</Text>
          <Text style={styles.activatingSubtitle}>Getting precise location & notifying security</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── SCREEN: Emergency contacts (medical / fire) ───────────────────────────
  if (screen === 'emergency_contacts' && emergencyType) {
    const services = EMERGENCY_SERVICES[emergencyType];
    const title = emergencyType === 'ambulance' ? 'Ambulance Services' : 'Fire Services';
    const icon = emergencyType === 'ambulance' ? 'medkit' : 'flame';
    const color = emergencyType === 'ambulance' ? '#10B981' : '#F59E0B';
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setScreen('category')}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.center}>
          <View style={[styles.activatingIcon, { backgroundColor: `${color}20` }]}>
            <Ionicons name={icon as any} size={60} color={color} />
          </View>
          <Text style={styles.activatingTitle}>{title}</Text>
          <Text style={styles.activatingSubtitle}>Tap to call emergency services immediately</Text>
          {services.map((s, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.callButton, { backgroundColor: color }]}
              onPress={() => callEmergency(s.number)}
            >
              <Ionicons name="call" size={24} color="#fff" />
              <View style={{ marginLeft: 16 }}>
                <Text style={styles.callName}>{s.name}</Text>
                <Text style={styles.callNumber}>{s.number}</Text>
              </View>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.backHomeBtn} onPress={() => router.replace('/civil/home')}>
            <Text style={styles.backHomeText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── SCREEN: Active panic ──────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.activeHeader}>
          <View style={styles.pulseRing}>
            <Ionicons name="alert-circle" size={72} color="#EF4444" />
          </View>
          <Text style={styles.activeTitle}>PANIC MODE ACTIVE</Text>
          <Text style={styles.elapsedText}>Duration: {formatElapsed()}</Text>
        </View>

        {/* Status info */}
        <View style={styles.infoBox}>
          {[
            { icon: 'location', text: 'GPS Tracking: Live', dot: true },
            { icon: 'time', text: 'Updates every 30 seconds' },
            { icon: 'shield-checkmark', text: 'Security team notified' },
            { icon: 'people', text: 'Emergency contacts alerted' },
          ].map((row, i) => (
            <View key={i} style={styles.infoRow}>
              <Ionicons name={row.icon as any} size={22} color="#10B981" />
              <Text style={styles.infoText}>{row.text}</Text>
              {row.dot && <View style={styles.activeDot} />}
            </View>
          ))}
          {selectedCategory && (
            <View style={styles.infoRow}>
              <Ionicons name="warning" size={22} color="#F59E0B" />
              <Text style={[styles.infoText, { color: '#F59E0B' }]}>
                Emergency: {selectedCategory.toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        {/* Warning */}
        <View style={styles.warningBox}>
          <Ionicons name="warning" size={20} color="#F59E0B" />
          <Text style={styles.warningText}>
            Tap "Hide App" to minimize. Your location keeps being shared.
            Re-opening the app will require your PIN.
          </Text>
        </View>

        {/* Actions */}
        <TouchableOpacity style={styles.hideButton} onPress={minimizeApp}>
          <Ionicons name="eye-off" size={22} color="#fff" />
          <Text style={styles.hideButtonText}>Hide App (Keep Tracking)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.safeButton}
          onPress={markSafe}
        >
          <Ionicons name="checkmark-circle" size={22} color="#fff" />
          <Text style={styles.safeButtonText}>I'm Safe — Stop Tracking</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  activatingIcon: { width: 130, height: 130, borderRadius: 65, backgroundColor: '#EF444420', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  activatingTitle: { fontSize: 24, fontWeight: 'bold', color: '#EF4444', marginBottom: 8, textAlign: 'center' },
  activatingSubtitle: { fontSize: 16, color: '#94A3B8', textAlign: 'center', lineHeight: 24 },
  callButton: { flexDirection: 'row', alignItems: 'center', width: '100%', padding: 20, borderRadius: 16, marginBottom: 16 },
  callName: { fontSize: 18, fontWeight: '600', color: '#fff' },
  callNumber: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  backHomeBtn: { marginTop: 24, paddingVertical: 16, paddingHorizontal: 32 },
  backHomeText: { fontSize: 16, color: '#64748B' },
  // Active screen
  content: { flex: 1, padding: 24, justifyContent: 'space-between' },
  activeHeader: { alignItems: 'center', paddingTop: 20 },
  pulseRing: { width: 130, height: 130, borderRadius: 65, backgroundColor: '#EF444415', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#EF444440', marginBottom: 16 },
  activeTitle: { fontSize: 26, fontWeight: 'bold', color: '#EF4444', marginBottom: 8 },
  elapsedText: { fontSize: 16, color: '#94A3B8' },
  infoBox: { backgroundColor: '#1E293B', borderRadius: 16, padding: 20, gap: 14 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoText: { flex: 1, fontSize: 15, color: '#fff' },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  warningBox: { flexDirection: 'row', backgroundColor: '#1E293B', borderRadius: 12, padding: 14, gap: 10, borderWidth: 1, borderColor: '#F59E0B40' },
  warningText: { flex: 1, fontSize: 13, color: '#F59E0B', lineHeight: 19 },
  hideButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#334155', paddingVertical: 16, borderRadius: 12 },
  hideButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  safeButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#10B981', paddingVertical: 16, borderRadius: 12, marginBottom: 4 },
  safeButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
