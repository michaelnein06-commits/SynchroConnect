import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuth } from '../context/AuthContext';
import ContactImportPrompt from '../components/ContactImportPrompt';

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const COLORS = {
  primary: '#4F46E5',
  accent: '#FF6B6B',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  text: '#1E293B',
  textLight: '#64748B',
  border: '#E2E8F0',
};

const PIPELINE_STAGES = ['Weekly', 'Bi-Weekly', 'Monthly', 'Quarterly', 'Annually'];

interface Contact {
  id: string;
  name: string;
  job?: string;
  pipeline_stage: string;
  next_due?: string;
  notes?: string;
}

export default function Index() {
  const router = useRouter();
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStage, setSelectedStage] = useState('Monthly');
  const [showImportPrompt, setShowImportPrompt] = useState(false);

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

  useEffect(() => {
    fetchContacts();
    
    // Show import prompt if user hasn't imported contacts yet
    if (user && !user.has_imported_contacts) {
      setTimeout(() => {
        setShowImportPrompt(true);
      }, 1000);
    }
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchContacts();
  };

  const getDaysUntilDue = (nextDue?: string) => {
    if (!nextDue) return null;
    const due = new Date(nextDue);
    const now = new Date();
    const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const handleMoveContact = async (contactId: string, newStage: string) => {
    try {
      await axios.post(`${EXPO_PUBLIC_BACKEND_URL}/api/contacts/${contactId}/move-pipeline`, {
        pipeline_stage: newStage
      });
      fetchContacts();
    } catch (error) {
      console.error('Error moving contact:', error);
      Alert.alert('Error', 'Failed to move contact');
    }
  };

  const stageContacts = contacts.filter(c => c.pipeline_stage === selectedStage);

  const renderContactCard = ({ item, drag }: RenderItemParams<Contact>) => {
    const daysUntil = getDaysUntilDue(item.next_due);
    const isOverdue = daysUntil !== null && daysUntil < 0;
    const isDueSoon = daysUntil !== null && daysUntil >= 0 && daysUntil <= 3;

    return (
      <TouchableOpacity
        onLongPress={drag}
        onPress={() => router.push(`/contact/${item.id}`)}
        style={[
          styles.contactCard,
          isOverdue && styles.contactCardOverdue,
          isDueSoon && styles.contactCardDueSoon,
        ]}
      >
        <View style={styles.contactCardHeader}>
          <Text style={styles.contactName}>{item.name}</Text>
          <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.textLight} />
        </View>
        {item.job && <Text style={styles.contactJob}>{item.job}</Text>}
        {daysUntil !== null && (
          <View style={styles.dueBadge}>
            <Text style={styles.dueText}>
              {isOverdue ? `${Math.abs(daysUntil)}d overdue` : `Due in ${daysUntil}d`}
            </Text>
          </View>
        )}
        {item.notes && (
          <Text style={styles.contactNotes} numberOfLines={2}>
            {item.notes}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>SynchroConnectr</Text>
            <Text style={styles.headerSubtitle}>Stay Connected</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity 
              style={styles.iconButton}
              onPress={() => router.push('/import-contacts')}
            >
              <Ionicons name="download" size={24} color={COLORS.primary} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.iconButton}
              onPress={() => router.push('/morning-briefing')}
            >
              <Ionicons name="sunny" size={24} color={COLORS.primary} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.iconButton}
              onPress={() => router.push('/drafts')}
            >
              <Ionicons name="mail" size={24} color={COLORS.primary} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.iconButton}
              onPress={() => router.push('/settings')}
            >
              <Ionicons name="settings" size={24} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Pipeline Stage Selector */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.stageSelector}
          contentContainerStyle={styles.stageSelectorContent}
        >
          {PIPELINE_STAGES.map(stage => {
            const stageCount = contacts.filter(c => c.pipeline_stage === stage).length;
            return (
              <TouchableOpacity
                key={stage}
                style={[
                  styles.stageButton,
                  selectedStage === stage && styles.stageButtonActive
                ]}
                onPress={() => setSelectedStage(stage)}
              >
                <Text style={[
                  styles.stageButtonText,
                  selectedStage === stage && styles.stageButtonTextActive
                ]}>
                  {stage}
                </Text>
                <View style={[
                  styles.stageBadge,
                  selectedStage === stage && styles.stageBadgeActive
                ]}>
                  <Text style={[
                    styles.stageBadgeText,
                    selectedStage === stage && styles.stageBadgeTextActive
                  ]}>
                    {stageCount}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Contacts List */}
        <DraggableFlatList
          data={stageContacts}
          renderItem={renderContactCard}
          keyExtractor={(item) => item.id}
          onDragEnd={({ data }) => {
            // Update local state optimistically
            setContacts(prev => [
              ...prev.filter(c => c.pipeline_stage !== selectedStage),
              ...data
            ]);
          }}
          contentContainerStyle={styles.contactsList}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={64} color={COLORS.textLight} />
              <Text style={styles.emptyText}>No contacts in {selectedStage}</Text>
              <Text style={styles.emptySubtext}>Tap + to add your first contact</Text>
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
          }
        />

        {/* Add Button */}
        <TouchableOpacity 
          style={styles.fab}
          onPress={() => router.push('/contact/new')}
        >
          <Ionicons name="add" size={32} color={COLORS.surface} />
        </TouchableOpacity>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
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
  stageBadgeTextActive: {
    color: COLORS.primary,
  },
  contactsList: {
    padding: 16,
    gap: 12,
  },
  contactCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  contactCardOverdue: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.accent,
  },
  contactCardDueSoon: {
    borderLeftWidth: 4,
    borderLeftColor: '#FFA500',
  },
  contactCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  contactName: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  contactJob: {
    fontSize: 14,
    color: COLORS.textLight,
    marginBottom: 8,
  },
  dueBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.background,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  dueText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textLight,
  },
  contactNotes: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 4,
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
    bottom: 20,
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
});
