import * as Contacts from 'expo-contacts';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert } from 'react-native';
import { importPhoneContacts, ImportedContact, requestContactsPermission } from './contactImportService';
import Constants from 'expo-constants';

// Get backend URL from expo config
const getBackendUrl = () => {
  return Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
         process.env.EXPO_PUBLIC_BACKEND_URL || 
         '';
};

const LAST_SYNC_KEY = 'last_contact_sync';

interface AppContact {
  id?: string;
  _id?: string;
  name: string;
  phone?: string;
  email?: string;
  birthday?: string;
  job?: string;
  location?: string;
  notes?: string;
  device_contact_id?: string;
  pipeline_stage?: string;
}

interface SyncResult {
  imported: number;
  updated: number;
  syncedBack: number;
  errors: string[];
}

/**
 * Contact Sync Service
 * Handles TRUE bidirectional sync between app and device contacts
 */
export class ContactSyncService {
  private token: string;
  private onProgress?: (message: string) => void;

  constructor(token: string, onProgress?: (message: string) => void) {
    this.token = token;
    this.onProgress = onProgress;
  }

  private log(message: string) {
    console.log(`[ContactSync] ${message}`);
    this.onProgress?.(message);
  }

  private getAuthHeaders() {
    return { headers: { Authorization: `Bearer ${this.token}` } };
  }

  /**
   * Normalize phone number for comparison - multiple formats
   */
  private normalizePhone(phone?: string): string {
    if (!phone) return '';
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    // Return last 10 digits (handles +1 prefix)
    return digits.slice(-10);
  }

