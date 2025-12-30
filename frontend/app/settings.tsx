import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Linking,
  Image,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { scheduleDailyMorningBriefing, cancelAllNotifications } from '../services/notificationService';
import { useAuth } from '../context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const EMERGENT_AUTH_URL = 'https://auth.emergentagent.com';

const COLORS = {
  primary: '#6366F1',
  accent: '#F43F5E',
  background: '#F1F5F9',
  surface: '#FFFFFF',
  text: '#0F172A',
  textLight: '#64748B',
  border: '#E2E8F0',
  success: '#10B981',
  google: '#4285F4',
  telegram: '#0088CC',
};

export default function Settings() {
  const router = useRouter();
  const { user, logout, token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [writingStyle, setWritingStyle] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  
  // Integration states
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState('');
  const [googleName, setGoogleName] = useState('');
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [telegramUsername, setTelegramUsername] = useState('');
  const [showTelegramModal, setShowTelegramModal] = useState(false);
  const [telegramChatId, setTelegramChatId] = useState('');
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [connectingTelegram, setConnectingTelegram] = useState(false);

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/auth/login');
          },
        },
      ]
    );
  };

  useEffect(() => {
    fetchSettings();
    fetchIntegrationStatus();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get(`${EXPO_PUBLIC_BACKEND_URL}/api/settings`);
      setWritingStyle(response.data.writing_style_sample || '');
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchIntegrationStatus = async () => {
    try {
      const response = await axios.get(`${EXPO_PUBLIC_BACKEND_URL}/api/integrations/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.google?.connected) {
        setGoogleConnected(true);
        setGoogleEmail(response.data.google.email || '');
        setGoogleName(response.data.google.name || '');
      }
      
      if (response.data.telegram?.connected) {
        setTelegramConnected(true);
        setTelegramUsername(response.data.telegram.username || '');
      }
    } catch (error) {
      console.error('Error fetching integration status:', error);
    }
  };

  const handleConnectGoogle = async () => {
    setConnectingGoogle(true);
    try {
      // Get the auth URL
      const redirectUrl = encodeURIComponent(`${EXPO_PUBLIC_BACKEND_URL}/api/integrations/google/callback-page`);
      const authUrl = `${EMERGENT_AUTH_URL}/?redirect=${redirectUrl}`;
      
      // Open the auth URL in browser
      const supported = await Linking.canOpenURL(authUrl);
      if (supported) {
        await Linking.openURL(authUrl);
        // User will be redirected back after auth
        // We'll need to handle the callback
        Alert.alert(
          'Google Sign In',
          'After signing in with Google, come back to this app and tap "Verify Connection" to complete the setup.',
          [
            { text: 'OK' }
          ]
        );
      }
    } catch (error) {
      console.error('Error connecting Google:', error);
      Alert.alert('Error', 'Failed to open Google sign-in');
    } finally {
      setConnectingGoogle(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    Alert.alert(
      'Disconnect Google',
      'Are you sure you want to disconnect your Google account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${EXPO_PUBLIC_BACKEND_URL}/api/integrations/google/disconnect`, {
                headers: { Authorization: `Bearer ${token}` }
              });
              setGoogleConnected(false);
              setGoogleEmail('');
              setGoogleName('');
              Alert.alert('Success', 'Google account disconnected');
            } catch (error) {
              Alert.alert('Error', 'Failed to disconnect Google');
            }
          }
        }
      ]
    );
  };

  const handleConnectTelegram = () => {
    setShowTelegramModal(true);
  };

  const submitTelegramConnection = async () => {
    if (!telegramChatId.trim()) {
      Alert.alert('Error', 'Please enter your Telegram Chat ID');
      return;
    }
    
    setConnectingTelegram(true);
    try {
      await axios.post(
        `${EXPO_PUBLIC_BACKEND_URL}/api/integrations/telegram/connect`,
        { chat_id: telegramChatId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTelegramConnected(true);
      setShowTelegramModal(false);
      setTelegramChatId('');
      Alert.alert('Success', 'Telegram connected successfully!');
      fetchIntegrationStatus();
    } catch (error) {
      console.error('Error connecting Telegram:', error);
      Alert.alert('Error', 'Failed to connect Telegram');
    } finally {
      setConnectingTelegram(false);
    }
  };

  const handleDisconnectTelegram = async () => {
    Alert.alert(
      'Disconnect Telegram',
      'Are you sure you want to disconnect your Telegram account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${EXPO_PUBLIC_BACKEND_URL}/api/integrations/telegram/disconnect`, {
                headers: { Authorization: `Bearer ${token}` }
              });
              setTelegramConnected(false);
              setTelegramUsername('');
              Alert.alert('Success', 'Telegram disconnected');
            } catch (error) {
              Alert.alert('Error', 'Failed to disconnect Telegram');
            }
          }
        }
      ]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${EXPO_PUBLIC_BACKEND_URL}/api/settings`, {
        writing_style_sample: writingStyle,
        notification_time: '09:00',
      });
      Alert.alert('Success', 'Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setSaving(false);
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving ? (
              <ActivityIndicator color={COLORS.primary} />
            ) : (
              <Text style={styles.saveButton}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {/* About Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <View style={styles.card}>
              <Text style={styles.appName}>SynchroConnectr</Text>
              <Text style={styles.appDescription}>
                Your AI-powered personal CRM to stay meaningfully connected with the people who
                matter most.
              </Text>
            </View>
          </View>

          {/* Notifications Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notifications</Text>
            <View style={styles.card}>
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Daily Morning Briefing</Text>
                  <Text style={styles.settingDescription}>
                    Get notified at 9 AM about contacts you should reach out to
                  </Text>
                </View>
                <Switch
                  value={notificationsEnabled}
                  onValueChange={async (value) => {
                    setNotificationsEnabled(value);
                    if (value) {
                      await scheduleDailyMorningBriefing(9, 0);
                      Alert.alert('Enabled', 'Morning briefing notifications enabled at 9 AM');
                    } else {
                      await cancelAllNotifications();
                      Alert.alert('Disabled', 'All notifications have been disabled');
                    }
                  }}
                  trackColor={{ false: COLORS.textLight, true: COLORS.primary }}
                  thumbColor={COLORS.surface}
                />
              </View>
            </View>
          </View>

          {/* Writing Style Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>AI Personalization</Text>
            <View style={styles.card}>
              <View style={styles.infoBox}>
                <Ionicons name="information-circle" size={20} color={COLORS.primary} />
                <Text style={styles.infoText}>
                  Provide a sample of your writing style so AI can mimic your tone when generating
                  message drafts.
                </Text>
              </View>

              <Text style={styles.label}>Your Writing Style Sample</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={writingStyle}
                onChangeText={setWritingStyle}
                placeholder="Hey! How have you been? Just wanted to catch up and see what you've been up to lately."
                placeholderTextColor={COLORS.textLight}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          </View>

          {/* Features Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Features</Text>
            <View style={styles.card}>
              <View style={styles.featureItem}>
                <View style={styles.featureIcon}>
                  <Ionicons name="people" size={24} color={COLORS.primary} />
                </View>
                <View style={styles.featureText}>
                  <Text style={styles.featureName}>Smart Pipeline</Text>
                  <Text style={styles.featureDescription}>
                    Organize contacts by connection frequency with randomized reminders
                  </Text>
                </View>
              </View>

              <View style={styles.featureItem}>
                <View style={styles.featureIcon}>
                  <Ionicons name="sparkles" size={24} color={COLORS.primary} />
                </View>
                <View style={styles.featureText}>
                  <Text style={styles.featureName}>AI Message Drafts</Text>
                  <Text style={styles.featureDescription}>
                    Personalized reconnection messages in your own writing style
                  </Text>
                </View>
              </View>

              <View style={styles.featureItem}>
                <View style={styles.featureIcon}>
                  <Ionicons name="sunny" size={24} color={COLORS.primary} />
                </View>
                <View style={styles.featureText}>
                  <Text style={styles.featureName}>Morning Briefing</Text>
                  <Text style={styles.featureDescription}>
                    See who you should reach out to today in a glanceable format
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Integrations Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Integrations</Text>
            <View style={styles.card}>
              {/* Google Integration */}
              <View style={styles.integrationItem}>
                <View style={[styles.integrationIcon, { backgroundColor: COLORS.google + '15' }]}>
                  <Ionicons name="logo-google" size={24} color={COLORS.google} />
                </View>
                <View style={styles.integrationInfo}>
                  <Text style={styles.integrationName}>Google</Text>
                  {googleConnected ? (
                    <Text style={styles.integrationStatus}>
                      Connected as {googleEmail}
                    </Text>
                  ) : (
                    <Text style={styles.integrationStatus}>
                      Connect Gmail & Calendar
                    </Text>
                  )}
                </View>
                {googleConnected ? (
                  <TouchableOpacity 
                    style={styles.disconnectButton}
                    onPress={handleDisconnectGoogle}
                  >
                    <Text style={styles.disconnectButtonText}>Disconnect</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity 
                    style={[styles.connectButton, { backgroundColor: COLORS.google }]}
                    onPress={handleConnectGoogle}
                    disabled={connectingGoogle}
                  >
                    {connectingGoogle ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.connectButtonText}>Connect</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {/* Telegram Integration */}
              <View style={[styles.integrationItem, { borderBottomWidth: 0 }]}>
                <View style={[styles.integrationIcon, { backgroundColor: COLORS.telegram + '15' }]}>
                  <Ionicons name="paper-plane" size={24} color={COLORS.telegram} />
                </View>
                <View style={styles.integrationInfo}>
                  <Text style={styles.integrationName}>Telegram</Text>
                  {telegramConnected ? (
                    <Text style={styles.integrationStatus}>
                      Connected {telegramUsername ? `@${telegramUsername}` : ''}
                    </Text>
                  ) : (
                    <Text style={styles.integrationStatus}>
                      Connect via Bot
                    </Text>
                  )}
                </View>
                {telegramConnected ? (
                  <TouchableOpacity 
                    style={styles.disconnectButton}
                    onPress={handleDisconnectTelegram}
                  >
                    <Text style={styles.disconnectButtonText}>Disconnect</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity 
                    style={[styles.connectButton, { backgroundColor: COLORS.telegram }]}
                    onPress={handleConnectTelegram}
                  >
                    <Text style={styles.connectButtonText}>Connect</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.integrationHint}>
              <Ionicons name="information-circle-outline" size={16} color={COLORS.textLight} />
              <Text style={styles.integrationHintText}>
                Connect your accounts to automatically track interactions and build richer contact profiles.
              </Text>
            </View>
          </View>

          {/* Account Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account</Text>
            <View style={styles.card}>
              <View style={styles.accountInfo}>
                <Ionicons name="person-circle-outline" size={48} color={COLORS.primary} />
                <View style={styles.accountText}>
                  <Text style={styles.accountName}>{user?.name}</Text>
                  <Text style={styles.accountEmail}>{user?.email}</Text>
                </View>
              </View>

              <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={20} color={COLORS.accent} />
                <Text style={styles.logoutButtonText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Telegram Setup Modal */}
        <Modal
          visible={showTelegramModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowTelegramModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Connect Telegram</Text>
                <TouchableOpacity onPress={() => setShowTelegramModal(false)}>
                  <Ionicons name="close" size={24} color={COLORS.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.telegramSteps}>
                <Text style={styles.stepsTitle}>Follow these steps:</Text>
                
                <View style={styles.step}>
                  <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
                  <Text style={styles.stepText}>Open Telegram and search for @BotFather</Text>
                </View>
                
                <View style={styles.step}>
                  <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
                  <Text style={styles.stepText}>Send /newbot and follow instructions to create your bot</Text>
                </View>
                
                <View style={styles.step}>
                  <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
                  <Text style={styles.stepText}>Start a chat with your new bot and send any message</Text>
                </View>
                
                <View style={styles.step}>
                  <View style={styles.stepNumber}><Text style={styles.stepNumberText}>4</Text></View>
                  <Text style={styles.stepText}>
                    Visit: api.telegram.org/bot{'<YOUR_TOKEN>'}/getUpdates to find your chat_id
                  </Text>
                </View>
              </View>

              <Text style={styles.inputLabel}>Enter your Chat ID</Text>
              <TextInput
                style={styles.modalInput}
                value={telegramChatId}
                onChangeText={setTelegramChatId}
                placeholder="e.g., 123456789"
                placeholderTextColor={COLORS.textLight}
                keyboardType="numeric"
              />

              <TouchableOpacity 
                style={[styles.modalButton, !telegramChatId.trim() && styles.modalButtonDisabled]}
                onPress={submitTelegramConnection}
                disabled={!telegramChatId.trim() || connectingTelegram}
              >
                {connectingTelegram ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalButtonText}>Connect Telegram</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
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
  saveButton: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
    paddingHorizontal: 8,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textLight,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  appName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 8,
  },
  appDescription: {
    fontSize: 14,
    color: COLORS.textLight,
    lineHeight: 20,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary + '10',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 10,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  featureText: {
    flex: 1,
  },
  featureName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: COLORS.textLight,
    lineHeight: 18,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: COLORS.textLight,
    lineHeight: 18,
  },
  accountInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  accountText: {
    marginLeft: 16,
    flex: 1,
  },
  accountName: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  accountEmail: {
    fontSize: 14,
    color: COLORS.textLight,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: COLORS.accent + '20',
    gap: 8,
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.accent,
  },
});
