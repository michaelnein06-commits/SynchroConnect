import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert, TextInput, Image, Dimensions, Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import ContactImportPrompt from '../components/ContactImportPrompt';
import * as ImagePicker from 'expo-image-picker';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

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

const PIPELINE_STAGES = ['Weekly', 'Bi-Weekly', 'Monthly', 'Quarterly', 'Annually'];

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
  const { user, logout } = useAuth();
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
  const [newGroupName, setNewGroupName] = useState('');
  // Move modal state
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const fetchContacts = async () => {
    try {
      const response = await axios.get(`${EXPO_PUBLIC_BACKEND_URL}/api/contacts`);
      setContacts(response.data);
    } catch (error) {
      console.error('Error fetching contacts:', error);
      Alert.alert('Error', 'Failed to load contacts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchDrafts = async () => {
    try {
      const response = await axios.get(`${EXPO_PUBLIC_BACKEND_URL}/api/drafts`);
      setDrafts(response.data);
    } catch (error) {
      console.error('Error fetching drafts:', error);
    }
  };

  const fetchGroups = async () => {
    try {
      const response = await axios.get(`${EXPO_PUBLIC_BACKEND_URL}/api/groups`);
      // Backend returns array directly, not { groups: [...] }
      setGroups(response.data || []);
    } catch (error) {
      console.error('Error fetching groups:', error);
    }
  };

  useEffect(() => {
    fetchContacts();
    fetchDrafts();
    fetchGroups();
    
    if (user && !user.has_imported_contacts) {
      setTimeout(() => setShowImportPrompt(true), 1000);
    }
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchContacts();
    fetchDrafts();
    fetchGroups();
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
              await axios.delete(`${EXPO_PUBLIC_BACKEND_URL}/api/contacts`);
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
    Alert.alert('Logout', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedContact(contact);
    setShowMoveModal(true);
  };

  // Move contact to different pipeline stage
  const moveContactToPipeline = async (stage: string) => {
    if (!selectedContact) return;
    try {
      await axios.post(`${EXPO_PUBLIC_BACKEND_URL}/api/contacts/${selectedContact.id}/move-pipeline`, {
        pipeline_stage: stage
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
      });
      
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

  const getDaysUntilDue = (nextDue?: string) => {
    if (!nextDue) return null;
    const due = new Date(nextDue);
    const now = new Date();
    const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const generateDraft = async (contactId: string, contactName: string) => {
    try {
      await axios.post(`${EXPO_PUBLIC_BACKEND_URL}/api/drafts/generate/${contactId}`);
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

    return (
      <TouchableOpacity
        key={contact.id}
        style={[styles.contactCard, isOverdue && styles.contactCardOverdue]}
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
        {daysUntil !== null && activeTab === 'pipeline' && (
          <View style={styles.dueBadge}>
            <Text style={styles.dueText}>
              {isOverdue ? `${Math.abs(daysUntil)}d overdue` : `Due in ${daysUntil}d`}
            </Text>
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
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      fetchContacts();
    } catch (error) {
      console.error('Error moving contact:', error);
      Alert.alert('Error', 'Failed to move contact');
    }
  };

  // Draggable contact item for pipeline
  const renderDraggableContact = ({ item, drag, isActive }: RenderItemParams<Contact>) => {
    const daysUntil = getDaysUntilDue(item.next_due);
    const isOverdue = daysUntil !== null && daysUntil < 0;

    return (
      <ScaleDecorator>
        <TouchableOpacity
          activeOpacity={0.9}
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            drag();
          }}
          onPress={() => router.push(`/contact/${item.id}`)}
          delayLongPress={150}
          style={[
            styles.draggableContactCard,
            isOverdue && styles.contactCardOverdue,
            isActive && styles.draggableContactActive,
          ]}
        >
          <View style={styles.dragHandle}>
            <Ionicons name="menu" size={16} color={COLORS.textLight} />
          </View>
          <View style={styles.contactInfo}>
            {item.profile_picture ? (
              <Image source={{ uri: item.profile_picture }} style={styles.contactAvatar} />
            ) : (
              <View style={styles.contactAvatarPlaceholder}>
                <Ionicons name="person" size={18} color={COLORS.primary} />
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.contactName} numberOfLines={1}>{item.name}</Text>
              {item.job && <Text style={styles.contactJob} numberOfLines={1}>{item.job}</Text>}
            </View>
          </View>
          {daysUntil !== null && (
            <View style={[styles.dueBadgeSmall, isOverdue ? styles.overdueBadge : styles.upcomingBadge]}>
              <Text style={styles.dueBadgeTextSmall}>
                {isOverdue ? `${Math.abs(daysUntil)}d ago` : `${daysUntil}d`}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </ScaleDecorator>
    );
  };

  const renderPipeline = () => {
    const screenWidth = Dimensions.get('window').width;
    const columnWidth = screenWidth * 0.75;

    return (
      <View style={styles.pipelineContainer}>
        {/* Stage Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stageSelector}>
          {PIPELINE_STAGES.map((stage) => {
            const count = contacts.filter(c => c.pipeline_stage === stage).length;
            return (
              <TouchableOpacity
                key={stage}
                style={[styles.stageButton, selectedStage === stage && styles.stageButtonActive]}
                onPress={() => setSelectedStage(stage)}
              >
                <Text style={[styles.stageButtonText, selectedStage === stage && styles.stageButtonTextActive]}>
                  {stage}
                </Text>
                <View style={[styles.stageBadge, selectedStage === stage && styles.stageBadgeActive]}>
                  <Text style={styles.stageBadgeText}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Kanban Board */}
        <ScrollView 
          horizontal 
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.kanbanBoard}
          contentContainerStyle={styles.kanbanContent}
        >
          {PIPELINE_STAGES.map((stage) => {
            const stageContacts = contacts.filter(c => c.pipeline_stage === stage);
            return (
              <View key={stage} style={[styles.kanbanColumn, { width: columnWidth }]}>
                <View style={styles.columnHeader}>
                  <Text style={styles.columnTitle}>{stage}</Text>
                  <View style={styles.columnBadge}>
                    <Text style={styles.columnBadgeText}>{stageContacts.length}</Text>
                  </View>
                </View>
                
                <GestureHandlerRootView style={{ flex: 1 }}>
                  <DraggableFlatList
                    data={stageContacts}
                    keyExtractor={(item) => item.id}
                    renderItem={renderDraggableContact}
                    onDragEnd={({ data }) => {
                      // Reorder within same column - just update local state
                      const otherContacts = contacts.filter(c => c.pipeline_stage !== stage);
                      setContacts([...otherContacts, ...data]);
                    }}
                    ListEmptyComponent={
                      <View style={styles.emptyColumn}>
                        <Ionicons name="people-outline" size={32} color={COLORS.textLight} />
                        <Text style={styles.emptyColumnText}>No contacts</Text>
                        <Text style={styles.emptyColumnHint}>Long press to drag</Text>
                      </View>
                    }
                    refreshControl={
                      <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                    }
                  />
                </GestureHandlerRootView>

                {/* Drop zone indicators for moving between stages */}
                <View style={styles.dropZoneContainer}>
                  {PIPELINE_STAGES.filter(s => s !== stage).map((targetStage) => (
                    <TouchableOpacity
                      key={targetStage}
                      style={styles.dropZoneButton}
                      onPress={() => {
                        if (selectedContact) {
                          handleDragEnd(selectedContact, targetStage);
                        }
                      }}
                    >
                      <Text style={styles.dropZoneText}>→ {targetStage}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* Quick Move Hint */}
        <View style={styles.hintBar}>
          <Ionicons name="hand-left-outline" size={16} color={COLORS.textLight} />
          <Text style={styles.hintText}>Long press contact to drag, tap to edit</Text>
        </View>
      </View>
    );
  };

  const renderContacts = () => (
    <ScrollView style={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      {filteredContacts.map((contact) => renderContactCard(contact))}
    </ScrollView>
  );

  const renderGroups = () => {
    return (
      <ScrollView style={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {groups.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="albums-outline" size={64} color={COLORS.textLight} />
            <Text style={styles.emptyText}>No Groups Yet</Text>
            <Text style={styles.emptySubtext}>Tap + to create your first group</Text>
          </View>
        ) : (
          groups.map((group) => {
            const groupContacts = contacts.filter(c => c.groups?.includes(group.name));
            return (
              <TouchableOpacity
                key={group.id}
                style={styles.groupCard}
                onPress={() => router.push(`/group/${group.id}`)}
              >
                <View style={styles.groupCardHeader}>
                  {group.profile_picture ? (
                    <Image source={{ uri: group.profile_picture }} style={styles.groupAvatar} />
                  ) : (
                    <View style={styles.groupAvatarPlaceholder}>
                      <Ionicons name="people" size={24} color={COLORS.primary} />
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
                  <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    );
  };

  const renderDrafts = () => (
    <ScrollView style={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      {drafts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="mail-open-outline" size={64} color={COLORS.textLight} />
          <Text style={styles.emptyText}>No AI Drafts Yet</Text>
          <Text style={styles.emptySubtext}>Generate drafts from contacts</Text>
        </View>
      ) : (
        drafts.map((draft) => (
          <View key={draft.id} style={styles.draftCard}>
            <Text style={styles.draftContactName}>{draft.contact_name}</Text>
            <View style={styles.draftMessageContainer}>
              <Ionicons name="sparkles" size={16} color={COLORS.primary} />
              <Text style={styles.draftMessage}>{draft.draft_message}</Text>
            </View>
            <View style={styles.draftActions}>
              <TouchableOpacity style={styles.copyButton}>
                <Ionicons name="copy-outline" size={18} color={COLORS.primary} />
                <Text style={styles.copyButtonText}>Copy</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );

  const renderProfile = () => (
    <ScrollView style={styles.content}>
      <View style={styles.profileCard}>
        <Ionicons name="person-circle-outline" size={80} color={COLORS.primary} />
        <Text style={styles.profileName}>{user?.name}</Text>
        <Text style={styles.profileEmail}>{user?.email}</Text>
      </View>

      <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/settings')}>
        <Ionicons name="settings-outline" size={24} color={COLORS.text} />
        <Text style={styles.menuText}>Settings</Text>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/morning-briefing')}>
        <Ionicons name="sunny-outline" size={24} color={COLORS.text} />
        <Text style={styles.menuText}>Morning Briefing</Text>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/import-contacts')}>
        <Ionicons name="download-outline" size={24} color={COLORS.text} />
        <Text style={styles.menuText}>Import Contacts</Text>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
      </TouchableOpacity>

      <TouchableOpacity style={[styles.menuItem, { backgroundColor: COLORS.accent + '20' }]} onPress={handleDeleteAllContacts}>
        <Ionicons name="trash-outline" size={24} color={COLORS.accent} />
        <Text style={[styles.menuText, { color: COLORS.accent }]}>Delete All Contacts</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.menuItem, styles.logoutItem]} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={24} color={COLORS.accent} />
        <Text style={[styles.menuText, styles.logoutText]}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>SynchroConnectr</Text>
          <Text style={styles.headerSubtitle}>
            {activeTab === 'pipeline' && 'Organize by frequency'}
            {activeTab === 'contacts' && `${contacts.length} contacts`}
            {activeTab === 'groups' && `${groups.length} groups`}
            {activeTab === 'drafts' && `${drafts.length} AI drafts`}
            {activeTab === 'profile' && 'Your profile'}
          </Text>
        </View>
      </View>

      {/* Search Bar */}
      {(activeTab === 'contacts' || activeTab === 'pipeline') && (
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={COLORS.textLight} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search contacts..."
            placeholderTextColor={COLORS.textLight}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      )}

      {/* Content */}
      {activeTab === 'pipeline' && renderPipeline()}
      {activeTab === 'contacts' && renderContacts()}
      {activeTab === 'groups' && renderGroups()}
      {activeTab === 'drafts' && renderDrafts()}
      {activeTab === 'profile' && renderProfile()}

      {/* FAB - Contacts and Groups tabs */}
      {activeTab === 'contacts' && (
        <TouchableOpacity style={styles.fab} onPress={() => router.push('/contact/new')}>
          <Ionicons name="add" size={32} color={COLORS.surface} />
        </TouchableOpacity>
      )}
      {activeTab === 'groups' && (
        <TouchableOpacity style={styles.fab} onPress={() => router.push('/group/new')}>
          <Ionicons name="add" size={32} color={COLORS.surface} />
        </TouchableOpacity>
      )}

      {/* Bottom Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTab('pipeline')}>
          <Ionicons
            name={activeTab === 'pipeline' ? 'grid' : 'grid-outline'}
            size={24}
            color={activeTab === 'pipeline' ? COLORS.primary : COLORS.textLight}
          />
          <Text style={[styles.tabLabel, activeTab === 'pipeline' && styles.tabLabelActive]}>Pipeline</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTab('contacts')}>
          <Ionicons
            name={activeTab === 'contacts' ? 'people' : 'people-outline'}
            size={24}
            color={activeTab === 'contacts' ? COLORS.primary : COLORS.textLight}
          />
          <Text style={[styles.tabLabel, activeTab === 'contacts' && styles.tabLabelActive]}>Contacts</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTab('groups')}>
          <Ionicons
            name={activeTab === 'groups' ? 'albums' : 'albums-outline'}
            size={24}
            color={activeTab === 'groups' ? COLORS.primary : COLORS.textLight}
          />
          <Text style={[styles.tabLabel, activeTab === 'groups' && styles.tabLabelActive]}>Groups</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTab('drafts')}>
          <Ionicons
            name={activeTab === 'drafts' ? 'sparkles' : 'sparkles-outline'}
            size={24}
            color={activeTab === 'drafts' ? COLORS.primary : COLORS.textLight}
          />
          <Text style={[styles.tabLabel, activeTab === 'drafts' && styles.tabLabelActive]}>Drafts</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTab('profile')}>
          <Ionicons
            name={activeTab === 'profile' ? 'person' : 'person-outline'}
            size={24}
            color={activeTab === 'profile' ? COLORS.primary : COLORS.textLight}
          />
          <Text style={[styles.tabLabel, activeTab === 'profile' && styles.tabLabelActive]}>Profile</Text>
        </TouchableOpacity>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
  },
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
  contactCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  contactAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactAvatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.surface,
  },
  contactName: {
    fontSize: 18,
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
  draftCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  draftContactName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  draftMessageContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  draftMessage: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
  draftActions: {
    flexDirection: 'row',
    gap: 8,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  copyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  profileCard: {
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    padding: 32,
    marginHorizontal: 16,
    marginVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: 16,
  },
  profileEmail: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.text,
    marginLeft: 16,
  },
  logoutItem: {
    marginTop: 16,
  },
  logoutText: {
    color: COLORS.accent,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textLight,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 80,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: 8,
    paddingBottom: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textLight,
    marginTop: 4,
  },
  tabLabelActive: {
    color: COLORS.primary,
  },
  groupCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
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
});