  /**
   * Normalize name for comparison
   */
  private normalizeName(name?: string): string {
    if (!name) return '';
    return name.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Check if two phone numbers match (flexible matching)
   */
  private phonesMatch(phone1?: string, phone2?: string): boolean {
    if (!phone1 || !phone2) return false;
    const norm1 = this.normalizePhone(phone1);
    const norm2 = this.normalizePhone(phone2);
    if (!norm1 || !norm2) return false;
    // Check if either ends with the other (handles different prefixes)
    return norm1 === norm2 || norm1.endsWith(norm2) || norm2.endsWith(norm1);
  }

  /**
   * Check if two names match (flexible matching)
   */
  private namesMatch(name1?: string, name2?: string): boolean {
    if (!name1 || !name2) return false;
    const norm1 = this.normalizeName(name1);
    const norm2 = this.normalizeName(name2);
    if (!norm1 || !norm2) return false;
    return norm1 === norm2;
  }

  /**
   * Get all contacts from app backend
   */
  async getAppContacts(): Promise<AppContact[]> {
    try {
      const backendUrl = getBackendUrl();
      const response = await axios.get(
        `${backendUrl}/api/contacts`,
        this.getAuthHeaders()
      );
      return response.data || [];
    } catch (error) {
      console.error('Error fetching app contacts:', error);
      return [];
    }
  }

  /**
   * Update app contact in backend
   */
  async updateAppContact(contactId: string, data: Partial<AppContact>): Promise<boolean> {
    try {
      const backendUrl = getBackendUrl();
      await axios.put(
        `${backendUrl}/api/contacts/${contactId}`,
        data,
        this.getAuthHeaders()
      );
      return true;
    } catch (error) {
      console.error('Error updating app contact:', error);
      return false;
    }
  }

  /**
   * Create new contact in app backend
   */
  async createAppContact(data: Partial<AppContact>): Promise<AppContact | null> {
    try {
      const backendUrl = getBackendUrl();
      const response = await axios.post(
        `${backendUrl}/api/contacts`,
        {
          ...data,
          pipeline_stage: data.pipeline_stage || 'New',
          language: 'English',
          tone: 'Casual',
        },
        this.getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      console.error('Error creating app contact:', error);
      return null;
    }
  }

  /**
   * Get ALL device contacts with full details
   */
  async getDeviceContacts(): Promise<Contacts.Contact[]> {
    try {
      if (Platform.OS === 'web') return [];

      const hasPermission = await requestContactsPermission();
      if (!hasPermission) return [];

      const result = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.ID,
          Contacts.Fields.Name,
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
          Contacts.Fields.Birthday,
          Contacts.Fields.JobTitle,
          Contacts.Fields.Company,
          Contacts.Fields.Note,
        ],
        pageSize: 10000,
      });

      return result.data || [];
    } catch (error) {
      console.error('Error getting device contacts:', error);
      return [];
    }
  }

  /**
   * Find a device contact by ID, phone, email, or name
   */
  async findDeviceContact(appContact: AppContact, deviceContacts: Contacts.Contact[]): Promise<Contacts.Contact | null> {
    this.log(`Finding device contact for: ${appContact.name} (phone: ${appContact.phone}, email: ${appContact.email})`);
    
    // First try by stored device_contact_id
    if (appContact.device_contact_id) {
      const byId = deviceContacts.find(dc => dc.id === appContact.device_contact_id);
      if (byId) {
        this.log(`Found by ID: ${byId.name}`);
        return byId;
      }
      this.log(`ID ${appContact.device_contact_id} not found, trying other methods...`);
    }

    // Then try by phone number
    if (appContact.phone) {
      const normalizedPhone = this.normalizePhone(appContact.phone);
      if (normalizedPhone) {
        const byPhone = deviceContacts.find(dc => {
          return dc.phoneNumbers?.some(p => this.normalizePhone(p.number) === normalizedPhone);
        });
        if (byPhone) {
          this.log(`Found by phone: ${byPhone.name}`);
          return byPhone;
        }
      }
    }

    // Then try by email
    if (appContact.email) {
      const lowerEmail = appContact.email.toLowerCase();
      const byEmail = deviceContacts.find(dc => {
        return dc.emails?.some(e => e.email?.toLowerCase() === lowerEmail);
      });
      if (byEmail) {
        this.log(`Found by email: ${byEmail.name}`);
        return byEmail;
      }
    }

    // Finally try by name
    if (appContact.name) {
      const lowerName = appContact.name.toLowerCase();
      const byName = deviceContacts.find(dc => {
        const dcName = dc.name || `${dc.firstName || ''} ${dc.lastName || ''}`.trim();
        return dcName.toLowerCase() === lowerName;
      });
      if (byName) {
        this.log(`Found by name: ${byName.name}`);
        return byName;
      }
    }

    this.log(`No match found for: ${appContact.name}`);
    return null;
  }

  /**
   * Find an app contact that matches a device contact
   */
  findAppContact(deviceContact: Contacts.Contact, appContacts: AppContact[]): AppContact | null {
    const deviceName = deviceContact.name || `${deviceContact.firstName || ''} ${deviceContact.lastName || ''}`.trim();
    const devicePhone = this.normalizePhone(deviceContact.phoneNumbers?.[0]?.number);
    const deviceEmail = deviceContact.emails?.[0]?.email?.toLowerCase();

    // Try by device_contact_id first
    if (deviceContact.id) {
      const byId = appContacts.find(ac => ac.device_contact_id === deviceContact.id);
      if (byId) return byId;
    }

    // Try by phone
    if (devicePhone) {
      const byPhone = appContacts.find(ac => this.normalizePhone(ac.phone) === devicePhone);
      if (byPhone) return byPhone;
    }

    // Try by email
    if (deviceEmail) {
      const byEmail = appContacts.find(ac => ac.email?.toLowerCase() === deviceEmail);
      if (byEmail) return byEmail;
    }

    // Try by name
    if (deviceName) {
      const byName = appContacts.find(ac => ac.name.toLowerCase() === deviceName.toLowerCase());
      if (byName) return byName;
    }

    return null;
  }

  /**
   * UPDATE a device contact with app data (App → iPhone)
   */
  async updateDeviceContactFromApp(deviceContactId: string, appContact: AppContact): Promise<boolean> {
    try {
      if (Platform.OS === 'web') return false;

      // Build the contact update object
      const nameParts = appContact.name.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      const contactUpdate: Partial<Contacts.Contact> = {
        id: deviceContactId,
        firstName,
        lastName,
        name: appContact.name,
      };

      // Update phone
      if (appContact.phone) {
        contactUpdate.phoneNumbers = [{
          label: 'mobile',
          number: appContact.phone,
        }];
      }

      // Update email
      if (appContact.email) {
        contactUpdate.emails = [{
          label: 'home',
          email: appContact.email,
        }];
      }

      // Update birthday
      if (appContact.birthday) {
        try {
          const date = new Date(appContact.birthday);
          if (!isNaN(date.getTime())) {
            contactUpdate.birthday = {
              year: date.getFullYear(),
              month: date.getMonth(),
              day: date.getDate(),
            };
          }
        } catch (e) {
          // Skip invalid birthday
        }
      }

      // Update job title
      if (appContact.job) {
        contactUpdate.jobTitle = appContact.job;
      }

      // Update notes
      if (appContact.notes) {
        contactUpdate.note = appContact.notes;
      }

      await Contacts.updateContactAsync(contactUpdate as Contacts.Contact);
      this.log(`✓ Updated iPhone contact: ${appContact.name}`);
      return true;
    } catch (error) {
      console.error('Error updating device contact:', error);
      this.log(`✗ Failed to update iPhone: ${appContact.name}`);
      return false;
    }
  }

  /**
   * CREATE a new contact on iPhone from app data
   */
  async createDeviceContactFromApp(appContact: AppContact): Promise<string | null> {
    try {
      if (Platform.OS === 'web') return null;

      const nameParts = appContact.name.split(' ');
      const firstName = nameParts[0] || 'Unknown';
      const lastName = nameParts.slice(1).join(' ') || '';

      const newContact: Contacts.Contact = {
        contactType: Contacts.ContactTypes.Person,
        firstName,
        lastName,
        name: appContact.name,
      };

      if (appContact.phone) {
        newContact.phoneNumbers = [{
          label: 'mobile',
          number: appContact.phone,
        }];
      }

      if (appContact.email) {
        newContact.emails = [{
          label: 'home',
          email: appContact.email,
        }];
      }

      if (appContact.birthday) {
        try {
          const date = new Date(appContact.birthday);
          if (!isNaN(date.getTime())) {
            newContact.birthday = {
              year: date.getFullYear(),
              month: date.getMonth(),
              day: date.getDate(),
            };
          }
        } catch (e) {}
      }

      if (appContact.job) {
        newContact.jobTitle = appContact.job;
      }

      if (appContact.notes) {
        newContact.note = appContact.notes;
      }

      const contactId = await Contacts.addContactAsync(newContact);
      this.log(`✓ Created iPhone contact: ${appContact.name}`);
      return contactId;
    } catch (error) {
      console.error('Error creating device contact:', error);
      this.log(`✗ Failed to create iPhone contact: ${appContact.name}`);
      return null;
    }
  }

  /**
   * SYNC App → iPhone (Push app changes to iPhone)
   * Updates existing iPhone contacts and creates new ones
   */
  async syncAppToDevice(): Promise<{ synced: number; created: number; errors: string[] }> {
    const result = { synced: 0, created: 0, errors: [] as string[] };

    try {
      if (Platform.OS === 'web') {
        result.errors.push('Sync not available on web');
        return result;
      }

      const hasPermission = await requestContactsPermission();
      if (!hasPermission) {
        result.errors.push('Contact permission denied');
        return result;
      }

      this.log('Starting App → iPhone sync...');

      // Get all contacts from both sources
      const appContacts = await this.getAppContacts();
      const deviceContacts = await this.getDeviceContacts();

      this.log(`Found ${appContacts.length} app contacts, ${deviceContacts.length} device contacts`);

      for (const appContact of appContacts) {
        const appContactId = appContact._id || appContact.id;
        if (!appContactId) continue;

        // Find matching device contact
        const deviceContact = await this.findDeviceContact(appContact, deviceContacts);

        if (deviceContact && deviceContact.id) {
          // Update existing device contact
          const success = await this.updateDeviceContactFromApp(deviceContact.id, appContact);
          if (success) {
            result.synced++;
            // Update the link in app if it changed
            if (appContact.device_contact_id !== deviceContact.id) {
              await this.updateAppContact(appContactId, { device_contact_id: deviceContact.id });
            }
          }
        } else {
          // Create new contact on iPhone
          const newDeviceId = await this.createDeviceContactFromApp(appContact);
          if (newDeviceId) {
            result.created++;
            // Link the new device contact to the app contact
            await this.updateAppContact(appContactId, { device_contact_id: newDeviceId });
          }
        }
      }

      this.log(`✓ App → iPhone complete! Updated: ${result.synced}, Created: ${result.created}`);
      return result;

    } catch (error: any) {
      result.errors.push(error?.message || 'Unknown error');
      console.error('Sync App → Device error:', error);
      return result;
    }
  }

  /**
   * SYNC iPhone → App (Pull iPhone changes to app)
   * Updates existing app contacts and imports new ones
   */
  async syncDeviceToApp(): Promise<{ synced: number; imported: number; errors: string[] }> {
    const result = { synced: 0, imported: 0, errors: [] as string[] };

    try {
      if (Platform.OS === 'web') {
        result.errors.push('Sync not available on web');
        return result;
      }

      const hasPermission = await requestContactsPermission();
      if (!hasPermission) {
        result.errors.push('Contact permission denied');
        return result;
      }

      this.log('Starting iPhone → App sync...');

      // Get all contacts from both sources
      const appContacts = await this.getAppContacts();
      const deviceContacts = await this.getDeviceContacts();

      this.log(`Found ${deviceContacts.length} device contacts, ${appContacts.length} app contacts`);

      for (const deviceContact of deviceContacts) {
        const deviceName = deviceContact.name || `${deviceContact.firstName || ''} ${deviceContact.lastName || ''}`.trim();
        if (!deviceName) continue;

        // Find matching app contact
        const appContact = this.findAppContact(deviceContact, appContacts);

        if (appContact) {
          const appContactId = appContact._id || appContact.id;
          if (!appContactId) continue;

          // Update app contact with device data
          const updates: Partial<AppContact> = {};
          let hasChanges = false;

          // Update phone if different
          const devicePhone = deviceContact.phoneNumbers?.[0]?.number;
          if (devicePhone && devicePhone !== appContact.phone) {
            updates.phone = devicePhone;
            hasChanges = true;
          }

          // Update email if different
          const deviceEmail = deviceContact.emails?.[0]?.email;
          if (deviceEmail && deviceEmail !== appContact.email) {
            updates.email = deviceEmail;
            hasChanges = true;
          }

          // Update birthday if different
          if (deviceContact.birthday) {
            const deviceBirthday = new Date(
              deviceContact.birthday.year || 2000,
              (deviceContact.birthday.month || 1),
              deviceContact.birthday.day || 1
            ).toLocaleDateString();
            if (deviceBirthday !== appContact.birthday) {
              updates.birthday = deviceBirthday;
              hasChanges = true;
            }
          }

          // Update job if different
          const deviceJob = deviceContact.jobTitle || deviceContact.company;
          if (deviceJob && deviceJob !== appContact.job) {
            updates.job = deviceJob;
            hasChanges = true;
          }

          // Update device_contact_id link if needed
          if (deviceContact.id && deviceContact.id !== appContact.device_contact_id) {
            updates.device_contact_id = deviceContact.id;
            hasChanges = true;
          }

          if (hasChanges) {
            const success = await this.updateAppContact(appContactId, updates);
            if (success) {
              result.synced++;
              this.log(`✓ Updated app contact: ${deviceName}`);
            }
          }
        } else {
          // Import new contact from iPhone to app
          const newAppContact = await this.createAppContact({
            name: deviceName,
            phone: deviceContact.phoneNumbers?.[0]?.number || '',
            email: deviceContact.emails?.[0]?.email || '',
            birthday: deviceContact.birthday ? 
              new Date(
                deviceContact.birthday.year || 2000,
                deviceContact.birthday.month || 0,
                deviceContact.birthday.day || 1
              ).toLocaleDateString() : '',
            job: deviceContact.jobTitle || deviceContact.company || '',
            device_contact_id: deviceContact.id,
            pipeline_stage: 'New',
          });

          if (newAppContact) {
            result.imported++;
            this.log(`✓ Imported from iPhone: ${deviceName}`);
          }
        }
      }

      this.log(`✓ iPhone → App complete! Updated: ${result.synced}, Imported: ${result.imported}`);
      return result;

    } catch (error: any) {
      result.errors.push(error?.message || 'Unknown error');
      console.error('Sync Device → App error:', error);
      return result;
    }
  }

  /**
   * FULL TWO-WAY SYNC
   * First syncs iPhone → App, then App → iPhone
   */
  async performFullSync(): Promise<SyncResult> {
    const result: SyncResult = {
      imported: 0,
      updated: 0,
      syncedBack: 0,
      errors: [],
    };

    try {
      if (Platform.OS === 'web') {
        result.errors.push('Sync not available on web');
        return result;
      }

      this.log('Starting full two-way sync...');

      // Step 1: iPhone → App (get latest from iPhone)
      const deviceToAppResult = await this.syncDeviceToApp();
      result.imported = deviceToAppResult.imported;
      result.updated = deviceToAppResult.synced;
      result.errors.push(...deviceToAppResult.errors);

      // Step 2: App → iPhone (push app changes to iPhone)
      const appToDeviceResult = await this.syncAppToDevice();
      result.syncedBack = appToDeviceResult.synced + appToDeviceResult.created;
      result.errors.push(...appToDeviceResult.errors);

      // Save sync timestamp
      await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());

      this.log(`✓ Full sync complete! Imported: ${result.imported}, Updated: ${result.updated}, Synced to iPhone: ${result.syncedBack}`);
      
      return result;

    } catch (error: any) {
      result.errors.push(error?.message || 'Unknown sync error');
      console.error('Full sync error:', error);
      return result;
    }
  }

  /**
   * Sync a single contact to device after editing
   */
  async syncSingleContactToDevice(appContact: AppContact): Promise<boolean> {
    try {
      if (Platform.OS === 'web') return false;

      const hasPermission = await requestContactsPermission();
      if (!hasPermission) return false;

      const deviceContacts = await this.getDeviceContacts();
      const deviceContact = await this.findDeviceContact(appContact, deviceContacts);
      const appContactId = appContact._id || appContact.id;

      if (deviceContact && deviceContact.id) {
        // Update existing
        const success = await this.updateDeviceContactFromApp(deviceContact.id, appContact);
        // Update link if needed
        if (success && appContactId && appContact.device_contact_id !== deviceContact.id) {
          await this.updateAppContact(appContactId, { device_contact_id: deviceContact.id });
        }
        return success;
      } else if (appContactId) {
        // Create new
        const newDeviceId = await this.createDeviceContactFromApp(appContact);
        if (newDeviceId) {
          await this.updateAppContact(appContactId, { device_contact_id: newDeviceId });
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error syncing single contact:', error);
      return false;
    }
  }

  /**
   * Link existing contacts (re-establish links by matching)
   */
  async linkExistingContacts(): Promise<{ linked: number; errors: string[] }> {
    const result = { linked: 0, errors: [] as string[] };

    try {
      if (Platform.OS === 'web') {
        result.errors.push('Not available on web');
        return result;
      }

      const hasPermission = await requestContactsPermission();
      if (!hasPermission) {
        result.errors.push('Contact permission denied');
        return result;
      }

      this.log('Linking contacts...');

      const appContacts = await this.getAppContacts();
      const deviceContacts = await this.getDeviceContacts();

      this.log(`Found ${appContacts.length} app contacts, ${deviceContacts.length} device contacts`);

      for (const appContact of appContacts) {
        const appContactId = appContact._id || appContact.id;
        if (!appContactId) continue;

        // Find matching device contact
        const deviceContact = await this.findDeviceContact(appContact, deviceContacts);

        if (deviceContact && deviceContact.id) {
          // Check if link needs updating
          if (appContact.device_contact_id !== deviceContact.id) {
            const success = await this.updateAppContact(appContactId, { 
              device_contact_id: deviceContact.id 
            });
            if (success) {
              result.linked++;
              this.log(`✓ Linked: ${appContact.name}`);
            }
          }
        }
      }

      this.log(`✓ Linking complete! ${result.linked} contacts linked`);
      return result;

    } catch (error: any) {
      result.errors.push(error?.message || 'Unknown error');
      console.error('Link contacts error:', error);
      return result;
    }
  }

  /**
   * Quick sync - just check for new contacts from device
   */
  async quickSync(): Promise<{ newContacts: number }> {
    try {
      if (Platform.OS === 'web') return { newContacts: 0 };

      const result = await this.syncDeviceToApp();
      return { newContacts: result.imported };
    } catch (error) {
      console.error('Quick sync error:', error);
      return { newContacts: 0 };
    }
  }
}

export default ContactSyncService;
