import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
  Alert,
  TextInput,
  Modal,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

// Safe haptics import
const triggerHaptic = async (type: 'light' | 'medium' | 'success' = 'light') => {
  if (Platform.OS === 'web') return;
  try {
    const Haptics = await import('expo-haptics');
    if (type === 'success') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (type === 'medium') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch (e) {}
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

interface Contact {
  id: string;
  name: string;
  job?: string;
  pipeline_stage: string;
  profile_picture?: string;
  groups?: string[];
  phone?: string;
}

interface Group {
  id: string;
  name: string;
  description?: string;
  color?: string;
  profile_picture?: string;
  contact_count?: number;
}

interface DragDropGroupsProps {
  contacts: Contact[];
  groups: Group[];
  onAddContactToGroup: (contactId: string, groupId: string) => Promise<void>;
  onRemoveContactFromGroup: (contactId: string, groupId: string) => Promise<void>;
  onContactPress: (contactId: string) => void;
  onGroupPress: (groupId: string) => void;
  onCreateGroup: (name: string, description?: string) => Promise<void>;
}

const DragDropGroups: React.FC<DragDropGroupsProps> = ({
  contacts,
  groups,
  onAddContactToGroup,
  onRemoveContactFromGroup,
  onContactPress,
  onGroupPress,
  onCreateGroup,
}) => {
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showMoveToGroupModal, setShowMoveToGroupModal] = useState(false);

  // Contacts not in any group
  const unassignedContacts = useMemo(() => {
    return contacts.filter(c => !c.groups || c.groups.length === 0);
  }, [contacts]);

  // Filter contacts by search
  const filteredUnassignedContacts = useMemo(() => {
    if (!searchQuery) return unassignedContacts;
    return unassignedContacts.filter(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.job && c.job.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [unassignedContacts, searchQuery]);

  // Get contacts for a specific group
  const getGroupContacts = useCallback((groupId: string) => {
    return contacts.filter(c => c.groups?.includes(groupId));
  }, [contacts]);

  const toggleGroupExpanded = (groupId: string) => {
    setExpandedGroups(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const handleLongPress = useCallback((contact: Contact) => {
    triggerHaptic('medium');
    setSelectedContact(contact);
    setShowMoveToGroupModal(true);
  }, []);

  const handleAddToGroup = useCallback(async (groupId: string) => {
    if (!selectedContact) return;
    
    if (selectedContact.groups?.includes(groupId)) {
      // Already in group - remove it
      try {
        await onRemoveContactFromGroup(selectedContact.id, groupId);
        triggerHaptic('success');
      } catch (error) {
        console.error('Error removing from group:', error);
        Alert.alert('Error', 'Failed to remove from group');
      }
    } else {
      // Not in group - add it
      try {
        await onAddContactToGroup(selectedContact.id, groupId);
        triggerHaptic('success');
      } catch (error) {
        console.error('Error adding to group:', error);
        Alert.alert('Error', 'Failed to add to group');
      }
    }
  }, [selectedContact, onAddContactToGroup, onRemoveContactFromGroup]);

  const handleRemoveFromGroup = useCallback(async (contact: Contact, groupId: string) => {
    triggerHaptic('medium');
    
    try {
      await onRemoveContactFromGroup(contact.id, groupId);
      triggerHaptic('success');
    } catch (error) {
      console.error('Error removing contact from group:', error);
      Alert.alert('Error', 'Failed to remove contact from group');
    }
  }, [onRemoveContactFromGroup]);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      Alert.alert('Error', 'Group name is required');
      return;
    }
    
    try {
      await onCreateGroup(newGroupName.trim(), newGroupDescription.trim() || undefined);
      setShowCreateGroupModal(false);
      setNewGroupName('');
      setNewGroupDescription('');
      triggerHaptic('success');
    } catch (error) {
      console.error('Error creating group:', error);
      Alert.alert('Error', 'Failed to create group');
    }
  };

  const renderContactCard = (contact: Contact, inGroup: boolean = false, groupId?: string) => {
    const groupColor = groupId 
      ? groups.find(g => g.id === groupId)?.color || COLORS.primary 
      : COLORS.primary;

    return (
      <TouchableOpacity
        key={`${contact.id}-${groupId || 'unassigned'}`}
        style={[styles.contactCard, inGroup && { borderLeftWidth: 3, borderLeftColor: groupColor }]}
        onPress={() => onContactPress(contact.id)}
        onLongPress={() => handleLongPress(contact)}
        delayLongPress={300}
        activeOpacity={0.8}
      >
        <View style={styles.contactCardContent}>
          {contact.profile_picture ? (
            <Image source={{ uri: contact.profile_picture }} style={styles.contactAvatar} />
          ) : (
            <View style={[styles.contactAvatarPlaceholder, { backgroundColor: groupColor + '20' }]}>
              <Text style={[styles.contactAvatarText, { color: groupColor }]}>
                {contact.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.contactInfo}>
            <Text style={styles.contactName} numberOfLines={1}>{contact.name}</Text>
            {contact.job && (
              <Text style={styles.contactJob} numberOfLines={1}>{contact.job}</Text>
            )}
            {!inGroup && contact.groups && contact.groups.length > 0 && (
              <View style={styles.contactGroupTags}>
                {contact.groups.slice(0, 2).map((gId, idx) => {
                  const group = groups.find(g => g.id === gId);
                  return group ? (
                    <View key={idx} style={[styles.groupTag, { backgroundColor: (group.color || COLORS.primary) + '20' }]}>
                      <Text style={[styles.groupTagText, { color: group.color || COLORS.primary }]}>
                        {group.name}
                      </Text>
                    </View>
                  ) : null;
                })}
                {contact.groups.length > 2 && (
                  <Text style={styles.moreGroups}>+{contact.groups.length - 2}</Text>
                )}
              </View>
            )}
          </View>
          <View style={styles.cardActions}>
            <Ionicons name="ellipsis-vertical" size={16} color={COLORS.textLight} />
          </View>
        </View>
        
        {/* Remove from group button */}
        {inGroup && groupId && (
          <TouchableOpacity
            style={styles.removeFromGroupBtn}
            onPress={() => handleRemoveFromGroup(contact, groupId)}
          >
            <Ionicons name="close-circle" size={20} color={COLORS.accent} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const renderGroupCard = (group: Group) => {
    const groupContacts = getGroupContacts(group.id);
    const isExpanded = expandedGroups.includes(group.id);
    const groupColor = group.color || COLORS.primary;

    return (
      <View key={group.id} style={styles.groupCard}>
        {/* Group Header */}
        <TouchableOpacity
          style={styles.groupHeader}
          onPress={() => toggleGroupExpanded(group.id)}
          onLongPress={() => onGroupPress(group.id)}
          activeOpacity={0.8}
        >
          <View style={[styles.groupColorBar, { backgroundColor: groupColor }]} />
          
          {group.profile_picture ? (
            <Image source={{ uri: group.profile_picture }} style={styles.groupAvatar} />
          ) : (
            <View style={[styles.groupAvatarPlaceholder, { backgroundColor: groupColor + '20' }]}>
              <Ionicons name="people" size={20} color={groupColor} />
            </View>
          )}
          
          <View style={styles.groupInfo}>
            <Text style={styles.groupName}>{group.name}</Text>
            <Text style={styles.groupCount}>
              {groupContacts.length} {groupContacts.length === 1 ? 'contact' : 'contacts'}
            </Text>
          </View>

          <Ionicons 
            name={isExpanded ? "chevron-up" : "chevron-down"} 
            size={20} 
            color={COLORS.textLight} 
          />
        </TouchableOpacity>

        {/* Expanded Contacts */}
        {isExpanded && (
          <View style={styles.groupContacts}>
            {groupContacts.length === 0 ? (
              <View style={styles.emptyGroup}>
                <Ionicons name="person-add-outline" size={24} color={COLORS.textLight} />
                <Text style={styles.emptyGroupText}>Long press contacts to add</Text>
              </View>
            ) : (
              groupContacts.map(contact => renderContactCard(contact, true, group.id))
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>Groups</Text>
              <View style={styles.headerStats}>
                <Text style={styles.headerStat}>{groups.length} groups</Text>
                <Text style={styles.headerStatDivider}>•</Text>
                <Text style={styles.headerStat}>{unassignedContacts.length} unassigned</Text>
              </View>
            </View>
            <TouchableOpacity 
              style={styles.createGroupBtn}
              onPress={() => setShowCreateGroupModal(true)}
            >
              <Ionicons name="add" size={20} color={COLORS.surface} />
              <Text style={styles.createGroupBtnText}>New</Text>
            </TouchableOpacity>
          </View>

          {/* Drag Hint */}
          <View style={styles.dragHintBar}>
            <Ionicons name="hand-left-outline" size={14} color={COLORS.primary} />
            <Text style={styles.dragHintText}>Long press contacts to manage groups</Text>
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Groups Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconWrapper}>
                  <Ionicons name="albums" size={16} color={COLORS.primary} />
                </View>
                <Text style={styles.sectionTitle}>Your Groups</Text>
              </View>
              
              {groups.length === 0 ? (
                <View style={styles.emptySection}>
                  <Ionicons name="albums-outline" size={48} color={COLORS.textLight} />
                  <Text style={styles.emptySectionTitle}>No groups yet</Text>
                  <Text style={styles.emptySectionText}>Create groups to organize your contacts</Text>
                  <TouchableOpacity 
                    style={styles.emptySectionBtn}
                    onPress={() => setShowCreateGroupModal(true)}
                  >
                    <Ionicons name="add" size={18} color={COLORS.surface} />
                    <Text style={styles.emptySectionBtnText}>Create Group</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                groups.map(group => renderGroupCard(group))
              )}
            </View>

        {/* Unassigned Contacts Section */}
        <View style={[styles.section, styles.unassignedSection]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconWrapper, { backgroundColor: COLORS.warning + '15' }]}>
              <Ionicons name="person-outline" size={16} color={COLORS.warning} />
            </View>
            <Text style={styles.sectionTitle}>Unassigned Contacts</Text>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>{unassignedContacts.length}</Text>
            </View>
          </View>

          {/* Search */}
          {unassignedContacts.length > 5 && (
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={16} color={COLORS.textLight} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search unassigned contacts..."
                placeholderTextColor={COLORS.textLight}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color={COLORS.textLight} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {filteredUnassignedContacts.length === 0 ? (
            <View style={styles.emptyUnassigned}>
              <Ionicons name="checkmark-circle-outline" size={32} color={COLORS.success} />
              <Text style={styles.emptyUnassignedText}>
                {unassignedContacts.length === 0 
                  ? "All contacts are assigned to groups!" 
                  : "No contacts match your search"}
              </Text>
            </View>
          ) : (
            filteredUnassignedContacts.slice(0, 20).map(contact => renderContactCard(contact, false))
          )}
          
          {filteredUnassignedContacts.length > 20 && (
            <Text style={styles.moreContactsText}>
              +{filteredUnassignedContacts.length - 20} more contacts
            </Text>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Move to Group Modal */}
      {showMoveToGroupModal && selectedContact && (
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalBackdrop} 
            onPress={() => {
              setShowMoveToGroupModal(false);
              setSelectedContact(null);
            }}
            activeOpacity={1}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Manage "{selectedContact.name}"</Text>
            <Text style={styles.modalSubtitle}>Tap groups to add/remove</Text>
            
            <View style={styles.groupOptions}>
              {groups.length === 0 ? (
                <View style={styles.noGroupsInModal}>
                  <Text style={styles.noGroupsText}>No groups created yet</Text>
                  <TouchableOpacity
                    style={styles.createGroupInModalBtn}
                    onPress={() => {
                      setShowMoveToGroupModal(false);
                      setSelectedContact(null);
                      setShowCreateGroupModal(true);
                    }}
                  >
                    <Ionicons name="add" size={16} color={COLORS.primary} />
                    <Text style={styles.createGroupInModalText}>Create Group</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                groups.map(group => {
                  const isInGroup = selectedContact.groups?.includes(group.id);
                  const groupColor = group.color || COLORS.primary;
                  
                  return (
                    <TouchableOpacity
                      key={group.id}
                      style={[
                        styles.groupOption,
                        isInGroup && { backgroundColor: groupColor + '15', borderColor: groupColor }
                      ]}
                      onPress={() => handleAddToGroup(group.id)}
                    >
                      <View style={[styles.groupOptionDot, { backgroundColor: groupColor }]} />
                      <Text style={[
                        styles.groupOptionText,
                        isInGroup && { color: groupColor, fontWeight: '700' }
                      ]}>
                        {group.name}
                      </Text>
                      {isInGroup ? (
                        <Ionicons name="checkmark-circle" size={20} color={groupColor} />
                      ) : (
                        <Ionicons name="add-circle-outline" size={20} color={COLORS.textLight} />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </View>

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => {
                setShowMoveToGroupModal(false);
                setSelectedContact(null);
              }}
            >
              <Text style={styles.modalCloseBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Create Group Modal */}
      <Modal visible={showCreateGroupModal} transparent animationType="slide">
        <View style={styles.createModalOverlay}>
          <View style={styles.createModalContent}>
            <View style={styles.modalHandle} />
            
            <Text style={styles.createModalTitle}>Create New Group</Text>
            
            <View style={styles.createModalField}>
              <Text style={styles.createModalLabel}>Group Name *</Text>
              <TextInput
                style={styles.createModalInput}
                placeholder="e.g., Work, Friends, Family"
                placeholderTextColor={COLORS.textLight}
                value={newGroupName}
                onChangeText={setNewGroupName}
                autoFocus
              />
            </View>
            
            <View style={styles.createModalField}>
              <Text style={styles.createModalLabel}>Description (optional)</Text>
              <TextInput
                style={[styles.createModalInput, styles.createModalTextArea]}
                placeholder="What is this group for?"
                placeholderTextColor={COLORS.textLight}
                value={newGroupDescription}
                onChangeText={setNewGroupDescription}
                multiline
                numberOfLines={3}
              />
            </View>
            
            <View style={styles.createModalActions}>
              <TouchableOpacity 
                style={styles.createModalCancelBtn}
                onPress={() => {
                  setShowCreateGroupModal(false);
                  setNewGroupName('');
                  setNewGroupDescription('');
                }}
              >
                <Text style={styles.createModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.createModalCreateBtn}
                onPress={handleCreateGroup}
              >
                <LinearGradient 
                  colors={[COLORS.primary, COLORS.primaryDark]} 
                  style={styles.createModalCreateGradient}
                >
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={styles.createModalCreateText}>Create</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  headerStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  headerStat: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  headerStatDivider: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  createGroupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  createGroupBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.surface,
  },
  dragHintBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: COLORS.primary + '08',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    gap: 8,
  },
  dragHintText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  sectionIconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  sectionBadge: {
    backgroundColor: COLORS.warning + '20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  sectionBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.warning,
  },
  emptySection: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  emptySectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 12,
  },
  emptySectionText: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 4,
  },
  emptySectionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 20,
    gap: 8,
  },
  emptySectionBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.surface,
  },
  groupCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  groupColorBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  groupAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  groupAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  groupCount: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 2,
  },
  groupContacts: {
    padding: 12,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  emptyGroup: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyGroupText: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 8,
  },
  unassignedSection: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
  },
  emptyUnassigned: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyUnassignedText: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 8,
    textAlign: 'center',
  },
  moreContactsText: {
    fontSize: 12,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: 8,
  },
  contactCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  contactCardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  contactAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactAvatarText: {
    fontSize: 15,
    fontWeight: '700',
  },
  contactInfo: {
    flex: 1,
    marginLeft: 12,
  },
  contactName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  contactJob: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 1,
  },
  contactGroupTags: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  groupTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  groupTagText: {
    fontSize: 10,
    fontWeight: '600',
  },
  moreGroups: {
    fontSize: 10,
    color: COLORS.textLight,
  },
  cardActions: {
    paddingLeft: 8,
  },
  removeFromGroupBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  // Modal
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '70%',
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
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  groupOptions: {
    gap: 8,
    maxHeight: 300,
  },
  groupOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    gap: 12,
  },
  groupOptionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  groupOptionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.text,
  },
  noGroupsInModal: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  noGroupsText: {
    fontSize: 14,
    color: COLORS.textLight,
    marginBottom: 12,
  },
  createGroupInModalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  createGroupInModalText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  modalCloseBtn: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  modalCloseBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.surface,
  },
  // Create Modal
  createModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  createModalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 40,
  },
  createModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 24,
  },
  createModalField: {
    marginBottom: 16,
  },
  createModalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  createModalInput: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  createModalTextArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  createModalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  createModalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    alignItems: 'center',
  },
  createModalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  createModalCreateBtn: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  createModalCreateGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  createModalCreateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export default DragDropGroups;
