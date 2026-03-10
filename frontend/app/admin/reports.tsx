import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl, Linking, Modal, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import Constants from 'expo-constants';
import { getAuthToken, clearAuthData } from '../../utils/auth';
import DateTimePicker from '@react-native-community/datetimepicker';

const BACKEND_URL = Constants.expoConfig?.extra?.backendUrl || process.env.EXPO_PUBLIC_BACKEND_URL || 'https://ongoing-dev-22.preview.emergentagent.com';

type DateFilter = 'all' | 'today' | 'last_week' | 'last_month' | 'custom';

export default function AdminReports() {
  const router = useRouter();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  
  // Date filtering
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null);
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  useEffect(() => {
    loadReports();
  }, [typeFilter, dateFilter, customStartDate, customEndDate]);

  const getDateRange = () => {
    const now = new Date();
    let startDate: Date | null = null;
    let endDate: Date | null = null;
    
    switch (dateFilter) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'last_week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'last_month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'custom':
        startDate = customStartDate;
        endDate = customEndDate;
        break;
      default:
        return '';
    }
    
    let params = '';
    if (startDate) params += `&start_date=${startDate.toISOString()}`;
    if (endDate) params += `&end_date=${endDate.toISOString()}`;
    return params;
  };

  const loadReports = async () => {
    try {
      const token = await getAuthToken();
      if (!token) {
        router.replace('/admin/login');
        return;
      }
      
      const dateParams = getDateRange();
      let url = `${BACKEND_URL}/api/admin/all-reports?limit=100${dateParams}`;
      if (typeFilter) url += `&report_type=${typeFilter}`;

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000
      });
      setReports(response.data.reports || []);
    } catch (error: any) {
      console.error('[AdminReports] Failed to load reports:', error?.response?.status);
      if (error?.response?.status === 401) {
        await clearAuthData();
        router.replace('/admin/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReports();
    setRefreshing(false);
  };

  const openMedia = (url: string) => {
    if (url) {
      Linking.openURL(url);
    }
  };

  const getDateFilterLabel = () => {
    const labels: Record<DateFilter, string> = {
      'all': 'All Time',
      'today': 'Today',
      'last_week': 'Last Week',
      'last_month': 'Last Month',
      'custom': customStartDate 
        ? `${customStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${customEndDate ? ` - ${customEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}`
        : 'Select Date'
    };
    return labels[dateFilter];
  };

  const handleDateFilterSelect = (filter: DateFilter) => {
    setDateFilter(filter);
    if (filter !== 'custom') {
      setCustomStartDate(null);
      setCustomEndDate(null);
      setShowDateDropdown(false);
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const renderReport = ({ item }: any) => (
    <TouchableOpacity 
      style={styles.reportCard}
      onPress={() => item.file_url && openMedia(item.file_url)}
    >
      <View style={styles.reportHeader}>
        <View style={[styles.typeBadge, { backgroundColor: item.type === 'video' ? '#3B82F620' : '#10B98120' }]}>
          <Ionicons 
            name={item.type === 'video' ? 'videocam' : 'mic'} 
            size={16} 
            color={item.type === 'video' ? '#3B82F6' : '#10B981'} 
          />
          <Text style={[styles.typeText, { color: item.type === 'video' ? '#3B82F6' : '#10B981' }]}>
            {item.type.toUpperCase()}
          </Text>
        </View>
        {item.is_anonymous && (
          <View style={styles.anonymousBadge}>
            <Ionicons name="eye-off" size={14} color="#64748B" />
            <Text style={styles.anonymousText}>Anonymous</Text>
          </View>
        )}
      </View>
      
      {item.caption && (
        <Text style={styles.caption} numberOfLines={2}>{item.caption}</Text>
      )}
      
      <Text style={styles.userId}>User: {item.is_anonymous ? 'Hidden' : item.user_id?.substring(0, 12) + '...'}</Text>
      <Text style={styles.timestamp}>
        {new Date(item.created_at).toLocaleString()}
      </Text>
      
      {item.location?.coordinates && (
        <Text style={styles.location}>
          📍 {item.location.coordinates[1]?.toFixed(4)}, {item.location.coordinates[0]?.toFixed(4)}
        </Text>
      )}

      {item.file_url && (
        <View style={styles.mediaIndicator}>
          <Ionicons name="play-circle" size={20} color="#3B82F6" />
          <Text style={styles.mediaText}>Tap to view media</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace("/admin/dashboard")}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Evidence Library</Text>
        {/* Calendar Icon for Date Filter */}
        <TouchableOpacity onPress={() => setShowDateDropdown(true)} style={styles.calendarBtn}>
          <Ionicons name="calendar-outline" size={24} color={dateFilter !== 'all' ? '#3B82F6' : '#fff'} />
        </TouchableOpacity>
      </View>

      {/* Active Date Filter Indicator */}
      {dateFilter !== 'all' && (
        <View style={styles.dateFilterBanner}>
          <Ionicons name="calendar" size={16} color="#3B82F6" />
          <Text style={styles.dateFilterText}>{getDateFilterLabel()}</Text>
          <TouchableOpacity onPress={() => handleDateFilterSelect('all')}>
            <Ionicons name="close-circle" size={18} color="#64748B" />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.filters}>
        {['', 'video', 'audio'].map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.filterButton, typeFilter === type && styles.filterButtonActive]}
            onPress={() => setTypeFilter(type)}
          >
            <Ionicons 
              name={type === 'video' ? 'videocam' : type === 'audio' ? 'mic' : 'apps'} 
              size={16} 
              color={typeFilter === type ? '#fff' : '#64748B'} 
            />
            <Text style={[styles.filterButtonText, typeFilter === type && styles.filterButtonTextActive]}>
              {type || 'All'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={reports}
        renderItem={renderReport}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8B5CF6" />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="document-outline" size={48} color="#64748B" />
            <Text style={styles.emptyText}>No reports found</Text>
            {dateFilter !== 'all' && (
              <Text style={styles.emptySubText}>Try adjusting your date filter</Text>
            )}
          </View>
        }
      />

      {/* Date Filter Dropdown Modal */}
      <Modal visible={showDateDropdown} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowDateDropdown(false)}>
          <View style={styles.dropdownContainer}>
            <Text style={styles.dropdownTitle}>Filter by Date</Text>
            {[
              { key: 'all', label: 'All Time', icon: 'infinite' },
              { key: 'today', label: 'Today', icon: 'today' },
              { key: 'last_week', label: 'Last Week', icon: 'calendar' },
              { key: 'last_month', label: 'Last Month', icon: 'calendar-outline' },
              { key: 'custom', label: 'Custom Date Range', icon: 'options' },
            ].map((option) => (
              <TouchableOpacity 
                key={option.key}
                style={[styles.dropdownItem, dateFilter === option.key && styles.dropdownItemActive]}
                onPress={() => handleDateFilterSelect(option.key as DateFilter)}
              >
                <Ionicons name={option.icon as any} size={20} color={dateFilter === option.key ? '#3B82F6' : '#94A3B8'} />
                <Text style={[styles.dropdownItemText, dateFilter === option.key && styles.dropdownItemTextActive]}>
                  {option.label}
                </Text>
                {dateFilter === option.key && <Ionicons name="checkmark" size={20} color="#3B82F6" />}
              </TouchableOpacity>
            ))}

            {/* Custom Date Picker Section */}
            {dateFilter === 'custom' && (
              <View style={styles.customDateSection}>
                <TouchableOpacity style={styles.datePickerButton} onPress={() => setShowStartPicker(true)}>
                  <Ionicons name="calendar" size={18} color="#3B82F6" />
                  <Text style={styles.datePickerText}>
                    {customStartDate ? formatDate(customStartDate) : 'Start Date'}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.dateSeparator}>to</Text>
                <TouchableOpacity style={styles.datePickerButton} onPress={() => setShowEndPicker(true)}>
                  <Ionicons name="calendar" size={18} color="#3B82F6" />
                  <Text style={styles.datePickerText}>
                    {customEndDate ? formatDate(customEndDate) : 'End Date'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.applyButton, (!customStartDate) && styles.applyButtonDisabled]} 
                  onPress={() => setShowDateDropdown(false)}
                  disabled={!customStartDate}
                >
                  <Text style={styles.applyButtonText}>Apply</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Native Date Pickers */}
      {showStartPicker && (
        <DateTimePicker
          value={customStartDate || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, date) => {
            setShowStartPicker(false);
            if (date) setCustomStartDate(date);
          }}
          maximumDate={customEndDate || new Date()}
        />
      )}
      {showEndPicker && (
        <DateTimePicker
          value={customEndDate || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, date) => {
            setShowEndPicker(false);
            if (date) setCustomEndDate(date);
          }}
          minimumDate={customStartDate || undefined}
          maximumDate={new Date()}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  title: { fontSize: 20, fontWeight: '600', color: '#fff' },
  calendarBtn: { padding: 4 },
  
  // Date filter banner
  dateFilterBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#3B82F620', marginHorizontal: 20, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  dateFilterText: { flex: 1, fontSize: 14, color: '#3B82F6', fontWeight: '500' },
  
  filters: { flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 8 },
  filterButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#1E293B' },
  filterButtonActive: { backgroundColor: '#8B5CF6' },
  filterButtonText: { fontSize: 14, color: '#64748B', textTransform: 'capitalize' },
  filterButtonTextActive: { color: '#fff' },
  list: { padding: 20, gap: 12 },
  reportCard: { backgroundColor: '#1E293B', borderRadius: 16, padding: 16 },
  reportHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  typeText: { fontSize: 12, fontWeight: '600' },
  anonymousBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  anonymousText: { fontSize: 12, color: '#64748B' },
  caption: { fontSize: 14, color: '#fff', marginBottom: 8 },
  userId: { fontSize: 12, color: '#94A3B8', marginBottom: 2 },
  timestamp: { fontSize: 12, color: '#64748B', marginBottom: 4 },
  location: { fontSize: 12, color: '#3B82F6' },
  mediaIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#334155' },
  mediaText: { fontSize: 14, color: '#3B82F6' },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 16, color: '#64748B', marginTop: 8 },
  emptySubText: { fontSize: 13, color: '#475569', marginTop: 4 },
  
  // Dropdown Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  dropdownContainer: { backgroundColor: '#1E293B', borderRadius: 20, padding: 20, width: '100%', maxWidth: 320 },
  dropdownTitle: { fontSize: 18, fontWeight: '600', color: '#fff', marginBottom: 16, textAlign: 'center' },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12, marginBottom: 4 },
  dropdownItemActive: { backgroundColor: '#3B82F620' },
  dropdownItemText: { flex: 1, fontSize: 15, color: '#94A3B8' },
  dropdownItemTextActive: { color: '#fff', fontWeight: '500' },
  
  // Custom date picker
  customDateSection: { backgroundColor: '#0F172A', borderRadius: 12, padding: 16, marginTop: 12 },
  datePickerButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1E293B', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, marginBottom: 8 },
  datePickerText: { fontSize: 14, color: '#E2E8F0' },
  dateSeparator: { color: '#64748B', fontSize: 13, textAlign: 'center', marginBottom: 8 },
  applyButton: { backgroundColor: '#3B82F6', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  applyButtonDisabled: { backgroundColor: '#334155' },
  applyButtonText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
