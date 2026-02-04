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
} from 'react-native';
import { DraxProvider, DraxView, DraxScrollView } from 'react-native-drax';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

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
  const [draggingContact, setDraggingContact] = useState<Contact | null>(null);
  const [receivingGroupId, setReceivingGroupId] = useState<string | null>(null);
  const [receivingUnassigned, setReceivingUnassigned] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

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

  const handleDragStart = useCallback((contact: Contact) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDraggingContact(contact);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingContact(null);
    setReceivingGroupId(null);
    setReceivingUnassigned(false);
  }, []);

  const handleGroupReceiveDragEnter = useCallback((groupId: string) => {
    if (draggingContact && !draggingContact.groups?.includes(groupId)) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setReceivingGroupId(groupId);
    }
  }, [draggingContact]);

  const handleGroupReceiveDragExit = useCallback(() => {
    setReceivingGroupId(null);
  }, []);

  const handleUnassignedReceiveDragEnter = useCallback(() => {
    if (draggingContact && draggingContact.groups && draggingContact.groups.length > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setReceivingUnassigned(true);
    }
  }, [draggingContact]);

  const handleUnassignedReceiveDragExit = useCallback(() => {
    setReceivingUnassigned(false);
  }, []);

  const handleDropOnGroup = useCallback(async (contact: Contact, groupId: string) => {
    if (contact.groups?.includes(groupId)) return;
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDraggingContact(null);
    setReceivingGroupId(null);
    
    try {
      await onAddContactToGroup(contact.id, groupId);
    } catch (error) {
      console.error('Error adding contact to group:', error);
      Alert.alert('Error', 'Failed to add contact to group');
    }
  }, [onAddContactToGroup]);

  const handleRemoveFromGroup = useCallback(async (contact: Contact, groupId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    try {
      await onRemoveContactFromGroup(contact.id, groupId);
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
      <DraxView
        key={`${contact.id}-${groupId || 'unassigned'}`}
        style={[styles.contactCard, inGroup && { borderLeftWidth: 3, borderLeftColor: groupColor }]}
        draggingStyle={styles.contactCardDragging}
        dragReleasedStyle={styles.contactCardReleased}
        dragPayload={{ contact, sourceGroupId: groupId }}
        longPressDelay={150}
        onDragStart={() => handleDragStart(contact)}
        onDragEnd={handleDragEnd}
      >
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => onContactPress(contact.id)}
          style={styles.contactCardTouchable}
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
            <View style={styles.dragHandle}>
              <Ionicons name="menu" size={16} color={COLORS.textLight} />
            </View>
          </View>
        </TouchableOpacity>
        
        {/* Remove from group button */}
        {inGroup && groupId && (
          <TouchableOpacity
            style={styles.removeFromGroupBtn}
            onPress={() => handleRemoveFromGroup(contact, groupId)}
          >
            <Ionicons name="close-circle" size={20} color={COLORS.accent} />
          </TouchableOpacity>
        )}
      </DraxView>
    );
  };

  const renderGroupCard = (group: Group) => {
    const groupContacts = getGroupContacts(group.id);
    const isExpanded = expandedGroups.includes(group.id);
    const isReceiving = receivingGroupId === group.id;
    const groupColor = group.color || COLORS.primary;

    return (
      <DraxView
        key={group.id}
        style={[
          styles.groupCard,
          isReceiving && styles.groupCardReceiving,
          { borderColor: isReceiving ? groupColor : COLORS.borderLight }
        ]}
        receivingStyle={[styles.groupCardReceiving, { borderColor: groupColor }]}
        onReceiveDragEnter={() => handleGroupReceiveDragEnter(group.id)}
        onReceiveDragExit={handleGroupReceiveDragExit}
        onReceiveDragDrop={({ dragged: { payload } }) => {
          if (payload?.contact) {
            handleDropOnGroup(payload.contact as Contact, group.id);
          }
        }}
      >
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

          {/* Drop indicator */}
          {isReceiving && draggingContact && (
            <View style={[styles.dropIndicator, { backgroundColor: groupColor }]}>
              <Ionicons name="add" size={16} color="#fff" />
            </View>
          )}

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
                <Text style={styles.emptyGroupText}>Drag contacts here</Text>
              </View>
            ) : (
              groupContacts.map(contact => renderContactCard(contact, true, group.id))
            )}
          </View>
        )}
      </DraxView>
    );
  };

  return (
    <DraxProvider>
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
          <Text style={styles.dragHintText}>Long press & drag contacts between groups</Text>
        </View>

        <DraxScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
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
          <DraxView
            style={[
              styles.section,
              styles.unassignedSection,
              receivingUnassigned && styles.unassignedSectionReceiving
            ]}
            onReceiveDragEnter={handleUnassignedReceiveDragEnter}
            onReceiveDragExit={handleUnassignedReceiveDragExit}
            onReceiveDragDrop={({ dragged: { payload } }) => {
              if (payload?.contact && payload?.sourceGroupId) {
                handleRemoveFromGroup(payload.contact as Contact, payload.sourceGroupId);
              }
            }}
          >
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

            {/* Drop zone indicator */}
            {receivingUnassigned && (
              <View style={styles.unassignedDropZone}>
                <Ionicons name="remove-circle-outline" size={20} color={COLORS.warning} />
                <Text style={styles.unassignedDropZoneText}>Drop to remove from group</Text>
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
          </DraxView>

          <View style={{ height: 100 }} />
        </DraxScrollView>

        {/* Dragging Overlay */}
        {draggingContact && (
          <View style={styles.draggingOverlay}>
            <View style={styles.draggingInfo}>
              <Ionicons name="move" size={18} color={COLORS.primary} />
              <Text style={styles.draggingText}>
                Moving: {draggingContact.name}
              </Text>
            </View>
          </View>
        )}

        {/* Create Group Modal */}
        <Modal visible={showCreateGroupModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHandle} />
              
              <Text style={styles.modalTitle}>Create New Group</Text>
              
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Group Name *</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g., Work, Friends, Family"
                  placeholderTextColor={COLORS.textLight}
                  value={newGroupName}
                  onChangeText={setNewGroupName}
                  autoFocus
                />
              </View>
              
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Description (optional)</Text>
                <TextInput
                  style={[styles.modalInput, styles.modalTextArea]}
                  placeholder="What is this group for?"
                  placeholderTextColor={COLORS.textLight}
                  value={newGroupDescription}
                  onChangeText={setNewGroupDescription}
                  multiline
                  numberOfLines={3}
                />
              </View>
              
              <View style={styles.modalActions}>
                <TouchableOpacity 
                  style={styles.modalCancelBtn}
                  onPress={() => {
                    setShowCreateGroupModal(false);
                    setNewGroupName('');
                    setNewGroupDescription('');
                  }}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.modalCreateBtn}
                  onPress={handleCreateGroup}
                >
                  <LinearGradient 
                    colors={[COLORS.primary, COLORS.primaryDark]} 
                    style={styles.modalCreateGradient}
                  >
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <Text style={styles.modalCreateText}>Create</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </DraxProvider>
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
    borderWidth: 2,
    borderColor: COLORS.borderLight,
    overflow: 'hidden',
  },
  groupCardReceiving: {
    borderStyle: 'dashed',
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
  dropIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
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
    borderWidth: 2,
    borderColor: COLORS.borderLight,
  },
  unassignedSectionReceiving: {
    borderColor: COLORS.warning,
    borderStyle: 'dashed',
    backgroundColor: COLORS.warning + '05',
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
  unassignedDropZone: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.warning + '15',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    gap: 8,
  },
  unassignedDropZoneText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.warning,
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
    overflow: 'hidden',
  },
  contactCardDragging: {
    opacity: 0.9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    transform: [{ scale: 1.02 }],
  },
  contactCardReleased: {
    opacity: 0.5,
  },
  contactCardTouchable: {
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
  dragHandle: {
    paddingLeft: 8,
  },
  removeFromGroupBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  draggingOverlay: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
  },
  draggingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    gap: 10,
  },
  draggingText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
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
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 24,
  },
  modalField: {
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  modalTextArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  modalCreateBtn: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  modalCreateGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  modalCreateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export default DragDropGroups;
