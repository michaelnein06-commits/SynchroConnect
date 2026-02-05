import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Switch,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import DateTimePicker from '@react-native-community/datetimepicker';

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const COLORS = {
  primary: '#6366F1',
  primaryDark: '#4F46E5',
  primaryLight: '#A5B4FC',
  accent: '#F43F5E',
  success: '#10B981',
  warning: '#F59E0B',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#475569',
  textLight: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
};

export default function BriefingSettings() {
  const router = useRouter();
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Morning Briefing settings
  const [morningBriefingEnabled, setMorningBriefingEnabled] = useState(true);
  const [morningBriefingTime, setMorningBriefingTime] = useState('08:00');
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get(`${EXPO_PUBLIC_BACKEND_URL}/api/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const profile = response.data;
      
      setMorningBriefingEnabled(profile.morning_briefing_enabled ?? true);
      setMorningBriefingTime(profile.morning_briefing_time || '08:00');
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSettings();
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await axios.put(`${EXPO_PUBLIC_BACKEND_URL}/api/profile`, {
        morning_briefing_enabled: morningBriefingEnabled,
        morning_briefing_time: morningBriefingTime,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      Alert.alert('✓', 'Settings saved successfully');
      router.back();
    } catch (error) {
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selectedTime) {
      const hours = selectedTime.getHours().toString().padStart(2, '0');
      const minutes = selectedTime.getMinutes().toString().padStart(2, '0');
      setMorningBriefingTime(`${hours}:${minutes}`);
    }
  };

  const getTimeDate = () => {
    const [hours, minutes] = morningBriefingTime.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={[COLORS.warning, '#D97706']} style={styles.headerGradient}>
        <SafeAreaView edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="chevron-back" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Morning Briefing</Text>
            <TouchableOpacity onPress={saveSettings} disabled={saving} style={styles.saveButton}>
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <View style={styles.savePill}>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={styles.savePillText}>Save</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.warning} />}
      >
        {/* Morning Briefing Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconWrapper, { backgroundColor: COLORS.warning + '20' }]}>
              <Ionicons name="sunny" size={18} color={COLORS.warning} />
            </View>
            <Text style={styles.sectionTitle}>Morning Briefing</Text>
          </View>
          
          <Text style={styles.sectionHint}>
            Get a daily summary of contacts you should reach out to. 
            The briefing will show you who's due for contact based on your pipeline settings.
          </Text>
          
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={styles.switchLabel}>Enable Morning Briefing</Text>
                <Text style={styles.switchHint}>Daily summary of contacts to reach out to</Text>
              </View>
              <Switch
                value={morningBriefingEnabled}
                onValueChange={setMorningBriefingEnabled}
                trackColor={{ false: COLORS.border, true: COLORS.warning + '60' }}
                thumbColor={morningBriefingEnabled ? COLORS.warning : COLORS.textLight}
              />
            </View>
            
            {morningBriefingEnabled && (
              <TouchableOpacity 
                style={styles.timeSelector}
                onPress={() => setShowTimePicker(true)}
              >
                <View style={styles.timeSelectorLeft}>
                  <Ionicons name="time-outline" size={20} color={COLORS.warning} />
                  <Text style={styles.timeSelectorLabel}>Briefing Time</Text>
                </View>
                <View style={[styles.timeBadge, { backgroundColor: COLORS.warning + '20' }]}>
                  <Text style={[styles.timeBadgeText, { color: COLORS.warning }]}>{morningBriefingTime}</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Info Section */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={24} color={COLORS.primary} />
          <Text style={styles.infoText}>
            The morning briefing helps you stay connected with your network by 
            reminding you who needs your attention based on their pipeline stage.
          </Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Time Picker */}
      {showTimePicker && (
        <DateTimePicker
          value={getTimeDate()}
          mode="time"
          is24Hour={true}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleTimeChange}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  headerGradient: {
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  saveButton: {
    width: 80,
    alignItems: 'flex-end',
  },
  savePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  savePillText: {
    color: '#fff',
    fontWeight: '600',
    marginLeft: 4,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  sectionHint: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchInfo: {
    flex: 1,
    marginRight: 12,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  switchHint: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  timeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  timeSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeSelectorLabel: {
    fontSize: 15,
    color: COLORS.text,
    marginLeft: 10,
  },
  timeBadge: {
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  timeBadgeText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
  infoCard: {
    backgroundColor: COLORS.primary + '10',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
});
