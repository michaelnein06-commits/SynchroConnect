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
  Image,
  Modal,
  Pressable,
  FlatList,
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

const COLORS = {
  primary: '#6366F1',
  primaryLight: '#A5B4FC',
  accent: '#F43F5E',
  background: '#F1F5F9',
  surface: '#FFFFFF',
  text: '#0F172A',
  textLight: '#64748B',
  border: '#E2E8F0',
  success: '#10B981',
  warning: '#F59E0B',
};

const PIPELINE_STAGES = ['Weekly', 'Bi-Weekly', 'Monthly', 'Quarterly', 'Annually'];
const INTERACTION_TYPES = ['Personal Meeting', 'Phone Call', 'Email', 'WhatsApp', 'Other'];
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
}

export default function ContactDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { token } = useAuth();
  const isNew = id === 'new';

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
    notes: '',
    profile_picture: '',
    last_contact_date: '',
    next_due: '',
  });

  useEffect(() => {
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
      fetchContact(); // Refresh to get updated last_contact_date
      Alert.alert('Success', 'Interaction logged!');
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

  const getInteractionIcon = (type: string) => {
    switch (type) {
      case 'Personal Meeting': return 'people';
      case 'Phone Call': return 'call';
      case 'Email': return 'mail';
      case 'WhatsApp': return 'logo-whatsapp';
      default: return 'chatbubble';
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isNew ? 'New Contact' : (isEditing ? 'Edit Contact' : 'Contact')}</Text>
          {!isNew && !isEditing ? (
            <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.headerButton}>
              <Text style={styles.editButton}>Edit</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.headerButton}>
              {saving ? (
                <ActivityIndicator color={COLORS.primary} size="small" />
              ) : (
                <Text style={styles.saveButton}>Save</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {/* Profile Picture */}
          <View style={styles.profileSection}>
            <TouchableOpacity 
              style={styles.profilePictureButton} 
              onPress={isEditing ? pickImage : undefined}
              disabled={!isEditing}
            >
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.profilePicture} />
              ) : (
                <View style={styles.profilePicturePlaceholder}>
                  <Ionicons name="person" size={50} color={COLORS.textLight} />
                </View>
              )}
              {isEditing && (
                <View style={styles.editBadge}>
                  <Ionicons name="camera" size={16} color={COLORS.surface} />
                </View>
              )}
            </TouchableOpacity>
            {!isEditing && formData.name && (
              <Text style={styles.profileName}>{formData.name}</Text>
            )}
            {!isEditing && formData.job && (
              <Text style={styles.profileJob}>{formData.job}</Text>
            )}
          </View>

          {/* Log Interaction Button - Only show in view mode */}
          {!isNew && !isEditing && (
            <TouchableOpacity 
              style={styles.logInteractionButton}
              onPress={() => setShowInteractionModal(true)}
            >
              <Ionicons name="checkmark-circle" size={24} color={COLORS.surface} />
              <Text style={styles.logInteractionButtonText}>Log Interaction</Text>
            </TouchableOpacity>
          )}

          {/* Generate AI Draft Button - Only show in view mode */}
          {!isNew && !isEditing && (
            <TouchableOpacity 
              style={styles.generateDraftButton}
              onPress={generateAIDraft}
              disabled={generatingDraft}
            >
              {generatingDraft ? (
                <ActivityIndicator color={COLORS.primary} />
              ) : (
                <>
                  <Ionicons name="sparkles" size={24} color={COLORS.primary} />
                  <Text style={styles.generateDraftButtonText}>Generate AI Draft</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Basic Info Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Basic Information</Text>
            <View style={styles.card}>
              {/* Name */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Name *</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.input}
                    value={formData.name}
                    onChangeText={(text) => setFormData({ ...formData, name: text })}
                    placeholder="Full name"
                    placeholderTextColor={COLORS.textLight}
                  />
                ) : (
                  <Text style={styles.fieldValue}>{formData.name || '-'}</Text>
                )}
              </View>

              {/* Phone */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Phone</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.input}
                    value={formData.phone}
                    onChangeText={(text) => setFormData({ ...formData, phone: text })}
                    placeholder="+1 234 567 8900"
                    placeholderTextColor={COLORS.textLight}
                    keyboardType="phone-pad"
                  />
                ) : (
                  <Text style={styles.fieldValue}>{formData.phone || '-'}</Text>
                )}
              </View>

              {/* Email */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Email</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.input}
                    value={formData.email}
                    onChangeText={(text) => setFormData({ ...formData, email: text })}
                    placeholder="email@example.com"
                    placeholderTextColor={COLORS.textLight}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                ) : (
                  <Text style={styles.fieldValue}>{formData.email || '-'}</Text>
                )}
              </View>

              {/* Job */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Job Title</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.input}
                    value={formData.job}
                    onChangeText={(text) => setFormData({ ...formData, job: text })}
                    placeholder="Software Engineer"
                    placeholderTextColor={COLORS.textLight}
                  />
                ) : (
                  <Text style={styles.fieldValue}>{formData.job || '-'}</Text>
                )}
              </View>

              {/* Location */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Location</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.input}
                    value={formData.location}
                    onChangeText={(text) => setFormData({ ...formData, location: text })}
                    placeholder="San Francisco, CA"
                    placeholderTextColor={COLORS.textLight}
                  />
                ) : (
                  <Text style={styles.fieldValue}>{formData.location || '-'}</Text>
                )}
              </View>

              {/* Academic Degree */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Academic Degree</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.input}
                    value={formData.academic_degree}
                    onChangeText={(text) => setFormData({ ...formData, academic_degree: text })}
                    placeholder="Bachelor's in Computer Science"
                    placeholderTextColor={COLORS.textLight}
                  />
                ) : (
                  <Text style={styles.fieldValue}>{formData.academic_degree || '-'}</Text>
                )}
              </View>

              {/* Birthday */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Birthday</Text>
                {isEditing ? (
                  <TouchableOpacity
                    style={styles.datePickerButton}
                    onPress={() => setShowBirthdayPicker(true)}
                  >
                    <Ionicons name="calendar-outline" size={20} color={COLORS.textLight} />
                    <Text style={[styles.datePickerText, !formData.birthday && styles.placeholder]}>
                      {formData.birthday ? format(new Date(formData.birthday), 'MMM dd, yyyy') : 'Select birthday'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.fieldValue}>
                    {formData.birthday ? format(new Date(formData.birthday), 'MMM dd, yyyy') : '-'}
                  </Text>
                )}
              </View>
            </View>
          </View>

          {/* Birthday Picker Modal */}
          {showBirthdayPicker && (
            <Modal transparent animationType="slide">
              <View style={styles.dateModalOverlay}>
                <View style={styles.dateModalContent}>
                  <View style={styles.dateModalHeader}>
                    <TouchableOpacity onPress={() => setShowBirthdayPicker(false)}>
                      <Text style={styles.dateModalCancel}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={styles.dateModalTitle}>Select Birthday</Text>
                    <TouchableOpacity onPress={confirmBirthday}>
                      <Text style={styles.dateModalOk}>OK</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={selectedBirthday}
                    mode="date"
                    display="spinner"
                    onChange={handleBirthdayChange}
                    maximumDate={new Date()}
                  />
                </View>
              </View>
            </Modal>
          )}

          {/* Connection Frequency Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Connection Frequency</Text>
            <View style={styles.card}>
              <View style={styles.stageContainer}>
                {PIPELINE_STAGES.map((stage) => (
                  <TouchableOpacity
                    key={stage}
                    style={[
                      styles.stageChip,
                      formData.pipeline_stage === stage && styles.stageChipActive,
                      !isEditing && styles.stageChipDisabled,
                    ]}
                    onPress={() => isEditing && setFormData({ ...formData, pipeline_stage: stage })}
                    disabled={!isEditing}
                  >
                    <Text style={[
                      styles.stageChipText,
                      formData.pipeline_stage === stage && styles.stageChipTextActive,
                    ]}>
                      {stage}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {!isEditing && formData.next_due && (
                <View style={styles.nextDueInfo}>
                  <Ionicons name="time-outline" size={16} color={COLORS.textLight} />
                  <Text style={styles.nextDueText}>
                    Next contact due: {format(new Date(formData.next_due), 'MMM dd, yyyy')}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Groups Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Groups</Text>
            <View style={styles.card}>
              {isEditing ? (
                <TouchableOpacity style={styles.groupSelector} onPress={() => setShowGroupsModal(true)}>
                  <Ionicons name="albums-outline" size={20} color={COLORS.primary} />
                  <Text style={styles.groupSelectorText}>
                    {formData.groups.length > 0 
                      ? `${formData.groups.length} group(s) selected`
                      : 'Select groups'}
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
                </TouchableOpacity>
              ) : (
                <View style={styles.groupsDisplay}>
                  {formData.groups.length > 0 ? (
                    formData.groups.map((groupId) => {
                      const group = availableGroups.find(g => g.id === groupId);
                      return group ? (
                        <View key={groupId} style={styles.groupTag}>
                          <Text style={styles.groupTagText}>{group.name}</Text>
                        </View>
                      ) : null;
                    })
                  ) : (
                    <Text style={styles.fieldValue}>No groups assigned</Text>
                  )}
                </View>
              )}
            </View>
          </View>

          {/* Personal Details Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Personal Details</Text>
            <View style={styles.card}>
              {/* Hobbies */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Hobbies</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.input}
                    value={formData.hobbies}
                    onChangeText={(text) => setFormData({ ...formData, hobbies: text })}
                    placeholder="Tennis, Photography, Cooking"
                    placeholderTextColor={COLORS.textLight}
                  />
                ) : (
                  <Text style={styles.fieldValue}>{formData.hobbies || '-'}</Text>
                )}
              </View>

              {/* Favorite Food */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Favorite Food</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.input}
                    value={formData.favorite_food}
                    onChangeText={(text) => setFormData({ ...formData, favorite_food: text })}
                    placeholder="Italian cuisine, Sushi"
                    placeholderTextColor={COLORS.textLight}
                  />
                ) : (
                  <Text style={styles.fieldValue}>{formData.favorite_food || '-'}</Text>
                )}
              </View>

              {/* How We Met */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>How We Met</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.input}
                    value={formData.how_we_met}
                    onChangeText={(text) => setFormData({ ...formData, how_we_met: text })}
                    placeholder="University, conference, mutual friend..."
                    placeholderTextColor={COLORS.textLight}
                  />
                ) : (
                  <Text style={styles.fieldValue}>{formData.how_we_met || '-'}</Text>
                )}
              </View>
            </View>
          </View>

          {/* Communication Preferences Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Communication</Text>
            <View style={styles.card}>
              {/* Language */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Language</Text>
                {isEditing ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.optionsRow}>
                      {LANGUAGES.map((lang) => (
                        <TouchableOpacity
                          key={lang}
                          style={[styles.optionChip, formData.language === lang && styles.optionChipActive]}
                          onPress={() => setFormData({ ...formData, language: lang })}
                        >
                          <Text style={[styles.optionChipText, formData.language === lang && styles.optionChipTextActive]}>
                            {lang}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                ) : (
                  <Text style={styles.fieldValue}>{formData.language}</Text>
                )}
              </View>

              {/* Tone */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Tone</Text>
                {isEditing ? (
                  <View style={styles.optionsRow}>
                    {TONES.map((tone) => (
                      <TouchableOpacity
                        key={tone}
                        style={[styles.optionChip, formData.tone === tone && styles.optionChipActive]}
                        onPress={() => setFormData({ ...formData, tone: tone })}
                      >
                        <Text style={[styles.optionChipText, formData.tone === tone && styles.optionChipTextActive]}>
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
                  Provide a sample message so AI learns the specific tone for this contact
                </Text>
                {isEditing ? (
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={formData.example_message}
                    onChangeText={(text) => setFormData({ ...formData, example_message: text })}
                    placeholder="e.g., Hey Digga, wie sieht's aus?"
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
            <Text style={styles.sectionTitle}>Notes</Text>
            <View style={styles.card}>
              {isEditing ? (
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={formData.notes}
                  onChangeText={(text) => setFormData({ ...formData, notes: text })}
                  placeholder="Add notes about this person..."
                  placeholderTextColor={COLORS.textLight}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              ) : (
                <Text style={styles.fieldValue}>{formData.notes || 'No notes yet'}</Text>
              )}
            </View>
          </View>

          {/* Interaction History Section */}
          {!isNew && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Interaction History</Text>
              <View style={styles.card}>
                {interactions.length === 0 ? (
                  <Text style={styles.emptyHistory}>No interactions logged yet</Text>
                ) : (
                  interactions.slice(0, 5).map((interaction) => (
                    <View key={interaction.id} style={styles.interactionItem}>
                      <View style={styles.interactionIcon}>
                        <Ionicons name={getInteractionIcon(interaction.interaction_type) as any} size={18} color={COLORS.primary} />
                      </View>
                      <View style={styles.interactionContent}>
                        <Text style={styles.interactionType}>{interaction.interaction_type}</Text>
                        <Text style={styles.interactionDate}>
                          {format(new Date(interaction.date), 'MMM dd, yyyy')}
                        </Text>
                        {interaction.notes && (
                          <Text style={styles.interactionNotes}>{interaction.notes}</Text>
                        )}
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

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Log Interaction Modal */}
        <Modal visible={showInteractionModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Log Interaction</Text>

              <Text style={styles.modalLabel}>Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
                {INTERACTION_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.typeChip, newInteraction.type === type && styles.typeChipActive]}
                    onPress={() => setNewInteraction({ ...newInteraction, type })}
                  >
                    <Ionicons name={getInteractionIcon(type) as any} size={16} color={newInteraction.type === type ? COLORS.surface : COLORS.text} />
                    <Text style={[styles.typeChipText, newInteraction.type === type && styles.typeChipTextActive]}>
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.modalLabel}>Date</Text>
              <TouchableOpacity
                style={styles.datePickerButton}
                onPress={() => setShowInteractionDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={20} color={COLORS.textLight} />
                <Text style={styles.datePickerText}>
                  {format(newInteraction.date, 'MMM dd, yyyy')}
                </Text>
              </TouchableOpacity>

              {showInteractionDatePicker && (
                <DateTimePicker
                  value={newInteraction.date}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, date) => {
                    setShowInteractionDatePicker(Platform.OS === 'ios');
                    if (date) setNewInteraction({ ...newInteraction, date });
                  }}
                  maximumDate={new Date()}
                />
              )}

              <Text style={styles.modalLabel}>Notes (optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={newInteraction.notes}
                onChangeText={(text) => setNewInteraction({ ...newInteraction, notes: text })}
                placeholder="Had dinner, talked about family..."
                placeholderTextColor={COLORS.textLight}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => setShowInteractionModal(false)}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalSaveButton}
                  onPress={logInteraction}
                  disabled={loggingInteraction}
                >
                  {loggingInteraction ? (
                    <ActivityIndicator color={COLORS.surface} />
                  ) : (
                    <Text style={styles.modalSaveText}>Log Interaction</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Groups Selection Modal */}
        <Modal visible={showGroupsModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Select Groups</Text>
              
              {availableGroups.length === 0 ? (
                <Text style={styles.emptyHistory}>No groups created yet</Text>
              ) : (
                <FlatList
                  data={availableGroups}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.groupItem, formData.groups.includes(item.id) && styles.groupItemSelected]}
                      onPress={() => toggleGroup(item.id)}
                    >
                      <Text style={styles.groupItemText}>{item.name}</Text>
                      {formData.groups.includes(item.id) && (
                        <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
                      )}
                    </TouchableOpacity>
                  )}
                  style={{ maxHeight: 300 }}
                />
              )}

              <TouchableOpacity
                style={styles.modalDoneButton}
                onPress={() => setShowGroupsModal(false)}
              >
                <Text style={styles.modalDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* AI Draft Modal */}
        <Modal visible={showDraftModal} transparent animationType="slide">
          <Pressable style={styles.modalOverlay} onPress={() => setShowDraftModal(false)}>
            <View style={styles.modalContent}>
              <View style={styles.modalHandle} />
              <View style={styles.draftModalHeader}>
                <Ionicons name="sparkles" size={24} color={COLORS.primary} />
                <Text style={styles.modalTitle}>AI Generated Draft</Text>
              </View>
              <Text style={styles.draftSubtitle}>Personalized message for {formData.name}</Text>
              
              <View style={styles.draftContainer}>
                <Text style={styles.draftText}>{generatedDraft}</Text>
              </View>

              <View style={styles.draftActions}>
                <TouchableOpacity style={styles.copyButton} onPress={copyDraftToClipboard}>
                  <Ionicons name="copy-outline" size={20} color={COLORS.primary} />
                  <Text style={styles.copyButtonText}>Copy</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.regenerateButton}
                  onPress={() => { setShowDraftModal(false); generateAIDraft(); }}
                >
                  <Ionicons name="refresh" size={20} color={COLORS.textLight} />
                  <Text style={styles.regenerateButtonText}>Regenerate</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.modalDoneButton} onPress={() => setShowDraftModal(false)}>
                <Text style={styles.modalDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerButton: { width: 60, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: COLORS.text },
  editButton: { fontSize: 16, fontWeight: '600', color: COLORS.primary },
  saveButton: { fontSize: 16, fontWeight: '600', color: COLORS.primary },
  content: { flex: 1 },
  contentContainer: { padding: 16 },
  
  // Profile Section
  profileSection: { alignItems: 'center', marginBottom: 20 },
  profilePictureButton: { position: 'relative', marginBottom: 12 },
  profilePicture: { width: 100, height: 100, borderRadius: 50 },
  profilePicturePlaceholder: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: COLORS.border,
    justifyContent: 'center', alignItems: 'center',
  },
  editBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: COLORS.background,
  },
  profileName: { fontSize: 24, fontWeight: 'bold', color: COLORS.text },
  profileJob: { fontSize: 16, color: COLORS.textLight, marginTop: 4 },

  // Action Buttons
  logInteractionButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.success, borderRadius: 12, padding: 16, gap: 10,
    marginBottom: 12,
  },
  logInteractionButtonText: { fontSize: 16, fontWeight: '600', color: COLORS.surface },
  generateDraftButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.primary + '15', borderRadius: 12, padding: 16, gap: 10,
    marginBottom: 20, borderWidth: 1, borderColor: COLORS.primary,
  },
  generateDraftButtonText: { fontSize: 16, fontWeight: '600', color: COLORS.primary },

  // Section
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: COLORS.textLight, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },

  // Field
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 6 },
  fieldValue: { fontSize: 16, color: COLORS.text },
  fieldHint: { fontSize: 12, color: COLORS.textLight, marginBottom: 8 },
  input: {
    backgroundColor: COLORS.background, borderRadius: 10, padding: 12,
    fontSize: 16, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  placeholder: { color: COLORS.textLight },

  // Date Picker
  datePickerButton: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.background, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  datePickerText: { fontSize: 16, color: COLORS.text },
  dateModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  dateModalContent: { backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 30 },
  dateModalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  dateModalTitle: { fontSize: 17, fontWeight: '600', color: COLORS.text },
  dateModalCancel: { fontSize: 16, color: COLORS.textLight },
  dateModalOk: { fontSize: 16, fontWeight: '600', color: COLORS.primary },

  // Pipeline Stages
  stageContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stageChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
  },
  stageChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  stageChipDisabled: { opacity: 0.8 },
  stageChipText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  stageChipTextActive: { color: COLORS.surface },
  nextDueInfo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  nextDueText: { fontSize: 13, color: COLORS.textLight },

  // Groups
  groupSelector: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 4,
  },
  groupSelectorText: { flex: 1, fontSize: 16, color: COLORS.text },
  groupsDisplay: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  groupTag: {
    backgroundColor: COLORS.primary + '15', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6,
  },
  groupTagText: { fontSize: 14, fontWeight: '500', color: COLORS.primary },
  groupItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  groupItemSelected: { backgroundColor: COLORS.primary + '10' },
  groupItemText: { fontSize: 16, color: COLORS.text },

  // Options (Language, Tone)
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
  },
  optionChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  optionChipText: { fontSize: 14, fontWeight: '500', color: COLORS.text },
  optionChipTextActive: { color: COLORS.surface },

  // Interaction History
  emptyHistory: { fontSize: 14, color: COLORS.textLight, textAlign: 'center', padding: 20 },
  interactionItem: { flexDirection: 'row', padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  interactionIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.primary + '15', justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  interactionContent: { flex: 1 },
  interactionType: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  interactionDate: { fontSize: 13, color: COLORS.textLight, marginTop: 2 },
  interactionNotes: { fontSize: 14, color: COLORS.text, marginTop: 4 },

  // Delete Button
  deleteButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: 16, borderRadius: 12, backgroundColor: COLORS.accent + '15', gap: 8, marginTop: 10,
  },
  deleteButtonText: { fontSize: 16, fontWeight: '600', color: COLORS.accent },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40, maxHeight: '85%',
  },
  modalHandle: { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text, marginBottom: 16 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 8, marginTop: 12 },
  typeScroll: { marginBottom: 8 },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20,
    backgroundColor: COLORS.background, marginRight: 8,
  },
  typeChipActive: { backgroundColor: COLORS.primary },
  typeChipText: { fontSize: 14, fontWeight: '500', color: COLORS.text },
  typeChipTextActive: { color: COLORS.surface },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalCancelButton: {
    flex: 1, padding: 14, borderRadius: 12, alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  modalCancelText: { fontSize: 16, fontWeight: '600', color: COLORS.textLight },
  modalSaveButton: {
    flex: 1, padding: 14, borderRadius: 12, alignItems: 'center',
    backgroundColor: COLORS.success,
  },
  modalSaveText: { fontSize: 16, fontWeight: '600', color: COLORS.surface },
  modalDoneButton: {
    padding: 16, borderRadius: 12, alignItems: 'center',
    backgroundColor: COLORS.primary, marginTop: 16,
  },
  modalDoneText: { fontSize: 16, fontWeight: '600', color: COLORS.surface },

  // Draft Modal
  draftModalHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  draftSubtitle: { fontSize: 14, color: COLORS.textLight, marginBottom: 16 },
  draftContainer: { backgroundColor: COLORS.background, borderRadius: 12, padding: 16, marginBottom: 16 },
  draftText: { fontSize: 16, color: COLORS.text, lineHeight: 24 },
  draftActions: { flexDirection: 'row', gap: 12 },
  copyButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: 14, borderRadius: 12, backgroundColor: COLORS.primary + '15', gap: 8,
  },
  copyButtonText: { fontSize: 14, fontWeight: '600', color: COLORS.primary },
  regenerateButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: 14, borderRadius: 12, backgroundColor: COLORS.background, gap: 8,
  },
  regenerateButtonText: { fontSize: 14, fontWeight: '600', color: COLORS.textLight },
});
