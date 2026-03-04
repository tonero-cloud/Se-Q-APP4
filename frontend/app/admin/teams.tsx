import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, Alert, Linking, RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import Constants from 'expo-constants';
import { getAuthToken, clearAuthData } from '../../utils/auth';

const BACKEND_URL = Constants.expoConfig?.extra?.backendUrl || process.env.EXPO_PUBLIC_BACKEND_URL || 'https://ongoing-dev-22.preview.emergentagent.com';

const STATUS_COLORS: Record<string, string> = { available: '#10B981', busy: '#F59E0B', responding: '#EF4444', offline: '#64748B' };

export default function AdminTeams() {
  const router = useRouter();
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(useCallback(() => { loadTeams(); }, []));

  const loadTeams = async () => {
    try {
      const token = await getAuthToken();
      if (!token) { router.replace('/admin/login'); return; }
      const res = await axios.get(`${BACKEND_URL}/api/admin/security-teams`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
      });
      setTeams(res.data || []);
    } catch (e: any) {
      if (e?.response?.status === 401 || e?.response?.status === 403) { await clearAuthData(); router.replace('/admin/login'); }
    } finally { setLoading(false); setRefreshing(false); }
  };

  const onRefresh = () => { setRefreshing(true); loadTeams(); };

  const callUser = (phone: string) => {
    if (phone) Linking.openURL(`tel:${phone}`);
    else Alert.alert('No Phone', 'No phone number on file');
  };

  const renderTeam = ({ item }: any) => {
    const statusColor = STATUS_COLORS[item.status] || '#64748B';
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.avatar}>
            <Ionicons name="shield" size={26} color="#F59E0B" />
          </View>
          <View style={styles.info}>
            <Text style={styles.name}>{item.full_name || 'Unknown'}</Text>
            <Text style={styles.email}>{item.email}</Text>
            {item.phone ? <Text style={styles.phone}>📞 {item.phone}</Text> : null}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20` }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{item.status || 'offline'}</Text>
          </View>
        </View>

        <View style={styles.meta}>
          {item.security_sub_role === 'supervisor' && (
            <View style={styles.tag}><Text style={styles.tagText}>⭐ Supervisor</Text></View>
          )}
          {item.team_name ? (
            <View style={[styles.tag, { backgroundColor: '#3B82F620' }]}>
              <Text style={[styles.tagText, { color: '#3B82F6' }]}>👥 {item.team_name}</Text>
            </View>
          ) : null}
          {item.is_verified && (
            <View style={[styles.tag, { backgroundColor: '#10B98120' }]}>
              <Text style={[styles.tagText, { color: '#10B981' }]}>✓ Verified</Text>
            </View>
          )}
        </View>

        {item.team_location?.coordinates && (
          <View style={styles.locationRow}>
            <Ionicons name="location" size={14} color="#3B82F6" />
            <Text style={styles.locationText}>
              Zone: {item.team_location.coordinates[1]?.toFixed(4)}, {item.team_location.coordinates[0]?.toFixed(4)}
              {item.radius_km ? `  ·  ${item.radius_km}km radius` : ''}
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          {item.phone ? (
            <TouchableOpacity style={styles.callBtn} onPress={() => callUser(item.phone)}>
              <Ionicons name="call" size={16} color="#fff" />
              <Text style={styles.callText}>Call</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.trackBtn} onPress={() => router.push(`/admin/track-user?id=${item.id}` as any)}>
            <Ionicons name="locate" size={16} color="#fff" />
            <Text style={styles.callText}>Track</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/admin/dashboard')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Security Teams ({teams.length})</Text>
        <TouchableOpacity onPress={onRefresh}>
          <Ionicons name="refresh" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color="#F59E0B" /></View>
      ) : (
        <FlatList
          data={teams}
          renderItem={renderTeam}
          keyExtractor={item => item.id || item._id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F59E0B" />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="shield-outline" size={64} color="#334155" />
              <Text style={styles.emptyText}>No security teams found</Text>
              <Text style={styles.emptySub}>Security users will appear here once registered</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  backBtn: { padding: 4 },
  title: { fontSize: 17, fontWeight: '700', color: '#fff' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16 },
  card: { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: '#F59E0B' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#F59E0B20', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 2 },
  email: { fontSize: 13, color: '#94A3B8', marginBottom: 2 },
  phone: { fontSize: 13, color: '#10B981' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tag: { backgroundColor: '#F59E0B20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  tagText: { fontSize: 12, color: '#F59E0B', fontWeight: '600' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: '#0F172A', padding: 8, borderRadius: 8 },
  locationText: { fontSize: 12, color: '#94A3B8' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  callBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#10B981', paddingVertical: 10, borderRadius: 10 },
  trackBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#3B82F6', paddingVertical: 10, borderRadius: 10 },
  callText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  empty: { alignItems: 'center', paddingVertical: 80 },
  emptyText: { fontSize: 18, color: '#64748B', marginTop: 16, fontWeight: '600' },
  emptySub: { fontSize: 14, color: '#475569', marginTop: 4, textAlign: 'center' },
});
