import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, Alert, Linking, Platform, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import Constants from 'expo-constants';
import { getAuthToken, clearAuthData } from '../../utils/auth';
import { LocationMapModal } from '../../components/LocationMapModal';

const BACKEND_URL = Constants.expoConfig?.extra?.backendUrl || process.env.EXPO_PUBLIC_BACKEND_URL || 'https://ongoing-dev-22.preview.emergentagent.com';

const EMERGENCY_CATEGORIES: Record<string, { label: string; icon: string; color: string }> = {
  violence: { label: 'Violence/Assault', icon: 'alert-circle', color: '#EF4444' },
  robbery: { label: 'Armed Robbery', icon: 'warning', color: '#F97316' },
  kidnapping: { label: 'Kidnapping', icon: 'body', color: '#DC2626' },
  breakin: { label: 'Break-in/Burglary', icon: 'home', color: '#8B5CF6' },
  harassment: { label: 'Harassment/Stalking', icon: 'eye', color: '#EC4899' },
  medical: { label: 'Medical Emergency', icon: 'medkit', color: '#10B981' },
  fire: { label: 'Fire Outbreak', icon: 'flame', color: '#F59E0B' },
  other: { label: 'Other Emergency', icon: 'help-circle', color: '#64748B' },
};

interface LocationEntry {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: string;
}

