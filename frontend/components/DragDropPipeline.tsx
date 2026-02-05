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
  Platform,
  RefreshControl,
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
const COLUMN_WIDTH = Math.min(SCREEN_WIDTH * 0.75, 320);

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
  new: '#3B82F6',
  weekly: '#8B5CF6',
  biweekly: '#06B6D4',
  monthly: '#10B981',
  quarterly: '#F59E0B',
  annually: '#EC4899',
};

const PIPELINE_STAGES = ['New', 'Weekly', 'Bi-Weekly', 'Monthly', 'Quarterly', 'Annually'];

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

const getStageGradient = (stage: string): [string, string] => {
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

interface Contact {
  id: string;
  name: string;
  job?: string;
  pipeline_stage: string;
  next_due?: string;
  profile_picture?: string;
  groups?: string[];
  phone?: string;
}

interface DragDropPipelineProps {
  contacts: Contact[];
  onMoveContact: (contactId: string, newStage: string) => Promise<void>;
  onContactPress: (contactId: string) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  pipelineStages?: string[];
}

const DragDropPipeline: React.FC<DragDropPipelineProps> = ({
  contacts,
  onMoveContact,
  onContactPress,
  onRefresh,
  refreshing = false,
  pipelineStages = ['New', 'Weekly', 'Bi-Weekly', 'Monthly', 'Quarterly', 'Annually'],
}) => {
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showMoveModal, setShowMoveModal] = useState(false);

  const getDaysUntilDue = (nextDue?: string) => {
    if (!nextDue) return null;
    const due = new Date(nextDue);
    const now = new Date();
    const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const contactsByStage = useMemo(() => {
    const grouped: { [key: string]: Contact[] } = {};
    pipelineStages.forEach(stage => {
      grouped[stage] = contacts.filter(c => c.pipeline_stage === stage);
    });
    return grouped;
  }, [contacts, pipelineStages]);

  const totalOverdue = useMemo(() => {
    return contacts.filter(c => {
      if (c.pipeline_stage === 'New') return false;
      const days = getDaysUntilDue(c.next_due);
      return days !== null && days < 0;
    }).length;
  }, [contacts]);

  const handleLongPress = useCallback((contact: Contact) => {
    triggerHaptic('medium');
    setSelectedContact(contact);
    setShowMoveModal(true);
  }, []);

  const handleMoveToStage = useCallback(async (newStage: string) => {
    if (!selectedContact) return;
    if (selectedContact.pipeline_stage === newStage) {
      setShowMoveModal(false);
      setSelectedContact(null);
      return;
    }
    
    triggerHaptic('success');
    setShowMoveModal(false);
    
    try {
      await onMoveContact(selectedContact.id, newStage);
      setSelectedContact(null);
    } catch (error) {
      console.error('Error moving contact:', error);
      Alert.alert('Error', 'Failed to move contact');
    }
  }, [selectedContact, onMoveContact]);

  const renderContactCard = (contact: Contact, stage: string) => {
    const daysUntil = getDaysUntilDue(contact.next_due);
    const isOverdue = daysUntil !== null && daysUntil < 0;
    const isNewContact = contact.pipeline_stage === 'New';
    const stageColor = getStageColor(stage);

    return (
      <TouchableOpacity
        key={contact.id}
        style={[
          styles.contactCard,
          isOverdue && !isNewContact && styles.contactCardOverdue,
        ]}
        onPress={() => onContactPress(contact.id)}
        onLongPress={() => handleLongPress(contact)}
        delayLongPress={300}
        activeOpacity={0.8}
      >
        <View style={styles.contactCardContent}>
          {contact.profile_picture ? (
            <Image source={{ uri: contact.profile_picture }} style={styles.contactAvatar} />
          ) : (
            <View style={[styles.contactAvatarPlaceholder, { backgroundColor: stageColor + '20' }]}>
              <Text style={[styles.contactAvatarText, { color: stageColor }]}>
                {contact.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.contactInfo}>
            <Text style={styles.contactName} numberOfLines={1}>{contact.name}</Text>
            {contact.job && (
              <Text style={styles.contactJob} numberOfLines={1}>{contact.job}</Text>
            )}
          </View>
          <View style={styles.contactRight}>
            {daysUntil !== null && !isNewContact && (
              <View style={[
                styles.dueBadge,
                isOverdue ? styles.dueBadgeOverdue : styles.dueBadgeOk
              ]}>
                <Ionicons 
                  name={isOverdue ? "alert-circle" : "time-outline"} 
                  size={12} 
                  color={isOverdue ? COLORS.accent : COLORS.success} 
                />
                <Text style={[
                  styles.dueText,
                  isOverdue ? styles.dueTextOverdue : styles.dueTextOk
                ]}>
                  {isOverdue ? `${Math.abs(daysUntil)}d` : `${daysUntil}d`}
                </Text>
              </View>
            )}
            {isNewContact && (
              <View style={[styles.dueBadge, { backgroundColor: COLORS.new + '20' }]}>
                <Ionicons name="arrow-forward-outline" size={12} color={COLORS.new} />
              </View>
            )}
          </View>
        </View>
        <View style={styles.dragHint}>
          <Ionicons name="ellipsis-vertical" size={14} color={COLORS.textLight} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderStageColumn = (stage: string) => {
    const stageContacts = contactsByStage[stage] || [];
    const stageColor = getStageColor(stage);
    const overdueInStage = stageContacts.filter(c => {
      if (c.pipeline_stage === 'New') return false;
      const days = getDaysUntilDue(c.next_due);
      return days !== null && days < 0;
    }).length;

    return (
      <View key={stage} style={styles.stageColumn}>
        {/* Stage Header */}
        <View style={styles.stageHeader}>
          <LinearGradient 
            colors={getStageGradient(stage)} 
            style={styles.stageHeaderGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <View style={styles.stageHeaderContent}>
              <View style={styles.stageDot} />
              <Text style={styles.stageTitle}>{stage}</Text>
              <View style={styles.stageCountBadge}>
                <Text style={styles.stageCount}>{stageContacts.length}</Text>
              </View>
              {overdueInStage > 0 && (
                <View style={styles.overdueIndicator}>
                  <Ionicons name="alert-circle" size={14} color="#fff" />
                  <Text style={styles.overdueCount}>{overdueInStage}</Text>
                </View>
              )}
            </View>
          </LinearGradient>
        </View>

        {/* Contacts List */}
        <ScrollView 
          style={styles.stageContent}
          contentContainerStyle={styles.stageContentContainer}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {stageContacts.length === 0 ? (
            <View style={styles.emptyStage}>
              <Ionicons name="people-outline" size={32} color={COLORS.textLight} />
              <Text style={styles.emptyStageText}>No contacts</Text>
            </View>
          ) : (
            stageContacts.map(contact => renderContactCard(contact, stage))
          )}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header Stats */}
      <View style={styles.headerStats}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{contacts.length}</Text>
          <Text style={styles.statLabel}>Total Contacts</Text>
        </View>
        {totalOverdue > 0 && (
          <View style={[styles.statItem, styles.statItemOverdue]}>
            <Text style={[styles.statNumber, { color: COLORS.accent }]}>{totalOverdue}</Text>
            <Text style={styles.statLabel}>Overdue</Text>
          </View>
        )}
      </View>

      {/* Kanban Board */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.boardContainer}
        contentContainerStyle={styles.boardContent}
        decelerationRate="fast"
        snapToInterval={COLUMN_WIDTH + 12}
        snapToAlignment="start"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
      >
        {pipelineStages.map(stage => renderStageColumn(stage))}
      </ScrollView>

      {/* Move Contact Modal */}
      {showMoveModal && selectedContact && (
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalBackdrop} 
            onPress={() => {
              setShowMoveModal(false);
              setSelectedContact(null);
            }}
            activeOpacity={1}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Move "{selectedContact.name}"</Text>
            <Text style={styles.modalSubtitle}>Select pipeline stage</Text>
            
            <View style={styles.stageOptions}>
              {pipelineStages.map(stage => {
                const isCurrentStage = selectedContact.pipeline_stage === stage;
                const stageColor = getStageColor(stage);
                
                return (
                  <TouchableOpacity
                    key={stage}
                    style={[
                      styles.stageOption,
                      isCurrentStage && { backgroundColor: stageColor + '15', borderColor: stageColor }
                    ]}
                    onPress={() => handleMoveToStage(stage)}
                  >
                    <View style={[styles.stageOptionDot, { backgroundColor: stageColor }]} />
                    <Text style={[
                      styles.stageOptionText,
                      isCurrentStage && { color: stageColor, fontWeight: '700' }
                    ]}>
                      {stage}
                    </Text>
                    {isCurrentStage && (
                      <Ionicons name="checkmark-circle" size={20} color={stageColor} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => {
                setShowMoveModal(false);
                setSelectedContact(null);
              }}
            >
              <Text style={styles.modalCloseBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  headerStats: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    gap: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statItemOverdue: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: COLORS.accent + '10',
    borderRadius: 12,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 2,
  },
  dragHintContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  dragHintText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '500',
  },
  boardContainer: {
    flex: 1,
  },
  boardContent: {
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  stageColumn: {
    width: COLUMN_WIDTH,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: 'hidden',
    marginRight: 12,
    maxHeight: '100%',
  },
  stageHeader: {
    overflow: 'hidden',
  },
  stageHeaderGradient: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  stageHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  stageTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  stageCountBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  stageCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  overdueIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  overdueCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  stageContent: {
    flex: 1,
    maxHeight: 450,
  },
  stageContentContainer: {
    padding: 12,
    paddingBottom: 20,
  },
  emptyStage: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyStageText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textLight,
    marginTop: 8,
  },
  emptyStageHint: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 4,
  },
  contactCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  contactCardOverdue: {
    borderColor: COLORS.accent + '40',
    backgroundColor: COLORS.accent + '05',
  },
  contactCardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  contactAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  contactAvatarPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactAvatarText: {
    fontSize: 16,
    fontWeight: '700',
  },
  contactInfo: {
    flex: 1,
    marginLeft: 12,
  },
  contactName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  contactJob: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  contactRight: {
    marginLeft: 8,
  },
  dueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  dueBadgeOk: {
    backgroundColor: COLORS.success + '15',
  },
  dueBadgeOverdue: {
    backgroundColor: COLORS.accent + '15',
  },
  dueText: {
    fontSize: 11,
    fontWeight: '600',
  },
  dueTextOk: {
    color: COLORS.success,
  },
  dueTextOverdue: {
    color: COLORS.accent,
  },
  dragHint: {
    paddingLeft: 4,
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
  stageOptions: {
    gap: 8,
  },
  stageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    gap: 12,
  },
  stageOptionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  stageOptionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.text,
  },
  modalCloseBtn: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    alignItems: 'center',
  },
  modalCloseBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
});

export default DragDropPipeline;
