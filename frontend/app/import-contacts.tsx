import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
  Image,
  Animated,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { LinearGradient } from 'expo-linear-gradient';
import { importPhoneContacts, formatContactForCRM, ImportedContact } from '../services/contactImportService';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

// Force refresh v2
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
  successLight: '#D1FAE5',
  warning: '#F59E0B',
};

export default function ImportContacts() {
  const router = useRouter();
  const { token } = useAuth();
  const { t } = useLanguage();
  const [importing, setImporting] = useState(false);
  const [importedContacts, setImportedContacts] = useState<ImportedContact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<number>>(new Set());
  const [step, setStep] = useState<'start' | 'select' | 'importing' | 'complete' | 'limited'>('start');
  const [importStats, setImportStats] = useState({ total: 0, success: 0, failed: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [showLimitedWarning, setShowLimitedWarning] = useState(false);

  // API headers with auth token
  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${token}` }
  });

  const handleImportFromPhone = async () => {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Not Available on Web',
        'Contact import from phone is only available on iOS and Android devices. Please use the Expo Go app on your phone.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
      return;
    }

    setImporting(true);
    try {
      const contacts = await importPhoneContacts();
      
      // Check if we got very few contacts (likely limited access)
      if (contacts.length < 20 && Platform.OS === 'ios') {
        setShowLimitedWarning(true);
      }
      
      setImportedContacts(contacts);
      setSelectedContacts(new Set(contacts.map((_, index) => index)));
      setStep('select');
    } catch (error: any) {
      Alert.alert(t('error'), error.message || 'Failed to import contacts from phone');
    } finally {
      setImporting(false);
    }
  };

  const handleOpenSettings = () => {
    Linking.openSettings();
  };

  const toggleContactSelection = (index: number) => {
    const newSelected = new Set(selectedContacts);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedContacts(newSelected);
  };

  const handleSelectAll = () => {
    const filteredIndexes = getFilteredContacts().map(fc => fc.originalIndex);
    const allFilteredSelected = filteredIndexes.every(idx => selectedContacts.has(idx));
    
    if (allFilteredSelected) {
      // Deselect all filtered
      const newSelected = new Set(selectedContacts);
      filteredIndexes.forEach(idx => newSelected.delete(idx));
      setSelectedContacts(newSelected);
    } else {
      // Select all filtered
      const newSelected = new Set(selectedContacts);
      filteredIndexes.forEach(idx => newSelected.add(idx));
      setSelectedContacts(newSelected);
    }
  };

  const handleConfirmImport = async () => {
    setStep('importing');
    const contactsToImport = Array.from(selectedContacts).map((index) =>
      formatContactForCRM(importedContacts[index])
    );

    let success = 0;
    let failed = 0;

    for (const contact of contactsToImport) {
      try {
        await axios.post(`${EXPO_PUBLIC_BACKEND_URL}/api/contacts`, contact, getAuthHeaders());
        success++;
      } catch (error) {
        console.error('Failed to import contact:', contact.name, error);
        failed++;
      }
    }

    setImportStats({ total: contactsToImport.length, success, failed });
    setStep('complete');
  };

  // Filter contacts by search query
  const getFilteredContacts = () => {
    if (!searchQuery.trim()) {
      return importedContacts.map((contact, index) => ({ ...contact, originalIndex: index }));
    }
    
    const query = searchQuery.toLowerCase();
    return importedContacts
      .map((contact, index) => ({ ...contact, originalIndex: index }))
      .filter(contact => 
        contact.name.toLowerCase().includes(query) ||
        (contact.jobTitle && contact.jobTitle.toLowerCase().includes(query)) ||
        (contact.company && contact.company.toLowerCase().includes(query)) ||
        (contact.emails && contact.emails.some(e => e.toLowerCase().includes(query))) ||
        (contact.phones && contact.phones.some(p => p.includes(query)))
      );
  };

  const filteredContacts = getFilteredContacts();
  const filteredSelectedCount = filteredContacts.filter(c => selectedContacts.has(c.originalIndex)).length;

  const renderStartScreen = () => (
    <View style={styles.centerContent}>
      {/* Animated Gradient Icon */}
      <View style={styles.iconWrapper}>
        <LinearGradient colors={[COLORS.primaryStart, COLORS.primaryEnd]} style={styles.iconGradient}>
          <Ionicons name="people" size={50} color={COLORS.surface} />
        </LinearGradient>
        <View style={styles.iconBadge}>
          <Ionicons name="cloud-download" size={20} color={COLORS.surface} />
        </View>
      </View>

      <Text style={styles.title}>Import Contacts</Text>
      <Text style={styles.description}>
        Quickly add your existing contacts to Convo and start nurturing your relationships
      </Text>

      {/* Feature Cards */}
      <View style={styles.featureCards}>
        <View style={styles.featureCard}>
          <View style={[styles.featureIcon, { backgroundColor: COLORS.primary + '20' }]}>
            <Ionicons name="phone-portrait-outline" size={24} color={COLORS.primary} />
          </View>
          <Text style={styles.featureTitle}>Phone Contacts</Text>
          <Text style={styles.featureDesc}>Import directly from your device</Text>
        </View>

        <View style={styles.featureCard}>
          <View style={[styles.featureIcon, { backgroundColor: COLORS.success + '20' }]}>
            <Ionicons name="checkmark-done-outline" size={24} color={COLORS.success} />
          </View>
          <Text style={styles.featureTitle}>Select & Search</Text>
          <Text style={styles.featureDesc}>Choose which contacts to add</Text>
        </View>

        <View style={styles.featureCard}>
          <View style={[styles.featureIcon, { backgroundColor: COLORS.warning + '20' }]}>
            <Ionicons name="git-branch-outline" size={24} color={COLORS.warning} />
          </View>
          <Text style={styles.featureTitle}>Auto Pipeline</Text>
          <Text style={styles.featureDesc}>Organized in "New" by default</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.importButton}
        onPress={handleImportFromPhone}
        disabled={importing}
        activeOpacity={0.8}
      >
        <LinearGradient colors={[COLORS.primaryStart, COLORS.primaryEnd]} style={styles.buttonGradient}>
          {importing ? (
            <ActivityIndicator color={COLORS.surface} />
          ) : (
            <>
              <Ionicons name="cloud-download-outline" size={24} color={COLORS.surface} />
              <Text style={styles.importButtonText}>Import from Phone</Text>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
        <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSelectScreen = () => (
    <>
      {/* Limited Access Warning */}
      {showLimitedWarning && Platform.OS === 'ios' && (
        <TouchableOpacity style={styles.limitedWarning} onPress={handleOpenSettings}>
          <View style={styles.limitedWarningContent}>
            <Ionicons name="warning" size={24} color={COLORS.warning} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.limitedWarningTitle}>Limited Contact Access</Text>
              <Text style={styles.limitedWarningText}>
                Only {importedContacts.length} contacts visible. Tap here to grant full access in Settings.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.warning} />
          </View>
        </TouchableOpacity>
      )}

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={COLORS.textLight} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('search') + ' ' + t('contacts').toLowerCase() + '...'}
          placeholderTextColor={COLORS.textLight}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={COLORS.textLight} />
          </TouchableOpacity>
        )}
      </View>

      {/* Selection Header */}
      <View style={styles.selectHeader}>
        <View>
          <Text style={styles.selectTitle}>
            {filteredSelectedCount} selected
          </Text>
          <Text style={styles.selectSubtitle}>
            {filteredContacts.length} contacts {searchQuery ? 'found' : 'total'}
          </Text>
        </View>
        <TouchableOpacity onPress={handleSelectAll} style={styles.selectAllButton}>
          <Ionicons 
            name={filteredSelectedCount === filteredContacts.length ? "checkbox" : "square-outline"} 
            size={20} 
            color={COLORS.primary} 
          />
          <Text style={styles.selectAllText}>
            {filteredSelectedCount === filteredContacts.length ? 'Deselect All' : 'Select All'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Contact List */}
      <ScrollView style={styles.contactList} showsVerticalScrollIndicator={false}>
        {filteredContacts.length === 0 ? (
          <View style={styles.emptySearch}>
            <Ionicons name="search-outline" size={48} color={COLORS.textLight} />
            <Text style={styles.emptySearchText}>No contacts found</Text>
            <Text style={styles.emptySearchHint}>Try a different search term</Text>
          </View>
        ) : (
          filteredContacts.map((contact) => {
            const isSelected = selectedContacts.has(contact.originalIndex);
            return (
              <TouchableOpacity
                key={contact.originalIndex}
                style={[styles.contactCard, isSelected && styles.contactCardSelected]}
                onPress={() => toggleContactSelection(contact.originalIndex)}
                activeOpacity={0.7}
              >
                {/* Avatar */}
                <View style={[styles.contactAvatar, isSelected && styles.contactAvatarSelected]}>
                  <Text style={[styles.contactAvatarText, isSelected && styles.contactAvatarTextSelected]}>
                    {contact.name.charAt(0).toUpperCase()}
                  </Text>
                </View>

                {/* Info */}
                <View style={styles.contactInfo}>
                  <Text style={styles.contactName} numberOfLines={1}>{contact.name}</Text>
                  {contact.jobTitle && (
                    <Text style={styles.contactDetail} numberOfLines={1}>{contact.jobTitle}</Text>
                  )}
                  {contact.company && (
                    <Text style={styles.contactDetail} numberOfLines={1}>{contact.company}</Text>
                  )}
                </View>

                {/* Checkbox */}
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                  {isSelected && <Ionicons name="checkmark" size={16} color={COLORS.surface} />}
                </View>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Action */}
      <View style={styles.bottomActions}>
        <TouchableOpacity
          style={[styles.importButton, selectedContacts.size === 0 && styles.importButtonDisabled]}
          onPress={handleConfirmImport}
          disabled={selectedContacts.size === 0}
          activeOpacity={0.8}
        >
          <LinearGradient 
            colors={selectedContacts.size === 0 ? [COLORS.textLight, COLORS.textLight] : [COLORS.primaryStart, COLORS.primaryEnd]} 
            style={styles.buttonGradient}
          >
            <Ionicons name="checkmark-circle-outline" size={24} color={COLORS.surface} />
            <Text style={styles.importButtonText}>
              Import {selectedContacts.size} {t('contacts')}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </>
  );

  const renderImportingScreen = () => (
    <View style={styles.centerContent}>
      <View style={styles.loadingWrapper}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <View style={styles.loadingProgress}>
          <View style={[styles.loadingProgressBar, { width: '60%' }]} />
        </View>
      </View>
      <Text style={styles.importingText}>Importing contacts...</Text>
      <Text style={styles.importingSubtext}>This may take a moment</Text>
    </View>
  );

  const renderCompleteScreen = () => (
    <View style={styles.centerContent}>
      <View style={styles.successWrapper}>
        <LinearGradient colors={[COLORS.success, '#34D399']} style={styles.successGradient}>
          <Ionicons name="checkmark" size={50} color={COLORS.surface} />
        </LinearGradient>
      </View>
      
      <Text style={styles.title}>Import Complete!</Text>
      
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <LinearGradient colors={[COLORS.success + '20', COLORS.success + '10']} style={styles.statCardGradient}>
            <Text style={[styles.statNumber, { color: COLORS.success }]}>{importStats.success}</Text>
            <Text style={styles.statLabel}>Imported</Text>
          </LinearGradient>
        </View>
        
        {importStats.failed > 0 && (
          <View style={styles.statCard}>
            <LinearGradient colors={[COLORS.accent + '20', COLORS.accent + '10']} style={styles.statCardGradient}>
              <Text style={[styles.statNumber, { color: COLORS.accent }]}>{importStats.failed}</Text>
              <Text style={styles.statLabel}>Failed</Text>
            </LinearGradient>
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.importButton} onPress={() => router.back()} activeOpacity={0.8}>
        <LinearGradient colors={[COLORS.primaryStart, COLORS.primaryEnd]} style={styles.buttonGradient}>
          <Text style={styles.importButtonText}>{t('done')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header with Gradient */}
      <LinearGradient colors={[COLORS.primaryStart, COLORS.primaryEnd]} style={styles.headerGradient}>
        <SafeAreaView edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="chevron-back" size={28} color={COLORS.surface} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Import {t('contacts')}</Text>
            <View style={{ width: 44 }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      {step === 'start' && renderStartScreen()}
      {step === 'select' && renderSelectScreen()}
      {step === 'importing' && renderImportingScreen()}
      {step === 'complete' && renderCompleteScreen()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  
  // Header
  headerGradient: { paddingBottom: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  backButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.surface },

  // Center Content
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  
  // Icon
  iconWrapper: { position: 'relative', marginBottom: 24 },
  iconGradient: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center' },
  iconBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.success,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: COLORS.background,
  },

  title: { fontSize: 28, fontWeight: 'bold', color: COLORS.text, marginBottom: 12, textAlign: 'center' },
  description: { fontSize: 16, color: COLORS.textLight, textAlign: 'center', marginBottom: 32, lineHeight: 24, paddingHorizontal: 20 },

  // Feature Cards
  featureCards: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 32, gap: 12 },
  featureCard: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  featureIcon: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  featureTitle: { fontSize: 12, fontWeight: '700', color: COLORS.text, textAlign: 'center', marginBottom: 4 },
  featureDesc: { fontSize: 10, color: COLORS.textLight, textAlign: 'center' },

  // Buttons
  importButton: { width: '100%', borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  importButtonDisabled: { opacity: 0.5 },
  buttonGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 18, gap: 10 },
  importButtonText: { fontSize: 17, fontWeight: '700', color: COLORS.surface },
  cancelButton: { padding: 16 },
  cancelButtonText: { fontSize: 16, fontWeight: '600', color: COLORS.textLight },

  // Search
  searchContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, margin: 16, marginBottom: 0,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, gap: 10,
  },
  searchInput: { flex: 1, fontSize: 16, color: COLORS.text },

  // Selection Header
  selectHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, backgroundColor: COLORS.background,
  },
  selectTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  selectSubtitle: { fontSize: 13, color: COLORS.textLight, marginTop: 2 },
  selectAllButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  selectAllText: { fontSize: 14, fontWeight: '600', color: COLORS.primary },

  // Contact List
  contactList: { flex: 1 },
  emptySearch: { alignItems: 'center', paddingVertical: 60 },
  emptySearchText: { fontSize: 18, fontWeight: '600', color: COLORS.textLight, marginTop: 16 },
  emptySearchHint: { fontSize: 14, color: COLORS.textLight, marginTop: 4 },
  contactCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, marginHorizontal: 16, marginBottom: 8, padding: 14, borderRadius: 14,
    borderWidth: 2, borderColor: 'transparent',
  },
  contactCardSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '08' },
  contactAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: COLORS.border, justifyContent: 'center', alignItems: 'center',
  },
  contactAvatarSelected: { backgroundColor: COLORS.primary },
  contactAvatarText: { fontSize: 20, fontWeight: '600', color: COLORS.textLight },
  contactAvatarTextSelected: { color: COLORS.surface },
  contactInfo: { flex: 1, marginLeft: 14 },
  contactName: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  contactDetail: { fontSize: 13, color: COLORS.textLight, marginTop: 2 },
  checkbox: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: COLORS.border,
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },

  // Bottom Actions
  bottomActions: {
    padding: 16, paddingBottom: 24, backgroundColor: COLORS.surface,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },

  // Loading
  loadingWrapper: { alignItems: 'center', marginBottom: 24 },
  loadingProgress: { width: 200, height: 4, backgroundColor: COLORS.border, borderRadius: 2, marginTop: 16 },
  loadingProgressBar: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 2 },
  importingText: { fontSize: 20, fontWeight: '600', color: COLORS.text, marginTop: 16 },
  importingSubtext: { fontSize: 14, color: COLORS.textLight, marginTop: 8 },

  // Success
  successWrapper: { marginBottom: 24 },
  successGradient: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center' },
  statsContainer: { flexDirection: 'row', gap: 20, marginVertical: 24 },
  statCard: { borderRadius: 16, overflow: 'hidden' },
  statCardGradient: { paddingHorizontal: 32, paddingVertical: 20, alignItems: 'center' },
  statNumber: { fontSize: 40, fontWeight: 'bold' },
  statLabel: { fontSize: 14, color: COLORS.textLight, marginTop: 4 },

  // Limited Access Warning
  limitedWarning: {
    backgroundColor: COLORS.warning + '15',
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.warning + '30',
  },
  limitedWarningContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  limitedWarningTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.warning,
  },
  limitedWarningText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});
