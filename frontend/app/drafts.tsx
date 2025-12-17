import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
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

interface Draft {
  id: string;
  contact_id: string;
  contact_name: string;
  draft_message: string;
  created_at: string;
}

export default function Drafts() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDrafts = async () => {
    try {
      const response = await axios.get(`${EXPO_PUBLIC_BACKEND_URL}/api/drafts`);
      setDrafts(response.data);
    } catch (error) {
      console.error('Error fetching drafts:', error);
      Alert.alert('Error', 'Failed to load drafts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDrafts();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDrafts();
  };

  const handleCopy = async (message: string) => {
    await Clipboard.setStringAsync(message);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Copied', 'Message copied to clipboard');
  };

  const handleMarkSent = async (draftId: string) => {
    try {
      await axios.put(`${EXPO_PUBLIC_BACKEND_URL}/api/drafts/${draftId}/sent`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      fetchDrafts();
      Alert.alert('Success', 'Draft marked as sent and contact updated');
    } catch (error) {
      console.error('Error marking sent:', error);
      Alert.alert('Error', 'Failed to mark draft as sent');
    }
  };

  const handleDismiss = async (draftId: string) => {
    try {
      await axios.put(`${EXPO_PUBLIC_BACKEND_URL}/api/drafts/${draftId}/dismiss`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      fetchDrafts();
    } catch (error) {
      console.error('Error dismissing draft:', error);
      Alert.alert('Error', 'Failed to dismiss draft');
    }
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
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI Drafts</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
        }
      >
        {drafts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="mail-open-outline" size={64} color={COLORS.textLight} />
            <Text style={styles.emptyTitle}>No Drafts Yet</Text>
            <Text style={styles.emptyText}>
              Generate AI drafts from the morning briefing or contact details
            </Text>
          </View>
        ) : (
          drafts.map((draft) => (
            <View key={draft.id} style={styles.draftCard}>
              {/* Draft Header */}
              <View style={styles.draftHeader}>
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>
                    {draft.contact_name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.draftHeaderText}>
                  <Text style={styles.draftContactName}>{draft.contact_name}</Text>
                  <Text style={styles.draftTime}>
                    {new Date(draft.created_at).toLocaleDateString()}
                  </Text>
                </View>
              </View>

              {/* Draft Message */}
              <View style={styles.messageContainer}>
                <View style={styles.messageHeader}>
                  <Ionicons name="sparkles" size={16} color={COLORS.primary} />
                  <Text style={styles.messageLabel}>AI-Generated Message</Text>
                </View>
                <Text style={styles.messageText}>{draft.draft_message}</Text>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={styles.copyButton}
                  onPress={() => handleCopy(draft.draft_message)}
                >
                  <Ionicons name="copy-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.copyButtonText}>Copy</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sentButton}
                  onPress={() => handleMarkSent(draft.id)}
                >
                  <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.surface} />
                  <Text style={styles.sentButtonText}>Mark Sent</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dismissButton}
                  onPress={() => handleDismiss(draft.id)}
                >
                  <Ionicons name="close-circle-outline" size={18} color={COLORS.textLight} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
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
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  draftCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  draftHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.surface,
  },
  draftHeaderText: {
    flex: 1,
  },
  draftContactName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  draftTime: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  messageContainer: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  messageLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  messageText: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 22,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  copyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    gap: 6,
  },
  copyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  sentButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.success,
    gap: 6,
  },
  sentButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.surface,
  },
  dismissButton: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.background,
  },
});
