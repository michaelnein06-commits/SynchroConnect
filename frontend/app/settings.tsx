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
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Premium Color Palette
const COLORS = {
  primaryStart: '#6366F1',
  primaryEnd: '#8B5CF6',
  primary: '#6366F1',
  primaryLight: '#A5B4FC',
  accent: '#F43F5E',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#475569',
  textLight: '#94A3B8',
  border: '#E2E8F0',
  success: '#10B981',
  warning: '#F59E0B',
};

// Translations
const TRANSLATIONS: { [key: string]: { [key: string]: string } } = {
  en: {
    settings: 'Settings',
    save: 'Save',
    localization: 'Localization',
    appLanguage: 'App Language',
    defaultDraftLanguage: 'Default Draft Language',
    aiMessageDrafting: 'AI Message Drafting',
    defaultWritingStyle: 'Default Writing Style',
    writingStyleHint: 'This example helps AI learn your general writing style. Can be overridden per contact.',
    writingStylePlaceholder: 'e.g., Hey! How have you been? Just wanted to catch up...',
    notifications: 'Notifications',
    enableNotifications: 'Enable Notifications',
    morningBriefingTime: 'Morning Briefing Time',
    about: 'About',
    appVersion: 'App Version',
    cancel: 'Cancel',
    selectLanguage: 'Select App Language',
    selectDraftLanguage: 'Default Draft Language',
    settingsSaved: 'Settings saved successfully',
    error: 'Error',
    failedToSave: 'Failed to save settings',
    on: 'On',
    off: 'Off',
  },
  de: {
    settings: 'Einstellungen',
    save: 'Speichern',
    localization: 'Sprache',
    appLanguage: 'App-Sprache',
    defaultDraftLanguage: 'Standard Entwurfssprache',
    aiMessageDrafting: 'KI-Nachrichtenentwürfe',
    defaultWritingStyle: 'Standard Schreibstil',
    writingStyleHint: 'Dieses Beispiel hilft der KI, deinen allgemeinen Schreibstil zu lernen. Kann pro Kontakt überschrieben werden.',
    writingStylePlaceholder: 'z.B., Hey! Wie gehts dir? Wollte mal nachfragen...',
    notifications: 'Benachrichtigungen',
    enableNotifications: 'Benachrichtigungen aktivieren',
    morningBriefingTime: 'Morgenbriefing Zeit',
    about: 'Über',
    appVersion: 'App-Version',
    cancel: 'Abbrechen',
    selectLanguage: 'App-Sprache wählen',
    selectDraftLanguage: 'Standard Entwurfssprache',
    settingsSaved: 'Einstellungen erfolgreich gespeichert',
    error: 'Fehler',
    failedToSave: 'Einstellungen konnten nicht gespeichert werden',
    on: 'An',
    off: 'Aus',
  },
};

const UI_LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
];

const DRAFT_LANGUAGES = [
  { name: 'English', flag: '🇬🇧' },
  { name: 'German', flag: '🇩🇪' },
  { name: 'Spanish', flag: '🇪🇸' },
  { name: 'French', flag: '🇫🇷' },
  { name: 'Italian', flag: '🇮🇹' },
  { name: 'Portuguese', flag: '🇵🇹' },
  { name: 'Dutch', flag: '🇳🇱' },
  { name: 'Russian', flag: '🇷🇺' },
  { name: 'Chinese', flag: '🇨🇳' },
  { name: 'Japanese', flag: '🇯🇵' },
];

