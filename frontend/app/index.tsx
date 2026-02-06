import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, Image, Dimensions, Modal, Pressable, FlatList, Platform, Animated, KeyboardAvoidingView, Keyboard, RefreshControl, ActivityIndicator, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import ContactImportPrompt from '../components/ContactImportPrompt';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import ContactSyncService from '../services/ContactSyncService';
import { LinearGradient } from 'expo-linear-gradient';
import { Calendar, CalendarList, Agenda } from 'react-native-calendars';
import NotificationService from './services/notifications';

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
  // Primary colors with gradient support - Purple theme for Convo
  primary: '#5D3FD3',
  primaryDark: '#4B32A8',
  primaryLight: '#9B87F5',
  primaryGradient: ['#5D3FD3', '#7B68EE'] as const,
  
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

// Get color for pipeline stage - now uses dynamic configuration
const getStageColorFromConfig = (stage: string, stagesConfig: any[]): string => {
  // First check if it's the special "New" stage
  if (stage === 'New') return COLORS.new;
  
  // Find the stage in the config
  const stageConfig = stagesConfig.find((s: any) => s.name === stage);
  if (stageConfig?.color) {
    return stageConfig.color;
  }
  
  // Fallback to default colors for backward compatibility
  switch (stage) {
    case 'Weekly': return COLORS.weekly;
    case 'Bi-Weekly': return COLORS.biweekly;
    case 'Monthly': return COLORS.monthly;
    case 'Quarterly': return COLORS.quarterly;
    case 'Annually': return COLORS.annually;
    default: return COLORS.primary;
  }
};

// Get gradient colors for stage - now uses dynamic configuration
const getStageGradientFromConfig = (stage: string, stagesConfig: any[]): readonly [string, string] => {
  const baseColor = getStageColorFromConfig(stage, stagesConfig);
  // Create a lighter version for gradient
  return [baseColor, baseColor + 'CC'] as const;
};

const PIPELINE_STAGES = ['New', 'Weekly', 'Bi-Weekly', 'Monthly', 'Quarterly', 'Annually'];

type Tab = 'pipeline' | 'contacts' | 'groups' | 'planner' | 'profile';
type PlannerSubTab = 'briefing' | 'drafts' | 'calendar';
type CalendarView = 'day' | 'week' | 'month';

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
  birthday?: string;
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
  color?: string;
  profile_picture?: string;
  contact_count?: number;
}

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  date: string;
  start_time: string;
  end_time?: string;
  participants: string[];
  participant_details?: { id: string; name: string; profile_picture?: string }[];
  reminder_minutes: number;
  color: string;
  all_day: boolean;
  recurring?: string;
}

