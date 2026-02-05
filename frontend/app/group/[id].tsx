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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../context/AuthContext';

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

export default function GroupDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { token } = useAuth();
  const isNew = id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [profileImage, setProfileImage] = useState('');
  const [groupContacts, setGroupContacts] = useState<any[]>([]);
  const [allContacts, setAllContacts] = useState<any[]>([]);
  const [showAddContactsModal, setShowAddContactsModal] = useState(false);
  const [selectedContactsToAdd, setSelectedContactsToAdd] = useState<string[]>([]);
  const [addingContacts, setAddingContacts] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    profile_picture: '',
  });

  useEffect(() => {
    if (!isNew) {
      fetchGroup();
      fetchGroupContacts();
    }
  }, [id]);

  const fetchGroup = async () => {
    try {
      const response = await axios.get(`${EXPO_PUBLIC_BACKEND_URL}/api/groups/${id}`);
      const group = response.data;
      setFormData({
        name: group.name || '',
        description: group.description || '',
        profile_picture: group.profile_picture || '',
      });
      if (group.profile_picture) {
        setProfileImage(group.profile_picture);
      }
    } catch (error) {
      console.error('Error fetching group:', error);
      Alert.alert('Error', 'Failed to load group');
    } finally {
      setLoading(false);
    }
  };

  const fetchGroupContacts = async () => {
    try {
      const response = await axios.get(`${EXPO_PUBLIC_BACKEND_URL}/api/contacts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const allContactsData = response.data;
      setAllContacts(allContactsData);
      
      // Filter contacts that belong to this group
      const groupResponse = await axios.get(`${EXPO_PUBLIC_BACKEND_URL}/api/groups/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const groupName = groupResponse.data.name;
      const contacts = allContactsData.filter((c: any) => c.groups?.includes(groupName));
      setGroupContacts(contacts);
    } catch (error) {
      console.error('Error fetching group contacts:', error);
    }
  };

  const handleAddContacts = async () => {
    if (selectedContactsToAdd.length === 0) {
      Alert.alert('No contacts selected', 'Please select at least one contact to add');
      return;
    }

    setAddingContacts(true);
    try {
      // Add group name to each selected contact
      for (const contactId of selectedContactsToAdd) {
        const contact = allContacts.find((c: any) => c.id === contactId);
        if (contact) {
          const updatedGroups = [...(contact.groups || []), formData.name];
          await axios.put(`${EXPO_PUBLIC_BACKEND_URL}/api/contacts/${contactId}`, {
            ...contact,
            groups: updatedGroups,
          }, {
            headers: { Authorization: `Bearer ${token}` }
          });
        }
      }
      
      Alert.alert('Success', `${selectedContactsToAdd.length} contact(s) added to group`);
      setShowAddContactsModal(false);
      setSelectedContactsToAdd([]);
      fetchGroupContacts();
    } catch (error) {
      console.error('Error adding contacts:', error);
      Alert.alert('Error', 'Failed to add contacts');
    } finally {
      setAddingContacts(false);
    }
  };

  const toggleContactSelection = (contactId: string) => {
    setSelectedContactsToAdd(prev => 
      prev.includes(contactId)
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  const getContactsNotInGroup = () => {
    return allContacts.filter((c: any) => !c.groups?.includes(formData.name));
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
      Alert.alert('Error', 'Group name is required');
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        await axios.post(`${EXPO_PUBLIC_BACKEND_URL}/api/groups`, formData);
        Alert.alert('Success', 'Group created!');
      } else {
        await axios.put(`${EXPO_PUBLIC_BACKEND_URL}/api/groups/${id}`, formData);
        Alert.alert('Success', 'Group updated!');
      }
      router.back();
    } catch (error) {
      console.error('Error saving group:', error);
      Alert.alert('Error', 'Failed to save group');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Group',
      `Are you sure you want to delete ${formData.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${EXPO_PUBLIC_BACKEND_URL}/api/groups/${id}`);
              Alert.alert('Success', 'Group deleted');
              router.back();
            } catch (error) {
              console.error('Error deleting group:', error);
              Alert.alert('Error', 'Failed to delete group');
            }
          },
        },
      ]
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
          <Text style={styles.headerTitle}>{isNew ? 'New Group' : 'Edit Group'}</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving ? (
              <ActivityIndicator color={COLORS.primary} />
            ) : (
              <Text style={styles.saveButton}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {/* Profile Picture */}
          <View style={styles.profilePictureSection}>
            <TouchableOpacity style={styles.profilePictureButton} onPress={pickImage}>
              {profileImage || formData.profile_picture ? (
                <Image source={{ uri: profileImage || formData.profile_picture }} style={styles.profilePicture} />
              ) : (
                <View style={styles.profilePicturePlaceholder}>
                  <Ionicons name="people" size={40} color={COLORS.textLight} />
                </View>
              )}
              <View style={styles.editBadge}>
                <Ionicons name="camera" size={16} color={COLORS.surface} />
              </View>
            </TouchableOpacity>
            <Text style={styles.profilePictureLabel}>Tap to change group photo</Text>
          </View>

          {/* Group Name */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Group Name *</Text>
            <TextInput
              style={styles.input}
              value={formData.name}
              onChangeText={(text) => setFormData({ ...formData, name: text })}
              placeholder="e.g., University, Work, Tennis Club"
              placeholderTextColor={COLORS.textLight}
            />
          </View>

          {/* Description */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.description}
              onChangeText={(text) => setFormData({ ...formData, description: text })}
              placeholder="Add a description for this group..."
              placeholderTextColor={COLORS.textLight}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Delete Button */}
          {!isNew && (
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={20} color={COLORS.accent} />
              <Text style={styles.deleteButtonText}>Delete Group</Text>
            </TouchableOpacity>
          )}

          {/* Group Members */}
          {!isNew && (
            <View style={styles.membersSection}>
              <View style={styles.membersSectionHeader}>
                <Text style={styles.sectionTitle}>Group Members ({groupContacts.length})</Text>
                <TouchableOpacity 
                  style={styles.addContactsButton}
                  onPress={() => {
                    setSelectedContactsToAdd([]);
                    setShowAddContactsModal(true);
                  }}
                >
                  <Ionicons name="person-add" size={18} color={COLORS.primary} />
                  <Text style={styles.addContactsButtonText}>Add</Text>
                </TouchableOpacity>
              </View>
              {groupContacts.length === 0 ? (
                <View style={styles.emptyMembers}>
                  <Ionicons name="people-outline" size={40} color={COLORS.textLight} />
                  <Text style={styles.emptyMembersText}>No contacts in this group yet</Text>
                  <TouchableOpacity 
                    style={styles.emptyAddButton}
                    onPress={() => {
                      setSelectedContactsToAdd([]);
                      setShowAddContactsModal(true);
                    }}
                  >
                    <Ionicons name="add" size={20} color="#fff" />
                    <Text style={styles.emptyAddButtonText}>Add Contacts</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                groupContacts.map((contact) => (
                  <TouchableOpacity
                    key={contact.id}
                    style={styles.memberCard}
                    onPress={() => router.push(`/contact/${contact.id}`)}
                  >
                    {contact.profile_picture ? (
                      <Image source={{ uri: contact.profile_picture }} style={styles.memberAvatar} />
                    ) : (
                      <View style={styles.memberAvatarPlaceholder}>
                        <Ionicons name="person" size={20} color={COLORS.primary} />
                      </View>
                    )}
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>{contact.name}</Text>
                      {contact.job && <Text style={styles.memberJob}>{contact.job}</Text>}
                    </View>
                    <View style={styles.memberBadge}>
                      <Text style={styles.memberBadgeText}>{contact.pipeline_stage}</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Add Contacts Modal */}
      <Modal
        visible={showAddContactsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddContactsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Contacts</Text>
              <TouchableOpacity onPress={() => setShowAddContactsModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalContent}>
              {getContactsNotInGroup().length === 0 ? (
                <View style={styles.emptyMembers}>
                  <Ionicons name="checkmark-circle" size={40} color={COLORS.primary} />
                  <Text style={styles.emptyMembersText}>All contacts are already in this group</Text>
                </View>
              ) : (
                getContactsNotInGroup().map((contact: any) => {
                  const isSelected = selectedContactsToAdd.includes(contact.id);
                  return (
                    <TouchableOpacity
                      key={contact.id}
                      style={[styles.memberCard, isSelected && styles.memberCardSelected]}
                      onPress={() => toggleContactSelection(contact.id)}
                    >
                      {contact.profile_picture ? (
                        <Image source={{ uri: contact.profile_picture }} style={styles.memberAvatar} />
                      ) : (
                        <View style={styles.memberAvatarPlaceholder}>
                          <Ionicons name="person" size={20} color={COLORS.primary} />
                        </View>
                      )}
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName}>{contact.name}</Text>
                        {contact.job && <Text style={styles.memberJob}>{contact.job}</Text>}
                      </View>
                      <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                        {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
            
            {getContactsNotInGroup().length > 0 && (
              <View style={styles.modalFooter}>
                <TouchableOpacity 
                  style={[styles.modalButton, selectedContactsToAdd.length === 0 && styles.modalButtonDisabled]}
                  onPress={handleAddContacts}
                  disabled={addingContacts || selectedContactsToAdd.length === 0}
                >
                  {addingContacts ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalButtonText}>
                      Add {selectedContactsToAdd.length > 0 ? `${selectedContactsToAdd.length} Contact(s)` : 'Contacts'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
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
  profilePictureSection: {
    alignItems: 'center',
    marginBottom: 30,
  },
  profilePictureButton: {
    position: 'relative',
    marginBottom: 8,
  },
  profilePicture: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  profilePicturePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  profilePictureLabel: {
    fontSize: 14,
    color: COLORS.textLight,
    textAlign: 'center',
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.accent + '20',
    gap: 8,
    marginTop: 20,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.accent,
  },
  membersSection: {
    marginTop: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 16,
  },
  emptyMembers: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyMembersText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textLight,
    marginTop: 12,
  },
  emptyMembersHint: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 4,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  memberAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberInfo: {
    flex: 1,
    marginLeft: 12,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  memberJob: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 2,
  },
  memberBadge: {
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  memberBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
});
