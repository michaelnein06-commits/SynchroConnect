import * as Contacts from 'expo-contacts';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
    const { status } = await Contacts.requestPermissionsAsync();
    return status === 'granted';
  }

  /**
   * Get all contacts from device
   */
  async getDeviceContacts(): Promise<Contacts.Contact[]> {
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
        Contacts.Fields.Image,
      ],
    });
    return data;
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
      return response.data;
    } catch (error) {
      console.error('Error fetching app contacts:', error);
      return [];
    }
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
      if (year && month !== undefined && day) {
        birthday = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }

    const location = deviceContact.addresses?.[0]?.city || 
      deviceContact.addresses?.[0]?.country || undefined;

    return {
      name,
      phone,
      email,
      birthday,
      job: deviceContact.jobTitle || undefined,
      location,
      notes: deviceContact.note || undefined,
      device_contact_id: deviceContact.id,
      pipeline_stage: 'Monthly', // Default for new contacts
    };
  }

  /**
   * Update device contact with app data
   */
  async updateDeviceContact(deviceContactId: string, appContact: AppContact): Promise<boolean> {
    try {
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

      // Update phone if changed
      if (appContact.phone) {
        updates.phoneNumbers = [{
          label: 'mobile',
          number: appContact.phone,
        }];
      }

      // Update email if changed
      if (appContact.email) {
        updates.emails = [{
          label: 'home',
          email: appContact.email,
        }];
      }

      // Update birthday if changed
      if (appContact.birthday) {
        const parts = appContact.birthday.split('-');
        if (parts.length === 3) {
          updates.birthday = {
            year: parseInt(parts[0]),
            month: parseInt(parts[1]) - 1, // Months are 0-indexed
            day: parseInt(parts[2]),
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
      this.log(`Updated device contact: ${appContact.name}`);
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
      const nameParts = appContact.name.split(' ');
      
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
        if (parts.length === 3) {
          newContact.birthday = {
            year: parseInt(parts[0]),
            month: parseInt(parts[1]) - 1,
            day: parseInt(parts[2]),
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
      this.log(`Created device contact: ${appContact.name}`);
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
      
      this.log(`Imported: ${contactData.name}`);
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

      // Create lookup maps
      const appContactsByDeviceId = new Map<string, AppContact>();
      const appContactsByPhone = new Map<string, AppContact>();
      const appContactsByEmail = new Map<string, AppContact>();

      for (const contact of appContacts) {
        if (contact.device_contact_id) {
          appContactsByDeviceId.set(contact.device_contact_id, contact);
        }
        if (contact.phone) {
          // Normalize phone number for comparison
          const normalizedPhone = contact.phone.replace(/\D/g, '');
          appContactsByPhone.set(normalizedPhone, contact);
        }
        if (contact.email) {
          appContactsByEmail.set(contact.email.toLowerCase(), contact);
        }
      }

      // STEP 1: Sync from device to app (import new contacts)
      this.log('Checking for new device contacts...');
      for (const deviceContact of deviceContacts) {
        if (!deviceContact.name && !deviceContact.firstName) continue;

        // Check if already linked
        if (deviceContact.id && appContactsByDeviceId.has(deviceContact.id)) {
          continue; // Already synced
        }

        // Check by phone or email
        const phone = deviceContact.phoneNumbers?.[0]?.number?.replace(/\D/g, '');
        const email = deviceContact.emails?.[0]?.email?.toLowerCase();

        let existingAppContact: AppContact | undefined;
        
        if (phone && appContactsByPhone.has(phone)) {
          existingAppContact = appContactsByPhone.get(phone);
        } else if (email && appContactsByEmail.has(email)) {
          existingAppContact = appContactsByEmail.get(email);
        }

        if (existingAppContact) {
          // Link existing contact
          if (!existingAppContact.device_contact_id && deviceContact.id) {
            await this.updateAppContact(existingAppContact._id || existingAppContact.id!, {
              device_contact_id: deviceContact.id,
            });
            this.log(`Linked: ${existingAppContact.name}`);
          }
        } else {
          // Import new contact
          const imported = await this.importToApp(deviceContact);
          if (imported) {
            result.imported++;
          }
        }
      }

      // STEP 2: Sync from app to device (update device contacts)
      this.log('Syncing app changes to device...');
      for (const appContact of appContacts) {
        if (appContact.device_contact_id) {
          // Update existing device contact
          const success = await this.updateDeviceContact(
            appContact.device_contact_id,
            appContact
          );
          if (success) {
            result.syncedBack++;
          }
        }
        // Note: We don't create new device contacts for app-only contacts
        // to avoid cluttering the user's phone contacts
      }

      // Save last sync time
      await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
      
      this.log(`Sync complete! Imported: ${result.imported}, Synced back: ${result.syncedBack}`);
      return result;

    } catch (error: any) {
      result.errors.push(error.message || 'Unknown sync error');
      console.error('Sync error:', error);
      return result;
    }
  }

  /**
   * Quick sync - only check for new contacts
   */
  async quickSync(): Promise<{ newContacts: number }> {
    try {
      const hasPermission = await this.requestPermission();
      if (!hasPermission) return { newContacts: 0 };

      const [deviceContacts, appContacts] = await Promise.all([
        this.getDeviceContacts(),
        this.getAppContacts(),
      ]);

      // Get device IDs that are already in app
      const existingDeviceIds = new Set(
        appContacts
          .filter(c => c.device_contact_id)
          .map(c => c.device_contact_id)
      );

      // Find new contacts
      let newContacts = 0;
      for (const deviceContact of deviceContacts) {
        if (!deviceContact.id || existingDeviceIds.has(deviceContact.id)) continue;
        if (!deviceContact.name && !deviceContact.firstName) continue;

        // Check if contact exists by phone/email
        const phone = deviceContact.phoneNumbers?.[0]?.number?.replace(/\D/g, '');
        const email = deviceContact.emails?.[0]?.email?.toLowerCase();
        
        const exists = appContacts.some(ac => {
          const acPhone = ac.phone?.replace(/\D/g, '');
          const acEmail = ac.email?.toLowerCase();
          return (phone && acPhone === phone) || (email && acEmail === email);
        });

        if (!exists) {
          const imported = await this.importToApp(deviceContact);
          if (imported) newContacts++;
        }
      }

      return { newContacts };
    } catch (error) {
      console.error('Quick sync error:', error);
      return { newContacts: 0 };
    }
  }

  /**
   * Sync single contact back to device
   */
  async syncContactToDevice(appContact: AppContact): Promise<boolean> {
    try {
      const hasPermission = await this.requestPermission();
      if (!hasPermission) return false;

      if (appContact.device_contact_id) {
        // Update existing
        return await this.updateDeviceContact(appContact.device_contact_id, appContact);
      } else {
        // Create new and link
        const deviceId = await this.createDeviceContact(appContact);
        if (deviceId) {
          await this.updateAppContact(appContact._id || appContact.id!, {
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