export default function Index() {
  const router = useRouter();
  const { user, token, logout } = useAuth();
  const { t, language } = useLanguage();
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
  // Planner tab state
  const [plannerSubTab, setPlannerSubTab] = useState<PlannerSubTab>('briefing');
  const [calendarView, setCalendarView] = useState<CalendarView>('month');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  // Morning briefing state
  const [briefingTab, setBriefingTab] = useState<'overdue' | 'today' | 'week'>('today');
  const [generatingDraftForId, setGeneratingDraftForId] = useState<string | null>(null);
  // Morning briefing data
  const [morningBriefing, setMorningBriefing] = useState<any>(null);
  const [loadingBriefing, setLoadingBriefing] = useState(false);
  // Dynamic pipeline stages
  const [pipelineStages, setPipelineStages] = useState<string[]>(['New', 'Weekly', 'Bi-Weekly', 'Monthly', 'Quarterly', 'Annually']);
  const [pipelineStagesConfig, setPipelineStagesConfig] = useState<any[]>([]);
  // Calendar Events state
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [showCreateEventModal, setShowCreateEventModal] = useState(false);
  const [newEventData, setNewEventData] = useState({
    title: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    start_time: '09:00',
    end_time: '10:00',
    participants: [] as string[],
    reminder_minutes: 30,
    color: '#5D3FD3',
    all_day: false,
  });
  const [showParticipantPicker, setShowParticipantPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [dayViewDate, setDayViewDate] = useState<string | null>(null);
  const [dayViewEvents, setDayViewEvents] = useState<CalendarEvent[]>([]);

  // Helper functions that use the state
  const getStageColor = (stage: string) => getStageColorFromConfig(stage, pipelineStagesConfig);
  const getStageGradient = (stage: string) => getStageGradientFromConfig(stage, pipelineStagesConfig);

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

  // Fetch profile to get dynamic pipeline stages
  const fetchProfile = async () => {
    if (!token) return;
    try {
      const response = await axios.get(`${EXPO_PUBLIC_BACKEND_URL}/api/profile`, getAuthHeaders());
      const profile = response.data;
      
      if (profile.pipeline_stages && profile.pipeline_stages.length > 0) {
        // Sort by interval and add "New" at the beginning
        const sorted = [...profile.pipeline_stages]
          .filter((s: any) => s.enabled !== false)
          .sort((a: any, b: any) => a.interval_days - b.interval_days);
        const stageNames = ['New', ...sorted.map((s: any) => s.name)];
        setPipelineStages(stageNames);
        setPipelineStagesConfig(sorted);
      }
    } catch (error) {
      // Use default stages if profile not found
      console.log('Using default pipeline stages');
    }
  };

  // Fetch calendar events
  const fetchCalendarEvents = async () => {
    if (!token) return;
    try {
      const response = await axios.get(`${EXPO_PUBLIC_BACKEND_URL}/api/calendar-events`, getAuthHeaders());
      setCalendarEvents(response.data || []);
    } catch (error) {
      console.error('Error fetching calendar events:', error);
    }
  };

  // Fetch events for a specific date (day view)
  const fetchDayEvents = async (date: string) => {
    if (!token) return;
    try {
      const response = await axios.get(`${EXPO_PUBLIC_BACKEND_URL}/api/calendar-events/by-date/${date}`, getAuthHeaders());
      setDayViewEvents(response.data || []);
    } catch (error) {
      console.error('Error fetching day events:', error);
    }
  };

  // Create a new calendar event
  const createCalendarEvent = async () => {
    if (!newEventData.title.trim()) {
      Alert.alert('Fehler', 'Bitte gib einen Titel ein');
      return;
    }
    
    if (isCreatingEvent) return; // Prevent double-tap
    
    setIsCreatingEvent(true);
    
    try {
      const eventPayload = {
        ...newEventData,
        participants: newEventData.participants || [],
      };
      
      await axios.post(`${EXPO_PUBLIC_BACKEND_URL}/api/calendar-events`, eventPayload, getAuthHeaders());
      triggerHaptic('success');
      
      // Reset form first
      setNewEventData({
        title: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        start_time: '09:00',
        end_time: '10:00',
        participants: [],
        reminder_minutes: 30,
        color: '#5D3FD3',
        all_day: false,
      });
      
      // Close modal
      setShowCreateEventModal(false);
      
      // Refresh data in background
      fetchCalendarEvents();
      if (dayViewDate) {
        fetchDayEvents(dayViewDate);
      }
      
      Alert.alert('✓', 'Event created');
    } catch (error: any) {
      console.error('Error creating event:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Could not create event');
    } finally {
      setIsCreatingEvent(false);
    }
  };

  // Delete a calendar event
  const deleteCalendarEvent = async (eventId: string) => {
    Alert.alert(
      'Termin löschen',
      'Möchtest du diesen Termin wirklich löschen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${EXPO_PUBLIC_BACKEND_URL}/api/calendar-events/${eventId}`, getAuthHeaders());
              triggerHaptic('success');
              fetchCalendarEvents();
              if (dayViewDate) {
                fetchDayEvents(dayViewDate);
              }
            } catch (error) {
              Alert.alert('Fehler', 'Termin konnte nicht gelöscht werden');
            }
          }
        }
      ]
    );
  };

  // Get events for a specific date (from cached events)
  const getEventsForDate = (date: string) => {
    return calendarEvents.filter(e => e.date === date);
  };

  // Copy text to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await Clipboard.setStringAsync(text);
      triggerHaptic('success');
      Alert.alert('✓', 'Copied to clipboard');
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      Alert.alert('Error', 'Failed to copy');
    }
  };

  // Initialize push notifications
  useEffect(() => {
    const initNotifications = async () => {
      try {
        const pushToken = await NotificationService.registerForPushNotifications();
        if (pushToken && token) {
          await NotificationService.registerTokenWithBackend(pushToken, token);
        }
        
        // Handle notification taps
        const subscription = NotificationService.addNotificationResponseListener((response) => {
          const eventId = response.notification.request.content.data?.eventId;
          if (eventId) {
            // Navigate to the event or show event details
            console.log('Notification tapped for event:', eventId);
          }
        });
        
        return () => subscription.remove();
      } catch (error) {
        console.log('Notifications not available:', error);
      }
    };
    
    if (token) {
      initNotifications();
    }
  }, [token]);

  // Schedule reminders when calendar events change
  useEffect(() => {
    if (calendarEvents.length > 0) {
      NotificationService.scheduleRemindersForEvents(calendarEvents);
    }
  }, [calendarEvents]);

  useEffect(() => {
    if (token) {
      fetchContacts();
      fetchDrafts();
      fetchGroups();
      fetchProfile();
      fetchCalendarEvents();
      // Don't auto-sync on startup - let user tap the sync button
      // This avoids race conditions with the contacts API
    }
  }, [token]);

  // Auto-refresh when screen is focused (e.g., after importing contacts or editing)
  useFocusEffect(
    useCallback(() => {
      if (token) {
        fetchContacts();
        fetchDrafts();
        fetchGroups();
        fetchProfile(); // Also refresh pipeline stages
        fetchCalendarEvents();
      }
    }, [token])
  );

  // Also refresh when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && token) {
        fetchContacts();
        fetchDrafts();
        fetchGroups();
        fetchProfile(); // Also refresh pipeline stages
      }
    });
    return () => subscription?.remove();
  }, [token]);

  // Pull-to-refresh handler
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([fetchContacts(), fetchGroups(), fetchProfile()]).finally(() => {
      setRefreshing(false);
    });
  }, [token]);

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

  // Drag and drop handlers for Pipeline
  const handleDragDropMoveContact = async (contactId: string, newStage: string) => {
    try {
      await axios.put(`${EXPO_PUBLIC_BACKEND_URL}/api/contacts/${contactId}`, {
        pipeline_stage: newStage
      }, getAuthHeaders());
      
      // Update local state immediately for responsiveness
      setContacts(prevContacts => 
        prevContacts.map(c => 
          c.id === contactId ? { ...c, pipeline_stage: newStage } : c
        )
      );
      
      triggerHaptic('success');
    } catch (error) {
      console.error('Error moving contact:', error);
      throw error;
    }
  };

  // Drag and drop handlers for Groups
  const handleDragDropAddToGroup = async (contactId: string, groupId: string) => {
    try {
      const contact = contacts.find(c => c.id === contactId);
      if (!contact) return;
      
      const updatedGroups = [...(contact.groups || []), groupId];
      
      await axios.put(`${EXPO_PUBLIC_BACKEND_URL}/api/contacts/${contactId}`, {
        groups: updatedGroups
      }, getAuthHeaders());
      
      // Update local state immediately
      setContacts(prevContacts => 
        prevContacts.map(c => 
          c.id === contactId ? { ...c, groups: updatedGroups } : c
        )
      );
      
      triggerHaptic('success');
    } catch (error) {
      console.error('Error adding contact to group:', error);
      throw error;
    }
  };

  const handleDragDropRemoveFromGroup = async (contactId: string, groupId: string) => {
    try {
      const contact = contacts.find(c => c.id === contactId);
      if (!contact) return;
      
      const updatedGroups = (contact.groups || []).filter(g => g !== groupId);
      
      await axios.put(`${EXPO_PUBLIC_BACKEND_URL}/api/contacts/${contactId}`, {
        groups: updatedGroups
      }, getAuthHeaders());
      
      // Update local state immediately
      setContacts(prevContacts => 
        prevContacts.map(c => 
          c.id === contactId ? { ...c, groups: updatedGroups } : c
        )
      );
      
      triggerHaptic('success');
    } catch (error) {
      console.error('Error removing contact from group:', error);
      throw error;
    }
  };

  const handleDragDropCreateGroup = async (name: string, description?: string) => {
    try {
      await axios.post(`${EXPO_PUBLIC_BACKEND_URL}/api/groups`, {
        name,
        description
      }, getAuthHeaders());
      fetchGroups();
    } catch (error) {
      console.error('Error creating group:', error);
      throw error;
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
      // Navigate to Planner tab and show drafts sub-tab
      setActiveTab('planner');
      setPlannerSubTab('drafts');
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
    const stageColor = getStageColor(contact.pipeline_stage);
    const isGenerating = generatingDraftForId === contact.id;
    const contactGroups = groups.filter(g => contact.groups?.includes(g.id) || contact.groups?.includes(g.name));

    return (
      <View
        key={contact.id}
        style={[styles.contactCardEnhanced, isOverdue && !isNewContact && styles.contactCardOverdueEnhanced]}
      >
        <TouchableOpacity
          style={styles.contactCardMainArea}
          onPress={() => router.push(`/contact/${contact.id}`)}
          onLongPress={() => handleLongPressContact(contact)}
          delayLongPress={300}
          activeOpacity={0.7}
        >
          {contact.profile_picture ? (
            <Image source={{ uri: contact.profile_picture }} style={styles.contactAvatarEnhanced} />
          ) : (
            <LinearGradient 
              colors={getStageGradient(contact.pipeline_stage)} 
              style={styles.contactAvatarPlaceholderEnhanced}
            >
              <Text style={styles.contactAvatarTextEnhanced}>{contact.name.charAt(0).toUpperCase()}</Text>
            </LinearGradient>
          )}
          <View style={styles.contactInfoEnhanced}>
            <Text style={styles.contactNameEnhanced}>{contact.name}</Text>
            {contact.job && <Text style={styles.contactJobEnhanced}>{contact.job}</Text>}
            {/* Groups badges */}
            {contactGroups.length > 0 && (
              <View style={styles.contactGroupsBadges}>
                {contactGroups.slice(0, 3).map((group) => (
                  <View key={group.id} style={[styles.contactGroupBadge, { backgroundColor: (group.color || COLORS.primary) + '20' }]}>
                    <View style={[styles.contactGroupDot, { backgroundColor: group.color || COLORS.primary }]} />
                    <Text style={[styles.contactGroupBadgeText, { color: group.color || COLORS.primary }]} numberOfLines={1}>
                      {group.name}
                    </Text>
                  </View>
                ))}
                {contactGroups.length > 3 && (
                  <View style={[styles.contactGroupBadge, { backgroundColor: COLORS.textLight + '20' }]}>
                    <Text style={[styles.contactGroupBadgeText, { color: COLORS.textLight }]}>
                      +{contactGroups.length - 3}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </TouchableOpacity>
        
        <View style={styles.contactCardActionsEnhanced}>
          {/* Frequency Badge */}
          <View style={[styles.contactFrequencyBadge, { backgroundColor: stageColor + '15' }]}>
            <Ionicons name="repeat" size={12} color={stageColor} />
            <Text style={[styles.contactFrequencyText, { color: stageColor }]}>{contact.pipeline_stage}</Text>
          </View>
          
          {/* Due Badge for contacts tab */}
          {daysUntil !== null && !isNewContact && (
            <View style={[
              styles.contactDueBadgeEnhanced,
              isOverdue ? styles.contactDueBadgeOverdueEnhanced : styles.contactDueBadgeOkEnhanced
            ]}>
              <Ionicons 
                name={isOverdue ? "alert-circle" : "time-outline"} 
                size={11} 
                color={isOverdue ? '#fff' : COLORS.success} 
              />
              <Text style={[
                styles.contactDueBadgeTextEnhanced,
                isOverdue && styles.contactDueBadgeTextOverdueEnhanced
              ]}>
                {isOverdue ? `${Math.abs(daysUntil)}d` : `${daysUntil}d`}
              </Text>
            </View>
          )}
          
          {/* AI Draft Button */}
          {showDraftButton && (
            <TouchableOpacity
              style={[styles.contactAIDraftBtn, isGenerating && styles.contactAIDraftBtnLoading]}
              onPress={() => {
                setGeneratingDraftForId(contact.id);
                generateDraft(contact.id, contact.name).finally(() => setGeneratingDraftForId(null));
              }}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={14} color="#fff" />
                  <Text style={styles.contactAIDraftBtnText}>AI Draft</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
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
    const totalOverdue = contacts.filter(c => {
      if (c.pipeline_stage === 'New') return false;
      const days = getDaysUntilDue(c.next_due);
      return days !== null && days < 0;
    }).length;

    return (
      <View style={styles.pipelineContainer}>
        {/* Modern Header with Stats */}
        <View style={styles.pipelineHeaderNew}>
          <View style={styles.pipelineHeaderLeft}>
            <Text style={styles.pipelineHeaderTitle}>Pipeline</Text>
            <Text style={styles.pipelineHeaderSubtitle}>{contacts.length} contacts</Text>
          </View>
          <View style={styles.pipelineHeaderRight}>
            {totalOverdue > 0 && (
              <View style={styles.overdueChip}>
                <Ionicons name="alert-circle" size={14} color="#fff" />
                <Text style={styles.overdueChipText}>{totalOverdue}</Text>
              </View>
            )}
            <TouchableOpacity 
              style={styles.pipelineSettingsBtn}
              onPress={() => router.push('/pipeline-settings')}
            >
              <Ionicons name="settings-outline" size={20} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Stage Chips - Horizontal Scroll */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.stageChipsContainer}
          contentContainerStyle={styles.stageChipsContent}
        >
          {pipelineStages.map((stage) => {
            const count = contacts.filter(c => c.pipeline_stage === stage).length;
            const isActive = selectedStage === stage;
            const color = getStageColor(stage);
            const hasOverdue = stage !== 'New' && contacts.filter(c => {
              if (c.pipeline_stage !== stage) return false;
              const days = getDaysUntilDue(c.next_due);
              return days !== null && days < 0;
            }).length > 0;
            
            return (
              <TouchableOpacity
                key={stage}
                style={[
                  styles.stageChip,
                  isActive && styles.stageChipActive,
                  isActive && { backgroundColor: color }
                ]}
                onPress={() => setSelectedStage(stage)}
              >
                <Text style={[
                  styles.stageChipText,
                  isActive && styles.stageChipTextActive
                ]}>
                  {stage}
                </Text>
                <View style={[
                  styles.stageChipCount,
                  isActive && styles.stageChipCountActive,
                  hasOverdue && !isActive && styles.stageChipCountOverdue
                ]}>
                  <Text style={[
                    styles.stageChipCountText,
                    isActive && styles.stageChipCountTextActive,
                    hasOverdue && !isActive && styles.stageChipCountTextOverdue
                  ]}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Current Stage Info Bar */}
        <LinearGradient 
          colors={[stageColor, stageColor + 'DD']} 
          style={styles.stageInfoBar}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <View style={styles.stageInfoContent}>
            <Text style={styles.stageInfoTitle}>{selectedStage}</Text>
            <Text style={styles.stageInfoCount}>{stageContacts.length} contacts</Text>
          </View>
        </LinearGradient>

        {/* Contacts List */}
        <ScrollView 
          style={styles.pipelineContactsList}
          showsVerticalScrollIndicator={false}
        >
          {stageContacts.length === 0 ? (
            <View style={styles.emptyPipelineNew}>
              <LinearGradient 
                colors={[stageColor + '20', stageColor + '10']} 
                style={styles.emptyPipelineIconNew}
              >
                <Ionicons name="people-outline" size={36} color={stageColor} />
              </LinearGradient>
              <Text style={styles.emptyPipelineTitleNew}>No contacts in {selectedStage}</Text>
              <Text style={styles.emptyPipelineSubtitle}>Add contacts to this pipeline stage</Text>
            </View>
          ) : (
            stageContacts.map((contact, index) => {
              const daysUntil = getDaysUntilDue(contact.next_due);
              const isOverdue = daysUntil !== null && daysUntil < 0 && contact.pipeline_stage !== 'New';
              const isNewContact = contact.pipeline_stage === 'New';
              const isGenerating = generatingDraftForId === contact.id;
              const contactGroups = groups.filter(g => contact.groups?.includes(g.id) || contact.groups?.includes(g.name));
              
              return (
                <View key={contact.id} style={[styles.pipelineContactCardEnhanced, isOverdue && styles.pipelineContactCardOverdueEnhanced]}>
                  <TouchableOpacity
                    style={styles.pipelineContactMainArea}
                    onPress={() => router.push(`/contact/${contact.id}`)}
                    onLongPress={() => handleLongPressContact(contact)}
                    delayLongPress={400}
                    activeOpacity={0.7}
                  >
                    {contact.profile_picture ? (
                      <Image source={{ uri: contact.profile_picture }} style={styles.pipelineContactAvatarEnhanced} />
                    ) : (
                      <LinearGradient 
                        colors={[stageColor, stageColor + 'CC']} 
                        style={styles.pipelineContactAvatarPlaceholderEnhanced}
                      >
                        <Text style={styles.pipelineContactAvatarTextEnhanced}>
                          {contact.name.charAt(0).toUpperCase()}
                        </Text>
                      </LinearGradient>
                    )}
                    <View style={styles.pipelineContactInfoEnhanced}>
                      <Text style={styles.pipelineContactNameEnhanced} numberOfLines={1}>{contact.name}</Text>
                      {contact.job && (
                        <Text style={styles.pipelineContactJobEnhanced} numberOfLines={1}>{contact.job}</Text>
                      )}
                      {/* Groups badges */}
                      {contactGroups.length > 0 && (
                        <View style={styles.contactGroupsBadges}>
                          {contactGroups.slice(0, 3).map((group) => (
                            <View key={group.id} style={[styles.contactGroupBadge, { backgroundColor: (group.color || COLORS.primary) + '20' }]}>
                              <View style={[styles.contactGroupDot, { backgroundColor: group.color || COLORS.primary }]} />
                              <Text style={[styles.contactGroupBadgeText, { color: group.color || COLORS.primary }]} numberOfLines={1}>
                                {group.name}
                              </Text>
                            </View>
                          ))}
                          {contactGroups.length > 3 && (
                            <View style={[styles.contactGroupBadge, { backgroundColor: COLORS.textLight + '20' }]}>
                              <Text style={[styles.contactGroupBadgeText, { color: COLORS.textLight }]}>
                                +{contactGroups.length - 3}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                  
                  <View style={styles.pipelineContactActions}>
                    {/* Frequency Badge */}
                    <View style={[styles.contactFrequencyBadge, { backgroundColor: stageColor + '15' }]}>
                      <Ionicons name="repeat" size={12} color={stageColor} />
                      <Text style={[styles.contactFrequencyText, { color: stageColor }]}>{contact.pipeline_stage}</Text>
                    </View>
                    
                    {/* Due Badge */}
                    {daysUntil !== null && !isNewContact && (
                      <View style={[
                        styles.pipelineDueBadgeEnhanced,
                        isOverdue ? styles.pipelineDueBadgeOverdueEnhanced : styles.pipelineDueBadgeOkEnhanced
                      ]}>
                        <Ionicons 
                          name={isOverdue ? "alert-circle" : "time-outline"} 
                          size={11} 
                          color={isOverdue ? '#fff' : COLORS.success} 
                        />
                        <Text style={[
                          styles.pipelineDueBadgeTextEnhanced,
                          isOverdue && styles.pipelineDueBadgeTextOverdueEnhanced
                        ]}>
                          {isOverdue ? `${Math.abs(daysUntil)}d` : `${daysUntil}d`}
                        </Text>
                      </View>
                    )}
                    {/* New Badge */}
                    {isNewContact && (
                      <View style={styles.pipelineNewBadge}>
                        <Text style={styles.pipelineNewBadgeText}>NEW</Text>
                      </View>
                    )}
                    
                    {/* AI Draft Button */}
                    <TouchableOpacity
                      style={[styles.pipelineAIDraftBtn, isGenerating && styles.pipelineAIDraftBtnLoading]}
                      onPress={() => {
                        setGeneratingDraftForId(contact.id);
                        generateDraft(contact.id, contact.name).finally(() => setGeneratingDraftForId(null));
                      }}
                      disabled={isGenerating}
                    >
                      {isGenerating ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="sparkles" size={14} color="#fff" />
                          <Text style={styles.pipelineAIDraftBtnText}>Draft</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      </View>
    );
  };

  const renderOldPipeline = () => {
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
          {pipelineStages.map((stage) => {
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
    <ScrollView 
      style={styles.content} 
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl 
          refreshing={refreshing} 
          onRefresh={onRefresh}
          tintColor={COLORS.primary}
          colors={[COLORS.primary]}
        />
      }
    >
      {filteredContacts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconWrapper}>
            <LinearGradient colors={COLORS.primaryGradient} style={styles.emptyIconGradient}>
              <Ionicons name="people" size={40} color={COLORS.surface} />
            </LinearGradient>
          </View>
          <Text style={styles.emptyText}>No Contacts Yet</Text>
          <Text style={styles.emptySubtext}>Add your first contact to start building your network</Text>
        </View>
      ) : (
        filteredContacts.map((contact) => renderContactCard(contact))
      )}
      <View style={{ height: 100 }} />
    </ScrollView>
  );

  // State for group actions modal
  const [showGroupActionsModal, setShowGroupActionsModal] = useState(false);
  const [selectedGroupForAction, setSelectedGroupForAction] = useState<any>(null);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupData, setNewGroupData] = useState({ name: '', description: '', color: '#5D3FD3' });

  const groupColors = ['#5D3FD3', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6', '#06B6D4'];

  const handleCreateGroup = async () => {
    if (!newGroupData.name.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }
    try {
      await axios.post(`${EXPO_PUBLIC_BACKEND_URL}/api/groups`, {
        name: newGroupData.name.trim(),
        description: newGroupData.description.trim(),
        color: newGroupData.color,
      }, getAuthHeaders());
      triggerHaptic('success');
      setShowCreateGroupModal(false);
      setNewGroupData({ name: '', description: '', color: '#5D3FD3' });
      fetchGroups();
    } catch (error) {
      Alert.alert('Error', 'Failed to create group');
    }
  };

  const handleDeleteGroup = async (groupId: string, groupName: string) => {
    Alert.alert(
      'Delete Group',
      `Are you sure you want to delete "${groupName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${EXPO_PUBLIC_BACKEND_URL}/api/groups/${groupId}`, getAuthHeaders());
              triggerHaptic('success');
              fetchGroups();
              setShowGroupActionsModal(false);
            } catch (error) {
              Alert.alert('Error', 'Failed to delete group');
            }
          },
        },
      ]
    );
  };

  const renderGroups = () => {
    const filteredGroups = groups.filter(g => 
      g.name.toLowerCase().includes(groupSearchQuery.toLowerCase()) ||
      (g.description && g.description.toLowerCase().includes(groupSearchQuery.toLowerCase()))
    );
    
    return (
      <View style={{ flex: 1 }}>
        {/* Search bar for groups */}
        <View style={styles.searchWrapper}>
          <View style={styles.searchContainer}>
            <View style={styles.searchIconWrapper}>
              <Ionicons name="search" size={18} color={COLORS.primary} />
            </View>
            <TextInput
              style={styles.searchInput}
              placeholder={t('search') + ' ' + t('groups').toLowerCase() + '...'}
              placeholderTextColor={COLORS.textLight}
              value={groupSearchQuery}
              onChangeText={setGroupSearchQuery}
            />
            {groupSearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setGroupSearchQuery('')} style={styles.searchClearBtn}>
                <Ionicons name="close-circle" size={20} color={COLORS.textLight} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        
        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
        >
          {filteredGroups.length === 0 && groups.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconWrapper}>
                <LinearGradient colors={COLORS.primaryGradient} style={styles.emptyIconGradient}>
                  <Ionicons name="albums" size={40} color={COLORS.surface} />
                </LinearGradient>
              </View>
              <Text style={styles.emptyText}>{t('noGroupsCreated')}</Text>
              <Text style={styles.emptySubtext}>Tap + to create your first group</Text>
            </View>
          ) : filteredGroups.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={48} color={COLORS.textLight} />
              <Text style={styles.emptyText}>No groups found</Text>
            </View>
          ) : (
            filteredGroups.map((group) => {
              const groupContacts = contacts.filter(c => c.groups?.includes(group.id) || c.groups?.includes(group.name));
              const groupColor = group.color || COLORS.primary;
              
              return (
                <View key={group.id} style={styles.groupCardEnhanced}>
                  <TouchableOpacity
                    style={styles.groupCardMainArea}
                    onPress={() => router.push(`/group/${group.id}`)}
                    onLongPress={() => {
                      setSelectedGroupForAction(group);
                      setShowGroupActionsModal(true);
                    }}
                    delayLongPress={400}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.groupColorAccent, { backgroundColor: groupColor }]} />
                    {group.profile_picture ? (
                      <Image source={{ uri: group.profile_picture }} style={styles.groupAvatarEnhanced} />
                    ) : (
                      <LinearGradient 
                        colors={[groupColor, groupColor + 'CC']} 
                        style={styles.groupAvatarPlaceholderEnhanced}
                      >
                        <Ionicons name="people" size={24} color={COLORS.surface} />
                      </LinearGradient>
                    )}
                    <View style={styles.groupInfoEnhanced}>
                      <Text style={styles.groupNameEnhanced}>{group.name}</Text>
                      {group.description && (
                        <Text style={styles.groupDescriptionEnhanced} numberOfLines={2}>
                          {group.description}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                  
                  <View style={styles.groupCardActionsEnhanced}>
                    {/* Member count badge */}
                    <View style={[styles.groupMemberBadge, { backgroundColor: groupColor + '15' }]}>
                      <Ionicons name="people" size={14} color={groupColor} />
                      <Text style={[styles.groupMemberBadgeText, { color: groupColor }]}>
                        {groupContacts.length} {groupContacts.length === 1 ? 'member' : 'members'}
                      </Text>
                    </View>
                    
                    {/* Quick Actions */}
                    <TouchableOpacity
                      style={styles.groupQuickAction}
                      onPress={() => router.push(`/group/${group.id}`)}
                    >
                      <Ionicons name="person-add" size={18} color={COLORS.primary} />
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={styles.groupQuickAction}
                      onPress={() => {
                        setSelectedGroupForAction(group);
                        setShowGroupActionsModal(true);
                      }}
                    >
                      <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textLight} />
                    </TouchableOpacity>
                  </View>
                  
                  {/* Mini member avatars */}
                  {groupContacts.length > 0 && (
                    <View style={styles.groupMemberPreview}>
                      {groupContacts.slice(0, 5).map((contact, idx) => (
                        <View key={contact.id} style={[styles.groupMemberMiniAvatar, { marginLeft: idx > 0 ? -8 : 0, zIndex: 5 - idx }]}>
                          {contact.profile_picture ? (
                            <Image source={{ uri: contact.profile_picture }} style={styles.groupMemberMiniImg} />
                          ) : (
                            <View style={[styles.groupMemberMiniPlaceholder, { backgroundColor: groupColor }]}>
                              <Text style={styles.groupMemberMiniText}>{contact.name.charAt(0)}</Text>
                            </View>
                          )}
                        </View>
                      ))}
                      {groupContacts.length > 5 && (
                        <View style={[styles.groupMemberMiniAvatar, { marginLeft: -8, backgroundColor: COLORS.background }]}>
                          <Text style={styles.groupMemberMiniMoreText}>+{groupContacts.length - 5}</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      </View>
    );
  };

  const renderOldGroups = () => {
    // Filter groups by search query
    const filteredGroups = groups.filter(g => 
      g.name.toLowerCase().includes(groupSearchQuery.toLowerCase()) ||
      (g.description && g.description.toLowerCase().includes(groupSearchQuery.toLowerCase()))
    );
    
    return (
      <View style={{ flex: 1 }}>
        {/* Search bar for groups */}
        <View style={styles.searchWrapper}>
          <View style={styles.searchContainer}>
            <View style={styles.searchIconWrapper}>
              <Ionicons name="search" size={18} color={COLORS.primary} />
            </View>
            <TextInput
              style={styles.searchInput}
              placeholder={t('search') + ' ' + t('groups').toLowerCase() + '...'}
              placeholderTextColor={COLORS.textLight}
              value={groupSearchQuery}
              onChangeText={setGroupSearchQuery}
            />
            {groupSearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setGroupSearchQuery('')} style={styles.searchClearBtn}>
                <Ionicons name="close-circle" size={20} color={COLORS.textLight} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        
        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={false}
        >
          {filteredGroups.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconWrapper}>
                <LinearGradient colors={COLORS.primaryGradient} style={styles.emptyIconGradient}>
                  <Ionicons name="albums" size={40} color={COLORS.surface} />
                </LinearGradient>
              </View>
              <Text style={styles.emptyText}>{t('noGroupsCreated')}</Text>
              <Text style={styles.emptySubtext}>Organize your contacts into groups for easier management</Text>
            </View>
          ) : (
            filteredGroups.map((group) => {
              const groupContacts = contacts.filter(c => c.groups?.includes(group.id));
              return (
                <View key={group.id} style={styles.groupCard}>
                  <TouchableOpacity
                    style={styles.groupCardHeader}
                    onPress={() => router.push(`/group/${group.id}`)}
                    activeOpacity={0.7}
                  >
                    {group.profile_picture ? (
                      <Image source={{ uri: group.profile_picture }} style={styles.groupAvatar} />
                    ) : (
                      <LinearGradient 
                        colors={[group.color || COLORS.primary, (group.color || COLORS.primary) + 'CC']} 
                        style={styles.groupAvatarPlaceholder}
                      >
                        <Ionicons name="people" size={24} color={COLORS.surface} />
                      </LinearGradient>
                    )}
                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <Text style={styles.groupName}>{group.name}</Text>
                      {group.description && (
                        <Text style={styles.groupDescription} numberOfLines={1}>
                          {group.description}
                        </Text>
                      )}
                      <View style={styles.groupStats}>
                        <Ionicons name="people-outline" size={14} color={COLORS.primary} />
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
    try {
      await Clipboard.setStringAsync(message);
      triggerHaptic('success');
      Alert.alert('✓', 'Copied to clipboard - paste in WhatsApp or any app');
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      // Fallback for web
      // @ts-ignore
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(message);
        Alert.alert('✓', 'Copied to clipboard');
      }
    }
  };

  const renderDrafts = () => (
    <ScrollView 
      style={styles.content} 
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
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

  // Helper function to get birthday marked dates for calendar
  const getBirthdayMarkedDates = useMemo(() => {
    const markedDates: { [key: string]: any } = {};
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    
    contacts.forEach(contact => {
      if (contact.birthday) {
        try {
          // Parse birthday - can be in various formats
          let month: number | null = null;
          let day: number | null = null;
          
          // Try parsing different date formats: YYYY-MM-DD, MM/DD/YYYY, etc.
          if (contact.birthday.includes('-')) {
            const parts = contact.birthday.split('-');
            if (parts.length >= 3) {
              // YYYY-MM-DD format
              month = parseInt(parts[1]);
              day = parseInt(parts[2]);
            } else if (parts.length === 2) {
              // MM-DD format
              month = parseInt(parts[0]);
              day = parseInt(parts[1]);
            }
          } else if (contact.birthday.includes('/')) {
            const parts = contact.birthday.split('/');
            if (parts.length >= 2) {
              // MM/DD/YYYY or MM/DD format
              month = parseInt(parts[0]);
              day = parseInt(parts[1]);
            }
          }
          
          if (month && day && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            // Create date for current year
            const monthStr = month.toString().padStart(2, '0');
            const dayStr = day.toString().padStart(2, '0');
            const dateKey = `${currentYear}-${monthStr}-${dayStr}`;
            const nextYearKey = `${nextYear}-${monthStr}-${dayStr}`;
            
            // Add for current year
            if (!markedDates[dateKey]) {
              markedDates[dateKey] = {
                marked: true,
                customStyles: {
                  container: { backgroundColor: COLORS.accent + '25', borderRadius: 8 },
                  text: { color: COLORS.accent, fontWeight: '700' }
                },
                contacts: []
              };
            }
            markedDates[dateKey].contacts.push(contact);
            
            // Add for next year too
            if (!markedDates[nextYearKey]) {
              markedDates[nextYearKey] = {
                marked: true,
                customStyles: {
                  container: { backgroundColor: COLORS.accent + '25', borderRadius: 8 },
                  text: { color: COLORS.accent, fontWeight: '700' }
                },
                contacts: []
              };
            }
            markedDates[nextYearKey].contacts.push(contact);
          }
        } catch (e) {
          // Skip invalid dates
          console.log('Could not parse birthday:', contact.birthday);
        }
      }
    });
    
    console.log(`Found ${Object.keys(markedDates).length} dates with birthdays`);
    return markedDates;
  }, [contacts]);
  
  // Get contacts with birthdays on selected date
  const getContactsForDate = (dateString: string) => {
    const markedDate = getBirthdayMarkedDates[dateString];
    return markedDate?.contacts || [];
  };
  
  // Get upcoming birthdays sorted by days until
  const upcomingBirthdays = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    
    return contacts
      .filter(c => c.birthday)
      .map(contact => {
        let month: number | null = null;
        let day: number | null = null;
        
        if (contact.birthday?.includes('-')) {
          const parts = contact.birthday.split('-');
          if (parts.length >= 3) {
            month = parseInt(parts[1]);
            day = parseInt(parts[2]);
          }
        } else if (contact.birthday?.includes('/')) {
          const parts = contact.birthday.split('/');
          if (parts.length >= 2) {
            month = parseInt(parts[0]);
            day = parseInt(parts[1]);
          }
        }
        
        if (!month || !day) return null;
        
        let birthdayThisYear = new Date(currentYear, month - 1, day);
        if (birthdayThisYear < now) {
          birthdayThisYear = new Date(currentYear + 1, month - 1, day);
        }
        
        const daysUntil = Math.ceil((birthdayThisYear.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        return { contact, daysUntil, date: birthdayThisYear };
      })
      .filter(Boolean)
      .sort((a, b) => (a?.daysUntil || 999) - (b?.daysUntil || 999))
      .slice(0, 10);
  }, [contacts]);

  // Generate AI morning briefing
  const generateAIBriefing = async () => {
    setLoadingBriefing(true);
    try {
      const response = await axios.post(`${EXPO_PUBLIC_BACKEND_URL}/api/morning-briefing/generate`, {}, getAuthHeaders());
      setMorningBriefing(response.data);
      triggerHaptic('success');
    } catch (error) {
      console.error('Error generating AI briefing:', error);
      Alert.alert('Error', 'Failed to generate AI briefing');
    } finally {
      setLoadingBriefing(false);
    }
  };

  const renderMorningBriefing = () => {
    // Calculate contacts to reach out to
    const overdueContacts = contacts.filter(c => {
      if (c.pipeline_stage === 'New') return false;
      const days = getDaysUntilDue(c.next_due);
      return days !== null && days < 0;
    });
    
    // Due today: contacts where days <= 1 (today or tomorrow)
    const dueTodayContacts = contacts.filter(c => {
      if (c.pipeline_stage === 'New') return false;
      const days = getDaysUntilDue(c.next_due);
      return days !== null && days >= 0 && days <= 1;
    });
    
    const dueThisWeekContacts = contacts.filter(c => {
      if (c.pipeline_stage === 'New') return false;
      const days = getDaysUntilDue(c.next_due);
      return days !== null && days > 1 && days <= 7;
    });
    
    const todayBirthdays = upcomingBirthdays.filter(b => b.daysUntil === 0);
    
    const today = new Date();
    const dateOptions: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const formattedDate = today.toLocaleDateString('en-US', dateOptions);
    
    // Get current tab contacts
    const getTabContacts = () => {
      switch (briefingTab) {
        case 'overdue': return overdueContacts;
        case 'today': return dueTodayContacts;
        case 'week': return dueThisWeekContacts;
        default: return dueTodayContacts;
      }
    };
    
    const currentTabContacts = getTabContacts();

    // Generate draft for a contact
    const handleGenerateDraft = async (contactId: string) => {
      setGeneratingDraftForId(contactId);
      try {
        await axios.post(`${EXPO_PUBLIC_BACKEND_URL}/api/drafts/generate/${contactId}`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        await fetchDrafts();
        Alert.alert('✓ Draft Created', 'AI draft has been generated and saved to Drafts!');
      } catch (error) {
        Alert.alert('Error', 'Failed to generate draft');
      } finally {
        setGeneratingDraftForId(null);
      }
    };

    // Render contact card with draft button
    const renderBriefingContact = (contact: Contact, index: number) => {
      const days = getDaysUntilDue(contact.next_due) || 0;
      const isGenerating = generatingDraftForId === contact.id;
      const daysText = briefingTab === 'overdue' 
        ? `${Math.abs(days)} days overdue` 
        : briefingTab === 'today' 
          ? 'Due today' 
          : `in ${days} days`;
      
      return (
        <View key={contact.id} style={styles.briefingContactCardNew}>
          <TouchableOpacity 
            style={styles.briefingContactMain}
            onPress={() => router.push(`/contact/${contact.id}`)}
            onLongPress={() => handleLongPressContact(contact)}
            delayLongPress={400}
          >
            {contact.profile_picture ? (
              <Image source={{ uri: contact.profile_picture }} style={styles.briefingContactAvatar} />
            ) : (
              <View style={[styles.briefingContactAvatarPlaceholder, { 
                backgroundColor: briefingTab === 'overdue' ? COLORS.accent + '20' : 
                  briefingTab === 'today' ? COLORS.warning + '20' : COLORS.primary + '20' 
              }]}>
                <Text style={[styles.briefingContactAvatarText, { 
                  color: briefingTab === 'overdue' ? COLORS.accent : 
                    briefingTab === 'today' ? COLORS.warning : COLORS.primary 
                }]}>
                  {contact.name.charAt(0)}
                </Text>
              </View>
            )}
            <View style={styles.briefingContactInfo}>
              <Text style={styles.briefingContactName}>{contact.name}</Text>
              <Text style={styles.briefingContactMeta}>{contact.pipeline_stage} • {daysText}</Text>
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.briefingDraftButton, isGenerating && styles.briefingDraftButtonLoading]}
            onPress={() => handleGenerateDraft(contact.id)}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="sparkles" size={14} color="#fff" />
                <Text style={styles.briefingDraftButtonText}>Draft</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      );
    };
    
    return (
      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Greeting Card */}
        <LinearGradient 
          colors={['#5D3FD3', '#7B68EE']} 
          style={styles.briefingGreetingCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Ionicons name="sunny" size={36} color="#fff" />
          <View style={styles.briefingGreetingText}>
            <Text style={styles.briefingGreetingTitle}>Good Morning!</Text>
            <Text style={styles.briefingGreetingDate}>{formattedDate}</Text>
          </View>
          <TouchableOpacity 
            style={styles.briefingSettingsBtn}
            onPress={() => router.push('/briefing-settings')}
          >
            <Ionicons name="settings-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </LinearGradient>

        {/* AI Briefing Card */}
        <View style={styles.aiBriefingCard}>
          <View style={styles.aiBriefingHeader}>
            <View style={styles.aiBriefingHeaderLeft}>
              <LinearGradient colors={['#5D3FD3', '#7B68EE']} style={styles.aiBriefingIcon}>
                <Ionicons name="sparkles" size={18} color="#fff" />
              </LinearGradient>
              <Text style={styles.aiBriefingTitle}>AI Daily Briefing</Text>
            </View>
            <TouchableOpacity
              style={styles.aiBriefingRefreshBtn}
              onPress={generateAIBriefing}
              disabled={loadingBriefing}
            >
              {loadingBriefing ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Ionicons name="refresh" size={20} color={COLORS.primary} />
              )}
            </TouchableOpacity>
          </View>
          
          {morningBriefing ? (
            <View style={styles.aiBriefingContent}>
              <Text style={styles.aiBriefingText}>{morningBriefing.briefing}</Text>
              
              {/* Stats Row */}
              <View style={styles.aiBriefingStats}>
                {morningBriefing.stats?.overdue_count > 0 && (
                  <View style={[styles.aiBriefingStat, { backgroundColor: COLORS.accent + '15' }]}>
                    <Ionicons name="alert-circle" size={14} color={COLORS.accent} />
                    <Text style={[styles.aiBriefingStatText, { color: COLORS.accent }]}>
                      {morningBriefing.stats.overdue_count} overdue
                    </Text>
                  </View>
                )}
                {morningBriefing.stats?.due_today_count > 0 && (
                  <View style={[styles.aiBriefingStat, { backgroundColor: COLORS.warning + '15' }]}>
                    <Ionicons name="today" size={14} color={COLORS.warning} />
                    <Text style={[styles.aiBriefingStatText, { color: COLORS.warning }]}>
                      {morningBriefing.stats.due_today_count} today
                    </Text>
                  </View>
                )}
                {morningBriefing.stats?.birthdays_today > 0 && (
                  <View style={[styles.aiBriefingStat, { backgroundColor: '#FF69B4' + '15' }]}>
                    <Ionicons name="gift" size={14} color="#FF69B4" />
                    <Text style={[styles.aiBriefingStatText, { color: '#FF69B4' }]}>
                      {morningBriefing.stats.birthdays_today} birthday
                    </Text>
                  </View>
                )}
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.aiBriefingEmpty} onPress={generateAIBriefing}>
              <Text style={styles.aiBriefingEmptyText}>
                Tap to generate your personalized daily briefing
              </Text>
              <LinearGradient colors={COLORS.primaryGradient} style={styles.aiBriefingGenerateBtn}>
                <Ionicons name="sparkles" size={16} color="#fff" />
                <Text style={styles.aiBriefingGenerateBtnText}>Generate Briefing</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
        
        {/* Tab Navigation */}
        <View style={styles.briefingTabsContainer}>
          <TouchableOpacity 
            style={[styles.briefingTabButton, briefingTab === 'overdue' && styles.briefingTabButtonActive, 
              briefingTab === 'overdue' && { backgroundColor: COLORS.accent + '20', borderColor: COLORS.accent }]}
            onPress={() => setBriefingTab('overdue')}
          >
            <Ionicons name="alert-circle" size={16} color={briefingTab === 'overdue' ? COLORS.accent : COLORS.textLight} />
            <Text style={[styles.briefingTabLabel, briefingTab === 'overdue' && { color: COLORS.accent }]}>
              Overdue
            </Text>
            <View style={[styles.briefingTabBadge, { backgroundColor: COLORS.accent }]}>
              <Text style={styles.briefingTabBadgeText}>{overdueContacts.length}</Text>
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.briefingTabButton, briefingTab === 'today' && styles.briefingTabButtonActive,
              briefingTab === 'today' && { backgroundColor: COLORS.warning + '20', borderColor: COLORS.warning }]}
            onPress={() => setBriefingTab('today')}
          >
            <Ionicons name="today" size={16} color={briefingTab === 'today' ? COLORS.warning : COLORS.textLight} />
            <Text style={[styles.briefingTabLabel, briefingTab === 'today' && { color: COLORS.warning }]}>
              Today
            </Text>
            <View style={[styles.briefingTabBadge, { backgroundColor: COLORS.warning }]}>
              <Text style={styles.briefingTabBadgeText}>{dueTodayContacts.length}</Text>
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.briefingTabButton, briefingTab === 'week' && styles.briefingTabButtonActive,
              briefingTab === 'week' && { backgroundColor: COLORS.primary + '20', borderColor: COLORS.primary }]}
            onPress={() => setBriefingTab('week')}
          >
            <Ionicons name="calendar" size={16} color={briefingTab === 'week' ? COLORS.primary : COLORS.textLight} />
            <Text style={[styles.briefingTabLabel, briefingTab === 'week' && { color: COLORS.primary }]}>
              Week
            </Text>
            <View style={[styles.briefingTabBadge, { backgroundColor: COLORS.primary }]}>
              <Text style={styles.briefingTabBadgeText}>{dueThisWeekContacts.length}</Text>
            </View>
          </TouchableOpacity>
        </View>
        
        {/* Contacts List */}
        <View style={styles.briefingContactsList}>
          {currentTabContacts.length === 0 ? (
            <View style={styles.briefingEmptyState}>
              <Ionicons 
                name={briefingTab === 'overdue' ? 'checkmark-circle' : 'calendar-outline'} 
                size={48} 
                color={COLORS.success} 
              />
              <Text style={styles.briefingEmptyTitle}>
                {briefingTab === 'overdue' ? 'No overdue contacts!' : 
                  briefingTab === 'today' ? 'No contacts due today' : 'No contacts this week'}
              </Text>
              <Text style={styles.briefingEmptyText}>
                {briefingTab === 'overdue' ? 'Great job staying on top of your network!' : 
                  'You\'re all caught up!'}
              </Text>
            </View>
          ) : (
            currentTabContacts.map((contact, index) => renderBriefingContact(contact, index))
          )}
        </View>
        
        {/* Birthdays Today */}
        {todayBirthdays.length > 0 && (
          <View style={styles.briefingSection}>
            <View style={styles.briefingSectionHeader}>
              <View style={[styles.briefingSectionIcon, { backgroundColor: '#FF69B4' + '15' }]}>
                <Ionicons name="gift" size={18} color="#FF69B4" />
              </View>
              <Text style={styles.briefingSectionTitle}>Birthdays Today!</Text>
            </View>
            
            {todayBirthdays.map(({ contact }) => (
              <TouchableOpacity 
                key={contact.id} 
                style={[styles.briefingContactCard, { backgroundColor: '#FF69B4' + '08' }]}
                onPress={() => router.push(`/contact/${contact.id}`)}
              >
                {contact.profile_picture ? (
                  <Image source={{ uri: contact.profile_picture }} style={styles.briefingContactAvatar} />
                ) : (
                  <View style={[styles.briefingContactAvatarPlaceholder, { backgroundColor: '#FF69B4' + '20' }]}>
                    <Text style={[styles.briefingContactAvatarText, { color: '#FF69B4' }]}>
                      {contact.name.charAt(0)}
                    </Text>
                  </View>
                )}
                <View style={styles.briefingContactInfo}>
                  <Text style={styles.briefingContactName}>{contact.name}</Text>
                  <Text style={styles.briefingContactMeta}>Birthday today! 🎂</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
              </TouchableOpacity>
            ))}
          </View>
        )}
        
        <View style={{ height: 100 }} />
      </ScrollView>
    );
  };

  const renderPlanner = () => (
    <View style={{ flex: 1 }}>
      {/* Sub-tab navigation */}
      <View style={styles.plannerSubTabs}>
        <TouchableOpacity
          style={[styles.plannerSubTabButton, plannerSubTab === 'briefing' && styles.plannerSubTabButtonActive]}
          onPress={() => setPlannerSubTab('briefing')}
        >
          <Ionicons name="sunny" size={18} color={plannerSubTab === 'briefing' ? COLORS.surface : COLORS.primary} />
          <Text style={[styles.plannerSubTabText, plannerSubTab === 'briefing' && styles.plannerSubTabTextActive]}>
            Briefing
          </Text>
          {contacts.filter(c => {
            if (c.pipeline_stage === 'New') return false;
            const days = getDaysUntilDue(c.next_due);
            return days !== null && days <= 0;
          }).length > 0 && (
            <View style={[styles.plannerBadge, { backgroundColor: COLORS.accent }]}>
              <Text style={styles.plannerBadgeText}>
                {contacts.filter(c => {
                  if (c.pipeline_stage === 'New') return false;
                  const days = getDaysUntilDue(c.next_due);
                  return days !== null && days <= 0;
                }).length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.plannerSubTabButton, plannerSubTab === 'calendar' && styles.plannerSubTabButtonActive]}
          onPress={() => setPlannerSubTab('calendar')}
        >
          <Ionicons name="calendar" size={18} color={plannerSubTab === 'calendar' ? COLORS.surface : COLORS.primary} />
          <Text style={[styles.plannerSubTabText, plannerSubTab === 'calendar' && styles.plannerSubTabTextActive]}>
            Calendar
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.plannerSubTabButton, plannerSubTab === 'drafts' && styles.plannerSubTabButtonActive]}
          onPress={() => setPlannerSubTab('drafts')}
        >
          <Ionicons name="sparkles" size={18} color={plannerSubTab === 'drafts' ? COLORS.surface : COLORS.primary} />
          <Text style={[styles.plannerSubTabText, plannerSubTab === 'drafts' && styles.plannerSubTabTextActive]}>
            Drafts
          </Text>
          {drafts.length > 0 && (
            <View style={styles.plannerBadge}>
              <Text style={styles.plannerBadgeText}>{drafts.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
      
      {plannerSubTab === 'briefing' ? renderMorningBriefing() : plannerSubTab === 'calendar' ? (
        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Birthday Summary Card */}
          <View style={styles.birthdaySummaryCard}>
            <LinearGradient colors={['#FF69B4', '#FF1493']} style={styles.birthdaySummaryGradient}>
              <View style={styles.birthdaySummaryContent}>
                <Ionicons name="gift" size={28} color={COLORS.surface} />
                <View style={styles.birthdaySummaryText}>
                  <Text style={styles.birthdaySummaryTitle}>
                    {contacts.filter(c => c.birthday).length} Birthdays
                  </Text>
                  <Text style={styles.birthdaySummarySubtitle}>
                    {upcomingBirthdays.length > 0 && upcomingBirthdays[0]?.daysUntil === 0
                      ? `Today: ${upcomingBirthdays[0]?.contact.name}`
                      : upcomingBirthdays.length > 0
                        ? `Next in ${upcomingBirthdays[0]?.daysUntil} days`
                        : 'None recorded'}
                  </Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          {/* Calendar View Selector */}
          <View style={styles.calendarViewSelector}>
            {(['day', 'week', 'month'] as CalendarView[]).map((view) => (
              <TouchableOpacity
                key={view}
                style={[styles.calendarViewButton, calendarView === view && styles.calendarViewButtonActive]}
                onPress={() => {
                  if (view === 'day') {
                    setDayViewDate(selectedDate);
                    fetchDayEvents(selectedDate);
                  } else {
                    setCalendarView(view);
                  }
                }}
              >
                <Text style={[styles.calendarViewText, calendarView === view && styles.calendarViewTextActive]}>
                  {view === 'day' ? 'Day' : view === 'week' ? 'Week' : 'Month'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          
          {/* Calendar Component */}
          <View style={styles.calendarContainer}>
            {calendarView === 'month' && (
              <Calendar
                current={selectedDate}
                onDayPress={(day: any) => {
                  setSelectedDate(day.dateString);
                  // Open day view on double tap or long press
                }}
                onDayLongPress={(day: any) => {
                  setSelectedDate(day.dateString);
                  setDayViewDate(day.dateString);
                  fetchDayEvents(day.dateString);
                }}
                markingType="custom"
                markedDates={{
                  ...getBirthdayMarkedDates,
                  [selectedDate]: {
                    ...getBirthdayMarkedDates[selectedDate],
                    customStyles: {
                      container: { 
                        backgroundColor: getBirthdayMarkedDates[selectedDate] 
                          ? COLORS.primary 
                          : COLORS.primary,
                        borderRadius: 8,
                      },
                      text: { color: COLORS.surface, fontWeight: '700' }
                    }
                  }
                }}
                dayComponent={({ date, state, marking }: any) => {
                  const isSelected = date?.dateString === selectedDate;
                  const hasBirthday = getBirthdayMarkedDates[date?.dateString]?.contacts?.length > 0;
                  const birthdayCount = getBirthdayMarkedDates[date?.dateString]?.contacts?.length || 0;
                  const dateEvents = getEventsForDate(date?.dateString || '');
                  const hasEvents = dateEvents.length > 0;
                  
                  return (
                    <TouchableOpacity
                      onPress={() => setSelectedDate(date?.dateString)}
                      onLongPress={() => {
                        setSelectedDate(date?.dateString);
                        setDayViewDate(date?.dateString);
                        fetchDayEvents(date?.dateString);
                      }}
                      delayLongPress={300}
                      style={[
                        styles.calendarDayContainer,
                        isSelected && styles.calendarDaySelected,
                        hasBirthday && !isSelected && styles.calendarDayBirthday,
                      ]}
                    >
                      <Text style={[
                        styles.calendarDayText,
                        state === 'disabled' && styles.calendarDayTextDisabled,
                        isSelected && styles.calendarDayTextSelected,
                        hasBirthday && !isSelected && styles.calendarDayTextBirthday,
                        state === 'today' && !isSelected && styles.calendarDayTextToday,
                      ]}>
                        {date?.day}
                      </Text>
                      {/* Show dots for birthdays and events */}
                      <View style={styles.calendarEventDots}>
                        {hasBirthday && (
                          <View style={[styles.calendarEventDot, { backgroundColor: isSelected ? '#fff' : '#FF69B4' }]} />
                        )}
                        {hasEvents && dateEvents.slice(0, 2).map((event, idx) => (
                          <View key={idx} style={[styles.calendarEventDot, { backgroundColor: isSelected ? '#fff' : event.color }]} />
                        ))}
                      </View>
                    </TouchableOpacity>
                  );
                }}
                theme={{
                  backgroundColor: COLORS.surface,
                  calendarBackground: COLORS.surface,
                  textSectionTitleColor: COLORS.textLight,
                  arrowColor: COLORS.primary,
                  monthTextColor: COLORS.text,
                  textMonthFontWeight: '700',
                  textDayHeaderFontWeight: '600',
                }}
                style={styles.calendar}
              />
            )}
            
            {calendarView === 'week' && (
              <Calendar
                current={selectedDate}
                onDayPress={(day: any) => setSelectedDate(day.dateString)}
                hideExtraDays={true}
                dayComponent={({ date, state }: any) => {
                  const isSelected = date?.dateString === selectedDate;
                  const hasBirthday = getBirthdayMarkedDates[date?.dateString]?.contacts?.length > 0;
                  
                  return (
                    <TouchableOpacity
                      onPress={() => setSelectedDate(date?.dateString)}
                      style={[
                        styles.calendarDayContainer,
                        isSelected && styles.calendarDaySelected,
                        hasBirthday && !isSelected && styles.calendarDayBirthday,
                      ]}
                    >
                      <Text style={[
                        styles.calendarDayText,
                        state === 'disabled' && styles.calendarDayTextDisabled,
                        isSelected && styles.calendarDayTextSelected,
                        hasBirthday && !isSelected && styles.calendarDayTextBirthday,
                      ]}>
                        {date?.day}
                      </Text>
                      {hasBirthday && (
                        <View style={[styles.birthdayDot, isSelected && styles.birthdayDotSelected]} />
                      )}
                    </TouchableOpacity>
                  );
                }}
                theme={{
                  backgroundColor: COLORS.surface,
                  calendarBackground: COLORS.surface,
                  textSectionTitleColor: COLORS.textLight,
                  selectedDayBackgroundColor: COLORS.primary,
                  selectedDayTextColor: COLORS.surface,
                  todayTextColor: COLORS.primary,
                  dayTextColor: COLORS.text,
                  textDisabledColor: COLORS.textLight,
                  dotColor: COLORS.accent,
                  selectedDotColor: COLORS.surface,
                  arrowColor: COLORS.primary,
                  monthTextColor: COLORS.text,
                  textDayFontWeight: '500',
                  textMonthFontWeight: '700',
                  textDayHeaderFontWeight: '600',
                }}
                style={styles.calendar}
              />
            )}
          </View>
          
          {/* Selected Date Birthdays */}
          <View style={styles.birthdaySection}>
            <Text style={styles.birthdaySectionTitle}>
              <Ionicons name="gift" size={18} color={COLORS.accent} /> Geburtstage am {new Date(selectedDate).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}
            </Text>
            {getContactsForDate(selectedDate).length === 0 ? (
              <View style={styles.noBirthdayContainer}>
                <Ionicons name="calendar-outline" size={40} color={COLORS.textLight} />
                <Text style={styles.noBirthdayText}>Keine Geburtstage an diesem Tag</Text>
              </View>
            ) : (
              getContactsForDate(selectedDate).map((contact: Contact) => (
                <TouchableOpacity
                  key={contact.id}
                  style={styles.birthdayCard}
                  onPress={() => router.push(`/contact/${contact.id}`)}
                >
                  <View style={styles.birthdayCardLeft}>
                    {contact.profile_picture ? (
                      <Image source={{ uri: contact.profile_picture }} style={styles.birthdayAvatar} />
                    ) : (
                      <LinearGradient colors={COLORS.accentGradient} style={styles.birthdayAvatarPlaceholder}>
                        <Text style={styles.birthdayAvatarText}>{contact.name.charAt(0)}</Text>
                      </LinearGradient>
                    )}
                    <View style={styles.birthdayInfo}>
                      <Text style={styles.birthdayName}>{contact.name}</Text>
                      <Text style={styles.birthdayDate}>
                        <Ionicons name="gift-outline" size={12} color={COLORS.accent} /> Geburtstag
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.birthdayDraftButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      generateDraft(contact.id, contact.name);
                    }}
                  >
                    <Ionicons name="sparkles" size={18} color={COLORS.primary} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))
            )}
          </View>
          
          {/* Selected Date Events */}
          <View style={styles.birthdaySection}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={styles.birthdaySectionTitle}>
                <Ionicons name="calendar" size={18} color={COLORS.primary} /> Termine am {new Date(selectedDate).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}
              </Text>
              <TouchableOpacity 
                onPress={() => {
                  setNewEventData(prev => ({ ...prev, date: selectedDate }));
                  setShowCreateEventModal(true);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <Ionicons name="add-circle" size={24} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
            {getEventsForDate(selectedDate).length === 0 ? (
              <View style={styles.noBirthdayContainer}>
                <Ionicons name="time-outline" size={40} color={COLORS.textLight} />
                <Text style={styles.noBirthdayText}>Keine Termine</Text>
                <TouchableOpacity 
                  onPress={() => {
                    setNewEventData(prev => ({ ...prev, date: selectedDate }));
                    setShowCreateEventModal(true);
                  }}
                  style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.primary + '15', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 }}
                >
                  <Ionicons name="add" size={18} color={COLORS.primary} />
                  <Text style={{ color: COLORS.primary, fontWeight: '600' }}>Termin erstellen</Text>
                </TouchableOpacity>
              </View>
            ) : (
              getEventsForDate(selectedDate).map((event: CalendarEvent) => (
                <View key={event.id} style={[styles.birthdayCard, { borderLeftWidth: 4, borderLeftColor: event.color }]}>
                  <View style={styles.birthdayCardLeft}>
                    <View style={[styles.birthdayAvatarPlaceholder, { backgroundColor: event.color + '20' }]}>
                      <Ionicons name="calendar" size={20} color={event.color} />
                    </View>
                    <View style={styles.birthdayInfo}>
                      <Text style={styles.birthdayName}>{event.title}</Text>
                      <Text style={styles.birthdayDate}>
                        <Ionicons name="time-outline" size={12} color={COLORS.textLight} /> {event.all_day ? 'Ganztägig' : `${event.start_time}${event.end_time ? ` - ${event.end_time}` : ''}`}
                      </Text>
                      {event.participant_details && event.participant_details.length > 0 && (
                        <Text style={[styles.birthdayDate, { marginTop: 2 }]}>
                          <Ionicons name="people-outline" size={12} color={COLORS.textLight} /> {event.participant_details.map(p => p.name).join(', ')}
                        </Text>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.birthdayDraftButton}
                    onPress={() => deleteCalendarEvent(event.id)}
                  >
                    <Ionicons name="trash-outline" size={18} color={COLORS.accent} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
          
          {/* Upcoming Birthdays */}
          <View style={styles.birthdaySection}>
            <Text style={styles.birthdaySectionTitle}>
              <Ionicons name="calendar" size={18} color={COLORS.primary} /> Upcoming Birthdays
            </Text>
            {upcomingBirthdays.length === 0 ? (
              <View style={styles.noBirthdayContainer}>
                <Ionicons name="gift-outline" size={40} color={COLORS.textLight} />
                <Text style={styles.noBirthdayText}>No birthdays recorded</Text>
                <Text style={styles.noBirthdayHint}>Add birthdays to your contacts</Text>
              </View>
            ) : (
              upcomingBirthdays.map((item) => {
                if (!item) return null;
                const { contact, daysUntil, date } = item;
                
                return (
                  <TouchableOpacity
                    key={contact.id}
                    style={styles.upcomingBirthdayCard}
                    onPress={() => router.push(`/contact/${contact.id}`)}
                  >
                    {contact.profile_picture ? (
                      <Image source={{ uri: contact.profile_picture }} style={styles.upcomingAvatar} />
                    ) : (
                      <LinearGradient colors={COLORS.accentGradient} style={styles.upcomingAvatarPlaceholder}>
                        <Text style={styles.upcomingAvatarText}>{contact.name.charAt(0)}</Text>
                      </LinearGradient>
                    )}
                    <View style={styles.upcomingInfo}>
                      <Text style={styles.upcomingName}>{contact.name}</Text>
                      <Text style={styles.upcomingDate}>
                        {date.toLocaleDateString('en-US', { day: 'numeric', month: 'long' })}
                      </Text>
                    </View>
                    <View style={[
                      styles.upcomingBadge, 
                      daysUntil <= 7 && styles.upcomingBadgeSoon,
                      daysUntil === 0 && styles.upcomingBadgeToday
                    ]}>
                      <Text style={[
                        styles.upcomingBadgeText, 
                        daysUntil <= 7 && styles.upcomingBadgeTextSoon,
                        daysUntil === 0 && styles.upcomingBadgeTextToday
                      ]}>
                        {daysUntil === 0 ? '🎂 Today!' : daysUntil === 1 ? 'Tomorrow' : `in ${daysUntil}d`}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
          <View style={{ height: 120 }} />
        </ScrollView>
      ) : (
        renderDrafts()
      )}
    </View>
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

      <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/briefing-settings')}>
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
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <Pressable style={styles.container} onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          {/* Enhanced Header with Gradient and Logo */}
          <LinearGradient
            colors={['#5D3FD3', '#7B68EE']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <SafeAreaView edges={['top']}>
              <View style={styles.header}>
                <View style={styles.headerContent}>
                  <View style={styles.headerLogoContainer}>
                    <Image 
                      source={require('../assets/images/convo-logo.png')} 
                      style={styles.headerLogo}
                      resizeMode="contain"
                    />
                    <View style={styles.headerTextContainer}>
                      <Text style={styles.headerTitle}>Convo</Text>
                      <Text style={styles.headerSubtitle}>
                        {activeTab === 'pipeline' && 'Organize by frequency'}
                        {activeTab === 'contacts' && `${contacts.length} contacts`}
                        {activeTab === 'groups' && `${groups.length} groups`}
                        {activeTab === 'planner' && (plannerSubTab === 'calendar' ? 'Birthdays & Events' : `${drafts.length} AI drafts`)}
                        {activeTab === 'profile' && 'Your profile'}
                      </Text>
                    </View>
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
      {activeTab === 'planner' && renderPlanner()}
      {activeTab === 'profile' && renderProfile()}

      {/* Enhanced FAB with gradient - Contacts */}
      {activeTab === 'contacts' && (
        <TouchableOpacity style={styles.fabWrapper} onPress={() => router.push('/contact/new')} activeOpacity={0.9}>
          <LinearGradient colors={COLORS.primaryGradient} style={styles.fab}>
            <Ionicons name="add" size={28} color={COLORS.surface} />
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Enhanced FAB with gradient - Groups */}
      {activeTab === 'groups' && (
        <TouchableOpacity style={styles.fabWrapper} onPress={() => setShowCreateGroupModal(true)} activeOpacity={0.9}>
          <LinearGradient colors={COLORS.primaryGradient} style={styles.fab}>
            <Ionicons name="add" size={28} color={COLORS.surface} />
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* FAB for Calendar - Create Event */}
      {activeTab === 'planner' && plannerSubTab === 'calendar' && (
        <TouchableOpacity style={styles.fabWrapper} onPress={() => {
          setNewEventData(prev => ({ ...prev, date: selectedDate }));
          setShowCreateEventModal(true);
        }} activeOpacity={0.9}>
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
            { key: 'planner', icon: 'calendar', label: 'Planner' },
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
                  {pipelineStages.map((stage) => {
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

      {/* Create Group Modal */}
      <Modal
        visible={showCreateGroupModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateGroupModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowCreateGroupModal(false)}>
          <Pressable style={styles.createGroupModal} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Create New Group</Text>
            
            <View style={styles.createGroupForm}>
              <Text style={styles.createGroupLabel}>Group Name *</Text>
              <TextInput
                style={styles.createGroupInput}
                placeholder="e.g., Work, University, Tennis Club"
                placeholderTextColor={COLORS.textLight}
                value={newGroupData.name}
                onChangeText={(text) => setNewGroupData(prev => ({ ...prev, name: text }))}
              />
              
              <Text style={styles.createGroupLabel}>Description</Text>
              <TextInput
                style={[styles.createGroupInput, styles.createGroupTextArea]}
                placeholder="Add a description for this group..."
                placeholderTextColor={COLORS.textLight}
                value={newGroupData.description}
                onChangeText={(text) => setNewGroupData(prev => ({ ...prev, description: text }))}
                multiline
                numberOfLines={3}
              />
              
              <Text style={styles.createGroupLabel}>Color</Text>
              <View style={styles.colorPicker}>
                {groupColors.map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      newGroupData.color === color && styles.colorOptionSelected,
                    ]}
                    onPress={() => setNewGroupData(prev => ({ ...prev, color }))}
                  >
                    {newGroupData.color === color && (
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            
            <TouchableOpacity 
              style={styles.createGroupButton}
              onPress={handleCreateGroup}
            >
              <LinearGradient colors={COLORS.primaryGradient} style={styles.createGroupButtonGradient}>
                <Ionicons name="add-circle" size={20} color="#fff" />
                <Text style={styles.createGroupButtonText}>Create Group</Text>
              </LinearGradient>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setShowCreateGroupModal(false)}
            >
              <Text style={styles.modalCloseButtonText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Group Actions Modal */}
      <Modal
        visible={showGroupActionsModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowGroupActionsModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowGroupActionsModal(false)}>
          <Pressable style={styles.groupActionsModal} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            
            {selectedGroupForAction && (
              <>
                <View style={styles.groupActionHeader}>
                  <LinearGradient 
                    colors={[selectedGroupForAction.color || COLORS.primary, (selectedGroupForAction.color || COLORS.primary) + 'CC']} 
                    style={styles.groupActionAvatar}
                  >
                    <Ionicons name="people" size={28} color="#fff" />
                  </LinearGradient>
                  <Text style={styles.groupActionTitle}>{selectedGroupForAction.name}</Text>
                </View>
                
                <View style={styles.groupActionButtons}>
                  <TouchableOpacity
                    style={styles.groupActionBtn}
                    onPress={() => {
                      setShowGroupActionsModal(false);
                      router.push(`/group/${selectedGroupForAction.id}`);
                    }}
                  >
                    <View style={[styles.groupActionBtnIcon, { backgroundColor: COLORS.primary + '15' }]}>
                      <Ionicons name="pencil" size={20} color={COLORS.primary} />
                    </View>
                    <Text style={styles.groupActionBtnText}>Edit Group</Text>
                    <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.groupActionBtn}
                    onPress={() => {
                      setShowGroupActionsModal(false);
                      router.push(`/group/${selectedGroupForAction.id}`);
                    }}
                  >
                    <View style={[styles.groupActionBtnIcon, { backgroundColor: '#10B981' + '15' }]}>
                      <Ionicons name="person-add" size={20} color="#10B981" />
                    </View>
                    <Text style={styles.groupActionBtnText}>Add Members</Text>
                    <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.groupActionBtn}
                    onPress={() => handleDeleteGroup(selectedGroupForAction.id, selectedGroupForAction.name)}
                  >
                    <View style={[styles.groupActionBtnIcon, { backgroundColor: COLORS.accent + '15' }]}>
                      <Ionicons name="trash" size={20} color={COLORS.accent} />
                    </View>
                    <Text style={[styles.groupActionBtnText, { color: COLORS.accent }]}>Delete Group</Text>
                    <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
                  </TouchableOpacity>
                </View>
              </>
            )}
            
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setShowGroupActionsModal(false)}
            >
              <Text style={styles.modalCloseButtonText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Create Calendar Event Modal */}
      <Modal
        visible={showCreateEventModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => !isCreatingEvent && setShowCreateEventModal(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={styles.modalOverlay} onPress={() => !isCreatingEvent && setShowCreateEventModal(false)}>
            <Pressable style={styles.createEventModal} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>New Event</Text>
              
              <ScrollView style={styles.createEventForm} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* Title */}
                <Text style={styles.createGroupLabel}>Title *</Text>
                <TextInput
                  style={styles.createGroupInput}
                  placeholder="Event title"
                  placeholderTextColor={COLORS.textLight}
                  value={newEventData.title}
                  onChangeText={(text) => setNewEventData(prev => ({ ...prev, title: text }))}
                  returnKeyType="next"
                />
                
                {/* Description */}
                <Text style={styles.createGroupLabel}>Description</Text>
                <TextInput
                  style={[styles.createGroupInput, { height: 70, textAlignVertical: 'top', paddingTop: 12 }]}
                  placeholder="Description (optional)"
                  placeholderTextColor={COLORS.textLight}
                  value={newEventData.description}
                  onChangeText={(text) => setNewEventData(prev => ({ ...prev, description: text }))}
                  multiline
                  numberOfLines={2}
                />
                
                {/* Date Picker */}
                <Text style={styles.createGroupLabel}>Date</Text>
                <TouchableOpacity 
                  style={[styles.createGroupInput, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={() => {
                    setShowCreateEventModal(false);
                    setTimeout(() => setShowDatePicker(true), 300);
                  }}
                >
                  <Text style={{ color: COLORS.text, fontSize: 16 }}>
                    {new Date(newEventData.date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                  </Text>
                  <Ionicons name="calendar" size={22} color={COLORS.primary} />
                </TouchableOpacity>
                
                {/* Time Row */}
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.createGroupLabel}>Start Time</Text>
                    <TextInput
                      style={styles.createGroupInput}
                      placeholder="09:00"
                      placeholderTextColor={COLORS.textLight}
                      value={newEventData.start_time}
                      onChangeText={(text) => setNewEventData(prev => ({ ...prev, start_time: text }))}
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.createGroupLabel}>End Time</Text>
                    <TextInput
                      style={styles.createGroupInput}
                      placeholder="10:00"
                      placeholderTextColor={COLORS.textLight}
                      value={newEventData.end_time}
                      onChangeText={(text) => setNewEventData(prev => ({ ...prev, end_time: text }))}
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                </View>
                
                {/* All Day Toggle */}
                <TouchableOpacity
                  style={[styles.createGroupInput, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={() => setNewEventData(prev => ({ ...prev, all_day: !prev.all_day }))}
                >
                  <Text style={{ color: COLORS.text, fontSize: 15 }}>All Day</Text>
                  <View style={[styles.toggle, newEventData.all_day && styles.toggleActive]}>
                    <View style={[styles.toggleThumb, newEventData.all_day && styles.toggleThumbActive]} />
                  </View>
                </TouchableOpacity>
                
                {/* Participants */}
                <Text style={styles.createGroupLabel}>Participants</Text>
                <TouchableOpacity
                  style={[styles.createGroupInput, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={() => {
                    setShowCreateEventModal(false);
                    setTimeout(() => setShowParticipantPicker(true), 300);
                  }}
                >
                  <Text style={{ color: newEventData.participants.length > 0 ? COLORS.text : COLORS.textLight, fontSize: 15 }}>
                    {newEventData.participants.length > 0 
                      ? `${newEventData.participants.length} contact(s) selected`
                      : 'Select contacts...'}
                  </Text>
                  <Ionicons name="people" size={22} color={COLORS.primary} />
                </TouchableOpacity>
                
                {/* Show selected participants */}
                {newEventData.participants.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 8 }}>
                    {newEventData.participants.map(pid => {
                      const contact = contacts.find(c => c.id === pid);
                      return contact ? (
                        <View key={pid} style={styles.participantChip}>
                          <Text style={styles.participantChipText}>{contact.name}</Text>
                          <TouchableOpacity 
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            onPress={() => {
                              setNewEventData(prev => ({
                                ...prev,
                                participants: prev.participants.filter(id => id !== pid)
                              }));
                            }}
                          >
                            <Ionicons name="close-circle" size={18} color={COLORS.primary} />
                          </TouchableOpacity>
                        </View>
                      ) : null;
                    })}
                  </View>
                )}
                
                {/* Color */}
                <Text style={styles.createGroupLabel}>Farbe</Text>
                <View style={styles.colorPicker}>
                  {['#5D3FD3', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899'].map((color) => (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.colorOption,
                        { backgroundColor: color },
                        newEventData.color === color && styles.colorOptionSelected,
                      ]}
                      onPress={() => setNewEventData(prev => ({ ...prev, color }))}
                    >
                      {newEventData.color === color && (
                        <Ionicons name="checkmark" size={16} color="#fff" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              
              <TouchableOpacity 
                style={[styles.createGroupButton, isCreatingEvent && { opacity: 0.6 }]}
                onPress={createCalendarEvent}
                disabled={isCreatingEvent}
              >
                <LinearGradient colors={COLORS.primaryGradient} style={styles.createGroupButtonGradient}>
                  {isCreatingEvent ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="calendar" size={20} color="#fff" />
                      <Text style={styles.createGroupButtonText}>Create Event</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.modalCloseButton}
                onPress={() => !isCreatingEvent && setShowCreateEventModal(false)}
                disabled={isCreatingEvent}
              >
                <Text style={styles.modalCloseButtonText}>{t('cancel')}</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Date Picker Modal */}
      <Modal
        visible={showDatePicker}
        animationType="fade"
        transparent={true}
        onRequestClose={() => {
          setShowDatePicker(false);
          setTimeout(() => setShowCreateEventModal(true), 300);
        }}
      >
        <Pressable style={styles.modalOverlay} onPress={() => {
          setShowDatePicker(false);
          setTimeout(() => setShowCreateEventModal(true), 300);
        }}>
          <Pressable style={[styles.createEventModal, { maxHeight: '70%' }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select Date</Text>
            
            <Calendar
              current={newEventData.date}
              onDayPress={(day: any) => {
                setNewEventData(prev => ({ ...prev, date: day.dateString }));
                setShowDatePicker(false);
                setTimeout(() => setShowCreateEventModal(true), 300);
              }}
              markedDates={{
                [newEventData.date]: { selected: true, selectedColor: COLORS.primary }
              }}
              theme={{
                backgroundColor: COLORS.surface,
                calendarBackground: COLORS.surface,
                textSectionTitleColor: COLORS.textLight,
                selectedDayBackgroundColor: COLORS.primary,
                selectedDayTextColor: '#fff',
                todayTextColor: COLORS.primary,
                dayTextColor: COLORS.text,
                textDisabledColor: COLORS.textLight,
                arrowColor: COLORS.primary,
                monthTextColor: COLORS.text,
                textMonthFontWeight: '700',
              }}
              style={{ borderRadius: 12 }}
            />
            
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => {
                setShowDatePicker(false);
                setTimeout(() => setShowCreateEventModal(true), 300);
              }}
            >
              <Text style={styles.modalCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Participant Picker Modal */}
      <Modal
        visible={showParticipantPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowParticipantPicker(false);
          setTimeout(() => setShowCreateEventModal(true), 300);
        }}
      >
        <Pressable style={styles.modalOverlay} onPress={() => {
          setShowParticipantPicker(false);
          setTimeout(() => setShowCreateEventModal(true), 300);
        }}>
          <Pressable style={styles.participantPickerModal} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select Contacts</Text>
            <Text style={{ color: COLORS.textLight, marginBottom: 12, textAlign: 'center' }}>
              {newEventData.participants.length} selected
            </Text>
            
            <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false}>
              {contacts.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Ionicons name="people-outline" size={48} color={COLORS.textLight} />
                  <Text style={{ color: COLORS.textLight, marginTop: 12 }}>No contacts available</Text>
                </View>
              ) : (
                contacts.slice(0, 50).map(contact => {
                  const isSelected = newEventData.participants.includes(contact.id);
                  return (
                    <TouchableOpacity
                      key={contact.id}
                      style={[styles.participantOption, isSelected && styles.participantOptionSelected]}
                      onPress={() => {
                        setNewEventData(prev => ({
                          ...prev,
                          participants: isSelected 
                            ? prev.participants.filter(id => id !== contact.id)
                            : [...prev.participants, contact.id]
                        }));
                      }}
                      activeOpacity={0.7}
                    >
                      {contact.profile_picture ? (
                        <Image source={{ uri: contact.profile_picture }} style={styles.participantAvatar} />
                      ) : (
                        <View style={[styles.participantAvatarPlaceholder, { backgroundColor: COLORS.primary + '20' }]}>
                          <Text style={{ color: COLORS.primary, fontWeight: '600', fontSize: 16 }}>{contact.name.charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                      <Text style={styles.participantName} numberOfLines={1}>{contact.name}</Text>
                      <View style={[
                        { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
                        isSelected 
                          ? { backgroundColor: COLORS.primary, borderColor: COLORS.primary }
                          : { backgroundColor: 'transparent', borderColor: COLORS.textLight }
                      ]}>
                        {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
            
            <TouchableOpacity 
              style={styles.createGroupButton}
              onPress={() => {
                setShowParticipantPicker(false);
                setTimeout(() => setShowCreateEventModal(true), 300);
              }}
            >
              <LinearGradient colors={COLORS.primaryGradient} style={styles.createGroupButtonGradient}>
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.createGroupButtonText}>
                  {newEventData.participants.length > 0 
                    ? `${newEventData.participants.length} participants selected`
                    : 'Done'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => {
                setShowParticipantPicker(false);
                setTimeout(() => setShowCreateEventModal(true), 300);
              }}
            >
              <Text style={styles.modalCloseButtonText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Day View Modal */}
      <Modal
        visible={dayViewDate !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDayViewDate(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setDayViewDate(null)}>
          <Pressable style={styles.dayViewModal} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <View style={styles.dayViewHeader}>
              <Text style={styles.dayViewTitle}>
                {dayViewDate ? new Date(dayViewDate).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }) : ''}
              </Text>
              <TouchableOpacity
                style={styles.dayViewAddBtn}
                onPress={() => {
                  setNewEventData(prev => ({ ...prev, date: dayViewDate || selectedDate }));
                  setDayViewDate(null);
                  setShowCreateEventModal(true);
                }}
              >
                <Ionicons name="add-circle" size={28} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={{ flex: 1 }}>
              {/* Birthdays on this day */}
              {dayViewDate && getContactsForDate(dayViewDate).length > 0 && (
                <View style={styles.dayViewSection}>
                  <Text style={styles.dayViewSectionTitle}>
                    <Ionicons name="gift" size={16} color="#FF69B4" /> Geburtstage
                  </Text>
                  {getContactsForDate(dayViewDate).map((contact: Contact) => (
                    <TouchableOpacity
                      key={contact.id}
                      style={styles.dayViewEventCard}
                      onPress={() => {
                        setDayViewDate(null);
                        router.push(`/contact/${contact.id}`);
                      }}
                    >
                      <View style={[styles.dayViewEventColor, { backgroundColor: '#FF69B4' }]} />
                      <View style={styles.dayViewEventInfo}>
                        <Text style={styles.dayViewEventTitle}>{contact.name}s Geburtstag</Text>
                        <Text style={styles.dayViewEventTime}>Ganztägig</Text>
                      </View>
                      <Ionicons name="gift" size={20} color="#FF69B4" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              
              {/* Events on this day */}
              <View style={styles.dayViewSection}>
                <Text style={styles.dayViewSectionTitle}>
                  <Ionicons name="calendar" size={16} color={COLORS.primary} /> Termine
                </Text>
                {dayViewEvents.length === 0 ? (
                  <View style={styles.dayViewEmpty}>
                    <Ionicons name="calendar-outline" size={40} color={COLORS.textLight} />
                    <Text style={styles.dayViewEmptyText}>Keine Termine</Text>
                  </View>
                ) : (
                  dayViewEvents.map(event => (
                    <View key={event.id} style={styles.dayViewEventCard}>
                      <View style={[styles.dayViewEventColor, { backgroundColor: event.color }]} />
                      <View style={styles.dayViewEventInfo}>
                        <Text style={styles.dayViewEventTitle}>{event.title}</Text>
                        <Text style={styles.dayViewEventTime}>
                          {event.all_day ? 'Ganztägig' : `${event.start_time}${event.end_time ? ` - ${event.end_time}` : ''}`}
                        </Text>
                        {event.participant_details && event.participant_details.length > 0 && (
                          <View style={{ flexDirection: 'row', marginTop: 4 }}>
                            <Ionicons name="people" size={14} color={COLORS.textLight} />
                            <Text style={styles.dayViewEventParticipants}>
                              {' '}{event.participant_details.map(p => p.name).join(', ')}
                            </Text>
                          </View>
                        )}
                      </View>
                      <TouchableOpacity onPress={() => deleteCalendarEvent(event.id)}>
                        <Ionicons name="trash-outline" size={20} color={COLORS.accent} />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
            
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setDayViewDate(null)}
            >
              <Text style={styles.modalCloseButtonText}>Schließen</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
        </View>
      </Pressable>
    </KeyboardAvoidingView>
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
  headerLogoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerLogo: {
    width: 44,
    height: 44,
    marginRight: 12,
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
  contactStageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 6,
    gap: 6,
  },
  contactStageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  contactStageText: {
    fontSize: 12,
    fontWeight: '600',
  },
  contactGroups: {
    fontSize: 12,
    color: COLORS.success,
    marginTop: 4,
  },
  draftButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dueBadge: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 12,
    gap: 6,
  },
  dueBadgeOverdue: {
    backgroundColor: COLORS.accent + '12',
  },
  dueText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textLight,
  },
  dueTextOverdue: {
    color: COLORS.accent,
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
    width: 52,
    height: 52,
    borderRadius: 18,
  },
  groupAvatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupName: {
    fontSize: 17,
    fontWeight: '700',
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
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '500',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
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
    marginVertical: 14,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
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
  
  // Planner Sub-tabs
  plannerSubTabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    padding: 8,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    gap: 8,
  },
  plannerSubTabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
    backgroundColor: 'transparent',
  },
  plannerSubTabButtonActive: {
    backgroundColor: COLORS.primary,
  },
  plannerSubTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  plannerSubTabTextActive: {
    color: COLORS.surface,
  },
  plannerBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  plannerBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.surface,
  },
  
  // Birthday Summary Card
  birthdaySummaryCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  birthdaySummaryGradient: {
    padding: 16,
  },
  birthdaySummaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  birthdaySummaryText: {
    marginLeft: 14,
    flex: 1,
  },
  birthdaySummaryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.surface,
  },
  birthdaySummarySubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  
  // Calendar Styles
  calendarViewSelector: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    padding: 6,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    gap: 4,
  },
  calendarViewButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  calendarViewButtonActive: {
    backgroundColor: COLORS.primary + '15',
  },
  calendarViewText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textLight,
  },
  calendarViewTextActive: {
    color: COLORS.primary,
  },
  calendarContainer: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    paddingVertical: 8,
  },
  calendar: {
    borderRadius: 20,
  },
  calendarList: {
    borderRadius: 20,
  },
  
  // Calendar Day Component Styles
  calendarDayContainer: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    position: 'relative',
  },
  calendarDaySelected: {
    backgroundColor: COLORS.primary,
  },
  calendarDayBirthday: {
    backgroundColor: COLORS.accent + '20',
  },
  calendarDayText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.text,
  },
  calendarDayTextDisabled: {
    color: COLORS.textLight,
  },
  calendarDayTextSelected: {
    color: COLORS.surface,
    fontWeight: '700',
  },
  calendarDayTextBirthday: {
    color: COLORS.accent,
    fontWeight: '700',
  },
  calendarDayTextToday: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  birthdayDot: {
    position: 'absolute',
    bottom: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  birthdayDotSelected: {
    backgroundColor: COLORS.surface,
  },
  birthdayDotText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.surface,
  },
  
  // Birthday Section
  birthdaySection: {
    marginTop: 24,
    marginHorizontal: 16,
  },
  birthdaySectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 16,
  },
  noBirthdayContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
  },
  noBirthdayText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 12,
  },
  noBirthdayHint: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 4,
  },
  birthdayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  birthdayCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  birthdayAvatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
  },
  birthdayAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  birthdayAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.surface,
  },
  birthdayInfo: {
    marginLeft: 14,
    flex: 1,
  },
  birthdayName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  birthdayDate: {
    fontSize: 13,
    color: COLORS.accent,
    marginTop: 4,
  },
  birthdayDraftButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Upcoming Birthdays
  upcomingBirthdayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  upcomingAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
  },
  upcomingAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  upcomingAvatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.surface,
  },
  upcomingInfo: {
    marginLeft: 12,
    flex: 1,
  },
  upcomingName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  upcomingDate: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  upcomingBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: COLORS.background,
  },
  upcomingBadgeSoon: {
    backgroundColor: COLORS.accent + '15',
  },
  upcomingBadgeToday: {
    backgroundColor: COLORS.accent,
  },
  upcomingBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textLight,
  },
  upcomingBadgeTextSoon: {
    color: COLORS.accent,
  },
  upcomingBadgeTextToday: {
    color: COLORS.surface,
  },
  
  // Morning Briefing Styles
  briefingGreetingCard: {
    padding: 20,
    borderRadius: 20,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  briefingGreetingText: {
    flex: 1,
  },
  briefingGreetingTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
  },
  briefingGreetingDate: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
    fontWeight: '500',
  },
  briefingSettingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // AI Briefing Card Styles
  aiBriefingCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    marginBottom: 16,
    padding: 16,
    shadowColor: '#5D3FD3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  aiBriefingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  aiBriefingHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  aiBriefingIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiBriefingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  aiBriefingRefreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiBriefingContent: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  aiBriefingText: {
    fontSize: 15,
    lineHeight: 24,
    color: COLORS.text,
    marginBottom: 12,
  },
  aiBriefingStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  aiBriefingStat: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  aiBriefingStatText: {
    fontSize: 12,
    fontWeight: '600',
  },
  aiBriefingEmpty: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  aiBriefingEmptyText: {
    fontSize: 14,
    color: COLORS.textLight,
    textAlign: 'center',
    marginBottom: 16,
  },
  aiBriefingGenerateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    gap: 8,
  },
  aiBriefingGenerateBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  
  briefingStatsRow: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 10,
  },
  briefingStat: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  briefingStatNumber: {
    fontSize: 28,
    fontWeight: '800',
  },
  briefingStatLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textLight,
    marginTop: 4,
  },
  // New Tab Styles
  briefingTabsContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 4,
    marginBottom: 16,
    gap: 4,
  },
  briefingTabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  briefingTabButtonActive: {
    borderWidth: 1,
  },
  briefingTabLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textLight,
  },
  briefingTabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 20,
    alignItems: 'center',
  },
  briefingTabBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  briefingContactsList: {
    marginBottom: 16,
  },
  briefingContactCardNew: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  briefingContactMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  briefingDraftButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
    marginLeft: 8,
  },
  briefingDraftButtonLoading: {
    paddingHorizontal: 20,
  },
  briefingDraftButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  briefingEmptyState: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
  },
  briefingEmptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 16,
  },
  briefingEmptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  briefingSection: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  briefingSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 12,
  },
  briefingSectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  briefingSectionTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  briefingSectionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  briefingSectionBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  briefingContactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: COLORS.background,
    borderRadius: 14,
    marginBottom: 8,
    gap: 12,
  },
  briefingContactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
  },
  briefingContactAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  briefingContactAvatarText: {
    fontSize: 16,
    fontWeight: '700',
  },
  briefingContactInfo: {
    flex: 1,
  },
  briefingContactName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  briefingContactMeta: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  briefingMoreText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
  briefingAllGood: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  briefingAllGoodIcon: {
    marginBottom: 16,
  },
  briefingAllGoodTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  briefingAllGoodText: {
    fontSize: 14,
    color: COLORS.textLight,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  
  // New Pipeline Styles
  pipelineHeaderNew: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  pipelineHeaderLeft: {
    flex: 1,
  },
  pipelineHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  pipelineHeaderSubtitle: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 2,
  },
  pipelineHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  overdueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 5,
  },
  overdueChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  pipelineSettingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stageChipsContainer: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  stageChipsContent: {
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  stageChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    marginHorizontal: 4,
    gap: 6,
    width: 110,
  },
  stageChipActive: {
    backgroundColor: COLORS.primary,
  },
  stageChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  stageChipTextActive: {
    color: '#fff',
  },
  stageChipCount: {
    backgroundColor: COLORS.border,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  stageChipCountActive: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  stageChipCountOverdue: {
    backgroundColor: COLORS.accent,
  },
  stageChipCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  stageChipCountTextActive: {
    color: '#fff',
  },
  stageChipCountTextOverdue: {
    color: '#fff',
  },
  stageInfoBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  stageInfoContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stageInfoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  stageInfoCount: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
  },
  emptyPipelineNew: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyPipelineIconNew: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyPipelineTitleNew: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  emptyPipelineSubtitle: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 8,
    textAlign: 'center',
  },
  pipelineContactCardNew: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  pipelineContactCardOverdue: {
    borderColor: COLORS.accent + '50',
    backgroundColor: COLORS.accent + '05',
  },
  pipelineContactAvatarNew: {
    width: 48,
    height: 48,
    borderRadius: 16,
  },
  pipelineContactAvatarPlaceholderNew: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pipelineContactAvatarTextNew: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  pipelineContactInfoNew: {
    flex: 1,
    marginLeft: 14,
  },
  pipelineContactNameNew: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  pipelineContactJobNew: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 3,
  },
  dueBadgeNew: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginRight: 8,
    gap: 4,
  },
  dueBadgeOkNew: {
    backgroundColor: COLORS.success + '15',
  },
  dueBadgeOverdueNew: {
    backgroundColor: COLORS.accent,
  },
  dueBadgeTextNew: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.success,
  },
  dueBadgeTextOverdueNew: {
    color: '#fff',
  },
  
  // New Groups Styles
  groupCardNew: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: 'hidden',
  },
  groupColorBarNew: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  groupAvatarNew: {
    width: 48,
    height: 48,
    borderRadius: 16,
    marginLeft: 8,
  },
  groupAvatarPlaceholderNew: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  groupInfoNew: {
    flex: 1,
    marginLeft: 14,
  },
  groupNameNew: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  groupDescriptionNew: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 2,
  },
  groupStatsNew: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 5,
  },
  groupContactCountNew: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  
  // Enhanced Pipeline Contact Card Styles
  pipelineContactCardEnhanced: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 20,
    padding: 16,
    shadowColor: '#5D3FD3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  pipelineContactCardOverdueEnhanced: {
    borderColor: COLORS.accent + '40',
    backgroundColor: '#FFF5F5',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.accent,
  },
  pipelineContactMainArea: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  pipelineContactAvatarEnhanced: {
    width: 56,
    height: 56,
    borderRadius: 18,
  },
  pipelineContactAvatarPlaceholderEnhanced: {
    width: 56,
    height: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pipelineContactAvatarTextEnhanced: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  pipelineContactInfoEnhanced: {
    flex: 1,
    marginLeft: 14,
  },
  pipelineContactNameEnhanced: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  pipelineContactJobEnhanced: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  pipelineContactPhoneEnhanced: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 2,
  },
  
  // Contact Groups Badges
  contactGroupsBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  contactGroupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
    maxWidth: 100,
  },
  contactGroupDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  contactGroupBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  
  // Frequency Badge
  contactFrequencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 5,
  },
  contactFrequencyText: {
    fontSize: 12,
    fontWeight: '600',
  },
  
  pipelineContactActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  pipelineDueBadgeEnhanced: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  pipelineDueBadgeOkEnhanced: {
    backgroundColor: COLORS.success + '15',
  },
  pipelineDueBadgeOverdueEnhanced: {
    backgroundColor: COLORS.accent,
  },
  pipelineDueBadgeTextEnhanced: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.success,
  },
  pipelineDueBadgeTextOverdueEnhanced: {
    color: '#fff',
  },
  pipelineNewBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  pipelineNewBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  pipelineAIDraftBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#5D3FD3',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 6,
    shadowColor: '#5D3FD3',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  pipelineAIDraftBtnLoading: {
    paddingHorizontal: 20,
  },
  pipelineAIDraftBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  
  // Enhanced Contact Card Styles for Contacts Tab
  contactCardEnhanced: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 20,
    padding: 16,
    shadowColor: '#5D3FD3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  contactCardOverdueEnhanced: {
    borderColor: COLORS.accent + '40',
    backgroundColor: '#FFF5F5',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.accent,
  },
  contactCardMainArea: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  contactAvatarEnhanced: {
    width: 56,
    height: 56,
    borderRadius: 18,
  },
  contactAvatarPlaceholderEnhanced: {
    width: 56,
    height: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactAvatarTextEnhanced: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  contactInfoEnhanced: {
    flex: 1,
    marginLeft: 14,
  },
  contactNameEnhanced: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  contactJobEnhanced: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  contactPhoneEnhanced: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 2,
  },
  contactCardActionsEnhanced: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    flexWrap: 'wrap',
  },
  contactStageBadgeEnhanced: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  contactStageDotEnhanced: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  contactStageTextEnhanced: {
    fontSize: 12,
    fontWeight: '600',
  },
  contactDueBadgeEnhanced: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  contactDueBadgeOkEnhanced: {
    backgroundColor: COLORS.success + '15',
  },
  contactDueBadgeOverdueEnhanced: {
    backgroundColor: COLORS.accent,
  },
  contactDueBadgeTextEnhanced: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.success,
  },
  contactDueBadgeTextOverdueEnhanced: {
    color: '#fff',
  },
  contactAIDraftBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#5D3FD3',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 6,
    marginLeft: 'auto',
    shadowColor: '#5D3FD3',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  contactAIDraftBtnLoading: {
    paddingHorizontal: 20,
  },
  contactAIDraftBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  
  // Enhanced Group Card Styles
  groupCardEnhanced: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 20,
    padding: 16,
    shadowColor: '#5D3FD3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: 'hidden',
  },
  groupCardMainArea: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  groupColorAccent: {
    position: 'absolute',
    top: -16,
    left: -16,
    width: 6,
    height: '200%',
    borderRadius: 3,
  },
  groupAvatarEnhanced: {
    width: 56,
    height: 56,
    borderRadius: 18,
    marginLeft: 8,
  },
  groupAvatarPlaceholderEnhanced: {
    width: 56,
    height: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  groupInfoEnhanced: {
    flex: 1,
    marginLeft: 14,
  },
  groupNameEnhanced: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  groupDescriptionEnhanced: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
    lineHeight: 20,
  },
  groupCardActionsEnhanced: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  groupMemberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  groupMemberBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  groupQuickAction: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  groupMemberPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  groupMemberMiniAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  groupMemberMiniImg: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  groupMemberMiniPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupMemberMiniText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  groupMemberMiniMoreText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textLight,
  },
  
  // Create Group Modal Styles
  createGroupModal: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 30,
    maxHeight: '85%',
  },
  createGroupForm: {
    marginTop: 20,
  },
  createGroupLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
    marginTop: 16,
  },
  createGroupInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.text,
  },
  createGroupTextArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  colorPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: COLORS.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  createGroupButton: {
    marginTop: 24,
    borderRadius: 16,
    overflow: 'hidden',
  },
  createGroupButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  createGroupButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  
  // Group Actions Modal Styles
  groupActionsModal: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 30,
  },
  groupActionHeader: {
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  groupActionAvatar: {
    width: 64,
    height: 64,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  groupActionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  groupActionButtons: {
    marginTop: 16,
  },
  groupActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  groupActionBtnIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  groupActionBtnText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.text,
  },
  
  // FAB Button
  fabButton: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Calendar Event Styles
  createEventModal: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 30,
    maxHeight: '85%',
  },
  createEventForm: {
    maxHeight: 400,
  },
  participantChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  participantChipText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '500',
  },
  participantPickerModal: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 30,
    maxHeight: '80%',
  },
  participantOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  participantOptionSelected: {
    backgroundColor: COLORS.primary + '08',
  },
  participantAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
  },
  participantAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  participantName: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.text,
  },
  
  // Day View Modal Styles
  dayViewModal: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 30,
    maxHeight: '80%',
    flex: 1,
  },
  dayViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingTop: 8,
  },
  dayViewTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  dayViewAddBtn: {
    padding: 4,
  },
  dayViewSection: {
    marginBottom: 20,
  },
  dayViewSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  dayViewEventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  dayViewEventColor: {
    width: 4,
    height: 40,
    borderRadius: 2,
    marginRight: 12,
  },
  dayViewEventInfo: {
    flex: 1,
  },
  dayViewEventTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  dayViewEventTime: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 2,
  },
  dayViewEventParticipants: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  dayViewEmpty: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  dayViewEmptyText: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 8,
  },
  
  // Calendar Event Dots
  calendarEventDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 2,
  },
  calendarEventDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 2,
    marginTop: 2,
  },
  
  // Toggle Styles
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.borderLight,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleActive: {
    backgroundColor: COLORS.primary,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
});
