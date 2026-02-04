import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert, TextInput, Image, Dimensions, Modal, Pressable, FlatList, Platform, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import ContactImportPrompt from '../components/ContactImportPrompt';
import * as ImagePicker from 'expo-image-picker';
import ContactSyncService from '../services/ContactSyncService';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

// Safe haptics wrapper
const triggerHaptic = async (type: 'light' | 'medium' | 'success' = 'light') => {
  try {
    const Haptics = await import('expo-haptics');
    if (type === 'success') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (type === 'medium') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch (e) {
    // Haptics not available
  }
};

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COLORS = {
  // Primary colors with gradient support
  primary: '#6366F1',
  primaryDark: '#4F46E5',
  primaryLight: '#A5B4FC',
  primaryGradient: ['#6366F1', '#8B5CF6'] as const,
  
  // Accent colors
  accent: '#F43F5E',
  accentLight: '#FDA4AF',
  accentGradient: ['#F43F5E', '#FB7185'] as const,
  
  // Success/Warning
  success: '#10B981',
  successLight: '#D1FAE5',
  successGradient: ['#10B981', '#34D399'] as const,
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  
  // Neutrals - Enhanced
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#475569',
  textLight: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  
  // Pipeline stage colors - More vibrant
  new: '#3B82F6',
  weekly: '#8B5CF6',
  biweekly: '#06B6D4',
  monthly: '#10B981',
  quarterly: '#F59E0B',
  annually: '#EC4899',
  
  // Shadow color
  shadow: '#6366F1',
};

// Get color for pipeline stage
const getStageColor = (stage: string) => {
  switch (stage) {
    case 'New': return COLORS.new;
    case 'Weekly': return COLORS.weekly;
    case 'Bi-Weekly': return COLORS.biweekly;
    case 'Monthly': return COLORS.monthly;
    case 'Quarterly': return COLORS.quarterly;
    case 'Annually': return COLORS.annually;
    default: return COLORS.primary;
  }
};

// Get gradient colors for stage
const getStageGradient = (stage: string) => {
  switch (stage) {
    case 'New': return ['#3B82F6', '#60A5FA'];
    case 'Weekly': return ['#8B5CF6', '#A78BFA'];
    case 'Bi-Weekly': return ['#06B6D4', '#22D3EE'];
    case 'Monthly': return ['#10B981', '#34D399'];
    case 'Quarterly': return ['#F59E0B', '#FBBF24'];
    case 'Annually': return ['#EC4899', '#F472B6'];
    default: return [COLORS.primary, COLORS.primaryLight];
  }
};

const PIPELINE_STAGES = ['New', 'Weekly', 'Bi-Weekly', 'Monthly', 'Quarterly', 'Annually'];

type Tab = 'pipeline' | 'contacts' | 'groups' | 'drafts' | 'profile';

interface Contact {
  id: string;
  name: string;
  job?: string;
  pipeline_stage: string;
  next_due?: string;
  notes?: string;
  profile_picture?: string;
  groups?: string[];
  phone?: string;
  email?: string;
  language?: string;
  tone?: string;
}

interface Draft {
  id: string;
  contact_id: string;
  contact_name: string;
  draft_message: string;
  created_at: string;
}

interface Group {
  id: string;
  name: string;
  description?: string;
  profile_picture?: string;
}

export default function Index() {
  const router = useRouter();
  const { user, token, logout } = useAuth();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<Tab>('pipeline');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStage, setSelectedStage] = useState('Monthly');
  const [showImportPrompt, setShowImportPrompt] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  // Move modal state
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  // Add contacts to group modal
  const [showAddContactsModal, setShowAddContactsModal] = useState(false);
  const [selectedGroupForContacts, setSelectedGroupForContacts] = useState<Group | null>(null);
  const [selectedContactsForGroup, setSelectedContactsForGroup] = useState<string[]>([]);
  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<string | null>(null);

  // API headers with auth token
  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${token}` }
  });

  // Contact Sync Service
  const syncService = token ? new ContactSyncService(token) : null;

  // Full Two-Way Sync (iPhone ↔ App)
  const performFullSync = async () => {
    if (!syncService || isSyncing) return;
    
    setIsSyncing(true);
    try {
      const result = await syncService.performFullSync();
      await fetchContacts();
      
      const messages = [];
      if (result.imported > 0) messages.push(`${result.imported} imported from iPhone`);
      if (result.updated > 0) messages.push(`${result.updated} updated from iPhone`);
      if (result.syncedBack > 0) messages.push(`${result.syncedBack} synced to iPhone`);
      
      const message = messages.length > 0 
        ? `✓ ${messages.join(', ')}` 
        : 'All contacts are already in sync';
      setLastSyncResult(message);
      
      Alert.alert('Two-Way Sync Complete', message);
      
      if (result.errors.length > 0) {
        console.warn('Sync errors:', result.errors);
      }
    } catch (error) {
      console.error('Full sync error:', error);
      Alert.alert(t('error'), 'Failed to perform two-way sync');
    } finally {
      setIsSyncing(false);
    }
  };

  // Sync app contacts TO device (App → iPhone)
  const syncToDevice = async () => {
    if (!syncService || isSyncing) return;
    
    setIsSyncing(true);
    try {
      const result = await syncService.syncAppToDevice();
      await fetchContacts();
      
      const total = result.synced + result.created;
      const message = total > 0 
        ? `✓ Updated ${result.synced}, created ${result.created} contacts on iPhone` 
        : 'All contacts are already synced to iPhone';
      setLastSyncResult(message);
      
      Alert.alert('App → iPhone Complete', message);
      
      if (result.errors.length > 0) {
        console.warn('Sync errors:', result.errors);
      }
    } catch (error) {
      console.error('Sync error:', error);
      Alert.alert(t('error'), 'Failed to sync to iPhone');
    } finally {
      setIsSyncing(false);
    }
  };

  // Sync from iPhone TO app (iPhone → App)
  const syncFromDevice = async () => {
    if (!syncService || isSyncing) return;
    
    setIsSyncing(true);
    try {
      const result = await syncService.syncDeviceToApp();
      await fetchContacts();
      
      const messages = [];
      if (result.synced > 0) messages.push(`${result.synced} updated`);
      if (result.imported > 0) messages.push(`${result.imported} imported`);
      
      const message = messages.length > 0 
        ? `✓ ${messages.join(', ')} from iPhone` 
        : 'All contacts are already in sync';
      setLastSyncResult(message);
      
      Alert.alert('iPhone → App Complete', message);
      
      if (result.errors.length > 0) {
        console.warn('Sync errors:', result.errors);
      }
    } catch (error) {
      console.error('Sync error:', error);
      Alert.alert(t('error'), 'Failed to sync from iPhone');
    } finally {
      setIsSyncing(false);
    }
  };

  // Link existing app contacts with device contacts
  const linkContacts = async () => {
    if (!syncService || isSyncing) return;
    
    setIsSyncing(true);
    try {
      const result = await syncService.linkExistingContacts();
      await fetchContacts();
      
      const message = result.linked > 0 
        ? `✓ Linked ${result.linked} contacts with iPhone`
        : 'All contacts are already linked';
      setLastSyncResult(message);
      
      Alert.alert('Linking Complete', message);
    } catch (error) {
      console.error('Link error:', error);
      Alert.alert(t('error'), 'Failed to link contacts');
    } finally {
      setIsSyncing(false);
    }
  };

  const fetchContacts = async () => {
    if (!token) return;
    try {
      const response = await axios.get(`${EXPO_PUBLIC_BACKEND_URL}/api/contacts`, getAuthHeaders());
      setContacts(response.data);
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchDrafts = async () => {
    if (!token) return;
    try {
      const response = await axios.get(`${EXPO_PUBLIC_BACKEND_URL}/api/drafts`, getAuthHeaders());
      setDrafts(response.data);
    } catch (error) {
      console.error('Error fetching drafts:', error);
    }
  };

  const fetchGroups = async () => {
    if (!token) return;
    try {
      const response = await axios.get(`${EXPO_PUBLIC_BACKEND_URL}/api/groups`, getAuthHeaders());
      setGroups(response.data || []);
    } catch (error) {
      console.error('Error fetching groups:', error);
    }
  };

  useEffect(() => {
    if (token) {
      fetchContacts();
      fetchDrafts();
      fetchGroups();
      // Don't auto-sync on startup - let user tap the sync button
      // This avoids race conditions with the contacts API
    }
  }, [token]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchContacts();
    fetchDrafts();
    fetchGroups();
    // Don't auto-sync on refresh - user can tap sync button explicitly
  };

  const handleDeleteAllContacts = () => {
    Alert.alert(
      'Delete All Contacts',
      'Are you sure you want to delete ALL contacts? This cannot be undone!',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${EXPO_PUBLIC_BACKEND_URL}/api/contacts`, getAuthHeaders());
              Alert.alert('Success', 'All contacts deleted');
              fetchContacts();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete contacts');
            }
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(t('logout'), t('logoutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('logout'),
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/auth/login');
        },
      },
    ]);
  };

  // Long press handler to show move modal
  const handleLongPressContact = (contact: Contact) => {
    triggerHaptic('medium');
    setSelectedContact(contact);
    setShowMoveModal(true);
  };

  // Move contact to different pipeline stage
  const moveContactToPipeline = async (stage: string) => {
    if (!selectedContact) return;
    try {
      await axios.post(`${EXPO_PUBLIC_BACKEND_URL}/api/contacts/${selectedContact.id}/move-pipeline`, {
        pipeline_stage: stage
      }, getAuthHeaders());
      triggerHaptic('success');
      setShowMoveModal(false);
      setSelectedContact(null);
      fetchContacts();
    } catch (error) {
      console.error('Error moving contact:', error);
      Alert.alert('Error', 'Failed to move contact');
    }
  };

  // Add or remove contact from group
  const toggleContactGroup = async (groupName: string) => {
    if (!selectedContact) return;
    try {
      const currentGroups = selectedContact.groups || [];
      const isInGroup = currentGroups.includes(groupName);
      const updatedGroups = isInGroup
        ? currentGroups.filter(g => g !== groupName)
        : [...currentGroups, groupName];
      
      await axios.put(`${EXPO_PUBLIC_BACKEND_URL}/api/contacts/${selectedContact.id}`, {
        groups: updatedGroups
      }, getAuthHeaders());
      
      triggerHaptic('light');
      // Update local state
      setContacts(contacts.map(c => 
        c.id === selectedContact.id ? { ...c, groups: updatedGroups } : c
      ));
      setSelectedContact({ ...selectedContact, groups: updatedGroups });
    } catch (error) {
      console.error('Error updating contact group:', error);
      Alert.alert('Error', 'Failed to update group');
    }
  };

  // Add contacts to a group
  const handleAddContactsToGroup = async () => {
    if (!selectedGroupForContacts || selectedContactsForGroup.length === 0) return;
    try {
      // Update each selected contact to add this group
      for (const contactId of selectedContactsForGroup) {
        const contact = contacts.find(c => c.id === contactId);
        if (contact) {
          const updatedGroups = contact.groups?.includes(selectedGroupForContacts.id)
            ? contact.groups
            : [...(contact.groups || []), selectedGroupForContacts.id];
          
          await axios.put(`${EXPO_PUBLIC_BACKEND_URL}/api/contacts/${contactId}`, {
            groups: updatedGroups
          }, getAuthHeaders());
        }
      }
      
      triggerHaptic('success');
      setShowAddContactsModal(false);
      setSelectedGroupForContacts(null);
      setSelectedContactsForGroup([]);
      fetchContacts();
      fetchGroups();
      Alert.alert('✓', `Added ${selectedContactsForGroup.length} contacts to ${selectedGroupForContacts.name}`);
    } catch (error) {
      console.error('Error adding contacts to group:', error);
      Alert.alert('Error', 'Failed to add contacts to group');
    }
  };

  const getDaysUntilDue = (nextDue?: string) => {
    if (!nextDue) return null;
    const due = new Date(nextDue);
    const now = new Date();
    const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const generateDraft = async (contactId: string, contactName: string) => {
    try {
      await axios.post(`${EXPO_PUBLIC_BACKEND_URL}/api/drafts/generate/${contactId}`, {}, getAuthHeaders());
      Alert.alert('Success', `AI draft generated for ${contactName}!`);
      fetchDrafts();
      setActiveTab('drafts');
    } catch (error) {
      Alert.alert('Error', 'Failed to generate draft');
    }
  };

  const filteredContacts = contacts.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.job && c.job.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const renderContactCard = (contact: Contact, showDraftButton = true, isDraggable = false) => {
    const daysUntil = getDaysUntilDue(contact.next_due);
    const isOverdue = daysUntil !== null && daysUntil < 0;
    const isNewContact = contact.pipeline_stage === 'New';

    return (
      <TouchableOpacity
        key={contact.id}
        style={[styles.contactCard, isOverdue && !isNewContact && styles.contactCardOverdue]}
        onPress={() => router.push(`/contact/${contact.id}`)}
        onLongPress={() => handleLongPressContact(contact)}
        delayLongPress={300}
      >
        <View style={styles.contactCardHeader}>
          {contact.profile_picture ? (
            <Image source={{ uri: contact.profile_picture }} style={styles.contactAvatar} />
          ) : (
            <View style={styles.contactAvatarPlaceholder}>
              <Text style={styles.contactAvatarText}>{contact.name.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.contactName}>{contact.name}</Text>
            {contact.job && <Text style={styles.contactJob}>{contact.job}</Text>}
            {contact.phone && <Text style={styles.contactPhone}>{contact.phone}</Text>}
            {activeTab === 'contacts' && <Text style={styles.contactStage}>{contact.pipeline_stage}</Text>}
            {contact.groups && contact.groups.length > 0 && (
              <Text style={styles.contactGroups}>{contact.groups.join(', ')}</Text>
            )}
          </View>
          {showDraftButton && (
            <TouchableOpacity
              style={styles.draftButton}
              onPress={() => generateDraft(contact.id, contact.name)}
            >
              <Ionicons name="sparkles" size={16} color={COLORS.primary} />
            </TouchableOpacity>
          )}
        </View>
        {/* Don't show countdown for "New" stage contacts */}
        {daysUntil !== null && activeTab === 'pipeline' && !isNewContact && (
          <View style={styles.dueBadge}>
            <Text style={styles.dueText}>
              {isOverdue ? `${Math.abs(daysUntil)}d overdue` : `Due in ${daysUntil}d`}
            </Text>
          </View>
        )}
        {/* Show "New" badge instead */}
        {isNewContact && activeTab === 'pipeline' && (
          <View style={[styles.dueBadge, { backgroundColor: COLORS.new + '20' }]}>
            <Text style={[styles.dueText, { color: COLORS.new }]}>New - Assign to pipeline</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // Handle drag end - move contact to new pipeline stage
  const handleDragEnd = async (contact: Contact, newStage: string) => {
    if (contact.pipeline_stage === newStage) return;
    
    try {
      await axios.post(`${EXPO_PUBLIC_BACKEND_URL}/api/contacts/${contact.id}/move-pipeline`, {
        pipeline_stage: newStage
      }, getAuthHeaders());
      triggerHaptic('success');
      fetchContacts();
    } catch (error) {
      console.error('Error moving contact:', error);
      Alert.alert('Error', 'Failed to move contact');
    }
  };

  // Render a contact card for the pipeline with fancy styling
  const renderPipelineContactCard = (contact: Contact, index: number) => {
    const daysUntil = getDaysUntilDue(contact.next_due);
    const isOverdue = daysUntil !== null && daysUntil < 0;
    const isNewContact = contact.pipeline_stage === 'New';
    const stageColor = getStageColor(selectedStage);

    return (
      <TouchableOpacity
        key={contact.id}
        activeOpacity={0.8}
        onLongPress={() => handleLongPressContact(contact)}
        onPress={() => router.push(`/contact/${contact.id}`)}
        delayLongPress={200}
        style={[
          styles.pipelineCard,
          { borderLeftColor: stageColor },
          isOverdue && !isNewContact && styles.pipelineCardOverdue,
        ]}
      >
        <View style={styles.pipelineCardContent}>
          {contact.profile_picture ? (
            <Image source={{ uri: contact.profile_picture }} style={styles.pipelineAvatar} />
          ) : (
            <View style={[styles.pipelineAvatarPlaceholder, { backgroundColor: stageColor + '20' }]}>
              <Text style={[styles.pipelineAvatarText, { color: stageColor }]}>
                {contact.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.pipelineCardInfo}>
            <Text style={styles.pipelineCardName} numberOfLines={1}>{contact.name}</Text>
            {contact.job && (
              <Text style={styles.pipelineCardJob} numberOfLines={1}>{contact.job}</Text>
            )}
            {contact.groups && contact.groups.length > 0 && (
              <View style={styles.pipelineTagsRow}>
                {contact.groups.slice(0, 2).map((group, idx) => (
                  <View key={idx} style={[styles.pipelineTag, { backgroundColor: stageColor + '15' }]}>
                    <Text style={[styles.pipelineTagText, { color: stageColor }]}>{group}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          <View style={styles.pipelineCardRight}>
            {/* Only show countdown for non-New contacts */}
            {daysUntil !== null && !isNewContact && (
              <View style={[
                styles.pipelineDueBadge,
                isOverdue ? styles.pipelineDueOverdue : styles.pipelineDueOk
              ]}>
                <Ionicons 
                  name={isOverdue ? "alert-circle" : "time-outline"} 
                  size={12} 
                  color={isOverdue ? COLORS.accent : COLORS.success} 
                />
                <Text style={[
                  styles.pipelineDueText,
                  isOverdue ? styles.pipelineDueTextOverdue : styles.pipelineDueTextOk
                ]}>
                  {isOverdue ? `${Math.abs(daysUntil)}d` : `${daysUntil}d`}
                </Text>
              </View>
            )}
            {/* Show "Assign" badge for new contacts */}
            {isNewContact && (
              <View style={[styles.pipelineDueBadge, { backgroundColor: COLORS.new + '20' }]}>
                <Ionicons name="arrow-forward-outline" size={12} color={COLORS.new} />
                <Text style={[styles.pipelineDueText, { color: COLORS.new }]}>Assign</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderPipeline = () => {
    const stageContacts = contacts.filter(c => c.pipeline_stage === selectedStage);
    const stageColor = getStageColor(selectedStage);
    // Don't count "New" contacts as overdue
    const overdueCount = stageContacts.filter(c => {
      if (c.pipeline_stage === 'New') return false;
      const days = getDaysUntilDue(c.next_due);
      return days !== null && days < 0;
    }).length;

    return (
      <View style={styles.pipelineContainer}>
        {/* Fancy Stage Selector */}
        <View style={styles.pipelineHeader}>
          <Text style={styles.pipelineTitle}>Pipeline</Text>
          <View style={styles.pipelineStats}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{contacts.length}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            {overdueCount > 0 && (
              <View style={[styles.statItem, styles.statItemOverdue]}>
                <Text style={[styles.statNumber, { color: COLORS.accent }]}>{overdueCount}</Text>
                <Text style={styles.statLabel}>Overdue</Text>
              </View>
            )}
          </View>
        </View>

        {/* Stage Pills */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.stagePillsContainer}
          contentContainerStyle={styles.stagePillsContent}
        >
          {PIPELINE_STAGES.map((stage) => {
            const count = contacts.filter(c => c.pipeline_stage === stage).length;
            const isActive = selectedStage === stage;
            const color = getStageColor(stage);
            
            return (
              <TouchableOpacity
                key={stage}
                style={[
                  styles.stagePill,
                  isActive && { backgroundColor: color, borderColor: color }
                ]}
                onPress={() => setSelectedStage(stage)}
              >
                <View style={[styles.stagePillDot, { backgroundColor: isActive ? '#fff' : color }]} />
                <Text style={[
                  styles.stagePillText,
                  isActive && styles.stagePillTextActive
                ]}>
                  {stage}
                </Text>
                <View style={[
                  styles.stagePillBadge,
                  isActive && styles.stagePillBadgeActive
                ]}>
                  <Text style={[
                    styles.stagePillBadgeText,
                    isActive && styles.stagePillBadgeTextActive
                  ]}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Selected Stage Header */}
        <View style={[styles.selectedStageHeader, { backgroundColor: stageColor + '10' }]}>
          <View style={[styles.selectedStageDot, { backgroundColor: stageColor }]} />
          <Text style={[styles.selectedStageTitle, { color: stageColor }]}>{selectedStage}</Text>
          <Text style={styles.selectedStageCount}>{stageContacts.length} contacts</Text>
        </View>

        {/* Contacts List */}
        <ScrollView 
          style={styles.pipelineContactsList}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {stageContacts.length === 0 ? (
            <View style={styles.emptyPipeline}>
              <View style={[styles.emptyPipelineIcon, { backgroundColor: stageColor + '15' }]}>
                <Ionicons name="people-outline" size={40} color={stageColor} />
              </View>
              <Text style={styles.emptyPipelineTitle}>No contacts in {selectedStage}</Text>
              <Text style={styles.emptyPipelineHint}>
                Long press any contact to move them here
              </Text>
            </View>
          ) : (
            stageContacts.map((contact, index) => renderPipelineContactCard(contact, index))
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      </View>
    );
  };

  const renderContacts = () => (
    <ScrollView style={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      {filteredContacts.map((contact) => renderContactCard(contact))}
    </ScrollView>
  );

  const renderGroups = () => {
    // Filter groups by search query
    const filteredGroups = groups.filter(g => 
      g.name.toLowerCase().includes(groupSearchQuery.toLowerCase()) ||
      (g.description && g.description.toLowerCase().includes(groupSearchQuery.toLowerCase()))
    );
    
    return (
      <View style={{ flex: 1 }}>
        {/* Search bar for groups */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={COLORS.textLight} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('search') + ' ' + t('groups').toLowerCase() + '...'}
            placeholderTextColor={COLORS.textLight}
            value={groupSearchQuery}
            onChangeText={setGroupSearchQuery}
          />
        </View>
        
        <ScrollView style={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          {filteredGroups.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="albums-outline" size={64} color={COLORS.textLight} />
              <Text style={styles.emptyText}>{t('noGroupsCreated')}</Text>
              <Text style={styles.emptySubtext}>Tap + to create your first group</Text>
            </View>
          ) : (
            filteredGroups.map((group) => {
              const groupContacts = contacts.filter(c => c.groups?.includes(group.id));
              return (
                <View key={group.id} style={styles.groupCard}>
                  <TouchableOpacity
                    style={styles.groupCardHeader}
                    onPress={() => router.push(`/group/${group.id}`)}
                  >
                    {group.profile_picture ? (
                      <Image source={{ uri: group.profile_picture }} style={styles.groupAvatar} />
                    ) : (
                      <View style={[styles.groupAvatarPlaceholder, { backgroundColor: (group.color || COLORS.primary) + '20' }]}>
                        <Ionicons name="people" size={24} color={group.color || COLORS.primary} />
                      </View>
                    )}
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.groupName}>{group.name}</Text>
                      {group.description && (
                        <Text style={styles.groupDescription} numberOfLines={1}>
                          {group.description}
                        </Text>
                      )}
                      <View style={styles.groupStats}>
                        <Ionicons name="people-outline" size={14} color={COLORS.textLight} />
                        <Text style={styles.groupContactCount}>
                          {groupContacts.length} {groupContacts.length === 1 ? 'contact' : 'contacts'}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                  
                  {/* Add Contacts Button */}
                  <TouchableOpacity
                    style={styles.addContactsToGroupButton}
                    onPress={() => {
                      setSelectedGroupForContacts(group);
                      setSelectedContactsForGroup(groupContacts.map(c => c.id));
                      setShowAddContactsModal(true);
                    }}
                  >
                    <Ionicons name="person-add-outline" size={18} color={COLORS.primary} />
                    <Text style={styles.addContactsButtonText}>{t('add')} {t('contacts')}</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      </View>
    );
  };

  // Delete draft function
  const handleDeleteDraft = async (draftId: string) => {
    try {
      await axios.delete(`${EXPO_PUBLIC_BACKEND_URL}/api/drafts/${draftId}`, getAuthHeaders());
      setDrafts(drafts.filter(d => d.id !== draftId));
    } catch (error) {
      console.error('Error deleting draft:', error);
      Alert.alert(t('error'), 'Failed to delete draft');
    }
  };

  // Delete all drafts function
  const handleDeleteAllDrafts = () => {
    if (drafts.length === 0) return;
    
    Alert.alert(
      t('deleteAll'),
      'Are you sure you want to delete all drafts?',
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${EXPO_PUBLIC_BACKEND_URL}/api/drafts`, getAuthHeaders());
              setDrafts([]);
              Alert.alert('✓', 'All drafts deleted');
            } catch (error) {
              console.error('Error deleting all drafts:', error);
              Alert.alert(t('error'), 'Failed to delete drafts');
            }
          },
        },
      ]
    );
  };

  const copyDraftToClipboard = async (message: string) => {
    // @ts-ignore
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(message);
    }
    Alert.alert('✓', 'Copied to clipboard');
  };

  const renderDrafts = () => (
    <ScrollView style={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      {drafts.length > 0 && (
        <TouchableOpacity style={styles.deleteAllDraftsBtn} onPress={handleDeleteAllDrafts}>
          <Ionicons name="trash-outline" size={18} color={COLORS.accent} />
          <Text style={styles.deleteAllDraftsText}>{t('deleteAll')}</Text>
        </TouchableOpacity>
      )}
      {drafts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconWrapper}>
            <LinearGradient colors={COLORS.primaryGradient} style={styles.emptyIconGradient}>
              <Ionicons name="sparkles" size={40} color={COLORS.surface} />
            </LinearGradient>
          </View>
          <Text style={styles.emptyText}>No AI Drafts Yet</Text>
          <Text style={styles.emptySubtext}>Generate personalized message drafts for your contacts using AI</Text>
        </View>
      ) : (
        drafts.map((draft) => (
          <View key={draft.id} style={styles.draftCard}>
            <View style={styles.draftHeader}>
              <View style={styles.draftHeaderLeft}>
                <View style={styles.draftAIBadge}>
                  <Ionicons name="sparkles" size={14} color={COLORS.primary} />
                </View>
                <Text style={styles.draftContactName}>{draft.contact_name}</Text>
              </View>
              <TouchableOpacity 
                style={styles.deleteDraftBtn}
                onPress={() => handleDeleteDraft(draft.id)}
              >
                <Ionicons name="close" size={18} color={COLORS.accent} />
              </TouchableOpacity>
            </View>
            <View style={styles.draftMessageContainer}>
              <Text style={styles.draftMessage}>{draft.draft_message}</Text>
            </View>
            <View style={styles.draftActions}>
              <TouchableOpacity 
                style={styles.copyButton}
                onPress={() => copyDraftToClipboard(draft.draft_message)}
              >
                <Ionicons name="copy" size={18} color={COLORS.surface} />
                <Text style={styles.copyButtonText}>Copy to Clipboard</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
      <View style={{ height: 100 }} />
    </ScrollView>
  );

  const renderProfile = () => (
    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.profileCard}>
        {user?.picture ? (
          <Image source={{ uri: user.picture }} style={styles.profileImage} />
        ) : (
          <View style={styles.profileAvatarPlaceholder}>
            <Ionicons name="person" size={50} color={COLORS.primary} />
          </View>
        )}
        <Text style={styles.profileName}>{user?.name}</Text>
        <Text style={styles.profileEmail}>{user?.email}</Text>
        
        {/* Edit Profile Button */}
        <TouchableOpacity 
          style={styles.editProfileButton}
          onPress={() => router.push('/profile/edit')}
        >
          <Ionicons name="create-outline" size={18} color={COLORS.primary} />
          <Text style={styles.editProfileButtonText}>{t('edit')} {t('profile')}</Text>
        </TouchableOpacity>
      </View>

      {/* Sync Section */}
      <View style={styles.syncSection}>
        <Text style={styles.syncSectionTitle}>Contact Sync</Text>
        
        {/* Sync App → Device */}
        <TouchableOpacity 
          style={[styles.menuItem, styles.syncItem]} 
          onPress={syncToDevice}
          disabled={isSyncing}
        >
          <Ionicons 
            name="cloud-upload-outline" 
            size={24} 
            color={isSyncing ? COLORS.textLight : COLORS.primary} 
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.menuText, { color: isSyncing ? COLORS.textLight : COLORS.primary }]}>
              {isSyncing ? 'Syncing...' : 'App → iPhone'}
            </Text>
            <Text style={styles.syncHintText}>
              Push app changes to iPhone contacts
            </Text>
          </View>
        </TouchableOpacity>

        {/* Sync Device → App */}
        <TouchableOpacity 
          style={[styles.menuItem, styles.syncItem]} 
          onPress={syncFromDevice}
          disabled={isSyncing}
        >
          <Ionicons 
            name="cloud-download-outline" 
            size={24} 
            color={isSyncing ? COLORS.textLight : COLORS.success} 
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.menuText, { color: isSyncing ? COLORS.textLight : COLORS.success }]}>
              {isSyncing ? 'Syncing...' : 'iPhone → App'}
            </Text>
            <Text style={styles.syncHintText}>
              Pull iPhone changes to app
            </Text>
          </View>
        </TouchableOpacity>

        {lastSyncResult && (
          <Text style={styles.lastSyncText}>{lastSyncResult}</Text>
        )}
      </View>

      <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/settings')}>
        <Ionicons name="settings-outline" size={24} color={COLORS.text} />
        <Text style={styles.menuText}>{t('settings')}</Text>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/morning-briefing')}>
        <Ionicons name="sunny-outline" size={24} color={COLORS.text} />
        <Text style={styles.menuText}>{t('morningBriefing')}</Text>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/import-contacts')}>
        <Ionicons name="download-outline" size={24} color={COLORS.text} />
        <Text style={styles.menuText}>Import {t('contacts')}</Text>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
      </TouchableOpacity>

      <TouchableOpacity style={[styles.menuItem, { backgroundColor: COLORS.accent + '20' }]} onPress={handleDeleteAllContacts}>
        <Ionicons name="trash-outline" size={24} color={COLORS.accent} />
        <Text style={[styles.menuText, { color: COLORS.accent }]}>{t('delete')} All {t('contacts')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.menuItem, styles.logoutItem]} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={24} color={COLORS.accent} />
        <Text style={[styles.menuText, styles.logoutText]}>{t('logout')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      {/* Enhanced Header with Gradient */}
      <LinearGradient
        colors={COLORS.primaryGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <SafeAreaView edges={['top']}>
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <View style={styles.headerTextContainer}>
                <Text style={styles.headerTitle}>SynchroConnectr</Text>
                <Text style={styles.headerSubtitle}>
                  {activeTab === 'pipeline' && 'Organize by frequency'}
                  {activeTab === 'contacts' && `${contacts.length} contacts`}
                  {activeTab === 'groups' && `${groups.length} groups`}
                  {activeTab === 'drafts' && `${drafts.length} AI drafts`}
                  {activeTab === 'profile' && 'Your profile'}
                </Text>
              </View>
              {/* Quick Stats Badge */}
              {activeTab === 'pipeline' && contacts.filter(c => {
                if (c.pipeline_stage === 'New') return false;
                const days = getDaysUntilDue(c.next_due);
                return days !== null && days < 0;
              }).length > 0 && (
                <View style={styles.headerBadge}>
                  <Ionicons name="alert-circle" size={14} color={COLORS.surface} />
                  <Text style={styles.headerBadgeText}>
                    {contacts.filter(c => {
                      if (c.pipeline_stage === 'New') return false;
                      const days = getDaysUntilDue(c.next_due);
                      return days !== null && days < 0;
                    }).length} overdue
                  </Text>
                </View>
              )}
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* Search Bar - Enhanced with shadow */}
      {activeTab === 'contacts' && (
        <View style={styles.searchWrapper}>
          <View style={styles.searchContainer}>
            <View style={styles.searchIconWrapper}>
              <Ionicons name="search" size={18} color={COLORS.primary} />
            </View>
            <TextInput
              style={styles.searchInput}
              placeholder="Search contacts..."
              placeholderTextColor={COLORS.textLight}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchClearBtn}>
                <Ionicons name="close-circle" size={20} color={COLORS.textLight} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Content */}
      {activeTab === 'pipeline' && renderPipeline()}
      {activeTab === 'contacts' && renderContacts()}
      {activeTab === 'groups' && renderGroups()}
      {activeTab === 'drafts' && renderDrafts()}
      {activeTab === 'profile' && renderProfile()}

      {/* Enhanced FAB with gradient */}
      {activeTab === 'contacts' && (
        <TouchableOpacity style={styles.fabWrapper} onPress={() => router.push('/contact/new')} activeOpacity={0.9}>
          <LinearGradient colors={COLORS.primaryGradient} style={styles.fab}>
            <Ionicons name="add" size={28} color={COLORS.surface} />
          </LinearGradient>
        </TouchableOpacity>
      )}
      {activeTab === 'groups' && (
        <TouchableOpacity style={styles.fabWrapper} onPress={() => router.push('/group/new')} activeOpacity={0.9}>
          <LinearGradient colors={COLORS.primaryGradient} style={styles.fab}>
            <Ionicons name="add" size={28} color={COLORS.surface} />
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Enhanced Bottom Tab Bar */}
      <View style={styles.tabBarWrapper}>
        <View style={styles.tabBar}>
          {[
            { key: 'pipeline', icon: 'git-branch', label: t('pipeline') },
            { key: 'groups', icon: 'albums', label: t('groups') },
            { key: 'contacts', icon: 'people', label: t('contacts') },
            { key: 'drafts', icon: 'sparkles', label: t('drafts') },
            { key: 'profile', icon: 'person', label: t('profile') },
          ].map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={styles.tabButton}
                onPress={() => {
                  triggerHaptic('light');
                  setActiveTab(tab.key as Tab);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.tabIconWrapper, isActive && styles.tabIconWrapperActive]}>
                  <Ionicons
                    name={isActive ? tab.icon as any : `${tab.icon}-outline` as any}
                    size={22}
                    color={isActive ? COLORS.primary : COLORS.textLight}
                  />
                </View>
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
                {isActive && <View style={styles.tabActiveIndicator} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ContactImportPrompt visible={showImportPrompt} onClose={() => setShowImportPrompt(false)} />

      {/* Move Contact Modal */}
      <Modal
        visible={showMoveModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMoveModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowMoveModal(false)}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            
            {selectedContact && (
              <>
                <Text style={styles.modalTitle}>Move "{selectedContact.name}"</Text>
                
                {/* Pipeline Stages */}
                <Text style={styles.modalSectionTitle}>Pipeline Stage</Text>
                <View style={styles.modalSection}>
                  {PIPELINE_STAGES.map((stage) => {
                    const isCurrentStage = selectedContact.pipeline_stage === stage;
                    return (
                      <TouchableOpacity
                        key={stage}
                        style={[styles.modalOption, isCurrentStage && styles.modalOptionActive]}
                        onPress={() => moveContactToPipeline(stage)}
                      >
                        <View style={[styles.stageIndicator, isCurrentStage && styles.stageIndicatorActive]} />
                        <Text style={[styles.modalOptionText, isCurrentStage && styles.modalOptionTextActive]}>
                          {stage}
                        </Text>
                        {isCurrentStage && (
                          <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Groups */}
                {groups.length > 0 && (
                  <>
                    <Text style={styles.modalSectionTitle}>Groups</Text>
                    <View style={styles.modalSection}>
                      {groups.map((group) => {
                        const isInGroup = selectedContact.groups?.includes(group.name);
                        return (
                          <TouchableOpacity
                            key={group.id}
                            style={[styles.modalOption, isInGroup && styles.modalOptionActive]}
                            onPress={() => toggleContactGroup(group.name)}
                          >
                            <View style={[styles.groupIndicator, isInGroup && styles.groupIndicatorActive]}>
                              <Ionicons 
                                name={isInGroup ? "checkmark" : "add"} 
                                size={16} 
                                color={isInGroup ? COLORS.surface : COLORS.textLight} 
                              />
                            </View>
                            <Text style={[styles.modalOptionText, isInGroup && styles.modalOptionTextActive]}>
                              {group.name}
                            </Text>
                            {isInGroup && (
                              <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}

                {/* Close Button */}
                <TouchableOpacity 
                  style={styles.modalCloseButton}
                  onPress={() => setShowMoveModal(false)}
                >
                  <Text style={styles.modalCloseButtonText}>Done</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Add Contacts to Group Modal */}
      <Modal
        visible={showAddContactsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddContactsModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowAddContactsModal(false)}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <View style={styles.modalHandle} />
            
            {selectedGroupForContacts && (
              <>
                <Text style={styles.modalTitle}>
                  {t('add')} {t('contacts')} to "{selectedGroupForContacts.name}"
                </Text>
                
                <FlatList
                  data={contacts}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item: contact }) => {
                    const isSelected = selectedContactsForGroup.includes(contact.id);
                    return (
                      <TouchableOpacity
                        style={[styles.modalContactOption, isSelected && styles.modalContactOptionSelected]}
                        onPress={() => {
                          setSelectedContactsForGroup(
                            isSelected
                              ? selectedContactsForGroup.filter(id => id !== contact.id)
                              : [...selectedContactsForGroup, contact.id]
                          );
                        }}
                      >
                        {contact.profile_picture ? (
                          <Image source={{ uri: contact.profile_picture }} style={styles.modalContactAvatar} />
                        ) : (
                          <View style={styles.modalContactAvatarPlaceholder}>
                            <Text style={styles.modalContactAvatarText}>{contact.name.charAt(0).toUpperCase()}</Text>
                          </View>
                        )}
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={styles.modalContactName}>{contact.name}</Text>
                          {contact.job && <Text style={styles.modalContactJob}>{contact.job}</Text>}
                        </View>
                        <View style={[styles.checkboxCircle, isSelected && styles.checkboxCircleSelected]}>
                          {isSelected && <Ionicons name="checkmark" size={16} color={COLORS.surface} />}
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                  style={{ maxHeight: 400 }}
                />

                {/* Save Button */}
                <TouchableOpacity 
                  style={styles.modalSaveButton}
                  onPress={handleAddContactsToGroup}
                >
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.surface} />
                  <Text style={styles.modalSaveButtonText}>
                    {t('save')} ({selectedContactsForGroup.length} {t('contacts').toLowerCase()})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.modalCloseButton}
                  onPress={() => setShowAddContactsModal(false)}
                >
                  <Text style={styles.modalCloseButtonText}>{t('cancel')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  
  // Enhanced Header Styles
  headerGradient: {
    paddingBottom: 16,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.surface,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
    fontWeight: '500',
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  headerBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.surface,
  },
  
  // Enhanced Search Styles
  searchWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.background,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  searchIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
  },
  searchClearBtn: {
    padding: 4,
  },
  
  // Stage Selector (keeping for compatibility)
  stageSelector: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  stageSelectorContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  stageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    gap: 8,
  },
  stageButtonActive: {
    backgroundColor: COLORS.primary,
  },
  stageButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  stageButtonTextActive: {
    color: COLORS.surface,
  },
  stageBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  stageBadgeActive: {
    backgroundColor: COLORS.surface,
  },
  stageBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  content: {
    flex: 1,
  },
  
  // Enhanced Contact Card Styles
  contactCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  contactCardOverdue: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.accent,
  },
  contactCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contactAvatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
  },
  contactAvatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactAvatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.surface,
  },
  contactName: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.text,
  },
  contactJob: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 2,
  },
  contactPhone: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  contactStage: {
    fontSize: 12,
    color: COLORS.primary,
    marginTop: 4,
    fontWeight: '600',
  },
  contactGroups: {
    fontSize: 12,
    color: COLORS.success,
    marginTop: 4,
  },
  draftButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dueBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.background,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
  },
  dueText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textLight,
  },
  groupsHeader: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 8,
  },
  groupInput: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    fontSize: 16,
    color: COLORS.text,
  },
  addGroupButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupSelector: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  
  // Enhanced Draft Card - Chat-like bubble
  draftCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 14,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  draftHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  draftContactName: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  deleteDraftBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.accent + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteAllDraftsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent + '12',
    marginHorizontal: 16,
    marginVertical: 12,
    padding: 14,
    borderRadius: 16,
    gap: 8,
  },
  deleteAllDraftsText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.accent,
  },
  draftMessageContainer: {
    backgroundColor: COLORS.primary + '08',
    padding: 16,
    borderRadius: 16,
    borderTopLeftRadius: 4,
    marginBottom: 14,
  },
  draftMessage: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 22,
  },
  draftActions: {
    flexDirection: 'row',
    gap: 10,
  },
  copyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    gap: 8,
  },
  copyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.surface,
  },
  
  // Enhanced Profile Card
  profileCard: {
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    padding: 32,
    marginHorizontal: 16,
    marginVertical: 16,
    borderRadius: 24,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: COLORS.primary + '20',
  },
  profileName: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 16,
  },
  profileEmail: {
    fontSize: 15,
    color: COLORS.textLight,
    marginTop: 4,
  },
  editProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 16,
    gap: 6,
  },
  editProfileButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  
  // Enhanced Menu Items
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 16,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginLeft: 16,
  },
  logoutItem: {
    marginTop: 16,
    backgroundColor: COLORS.accent + '08',
  },
  logoutText: {
    color: COLORS.accent,
  },
  syncItemMain: {
    backgroundColor: COLORS.primary,
    borderWidth: 0,
    marginBottom: 8,
  },
  syncItem: {
    backgroundColor: COLORS.primary + '10',
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  syncSection: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  syncSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  syncHintText: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  lastSyncText: {
    fontSize: 12,
    color: COLORS.success,
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '500',
  },
  syncResultText: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  syncSpinner: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Enhanced Empty State
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIconWrapper: {
    marginBottom: 4,
  },
  emptyIconGradient: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 20,
  },
  emptySubtext: {
    fontSize: 15,
    color: COLORS.textLight,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 22,
  },
  
  // Draft Header styles
  draftHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  draftAIBadge: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: COLORS.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Profile Avatar placeholder
  profileAvatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 32,
    backgroundColor: COLORS.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Enhanced FAB
  fabWrapper: {
    position: 'absolute',
    right: 20,
    bottom: 100,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Enhanced Tab Bar
  tabBarWrapper: {
    backgroundColor: COLORS.surface,
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
    borderTopWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    paddingTop: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  tabIconWrapper: {
    width: 44,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabIconWrapperActive: {
    backgroundColor: COLORS.primary + '15',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textLight,
    marginTop: 4,
  },
  tabLabelActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  tabActiveIndicator: {
    position: 'absolute',
    top: 0,
    width: 20,
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
  },
  
  // Enhanced Group Card
  groupCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  groupCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  groupAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupName: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  groupDescription: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 2,
  },
  groupStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  groupContactCount: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginVertical: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 20,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textLight,
    marginBottom: 12,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modalSection: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalOptionActive: {
    backgroundColor: COLORS.primary + '10',
  },
  modalOptionText: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
    marginLeft: 12,
  },
  modalOptionTextActive: {
    fontWeight: '600',
    color: COLORS.primary,
  },
  stageIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.border,
  },
  stageIndicatorActive: {
    backgroundColor: COLORS.primary,
  },
  groupIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupIndicatorActive: {
    backgroundColor: COLORS.success,
  },
  modalCloseButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 20,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  // Kanban Board Styles
  pipelineContainer: {
    flex: 1,
  },
  kanbanBoard: {
    flex: 1,
  },
  kanbanContent: {
    paddingHorizontal: 8,
  },
  kanbanColumn: {
    marginHorizontal: 8,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 12,
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 12,
  },
  columnTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  columnBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 24,
    alignItems: 'center',
  },
  columnBadgeText: {
    color: COLORS.surface,
    fontSize: 12,
    fontWeight: 'bold',
  },
  draggableContactCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  draggableContactActive: {
    backgroundColor: COLORS.primary + '10',
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  dragHandle: {
    marginRight: 8,
    padding: 4,
  },
  contactInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dueBadgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
  },
  overdueBadge: {
    backgroundColor: COLORS.accent + '20',
  },
  upcomingBadge: {
    backgroundColor: COLORS.success + '20',
  },
  dueBadgeTextSmall: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.text,
  },
  emptyColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyColumnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textLight,
    marginTop: 8,
  },
  emptyColumnHint: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 4,
  },
  dropZoneContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  dropZoneButton: {
    backgroundColor: COLORS.primary + '10',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  dropZoneText: {
    fontSize: 10,
    color: COLORS.primary,
    fontWeight: '600',
  },
  hintBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 8,
  },
  hintText: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  // Fancy Pipeline Styles
  pipelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: COLORS.surface,
  },
  pipelineTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  pipelineStats: {
    flexDirection: 'row',
    gap: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statItemOverdue: {
    backgroundColor: COLORS.accent + '10',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stagePillsContainer: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  stagePillsContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    flexDirection: 'row',
  },
  stagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 25,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.border,
    gap: 8,
  },
  stagePillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stagePillText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  stagePillTextActive: {
    color: '#FFFFFF',
  },
  stagePillBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  stagePillBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  stagePillBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  stagePillBadgeTextActive: {
    color: '#FFFFFF',
  },
  selectedStageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 10,
  },
  selectedStageDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  selectedStageTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  selectedStageCount: {
    fontSize: 14,
    color: COLORS.textLight,
    marginLeft: 'auto',
  },
  pipelineContactsList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  pipelineCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  pipelineCardOverdue: {
    backgroundColor: COLORS.accent + '08',
    borderLeftColor: COLORS.accent,
  },
  pipelineCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pipelineAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  pipelineAvatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pipelineAvatarText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  pipelineCardInfo: {
    flex: 1,
    marginLeft: 14,
  },
  pipelineCardName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  pipelineCardJob: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 2,
  },
  pipelineTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  pipelineTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pipelineTagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  pipelineCardRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  pipelineDueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 4,
  },
  pipelineDueOverdue: {
    backgroundColor: COLORS.accent + '15',
  },
  pipelineDueOk: {
    backgroundColor: COLORS.success + '15',
  },
  pipelineDueText: {
    fontSize: 12,
    fontWeight: '700',
  },
  pipelineDueTextOverdue: {
    color: COLORS.accent,
  },
  pipelineDueTextOk: {
    color: COLORS.success,
  },
  emptyPipeline: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyPipelineIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyPipelineTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptyPipelineHint: {
    fontSize: 14,
    color: COLORS.textLight,
    textAlign: 'center',
  },
  // Add Contacts to Group Button
  addContactsToGroupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary + '15',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginTop: 12,
    gap: 6,
  },
  addContactsButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  // Modal Contact Options
  modalContactOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: COLORS.background,
  },
  modalContactOptionSelected: {
    backgroundColor: COLORS.primary + '15',
  },
  modalContactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  modalContactAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContactAvatarText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.primary,
  },
  modalContactName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  modalContactJob: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 2,
  },
  checkboxCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxCircleSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  modalSaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
    gap: 8,
  },
  modalSaveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.surface,
  },
});
