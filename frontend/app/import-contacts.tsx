import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { importPhoneContacts, formatContactForCRM, ImportedContact } from '../services/contactImportService';

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const COLORS = {
  primary: '#4F46E5',
  accent: '#FF6B6B',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  text: '#1E293B',
  textLight: '#64748B',
  border: '#E2E8F0',
  success: '#10B981',
};

export default function ImportContacts() {
  const router = useRouter();
  const [importing, setImporting] = useState(false);
  const [importedContacts, setImportedContacts] = useState<ImportedContact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<number>>(new Set());
  const [step, setStep] = useState<'start' | 'select' | 'importing' | 'complete'>('start');
  const [importStats, setImportStats] = useState({ total: 0, success: 0, failed: 0 });

  const handleImportFromPhone = async () => {
    // Check if running on web
    if (Platform.OS === 'web') {
      Alert.alert(
        'Not Available on Web',
        'Contact import from phone is only available on iOS and Android devices. Please use the Expo Go app on your phone to test this feature.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
      return;
    }

    setImporting(true);
    try {
      const contacts = await importPhoneContacts();
      setImportedContacts(contacts);
      // Select all by default
      setSelectedContacts(new Set(contacts.map((_, index) => index)));
      setStep('select');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to import contacts from phone');
    } finally {
      setImporting(false);
    }
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
    if (selectedContacts.size === importedContacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(importedContacts.map((_, index) => index)));
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
        await axios.post(`${EXPO_PUBLIC_BACKEND_URL}/api/contacts`, contact);
        success++;
      } catch (error) {
        console.error('Failed to import contact:', contact.name, error);
        failed++;
      }
    }

    setImportStats({ total: contactsToImport.length, success, failed });
    setStep('complete');
  };

  const renderStartScreen = () => (
    <View style={styles.centerContent}>
      <View style={styles.iconContainer}>
        <Ionicons name="people-circle" size={80} color={COLORS.primary} />
      </View>
      <Text style={styles.title}>Import Contacts</Text>
      <Text style={styles.description}>
        Quickly add your existing contacts to SynchroConnectr and start managing your relationships
      </Text>

      <View style={styles.featureList}>
        <View style={styles.featureItem}>
          <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
          <Text style={styles.featureText}>Import from phone contacts</Text>
        </View>
        <View style={styles.featureItem}>
          <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
          <Text style={styles.featureText}>Select which contacts to add</Text>
        </View>
        <View style={styles.featureItem}>
          <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
          <Text style={styles.featureText}>Automatically organized in Monthly pipeline</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={handleImportFromPhone}
        disabled={importing}
      >
        {importing ? (
          <ActivityIndicator color={COLORS.surface} />
        ) : (
          <>
            <Ionicons name="download" size={20} color={COLORS.surface} />
            <Text style={styles.primaryButtonText}>Import from Phone</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryButton} onPress={() => router.back()}>
        <Text style={styles.secondaryButtonText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSelectScreen = () => (
    <>
      <View style={styles.selectHeader}>
        <Text style={styles.selectTitle}>
          {selectedContacts.size} of {importedContacts.length} selected
        </Text>
        <TouchableOpacity onPress={handleSelectAll}>
          <Text style={styles.selectAllText}>
            {selectedContacts.size === importedContacts.length ? 'Deselect All' : 'Select All'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.contactList}>
        {importedContacts.map((contact, index) => {
          const isSelected = selectedContacts.has(index);
          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.contactItem,
                isSelected && styles.contactItemSelected,
              ]}
              onPress={() => toggleContactSelection(index)}
            >
              <View style={styles.checkbox}>
                {isSelected && (
                  <Ionicons name="checkmark" size={18} color={COLORS.surface} />
                )}
              </View>
              <View style={styles.contactInfo}>
                <Text style={styles.contactName}>{contact.name}</Text>
                {contact.jobTitle && (
                  <Text style={styles.contactDetail}>{contact.jobTitle}</Text>
                )}
                {contact.company && (
                  <Text style={styles.contactDetail}>{contact.company}</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.bottomActions}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleConfirmImport}
          disabled={selectedContacts.size === 0}
        >
          <Text style={styles.primaryButtonText}>
            Import {selectedContacts.size} Contact{selectedContacts.size !== 1 ? 's' : ''}
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const renderImportingScreen = () => (
    <View style={styles.centerContent}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={styles.importingText}>Importing contacts...</Text>
      <Text style={styles.importingSubtext}>This may take a moment</Text>
    </View>
  );

  const renderCompleteScreen = () => (
    <View style={styles.centerContent}>
      <View style={styles.successIcon}>
        <Ionicons name="checkmark-circle" size={80} color={COLORS.success} />
      </View>
      <Text style={styles.title}>Import Complete!</Text>
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{importStats.success}</Text>
          <Text style={styles.statLabel}>Imported</Text>
        </View>
        {importStats.failed > 0 && (
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: COLORS.accent }]}>
              {importStats.failed}
            </Text>
            <Text style={styles.statLabel}>Failed</Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => router.back()}
      >
        <Text style={styles.primaryButtonText}>Done</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Import Contacts</Text>
        <View style={{ width: 40 }} />
      </View>

      {step === 'start' && renderStartScreen()}
      {step === 'select' && renderSelectScreen()}
      {step === 'importing' && renderImportingScreen()}
      {step === 'complete' && renderCompleteScreen()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
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
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  iconContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: COLORS.textLight,
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 20,
    lineHeight: 22,
  },
  featureList: {
    width: '100%',
    marginBottom: 32,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  featureText: {
    fontSize: 16,
    color: COLORS.text,
    marginLeft: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: COLORS.background,
    paddingVertical: 16,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  secondaryButtonText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  selectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  selectTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  selectAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  contactList: {
    flex: 1,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  contactItemSelected: {
    backgroundColor: COLORS.primary + '10',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  contactDetail: {
    fontSize: 14,
    color: COLORS.textLight,
  },
  bottomActions: {
    padding: 16,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  importingText: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 16,
  },
  importingSubtext: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 8,
  },
  successIcon: {
    marginBottom: 24,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 32,
    marginVertical: 24,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.success,
  },
  statLabel: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 4,
  },
});
