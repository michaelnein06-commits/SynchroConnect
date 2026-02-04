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
} from 'react-native';
import { DraxProvider, DraxView, DraxList } from 'react-native-drax';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMN_WIDTH = SCREEN_WIDTH * 0.75;

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
}

const DragDropPipeline: React.FC<DragDropPipelineProps> = ({
  contacts,
  onMoveContact,
  onContactPress,
  onRefresh,
}) => {
  const [draggingContact, setDraggingContact] = useState<Contact | null>(null);
  const [receivingStage, setReceivingStage] = useState<string | null>(null);

  const getDaysUntilDue = (nextDue?: string) => {
    if (!nextDue) return null;
    const due = new Date(nextDue);
    const now = new Date();
    const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const contactsByStage = useMemo(() => {
    const grouped: { [key: string]: Contact[] } = {};
    PIPELINE_STAGES.forEach(stage => {
      grouped[stage] = contacts.filter(c => c.pipeline_stage === stage);
    });
    return grouped;
  }, [contacts]);

  const totalOverdue = useMemo(() => {
    return contacts.filter(c => {
      if (c.pipeline_stage === 'New') return false;
      const days = getDaysUntilDue(c.next_due);
      return days !== null && days < 0;
    }).length;
  }, [contacts]);

  const handleDragStart = useCallback((contact: Contact) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDraggingContact(contact);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingContact(null);
    setReceivingStage(null);
  }, []);

  const handleReceiveDragEnter = useCallback((stage: string) => {
    if (draggingContact && draggingContact.pipeline_stage !== stage) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setReceivingStage(stage);
    }
  }, [draggingContact]);

  const handleReceiveDragExit = useCallback(() => {
    setReceivingStage(null);
  }, []);

  const handleDrop = useCallback(async (contact: Contact, newStage: string) => {
    if (contact.pipeline_stage === newStage) return;
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDraggingContact(null);
    setReceivingStage(null);
    
    try {
      await onMoveContact(contact.id, newStage);
    } catch (error) {
      console.error('Error moving contact:', error);
      Alert.alert('Error', 'Failed to move contact');
    }
  }, [onMoveContact]);

  const renderContactCard = (contact: Contact, stage: string) => {
    const daysUntil = getDaysUntilDue(contact.next_due);
    const isOverdue = daysUntil !== null && daysUntil < 0;
    const isNewContact = contact.pipeline_stage === 'New';
    const stageColor = getStageColor(stage);

    return (
      <DraxView
        key={contact.id}
        style={[
          styles.contactCard,
          isOverdue && !isNewContact && styles.contactCardOverdue,
        ]}
        draggingStyle={styles.contactCardDragging}
        dragReleasedStyle={styles.contactCardReleased}
        hoverDraggingStyle={styles.contactCardHoverDragging}
        dragPayload={contact}
        longPressDelay={150}
        onDragStart={() => handleDragStart(contact)}
        onDragEnd={handleDragEnd}
        onDragDrop={() => {}}
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
          <View style={styles.dragHandle}>
            <Ionicons name="menu" size={16} color={COLORS.textLight} />
          </View>
        </TouchableOpacity>
      </DraxView>
    );
  };

  const renderStageColumn = (stage: string) => {
    const stageContacts = contactsByStage[stage] || [];
    const stageColor = getStageColor(stage);
    const isReceiving = receivingStage === stage;
    const overdueInStage = stageContacts.filter(c => {
      if (c.pipeline_stage === 'New') return false;
      const days = getDaysUntilDue(c.next_due);
      return days !== null && days < 0;
    }).length;

    return (
      <DraxView
        key={stage}
        style={[
          styles.stageColumn,
          isReceiving && styles.stageColumnReceiving,
          { borderColor: isReceiving ? stageColor : COLORS.borderLight }
        ]}
        receivingStyle={[styles.stageColumnReceiving, { borderColor: stageColor }]}
        onReceiveDragEnter={() => handleReceiveDragEnter(stage)}
        onReceiveDragExit={handleReceiveDragExit}
        onReceiveDragDrop={({ dragged: { payload } }) => {
          if (payload) {
            handleDrop(payload as Contact, stage);
          }
        }}
      >
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

        {/* Drop Zone Indicator */}
        {isReceiving && draggingContact && (
          <View style={[styles.dropZoneIndicator, { backgroundColor: stageColor + '15' }]}>
            <Ionicons name="add-circle" size={24} color={stageColor} />
            <Text style={[styles.dropZoneText, { color: stageColor }]}>
              Drop here to move to {stage}
            </Text>
          </View>
        )}

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
              <Text style={styles.emptyStageHint}>Drag contacts here</Text>
            </View>
          ) : (
            stageContacts.map(contact => renderContactCard(contact, stage))
          )}
        </ScrollView>
      </DraxView>
    );
  };

  return (
    <DraxProvider>
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
          <View style={styles.dragHintContainer}>
            <Ionicons name="hand-left-outline" size={16} color={COLORS.primary} />
            <Text style={styles.dragHint}>Long press & drag to move</Text>
          </View>
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
        >
          {PIPELINE_STAGES.map(stage => renderStageColumn(stage))}
        </ScrollView>

        {/* Dragging Overlay Info */}
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
      </View>
    </DraxProvider>
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
  dragHint: {
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
    gap: 12,
  },
  stageColumn: {
    width: COLUMN_WIDTH,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
    overflow: 'hidden',
    marginRight: 12,
    maxHeight: '100%',
  },
  stageColumnReceiving: {
    borderWidth: 2,
    borderStyle: 'dashed',
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
  dropZoneIndicator: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    gap: 8,
  },
  dropZoneText: {
    fontSize: 13,
    fontWeight: '600',
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
  },
  contactCardOverdue: {
    borderColor: COLORS.accent + '40',
    backgroundColor: COLORS.accent + '05',
  },
  contactCardDragging: {
    opacity: 0.9,
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
    transform: [{ scale: 1.02 }],
  },
  contactCardReleased: {
    opacity: 0.5,
  },
  contactCardHoverDragging: {
    borderColor: COLORS.primary,
    borderWidth: 2,
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
  dragHandle: {
    paddingLeft: 8,
    paddingRight: 4,
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
});

export default DragDropPipeline;