export default function Settings() {
  const router = useRouter();
  const { token, updateUser } = useAuth();
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

  // Get translation based on current language
  const t = (key: string) => {
    return TRANSLATIONS[settings.ui_language]?.[key] || TRANSLATIONS['en'][key] || key;
  };

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
    Keyboard.dismiss();
    setSaving(true);
    try {
      await axios.put(`${EXPO_PUBLIC_BACKEND_URL}/api/profile`, settings, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Update user context with new language
      await updateUser({ ui_language: settings.ui_language } as any);
      Alert.alert('✓', t('settingsSaved'));
    } catch (error) {
      Alert.alert(t('error'), t('failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  const getLanguageInfo = (code: string) => {
    return UI_LANGUAGES.find(l => l.code === code) || UI_LANGUAGES[0];
  };

  const getDraftLanguageFlag = (name: string) => {
    return DRAFT_LANGUAGES.find(l => l.name === name)?.flag || '🌐';
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient colors={[COLORS.primaryStart, COLORS.primaryEnd]} style={styles.loadingGradient}>
          <ActivityIndicator size="large" color={COLORS.surface} />
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with Gradient */}
      <LinearGradient colors={[COLORS.primaryStart, COLORS.primaryEnd]} style={styles.headerGradient}>
        <SafeAreaView edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="chevron-back" size={28} color={COLORS.surface} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('settings')}</Text>
            <TouchableOpacity onPress={saveSettings} disabled={saving} style={styles.saveButton}>
              {saving ? (
                <ActivityIndicator color={COLORS.surface} size="small" />
              ) : (
                <View style={styles.savePill}>
                  <Ionicons name="checkmark" size={18} color={COLORS.surface} />
                  <Text style={styles.savePillText}>{t('save')}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ flex: 1 }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView 
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Localization Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconWrapper}>
                  <Ionicons name="globe-outline" size={18} color={COLORS.primary} />
                </View>
                <Text style={styles.sectionTitle}>{t('localization')}</Text>
              </View>
              
              {/* App UI Language */}
              <TouchableOpacity 
                style={styles.settingCard}
                onPress={() => setShowLanguageModal(true)}
                activeOpacity={0.7}
              >
                <View style={styles.settingCardContent}>
                  <Text style={styles.settingLabel}>{t('appLanguage')}</Text>
                  <View style={styles.languageValue}>
                    <Text style={styles.languageFlag}>{getLanguageInfo(settings.ui_language).flag}</Text>
                    <Text style={styles.languageText}>{getLanguageInfo(settings.ui_language).name}</Text>
                    <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
                  </View>
                </View>
              </TouchableOpacity>

              {/* Default Draft Language */}
              <TouchableOpacity 
                style={styles.settingCard}
                onPress={() => setShowDraftLanguageModal(true)}
                activeOpacity={0.7}
              >
                <View style={styles.settingCardContent}>
                  <Text style={styles.settingLabel}>{t('defaultDraftLanguage')}</Text>
                  <View style={styles.languageValue}>
                    <Text style={styles.languageFlag}>{getDraftLanguageFlag(settings.default_draft_language)}</Text>
                    <Text style={styles.languageText}>{settings.default_draft_language}</Text>
                    <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
                  </View>
                </View>
              </TouchableOpacity>
            </View>

            {/* AI Settings Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIconWrapper, { backgroundColor: COLORS.warning + '20' }]}>
                  <Ionicons name="sparkles-outline" size={18} color={COLORS.warning} />
                </View>
                <Text style={styles.sectionTitle}>{t('aiMessageDrafting')}</Text>
              </View>
              
              <View style={styles.settingCardLarge}>
                <Text style={styles.settingLabel}>{t('defaultWritingStyle')}</Text>
                <Text style={styles.settingHint}>{t('writingStyleHint')}</Text>
                <TextInput
                  style={styles.textArea}
                  value={settings.default_writing_style}
                  onChangeText={(text) => setSettings({ ...settings, default_writing_style: text })}
                  placeholder={t('writingStylePlaceholder')}
                  placeholderTextColor={COLORS.textLight}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>
            </View>

            {/* Notifications Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIconWrapper, { backgroundColor: COLORS.accent + '20' }]}>
                  <Ionicons name="notifications-outline" size={18} color={COLORS.accent} />
                </View>
                <Text style={styles.sectionTitle}>{t('notifications')}</Text>
              </View>
              
              <TouchableOpacity 
                style={styles.settingCard}
                onPress={() => setSettings({ ...settings, notifications_enabled: !settings.notifications_enabled })}
                activeOpacity={0.7}
              >
                <View style={styles.settingCardContent}>
                  <View>
                    <Text style={styles.settingLabel}>{t('enableNotifications')}</Text>
                    <Text style={styles.settingValue}>
                      {settings.notifications_enabled ? t('on') : t('off')}
                    </Text>
                  </View>
                  <View style={[styles.toggle, settings.notifications_enabled && styles.toggleActive]}>
                    <View style={[styles.toggleThumb, settings.notifications_enabled && styles.toggleThumbActive]} />
                  </View>
                </View>
              </TouchableOpacity>

              <View style={styles.settingCard}>
                <View style={styles.settingCardContent}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingLabel}>{t('morningBriefingTime')}</Text>
                    <TextInput
                      style={styles.timeInput}
                      value={settings.notification_time}
                      onChangeText={(text) => setSettings({ ...settings, notification_time: text })}
                      placeholder="09:00"
                      placeholderTextColor={COLORS.textLight}
                    />
                  </View>
                  <Ionicons name="time-outline" size={24} color={COLORS.textLight} />
                </View>
              </View>
            </View>

            {/* About Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIconWrapper, { backgroundColor: COLORS.success + '20' }]}>
                  <Ionicons name="information-circle-outline" size={18} color={COLORS.success} />
                </View>
                <Text style={styles.sectionTitle}>{t('about')}</Text>
              </View>
              
              <View style={styles.settingCard}>
                <View style={styles.settingCardContent}>
                  <Text style={styles.settingLabel}>{t('appVersion')}</Text>
                  <View style={styles.versionBadge}>
                    <Text style={styles.versionText}>2.0.0</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* UI Language Modal */}
      <Modal visible={showLanguageModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t('selectLanguage')}</Text>
            
            {UI_LANGUAGES.map((lang) => {
              const isSelected = settings.ui_language === lang.code;
              return (
                <TouchableOpacity
                  key={lang.code}
                  style={[styles.languageOption, isSelected && styles.languageOptionSelected]}
                  onPress={() => {
                    setSettings({ ...settings, ui_language: lang.code });
                    setShowLanguageModal(false);
                  }}
                >
                  <Text style={styles.optionFlag}>{lang.flag}</Text>
                  <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                    {lang.name}
                  </Text>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
                  )}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowLanguageModal(false)}>
              <Text style={styles.modalCloseText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Draft Language Modal */}
      <Modal visible={showDraftLanguageModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t('selectDraftLanguage')}</Text>
            
            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              {DRAFT_LANGUAGES.map((lang) => {
                const isSelected = settings.default_draft_language === lang.name;
                return (
                  <TouchableOpacity
                    key={lang.name}
                    style={[styles.languageOption, isSelected && styles.languageOptionSelected]}
                    onPress={() => {
                      setSettings({ ...settings, default_draft_language: lang.name });
                      setShowDraftLanguageModal(false);
                    }}
                  >
                    <Text style={styles.optionFlag}>{lang.flag}</Text>
                    <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                      {lang.name}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowDraftLanguageModal(false)}>
              <Text style={styles.modalCloseText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1 },
  loadingGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  // Header
  headerGradient: { paddingBottom: 20 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  backButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.surface },
  saveButton: { width: 80, alignItems: 'flex-end' },
  savePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  savePillText: { fontSize: 14, fontWeight: '600', color: COLORS.surface },
  
  // Content
  content: { flex: 1 },
  contentContainer: { paddingTop: 8 },
  
  // Section
  section: { marginTop: 24, paddingHorizontal: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  sectionIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  
  // Setting Cards
  settingCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  settingCardLarge: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  settingCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingLabel: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  settingValue: { fontSize: 14, color: COLORS.textLight, marginTop: 2 },
  settingHint: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 6,
    marginBottom: 12,
    lineHeight: 18,
  },
  
  // Language Value
  languageValue: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  languageFlag: { fontSize: 22 },
  languageText: { fontSize: 15, color: COLORS.textSecondary },
  
  // Text Area
  textArea: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: COLORS.text,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  
  // Time Input
  timeInput: {
    fontSize: 15,
    color: COLORS.text,
    marginTop: 4,
    paddingVertical: 4,
  },
  
  // Toggle
  toggle: {
    width: 52,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.border,
    padding: 2,
    justifyContent: 'center',
  },
  toggleActive: { backgroundColor: COLORS.success },
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
  toggleThumbActive: { alignSelf: 'flex-end' },
  
  // Version Badge
  versionBadge: {
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  versionText: { fontSize: 14, fontWeight: '600', color: COLORS.primary },
  
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 20,
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    marginBottom: 8,
    backgroundColor: COLORS.background,
    gap: 12,
  },
  languageOptionSelected: { backgroundColor: COLORS.success + '15' },
  optionFlag: { fontSize: 26 },
  optionText: { flex: 1, fontSize: 17, color: COLORS.text },
  optionTextSelected: { fontWeight: '600', color: COLORS.success },
  modalCloseButton: {
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: COLORS.background,
    marginTop: 8,
  },
  modalCloseText: { fontSize: 16, fontWeight: '600', color: COLORS.textLight },
});
