import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { BACKEND_URL } from '@/constants/api';

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState({ activePanics: 0, teams: 0 });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await axios.get(`${BACKEND_URL}/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStats(res.data);
    } catch (e) {
      console.log('Stats fetch error', e);
    }
  };

  const handleClearUploads = async () => {
    Alert.alert(
      "Clear All Uploads",
      "This will delete ALL audio/video reports and files. Irreversible. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Everything",
          style: "destructive",
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('token');
              await axios.delete(`${BACKEND_URL}/admin/clear-uploads`, {
                headers: { Authorization: `Bearer ${token}` }
              });
              Alert.alert("Success", "All uploads cleared.");
            } catch (err) {
              Alert.alert("Error", "Failed to clear uploads. Check auth or server.");
            }
          }
        }
      ]
    );
  };

  const quickActions = [
    { label: 'Manage Users', icon: 'people', color: '#3B82F6', route: '/admin/users' },
    { label: 'Security Teams', icon: 'shield-checkmark', color: '#F59E0B', route: '/security/home' },
    { label: 'All Panics', icon: 'alert-circle', color: '#EF4444', route: '/security/panics' },
    { label: 'Evidence Library', icon: 'videocam', color: '#10B981', route: '/report/list' },
    { label: 'Security Map', icon: 'map', color: '#14B8A6', route: '/security/nearby' },
    { label: 'Messaging', icon: 'chatbubbles', color: '#6366F1', route: '/security/chat' },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <View style={{ padding: 20 }}>
        <Text style={{ fontSize: 28, fontWeight: 'bold', marginBottom: 20 }}>Admin Dashboard</Text>

        {/* Stats Overview */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 }}>
          <View style={{ backgroundColor: '#fef3f2', padding: 16, borderRadius: 12, flex: 1, marginRight: 12 }}>
            <Text style={{ color: '#ef4444', fontSize: 14 }}>Active Panics</Text>
            <Text style={{ fontSize: 32, fontWeight: 'bold', color: '#111' }}>{stats.activePanics}</Text>
          </View>
          <View style={{ backgroundColor: '#ecfdf5', padding: 16, borderRadius: 12, flex: 1 }}>
            <Text style={{ color: '#10b981', fontSize: 14 }}>Security Teams</Text>
            <Text style={{ fontSize: 32, fontWeight: 'bold', color: '#111' }}>{stats.teams}</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>Quick Actions</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {quickActions.map((action) => (
            <TouchableOpacity
              key={action.label}
              onPress={() => router.push(action.route)}
              style={{
                backgroundColor: 'white',
                borderRadius: 12,
                padding: 16,
                alignItems: 'center',
                width: '47%',
                shadowColor: '#000',
                shadowOpacity: 0.05,
                shadowRadius: 10,
                elevation: 2,
              }}
            >
              <Ionicons name={action.icon} size={28} color={action.color} />
              <Text style={{ marginTop: 8, fontWeight: '500' }}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Danger Zone */}
        <View style={{ marginTop: 32, padding: 16, backgroundColor: '#fef2f2', borderRadius: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#991b1b', marginBottom: 12 }}>Danger Zone</Text>
          <TouchableOpacity
            onPress={handleClearUploads}
            style={{
              backgroundColor: '#dc2626',
              padding: 14,
              borderRadius: 8,
              alignItems: 'center'
            }}
          >
            <Text style={{ color: 'white', fontWeight: '600' }}>Delete All Uploads</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}
