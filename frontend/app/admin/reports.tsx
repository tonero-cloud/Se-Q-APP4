import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl, Linking, Modal, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import Constants from 'expo-constants';
import { getAuthToken, clearAuthData } from '../../utils/auth';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Video, ResizeMode } from 'expo-av';
import { Audio } from 'expo-av';

const BACKEND_URL = Constants.expoConfig?.extra?.backendUrl || process.env.EXPO_PUBLIC_BACKEND_URL;

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

  // Media playback
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<Video>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    loadReports();
  }, [typeFilter, dateFilter, customStartDate, customEndDate]);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

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
      if (!token) { router.replace('/admin/login'); return; }
      
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

  const getMediaUrl = (fileUrl: string) => {
    if (!fileUrl) return '';
    if (fileUrl.startsWith('http')) return fileUrl;
    return `${BACKEND_URL}${fileUrl}`;
  };

  const playAudio = async (fileUrl: string) => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }
      
      const { sound } = await Audio.Sound.createAsync(
        { uri: getMediaUrl(fileUrl) },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      setIsPlaying(true);
      
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
        }
      });
    } catch (error) {
      console.error('[AdminReports] Audio playback error:', error);
    }
  };

  const stopAudio = async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      setIsPlaying(false);
    }
  };

  const openMediaModal = (report: any) => {
    setSelectedReport(report);
  };

  const closeMediaModal = async () => {
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setIsPlaying(false);
    setSelectedReport(null);
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

  const getSenderDisplay = (item: any) => {
    if (item.is_anonymous) return { name: 'Anonymous Reporter', email: '', phone: '', isAnonymous: true };
    return {
      name: item.full_name || 'Unknown User',
      email: item.user_email || '',
      phone: item.user_phone || '',
      isAnonymous: false
    };
  };

  const renderReport = ({ item }: any) => {
    const sender = getSenderDisplay(item);
    const hasMedia = !!item.file_url;
    
    return (
      <TouchableOpacity 
        style={styles.reportCard}
        onPress={() => hasMedia && openMediaModal(item)}
        activeOpacity={hasMedia ? 0.7 : 1}
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
        
        {/* Sender Details - FULL INFO */}
        <View style={styles.senderSection}>
          <View style={[styles.senderAvatar, sender.isAnonymous && { backgroundColor: '#64748B20' }]}>
            <Ionicons 
              name={sender.isAnonymous ? 'eye-off' : 'person'} 
              size={22} 
              color={sender.isAnonymous ? '#64748B' : '#8B5CF6'} 
            />
          </View>
          <View style={styles.senderInfo}>
            <Text style={styles.senderName}>{sender.name}</Text>
            {sender.email && <Text style={styles.senderDetail}>✉️ {sender.email}</Text>}
            {sender.phone && <Text style={styles.senderDetail}>📞 {sender.phone}</Text>}
          </View>
        </View>
        
        {item.caption && (
          <Text style={styles.caption} numberOfLines={2}>{item.caption}</Text>
        )}
        
        <Text style={styles.timestamp}>
          📅 {new Date(item.created_at).toLocaleString()}
        </Text>
        
        {item.location?.coordinates && (
          <Text style={styles.location}>
            📍 {item.location.coordinates[1]?.toFixed(4)}, {item.location.coordinates[0]?.toFixed(4)}
          </Text>
        )}

        {hasMedia && (
          <View style={styles.mediaIndicator}>
            <Ionicons name="play-circle" size={22} color="#3B82F6" />
            <Text style={styles.mediaText}>Tap to play {item.type}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace("/admin/dashboard")}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Evidence Library</Text>
        <TouchableOpacity onPress={() => setShowDateDropdown(true)} style={styles.calendarBtn}>
          <Ionicons name="calendar-outline" size={24} color={dateFilter !== 'all' ? '#3B82F6' : '#fff'} />
        </TouchableOpacity>
      </View>

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

      {/* Date Filter Modal */}
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

      {/* Date Pickers */}
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

      {/* Media Playback Modal */}
      {selectedReport && (
        <Modal visible={true} transparent animationType="slide" onRequestClose={closeMediaModal}>
          <View style={styles.mediaModalOverlay}>
            <View style={styles.mediaModalContainer}>
              <View style={styles.mediaModalHeader}>
                <Text style={styles.mediaModalTitle}>
                  {selectedReport.type === 'video' ? '🎬 Video Report' : '🎙️ Audio Report'}
                </Text>
                <TouchableOpacity onPress={closeMediaModal}>
                  <Ionicons name="close" size={28} color="#fff" />
                </TouchableOpacity>
              </View>

              {/* Sender Info */}
              <View style={styles.mediaModalSender}>
                <Ionicons name="person-circle" size={32} color="#8B5CF6" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.mediaModalSenderName}>{getSenderDisplay(selectedReport).name}</Text>
                  <Text style={styles.mediaModalSenderSub}>
                    {new Date(selectedReport.created_at).toLocaleString()}
                  </Text>
                </View>
              </View>

              {selectedReport.caption && (
                <Text style={styles.mediaModalCaption}>{selectedReport.caption}</Text>
              )}

              {/* Video Player */}
              {selectedReport.type === 'video' && selectedReport.file_url && (
                <View style={styles.videoContainer}>
                  <Video
                    ref={videoRef}
                    source={{ uri: getMediaUrl(selectedReport.file_url) }}
                    style={styles.videoPlayer}
                    useNativeControls
                    resizeMode={ResizeMode.CONTAIN}
                    shouldPlay={false}
                  />
                </View>
              )}

              {/* Audio Player */}
              {selectedReport.type === 'audio' && selectedReport.file_url && (
                <View style={styles.audioContainer}>
                  <Ionicons name="musical-notes" size={60} color="#10B981" />
                  <Text style={styles.audioLabel}>Audio Recording</Text>
                  <TouchableOpacity
                    style={[styles.playButton, isPlaying && styles.stopButton]}
                    onPress={() => isPlaying ? stopAudio() : playAudio(selectedReport.file_url)}
                  >
                    <Ionicons name={isPlaying ? 'stop' : 'play'} size={28} color="#fff" />
                    <Text style={styles.playButtonText}>{isPlaying ? 'Stop' : 'Play Audio'}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Location */}
              {selectedReport.location?.coordinates && (
                <TouchableOpacity 
                  style={styles.locationBtn}
                  onPress={() => Linking.openURL(`https://maps.google.com/?q=${selectedReport.location.coordinates[1]},${selectedReport.location.coordinates[0]}`)}
                >
                  <Ionicons name="location" size={18} color="#3B82F6" />
                  <Text style={styles.locationBtnText}>
                    View Location: {selectedReport.location.coordinates[1]?.toFixed(4)}, {selectedReport.location.coordinates[0]?.toFixed(4)}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  title: { fontSize: 20, fontWeight: '600', color: '#fff' },
  calendarBtn: { padding: 4 },
  
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
  
  // Sender section
  senderSection: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0F172A', borderRadius: 12, padding: 12, marginBottom: 12 },
  senderAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#8B5CF620', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  senderInfo: { flex: 1 },
  senderName: { fontSize: 16, fontWeight: '600', color: '#fff' },
  senderDetail: { fontSize: 13, color: '#94A3B8', marginTop: 2 },
  
  caption: { fontSize: 14, color: '#fff', marginBottom: 8 },
  timestamp: { fontSize: 12, color: '#64748B', marginBottom: 4 },
  location: { fontSize: 12, color: '#3B82F6' },
  mediaIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#334155' },
  mediaText: { fontSize: 14, color: '#3B82F6' },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 16, color: '#64748B', marginTop: 8 },
  emptySubText: { fontSize: 13, color: '#475569', marginTop: 4 },
  
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  dropdownContainer: { backgroundColor: '#1E293B', borderRadius: 20, padding: 20, width: '100%', maxWidth: 320 },
  dropdownTitle: { fontSize: 18, fontWeight: '600', color: '#fff', marginBottom: 16, textAlign: 'center' },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12, marginBottom: 4 },
  dropdownItemActive: { backgroundColor: '#3B82F620' },
  dropdownItemText: { flex: 1, fontSize: 15, color: '#94A3B8' },
  dropdownItemTextActive: { color: '#fff', fontWeight: '500' },
  
  customDateSection: { backgroundColor: '#0F172A', borderRadius: 12, padding: 16, marginTop: 12 },
  datePickerButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1E293B', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, marginBottom: 8 },
  datePickerText: { fontSize: 14, color: '#E2E8F0' },
  dateSeparator: { color: '#64748B', fontSize: 13, textAlign: 'center', marginBottom: 8 },
  applyButton: { backgroundColor: '#3B82F6', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  applyButtonDisabled: { backgroundColor: '#334155' },
  applyButtonText: { fontSize: 15, fontWeight: '600', color: '#fff' },

  // Media Modal
  mediaModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  mediaModalContainer: { backgroundColor: '#1E293B', borderRadius: 20, width: '100%', maxWidth: 400, overflow: 'hidden' },
  mediaModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#0F172A' },
  mediaModalTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  mediaModalSender: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155' },
  mediaModalSenderName: { fontSize: 16, fontWeight: '600', color: '#fff' },
  mediaModalSenderSub: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  mediaModalCaption: { fontSize: 14, color: '#CBD5E1', padding: 16, paddingTop: 12 },
  videoContainer: { width: '100%', aspectRatio: 16/9, backgroundColor: '#000' },
  videoPlayer: { width: '100%', height: '100%' },
  audioContainer: { alignItems: 'center', padding: 30 },
  audioLabel: { fontSize: 16, color: '#94A3B8', marginTop: 12, marginBottom: 20 },
  playButton: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#10B981', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 30 },
  stopButton: { backgroundColor: '#EF4444' },
  playButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  locationBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: '#334155' },
  locationBtnText: { fontSize: 13, color: '#3B82F6' },
});
