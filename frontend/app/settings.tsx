import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const COLORS = {
  primary: '#6366F1',
  accent: '#F43F5E',
  background: '#F1F5F9',
  surface: '#FFFFFF',
  text: '#0F172A',
  textLight: '#64748B',
  border: '#E2E8F0',
  success: '#10B981',
};

const UI_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
];

const DRAFT_LANGUAGES = [
  'English', 'German', 'Spanish', 'French', 'Italian', 
  'Portuguese', 'Dutch', 'Russian', 'Chinese', 'Japanese'
];

export default function Settings() {
  const router = useRouter();
  const { token, user, updateUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [settings, setSettings] = useState({
    ui_language: 'en',
    default_draft_language: 'English',
    default_writing_style: 'Hey! How have you been? Just wanted to catch up and see what you\'ve been up to lately.',
    notification_time: '09:00',
    notifications_enabled: true,
  });

  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showDraftLanguageModal, setShowDraftLanguageModal] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await axios.get(`${EXPO_PUBLIC_BACKEND_URL}/api/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const profile = response.data;
      setSettings({
        ui_language: profile.ui_language || 'en',
        default_draft_language: profile.default_draft_language || 'English',
        default_writing_style: profile.default_writing_style || '',
        notification_time: profile.notification_time || '09:00',
        notifications_enabled: profile.notifications_enabled ?? true,
      });
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await axios.put(`${EXPO_PUBLIC_BACKEND_URL}/api/profile`, settings, {
        headers: { Authorization: `Bearer ${token}` }
      });
      Alert.alert('Success', 'Settings saved successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const getLanguageName = (code: string) => {
    return UI_LANGUAGES.find(l => l.code === code)?.name || code;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <TouchableOpacity onPress={saveSettings} disabled={saving} style={styles.saveButton}>
          {saving ? (
            <ActivityIndicator color={COLORS.primary} size="small" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Localization Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Localization</Text>
          
          {/* App UI Language */}
          <TouchableOpacity 
            style={styles.settingItem}
            onPress={() => setShowLanguageModal(true)}
          >
            <View style={styles.settingIcon}>
              <Ionicons name="globe-outline" size={22} color={COLORS.primary} />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingLabel}>App Language</Text>
              <Text style={styles.settingValue}>{getLanguageName(settings.ui_language)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
          </TouchableOpacity>

          {/* Default Draft Language */}
          <TouchableOpacity 
            style={styles.settingItem}
            onPress={() => setShowDraftLanguageModal(true)}
          >
            <View style={styles.settingIcon}>
              <Ionicons name="chatbubble-outline" size={22} color={COLORS.primary} />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingLabel}>Default Draft Language</Text>
              <Text style={styles.settingValue}>{settings.default_draft_language}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
          </TouchableOpacity>
        </View>

        {/* AI Settings Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI Message Drafting</Text>
          
          <View style={styles.settingItemColumn}>
            <View style={styles.settingLabelRow}>
              <Ionicons name="sparkles-outline" size={22} color={COLORS.primary} />
              <Text style={styles.settingLabel}>Default Writing Style</Text>
            </View>
            <Text style={styles.settingHint}>
              This example helps AI learn your general writing style. Can be overridden per contact.
            </Text>
            <TextInput
              style={styles.textArea}
              value={settings.default_writing_style}
              onChangeText={(text) => setSettings({ ...settings, default_writing_style: text })}
              placeholder="e.g., Hey! How have you been? Just wanted to catch up..."
              placeholderTextColor={COLORS.textLight}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* Notifications Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          
          <TouchableOpacity 
            style={styles.settingItem}
            onPress={() => setSettings({ ...settings, notifications_enabled: !settings.notifications_enabled })}
          >
            <View style={styles.settingIcon}>
              <Ionicons name="notifications-outline" size={22} color={COLORS.primary} />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingLabel}>Enable Notifications</Text>
              <Text style={styles.settingValue}>
                {settings.notifications_enabled ? 'On' : 'Off'}
              </Text>
            </View>
            <View style={[styles.toggle, settings.notifications_enabled && styles.toggleActive]}>
              <View style={[styles.toggleThumb, settings.notifications_enabled && styles.toggleThumbActive]} />
            </View>
          </TouchableOpacity>

          <View style={styles.settingItem}>
            <View style={styles.settingIcon}>
              <Ionicons name="time-outline" size={22} color={COLORS.primary} />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingLabel}>Morning Briefing Time</Text>
              <TextInput
                style={styles.timeInput}
                value={settings.notification_time}
                onChangeText={(text) => setSettings({ ...settings, notification_time: text })}
                placeholder="09:00"
                placeholderTextColor={COLORS.textLight}
              />
            </View>
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingIcon}>
              <Ionicons name="information-circle-outline" size={22} color={COLORS.primary} />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingLabel}>App Version</Text>
              <Text style={styles.settingValue}>2.0.0</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* UI Language Modal */}
      <Modal visible={showLanguageModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select App Language</Text>
            
            {UI_LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[styles.modalOption, settings.ui_language === lang.code && styles.modalOptionActive]}
                onPress={() => {
                  setSettings({ ...settings, ui_language: lang.code });
                  setShowLanguageModal(false);
                }}
              >
                <Text style={[styles.modalOptionText, settings.ui_language === lang.code && styles.modalOptionTextActive]}>
                  {lang.name}
                </Text>
                {settings.ui_language === lang.code && (
                  <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
                )}
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowLanguageModal(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Draft Language Modal */}
      <Modal visible={showDraftLanguageModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Default Draft Language</Text>
            
            <ScrollView style={{ maxHeight: 400 }}>
              {DRAFT_LANGUAGES.map((lang) => (
                <TouchableOpacity
                  key={lang}
                  style={[styles.modalOption, settings.default_draft_language === lang && styles.modalOptionActive]}
                  onPress={() => {
                    setSettings({ ...settings, default_draft_language: lang });
                    setShowDraftLanguageModal(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, settings.default_draft_language === lang && styles.modalOptionTextActive]}>
                    {lang}
                  </Text>
                  {settings.default_draft_language === lang && (
                    <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowDraftLanguageModal(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.text,
  },
  saveButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
  content: {
    flex: 1,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textLight,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  settingItemColumn: {
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingContent: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.text,
  },
  settingValue: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 2,
  },
  settingHint: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 8,
    marginBottom: 12,
    lineHeight: 18,
  },
  settingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  textArea: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: COLORS.text,
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  timeInput: {
    fontSize: 14,
    color: COLORS.text,
    marginTop: 4,
    paddingVertical: 4,
  },
  toggle: {
    width: 52,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.border,
    padding: 2,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: COLORS.success,
  },
  toggleThumb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: COLORS.background,
  },
  modalOptionActive: {
    backgroundColor: COLORS.primary + '15',
  },
  modalOptionText: {
    fontSize: 16,
    color: COLORS.text,
  },
  modalOptionTextActive: {
    fontWeight: '600',
    color: COLORS.primary,
  },
  modalCloseButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: COLORS.background,
    marginTop: 8,
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textLight,
  },
});
