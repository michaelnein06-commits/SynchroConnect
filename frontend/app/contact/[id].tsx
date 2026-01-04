import React, { useState, useEffect, useRef } from 'react';
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
  Image,
  Modal,
  Pressable,
  FlatList,
  Keyboard,
  TouchableWithoutFeedback,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../../context/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  } catch (e) {}
};

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Premium Color Palette
const COLORS = {
  // Primary gradient colors
  primaryStart: '#6366F1',
  primaryEnd: '#8B5CF6',
  primary: '#6366F1',
  primaryLight: '#A5B4FC',
  primaryDark: '#4F46E5',
  
  // Accent colors
  accent: '#F43F5E',
  accentLight: '#FDA4AF',
  success: '#10B981',
  successLight: '#D1FAE5',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  
  // Neutrals
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#475569',
  textLight: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  
  // Interaction type colors
  meeting: '#8B5CF6',
  phone: '#06B6D4',
  email: '#F59E0B',
  whatsapp: '#22C55E',
  other: '#64748B',
  
  // Gradient presets
  gradientPrimary: ['#6366F1', '#8B5CF6'],
  gradientSuccess: ['#10B981', '#34D399'],
  gradientAccent: ['#F43F5E', '#FB7185'],
  gradientWarm: ['#F59E0B', '#FBBF24'],
};

const PIPELINE_STAGES = ['Weekly', 'Bi-Weekly', 'Monthly', 'Quarterly', 'Annually'];
const INTERACTION_TYPES = [
  { id: 'Personal Meeting', icon: 'people', color: COLORS.meeting },
  { id: 'Phone Call', icon: 'call', color: COLORS.phone },
  { id: 'Email', icon: 'mail', color: COLORS.email },
  { id: 'WhatsApp', icon: 'logo-whatsapp', color: COLORS.whatsapp },
  { id: 'Other', icon: 'chatbubble', color: COLORS.other },
];
const LANGUAGES = ['English', 'German', 'Spanish', 'French', 'Italian', 'Portuguese', 'Dutch', 'Russian', 'Chinese', 'Japanese'];
const TONES = ['Casual', 'Professional', 'Friendly', 'Formal'];

interface Interaction {
  id: string;
  interaction_type: string;
  date: string;
  notes?: string;
  created_at: string;
}

interface Group {
  id: string;
  name: string;
  color?: string;
}