export default function SecurityPanics() {
  const router = useRouter();
  const [panics, setPanics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationModal, setLocationModal] = useState<{visible: boolean; lat: number; lng: number; title: string} | null>(null);
  const [respondModal, setRespondModal] = useState<any>(null);
  const [locationHistoryModal, setLocationHistoryModal] = useState<{visible: boolean; panic: any} | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadPanics();
    }, [])
  );

  useEffect(() => {
    const interval = setInterval(loadPanics, 15000);
    return () => clearInterval(interval);
  }, []);

  const loadPanics = async () => {
    try {
      const token = await getAuthToken();
      if (!token) {
        router.replace('/auth/login');
        return;
      }
      
      const response = await axios.get(`${BACKEND_URL}/api/security/nearby-panics?t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' },
        timeout: 15000
      });
      console.log('[SecurityPanics] Loaded', response.data?.length, 'panics');
      setPanics(response.data || []);
    } catch (error: any) {
      console.error('[SecurityPanics] Failed to load panics:', error?.response?.status);
      if (error?.response?.status === 401) {
        await clearAuthData();
        router.replace('/auth/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const callUser = (phone: string) => {
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    } else {
      Alert.alert('No Phone', 'Phone number not available');
    }
  };

  const sendMessage = (phone: string) => {
    if (phone) {
      Linking.openURL(`sms:${phone}`);
    } else {
      Alert.alert('No Phone', 'Phone number not available for messaging');
    }
  };

  const openInMaps = (latitude: number, longitude: number, label: string) => {
    const url = Platform.select({
      ios: `maps:?q=${encodeURIComponent(label)}&ll=${latitude},${longitude}`,
      android: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodeURIComponent(label)})`
    });
    if (url) {
      Linking.openURL(url).catch(() => {
        Alert.alert('Error', 'Could not open maps');
      });
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    };
  };

  const formatTime = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        month: 'short', day: 'numeric',
      });
    } catch { return timestamp; }
  };

  const getCategoryInfo = (category: string) => {
    return EMERGENCY_CATEGORIES[category] || EMERGENCY_CATEGORIES.other;
  };

  const getSenderName = (item: any): string => {
    const fullName = (item.full_name || '').trim();
    if (fullName && fullName.length > 0) return fullName;
    const email = item.user_email || item.email || '';
    if (email) return email;
    return 'Unknown User';
  };

  const handleRespond = (item: any) => {
    if (!item.latitude || !item.longitude) {
      Alert.alert('Location Error', 'User location not available');
      return;
    }
    setRespondModal(item);
  };

  const renderLocationEntry = (loc: LocationEntry, index: number, total: number) => (
    <TouchableOpacity
      key={index}
      style={[styles.locationEntry, index === 0 && styles.latestEntry]}
      onPress={() => setLocationModal({ 
        visible: true, 
        lat: loc.latitude, 
        lng: loc.longitude, 
        title: `Location @ ${formatTime(loc.timestamp)}` 
      })}
      activeOpacity={0.7}
    >
      <View style={styles.entryLeft}>
        <View style={[styles.locationDot, index === 0 && styles.latestDot]} />
        {index < total - 1 && <View style={styles.locationLine} />}
      </View>
      <View style={styles.entryContent}>
        <View style={styles.entryTopRow}>
          {index === 0 && <View style={styles.latestBadge}><Text style={styles.latestBadgeText}>LATEST</Text></View>}
          <Text style={styles.coordsText}>{loc.latitude.toFixed(6)}, {loc.longitude.toFixed(6)}</Text>
        </View>
        <Text style={styles.timeText}>{formatTime(loc.timestamp)}</Text>
        {loc.accuracy != null && <Text style={styles.accuracyText}>±{Math.round(loc.accuracy)}m accuracy</Text>}
      </View>
      <Ionicons name="map-outline" size={18} color="#3B82F6" style={{ marginLeft: 8 }} />
    </TouchableOpacity>
  );

  const renderPanic = ({ item }: any) => {
    const categoryInfo = getCategoryInfo(item.emergency_category);
    const dateTime = formatDateTime(item.activated_at);
    const senderName = getSenderName(item);
    const locationHistory = item.location_history || [];

    return (
      <View style={styles.panicCard}>
        {/* Top row: ACTIVE PANIC on left, Emergency Category on right */}
        <View style={styles.panicTopRow}>
          <View style={styles.activePanicBadge}>
            <Ionicons name="alert-circle" size={16} color="#EF4444" />
            <Text style={styles.activePanicText}>ACTIVE PANIC</Text>
          </View>
          <View style={[styles.categoryBadge, { backgroundColor: `${categoryInfo.color}20` }]}>
            <Ionicons name={categoryInfo.icon as any} size={16} color={categoryInfo.color} />
            <Text style={[styles.categoryText, { color: categoryInfo.color }]}>
              {categoryInfo.label}
            </Text>
          </View>
        </View>

        <View style={styles.panicHeader}>
          <View style={styles.panicIcon}>
            <Ionicons name="person-circle" size={44} color="#3B82F6" />
          </View>
          <View style={styles.panicInfo}>
            <Text style={styles.panicName}>{getSenderName(item)}</Text>
            <Text style={styles.panicEmail}>{item.user_email || 'No email'}</Text>
            {(item.user_phone || item.phone) ? (
              <Text style={styles.panicPhone}>{item.user_phone || item.phone}</Text>
            ) : (
              <Text style={styles.panicPhoneEmpty}>No phone on file</Text>
            )}
          </View>
        </View>

        <View style={styles.panicDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="calendar" size={16} color="#94A3B8" />
            <Text style={styles.detailText}>{dateTime.date}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="time" size={16} color="#94A3B8" />
            <Text style={styles.detailText}>{dateTime.time}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="location" size={16} color="#94A3B8" />
            <Text style={styles.detailText}>
              {item.latitude?.toFixed(4)}, {item.longitude?.toFixed(4)}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="pulse" size={16} color="#10B981" />
            <Text style={styles.detailText}>
              {item.location_count || 0} location updates
            </Text>
          </View>
        </View>

        {/* GPS Location History Section - Like Security Escort */}
        {locationHistory.length > 0 && (
          <TouchableOpacity 
            style={styles.gpsHistoryCard}
            onPress={() => setLocationHistoryModal({ visible: true, panic: item })}
          >
            <View style={styles.gpsHistoryHeader}>
              <Ionicons name="trail-sign" size={18} color="#F59E0B" />
              <Text style={styles.gpsHistoryTitle}>GPS Track History</Text>
              <View style={styles.gpsCountBadge}>
                <Text style={styles.gpsCountText}>{locationHistory.length}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#64748B" />
            </View>
            <Text style={styles.gpsHistorySubtext}>
              Tap to view all recorded GPS coordinates
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.panicActions}>
          <TouchableOpacity 
            style={styles.respondButton}
            onPress={() => handleRespond(item)}
          >
            <Ionicons name="navigate" size={22} color="#fff" />
            <Text style={styles.respondButtonText}>Respond</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/security/home')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Active Panics ({panics.length})</Text>
        <TouchableOpacity onPress={loadPanics}>
          <Ionicons name="refresh" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#EF4444" />
        </View>
      ) : (
        <FlatList
          data={panics}
          renderItem={renderPanic}
          keyExtractor={(item) => item.id || item._id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="shield-checkmark" size={80} color="#64748B" />
              <Text style={styles.emptyText}>No active panics</Text>
              <Text style={styles.emptySubtext}>All clear in your area</Text>
            </View>
          }
        />
      )}

      {locationModal && (
        <LocationMapModal
          visible={locationModal.visible}
          onClose={() => setLocationModal(null)}
          latitude={locationModal.lat}
          longitude={locationModal.lng}
          title={locationModal.title}
        />
      )}

      {/* Respond Modal */}
      {respondModal && (
        <Modal visible={true} transparent animationType="fade" onRequestClose={() => setRespondModal(null)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setRespondModal(null)}>
            <View style={styles.respondModalContainer}>
              <Text style={styles.respondModalTitle}>🚨 Respond to Panic</Text>
              <Text style={styles.respondModalName}>{getSenderName(respondModal)}</Text>
              {(respondModal.user_phone || respondModal.phone) && (
                <Text style={styles.respondModalPhone}>📞 {respondModal.user_phone || respondModal.phone}</Text>
              )}
              <Text style={styles.respondModalCoords}>
                📍 {respondModal.latitude?.toFixed(4)}, {respondModal.longitude?.toFixed(4)}
              </Text>
              
              <TouchableOpacity style={styles.respondModalBtn} onPress={() => {
                setRespondModal(null);
                setLocationModal({ visible: true, lat: respondModal.latitude, lng: respondModal.longitude, title: `${getSenderName(respondModal)}'s Location` });
              }}>
                <Ionicons name="map" size={20} color="#fff" />
                <Text style={styles.respondModalBtnText}>View on Map</Text>
              </TouchableOpacity>

              {(respondModal.user_phone || respondModal.phone) && (
                <>
                  <TouchableOpacity style={[styles.respondModalBtn, { backgroundColor: '#10B981' }]} onPress={() => { setRespondModal(null); callUser(respondModal.user_phone || respondModal.phone); }}>
                    <Ionicons name="call" size={20} color="#fff" />
                    <Text style={styles.respondModalBtnText}>Call User</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.respondModalBtn, { backgroundColor: '#8B5CF6' }]} onPress={() => { setRespondModal(null); sendMessage(respondModal.user_phone || respondModal.phone); }}>
                    <Ionicons name="chatbubble" size={20} color="#fff" />
                    <Text style={styles.respondModalBtnText}>Send Message</Text>
                  </TouchableOpacity>
                </>
              )}
              
              <TouchableOpacity style={[styles.respondModalBtn, { backgroundColor: '#334155' }]} onPress={() => setRespondModal(null)}>
                <Text style={styles.respondModalBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Location History Modal - Like Security Escort */}
      {locationHistoryModal && (
        <Modal visible={true} transparent animationType="slide" onRequestClose={() => setLocationHistoryModal(null)}>
          <View style={styles.historyModalContainer}>
            <SafeAreaView style={styles.historyModalInner}>
              <View style={styles.historyModalHeader}>
                <TouchableOpacity onPress={() => setLocationHistoryModal(null)}>
                  <Ionicons name="close" size={28} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.historyModalTitle}>GPS Location History</Text>
                <View style={{ width: 28 }} />
              </View>
              
              <View style={styles.historyUserCard}>
                <Ionicons name="person-circle" size={40} color="#EF4444" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.historyUserName}>{getSenderName(locationHistoryModal.panic)}</Text>
                  <Text style={styles.historyUserSub}>
                    {locationHistoryModal.panic.location_history?.length || 0} recorded points
                  </Text>
                </View>
                <View style={[styles.categoryBadge, { backgroundColor: `${getCategoryInfo(locationHistoryModal.panic.emergency_category).color}20` }]}>
                  <Text style={[styles.categoryText, { color: getCategoryInfo(locationHistoryModal.panic.emergency_category).color }]}>
                    {getCategoryInfo(locationHistoryModal.panic.emergency_category).label}
                  </Text>
                </View>
              </View>

              <ScrollView style={styles.historyList} showsVerticalScrollIndicator={false}>
                {(locationHistoryModal.panic.location_history || []).map((loc: LocationEntry, index: number) => 
                  renderLocationEntry(loc, index, locationHistoryModal.panic.location_history?.length || 0)
                )}
                {(!locationHistoryModal.panic.location_history || locationHistoryModal.panic.location_history.length === 0) && (
                  <View style={styles.noHistoryContainer}>
                    <Ionicons name="time-outline" size={44} color="#334155" />
                    <Text style={styles.noHistoryText}>No location history yet</Text>
                    <Text style={styles.noHistorySubtext}>GPS coordinates will appear as they are recorded</Text>
                  </View>
                )}
              </ScrollView>
            </SafeAreaView>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16 },
  panicCard: { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, marginBottom: 16, borderLeftWidth: 4, borderLeftColor: '#EF4444' },
  panicTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  activePanicBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EF444420', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 6 },
  activePanicText: { fontSize: 12, fontWeight: '800', color: '#EF4444', letterSpacing: 0.5 },
  categoryBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 6 },
  categoryText: { fontSize: 12, fontWeight: '600' },
  panicHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  panicIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#3B82F620', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  panicInfo: { flex: 1 },
  panicName: { fontSize: 17, fontWeight: '700', color: '#fff', marginBottom: 4 },
  panicEmail: { fontSize: 13, color: '#94A3B8', marginBottom: 3 },
  panicPhone: { fontSize: 14, color: '#10B981', fontWeight: '600' },
  panicPhoneEmpty: { fontSize: 13, color: '#475569', fontStyle: 'italic' },
  panicDetails: { marginTop: 16, backgroundColor: '#0F172A', borderRadius: 12, padding: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  detailText: { fontSize: 14, color: '#94A3B8' },
  
  // GPS History Card
  gpsHistoryCard: { marginTop: 12, backgroundColor: '#F59E0B10', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#F59E0B30' },
  gpsHistoryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gpsHistoryTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: '#F59E0B' },
  gpsCountBadge: { backgroundColor: '#F59E0B', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  gpsCountText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  gpsHistorySubtext: { fontSize: 12, color: '#94A3B8', marginTop: 4 },

  panicActions: { flexDirection: 'row', marginTop: 16, gap: 12 },
  respondButton: { 
    flex: 1,
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 10, 
    paddingVertical: 14, 
    borderRadius: 12,
    backgroundColor: '#F59E0B',
  },
  respondButtonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  emptyContainer: { alignItems: 'center', paddingVertical: 80 },
  emptyText: { fontSize: 20, color: '#64748B', marginTop: 16, fontWeight: '600' },
  emptySubtext: { fontSize: 14, color: '#475569', marginTop: 4 },
  
  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  respondModalContainer: { backgroundColor: '#1E293B', borderRadius: 20, padding: 24, width: '100%', maxWidth: 360 },
  respondModalTitle: { fontSize: 18, fontWeight: 'bold', color: '#EF4444', marginBottom: 8, textAlign: 'center' },
  respondModalName: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 4, textAlign: 'center' },
  respondModalPhone: { fontSize: 15, color: '#10B981', marginBottom: 4, textAlign: 'center' },
  respondModalCoords: { fontSize: 13, color: '#94A3B8', marginBottom: 20, textAlign: 'center' },
  respondModalBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#3B82F6', paddingVertical: 14, borderRadius: 12, marginBottom: 10 },
  respondModalBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },

  // Location History Modal
  historyModalContainer: { flex: 1, backgroundColor: '#0F172A' },
  historyModalInner: { flex: 1 },
  historyModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  historyModalTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  historyUserCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', marginHorizontal: 16, marginTop: 16, borderRadius: 12, padding: 14 },
  historyUserName: { fontSize: 16, fontWeight: '600', color: '#fff' },
  historyUserSub: { fontSize: 13, color: '#94A3B8', marginTop: 2 },
  historyList: { flex: 1, padding: 16 },

  // Location Entry styles (like escort)
  locationEntry: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1E293B20', paddingHorizontal: 4 },
  latestEntry: { backgroundColor: '#3B82F60A', borderRadius: 10, paddingHorizontal: 10 },
  entryLeft: { width: 22, alignItems: 'center', marginRight: 12, paddingTop: 2 },
  locationDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#334155' },
  latestDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#10B981' },
  locationLine: { width: 2, height: 30, backgroundColor: '#1E293B', marginTop: 3 },
  entryContent: { flex: 1 },
  entryTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  latestBadge: { backgroundColor: '#10B98130', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  latestBadgeText: { color: '#10B981', fontSize: 10, fontWeight: '700' },
  coordsText: { fontSize: 13, color: '#E2E8F0', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  timeText: { fontSize: 12, color: '#64748B', marginTop: 3 },
  accuracyText: { fontSize: 11, color: '#475569', marginTop: 1 },

  noHistoryContainer: { alignItems: 'center', paddingVertical: 40 },
  noHistoryText: { color: '#475569', fontSize: 14, marginTop: 12 },
  noHistorySubtext: { color: '#334155', fontSize: 12, marginTop: 4 },
});
