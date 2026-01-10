import * as Contacts from 'expo-contacts';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
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
 * Handles bidirectional sync between app and device contacts
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
   * Request contacts permission
   */
  async requestPermission(): Promise<boolean> {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Permission request error:', error);
      return false;
    }
  }

  /**
   * Get all contacts from device
   */
  async getDeviceContacts(): Promise<Contacts.Contact[]> {
    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
          Contacts.Fields.Birthday,
          Contacts.Fields.JobTitle,
          Contacts.Fields.Company,
          Contacts.Fields.Addresses,
          Contacts.Fields.Note,
        ],
      });
      return data || [];
    } catch (error) {
      console.error('Error getting device contacts:', error);
      return [];
    }
  }

  /**
   * Get all contacts from app
   */
  async getAppContacts(): Promise<AppContact[]> {
    try {
      const response = await axios.get(
        `${EXPO_PUBLIC_BACKEND_URL}/api/contacts`,
        this.getAuthHeaders()
      );
      return response.data || [];
    } catch (error) {
      console.error('Error fetching app contacts:', error);
      return [];
    }
  }

  /**
   * Normalize phone number for comparison
   */
  private normalizePhone(phone?: string): string {
    if (!phone) return '';
    return phone.replace(/\D/g, '').slice(-10); // Last 10 digits
  }

  /**
   * Format device contact to app format
   */
  formatDeviceToApp(deviceContact: Contacts.Contact): Partial<AppContact> {
    const name = deviceContact.name || 
      `${deviceContact.firstName || ''} ${deviceContact.lastName || ''}`.trim() ||
      'Unknown';

    const phone = deviceContact.phoneNumbers?.[0]?.number || undefined;
    const email = deviceContact.emails?.[0]?.email || undefined;
    
    let birthday: string | undefined;
    if (deviceContact.birthday) {
      const { year, month, day } = deviceContact.birthday;
      if (month !== undefined && day) {
        const y = year || 2000; // Default year if not set
        birthday = `${y}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }

    const location = deviceContact.addresses?.[0]?.city || 
      deviceContact.addresses?.[0]?.country || undefined;

    return {
      name,
      phone,
      email,
      birthday,
      job: deviceContact.jobTitle || deviceContact.company || undefined,
      location,
      notes: deviceContact.note || undefined,
      device_contact_id: deviceContact.id,
      pipeline_stage: 'New', // NEW: Imported contacts go to "New" stage
    };
  }

  /**
   * Update device contact with app data
   */
  async updateDeviceContact(deviceContactId: string, appContact: AppContact): Promise<boolean> {
    try {
      if (Platform.OS === 'web') {
        console.log('Cannot update device contacts on web');
        return false;
      }

      // Get current device contact
      const contact = await Contacts.getContactByIdAsync(deviceContactId, [
        Contacts.Fields.Name,
        Contacts.Fields.PhoneNumbers,
        Contacts.Fields.Emails,
        Contacts.Fields.Birthday,
        Contacts.Fields.JobTitle,
        Contacts.Fields.Addresses,
        Contacts.Fields.Note,
      ]);

      if (!contact) {
        console.log(`Device contact ${deviceContactId} not found`);
        return false;
      }

      // Prepare updates
      const updates: Partial<Contacts.Contact> = {
        id: deviceContactId,
      };

      // Update name if changed
      if (appContact.name && appContact.name !== contact.name) {
        const nameParts = appContact.name.split(' ');
        updates.firstName = nameParts[0] || '';
        updates.lastName = nameParts.slice(1).join(' ') || '';
      }

      // Update phone if provided
      if (appContact.phone) {
        updates.phoneNumbers = [{
          label: 'mobile',
          number: appContact.phone,
        }];
      }

      // Update email if provided
      if (appContact.email) {
        updates.emails = [{
          label: 'home',
          email: appContact.email,
        }];
      }

      // Update birthday if provided
      if (appContact.birthday) {
        const parts = appContact.birthday.split('-');
        if (parts.length >= 3) {
          updates.birthday = {
            year: parseInt(parts[0]) || undefined,
            month: (parseInt(parts[1]) || 1) - 1, // Months are 0-indexed
            day: parseInt(parts[2]) || 1,
          };
        }
      }

      // Update job title
      if (appContact.job) {
        updates.jobTitle = appContact.job;
      }

      // Update notes
      if (appContact.notes) {
        updates.note = appContact.notes;
      }

      // Update address/location
      if (appContact.location) {
        updates.addresses = [{
          label: 'home',
          city: appContact.location,
        }];
      }

      // Apply updates
      await Contacts.updateContactAsync(updates as Contacts.Contact);
      this.log(`✓ Updated on device: ${appContact.name}`);
      return true;
    } catch (error) {
      console.error('Error updating device contact:', error);
      return false;
    }
  }

  /**
   * Create new contact on device from app
   */
  async createDeviceContact(appContact: AppContact): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        console.log('Cannot create device contacts on web');
        return null;
      }

      const nameParts = (appContact.name || 'Unknown').split(' ');
      
      const newContact: Contacts.Contact = {
        contactType: Contacts.ContactTypes.Person,
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' ') || '',
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
        const parts = appContact.birthday.split('-');
        if (parts.length >= 3) {
          newContact.birthday = {
            year: parseInt(parts[0]) || undefined,
            month: (parseInt(parts[1]) || 1) - 1,
            day: parseInt(parts[2]) || 1,
          };
        }
      }

      if (appContact.job) {
        newContact.jobTitle = appContact.job;
      }

      if (appContact.notes) {
        newContact.note = appContact.notes;
      }

      if (appContact.location) {
        newContact.addresses = [{
          label: 'home',
          city: appContact.location,
        }];
      }

      const contactId = await Contacts.addContactAsync(newContact);
      this.log(`✓ Created on device: ${appContact.name}`);
      return contactId;
    } catch (error) {
      console.error('Error creating device contact:', error);
      return null;
    }
  }

  /**
   * Import new contact to app from device
   */
  async importToApp(deviceContact: Contacts.Contact): Promise<AppContact | null> {
    try {
      const contactData = this.formatDeviceToApp(deviceContact);
      
      const response = await axios.post(
        `${EXPO_PUBLIC_BACKEND_URL}/api/contacts`,
        contactData,
        this.getAuthHeaders()
      );
      
      this.log(`✓ Imported to app: ${contactData.name}`);
      return response.data;
    } catch (error) {
      console.error('Error importing contact:', error);
      return null;
    }
  }

  /**
   * Update app contact
   */
  async updateAppContact(contactId: string, data: Partial<AppContact>): Promise<boolean> {
    try {
      await axios.put(
        `${EXPO_PUBLIC_BACKEND_URL}/api/contacts/${contactId}`,
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
   * Full bidirectional sync
   */
  async performFullSync(): Promise<SyncResult> {
    const result: SyncResult = {
      imported: 0,
      updated: 0,
      syncedBack: 0,
      errors: [],
    };

    try {
      // Check permission
      const hasPermission = await this.requestPermission();
      if (!hasPermission) {
        result.errors.push('Contact permission denied');
        return result;
      }

      this.log('Starting sync...');

      // Get contacts from both sources
      const [deviceContacts, appContacts] = await Promise.all([
        this.getDeviceContacts(),
        this.getAppContacts(),
      ]);

      this.log(`Found ${deviceContacts.length} device contacts, ${appContacts.length} app contacts`);

      // Create lookup maps for app contacts
      const appContactsByDeviceId = new Map<string, AppContact>();
      const appContactsByPhone = new Map<string, AppContact>();
      const appContactsByEmail = new Map<string, AppContact>();

      for (const contact of appContacts) {
        if (contact.device_contact_id) {
          appContactsByDeviceId.set(contact.device_contact_id, contact);
        }
        if (contact.phone) {
          const normalizedPhone = this.normalizePhone(contact.phone);
          if (normalizedPhone) {
            appContactsByPhone.set(normalizedPhone, contact);
          }
        }
        if (contact.email) {
          appContactsByEmail.set(contact.email.toLowerCase(), contact);
        }
      }

      // STEP 1: Device → App (import new contacts, update existing)
      this.log('Syncing device → app...');
      for (const deviceContact of deviceContacts) {
        if (!deviceContact.name && !deviceContact.firstName) continue;
        if (!deviceContact.id) continue;

        // Check if already linked by device_contact_id
        let existingAppContact = appContactsByDeviceId.get(deviceContact.id);

        // If not linked, check by phone or email
        if (!existingAppContact) {
          const phone = this.normalizePhone(deviceContact.phoneNumbers?.[0]?.number);
          const email = deviceContact.emails?.[0]?.email?.toLowerCase();
          
          if (phone) {
            existingAppContact = appContactsByPhone.get(phone);
          }
          if (!existingAppContact && email) {
            existingAppContact = appContactsByEmail.get(email);
          }
        }

        if (existingAppContact) {
          // Link existing contact if not linked yet
          if (!existingAppContact.device_contact_id) {
            const contactId = existingAppContact._id || existingAppContact.id;
            if (contactId) {
              await this.updateAppContact(contactId, {
                device_contact_id: deviceContact.id,
              });
              this.log(`Linked: ${existingAppContact.name}`);
            }
          }
        } else {
          // Import new contact
          const imported = await this.importToApp(deviceContact);
          if (imported) {
            result.imported++;
          }
        }
      }

      // STEP 2: App → Device (sync changes back, create new contacts on device)
      this.log('Syncing app → device...');
      
      // Refresh app contacts after imports
      const updatedAppContacts = await this.getAppContacts();
      
      for (const appContact of updatedAppContacts) {
        const contactId = appContact._id || appContact.id;
        if (!contactId) continue;

        if (appContact.device_contact_id) {
          // Update existing device contact
          const success = await this.updateDeviceContact(
            appContact.device_contact_id,
            appContact
          );
          if (success) {
            result.syncedBack++;
          }
        } else {
          // Create new contact on device and link it
          const deviceId = await this.createDeviceContact(appContact);
          if (deviceId) {
            await this.updateAppContact(contactId, {
              device_contact_id: deviceId,
            });
            result.syncedBack++;
          }
        }
      }

      // Save last sync time
      await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
      
      this.log(`Sync complete! Imported: ${result.imported}, Synced back: ${result.syncedBack}`);
      return result;

    } catch (error: any) {
      const errorMsg = error?.message || 'Unknown sync error';
      result.errors.push(errorMsg);
      console.error('Sync error:', error);
      return result;
    }
  }

  /**
   * Quick sync - only check for new contacts from device
   */
  async quickSync(): Promise<{ newContacts: number }> {
    try {
      const hasPermission = await this.requestPermission();
      if (!hasPermission) return { newContacts: 0 };

      const [deviceContacts, appContacts] = await Promise.all([
        this.getDeviceContacts(),
        this.getAppContacts(),
      ]);

      // Get device IDs and phones/emails that are already in app
      const existingDeviceIds = new Set<string>();
      const existingPhones = new Set<string>();
      const existingEmails = new Set<string>();

      for (const c of appContacts) {
        if (c.device_contact_id) existingDeviceIds.add(c.device_contact_id);
        if (c.phone) existingPhones.add(this.normalizePhone(c.phone));
        if (c.email) existingEmails.add(c.email.toLowerCase());
      }

      // Find and import new contacts
      let newContacts = 0;
      for (const deviceContact of deviceContacts) {
        if (!deviceContact.id) continue;
        if (!deviceContact.name && !deviceContact.firstName) continue;
        
        // Skip if already linked
        if (existingDeviceIds.has(deviceContact.id)) continue;

        // Skip if phone or email exists
        const phone = this.normalizePhone(deviceContact.phoneNumbers?.[0]?.number);
        const email = deviceContact.emails?.[0]?.email?.toLowerCase();
        
        if (phone && existingPhones.has(phone)) continue;
        if (email && existingEmails.has(email)) continue;

        // Import this new contact
        const imported = await this.importToApp(deviceContact);
        if (imported) {
          newContacts++;
          // Add to sets to prevent duplicates in same sync
          if (phone) existingPhones.add(phone);
          if (email) existingEmails.add(email);
        }
      }

      return { newContacts };
    } catch (error) {
      console.error('Quick sync error:', error);
      return { newContacts: 0 };
    }
  }

  /**
   * Sync single contact back to device (call after saving a contact)
   */
  async syncContactToDevice(appContact: AppContact): Promise<boolean> {
    try {
      const hasPermission = await this.requestPermission();
      if (!hasPermission) return false;

      const contactId = appContact._id || appContact.id;

      if (appContact.device_contact_id) {
        // Update existing device contact
        return await this.updateDeviceContact(appContact.device_contact_id, appContact);
      } else if (contactId) {
        // Create new device contact and link it
        const deviceId = await this.createDeviceContact(appContact);
        if (deviceId) {
          await this.updateAppContact(contactId, {
            device_contact_id: deviceId,
          });
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Error syncing contact to device:', error);
      return false;
    }
  }
}

export default ContactSyncService;