export default function ContactDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { token } = useAuth();
  const isNew = id === 'new';
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(isNew);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [generatedDraft, setGeneratedDraft] = useState('');
  
  // Date picker states
  const [showBirthdayPicker, setShowBirthdayPicker] = useState(false);
  const [selectedBirthday, setSelectedBirthday] = useState(new Date(1990, 0, 1));
  
  // Interaction modal states
  const [showInteractionModal, setShowInteractionModal] = useState(false);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [newInteraction, setNewInteraction] = useState({
    type: 'Personal Meeting',
    date: new Date(),
    notes: '',
  });
  const [showInteractionDatePicker, setShowInteractionDatePicker] = useState(false);
  const [loggingInteraction, setLoggingInteraction] = useState(false);
  
  // Groups
  const [availableGroups, setAvailableGroups] = useState<Group[]>([]);
  const [showGroupsModal, setShowGroupsModal] = useState(false);
  
  const [profileImage, setProfileImage] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    job: '',
    location: '',
    academic_degree: '',
    birthday: '',
    hobbies: '',
    favorite_food: '',
    how_we_met: '',
    pipeline_stage: 'Monthly',
    groups: [] as string[],
    language: 'English',
    tone: 'Casual',
    example_message: '',
    conversation_screenshots: [] as string[],  // Up to 3 screenshots for AI style learning
    notes: '',
    profile_picture: '',
    last_contact_date: '',
    next_due: '',
  });

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    if (!isNew) {
      fetchContact();
      fetchInteractions();
    }
    fetchGroups();
  }, [id]);

  const fetchContact = async () => {
    try {
      const response = await axios.get(`${EXPO_PUBLIC_BACKEND_URL}/api/contacts/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const contact = response.data;
      setFormData({
        name: contact.name || '',
        phone: contact.phone || '',
        email: contact.email || '',
        job: contact.job || '',
        location: contact.location || '',
        academic_degree: contact.academic_degree || '',
        birthday: contact.birthday || '',
        hobbies: contact.hobbies || '',
        favorite_food: contact.favorite_food || '',
        how_we_met: contact.how_we_met || '',
        pipeline_stage: contact.pipeline_stage || 'Monthly',
        groups: contact.groups || [],
        language: contact.language || 'English',
        tone: contact.tone || 'Casual',
        example_message: contact.example_message || '',
        conversation_screenshots: contact.conversation_screenshots || [],
        notes: contact.notes || '',
        profile_picture: contact.profile_picture || '',
        last_contact_date: contact.last_contact_date || '',
        next_due: contact.next_due || '',
      });
      if (contact.profile_picture) {
        setProfileImage(contact.profile_picture);
      }
      if (contact.birthday) {
        try {
          setSelectedBirthday(new Date(contact.birthday));
        } catch (e) {}
      }
    } catch (error) {
      console.error('Error fetching contact:', error);
      Alert.alert('Error', 'Failed to load contact');
    } finally {
      setLoading(false);
    }
  };

  const fetchInteractions = async () => {
    try {
      const response = await axios.get(`${EXPO_PUBLIC_BACKEND_URL}/api/contacts/${id}/interactions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setInteractions(response.data);
    } catch (error) {
      console.error('Error fetching interactions:', error);
    }
  };

  const fetchGroups = async () => {
    try {
      const response = await axios.get(`${EXPO_PUBLIC_BACKEND_URL}/api/groups`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAvailableGroups(response.data);
    } catch (error) {
      console.error('Error fetching groups:', error);
    }
  };

  const handleBirthdayChange = (event: any, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowBirthdayPicker(false);
    }
    if (date) {
      setSelectedBirthday(date);
      setFormData({ ...formData, birthday: format(date, 'yyyy-MM-dd') });
    }
  };

  const confirmBirthday = () => {
    setFormData({ ...formData, birthday: format(selectedBirthday, 'yyyy-MM-dd') });
    setShowBirthdayPicker(false);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setProfileImage(base64Image);
      setFormData({ ...formData, profile_picture: base64Image });
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }

    setSaving(true);
    try {
      const contactData = {
        name: formData.name,
        phone: formData.phone || null,
        email: formData.email || null,
        job: formData.job || null,
        location: formData.location || null,
        academic_degree: formData.academic_degree || null,
        birthday: formData.birthday || null,
        hobbies: formData.hobbies || null,
        favorite_food: formData.favorite_food || null,
        how_we_met: formData.how_we_met || null,
        pipeline_stage: formData.pipeline_stage,
        groups: formData.groups,
        language: formData.language,
        tone: formData.tone,
        example_message: formData.example_message || null,
        conversation_screenshots: formData.conversation_screenshots || [],
        notes: formData.notes || null,
        profile_picture: formData.profile_picture || null,
      };

      if (isNew) {
        await axios.post(`${EXPO_PUBLIC_BACKEND_URL}/api/contacts`, contactData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        Alert.alert('Success', 'Contact created!');
        router.back();
      } else {
        await axios.put(`${EXPO_PUBLIC_BACKEND_URL}/api/contacts/${id}`, contactData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        Alert.alert('Success', 'Contact updated!');
        setIsEditing(false);
        triggerHaptic('success');
      }
    } catch (error: any) {
      console.error('Error saving contact:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to save contact');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Contact',
      `Are you sure you want to delete ${formData.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${EXPO_PUBLIC_BACKEND_URL}/api/contacts/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
              });
              Alert.alert('Success', 'Contact deleted');
              router.back();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete contact');
            }
          },
        },
      ]
    );
  };

  const logInteraction = async () => {
    setLoggingInteraction(true);
    try {
      await axios.post(
        `${EXPO_PUBLIC_BACKEND_URL}/api/contacts/${id}/interactions`,
        {
          interaction_type: newInteraction.type,
          date: format(newInteraction.date, 'yyyy-MM-dd'),
          notes: newInteraction.notes || null,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      triggerHaptic('success');
      setShowInteractionModal(false);
      setNewInteraction({ type: 'Personal Meeting', date: new Date(), notes: '' });
      fetchInteractions();
      fetchContact();
      Alert.alert('✓ Logged!', 'Interaction has been recorded');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to log interaction');
    } finally {
      setLoggingInteraction(false);
    }
  };

  const generateAIDraft = async () => {
    setGeneratingDraft(true);
    try {
      const response = await axios.post(
        `${EXPO_PUBLIC_BACKEND_URL}/api/drafts/generate/${id}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setGeneratedDraft(response.data.draft_message);
      setShowDraftModal(true);
      triggerHaptic('success');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to generate AI draft');
    } finally {
      setGeneratingDraft(false);
    }
  };

  const copyDraftToClipboard = async () => {
    await Clipboard.setStringAsync(generatedDraft);
    triggerHaptic('light');
    Alert.alert('Copied!', 'Draft message copied to clipboard');
  };

  const toggleGroup = (groupId: string) => {
    const newGroups = formData.groups.includes(groupId)
      ? formData.groups.filter(g => g !== groupId)
      : [...formData.groups, groupId];
    setFormData({ ...formData, groups: newGroups });
  };

  const getInteractionColor = (type: string) => {
    const found = INTERACTION_TYPES.find(t => t.id === type);
    return found?.color || COLORS.other;
  };

  const getInteractionIcon = (type: string) => {
    const found = INTERACTION_TYPES.find(t => t.id === type);
    return found?.icon || 'chatbubble';
  };

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient colors={COLORS.gradientPrimary} style={styles.loadingGradient}>
          <ActivityIndicator size="large" color={COLORS.surface} />
          <Text style={styles.loadingText}>Loading contact...</Text>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with gradient */}
      <LinearGradient colors={COLORS.gradientPrimary} style={styles.headerGradient}>
        <SafeAreaView edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
              <Ionicons name="chevron-back" size={28} color={COLORS.surface} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{isNew ? 'New Contact' : ''}</Text>
            {!isNew && !isEditing ? (
              <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.headerButton}>
                <View style={styles.editPill}>
                  <Ionicons name="create-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.editPillText}>Edit</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.headerButton}>
                {saving ? (
                  <ActivityIndicator color={COLORS.surface} size="small" />
                ) : (
                  <View style={styles.savePill}>
                    <Ionicons name="checkmark" size={18} color={COLORS.surface} />
                    <Text style={styles.savePillText}>Save</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </LinearGradient>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        <Animated.ScrollView 
          style={[styles.content, { opacity: fadeAnim }]}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Profile Hero Section */}
          <View style={styles.profileHero}>
            <TouchableOpacity 
              style={styles.profilePictureContainer} 
              onPress={isEditing ? pickImage : undefined}
              disabled={!isEditing}
              activeOpacity={isEditing ? 0.7 : 1}
            >
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.profilePicture} />
              ) : (
                <LinearGradient colors={['#E0E7FF', '#C7D2FE']} style={styles.profilePicturePlaceholder}>
                  <Ionicons name="person" size={60} color={COLORS.primary} />
                </LinearGradient>
              )}
              {isEditing && (
                <View style={styles.cameraButton}>
                  <Ionicons name="camera" size={18} color={COLORS.surface} />
                </View>
              )}
            </TouchableOpacity>
            
            {!isEditing && formData.name && (
              <>
                <Text style={styles.profileName}>{formData.name}</Text>
                {formData.job && <Text style={styles.profileJob}>{formData.job}</Text>}
                {formData.location && (
                  <View style={styles.locationBadge}>
                    <Ionicons name="location" size={14} color={COLORS.primary} />
                    <Text style={styles.locationText}>{formData.location}</Text>
                  </View>
                )}
              </>
            )}
          </View>

          {/* Quick Action Buttons - Only in view mode */}
          {!isNew && !isEditing && (
            <View style={styles.quickActions}>
              <TouchableOpacity 
                style={styles.primaryActionButton}
                onPress={() => setShowInteractionModal(true)}
                activeOpacity={0.8}
              >
                <LinearGradient colors={COLORS.gradientSuccess} style={styles.actionGradient}>
                  <Ionicons name="checkmark-done-circle" size={24} color={COLORS.surface} />
                  <Text style={styles.primaryActionText}>Log Interaction</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.secondaryActionButton}
                onPress={generateAIDraft}
                disabled={generatingDraft}
                activeOpacity={0.8}
              >
                {generatingDraft ? (
                  <ActivityIndicator color={COLORS.primary} />
                ) : (
                  <>
                    <View style={styles.sparkleIcon}>
                      <Ionicons name="sparkles" size={22} color={COLORS.primary} />
                    </View>
                    <Text style={styles.secondaryActionText}>Generate AI Draft</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Stats Card - Only in view mode */}
          {!isNew && !isEditing && (
            <View style={styles.statsCard}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{interactions.length}</Text>
                <Text style={styles.statLabel}>Interactions</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{formData.pipeline_stage}</Text>
                <Text style={styles.statLabel}>Frequency</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statNumber, { color: COLORS.success }]}>
                  {formData.next_due ? Math.max(0, Math.ceil((new Date(formData.next_due).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : '-'}
                </Text>
                <Text style={styles.statLabel}>Days Left</Text>
              </View>
            </View>
          )}

          {/* Basic Info Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconWrapper}>
                <Ionicons name="person-outline" size={18} color={COLORS.primary} />
              </View>
              <Text style={styles.sectionTitle}>Basic Information</Text>
            </View>
            <View style={styles.card}>
              <FormField 
                label="Name" 
                value={formData.name} 
                placeholder="Full name"
                isEditing={isEditing}
                required
                onChange={(text) => setFormData({ ...formData, name: text })}
              />
              <FormField 
                label="Phone" 
                value={formData.phone} 
                placeholder="+1 234 567 8900"
                isEditing={isEditing}
                keyboardType="phone-pad"
                onChange={(text) => setFormData({ ...formData, phone: text })}
              />
              <FormField 
                label="Email" 
                value={formData.email} 
                placeholder="email@example.com"
                isEditing={isEditing}
                keyboardType="email-address"
                onChange={(text) => setFormData({ ...formData, email: text })}
              />
              <FormField 
                label="Job Title" 
                value={formData.job} 
                placeholder="Software Engineer"
                isEditing={isEditing}
                onChange={(text) => setFormData({ ...formData, job: text })}
              />
              <FormField 
                label="Location" 
                value={formData.location} 
                placeholder="San Francisco, CA"
                isEditing={isEditing}
                icon="location-outline"
                onChange={(text) => setFormData({ ...formData, location: text })}
              />
              <FormField 
                label="Education" 
                value={formData.academic_degree} 
                placeholder="Bachelor's in Computer Science"
                isEditing={isEditing}
                icon="school-outline"
                onChange={(text) => setFormData({ ...formData, academic_degree: text })}
              />
              
              {/* Birthday */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Birthday</Text>
                {isEditing ? (
                  <TouchableOpacity
                    style={styles.dateButton}
                    onPress={() => setShowBirthdayPicker(true)}
                  >
                    <Ionicons name="calendar-outline" size={20} color={COLORS.primary} />
                    <Text style={[styles.dateButtonText, !formData.birthday && styles.placeholder]}>
                      {formData.birthday ? format(new Date(formData.birthday), 'MMMM dd, yyyy') : 'Select birthday'}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.fieldValue}>
                    {formData.birthday ? format(new Date(formData.birthday), 'MMMM dd, yyyy') : '-'}
                  </Text>
                )}
              </View>
            </View>
          </View>

          {/* Birthday Picker Modal */}
          <Modal visible={showBirthdayPicker} transparent animationType="fade">
            <TouchableWithoutFeedback onPress={() => setShowBirthdayPicker(false)}>
              <View style={styles.modalOverlay}>
                <TouchableWithoutFeedback>
                  <View style={styles.dateModalContent}>
                    <View style={styles.dateModalHeader}>
                      <TouchableOpacity onPress={() => setShowBirthdayPicker(false)}>
                        <Text style={styles.modalCancelText}>Cancel</Text>
                      </TouchableOpacity>
                      <Text style={styles.dateModalTitle}>Birthday</Text>
                      <TouchableOpacity onPress={confirmBirthday}>
                        <Text style={styles.modalDoneText}>Done</Text>
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker
                      value={selectedBirthday}
                      mode="date"
                      display="spinner"
                      onChange={handleBirthdayChange}
                      maximumDate={new Date()}
                      style={{ height: 200 }}
                    />
                  </View>
                </TouchableWithoutFeedback>
              </View>
            </TouchableWithoutFeedback>
          </Modal>

          {/* Connection Frequency Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconWrapper}>
                <Ionicons name="repeat-outline" size={18} color={COLORS.primary} />
              </View>
              <Text style={styles.sectionTitle}>Connection Frequency</Text>
            </View>
            <View style={styles.card}>
              <View style={styles.pipelineGrid}>
                {PIPELINE_STAGES.map((stage) => {
                  const isSelected = formData.pipeline_stage === stage;
                  return (
                    <TouchableOpacity
                      key={stage}
                      style={[styles.pipelineChip, isSelected && styles.pipelineChipSelected]}
                      onPress={() => isEditing && setFormData({ ...formData, pipeline_stage: stage })}
                      disabled={!isEditing}
                      activeOpacity={isEditing ? 0.7 : 1}
                    >
                      {isSelected && (
                        <LinearGradient colors={COLORS.gradientPrimary} style={styles.pipelineChipGradient} />
                      )}
                      <Text style={[styles.pipelineChipText, isSelected && styles.pipelineChipTextSelected]}>
                        {stage}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Groups Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconWrapper}>
                <Ionicons name="albums-outline" size={18} color={COLORS.primary} />
              </View>
              <Text style={styles.sectionTitle}>Groups</Text>
            </View>
            <View style={styles.card}>
              {isEditing ? (
                <TouchableOpacity style={styles.groupSelector} onPress={() => setShowGroupsModal(true)}>
                  <View style={styles.groupSelectorLeft}>
                    <Ionicons name="add-circle-outline" size={22} color={COLORS.primary} />
                    <Text style={styles.groupSelectorText}>
                      {formData.groups.length > 0 
                        ? `${formData.groups.length} group(s) selected`
                        : 'Tap to select groups'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
                </TouchableOpacity>
              ) : (
                <View style={styles.groupsDisplay}>
                  {formData.groups.length > 0 ? (
                    formData.groups.map((groupId) => {
                      const group = availableGroups.find(g => g.id === groupId);
                      return group ? (
                        <View key={groupId} style={[styles.groupChip, { backgroundColor: (group.color || COLORS.primary) + '20' }]}>
                          <View style={[styles.groupDot, { backgroundColor: group.color || COLORS.primary }]} />
                          <Text style={[styles.groupChipText, { color: group.color || COLORS.primary }]}>{group.name}</Text>
                        </View>
                      ) : null;
                    })
                  ) : (
                    <Text style={styles.emptyText}>No groups assigned</Text>
                  )}
                </View>
              )}
            </View>
          </View>

          {/* Personal Details Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconWrapper}>
                <Ionicons name="heart-outline" size={18} color={COLORS.primary} />
              </View>
              <Text style={styles.sectionTitle}>Personal Details</Text>
            </View>
            <View style={styles.card}>
              <FormField 
                label="Hobbies" 
                value={formData.hobbies} 
                placeholder="Tennis, Photography, Cooking"
                isEditing={isEditing}
                onChange={(text) => setFormData({ ...formData, hobbies: text })}
              />
              <FormField 
                label="Favorite Food" 
                value={formData.favorite_food} 
                placeholder="Italian cuisine, Sushi"
                isEditing={isEditing}
                onChange={(text) => setFormData({ ...formData, favorite_food: text })}
              />
              <FormField 
                label="How We Met" 
                value={formData.how_we_met} 
                placeholder="University, conference, mutual friend..."
                isEditing={isEditing}
                onChange={(text) => setFormData({ ...formData, how_we_met: text })}
              />
            </View>
          </View>

          {/* Communication Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconWrapper}>
                <Ionicons name="chatbubbles-outline" size={18} color={COLORS.primary} />
              </View>
              <Text style={styles.sectionTitle}>Communication</Text>
            </View>
            <View style={styles.card}>
              {/* Language */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Language</Text>
                {isEditing ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.optionsScroll}>
                    {LANGUAGES.map((lang) => (
                      <TouchableOpacity
                        key={lang}
                        style={[styles.optionPill, formData.language === lang && styles.optionPillSelected]}
                        onPress={() => setFormData({ ...formData, language: lang })}
                      >
                        <Text style={[styles.optionPillText, formData.language === lang && styles.optionPillTextSelected]}>
                          {lang}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                ) : (
                  <Text style={styles.fieldValue}>{formData.language}</Text>
                )}
              </View>

              {/* Tone */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Tone</Text>
                {isEditing ? (
                  <View style={styles.toneGrid}>
                    {TONES.map((tone) => (
                      <TouchableOpacity
                        key={tone}
                        style={[styles.tonePill, formData.tone === tone && styles.tonePillSelected]}
                        onPress={() => setFormData({ ...formData, tone: tone })}
                      >
                        <Text style={[styles.tonePillText, formData.tone === tone && styles.tonePillTextSelected]}>
                          {tone}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.fieldValue}>{formData.tone}</Text>
                )}
              </View>

              {/* Example Message */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Example Message (AI Tone)</Text>
                <Text style={styles.fieldHint}>
                  Sample text so AI learns this contact's specific tone
                </Text>
                {isEditing ? (
                  <TextInput
                    style={styles.textArea}
                    value={formData.example_message}
                    onChangeText={(text) => setFormData({ ...formData, example_message: text })}
                    placeholder='e.g., "Hey Digga, wie siehts aus?"'
                    placeholderTextColor={COLORS.textLight}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                ) : (
                  <Text style={styles.fieldValue}>{formData.example_message || '-'}</Text>
                )}
              </View>
            </View>
          </View>

          {/* Notes Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconWrapper}>
                <Ionicons name="document-text-outline" size={18} color={COLORS.primary} />
              </View>
              <Text style={styles.sectionTitle}>Notes</Text>
            </View>
            <View style={styles.card}>
              {isEditing ? (
                <TextInput
                  style={styles.textArea}
                  value={formData.notes}
                  onChangeText={(text) => setFormData({ ...formData, notes: text })}
                  placeholder="Add notes about this person..."
                  placeholderTextColor={COLORS.textLight}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              ) : (
                <Text style={[styles.fieldValue, !formData.notes && styles.emptyText]}>
                  {formData.notes || 'No notes yet'}
                </Text>
              )}
            </View>
          </View>

          {/* Interaction History Section */}
          {!isNew && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconWrapper}>
                  <Ionicons name="time-outline" size={18} color={COLORS.primary} />
                </View>
                <Text style={styles.sectionTitle}>Interaction History</Text>
              </View>
              <View style={styles.card}>
                {interactions.length === 0 ? (
                  <View style={styles.emptyHistory}>
                    <Ionicons name="calendar-outline" size={40} color={COLORS.textLight} />
                    <Text style={styles.emptyHistoryText}>No interactions logged yet</Text>
                    <Text style={styles.emptyHistoryHint}>Tap "Log Interaction" to record your first meeting</Text>
                  </View>
                ) : (
                  interactions.slice(0, 5).map((interaction, index) => (
                    <View key={interaction.id} style={[styles.historyItem, index === 0 && styles.historyItemFirst]}>
                      <View style={[styles.historyIcon, { backgroundColor: getInteractionColor(interaction.interaction_type) + '20' }]}>
                        <Ionicons name={getInteractionIcon(interaction.interaction_type) as any} size={18} color={getInteractionColor(interaction.interaction_type)} />
                      </View>
                      <View style={styles.historyContent}>
                        <Text style={styles.historyType}>{interaction.interaction_type}</Text>
                        <Text style={styles.historyDate}>{format(new Date(interaction.date), 'MMMM dd, yyyy')}</Text>
                        {interaction.notes && <Text style={styles.historyNotes}>{interaction.notes}</Text>}
                      </View>
                    </View>
                  ))
                )}
              </View>
            </View>
          )}

          {/* Delete Button */}
          {!isNew && isEditing && (
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={20} color={COLORS.accent} />
              <Text style={styles.deleteButtonText}>Delete Contact</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 50 }} />
        </Animated.ScrollView>
      </KeyboardAvoidingView>

      {/* Log Interaction Modal */}
      <Modal visible={showInteractionModal} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={dismissKeyboard}>
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
            style={styles.modalOverlay}
          >
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.interactionModalContent}>
                <View style={styles.modalHandle} />
                
                <View style={styles.interactionModalHeader}>
                  <TouchableOpacity onPress={() => setShowInteractionModal(false)} style={styles.modalCloseBtn}>
                    <Ionicons name="close" size={24} color={COLORS.textLight} />
                  </TouchableOpacity>
                  <Text style={styles.interactionModalTitle}>Log Interaction</Text>
                  <View style={{ width: 40 }} />
                </View>

                <ScrollView 
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingBottom: 20 }}
                >
                  <Text style={styles.modalLabel}>Interaction Type</Text>
                  <View style={styles.interactionTypeGrid}>
                    {INTERACTION_TYPES.map((type) => {
                      const isSelected = newInteraction.type === type.id;
                      return (
                        <TouchableOpacity
                          key={type.id}
                          style={[styles.interactionTypeCard, isSelected && { borderColor: type.color, backgroundColor: type.color + '10' }]}
                          onPress={() => setNewInteraction({ ...newInteraction, type: type.id })}
                        >
                          <View style={[styles.interactionTypeIcon, { backgroundColor: type.color + '20' }]}>
                            <Ionicons name={type.icon as any} size={22} color={type.color} />
                          </View>
                          <Text style={[styles.interactionTypeText, isSelected && { color: type.color, fontWeight: '600' }]}>
                            {type.id.replace('Personal ', '')}
                          </Text>
                          {isSelected && (
                            <View style={[styles.selectedCheck, { backgroundColor: type.color }]}>
                              <Ionicons name="checkmark" size={12} color="#fff" />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={styles.modalLabel}>Date</Text>
                  <TouchableOpacity
                    style={styles.dateButton}
                    onPress={() => setShowInteractionDatePicker(true)}
                  >
                    <Ionicons name="calendar-outline" size={20} color={COLORS.primary} />
                    <Text style={styles.dateButtonText}>
                      {format(newInteraction.date, 'EEEE, MMMM dd, yyyy')}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
                  </TouchableOpacity>

                  {showInteractionDatePicker && (
                    <View style={styles.inlineDatePicker}>
                      <DateTimePicker
                        value={newInteraction.date}
                        mode="date"
                        display="spinner"
                        onChange={(event, date) => {
                          if (date) setNewInteraction({ ...newInteraction, date });
                        }}
                        maximumDate={new Date()}
                        style={{ height: 150 }}
                      />
                      <TouchableOpacity 
                        style={styles.datePickerDone}
                        onPress={() => setShowInteractionDatePicker(false)}
                      >
                        <Text style={styles.datePickerDoneText}>Done</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  <Text style={styles.modalLabel}>Notes (optional)</Text>
                  <TextInput
                    style={styles.notesInput}
                    value={newInteraction.notes}
                    onChangeText={(text) => setNewInteraction({ ...newInteraction, notes: text })}
                    placeholder="What did you talk about?"
                    placeholderTextColor={COLORS.textLight}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                </ScrollView>

                <TouchableOpacity
                  style={styles.logButton}
                  onPress={logInteraction}
                  disabled={loggingInteraction}
                  activeOpacity={0.8}
                >
                  <LinearGradient colors={COLORS.gradientSuccess} style={styles.logButtonGradient}>
                    {loggingInteraction ? (
                      <ActivityIndicator color={COLORS.surface} />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={22} color={COLORS.surface} />
                        <Text style={styles.logButtonText}>Log Interaction</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Groups Selection Modal */}
      <Modal visible={showGroupsModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.groupsModalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.groupsModalTitle}>Select Groups</Text>
            
            {availableGroups.length === 0 ? (
              <View style={styles.emptyGroups}>
                <Ionicons name="albums-outline" size={48} color={COLORS.textLight} />
                <Text style={styles.emptyGroupsText}>No groups created yet</Text>
              </View>
            ) : (
              <FlatList
                data={availableGroups}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  const isSelected = formData.groups.includes(item.id);
                  return (
                    <TouchableOpacity
                      style={[styles.groupOption, isSelected && styles.groupOptionSelected]}
                      onPress={() => toggleGroup(item.id)}
                    >
                      <View style={[styles.groupOptionDot, { backgroundColor: item.color || COLORS.primary }]} />
                      <Text style={styles.groupOptionText}>{item.name}</Text>
                      {isSelected && (
                        <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
                      )}
                    </TouchableOpacity>
                  );
                }}
                style={{ maxHeight: 350 }}
              />
            )}

            <TouchableOpacity
              style={styles.groupsDoneButton}
              onPress={() => setShowGroupsModal(false)}
            >
              <Text style={styles.groupsDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* AI Draft Modal */}
      <Modal visible={showDraftModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.draftModalContent}>
            <View style={styles.modalHandle} />
            
            <View style={styles.draftModalHeader}>
              <LinearGradient colors={COLORS.gradientPrimary} style={styles.draftIconGradient}>
                <Ionicons name="sparkles" size={24} color={COLORS.surface} />
              </LinearGradient>
              <View>
                <Text style={styles.draftModalTitle}>AI Generated Draft</Text>
                <Text style={styles.draftModalSubtitle}>For {formData.name}</Text>
              </View>
            </View>

            <View style={styles.draftBubble}>
              <Text style={styles.draftText}>{generatedDraft}</Text>
            </View>

            <View style={styles.draftActions}>
              <TouchableOpacity style={styles.draftCopyBtn} onPress={copyDraftToClipboard}>
                <Ionicons name="copy-outline" size={20} color={COLORS.primary} />
                <Text style={styles.draftCopyText}>Copy</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.draftRegenerateBtn}
                onPress={() => { setShowDraftModal(false); generateAIDraft(); }}
              >
                <Ionicons name="refresh" size={20} color={COLORS.textSecondary} />
                <Text style={styles.draftRegenerateText}>Regenerate</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.draftDoneBtn} onPress={() => setShowDraftModal(false)}>
              <Text style={styles.draftDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Reusable Form Field Component
const FormField = ({ 
  label, 
  value, 
  placeholder, 
  isEditing, 
  onChange, 
  keyboardType = 'default',
  icon,
  required = false,
}: {
  label: string;
  value: string;
  placeholder: string;
  isEditing: boolean;
  onChange: (text: string) => void;
  keyboardType?: 'default' | 'phone-pad' | 'email-address';
  icon?: string;
  required?: boolean;
}) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>
      {label} {required && <Text style={{ color: COLORS.accent }}>*</Text>}
    </Text>
    {isEditing ? (
      <View style={styles.inputWrapper}>
        {icon && <Ionicons name={icon as any} size={18} color={COLORS.textLight} style={{ marginRight: 10 }} />}
        <TextInput
          style={[styles.input, icon && { paddingLeft: 0 }]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textLight}
          keyboardType={keyboardType as any}
          autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
        />
      </View>
    ) : (
      <Text style={[styles.fieldValue, !value && styles.emptyText]}>{value || '-'}</Text>
    )}
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1 },
  loadingGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: COLORS.surface, fontSize: 16, marginTop: 12 },
  
  // Header
  headerGradient: { paddingBottom: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 },
  headerButton: { width: 70, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: COLORS.surface },
  editPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 4 },
  editPillText: { fontSize: 14, fontWeight: '600', color: COLORS.primary },
  savePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 4 },
  savePillText: { fontSize: 14, fontWeight: '600', color: COLORS.surface },
  
  content: { flex: 1 },
  contentContainer: { paddingBottom: 20 },
  
  // Profile Hero
  profileHero: { alignItems: 'center', paddingVertical: 24, backgroundColor: COLORS.surface, marginHorizontal: 16, marginTop: -10, borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5 },
  profilePictureContainer: { position: 'relative', marginBottom: 12 },
  profilePicture: { width: 110, height: 110, borderRadius: 55, borderWidth: 4, borderColor: COLORS.surface },
  profilePicturePlaceholder: { width: 110, height: 110, borderRadius: 55, justifyContent: 'center', alignItems: 'center' },
  cameraButton: { position: 'absolute', bottom: 0, right: 0, width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: COLORS.surface },
  profileName: { fontSize: 26, fontWeight: 'bold', color: COLORS.text, marginTop: 4 },
  profileJob: { fontSize: 16, color: COLORS.textSecondary, marginTop: 2 },
  locationBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, backgroundColor: COLORS.primary + '10', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  locationText: { fontSize: 13, color: COLORS.primary, fontWeight: '500' },
  
  // Quick Actions
  quickActions: { paddingHorizontal: 16, marginTop: 16, gap: 10 },
  primaryActionButton: { borderRadius: 16, overflow: 'hidden', shadowColor: COLORS.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  actionGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 10 },
  primaryActionText: { fontSize: 17, fontWeight: '700', color: COLORS.surface },
  secondaryActionButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, padding: 16, borderRadius: 16, borderWidth: 2, borderColor: COLORS.primary, gap: 10 },
  sparkleIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primary + '15', justifyContent: 'center', alignItems: 'center' },
  secondaryActionText: { fontSize: 16, fontWeight: '600', color: COLORS.primary },
  
  // Stats Card
  statsCard: { flexDirection: 'row', backgroundColor: COLORS.surface, marginHorizontal: 16, marginTop: 16, borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  statItem: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 24, fontWeight: 'bold', color: COLORS.text },
  statLabel: { fontSize: 12, color: COLORS.textLight, marginTop: 4 },
  statDivider: { width: 1, backgroundColor: COLORS.border, marginHorizontal: 16 },
  
  // Section
  section: { marginTop: 24, paddingHorizontal: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  sectionIconWrapper: { width: 32, height: 32, borderRadius: 10, backgroundColor: COLORS.primary + '15', justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  card: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  
  // Field
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 8 },
  fieldValue: { fontSize: 16, color: COLORS.text, lineHeight: 22 },
  fieldHint: { fontSize: 12, color: COLORS.textLight, marginBottom: 8 },
  emptyText: { color: COLORS.textLight, fontStyle: 'italic' },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background, borderRadius: 12, paddingHorizontal: 14 },
  input: { flex: 1, fontSize: 16, color: COLORS.text, paddingVertical: 14 },
  textArea: { backgroundColor: COLORS.background, borderRadius: 12, padding: 14, fontSize: 16, color: COLORS.text, minHeight: 100, textAlignVertical: 'top' },
  
  // Date Button
  dateButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background, borderRadius: 12, padding: 14, gap: 10 },
  dateButtonText: { flex: 1, fontSize: 16, color: COLORS.text },
  placeholder: { color: COLORS.textLight },
  
  // Pipeline Grid
  pipelineGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pipelineChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: COLORS.background, overflow: 'hidden' },
  pipelineChipSelected: { backgroundColor: COLORS.primary },
  pipelineChipGradient: { ...StyleSheet.absoluteFillObject },
  pipelineChipText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  pipelineChipTextSelected: { color: COLORS.surface },
  
  // Groups
  groupSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  groupSelectorLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupSelectorText: { fontSize: 16, color: COLORS.textSecondary },
  groupsDisplay: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  groupChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, gap: 6 },
  groupDot: { width: 8, height: 8, borderRadius: 4 },
  groupChipText: { fontSize: 14, fontWeight: '600' },
  
  // Options
  optionsScroll: { marginTop: 4 },
  optionPill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: COLORS.background, marginRight: 8 },
  optionPillSelected: { backgroundColor: COLORS.primary },
  optionPillText: { fontSize: 14, fontWeight: '500', color: COLORS.textSecondary },
  optionPillTextSelected: { color: COLORS.surface },
  toneGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tonePill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: COLORS.background },
  tonePillSelected: { backgroundColor: COLORS.primary },
  tonePillText: { fontSize: 14, fontWeight: '500', color: COLORS.textSecondary },
  tonePillTextSelected: { color: COLORS.surface },
  
  // History
  emptyHistory: { alignItems: 'center', padding: 24 },
  emptyHistoryText: { fontSize: 16, fontWeight: '600', color: COLORS.textLight, marginTop: 12 },
  emptyHistoryHint: { fontSize: 13, color: COLORS.textLight, marginTop: 4, textAlign: 'center' },
  historyItem: { flexDirection: 'row', paddingVertical: 14, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  historyItemFirst: { borderTopWidth: 0 },
  historyIcon: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  historyContent: { flex: 1 },
  historyType: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  historyDate: { fontSize: 13, color: COLORS.textLight, marginTop: 2 },
  historyNotes: { fontSize: 14, color: COLORS.textSecondary, marginTop: 6, lineHeight: 20 },
  
  // Delete Button
  deleteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 16, marginTop: 24, padding: 16, borderRadius: 16, backgroundColor: COLORS.accent + '15', gap: 8 },
  deleteButtonText: { fontSize: 16, fontWeight: '600', color: COLORS.accent },
  
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalHandle: { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  
  // Interaction Modal
  interactionModalContent: { backgroundColor: COLORS.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingTop: 12, maxHeight: '90%' },
  interactionModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalCloseBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  interactionModalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
  modalLabel: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 12, marginTop: 8 },
  interactionTypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  interactionTypeCard: { width: (SCREEN_WIDTH - 70) / 3, alignItems: 'center', padding: 12, borderRadius: 16, backgroundColor: COLORS.background, borderWidth: 2, borderColor: 'transparent' },
  interactionTypeIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  interactionTypeText: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center' },
  selectedCheck: { position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  inlineDatePicker: { backgroundColor: COLORS.background, borderRadius: 12, marginTop: 8, overflow: 'hidden' },
  datePickerDone: { backgroundColor: COLORS.primary, padding: 12, alignItems: 'center' },
  datePickerDoneText: { color: COLORS.surface, fontWeight: '600', fontSize: 16 },
  notesInput: { backgroundColor: COLORS.background, borderRadius: 12, padding: 14, fontSize: 16, color: COLORS.text, minHeight: 100, textAlignVertical: 'top' },
  logButton: { marginTop: 16, borderRadius: 16, overflow: 'hidden' },
  logButtonGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 10 },
  logButtonText: { fontSize: 17, fontWeight: '700', color: COLORS.surface },
  
  // Date Modal
  dateModalContent: { backgroundColor: COLORS.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 30 },
  dateModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  dateModalTitle: { fontSize: 17, fontWeight: '600', color: COLORS.text },
  modalCancelText: { fontSize: 16, color: COLORS.textLight },
  modalDoneText: { fontSize: 16, fontWeight: '600', color: COLORS.primary },
  
  // Groups Modal
  groupsModalContent: { backgroundColor: COLORS.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingTop: 12, maxHeight: '70%' },
  groupsModalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text, textAlign: 'center', marginBottom: 20 },
  emptyGroups: { alignItems: 'center', padding: 40 },
  emptyGroupsText: { fontSize: 16, color: COLORS.textLight, marginTop: 12 },
  groupOption: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 8, backgroundColor: COLORS.background },
  groupOptionSelected: { backgroundColor: COLORS.success + '15' },
  groupOptionDot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  groupOptionText: { flex: 1, fontSize: 16, color: COLORS.text },
  groupsDoneButton: { backgroundColor: COLORS.primary, padding: 16, borderRadius: 16, alignItems: 'center', marginTop: 16 },
  groupsDoneText: { fontSize: 17, fontWeight: '600', color: COLORS.surface },
  
  // Draft Modal
  draftModalContent: { backgroundColor: COLORS.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingTop: 12 },
  draftModalHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  draftIconGradient: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  draftModalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
  draftModalSubtitle: { fontSize: 14, color: COLORS.textLight },
  draftBubble: { backgroundColor: COLORS.background, borderRadius: 20, padding: 20, marginBottom: 20 },
  draftText: { fontSize: 16, color: COLORS.text, lineHeight: 26 },
  draftActions: { flexDirection: 'row', gap: 12 },
  draftCopyBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary + '15', padding: 14, borderRadius: 12, gap: 8 },
  draftCopyText: { fontSize: 15, fontWeight: '600', color: COLORS.primary },
  draftRegenerateBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background, padding: 14, borderRadius: 12, gap: 8 },
  draftRegenerateText: { fontSize: 15, fontWeight: '600', color: COLORS.textSecondary },
  draftDoneBtn: { backgroundColor: COLORS.primary, padding: 16, borderRadius: 16, alignItems: 'center', marginTop: 16 },
  draftDoneText: { fontSize: 17, fontWeight: '600', color: COLORS.surface },
});
