import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { BACKEND_URL } from '@/constants/api';

interface Report {
  _id: string;
  type: 'video' | 'audio';
  file_url: string;
  created_at: string;
  status: string;
}

export default function ReportListScreen() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const fetchTokenAndReports = async () => {
      try {
        const storedToken = await AsyncStorage.getItem('token');
        setToken(storedToken);

        if (!storedToken) {
          Alert.alert('Error', 'Please log in again.');
          return;
        }

        const response = await axios.get(`${BACKEND_URL}/report/list`, {
          headers: { Authorization: `Bearer ${storedToken}` },
        });

        setReports(response.data || []);
      } catch (error) {
        console.error('Failed to load reports:', error);
        Alert.alert('Error', 'Could not load your reports.');
      } finally {
        setLoading(false);
      }
    };

    fetchTokenAndReports();
  }, []);

  const renderReport = ({ item }: { item: Report }) => {
    const videoUri = item.file_url.startsWith('http')
      ? item.file_url
      : `${BACKEND_URL}${item.file_url}`;

    return (
      <View style={{ marginBottom: 24, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', elevation: 2 }}>
        <Text style={{ padding: 12, fontWeight: '600', backgroundColor: '#f3f4f6' }}>
          {item.type.toUpperCase()} Report • {new Date(item.created_at).toLocaleString()}
        </Text>

        {item.type === 'video' && (
          <Video
            source={{
              uri: videoUri,
              headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            }}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={false}
            isLooping={false}
            style={{ width: '100%', height: 240 }}
            onError={(err) => console.log('Video playback error:', err)}
          />
        )}

        {item.type === 'audio' && (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: '#666' }}>Audio playback not yet implemented in this view</Text>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb', padding: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16 }}>My Reports</Text>

      {reports.length === 0 ? (
        <Text style={{ textAlign: 'center', color: '#666', marginTop: 40 }}>
          No reports submitted yet.
        </Text>
      ) : (
        <FlatList
          data={reports}
          renderItem={renderReport}
          keyExtractor={(item) => item._id}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
